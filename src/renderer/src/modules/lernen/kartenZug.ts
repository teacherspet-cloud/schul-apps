/**
 * Ziehen/Wischen der Lernkarte als reiner Zustand (09.10.2026, Befund der Lehrkraft: Karteikarten „froren" mitten in der
 * Runde ein – nicht mehr umzudrehen, Mauszeiger als Greifhand, erst F5 half).
 *
 * Ursache: Der Zug merkte sich den Startpunkt beim Drücken und vergaß ihn nur beim Loslassen ÜBER der Karte. Endete der
 * Zug anders – losgelassen neben der Karte, vom Browser abgebrochen (Bild oder markierter Text wird gezogen, Tablet
 * scrollt, Fenster verliert den Fokus) –, blieb der Startpunkt stehen: Die Karte kippte beim bloßen Überfahren mit der
 * Maus mit, und ein Klick mit leichter Bewegung (6–40 px) drehte sie nicht um. Markierter Text auf der Karte (Doppelklick)
 * ließ jedes weitere Drücken zum Ziehen des Textes werden – die Karte rührte sich nicht mehr, bis die Seite neu geladen war.
 *
 * Jetzt: Ein Zug gehört genau einem Zeiger (pointerId), jedes Loslassen nach einem Drücken auf der Karte dreht sie um,
 * und Abbruch, verlorener Zeiger, Fensterwechsel und Ausblenden setzen den Zug zurück.
 */
export interface KartenZug {
  /** Zeiger, der gerade zieht (null = kein Zug) */
  zeiger: number | null
  start: number
  /** Ausschlag in Grad (begrenzt) */
  zug: number
}

export const KEIN_ZUG: KartenZug = { zeiger: null, start: 0, zug: 0 }
/** Größter Ausschlag beim Ziehen (Grad) */
export const ZUG_MAX = 60

export function zugBeginnen(z: KartenZug, zeiger: number, x: number): KartenZug {
  // Ein zweiter Finger übernimmt nicht mitten im Zug
  if (z.zeiger !== null && z.zeiger !== zeiger) return z
  return { zeiger, start: x, zug: 0 }
}

export function zugBewegen(z: KartenZug, zeiger: number, x: number): KartenZug {
  if (z.zeiger === null || z.zeiger !== zeiger) return z
  const zug = Math.max(-ZUG_MAX, Math.min(ZUG_MAX, x - z.start))
  return zug === z.zug ? z : { ...z, zug }
}

/** Loslassen: umdrehen, wenn der Zug auf der Karte begann – ob getippt, gezogen oder gewischt */
export function zugBeenden(z: KartenZug, zeiger: number): { zug: KartenZug; umdrehen: boolean } {
  if (z.zeiger === null || z.zeiger !== zeiger) return { zug: z, umdrehen: false }
  return { zug: KEIN_ZUG, umdrehen: true }
}

/** Abbruch (pointercancel, lostpointercapture, blur, Seite ausgeblendet): Karte zurück in Ruhe, nichts umdrehen */
export function zugAbbrechen(z: KartenZug, zeiger?: number): KartenZug {
  if (zeiger !== undefined && z.zeiger !== null && z.zeiger !== zeiger) return z
  return z.zeiger === null && z.zug === 0 ? z : KEIN_ZUG
}

/**
 * Ist die fremdsprachige Seite der Lernkarte zu sehen? Nur dann gibt es Aussprache (09.10.2026: bei deutscher
 * Vorderseite verriet der Lautsprecher die Antwort). `deutschVorn`: Vorderseite deutsch; `umgedreht`: Rückseite oben.
 */
export const fremdSeiteSichtbar = (deutschVorn: boolean, umgedreht: boolean): boolean => (deutschVorn ? umgedreht : !umgedreht)
