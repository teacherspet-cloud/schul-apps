// Liest aus einer xlsx-Datei, welche Zeilen farbig gedruckt sind.
//
// In den Green-Line-Dateien sind einzelne Einträge rot (in „Transition" auch blau)
// gesetzt: Es sind die Vokabeln, die statt einer Übersetzung eine Erklärung tragen
// (nerd, meme, Coloured …). `read-excel-file` liefert nur Werte, keine Formate –
// deshalb hier ein kleiner Blick in die Tabellenteile der Datei (eine xlsx ist ein Zip).
import JSZip from 'jszip'
import { readFileSync } from 'fs'

/** Standardfarbe (schwarz bzw. Design-Farbe); alles andere gilt als Hervorhebung. */
const isColoured = (font) => {
  const m = /<color\s+rgb="([0-9A-Fa-f]{8})"/.exec(font)
  if (!m) return false
  const rgb = m[1].slice(2).toUpperCase()
  return rgb !== '000000'
}

/**
 * Zeilennummern (1-basiert, wie in Excel) mit farbig gedrucktem Text.
 * Eine Zeile zählt als farbig, sobald eine ihrer Zellen eine Hervorhebungsfarbe trägt.
 */
export async function colouredRows(file) {
  const zip = await JSZip.loadAsync(readFileSync(file))
  const styles = await zip.file('xl/styles.xml').async('string')
  const fonts = [...styles.matchAll(/<font>([\s\S]*?)<\/font>/g)].map((m) => m[1])
  const cellXfs = styles.slice(styles.indexOf('<cellXfs')).match(/<xf [^>]*\/?>/g) ?? []
  const colouredStyles = new Set(
    cellXfs
      .map((xf, i) => [i, Number(/fontId="(\d+)"/.exec(xf)?.[1] ?? 0)])
      .filter(([, fontId]) => isColoured(fonts[fontId] ?? ''))
      .map(([i]) => String(i))
  )
  if (!colouredStyles.size) return new Set()

  const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string')
  const rows = new Set()
  for (const m of sheet.matchAll(/<c r="[A-Z]+(\d+)"(?:[^>]*?\ss="(\d+)")?/g)) {
    if (m[2] && colouredStyles.has(m[2])) rows.add(Number(m[1]))
  }
  return rows
}
