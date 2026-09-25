import { describe, expect, it } from 'vitest'
import { targetWordCount, vocabWorkRules } from '../src/renderer/src/modules/arbeitsblatt/didactics/vocabWork'
import { pickVocabWords, suggestVocabWords } from '../src/renderer/src/modules/arbeitsblatt/generation/vocabSuggest'
import { skillFocusOptions } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import {
  checkListening,
  checkMediation,
  checkSkillFocus,
  checkWriting,
  doppeltSituiert,
  inFalscherSprache
} from '../src/renderer/src/modules/arbeitsblatt/didactics/languageChecks'
import { checkClosure, checkTaskCount, checkTaskMix } from '../src/renderer/src/modules/arbeitsblatt/didactics/sheetChecks'
import { buildLearnerProfile } from '../src/renderer/src/modules/arbeitsblatt/didactics/profile'
import { scriptTurns, speakerNames } from '../src/renderer/src/modules/arbeitsblatt/steps/AudioPanel'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type {
  AnswerKind,
  AudioBlock,
  Sheet,
  TaskBlock,
  TaskBrief,
  TextBlock,
  WorksheetMeta,
  WsBlock
} from '../src/renderer/src/modules/arbeitsblatt/model/types'

/** Blatt-Vorgaben für die Prüfungen zum Schwerpunkt Vokabeln */
const vocabMeta = (): WorksheetMeta => ({ ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'englisch', grade: 7 })

const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  grade: 9,
  cefrLevel: 'B1',
  ...patch
})

const brief = (patch: Partial<TaskBrief> = {}): TaskBrief => ({
  situation: 'Your class has a partner school in Leeds.',
  audience: 'your exchange partner',
  textType: 'e-mail',
  purpose: 'inform',
  words: 120,
  points: ['costs', 'dates'],
  criteria: ['Inhalt vollständig', 'Textsortenmerkmale', 'Sprache verständlich'],
  // Erwartungshorizont und Mustertext gehoeren seit 09/2026 zu einer vollstaendigen Schreibaufgabe
  expected: [
    { aspect: 'costs', criterion: 'nennt die Kosten und ordnet sie ein', examples: ['about 200 euros', 'travel is included'], points: 4 },
    { aspect: 'dates', criterion: 'nennt die Termine und begruendet die Wahl', examples: ['the first week of July', 'before the exams'], points: 4 }
  ],
  model: 'Hi Sam, our exchange will take place in July.',
  ...patch
})

const germanText = (words = 120): TextBlock => ({
  id: 't',
  type: 'text',
  title: 'Schüleraustausch',
  body: Array.from({ length: words }, () => 'Wort').join(' '),
  lineNumbers: false,
  source: 'Schulhomepage',
  glossary: [],
  language: 'de'
})

const task = (patch: Partial<TaskBlock> = {}): TaskBlock => ({
  id: Math.random().toString(36).slice(2),
  type: 'task',
  instruction:
    'Your exchange partner from Leeds wants to visit your school next spring. You have found this article about the exchange programme and want to write him an email. In your email, tell him about the costs and the dates.',
  operator: 'write',
  afb: 'II',
  afbReason: '',
  socialForm: 'EA',
  minutes: 20,
  points: 0,
  solution: 'Erwartungshorizont: Kosten, Termine.',
  answer: { ...emptyAnswer('lines'), count: 14 },
  parts: [],
  ...patch
})

const audio = (patch: Partial<AudioBlock> = {}): AudioBlock => ({
  id: 'a',
  type: 'audio',
  title: 'At the station',
  textType: 'Durchsage',
  transcript: Array.from({ length: 60 }, () => 'word').join(' '),
  speakers: [],
  plays: 2,
  beforeListening: 'Listen for the platform number.',
  seconds: 40,
  ...patch
})

const sheet = (blocks: WsBlock[]): Sheet => ({ id: 's', label: 'Arbeitsblatt', blocks })

describe('Sprachmittlung', () => {
  it('nimmt eine vollständige Aufgabe mit deutschem Ausgangstext an', () => {
    const warnings = checkMediation(sheet([germanText(), task({ skill: 'mediation', brief: brief() })]), meta())
    expect(warnings).toEqual([])
  })

  it('meldet den fehlenden deutschen Ausgangstext', () => {
    const warnings = checkMediation(sheet([task({ skill: 'mediation', brief: brief() })]), meta())
    expect(warnings.some((w) => w.message.includes('deutsche Ausgangstext'))).toBe(true)
  })

  it('weist Übersetzungsaufträge zurück', () => {
    const warnings = checkMediation(
      sheet([germanText(), task({ skill: 'mediation', brief: brief(), instruction: 'Übersetze den Text ins Englische.' })]),
      meta()
    )
    expect(warnings.some((w) => w.message.includes('Übersetzung'))).toBe(true)
  })

  it('verlangt Adressat, Textsorte und Zweck', () => {
    const warnings = checkMediation(sheet([germanText(), task({ skill: 'mediation', brief: brief({ audience: '', textType: '' }) })]), meta())
    const message = warnings.map((w) => w.message).join(' ')
    expect(message).toContain('Adressat')
    expect(message).toContain('Textsorte')
  })

  it('verlangt zielsprachliche statt deutscher Worterklärungen', () => {
    const withGerman = germanText()
    withGerman.glossary = [{ term: 'Pfand', explanation: 'Das ist Geld, das man für die Flasche zurückbekommt.' }]
    const warnings = checkMediation(sheet([withGerman, task({ skill: 'mediation', brief: brief() })]), meta())
    expect(warnings.some((w) => w.message.includes('ist auf Deutsch'))).toBe(true)
  })

  it('nimmt englische Worterklärungen an', () => {
    const withEnglish = germanText()
    withEnglish.glossary = [
      { term: 'Pfand', explanation: 'deposit (money you get back when you return the bottle)' },
      // Ein mitgeführter deutscher Artikel ist keine deutsche Erklärung
      { term: 'das Abitur', explanation: 'school-leaving exam' }
    ]
    expect(checkMediation(sheet([withEnglish, task({ skill: 'mediation', brief: brief() })]), meta())).toEqual([])
  })

  it('meldet einen zu kurzen Ausgangstext', () => {
    const warnings = checkMediation(sheet([germanText(20), task({ skill: 'mediation', brief: brief() })]), meta())
    expect(warnings.some((w) => w.message.includes('zu kurz'))).toBe(true)
  })

  /*
   * Gemeldet von der Lehrkraft (24.09.2026): Auf dem Lösungsblatt einer Sprachmittlung standen
   * nur Bewertungskriterien und „Dinge, die Schüler beachten sollten" – kein Beispieltext.
   *
   * Beim Korrigieren einer Sprachmittlung reicht eine Kriterienliste nicht: Erst an einem
   * ausformulierten Text sieht man, welche Auslassungen vertretbar sind und wo die Wiedergabe
   * in eine Übersetzung umschlägt.
   */
  it('meldet einen fehlenden Mustertext', () => {
    const warnings = checkMediation(sheet([germanText(), task({ skill: 'mediation', brief: brief({ model: '' }) })]), meta())
    expect(warnings.some((w) => w.message.includes('Mustertext'))).toBe(true)
  })

  it('meldet einen fehlenden Erwartungshorizont mit Beispielen', () => {
    const warnings = checkMediation(sheet([germanText(), task({ skill: 'mediation', brief: brief({ expected: [] }) })]), meta())
    expect(warnings.some((w) => w.message.includes('Beispiellösungen'))).toBe(true)
  })
})

describe('Schreibaufgaben', () => {
  it('verlangt Situierung, Umfang und Kriterien', () => {
    const warnings = checkWriting(sheet([task({ skill: 'writing', brief: brief({ audience: '', words: 0, criteria: [] }) })]), meta())
    const message = warnings.map((w) => w.message).join(' ')
    expect(message).toContain('Adressat')
    expect(message).toContain('geplante Umfang')
    expect(message).toContain('Bewertungskriterien')
  })

  it('meldet zu wenige Schreiblinien für den geforderten Umfang', () => {
    const warnings = checkWriting(sheet([task({ skill: 'writing', brief: brief({ words: 200 }), answer: { ...emptyAnswer('lines'), count: 5 } })]), meta())
    expect(warnings.some((w) => w.message.includes('Schreiblinien'))).toBe(true)
  })

  it('nimmt eine vollständige Schreibaufgabe an', () => {
    expect(checkWriting(sheet([task({ skill: 'writing', brief: brief({ words: 120 }), answer: { ...emptyAnswer('lines'), count: 12 } })]), meta())).toEqual([])
  })
})

describe('Kontextbindung und Wortvorgabe', () => {
  const bare = task({ skill: 'writing', brief: brief(), instruction: 'Write an email to your friend.' })

  it('meldet eine Aufgabe ohne Situation', () => {
    expect(checkWriting(sheet([bare]), meta()).some((w) => w.message.includes('nicht in eine Situation eingebettet'))).toBe(true)
  })

  it('nimmt eine situierte Aufgabe an', () => {
    expect(checkWriting(sheet([task({ skill: 'writing', brief: brief() })]), meta())).toEqual([])
  })

  it('meldet eine Wortzahl, wenn die Wortvorgabe aus ist', () => {
    const withCount = task({ skill: 'writing', brief: brief(), instruction: `${task().instruction} Write about 120 words.` })
    expect(checkWriting(sheet([withCount]), meta({ wordLimit: false })).some((w) => w.message.includes('nennt eine Wortzahl'))).toBe(true)
  })

  it('verlangt die Wortzahl, wenn die Wortvorgabe an ist', () => {
    const warnings = checkWriting(sheet([task({ skill: 'writing', brief: brief() })]), meta({ wordLimit: true }))
    expect(warnings.some((w) => w.message.includes('keine Wortzahl'))).toBe(true)
    const withCount = task({ skill: 'writing', brief: brief(), instruction: `${task().instruction} Write about 120 words.` })
    expect(checkWriting(sheet([withCount]), meta({ wordLimit: true }))).toEqual([])
  })
})

describe('Hörverstehen', () => {
  const listeningTask = (kind: AnswerKind = 'multipleChoice'): TaskBlock =>
    task({ skill: 'listening', answer: emptyAnswer(kind), instruction: 'Tick the correct answer.' })

  it('nimmt Hörtext mit passender Aufgabe an', () => {
    expect(checkListening(sheet([audio(), listeningTask()]))).toEqual([])
  })

  it('meldet fehlendes Skript und zu wenige Durchgänge', () => {
    const warnings = checkListening(sheet([audio({ transcript: 'zu kurz', plays: 1 }), listeningTask()]))
    const message = warnings.map((w) => w.message).join(' ')
    expect(message).toContain('Skript')
    expect(message).toContain('zweimal')
  })

  it('meldet Schreibaufgaben während des Hörens', () => {
    const warnings = checkListening(sheet([audio(), listeningTask('lines')]))
    expect(warnings.some((w) => w.message.includes('ankreuzen'))).toBe(true)
  })

  it('meldet einen Hörtext ohne Aufgabe', () => {
    expect(checkListening(sheet([audio()])).some((w) => w.message.includes('keine Aufgabe'))).toBe(true)
  })
})

describe('Skript-Auswertung', () => {
  it('trennt Sprecherzeilen und erkennt die Namen', () => {
    const block = audio({ transcript: 'Anna: Hello, where are you going?\nBen: To the station.\nIt is over there.\nAnna: Thanks!' })
    const turns = scriptTurns(block)
    expect(turns).toHaveLength(3)
    expect(turns[1]).toEqual({ name: 'Ben', text: 'To the station. It is over there.' })
    expect(speakerNames(block)).toEqual(['Anna', 'Ben'])
  })
})

describe('Schwerpunkt Sprachmittlung / Schreiben: nur Text und eine Aufgabe', () => {
  it('nimmt Ausgangstext plus eine Aufgabe an', () => {
    const only = sheet([germanText(), task({ skill: 'mediation', brief: brief() })])
    expect(checkSkillFocus(only, meta({ skillFocus: 'mediation' }))).toEqual([])
  })

  it('meldet zusätzliche Bausteine', () => {
    const withExtras = sheet([
      { id: 'g', type: 'learningGoals', title: 'Das lernst du', goals: ['Ich kann …'] },
      germanText(),
      task({ skill: 'mediation', brief: brief() }),
      { id: 'w', type: 'scaffold', variant: 'wortspeicher', title: 'Wortspeicher', items: ['deposit'] }
    ])
    const warnings = checkSkillFocus(withExtras, meta({ skillFocus: 'mediation' }))
    const message = warnings.map((w) => w.message).join(' ')
    expect(message).toContain('learningGoals')
    expect(message).toContain('scaffold')
  })

  it('meldet eine zweite Aufgabe und Teilaufgaben', () => {
    const two = sheet([germanText(), task({ skill: 'mediation', brief: brief() }), task({ instruction: 'Sammle Wortschatz.' })])
    expect(checkSkillFocus(two, meta({ skillFocus: 'mediation' })).some((w) => w.message.includes('2 Aufgaben'))).toBe(true)
    const parts = [{ id: 'p', instruction: 'Schritt', answer: emptyAnswer('lines'), solution: 'x' }]
    const split = sheet([task({ skill: 'writing', brief: brief(), parts })])
    expect(checkSkillFocus(split, meta({ skillFocus: 'writing' })).some((w) => w.message.includes('Teilaufgaben'))).toBe(true)
  })

  it('lässt beim Schreiben eine einzelne Aufgabe ohne Text zu', () => {
    expect(checkSkillFocus(sheet([task({ skill: 'writing', brief: brief() })]), meta({ skillFocus: 'writing' }))).toEqual([])
  })

  it('greift nicht beim gemischten Schwerpunkt', () => {
    const many = sheet([germanText(), task(), task(), { id: 's', type: 'selfCheck', title: 'Das kann ich', statements: ['…'], format: 'smileys' }])
    expect(checkSkillFocus(many, meta({ skillFocus: 'mixed' }))).toEqual([])
  })
})

describe('Zahl der Aufgaben', () => {
  const profile = buildLearnerProfile({
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    schoolTypeName: 'Gymnasium',
    grade: 9,
    courseLevel: 'mixed',
    subjectId: 'englisch',
    subjectLabel: 'Englisch',
    languageMode: 'standard',
    cefrLevel: 'B1'
  })

  it('lässt eine einzelne Sprachmittlungsaufgabe als ganzes Blatt zu', () => {
    const only = sheet([germanText(), task({ skill: 'mediation', brief: brief() })])
    expect(checkTaskMix(only)).toEqual([])
    // Das eigene Schreibprodukt gilt als Ergebnissicherung
    expect(checkClosure(only)).toEqual([])
    expect(checkTaskCount(only, meta({ pages: 1 }), profile)).toEqual([])
  })

  it('meldet eine zweite Sprachmittlungs- oder Schreibaufgabe', () => {
    const doubled = sheet([germanText(), task({ skill: 'mediation', brief: brief() }), germanText(), task({ skill: 'mediation', brief: brief() })])
    expect(checkTaskCount(doubled, meta({ pages: 1 }), profile).some((w) => w.message.includes('eine genügt'))).toBe(true)
    const writing = sheet([task({ skill: 'writing', brief: brief() }), task({ skill: 'writing', brief: brief() })])
    expect(checkTaskCount(writing, meta({ pages: 1 }), profile).some((w) => w.message.includes('Schreibaufgaben'))).toBe(true)
  })

  it('meldet ein kleinschrittiges Blatt auf normalem Niveau', () => {
    const many = sheet(Array.from({ length: 9 }, () => task()))
    expect(checkTaskCount(many, meta({ pages: 1 }), profile).some((w) => w.message.includes('kleinschrittig'))).toBe(true)
  })

  it('erlaubt Kleinschrittigkeit auf der Stufe ★', () => {
    const many: Sheet = { ...sheet(Array.from({ length: 9 }, () => task())), stars: 1 }
    expect(checkTaskCount(many, meta({ pages: 1 }), profile)).toEqual([])
  })

  it('meldet zu viele Teilaufgaben', () => {
    const parts = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, instruction: 'Schritt', answer: emptyAnswer('lines'), solution: 'x' }))
    const withParts = sheet([task({ parts })])
    expect(checkTaskCount(withParts, meta({ pages: 1 }), profile).some((w) => w.message.includes('Teilaufgaben'))).toBe(true)
  })
})

describe('Schwerpunkt Vokabeln', () => {
  it('steht in den Fremdsprachen, in DaZ und in Deutsch zur Wahl', () => {
    expect(skillFocusOptions('englisch').map((f) => f.value)).toContain('vocabulary')
    expect(skillFocusOptions('daz').map((f) => f.value)).toContain('vocabulary')
    expect(skillFocusOptions('deutsch').map((f) => f.value)).toContain('vocabulary')
    // In DaZ gibt es keine Sprachmittlung
    expect(skillFocusOptions('daz').map((f) => f.value)).not.toContain('mediation')
    // In Sachfächern nicht
    expect(skillFocusOptions('biologie').map((f) => f.value)).toEqual(['mixed'])
  })

  it('gibt die belegten Regeln der Wortschatzarbeit an die KI weiter', () => {
    const meta = { ...vocabMeta(), skillFocus: 'vocabulary' as const, vocabWork: 'practise' as const }
    const rules = vocabWorkRules(meta)
    expect(rules).toContain('SCHWERPUNKT VOKABELN')
    expect(rules).toContain('Kollokationen')
    // Kein Abruf, wenn Wort und Bedeutung zugleich zu sehen sind
    expect(rules).toContain('NIE zugleich sichtbar')
    // Geschlossene Reihen und Synonympaare stören einander
    expect(rules).toContain('Synonym- oder Antonympaare')
    expect(rules).toContain('wiederholt Wörter aus früheren Stunden')
  })

  it('richtet die Zahl der Zielwörter nach Jahrgang und Fach', () => {
    expect(targetWordCount({ ...vocabMeta(), grade: 5 })).toEqual({ min: 8, max: 10, own: false })
    expect(targetWordCount({ ...vocabMeta(), grade: 8 })).toEqual({ min: 10, max: 12, own: false })
    expect(targetWordCount({ ...vocabMeta(), grade: 10 })).toEqual({ min: 12, max: 15, own: false })
    expect(targetWordCount({ ...vocabMeta(), subjectId: 'daz' })).toEqual({ min: 6, max: 10, own: false })
  })

  it('lässt eine eigene Obergrenze zu, wenn die Lehrkraft mehr Wörter will', () => {
    // Mit eigener Höchstzahl gilt diese – auch weit über der Empfehlung
    expect(targetWordCount({ ...vocabMeta(), grade: 5, vocabMaxWords: 30 })).toEqual({ min: 8, max: 30, own: true })
    // Die Regeln geben dann die eigene Zahl an die KI weiter
    const many = Array.from({ length: 30 }, (_, i) => `word${i}`).join(', ')
    const rules = vocabWorkRules({ ...vocabMeta(), grade: 5, skillFocus: 'vocabulary', vocabWords: many, vocabMaxWords: 30 })
    expect(rules).toContain('8 bis 30 Zielwörter')
    expect(rules).toContain('müssen alle vorkommen')
  })

  it('lässt aus zu vielen Zielwörtern die passendsten auswählen', () => {
    const many = Array.from({ length: 70 }, (_, i) => `word${i}`).join(', ')
    const rules = vocabWorkRules({ ...vocabMeta(), grade: 5, skillFocus: 'vocabulary', vocabWords: many })
    // Klasse 5: 8–10 Wörter; die Liste darf nicht komplett aufs Blatt
    expect(rules).toContain('8 bis 10 Wörter aus – NICHT alle 70')
    expect(rules).toContain('gemischte Wortarten')
    // Passt die Menge, müssen alle vorkommen
    const few = vocabWorkRules({ ...vocabMeta(), grade: 5, skillFocus: 'vocabulary', vocabWords: 'library, to borrow, fine' })
    expect(few).toContain('müssen alle vorkommen')
  })

  it('übernimmt vorgegebene Zielwörter und die DaZ-Vorgaben', () => {
    const rules = vocabWorkRules({ ...vocabMeta(), subjectId: 'daz', skillFocus: 'vocabulary', vocabWords: 'der Zirkel, das Lineal' })
    expect(rules).toContain('der Zirkel, das Lineal')
    expect(rules).toContain('Artikel')
    expect(rules).toContain('Pluralform')
    // Ohne Schwerpunkt bleiben die Regeln leer
    expect(vocabWorkRules({ ...vocabMeta(), skillFocus: 'mixed' })).toBe('')
  })
})

describe('Auswahl der Zielwörter', () => {
  const candidates = [
    { term: 'the library', translation: 'Bibliothek', pos: 'noun' },
    { term: 'to borrow', translation: 'ausleihen', pos: 'verb' },
    { term: 'quiet', translation: 'leise', pos: 'adjective' },
    { term: 'the shelf', translation: 'Regal', pos: 'noun' },
    { term: 'to return', translation: 'zurückgeben', pos: 'verb' },
    { term: 'What a pity!', translation: 'Wie schade!', pos: 'phrase' },
    { term: 'and', translation: 'und', pos: 'conjunction' },
    { term: 'the fine', translation: 'Gebühr', pos: 'noun' }
  ]

  it('mischt die Wortarten und stellt Wendungen und Funktionswörter hinten an', () => {
    const picked = pickVocabWords(candidates, 4)
    expect(picked).toHaveLength(4)
    // Aus jeder großen Wortart mindestens eines, keine Wendung und kein Funktionswort
    expect(picked).toContain('the library')
    expect(picked).toContain('to borrow')
    expect(picked).toContain('quiet')
    expect(picked).not.toContain('and')
    expect(picked).not.toContain('What a pity!')
    // Die Reihenfolge der Vorlage bleibt erhalten
    expect(picked).toEqual(candidates.filter((c) => picked.includes(c.term)).map((c) => c.term))
  })

  it('nimmt den Vorschlag der KI nur mit Wörtern aus der Liste', async () => {
    const meta = { ...vocabMeta(), grade: 5, skillFocus: 'vocabulary' as const }
    const ai = async <T>(): Promise<T> =>
      ({ terms: ['to borrow', 'the library', 'erfunden', 'quiet', 'the shelf', 'to return', 'the fine', 'and'], reason: 'passt zum Thema' }) as T
    const result = await suggestVocabWords(candidates, meta, ai as never)
    expect(result.terms).not.toContain('erfunden')
    expect(result.terms.length).toBeLessThanOrEqual(10)
    expect(result.reason).toBe('passt zum Thema')
  })

  it('fällt bei einer unbrauchbaren KI-Antwort auf die Regelauswahl zurück', async () => {
    const meta = { ...vocabMeta(), grade: 5, skillFocus: 'vocabulary' as const }
    const ai = async <T>(): Promise<T> => ({ terms: ['gibt es nicht'], reason: '' }) as T
    const result = await suggestVocabWords(candidates, meta, ai as never)
    expect(result.terms.length).toBeGreaterThanOrEqual(4)
    expect(result.terms.every((t) => candidates.some((c) => c.term === t))).toBe(true)
  })
})

describe('Situation genau einmal', () => {
  /*
   * Gemeldet von der Lehrkraft (24.09.2026) zu einer Sprachmittlungsaufgabe: Auf dem Blatt
   * standen zwei Abschnitte, die beide dieselbe Lage erzählten – einmal als Vorspann, einmal
   * als Arbeitsanweisung. „diese beiden abschnitte muessen sinnvoll und nicht ueberfrachtet
   * gebuendelt werden."
   *
   * Die Ursache waren zwei Regeln, die dasselbe an zwei Stellen verlangten. Auf dem Blatt
   * liest sich das wie zwei Aufgaben, und die Lernenden suchen den Unterschied.
   */
  const LAGE =
    'You are a member of your school website editorial team. Your British partner school is preparing a Shakespeare festival and wants to learn how German theatre can reinterpret Macbeth.'

  it('meldet nichts, wenn die Arbeitsanweisung nur den Auftrag nennt', () => {
    const t = task({
      skill: 'mediation',
      brief: brief({ situation: LAGE }),
      instruction: 'Write an article for your school website presenting the Hohenbrueck production and its relevance for young audiences.'
    })
    const warnings = checkMediation(sheet([germanText(), t]), meta())
    expect(warnings.map((w) => w.message).join(' ')).not.toContain('zweimal')
  })

  it('meldet die doppelte Situierung', () => {
    const t = task({
      skill: 'mediation',
      brief: brief({ situation: LAGE }),
      // Die Arbeitsanweisung erzaehlt die Lage noch einmal – genau der gemeldete Fall
      instruction: `${LAGE} Write an article for your school website based on the German background text above.`
    })
    const warnings = checkMediation(sheet([germanText(), t]), meta())
    expect(warnings.map((w) => w.message).join(' ')).toContain('Die Situation steht zweimal')
  })

  it('verlangt die Situation weiterhin – nur an einer Stelle', () => {
    /*
     * Beides zu fordern hatte die Doppelung erst erzeugt. Fehlt sie aber ganz, ist die
     * Aufgabe ein nackter Operator – und genau das soll die Prüfung verhindern.
     */
    const ohne = task({ skill: 'mediation', brief: brief({ situation: '' }), instruction: 'Write an article.' })
    const warnings = checkMediation(sheet([germanText(), ohne]), meta())
    expect(warnings.map((w) => w.message).join(' ')).toContain('nicht in eine Situation eingebettet')
  })

  it('nimmt einen kurzen Rückgriff auf die Situation hin', () => {
    // „In your article …" ist erwuenscht: Es verbindet Auftrag und Lage, ohne sie zu wiederholen
    const t = task({
      skill: 'mediation',
      brief: brief({ situation: LAGE }),
      instruction: 'In your article for the school website, present the production and explain why it matters to young audiences.'
    })
    const warnings = checkMediation(sheet([germanText(), t]), meta())
    expect(warnings.map((w) => w.message).join(' ')).not.toContain('zweimal')
  })

  it('misst die Doppelung an gemeinsamen Wortfolgen', () => {
    expect(doppeltSituiert(LAGE, LAGE)).toBeGreaterThan(0.9)
    expect(doppeltSituiert(LAGE, 'Write an article about the production.')).toBe(0)
  })
})

describe('Musterlösungen stehen in der Zielsprache', () => {
  /*
   * Gemeldet am 25.09.2026: „die ausformulierte musterlösung der aufgabe [wurde] auf Deutsch
   * verfasst, obwohl die Aufgabe Englisch erfordert."
   *
   * Beim Korrigieren vergleicht die Lehrkraft eine englische Abgabe mit dem Mustertext. Steht
   * der auf Deutsch, taugt er weder für die Wortwahl noch für den Satzbau.
   */
  const englischerText =
    'Dear Sam, I am writing to tell you about our exchange programme because you asked me about the costs and the dates of the visit. ' +
    'The trip will take place in July and the price is about two hundred euros, which includes the travel and the accommodation. ' +
    'I hope that this information helps you and that we will see each other soon in Leeds.'
  const deutscherText =
    'Liebe Sam, ich schreibe dir, weil du mich nach den Kosten und den Terminen für den Austausch gefragt hast. ' +
    'Die Fahrt findet im Juli statt und der Preis liegt bei etwa zweihundert Euro, in denen die Reise und die Unterkunft enthalten sind. ' +
    'Ich hoffe, dass dir diese Angaben helfen und dass wir uns bald in Leeds sehen.'

  it('erkennt einen deutschen Mustertext auf einem englischen Blatt', () => {
    expect(inFalscherSprache(deutscherText, 'en')).toBe(true)
  })

  it('lässt den zielsprachlichen Mustertext in Ruhe', () => {
    expect(inFalscherSprache(englischerText, 'en')).toBe(false)
  })

  it('urteilt nicht über zu kurze Texte', () => {
    // Eine Überschrift oder ein Halbsatz sagt nichts über die Sprache des Textes
    expect(inFalscherSprache('Dear Sam, see you soon!', 'en')).toBe(false)
    expect(inFalscherSprache('Liebe Grüße aus Bremen', 'en')).toBe(false)
  })

  it('meldet den deutschen Mustertext einer Schreibaufgabe', () => {
    const blatt: Sheet = { id: 's', label: 'Blatt', blocks: [task({ skill: 'writing', brief: brief({ model: deutscherText }) })] }
    const warnungen = checkWriting(blatt, meta())
    expect(warnungen.some((w) => w.message.includes('Mustertext steht auf Deutsch'))).toBe(true)
  })

  it('meldet nichts, wenn der Mustertext englisch ist', () => {
    const blatt: Sheet = { id: 's', label: 'Blatt', blocks: [task({ skill: 'writing', brief: brief({ model: englischerText }) })] }
    expect(checkWriting(blatt, meta()).some((w) => w.message.includes('steht auf Deutsch'))).toBe(false)
  })

  it('meldet den deutschen Mustertext einer Sprachmittlung', () => {
    const blatt: Sheet = {
      id: 's',
      label: 'Blatt',
      blocks: [germanText(), task({ skill: 'mediation', brief: brief({ model: deutscherText }) })]
    }
    expect(checkMediation(blatt, meta()).some((w) => w.message.includes('Mustertext steht auf Deutsch'))).toBe(true)
  })

  it('gilt nicht für Fächer ohne Zielsprache', () => {
    // In Geschichte oder Deutsch ist ein deutscher Mustertext genau richtig
    expect(inFalscherSprache(deutscherText, 'de')).toBe(false)
  })
})
