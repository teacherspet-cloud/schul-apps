import { describe, expect, it } from 'vitest'
import { istOpenAiStimme, OPENAI_TTS_MODEL, openAiStimmen, sprichOpenAi } from '../src/main/services/audio/openaiTts'

/*
 * Hörtexte über OpenAI (Großprogramm 0.4, F6) – mit einem gestellten Abruf, ohne echte Anfrage
 * und ohne Kontingent der Lehrkraft.
 */
const gestellt = (): {
  aufrufe: { url: string; body: Record<string, unknown>; auth: string }[]
  abrufen: (url: string, init: RequestInit) => Promise<Response>
} => {
  const aufrufe: { url: string; body: Record<string, unknown>; auth: string }[] = []
  return {
    aufrufe,
    abrufen: async (url, init) => {
      aufrufe.push({ url, body: JSON.parse(String(init.body)), auth: String((init.headers as Record<string, string>).authorization) })
      return new Response(new Uint8Array([aufrufe.length]), { status: 200 })
    }
  }
}

describe('OpenAI-Stimmen', () => {
  it('stehen mit Präfix in der Liste und sind als solche erkennbar', () => {
    const s = openAiStimmen()
    expect(s.length).toBeGreaterThan(5)
    expect(s.every((v) => v.id.startsWith('openai:') && v.usable)).toBe(true)
    expect(istOpenAiStimme('openai:nova')).toBe(true)
    expect(istOpenAiStimme('21m00Tcm4TlvDq8ikWAM')).toBe(false)
  })

  it('ein Gespräch: eine Anfrage je Sprecherwechsel, gleiche Stimme hintereinander zusammengefasst, Regieanweisungen entfernt', async () => {
    const g = gestellt()
    const teile = await sprichOpenAi(
      {
        id: 'h1',
        languageCode: 'en',
        settings: { speed: 0.85 } as never,
        turns: [
          { voiceId: 'openai:nova', text: '[cheerful] Hi Tom!' },
          { voiceId: 'openai:nova', text: 'How are you?' },
          { voiceId: 'openai:onyx', text: 'Fine, thanks.' },
          { voiceId: 'openai:nova', text: '   ' }
        ]
      },
      'sk-test',
      g.abrufen
    )
    expect(teile).toHaveLength(2)
    expect(g.aufrufe.map((a) => a.body.voice)).toEqual(['nova', 'onyx'])
    expect(g.aufrufe[0].body.input).toBe('Hi Tom!\n\nHow are you?')
    expect(g.aufrufe[0].body.model).toBe(OPENAI_TTS_MODEL)
    expect(String(g.aufrufe[0].body.instructions)).toMatch(/langsamer/)
    expect(g.aufrufe[0].auth).toBe('Bearer sk-test')
    expect(g.aufrufe[0].url).toBe('https://api.openai.com/v1/audio/speech')
  })

  it('lange Texte in Stücke unter der Grenze', async () => {
    const g = gestellt()
    const satz = 'Dies ist ein Satz für einen langen Hörtext. '
    await sprichOpenAi({ id: 'h2', turns: [{ voiceId: 'openai:alloy', text: satz.repeat(200) }] }, 'sk', g.abrufen)
    expect(g.aufrufe.length).toBeGreaterThan(1)
    expect(g.aufrufe.every((a) => String(a.body.input).length <= 4000)).toBe(true)
  })

  it('ohne Schlüssel eine verständliche Meldung, Fehler des Dienstes übersetzt', async () => {
    await expect(sprichOpenAi({ id: 'x', turns: [{ voiceId: 'openai:alloy', text: 'Hallo' }] }, '')).rejects.toThrow(/OpenAI-API-Schlüssel/)
    const abgelehnt = async (): Promise<Response> => new Response('nope', { status: 401 })
    await expect(sprichOpenAi({ id: 'x', turns: [{ voiceId: 'openai:alloy', text: 'Hallo' }] }, 'sk', abgelehnt)).rejects.toThrow(/lehnt den Schlüssel ab/)
  })
})
