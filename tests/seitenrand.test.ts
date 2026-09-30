import { describe, expect, it } from 'vitest'
import { paginate, type MeasuredItem, type PagePlan } from '../src/renderer/src/shared/render/paginate'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'

/*
 * Seitenrand (30.09.2026, Befund der Lehrkraft: â€ždie letzte Zeile einer Tabelle nur halb
 * sichtbar"). Der Umbruch darf keine Seite Ã¼ber ihren Platz hinaus fÃ¼llen â€“ auch nicht mit
 * dem Kopf eines FolgestÃ¼cks (wiederholte Tabellenkopfzeile) und nicht mit dem FuÃŸ. Die
 * PrÃ¼fung nach dem Setzen gibt Seiten, die trotzdem Ã¼berliefen, per `abzug` weniger Platz.
 */

/** HÃ¶he, die ein Seitenplan nach den gemessenen Werten belegt */
function belegt(plan: PagePlan, items: MeasuredItem[]): number {
  const je = new Map(items.map((i) => [i.id, i]))
  return plan.items.reduce((summe, it) => {
    const m = je.get(it.id)!
    if (!m.units) return summe + m.height
    const von = it.from ?? 0
    const bis = it.to ?? m.units.length
    const kopf = von === 0 ? (m.headHeight ?? 0) : (m.continuedHead ?? 0)
    const fuss = bis >= m.units.length ? (m.footHeight ?? 0) : 0
    return summe + kopf + m.units.slice(von, bis).reduce((a, b) => a + b, 0) + fuss
  }, 0)
}

describe('Abzug aus der PrÃ¼fung nach dem Setzen', () => {
  it('eine Seite mit Abzug nimmt weniger auf â€“ das Ãœberstehende rutscht auf die nÃ¤chste', () => {
    const items: MeasuredItem[] = [
      { id: 'a', height: 400 },
      { id: 'b', height: 400 },
      { id: 'c', height: 190 }
    ]
    expect(paginate(items, 1000, 1000)).toHaveLength(1)
    const mit = paginate(items, 1000, 1000, [20])
    expect(mit).toHaveLength(2)
    expect(mit[1].items[0].id).toBe('c')
  })

  it('der Abzug gilt nur fÃ¼r seine Seite', () => {
    const items: MeasuredItem[] = Array.from({ length: 6 }, (_, i) => ({ id: `x${i}`, height: 300 }))
    const plan = paginate(items, 900, 900, [0, 10])
    expect(plan.map((p) => p.items.length)).toEqual([3, 2, 1])
  })

  it('ohne Abzug bleibt alles wie bisher', () => {
    const items: MeasuredItem[] = [{ id: 't', height: 520, headHeight: 20, units: [100, 100, 100, 100, 100] }]
    expect(paginate(items, 340, 340)).toEqual(paginate(items, 340, 340, []))
  })
})

describe('Kopf eines FolgestÃ¼cks', () => {
  it('die wiederholte Tabellenkopfzeile zÃ¤hlt auf der Folgeseite mit', () => {
    // Titel + Kopfzeile 60, Kopfzeile allein 35; zwÃ¶lf Zeilen Ã  50 auf Seiten zu 400
    const tabelle: MeasuredItem = { id: 'tab', height: 60 + 600, headHeight: 60, continuedHead: 35, units: Array(12).fill(50), keepTogether: true }
    const plan = paginate([tabelle], 400, 400)
    for (const seite of plan) expect(belegt(seite, [tabelle])).toBeLessThanOrEqual(400)
    // Ohne den Folgekopf hÃ¤tten auf Seite 2 sieben statt sechs Zeilen gestanden â€“ 35 px zu viel
    expect(plan[1].items[0]).toMatchObject({ from: 6, continued: true })
    expect((plan[1].items[0].to ?? 0) - (plan[1].items[0].from ?? 0)).toBe(6)
  })
})

describe('Keine Seite lÃ¤uft Ã¼ber (ZufallsblÃ¤tter)', () => {
  it('500 zufÃ¤llige BlÃ¤tter mit KÃ¶pfen, FolgekÃ¶pfen, FÃ¼ÃŸen und AbzÃ¼gen', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const r = createRng(seed)
      const items: MeasuredItem[] = Array.from({ length: 3 + Math.floor(r() * 12) }, (_, i) => {
        if (r() < 0.4) return { id: `b${i}`, height: 20 + r() * 300, keepWithNext: r() < 0.1 }
        const units = Array.from({ length: 1 + Math.floor(r() * 30) }, () => 10 + r() * 60)
        const headHeight = r() * 60
        const footHeight = r() < 0.3 ? r() * 30 : 0
        return {
          id: `u${i}`,
          height: headHeight + units.reduce((a, b) => a + b, 0) + footHeight,
          headHeight,
          footHeight,
          continuedHead: r() * 40,
          units,
          keepTogether: r() < 0.5
        }
      })
      const abzug = Array.from({ length: 8 }, () => (r() < 0.3 ? r() * 80 : 0))
      const plan = paginate(items, 700, 900, abzug)
      plan.forEach((seite, i) => {
        if (seite.overflow) return
        const platz = (i === 0 ? 700 : 900) - (abzug[i] ?? 0)
        expect(belegt(seite, items), `Blatt ${seed}, Seite ${i + 1}`).toBeLessThanOrEqual(platz + 0.5)
      })
    }
  })
})
