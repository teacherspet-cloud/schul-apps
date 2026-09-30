/**
 * Ergänzte Grammatikthemen (30.09.2026, Wunsch der Lehrkraft: „Recherchiere zu weiteren
 * Grammatikformen für jedes Fach (z. B. emphatic forms für Englisch) und füge diese zu geeigneten
 * Jahrgängen und Niveaustufen hinzu.").
 *
 * Geprüft wird, dass die neuen Themen in Themenwahl, Niveau-Filter, Vokabeltest-Vorwissen und
 * Klassenarbeit-Schreibgrammatik richtig eingeordnet werden – z. B. emphatic do nicht in Klasse 5.
 */
import { describe, expect, it } from 'vitest'
import {
  defaultSequence,
  einfuehrungsNiveau,
  GRAMMAR_FORMATS,
  GRAMMAR_TOPICS,
  grammarTopicsFor,
  hasGrammar,
  learningYear,
  needsSequence,
  topicStart,
  ueberNiveau
} from '../src/renderer/src/modules/arbeitsblatt/didactics/grammar'
import { ERGAENZTE_GRAMMATIKTHEMEN } from '../src/renderer/src/modules/arbeitsblatt/didactics/grammarTopicsErgaenzung'
import { formVorwissen } from '../src/renderer/src/modules/vokabeltest/didactics/formVorwissen'
import { hinweise, strukturenFuer } from '../src/renderer/src/modules/klassenarbeit/didactics/schreibGrammatik'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import { fachDerArbeit, type ExamSubjectId } from '../src/renderer/src/modules/klassenarbeit/model/faecher'
import { newTest } from '../src/renderer/src/modules/grammatiktest/model/defaults'
import { testPrompt } from '../src/renderer/src/modules/grammatiktest/generation/generateTest'
import type { Exam } from '../src/renderer/src/modules/klassenarbeit/model/types'
import type { TestSettings } from '../src/renderer/src/modules/vokabeltest/model/types'
import type { GrammarTest, GrammarTestMeta } from '../src/renderer/src/modules/grammatiktest/model/types'

const NI = { stateId: 'NI', schoolTypeId: 'gymnasium' }
const ids = (q: Parameters<typeof grammarTopicsFor>[0]): string[] => grammarTopicsFor(q).map((t) => t.id)
const PRAEFIX: Record<string, string> = {
  englisch: 'en.',
  franzoesisch: 'fr.',
  spanisch: 'es.',
  italienisch: 'it.',
  russisch: 'ru.',
  griechisch: 'gr.',
  latein: 'la.',
  deutsch: 'de.',
  niederlaendisch: 'nl.',
  polnisch: 'pl.',
  tschechisch: 'cs.',
  portugiesisch: 'pt.',
  tuerkisch: 'tr.',
  chinesisch: 'zh.'
}

describe('Datenformat der ergänzten Themen', () => {
  it('sind Teil der Tabelle, ohne doppelte Kennungen', () => {
    expect(ERGAENZTE_GRAMMATIKTHEMEN.length).toBeGreaterThan(150)
    for (const t of ERGAENZTE_GRAMMATIKTHEMEN) expect(GRAMMAR_TOPICS).toContain(t)
    const alle = GRAMMAR_TOPICS.map((t) => t.id)
    expect(new Set(alle).size).toBe(alle.length)
  })

  it('jedes Thema: passende Kennung, Stufe, Niveau, bekannte Formate, Beschreibung, Beispiele, Beleg', () => {
    const formate = new Set(GRAMMAR_FORMATS.map((f) => f.id))
    for (const t of ERGAENZTE_GRAMMATIKTHEMEN) {
      expect(t.id.startsWith(PRAEFIX[t.subject] ?? '?'), t.id).toBe(true)
      expect(t.to, t.id).toBeGreaterThanOrEqual(t.from)
      expect(t.stage.trim(), t.id).not.toBe('')
      expect(t.level.trim(), t.id).not.toBe('')
      expect(t.formats.length, t.id).toBeGreaterThan(0)
      for (const f of t.formats) expect(formate.has(f), `${t.id}: ${f}`).toBe(true)
      expect(t.description?.trim(), t.id).toBeTruthy()
      expect(t.examples?.length, t.id).toBeGreaterThan(0)
      expect(t.source?.trim(), t.id).toBeTruthy()
      // Fremdsprachen mit GER tragen ein lesbares Niveau
      if (!['latein', 'griechisch', 'deutsch'].includes(t.subject)) expect(einfuehrungsNiveau(t.level), t.id).not.toBeNull()
      if (t.subject === 'deutsch') expect(t.scale).toBe('jahrgang')
      else expect(t.scale).toBe('lernjahr')
    }
  })

  it('jede Sprache bekommt neue Themen', () => {
    for (const fach of Object.keys(PRAEFIX))
      expect(
        ERGAENZTE_GRAMMATIKTHEMEN.some((t) => t.subject === fach),
        fach
      ).toBe(true)
  })
})

describe('Englisch: emphatic forms und weitere Strukturen am richtigen Ort', () => {
  it('emphatic do erst ab Lernjahr 5 (BY Gym Kl. 9) – nicht in Klasse 5 bis 7', () => {
    for (const grade of [5, 6, 7]) {
      expect(ids({ subjectId: 'englisch', grade, ...NI, sequence: 'fs1' }), `Kl. ${grade}`).not.toContain('en.focus.emphatic_do')
      expect(ids({ subjectId: 'englisch', grade, ...NI, sequence: 'fs1', cefrLevel: 'A2' }), `Kl. ${grade}`).not.toContain('en.focus.emphatic_do')
    }
    expect(ids({ subjectId: 'englisch', grade: 9, ...NI, sequence: 'fs1', cefrLevel: 'B1' })).toContain('en.focus.emphatic_do')
  })

  it('Spaltsätze ab Lernjahr 4–5 (Vorgriff), Inversion nur zum Erkennen und erst in der Oberstufe', () => {
    expect(ids({ subjectId: 'englisch', grade: 7, ...NI, sequence: 'fs1' })).not.toContain('en.focus.cleft')
    expect(ids({ subjectId: 'englisch', grade: 9, ...NI, sequence: 'fs1', cefrLevel: 'B1+' })).toContain('en.focus.cleft')
    const inversion = GRAMMAR_TOPICS.find((t) => t.id === 'en.focus.inversion')!
    expect(inversion.receptive).toBe(true)
    expect(ids({ subjectId: 'englisch', grade: 9, ...NI, sequence: 'fs1' })).not.toContain('en.focus.inversion')
    expect(ids({ subjectId: 'englisch', grade: 11, ...NI, sequence: 'fs1', cefrLevel: 'B2' })).toContain('en.focus.inversion')
  })

  it('der Niveau-Filter hält B2-Strukturen aus Klasse 8 mit A2+ heraus', () => {
    const k8 = grammarTopicsFor({ subjectId: 'englisch', grade: 8, ...NI, sequence: 'fs1', cefrLevel: 'A2+' })
    for (const id of ['en.cond.wish', 'en.verb.causative', 'en.verb.modal_perfect', 'en.focus.cleft']) expect(k8.map((t) => t.id)).not.toContain(id)
    expect(k8.filter((t) => ueberNiveau(t, 'A2+'))).toEqual([])
  })

  it('Klasse 7: -ed/-ing-Adjektive sind dran, used to kommt bald; verstärkende Pronomen (B1) wie die Reflexivpronomen erst ab A2+', () => {
    const k7 = ids({ subjectId: 'englisch', grade: 7, ...NI, sequence: 'fs1', cefrLevel: 'A2' })
    expect(k7).toEqual(expect.arrayContaining(['en.adj.ed_ing', 'en.verb.used_to']))
    expect(k7).not.toContain('en.pron.emphatic')
    expect(ids({ subjectId: 'englisch', grade: 7, ...NI, sequence: 'fs1', cefrLevel: 'A2+' })).toEqual(
      expect.arrayContaining(['en.pron.emphatic', 'en.pron.reflexive'])
    )
  })
})

describe('Neue Fächer: Italienisch, Russisch, Griechisch', () => {
  it('haben Grammatik und brauchen die Fremdsprachenfolge; Griechisch ist ab Kl. 8 die 3. Fremdsprache', () => {
    for (const f of ['italienisch', 'russisch', 'griechisch']) {
      expect(hasGrammar(f), f).toBe(true)
      expect(needsSequence(f), f).toBe(true)
    }
    expect(defaultSequence('griechisch', 8)).toBe('fs3')
    expect(learningYear(8, defaultSequence('griechisch', 8), 'BY')).toBe(1)
  })

  it('Italienisch 3. FS: Kl. 8 Präsens und passato prossimo, congiuntivo imperfetto erst Kl. 10', () => {
    const k8 = ids({ subjectId: 'italienisch', grade: 8, ...NI, sequence: 'fs3', cefrLevel: 'A1' })
    expect(k8).toEqual(expect.arrayContaining(['it.verb.presente', 'it.nom.articolo']))
    expect(k8).not.toContain('it.verb.congiuntivo_imperfetto')
    const k10 = ids({ subjectId: 'italienisch', grade: 10, ...NI, sequence: 'fs3', cefrLevel: 'B1' })
    expect(k10).toEqual(expect.arrayContaining(['it.verb.congiuntivo_imperfetto', 'it.cond.periodo_2_3']))
    // Lehrplanjahr der 3. FS (BY Kl. 10 = Lernjahr 3) ergibt sich aus der Halbierung
    expect(topicStart(GRAMMAR_TOPICS.find((t) => t.id === 'it.verb.passivo')!, 'fs3')).toBe(3)
  })

  it('Russisch 3. FS: Aspekt im 2. Lernjahr, Partizipien nur zum Erkennen in der Oberstufe', () => {
    expect(ids({ subjectId: 'russisch', grade: 8, ...NI, sequence: 'fs3' })).not.toContain('ru.verb.partizipien')
    expect(ids({ subjectId: 'russisch', grade: 9, ...NI, sequence: 'fs3', cefrLevel: 'A2' })).toContain('ru.verb.aspekt')
    expect(GRAMMAR_TOPICS.find((t) => t.id === 'ru.verb.partizipien')?.receptive).toBe(true)
  })

  it('Griechisch: Kl. 8 Präsens/Imperfekt und Partizipien, μι-Verben erst Kl. 10', () => {
    const k8 = ids({ subjectId: 'griechisch', grade: 8, ...NI, sequence: defaultSequence('griechisch', 8) })
    expect(k8).toEqual(expect.arrayContaining(['gr.form.praesens_impf', 'gr.form.partizip']))
    expect(k8).not.toContain('gr.form.mi_verben')
    expect(ids({ subjectId: 'griechisch', grade: 10, ...NI, sequence: 'fs3' })).toContain('gr.form.mi_verben')
  })
})

const vt = (over: Partial<TestSettings> = {}): TestSettings =>
  ({
    targetLanguage: 'en',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    languageOrder: 1,
    grade: 5,
    level: 'A1',
    vocabCount: 10,
    variantCount: 1,
    variantMode: 'sameVocab',
    tasks: [],
    topic: '',
    pictureSource: 'none',
    answerKey: true,
    seed: 1,
    ...over
  } as TestSettings)

describe('Vokabeltest: Vorwissen bei Wortformen', () => {
  it('Englisch Klasse 5: used to und modal perfect noch nicht', () => {
    const v = formVorwissen(vt())
    expect(v.nochNicht.join(' | ')).toMatch(/used to \+ infinitive/)
    expect(v.nochNicht.join(' | ')).toMatch(/modal perfect/)
    expect(v.bekannt.join(' | ')).not.toMatch(/used to/)
  })

  it('Satzbau-Themen (Hervorhebung, Inversion) sind keine Wortformen', () => {
    const v = formVorwissen(vt({ grade: 10, level: 'B1+' }))
    const alle = [...v.bekannt, ...v.vielleicht, ...v.nochNicht].join(' | ')
    expect(alle).not.toMatch(/emphatic do|inversion|cleft/)
  })

  it('Italienisch und Russisch nutzen jetzt die Tabelle statt der Faustregel', () => {
    const it8 = formVorwissen(vt({ targetLanguage: 'it', languageOrder: 3, grade: 8 }))
    expect(it8.quelle).toBe('tabelle')
    expect(it8.nochNicht.join(' | ')).toMatch(/imperfetto/)
    expect(it8.vergangenheit).toBe(false)
    expect(formVorwissen(vt({ targetLanguage: 'it', languageOrder: 3, grade: 10, level: 'B1' })).vergangenheit).toBe(true)
    const ru = formVorwissen(vt({ targetLanguage: 'ru', languageOrder: 2, grade: 7, stateId: 'BY' }))
    expect(ru.quelle).toBe('tabelle')
    expect(ru.nochNicht.join(' | ')).toMatch(/Verbalaspekt/)
  })
})

const arbeit = (subjectId: ExamSubjectId, over: Partial<Exam['meta']> = {}): Exam['meta'] =>
  ({
    ...defaultExamMeta('NW', 'gymnasium', 'Gymnasium'),
    subjectId,
    subjectLabel: fachDerArbeit(subjectId).label,
    topic: 'Thema',
    grade: 8,
    ...over
  } as Exam['meta'])

describe('Klassenarbeit: Grammatik in Schreibaufgaben', () => {
  it('emphatic do nicht in Klasse 5, aber in Klasse 9 (auch als „bald" in Klasse 8)', () => {
    expect(strukturenFuer(arbeit('englisch', { grade: 5, languageOrder: 1 })).map((x) => x.topic.id)).not.toContain('en.focus.emphatic_do')
    const k9 = strukturenFuer(arbeit('englisch', { grade: 9, languageOrder: 1 }))
    expect(k9.find((x) => x.topic.id === 'en.focus.emphatic_do')?.eingefuehrt).toBe(true)
    // Inversion ist zunächst nur rezeptiv – keine Vorgabe für das Schreiben
    expect(k9.map((x) => x.topic.id)).not.toContain('en.focus.inversion')
  })

  it('warnt, wenn eine geforderte Struktur erst später eingeführt wird', () => {
    const h = hinweise(arbeit('englisch', { grade: 6, languageOrder: 1 }), {
      themen: ['en.focus.emphatic_do'],
      modus: 'anzahl',
      anzahl: 2,
      bewertung: 'kriterium'
    })
    expect(h.some((x) => x.warnung && /Hervorhebung mit do/.test(x.text))).toBe(true)
  })

  it('Italienisch als 3. FS: Lernjahr über die gestraffte Progression – passato prossimo in Kl. 8 eingeführt', () => {
    const liste = strukturenFuer(arbeit('italienisch', { grade: 8, languageOrder: 3, stateId: 'BY' }))
    expect(liste.find((x) => x.topic.id === 'it.verb.passato_prossimo')?.eingefuehrt).toBe(true)
    expect(liste.map((x) => x.topic.id)).not.toContain('it.verb.congiuntivo_imperfetto')
  })
})

describe('Grammatiktest: Beschreibung und Beispiele im KI-Auftrag', () => {
  it('nennt Beispiele der gewählten ergänzten Form', () => {
    const t = newTest({ id: 'd', name: 'Standard', header: {}, page: {}, tasks: {} } as never, 'NI', 'gymnasium', 'Gymnasium')
    const meta: GrammarTestMeta = { ...t.meta, subjectId: 'englisch', subjectLabel: 'Englisch', grade: 9, topics: ['en.focus.emphatic_do'] }
    const prompt = testPrompt({ ...t, meta } as GrammarTest)
    expect(prompt).toMatch(/Hervorhebung mit do: .*Beispiele: I do understand your problem\./)
  })
})
