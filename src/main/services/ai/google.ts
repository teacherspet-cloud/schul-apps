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
  return kiFehler(meldung, { status: e.status, voruebergehend: voruebergehenderStatus(e.status) && !kontingentLeer(e.message) })
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
      return 'Google: Kontingent erschöpft oder zu viele Anfragen (429). Ein Gemini-Abo enthält keine API-Nutzung – bitte in Google AI Studio die Abrechnung bzw. das Kontingent prüfen oder kurz warten.'
    }
    return `Google-Fehler ${e.status}: ${e.message}`
  }
  if (e instanceof Error) return e.message
  return String(e)
}
