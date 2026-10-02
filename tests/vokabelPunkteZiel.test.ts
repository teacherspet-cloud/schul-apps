import { describe, expect, it } from 'vitest'
import { halbePunkteAufSumme, punkteAufZiel } from '../src/renderer/src/modules/vokabeltest/generation/punkteZiel'
import { variantPoints } from '../src/renderer/src/modules/vokabeltest/model/blocks'
import type { Block } from '../src/renderer/src/modules/vokabeltest/model/types'

/*
 * Befund der Lehrkraft (02.10.2026): 21 Punkte vorgegeben, die Tests hatten 25 oder 26. Die Punkte
 * wurden vor der Erzeugung verteilt, die fertigen Aufgaben hatten mehr Items als geplant.
 */

const items = (n: number): { id: string }[] => Array.from({ length: n }, (_, i) => ({ id: `i${i}` }))
const block = (taskType: string, kind: string, n: number, pointsPerItem: number): Block =>
  ({ id: `${taskType}-${n}`, taskType, kind, title: '', instruction: '', pointsPerItem, items: items(n), left: items(n) }) as unknown as Block

describe('Gesamtpunkte nach der Erzeugung', () => {
  it('bringt eine Variante mit mehr Items als geplant genau auf die Vorgabe', () => {
    // geplant: 21 Punkte – geliefert: 9 + 6 + 5 Items, mit den alten Punkten 25
    const vorher = [block('gapSentences', 'gap', 9, 1), block('matchTranslation', 'match', 6, 1), block('writeSentences', 'open', 5, 2)]
    const variante = { id: 'v', label: 'A', blocks: vorher }
    expect(variantPoints(variante)).toBe(25)
    const nachher = punkteAufZiel(vorher, 21)
    expect(variantPoints({ ...variante, blocks: nachher })).toBe(21)
    // in halben Punkten, nie unter einem halben
    for (const b of nachher) expect(b.pointsPerItem * 2).toBe(Math.round(b.pointsPerItem * 2))
    for (const b of nachher) expect(b.pointsPerItem).toBeGreaterThanOrEqual(0.5)
  })

  it('findet die genaue Summe auch bei vielen Aufgaben und meldet die nächstliegende, wenn halbe Punkte nicht reichen', () => {
    const p = halbePunkteAufSumme([3, 4, 2, 5, 3, 2], [1, 1, 2, 1, 2, 1], 24)!
    expect(p.reduce((s, x, i) => s + x * [3, 4, 2, 5, 3, 2][i], 0)).toBe(24)
    // 3 Items, 2 Punkte: genau ginge nur mit 2/3 Punkt – nächstliegend 1,5 (3 × 0,5)
    expect(halbePunkteAufSumme([3], [1], 2)).toEqual([0.5])
  })
})
