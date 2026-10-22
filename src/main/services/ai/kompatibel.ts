/**
 * OpenAI-kompatible Anbieter (09.10.2026, Auftrag des Admins; Recherche: recherche/ki-anbieter-2026-10-09.md).
 *
 * Mistral, IONOS, STACKIT, Azure OpenAI, Gemini (OpenAI-Endpunkt), OpenRouter, lokale Modelle
 * (Ollama, LM Studio) und eigene Endpunkte sprechen dasselbe Format: `POST …/chat/completions`
 * mit `messages` und `response_format`. Ein Zugang für alle – die Unterschiede stehen in den
 * Voreinstellungen (shared/kiAnbieter.ts) und hier in `anfrageBauen`.
 *
 * Bewusst mit `fetch` statt mit dem OpenAI-Paket: Die Anfrage lässt sich so ohne Netz prüfen
 * (tests/kiKompatibel.test.ts), und Azure (Kopf `api-key`, Pfad mit Bereitstellung) braucht
 * keinen Sonderweg.
 *
 * Strukturierte Ausgabe: zuerst `json_schema` (strict). Lehnt ein Anbieter oder Modell das ab
 * (400/422 mit Hinweis auf das Format), geht dieselbe Anfrage noch einmal mit `json_object`
 * hinaus – das Schema steht dann in der Anweisung. Das merkt sich die App je Anbieter und Modell,
 * damit nicht jede Anfrage zweimal läuft. Die Antwort wird in beiden Fällen geprüft gelesen
 * (`jsonAusText`): Denkmodelle (Qwen3, gpt-oss lokal) schreiben gern `<think>…</think>` oder
 * Codezäune davor.
 *
 * Namensschutz: Dieser Zugang wird – wie alle – über den Kanal `ai:structured` aufgerufen; auf
 * dem Server umhüllt `server/namensschutz.ts` genau diesen Kanal. Es gibt keinen Weg daran vorbei.
 */
import type { KompatibelId, StructuredRequest } from '@shared/types'
import { kompatibelVorgabe } from '@shared/kiAnbieter'
import { merkeVerbrauch } from './verbrauch'
import type { AiProvider, ChunkListener, RawModel } from './provider'
import { kiFehler, kontingentLeer, voruebergehenderStatus, wartenAusKopf } from './kiFehler'

/**
 * Obergrenze der Ausgabe (22.10.2026, KI-Sicherheitsprüfung). Faustregel wie bei Claude (anthropic.ts): 16 000 Token
 * reichen für die größten Aufträge. Azure spricht die neuere Angabe `max_completion_tokens` (Denkmodelle lehnen
 * `max_tokens` dort ab) – mit Raum für das Nachdenken. Lehnt ein Anbieter die Angabe ab, geht die Anfrage einmal ohne sie
 * hinaus, und die App merkt sich das je Anbieter und Modell (wie beim Format).
 */
export const KOMPATIBEL_MAX_AUSGABE = 16_000
export const AZURE_MAX_AUSGABE = 32_000

/** Denkmodelle nehmen oft kein `temperature` (o-Reihe, gpt-5, „reasoner", R1, QwQ …) – Faustregel nach dem Namen */
export const kompatibelTemperatur = (modell: string): boolean => !/(^|[/:])(o\d|gpt-5)|reason|think|(^|[-/])r1\b|qwq/i.test(modell)

/** Teile der Anfrage, die ein Anbieter abgelehnt hat und die künftig wegbleiben */
export type Weglassen = 'grenze' | 'temperatur'

/** Alles, was ein Aufruf braucht */
export interface KompatibelZiel {
  id: KompatibelId
  basisUrl: string
  schluessel?: string
  azure?: boolean
  /** Azure mit älteren Ressourcen; leer = v1-Schnittstelle */
  apiVersion?: string
}

export type JsonModus = 'schema' | 'objekt'

/** Basis ohne Schrägstrich am Ende; Azure ohne Version: `…/openai/v1` ergänzen */
export function basisBereinigen(ziel: Pick<KompatibelZiel, 'basisUrl' | 'azure' | 'apiVersion'>): string {
  let b = ziel.basisUrl.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '')
  if (ziel.azure && !ziel.apiVersion && !/\/openai\/v1$/.test(b)) b = `${b.replace(/\/openai$/, '')}/openai/v1`
  return b
}

/**
 * Adresse prüfen. Auf dem Server (Mehrnutzerbetrieb) nur https und keine internen Ziele: Sonst
 * könnte ein eingetragener „eigener Endpunkt" Anfragen des Servers in dessen eigenes Netz lenken.
 * Lokale Modelle gibt es dort nicht.
 */
export function adressePruefen(url: string, server: boolean): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return 'Die Adresse des KI-Anbieters ist ungültig.'
  }
  if (!['https:', 'http:'].includes(u.protocol)) return 'Die Adresse muss mit https:// beginnen.'
  if (!server) return null
  if (u.protocol !== 'https:') return 'Auf dem Server sind nur https-Adressen erlaubt.'
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const intern =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    !host.includes('.') ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '::1' ||
    /^(fc|fd|fe80)/.test(host)
  return intern ? 'Auf dem Server sind lokale oder interne Adressen nicht erlaubt.' : null
}

/**
 * Interne Adresse? (22.10.2026, KI-Sicherheitsprüfung: SSRF) – IPv4 und IPv6 einschließlich eingebetteter IPv4.
 * Belegt (IANA Special-Purpose Registry): 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0/24, 192.168/16,
 * 198.18/15, ab 224/4; IPv6 ::, ::1, fc00::/7, fe80::/10, ff00::/8, ::ffff:a.b.c.d, 64:ff9b::/96.
 */
export function istInterneIp(ip: string): boolean {
  const a = ip.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '')
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a)
  if (v4) {
    const [x, y, z] = [Number(v4[1]), Number(v4[2]), Number(v4[3])]
    return (
      x === 0 ||
      x === 10 ||
      x === 127 ||
      (x === 100 && y >= 64 && y <= 127) ||
      (x === 169 && y === 254) ||
      (x === 172 && y >= 16 && y <= 31) ||
      (x === 192 && y === 168) ||
      (x === 192 && y === 0 && z === 0) ||
      (x === 198 && (y === 18 || y === 19)) ||
      x >= 224
    )
  }
  if (!a.includes(':')) return true // weder IPv4 noch IPv6 – im Zweifel intern
  const eingebettet = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(a)
  if (eingebettet) return istInterneIp(eingebettet[1])
  // ::ffff:7f00:1 (hexadezimal eingebettet)
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(a)
  if (hex) {
    const h = parseInt(hex[1], 16)
    const l = parseInt(hex[2], 16)
    return istInterneIp(`${h >> 8}.${h & 255}.${l >> 8}.${l & 255}`)
  }
  return a === '::' || a === '::1' || /^f[cd]/.test(a) || /^fe[89ab]/.test(a) || /^ff/.test(a)
}

/**
 * Auf dem Server zusätzlich den Namen auflösen und JEDE gelieferte Adresse prüfen (22.10.2026): Ein harmlos aussehender
 * Name kann auf 127.0.0.1 oder ins Container-Netz zeigen. `nachschlagen` liefert die Adressen (Server: dns.lookup) –
 * so bleibt diese Datei ohne Node-Abhängigkeit (iPad-App). Rest-Risiko (Faustregel): Ein Name, der zwischen Prüfung und
 * Abruf die Adresse wechselt (DNS-Rebinding), ist so nicht ganz ausgeschlossen.
 */
export async function adresseAufgeloestPruefen(url: string, nachschlagen: (host: string) => Promise<string[]>): Promise<string | null> {
  const einfach = adressePruefen(url, true)
  if (einfach) return einfach
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '')
  let adressen: string[]
  try {
    adressen = /^[\d.]+$/.test(host) || host.includes(':') ? [host] : await nachschlagen(host)
  } catch {
    return 'Die Adresse des KI-Anbieters lässt sich nicht auflösen.'
  }
  if (!adressen.length) return 'Die Adresse des KI-Anbieters lässt sich nicht auflösen.'
  return adressen.some(istInterneIp) ? 'Auf dem Server sind lokale oder interne Adressen nicht erlaubt.' : null
}

/** Prüfung vor jedem Abruf – nur auf dem Server gesetzt (server/bremse.ts › dnsAdressPruefer); am PC nichts */
let adressPruefer: ((url: string) => Promise<string | null>) | null = null
export const setzeAdressPruefer = (fn: typeof adressPruefer): void => {
  adressPruefer = fn
}

/** Schema-Anweisung für den Rückfall `json_object` */
const schemaHinweis = (req: StructuredRequest): string =>
  `\n\nAntworte ausschließlich mit EINEM JSON-Objekt (ohne Text davor oder danach, ohne Codezaun), das genau diesem JSON-Schema entspricht:\n${JSON.stringify(req.schema)}`

/** Die Anfrage an den Anbieter – ohne Netz, damit sie sich prüfen lässt */
export function anfrageBauen(
  ziel: KompatibelZiel,
  req: StructuredRequest,
  modell: string,
  modus: JsonModus,
  strom: boolean,
  weglassen: ReadonlySet<Weglassen> = new Set()
): { url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } } {
  const basis = basisBereinigen(ziel)
  const url =
    ziel.azure && ziel.apiVersion
      ? `${basis}/openai/deployments/${encodeURIComponent(modell)}/chat/completions?api-version=${encodeURIComponent(ziel.apiVersion)}`
      : `${basis}/chat/completions`
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: strom ? 'text/event-stream' : 'application/json' }
  if (ziel.schluessel) {
    if (ziel.azure) headers['api-key'] = ziel.schluessel
    else headers.Authorization = `Bearer ${ziel.schluessel}`
  }
  if (ziel.id === 'openrouter') headers['X-Title'] = 'Schul-Apps'
  const bilder = req.images ?? []
  const user = bilder.length
    ? [{ type: 'text', text: req.user }, ...bilder.map((url) => ({ type: 'image_url', image_url: { url } }))]
    : req.user
  const body: Record<string, unknown> = {
    model: modell,
    messages: [
      { role: 'system', content: modus === 'schema' ? req.system : req.system + schemaHinweis(req) },
      { role: 'user', content: user }
    ],
    response_format:
      modus === 'schema'
        ? { type: 'json_schema', json_schema: { name: (req.schemaName || 'antwort').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64), schema: req.schema, strict: true } }
        : { type: 'json_object' }
  }
  // Obergrenze der Ausgabe und Bewertung mit temperature 0 (22.10.2026, siehe oben)
  if (!weglassen.has('grenze')) {
    if (ziel.azure) body.max_completion_tokens = AZURE_MAX_AUSGABE
    else body.max_tokens = KOMPATIBEL_MAX_AUSGABE
  }
  if (req.bewertung && !weglassen.has('temperatur') && kompatibelTemperatur(modell)) body.temperature = 0
  if (strom) {
    body.stream = true
    body.stream_options = { include_usage: true }
  }
  return { url, init: { method: 'POST', headers, body: JSON.stringify(body) } }
}

/**
 * JSON aus einer Antwort lesen – auch wenn ein Modell Denkschritte, Codezäune oder einen Satz
 * davor schreibt (Rückfall `json_object`, lokale Modelle).
 */
export function jsonAusText<T = unknown>(text: string): T {
  const roh = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  try {
    return JSON.parse(roh) as T
  } catch {
    // weiter unten
  }
  const zaun = /```(?:json)?\s*([\s\S]*?)```/i.exec(roh)
  if (zaun) {
    try {
      return JSON.parse(zaun[1].trim()) as T
    } catch {
      // weiter unten
    }
  }
  const a = roh.indexOf('{')
  const e = roh.lastIndexOf('}')
  if (a >= 0 && e > a) return JSON.parse(roh.slice(a, e + 1)) as T
  throw new SyntaxError('Die KI hat kein gültiges JSON geliefert.')
}

/** Lehnt der Anbieter das Format `json_schema` ab? (dann Rückfall auf `json_object`) */
export function formatAbgelehnt(status: number, text: string): boolean {
  return (status === 400 || status === 422 || status === 501) && /response_format|json_schema|schema|structured|strict|not supported|unsupported/i.test(text)
}

/** Lehnt der Anbieter die Obergrenze oder temperature ab? (dann ohne sie erneut) */
export function parameterAbgelehnt(status: number, text: string): Weglassen | null {
  if (status !== 400 && status !== 422) return null
  const art = /unsupported|not supported|unknown|unrecognized|invalid|only the default|extra|not permitted|too large|exceed/i
  if (/max_(completion_)?tokens/i.test(text) && art.test(text)) return 'grenze'
  if (/temperature/i.test(text) && art.test(text)) return 'temperatur'
  return null
}

/** Verständliche Meldung zu einer Fehlerantwort */
export function fehlerMeldung(label: string, status: number, text: string): string {
  const detail = ((): string => {
    try {
      const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string; detail?: string }
      return (typeof j.error === 'string' ? j.error : j.error?.message) ?? j.message ?? j.detail ?? ''
    } catch {
      return text.slice(0, 200)
    }
  })()
  if (status === 401 || status === 403) return `${label}: Der Schlüssel ist ungültig oder hat keine Berechtigung.`
  if (status === 404) return `${label}: Modell oder Adresse nicht gefunden. Bitte Adresse und Modellname (bei Azure: Name der Bereitstellung) prüfen.`
  if (status === 429 || /quota|rate limit|insufficient/i.test(detail)) return `${label}: Limit oder Kontingent erreicht (429). Bitte kurz warten oder das Guthaben prüfen.`
  return `${label}-Fehler ${status}${detail ? `: ${detail}` : ''}`
}

/** Merkt sich je Anbieter und Modell, dass nur `json_object` geht */
const nurObjekt = new Set<string>()
/** Je Anbieter und Modell: abgelehnte Teile der Anfrage (22.10.2026) */
const ohne = new Map<string, Set<Weglassen>>()
export const vergissFormate = (): void => {
  nurObjekt.clear()
  ohne.clear()
}

type Holen = typeof fetch

export class KompatibelProvider implements AiProvider {
  private label: string

  constructor(
    private ziel: KompatibelZiel,
    private holen: Holen = (...a) => fetch(...a)
  ) {
    this.label = kompatibelVorgabe(ziel.id)?.label.replace(/\s*\(.*\)$/, '') ?? ziel.id
  }

  async listModels(): Promise<RawModel[]> {
    // Azure mit Version: Bereitstellungen lassen sich mit dem Schlüssel nicht auflisten
    if (this.ziel.azure && this.ziel.apiVersion) return []
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (this.ziel.schluessel) {
      if (this.ziel.azure) headers['api-key'] = this.ziel.schluessel
      else headers.Authorization = `Bearer ${this.ziel.schluessel}`
    }
    const res = await this.netz(`${basisBereinigen(this.ziel)}/models`, { headers })
    const text = await res.text()
    if (!res.ok) throw new Error(fehlerMeldung(this.label, res.status, text))
    type Eintrag = { id?: string; name?: string; created?: number }
    const j = jsonAusText<{ data?: Eintrag[]; models?: Eintrag[] }>(text)
    return (j.data ?? j.models ?? [])
      .map((m) => ({ id: String(m.id ?? m.name ?? '').replace(/^models\//, ''), created: typeof m.created === 'number' ? m.created * 1000 : undefined }))
      .filter((m) => m.id)
  }

  async structured<T>(req: StructuredRequest, model: string, onChunk?: ChunkListener, signal?: AbortSignal): Promise<T> {
    if (!model) throw new Error(`${this.label}: Kein Modell gewählt. Bitte in den Einstellungen ein Modell eintragen.`)
    const merk = `${this.ziel.id}|${this.ziel.basisUrl}|${model}`
    const weg = ohne.get(merk) ?? new Set<Weglassen>()
    // Höchstens drei Rücknahmen: Obergrenze, temperature, Format – je einmal (22.10.2026)
    for (let anlauf = 0; ; anlauf++) {
      const modus: JsonModus = nurObjekt.has(merk) ? 'objekt' : 'schema'
      try {
        return await this.einmal<T>(req, model, modus, onChunk, signal, weg)
      } catch (e) {
        if (anlauf < 3 && e instanceof ParameterFehler && !weg.has(e.teil)) {
          weg.add(e.teil)
          ohne.set(merk, weg)
          continue
        }
        if (anlauf < 3 && modus === 'schema' && e instanceof FormatFehler) {
          nurObjekt.add(merk)
          continue
        }
        throw e
      }
    }
  }

  private async einmal<T>(
    req: StructuredRequest,
    model: string,
    modus: JsonModus,
    onChunk?: ChunkListener,
    signal?: AbortSignal,
    weglassen: ReadonlySet<Weglassen> = new Set()
  ): Promise<T> {
    const { url, init } = anfrageBauen(this.ziel, req, model, modus, Boolean(onChunk), weglassen)
    const res = await this.netz(url, { ...init, signal })
    if (!res.ok) {
      const text = await res.text()
      const teil = parameterAbgelehnt(res.status, text)
      if (teil) throw new ParameterFehler(teil, fehlerMeldung(this.label, res.status, text))
      if (formatAbgelehnt(res.status, text)) throw new FormatFehler(fehlerMeldung(this.label, res.status, text))
      throw kiFehler(fehlerMeldung(this.label, res.status, text), {
        status: res.status,
        wartenMs: wartenAusKopf(res.headers),
        voruebergehend: voruebergehenderStatus(res.status) && !kontingentLeer(text)
      })
    }
    if (!onChunk || !res.body) {
      const j = (await res.json()) as {
        choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      merkeVerbrauch(this.ziel.id, model, { eingabe: j.usage?.prompt_tokens ?? 0, ausgabe: j.usage?.completion_tokens ?? 0 })
      const wahl = j.choices?.[0]
      if (wahl?.message?.refusal) throw new Error(`${this.label} hat die Anfrage abgelehnt.`)
      if (wahl?.finish_reason === 'length') throw new Error(`Die Antwort von ${this.label} war zu lang und wurde abgeschnitten.`)
      const text = wahl?.message?.content ?? ''
      if (!text) throw new Error(`${this.label} hat keine Antwort geliefert.`)
      return jsonAusText<T>(text)
    }
    const text = await this.stromLesen(res.body, model, onChunk)
    if (!text) throw new Error(`${this.label} hat keine Antwort geliefert.`)
    return jsonAusText<T>(text)
  }

  /** Antwortstrom (Server-Sent Events) lesen – stückweise, ohne Zeichen zu zerreißen (textstrom.ts) */
  private async stromLesen(body: ReadableStream<Uint8Array>, model: string, onChunk: ChunkListener): Promise<string> {
    // TextDecoder mit stream: hält angefangene Byte-Folgen zurück wie StringDecoder – läuft aber auch in der iPad-App
    // (node:string_decoder gibt es im Browser-Bündel nicht; 09.10.2026)
    const decoder = new TextDecoder('utf-8')
    const reader = body.getReader()
    let puffer = ''
    let text = ''
    let nutzung: { prompt_tokens?: number; completion_tokens?: number } | undefined
    const zeile = (z: string): void => {
      const d = z.trim()
      if (!d.startsWith('data:')) return
      const daten = d.slice(5).trim()
      if (!daten || daten === '[DONE]') return
      try {
        const j = JSON.parse(daten) as { choices?: { delta?: { content?: string | null } }[]; usage?: typeof nutzung }
        if (j.usage) nutzung = j.usage
        const stueck = j.choices?.[0]?.delta?.content
        if (stueck) {
          text += stueck
          onChunk(text.length, text)
        }
      } catch {
        // unvollständige Zeile – kommt nicht vor, da nur ganze Zeilen gelesen werden
      }
    }
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      puffer += decoder.decode(value, { stream: true })
      const zeilen = puffer.split(/\r?\n/)
      puffer = zeilen.pop() ?? ''
      zeilen.forEach(zeile)
    }
    puffer += decoder.decode()
    if (puffer) zeile(puffer)
    merkeVerbrauch(this.ziel.id, model, { eingabe: nutzung?.prompt_tokens ?? 0, ausgabe: nutzung?.completion_tokens ?? 0 })
    return text
  }

  private async netz(url: string, init: RequestInit): Promise<Response> {
    // Server: Namen auflösen und interne Ziele ablehnen (SSRF, 22.10.2026) – am PC ohne Wirkung
    const verboten = adressPruefer ? await adressPruefer(url) : null
    if (verboten) throw new Error(verboten)
    try {
      return await this.holen(url, init)
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e
      const lokal = this.ziel.id === 'lokal'
      throw new Error(
        lokal
          ? 'Das lokale Modell antwortet nicht. Läuft Ollama bzw. der Server von LM Studio, und stimmt die Adresse?'
          : `${this.label} ist nicht erreichbar (${e instanceof Error ? e.message : String(e)}).`
      )
    }
  }
}

/** Der Anbieter lehnt `json_schema` ab – Rückfall auf `json_object` */
class FormatFehler extends Error {}

/** Der Anbieter lehnt Obergrenze oder temperature ab – ohne sie erneut (22.10.2026) */
class ParameterFehler extends Error {
  constructor(
    public teil: Weglassen,
    meldung: string
  ) {
    super(meldung)
  }
}
