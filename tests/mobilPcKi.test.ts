import { tmpdir } from 'os'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AiStatus, PcKiEinstellungen, TtsResult } from '@shared/types'
import { istAbbruch } from '@shared/abbruch'

/*
 * „Abo über den PC" (30.09.2026): Die iPad-App reicht KI-Aufrufe an Schul-Apps am PC weiter
 * (src/mobil/pcKi.ts). Geprüft gegen den ECHTEN Netzzugang (services/lanServer.ts) – nur der
 * „Hauptprozess" dahinter ist eine Attrappe, die aufschreibt, was ankommt.
 *
 * Festgehalten wird: was weitergereicht wird und was nicht, dass Fortschritt und Abbruch den
 * Weg zurück finden, dass eine abgelaufene Anmeldung still erneuert wird, eine abgelehnte PIN
 * aber NICHT immer wieder versucht wird (sonst sperrte das iPad den PC), und dass ein nicht
 * erreichbarer PC eine verständliche Meldung ergibt.
 */
vi.mock('electron', () => ({ app: { getVersion: () => '9.9.9-test' } }))

const { startLan, stopLan, lanEreignis } = await import('../src/main/services/lanServer')
const { erstellePcKi, pcAdresse, NICHT_ERREICHBAR } = await import('../src/mobil/pcKi')

const PIN = '135790'
let port = 0
const amPc: { kanal: string; args: unknown[] }[] = []
const abbrechen = new Map<string, () => void>()

const STATUS_PC: AiStatus = {
  textProvider: 'openai',
  textModel: '',
  textAccess: 'subscription',
  hasTextKey: true,
  imageProvider: 'openai',
  imageModel: '',
  imageAccess: 'subscription',
  hasImageKey: true,
  economy: true,
  hasTts: false,
  textOptions: [{ provider: 'openai', model: '', label: 'OpenAI (ChatGPT)' }]
}

const warte = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Der „Hauptprozess" am PC */
async function aufruf(kanal: string, args: unknown[]): Promise<unknown> {
  amPc.push({ kanal, args })
  if (kanal === 'ai:status') return STATUS_PC
  if (kanal === 'ai:subscription-status') return { provider: 'openai', path: 'C:\\codex.exe', loggedIn: true }
  if (kanal === 'ai:cancel') {
    abbrechen.get(String(args[0]))?.()
    return undefined
  }
  if (kanal === 'ai:structured') {
    const req = args[0] as { progressId?: string; schemaName?: string; user?: string }
    if (req.schemaName === 'warten') {
      await new Promise<void>((r) => abbrechen.set(String(req.progressId), r))
      throw new Error('Der Auftrag wurde abgebrochen.')
    }
    // Wie u.sende am PC: Fortschritt mit der gekennzeichneten Kennung
    if (req.progressId) lanEreignis('ai:progress', { id: req.progressId, chars: 42 })
    await warte(60)
    return { antwort: `PC: ${req.user}` }
  }
  if (kanal === 'ai:image') return 'data:image/png;base64,AAAA'
  if (kanal === 'audio:speak') return { fileName: 'hoertext-1.mp3', dataUrl: 'data:audio/mpeg;base64,SUQzBA==', bytes: 5, mode: 'solo', model: 'x' }
  return null
}

const starte = (p = 0): ReturnType<typeof startLan> => startLan({ port: p, pin: PIN, wurzel: tmpdir(), aufruf })

beforeAll(async () => {
  port = (await starte()).port
})
afterAll(() => stopLan())

/** Ein iPad mit Einstellungen, lokalem Rest und gesammelten Ereignissen */
function ipad(e: Partial<PcKiEinstellungen>) {
  const einstellungen: PcKiEinstellungen = { adresse: `127.0.0.1:${port}`, pin: PIN, texte: true, bilder: false, hoertexte: false, ...e }
  const lokal: string[] = []
  const ereignisse: { kanal: string; wert: unknown }[] = []
  const abgelegt: TtsResult[] = []
  const ki = erstellePcKi({
    einstellungen: () => einstellungen,
    lokal: async (kanal) => {
      lokal.push(kanal)
      return kanal === 'ai:status' ? { ...STATUS_PC, textProvider: 'google', textAccess: 'api', hasTextKey: false, hasTts: true } : 'lokal'
    },
    emit: (kanal, wert) => ereignisse.push({ kanal, wert }),
    hoerdateiAblegen: (r) => abgelegt.push(r)
  })
  return { ki, einstellungen, lokal, ereignisse, abgelegt }
}

describe('Adresse des PCs', () => {
  it('nimmt an, was die Netz-Einstellungen am PC zeigen – auch Tailscale', () => {
    expect(pcAdresse('http://192.168.1.24:8420')).toBe('http://192.168.1.24:8420')
    expect(pcAdresse(' 192.168.1.24:8420/ ')).toBe('http://192.168.1.24:8420')
    // Ohne Port: die Voreinstellung des PCs
    expect(pcAdresse('10.0.0.5')).toBe('http://10.0.0.5:8420')
    // Tailscale: 100.x und MagicDNS-Namen – keine Beschränkung auf Heimnetz-Bereiche
    expect(pcAdresse('100.101.102.103:8421')).toBe('http://100.101.102.103:8421')
    expect(pcAdresse('lehrer-pc.tailnet-abc.ts.net')).toBe('http://lehrer-pc.tailnet-abc.ts.net:8420')
    expect(() => pcAdresse('')).toThrow(/keine Adresse/)
    expect(() => pcAdresse('ftp://x')).toThrow(/http/)
    expect(() => pcAdresse('http://a:b@host')).toThrow(/Zugangsdaten/)
  })
})

describe('Weiterreichen an den PC', () => {
  it('reicht nur weiter, was gewählt ist', async () => {
    const { ki } = ipad({ texte: false, bilder: false, hoertexte: false })
    expect(ki.weiterleiten('ai:structured', [{}])).toBeNull()
    expect(ki.weiterleiten('ai:status', [])).toBeNull()
    const nurBilder = ipad({ texte: false, bilder: true })
    expect(nurBilder.ki.weiterleiten('ai:structured', [{}])).toBeNull()
    expect(nurBilder.ki.weiterleiten('audio:speak', [{}])).toBeNull()
    // Nie weitergereicht: Schlüssel, Einstellungen, Material
    for (const k of ['secrets:set', 'settings:set', 'sheets:save', 'audio:read', 'ai:models']) expect(nurBilder.ki.weiterleiten(k, [])).toBeNull()
    await expect(nurBilder.ki.weiterleiten('ai:image', ['Apfel', 'b1'])).resolves.toBe('data:image/png;base64,AAAA')
    nurBilder.ki.beenden()
  })

  it('führt eine Textanfrage am PC aus – mit Fortschritt unter der eigenen Kennung', async () => {
    const { ki, ereignisse } = ipad({})
    // Anmelden und den Ereignisstrom öffnen lassen
    await ki.weiterleiten('ai:status', [])
    await warte(300)
    const wert = await ki.weiterleiten('ai:structured', [{ system: '', user: 'Hallo', schemaName: 'probe', schema: {}, progressId: 'auftrag-7' }])
    expect(wert).toEqual({ antwort: 'PC: Hallo' })
    // Am PC kam die Kennung mit dem Vorsatz der Sitzung an, zurück ohne
    const amPcKennung = (amPc.filter((a) => a.kanal === 'ai:structured').at(-1)!.args[0] as { progressId: string }).progressId
    expect(amPcKennung).toMatch(/^netz-[0-9a-f]+-auftrag-7$/)
    await warte(100)
    expect(ereignisse).toContainEqual({ kanal: 'ai:progress', wert: { id: 'auftrag-7', chars: 42 } })
    ki.beenden()
  })

  it('bricht am PC ab, und das iPad meldet sofort „abgebrochen"', async () => {
    const { ki } = ipad({})
    const laeuft = ki.weiterleiten('ai:structured', [{ system: '', user: '', schemaName: 'warten', schema: {}, progressId: 'lang-1' }])!
    await warte(300)
    const zuvor = amPc.length
    await ki.weiterleiten('ai:cancel', ['lang-1'])
    const fehler = await laeuft.then(
      () => null,
      (e: unknown) => e
    )
    expect(istAbbruch(fehler)).toBe(true)
    await warte(200)
    const abbruch = amPc.slice(zuvor).find((a) => a.kanal === 'ai:cancel')
    expect(String(abbruch?.args[0])).toMatch(/^netz-[0-9a-f]+-lang-1$/)
    // Eine fremde Kennung bleibt auf dem iPad
    expect(ki.weiterleiten('ai:cancel', ['gibt-es-nicht'])).toBeNull()
    ki.beenden()
  })

  it('setzt den KI-Stand aus PC (Texte) und iPad (Rest) zusammen', async () => {
    const { ki } = ipad({ texte: true, bilder: false, hoertexte: false })
    const s = (await ki.weiterleiten('ai:status', [])) as AiStatus
    expect(s.textProvider).toBe('openai')
    expect(s.textAccess).toBe('subscription')
    expect(s.hasTextKey).toBe(true)
    expect(s.economy).toBe(true)
    // Hörtexte laufen auf dem iPad: dessen Stand
    expect(s.hasTts).toBe(true)
    ki.beenden()
  })

  it('legt eine am PC vertonte Hördatei auf dem iPad ab', async () => {
    const { ki, abgelegt } = ipad({ texte: false, hoertexte: true })
    const r = (await ki.weiterleiten('audio:speak', [{ text: 'Hello' }])) as TtsResult
    expect(r.fileName).toBe('hoertext-1.mp3')
    expect(abgelegt.map((a) => a.fileName)).toEqual(['hoertext-1.mp3'])
    ki.beenden()
  })

  it('meldet sich nach einem Neustart des Netzzugangs am PC still neu an', async () => {
    const { ki } = ipad({})
    await ki.weiterleiten('ai:structured', [{ user: 'eins', schemaName: 'probe', schema: {}, system: '' }])
    // Netzzugang am PC aus und wieder an: Alle Anmeldungen sind verfallen
    stopLan()
    port = (await starte(port)).port
    const wert = await ki.weiterleiten('ai:structured', [{ user: 'zwei', schemaName: 'probe', schema: {}, system: '' }])
    expect(wert).toEqual({ antwort: 'PC: zwei' })
    ki.beenden()
  })
})

describe('Fehler verständlich, PC geschützt', () => {
  it('meldet einen nicht erreichbaren PC verständlich', async () => {
    const { ki } = ipad({ adresse: '127.0.0.1:1' })
    await expect(ki.weiterleiten('ai:structured', [{ user: '', schemaName: 'probe', schema: {}, system: '' }])).rejects.toThrow(
      NICHT_ERREICHBAR('http://127.0.0.1:1')
    )
    // Der Stand bleibt „eingerichtet" – die klare Meldung kommt beim Auftrag
    const s = (await ki.weiterleiten('ai:status', [])) as AiStatus
    expect(s.hasTextKey).toBe(true)
    ki.beenden()
  })

  it('versucht eine abgelehnte PIN nicht immer wieder', async () => {
    const { ki } = ipad({ pin: '000000' })
    const anfrage = (): Promise<unknown> => ki.weiterleiten('ai:structured', [{ user: '', schemaName: 'probe', schema: {}, system: '' }])!
    await expect(anfrage()).rejects.toThrow(/Falsche PIN/)
    // Beim zweiten Mal fragt das iPad gar nicht erst – sonst sperrte es den PC nach zehn Aufrufen
    await expect(anfrage()).rejects.toThrow(/PIN abgelehnt/)
    await expect(ki.testen(`127.0.0.1:${port}`, PIN)).resolves.toMatchObject({ fassung: '9.9.9-test' })
    ki.beenden()
  })

  it('„Verbindung testen" liefert Fassung, KI-Stand und Abo-Anmeldung des PCs', async () => {
    const { ki } = ipad({})
    const t = await ki.testen(`http://127.0.0.1:${port}/`, PIN)
    expect(t.adresse).toBe(`http://127.0.0.1:${port}`)
    expect(t.fassung).toBe('9.9.9-test')
    expect(t.status.textAccess).toBe('subscription')
    expect(t.abo?.loggedIn).toBe(true)
    await expect(ki.testen(`127.0.0.1:${port}`, '12')).rejects.toThrow(/sechs Ziffern/)
    ki.beenden()
  })
})

describe('CORS für die iPad-App', () => {
  it('beantwortet die Vorabfrage nur für die Herkunft der App', async () => {
    const vorab = (herkunft: string): Promise<Response> =>
      fetch(`http://127.0.0.1:${port}/api`, {
        method: 'OPTIONS',
        headers: { origin: herkunft, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type, x-schulapps-token' }
      })
    const gut = await vorab('capacitor://localhost')
    expect(gut.status).toBe(204)
    expect(gut.headers.get('access-control-allow-origin')).toBe('capacitor://localhost')
    expect(gut.headers.get('access-control-allow-headers')).toMatch(/x-schulapps-token/)
    const boese = await vorab('https://boese.example')
    expect(boese.status).toBe(403)
    expect(boese.headers.get('access-control-allow-origin')).toBeNull()
    // Die Anmeldung selbst bleibt geschützt: falsche PIN bleibt falsch, auch mit Freigabe
    const falsch = await fetch(`http://127.0.0.1:${port}/anmelden`, {
      method: 'POST',
      headers: { origin: 'capacitor://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '999999' })
    })
    expect(falsch.status).toBe(401)
    expect(falsch.headers.get('access-control-allow-origin')).toBe('capacitor://localhost')
  })
})
