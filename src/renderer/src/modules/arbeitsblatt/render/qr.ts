/**
 * QR-Code als SVG – für den Hörtext auf dem Arbeitsblatt.
 *
 * Der Code wird ohne Netz erzeugt und zeigt auf die Adresse, unter der die Lehrkraft
 * die Audiodatei abgelegt hat (z. B. ein Cloud-Ordner). Ohne Adresse gibt es keinen Code.
 */
import QRCode from 'qrcode'

/** Fehlerkorrektur M: verträgt Kopierfehler und Knicke, bleibt aber klein. */
export function qrSvg(value: string, sizeMm: number): string {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const data = qr.modules.data
  const quiet = 2
  const total = n + quiet * 2
  const parts: string[] = []
  for (let y = 0; y < n; y++) {
    let x = 0
    while (x < n) {
      if (!data[y * n + x]) {
        x++
        continue
      }
      let run = 1
      while (x + run < n && data[y * n + x + run]) run++
      parts.push(`M${x + quiet} ${y + quiet}h${run}v1h-${run}z`)
      x += run
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sizeMm}mm" height="${sizeMm}mm" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">`,
    `<rect width="${total}" height="${total}" fill="#ffffff"/>`,
    `<path d="${parts.join('')}" fill="#000000"/>`,
    '</svg>'
  ].join('')
}

export function qrDataUrl(value: string, sizeMm: number): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg(value, sizeMm))}`
}
