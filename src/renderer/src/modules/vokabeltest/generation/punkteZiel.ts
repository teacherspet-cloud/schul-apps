import type { Block } from '../model/types'
import { blockPoints, itemCount } from '../model/blocks'
import { TASK_TYPES } from './taskTypes'

/**
 * Punkte einer fertigen Variante auf die Vorgabe bringen (02.10.2026).
 *
 * Befund der Lehrkraft: „Obwohl ich 21 Punkte bei der Erstellung angebe, werden die Tests mit 25
 * oder 26 Punkten insgesamt erstellt." Die Punkte wurden VOR der Erzeugung auf die geplanten
 * Vokabelzahlen verteilt; die fertigen Aufgaben haben aber oft mehr bewertete Einheiten (die KI
 * liefert eine Lücke mehr, eine Zuordnung mit zusätzlichen Paaren, eine Verbtabelle mit mehreren
 * Formen je Verb, eine Aufgabe ohne Vokabelbezug). Deshalb hier NACH der Erzeugung: Punkte je Item
 * in GANZEN Punkten (25.10.2026, Wunsch der Lehrkraft: keine halben Punkte – „Write sentences" hatte bei
 * 4 Wörtern 6 Punkte), gewichtet wie die Standardpunkte der Formate, Summe genau die Vorgabe – soweit
 * mit ganzen Punkten möglich. Aufgaben mit nur ein oder zwei Einheiten behalten ihren Regelwert, solange
 * es größere Aufgaben gibt (Befund: ein einzelnes Bild bekam 2 Punkte, nur damit die Summe stimmt).
 * Latein-Formen (getrennte Form- und Bedeutungspunkte) bleiben, wie sie sind, und werden von der
 * Vorgabe abgezogen.
 */
export function punkteAufZiel(blocks: Block[], ziel: number): Block[] {
  const summe = (b: Block[]): number => b.reduce((s, x) => s + blockPoints(x), 0)
  // Stimmt die Summe schon (die Planung hat sie genau getroffen), bleibt alles, wie es ist
  if (Math.abs(summe(blocks) - ziel) < 0.01) return blocks
  let bester = verteile(blocks, ziel)
  /*
   * Mit ganzen Punkten nicht genau zu treffen – etwa fünf Aufgaben mit je 4 Items: jede Summe ist
   * durch 4 teilbar, 21 geht nicht. Die Planung löst das, indem sie Vokabeln zwischen den Aufgaben
   * verschiebt; nach der Erzeugung geht das nicht mehr. Dann fällt das letzte Item der längsten
   * Aufgabe mit einfacher Itemliste weg (höchstens drei) – lieber eine Frage weniger als eine
   * andere Punktzahl als bestellt.
   */
  let kuerzer = blocks
  for (let i = 0; i < 3 && Math.abs(summe(bester) - ziel) >= 0.01; i++) {
    const k = kuerzbar(kuerzer)
    if (k < 0) break
    kuerzer = kuerzer.map((b, j) => (j === k ? ({ ...b, items: (b as { items: unknown[] }).items.slice(0, -1) } as Block) : b))
    const versuch = verteile(kuerzer, ziel)
    if (Math.abs(summe(versuch) - ziel) < Math.abs(summe(bester) - ziel)) bester = versuch
  }
  return bester
}

/** Formate, bei denen jedes Item eine eigene Vokabel prüft und sich ohne Folgen streichen lässt */
const KUERZBAR = new Set<Block['kind']>(['gap', 'choice', 'open', 'scramble', 'oddOneOut', 'trueFalse'])

/** Die längste kürzbare Aufgabe (mit mehr als zwei Items); -1, wenn keine */
function kuerzbar(blocks: Block[]): number {
  let beste = -1
  blocks.forEach((b, i) => {
    if (!KUERZBAR.has(b.kind)) return
    const n = itemCount(b)
    if (n > 2 && (beste < 0 || n > itemCount(blocks[beste]))) beste = i
  })
  return beste
}

function verteile(blocks: Block[], ziel: number): Block[] {
  const fest = blocks.filter((b) => b.kind === 'latinForms').reduce((s, b) => s + blockPoints(b), 0)
  const offen = blocks
    .map((b, i) => ({ i, count: b.kind === 'freeText' ? 1 : itemCount(b), gewicht: Math.max(1, TASK_TYPES[b.taskType]?.defaultPoints ?? 1) }))
    .filter((e) => blocks[e.i].kind !== 'latinForms' && e.count > 0)
  const rest = ziel - fest
  if (!offen.length || rest <= 0) return blocks
  const punkte = ganzePunkteAufSumme(
    offen.map((e) => e.count),
    offen.map((e) => e.gewicht),
    rest
  )
  if (!punkte) return blocks
  const neu = [...blocks]
  offen.forEach((e, k) => {
    const b = neu[e.i]
    neu[e.i] = { ...b, pointsPerItem: punkte[k] } as Block
  })
  return neu
}

/** Aufgaben mit so wenigen Einheiten behalten ihren Regelwert, solange es größere gibt (25.10.2026) */
const KLEIN = 2

/**
 * Ganze Punkte je Einheit, sodass Σ Anzahl·Punkte = Summe und die Verhältnisse den Gewichten nahe
 * bleiben. Bis zu fünf Gruppen werden alle nahen Kombinationen geprüft, sonst schrittweise
 * nachjustiert. Ist die Summe mit ganzen Punkten nicht genau zu treffen, kommt die nächstliegende.
 * Gruppen mit höchstens KLEIN Einheiten bleiben beim gerundeten Regelwert, wenn es größere gibt.
 */
export function ganzePunkteAufSumme(counts: number[], gewichte: number[], summe: number): number[] | null {
  const gesamtGewicht = counts.reduce((s, c, i) => s + c * gewichte[i], 0)
  if (!gesamtGewicht) return null
  const ideal = gewichte.map((g) => (g * summe) / gesamtGewicht)
  const ganz = (x: number): number => Math.max(1, Math.round(x))
  const total = (p: number[]): number => p.reduce((s, x, i) => s + x * counts[i], 0)
  const kosten = (p: number[]): number => p.reduce((s, x, i) => s + counts[i] * (x - ideal[i]) ** 2, 0)
  const grosse = counts.some((c) => c > KLEIN)
  const fest = (i: number): boolean => grosse && counts[i] <= KLEIN
  if (counts.length <= 5) {
    const optionen = ideal.map((x, i) => (fest(i) ? [ganz(gewichte[i])] : [-2, -1, 0, 1, 2].map((d) => ganz(x) + d).filter((p) => p >= 1)))
    let beste: number[] | null = null
    let besteAbweichung = Infinity
    let besteKosten = Infinity
    const waehle = (i: number, combo: number[]): void => {
      if (i === counts.length) {
        const ab = Math.abs(total(combo) - summe)
        const k = kosten(combo)
        if (ab < besteAbweichung - 0.001 || (Math.abs(ab - besteAbweichung) < 0.001 && k < besteKosten)) {
          beste = [...combo]
          besteAbweichung = ab
          besteKosten = k
        }
        return
      }
      for (const p of optionen[i]) waehle(i + 1, [...combo, p])
    }
    waehle(0, [])
    return beste
  }
  const p = ideal.map((x, i) => (fest(i) ? ganz(gewichte[i]) : ganz(x)))
  for (let guard = 0; guard < 400; guard++) {
    const diff = summe - total(p)
    if (Math.abs(diff) < 0.01) break
    const schritt = diff > 0 ? 1 : -1
    const kandidaten = counts
      .map((_, i) => i)
      .filter((i) => !fest(i) && Math.abs(schritt * counts[i]) <= Math.abs(diff) + 0.001 && p[i] + schritt >= 1)
      .sort((a, b) => counts[a] - counts[b])
    if (!kandidaten.length) break
    p[kandidaten[0]] += schritt
  }
  return p
}
