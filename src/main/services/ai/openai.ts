import OpenAI from 'openai'
import { merkeVerbrauch } from './verbrauch'
import { abrufe } from '../images/politeFetch'
import { StructuredRequest } from '@shared/types'
import { BILD_BLOCKIERT } from '@shared/bildBlockiert'
import { AiProvider, ChunkListener, RawModel } from './provider'
import { kiFehler, kontingentLeer, voruebergehenderStatus, wartenAusKopf } from './kiFehler'

/**
 * Obergrenze der Ausgabe (22.10.2026, KI-Sicherheitsprüfung): Bei Denkmodellen zählen die Denkschritte mit.
 * Faustregel: Die größten Aufträge (Arbeitsblatt, Klassenarbeit) liefern unter 16 000 Token Antwort – Claude ist seit
 * jeher auf 16 000 begrenzt –, dazu Raum für das Nachdenken. 32 000 schneidet nichts Bisheriges ab und deckelt Ausreißer.
 */
export const OPENAI_MAX_AUSGABE = 32_000

/**
 * Nimmt das Modell `temperature`? Denkmodelle der Responses-Schnittstelle (o-Reihe, gpt-5 …) lehnen sie mit 400 ab
 * (belegt: OpenAI-Dokumentation „reasoning models"); nur die älteren Chat-Modelle (gpt-4o, gpt-4.1) nehmen sie.
 */
export const openaiTemperatur = (modell: string): boolean => /^(gpt-4o|gpt-4\.1|gpt-4-|gpt-4$|gpt-3)/i.test(modell)

export class OpenAiProvider implements AiProvider {
  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey, timeout: 180_000, maxRetries: 0, dangerouslyAllowBrowser: true })
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
      max_output_tokens: OPENAI_MAX_AUSGABE,
      // Nicht beim Anbieter ablegen (23.10.2026, Nachprüfung des Schulträgers): Die Responses-Schnittstelle speichert
      // sonst jede Antwort mindestens 30 Tage zum späteren Abruf (Standard `store: true`). Missbrauchsprotokolle bei
      // OpenAI (bis 30 Tage) bleiben davon unberührt – siehe Datenschutzerklärung.
      store: false,
      // Bewertung: gleiche Antwort → gleiches Urteil, soweit das Modell es zulässt (22.10.2026)
      ...(req.bewertung && openaiTemperatur(model) ? { temperature: 0 } : {}),
      text: {
        format: { type: 'json_schema' as const, name: req.schemaName, schema: req.schema, strict: true }
      }
    }
    try {
      // Ohne Zuhörer der einfache Weg; mit Zuhörer im Strom, damit der Fortschritt sichtbar wird
      if (!onChunk) {
        const response = await this.client.responses.create(params, { signal })
        merkeVerbrauch('openai', model, { eingabe: response.usage?.input_tokens ?? 0, ausgabe: response.usage?.output_tokens ?? 0 })
        if (response.incomplete_details?.reason === 'max_output_tokens') throw new Error('Die Antwort von OpenAI war zu lang und wurde abgeschnitten.')
        if (!response.output_text) throw new Error('Die KI hat keine Antwort geliefert.')
        return JSON.parse(response.output_text) as T
      }
      const stream = await this.client.responses.create({ ...params, stream: true }, { signal })
      let text = ''
      for await (const event of stream) {
        if (event.type === 'response.output_text.delta') {
          text += event.delta
          onChunk(text.length, text)
        } else if (event.type === 'response.completed') {
          merkeVerbrauch('openai', model, { eingabe: event.response.usage?.input_tokens ?? 0, ausgabe: event.response.usage?.output_tokens ?? 0 })
        } else if (event.type === 'response.incomplete') {
          merkeVerbrauch('openai', model, { eingabe: event.response.usage?.input_tokens ?? 0, ausgabe: event.response.usage?.output_tokens ?? 0 })
          if (event.response.incomplete_details?.reason === 'max_output_tokens') throw new Error('Die Antwort von OpenAI war zu lang und wurde abgeschnitten.')
        }
      }
      if (!text) throw new Error('Die KI hat keine Antwort geliefert.')
      return JSON.parse(text) as T
    } catch (e) {
      throw alsKiFehler(e)
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
      // Inhaltlich abgelehnt (12.10.2026): keine Begrenzung – siehe shared/bildBlockiert.ts
      if (e instanceof OpenAI.APIError && /moderation|content.?polic|safety/i.test(`${e.code ?? ''} ${e.message}`)) throw new Error(`${BILD_BLOCKIERT}: ${e.message}`)
      throw new Error(describeError(e))
    }
  }
}

/** Fehler mit Status und Retry-After für `mitWiederholung` (22.10.2026) */
function alsKiFehler(e: unknown): Error {
  const meldung = describeError(e)
  if (!(e instanceof OpenAI.APIError)) return new Error(meldung)
  const status = e.status
  const leer = status === 429 && (e.code === 'insufficient_quota' || kontingentLeer(e.message))
  return kiFehler(meldung, { status, wartenMs: wartenAusKopf(e.headers), voruebergehend: voruebergehenderStatus(status) && !leer })
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
