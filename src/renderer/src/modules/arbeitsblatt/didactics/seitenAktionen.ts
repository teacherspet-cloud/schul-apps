import type { Answer, SeitenVorschlag, WsBlock } from '../model/types'

/**
 * „Vorschlag der App umsetzen" (Wunsch der Lehrkraft, 30.09.2026): Vorschläge aus dem Hinweis
 * zur Seitenzahl, die sich OHNE KI und ohne Eingriff in den Inhalt umsetzen lassen.
 *
 * Alle Aktionen verändern die übergebenen Bausteine an Ort und Stelle (im Entwurf des Stores,
 * damit sie EIN Rückgängig-Schritt sind) und melden, wie viele Bausteine sie geändert haben.
 * Eine „Stufe" ist bewusst klein (ein Viertel weniger Schreibraum, ein Fünftel kleinere
 * Bilder): Nach dem Umsetzen misst die App neu – reicht es nicht, bietet der Hinweis dieselbe
 * Stufe noch einmal an. Untergrenzen verhindern, dass Schreibraum oder Bild unbrauchbar werden.
 */

/** Freie Fläche nie unter 15 mm, Linien nie unter eine, Rechenkästchen nie unter zwei Zeilen */
export const SCHREIBRAUM_MIN = { flaecheMm: 15, linien: 1, kaestchenZeilen: 2 } as const

/** Material-Bilder bleiben lesbar (mind. halbe Spaltenbreite), andere mind. 30 % */
export const BILD_MIN_PROZENT = { material: 50, sonst: 30 } as const

/** Um ein Viertel verringern, mindestens um eins; nie unter `min` */
const stufeRunter = (wert: number, min: number): number => Math.max(min, wert - Math.max(1, Math.round(wert * 0.25)))

/** Lässt sich der Schreibraum dieser Antwort verringern? Ändert sie, wenn `anwenden` */
function antwortKnapper(a: Answer | undefined, anwenden: boolean): boolean {
  if (!a) return false
  if (a.kind === 'lines' && a.count > SCHREIBRAUM_MIN.linien) {
    if (anwenden) a.count = stufeRunter(a.count, SCHREIBRAUM_MIN.linien)
    return true
  }
  if (a.kind === 'grid' && a.count > SCHREIBRAUM_MIN.kaestchenZeilen) {
    if (anwenden) a.count = stufeRunter(a.count, SCHREIBRAUM_MIN.kaestchenZeilen)
    return true
  }
  if (a.kind === 'space' && a.heightMm > SCHREIBRAUM_MIN.flaecheMm) {
    if (anwenden) a.heightMm = Math.max(SCHREIBRAUM_MIN.flaecheMm, Math.round(a.heightMm * 0.75))
    return true
  }
  return false
}

function bausteinKnapper(b: WsBlock, anwenden: boolean): boolean {
  if (b.type === 'task') {
    // Jede Antwortfläche prüfen (nicht beim ersten Treffer aufhören), damit alle eine Stufe knapper werden
    const treffer = [antwortKnapper(b.answer, anwenden), ...b.parts.map((p) => antwortKnapper(p.answer, anwenden))]
    return treffer.some(Boolean)
  }
  if (b.type === 'workspace' && b.heightMm > SCHREIBRAUM_MIN.flaecheMm) {
    if (anwenden) b.heightMm = Math.max(SCHREIBRAUM_MIN.flaecheMm, Math.round(b.heightMm * 0.75))
    return true
  }
  return false
}

/** Bausteine, deren Schreibraum (Linien, Kästchen, freie Fläche) sich noch verringern lässt */
export const schreibraumBausteine = (blocks: WsBlock[]): WsBlock[] => blocks.filter((b) => bausteinKnapper(b, false))

/** Schreibraum aller Aufgaben und Schreibflächen um eine Stufe verringern – Zahl der geänderten Bausteine */
export function schreibraumKnapper(blocks: WsBlock[]): number {
  let n = 0
  for (const b of blocks) if (bausteinKnapper(b, true)) n++
  return n
}

const bildMin = (b: WsBlock): number => (b.type === 'image' && b.role === 'material' ? BILD_MIN_PROZENT.material : BILD_MIN_PROZENT.sonst)

/** Bilder, die sich noch verkleinern lassen */
export const bildBausteine = (blocks: WsBlock[]): WsBlock[] => blocks.filter((b) => b.type === 'image' && (b.widthPercent || 0) > bildMin(b))

/** Alle Bilder um ein Fünftel verkleinern (Höhe folgt der Breite) – Zahl der geänderten Bilder */
export function bilderKleiner(blocks: WsBlock[]): number {
  let n = 0
  for (const b of bildBausteine(blocks)) {
    if (b.type !== 'image') continue
    b.widthPercent = Math.max(bildMin(b), Math.round(b.widthPercent * 0.8))
    n++
  }
  return n
}

/** Hilfen zwischen den Aufgaben auf die Hilfekarten legen (zählen nicht zur Seitenzahl) */
export function hilfenAufKarten(blocks: WsBlock[]): number {
  let n = 0
  for (const b of blocks)
    if (b.type === 'scaffold' && b.variant !== 'hilfekarten') {
      b.variant = 'hilfekarten'
      n++
    }
  return n
}

/** Vorschläge, die die App selbst (ohne KI, lokal) umsetzt */
export const LOKALE_AKTIONEN: Partial<Record<SeitenVorschlag['art'], (blocks: WsBlock[]) => number>> = {
  hilfenAufKarten,
  schreibraumKnapper,
  bilderKleiner
}

/** Setzt die App diesen Vorschlag ohne KI um? */
export const lokalUmsetzbar = (v: SeitenVorschlag): boolean => Boolean(LOKALE_AKTIONEN[v.art])

/**
 * Lokale Vorschläge auf die Bausteine anwenden – als EIN Schritt (Aufrufer: `update`).
 * Rückgabe: je Vorschlag, wie viele Bausteine er geändert hat.
 */
export function lokaleVorschlaegeAnwenden(blocks: WsBlock[], vorschlaege: SeitenVorschlag[]): { art: SeitenVorschlag['art']; geaendert: number }[] {
  const out: { art: SeitenVorschlag['art']; geaendert: number }[] = []
  for (const v of vorschlaege) {
    const aktion = LOKALE_AKTIONEN[v.art]
    if (aktion && !out.some((o) => o.art === v.art)) out.push({ art: v.art, geaendert: aktion(blocks) })
  }
  return out
}

/** Kurzer Name eines Vorschlags – für das Kreismenü (der ganze Text steht als Titel dabei) */
export function vorschlagKurz(v: SeitenVorschlag): string {
  switch (v.art) {
    case 'hilfenAufKarten':
      return 'Hilfen auf Hilfekarten'
    case 'schreibraumKnapper':
      return 'Schreibraum knapper'
    case 'bilderKleiner':
      return 'Bilder kleiner'
    case 'materialKuerzen':
      return 'Material kürzen (KI)'
    case 'zusammenlegen':
      return 'Aufgaben zusammenlegen (KI)'
    case 'vertiefung':
      return 'Vertiefungsaufgabe (KI)'
    case 'sicherung':
      return 'Sicherungsaufgabe (KI)'
    case 'transfer':
      return 'Transferaufgabe (KI)'
    default:
      return v.text.length > 40 ? `${v.text.slice(0, 38)}…` : v.text
  }
}
