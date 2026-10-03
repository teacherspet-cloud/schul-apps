import { describe, expect, it } from 'vitest'
import { bildWege, mitErsatz, PAUSE_MS, type BildWeg } from '../src/main/services/ai/bildErsatz'
import { DEFAULT_SETTINGS, type AiProviderId } from '../src/shared/types'

/* Ersatzwege für Bilder (03.10.2026): Abo ohne Bilder oder Kontingent erschöpft → nächster Weg */
const ai = (patch: Partial<typeof DEFAULT_SETTINGS.ai> = {}): typeof DEFAULT_SETTINGS.ai => ({
  ...DEFAULT_SETTINGS.ai,
  imageProvider: 'openai',
  imageAccess: { ...DEFAULT_SETTINGS.ai.imageAccess, openai: 'subscription' },
  subscriptionAccepted: { ...DEFAULT_SETTINGS.ai.subscriptionAccepted, openai: true },
  ...patch
})
const schluessel =
  (...p: AiProviderId[]) =>
  (x: AiProviderId): boolean =>
    p.includes(x)
const kein = (): boolean => false

describe('Bilder: Ersatzwege', () => {
  it('erst der eingestellte Weg, dann API-Schlüssel, ohne Doppelte', () => {
    expect(bildWege(ai(), schluessel('google', 'openai'))).toEqual([
      { provider: 'openai', zugang: 'abo' },
      { provider: 'openai', zugang: 'api' },
      { provider: 'google', zugang: 'api' }
    ])
    // API eingestellt, Abo bestätigt: das Abo kommt zuletzt
    const api = ai({ imageAccess: { ...DEFAULT_SETTINGS.ai.imageAccess, openai: 'api' } })
    expect(bildWege(api, schluessel('openai')).map((w) => w.zugang)).toEqual(['api', 'abo'])
    // Eingestellter Weg ohne Schlüssel fällt weg
    expect(bildWege(ai({ imageProvider: 'google', imageAccess: { ...DEFAULT_SETTINGS.ai.imageAccess, google: 'api' } }), kein)).toEqual([
      { provider: 'openai', zugang: 'abo' }
    ])
  })

  it('springt bei einem Fehler des Abos auf den API-Schlüssel und pausiert das Abo', async () => {
    const wege = bildWege(ai(), schluessel('openai'))
    const versuche: string[] = []
    let jetzt = 1_000_000
    const erzeuge = async (w: BildWeg): Promise<string> => {
      versuche.push(w.zugang)
      if (w.zugang === 'abo') throw new Error('Codex hat kein Bild erzeugt')
      return 'data:image/png;base64,X'
    }
    const r = await mitErsatz(
      wege,
      'nutzer-a',
      erzeuge,
      () => false,
      () => jetzt
    )
    expect(r.weg).toEqual({ provider: 'openai', zugang: 'api' })
    expect(r.fehler[0].text).toContain('kein Bild')
    // Das nächste Bild versucht das Abo gar nicht erst …
    await mitErsatz(
      wege,
      'nutzer-a',
      erzeuge,
      () => false,
      () => jetzt
    )
    expect(versuche).toEqual(['abo', 'api', 'api'])
    // … ein anderer Nutzer schon, und nach der Pause auch wieder derselbe
    await mitErsatz(
      wege,
      'nutzer-b',
      erzeuge,
      () => false,
      () => jetzt
    )
    jetzt += PAUSE_MS + 1
    await mitErsatz(
      wege,
      'nutzer-a',
      erzeuge,
      () => false,
      () => jetzt
    )
    expect(versuche).toEqual(['abo', 'api', 'api', 'abo', 'api', 'abo', 'api'])
  })

  it('ohne Ersatz: verständliche Meldung mit Hinweis auf einen API-Schlüssel', async () => {
    const wege = bildWege(ai(), kein)
    await expect(
      mitErsatz(
        wege,
        'nutzer-c',
        async () => {
          throw new Error('Codex hat kein Bild erzeugt.')
        },
        () => false
      )
    ).rejects.toThrow(/API-Schlüssel für Bilder/)
  })

  it('ein Abbruch durch die Lehrkraft versucht keinen Ersatz', async () => {
    const wege = bildWege(ai(), schluessel('openai'))
    const versuche: string[] = []
    await expect(
      mitErsatz(
        wege,
        'nutzer-d',
        async (w) => {
          versuche.push(w.zugang)
          throw new Error('abgebrochen')
        },
        (e) => e instanceof Error && e.message === 'abgebrochen'
      )
    ).rejects.toThrow('abgebrochen')
    expect(versuche).toEqual(['abo'])
  })
})
