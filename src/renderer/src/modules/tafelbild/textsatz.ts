/**
 * Textsatz ohne DOM: Zeilenumbruch und Schriftgrad nach geschätzter Zeichenbreite.
 *
 * Gemessen wird nicht im Browser, damit Layout, Prüfung und Ausgabe (PDF, PNG, PowerPoint) in
 * Tests und im Hauptprozess dasselbe Ergebnis liefern. Die Schätzung ist vorsichtig (eher zu
 * breit) – lieber eine Zeile mehr als ein Text, der über den Kasten hinausläuft.
 */
import { SCHRIFTEN, ZEILENHOEHE, type Schriftart } from './formate'

/** Breite eines Zeichens in em – schmale und breite Buchstaben grob unterschieden */
function zeichenBreite(c: string, grund: number): number {
  if (/[iljtf.,:;'!|]/.test(c)) return grund * 0.55
  if (/[mwMW@]/.test(c)) return grund * 1.45
  if (/[A-ZÄÖÜ]/.test(c)) return grund * 1.18
  if (c === ' ') return grund * 0.55
  return grund
}

/** Breite eines Textes in Einheiten bei Schriftgrad `groesse` */
export function textBreite(text: string, groesse: number, schrift: Schriftart): number {
  const grund = SCHRIFTEN[schrift].breite
  let b = 0
  for (const c of text) b += zeichenBreite(c, grund)
  return b * groesse
}

/** Umbruch in Zeilen, die in `breite` passen; überlange Wörter werden getrennt */
export function umbrechen(text: string, breite: number, groesse: number, schrift: Schriftart): string[] {
  const zeilen: string[] = []
  for (const absatz of text.split('\n')) {
    const woerter = absatz.split(/\s+/).filter(Boolean)
    // Der Punkt bleibt beim ersten Wort (sonst stünde er allein in einer Zeile)
    if (woerter.length > 1 && /^[•\-–]$/.test(woerter[0])) woerter.splice(0, 2, `${woerter[0]}\u00a0${woerter[1]}`)
    if (!woerter.length) {
      zeilen.push('')
      continue
    }
    // Einzug bei Stichpunkten: Folgezeilen beginnen unter dem Text, nicht unter dem Punkt
    const punkt = /^[•\-–]\u00a0/.test(woerter[0])
    let zeile = ''
    for (let wort of woerter) {
      const probe = zeile ? `${zeile} ${wort}` : wort
      if (textBreite(probe, groesse, schrift) <= breite || !zeile) {
        // Ein einzelnes Wort, das nicht passt: hart trennen
        while (!zeile && textBreite(wort, groesse, schrift) > breite && wort.length > 3) {
          let n = wort.length - 1
          while (n > 2 && textBreite(`${wort.slice(0, n)}-`, groesse, schrift) > breite) n--
          zeilen.push(`${wort.slice(0, n)}-`)
          wort = wort.slice(n)
        }
        zeile = zeile ? `${zeile} ${wort}` : wort
      } else {
        zeilen.push(zeile)
        zeile = punkt ? `  ${wort}` : wort
      }
    }
    zeilen.push(zeile)
  }
  return zeilen
}

export interface Satz {
  groesse: number
  zeilen: string[]
  /** Höhe des gesetzten Textes in Einheiten */
  hoehe: number
  /** Passt der Text bei diesem Grad in die Fläche? */
  passt: boolean
}

/**
 * Größten Schriftgrad zwischen `max` und `min` suchen, bei dem der Text in die Fläche passt.
 * Passt er auch bei `min` nicht, bleibt es bei `min` (die Prüfung meldet das).
 */
export function setzeText(text: string, breite: number, hoehe: number, min: number, max: number, schrift: Schriftart): Satz {
  let g = max
  for (let i = 0; i < 24; i++) {
    const zeilen = umbrechen(text, breite, g, schrift)
    const h = zeilen.length * g * ZEILENHOEHE
    if (h <= hoehe) return { groesse: g, zeilen, hoehe: h, passt: true }
    if (g <= min) break
    g = Math.max(min, g * 0.92)
  }
  const zeilen = umbrechen(text, breite, min, schrift)
  return { groesse: min, zeilen, hoehe: zeilen.length * min * ZEILENHOEHE, passt: false }
}

/** Nötige Höhe eines Textes bei festem Grad */
export const textHoehe = (text: string, breite: number, groesse: number, schrift: Schriftart): number =>
  umbrechen(text, breite, groesse, schrift).length * groesse * ZEILENHOEHE
