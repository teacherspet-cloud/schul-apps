/**
 * Aufgabenverweise in freien Texten („Aufgabe 4", „tasks 1–3", „exercice 2") – gemeinsame Regel für das Kürzen
 * von Materialien (unterrichtsreihe/auswahl.ts, 05.10.2026) und die Zuordnung von Hilfen zu Aufgaben
 * (hilfenZuordnung, 06.10.2026).
 */
import type { Sheet } from '../model/types'

const AUFGABE_WORT = String.raw`(?:Aufgaben?|Aufg\.|Teilaufgaben?|[Tt]asks?|[Ee]xercises?|[Ee]xercices?|[Tt]âches?|[Ee]jercicios?|[Tt]areas?|[Ee]sercizi|[Ee]sercizio)`
const NR = String.raw`\d{1,2}[a-h]?`
const VERBINDER = String.raw`\s*(?:,|und|and|et|y|e|bis|to|à|–|-|/|&)\s*`
const VERWEIS = new RegExp(String.raw`(\b${AUFGABE_WORT}\s+)(${NR}(?:${VERBINDER}${NR})*)(?![\d])`, 'g')
const EINZELNR = /(\d{1,2})([a-h]?)/g

/** Alle Aufgabennummern, auf die ein Text verweist */
export function aufgabenVerweise(text: string): number[] {
  const aus: number[] = []
  for (const m of text.matchAll(VERWEIS)) for (const n of m[2].matchAll(EINZELNR)) aus.push(Number(n[1]))
  return aus
}

/**
 * Verweise umschreiben: `nummern` alt → neu; `buchstaben` je alter Nummer: alte → neue Teilaufgabe („4c" → „3b").
 * Verweist ein sichtbarer Text auf eine ausgeblendete Aufgabe, wird sie als „(entfällt)" gekennzeichnet – nach dem
 * Neuzählen trüge sonst eine ANDERE Aufgabe diese Nummer. Die Lehrkraft bekommt dazu eine Warnung.
 */
export function verweiseUmschreiben(text: string, nummern: Map<number, number | null>, buchstaben: Map<number, Map<string, string>> = new Map()): string {
  if (!/\d/.test(text)) return text
  return text.replace(
    VERWEIS,
    (_ganz, wort: string, liste: string) =>
      wort +
      liste.replace(EINZELNR, (nr: string, z: string, b: string) => {
        const alt = Number(z)
        const neu = nummern.get(alt)
        if (neu === undefined) return nr
        if (neu === null) return `${nr} (entfällt)`
        return `${neu}${b ? (buchstaben.get(alt)?.get(b) ?? b) : ''}`
      })
  )
}

/** Texte eines Bausteins als ein String (für die Verweissuche) */
const texte = (wert: unknown): string => {
  if (typeof wert === 'string') return wert
  if (Array.isArray(wert)) return wert.map(texte).join('\n')
  if (wert && typeof wert === 'object')
    return Object.entries(wert as Record<string, unknown>)
      .filter(([k]) => !['id', 'ref', 'dataUrl', 'url'].includes(k))
      .map(([, v]) => texte(v))
      .join('\n')
  return ''
}

/**
 * Hilfen und Lernhilfen (Tipps, Satzanfänge, Wortspeicher, Hilfekarten) → Nummer ihrer Aufgabe (06.10.2026).
 * Grundlage: ein Verweis im Text („help cards for task 4"), sonst die Aufgabe direkt davor im Blatt. Vor der
 * ersten Aufgabe ohne Verweis: keine Zuordnung (gilt fürs ganze Blatt).
 */
export function hilfenZuordnung(sheet: Pick<Sheet, 'blocks'>): Map<string, number> {
  const aus = new Map<string, number>()
  let nr = 0
  for (const b of sheet.blocks) {
    if (b.type === 'task') {
      nr++
      continue
    }
    if (b.type !== 'scaffold') continue
    const verweis = aufgabenVerweise(texte({ title: b.title, items: b.items }))[0]
    const ziel = verweis ?? (nr > 0 ? nr : undefined)
    if (ziel) aus.set(b.id, ziel)
  }
  return aus
}
