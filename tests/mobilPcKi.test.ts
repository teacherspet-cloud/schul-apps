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

const { startLan, stopLan, lanEreignis, lanStatus } = await import('../src/main/services/lanServer')
const { erstellePcKi, pcAdresse, NICHT_ERREICHBAR, GLEICHZEITIG } = await import('../src/mobil/pcKi')

const PIN = '135790'
let port = 0
const amPc: { kanal: string; args: unknown[] }[] = []
const abbrechen = new Map<string, () => void>()
const freigeben = new Map<string, () => void>()

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
/** Wie viele Textanfragen der PC gerade gleichzeitig bearbeitet – und höchstens bearbeitet hat */
const zugleich = { jetzt: 0, hoechstens: 0 }

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
    // Wiederanknüpfen: rechnet, bis der Test ihn freigibt (nach Inhalt: user)
    if (req.schemaName === 'haengt') {
      if (req.progressId) lanEreignis('ai:progress', { id: req.progressId, chars: 7 })
      await new Promise<void>((r) => freigeben.set(String(req.user), r))
      return { antwort: `PC: ${req.user}` }
    }
    // Wie u.sende am PC: Fortschritt mit der gekennzeichneten Kennung
    if (req.progressId) lanEreignis('ai:progress', { id: req.progressId, chars: 42 })
    zugleich.jetzt++
    zugleich.hoechstens = Math.max(zugleich.hoechstens, zugleich.jetzt)
    try {
      await warte(req.schemaName === 'lang' ? 250 : 60)
    } finally {
      zugleich.jetzt--
    }
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
    // Am PC lief die Anfrage als Auftrag im Register (Kennung „netz-auftrag-<ID>"), zurück kam die eigene Kennung
    const amPcKennung = (amPc.filter((a) => a.kanal === 'ai:structured').at(-1)!.args[0] as { progressId: string }).progressId
    expect(amPcKennung).toMatch(/^netz-auftrag-[a-z0-9-]+$/)
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
    expect(String(abbruch?.args[0])).toMatch(/^netz-auftrag-[a-z0-9-]+$/)
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

describe('Tempo (Messung 30.09.2026)', () => {
  it('schickt höchstens so viele KI-Anfragen zugleich, wie der PC rechnet – die übrigen warten sichtbar', async () => {
    const { ki, ereignisse } = ipad({})
    zugleich.hoechstens = 0
    const auftraege = Array.from({ length: 7 }, (_, i) =>
      ki.weiterleiten('ai:structured', [{ user: `n${i}`, schemaName: 'lang', schema: {}, system: '', progressId: `t${i}` }])
    )
    const werte = await Promise.all(auftraege)
    expect(werte.map((w) => (w as { antwort: string }).antwort)).toEqual(Array.from({ length: 7 }, (_, i) => `PC: n${i}`))
    expect(zugleich.hoechstens).toBe(GLEICHZEITIG)
    const wartend = ereignisse.filter((e) => e.kanal === 'ai:platz' && (e.wert as { zustand: string }).zustand === 'wartend')
    expect(wartend.length).toBe(7 - GLEICHZEITIG)
    ki.beenden()
  })

  it('meldet sich bei parallelen Aufträgen nur einmal an', async () => {
    const vorher = lanStatus().angemeldet
    const { ki } = ipad({})
    await Promise.all(Array.from({ length: 5 }, (_, i) => ki.weiterleiten('ai:structured', [{ user: `p${i}`, schemaName: 'probe', schema: {}, system: '' }])))
    expect(lanStatus().angemeldet - vorher).toBe(1)
    ki.beenden()
  })

  it('nimmt den gemerkten KI-Stand des PCs, solange der PC nicht antwortet – nicht den des iPads', async () => {
    let gemerkt = null as { basis: string; wert: AiStatus } | null
    const baue = (adresse: string) =>
      erstellePcKi({
        einstellungen: () => ({ adresse, pin: PIN, texte: true, bilder: false, hoertexte: false }),
        // Das iPad selbst: API-Schlüssel, kein Sparmodus
        lokal: async () => ({ ...STATUS_PC, textAccess: 'api', economy: false, hasTextKey: false }),
        emit: () => undefined,
        standSpeicher: { lies: () => gemerkt, schreibe: (s) => void (gemerkt = s) }
      })
    const erreichbar = baue(`127.0.0.1:${port}`)
    expect(((await erreichbar.weiterleiten('ai:status', [])) as AiStatus).economy).toBe(true)
    expect(gemerkt?.wert.textAccess).toBe('subscription')
    erreichbar.beenden()
    // Neustart der App, PC (noch) nicht erreichbar: der gemerkte Stand gilt – sofort, ohne Warten
    gemerkt = { basis: 'http://127.0.0.1:1', wert: gemerkt!.wert }
    const weg = baue('127.0.0.1:1')
    const beginn = Date.now()
    const s = (await weg.weiterleiten('ai:status', [])) as AiStatus
    expect(Date.now() - beginn).toBeLessThan(500)
    expect(s.economy).toBe(true)
    expect(s.textAccess).toBe('subscription')
    weg.beenden()
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

/*
 * ---------- Wiederanknüpfen (30.09.2026) ----------
 *
 * Wunsch der Lehrkraft: Bei Verbindungsabbrüchen zwischen PC und iPad soll der Auftrag nahtlos
 * weiterlaufen – auch über einen Neustart der App hinweg. Zwischen iPad und PC steht hier ein
 * Vermittler, dessen Leitung sich kappen lässt (wie ein WLAN-Wechsel oder Tailscale, das neu
 * verbindet): Jede offene Verbindung reißt ab, neue werden sofort wieder geschlossen.
 */
const { createServer: netzServer, connect: netzVerbinden } = await import('net')
const { ersetzeTailscaleIp, zielAdresse, zeigtAufTailscaleIp, fingerabdruck } = await import('../src/mobil/pcKi')
const { magicDnsAus } = await import('../src/main/services/lanServer')
type OffenerPcAuftrag = import('../src/mobil/pcKi').OffenerPcAuftrag

async function vermittler(ziel: number): Promise<{
  port: number
  kappen(): void
  oeffnen(): void
  schliessen(): void
}> {
  const leitungen = new Set<import('net').Socket>()
  let offen = true
  const s = netzServer((ein) => {
    if (!offen) return void ein.destroy()
    const aus = netzVerbinden(ziel, '127.0.0.1')
    leitungen.add(ein)
    leitungen.add(aus)
    const weg = (): void => {
      ein.destroy()
      aus.destroy()
      leitungen.delete(ein)
      leitungen.delete(aus)
    }
    ein.on('error', weg).on('close', weg)
    aus.on('error', weg).on('close', weg)
    ein.pipe(aus)
    aus.pipe(ein)
  })
  await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok))
  return {
    port: (s.address() as import('net').AddressInfo).port,
    kappen: () => {
      offen = false
      for (const l of leitungen) l.destroy()
    },
    oeffnen: () => void (offen = true),
    schliessen: () => {
      offen = false
      for (const l of leitungen) l.destroy()
      s.close()
    }
  }
}

/** Ein iPad hinter dem Vermittler – mit fester Gerätekennung und gemerkten Aufträgen (wie localStorage) */
function ipadHinter(p: number, geteilt: { liste: OffenerPcAuftrag[] }, geraet: string, geduldMs?: number) {
  const ereignisse: { kanal: string; wert: unknown }[] = []
  const ki = erstellePcKi({
    einstellungen: () => ({
      adresse: `127.0.0.1:${p}`,
      pin: PIN,
      texte: true,
      bilder: false,
      hoertexte: false
    }),
    lokal: async () => STATUS_PC,
    emit: (kanal, wert) => ereignisse.push({ kanal, wert }),
    geraet,
    geduldMs,
    auftragsSpeicher: {
      lies: () => geteilt.liste,
      schreibe: (l) => void (geteilt.liste = l)
    }
  })
  return { ki, ereignisse }
}

const bisWahr = async (bedingung: () => boolean, ms = 5000): Promise<void> => {
  const ende = Date.now() + ms
  while (!bedingung()) {
    if (Date.now() > ende) throw new Error('Zeit abgelaufen')
    await warte(20)
  }
}
const strukturierteAmPc = (): number => amPc.filter((a) => a.kanal === 'ai:structured').length

describe('Wiederanknüpfen nach Verbindungsabbruch', () => {
  it('Verbindung während des Auftrags gekappt: läuft am PC weiter, das Ergebnis kommt nach der Rückkehr an', async () => {
    const v = await vermittler(port)
    const geteilt = { liste: [] as OffenerPcAuftrag[] }
    const { ki, ereignisse } = ipadHinter(v.port, geteilt, 'geraet-kappen-0123456789')
    const vorher = strukturierteAmPc()
    const lauf = ki.weiterleiten('ai:structured', [
      {
        system: '',
        user: 'kappen-1',
        schemaName: 'haengt',
        schema: {},
        progressId: 'k-1'
      }
    ])!
    await bisWahr(() => freigeben.has('kappen-1'))
    expect(geteilt.liste).toHaveLength(1)
    await warte(150)

    // WLAN weg, Tailscale verbindet neu …
    v.kappen()
    await bisWahr(() => ereignisse.some((e) => e.kanal === 'ai:verbindung' && (e.wert as { zustand: string }).zustand === 'unterbrochen'))
    expect(ereignisse.find((e) => e.kanal === 'ai:verbindung')?.wert).toEqual({
      id: 'k-1',
      zustand: 'unterbrochen'
    })
    // … währenddessen rechnet der PC fertig
    freigeben.get('kappen-1')!()
    await warte(300)

    // Netz wieder da, App zurück im Vordergrund
    v.oeffnen()
    ki.vorwaermen()
    expect(await lauf).toEqual({ antwort: 'PC: kappen-1' })
    // Nur EIN Auftrag am PC – nichts wurde neu gesendet
    expect(strukturierteAmPc() - vorher).toBe(1)
    expect(ereignisse).toContainEqual({
      kanal: 'ai:verbindung',
      wert: { id: 'k-1', zustand: 'verbunden' }
    })
    // Fortschritt kam unter der eigenen Kennung an
    expect(ereignisse).toContainEqual({
      kanal: 'ai:progress',
      wert: { id: 'k-1', chars: 7 }
    })
    // Abgeholt und quittiert: nichts mehr gemerkt
    expect(geteilt.liste).toHaveLength(0)
    ki.beenden()
    v.schliessen()
  }, 20_000)

  it('App-Neustart: dieselbe Anfrage übernimmt den laufenden Auftrag am PC, statt neu zu rechnen', async () => {
    const v = await vermittler(port)
    const geteilt = { liste: [] as OffenerPcAuftrag[] }
    const geraet = 'geraet-neustart-0123456789'
    const anfrage = {
      system: 's',
      user: 'neustart-1',
      schemaName: 'haengt',
      schema: {}
    }
    const vorher = strukturierteAmPc()

    // Erste „Sitzung" der App: startet den Auftrag, dann bricht die Leitung weg, und sie gibt auf
    const alt = ipadHinter(v.port, geteilt, geraet, 200)
    const altLauf = alt.ki.weiterleiten('ai:structured', [{ ...anfrage, progressId: 'alt-1' }])!.catch((e: unknown) => e)
    await bisWahr(() => freigeben.has('neustart-1'))
    v.kappen()
    const altFehler = await altLauf
    expect(String(altFehler)).toMatch(/läuft am PC weiter/)
    // Die ID bleibt gemerkt – der Auftrag ist ja nicht verloren
    expect(geteilt.liste).toHaveLength(1)
    alt.ki.beenden()

    // Neustart: neue Anmeldung, neue Kennung der Anfrage, gleicher Inhalt
    v.oeffnen()
    const neu = ipadHinter(v.port, geteilt, geraet)
    const neuLauf = neu.ki.weiterleiten('ai:structured', [{ ...anfrage, progressId: 'neu-1' }])!
    await warte(400)
    freigeben.get('neustart-1')!()
    expect(await neuLauf).toEqual({ antwort: 'PC: neustart-1' })
    expect(strukturierteAmPc() - vorher).toBe(1)
    expect(geteilt.liste).toHaveLength(0)
    neu.ki.beenden()
    v.schliessen()
  }, 20_000)

  it('zwei gleiche Anfragen zugleich bekommen je einen eigenen Auftrag', async () => {
    const geteilt = { liste: [] as OffenerPcAuftrag[] }
    const { ki } = ipadHinter(port, geteilt, 'geraet-doppelt-0123456789')
    const anfrage = {
      system: 's',
      user: 'doppelt-1',
      schemaName: 'probe',
      schema: {}
    }
    const vorher = strukturierteAmPc()
    const [a, b] = await Promise.all([
      ki.weiterleiten('ai:structured', [{ ...anfrage, progressId: 'd-1' }]),
      ki.weiterleiten('ai:structured', [{ ...anfrage, progressId: 'd-2' }])
    ])
    expect(a).toEqual({ antwort: 'PC: doppelt-1' })
    expect(b).toEqual({ antwort: 'PC: doppelt-1' })
    expect(strukturierteAmPc() - vorher).toBe(2)
    ki.beenden()
  })

  it('ein Abbruch auf dem iPad beendet den Auftrag auch am PC und vergisst ihn', async () => {
    const geteilt = { liste: [] as OffenerPcAuftrag[] }
    const { ki } = ipadHinter(port, geteilt, 'geraet-abbruch-0123456789')
    const lauf = ki.weiterleiten('ai:structured', [
      {
        system: '',
        user: 'ab-1',
        schemaName: 'warten',
        schema: {},
        progressId: 'ab-1'
      }
    ])!
    await warte(300)
    await ki.weiterleiten('ai:cancel', ['ab-1'])
    expect(istAbbruch(await lauf.catch((e: unknown) => e))).toBe(true)
    await warte(200)
    expect(geteilt.liste).toHaveLength(0)
    expect(amPc.some((a) => a.kanal === 'ai:cancel' && String(a.args[0]).startsWith('netz-auftrag-'))).toBe(true)
    ki.beenden()
  })

  it('nimmt bei einer älteren Fassung am PC (ohne Register) den gewöhnlichen Weg', async () => {
    const ohne: typeof fetch = (input, init) => {
      if (String(input).includes('/auftrag/')) return Promise.resolve(new Response('nicht erlaubt', { status: 405 }))
      return fetch(input, init)
    }
    const ki = erstellePcKi({
      einstellungen: () => ({
        adresse: `127.0.0.1:${port}`,
        pin: PIN,
        texte: true,
        bilder: false,
        hoertexte: false
      }),
      lokal: async () => STATUS_PC,
      emit: () => undefined,
      abruf: ohne
    })
    expect(await ki.weiterleiten('ai:structured', [{ system: '', user: 'alt', schemaName: 'probe', schema: {} }])).toEqual({ antwort: 'PC: alt' })
    ki.beenden()
  })

  it('der Fingerabdruck hängt am Inhalt, nicht an der Kennung', () => {
    const a = fingerabdruck('ai:structured', [{ user: 'x', progressId: 'eins' }])
    expect(fingerabdruck('ai:structured', [{ user: 'x', progressId: 'zwei' }])).toBe(a)
    expect(fingerabdruck('ai:structured', [{ user: 'y', progressId: 'eins' }])).not.toBe(a)
    expect(fingerabdruck('ai:image', ['Apfel', 'b1'])).toBe(fingerabdruck('ai:image', ['Apfel', 'b2']))
  })
})

describe('Tailscale: Name statt IP (Rückmeldung 30.09.2026)', () => {
  it('ersetzt eine 100.x-Adresse durch den gemerkten Namen auf „.ts.net"', () => {
    const name = 'http://home-pc.tailae2351.ts.net:8420'
    expect(zeigtAufTailscaleIp('100.101.181.79:8420')).toBe(true)
    expect(zeigtAufTailscaleIp('192.168.1.24:8420')).toBe(false)
    expect(zeigtAufTailscaleIp('home-pc.tailae2351.ts.net')).toBe(false)
    expect(ersetzeTailscaleIp('100.101.181.79:8420', name)).toBe(name)
    expect(ersetzeTailscaleIp('http://100.101.181.79', name)).toBe(name)
    // Ein anderer Port in der Eingabe bleibt
    expect(ersetzeTailscaleIp('100.101.181.79:8421', name)).toBe('http://home-pc.tailae2351.ts.net:8421')
    // Ohne Namen oder ohne 100.x nichts zu ersetzen
    expect(ersetzeTailscaleIp('100.101.181.79:8420', undefined)).toBeNull()
    expect(ersetzeTailscaleIp('192.168.1.24:8420', name)).toBeNull()
    expect(zielAdresse({ adresse: '100.101.181.79:8420', tailscaleAdresse: name })).toBe(name)
    expect(zielAdresse({ adresse: '192.168.1.24', tailscaleAdresse: name })).toBe('http://192.168.1.24:8420')
  })

  it('liest den Namen aus „tailscale status --json"', () => {
    expect(
      magicDnsAus(
        JSON.stringify({
          Self: {
            HostName: 'schul-apps-pc',
            DNSName: 'Home-PC.tailae2351.ts.net.'
          }
        })
      )
    ).toBe('home-pc.tailae2351.ts.net')
    expect(magicDnsAus(JSON.stringify({ Self: { DNSName: 'pc.example.com.' } }))).toBe('')
    expect(magicDnsAus('kein json')).toBe('')
  })

  it('merkt sich den Namen, den der PC beim Anmelden nennt', async () => {
    let gemerkt = ''
    // Der PC im Test hat kein Tailscale – die Antwort der Anmeldung wird um den Namen ergänzt
    const mitName: typeof fetch = async (input, init) => {
      const res = await fetch(input, init)
      if (!String(input).endsWith('/anmelden') || !res.ok) return res
      const daten = (await res.json()) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          ...daten,
          tailscale: 'http://home-pc.tailae2351.ts.net:8420'
        }),
        { status: 200 }
      )
    }
    const ki = erstellePcKi({
      einstellungen: () => ({
        adresse: `127.0.0.1:${port}`,
        pin: PIN,
        texte: true,
        bilder: false,
        hoertexte: false
      }),
      lokal: async () => STATUS_PC,
      emit: () => undefined,
      abruf: mitName,
      tailscaleGefunden: (a) => void (gemerkt = a)
    })
    const t = await ki.testen(`127.0.0.1:${port}`, PIN)
    expect(t.tailscale).toBe('http://home-pc.tailae2351.ts.net:8420')
    expect(gemerkt).toBe('http://home-pc.tailae2351.ts.net:8420')
    ki.beenden()
  })
})
