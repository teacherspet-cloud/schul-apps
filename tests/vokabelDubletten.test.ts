import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { textbookEntries, NO_MARKS } from '../src/renderer/src/modules/vokabeltest/steps/TextbookPicker'
import type { Textbook } from '../src/shared/types'

const buch = JSON.parse(readFileSync('resources/lehrwerke/green-line-1.json', 'utf8')) as Textbook

/** Dieselbe Zusammenführung wie im Auswahlfenster: jedes Wort genau einmal. */
function zusammenfuehren(bestand: string[], frisch: string[]): string[] {
  const key = (t: string): string => t.trim().toLowerCase()
  const map = new Map(bestand.map((t) => [key(t), t]))
  for (const t of frisch) if (t.trim() && !map.has(key(t))) map.set(key(t), t)
  return [...map.values()]
}

const woerter = (units: string[], boxes: boolean, grey: boolean): string[] =>
  units.flatMap((u) => {
    const unit = buch.units.find((x) => x.name === u)!
    return textbookEntries(
      buch,
      u,
      unit.sections.map((s) => s.name),
      { ...NO_MARKS, boxes, grey }
    ).map((e) => e.term)
  })

describe('Dubletten in der Vokabelauswahl', () => {
  /*
   * Gemeldeter Fall: Green Line 1, „Hello" + „Unit 1", Kästen und grau eingeschaltet.
   * Der Knopf kündigte 375 Vokabeln an, unten standen 346. Beides stimmte nicht:
   * 375 sind die EINTRÄGE des Buches, 332 die verschiedenen WÖRTER – und 346 entstand,
   * weil erst ohne und dann mit den Schaltern geholt wurde und die Zusammenführung
   * Dubletten nur gegen den Bestand prüfte, nicht innerhalb der frischen Menge.
   */
  const units = ['Hello', 'Unit 1']

  it('bestätigt die gemeldeten Zahlen an den echten Buchdaten', () => {
    expect(woerter(units, true, true)).toHaveLength(375)
    expect(new Set(woerter(units, true, true).map((t) => t.toLowerCase())).size).toBe(332)
    expect(woerter(units, false, false)).toHaveLength(248)
  })

  it('führt Dubletten INNERHALB einer Holung zusammen', () => {
    // Pronomen stehen in mehreren Abschnitten derselben Unit
    expect(zusammenfuehren([], woerter(units, true, true))).toHaveLength(332)
  })

  it('führt Dubletten ZWISCHEN zwei Holungen zusammen – der gemeldete Fall', () => {
    // Erst ohne Schalter holen, dann mit: früher kamen 346 heraus, jetzt die 332 Wörter
    const erst = zusammenfuehren([], woerter(units, false, false))
    const zweit = zusammenfuehren(erst, woerter(units, true, true))
    expect(erst).toHaveLength(246)
    expect(zweit).toHaveLength(332)
    expect(zweit).not.toHaveLength(346)
  })

  it('zählt jedes Wort nur einmal, egal in welcher Reihenfolge geholt wird', () => {
    const a = zusammenfuehren(zusammenfuehren([], woerter(units, true, true)), woerter(units, false, false))
    const b = zusammenfuehren(zusammenfuehren([], woerter(units, false, false)), woerter(units, true, true))
    expect(a).toHaveLength(b.length)
  })
})
