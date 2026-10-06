/**
 * Hoch- und Querformat je Seitenabschnitt (06.10.2026, abgestimmt mit der Lehrkraft).
 *
 * Das Format hängt am Inhalt: Ein Baustein mit `seitenFormat` beginnt einen Abschnitt, der bis zum nächsten Baustein mit
 * eigenem Format reicht. Läuft der Abschnitt über, bleibt die Folgeseite im selben Format. Der Seitenumbruch beginnt
 * bei jedem Wechsel eine neue Seite (shared/render/paginate.ts).
 */
import { imageSizeFromDataUrl } from '../../../shared/imageSize'
import { datumZahl } from './diagram'
import type { SeitenFormat, WsBlock } from './types'

/** Maße einer A4-Seite je Format (mm) */
export const SEITE_MM: Record<SeitenFormat, { b: number; h: number }> = { hoch: { b: 210, h: 297 }, quer: { b: 297, h: 210 } }

/**
 * Wie viel Breite ein Baustein braucht – Grundlage der Prüfung nach Maßen (06.10.2026, abgestimmt: „KI plant, das
 * Programm prüft mit den echten Maßen und korrigiert offensichtliche Fehlgriffe").
 *  - breit: Einzelbild deutlich breiter als hoch (Panorama, breites Gemälde), Tabelle ab sechs Spalten, Zeitleiste
 *    mit vielen Marken, Ereignissen oder Abschnitten
 *  - hochformatig: Einzelbild deutlich höher als breit, groß gesetzt
 */
export function inhaltsForm(b: WsBlock): 'breit' | 'hochformatig' | null {
  if (b.type === 'image') {
    if (b.items?.length) return null
    const m = imageSizeFromDataUrl(b.image?.dataUrl)
    if (!m) return null
    const r = m.width / m.height
    if (r >= 1.75 && b.widthPercent >= 70) return 'breit'
    if (r <= 0.8 && b.widthPercent >= 60) return 'hochformatig'
    return null
  }
  if (b.type === 'table') return b.headers.length >= 6 ? 'breit' : null
  const diagramm = b.type === 'grid' ? b.diagram : b.type === 'task' ? b.answer.diagram : undefined
  if (diagramm?.kind === 'zeitleiste') {
    const t = diagramm.timeline
    const a = datumZahl(t.from, t.unit)
    const z = datumZahl(t.to, t.unit)
    const marken = a !== null && z !== null && t.step > 0 ? Math.abs(z - a) / t.step : 0
    return marken > 12 || t.events.length >= 7 || t.sections.length >= 2 ? 'breit' : null
  }
  return null
}

/** Formate wie gespeichert (Anker der KI bzw. der Lehrkraft), ohne Prüfung */
function gespeicherteFormate(blocks: readonly WsBlock[]): { format: SeitenFormat; fest: boolean }[] {
  let jetzt: SeitenFormat = 'hoch'
  let fest = false
  return blocks.map((b) => {
    if (b.seitenFormat) {
      jetzt = b.seitenFormat
      fest = Boolean(b.seitenFormatFest)
    }
    return { format: jetzt, fest }
  })
}

/**
 * Kennungen der Bausteine, die im Querformat stehen (Reihenfolge des Blatts) – mit der Prüfung nach Maßen. Was die
 * Lehrkraft gewählt hat (`seitenFormatFest`), bleibt unangetastet. Sonst:
 *  1. Breiter Inhalt in einem Hochabschnitt → er (und die Aufgabe direkt dahinter) kommt auf eine Querseite.
 *  2. Ein Querabschnitt der KI ohne breiten Inhalt, aber mit hochformatigem Bild oder längerem Fließtext → hoch.
 * Gerechnet wird bei jedem Setzen – Bilder, die erst später geladen werden, zählen also mit.
 */
export function querBausteine(blocks: readonly WsBlock[]): Set<string> {
  const roh = gespeicherteFormate(blocks)
  const formen = blocks.map(inhaltsForm)
  const quer = roh.map((r) => r.format === 'quer')
  // 2. Querabschnitte ohne Grund zurück ins Hochformat
  for (let i = 0; i < blocks.length;) {
    let j = i
    while (j + 1 < blocks.length && !blocks[j + 1].seitenFormat) j++
    if (quer[i] && !roh[i].fest) {
      const bereich = blocks.slice(i, j + 1)
      const breit = formen.slice(i, j + 1).includes('breit')
      const langerText = bereich.some((b) => b.type === 'text' && b.body.length > 1200)
      if (!breit && (formen.slice(i, j + 1).includes('hochformatig') || langerText)) for (let k = i; k <= j; k++) quer[k] = false
    }
    i = j + 1
  }
  // 1. Breiter Inhalt in einem Hochabschnitt
  blocks.forEach((b, i) => {
    if (formen[i] !== 'breit' || quer[i] || roh[i].fest) return
    quer[i] = true
    const n = blocks[i + 1]
    if (n && b.type !== 'task' && n.type === 'task' && !n.seitenFormat && !roh[i + 1].fest) quer[i + 1] = true
  })
  return new Set(blocks.filter((_, i) => quer[i]).map((b) => b.id))
}

/** Hat das Blatt überhaupt Querseiten? */
export const hatQuer = (blocks: readonly WsBlock[]): boolean => querBausteine(blocks).size > 0

/**
 * EINE Seite umschalten (Symbol am Seitenrand): Ab ihrem ersten Baustein gilt das neue Format, ab dem ersten Baustein
 * der nächsten Seite wieder das bisherige – die übrigen Seiten bleiben, wie sie sind. Beides als Wahl der Lehrkraft
 * (`seitenFormatFest`), damit die Automatik es nicht zurückdreht. Überflüssige Anker (gleiches Format wie davor) entfallen.
 */
/** Was ein Baustein für das Seitenformat mitbringt – Arbeitsblatt-Bausteine wie die des Vokabeltests */
export interface FormatAnker {
  id: string
  seitenFormat?: SeitenFormat
  seitenFormatFest?: boolean
}

/** Querbausteine allein nach den gesetzten Ankern (ohne Prüfung nach Maßen) – z. B. für den Vokabeltest */
export function querNachAnkern(blocks: readonly FormatAnker[]): Set<string> {
  const aus = new Set<string>()
  let jetzt: SeitenFormat = 'hoch'
  for (const b of blocks) {
    if (b.seitenFormat) jetzt = b.seitenFormat
    if (jetzt === 'quer') aus.add(b.id)
  }
  return aus
}

export function seiteUmschalten<T extends FormatAnker>(
  blocks: readonly T[],
  ersterId: string,
  naechsterId: string | undefined,
  quer: boolean,
  /** Wie die Seiten JETZT stehen (Arbeitsblatt: mit Prüfung nach Maßen) */
  vorher: Set<string> = querNachAnkern(blocks)
): T[] {
  const neu: SeitenFormat = quer ? 'quer' : 'hoch'
  const danach: SeitenFormat | null = naechsterId ? (vorher.has(naechsterId) ? 'quer' : 'hoch') : null
  const liste = blocks.map((b) => {
    if (b.id === ersterId) return { ...b, seitenFormat: neu, seitenFormatFest: true }
    if (naechsterId && b.id === naechsterId && danach) return { ...b, seitenFormat: danach, seitenFormatFest: true }
    return b
  })
  return ankerAufraeumen(liste)
}

/** Anker, die nichts ändern (gleiches Format wie der Abschnitt davor), entfernen – außer von der Lehrkraft gesetzte */
export function ankerAufraeumen<T extends FormatAnker>(blocks: readonly T[]): T[] {
  let jetzt: SeitenFormat = 'hoch'
  return blocks.map((b) => {
    if (!b.seitenFormat) return b
    // Wahl der Lehrkraft bleibt stehen – sie sagt der Automatik „hier nicht umschalten"
    if (b.seitenFormat === jetzt && !b.seitenFormatFest) {
      const { seitenFormat: _f, seitenFormatFest: _x, ...rest } = b
      return rest as T
    }
    jetzt = b.seitenFormat
    return b
  })
}
