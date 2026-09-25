import { describe, expect, it } from 'vitest'
import { systemPrompt, loesungsspracheRegel, operatorRules, phraseSheetModus } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { checkBilingual, checkBilingualOperatoren } from '../src/renderer/src/modules/arbeitsblatt/didactics/bilingual'
import { worksheetMetaFor } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'
import { glossarFuerArbeit } from '../src/renderer/src/modules/klassenarbeit/generation/glossar'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import { profileFromMeta } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { Exam } from '../src/renderer/src/modules/klassenarbeit/model/types'
import type { Pruefsprache, Sheet, TaskBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * Bilingual in der Klassenarbeit (nur Geschichte). Entscheidungen der Lehrkraft (25.09.2026):
 * „Glossar als Hilfsmittel“ – einmal am Ende der Arbeit – und Aufgabenstellungen „wählbar,
 * Standard Arbeitssprache“.
 */
const arbeit = (pruefsprache?: Pruefsprache): Exam =>
  ({
    version: 1,
    meta: {
      ...defaultExamMeta('NW', 'gymnasium', 'Gymnasium'),
      subjectId: 'geschichte',
      subjectLabel: 'Geschichte',
      topic: 'Die Weimarer Republik',
      grade: 9,
      bilingual: { an: true, sprache: 'en', spracheLabel: 'Englisch', form: 'sachfach', pruefsprache }
    },
    parts: [{ id: 'p1', label: 'Teil 1', formatId: 'quelle', minutes: 45, points: 30, blocks: [] }]
  }) as unknown as Exam

const aufgabe = (instruction: string, afb: TaskBlock['afb']): TaskBlock => ({ ...(newBlock('task') as TaskBlock), instruction, afb, solution: 'x' })
const blatt = (...blocks: Sheet['blocks']): Sheet => ({ id: 's', label: 's', blocks }) as Sheet

describe('Bilinguale Klassenarbeit', () => {
  it('reicht bilingual an die Teile weiter – als Prüfung markiert', () => {
    const m = worksheetMetaFor(arbeit())
    expect(m.bilingual).toMatchObject({ an: true, pruefung: true, pruefsprache: 'ziel' })
  })

  it('erzeugt in den Teilen KEIN Glossar – es liegt der Arbeit einmal bei', () => {
    const m = worksheetMetaFor(arbeit())
    expect(phraseSheetModus(m)).toBe('aus')
    const prompt = systemPrompt(m, profileFromMeta(m))
    expect(prompt).toMatch(/Erstelle in diesem Teil KEINEN Baustein „phrases“/)
    expect(prompt).not.toMatch(/PFLICHT: ein zweisprachiges Fachglossar/)
    // Ein Teil ohne Glossar ist in der Prüfung richtig
    expect(checkBilingual(blatt(aufgabe('Describe M1.', 'I')), m).some((w) => w.message.includes('Fachglossar fehlt'))).toBe(false)
  })

  it('Aufgaben in der Arbeitssprache: englische Operatoren, Musterlösung auf Englisch', () => {
    const m = worksheetMetaFor(arbeit('ziel'))
    expect(operatorRules(m, undefined)).toMatch(/describe \(beschreiben\)/)
    expect(loesungsspracheRegel(m)).toMatch(/AUF ENGLISCH/)
  })

  it('Mischformat: mindestens eine Aufgabe auf Deutsch, beide Operatoren gelten', () => {
    const m = worksheetMetaFor(arbeit('gemischt'))
    const prompt = systemPrompt(m, profileFromMeta(m))
    expect(prompt).toMatch(/MISCHFORMAT: Mindestens eine Aufgabe ist auf Deutsch gestellt/)
    expect(loesungsspracheRegel(m)).toMatch(/in der Sprache, in der die Aufgabe gestellt ist/)
    const b = blatt(aufgabe('Beschreibe das Plakat M1.', 'I'), aufgabe('Assess the decision.', 'III'))
    expect(checkBilingualOperatoren(b, m)).toEqual([])
  })

  it('Aufgaben auf Deutsch: deutsche Operatorenliste, keine zielsprachliche Prüfung', () => {
    const m = worksheetMetaFor(arbeit('deutsch'))
    expect(operatorRules(m, undefined)).not.toMatch(/describe/)
    expect(systemPrompt(m, profileFromMeta(m))).toMatch(/die AUFGABENSTELLUNGEN stehen auf Deutsch/)
    expect(checkBilingualOperatoren(blatt(aufgabe('Beschreibe M1.', 'I')), m)).toEqual([])
  })

  it('erstellt das Glossar aus Material und Aufgaben – ohne leere deutsche Einträge', async () => {
    let gesendet = ''
    const ai = async <T>(req: { system: string; user: string }): Promise<T> => {
      gesendet = req.system + req.user
      return {
        groups: [
          {
            label: 'Subject terms',
            items: [
              { text: 'armistice', german: 'Waffenstillstand' },
              { text: 'reparations', german: '' }
            ]
          }
        ]
      } as T
    }
    const exam = arbeit()
    exam.parts[0].blocks = [aufgabe('Describe the poster about the armistice.', 'I')]
    const g = await glossarFuerArbeit(exam, exam.parts, ai)
    expect(g?.type).toBe('phrases')
    expect(g?.title).toBe('Glossary')
    expect(g?.groups[0].items).toEqual([{ text: 'armistice', german: 'Waffenstillstand' }])
    expect(gesendet).toMatch(/armistice/)
    expect(gesendet).toMatch(/verrät keine Antworten/)
  })

  it('ohne bilingual kein Glossar und keine KI-Anfrage', async () => {
    const exam = arbeit()
    exam.meta.bilingual = undefined
    let gefragt = false
    const ai = async <T>(): Promise<T> => {
      gefragt = true
      return {} as T
    }
    expect(await glossarFuerArbeit(exam, exam.parts, ai)).toBeNull()
    expect(gefragt).toBe(false)
  })
})
