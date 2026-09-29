import OpenAI from 'openai'
import { merkeVerbrauch } from './verbrauch'
import { abrufe } from '../images/politeFetch'
import { StructuredRequest } from '@shared/types'
import { AiProvider, ChunkListener, RawModel } from './provider'

export class OpenAiProvider implements AiProvider {
  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey, timeout: 180_000, maxRetries: 2, dangerouslyAllowBrowser: true })
  }

  async listModels(): Promise<RawModel[]> {
    try {
      const models: RawModel[] = []
      for await (const m of this.client.models.list()) models.push({ id: m.id, created: m.created * 1000 })
      return models
    } catch (e) {
      throw new Error(describeError(e))
    }
  }

  async structured<T>(req: StructuredRequest, model: string, onChunk?: ChunkListener, signal?: AbortSignal): Promise<T> {
    const content: OpenAI.Responses.ResponseInputContent[] = [{ type: 'input_text', text: req.user }]
    for (const url of req.images ?? []) {
      content.push({ type: 'input_image', image_url: url, detail: 'high' })
    }
    const params = {
      model,
      instructions: req.system,
      input: [{ role: 'user' as const, content }],
      text: {
        format: { type: 'json_schema' as const, name: req.schemaName, schema: req.schema, strict: true }
      }
    }
    try {
      // Ohne Zuhörer der einfache Weg; mit Zuhörer im Strom, damit der Fortschritt sichtbar wird
      if (!onChunk) {
        const response = await this.client.responses.create(params, { signal })
        merkeVerbrauch('openai', model, { eingabe: response.usage?.input_tokens ?? 0, ausgabe: response.usage?.output_tokens ?? 0 })
        if (!response.output_text) throw new Error('Die KI hat keine Antwort geliefert.')
        return JSON.parse(response.output_text) as T
      }
      const stream = await this.client.responses.create({ ...params, stream: true }, { signal })
      let text = ''
      for await (const event of stream) {
        if (event.type === 'response.output_text.delta') {
          text += event.delta
          onChunk(text.length)
        } else if (event.type === 'response.completed') {
          merkeVerbrauch('openai', model, { eingabe: event.response.usage?.input_tokens ?? 0, ausgabe: event.response.usage?.output_tokens ?? 0 })
        }
      }
      if (!text) throw new Error('Die KI hat keine Antwort geliefert.')
      return JSON.parse(text) as T
    } catch (e) {
      throw new Error(describeError(e))
    }
  }

  async generateImage(prompt: string, model: string, signal?: AbortSignal): Promise<string> {
    try {
      const res = await this.client.images.generate({ model, prompt, size: '1024x1024', n: 1 }, { signal })
      const b64 = res.data?.[0]?.b64_json
      if (b64) return `data:image/png;base64,${b64}`
      const url = res.data?.[0]?.url
      if (url) {
        const buf = Buffer.from(await (await abrufe(url, { signal })).arrayBuffer())
        return `data:image/png;base64,${buf.toString('base64')}`
      }
      throw new Error('Kein Bild erhalten.')
    } catch (e) {
      throw new Error(describeError(e))
    }
  }
}

function describeError(e: unknown): string {
  if (e instanceof OpenAI.AuthenticationError) return 'Der OpenAI-API-Schlüssel ist ungültig.'
  if (e instanceof OpenAI.RateLimitError) {
    if (e.code === 'insufficient_quota' || /quota|billing/i.test(e.message)) {
      return (
        'OpenAI: Auf dem API-Konto ist kein Guthaben vorhanden. Wichtig: Ein ChatGPT-Plus-Abo enthält keine API-Nutzung – ' +
        'die API wird getrennt abgerechnet. Bitte unter platform.openai.com → Settings → Billing Guthaben aufladen ' +
        '(z. B. 5–10 $). Nach dem Aufladen kann es einige Minuten dauern, bis der Schlüssel funktioniert.'
      )
    }
    return 'OpenAI: Zu viele Anfragen in kurzer Zeit (429). Bitte einen Moment warten und es erneut versuchen.'
  }
  if (e instanceof OpenAI.NotFoundError) return `OpenAI: Modell nicht gefunden. Bitte in den Einstellungen die Modellliste aktualisieren.`
  if (e instanceof OpenAI.APIError) return `OpenAI-Fehler ${e.status ?? ''}: ${e.message}`
  if (e instanceof Error) return e.message
  return String(e)
}
