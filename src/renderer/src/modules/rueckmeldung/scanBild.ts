/**
 * Scan mit eingezeichneten Markern (29.09.2026) – für den Word-Export. Im PDF liegen die Marker
 * als Ebene über dem Bild; Word kennt keine frei liegenden Formen in Tabellenzellen, deshalb
 * werden sie hier in eine Kopie des Bildes gezeichnet (Canvas, nur im Fenster verfügbar).
 */
import { scanReihenfolge } from './korrekturrand'
import type { Abgabe } from './model/types'

const FARBE: Record<string, string> = { fehler: '#c62828', lob: '#2e7d32', hinweis: '#1565c0' }

function ladeBild(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fehler) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = () => fehler(new Error('Das Bild des Scans ließ sich nicht laden.'))
    img.src = src
  })
}

/** Alle Seiten einer Abgabe mit Markern; höchstens 1600 px breit (Word-Dateien bleiben handlich) */
export async function scanMitMarkern(a: Abgabe): Promise<{ dataUrl: string; width: number; height: number }[]> {
  const reihe = scanReihenfolge(a.bogen?.rand ?? [])
  const out: { dataUrl: string; width: number; height: number }[] = []
  for (const [s, src] of (a.scans ?? []).entries()) {
    const img = await ladeBild(src)
    const f = Math.min(1, 1600 / img.naturalWidth)
    const w = Math.round(img.naturalWidth * f)
    const h = Math.round(img.naturalHeight * f)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')
    if (!g) throw new Error('Zeichnen ist in diesem Fenster nicht möglich.')
    g.drawImage(img, 0, 0, w, h)
    const r = Math.max(14, Math.round(w / 55))
    for (const { nr, k } of reihe.filter((x) => (x.k.seite ?? 0) === s)) {
      const x = ((k.x ?? 50) / 100) * w
      const y = ((k.y ?? 50) / 100) * h
      g.beginPath()
      g.arc(x, y, r + 3, 0, Math.PI * 2)
      g.fillStyle = '#ffffff'
      g.fill()
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fillStyle = FARBE[k.art] ?? FARBE.fehler
      g.fill()
      g.fillStyle = '#ffffff'
      g.font = `bold ${Math.round(r * 1.1)}px Calibri, Arial, sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(String(nr), x, y + 1)
    }
    out.push({ dataUrl: c.toDataURL('image/jpeg', 0.88), width: w, height: h })
  }
  return out
}

export async function scanBilderFuer(abgaben: Abgabe[]): Promise<Map<string, { dataUrl: string; width: number; height: number }[]>> {
  const map = new Map<string, { dataUrl: string; width: number; height: number }[]>()
  for (const a of abgaben) if (a.scans?.length && a.bogen?.rand?.some((k) => k.seite != null)) map.set(a.id, await scanMitMarkern(a))
  return map
}
