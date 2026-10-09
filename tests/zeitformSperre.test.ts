import { describe, expect, it } from 'vitest'
import { bekanntNachStand, ohneGesperrteZeitformen, sperreFuer, sperrRegel, zeitformDerAufgabe, zeitformIn } from '../src/shared/zeitformSperre'
import { mitZeitformSperre, erzeugungsHinweis, zeitformSperre } from '../src/renderer/src/modules/lernen/grammatikErzeugen'
import type { GrammatikAufgabe, GrammatikPaket } from '../src/shared/grammatiktrainer'

/**
 * Zeitform-Sperre (09.10.2026, Befund der Lehrkraft): „There is / There are" in Klasse 5 brachte Aufgaben mit
 * „There was / There were" – das simple past kennt die Lerngruppe noch nicht.
 */
const A = (id: string, x: Partial<GrammatikAufgabe>): GrammatikAufgabe => ({
  id,
  art: 'luecke',
  regelId: 'r1',
  anweisung: 'Setze die richtige Form ein.',
  satz: '',
  loesungen: [],
  ...x
})

const KLASSE5 = sperreFuer({ bekannt: bekanntNachStand({ buch: 'Green Line 1', unit: 'Unit 1' }), thema: 'There is / There are' })
const ids = (z: { id: string }[]): string[] => z.map((x) => x.id)

describe('Bekannte Grammatik und Sperre', () => {
  it('Green Line 1 Unit 1: alle Vergangenheits- und Zukunftsformen gesperrt', () => {
    expect(ids(KLASSE5).sort()).toEqual(['conditional', 'going_to', 'passive', 'past_perfect', 'past_progressive', 'past_simple', 'present_perfect', 'will_future'])
  })
  it('Green Line 2 Unit 2: simple past und going to bekannt, Passiv nicht', () => {
    const g = ids(sperreFuer({ bekannt: bekanntNachStand({ buch: 'green-line-2-nds', unit: 'Unit 2' }) }))
    expect(g).not.toContain('past_simple')
    expect(g).not.toContain('going_to')
    expect(g).toContain('passive')
  })
  it('ohne Lehrwerk: Klasse 5 nur Basis, Klasse 6 kennt Green Line 1 (simple past)', () => {
    expect(ids(sperreFuer({ bekannt: bekanntNachStand(undefined, 5) }))).toContain('past_simple')
    expect(ids(sperreFuer({ bekannt: bekanntNachStand(undefined, 6) }))).not.toContain('past_simple')
  })
  it('das Thema selbst ist erlaubt – als Kennung oder als Name', () => {
    expect(ids(sperreFuer({ bekannt: [], themen: ['en.verb.past_simple'] }))).not.toContain('past_simple')
    expect(ids(sperreFuer({ bekannt: [], thema: 'Simple past: Fragen' }))).not.toContain('past_simple')
  })
  it('Teilform „there was / there were" schaltet das simple past nicht frei', () => {
    expect(ids(sperreFuer({ bekannt: ['en.verb.there_is/vergangenheit'] }))).toContain('past_simple')
  })
  it('Regel für die KI nennt erlaubte und verbotene Formen', () => {
    const r = sperrRegel(KLASSE5)
    expect(r).toMatch(/simple present/)
    expect(r).toMatch(/VERBOTEN.*simple past/)
    expect(sperrRegel([])).toBe('')
  })
  it('Englisch und (seit dem Nachtrag) die übrigen erfassten Sprachen; ohne Daten (Polnisch) keine Prüfung', () => {
    const basis = { thema: 'There is / There are', fach: 'Englisch', sprache: 'en', jahrgang: 5 }
    expect(zeitformSperre(basis).length).toBeGreaterThan(0)
    expect(zeitformSperre({ ...basis, fach: 'Französisch', sprache: 'fr' }).every((z) => z.sprache === 'fr')).toBe(true)
    expect(zeitformSperre({ ...basis, fach: 'Polnisch', sprache: 'pl' })).toEqual([])
  })
})

describe('Erkennung im Text', () => {
  const treffer = (t: string): string | undefined => zeitformIn(t, KLASSE5)?.id
  it.each([
    ['There was a cat in the garden.', 'past_simple'],
    ['There were two dogs.', 'past_simple'],
    ['Were there any shops?', 'past_simple'],
    ['She played tennis yesterday.', 'past_simple'],
    ['Tom visited his grandma.', 'past_simple'],
    ['We went to the zoo.', 'past_simple'],
    ['I have finished my homework.', 'present_perfect'],
    ['Have you ever been to London?', 'present_perfect'],
    ['She had eaten the cake.', 'past_perfect'],
    ['There will be a test.', 'will_future'],
    ["I'll help you.", 'will_future'],
    ['We are going to play football.', 'going_to'],
    ['I would buy a car.', 'conditional'],
    ['The house is built by workers.', 'passive']
  ])('%s → %s', (t, id) => expect(treffer(t)).toBe(id))
  it.each([
    'There is a cat in the garden.',
    'There are two beds in my room.',
    'Is there a bus stop near here?',
    "There aren't any eggs.",
    "I'm going to school.",
    'We are going to the cinema.',
    'I have got a red bike.',
    'She is tired and bored.',
    'My dog is called Rex.',
    'Would you like a cup of tea?',
    'I can swim. Open the door!',
    'There are a hundred books.',
    "I won't"
  ])('kein Treffer: %s', (t) => {
    // „won't" ist will-future, aber kein simple past
    expect(treffer(t) === undefined || (t === "I won't" && treffer(t) === 'will_future')).toBe(true)
  })
})

describe('Aufgaben streichen', () => {
  const aufgaben: GrammatikAufgabe[] = [
    A('a1', { satz: 'There ___ a cat in the garden.', loesungen: ['is'] }),
    A('a2', { satz: 'Yesterday there ___ a storm.', loesungen: ['was'] }),
    A('a3', { art: 'auswahl', satz: 'There ___ two dogs.', loesungen: ['are'], optionen: ['is', 'are', 'am'] }),
    A('a4', { art: 'umformen', satz: 'There is a dog.', vorgabe: 'Setze den Satz in die Vergangenheit.', loesungen: ['There was a dog.'] }),
    A('a5', { art: 'satzbau', teile: ['There', 'were', 'many', 'people.'], loesungen: ['There were many people.'] }),
    A('a6', { art: 'uebersetzen', satz: 'Was gibt es in deinem Zimmer? Es gibt ein Bett.', loesungen: ['There is a bed.'] }),
    A('a7', { art: 'fehler', satz: 'There are a cat.', fehlerWort: 'are', loesungen: ['is'] })
  ]
  it('entfernt Vergangenheit in Lösung, Satz, Teilen und Vorgabe; deutscher Übersetzungssatz zählt nicht', () => {
    const r = ohneGesperrteZeitformen({ regeln: [{ beispiele: ['There is a desk.', 'There was a storm.'] }], aufgaben }, KLASSE5)
    expect(ids(r.aufgaben)).toEqual(['a1', 'a3', 'a6', 'a7'])
    expect(r.entfernt).toBe(3)
    expect(r.zeitformen).toEqual(['simple past'])
    expect(r.regeln[0].beispiele).toEqual(['There is a desk.'])
  })
  it('ohne Sperre bleibt alles', () => {
    expect(ohneGesperrteZeitformen({ regeln: [], aufgaben }, []).aufgaben).toHaveLength(aufgaben.length)
  })
  it('Vorgabe mit Zeitformname zählt', () => {
    expect(zeitformDerAufgabe(A('x', { satz: 'He ___ (go) home.', vorgabe: '(go) – simple past', loesungen: ['goes'] }), KLASSE5)?.id).toBe('past_simple')
  })
})

describe('Nachschreiben nach dem Streichen', () => {
  const paket = (n: number, vergangen: number): GrammatikPaket => ({
    thema: 'There is / There are',
    regeln: [{ id: 'r1', titel: 'there is', erklaerung: 'Es gibt', beispiele: ['There is a cat.'] }],
    aufgaben: [
      ...Array.from({ length: n - vergangen }, (_, i) => A(`a${i + 1}`, { satz: `There ___ ${i + 1} cats.`, loesungen: ['are'] })),
      ...Array.from({ length: vergangen }, (_, i) => A(`v${i + 1}`, { satz: `There ___ ${i + 1} dogs yesterday.`, loesungen: ['were'] }))
    ]
  })
  it('schreibt die fehlenden nach, behält Kennungen und meldet die Zahl', async () => {
    let gefragt = 0
    const p = await mitZeitformSperre(paket(10, 3), KLASSE5, 10, async (anzahl) => {
      gefragt = anzahl
      // die KI liefert vier – eine davon wieder mit Vergangenheit
      return {
        ...paket(0, 0),
        aufgaben: [
          A('a1', { satz: 'There ___ a pen on my desk.', loesungen: ['is'] }),
          A('a2', { satz: 'There ___ a pen on the floor last week.', loesungen: ['was'] }),
          A('a3', { satz: 'There ___ two pens in my bag.', loesungen: ['are'] }),
          A('a4', { satz: 'There ___ a map on the wall.', loesungen: ['is'] })
        ]
      }
    })
    expect(gefragt).toBe(3)
    expect(p.aufgaben).toHaveLength(10)
    expect(new Set(ids(p.aufgaben)).size).toBe(10)
    expect(ids(p.aufgaben).slice(0, 7)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'])
    expect(erzeugungsHinweis(p)).toBe(' (4 Aufgaben mit noch unbekannter Zeitform entfernt: simple past)')
  })
  it('nichts gestrichen: keine Anfrage, kein Hinweis', async () => {
    let gefragt = false
    const p = await mitZeitformSperre(paket(5, 0), KLASSE5, 5, async () => ((gefragt = true), paket(0, 0)))
    expect(gefragt).toBe(false)
    expect(erzeugungsHinweis(p)).toBe('')
  })
  it('Nachschreiben scheitert: bereinigter Pool bleibt', async () => {
    const p = await mitZeitformSperre(paket(6, 2), KLASSE5, 6, async () => {
      throw new Error('KI weg')
    })
    expect(p.aufgaben).toHaveLength(4)
    expect(erzeugungsHinweis(p)).toMatch(/2 Aufgaben/)
  })
})
