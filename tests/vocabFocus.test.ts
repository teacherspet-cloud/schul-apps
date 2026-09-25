import { describe, expect, it } from 'vitest'
import { VOCAB_WORK, vocabFocusRules, vocabWorkRules } from '../src/renderer/src/modules/arbeitsblatt/didactics/vocabWork'
import { systemPrompt } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { profileFromMeta } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { knownVocabRulesDe, STRICT_UP_TO_GRADE } from '../src/renderer/src/shared/knownVocab'
import type { KnownVocab } from '../src/renderer/src/shared/knownVocab'
import type { WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  grade: 6,
  ...patch
})

const known = (patch: Partial<KnownVocab> = {}): KnownVocab => ({
  words: ['school', 'friend', 'to play'],
  total: 320,
  strict: true,
  source: 'Green Line 1–2 bis Unit 3',
  ...patch
})

describe('Vorrangvokabeln', () => {
  it('bleibt stumm, wenn keine Wörter gewählt sind', () => {
    expect(vocabFocusRules(meta())).toBe('')
    expect(vocabFocusRules(meta({ vocabWords: '   ' }))).toBe('')
  })

  it('bleibt stumm beim Schwerpunkt „Vokabeln" – dort gilt die ausführliche Anlage', () => {
    // Sonst stünden zwei Regelwerke zum selben Wortschatz nebeneinander
    expect(vocabFocusRules(meta({ skillFocus: 'vocabulary', vocabWords: 'library, to borrow' }))).toBe('')
  })

  it('nennt die Wörter und ihre Zahl', () => {
    const rules = vocabFocusRules(meta({ vocabWords: 'library, to borrow, due date' }))
    expect(rules).toMatch(/VORRANGVOKABELN \(3\)/)
    expect(rules).toMatch(/library/)
    expect(rules).toMatch(/due date/)
  })

  it('trennt eine getippte Liste an Komma und Semikolon', () => {
    expect(vocabFocusRules(meta({ vocabWords: 'one, two; three' }))).toMatch(/VORRANGVOKABELN \(3\)/)
  })

  it('hält Wendungen mit Komma zusammen, wenn zeilenweise gewählt wurde', () => {
    /*
     * Aus der Auswahl kommen die Wörter zeilenweise. Stünde das Komma weiterhin als Trenner,
     * zerfiele „to look after sb., sth." in zwei Einträge – im ersten Lauf mit zwei Units
     * wurden aus 189 gewählten Wörtern so 193.
     */
    const rules = vocabFocusRules(meta({ vocabWords: 'to look after sb., sth.\nlibrary\nto borrow' }))
    expect(rules).toMatch(/VORRANGVOKABELN \(3\)/)
    expect(rules).toMatch(/to look after sb\., sth\./)
  })

  it('verlangt sie ausdrücklich auch in Hörtexten', () => {
    // Der Hörtext entsteht in einer eigenen Anfrage – ohne diesen Satz käme der Wortschatz
    // genau dort nicht an, wo er am meisten trägt
    expect(vocabFocusRules(meta({ vocabWords: 'library' }))).toMatch(/Hörtexte/)
  })

  it('macht sie vorrangig, nicht verpflichtend', () => {
    const rules = vocabFocusRules(meta({ vocabWords: 'library' }))
    expect(rules).toMatch(/VORRANGIG, nicht verpflichtend/)
    expect(rules).toMatch(/Erzwinge kein Wort/)
  })

  it('gibt den gewählten Umgang mit den Wörtern weiter', () => {
    expect(vocabFocusRules(meta({ vocabWords: 'library', vocabWork: 'revise' }))).toMatch(/Wiederholen/)
    expect(vocabFocusRules(meta({ vocabWords: 'library', vocabWork: 'introduce' }))).toMatch(/einführen/)
  })

  it('erreicht wirklich den Systemauftrag', () => {
    const m = meta({ vocabWords: 'library, to borrow' })
    expect(systemPrompt(m, profileFromMeta(m))).toMatch(/VORRANGVOKABELN/)
  })
})

describe('Die Obergrenze ist die stärkere Regel', () => {
  it('steht im Auftrag NACH den Vorrangvokabeln', () => {
    /*
     * Die Reihenfolge ist Absicht: Ein Vorrangwort rechtfertigt nicht, Wortschatz späterer
     * Bände vorauszusetzen. Stünde die Obergrenze davor, läse sich der Auftrag so, als hebe
     * die spätere Regel sie wieder auf.
     */
    const m = meta({ vocabWords: 'library', knownVocab: known() })
    const prompt = systemPrompt(m, profileFromMeta(m))
    expect(prompt.indexOf('VORRANGVOKABELN')).toBeGreaterThan(-1)
    expect(prompt.indexOf('BEKANNTER WORTSCHATZ')).toBeGreaterThan(prompt.indexOf('VORRANGVOKABELN'))
  })

  it('verbietet in jungen Jahrgängen Wortschatz aus späteren Abschnitten', () => {
    const rules = knownVocabRulesDe(known({ strict: true }))
    expect(rules).toMatch(/nur diesen Wortschatz/)
    expect(rules).toMatch(/formuliere den Satz um/)
  })

  it('ist ab Klasse 8 nur noch eine Orientierung', () => {
    expect(STRICT_UP_TO_GRADE).toBe(7)
    const rules = knownVocabRulesDe(known({ strict: false }))
    expect(rules).toMatch(/möglichst in diesem Wortschatz/)
    expect(rules).not.toMatch(/nur diesen Wortschatz/)
  })

  it('nennt die Quelle, damit die Lehrkraft die Grenze nachvollziehen kann', () => {
    expect(knownVocabRulesDe(known())).toMatch(/Green Line 1–2 bis Unit 3/)
  })
})

describe('Abprüfen', () => {
  it('steht als eigener Umgang zur Wahl', () => {
    const check = VOCAB_WORK.find((v) => v.value === 'check')
    expect(check?.label).toMatch(/Abprüfen/)
    expect(check?.description.length).toBeGreaterThan(10)
  })

  it('nimmt beim Abprüfen die Hilfen weg – sonst misst das Blatt nichts', () => {
    // Geprüft wird der Abruf. Steht die Antwort im Wortkasten, prüft das Blatt das Abschreiben.
    const rules = vocabWorkRules(meta({ skillFocus: 'vocabulary', vocabWork: 'check', vocabWords: 'library, to borrow' }))
    expect(rules).toMatch(/KEINE Hilfen/)
    expect(rules).toMatch(/kein Wortkasten/)
    expect(rules).toMatch(/Selbsteinschätzung/)
  })

  it('vergibt beim Abprüfen keine Punkte – es ist eine Lernzielkontrolle ohne Note', () => {
    const rules = vocabWorkRules(meta({ skillFocus: 'vocabulary', vocabWork: 'check', vocabWords: 'library' }))
    expect(rules).toMatch(/KEINE Punkte/)
  })

  it('gibt den Abprüf-Umgang auch als Vorrangvokabeln weiter', () => {
    expect(vocabFocusRules(meta({ vocabWords: 'library', vocabWork: 'check' }))).toMatch(/Abprüfen/)
  })
})
