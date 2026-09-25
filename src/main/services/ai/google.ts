import { ApiError, GoogleGenAI, Part } from '@google/genai'
import { StructuredRequest } from '@shared/types'
import { AiProvider, ChunkListener, RawModel, splitDataUrl } from './provider'

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
        abortSignal: signal
      }
    }
    try {
      if (!onChunk) {
        const response = await this.client.models.generateContent(params)
        const text = response.text
        if (!text) throw new Error('Gemini hat keine Antwort geliefert.')
        return JSON.parse(text) as T
      }
      // Im Strom: Der Fortschrittsbalken folgt der Länge der Antwort
      const stream = await this.client.models.generateContentStream(params)
      let text = ''
      for await (const chunk of stream) {
        if (chunk.text) {
          text += chunk.text
          onChunk(text.length)
        }
      }
      if (!text) throw new Error('Gemini hat keine Antwort geliefert.')
      return JSON.parse(text) as T
    } catch (e) {
      throw new Error(describeError(e))
    }
  }

  async generateImage(prompt: string, model: string, signal?: AbortSignal): Promise<string> {
    try {
      if (model.startsWith('imagen')) {
        const res = await this.client.models.generateImages({ model, prompt, config: { numberOfImages: 1, abortSignal: signal } })
        const img = res.generatedImages?.[0]?.image
        if (!img?.imageBytes) throw new Error('Kein Bild erhalten (evtl. vom Sicherheitsfilter blockiert).')
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

function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 400 && /api key/i.test(e.message)) return 'Der Google-API-Schlüssel ist ungültig.'
    if (e.status === 403) return 'Google: Zugriff verweigert. Bitte den API-Schlüssel prüfen.'
    if (e.status === 404) return 'Google: Modell nicht gefunden. Bitte in den Einstellungen die Modellliste aktualisieren.'
    if (e.status === 429) {
      return 'Google: Kontingent erschöpft oder zu viele Anfragen (429). Ein Gemini-Abo enthält keine API-Nutzung – bitte in Google AI Studio die Abrechnung bzw. das Kontingent prüfen oder kurz warten.'
    }
    return `Google-Fehler ${e.status}: ${e.message}`
  }
  if (e instanceof Error) return e.message
  return String(e)
}
