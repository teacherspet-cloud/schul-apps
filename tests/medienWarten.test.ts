import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DienstSperren, istBegrenzung, MAX_WARTEN_MS, Plaetze, uhrzeitLabel, WARTESTUFEN_MS, wartezeit } from '../src/renderer/src/shared/medien/medienWarten'

/**
 * Wache für das Warten der Medienaufträge (06.10.2026, shared/medien/medienWarten.ts): Begrenzungen der Dienste
 * (429, Kontingent, Nutzungsgrenze des Abos) führen zum Warten statt zum Abbruch; fehlendes Guthaben oder ein
 * abgelehnter Schlüssel nicht – da hilft Warten nicht.
 */

const speicher = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k)
})
;(globalThis as unknown as { window: unknown }).window = { api: { ai: { onProgress: () => () => undefined } } }

describe('Begrenzung erkennen', () => {
  it('erkennt die Meldungen der Dienste der App', () => {
    expect(istBegrenzung('Das ElevenLabs-Kontingent ist erschöpft oder es laufen zu viele Anfragen gleichzeitig (429).')).toBe(true)
    expect(istBegrenzung('Die Nutzungsgrenze des ChatGPT-Abos ist erreicht – wieder verfügbar ab 14:35 Uhr.')).toBe(true)
    expect(istBegrenzung('Anthropic: Limit erreicht (429). Bitte kurz warten oder das Guthaben prüfen.')).toBe(true)
    expect(istBegrenzung('OpenAI: Zu viele Anfragen in kurzer Zeit (429). Bitte einen Moment warten und es erneut versuchen.')).toBe(true)
    expect(istBegrenzung('Pixabay: zu viele Anfragen (429) – erneut versuchen in 60 s.')).toBe(true)
  })
  it('wartet nicht, wenn die Lehrkraft etwas tun muss', () => {
    expect(istBegrenzung('OpenAI: Auf dem API-Konto ist kein Guthaben vorhanden.')).toBe(false)
    expect(istBegrenzung('ElevenLabs lehnt den Schlüssel ab. Bitte in den Einstellungen prüfen.')).toBe(false)
    expect(istBegrenzung('Free users cannot use library voices via the API. (paid_plan_required)')).toBe(false)
    expect(istBegrenzung('Die Sprach-KI hat keine Aufnahme geliefert.')).toBe(false)
  })
})

describe('Wartezeit', () => {
  it('nimmt die Angabe des Dienstes (mit kurzer Reserve)', () => {
    expect(wartezeit(new Error('… (429) – erneut versuchen in 20 s.'), 0)).toBe(22_000)
    expect(wartezeit(new Error('Rate limit reached. Please try again in 1.5s'), 0)).toBe(3_500)
    expect(wartezeit(new Error('429 Too Many Requests, retry after 2 minutes'), 0)).toBe(122_000)
  })
  it('wartet bis zur genannten Uhrzeit (auch am nächsten Tag)', () => {
    const jetzt = new Date(2026, 9, 6, 14, 0, 0).getTime()
    expect(wartezeit(new Error('Nutzungsgrenze erreicht – wieder verfügbar ab 14:35 Uhr'), 0, jetzt)).toBe(35 * 60_000 + 60_000)
    const spaet = new Date(2026, 9, 6, 23, 0, 0).getTime()
    expect(wartezeit(new Error('Nutzungsgrenze erreicht – wieder verfügbar ab 01:00 Uhr'), 0, spaet)).toBe(2 * 3600_000 + 60_000)
  })
  it('wartet ohne Angabe schrittweise länger, höchstens 30 Minuten je Schritt', () => {
    const e = new Error('Das ElevenLabs-Kontingent ist erschöpft (429).')
    expect(wartezeit(e, 0)).toBe(WARTESTUFEN_MS[0])
    expect(wartezeit(e, 3)).toBe(WARTESTUFEN_MS[3])
    expect(wartezeit(e, 99)).toBe(30 * 60_000)
    expect(wartezeit(new Error('retry after 999999 s (429)'), 0)).toBe(MAX_WARTEN_MS)
  })
  it('liefert null bei gewöhnlichen Fehlern', () => {
    expect(wartezeit(new Error('Netzwerkfehler'), 0)).toBeNull()
  })
  it('zeigt die Uhrzeit, bei einem anderen Tag mit Wochentag', () => {
    const jetzt = new Date(2026, 9, 6, 14, 0).getTime()
    expect(uhrzeitLabel(new Date(2026, 9, 6, 14, 35).getTime(), jetzt)).toBe('14:35')
    expect(uhrzeitLabel(new Date(2026, 9, 7, 1, 5).getTime(), jetzt)).toBe('Mi 01:05')
  })
})

describe('Sperren je Dienst und Plätze', () => {
  it('sperrt einen Dienst bis zum spätesten Zeitpunkt und gibt ihn danach frei', () => {
    const s = new DienstSperren()
    s.sperre('sprache', 5000)
    s.sperre('sprache', 3000)
    expect(s.gesperrtBis('sprache', 1000)).toBe(5000)
    expect(s.gesperrtBis('bildsuche', 1000)).toBe(0)
    expect(s.gesperrtBis('sprache', 6000)).toBe(0)
  })
  it('lässt höchstens zwei zugleich laufen, die übrigen der Reihe nach; Abbruch verlässt die Schlange', async () => {
    const p = new Plaetze(2)
    const a = p.nimm()!
    const b = await p.belege()
    expect(p.nimm()).toBeNull()
    const reihenfolge: string[] = []
    const c = p.belege().then((f) => (reihenfolge.push('c'), f))
    const steuerung = new AbortController()
    const d = p.belege(steuerung.signal)
    const e = p.belege().then((f) => (reihenfolge.push('e'), f))
    expect(p.wartend).toBe(3)
    steuerung.abort()
    await expect(d).rejects.toThrow()
    expect(p.wartend).toBe(2)
    a()
    a() // doppelt freigeben zählt nicht
    ;(await c)()
    b()
    await e
    expect(reihenfolge).toEqual(['c', 'e'])
  })
})

describe('Medienauftrag wartet bei Begrenzung und macht weiter', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('meldet „wartet bis …", wiederholt nach Ablauf und teilt die Sperre mit dem Nachbarauftrag', async () => {
    const { beimDienst, vergissSperren } = await import('../src/renderer/src/shared/medien/medienAuftrag')
    vergissSperren()
    const gruende: string[] = []
    const k = { signal: new AbortController().signal, pausiere: <T>(grund: string, w: Promise<T>) => (gruende.push(grund), w) }
    let versuche = 0
    const lauf = beimDienst(k, 'sprache', async () => {
      if (++versuche === 1) throw new Error('Das ElevenLabs-Kontingent ist erschöpft (429) – erneut versuchen in 10 s.')
      return 'ok'
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(gruende[0]).toMatch(/^Die Sprach-KI ist ausgelastet – wartet bis \d{2}:\d{2}$/)
    // Der Nachbarauftrag fragt während der Sperre nicht an
    let nachbar = 0
    const zweiter = beimDienst(k, 'sprache', async () => ++nachbar)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(nachbar).toBe(0)
    await vi.advanceTimersByTimeAsync(8_000)
    await expect(lauf).resolves.toBe('ok')
    await expect(zweiter).resolves.toBe(1)
    expect(versuche).toBe(2)
  })

  it('gibt gewöhnliche Fehler sofort weiter', async () => {
    const { beimDienst, vergissSperren } = await import('../src/renderer/src/shared/medien/medienAuftrag')
    vergissSperren()
    const k = { signal: new AbortController().signal, pausiere: <T>(_g: string, w: Promise<T>) => w }
    await expect(
      beimDienst(k, 'bildsuche', async () => {
        throw new Error('Das Bild ließ sich nicht laden.')
      })
    ).rejects.toThrow('nicht laden')
  })
})
