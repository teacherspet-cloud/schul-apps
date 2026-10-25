import { describe, expect, it } from 'vitest'
import { ganzePunkteAufSumme, punkteAufZiel } from '../src/renderer/src/modules/vokabeltest/generation/punkteZiel'
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
    // Ganze Punkte (25.10.2026): 9·a + 6·b + 5·c = 21 geht mit ganzen Punkten nicht, auch nach dem Kürzen nicht –
    // dann die nächstliegende Summe (20) statt 25
    expect(Math.abs(variantPoints({ ...variante, blocks: nachher }) - 21)).toBeLessThanOrEqual(1)
    // Trifft es genau, wenn die Zahlen es hergeben
    const genau = punkteAufZiel([block('gapSentences', 'gap', 8, 1), block('matchTranslation', 'match', 6, 1), block('writeSentences', 'open', 4, 2)], 22)
    expect(variantPoints({ id: 'v', label: 'A', blocks: genau })).toBe(22)
    for (const b of nachher) expect(b.pointsPerItem).toBeGreaterThanOrEqual(1)
    for (const b of nachher) expect(Number.isInteger(b.pointsPerItem)).toBe(true)
  })

  it('findet die genaue Summe auch bei vielen Aufgaben und meldet die nächstliegende, wenn halbe Punkte nicht reichen', () => {
    const p = ganzePunkteAufSumme([3, 4, 2, 5, 3, 2], [1, 1, 2, 1, 2, 1], 24)!
    expect(p.reduce((s, x, i) => s + x * [3, 4, 2, 5, 3, 2][i], 0)).toBe(24)
    // 3 Items, 2 Punkte: genau ginge nur mit 2/3 Punkt – nächstliegend 1,5 (3 × 0,5)
    // Ganze Punkte (25.10.2026): nie unter 1, auch wenn die Summe kleiner ist
    expect(ganzePunkteAufSumme([3], [1], 2)).toEqual([1])
    // Eine Aufgabe mit nur einem Bild behält ihren Regelwert – die Summe holen die größeren Aufgaben
    expect(ganzePunkteAufSumme([1, 4, 4], [1, 1, 2], 14)).toEqual([1, 1, 2])
    expect(ganzePunkteAufSumme([1, 4, 4], [1, 1, 2], 17)).toEqual([1, 1, 3])
  })
})
