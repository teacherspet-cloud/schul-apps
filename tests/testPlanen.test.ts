import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { testPlanBereinigt, testPlanKurz } from '../src/shared/testPlan'
import { anfangsAuswahl, auswahlZahlen, testAuswahlGliedern, vorschlagKeys } from '../src/renderer/src/modules/lernen/kurs/testPlanGliederung'
import { ohneKlammerHinweis, ohneMarkierungsHinweis, ohneWortInKlammern } from '../src/renderer/src/modules/vokabeltest/generation/taskTypes'
import type { TestAbschnitteDaten } from '../src/renderer/src/modules/lernen/kurs/TestAbschnitte'

/*
 * „Test planen" (02.11.2026, Wunsch der Lehrkraft): gegliederte Auswahl (Band › Unit › Abschnitte/Grammatik), Anfangswahl
 * und Vorschlag, Testpläne anderer Fächer (Bereinigung, verschlüsselte Ablage) – dazu Mediation ohne Wort in Klammern
 * und „Correct the mistakes" ohne markiertes Wort.
 */
const T = Date.UTC(2026, 10, 2, 10)
const TAG = 86_400_000

const eintraege: TestAbschnitteDaten['eintraege'] = [
  { key: 'GL5 S1', titel: 'Station 1', zeit: T - 300 * TAG, art: 'vok', buch: 'Green Line 5', unit: 'Unit 1', name: 'Station 1', anzahl: 20, unitRang: 1, abschnittRang: 1 },
  { key: 'GL6 S1', titel: 'Station 1', zeit: T - 20 * TAG, art: 'vok', buch: 'Green Line 6', unit: 'Unit 1', name: 'Station 1', anzahl: 25, unitRang: 1, abschnittRang: 1 },
  { key: 'GL6 S2', titel: 'Station 2', zeit: T - 5 * TAG, art: 'vok', buch: 'Green Line 6', unit: 'Unit 1', name: 'Station 2', anzahl: 30, unitRang: 1, abschnittRang: 2 },
  { key: 'GL6 U2', titel: 'Unit 2 · Check-in', zeit: T - 2 * TAG, art: 'vok', buch: 'Green Line 6', unit: 'Unit 2', name: 'Check-in', anzahl: 10, unitRang: 2, abschnittRang: 0 },
  { key: 'gram:a', titel: 'Passive forms', zeit: T - 5 * TAG, art: 'gram', buch: 'Green Line 6', unit: 'Unit 1', station: 'Station 2' },
  { key: 'gram:b', titel: 'Simple past', zeit: T - 300 * TAG, art: 'gram' }
]

describe('Test planen: Gliederung', () => {
  it('trennt gleichnamige Stationen nach Band, neuester Band und spätere Unit oben, Grammatik in ihrer Unit', () => {
    const g = testAuswahlGliedern(eintraege)
    expect(g.map((b) => b.buch)).toEqual(['Green Line 6', 'Green Line 5', ''])
    expect(g[0].units.map((u) => u.unit)).toEqual(['Unit 2', 'Unit 1'])
    const u1 = g[0].units[1]
    expect(u1.vok.map((e) => e.key)).toEqual(['GL6 S2', 'GL6 S1'])
    expect(u1.gram.map((e) => e.key)).toEqual(['gram:a'])
    expect(g[1].units[0].vok.map((e) => e.key)).toEqual(['GL5 S1'])
    expect(g[2].units[0].gram.map((e) => e.key)).toEqual(['gram:b'])
  })

  it('zählt Abschnitte, Wörter und Grammatik der Auswahl', () => {
    expect(auswahlZahlen(eintraege, new Set(['GL6 S1', 'GL6 S2', 'gram:a']))).toEqual({ abschnitte: 2, woerter: 55, grammatik: 1 })
  })

  it('Anfangswahl: eigene Wahl bleibt; vorbeigegangener Termin → Vorschlag seit diesem Test', () => {
    const daten: TestAbschnitteDaten = { eintraege, gewaehlt: ['GL5 S1'], eigeneWahl: true, letzter: null }
    expect(anfangsAuswahl(daten, T + 3 * TAG, T)).toEqual({ keys: ['GL5 S1'], vorschlag: false })
    const a = anfangsAuswahl(daten, T - 10 * TAG, T)
    expect(a.vorschlag).toBe(true)
    expect(a.keys.sort()).toEqual(['GL6 S2', 'GL6 U2', 'gram:a'].sort())
    // Ohne eigene Wahl: der Vorschlag des Servers
    expect(vorschlagKeys({ ...daten, eigeneWahl: false, gewaehlt: ['GL6 U2'] }, T + TAG, T)).toEqual(['GL6 U2'])
  })
})

describe('Test planen: andere Fächer', () => {
  it('bereinigt Eingaben und beschreibt kurz', () => {
    const d = testPlanBereinigt({
      thema: '  Bruchrechnung  ',
      seiten: [{ seiten: '34–36', abschnitte: 'Aufgabe 2, Merkkasten' }, { seiten: '' }, { seiten: '40' }],
      material: [
        { art: 'blatt', id: 'b1', titel: 'Brüche addieren', teile: [{ key: 'a2', titel: 'Aufgabe 2' }] },
        { art: 'blatt', id: 'b1', titel: 'doppelt' },
        { art: 'quatsch', id: 'x' },
        { art: 'reihe', id: 'r1', titel: 'Brüche', teile: [] }
      ]
    })
    expect(d.thema).toBe('Bruchrechnung')
    expect(d.seiten).toEqual([{ seiten: '34–36', abschnitte: 'Aufgabe 2, Merkkasten' }, { seiten: '40' }])
    expect(d.material).toEqual([
      { art: 'blatt', id: 'b1', titel: 'Brüche addieren', teile: [{ key: 'a2', titel: 'Aufgabe 2' }] },
      { art: 'reihe', id: 'r1', titel: 'Brüche' }
    ])
    expect(testPlanKurz(d)).toBe('Bruchrechnung · S. 34–36, 40 · 2 Materialien')
    expect(testPlanKurz({ thema: '', seiten: [{ seiten: 'S. 112–115' }], material: [] })).toBe('S. 112–115')
  })
})

describe('Test planen: Ablage am Server', async () => {
  const { setzeSchluesselFuerTests } = await import('../src/server/geheim')
  const { datenbankFuerTests, datenbank, nutzerAnlegen } = await import('../src/server/datenbank')
  const { lerngruppenVon } = await import('../src/server/onlinetest')
  const s = await import('../src/server/testplaene')
  let lk = ''
  let gruppe = ''
  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    s.testplaeneZuruecksetzen()
    lk = nutzerAnlegen({ benutzer: 'm.lehr', name: 'Mia Lehr', rolle: 'lehrkraft', quelle: 'test' }).id
    lerngruppenVon(lk)
    gruppe = randomBytes(6).toString('hex')
    datenbank()
      .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(gruppe, lk, '7a', 'Mathematik', '', '[]', new Date().toISOString())
  })

  it('speichert verschlüsselt, ändert, listet kommende zuerst und löscht', () => {
    const jetzt = Date.now()
    const a = s.testplanSpeichern(lk, gruppe, { termin: jetzt + 7 * TAG, thema: 'Bruchrechnung', seiten: [{ seiten: '34' }] }, jetzt)
    const b = s.testplanSpeichern(lk, gruppe, { termin: jetzt + 2 * TAG, thema: 'Dezimalzahlen' }, jetzt)
    expect(s.testplaeneDerGruppe(gruppe, jetzt).map((p) => p.thema)).toEqual(['Dezimalzahlen', 'Bruchrechnung'])
    expect(s.naechsterTestplan(gruppe, jetzt)).toBe(b.termin)
    const roh = datenbank().prepare('SELECT daten AS x FROM testplaene').all() as { x: unknown }[]
    expect(roh.length).toBe(2)
    const a2 = s.testplanSpeichern(lk, gruppe, { id: a.id, termin: a.termin, thema: 'Bruchrechnung (Test 2)' }, jetzt)
    expect(a2.thema).toBe('Bruchrechnung (Test 2)')
    expect(() => s.testplanSpeichern('fremd', gruppe, { id: a.id, termin: 1, thema: 'x' })).toThrow()
    expect(s.testplanLoeschen('fremd', gruppe, a.id)).toBe(false)
    expect(s.testplanLoeschen(lk, gruppe, a.id)).toBe(true)
    expect(s.testplaeneDerGruppe(gruppe, jetzt).map((p) => p.id)).toEqual([b.id])
  })

  it('räumt Pläne nach 400 Tagen weg', () => {
    const jetzt = Date.now()
    s.testplanSpeichern(lk, gruppe, { termin: jetzt - 401 * TAG, thema: 'alt' }, jetzt)
    expect(s.testplaeneAufraeumen(jetzt)).toBe(1)
  })
})

describe('Vokabeltest: kein Wort verraten', () => {
  it('Mediation: Klammer mit der Vokabel fällt weg, deutsche Klammern bleiben', () => {
    expect(ohneWortInKlammern('Die Preise in diesem kleinen Laden sind sehr wettbewerbsfähig. (competitive)', 'competitive')).toBe(
      'Die Preise in diesem kleinen Laden sind sehr wettbewerbsfähig.'
    )
    expect(ohneWortInKlammern('Viele Reisende machen auf dem Weg nach Australien in Singapur Halt. (traveller)', 'traveller')).toBe(
      'Viele Reisende machen auf dem Weg nach Australien in Singapur Halt.'
    )
    expect(ohneWortInKlammern('Wir erkunden die Stadt. (to explore)', 'to explore')).toBe('Wir erkunden die Stadt.')
    expect(ohneWortInKlammern('Er kam spät (wie immer).', 'late')).toBe('Er kam spät (wie immer).')
  })

  it('Anweisungen ohne Hinweis auf Klammern bzw. Unterstreichung', () => {
    expect(ohneKlammerHinweis('Say it in English. Use the word in brackets.')).toBe('Say it in English.')
    expect(ohneKlammerHinweis('Dis-le en français. Utilise le mot entre parenthèses.')).toBe('Dis-le en français.')
    expect(ohneKlammerHinweis('Use the word in brackets.')).toBe('')
    expect(ohneMarkierungsHinweis('Replace the wrong word with the correct word. The underlined word is wrong.')).toBe('')
    expect(ohneMarkierungsHinweis('One word in each sentence is wrong. Find it and correct it.')).toBe('One word in each sentence is wrong. Find it and correct it.')
  })
})
