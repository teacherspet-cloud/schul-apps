/**
 * KI-Attrappe für die automatischen Oberflächentests – NIE im Betrieb.
 *
 * Anlass (25.09.2026): Die Hintergrund-Aufträge (parallel erzeugen, abbrechen, Ergebnis in
 * der Bibliothek) lassen sich nur prüfen, wenn tatsächlich etwas erzeugt wird. Echte
 * KI-Aufrufe kosten aber das Kontingent der Lehrkraft und sind in den Tests verboten.
 *
 * Eingeschaltet wird die Attrappe ausschließlich über die Umgebungsvariable
 * `SCHULAPPS_KI_ATTRAPPE` mit dem Pfad einer JSON-Datei:
 *
 *   { "verzoegerungMs": 3000, "antworten": { "worksheet_outline": { … }, … } }
 *
 * Je Auftragsart (`schemaName`) steht dort die Antwort. Die Attrappe wartet die Verzögerung
 * ab, meldet dabei stückweise „eingetroffene Zeichen" (damit der Balken sich bewegt) und
 * lässt sich wie jede echte Anfrage abbrechen. Die Programmversion für die Lehrkraft setzt
 * die Variable nie.
 */
import { readFileSync } from 'fs'
import type { StructuredRequest } from '@shared/types'
import { AbbruchFehler } from '@shared/abbruch'
import type { AiProvider, ChunkListener, Netzfund, RawModel } from './provider'

interface AttrappenDatei {
  verzoegerungMs?: number
  /**
   * Überhört den Abbruch und rechnet zu Ende – so verhält sich die Bild-KI von OpenAI.
   * Damit lässt sich prüfen, dass ein Auftrag trotzdem sofort als abgebrochen erscheint und
   * Wartende erfahren, warum der Platz noch belegt ist.
   */
  abbruchTaub?: boolean
  antworten?: Record<string, unknown>
}

export const attrappeAktiv = (): boolean => Boolean(process.env.SCHULAPPS_KI_ATTRAPPE)

function lies(): AttrappenDatei {
  try {
    return JSON.parse(readFileSync(process.env.SCHULAPPS_KI_ATTRAPPE ?? '', 'utf-8')) as AttrappenDatei
  } catch {
    return {}
  }
}

/** Wartet `ms`, meldet dabei Zeichen und endet beim Abbruch sofort. */
function warte(ms: number, laenge: number, onChunk?: ChunkListener, signal?: AbortSignal): Promise<void> {
  return new Promise((fertig, fehler) => {
    if (signal?.aborted) return fehler(new AbbruchFehler())
    const start = Date.now()
    const takt = setInterval(() => onChunk?.(Math.round((laenge * (Date.now() - start)) / Math.max(1, ms))), 200)
    const zeit = setTimeout(() => {
      clearInterval(takt)
      signal?.removeEventListener('abort', ab)
      fertig()
    }, ms)
    const ab = (): void => {
      clearInterval(takt)
      clearTimeout(zeit)
      fehler(new AbbruchFehler())
    }
    signal?.addEventListener('abort', ab, { once: true })
  })
}

export class AttrappeProvider implements AiProvider {
  async listModels(): Promise<RawModel[]> {
    return [{ id: 'attrappe', label: 'Attrappe (nur Tests)' }]
  }

  async structured<T>(req: StructuredRequest, _model: string, onChunk?: ChunkListener, signal?: AbortSignal): Promise<T> {
    const datei = lies()
    const antwort = datei.antworten?.[req.schemaName]
    if (antwort === undefined) throw new Error(`Attrappe: keine Antwort für „${req.schemaName}" hinterlegt.`)
    await warte(datei.verzoegerungMs ?? 2000, JSON.stringify(antwort).length, onChunk, datei.abbruchTaub ? undefined : signal)
    return structuredClone(antwort) as T
  }

  async generateImage(): Promise<string> {
    throw new Error('Attrappe: keine Bilder.')
  }

  async websuche(): Promise<Netzfund[]> {
    return []
  }
}
