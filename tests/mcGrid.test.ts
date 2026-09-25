import { describe, expect, it } from 'vitest'
import { istMcListe, MC_SPALTE_MAX_ZEICHEN, mcSpalten, mcZeilen, ohneOperator } from '../src/renderer/src/modules/arbeitsblatt/render/mcGrid'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { TaskPart } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const mc = (instruction: string, options: string[] = ['a dog', 'a ball', 'a horse']): TaskPart => ({
  id: instruction.slice(0, 6),
  instruction,
  answer: { ...emptyAnswer('multipleChoice'), options, correct: [0] },
  solution: ''
})

const offen = (instruction: string): TaskPart => ({ id: instruction.slice(0, 6), instruction, answer: emptyAnswer('lines'), solution: '' })

describe('Wann eine Aufgabe als Fragenreihe gilt', () => {
  it('erkennt mehrere Ankreuzfragen', () => {
    expect(istMcListe([mc('Was ist das?'), mc('Wer war das?')])).toBe(true)
  })

  it('greift nicht bei einer einzigen Frage', () => {
    // Bei einer Frage gibt es nichts anzuordnen – sie steht ohnehin in der Anweisung
    expect(istMcListe([mc('Was ist das?')])).toBe(false)
  })

  it('greift nicht bei gemischten Formaten', () => {
    // Sonst verlöre die offene Teilaufgabe ihre Schreiblinien
    expect(istMcListe([mc('Was ist das?'), offen('Begründe.')])).toBe(false)
  })
})

describe('Zweispaltige Anordnung', () => {
  it('füllt SPALTENWEISE – wie in der Vorlage der Lehrkraft', () => {
    /*
     * In „Exam no 1" stehen 1 und 2 links, 3 und 4 rechts. Zeilenweise gefüllt (1|2 über
     * 3|4) müsste das Auge bei jeder Frage die Spalte wechseln.
     */
    expect(mcZeilen([1, 2, 3, 4], 2)).toEqual([
      [1, 3],
      [2, 4]
    ])
  })

  it('lässt den letzten Platz leer, statt umzusortieren', () => {
    expect(mcZeilen([1, 2, 3], 2)).toEqual([
      [1, 3],
      [2, null]
    ])
  })

  it('reiht bei einer Spalte einfach untereinander', () => {
    expect(mcZeilen([1, 2, 3], 1)).toEqual([[1], [2], [3]])
  })

  it('verliert keine Frage', () => {
    for (const n of [2, 5, 6, 7, 9]) {
      const items = Array.from({ length: n }, (_, i) => i)
      expect(
        mcZeilen(items, 2)
          .flat()
          .filter((x) => x !== null)
      ).toHaveLength(n)
    }
  })
})

describe('Wie viele Spalten', () => {
  it('nimmt zwei Spalten bei kurzen Fragen', () => {
    expect(mcSpalten([mc("What's in Ruby's picture?"), mc('What can the students write about?')])).toBe(2)
  })

  it('bleibt einspaltig, wenn eine Frage zu lang ist', () => {
    // Gedrängt zweispaltig ist schlechter lesbar als ruhig einspaltig
    const lang = 'a'.repeat(MC_SPALTE_MAX_ZEICHEN + 1)
    expect(mcSpalten([mc(lang), mc('Kurz?')])).toBe(1)
  })

  it('achtet auch auf die Länge der Antwortmöglichkeiten', () => {
    expect(mcSpalten([mc('Kurz?', ['a'.repeat(MC_SPALTE_MAX_ZEICHEN + 1)]), mc('Auch kurz?')])).toBe(1)
  })
})

describe('Wiederholten Operator entfernen', () => {
  it('nimmt das „Tick" vom Anfang – der gemeldete Fall', () => {
    /*
     * „Die Multiple-Choice-Antworten werden alle formuliert mit **Tick** …" – bei vier
     * Fragen stand das Wort viermal da, obwohl die Arbeitsanweisung es schon sagt.
     */
    expect(ohneOperator("**Tick** Ruby's two feelings before school.", 'tick')).toBe("Ruby's two feelings before school.")
  })

  it('kennt die üblichen Ankreuzwörter auch ohne passenden Operator', () => {
    expect(ohneOperator('**Choose** the correct answer.', '')).toBe('The correct answer.')
    expect(ohneOperator('**Kreuze an**, was stimmt.', '')).toBe('Was stimmt.')
  })

  it('lässt eine echte Hervorhebung stehen', () => {
    // Ein fettes Wort am Anfang kann auch zum Fragetext gehören
    expect(ohneOperator('**Nenne** drei Gründe.', 'tick')).toBe('**Nenne** drei Gründe.')
    expect(ohneOperator('**London** liegt an welchem Fluss?', 'tick')).toBe('**London** liegt an welchem Fluss?')
  })

  it('rührt eine Frage ohne Operator nicht an', () => {
    expect(ohneOperator("What's in Ruby's picture?", 'tick')).toBe("What's in Ruby's picture?")
  })

  it('lässt den Text stehen, wenn danach nichts übrig bliebe', () => {
    // „**Tick**" allein ist zwar unschön, aber besser als eine leere Frage
    expect(ohneOperator('**Tick**', 'tick')).toBe('**Tick**')
  })
})
