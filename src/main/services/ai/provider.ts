import { StructuredRequest } from '@shared/types'

/** Ein Modell, wie es der Anbieter meldet (vor dem Filtern). */
export interface RawModel {
  id: string
  label?: string
  /** Veröffentlichungszeitpunkt in ms, falls bekannt */
  created?: number
  /** Anbieterspezifische Zusatzinfos zum Filtern */
  meta?: Record<string, unknown>
}

/**
 * Meldet, wie viele Zeichen der Antwort schon eingetroffen sind.
 *
 * Damit lässt sich ein Fortschrittsbalken füllen, der tatsächlich etwas anzeigt: Bis dahin
 * stand er still, weil eine Anfrage erst ganz am Ende ein Ergebnis liefert.
 */
export type ChunkListener = (chars: number) => void

/**
 * Eine Fundstelle aus dem offenen Netz.
 *
 * Bewusst nur Angaben ZUR Quelle, nie ihr Wortlaut: Was auf dem Blatt landet, lädt die App
 * anschließend selbst von der genannten Adresse (`services/sources/materialSuche.ts`). Ein
 * Sprachmodell, das einen Text „wiedergibt", ändert dabei Kleinigkeiten – und eine Adresse,
 * die es nie geöffnet hat, kann es ebenso flüssig erfinden. Beides fällt erst auf, wenn die
 * App die Seite selbst öffnet.
 */
export interface Netzfund {
  titel: string
  urheber?: string
  jahr?: string
  url: string
  auszug: string
}

/** Gemeinsame Schnittstelle aller KI-Anbieter. */
export interface AiProvider {
  /** Fragt die aktuell verfügbaren Modelle direkt beim Anbieter ab. */
  listModels(): Promise<RawModel[]>
  /**
   * `signal` bricht die Anfrage ab (Hintergrund-Aufträge lassen sich abbrechen). Die
   * Schnittstellen der Anbieter nehmen es direkt entgegen; im Abo-Weg wird das Programm beendet.
   */
  structured<T = unknown>(req: StructuredRequest, model: string, onChunk?: ChunkListener, signal?: AbortSignal): Promise<T>
  /** Liefert ein Bild als data:-URL; nicht jeder Anbieter kann Bilder erzeugen. */
  generateImage?(prompt: string, model: string, signal?: AbortSignal): Promise<string>
  /**
   * Sucht im offenen Netz nach Fundstellen. Nicht jeder Anbieter kann das.
   *
   * Fehlt die Fähigkeit oder scheitert die Suche, bleibt es bei den Archiven, die die App
   * selbst durchsucht – das Programm funktioniert dann weiter, nur mit weniger Auswahl.
   */
  websuche?(auftrag: string, model: string, signal?: AbortSignal): Promise<Netzfund[]>
}

/** Trennt eine data:-URL in MIME-Typ und Base64-Daten. */
export function splitDataUrl(url: string): { mimeType: string; data: string } {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(url)
  if (!match) throw new Error('Ungültiges Bildformat.')
  return { mimeType: match[1], data: match[2] }
}
