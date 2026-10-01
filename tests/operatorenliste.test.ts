import { describe, expect, it } from 'vitest'
import { presetDesigns } from '../src/shared/design'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { TaskBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import {
  amtlicheListe,
  operatorAusAnweisung,
  operatorenBefund,
  operatorenBlock,
  operatorenDerArbeit,
  operatorenlisteAktiv,
  operatorenVorbemerkungen,
  ohneSchuelerErlaeuterung,
  OPERATOREN_BLOCK_ID,
  schuelerErlaeuterung
} from '../src/renderer/src/modules/klassenarbeit/didactics/operatorenliste'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import type { Exam, ExamPart } from '../src/renderer/src/modules/klassenarbeit/model/types'
import { examToWorksheet } from '../src/renderer/src/modules/klassenarbeit/render/examWorksheet'

/*
 * Operatorenliste als Anlage der Klausur (27.09.2026): Niedersachsen verlangt, dass Lernende der
 * Sek II die Operatoren zur Klausur erhalten. Der Baustein listet die verwendeten Operatoren mit
 * der AMTLICHEN Definition des Landes – nichts anderes.
 */

const aufgabe = (instruction: string, teile: string[] = []): TaskBlock => ({
  ...(newBlock('task') as TaskBlock),
  id: `t-${instruction.slice(2, 8)}`,
  instruction,
  operator: '',
  parts: teile.map((p, i) => ({ id: `p${i}`, instruction: p, answer: { kind: 'lines', lines: 3 } as never, solution: '' }))
})
const part = (blocks: TaskBlock[]): ExamPart =>
  ({ id: 'p1', formatId: 'en-writing', label: 'Writing', competence: 'Schreiben', minutes: 45, points: 0, weight: 100, contentShare: 60, blocks }) as ExamPart
const arbeit = (over: Partial<Exam['meta']>, blocks: TaskBlock[]): Exam =>
  ({
    version: 1,
    meta: {
      ...defaultExamMeta('NI', 'gymnasium', 'Gymnasium'),
      subjectId: 'englisch',
      subjectLabel: 'Englisch',
      topic: 'Macbeth',
      grade: 13,
      courseLevel: 'eA',
      ...over
    },
    parts: [part(blocks)],
    design: presetDesigns()[0],
    createdAt: ''
  }) as unknown as Exam

describe('Operatoren aus den Aufgaben', () => {
  it('liest den fett gesetzten Operator, auch aus Teilaufgaben, ohne Dubletten', () => {
    expect(operatorAusAnweisung('**Outline** the main ideas.')).toBe('Outline')
    expect(operatorAusAnweisung('Outline the main ideas.')).toBe('')
    const e = arbeit({}, [aufgabe('**Outline** the review.', ['**Analyse** the tone.', '**analyse** the imagery.']), aufgabe('**Comment** on the ending.')])
    expect(operatorenDerArbeit(e)).toEqual(['outline', 'analyse', 'comment'])
  })

  it('Sek II von selbst, Sek I nur per Schalter', () => {
    expect(operatorenlisteAktiv(arbeit({}, []))).toBe(true)
    expect(operatorenlisteAktiv(arbeit({ grade: 8, courseLevel: undefined }, []))).toBe(false)
    expect(operatorenlisteAktiv(arbeit({ grade: 8, courseLevel: undefined, operatorenliste: true }, []))).toBe(true)
    expect(operatorenlisteAktiv(arbeit({ operatorenliste: false }, []))).toBe(false)
  })

  it('ohne amtliche Liste des Landes gibt es keinen Baustein, aber einen Befund für die Lehrkraft', () => {
    const e = arbeit({ stateId: 'XX' }, [aufgabe('**Outline** the review.')])
    expect(amtlicheListe('XX', 'englisch')).toBeNull()
    expect(operatorenBlock(e)).toBeNull()
    expect(operatorenBefund(e).fehlend).toEqual(['outline'])
    expect(examToWorksheet(e).sheets[0].blocks.some((b) => b.id === OPERATOREN_BLOCK_ID)).toBe(false)
  })

  it('Niedersachsen, Englisch: verwendete Operatoren mit amtlichem Wortlaut – knapp, ohne Aufgabenbeispiele', () => {
    const e = arbeit({}, [
      aufgabe('**Tick** the correct answer.'),
      aufgabe('**Outline** the review.', ['**Comment on** the ending.']),
      aufgabe('**Write** an email.')
    ])
    const b = operatorenBefund(e)
    expect(b.fehlend).toEqual([])
    expect(b.gefunden.map((d) => d.operator)).toEqual(['tick', 'outline', 'comment (on)', 'write (+ text type)'])
    const block = operatorenBlock(e)
    expect(block?.type).toBe('infoBox')
    const body = block?.body ?? ''
    expect(body).toContain('- **outline**: give the main features')
    expect(body).toContain('Stand 1. Februar 2024')
    // „tick" hat in der Liste nur ein Aufgabenbeispiel, keine Erläuterung – auf dem Blatt stünde nur das Wort
    expect(body).not.toContain('**tick**')
    expect(ohneSchuelerErlaeuterung(b)).toEqual(['tick'])
    const ws = examToWorksheet(e)
    expect(ws.sheets[0].blocks[ws.sheets[0].blocks.length - 1].id).toBe(OPERATOREN_BLOCK_ID)
    // Unbekannter Operator: nicht auf dem Blatt, aber im Befund
    expect(operatorenBefund(arbeit({}, [aufgabe('**Rewrite** the text.')])).fehlend).toEqual(['rewrite'])
  })

  it('Niedersachsen, Geschichte: Imperative und hinterlegte Formen treffen die Infinitive', () => {
    const e = arbeit({ subjectId: 'geschichte', subjectLabel: 'Geschichte' }, [
      aufgabe('**Analysiere** die Rede.', ['**Erläutere** den Kontext.']),
      aufgabe('**Nimm Stellung** zur These.'),
      aufgabe('**Setze** die Quellen **in Beziehung**.')
    ])
    const b = operatorenBefund(e)
    // Getrennte Operatoren werden zusammengesetzt: „**Setze** … **in Beziehung**" → in Beziehung setzen
    expect(b.gefunden.map((d) => d.operator)).toEqual(['analysieren', 'erläutern', 'Stellung nehmen', 'in Beziehung setzen'])
    expect(b.fehlend).toEqual([])
    expect(operatorenBlock(e)?.body).toContain('- **Stellung nehmen**: Beurteilung mit zusätzlicher Reflexion')
  })

  /*
   * Befund der Lehrkraft (01.10.2026): Unter einer Sprachmittlung stand die deutsche Vorbemerkung des
   * Ministeriums („Es ist erforderlich, … in einen situativen Rahmen … einzubetten.") und das
   * Aufgabenbeispiel der Liste. Seit 28.09.2026 setzte der Baustein ALLES aus der Liste aufs Blatt.
   */
  it('Schülerblatt: Operator und Erläuterung in der Sprache der Liste – keine Vorbemerkung, kein Beispiel, keine weiteren Spalten (01.10.2026)', () => {
    // Mediation: die Erläuterung aus dem Kompetenzbereich Sprachmittlung
    const mediation = { ...arbeit({}, [aufgabe('**Write** an email based on M1.')]) }
    mediation.parts[0].formatId = 'en-mediation'
    const body = operatorenBlock(mediation)?.body ?? ''
    expect(body).toContain('- **write (+ text type)**: produce a text with specific features')
    for (const verboten of ['situativen Rahmen', 'Es ist erforderlich', 'Example', 'Using the information in the input article', 'Sprachmittlung', 'level III'])
      expect(body).not.toContain(verboten)
    // Die Vorbemerkung bekommt nur die Lehrkraft
    expect(operatorenVorbemerkungen(operatorenBefund(mediation))).toEqual([{ bereich: 'Sprachmittlung', text: expect.stringContaining('situativen Rahmen') }])
    // Schreiben: ohne Anforderungsbereich und ohne Beispiele
    const schreiben = operatorenBlock(arbeit({}, [aufgabe('**Analyse** the way the atmosphere is created.')]))?.body ?? ''
    expect(schreiben).toContain('- **analyse, examine**: describe and explain in detail')
    expect(schreiben).not.toMatch(/Examples?:|level II/)
    // Derselbe Operator in zwei Teilen (Schreiben und Sprachmittlung): einmal
    const zwei = arbeit({}, [aufgabe('**Write** a comment.')])
    zwei.parts.push({ ...zwei.parts[0], id: 'p2', formatId: 'en-mediation', blocks: [aufgabe('**Write** an email based on M1.')] })
    expect((operatorenBlock(zwei)?.body.match(/\*\*write \(\+ text type\)\*\*/g) ?? []).length).toBe(1)
  })

  it('übernimmt Kompetenzbereich und Fächer-Einschränkung der Liste (28.09.2026)', () => {
    // „darstellen" gilt nur für Erdkunde und Politik – in Geschichte ist es kein Operator der Liste
    const ge = arbeit({ subjectId: 'geschichte', subjectLabel: 'Geschichte' }, [
      aufgabe('**Stelle** die Entwicklung **dar**.'),
      aufgabe('**Interpretiere** die Quelle.')
    ])
    const befundGe = operatorenBefund(ge)
    expect(befundGe.gefunden.map((d) => d.operator)).toEqual(['interpretieren'])
    const ek = arbeit({ subjectId: 'erdkunde' as never, subjectLabel: 'Erdkunde' }, [aufgabe('**Stelle** die Entwicklung **dar**.')])
    expect(operatorenBefund(ek).gefunden.map((d) => d.operator)).toEqual(['darstellen'])
    // Weitere Spalten der Liste („Hinweis: …") sind Auskunft für die Lehrkraft, nicht für das Blatt (01.10.2026)
    expect(operatorenBlock(ge)?.body).not.toContain('Hinweis')
  })
})

describe('Operatorenliste: Erläuterungen nur in der Sprache der Liste (01.10.2026)', () => {
  it('deutsche Erläuterungen englischer Operatoren (HE, NRW Sek I) und angehängte Hinweise kommen nicht aufs Blatt', () => {
    expect(schuelerErlaeuterung({ operator: 'describe', definition: 'give a detailed account of sth.' }, 'en')).toBe('give a detailed account of sth.')
    expect(schuelerErlaeuterung({ operator: 'discuss', definition: 'eine These unter Abwägen von Pro- und Kontraargumenten hinterfragen' }, 'en')).toBe('')
    expect(schuelerErlaeuterung({ operator: 'match', definition: 'Ordne die Aussagen korrekt zu.' }, 'en')).toBe('')
    expect(schuelerErlaeuterung({ operator: 'analyser', definition: 'examiner un texte et en dégager les caractéristiques' }, 'fr')).not.toBe('')
    const entwerfen = 'Darstellung einer Lösungsidee (verbal, Struktogramm oder Pseudocode)'
    expect(schuelerErlaeuterung({ operator: 'entwerfen', definition: `${entwerfen} Besonderer Hinweis: für Entwürfe von Algorithmen …` }, 'de')).toBe(entwerfen)
  })

  it('Bestand: keine Erläuterung trägt eine Vorbemerkung oder ein Beispiel im Wortlaut', async () => {
    const { BESTAND } = await import('../src/shared/operatoren/zugriff')
    const { OPERATORENLISTEN } = await import('../src/renderer/src/modules/klassenarbeit/didactics/operatorenlistenDaten')
    const alle = [
      ...Object.values(BESTAND).flatMap((b) => b.listen.flatMap((l) => l.operatoren)),
      ...Object.values(OPERATORENLISTEN).flatMap((f) => Object.values(f).flatMap((l) => l.operatoren))
    ]
    const muster = /(?:^|[\s(])(?:examples?|beispiele?|exemples?|ejemplos?|aufgabenbeispiel)\s*:|es ist erforderlich|(?:besonderer\s+)?hinweis\s*:|anmerkung\s*:/i
    const verdaechtig = alle.filter((o) => muster.test(o.definition ?? ''))
    expect(verdaechtig.map((o) => `${o.operator}: ${o.definition}`)).toEqual([])
  })
})
