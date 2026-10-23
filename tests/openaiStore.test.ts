import { describe, expect, it, vi } from 'vitest'

/*
 * OpenAI ohne Ablage beim Anbieter (23.10.2026, Nachprüfung des Schulträgers): Jeder Aufruf der Responses-Schnittstelle
 * sendet `store: false` – mit und ohne Antwortstrom. Die Schnittstelle ist eine Attrappe; KEINE echten KI-Anfragen.
 */
const gesendet: Record<string, unknown>[] = []
vi.mock('openai', () => {
  class OpenAI {
    static APIError = class extends Error {}
    static AuthenticationError = class extends Error {}
    static RateLimitError = class extends Error {}
    responses = {
      create: async (p: Record<string, unknown>) => {
        gesendet.push(p)
        if (p.stream)
          return (async function* () {
            yield { type: 'response.output_text.delta', delta: '{"ok":true}' }
            yield { type: 'response.completed', response: { usage: { input_tokens: 1, output_tokens: 1 } } }
          })()
        return { output_text: '{"ok":true}', usage: { input_tokens: 1, output_tokens: 1 } }
      }
    }
  }
  return { default: OpenAI }
})
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/nie-benutzt' } }))
vi.mock('../src/main/services/ai/verbrauch', () => ({ merkeVerbrauch: vi.fn() }))

const { OpenAiProvider } = await import('../src/main/services/ai/openai')
const REQ = { system: 's', user: 'u', schemaName: 'x', schema: { type: 'object' } }

describe('OpenAI: store: false', () => {
  it('ohne Strom, mit Strom und bei Bewertung', async () => {
    const p = new OpenAiProvider('sk-test')
    await p.structured(REQ, 'gpt-5-mini')
    await p.structured(REQ, 'gpt-5-mini', () => {})
    await p.structured({ ...REQ, bewertung: true }, 'gpt-4.1')
    expect(gesendet).toHaveLength(3)
    for (const g of gesendet) expect(g.store).toBe(false)
  })

  it('Gesprächs-KI: Realtime ohne Ablauf-Aufzeichnung (tracing: null), kein erfundenes store-Feld', async () => {
    const fs = await import('node:fs')
    const quelle = fs.readFileSync('src/server/sprechen.ts', 'utf-8')
    expect(quelle).toMatch(/tracing: null/)
    expect(quelle).not.toMatch(/`store` aus/)
  })
})
