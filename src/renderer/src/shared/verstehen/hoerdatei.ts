/**
 * Original-Hördatei und Transkript eines Hörtextes einlesen (29.09.2026).
 *
 * Entscheidung der Lehrkraft: Beim Hörverstehen werden die Original-Hördatei (MP3, etwa von der
 * Verlags-CD) und das Transkript hineingezogen. Im Unterricht läuft das Original – die App
 * bindet es ein wie ihre eigenen Hörtexte (Hörtext-Ordner, `<id>.mp3`, `audio:read` beim
 * Öffnen). Die KI nutzt nur das Transkript.
 */
import { extractContent } from '../files/extractContent'

/** Word liefert HTML – für das Transkript reicht Text mit Zeilen */
export function transkriptAusHtml(html: string): string {
  return html
    .replace(/<(br|\/p|\/li|\/tr|\/h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((z) => z.trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * Transkript aus einem PDF-Auszug aufbereiten: Seitenmarken und Spaltentrenner der
 * Textebene entfernen, Sprecherzeilen („Name: …") auf eigene Zeilen.
 */
export function transkriptAusPdfText(text: string): string {
  return text
    .replace(/^--- Seite \d+ ---$/gm, '')
    .replace(/ \| /g, ' ')
    .split('\n')
    .map((z) => z.trim())
    .filter(Boolean)
    .join('\n')
}

/** Liest ein Transkript aus Text-, Word- oder PDF-Datei. Scans ohne Textebene: Fehler mit Hinweis. */
export async function leseTranskript(file: File): Promise<string> {
  const c = await extractContent(file, () => undefined, { renderPages: false })
  const text = c.format === 'html' ? transkriptAusHtml(c.text) : c.kind === 'pdf' ? transkriptAusPdfText(c.text) : c.text.trim()
  if (!text.trim())
    throw new Error(
      'Die Datei enthält keinen auslesbaren Text (Scan oder Foto). Das Transkript als Text, Word oder PDF mit Textebene einlesen – oder über „Aufgaben aus Material übernehmen" von der KI übertragen lassen.'
    )
  return text
}

/** Spieldauer einer Audio-Adresse in Sekunden (0, wenn sie sich nicht ermitteln lässt). */
export function spieldauer(dataUrl: string, wartezeit = 4000): Promise<number> {
  return new Promise((resolve) => {
    try {
      const a = new Audio()
      const fertig = (s: number): void => resolve(Number.isFinite(s) ? Math.round(s) : 0)
      const t = setTimeout(() => fertig(0), wartezeit)
      a.addEventListener('loadedmetadata', () => {
        clearTimeout(t)
        fertig(a.duration)
      })
      a.addEventListener('error', () => {
        clearTimeout(t)
        fertig(0)
      })
      a.preload = 'metadata'
      a.src = dataUrl
    } catch {
      resolve(0)
    }
  })
}

/** MP3 an den Hauptprozess geben; liefert Dateiname und Adresse zum Abspielen. */
export async function importiereHoerdatei(blockId: string, file: File): Promise<{ fileName: string; dataUrl: string; bytes: number; seconds: number; freigabe?: string }> {
  if (!/\.mp3$/i.test(file.name) && file.type !== 'audio/mpeg') throw new Error('Nur MP3-Dateien – andere Formate (WAV, M4A) bitte vorher umwandeln.')
  const res = await window.api.audio.import(blockId, new Uint8Array(await file.arrayBuffer()))
  return { ...res, seconds: await spieldauer(res.dataUrl) }
}
