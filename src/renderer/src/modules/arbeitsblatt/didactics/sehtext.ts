import type { SourceMaterial, WorksheetMeta } from '../model/types'
import type { VideoKind } from './videoTasks'

/**
 * Hör-/Sehverstehen mit einem Video aus dem Netz (02.10.2026).
 *
 * Wunsch der Lehrkraft: „Ändere [Hörverstehen] zu Hör-/Sehverstehen, sodass nicht nur Hörtexte,
 * sondern auch Videos mit bedacht werden." und „Wenn ich URLs zu Dokumentationen (ZDF z. B.) oder
 * YouTube-Videos rechts als Material angebe, wird die Webseite nur als Text behandelt anstatt mit
 * dem Video Fragen zu den Videos zu erstellen."
 *
 * Liegt beim Schwerpunkt Hör-/Sehverstehen ein Video als Material vor (YouTube, ARD, ZDF – mit
 * Untertiteln samt Zeitmarken oder einem Inhaltsprotokoll von Gemini, shared/files/urlQuelle.ts),
 * wird daraus die Video-Angabe des Blattes. Damit greift die vorhandene Film-Didaktik vollständig:
 * Phasen vor/während/nach dem Sehen, Beobachtungsaufträge, Video-Baustein mit Link und QR-Code,
 * Prüfungen (didactics/integrity.ts `checkVideo`). Einen Hörtext schreibt die KI dann nicht.
 * Hat die Lehrkraft selbst Video-Angaben gemacht, bleiben ihre.
 */

/** Das Video-Material, das als Hör-/Sehtext dient – nur beim Schwerpunkt Hör-/Sehverstehen */
export function sehtextQuelle(meta: Pick<WorksheetMeta, 'skillFocus'>, sources: SourceMaterial[] | undefined): SourceMaterial | null {
  if (meta.skillFocus !== 'listening') return null
  return (sources ?? []).find((s) => s.useAsBasis && s.kind === 'video' && s.text.trim()) ?? null
}

const zeile = (text: string, name: string): string => new RegExp(`^${name}:\\s*(.+)$`, 'm').exec(text)?.[1]?.trim() ?? ''

/** Minuten aus „Laufzeit: 33:09 min" */
function minutenAus(text: string): number {
  const m = /^Laufzeit:\s*(\d+):(\d{2})/m.exec(text)
  return m ? Math.max(1, Math.round(Number(m[1]) + Number(m[2]) / 60)) : 0
}

/** Der Inhalt hinter „Transkript …:" bzw. „Inhaltsprotokoll …:" – sonst die Beschreibung */
export function sehtextInhalt(text: string): string {
  const m = /^(?:Transkript|Inhaltsprotokoll)[^\n]*:\n([\s\S]+)$/m.exec(text)
  if (m) return m[1].trim()
  return /^Beschreibung:\n([\s\S]+?)(?:\n\n[A-ZÄÖÜ][^\n]*:|$)/m.exec(text)?.[1]?.trim() ?? ''
}

/** Mediathek oder YouTube – bestimmt die Voreinstellung der Videoart */
function artVon(url: string, herkunft: string): VideoKind {
  if (/ardmediathek|zdf|arte\.tv/i.test(url) || /ard|zdf|arte|mediathek/i.test(herkunft)) return 'dokumentation'
  return 'lernvideo'
}

/** Die Blatt-Angaben mit dem Video als Hör-/Sehtext; unverändert, wenn keines da ist oder die Lehrkraft eigene Angaben gemacht hat */
export function mitSehtext(meta: WorksheetMeta, sources: SourceMaterial[] | undefined): WorksheetMeta {
  const q = sehtextQuelle(meta, sources)
  if (!q || meta.video?.title.trim()) return meta
  const titel = zeile(q.text, 'Video') || q.fileName
  const herkunft = zeile(q.text, 'Herkunft') || zeile(q.text, 'Kanal')
  const url = q.url ?? zeile(q.text, 'Adresse')
  return {
    ...meta,
    video: {
      title: titel,
      url,
      kind: artVon(url, herkunft),
      platform: herkunft,
      minutes: minutenAus(q.text),
      section: '',
      summary: sehtextInhalt(q.text),
      during: 'auto',
      groups: 0
    }
  }
}

/** Woher der Inhalt eines Video-Materials stammt – für die Anzeige in der Materialliste */
export function videoInhaltsArt(text: string): 'untertitel' | 'ki' | 'lehrkraft' | 'keine' {
  if (/^Transkript \(von der Lehrkraft eingefügt\)/m.test(text)) return 'lehrkraft'
  if (/^Inhaltsprotokoll der KI/m.test(text)) return 'ki'
  if (/^Transkript[^\n]*:\n\S/m.test(text)) return 'untertitel'
  return 'keine'
}

/**
 * Von Hand eingefügtes Transkript (02.10.2026, Entscheidung der Lehrkraft: einer der vier Wege) –
 * ersetzt ein vorhandenes Transkript oder den Hinweis, dass es keines gibt. Kopf mit Titel,
 * Herkunft und Adresse bleibt.
 */
export function mitTranskript(text: string, transkript: string): string {
  const kopf = text
    .replace(/\n\n(?:Transkript|Inhaltsprotokoll)[^\n]*:\n[\s\S]*$/, '')
    .replace(/\n\nKein Transkript verfügbar[\s\S]*$/, '')
    .trimEnd()
  return `${kopf}\n\nTranskript (von der Lehrkraft eingefügt):\n${transkript.trim()}`
}

/** Ist das Blatt eines zum Hör-/Sehverstehen mit Video (statt Hörtext)? */
export const sehverstehenMitVideo = (meta: WorksheetMeta): boolean => meta.skillFocus === 'listening' && Boolean(meta.video?.title.trim())

/** Steht im Inhalt eine Gliederung nach Zeitmarken („[3:20] …")? */
export const hatZeitmarken = (inhalt: string): boolean => /^\[\d{1,2}:\d{2}(?::\d{2})?\]/m.test(inhalt)
