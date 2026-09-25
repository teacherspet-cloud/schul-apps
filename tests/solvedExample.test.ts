import { describe, expect, it } from 'vitest'
import { generateExample } from '../src/renderer/src/modules/arbeitsblatt/generation/example'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { TaskBlock, WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import type { StructuredRequest } from '../src/shared/types'
import { exampleNote } from '../src/renderer/src/shared/exampleNote'

const meta: WorksheetMeta = {
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  grade: 5
}

const mcTask = (): TaskBlock => ({
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
  parts: [
    {
      id: 'p1',
      instruction: "What is in Ruby's picture?",
      answer: { ...emptyAnswer('multipleChoice'), options: ['a dog', 'a ball', 'a horse'], correct: [0] },
      solution: ''
    },
    {
      id: 'p2',
      instruction: 'Who can sing the song?',
      answer: { ...emptyAnswer('multipleChoice'), options: ['Lily', 'Ruby', 'Karam'], correct: [1] },
      solution: ''
    }
  ]
})

const offeneTask = (): TaskBlock => ({ ...mcTask(), parts: [], answer: { ...emptyAnswer('lines'), count: 3 } })

/** Simulierte KI: gibt zurück, was ihr vorgegeben wird, und merkt sich den Auftrag. */
const ai =
  (antwort: Record<string, unknown>, aufträge: StructuredRequest[] = []) =>
  async <T>(req: StructuredRequest): Promise<T> => {
    aufträge.push(req)
    return antwort as T
  }

/*
 * Belegte Grundlage: ÖSZ (2024), „Leitfaden zur Erstellung von Schularbeiten in der
 * Sekundarstufe 2": „Bei jeder Aufgabenstellung sollte zu Beginn ein gelöstes Beispiel (0)
 * vorgegeben sein." Dieselbe Form in den Modellsätzen des Goethe-Instituts und bei Cambridge.
 */
describe('Gelöstes Beispiel (Punkt 0)', () => {
  it('baut das Beispiel wie die echten Fragen – Ankreuzform mit gesetzter Lösung', async () => {
    const teil = await generateExample(
      mcTask(),
      meta,
      ai({ instruction: 'Where does Ruby go?', options: ['to school', 'to the park', 'to the shop'], correct: 0, solution: '' })
    )
    expect(teil.answer.kind).toBe('multipleChoice')
    expect(teil.answer.options).toHaveLength(3)
    // Die Lösung ist eingetragen – das Beispiel zeigt die Form, es prüft nichts
    expect(teil.answer.correct).toEqual([0])
    expect(teil.solution).toBe('to school')
  })

  it('nimmt bei offenen Aufgaben die eingetragene Antwort statt Möglichkeiten', async () => {
    const teil = await generateExample(offeneTask(), meta, ai({ instruction: 'Where does Ruby go?', options: [], correct: 0, solution: 'She goes to school.' }))
    expect(teil.answer.kind).toBe('none')
    expect(teil.solution).toBe('She goes to school.')
  })

  it('gibt der KI die fertige Aufgabe als Grundlage mit', async () => {
    const aufträge: StructuredRequest[] = []
    await generateExample(mcTask(), meta, ai({ instruction: 'Where?', options: ['a', 'b', 'c'], correct: 1, solution: '' }, aufträge))
    const auftrag = aufträge[0].user
    expect(auftrag).toContain("What is in Ruby's picture?")
    expect(auftrag).toContain('a dog | a ball | a horse')
    // Das Beispiel darf die Aufgabe nicht verändern und keine Lösung vorwegnehmen
    expect(auftrag).toMatch(/Ändere nichts an der Aufgabe selbst/)
    expect(auftrag).toMatch(/nimmt keine Lösung vorweg/)
    expect(auftrag).toMatch(/EINFACHER/)
  })

  it('verlangt so viele Möglichkeiten wie die echten Fragen', async () => {
    const aufträge: StructuredRequest[] = []
    await generateExample(mcTask(), meta, ai({ instruction: 'Where?', options: ['a', 'b', 'c'], correct: 0, solution: '' }, aufträge))
    expect(aufträge[0].user).toMatch(/Gib 3 Antwortmöglichkeiten an/)
  })

  it('meldet einen Fehler, statt still nichts zu tun', async () => {
    // Stilles Scheitern sah in diesem Projekt schon einmal wie ein KI-Problem aus
    await expect(generateExample(mcTask(), meta, ai({ instruction: '  ' }))).rejects.toThrow(/kein Beispiel/)
    await expect(generateExample(mcTask(), meta, ai({ instruction: 'Where?', options: ['nur eine'] }))).rejects.toThrow(/zu wenige/)
  })

  it('fängt eine unsinnige Nummer der richtigen Antwort ab', async () => {
    const teil = await generateExample(mcTask(), meta, ai({ instruction: 'Where?', options: ['a', 'b', 'c'], correct: 99, solution: '' }))
    expect(teil.answer.correct).toEqual([2])
  })
})

/*
 * Der Hinweis auf das Beispiel gehört an die Arbeitsanweisung – in der Sprache des Fachs.
 * Cambridge schreibt „There is one example."; ohne den Satz sieht der Punkt 0 wie eine
 * vergessene erste Aufgabe aus.
 */
describe('Hinweis „There is one example."', () => {
  it('steht in der Sprache des Fachs', () => {
    expect(exampleNote('en')).toBe('There is one example.')
    expect(exampleNote('fr')).toBe('Il y a un exemple.')
    expect(exampleNote('es')).toBe('Hay un ejemplo.')
    expect(exampleNote('de')).toMatch(/Beispiel/)
  })

  it('fällt bei unbekannter Sprache auf Deutsch zurück, statt leer zu bleiben', () => {
    expect(exampleNote('xx')).toBe(exampleNote('de'))
    expect(exampleNote(undefined)).toBe(exampleNote('de'))
  })

  it('versteht auch Sprachcodes mit Region', () => {
    expect(exampleNote('en-GB')).toBe('There is one example.')
  })
})
