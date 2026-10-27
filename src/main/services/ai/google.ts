import { ApiError, GoogleGenAI, Part } from '@google/genai'
import { BILD_BLOCKIERT } from '@shared/bildBlockiert'
import { merkeVerbrauch } from './verbrauch'
import { StructuredRequest } from '@shared/types'
import { AiProvider, ChunkListener, RawModel, splitDataUrl } from './provider'
import { kiFehler, kontingentLeer, voruebergehenderStatus } from './kiFehler'

/**
 * Obergrenze der Ausgabe (22.10.2026, KI-Sicherheitsprüfung): Bei Gemini 2.5 zählen die Denkschritte mit.
 * Faustregel wie bei OpenAI (openai.ts): 32 768 schneidet keinen bisherigen Auftrag ab und deckelt Ausreißer.
 */
export const GOOGLE_MAX_AUSGABE = 32_768

export class GoogleProvider implements AiProvider {
  private client: GoogleGenAI

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey })
  }

  async listModels(): Promise<RawModel[]> {
    try {
      const models: RawModel[] = []
      const pager = await this.client.models.list({ config: { pageSize: 100 } })
      for await (const m of pager) {
        if (!m.name) continue
        models.push({
          id: m.name.replace(/^models\//, ''),
          label: m.displayName,
          meta: { actions: m.supportedActions ?? [] }
        })
      }
      return models
    } catch (e) {
      throw new Error(describeError(e))
    }
  }

  async structured<T>(req: StructuredRequest, model: string, onChunk?: ChunkListener, signal?: AbortSignal): Promise<T> {
    const parts: Part[] = [{ text: req.user }]
    for (const url of req.images ?? []) {
      const { mimeType, data } = splitDataUrl(url)
      parts.push({ inlineData: { mimeType, data } })
    }
    const params = {
      model,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: req.system,
        responseMimeType: 'application/json',
        responseJsonSchema: req.schema,
        maxOutputTokens: GOOGLE_MAX_AUSGABE,
        // Bewertung: gleiche Antwort → gleiches Urteil (22.10.2026; Gemini nimmt temperature bei allen Textmodellen)
        ...(req.bewertung ? { temperature: 0 } : {}),
        abortSignal: signal
      }
    }
    try {
      if (!onChunk) {
        const response = await this.client.models.generateContent(params)
        merkeVerbrauch('google', model, { eingabe: response.usageMetadata?.promptTokenCount ?? 0, ausgabe: response.usageMetadata?.candidatesTokenCount ?? 0 })
        if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw new Error('Die Antwort von Gemini war zu lang und wurde abgeschnitten.')
        const text = response.text
        if (!text) throw new Error('Gemini hat keine Antwort geliefert.')
        return JSON.parse(text) as T
      }
      // Im Strom: Der Fortschrittsbalken folgt der Länge der Antwort
      const stream = await this.client.models.generateContentStream(params)
      let text = ''
      let nutzung: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined
      for await (const chunk of stream) {
        if (chunk.usageMetadata) nutzung = chunk.usageMetadata
        if (chunk.text) {
          text += chunk.text
          onChunk(text.length, text)
        }
      }
      merkeVerbrauch('google', model, { eingabe: nutzung?.promptTokenCount ?? 0, ausgabe: nutzung?.candidatesTokenCount ?? 0 })
      if (!text) throw new Error('Gemini hat keine Antwort geliefert.')
      return JSON.parse(text) as T
    } catch (e) {
      throw alsKiFehler(e)
    }
  }

  async generateImage(prompt: string, model: string, signal?: AbortSignal): Promise<string> {
    try {
      if (model.startsWith('imagen')) {
        const res = await this.client.models.generateImages({ model, prompt, config: { numberOfImages: 1, abortSignal: signal } })
        const img = res.generatedImages?.[0]?.image
        if (!img?.imageBytes) throw new Error(`${BILD_BLOCKIERT}: Kein Bild erhalten (vermutlich vom Sicherheitsfilter blockiert).`)
        return `data:${img.mimeType ?? 'image/png'};base64,${img.imageBytes}`
      }
      // Gemini-Bildmodelle liefern das Bild als Teil einer normalen Antwort
      const res = await this.client.models.generateContent({
        model,
        contents: prompt,
        config: { responseModalities: ['IMAGE', 'TEXT'], abortSignal: signal }
      })
      const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
      if (!part?.inlineData?.data) throw new Error('Kein Bild erhalten.')
      return `data:${part.inlineData.mimeType ?? 'image/png'};base64,${part.inlineData.data}`
    } catch (e) {
      throw new Error(describeError(e))
    }
  }
}

/** Fehler mit Status für `mitWiederholung` (22.10.2026) – Google meldet kein Retry-After an der Fehlerklasse */
function alsKiFehler(e: unknown): Error {
  const meldung = describeError(e)
  if (!(e instanceof ApiError)) return new Error(meldung)
  // 429 (27.10.2026): nur das Minuten-Tempo der Gratisstufe ist vorübergehend – dann so lange warten, wie Google verlangt
  if (e.status === 429) {
    const k = googleKontingent(e.message)
    return kiFehler(meldung, {
      status: 429,
      voruebergehend: k.art === 'minute',
      ...(k.art === 'minute' && k.wartenMs ? { wartenMs: Math.min(k.wartenMs, GOOGLE_MAX_WARTEN_MS) } : {})
    })
  }
  return kiFehler(meldung, { status: e.status, voruebergehend: voruebergehenderStatus(e.status) && !kontingentLeer(e.message) })
}

/** Wartezeit auf das Minuten-Tempo der Gratisstufe (Google nennt meist 20–60 s) – länger blockiert den Platz zu lange */
export const GOOGLE_MAX_WARTEN_MS = 65_000

export interface GoogleKontingent {
  /** ohne = Modell hat in der Gratisstufe kein Kontingent (limit: 0); tag = Tageskontingent erschöpft; minute = Tempo */
  art: 'ohne' | 'tag' | 'minute' | 'unbekannt'
  model?: string
  wartenMs?: number
}

/**
 * Googles 429-Meldung lesen (27.10.2026, Befund der Lehrkraft: „Kontingent erschöpft" nach zwei Aufgaben). Die Meldung
 * nennt je Verstoß Metrik, Grenze und Modell („Quota exceeded for metric: …, limit: 0, model: gemini-4-argon, description:
 * Generate content requests per day limit exceeded on Free Tier") und zum Schluss „Please retry in 41.3s" bzw. „13h40m35s".
 * limit: 0 heißt: das Modell gibt es in der Gratisstufe gar nicht (Pro-Klasse, Bildmodelle) – nur mit Abrechnung.
 */
export function googleKontingent(message: string): GoogleKontingent {
  const model = /model:\s*([\w.-]+)/.exec(message)?.[1]
  const retry = /retry in\s*(?:(\d+)h)?(?:(\d+)m)?([\d.]+)s/i.exec(message)
  const wartenMs = retry ? Math.round(((Number(retry[1]) || 0) * 3600 + (Number(retry[2]) || 0) * 60 + Number(retry[3])) * 1000) : undefined
  const treffer = [...message.matchAll(/limit:\s*(\d+)[^\n]*?description:\s*([^\n.]*)/g)]
  if (!treffer.length) return { art: /quota|billing/i.test(message) ? 'unbekannt' : 'minute', model, wartenMs }
  if (treffer.every((m) => Number(m[1]) === 0)) return { art: 'ohne', model, wartenMs }
  const wirksam = treffer.filter((m) => Number(m[1]) > 0)
  if (wirksam.some((m) => /per day/i.test(m[2]))) return { art: 'tag', model, wartenMs }
  if (wirksam.some((m) => /per minute/i.test(m[2]))) return { art: 'minute', model, wartenMs }
  return { art: 'unbekannt', model, wartenMs }
}

function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 400 && /api key/i.test(e.message)) return 'Der Google-API-Schlüssel ist ungültig.'
    if (e.status === 403) return 'Google: Zugriff verweigert. Bitte den API-Schlüssel prüfen.'
    // 404 (27.10.2026): Google nennt in der Meldung den Grund und das Ersatzmodell („no longer available to new users …
    // use gemini-3.8-flash") – ohne ihn hieß es nur „Modell nicht gefunden", obwohl die Liste das Modell noch führte
    if (e.status === 404) {
      const grund = e.message
        .replace(/\s*Call ModelService\.ListModels.*$/i, '')
        .replace(/\s*We recommend you to use the Interactions API.*$/i, '')
        .trim()
      return `Google: Modell nicht verfügbar. ${
        grund ? `${grund} ` : ''
      }Bitte in den Einstellungen die Modellliste aktualisieren und das empfohlene Modell wählen.`
    }
    if (e.status === 429) {
      const k = googleKontingent(e.message)
      const wen = k.model ? `„${k.model}"` : 'dieses Modell'
      if (k.art === 'ohne')
        return `Google: ${wen} hat in der Gratisstufe kein Kontingent – es läuft nur mit hinterlegter Abrechnung in Google AI Studio. Ohne Abrechnung ein Flash-Modell wählen (z. B. gemini-3.8-flash oder gemini-3.5-flash-lite).`
      if (k.art === 'tag')
        return `Google: Das Tageskontingent der Gratisstufe für ${wen} ist erschöpft${
          k.wartenMs ? ` (frei in etwa ${Math.ceil(k.wartenMs / 3_600_000)} Stunden)` : ''
        }. Morgen weiter, ein anderes Flash-Modell wählen oder in Google AI Studio eine Abrechnung hinterlegen.`
      if (k.art === 'minute')
        return `Google: Zu viele Anfragen pro Minute für ${wen} (Gratisstufe)${
          k.wartenMs ? ` – Google verlangt ${Math.ceil(k.wartenMs / 1000)} s Pause` : ''
        }. Die App wartet und versucht es einmal erneut; sonst kurz warten oder den Sparmodus nutzen.`
      return 'Google: Kontingent erschöpft oder zu viele Anfragen (429). Ein Gemini-Abo enthält keine API-Nutzung – bitte in Google AI Studio die Abrechnung bzw. das Kontingent prüfen oder kurz warten.'
    }
    return `Google-Fehler ${e.status}: ${e.message}`
  }
  if (e instanceof Error) return e.message
  return String(e)
}
