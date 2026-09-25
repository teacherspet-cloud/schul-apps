import { describe, expect, it } from 'vitest'
import {
  checkClosedFormatsHistory,
  checkItemWording,
  checkTrueFalseEvidence,
  ITEM_MAX_WOERTER,
  mehrteiligeFrage,
  wortgleicheStelle
} from '../src/renderer/src/modules/arbeitsblatt/didactics/itemWording'
import { EVIDENCE_SCORING, evidenceInstruction } from '../src/renderer/src/shared/evidenceInstruction'
import { itemWordingRules, comprehensionRules } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { COMPREHENSION_FORMATS } from '../src/renderer/src/modules/arbeitsblatt/didactics/comprehensionFormats'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { Sheet, WorksheetMeta, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  grade: 8,
  skillFocus: 'listening',
  ...patch
})

const frage = (
  text: string,
  optionen: string[] = ['a', 'b', 'c']
): { id: string; instruction: string; answer: ReturnType<typeof emptyAnswer>; solution: string } => ({
  id: text.slice(0, 6),
  instruction: text,
  answer: { ...emptyAnswer('multipleChoice'), options: optionen, correct: [0] },
  solution: ''
})

const aufgabe = (fragen: string[], optionen?: string[][]): WsBlock => ({
  id: 't1',
  type: 'task',
  instruction: '**Tick** the correct answer.',
  operator: 'tick',
  afb: 'I',
  afbReason: '',
  socialForm: 'EA',
  minutes: 5,
  points: 0,
  solution: '',
  answer: emptyAnswer('none'),
  skill: 'listening',
  parts: fragen.map((f, i) => frage(f, optionen?.[i]))
})

const blatt = (blocks: WsBlock[]): Sheet => ({ id: 's1', label: 'Arbeitsblatt', blocks })

const hoertext = (transcript: string): WsBlock => ({
  id: 'a1',
  type: 'audio',
  title: 'Text',
  textType: 'Gespräch',
  transcript,
  speakers: [],
  plays: 2,
  beforeListening: '',
  seconds: 40
})

const meldungen = (s: Sheet, m = meta()): string[] => checkItemWording(s, m).map((w) => w.message)

/*
 * Grundlage: QUA-LiS/MSB NRW „Klausuren in den modernen Fremdsprachen…" (27.10.2025, S. 13–14),
 * KMK 2012, ALTE-Manual 2011. Die Fundstellen stehen im Kopf von didactics/itemWording.ts.
 */
describe('Wortlaut der Einzelfragen', () => {
  it('meldet eine Verneinung in der Frage', () => {
    // NRW wörtlich: Items „vermeiden Verneinungen"
    expect(meldungen(blatt([aufgabe(['Which hobby does Noah not like?', 'Where does Anna live?'])]))[0]).toMatch(/Verneinung/)
  })

  it('meldet Ausschließlichkeitswörter', () => {
    // NRW wörtlich: „ohne Einschränkungs- und Ausschließlichkeitspartikel (z. B. weniger, immer)"
    expect(meldungen(blatt([aufgabe(['What does Anna always do after school?', 'Where does she live?'])]))[0]).toMatch(/Ausschließlichkeitswort/)
  })

  it('meldet eine zweiteilige Frage', () => {
    const m = meldungen(blatt([aufgabe(['What does Anna do and why does she do it?', 'Where is she?'])]))
    expect(m.some((x) => /mehr als eine Frage/.test(x))).toBe(true)
  })

  it('meldet eine zu lange Frage', () => {
    const lang = `What ${'very '.repeat(ITEM_MAX_WOERTER)}long question is this?`
    expect(meldungen(blatt([aufgabe([lang, 'Where is she?'])]))[0]).toMatch(/lang/)
  })

  it('lässt eine saubere Frage unbeanstandet', () => {
    expect(meldungen(blatt([aufgabe(["What is in Ruby's picture?", 'Where does Karam go?'])]))).toEqual([])
  })

  it('hält eine inhaltliche Verneinung nicht für einen Fehler', () => {
    /*
     * „What can't Karam find?" steht so in der Klassenarbeit der Lehrkraft und ist dort
     * richtig. Gemeint ist der andere Fall: eine Frage nach dem NICHT-Fall („Which statement
     * is not true?"), die man erst gedanklich umdrehen muss. Eine Prüfung, die am ersten
     * echten Blatt unrecht hat, wird fortan weggeklickt.
     */
    expect(meldungen(blatt([aufgabe(["What can't Karam find?", "Who doesn't like the song?"])]))).toEqual([])
  })

  it('meldet die Frage nach dem Nicht-Fall', () => {
    expect(meldungen(blatt([aufgabe(['Which statement is not true?', 'Where is she?'])]))[0]).toMatch(/Verneinung/)
  })

  it('greift nur bei Verstehensaufgaben', () => {
    const schreiben = meta({ skillFocus: 'writing' })
    const block = { ...aufgabe(['Which hobby does Noah not like?', 'Where is she?']) } as WsBlock
    if (block.type === 'task') delete (block as { skill?: string }).skill
    expect(meldungen(blatt([block]), schreiben)).toEqual([])
  })
})

describe('Wörtliche Übernahme aus dem Text', () => {
  /*
   * Belegt: NRW verbietet die Wiederholung des Originalwortlauts in Attraktoren UND
   * Distraktoren. Empirisch greifen Lernende sonst zur „lexical matching strategy"
   * (Yanagawa & Green 2008; Koyama, Sun & Ockey 2016) – gelöst wird über Wortgleichheit
   * statt über Verstehen.
   */
  it('findet vier gleiche Wörter in Folge', () => {
    expect(wortgleicheStelle('She went to the cinema yesterday.', 'On Friday she went to the cinema with Tom.')).toBe('she went to the')
  })

  it('stört sich nicht an kürzeren Übereinstimmungen', () => {
    // „to the" allein ist Alltagssprache, kein Abschreiben
    expect(wortgleicheStelle('She walked to the park.', 'He drove to the shop.')).toBeNull()
  })

  it('meldet eine abgeschriebene Frage', () => {
    const sheet = blatt([
      hoertext('Mr Clarkson: The school library is closed on Fridays because of the building work.'),
      aufgabe(['When is the school library is closed?', 'Where is it?'])
    ])
    expect(meldungen(sheet).some((m) => /Wortlaut des Textes/.test(m))).toBe(true)
  })

  it('schweigt bei einer echten Paraphrase', () => {
    /*
     * Die Gegenprobe zum Fall darüber – sonst könnte die Prüfung alles melden und der Test
     * würde es nicht merken. Hier ist dieselbe Information anders gesagt.
     */
    const sheet = blatt([
      hoertext('Mr Clarkson: The school library is closed on Fridays because of the building work.'),
      aufgabe(['On which day can students not use the books?', 'Where is it?'])
    ])
    expect(meldungen(sheet).filter((m) => /Wortlaut des Textes/.test(m))).toEqual([])
  })

  it('meldet eine abgeschriebene Antwortmöglichkeit', () => {
    const sheet = blatt([
      hoertext('Tom: We slept at their house because the train was late that evening.'),
      aufgabe(
        ['Where did Tom spend the night?', 'Why?'],
        [
          ['at a hotel', 'we slept at their house', 'at home'],
          ['a', 'b', 'c']
        ]
      )
    ])
    expect(meldungen(sheet).some((m) => /steht wörtlich im Text/.test(m))).toBe(true)
  })

  it('meldet Sammelmöglichkeiten', () => {
    const sheet = blatt([
      aufgabe(
        ['What does Anna like?', 'Why?'],
        [
          ['tea', 'coffee', 'all of the above'],
          ['a', 'b', 'c']
        ]
      )
    ])
    expect(meldungen(sheet).some((m) => /ungeeignet/.test(m))).toBe(true)
  })
})

describe('Zweiteilige Fragen erkennen', () => {
  it('erkennt zwei Fragezeichen', () => {
    expect(mehrteiligeFrage('Who is she? What does she want?')).toBe(true)
  })

  it('erkennt ein angehängtes zweites Fragewort', () => {
    expect(mehrteiligeFrage('Where does she go and why?')).toBe(true)
  })

  it('hält eine Aufzählung nicht für eine zweite Frage', () => {
    expect(mehrteiligeFrage('What does Anna eat and drink for breakfast?')).toBe(false)
  })
})

describe('Regeln im Auftrag an die KI', () => {
  it('verlangt ein Sprachniveau unterhalb des Textes', () => {
    // KMK 2012: „liegt jeweils unterhalb des Anforderungsniveaus der Hörtexte"
    expect(itemWordingRules(meta())).toMatch(/EINFACHER als der Text/)
  })

  it('verbietet Verneinungen, Ausschließlichkeitswörter und Abhängigkeiten', () => {
    const r = itemWordingRules(meta())
    expect(r).toMatch(/Keine Verneinung/)
    expect(r).toMatch(/Ausschließlichkeitswörter/)
    expect(r).toMatch(/voneinander unabhängig/)
  })

  it('verlangt Antworttyp und Höchstlänge bei halboffenen Formaten', () => {
    // ALTE: „Is the type and length of response required indicated to the candidate?"
    expect(itemWordingRules(meta())).toMatch(/Antworttyp und Höchstlänge/)
  })

  it('unterscheidet Hören und Lesen', () => {
    expect(itemWordingRules(meta({ skillFocus: 'listening' }))).toMatch(/ERSTEN Hören/)
    expect(itemWordingRules(meta({ skillFocus: 'reading' }))).not.toMatch(/Hörstil/)
  })

  it('folgt der Wahl der Lehrkraft zur Sprache der Fragen', () => {
    expect(itemWordingRules(meta({ instructionsInGerman: true }))).toMatch(/auf Deutsch/)
    expect(itemWordingRules(meta({ instructionsInGerman: false }))).toMatch(/in der Zielsprache/)
  })

  it('schweigt bei Blättern ohne Verstehens-Schwerpunkt', () => {
    expect(itemWordingRules(meta({ skillFocus: 'writing' }))).toBe('')
  })
})

describe('Musterformulierungen je Format', () => {
  it('liegen zu JEDEM Format vor', () => {
    // Ohne sie schrieb die KI zu jedem Format denselben Anweisungssatz
    for (const f of COMPREHENSION_FORMATS) expect(f.stem.length, f.id).toBeGreaterThan(40)
  })

  it('erreichen die KI', () => {
    const rules = comprehensionRules(meta({ comprehensionFormats: ['multiple-choice'] }))
    expect(rules).toContain('Tick (✓) the correct answer.')
  })

  it('nennt bei Lückenformaten die Höchstzahl der Wörter', () => {
    const lücke = COMPREHENSION_FORMATS.find((f) => f.id === 'gap-filling')!
    expect(lücke.stem).toMatch(/1 to 5 words/)
    expect(lücke.stem).toMatch(/Höchstzahl der Wörter/)
  })
})

/*
 * Richtig/Falsch beim Leseverstehen: Textbeleg als Bedingung.
 *
 * Belegt: MSB/QUA-LiS NRW, Unterrichtsvorgaben ZP10 Englisch 2027, Abschnitt 1.5 –
 * Leseverstehen prüft mit „Richtig-/Falsch-Aufgaben MIT BEGRÜNDUNG", in MSA, Gymnasium und
 * EESA gleichermaßen. KMK 2012 (illustrierende Prüfungsaufgabe Französisch): „Citez le
 * passage qui justifie votre réponse." DELF ab A2 auf allen Niveaus.
 * Beim Hörverstehen gilt in NRW das Gegenteil: richtig/falsch UND Begründungsformate sind
 * dort für die Leistungsmessung ausgeschlossen (Konstruktionshinweise GOSt, S. 13).
 */
describe('Richtig/Falsch braucht beim Lesen einen Beleg', () => {
  const tfAufgabe = (skill: 'reading' | 'listening'): WsBlock => ({
    id: 'tf1',
    type: 'task',
    instruction: '**Tick** true or false.',
    operator: 'tick',
    afb: 'I',
    afbReason: '',
    socialForm: 'EA',
    minutes: 5,
    points: 0,
    solution: '',
    answer: { ...emptyAnswer('trueFalse'), statements: [{ text: 'Anna likes school.', isTrue: true }] },
    skill,
    parts: []
  })

  it('meldet richtig/falsch ohne Beleg im Leseverstehen', () => {
    const treffer = checkTrueFalseEvidence(blatt([tfAufgabe('reading')]), meta({ skillFocus: 'reading' }))
    expect(treffer).toHaveLength(1)
    expect(treffer[0].message).toMatch(/Textbeleg/)
    expect(treffer[0].message).toMatch(/erraten/)
  })

  it('lässt richtig/falsch im Hörverstehen zu', () => {
    // Der Hörtext ist flüchtig – ein Zitat wäre Gedächtnisleistung
    expect(checkTrueFalseEvidence(blatt([tfAufgabe('listening')]), meta({ skillFocus: 'listening' }))).toEqual([])
  })

  it('bietet das belegfreie Format beim Lesen gar nicht erst an', () => {
    const tf = COMPREHENSION_FORMATS.find((f) => f.id === 'true-false')!
    expect(tf.skills).toEqual(['listening'])
    const mitBeleg = COMPREHENSION_FORMATS.find((f) => f.id === 'true-false-evidence')!
    expect(mitBeleg.skills).toContain('reading')
  })

  it('verlangt ein ZITAT, keine Zeilenangabe', () => {
    /*
     * Korrektur eines Fehlers: Die App verlangte vorher „Give the line that proves your
     * answer". QUA-LiS NRW, ZP10-FAQ: „Eine Zeilenangabe als Beleg ist nicht vorgesehen …
     * Zeilenangaben geben keine Punkte."
     */
    const f = COMPREHENSION_FORMATS.find((x) => x.id === 'true-false-evidence')!
    expect(f.construction).toMatch(/WÖRTLICHES ZITAT/)
    expect(f.construction).toMatch(/Zeilenangabe zählt NICHT/)
    expect(f.stem).toMatch(/quoting short passages/)
  })

  it('vergibt alles oder nichts, keine Teilpunkte', () => {
    // QUA-LiS NRW: „Folglich dürfen nur 0 oder 2 Punkte vergeben werden."
    const f = COMPREHENSION_FORMATS.find((x) => x.id === 'true-false-evidence')!
    expect(f.scoring).toMatch(/Keine Teilpunkte/)
    expect(EVIDENCE_SCORING).toMatch(/Keine Teilpunkte/)
  })

  it('nimmt „nicht im Text" von der Belegpflicht aus', () => {
    // KMK 2012, S. 124: „Pas dans le texte: pro richtige Antwort zwei Punkte, keine Textbelegstelle."
    const f = COMPREHENSION_FORMATS.find((x) => x.id === 'true-false-not-in-text')!
    expect(f.scoring).toMatch(/nicht im Text.*Ankreuzen/s)
    expect(f.construction).toMatch(/KEINE Belegzeile/)
  })

  it('sagt es der KI – mit der Ausnahme und ohne Zeilenangabe', () => {
    const r = itemWordingRules(meta({ skillFocus: 'reading' }))
    expect(r).toMatch(/NUR mit Textbeleg/)
    expect(r).toMatch(/Zeilenangabe ist KEIN Beleg/)
    expect(r).toMatch(/nicht im Text.*allein für das Ankreuzen/s)
    // Beim Hören darf die Regel NICHT stehen
    expect(itemWordingRules(meta({ skillFocus: 'listening' }))).not.toMatch(/Textbeleg/)
  })

  it('hat die Arbeitsanweisung in den Sprachen, die belegt sind', () => {
    expect(evidenceInstruction('en').instruction).toMatch(/quoting short passages from the text/)
    expect(evidenceInstruction('fr').instruction).toMatch(/Citez le passage/)
    expect(evidenceInstruction('de').instruction).toMatch(/kurzes Zitat/)
    // Englisch, Französisch und Deutsch stammen aus amtlichem Material – Spanisch und
    // Italienisch sind sinngemäß gebildet und ausdrücklich als solche gekennzeichnet
    expect(evidenceInstruction('en').sourced).toBe(true)
    expect(evidenceInstruction('es').sourced).toBe(false)
  })
})

/*
 * Geschlossene Formate in Geschichte.
 *
 * Belegt: EPA Geschichte 3.2.2 – „Eine mehrgliedrige Prüfungsaufgabe besteht aus wenigen,
 * aber komplexen Arbeitsanweisungen … Ein unzusammenhängendes, additives Reihen von
 * Arbeitsaufträgen ist nicht zulässig." Entscheidung der Lehrkraft: nur warnen, nicht
 * sperren – zum Üben im Unterricht sind die Formate brauchbar.
 */
describe('Aufgabenformate in Geschichte', () => {
  const ankreuzen = (id: string): WsBlock => ({
    id,
    type: 'task',
    instruction: '**Kreuze** an.',
    operator: 'kreuze an',
    afb: 'I',
    afbReason: '',
    socialForm: 'EA',
    minutes: 4,
    points: 0,
    solution: '',
    answer: { ...emptyAnswer('multipleChoice'), options: ['a', 'b', 'c'], correct: [0] },
    parts: []
  })
  const deuten = (id: string): WsBlock => {
    const b = ankreuzen(id)
    // Der Typwächter braucht die Einschränkung – `ankreuzen` liefert formal jeden Bausteintyp
    if (b.type !== 'task') return b
    return { ...b, instruction: '**Beurteile** die Quelle.', answer: emptyAnswer('lines') }
  }

  it('warnt ab zwei geschlossenen Aufgaben', () => {
    const t = checkClosedFormatsHistory(blatt([ankreuzen('a'), ankreuzen('b')]), meta({ subjectId: 'geschichte' }))
    expect(t).toHaveLength(1)
    expect(t[0].message).toMatch(/additives Reihen/)
    expect(t[0].message).toMatch(/wenige, aber komplexe/)
  })

  it('lässt eine einzelne geschlossene Aufgabe zu', () => {
    // Eine Aufgabe ist noch kein „Reihen"
    expect(checkClosedFormatsHistory(blatt([ankreuzen('a'), deuten('b')]), meta({ subjectId: 'geschichte' }))).toEqual([])
  })

  it('sperrt nichts, sondern meldet nur', () => {
    // Die Meldung sagt ausdrücklich, dass die Formate zum Üben in Ordnung sind
    const t = checkClosedFormatsHistory(blatt([ankreuzen('a'), ankreuzen('b')]), meta({ subjectId: 'geschichte' }))
    expect(t[0].message).toMatch(/zum Üben im Unterricht sind die Formate in Ordnung/)
  })

  it('gilt nicht in den Fremdsprachen', () => {
    /*
     * Dort ist der Text der Prüfgegenstand, und viele kleine Items sind gerade erwünscht:
     * KMK verlangt „eine hinreichende Anzahl (Teil)Aufgaben".
     */
    expect(checkClosedFormatsHistory(blatt([ankreuzen('a'), ankreuzen('b')]), meta({ subjectId: 'englisch' }))).toEqual([])
  })
})
