/**
 * Kopf und Handlungsbedarf der Kursseite (09.10.2026, „Kopf + Reiter"): Kennzahlen und Hinweise rein rechnend aus der
 * Antwort von GET /server/vokabeln/<id> – gleich in Sprachenlernen und „Meine Klassen".
 */
import { describe, expect, it } from 'vitest'
import { geplanteAbschnitte, kursHinweise, kursKennzahlen } from '../src/renderer/src/modules/lernen/kurs/kursHinweise'

const TAG = 86_400_000
const jetzt = Date.parse('2026-10-09T10:00:00')
const person = (name: string, tage7: number, sicher: number, gesamt = 10): { name: string; tage7: number; uebersicht: { gesamt: number; sicher: number } } => ({
  name,
  tage7,
  uebersicht: { gesamt, sicher }
})
const basis = {
  status: 'offen',
  testTermin: null as number | null,
  woerter: 20,
  teile: [{ titel: 'Unit 1', anzahl: 20, zeit: jetzt - 20 * TAG }],
  gesamt: { gesamt: 40, sicher: 10 },
  lernende: [person('Ben S.', 2, 1), person('Mia R.', 0, 5)]
}

describe('kursKennzahlen', () => {
  it('sicher, aktiv diese Woche, nächster Test', () => {
    const z = kursKennzahlen({ ...basis, testTermin: jetzt + 3 * TAG }, jetzt)
    expect(z.sicher).toBe(0.25)
    expect(z.aktiv).toBe(1)
    expect(z.lernende).toBe(2)
    expect(z.tageBisTest).toBe(3)
  })
  it('vergangener Test zählt nicht; ohne Vokabeln kein „sicher"', () => {
    const z = kursKennzahlen({ ...basis, woerter: 0, testTermin: jetzt - 5 * TAG }, jetzt)
    expect(z.test).toBeNull()
    expect(z.sicher).toBeNull()
  })
})

describe('kursHinweise', () => {
  it('Entwürfe, Test bald, unter 30 % sicher, nicht geübt – in dieser Reihenfolge und mit Reiter', () => {
    const h = kursHinweise({ ...basis, testTermin: jetzt + 2 * TAG, entwuerfe: 1, foerderNamen: ['Mia R.'] }, jetzt)
    expect(h.map((x) => x.art)).toEqual(['entwurf', 'termin', 'schwach', 'foerdern', 'inaktiv'])
    expect(h[0].reiter).toBe('grammatik')
    expect(h.find((x) => x.art === 'schwach')!.text).toContain('Ben S.')
    expect(h.find((x) => x.art === 'inaktiv')!.text).toContain('Mia R.')
  })
  it('„unter 30 %" erst nach 14 Tagen', () => {
    const h = kursHinweise({ ...basis, teile: [{ titel: 'Unit 1', anzahl: 20, zeit: jetzt - 5 * TAG }] }, jetzt)
    expect(h.some((x) => x.art === 'schwach')).toBe(false)
  })
  it('leerer Kurs: Lernende eintragen; abgeschlossener Kurs: nur Entwürfe', () => {
    expect(kursHinweise({ ...basis, lernende: [] }, jetzt).map((x) => x.art)).toEqual(['leer'])
    expect(kursHinweise({ ...basis, status: 'beendet', entwuerfe: 2 }, jetzt).map((x) => x.art)).toEqual(['entwurf'])
  })
  it('geplante Abschnitte, der nächste zuerst', () => {
    const g = geplanteAbschnitte(
      [
        { titel: 'B', anzahl: 5, zeit: jetzt + 5 * TAG },
        { titel: 'A', anzahl: 5, zeit: jetzt + 2 * TAG },
        { titel: 'alt', anzahl: 5, zeit: jetzt - TAG }
      ],
      jetzt
    )
    expect(g.map((t) => t.titel)).toEqual(['A', 'B'])
  })
})
