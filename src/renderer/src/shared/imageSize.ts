/**
 * Bildmaße aus einer data:-Adresse – ohne das Bild zu laden.
 *
 * Gebraucht, wo ein Layout OHNE Browser-Messung stimmen muss: Die Beschriftungen an einem
 * Bild (`render/ImageLabels.tsx`) werden auch im Druck-HTML gesetzt, das als reines Markup
 * in ein Fenster geladen und zu PDF gedruckt wird – dort läuft kein Skript, das nachmessen
 * könnte. Das Seitenverhältnis steht aber im Kopf jeder Bilddatei; hier wird es gelesen.
 *
 * Unterstützt: PNG (IHDR), JPEG (SOF-Marker), GIF, WebP (VP8, VP8L, VP8X) und SVG
 * (viewBox bzw. width/height). Unbekannt → null.
 */

export interface ImageSize {
  width: number
  height: number
}

const cache = new Map<string, ImageSize | null>()

/** Base64 → Bytes, nur so viele wie nötig. */
function bytesOf(dataUrl: string, maxBytes: number): Uint8Array | null {
  const komma = dataUrl.indexOf(',')
  if (komma < 0) return null
  const kopf = dataUrl.slice(0, komma)
  const body = dataUrl.slice(komma + 1)
  if (!/;base64/i.test(kopf)) return null
  // 4 Base64-Zeichen = 3 Bytes; etwas mehr lesen, damit die Grenze nicht mitten im Block liegt
  const zeichen = Math.min(body.length, Math.ceil(maxBytes / 3) * 4 + 4)
  try {
    const bin = atob(body.slice(0, zeichen - (zeichen % 4)))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

const u32be = (b: Uint8Array, i: number): number => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
const u16be = (b: Uint8Array, i: number): number => (b[i] << 8) | b[i + 1]
const u16le = (b: Uint8Array, i: number): number => b[i] | (b[i + 1] << 8)

function png(b: Uint8Array): ImageSize | null {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null
  return { width: u32be(b, 16), height: u32be(b, 20) }
}

function gif(b: Uint8Array): ImageSize | null {
  if (b.length < 10 || b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return null
  return { width: u16le(b, 6), height: u16le(b, 8) }
}

function jpeg(b: Uint8Array): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++
      continue
    }
    const marker = b[i + 1]
    if (marker === 0xff) {
      i++
      continue
    }
    // SOF0–SOF15 außer DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: u16be(b, i + 5), width: u16be(b, i + 7) }
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    const len = u16be(b, i + 2)
    if (len < 2) return null
    i += 2 + len
  }
  return null
}

function webp(b: Uint8Array): ImageSize | null {
  if (b.length < 30 || String.fromCharCode(b[0], b[1], b[2], b[3]) !== 'RIFF' || String.fromCharCode(b[8], b[9], b[10], b[11]) !== 'WEBP') return null
  const chunk = String.fromCharCode(b[12], b[13], b[14], b[15])
  if (chunk === 'VP8 ') return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff }
  if (chunk === 'VP8L') {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) }
  return null
}

function svg(dataUrl: string): ImageSize | null {
  const komma = dataUrl.indexOf(',')
  if (komma < 0) return null
  const kopf = dataUrl.slice(0, komma)
  let text = dataUrl.slice(komma + 1)
  try {
    text = /;base64/i.test(kopf) ? atob(text.slice(0, 4000)) : decodeURIComponent(text.slice(0, 4000))
  } catch {
    return null
  }
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0]
  if (!tag) return null
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag)
  if (vb) return { width: Number(vb[1]), height: Number(vb[2]) }
  const w = /\bwidth\s*=\s*["']([\d.]+)/i.exec(tag)?.[1]
  const h = /\bheight\s*=\s*["']([\d.]+)/i.exec(tag)?.[1]
  return w && h ? { width: Number(w), height: Number(h) } : null
}

/** Breite und Höhe in Pixeln (SVG: in Einheiten der viewBox) – oder null, wenn unlesbar. */
export function imageSizeFromDataUrl(dataUrl: string | undefined): ImageSize | null {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null
  const schluessel = dataUrl.length > 200 ? `${dataUrl.slice(0, 160)}#${dataUrl.length}` : dataUrl
  const bekannt = cache.get(schluessel)
  if (bekannt !== undefined) return bekannt
  let size: ImageSize | null = null
  if (/^data:image\/svg/i.test(dataUrl)) size = svg(dataUrl)
  else {
    const b = bytesOf(dataUrl, 64 * 1024)
    if (b) size = png(b) ?? gif(b) ?? webp(b) ?? jpeg(b)
  }
  if (size && (!(size.width > 0) || !(size.height > 0))) size = null
  cache.set(schluessel, size)
  return size
}
