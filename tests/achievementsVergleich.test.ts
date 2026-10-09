/**
 * Achievements: alle sichtbar mit Fortschritt, geheime verborgen, Anteil der Schule, Platz in der Klasse (09.10.2026).
 */
import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { lerngruppenVon } from '../src/server/onlinetest'
import { achDatenLesen, achDatenSchreiben } from '../src/server/achievementsDaten'
import { achievementsRoute } from '../src/server/achievements'
import { hauptKlasse, klassenPlatz, schulAnteile, vergleichVergessen } from '../src/server/achievementsVergleich'
import type { Anfrage } from '../src/server/http'
import { achievementSicht, berechneAchievements, LEERE_ZAEHLER, type AchEingabe } from '../src/shared/achievements'
import { anteileAus, platzVon, tageImZeitraum } from '../src/shared/achievementsVergleich'

const eingabe = (e: Partial<AchEingabe> = {}): AchEingabe => ({
  tage: [],
  wochenziel: 3,
  woerter: { gelernt: 0, sicher: 0, langzeit: 0 },
  lehrwerk: [],
  regeln: [],
  warSchwaeche: [],
  extrasGeschafft: 0,
  spiele: 0,
  zaehler: { ...LEERE_ZAEHLER },
  ...e
})

describe('Sicht: alle mit Fortschritt, geheime verborgen', () => {
  it('Stufen zeigen den Fortschritt (23/50), Erreichtes ist voll', () => {
    const k = berechneAchievements(eingabe({ zaehler: { ...LEERE_ZAEHLER, diktate: 23 } }))
    const { liste, verborgen } = achievementSicht(k, {}, null)
    expect(liste.find((a) => a.id === 'diktat-10')).toMatchObject({ erreicht: false, ist: 10, ziel: 10 })
    expect(liste.find((a) => a.id === 'diktat-50')).toMatchObject({ erreicht: false, ist: 23, ziel: 50, anteil: null })
    // Geheime Überraschungen: Comeback, Comeback-Sieg, „unmöglich"
    expect(liste.some((a) => ['comeback', 'comeback-sieg', 'unmoeglich'].includes(a.id))).toBe(false)
    expect(verborgen).toBe(3)
  })
  it('erreicht heißt gespeichert (nie entzogen) – auch geheime und solche, die es im Katalog nicht mehr gibt', () => {
    const k = berechneAchievements(eingabe())
    const g = { gruppe: 'dranbleiben' as const, medaille: null, titel: 'Comeback', text: 'x', am: 5 }
    const { liste, verborgen } = achievementSicht(
      k,
      { comeback: g, 'unit:alt:Unit 1:50': { ...g, gruppe: 'lehrwerk', titel: 'Unit 1 zu 50 %' }, 'sicher-50': { ...g, gruppe: 'wortschatz', titel: '50 Wörter sicher' } },
      { 'sicher-50': 40 }
    )
    expect(liste.find((a) => a.id === 'comeback')).toMatchObject({ erreicht: true, am: 5 })
    expect(liste.find((a) => a.id === 'unit:alt:Unit 1:50')).toMatchObject({ erreicht: true })
    expect(liste.find((a) => a.id === 'sicher-50')).toMatchObject({ erreicht: true, ist: 50, ziel: 50, anteil: 40 })
    // Mit Vergleich: ohne Eintrag hat es noch niemand (0 %)
    expect(liste.find((a) => a.id === 'sicher-100')?.anteil).toBe(0)
    expect(verborgen).toBe(2)
    // nach Gruppen geordnet
    const gruppen = liste.map((a) => a.gruppe)
    expect(gruppen.indexOf('lehrwerk')).toBeGreaterThan(gruppen.lastIndexOf('dranbleiben'))
  })
  it('Lehrwerk: nötige Wörter statt Prozent (41 von 50 sicher → 80 % erreicht, 100 % 41/50)', () => {
    const k = berechneAchievements(eingabe({ lehrwerk: [{ buch: 'b', name: 'B', gesamt: 3, gelernt: 1, units: [{ unit: 'U', gesamt: 50, sicher: 41 }] }] }))
    expect(k.find((a) => a.id === 'unit:b:U:80')).toMatchObject({ erreicht: true, ziel: 40 })
    expect(k.find((a) => a.id === 'unit:b:U:100')).toMatchObject({ erreicht: false, ist: 41, ziel: 50 })
    // 1 von 3 kennengelernt: 25 % erreicht (ziel 1), 50 % nicht (ziel 2)
    expect(k.find((a) => a.id === 'band:b:25')).toMatchObject({ erreicht: true, ziel: 1 })
    expect(k.find((a) => a.id === 'band:b:50')).toMatchObject({ erreicht: false, ist: 1, ziel: 2 })
  })
})

describe('Vergleich (reine Rechnung)', () => {
  it('Anteile erst ab 10 Lernenden, gerundet, über 0 mindestens 1 %', () => {
    expect(anteileAus([['a']], 9)).toBeNull()
    const a = anteileAus([['a', 'b'], ['a'], ['a', 'a']], 200)!
    expect(a.a).toBe(2)
    expect(a.b).toBe(1)
    expect(a.c).toBeUndefined()
    expect(anteileAus([['x'], ['x'], ['x']], 12)!.x).toBe(25)
  })
  it('Übungstage der letzten 28 Tage (heute eingeschlossen, ohne Doppelte und Zukunft)', () => {
    const jetzt = Date.parse('2026-10-09T12:00:00Z')
    expect(tageImZeitraum(['2026-10-09', '2026-10-09', '2026-09-12', '2026-09-11', '2026-10-10', 'kaputt'], jetzt)).toBe(2)
  })
  it('Platz: gleiche Werte teilen sich den Platz; unter 5 kein Platz', () => {
    const w = new Map([
      ['a', 10],
      ['b', 7],
      ['c', 7],
      ['ich', 7],
      ['e', 2]
    ])
    expect(platzVon(w, 'ich')).toEqual({ platz: 2, von: 5 })
    expect(platzVon(w, 'e')).toEqual({ platz: 5, von: 5 })
    expect(platzVon(w, 'a')).toEqual({ platz: 1, von: 5 })
    w.delete('e')
    expect(platzVon(w, 'ich')).toBeNull()
    expect(platzVon(new Map([['x', 1]]), 'fremd', 1)).toBeNull()
  })
})

// ---------------------------------------------------------------- Server

async function rufe(n: NutzerInfo, pfad: string): Promise<Record<string, unknown>> {
  let text = ''
  const res = { writeHead: () => res, setHeader: () => res, end: (s: string) => void (text = s) }
  const k = { req: { method: 'GET', headers: {}, socket: {} }, res, url: new URL(`http://x${pfad}`), sitzung: { nutzer: n, kennung: 'probe' }, ip: '', koerper: async () => ({}) }
  await achievementsRoute()(k as unknown as Anfrage)
  return JSON.parse(text || '{}') as Record<string, unknown>
}

const isoVor = (tage: number): string => new Date(Date.now() - tage * 86_400_000).toISOString().slice(0, 10)

describe('Vergleich am Server', () => {
  const kinder: NutzerInfo[] = []
  let gast: NutzerInfo
  let testKind: NutzerInfo
  let lk: NutzerInfo
  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    lk = nutzerAnlegen({ benutzer: 'v.lehr', name: 'Vera Lehr', rolle: 'lehrkraft', quelle: 'test' })
    for (let i = 0; i < 9; i++) kinder.push(nutzerAnlegen({ benutzer: `kind.${i}`, name: `Kind Nummer${i}`, rolle: 'schueler', quelle: 'lokal' }))
    gast = nutzerAnlegen({ benutzer: 'gast-abc', name: 'Gina G.', rolle: 'schueler', quelle: 'gast' })
    testKind = nutzerAnlegen({ benutzer: 'test.9', name: 'Testkind', rolle: 'schueler', quelle: 'test' })
    lerngruppenVon(lk.id)
    const neueGruppe = (name: string, mitglieder: string[]): void => {
      datenbank()
        .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(randomBytes(6).toString('hex'), lk.id, name, 'Englisch', '', JSON.stringify(mitglieder), new Date().toISOString())
    }
    // Klasse 7a: Kinder 0–4 und der eingetragene Gast; dazu eine kleinere AG mit Kind 0 und 1
    neueGruppe('7a', [...kinder.slice(0, 5).map((k) => k.benutzer), gast.benutzer])
    neueGruppe('AG', [kinder[0].benutzer, kinder[1].benutzer])
    // Übungstage: Kind i hat i Tage in den letzten 4 Wochen, Kind 0 zusätzlich alte Tage; der Gast 3
    kinder.forEach((k, i) => {
      const d = achDatenLesen(k.id)
      d.tage = [...Array.from({ length: i }, (_, t) => isoVor(t)), isoVor(40), isoVor(60)]
      // „sicher-50" haben Kinder 0–2
      if (i < 3) d.erreicht['sicher-50'] = { am: 1, titel: '50 Wörter sicher', text: '', gruppe: 'wortschatz', medaille: 'bronze' }
      achDatenSchreiben(k.id, d)
    })
    const dg = achDatenLesen(gast.id)
    dg.tage = [isoVor(0), isoVor(1), isoVor(2)]
    achDatenSchreiben(gast.id, dg)
    const dt = achDatenLesen(testKind.id)
    dt.erreicht['sicher-50'] = { am: 1, titel: '50 Wörter sicher', text: '', gruppe: 'wortschatz', medaille: 'bronze' }
    achDatenSchreiben(testKind.id, dt)
  })

  it('Schule: Testkonten zählen nicht; unter 10 Lernenden kein Anteil, ab 10 schon (gecacht)', async () => {
    vergleichVergessen()
    // 9 Kinder + 1 Gast = 10 Lernende (das Testkind zählt nicht)
    const s = schulAnteile()
    expect(s.lernende).toBe(10)
    expect(s.anteile?.['sicher-50']).toBe(30)
    // Zwischengespeichert: ein neues Konto ändert die Zahl erst nach 10 Minuten
    const neu = nutzerAnlegen({ benutzer: 'kind.neu', name: 'Neu Kind', rolle: 'schueler', quelle: 'lokal' })
    expect(schulAnteile().lernende).toBe(10)
    expect(schulAnteile(Date.now() + 11 * 60_000).lernende).toBe(11)
    datenbank().prepare('DELETE FROM nutzer WHERE id = ?').run(neu.id)
    vergleichVergessen()
  })

  it('Klasse: Lerngruppe mit dem Klassennamen bzw. die größte; Gast zählt mit; gleiche Tage = gleicher Platz', () => {
    vergleichVergessen()
    // Kind 0 ist in 7a (6 Mitglieder) und in der AG (2) → 7a
    const gruppen = (datenbank().prepare('SELECT id FROM lerngruppen').all() as { id: string }[]).length
    expect(gruppen).toBe(2)
    // Tage: Kind0 0, Kind1 1, Kind2 2, Kind3 3, Kind4 4, Gast 3 → Kind 3 und Gast teilen sich Platz 2
    expect(klassenPlatz(kinder[4])).toEqual({ platz: 1, von: 6, tage: 4 })
    expect(klassenPlatz(kinder[3])).toEqual({ platz: 2, von: 6, tage: 3 })
    expect(klassenPlatz(gast)).toEqual({ platz: 2, von: 6, tage: 3 })
    expect(klassenPlatz(kinder[0])).toEqual({ platz: 6, von: 6, tage: 0 })
    // Ohne Klasse kein Platz
    expect(klassenPlatz(kinder[8])).toBeNull()
  })

  it('kleinere Klasse als 5: kein Platz', () => {
    vergleichVergessen()
    const lernende = [kinder[0], kinder[1]]
    const g = { id: 'x', lehrkraft_id: lk.id, name: 'AG', fach: '', iserv_gruppe: '', mitglieder: lernende.map((k) => k.benutzer), erstellt: '' }
    expect(hauptKlasse(kinder[0], [g], lernende)?.mitglieder.length).toBe(2)
  })

  it('Antwort der Schnittstelle: Anteile und eigener Platz, keine Namen anderer', async () => {
    vergleichVergessen()
    const d = await rufe(kinder[3], '/s/api/achievements')
    expect(d.lernende).toBe(10)
    expect(d.platz).toEqual({ platz: 2, von: 6, tage: 3 })
    const sicht = d.alle as { id: string; anteil: number | null }[]
    expect(sicht.find((a) => a.id === 'sicher-50')?.anteil).toBe(30)
    const text = JSON.stringify(d)
    for (const k of [...kinder, gast].filter((x) => x.id !== kinder[3].id)) {
      expect(text).not.toContain(k.name)
      expect(text).not.toContain(k.id)
    }
  })
})
