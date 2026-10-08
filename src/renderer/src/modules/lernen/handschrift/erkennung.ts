/**
 * Handschrift für „Lege das Wort" (08.10.2026, abgestimmt mit der Lehrkraft): Erkennung auf dem Gerät, ohne Server
 * und ohne KI. Browser bringen dafür nichts Allgemeines mit (Chromes Handwriting API nur unter ChromeOS, Scribble
 * auf dem iPad nur mit Pencil im Textfeld). Weil das Lösungswort bekannt ist, muss hier nur unter den noch freien
 * Plättchen gewählt werden – meist eine Handvoll Buchstaben. Dafür reicht ein Bildvergleich:
 * die Striche und jede Buchstabenform (mehrere Schriften, klein und groß) werden gleich groß auf ein Raster gelegt
 * und per Abstandsbild (Chamfer-Abstand) verglichen; das Seitenverhältnis geht mit ein (l gegen o gegen m).
 * Faustregel, nicht belegt: Raster 32, Strichbreite 3 – an Probeschriften eingestellt.
 */

export interface Punkt {
  x: number
  y: number
}
export type Strich = Punkt[]

const N = 32
const RAND = 3
const STRICH = 3
const SCHRIFTEN = ['Arial, Helvetica, sans-serif', 'Georgia, "Times New Roman", serif', '"Comic Sans MS", "Chalkboard SE", "Marker Felt", sans-serif']

interface Bild {
  /** Abstandsbild: je Feld der Abstand zum nächsten Tintenfeld */
  abstand: Float32Array
  /** Tintenfelder */
  tinte: number[]
  /** Breite / Höhe der Tinte vor dem Einpassen */
  verhaeltnis: number
}

const leinwand = (b: number, h: number): CanvasRenderingContext2D | null => {
  const c = document.createElement('canvas')
  c.width = b
  c.height = h
  return c.getContext('2d', { willReadFrequently: true })
}

/** Zwei Durchläufe 3-4-Chamfer: Abstand jedes Feldes zur nächsten Tinte (in Feldern) */
function abstandsbild(tinte: Uint8Array): Float32Array {
  const gross = 1e6
  const d = new Float32Array(N * N)
  for (let i = 0; i < N * N; i++) d[i] = tinte[i] ? 0 : gross
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 3)
      if (y > 0) d[i] = Math.min(d[i], d[i - N] + 3)
      if (x > 0 && y > 0) d[i] = Math.min(d[i], d[i - N - 1] + 4)
      if (x < N - 1 && y > 0) d[i] = Math.min(d[i], d[i - N + 1] + 4)
    }
  for (let y = N - 1; y >= 0; y--)
    for (let x = N - 1; x >= 0; x--) {
      const i = y * N + x
      if (x < N - 1) d[i] = Math.min(d[i], d[i + 1] + 3)
      if (y < N - 1) d[i] = Math.min(d[i], d[i + N] + 3)
      if (x < N - 1 && y < N - 1) d[i] = Math.min(d[i], d[i + N + 1] + 4)
      if (x > 0 && y < N - 1) d[i] = Math.min(d[i], d[i + N - 1] + 4)
    }
  for (let i = 0; i < N * N; i++) d[i] /= 3
  return d
}

/** Raster aus einem Graustufenbild mit bekanntem Tintenrahmen: seitentreu eingepasst und mittig */
function einpassen(zeichne: (ctx: CanvasRenderingContext2D, massstab: number, dx: number, dy: number) => void, breite: number, hoehe: number): Bild | null {
  const ctx = leinwand(N, N)
  if (!ctx) return null
  const innen = N - 2 * RAND
  const m = innen / Math.max(breite, hoehe, 1e-6)
  const dx = RAND + (innen - breite * m) / 2
  const dy = RAND + (innen - hoehe * m) / 2
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, N, N)
  zeichne(ctx, m, dx, dy)
  const px = ctx.getImageData(0, 0, N, N).data
  const t = new Uint8Array(N * N)
  const tinte: number[] = []
  for (let i = 0; i < N * N; i++)
    if (px[i * 4] < 160) {
      t[i] = 1
      tinte.push(i)
    }
  if (!tinte.length) return null
  return { abstand: abstandsbild(t), tinte, verhaeltnis: breite / Math.max(hoehe, 1e-6) }
}

/** Die geschriebenen Striche als Raster */
export function stricheAlsBild(striche: Strich[]): Bild | null {
  const alle = striche.flat()
  if (!alle.length) return null
  const x0 = Math.min(...alle.map((p) => p.x))
  const y0 = Math.min(...alle.map((p) => p.y))
  const b = Math.max(...alle.map((p) => p.x)) - x0
  const h = Math.max(...alle.map((p) => p.y)) - y0
  // Ein Punkt oder Strich ohne Ausdehnung: Mindestgröße, damit nichts durch null geteilt wird
  const groesse = Math.max(b, h, 4)
  return einpassen(
    (ctx, m, dx, dy) => {
      // Die Strichbreite wächst nicht mit: Kleine und große Schrift sehen gleich aus
      ctx.strokeStyle = '#000'
      ctx.fillStyle = '#000'
      ctx.lineWidth = STRICH
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const s of striche) {
        if (s.length === 1) {
          ctx.beginPath()
          ctx.arc(dx + (s[0].x - x0) * m, dy + (s[0].y - y0) * m, STRICH / 2, 0, Math.PI * 2)
          ctx.fill()
          continue
        }
        ctx.beginPath()
        s.forEach((p, i) => (i ? ctx.lineTo(dx + (p.x - x0) * m, dy + (p.y - y0) * m) : ctx.moveTo(dx + (p.x - x0) * m, dy + (p.y - y0) * m)))
        ctx.stroke()
      }
    },
    b || groesse * 0.05,
    h || groesse * 0.05
  )
}

const vorlagen = new Map<string, Bild[]>()

/** Ein Zeichen in einer Schrift: erst groß zeichnen, Tintenrahmen suchen, dann eingepasst nachzeichnen */
function zeichenBild(zeichen: string, schrift: string): Bild | null {
  const G = 120
  const ctx = leinwand(G * 2, G * 2)
  if (!ctx) return null
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, G * 2, G * 2)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.font = `${G}px ${schrift}`
  ctx.fillText(zeichen, G, G)
  const px = ctx.getImageData(0, 0, G * 2, G * 2).data
  let x0 = G * 2
  let y0 = G * 2
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < G * 2; y++)
    for (let x = 0; x < G * 2; x++)
      if (px[(y * G * 2 + x) * 4] < 128) {
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x)
        y1 = Math.max(y1, y)
      }
  if (x1 < 0) return null
  const quelle = ctx.canvas
  const b = x1 - x0 + 1
  const h = y1 - y0 + 1
  return einpassen(
    (z, m, dx, dy) => {
      z.imageSmoothingEnabled = true
      z.drawImage(quelle, x0, y0, b, h, dx, dy, b * m, h * m)
    },
    b,
    h
  )
}

function vorlagenFuer(zeichen: string): Bild[] {
  const k = zeichen.toLowerCase()
  const fertig = vorlagen.get(k)
  if (fertig) return fertig
  const formen = [...new Set([k, k.toUpperCase()])]
  const bilder = formen.flatMap((z) => SCHRIFTEN.map((s) => zeichenBild(z, s))).filter((b): b is Bild => Boolean(b))
  vorlagen.set(k, bilder)
  return bilder
}

/** Abstand zweier Raster: mittlerer Chamfer-Abstand in beide Richtungen plus Unterschied im Seitenverhältnis */
function abstand(a: Bild, b: Bild): number {
  let ab = 0
  for (const i of a.tinte) ab += b.abstand[i]
  let ba = 0
  for (const i of b.tinte) ba += a.abstand[i]
  const form = (ab / a.tinte.length + ba / b.tinte.length) / 2
  const verhaeltnis = Math.abs(Math.log(Math.max(a.verhaeltnis, 0.05) / Math.max(b.verhaeltnis, 0.05)))
  return form + 1.6 * verhaeltnis
}

/**
 * Die wahrscheinlichsten Zeichen aus den Kandidaten (bestes zuerst). Groß- und Kleinschreibung zählen gleich –
 * die Plättchen geben die Schreibweise vor.
 */
export function erkenne(striche: Strich[], kandidaten: readonly string[]): { zeichen: string; abstand: number }[] {
  const bild = stricheAlsBild(striche)
  const einzeln = [...new Set(kandidaten.map((k) => k.toLowerCase()))]
  if (!bild || !einzeln.length) return []
  return einzeln
    .map((z) => ({ zeichen: z, abstand: Math.min(...vorlagenFuer(z).map((v) => abstand(bild, v)), Infinity) }))
    .sort((a, b) => a.abstand - b.abstand)
}
