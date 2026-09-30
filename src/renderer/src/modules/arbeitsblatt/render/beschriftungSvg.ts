/**
 * Beschriftetes Bild als EINE Zeichnung (SVG) – für Word (30.09.2026).
 *
 * Word kennt keine Ebene über einem Bild; bisher standen die Beschriftungen dort als Liste unter
 * dem Bild, und von Hand verschobene Punkte gingen verloren. Jetzt entsteht dieselbe Setzung wie
 * auf dem Bildschirm und im PDF (ImageLabels.tsx: Randspalten, Linien, Punkte, Schilder am
 * Bauteil, leere Schreiblinien) als SVG, das die Ausfuhr rastert. Geometrie und Setzung kommen aus
 * denselben Funktionen (imageLabelLayout.ts) – was die Lehrkraft verschoben hat, steht auch in
 * Word an dieser Stelle.
 */
import type { ImageLabel } from '../model/types'
import { bauteilLinie, charsPerLineFor, imageHeightMmFor, layoutImageLabels, schildAnker, spaltenLinie, type Prozentpunkt } from './imageLabelLayout'
import { BESCHRIFTUNG_PT, LEERLINIE_MM, SCHILD_ABSTAND_MM } from './schaltplanSvg'

const SPALTE_MM = 26 // wie LABEL_COL_MM (ImageLabels.tsx)
const SPALTEN_PT = 8.5 // wie .ws-imglabel-box (ws.css)
const PT_MM = 0.3528
const r2 = (v: number): number => Math.round(v * 100) / 100
const escapeXml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Zeilen eines Schildes – gieriger Umbruch wie bei der Setzung */
function zeilen(text: string, zeichen: number): string[] {
  const out: string[] = []
  for (const w of text.trim().split(/\s+/).filter(Boolean)) {
    const letzte = out[out.length - 1]
    if (letzte !== undefined && letzte.length + 1 + w.length <= zeichen) out[out.length - 1] = `${letzte} ${w}`
    else out.push(w)
  }
  return out.length ? out : ['']
}

export interface BeschriftetesBild {
  svg: string
  breiteMm: number
  hoeheMm: number
}

/**
 * Bild mit Beschriftungen als SVG in Millimetern. `breiteMm` = Breite des Bildbausteins (Bild
 * plus Randspalten, falls es Schilder in der Randspalte gibt).
 */
export function beschriftetesBildSvg(opts: { dataUrl: string; groesse: { width: number; height: number }; labels: ImageLabel[]; mitLoesung: boolean; breiteMm: number }): BeschriftetesBild {
  const { dataUrl, groesse, labels, mitLoesung, breiteMm } = opts
  const aussen = labels.filter((l) => !l.inline)
  const amBauteil = labels.filter((l) => l.inline)
  const spalte = aussen.length ? SPALTE_MM : 0
  const flaeche = Math.max(20, breiteMm - 2 * spalte)
  const hoehe = aussen.length ? imageHeightMmFor(breiteMm, SPALTE_MM, groesse) : (flaeche * groesse.height) / groesse.width
  const mm = (p: Prozentpunkt): Prozentpunkt => ({ x: spalte + (p.x / 100) * flaeche, y: (p.y / 100) * hoehe })
  const teile: string[] = [`<image href="${dataUrl}" x="${r2(spalte)}" y="0" width="${r2(flaeche)}" height="${r2(hoehe)}" preserveAspectRatio="none"/>`]
  const linie = (pts: Prozentpunkt[]): string => `<polyline points="${pts.map(mm).map((q) => `${r2(q.x)},${r2(q.y)}`).join(' ')}" fill="none" stroke="#000" stroke-width="0.2"/>`
  const punkt = (l: ImageLabel): string => {
    const q = mm({ x: l.x, y: l.y })
    return `<circle cx="${r2(q.x)}" cy="${r2(q.y)}" r="0.9" fill="#000"/>`
  }

  // Randspalten: dieselbe Setzung wie auf dem Bildschirm
  const gesetzt = layoutImageLabels(aussen, { imageHeightMm: hoehe, colWidthMm: SPALTE_MM })
  const schrift = SPALTEN_PT * PT_MM
  const zeichen = charsPerLineFor(SPALTE_MM, SPALTEN_PT)
  for (const l of aussen) {
    const p = gesetzt.get(l.id) ?? { side: l.x < 50 ? ('left' as const) : ('right' as const), top: l.y }
    teile.push(linie(spaltenLinie(l, p)), punkt(l))
    const links = p.side === 'left'
    const mitte = (p.top / 100) * hoehe
    if (l.blank && !mitLoesung) {
      const x0 = links ? 0.8 : spalte + flaeche + 0.8
      teile.push(`<line x1="${r2(x0)}" y1="${r2(mitte + schrift * 0.5)}" x2="${r2(x0 + SPALTE_MM - 1.6)}" y2="${r2(mitte + schrift * 0.5)}" stroke="#000" stroke-width="0.2"/>`)
      continue
    }
    const zs = zeilen(l.text, zeichen)
    const hoch = schrift * 1.15
    const start = mitte - ((zs.length - 1) * hoch) / 2 + schrift * 0.35
    zs.forEach((z, i) => {
      const x = links ? SPALTE_MM - 0.8 : spalte + flaeche + 0.8
      teile.push(`<text x="${r2(x)}" y="${r2(start + i * hoch)}" text-anchor="${links ? 'end' : 'start'}" font-size="${r2(schrift)}">${escapeXml(z)}</text>`)
    })
  }

  // Schilder am Bauteil (Schaltpläne): Maßstab wie im Druck – 1 Bildeinheit = 1 mm
  const massstab = Math.min(1, flaeche / groesse.width)
  const bs = BESCHRIFTUNG_PT * PT_MM * massstab
  const abstand = SCHILD_ABSTAND_MM * massstab
  for (const l of amBauteil) {
    const weg = bauteilLinie(l)
    if (weg) teile.push(linie(weg), punkt(l))
    const s = mm(schildAnker(l))
    const r = l.inline!
    if (l.blank && !mitLoesung) {
      const w = LEERLINIE_MM * massstab
      const x0 = r === 'links' ? s.x - abstand - w : r === 'rechts' ? s.x + abstand : s.x - w / 2
      const y = r === 'oben' ? s.y - abstand - 0.3 : r === 'unten' ? s.y + abstand + bs * 1.1 : s.y + bs * 0.5
      teile.push(`<line x1="${r2(x0)}" y1="${r2(y)}" x2="${r2(x0 + w)}" y2="${r2(y)}" stroke="#000" stroke-width="0.25"/>`)
      continue
    }
    const anchor = r === 'links' ? 'end' : r === 'rechts' ? 'start' : 'middle'
    const x = r === 'links' ? s.x - abstand : r === 'rechts' ? s.x + abstand : s.x
    const y = r === 'oben' ? s.y - abstand - bs * 0.25 : r === 'unten' ? s.y + abstand + bs * 0.85 : s.y + bs * 0.35
    teile.push(`<text x="${r2(x)}" y="${r2(y)}" text-anchor="${anchor}" font-size="${r2(bs)}">${escapeXml(l.text)}</text>`)
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(breiteMm)} ${r2(hoehe)}" width="${r2(breiteMm)}mm" height="${r2(hoehe)}mm">`,
    `<rect width="100%" height="100%" fill="#fff"/>`,
    `<g font-family="Arial, Helvetica, sans-serif" fill="#000">${teile.join('')}</g>`,
    `</svg>`
  ].join('')
  return { svg, breiteMm: aussen.length ? breiteMm : flaeche, hoeheMm: hoehe }
}
