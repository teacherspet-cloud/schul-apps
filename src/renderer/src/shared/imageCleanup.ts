/**
 * Hintergründe aus Bildern entfernen.
 *
 * - Schachbrettmuster: Viele Cliparts speichern die „Transparenz“ als graues Karomuster ins Bild.
 *   Es wird von den Rändern her weggenommen (Flutfüllung), damit gleichfarbige Flächen im Motiv bleiben.
 * - Chromakey (Neongrün): Abstand zur Schlüsselfarbe in der Cb-Cr-Ebene (YCbCr, ohne Helligkeit) – so stören
 *   Schatten und ungleichmäßiges Grün nicht. Weicher Übergang an den Kanten, danach Spill-Entfernung,
 *   damit kein grüner Saum bleibt (Vorgehen wie in gängigen Chromakey-Bibliotheken).
 */

export interface PixelData {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** Standard-Greenscreen („chroma key green“), den auch KI-Bilder erzeugen sollen */
export const KEY_GREEN = '#00b140'

export interface ChromaOptions {
  /** Abstand in der Cb-Cr-Ebene, ab dem ein Pixel als Vordergrund gilt */
  threshold: number
  /** Breite des weichen Übergangs */
  feather: number
  /** Stärke der Spill-Entfernung (0–1) */
  despill: number
}

export const CHROMA_DEFAULTS: ChromaOptions = { threshold: 42, feather: 14, despill: 0.9 }

export type BackgroundKind = 'none' | 'checkerboard' | 'chroma'

export interface BackgroundInfo {
  kind: BackgroundKind
  /** Chromakey: Schlüsselfarbe als [Cb, Cr] */
  key?: [number, number]
  /** Schachbrett: die beiden Grautöne */
  tones?: [number, number]
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** YCbCr nach BT.601 – für den Farbabstand zählen nur Cb und Cr. */
export function toCbCr(r: number, g: number, b: number): [number, number] {
  return [128 - 0.168736 * r - 0.331264 * g + 0.5 * b, 128 + 0.5 * r - 0.418688 * g - 0.081312 * b]
}

const chromaDistance = (r: number, g: number, b: number, key: [number, number]): number => {
  const [cb, cr] = toCbCr(r, g, b)
  return Math.hypot(cb - key[0], cr - key[1])
}

const saturation = (r: number, g: number, b: number): number => Math.max(r, g, b) - Math.min(r, g, b)

/** Pixelnummern des Randes (Ring von etwa 3 % der kürzeren Seite) */
function borderIndices(d: PixelData): number[] {
  const ring = Math.max(2, Math.round(Math.min(d.width, d.height) * 0.03))
  const out: number[] = []
  for (let y = 0; y < d.height; y++) {
    const edgeRow = y < ring || y >= d.height - ring
    for (let x = 0; x < d.width; x++) {
      if (edgeRow || x < ring || x >= d.width - ring) out.push((y * d.width + x) * 4)
    }
  }
  return out
}

/**
 * Welcher Hintergrund liegt vor? Geprüft wird nur der Rand, weil dort der Hintergrund liegt.
 */
export function detectBackground(d: PixelData): BackgroundInfo {
  const idx = borderIndices(d)
  if (!idx.length) return { kind: 'none' }
  const px = (i: number): [number, number, number] => [d.data[i], d.data[i + 1], d.data[i + 2]]

  // 1) Farbiger Hintergrund (Greenscreen o. Ä.): kräftig gesättigt und über den Rand hinweg einheitlich
  let sumCb = 0
  let sumCr = 0
  let colored = 0
  for (const i of idx) {
    const [r, g, b] = px(i)
    if (saturation(r, g, b) > 60) {
      const [cb, cr] = toCbCr(r, g, b)
      sumCb += cb
      sumCr += cr
      colored++
    }
  }
  if (colored / idx.length > 0.6) {
    const key: [number, number] = [sumCb / colored, sumCr / colored]
    const close = idx.filter((i) => chromaDistance(...px(i), key) < 30).length
    // Nur echte Greenscreens: deutlich bunt und im Grünbereich (Cb und Cr unter Neutral).
    // Blaue oder rote Flächen bleiben stehen, damit Fotos mit Himmel oder roter Wand nicht zerstört werden.
    const green = key[0] < 118 && key[1] < 118 && Math.hypot(key[0] - 128, key[1] - 128) > 30
    if (close / idx.length > 0.6 && green) return { kind: 'chroma', key }
  }

  // 2) Schachbrettmuster: zwei helle, neutrale Töne, die sich regelmäßig abwechseln
  const counts = new Map<number, number>()
  let neutral = 0
  for (const i of idx) {
    const [r, g, b] = px(i)
    if (saturation(r, g, b) <= 14 && r >= 180) {
      const bucket = Math.round(r / 4) * 4
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
      neutral++
    }
  }
  if (neutral / idx.length > 0.85) {
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
    if (top.length === 2 && Math.abs(top[0][0] - top[1][0]) >= 8 && top[1][1] / neutral > 0.2) {
      return { kind: 'checkerboard', tones: [top[0][0], top[1][0]] }
    }
  }
  return { kind: 'none' }
}

/** Setzt zusammenhängende Hintergrundflächen ab dem Rand durchsichtig. */
export function removeFlood(d: PixelData, matches: (r: number, g: number, b: number, p: number) => boolean): number {
  const { width, height, data } = d
  const seen = new Uint8Array(width * height)
  const stack: number[] = []
  const push = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const p = y * width + x
    if (seen[p]) return
    seen[p] = 1
    const i = p * 4
    if (!matches(data[i], data[i + 1], data[i + 2], p)) return
    data[i + 3] = 0
    stack.push(p)
  }
  for (let x = 0; x < width; x++) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    push(0, y)
    push(width - 1, y)
  }
  let removed = 0
  while (stack.length) {
    const p = stack.pop()!
    removed++
    const x = p % width
    const y = (p - x) / width
    push(x - 1, y)
    push(x + 1, y)
    push(x, y - 1)
    push(x, y + 1)
  }
  return removed
}

/** Zählt Treffer je Fenster über Summenbilder – damit bleibt die Musterprüfung auch bei großen Bildern schnell. */
function windowCounts(width: number, height: number, mask: Uint8Array, radius: number): (p: number) => number {
  const sums = new Int32Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      row += mask[y * width + x]
      sums[(y + 1) * (width + 1) + x + 1] = sums[y * (width + 1) + x + 1] + row
    }
  }
  return (p: number) => {
    const x = p % width
    const y = (p - x) / width
    const x0 = Math.max(0, x - radius)
    const y0 = Math.max(0, y - radius)
    const x1 = Math.min(width, x + radius + 1)
    const y1 = Math.min(height, y + radius + 1)
    return sums[y1 * (width + 1) + x1] - sums[y0 * (width + 1) + x1] - sums[y1 * (width + 1) + x0] + sums[y0 * (width + 1) + x0]
  }
}

/**
 * Entfernt das Karomuster vom Rand her. Weggenommen wird nur, wo beide Karotöne dicht beieinander vorkommen –
 * eine einfarbig graue Fläche im Motiv bleibt dadurch erhalten.
 */
export function removeCheckerboard(d: PixelData, tones: [number, number], radius = 16): number {
  const near = (v: number, tone: number): boolean => Math.abs(v - tone) <= 10
  const isTone = (i: number, tone: number): boolean =>
    saturation(d.data[i], d.data[i + 1], d.data[i + 2]) <= 16 && near(d.data[i], tone) && near(d.data[i + 1], tone) && near(d.data[i + 2], tone)
  const maskA = new Uint8Array(d.width * d.height)
  const maskB = new Uint8Array(d.width * d.height)
  for (let p = 0; p < maskA.length; p++) {
    maskA[p] = isTone(p * 4, tones[0]) ? 1 : 0
    maskB[p] = isTone(p * 4, tones[1]) ? 1 : 0
  }
  const countA = windowCounts(d.width, d.height, maskA, radius)
  const countB = windowCounts(d.width, d.height, maskB, radius)
  return removeFlood(d, (_r, _g, _b, p) => (maskA[p] === 1 || maskB[p] === 1) && countA(p) > 4 && countB(p) > 4)
}

/**
 * Chromakey: Abstand in der Cb-Cr-Ebene bestimmt die Deckkraft, danach wird der Farbstich
 * (Spill) an den Kanten zurückgenommen.
 */
export function chromaKey(d: PixelData, key: [number, number], opts: ChromaOptions = CHROMA_DEFAULTS): number {
  const { threshold, feather, despill } = opts
  const low = Math.max(0, threshold - feather)
  const high = threshold + feather
  let keyed = 0
  for (let i = 0; i < d.data.length; i += 4) {
    const r = d.data[i]
    const g = d.data[i + 1]
    const b = d.data[i + 2]
    const dist = chromaDistance(r, g, b, key)
    if (dist <= low) {
      d.data[i + 3] = 0
      keyed++
      continue
    }
    if (dist < high) {
      d.data[i + 3] = Math.round(d.data[i + 3] * ((dist - low) / (high - low)))
      keyed++
    }
    // Spill: überschüssiges Grün an halbtransparenten Rändern zurücknehmen
    // Spill wird im Umfeld der Schlüsselfarbe zurückgenommen; klar andersfarbige Motivteile bleiben unberührt
    if (d.data[i + 3] > 0 && dist < threshold * 2) {
      const mix = (r + b) / 2
      if (g > mix) d.data[i + 1] = Math.round(g - (g - mix) * despill)
    }
  }
  return keyed
}

/** Entfernt den erkannten Hintergrund. Liefert, was gemacht wurde. */
export function cleanBackground(d: PixelData, options: Partial<ChromaOptions> = {}): BackgroundKind {
  const info = detectBackground(d)
  if (info.kind === 'checkerboard' && info.tones) {
    removeCheckerboard(d, info.tones)
    return 'checkerboard'
  }
  if (info.kind === 'chroma' && info.key) {
    chromaKey(d, info.key, { ...CHROMA_DEFAULTS, ...options })
    return 'chroma'
  }
  return 'none'
}

/** Bild laden, Hintergrund entfernen, als PNG zurückgeben (Browser). */
export async function cleanImageBackground(dataUrl: string, maxSize = 1200): Promise<{ dataUrl: string; kind: BackgroundKind }> {
  const { loadImage } = await import('./util')
  try {
    const img = await loadImage(dataUrl)
    const w = img.naturalWidth || 0
    const h = img.naturalHeight || 0
    if (!w || !h) return { dataUrl, kind: 'none' }
    const scale = Math.min(1, maxSize / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const kind = cleanBackground(pixels)
    if (kind === 'none') return { dataUrl, kind }
    ctx.putImageData(pixels, 0, 0)
    return { dataUrl: canvas.toDataURL('image/png'), kind }
  } catch {
    return { dataUrl, kind: 'none' }
  }
}
