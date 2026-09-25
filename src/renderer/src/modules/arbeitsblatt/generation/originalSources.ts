import type { MediaCheck, QuoteCheck } from '@shared/types'
import { plainText } from '../../../shared/richtext/parse'
import type { TextBlock, VideoBlock, Worksheet, WsBlock } from '../model/types'
import type { MaterialDienste } from './originalmaterial'
import type { Netzfund } from '../../../../../main/services/ai/provider'

export interface SourceServices {
  checkQuote: (url: string, quote: string) => Promise<QuoteCheck>
  /** Ton-/Filmquelle: erreichbar, und handelt die Seite von dem, was behauptet wird? */
  checkMedia: (url: string, expect: string[]) => Promise<MediaCheck>
}

export const browserSourceServices = (): SourceServices => ({
  checkQuote: (url, quote) => window.api.sources.checkQuote(url, quote),
  checkMedia: (url, expect) => window.api.sources.checkMedia(url, expect)
})

/**
 * Zugang zur Materialsuche.
 *
 * Gesucht und geladen wird im Hauptprozess: Nur dort lässt sich der Wortlaut wirklich aus dem
 * Netz holen. Die Oberfläche bekommt ausschließlich Texte, die die App selbst gelesen hat.
 */
export const browserMaterialDienste = (
  /** Websuche eines Hintergrund-Auftrags (abbrechbar, zählt zur Begrenzung) – sonst die allgemeine */
  websuche: (auftrag: string) => Promise<Netzfund[]> = (auftrag) => window.api.ai.websuche(auftrag)
): MaterialDienste => ({
  suche: (anfrage) => window.api.sources.suche(anfrage),
  laden: async (url) => {
    const quelle = await window.api.sources.laden(url)
    if (!quelle.pdf) return quelle
    /*
     * PDF: Der Hauptprozess hat nur die Bytes geholt, den Text gewinnt die Oberflaeche –
     * hier liegt der PDF-Leser, den auch das hochgeladene Material der Lehrkraft benutzt.
     * Zwei getrennte PDF-Leser waeren genau die Art Fehler, die still bleibt.
     *
     * Wissenschaftliche Quellen und Behoerdenberichte liegen sehr oft so vor; ohne diesen
     * Weg fielen sie mit „Die Adresse liefert keinen Text" heraus.
     */
    try {
      const { extractContent } = await import('../../../shared/files/extractContent')
      const datei = new File([new Uint8Array(quelle.pdf).slice().buffer], 'quelle.pdf', { type: 'application/pdf' })
      const inhalt = await extractContent(datei, undefined, { maxPages: 40 })
      // Die Seitenmarken des Lesers sind fuer die Lehrkraft gedacht, nicht fuer den Quellentext
      const text = inhalt.text
        .replace(/^--- Seite \d+ ---$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      return { ...quelle, pdf: undefined, text, wortzahl: (text.match(/[\p{L}\p{N}]+/gu) ?? []).length }
    } catch (e) {
      return { ...quelle, pdf: undefined, fehler: `Das PDF liess sich nicht lesen (${e instanceof Error ? e.message : String(e)}).` }
    }
  },
  netzsuche: async (auftrag) => {
    const funde = await websuche(auftrag)
    return funde.map((f) => ({ ...f, herkunft: 'netz' as const, lizenz: 'siehe Seite – Nutzung nach § 60a UrhG für Unterricht und Prüfung' }))
  }
})

const URL_RE = /https:\/\/[^\s<>"„“)]+[^\s<>"„“).,;:]/

/** Textbaustein, der als Originalquelle gekennzeichnet ist („Q1: …“ oder Fundort-Adresse). */
export function isTextSource(b: WsBlock): b is TextBlock {
  return b.type === 'text' && (/^Q\d*\s*:/.test(b.title.trim()) || URL_RE.test(b.source))
}

const adapted = (source: string): boolean => /sprachlich angepasst|vereinfacht|übersetz|bearbeitet|nach:/i.test(source)

function addWarning(b: WsBlock, text: string): void {
  b.warnings = [...(b.warnings ?? []).filter((w) => !w.startsWith('Quelle:')), text]
}

/** Wortlaut einer Textquelle mit der angegebenen Internetadresse abgleichen. */
export async function checkTextSource(b: TextBlock, services: SourceServices): Promise<void> {
  const url = URL_RE.exec(b.source)?.[0]
  if (!url) {
    addWarning(b, 'Quelle: keine Internetadresse angegeben – Wortlaut und Quellenangabe vor dem Einsatz mit dem Original abgleichen.')
    return
  }
  const res = await services
    .checkQuote(url, plainText(b.body))
    .catch((e): QuoteCheck => ({ status: 'unreachable', ratio: 0, message: e instanceof Error ? e.message : String(e) }))
  if (res.suggestedUrl && res.status !== 'unreachable') {
    // Die KI hat eine falsche Adresse genannt, der Wortlaut steht aber in Wikisource: Fundort korrigieren
    b.source = b.source.replace(url, res.suggestedUrl)
    addWarning(
      b,
      res.status === 'found'
        ? `Quelle: Die angegebene Adresse passte nicht; der Wortlaut wurde in Wikisource gefunden und der Fundort korrigiert (${res.suggestedUrl}).`
        : `Quelle: Wortlaut nur teilweise in Wikisource gefunden (${Math.round(res.ratio * 100)} %), Fundort angepasst – Abweichungen bitte prüfen.`
    )
  } else if (res.status === 'found') b.warnings = (b.warnings ?? []).filter((w) => !w.startsWith('Quelle:'))
  else if (adapted(b.source) && res.status !== 'unreachable')
    // Übersetzungen und angepasste Fassungen weichen zwangsläufig vom Wortlaut ab
    addWarning(b, 'Quelle: angepasste Fassung bzw. Übersetzung – Sinn bitte mit dem Original abgleichen.')
  else if (res.status === 'unreachable') addWarning(b, `Quelle: ${res.message} Bitte die Quellenangabe prüfen.`)
  else if (res.status === 'partial')
    addWarning(b, `Quelle: Wortlaut nur teilweise in der angegebenen Quelle gefunden (${Math.round(res.ratio * 100)} %) – Kürzungen/Abweichungen bitte prüfen.`)
  else
    addWarning(
      b,
      'Quelle: Wortlaut nicht in der angegebenen Quelle gefunden – die KI könnte das Zitat ungenau wiedergegeben haben. Bitte mit dem Original abgleichen.'
    )
}

/** Nach dem Erzeugen: Zitate der Textquellen prüfen. Liefert die Zahl der geprüften Quellen. */
export async function completeOriginalSources(
  blocks: WsBlock[],
  services: SourceServices,
  onProgress?: (done: number, total: number) => void
): Promise<{ texts: number }> {
  const texts = blocks.filter(isTextSource)
  let done = 0
  for (const b of texts) {
    await checkTextSource(b, services)
    onProgress?.(++done, texts.length)
  }
  return { texts: texts.length }
}

/**
 * Prüft die von der KI genannten Ton- und Filmquellen (Geschichte, Politik).
 *
 * Anders als beim Textzitat lässt sich hier kein Wortlaut abgleichen – die Seite enthält nur
 * das Abspielgerät. Geprüft wird deshalb, ob es die Seite gibt und ob die behaupteten
 * Angaben (Person, Jahr, Titel) darauf vorkommen.
 *
 * Die Warnung bleibt bewusst am Baustein stehen, statt die Quelle stillschweigend zu
 * entfernen: Eine Lehrkraft, die sieht „Adresse nicht erreichbar", sucht selbst weiter. Eine
 * Quelle, die klanglos verschwindet, hinterlässt nur eine Lücke, die niemand erklärt.
 */
export async function checkMediaSources(
  blocks: WsBlock[],
  services: SourceServices,
  onProgress?: (done: number, total: number) => void
): Promise<{ videos: number; verified: number }> {
  const videos = blocks.filter((b): b is VideoBlock => b.type === 'video' && Boolean(b.url))
  let done = 0
  let verified = 0
  for (const b of videos) {
    // Person, Jahr und Titel sind das, woran sich die Seite erkennen lässt
    const expect = [b.sourceTitle, b.title].map((t) => (t ?? '').trim()).filter((t) => t.length >= 3)
    const res = await services
      .checkMedia(b.url!, expect)
      .catch((e): MediaCheck => ({ status: 'unreachable', matched: [], missing: expect, message: e instanceof Error ? e.message : String(e) }))
    const rest = (b.warnings ?? []).filter((w) => !w.startsWith('Aufnahme:'))
    if (res.status === 'ok') {
      b.warnings = rest
      verified++
    } else if (res.status === 'unreachable') {
      b.warnings = [...rest, `Aufnahme: ${res.message} Die Adresse könnte erfunden sein – bitte selbst im Archiv suchen, bevor das Blatt in die Klasse geht.`]
    } else {
      b.warnings = [...rest, `Aufnahme: ${res.message}${res.title ? ` Gefundene Seite: „${res.title}".` : ''}`]
    }
    onProgress?.(++done, videos.length)
  }
  return { videos: videos.length, verified }
}

export function allBlocks(ws: Worksheet): WsBlock[] {
  return ws.sheets.flatMap((s) => s.blocks)
}
