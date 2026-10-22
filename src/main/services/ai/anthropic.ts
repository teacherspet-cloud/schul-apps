import Anthropic from '@anthropic-ai/sdk'
import { merkeVerbrauch } from './verbrauch'
import { StructuredRequest } from '@shared/types'
import { AiProvider, ChunkListener, RawModel, splitDataUrl } from './provider'
import { kiFehler, kontingentLeer, voruebergehenderStatus, wartenAusKopf } from './kiFehler'

/**
 * Nimmt das Modell `temperature`? (22.10.2026, KI-Sicherheitsprüfung) Belegt (Anthropic-Dokumentation, Stand 10/2026):
 * Fable/Mythos, Opus 4.7/4.8/5/5.5 und Sonnet 5 lehnen Sampling-Parameter mit 400 ab, Sonnet 5.5 und Haiku 5.5 jeden
 * Wert außer der Vorgabe. Opus/Sonnet 4.6, Haiku 4.5 und ältere nehmen sie.
 */
export const anthropicTemperatur = (modell: string): boolean => !/fable|mythos|opus-(4-[7-9]|[5-9])|sonnet-[5-9]|haiku-[5-9]/i.test(modell)

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

/** Modelle, bei denen die Anthropic-API bei einer Ablehnung serverseitig auf ein anderes Modell ausweichen kann. */
const SERVER_FALLBACK_MODELS = new Set(['claude-opus-5', 'claude-fable-5-1'])

export class AnthropicProvider implements AiProvider {
  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 0, dangerouslyAllowBrowser: true })
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
        // Bewertung: gleiche Antwort → gleiches Urteil, soweit das Modell es zulässt (22.10.2026)
        ...(req.bewertung && anthropicTemperatur(model) ? { temperature: 0 } : {}),
        messages: [{ role: 'user' as const, content }],
        output_config: { format: { type: 'json_schema' as const, schema: req.schema } },
        ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {})
      }
      // Mit Zuhörer im Strom: So lässt sich anzeigen, wie weit die Antwort gediehen ist.
      const response = onChunk
        ? await (() => {
            const stream = this.client.beta.messages.stream(params, { signal })
            let text = ''
            stream.on('text', (delta) => {
              text += delta
              onChunk(text.length, text)
            })
            return stream.finalMessage()
          })()
        : await this.client.beta.messages.create(params, { signal })

      merkeVerbrauch('anthropic', model, { eingabe: response.usage?.input_tokens ?? 0, ausgabe: response.usage?.output_tokens ?? 0 })
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
      throw alsKiFehler(e)
    }
  }
}

/** Fehler mit Status und Retry-After für `mitWiederholung` (22.10.2026) */
function alsKiFehler(e: unknown): Error {
  const meldung = describeError(e)
  if (!(e instanceof Anthropic.APIError)) return new Error(meldung)
  const status = e.status
  return kiFehler(meldung, { status, wartenMs: wartenAusKopf(e.headers), voruebergehend: voruebergehenderStatus(status) && !kontingentLeer(e.message) })
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
