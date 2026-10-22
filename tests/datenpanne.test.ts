import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { FRIST_MS, fristStand, lfdMeldetext, noetigePunkte, offenePunkte, pannePruefen, type Datenpanne } from '../src/shared/datenpanne'

/*
 * Datenpannen nach Art. 33/34 DSGVO (22.10.2026, Prüfung des Schulträgers, Punkt 12): Prüfung der Eingaben,
 * 72-Stunden-Frist, Checkliste, Meldetext für die LfD und verschlüsselte Ablage (server/datenpanne.ts).
 */
const T0 = Date.UTC(2026, 9, 20, 8, 0)

describe('Datenpanne: Regeln', () => {
  it('prüft Pflichtangaben und bereinigt Zahlen', () => {
    expect(pannePruefen({ was: 'x', entdeckt: T0 }, T0)).toEqual({ fehler: 'Bitte beschreiben, was passiert ist.' })
    expect(pannePruefen({ was: 'USB-Stick verloren', entdeckt: 'gestern' }, T0)).toEqual({ fehler: 'Bitte angeben, wann die Panne entdeckt wurde.' })
    expect(pannePruefen({ was: 'USB-Stick verloren', entdeckt: T0 + 3600_000 }, T0)).toEqual({ fehler: 'Der Zeitpunkt der Entdeckung liegt in der Zukunft.' })
    const r = pannePruefen({ was: ' USB-Stick verloren ', entdeckt: T0, personen: '28', datensaetze: -3, risiko: 'quatsch', erledigt: { dsb: T0, unbekannt: 5 } }, T0)
    if ('fehler' in r) throw new Error(r.fehler)
    expect(r.daten).toMatchObject({ was: 'USB-Stick verloren', personen: 28, datensaetze: 0, risiko: 'risiko', erledigt: { dsb: T0 } })
  })

  it('72-Stunden-Countdown ab der Entdeckung', () => {
    expect(FRIST_MS).toBe(72 * 3600_000)
    const a = fristStand(T0, T0 + 2 * 3600_000 + 5 * 60_000)
    expect(a).toMatchObject({ bis: T0 + FRIST_MS, abgelaufen: false, dringend: false, text: 'noch 69 Std. 55 Min.' })
    expect(fristStand(T0, T0 + 61 * 3600_000).dringend).toBe(true)
    const b = fristStand(T0, T0 + FRIST_MS + 90 * 60_000)
    expect(b).toMatchObject({ abgelaufen: true, text: 'Frist seit 1 Std. 30 Min. abgelaufen' })
  })

  it('Checkliste je Risiko: Betroffene nur bei hohem, LfD nicht bei „kein Risiko“', () => {
    expect(noetigePunkte('kein')).toEqual(['schulleitung', 'dsb', 'dokumentiert'])
    expect(noetigePunkte('risiko')).toEqual(['schulleitung', 'dsb', 'lfd', 'dokumentiert'])
    expect(noetigePunkte('hoch')).toContain('betroffene')
    expect(offenePunkte({ risiko: 'risiko', erledigt: { schulleitung: 1, dsb: 1 } })).toEqual(['lfd', 'dokumentiert'])
  })

  it('Meldetext für die LfD enthält die Angaben nach Art. 33 Abs. 3', () => {
    const p: Datenpanne = {
      id: 'a',
      entdeckt: T0,
      erstellt: T0 + 3600_000,
      was: 'Notenliste der 7b an falschen Verteiler gemailt',
      datenarten: 'Namen, Noten',
      personen: 27,
      datensaetze: 27,
      massnahmen: 'Empfänger um Löschung gebeten',
      risiko: 'hoch',
      erledigt: {}
    }
    const t = lfdMeldetext(p, { name: 'Gymnasium Musterstadt' })
    expect(t).toContain('Art. 33 DSGVO')
    expect(t).toContain('Gymnasium Musterstadt')
    expect(t).toContain('Notenliste der 7b')
    expect(t).toContain('Ungefähre Zahl der betroffenen Personen: 27')
    expect(t).toContain('Empfänger um Löschung gebeten')
    expect(t).toContain('Benachrichtigung der Betroffenen (Art. 34): geplant')
  })
})

describe('Datenpanne: Ablage auf dem Server', async () => {
  const { setzeSchluesselFuerTests } = await import('../src/server/geheim')
  const { datenbankFuerTests, datenbank } = await import('../src/server/datenbank')
  const s = await import('../src/server/datenpanne')

  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    s.datenpannenZuruecksetzen()
  })

  it('legt verschlüsselt an, ändert Checkliste und listet vergangene Vorfälle', () => {
    const jetzt = Date.now()
    const a = s.datenpanneAnlegen({ was: 'Laptop mit Klassenlisten gestohlen', entdeckt: jetzt - 3600_000, personen: 120, von: 'Ada Admin' }, jetzt)
    if ('fehler' in a) throw new Error(a.fehler)
    expect(a.von).toBe('Ada Admin')
    const roh = datenbank().prepare('SELECT daten AS x FROM datenpannen').all() as { x: string }[]
    expect(String(roh[0].x)).toMatch(/^v1:/)
    expect(JSON.stringify(roh)).not.toContain('Klassenlisten')

    const b = s.datenpanneAendern(a.id, { erledigt: { schulleitung: jetzt }, massnahmen: 'Anzeige erstattet' }, jetzt)
    if ('fehler' in b) throw new Error(b.fehler)
    expect(b.erledigt.schulleitung).toBe(jetzt)
    expect(b.massnahmen).toBe('Anzeige erstattet')
    // Abhaken zurücknehmen
    const c = s.datenpanneAendern(a.id, { erledigt: { schulleitung: 0 } }, jetzt)
    if ('fehler' in c) throw new Error(c.fehler)
    expect(c.erledigt.schulleitung).toBeUndefined()
    const d = s.datenpanneAendern(a.id, { abgeschlossen: true }, jetzt)
    if ('fehler' in d) throw new Error(d.fehler)
    expect(d.abgeschlossen).toBe(jetzt)
    // Dokumentationspflicht: abgeschlossene Vorfälle bleiben in der Liste
    expect(s.datenpannen().map((p) => p.id)).toEqual([a.id])
    expect(s.datenpanneAendern('gibtsnicht', {})).toEqual({ fehler: 'Vorfall nicht gefunden.' })
    expect(s.datenpanneLoeschen(a.id)).toBe(true)
    expect(s.datenpannen()).toEqual([])
  })
})
