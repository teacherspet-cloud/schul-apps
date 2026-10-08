/**
 * Hilfen für mehrere Regelmodule: eigene Fragenschlange je Person (Handicap), Fragenart nach Schwierigkeit,
 * Abwechseln von Plätzen.
 */
import { frageAus, itemsZiehen, mischen as mischenZ, zufall as zufallZ, type Basis, type FragenArt } from '../kern'
import type { Frage, SpielItem } from '../typen'
import { istFrageItem } from '../inhalt'

export interface MitFragen extends Basis {
  schlange: Record<string, string[]>
  fragen: Record<string, Frage | null>
}

/** Fragenart nach Schwierigkeit: leicht erkennen (Fremdsprache → Deutsch), sonst abrufen; Grammatik immer die Aufgabe */
export const artNach = (z: Basis): FragenArt => (z.inhalt.bereich === 'gram' ? 'standard' : z.schwierigkeit === 'leicht' ? 'erkennen' : 'abrufen')

/** Nächste Frage für eine Person aus ihrer eigenen Schlange (bei Versus nach eigenem Band) */
export function naechsteFrage(
  z: MitFragen,
  wer: string,
  opt: { gemeinsam?: boolean; filter?: (i: SpielItem) => boolean; art?: FragenArt; optionen?: number } = {}
): Frage | null {
  const filter = opt.filter ?? istFrageItem
  let s = z.schlange[wer] ?? []
  if (!s.length) s = itemsZiehen(z, 12, { fuer: opt.gemeinsam ? undefined : wer, filter }).map((i) => i.id)
  const id = s.shift()
  z.schlange[wer] = s
  const item = id ? z.inhalt.items.find((i) => i.id === id) : undefined
  const f = item ? frageAus(z, item, opt.art ?? artNach(z), opt.optionen ?? 4) : null
  z.fragen[wer] = f
  return f
}

/** Falsch beantwortetes Item kommt später wieder (ans Ende der eigenen Schlange) */
export function spaeterNochmal(z: MitFragen, wer: string, itemId: string): void {
  const s = z.schlange[wer] ?? []
  if (!s.includes(itemId)) s.push(itemId)
  z.schlange[wer] = s
}

export const leereFragen = (z: Basis): Pick<MitFragen, 'schlange' | 'fragen'> => ({
  schlange: Object.fromEntries(z.spieler.map((s) => [s.id, []])),
  fragen: Object.fromEntries(z.spieler.map((s) => [s.id, null]))
})

/** Anzahl Items, die sich als Frage eignen */
export const frageItems = (items: SpielItem[]): number => items.filter(istFrageItem).length

// ---------------------------------------------------------------- Gemeinsam ordnen (Satzbaustelle, Bildergeschichte, Übersetzung, Zeitstrahl)

export interface OrdnenKachel {
  id: string
  text: string
  bild?: string
  /** Vergleichswert für die Reihenfolge (gleicher Wert = austauschbar) */
  wert: string
  besitzer: string
  gelegt: boolean
  /** gehört nicht in die Lösung (Übersetzungs-Puzzle) */
  falle?: boolean
}
export interface Ordnen {
  kacheln: OrdnenKachel[]
  ziel: string[]
  gelegt: string[]
}

/** Teile mischen, kurze Kennungen vergeben (verraten die Reihenfolge nicht) und reihum verteilen */
export function ordnenNeu(
  z: Basis,
  teile: { text: string; wert?: string; bild?: string; falle?: boolean }[],
  spieler: string[]
): Ordnen {
  const mitId = teile.map((t, k) => ({ ...t, k }))
  const gemischt = mischenZ(z, mitId)
  const kacheln = gemischt.map((t, n) => ({
    id: `k${Math.floor(zufallZ(z) * 1e6).toString(36)}${n}`,
    text: t.text,
    ...(t.bild ? { bild: t.bild } : {}),
    wert: t.wert ?? t.text,
    besitzer: spieler[n % spieler.length],
    gelegt: false,
    ...(t.falle ? { falle: true } : {})
  }))
  return { kacheln, ziel: teile.filter((t) => !t.falle).map((t) => t.wert ?? t.text), gelegt: [] }
}

/** Kachel legen: richtig, wenn ihr Wert an der nächsten Stelle steht */
export function ordnenLegen(o: Ordnen, wer: string, id: string): 'richtig' | 'falsch' | 'fertig' | null {
  const k = o.kacheln.find((x) => x.id === id && x.besitzer === wer && !x.gelegt)
  if (!k) return null
  if (k.falle || k.wert !== o.ziel[o.gelegt.length]) return 'falsch'
  k.gelegt = true
  o.gelegt.push(k.id)
  return o.gelegt.length >= o.ziel.length ? 'fertig' : 'richtig'
}

/** Kacheln einer Person an die übrigen geben (Person hat das Spiel verlassen) */
export function ordnenUmverteilen(o: Ordnen, weg: string, bleiben: string[]): void {
  if (!bleiben.length) return
  let n = 0
  for (const k of o.kacheln) if (k.besitzer === weg) k.besitzer = bleiben[n++ % bleiben.length]
}

export const ordnenGelegt = (o: Ordnen): string[] => o.gelegt.map((id) => o.kacheln.find((k) => k.id === id)!.text)
