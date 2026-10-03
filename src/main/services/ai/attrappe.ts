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
import { appendFileSync, readFileSync } from 'fs'
import type { GeladeneQuelle, Materialanfrage, OnlineImageHit, Quellentreffer, StructuredRequest, TtsVoice } from '@shared/types'
import { stilleMp3, verbinde } from '@shared/mp3'
import type { Synthese } from '@shared/vertonung'
import { AbbruchFehler } from '@shared/abbruch'
import { fliesstext } from '../sources/fliesstext'
import { seitentitelAusHtml } from '@shared/artikelText'
import type { AiProvider, ChunkListener, Netzfund, RawModel } from './provider'

interface AttrappenDatei {
  verzoegerungMs?: number
  /**
   * Überhört den Abbruch und rechnet zu Ende – so verhält sich die Bild-KI von OpenAI.
   * Damit lässt sich prüfen, dass ein Auftrag trotzdem sofort als abgebrochen erscheint und
   * Wartende erfahren, warum der Platz noch belegt ist.
   */
  abbruchTaub?: boolean
  /**
   * Je Auftragsart die Antwort. Steht dort `{ "folge": [a, b, …] }`, kommen die Antworten der
   * Reihe nach (danach wieder von vorn) – so bekommen z. B. Fassung A und B einer
   * Klassenarbeit verschiedene Inhalte, und ein Test sieht, welche Fassung er vor sich hat.
   */
  antworten?: Record<string, unknown>
  /**
   * Pfad einer Datei, an die jede Anfrage als JSON-Zeile angehängt wird (Auftragsart, Text,
   * Zahl der Bilder). Damit prüft ein Test, WAS die App der KI geschickt hätte – etwa, dass
   * hineingezogenes Material im Auftrag steht.
   */
  protokoll?: string
  /**
   * Bild der Bild-KI (data:-URL, 01.10.2026). Fehlt es, gilt die Bild-KI als nicht eingerichtet und
   * `generateImage` scheitert wie bisher. Jeder Bildauftrag landet als `schemaName: "bild"` im Protokoll.
   */
  bild?: string
  /**
   * Treffer der Online-Bildsuche (statt Wikimedia/Openverse) – Vorschau und Bild als data:-URLs,
   * damit die Tests ohne Netz laufen. `[]` = die Suche findet nichts.
   */
  bildsuche?: OnlineImageHit[]
  /**
   * Materialsuche ohne Netz (01.10.2026): Treffer der Archivsuche und die Texte, die `sources:laden`
   * zu einer Adresse liefert. So lässt sich die Quellenauswahl samt Aussortieren prüfen, ohne
   * Wikisource zu belasten.
   */
  quellen?: { treffer: Quellentreffer[]; texte: Record<string, { titel: string; text?: string; html?: string }> }
  /** Funde der Websuche des Anbieters (sonst keine) */
  websuche?: Netzfund[]
  /**
   * Sprachsynthese ohne Netz (01.10.2026): zwei Stimmen, jede Zeile als Stille mit bekannter
   * Länge (`zeichenJeSekunde`, Vorgabe 15) plus 0,3 s Pause – mit Zeitmarken wie die
   * Dialog-Schnittstelle. Jeder Auftrag landet als `schemaName: "tts"` im Protokoll.
   */
  tts?: { zeichenJeSekunde?: number }
}

/** Wie oft je Auftragsart schon geantwortet wurde – für `folge` */
const zaehler = new Map<string, number>()

export const attrappeAktiv = (): boolean => Boolean(process.env.SCHULAPPS_KI_ATTRAPPE)

function lies(): AttrappenDatei {
  try {
    return JSON.parse(readFileSync(process.env.SCHULAPPS_KI_ATTRAPPE ?? '', 'utf-8')) as AttrappenDatei
  } catch {
    return {}
  }
}

/** Bild der Attrappe (falls hinterlegt) – dann gilt die Bild-KI als eingerichtet */
export const attrappeBild = (): string | undefined => (attrappeAktiv() ? lies().bild : undefined)

/** Treffer der Bildsuche aus der Attrappe (undefined = echte Suche) */
export const attrappeBildsuche = (): OnlineImageHit[] | undefined => (attrappeAktiv() ? lies().bildsuche : undefined)

/** Archivsuche der Attrappe (undefined = echte Suche) */
export function attrappeQuellensuche(_anfrage: Materialanfrage): Quellentreffer[] | undefined {
  if (!attrappeAktiv()) return undefined
  return lies().quellen?.treffer
}

/** Wortlaut einer Adresse aus der Attrappe (undefined = echt laden) */
export function attrappeQuelleLaden(url: string): GeladeneQuelle | undefined {
  if (!attrappeAktiv()) return undefined
  const q = lies().quellen
  if (!q) return undefined
  const t = q.texte[url]
  if (!t) return { url, titel: '', text: '', wortzahl: 0, fehler: 'Attrappe: Adresse unbekannt.' }
  // Eine hinterlegte HTML-Seite geht durch dieselbe Fließtext-Extraktion wie im Betrieb (01.10.2026)
  const text = t.html ? fliesstext(t.html, 'de') : (t.text ?? '')
  // Titel wie im Betrieb aus dem HTML (og:title, <h1>, <title>); der hinterlegte nur als Rückfall
  const titel = (t.html ? seitentitelAusHtml(t.html) : '') || t.titel
  return { url, titel, text, wortzahl: (text.match(/[\p{L}\p{N}]+/gu) ?? []).length }
}

/** Stimmen der Attrappe (undefined = echte Liste) */
export function attrappeStimmen(): TtsVoice[] | undefined {
  if (!attrappeAktiv() || !lies().tts) return undefined
  return [
    { id: 'probe-w', name: 'Probe weiblich', language: 'en', gender: 'female', description: 'Attrappe', usable: true },
    { id: 'probe-m', name: 'Probe männlich', language: 'en', gender: 'male', description: 'Attrappe', usable: true }
  ]
}

/** Sprachsynthese der Attrappe: Stille mit bekannter Länge je Zeile, mit Zeitmarken (undefined = echter Dienst) */
export function attrappeSynthese(): Synthese | undefined {
  if (!attrappeAktiv()) return undefined
  const datei = lies()
  if (!datei.tts) return undefined
  const jeSekunde = datei.tts.zeichenJeSekunde ?? 15
  return {
    modell: 'attrappe',
    async vertone(zeilen) {
      if (datei.protokoll) {
        try {
          appendFileSync(datei.protokoll, `${JSON.stringify({ schemaName: 'tts', system: '', user: zeilen.map((z) => z.text).join('\n'), bilder: 0 })}\n`)
        } catch {
          // Nur für Tests
        }
      }
      const teile: Uint8Array[] = []
      const zeiten: { von: number; bis: number }[] = []
      let t = 0
      zeilen.forEach((z, i) => {
        const dauer = Math.max(0.5, z.text.trim().length / jeSekunde)
        teile.push(stilleMp3(dauer, i + 1), stilleMp3(0.3))
        const echt = Math.max(1, Math.round(dauer / (1152 / 44100))) * (1152 / 44100)
        zeiten.push({ von: t, bis: t + echt })
        t += echt + Math.max(1, Math.round(0.3 / (1152 / 44100))) * (1152 / 44100)
      })
      return [{ mp3: verbinde(teile), zeilen: zeilen.length, zeiten }]
    }
  }
}

/** Bildauftrag der Attrappe: protokollieren, hinterlegtes Bild liefern */
export function attrappeBildErzeugen(prompt: string): string {
  const datei = lies()
  if (datei.protokoll) {
    try {
      appendFileSync(datei.protokoll, `${JSON.stringify({ schemaName: 'bild', system: '', user: prompt, bilder: 0 })}\n`)
    } catch {
      // Nur für Tests
    }
  }
  if (!datei.bild) throw new Error('Attrappe: keine Bilder.')
  return datei.bild
}

/**
 * Wartet `ms`, meldet dabei Zeichen und endet beim Abbruch sofort. Wie ein Anbieter mit
 * Antwortstrom liefert sie den bisherigen Text mit (Live-Vorschau, 02.10.2026).
 */
function warte(ms: number, text: string, onChunk?: ChunkListener, signal?: AbortSignal): Promise<void> {
  return new Promise((fertig, fehler) => {
    if (signal?.aborted) return fehler(new AbbruchFehler())
    const start = Date.now()
    const takt = setInterval(() => {
      const n = Math.min(text.length, Math.round((text.length * (Date.now() - start)) / Math.max(1, ms)))
      onChunk?.(n, text.slice(0, n))
    }, 200)
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
    const eintrag = datei.antworten?.[req.schemaName]
    if (eintrag === undefined) throw new Error(`Attrappe: keine Antwort für „${req.schemaName}" hinterlegt.`)
    const folge = (eintrag as { folge?: unknown[] } | null)?.folge
    const n = zaehler.get(req.schemaName) ?? 0
    zaehler.set(req.schemaName, n + 1)
    const antwort = Array.isArray(folge) && folge.length ? folge[n % folge.length] : eintrag
    if (datei.protokoll) {
      try {
        appendFileSync(
          datei.protokoll,
          `${JSON.stringify({
            schemaName: req.schemaName,
            system: req.system,
            user: req.user,
            bilder: req.images?.length ?? 0,
            // Anfang und Länge je Bild – zeigt, ob die Bilder unversehrt ankommen (03.10.2026)
            bildKoepfe: (req.images ?? []).map((b) => `${String(b).slice(0, 48)}…(${String(b).length})`)
          })}\n`
        )
      } catch {
        // Nur für Tests – ein fehlendes Protokoll darf die Antwort nicht verhindern
      }
    }
    await warte(datei.verzoegerungMs ?? 2000, JSON.stringify(antwort), onChunk, datei.abbruchTaub ? undefined : signal)
    return structuredClone(antwort) as T
  }

  async generateImage(prompt: string): Promise<string> {
    return attrappeBildErzeugen(prompt)
  }

  async websuche(): Promise<Netzfund[]> {
    return lies().websuche ?? []
  }
}
