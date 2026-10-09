import { describe, expect, it, vi } from 'vitest'
import type { StructuredRequest } from '@shared/types'

/*
 * OpenAI-kompatible Anbieter (09.10.2026): Anfragen ohne Netz prüfen (fetch ist eine Attrappe) – Aufbau für
 * Mistral/IONOS/…, Azure (v1 und ältere Version), Gemini-Endpunkt; Rückfall json_schema → json_object; Antwortstrom.
 * KEINE echten KI-Anfragen.
 */
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/nie-benutzt' } }))
vi.mock('../src/main/services/ai/verbrauch', () => ({ merkeVerbrauch: vi.fn() }))

const { anfrageBauen, adressePruefen, basisBereinigen, fehlerMeldung, formatAbgelehnt, jsonAusText, KompatibelProvider, vergissFormate } = await import(
  '../src/main/services/ai/kompatibel'
)
const { filterModels, builtinOptions } = await import('../src/main/services/ai/catalog')
const { AI_PROVIDERS, DEFAULT_SETTINGS, aboInfo } = await import('@shared/types')

const REQ: StructuredRequest = {
  system: 'Erzeuge Aufgaben.',
  user: 'Thema: Wetter',
  schemaName: 'worksheet block',
  schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false }
}

const antwort = (inhalt: string, status = 200): Response =>
  new Response(
    status === 200 ? JSON.stringify({ choices: [{ message: { content: inhalt }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 4 } }) : inhalt,
    { status, headers: { 'Content-Type': 'application/json' } }
  )

describe('Anfrage bauen', () => {
  it('Mistral: Bearer-Schlüssel, chat/completions, json_schema strict, Name bereinigt', () => {
    const { url, init } = anfrageBauen({ id: 'mistral', basisUrl: 'https://api.mistral.ai/v1/', schluessel: 'geheim' }, REQ, 'mistral-large-latest', 'schema', false)
    expect(url).toBe('https://api.mistral.ai/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer geheim')
    expect(init.headers['api-key']).toBeUndefined()
    const body = JSON.parse(init.body)
    expect(body.model).toBe('mistral-large-latest')
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Erzeuge Aufgaben.' })
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Thema: Wetter' })
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'worksheet_block', schema: REQ.schema, strict: true } })
    expect(body.stream).toBeUndefined()
  })

  it('Bilder als image_url-Teile, Strom mit Nutzungsangabe', () => {
    const { init } = anfrageBauen({ id: 'stackit', basisUrl: 'https://x.example/v1', schluessel: 's' }, { ...REQ, images: ['data:image/png;base64,AAA'] }, 'm', 'schema', true)
    const body = JSON.parse(init.body)
    expect(body.messages[1].content).toEqual([
      { type: 'text', text: 'Thema: Wetter' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } }
    ])
    expect(body.stream).toBe(true)
    expect(body.stream_options).toEqual({ include_usage: true })
  })

  it('json_object-Rückfall: Schema steht in der Anweisung', () => {
    const { init } = anfrageBauen({ id: 'ionos', basisUrl: 'https://openai.inference.de-txl.ionos.com/v1', schluessel: 's' }, REQ, 'm', 'objekt', false)
    const body = JSON.parse(init.body)
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages[0].content).toContain('Erzeuge Aufgaben.')
    expect(body.messages[0].content).toContain(JSON.stringify(REQ.schema))
  })

  it('Azure v1: …/openai/v1/chat/completions mit Kopf api-key, Modell = Bereitstellung', () => {
    const ziel = { id: 'azure' as const, basisUrl: 'https://schule.openai.azure.com/', schluessel: 'az', azure: true }
    expect(basisBereinigen(ziel)).toBe('https://schule.openai.azure.com/openai/v1')
    const { url, init } = anfrageBauen(ziel, REQ, 'gpt-54-eu', 'schema', false)
    expect(url).toBe('https://schule.openai.azure.com/openai/v1/chat/completions')
    expect(init.headers['api-key']).toBe('az')
    expect(init.headers.Authorization).toBeUndefined()
    expect(JSON.parse(init.body).model).toBe('gpt-54-eu')
    // schon mit /openai/v1 eingetragen: nicht doppelt
    expect(basisBereinigen({ ...ziel, basisUrl: 'https://schule.openai.azure.com/openai/v1' })).toBe('https://schule.openai.azure.com/openai/v1')
  })

  it('Azure mit API-Version: Pfad mit Bereitstellung und api-version', () => {
    const { url } = anfrageBauen(
      { id: 'azure', basisUrl: 'https://schule.openai.azure.com', schluessel: 'az', azure: true, apiVersion: '2025-04-01-preview' },
      REQ,
      'mein deployment',
      'schema',
      false
    )
    expect(url).toBe('https://schule.openai.azure.com/openai/deployments/mein%20deployment/chat/completions?api-version=2025-04-01-preview')
  })

  it('Gemini über den OpenAI-Endpunkt', () => {
    const { url, init } = anfrageBauen({ id: 'gemini_oai', basisUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', schluessel: 'AIza' }, REQ, 'gemini-2.5-pro', 'schema', false)
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer AIza')
  })

  it('Lokal ohne Schlüssel: kein Authorization-Kopf', () => {
    const { init } = anfrageBauen({ id: 'lokal', basisUrl: 'http://localhost:11434/v1' }, REQ, 'qwen3:30b', 'schema', false)
    expect(init.headers.Authorization).toBeUndefined()
  })
})

describe('JSON aus der Antwort', () => {
  it('liest reines JSON, Codezaun, Denkschritte und Text drumherum', () => {
    expect(jsonAusText('{"ok":true}')).toEqual({ ok: true })
    expect(jsonAusText('```json\n{"ok":true}\n```')).toEqual({ ok: true })
    expect(jsonAusText('<think>Ich überlege {nicht json}</think>\n{"ok":true}')).toEqual({ ok: true })
    expect(jsonAusText('Hier ist das Ergebnis: {"ok": true, "a": {"b": 1}} – fertig')).toEqual({ ok: true, a: { b: 1 } })
    expect(() => jsonAusText('kein json')).toThrow(SyntaxError)
  })

  it('erkennt abgelehntes Format und verständliche Fehler', () => {
    expect(formatAbgelehnt(400, '{"error":{"message":"response_format json_schema is not supported"}}')).toBe(true)
    expect(formatAbgelehnt(400, '{"error":{"message":"bad temperature"}}')).toBe(false)
    expect(formatAbgelehnt(500, 'schema')).toBe(false)
    expect(fehlerMeldung('Mistral', 401, '')).toMatch(/Schlüssel ist ungültig/)
    expect(fehlerMeldung('Mistral', 429, '')).toMatch(/Limit/)
    expect(fehlerMeldung('IONOS', 404, '')).toMatch(/Modell oder Adresse/)
  })
})

describe('Anbieter mit Attrappe statt Netz', () => {
  it('fällt bei abgelehntem json_schema auf json_object zurück und merkt sich das', async () => {
    vergissFormate()
    const holen = vi
      .fn()
      .mockResolvedValueOnce(antwort('{"error":{"message":"Invalid response_format: json_schema not supported for this model"}}', 400))
      .mockResolvedValueOnce(antwort('```json\n{"ok":true}\n```'))
      .mockResolvedValueOnce(antwort('{"ok":true}'))
    const p = new KompatibelProvider({ id: 'ionos', basisUrl: 'https://openai.inference.de-txl.ionos.com/v1', schluessel: 't' }, holen as unknown as typeof fetch)
    expect(await p.structured(REQ, 'meta-llama/Llama-3.3-70B-Instruct')).toEqual({ ok: true })
    expect(holen).toHaveBeenCalledTimes(2)
    expect(JSON.parse(holen.mock.calls[0][1].body).response_format.type).toBe('json_schema')
    expect(JSON.parse(holen.mock.calls[1][1].body).response_format.type).toBe('json_object')
    // nächste Anfrage gleich mit json_object
    await p.structured(REQ, 'meta-llama/Llama-3.3-70B-Instruct')
    expect(holen).toHaveBeenCalledTimes(3)
    expect(JSON.parse(holen.mock.calls[2][1].body).response_format.type).toBe('json_object')
  })

  it('andere Fehler ohne Rückfall, mit verständlicher Meldung', async () => {
    vergissFormate()
    const holen = vi.fn().mockResolvedValue(antwort('{"error":{"message":"rate limit"}}', 429))
    const p = new KompatibelProvider({ id: 'mistral', basisUrl: 'https://api.mistral.ai/v1', schluessel: 't' }, holen as unknown as typeof fetch)
    await expect(p.structured(REQ, 'mistral-large-latest')).rejects.toThrow(/Limit/)
    expect(holen).toHaveBeenCalledTimes(1)
  })

  it('lokal nicht erreichbar: Hinweis auf Ollama/LM Studio', async () => {
    const holen = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const p = new KompatibelProvider({ id: 'lokal', basisUrl: 'http://localhost:11434/v1' }, holen as unknown as typeof fetch)
    await expect(p.structured(REQ, 'qwen3:30b')).rejects.toThrow(/Ollama/)
  })

  it('liest den Antwortstrom, auch wenn ein Zeichen über die Stückgrenze reicht', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"{\\"text\\":\\"Einschr"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"änkung …\\"}"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":6}}\n\ndata: [DONE]\n\n'
    ]
    const bytes = Buffer.concat(sse.map((s) => Buffer.from(s, 'utf8')))
    // Grenze mitten im „…" (3 Byte)
    const mitte = bytes.indexOf(Buffer.from('…', 'utf8')) + 1
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(bytes.subarray(0, mitte)))
        c.enqueue(new Uint8Array(bytes.subarray(mitte)))
        c.close()
      }
    })
    const holen = vi.fn().mockResolvedValue(new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    const p = new KompatibelProvider({ id: 'mistral', basisUrl: 'https://api.mistral.ai/v1', schluessel: 't' }, holen as unknown as typeof fetch)
    const stuecke: number[] = []
    const ergebnis = await p.structured<{ text: string }>(REQ, 'mistral-large-latest', (n) => stuecke.push(n))
    expect(ergebnis.text).toBe('Einschränkung …')
    expect(stuecke.length).toBe(2)
    expect(JSON.parse(holen.mock.calls[0][1].body).stream).toBe(true)
  })

  it('Modellliste über GET /models', async () => {
    const holen = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'mistral-large-latest', created: 1700000000 }, { id: 'mistral-embed' }] })))
    const p = new KompatibelProvider({ id: 'mistral', basisUrl: 'https://api.mistral.ai/v1', schluessel: 't' }, holen as unknown as typeof fetch)
    const roh = await p.listModels()
    expect(holen.mock.calls[0][0]).toBe('https://api.mistral.ai/v1/models')
    expect(filterModels('mistral', 'text', roh).map((m) => m.id)).toEqual(['mistral-large-latest'])
    expect(filterModels('mistral', 'image', roh)).toEqual([])
  })
})

describe('Adressen und Voreinstellungen', () => {
  it('Server: nur https, keine internen Ziele; PC: lokal erlaubt', () => {
    expect(adressePruefen('https://api.mistral.ai/v1', true)).toBeNull()
    expect(adressePruefen('http://api.mistral.ai/v1', true)).toMatch(/https/)
    for (const intern of ['https://localhost:11434/v1', 'https://127.0.0.1/v1', 'https://10.0.0.5/v1', 'https://192.168.1.2/v1', 'https://172.20.0.1/v1', 'https://[::1]/v1', 'https://dienst/v1'])
      expect(adressePruefen(intern, true)).toMatch(/intern|lokal/)
    expect(adressePruefen('http://localhost:11434/v1', false)).toBeNull()
    expect(adressePruefen('ftp://x', false)).toMatch(/https/)
  })

  it('alle Anbieter wählbar, mit Vorgabemodell; nur Kernanbieter haben ein Abo', () => {
    for (const id of ['mistral', 'azure', 'ionos', 'stackit', 'gemini_oai', 'openrouter', 'lokal', 'eigener']) {
      expect(AI_PROVIDERS.some((p) => p.id === id && p.kompatibel)).toBe(true)
      expect(DEFAULT_SETTINGS.ai.access[id as 'mistral']).toBe('api')
      expect(aboInfo(id as 'mistral')).toBeUndefined()
    }
    expect(aboInfo('openai')?.program).toBe('Codex CLI')
    expect(DEFAULT_SETTINGS.ai.textModels.mistral).toBe('mistral-large-latest')
    expect(builtinOptions('ionos', 'text')[0]).toMatchObject({ id: 'openai/gpt-oss-120b', recommended: true })
    expect(AI_PROVIDERS.find((p) => p.id === 'lokal')?.nurPc).toBe(true)
  })
})
