/**
 * Bilder eines digitalen Arbeitsblatts, die Lernende vergrößern und markieren können (25.10.2026, Wunsch der Lehrkraft).
 *
 * `blattBilder` ist eine selbstständige Funktion ohne Bezüge nach außen: Die Schülersicht ruft sie im iframe auf
 * (BlattAusfuellen.tsx `messen`), der Server führt sie per `toString()` im gesetzten Blatt aus (druck.ts
 * `seitenMitTinte`), damit die Markierungen auf den Seitenbildern für Lehrkraft und KI an derselben Stelle liegen.
 * Gleiche Reihenfolge → gleiche Kennungen b0, b1, …
 *
 * Nicht dabei: Schullogo, Piktogramme, Kopf/Fuß, Diagramme und Raster (eigene Zeichenflächen), Bilder mit
 * Beschriftungsaufgabe (ImageLabels) und gelöste Beispiele. Kleine Bilder (unter 120 × 80 px) lohnen kein Vollbild.
 */

/** Objekte (Kästchen, Linien …) eines Bilds liegen auf „Seite" BILD_SEITE + Bildnummer – Blattseiten zählen von 0 */
export const BILD_SEITE = 20
/** Höchstens so viele Bilder je Blatt (objekteAus erlaubt Seiten bis 40) */
export const BILDER_HOECHSTENS = 20
/** Schlüssel der Tinte eines Bilds in `blatt_abgaben.tinte` */
export const bildTinteSchluessel = (id: string): string => `bild:${id}`
export const BILD_TINTE_MUSTER = /^bild:b(1?\d)$/

export function blattBilder(doc: Document): { el: HTMLImageElement; seite: number }[] {
  const aus: { el: HTMLImageElement; seite: number }[] = []
  const seiten = Array.from(doc.querySelectorAll('.ws-page'))
  for (let i = 0; i < seiten.length; i++) {
    for (const el of Array.from(seiten[i].querySelectorAll('img'))) {
      if (aus.length >= 20) return aus
      if (el.closest('.ws-header, .ws-footer, .ws-diagram, .ws-grid, .ws-imglabel-area, .ws-task-num, .ws-social, .ws-example')) continue
      if (el.classList.contains('ws-picto') || el.classList.contains('ws-logo')) continue
      const r = el.getBoundingClientRect()
      if (r.width < 120 || r.height < 80) continue
      aus.push({ el, seite: i })
    }
  }
  return aus
}
