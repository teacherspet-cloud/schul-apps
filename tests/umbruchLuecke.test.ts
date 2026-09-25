import { describe, expect, it } from 'vitest'
import { paginate, type MeasuredItem } from '../src/renderer/src/shared/render/paginate'

/*
 * Gemeldet von der Lehrkraft (24.09.2026): „die linien brachen auf s. 1 nach ein paar zeilen
 * ab, dann blieb der rest der seite leer, dann gingen die linien auf s. 2 weiter".
 *
 * Diese Tests messen den Umbruch selbst: Bleibt auf einer Seite mehr frei, als die nächste
 * Einheit hoch ist, ist Papier verschenkt – und genau so sieht es auf dem Blatt aus.
 */

/** Höhe einer Schreiblinie in px (CSS: 8.5 mm bei 96 dpi) */
const LINIE = (8.5 * 96) / 25.4
const SEITE = 1000

/** Wie viel bleibt auf jeder Seite frei? */
const freiJeSeite = (plaene: ReturnType<typeof paginate>, items: MeasuredItem[], hoehe: number): number[] => {
  const nach = new Map(items.map((i) => [i.id, i]))
  return plaene.map((p) =>
    p.items.reduce((rest, it) => {
      const m = nach.get(it.id)!
      if (!m.units) return rest - m.height
      const von = it.from ?? 0
      const bis = it.to ?? m.units.length
      return rest - (von === 0 ? (m.headHeight ?? 0) : 0) - m.units.slice(von, bis).reduce((a, b) => a + b, 0)
    }, hoehe)
  )
}

describe('Seiten werden gefüllt, bevor umbrochen wird', () => {
  it('lässt bei lauter gleich hohen Einheiten höchstens eine Einheit frei', () => {
    // Eine Schreibaufgabe: Kopf mit Anweisung, danach 60 Schreiblinien
    const item: MeasuredItem = {
      id: 'schreiben',
      height: 200 + 60 * LINIE,
      headHeight: 200,
      units: Array.from({ length: 60 }, () => LINIE),
      keepTogether: true
    }
    const plaene = paginate([item], SEITE, SEITE)
    const frei = freiJeSeite(plaene, [item], SEITE)
    for (const [i, f] of frei.slice(0, -1).entries()) {
      expect(f, `Seite ${i + 1} lässt ${Math.round(f)} px frei, eine Linie ist ${Math.round(LINIE)} px`).toBeLessThan(LINIE + 1)
    }
  })

  it('füllt auch, wenn vor der Aufgabe schon etwas steht', () => {
    const vorher: MeasuredItem = { id: 'text', height: 300 }
    const aufgabe: MeasuredItem = {
      id: 'schreiben',
      height: 150 + 50 * LINIE,
      headHeight: 150,
      units: Array.from({ length: 50 }, () => LINIE),
      keepTogether: true
    }
    const items = [vorher, aufgabe]
    const frei = freiJeSeite(paginate(items, SEITE, SEITE), items, SEITE)
    for (const [i, f] of frei.slice(0, -1).entries()) {
      expect(f, `Seite ${i + 1} lässt ${Math.round(f)} px frei`).toBeLessThan(LINIE + 1)
    }
  })

  it('zeigt, wann „zusammenhalten" absichtlich eine Lücke lässt', () => {
    /*
     * `keepTogether` darf einen Baustein ganz auf die nächste Seite schieben, statt ihn nach
     * wenigen Zeilen zu zerreißen – aber nur, wenn auf der Seite ohnehin weniger als die
     * Hälfte frei ist. Das ist gewollt und hier festgehalten, damit es niemand für den
     * gemeldeten Fehler hält.
     */
    const vorher: MeasuredItem = { id: 'text', height: 700 }
    const aufgabe: MeasuredItem = {
      id: 'schreiben',
      height: 100 + 20 * LINIE,
      headHeight: 100,
      units: Array.from({ length: 20 }, () => LINIE),
      keepTogether: true
    }
    const plaene = paginate([vorher, aufgabe], SEITE, SEITE)
    expect(plaene).toHaveLength(2)
    // Die Aufgabe steht vollständig auf Seite 2, Seite 1 behält ihre 300 px Rest
    expect(plaene[0].items.map((i) => i.id)).toEqual(['text'])
    expect(plaene[1].items[0]).toMatchObject({ id: 'schreiben', from: 0, to: 20 })
  })

  it('teilt statt zu schieben, wenn die Seite noch mehr als halb leer ist', () => {
    const vorher: MeasuredItem = { id: 'text', height: 400 }
    const aufgabe: MeasuredItem = {
      id: 'schreiben',
      height: 100 + 40 * LINIE,
      headHeight: 100,
      units: Array.from({ length: 40 }, () => LINIE),
      keepTogether: true
    }
    const items = [vorher, aufgabe]
    const plaene = paginate(items, SEITE, SEITE)
    expect(plaene[0].items.map((i) => i.id)).toEqual(['text', 'schreiben'])
    const frei = freiJeSeite(plaene, items, SEITE)
    expect(frei[0], `Seite 1 lässt ${Math.round(frei[0])} px frei`).toBeLessThan(LINIE + 1)
  })
})
