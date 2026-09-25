import Anthropic from '@anthropic-ai/sdk'
import { StructuredRequest } from '@shared/types'
import { AiProvider, ChunkListener, RawModel, splitDataUrl } from './provider'

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

/** Modelle, bei denen die Anthropic-API bei einer Ablehnung serverseitig auf ein anderes Modell ausweichen kann. */
const SERVER_FALLBACK_MODELS = new Set(['claude-opus-5', 'claude-fable-5-1'])

export class AnthropicProvider implements AiProvider {
  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2 })
  }

  async listModels(): Promise<RawModel[]> {
    try {
      const models: RawModel[] = []
      for await (const m of this.client.models.list()) {
        models.push({
          id: m.id,
          label: m.display_name,
          created: Date.parse(m.created_at),
          meta: {
            imageInput: m.capabilities?.image_input?.supported,
            structuredOutputs: m.capabilities?.structured_outputs?.supported
          }
        })
      }
      return models
    } catch (e) {
      throw new Error(describeError(e))
    }
  }

  async structured<T>(req: StructuredRequest, model: string, onChunk?: ChunkListener, signal?: AbortSignal): Promise<T> {
    const content: Anthropic.Beta.BetaContentBlockParam[] = (req.images ?? []).map((url) => {
      const { mimeType, data } = splitDataUrl(url)
      return { type: 'image', source: { type: 'base64', media_type: mimeType as ImageMediaType, data } }
    })
    content.push({ type: 'text', text: req.user })

    try {
      const useFallback = SERVER_FALLBACK_MODELS.has(model)
      const params = {
        model,
        max_tokens: 16000,
        system: req.system,
        messages: [{ role: 'user' as const, content }],
        output_config: { format: { type: 'json_schema' as const, schema: req.schema } },
        ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {})
      }
      // Mit Zuhörer im Strom: So lässt sich anzeigen, wie weit die Antwort gediehen ist.
      const response = onChunk
        ? await (() => {
            const stream = this.client.beta.messages.stream(params, { signal })
            let chars = 0
            stream.on('text', (delta) => {
              chars += delta.length
              onChunk(chars)
            })
            return stream.finalMessage()
          })()
        : await this.client.beta.messages.create(params, { signal })

      if (response.stop_reason === 'refusal') {
        throw new Error('Claude hat die Anfrage abgelehnt. Bitte die Vokabeln oder das Thema prüfen.')
      }
      if (response.stop_reason === 'max_tokens') {
        throw new Error('Die Antwort von Claude war zu lang und wurde abgeschnitten. Bitte weniger Vokabeln pro Aufgabe wählen.')
      }
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
      if (!text) throw new Error('Claude hat keine Antwort geliefert.')
      return JSON.parse(text) as T
    } catch (e) {
      throw new Error(describeError(e))
    }
  }
}

function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Der Anthropic-API-Schlüssel ist ungültig.'
  if (e instanceof Anthropic.PermissionDeniedError) return 'Anthropic: Für dieses Modell fehlt die Berechtigung.'
  if (e instanceof Anthropic.NotFoundError) return 'Anthropic: Modell nicht gefunden. Bitte in den Einstellungen die Modellliste aktualisieren.'
  if (e instanceof Anthropic.RateLimitError) return 'Anthropic: Limit erreicht (429). Bitte kurz warten oder das Guthaben prüfen.'
  if (e instanceof Anthropic.BadRequestError && /credit balance/i.test(e.message)) {
    return 'Anthropic: Auf dem API-Konto ist kein Guthaben vorhanden. Ein Claude-Abo (Pro/Max) enthält keine API-Nutzung – bitte unter platform.claude.com → Billing Guthaben aufladen.'
  }
  if (e instanceof Anthropic.BadRequestError) return `Anthropic: Ungültige Anfrage – ${e.message}`
  if (e instanceof Anthropic.APIError) return `Anthropic-Fehler ${e.status ?? ''}: ${e.message}`
  if (e instanceof Error) return e.message
  return String(e)
}
