import { notifications } from '@mantine/notifications'
import { istAbbruch } from '@shared/abbruch'

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export function notifyError(e: unknown, title = 'Fehler'): void {
  // Ein abgebrochener Auftrag ist gewollt, kein Fehler – kein roter Hinweis (siehe shared/auftraege.ts)
  if (istAbbruch(e)) return
  notifications.show({ color: 'red', title, message: e instanceof Error ? e.message : String(e), autoClose: 10000 })
}

export function notifySuccess(message: string, title?: string): void {
  notifications.show({ title, message })
}

/**
 * Etwas ist anders gelaufen als geplant, aber nicht schiefgegangen.
 *
 * Zum Beispiel: Es wurde kein Originaltext gefunden, das Blatt entsteht mit einem eigenen
 * Text. Als Fehler gemeldet, würde die Lehrkraft nach einem Defekt suchen; stillschweigend
 * übergangen, würde sie sich wundern, warum keine Quelle auf dem Blatt steht.
 */
export function notifyInfo(message: string, title?: string): void {
  notifications.show({ color: 'yellow', title, message, autoClose: 12000 })
}

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'))
    img.src = src
  })
}

/**
 * Bringt ein Bild auf eine handliche Größe und wandelt es in PNG/JPEG um
 * (SVG wird gerastert, damit Word und PDF es sicher darstellen).
 */
export async function normalizeImage(src: string, maxSize = 1024, format: 'png' | 'jpeg' = 'png'): Promise<string> {
  const img = await loadImage(src)
  const w = img.naturalWidth || maxSize
  const h = img.naturalHeight || maxSize
  // Vektorgrafiken dürfen hochskaliert werden, Fotos nicht
  const isSvg = src.startsWith('data:image/svg')
  const scale = isSvg ? maxSize / Math.max(w, h) : Math.min(1, maxSize / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')!
  if (format === 'jpeg') {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg', 0.9)
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}

export function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]+/g, '').trim() || 'Datei'
}
