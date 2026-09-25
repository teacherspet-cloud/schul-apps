import { describe, expect, it } from 'vitest'
import {
  chosenGrammarTopics,
  defaultSequence,
  findGrammarTopic,
  GRAMMAR_FORMATS,
  GRAMMAR_TOPICS,
  grammarTopicsFor,
  hasGrammar,
  learningYear,
  sequenceOf,
  topicStart
} from '../src/renderer/src/modules/arbeitsblatt/didactics/grammar'
import { grammarRules, skillFocusOptions } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  grade: 7,
  ...patch
})

const ids = (q: Parameters<typeof grammarTopicsFor>[0]): string[] => grammarTopicsFor(q).map((t) => t.id)

describe('Themenliste', () => {
  it('deckt alle Sprachenfächer ab, auch Latein und DaZ', () => {
    for (const s of ['englisch', 'deutsch', 'franzoesisch', 'spanisch', 'latein', 'daz']) {
      expect(
        GRAMMAR_TOPICS.some((t) => t.subject === s),
        s
      ).toBe(true)
      expect(hasGrammar(s), s).toBe(true)
    }
    expect(hasGrammar('biologie')).toBe(false)
  })

  it('führt zu jedem Thema Bezeichnung, Bereich, Stufe und Niveau', () => {
    for (const t of GRAMMAR_TOPICS) {
      expect(t.label.trim(), t.id).not.toBe('')
      expect(t.area.trim(), t.id).not.toBe('')
      expect(t.level.trim(), t.id).not.toBe('')
      expect(t.from, t.id).toBeGreaterThanOrEqual(0)
      expect(t.to, t.id).toBeGreaterThanOrEqual(t.from)
    }
  })

  it('kennt nur Übungsformate, die die App auch benennen kann', () => {
    const known = new Set(GRAMMAR_FORMATS.map((f) => f.id))
    for (const t of GRAMMAR_TOPICS) for (const f of t.formats) expect(known.has(f), `${t.id}: ${f}`).toBe(true)
  })

  it('vergibt keine doppelten Kennungen', () => {
    const all = GRAMMAR_TOPICS.map((t) => t.id)
    expect(new Set(all).size).toBe(all.length)
  })

  it('weist strittige Zuordnungen aus, statt sie zu glätten', () => {
    // Die Quellen widersprechen sich teils um mehrere Lernjahre – das gehört auf den Bildschirm
    const contested = GRAMMAR_TOPICS.filter((t) => t.contested)
    expect(contested.length).toBeGreaterThan(20)
    expect(contested.some((t) => t.to - t.from >= 2)).toBe(true)
  })
})

describe('Lernjahr statt Jahrgang', () => {
  it('rechnet den Jahrgang je nach Fremdsprachenfolge um', () => {
    // Klasse 8 ist in der 2. Fremdsprache das dritte Lernjahr, in der 3. das erste
    expect(learningYear(8, 'fs2')).toBe(3)
    expect(learningYear(8, 'fs3')).toBe(1)
    expect(learningYear(8, 'fs1')).toBe(4)
  })

  it('beachtet, dass die 2. Fremdsprache in Nordrhein-Westfalen später beginnt', () => {
    // BY/BW ab Klasse 6, NRW ab Klasse 7 – dieselbe Klasse, ein Lernjahr Unterschied
    expect(learningYear(8, 'fs2', 'BY')).toBe(3)
    expect(learningYear(8, 'fs2', 'NW')).toBe(2)
  })

  it('liefert nie ein Lernjahr unter 1', () => {
    expect(learningYear(5, 'fs3')).toBe(1)
  })

  it('leitet die Folge aus der Angabe des Blattes ab, statt sie doppelt zu erfragen', () => {
    // Die Stellung der Sprache steht längst in languageOrder und steuert schon den GER-Vorschlag
    expect(sequenceOf({ languageOrder: 1 })).toBe('fs1')
    expect(sequenceOf({ languageOrder: 2 })).toBe('fs2')
    expect(sequenceOf({ languageOrder: 3 })).toBe('fs3')
    // Nur der spät beginnende Fall lässt sich damit nicht ausdrücken
    expect(sequenceOf({ languageOrder: 2, lateStartLanguage: true })).toBe('spaet')
  })

  it('schlägt ohne Angabe eine sinnvolle Folge vor', () => {
    expect(defaultSequence('englisch', 7)).toBe('fs1')
    expect(defaultSequence('franzoesisch', 7)).toBe('fs2')
    expect(defaultSequence('spanisch', 9)).toBe('fs3')
  })

  it('verdichtet die Progression der 3. Fremdsprache', () => {
    // Ein Lernjahr der 3. Fremdsprache entspricht etwa zwei der zweiten
    const topic = GRAMMAR_TOPICS.find((t) => t.subject === 'franzoesisch' && t.from === 4)!
    expect(topicStart(topic, 'fs3')).toBe(2)
    expect(topicStart(topic, 'fs2')).toBe(4)
  })
})

describe('Auswahl für eine Lerngruppe', () => {
  it('schlägt im ersten Lernjahr Englisch die Grundlagen vor, nicht die Vorvergangenheit', () => {
    const kl5 = ids({ subjectId: 'englisch', grade: 5 })
    expect(kl5).toContain('en.verb.present_simple')
    expect(kl5).not.toContain('en.verb.past_perfect')
  })

  it('schlägt in Klasse 9 die anspruchsvolleren Zeiten vor', () => {
    expect(ids({ subjectId: 'englisch', grade: 9 })).toContain('en.verb.past_perfect')
  })

  it('verschiebt die Progression an der Hauptschule nach hinten', () => {
    const gym = ids({ subjectId: 'englisch', grade: 6, schoolTypeId: 'gymnasium' })
    const haupt = ids({ subjectId: 'englisch', grade: 6, schoolTypeId: 'hauptschule' })
    expect(gym.length).toBeGreaterThan(0)
    expect(haupt.length).toBeGreaterThan(0)
    // An der Hauptschule steht später an, was am Gymnasium schon läuft
    expect(haupt).not.toEqual(gym)
  })

  it('nutzt für Deutsch den Jahrgang, nicht das Lernjahr', () => {
    const kl5 = ids({ subjectId: 'deutsch', grade: 5 })
    expect(kl5).toContain('de.wort.wortarten_basis')
    // Die Fremdsprachenfolge darf hier nichts ändern
    expect(ids({ subjectId: 'deutsch', grade: 5, sequence: 'fs3' })).toEqual(kl5)
  })

  it('richtet Spanisch als spät beginnende Fremdsprache nach der eigenen Progression', () => {
    const spaet = grammarTopicsFor({ subjectId: 'spanisch', grade: 11, sequence: 'spaet' })
    expect(spaet.length).toBeGreaterThan(0)
  })
})

describe('DaZ: Sperre statt Sortierung', () => {
  it('zeigt ohne Diagnose alle Themen', () => {
    const alle = ids({ subjectId: 'daz', grade: 7 })
    expect(alle.length).toBe(GRAMMAR_TOPICS.filter((t) => t.subject === 'daz').length)
  })

  it('blendet aus, was mehr als eine Erwerbsstufe über dem Stand liegt', () => {
    // Was nicht verarbeitet werden kann, hilft auch auf einem guten Blatt nicht
    const stufe2 = ids({ subjectId: 'daz', grade: 7, acquisitionStage: 2 })
    expect(stufe2).toContain('daz.syn.inversion') // Stufe 3 – eine darüber, also erlaubt
    expect(stufe2).not.toContain('daz.syn.nebensatz') // Stufe 4 – zwei darüber
    expect(stufe2).not.toContain('daz.syn.partizipialattribut')
  })

  it('gibt bei höherem Stand mehr frei', () => {
    expect(ids({ subjectId: 'daz', grade: 9, acquisitionStage: 3 })).toContain('daz.syn.nebensatz')
  })
})

describe('Thema wiederfinden', () => {
  it('findet über die deutsche und die fremdsprachliche Bezeichnung', () => {
    expect(findGrammarTopic('englisch', 'simple past')?.id).toBe('en.verb.past_simple')
    expect(findGrammarTopic('englisch', 'Einfache Vergangenheit')?.id).toBe('en.verb.past_simple')
    expect(findGrammarTopic('englisch', 'gibt es nicht')).toBeUndefined()
  })

  it('nimmt die gewählten Themen aus dem Blatt', () => {
    const m = meta({ grammarTopics: ['en.verb.past_simple', 'en.verb.present_perfect'] })
    expect(chosenGrammarTopics(m).map((t) => t.id)).toEqual(['en.verb.past_simple', 'en.verb.present_perfect'])
  })

  it('versteht ältere Blätter, die nur einen getippten Namen haben', () => {
    expect(chosenGrammarTopics(meta({ grammarTopic: 'simple past' })).map((t) => t.id)).toEqual(['en.verb.past_simple'])
  })
})

describe('Grammatik-Arbeitsblatt', () => {
  it('bietet den Schwerpunkt nur in den Sprachen an', () => {
    expect(skillFocusOptions('englisch').map((f) => f.value)).toContain('grammar')
    /*
     * Deutsch hat seit dem 23.09.2026 auch Zuhoeren und Lesen: „Verstehend zuhoeren" ist
     * Kernbereich der KMK-Bildungsstandards Deutsch (ESA/MSA 2022) und getestete Domaene in
     * VERA-8. Sprachmittlung gibt es dort weiterhin nicht.
     */
    expect(skillFocusOptions('deutsch').map((f) => f.value)).toEqual(['mixed', 'vocabulary', 'grammar', 'reading', 'listening'])
    expect(skillFocusOptions('geschichte').map((f) => f.value)).toEqual(['mixed'])
  })

  it('schreibt die Regeln nur beim Grammatik-Schwerpunkt', () => {
    expect(grammarRules(meta({ skillFocus: 'mixed' }))).toBe('')
    const rules = grammarRules(meta({ skillFocus: 'grammar', grammarTopics: ['en.verb.past_simple'] }))
    expect(rules).toContain('Einfache Vergangenheit')
    expect(rules).toContain('SPRACHHANDLUNG')
    expect(rules).toContain('Sammeln – Ordnen – Systematisieren')
    expect(rules).toContain('Merkkasten')
    expect(rules).toContain('Verstehensaufgabe')
    expect(rules).toContain('Fehlerarbeit steht am Ende')
  })

  it('gibt der KI die belegten Fehlerquellen mit, statt sie erfinden zu lassen', () => {
    const rules = grammarRules(meta({ skillFocus: 'grammar', grammarTopics: ['en.verb.pp_vs_past'] }))
    expect(rules).toContain('I have seen him yesterday')
  })

  it('nennt die Übungsformate, die zum Thema passen', () => {
    const rules = grammarRules(meta({ skillFocus: 'grammar', grammarTopics: ['en.verb.past_simple'] }))
    expect(rules).toMatch(/Lückentext|Fehler finden|Sätze bilden/)
  })

  it('verbietet Produktionsaufgaben bei rein rezeptiven Themen', () => {
    const receptive = GRAMMAR_TOPICS.find((t) => t.receptive)!
    const rules = grammarRules(meta({ subjectId: receptive.subject, skillFocus: 'grammar', grammarTopics: [receptive.id] }))
    expect(rules).toContain('nur ERKENNEN')
    expect(rules).toContain(receptive.label)
  })

  it('nutzt in Deutsch die operationalen Verfahren', () => {
    const rules = grammarRules(meta({ subjectId: 'deutsch', subjectLabel: 'Deutsch', skillFocus: 'grammar', grammarTopics: ['de.satz.satzglieder'] }))
    expect(rules).toContain('Umstell-')
    expect(rules).not.toContain('Unterschied zum Deutschen')
  })
})
