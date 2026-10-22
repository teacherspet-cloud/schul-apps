/**
 * Hochgeladene Dateien von Lernenden sicher annehmen und ausliefern (22.10.2026, KI-Sicherheitsprüfung: gespeichertes XSS).
 *
 * Befund: Der MIME-Typ kam aus der data:-URL des Browsers und wurde unverändert mit `inline` ausgeliefert – eine
 * hochgeladene HTML- oder SVG-Datei lief beim Öffnen durch die Lehrkraft auf derselben Herkunft mit deren Sitzung.
 * Jetzt:
 *  - Annehmen nur, was die ersten Bytes als erlaubte Art ausweisen (Bilder, PDF, Audio, Video, Office/ZIP); der Typ
 *    kommt aus den Bytes, nie vom Browser.
 *  - Ausliefern mit `nosniff` und einer CSP ohne Skripte; inline nur Rasterbilder, Audio, Video und PDF, alles andere
 *    (auch alte Dateien mit unbekanntem Typ) als Download.
 */
import type { ServerResponse } from 'node:http'

const beginnt = (b: Uint8Array, kopf: number[], ab = 0): boolean => kopf.every((x, i) => b[ab + i] === x)
const ascii = (b: Uint8Array, von: number, bis: number): string => Buffer.from(b.subarray(von, bis)).toString('latin1')

/** Art der Datei aus den ersten Bytes – null = nicht erlaubt */
export function dateiTypAusBytes(b: Uint8Array): string | null {
  if (b.length < 4) return null
  if (beginnt(b, [0x89, 0x50, 0x4e, 0x47])) return 'image/png'
  if (beginnt(b, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (ascii(b, 0, 4) === 'GIF8') return 'image/gif'
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'image/webp'
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WAVE') return 'audio/wav'
  if (ascii(b, 0, 5) === '%PDF-') return 'application/pdf'
  if (ascii(b, 0, 4) === 'OggS') return 'audio/ogg'
  if (ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg'
  if (beginnt(b, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm'
  if (ascii(b, 4, 8) === 'ftyp') {
    const marke = ascii(b, 8, 12)
    if (/^(heic|heix|mif1|msf1)/.test(marke)) return 'image/heic'
    if (/^M4A/.test(marke)) return 'audio/mp4'
    if (/^qt/.test(marke)) return 'video/quicktime'
    return 'video/mp4'
  }
  // Office-Dateien (docx, pptx, xlsx, odt …) sind ZIP-Archive – nur als Download
  if (beginnt(b, [0x50, 0x4b, 0x03, 0x04])) return 'application/zip'
  return null
}

/** Bilder, die die KI ansehen und die Seite als <img> zeigen darf */
export const istRasterbild = (typ: string): boolean => /^image\/(png|jpeg|gif|webp)$/.test(typ)

/** Wird im Browser angezeigt statt heruntergeladen */
const INLINE = (typ: string): boolean => istRasterbild(typ) || typ === 'application/pdf' || /^(audio|video)\//.test(typ)

/** Kopfzeilen zum Ausliefern einer hochgeladenen Datei – der Typ wird aus den Bytes neu bestimmt */
export function dateiKopf(daten: Uint8Array, name: string): Record<string, string> {
  const typ = dateiTypAusBytes(daten) ?? 'application/octet-stream'
  const inline = INLINE(typ)
  return {
    'content-type': typ,
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name || 'Datei')}`,
    'x-content-type-options': 'nosniff',
    // Keine Skripte, keine Formulare, keine fremden Ladungen; PDF braucht den eingebauten Betrachter (kein sandbox)
    'content-security-policy': typ === 'application/pdf' ? "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'" : "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'",
    'cache-control': 'private, no-store'
  }
}

export function dateiSenden(res: ServerResponse, daten: Uint8Array, name: string): void {
  res.writeHead(200, dateiKopf(daten, name))
  res.end(Buffer.from(daten))
}
