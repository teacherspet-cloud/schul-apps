import { randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StructuredRequest } from '@shared/types'

/*
 * KI-Sicherheitsprüfung (22.10.2026): gerechte Schlange mit Spur für Lernende, hartes Budget je Lehrkraft (nur Anfragen
 * von Lernenden werden angehalten), Freigabeliste der Modelle über den Schulzugang, höchstens zwei Versuche mit Pause,
 * Körpergrenzen je Weg, Bremse für Gäste, SSRF-Prüfung. Keine echten KI-Anfragen, kein Netz.
 */
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/nie-benutzt' }, safeStorage: { isEncryptionAvailable: () => false } }))
vi.mock('../src/main/services/ai/verbrauch', () => ({ merkeVerbrauch: vi.fn(), setzeVerbrauchsHaken: vi.fn() }))
vi.mock('../src/main/services/storage/settings', async (original) => {
  const echt = await original<typeof import('../src/main/services/storage/settings')>()
  return { ...echt, getSettings: () => ({ briefkopf: {}, ai: { access: {} } }), hatEigenesGeheimnis: () => false }
})

const { KiPlaetze } = await import('../src/main/services/ai/kiPlaetze')
const { KI_PAUSIERT, KI_UEBERLAST, kiGrenzeMeldung } = await import('../src/shared/kiGrenzen')
const { mitWiederholung, wiederholbar, pauseVor } = await import('../src/main/services/ai/wiederholung')
const { kiFehler, wartenAusKopf } = await import('../src/main/services/ai/kiFehler')
const { anfrageBauen, istInterneIp, adresseAufgeloestPruefen, parameterAbgelehnt } = await import('../src/main/services/ai/kompatibel')
const { openaiTemperatur } = await import('../src/main/services/ai/openai')
const { anthropicTemperatur } = await import('../src/main/services/ai/anthropic')
const { gastBremse, rate, bremsenVergessen } = await import('../src/server/bremse')
const { leseKoerper, koerperGrenze, KoerperZuGross, protokollText } = await import('../src/server/http')
const { schulModellPruefen } = await import('../src/server/kiZugaenge')
const { setzeSchluesselFuerTests } = await import('../src/server/geheim')
const { datenbankFuerTests, nutzerAnlegen, setzeServerWert } = await import('../src/server/datenbank')
const { mitKiNutzung, merkeKiNutzung, budgetErschoepft, budgetStandFuer, budgetVergessen, fremdNutzungBuchen, LEHRKRAFT_BUDGET, monatsKosten } = await import(
  '../src/server/kiNutzung'
)
type Umgebung = import('../src/server/kiNutzung').NutzungsUmgebung

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

function steuerbar(): { arbeit: () => Promise<string>; fertig: () => void; gestartet: () => boolean } {
  let auf: (() => void) | null = null
  let los = false
  return {
    arbeit: () => {
      los = true
      return new Promise<string>((ok) => (auf = () => ok('ok')))
    },
    fertig: () => auf?.(),
    gestartet: () => los
  }
}

describe('Schlange: gerecht je Lehrkraft, Spur für Lernende', () => {
  it('wechselt zwischen Lehrkräften statt alle Anfragen der ersten zuerst', async () => {
    let wer = 'A'
    const plaetze = new KiPlaetze(1, undefined, { wer: () => wer })
    const erste = steuerbar()
    const lauf = plaetze.platz('x', erste.arbeit)
    const spaeter: Promise<unknown>[] = []
    for (const id of ['a1', 'a2', 'a3']) spaeter.push(plaetze.platz(id, async () => id))
    wer = 'B'
    spaeter.push(plaetze.platz('b1', async () => 'b1'))
    wer = 'C'
    spaeter.push(plaetze.platz('c1', async () => 'c1'))
    await tick()
    // A wurde eben bedient – B und C zuerst, dann wieder A
    expect(plaetze.warteliste()).toEqual(['b1', 'c1', 'a1', 'a2', 'a3'])
    erste.fertig()
    await lauf
    await Promise.all(spaeter)
  })

  it('je Lehrkraft höchstens proSchluessel Plätze – eine andere Lehrkraft kommt sofort dran', async () => {
    let wer = 'A'
    const plaetze = new KiPlaetze(4, undefined, { wer: () => wer, proSchluessel: 2 })
    const a = [steuerbar(), steuerbar(), steuerbar()]
    const laeufe = a.map((s, i) => plaetze.platz(`a${i}`, s.arbeit))
    wer = 'B'
    const b = steuerbar()
    const laufB = plaetze.platz('b0', b.arbeit)
    await tick()
    expect(a.map((s) => s.gestartet())).toEqual([true, true, false])
    expect(b.gestartet()).toBe(true)
    a[0].fertig()
    await laeufe[0]
    await tick()
    expect(a[2].gestartet()).toBe(true)
    a[1].fertig()
    a[2].fertig()
    b.fertig()
    await Promise.all([...laeufe, laufB])
  })

  it('Lernende warten höchstens lernWartenMs – Lehrkräfte bekommen den freien Platz trotzdem', async () => {
    const plaetze = new KiPlaetze(2, undefined, { wer: () => 'A', lernMax: 1, lernWartenMs: 40, proSchluessel: 2 })
    const kind1 = steuerbar()
    const lauf1 = plaetze.platz('k1', kind1.arbeit, 'text', true)
    const kind2 = plaetze.platz('k2', async () => 'nie', 'text', true)
    kind2.catch(() => undefined)
    const lehrer = steuerbar()
    const laufL = plaetze.platz('l1', lehrer.arbeit)
    await tick()
    expect(lehrer.gestartet()).toBe(true)
    await expect(kind2).rejects.toThrow(KI_UEBERLAST)
    await kind2.catch((e: unknown) => expect(kiGrenzeMeldung(e)).toBe(KI_UEBERLAST))
    kind1.fertig()
    lehrer.fertig()
    await Promise.all([lauf1, laufL])
    expect(plaetze.stand()).toEqual({ laufend: 0, wartend: 0 })
  })

  it('lehnt bei voller Schlange der Lernenden sofort freundlich ab', async () => {
    const plaetze = new KiPlaetze(1, undefined, { lernMax: 1, lernSchlange: 1, lernWartenMs: 10_000 })
    const kind1 = steuerbar()
    const lauf1 = plaetze.platz('k1', kind1.arbeit, 'text', true)
    const kind2 = plaetze.platz('k2', async () => 'ok', 'text', true)
    await expect(plaetze.platz('k3', async () => 'ok', 'text', true)).rejects.toThrow(KI_UEBERLAST)
    kind1.fertig()
    await lauf1
    await expect(kind2).resolves.toBe('ok')
  })
})

describe('Wiederholung: höchstens zwei Versuche, Pause nach Retry-After', () => {
  const req = { system: 'S', user: 'U', schemaName: 'probe', schema: { type: 'object' } } as unknown as StructuredRequest
  it('liest Retry-After (Sekunden, ms, Datum) und deckelt bei 30 s', () => {
    expect(wartenAusKopf({ 'retry-after': '2' })).toBe(2000)
    expect(wartenAusKopf(new Headers({ 'retry-after-ms': '750' }))).toBe(750)
    expect(wartenAusKopf({ 'retry-after': '3600' })).toBe(30_000)
    expect(wartenAusKopf({ 'retry-after': new Date(10_000).toUTCString() }, 5_000)).toBe(5_000)
    expect(wartenAusKopf({})).toBeUndefined()
  })
  it('429 wegen Tempo: einmal wiederholen, nach der verlangten Pause', async () => {
    const pausen: number[] = []
    let n = 0
    const a = await mitWiederholung(
      req,
      async () => {
        n++
        if (n === 1) throw kiFehler('OpenAI: Zu viele Anfragen (429)', { status: 429, wartenMs: 1200, voruebergehend: true })
        return { ok: true }
      },
      undefined,
      { warten: async (ms) => void pausen.push(ms) }
    )
    expect(a).toEqual({ ok: true })
    expect(n).toBe(2)
    expect(pausen[0]).toBeGreaterThanOrEqual(1200)
    expect(pausen[0]).toBeLessThanOrEqual(1440)
  })
  it('dauernde 5xx: genau zwei Versuche (vorher bis zu sechs)', async () => {
    let n = 0
    await expect(
      mitWiederholung(
        req,
        async () => {
          n++
          throw kiFehler('Anthropic-Fehler 529: overloaded', { status: 529, voruebergehend: true })
        },
        undefined,
        { warten: async () => undefined }
      )
    ).rejects.toThrow(/529/)
    expect(n).toBe(2)
  })
  it('leeres Guthaben (429 ohne „vorübergehend") und 4xx: kein zweiter Versuch', () => {
    expect(wiederholbar(kiFehler('Kein Guthaben (429)', { status: 429, voruebergehend: false }))).toBeNull()
    expect(wiederholbar(kiFehler('400 kaputt', { status: 400 }))).toBeNull()
    expect(wiederholbar(kiFehler('503', { status: 503, voruebergehend: true }))).toBe('server')
    // ohne Angabe: 0,5–2 s Zufall
    expect(pauseVor(new Error('x'), 0)).toBe(500)
    expect(pauseVor(new Error('x'), 1)).toBe(2000)
  })
})

describe('Anbieter: temperature 0 bei Bewertung und Obergrenze der Ausgabe', () => {
  const req: StructuredRequest = { system: 'S', user: 'U', schemaName: 'bewertung', schema: { type: 'object' }, bewertung: true }
  it('kompatibel: max_tokens, Azure max_completion_tokens, temperature nur ohne Denkmodell', () => {
    const ziel = { id: 'mistral', basisUrl: 'https://api.mistral.ai/v1', schluessel: 'k' } as never
    const b1 = JSON.parse(anfrageBauen(ziel, req, 'mistral-large-latest', 'schema', false).init.body) as Record<string, unknown>
    expect(b1.max_tokens).toBe(16_000)
    expect(b1.temperature).toBe(0)
    const b2 = JSON.parse(anfrageBauen(ziel, req, 'deepseek-reasoner', 'schema', false).init.body) as Record<string, unknown>
    expect(b2.temperature).toBeUndefined()
    const b3 = JSON.parse(anfrageBauen(ziel, { ...req, bewertung: false }, 'mistral-large-latest', 'schema', false).init.body) as Record<string, unknown>
    expect(b3.temperature).toBeUndefined()
    const azure = { id: 'azure', basisUrl: 'https://x.openai.azure.com', schluessel: 'k', azure: true } as never
    const b4 = JSON.parse(anfrageBauen(azure, req, 'gpt-5', 'schema', false).init.body) as Record<string, unknown>
    expect(b4.max_completion_tokens).toBe(32_000)
    expect(b4.max_tokens).toBeUndefined()
    expect(b4.temperature).toBeUndefined()
    const b5 = JSON.parse(anfrageBauen(ziel, req, 'mistral-large-latest', 'schema', false, new Set(['grenze', 'temperatur'])).init.body) as Record<string, unknown>
    expect(b5.max_tokens).toBeUndefined()
    expect(b5.temperature).toBeUndefined()
    expect(parameterAbgelehnt(400, "Unsupported parameter: 'max_tokens'")).toBe('grenze')
    expect(parameterAbgelehnt(400, 'temperature: only the default (1) value is supported')).toBe('temperatur')
  })
  it('weiß, welche Modelle temperature nehmen', () => {
    expect(openaiTemperatur('gpt-5.5')).toBe(false)
    expect(openaiTemperatur('o4-mini')).toBe(false)
    expect(openaiTemperatur('gpt-4.1')).toBe(true)
    expect(anthropicTemperatur('claude-opus-5')).toBe(false)
    expect(anthropicTemperatur('claude-sonnet-5')).toBe(false)
    expect(anthropicTemperatur('claude-fable-5-1')).toBe(false)
    expect(anthropicTemperatur('claude-haiku-4-5')).toBe(true)
    expect(anthropicTemperatur('claude-sonnet-4-6')).toBe(true)
  })
})

describe('Modelle über den Schulzugang', () => {
  const liste = { openai: ['gpt-5.4-mini', 'gpt-5.5'], anthropic: [] as string[] }
  it('ersetzt ein nicht freigegebenes Modell durch das erste der Liste', () => {
    expect(schulModellPruefen({ anbieter: 'openai', modell: 'gpt-5.5-pro' }, liste, () => true)).toEqual({ anbieter: 'openai', modell: 'gpt-5.4-mini' })
    expect(schulModellPruefen({ anbieter: 'openai', modell: 'gpt-5.5' }, liste, () => true)).toEqual({ anbieter: 'openai', modell: 'gpt-5.5' })
  })
  it('eigener Schlüssel oder Abo: keine Einschränkung; ohne Freigabe ein klarer Fehler', () => {
    expect(schulModellPruefen({ anbieter: 'openai', modell: 'gpt-5.5-pro' }, liste, () => false).modell).toBe('gpt-5.5-pro')
    expect(() => schulModellPruefen({ anbieter: 'anthropic', modell: 'claude-opus-5' }, liste, () => true)).toThrow(/kein Modell freigegeben/)
  })
  it('Bildaufträge gegen die eigene Bildliste (22.10.2026)', () => {
    const mitBild = { ...liste, 'openai-bild': ['gpt-image-2'] }
    expect(schulModellPruefen({ anbieter: 'openai', modell: 'gpt-image-2-hd', art: 'bild' }, mitBild, () => true).modell).toBe('gpt-image-2')
    expect(schulModellPruefen({ anbieter: 'openai', modell: 'gpt-image-2', art: 'bild' }, mitBild, () => true).modell).toBe('gpt-image-2')
    expect(() => schulModellPruefen({ anbieter: 'google', modell: 'imagen-4', art: 'bild' }, mitBild, () => true)).toThrow(/kein Modell freigegeben/)
  })
})

describe('Hartes Budget je Lehrkraft', () => {
  const REQ: StructuredRequest = { system: 'x', user: 'y', schemaName: 'rueckmeldung', schema: { type: 'object' } }
  const umgebung = (erschoepft: boolean): Umgebung => ({
    nutzer: () => ({ id: 'lk1', rolle: 'lehrkraft' }),
    einstellung: () => ({ textProvider: 'openai', access: { openai: 'api' }, imageProvider: 'openai', imageAccess: {} }),
    eigenerSchluessel: () => false,
    schulSchluessel: () => true,
    merke: () => undefined,
    budgetErschoepft: () => erschoepft
  })
  it('hält nur Anfragen von Lernenden an – die Lehrkraft arbeitet weiter', async () => {
    let aufrufe = 0
    const auf = mitKiNutzung(async () => (aufrufe++, { ok: true }), umgebung(true))
    await expect(auf('ai:structured', [{ ...REQ, vonLernenden: true }])).rejects.toThrow(KI_PAUSIERT)
    expect(aufrufe).toBe(0)
    await expect(auf('ai:structured', [REQ])).resolves.toEqual({ ok: true })
    expect(aufrufe).toBe(1)
    const frei = mitKiNutzung(async () => ({ ok: true }), umgebung(false))
    await expect(frei('ai:structured', [{ ...REQ, vonLernenden: true }])).resolves.toEqual({ ok: true })
  })
  it('eigener Schlüssel der Lehrkraft: kein Budget der Schule, nichts angehalten', async () => {
    const u = { ...umgebung(true), eigenerSchluessel: () => true }
    await expect(mitKiNutzung(async () => 'ok', u)('ai:structured', [{ ...REQ, vonLernenden: true }])).resolves.toBe('ok')
  })

  describe('mit Datenbank', () => {
    let lk = ''
    beforeAll(() => {
      setzeSchluesselFuerTests(randomBytes(32))
      datenbankFuerTests()
      lk = nutzerAnlegen({ benutzer: 'c.budget', name: 'Cem Budget', rolle: 'lehrkraft', quelle: 'lokal' }).id
    })
    beforeEach(() => budgetVergessen())
    it('rechnet ohne Preise mit Richtwerten, bucht Realtime und meldet ab 100 % erschöpft', () => {
      setzeServerWert(LEHRKRAFT_BUDGET, 2)
      expect(budgetErschoepft(lk)).toBe(false)
      // 1 Mio. Eingabe-Token OpenAI ≈ 1,25 € (Faustregel)
      merkeKiNutzung({ nutzerId: lk, anbieter: 'openai', art: 'rueckmeldung', ergebnis: 'ok', neuerAuftrag: true, eingabe: 1_000_000, ausgabe: 0, modell: 'gpt-5.5' })
      expect(monatsKosten(lk)).toBeCloseTo(1.25, 5)
      expect(budgetStandFuer(lk)?.stufe).toBe('ok')
      // 2 Minuten Realtime ≈ 0,60 € → 1,85 € von 2 € = über 80 %
      fremdNutzungBuchen({ nutzerId: lk, anbieter: 'openai', art: 'realtime', sekunden: 120 })
      expect(budgetStandFuer(lk)?.stufe).toBe('warnung')
      fremdNutzungBuchen({ nutzerId: lk, anbieter: 'elevenlabs', art: 'tts', zeichen: 1000 })
      fremdNutzungBuchen({ nutzerId: lk, anbieter: 'openai', art: 'moderation', zeichen: 500 })
      expect(budgetErschoepft(lk)).toBe(true)
      // 0 = ohne Grenze
      setzeServerWert(LEHRKRAFT_BUDGET, 0)
      expect(budgetErschoepft(lk)).toBe(false)
      expect(budgetStandFuer(lk)).toBeNull()
    })
  })
})

describe('Körpergrenzen je Weg', () => {
  const anfrage = (teile: Buffer[], laenge?: number): IncomingMessage =>
    Object.assign(Readable.from(teile), { headers: laenge === undefined ? {} : { 'content-length': String(laenge) } }) as unknown as IncomingMessage
  it('Schülerbereich klein, bekannte Uploads größer, Lehrkräfte wie bisher', () => {
    expect(koerperGrenze('/s/api/vokabeln/antwort')).toBe(2 * 1024 * 1024)
    expect(koerperGrenze('/s/api/blatt/abgeben')).toBe(20 * 1024 * 1024)
    expect(koerperGrenze('/s/api/blatt/pdf')).toBe(32 * 1024 * 1024)
    expect(koerperGrenze('/s/api/reihe/schritt')).toBe(18 * 1024 * 1024)
    expect(koerperGrenze('/api')).toBe(64 * 1024 * 1024)
  })
  it('liest unter der Grenze, bricht darüber ab – schon beim Empfang', async () => {
    await expect(leseKoerper(anfrage([Buffer.from('{"a":1}')]), 100)).resolves.toBe('{"a":1}')
    await expect(leseKoerper(anfrage([Buffer.alloc(60), Buffer.alloc(60), Buffer.alloc(60)]), 100)).rejects.toBeInstanceOf(KoerperZuGross)
  })
  it('lehnt eine zu große Content-Length ab, ohne zu lesen', async () => {
    const req = anfrage([Buffer.alloc(10)], 10 * 1024 * 1024)
    const lesen = vi.spyOn(req, 'on')
    await expect(leseKoerper(req, 1024)).rejects.toBeInstanceOf(KoerperZuGross)
    expect(lesen).not.toHaveBeenCalledWith('data', expect.anything())
  })
  it('Fehlerberichte: ohne Steuerzeichen und gekürzt', () => {
    expect(protokollText('a\nb\r\u001b[31mc d', 100)).toBe('a b [31mc d')
    expect(protokollText('x'.repeat(50), 10)).toHaveLength(10)
  })
})

describe('Bremse für Gäste und allgemeine Rate', () => {
  beforeEach(() => bremsenVergessen())
  it('höchstens 30 neue Gäste je Adresse und Minute, 90 je 10 Minuten – andere Adressen unberührt', () => {
    const t0 = 1_000_000
    for (let i = 0; i < 30; i++) expect(gastBremse('1.2.3.4', t0 + i)).toBe(true)
    expect(gastBremse('1.2.3.4', t0 + 31)).toBe(false)
    expect(gastBremse('::ffff:1.2.3.4', t0 + 32)).toBe(false)
    expect(gastBremse('5.6.7.8', t0 + 33)).toBe(true)
    // nächste Minuten: bis 90 insgesamt
    for (let m = 1; m <= 2; m++) for (let i = 0; i < 30; i++) expect(gastBremse('1.2.3.4', t0 + m * 61_000 + i)).toBe(true)
    expect(gastBremse('1.2.3.4', t0 + 4 * 61_000)).toBe(false)
    expect(gastBremse('1.2.3.4', t0 + 11 * 60_000)).toBe(true)
  })
  it('rate: Stoß bis zum Fünffachen, danach im Takt', () => {
    const t = 5_000_000
    const ok = Array.from({ length: 7 }, () => rate('s1', 1, t)).filter(Boolean).length
    expect(ok).toBe(5)
    expect(rate('s1', 1, t + 1000)).toBe(true)
    expect(rate('s1', 1, t + 1000)).toBe(false)
  })
})

describe('SSRF: interne Ziele der KI-Adresse', () => {
  it('erkennt interne IPv4/IPv6-Adressen', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1'])
      expect(istInterneIp(ip), ip).toBe(true)
    for (const ip of ['1.1.1.1', '8.8.8.8', '172.32.0.1', '2a00:1450:4001::200e']) expect(istInterneIp(ip), ip).toBe(false)
  })
  it('löst den Namen auf und prüft jede Adresse', async () => {
    await expect(adresseAufgeloestPruefen('https://boese.example.com/v1', async () => ['93.184.216.34', '10.0.0.5'])).resolves.toMatch(/interne Adressen/)
    await expect(adresseAufgeloestPruefen('https://api.mistral.ai/v1', async () => ['51.159.1.1'])).resolves.toBeNull()
    await expect(adresseAufgeloestPruefen('https://nichtda.example.com', async () => Promise.reject(new Error('ENOTFOUND')))).resolves.toMatch(/nicht auflösen/)
    await expect(adresseAufgeloestPruefen('http://api.mistral.ai', async () => ['51.159.1.1'])).resolves.toMatch(/https/)
  })
})
