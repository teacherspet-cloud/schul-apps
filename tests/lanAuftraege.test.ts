import { tmpdir } from 'os'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AbbruchFehler } from '@shared/abbruch'

/*
 * Auftragsregister für die iPad-App (30.09.2026, main/services/lanAuftraege.ts).
 *
 * Wunsch der Lehrkraft: Bei Verbindungsabbrüchen zwischen PC und iPad soll ein Auftrag nicht
 * verloren sein. Festgehalten wird:
 *  - dieselbe ID zweimal = derselbe Auftrag (idempotent), fremde Geräte sehen ihn nicht
 *  - Ergebnis, Fehler, Fortschritt bleiben liegen, bis sie abgeholt und quittiert sind – höchstens zwei Stunden
 *  - der Auftrag läuft weiter, wenn die Verbindung wegfällt; nur ein ausdrücklicher Abbruch beendet ihn
 */
vi.mock('electron', () => ({ app: { getVersion: () => '9.9.9-test' } }))

const reg = await import('../src/main/services/lanAuftraege')
const { AuftragsRegister, AUFTRAG_TTL_MS, MAX_JE_GERAET } = reg
const { startLan, stopLan, lanEreignis, auftragsRegister } = await import('../src/main/services/lanServer')

const G1 = 'geraet-eins-0123456789'
const G2 = 'geraet-zwei-0123456789'
const warte = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Ein Versprechen, das der Test selbst erfüllt */
function offen<T>(): {
  p: Promise<T>
  ok: (w: T) => void
  weg: (e: unknown) => void
} {
  let ok!: (w: T) => void
  let weg!: (e: unknown) => void
  const p = new Promise<T>((a, b) => {
    ok = a
    weg = b
  })
  return { p, ok, weg }
}

describe('Register', () => {
  it('ist idempotent: dieselbe ID startet nur einmal', async () => {
    const r = new AuftragsRegister()
    let gestartet = 0
    const arbeit = offen<string>()
    const a = r.starte(G1, 'auftrag-001', 'ai:structured', () => {
      gestartet++
      return arbeit.p
    })
    const b = r.starte(G1, 'auftrag-001', 'ai:structured', () => {
      gestartet++
      return Promise.resolve('zweiter')
    })
    expect(a.neu).toBe(true)
    expect(b.neu).toBe(false)
    expect(gestartet).toBe(1)
    arbeit.ok('fertig')
    await warte(0)
    expect(r.abfragen(G1, 'auftrag-001')).toMatchObject({
      zustand: 'fertig',
      wert: 'fertig'
    })
    // Auch nach dem Ende: dieselbe ID liefert das vorhandene Ergebnis, statt neu zu rechnen
    expect(r.starte(G1, 'auftrag-001', 'ai:structured', () => Promise.resolve('neu')).bild).toMatchObject({ zustand: 'fertig', wert: 'fertig' })
    expect(gestartet).toBe(1)
  })

  it('zeigt einem fremden Gerät nichts', () => {
    const r = new AuftragsRegister()
    r.starte(G1, 'auftrag-002', 'ai:image', () => new Promise(() => undefined))
    expect(r.abfragen(G2, 'auftrag-002')).toBeNull()
    expect(r.liste(G2)).toEqual([])
    expect(r.quittiere(G2, 'auftrag-002')).toBe(false)
    expect(r.brichAb(G2, 'auftrag-002')).toBe(false)
    expect(() => r.starte(G2, 'auftrag-002', 'ai:image', () => Promise.resolve(1))).toThrow(/anderen Gerät/)
    expect(r.liste(G1).map((a) => a.id)).toEqual(['auftrag-002'])
  })

  it('hält Fehler, Abbruch und Fortschritt fest', async () => {
    const r = new AuftragsRegister()
    r.starte(G1, 'auftrag-f01', 'ai:structured', () => Promise.reject(new Error('Kontingent erschöpft')))
    r.starte(G1, 'auftrag-f02', 'ai:structured', () => Promise.reject(new AbbruchFehler()))
    const lang = offen<unknown>()
    r.starte(G1, 'auftrag-f03', 'ai:structured', () => lang.p)
    expect(r.ereignis('auftrag-f03', 'ai:progress', { id: 'x', chars: 1200 })).toBe(G1)
    expect(r.ereignis('gibt-es-nicht', 'ai:progress', { chars: 1 })).toBeNull()
    await warte(0)
    expect(r.abfragen(G1, 'auftrag-f01')).toMatchObject({
      zustand: 'fehler',
      fehler: 'Kontingent erschöpft'
    })
    expect(r.abfragen(G1, 'auftrag-f02')).toMatchObject({
      zustand: 'abgebrochen'
    })
    expect(r.abfragen(G1, 'auftrag-f03')).toMatchObject({
      zustand: 'laeuft',
      fortschritt: { chars: 1200 }
    })
    // Ein laufender Auftrag lässt sich nicht quittieren – nur abbrechen
    expect(r.quittiere(G1, 'auftrag-f03')).toBe(false)
    expect(r.brichAb(G1, 'auftrag-f03')).toBe(true)
    // Ein spätes Ergebnis ändert am Abbruch nichts
    lang.ok('zu spät')
    await warte(0)
    expect(r.abfragen(G1, 'auftrag-f03')).toMatchObject({
      zustand: 'abgebrochen'
    })
  })

  it('Long-Poll: meldet das Ende sofort, sonst nach der Wartezeit', async () => {
    const r = new AuftragsRegister()
    const arbeit = offen<string>()
    r.starte(G1, 'auftrag-w01', 'ai:structured', () => arbeit.p)
    const beginn = Date.now()
    const kurz = await r.warte(G1, 'auftrag-w01', 50)
    expect(kurz?.zustand).toBe('laeuft')
    expect(Date.now() - beginn).toBeGreaterThanOrEqual(40)
    const lang = r.warte(G1, 'auftrag-w01', 20_000)
    setTimeout(() => arbeit.ok('da'), 30)
    const ende = await lang
    expect(ende).toMatchObject({ zustand: 'fertig', wert: 'da' })
    expect(Date.now() - beginn).toBeLessThan(2000)
  })

  it('holt ab und quittiert: danach ist der Auftrag weg', async () => {
    const r = new AuftragsRegister()
    r.starte(G1, 'auftrag-q01', 'audio:speak', () => Promise.resolve({ fileName: 'a.mp3' }))
    await warte(0)
    expect(r.liste(G1)).toHaveLength(1)
    expect(r.quittiere(G1, 'auftrag-q01')).toBe(true)
    expect(r.abfragen(G1, 'auftrag-q01')).toBeNull()
    expect(r.liste(G1)).toHaveLength(0)
  })

  it('räumt beendete Aufträge nach zwei Stunden ab – laufende bleiben', async () => {
    let jetzt = 1_000_000
    const r = new AuftragsRegister(() => jetzt)
    r.starte(G1, 'auftrag-t01', 'ai:structured', () => Promise.resolve('x'))
    r.starte(G1, 'auftrag-t02', 'ai:structured', () => new Promise(() => undefined))
    await warte(0)
    jetzt += AUFTRAG_TTL_MS - 1000
    expect(r.liste(G1)).toHaveLength(2)
    jetzt += 2000
    expect(r.liste(G1).map((a) => a.id)).toEqual(['auftrag-t02'])
  })

  it('begrenzt die Größe: zuerst gehen die ältesten beendeten, laufende nie', async () => {
    let jetzt = 5_000_000
    const r = new AuftragsRegister(() => jetzt)
    for (let i = 0; i < MAX_JE_GERAET; i++) {
      jetzt += 10
      r.starte(G1, `auftrag-g${String(i).padStart(3, '0')}`, 'ai:structured', () => Promise.resolve(i))
    }
    await warte(0)
    // Voll mit beendeten: der älteste weicht
    r.starte(G1, 'auftrag-neu01', 'ai:structured', () => new Promise(() => undefined))
    expect(r.abfragen(G1, 'auftrag-g000')).toBeNull()
    expect(r.abfragen(G1, 'auftrag-g001')).not.toBeNull()
    // Nur laufende: dann ist Schluss
    const r2 = new AuftragsRegister()
    for (let i = 0; i < MAX_JE_GERAET; i++) r2.starte(G2, `auftrag-l${String(i).padStart(3, '0')}`, 'ai:image', () => new Promise(() => undefined))
    expect(() => r2.starte(G2, 'auftrag-zuviel', 'ai:image', () => Promise.resolve(1))).toThrow(/zu viele/)
  })

  it('prüft IDs und Gerätekennungen', () => {
    expect(reg.gueltigeAuftragsId('abc-DEF_1234')).toBe(true)
    expect(reg.gueltigeAuftragsId('kurz')).toBe(false)
    expect(reg.gueltigeAuftragsId('../../etc/passwd')).toBe(false)
    expect(reg.gueltigesGeraet(G1)).toBe(true)
    expect(reg.gueltigesGeraet('zu-kurz')).toBe(false)
  })
})

/*
 * Über den echten Netzzugang: Der „Hauptprozess" ist eine Attrappe, deren Anfrage erst endet,
 * wenn der Test es sagt.
 */
describe('Register über den Netzzugang', () => {
  const PIN = '246810'
  let basis = ''
  const aufrufe: { kanal: string; args: unknown[] }[] = []
  const haengend = new Map<string, ReturnType<typeof offen<unknown>>>()

  beforeAll(async () => {
    const st = await startLan({
      port: 0,
      pin: PIN,
      wurzel: tmpdir(),
      aufruf: async (kanal, args) => {
        aufrufe.push({ kanal, args })
        if (kanal === 'ai:cancel') {
          haengend.get(String(args[0]))?.weg(new AbbruchFehler())
          return undefined
        }
        const req = args[0] as { progressId?: string; user?: string }
        const o = offen<unknown>()
        haengend.set(String(req.progressId), o)
        return o.p
      }
    })
    basis = `http://127.0.0.1:${st.port}`
  })
  afterAll(() => {
    stopLan()
    auftragsRegister.leeren()
  })

  async function anmelden(): Promise<string> {
    const res = await fetch(`${basis}/anmelden`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: PIN })
    })
    return ((await res.json()) as { token: string }).token
  }
  const post = (token: string, geraet: string, pfad: string, koerper: unknown, signal?: AbortSignal): Promise<Response> =>
    fetch(`${basis}${pfad}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-schulapps-token': token,
        'x-schulapps-geraet': geraet
      },
      body: JSON.stringify(koerper),
      signal
    })

  it('verlangt Anmeldung und Gerätekennung', async () => {
    expect((await post('falsch', G1, '/auftrag/liste', {})).status).toBe(401)
    const token = await anmelden()
    expect((await post(token, 'x', '/auftrag/liste', {})).status).toBe(400)
    expect(
      (
        await post(token, G1, '/auftrag/starten', {
          id: 'auftrag-sec1',
          channel: 'secrets:set',
          args: []
        })
      ).status
    ).toBe(403)
    expect(
      (
        await post(token, G1, '/auftrag/starten', {
          id: 'auftrag-sec2',
          channel: 'sheets:save',
          args: []
        })
      ).status
    ).toBe(403)
  })

  it('läuft weiter, wenn die Verbindung wegfällt, und liefert das Ergebnis nach einer neuen Anmeldung', async () => {
    const token = await anmelden()
    const start = await post(token, G1, '/auftrag/starten', {
      id: 'auftrag-netz01',
      channel: 'ai:structured',
      args: [{ user: 'Hallo', progressId: 'p1' }]
    })
    expect(((await start.json()) as { auftrag: { zustand: string } }).auftrag.zustand).toBe('laeuft')
    // Am PC mit der Kennung des Auftrags – Fortschritt landet im Register
    const kennung = 'netz-auftrag-auftrag-netz01'
    expect((aufrufe.at(-1)!.args[0] as { progressId: string }).progressId).toBe(kennung)
    expect(lanEreignis('ai:progress', { id: kennung, chars: 77 })).toBe(true)

    // Eine Abfrage wartet – und die Verbindung reißt ab
    const steuerung = new AbortController()
    const abfrage = post(token, G1, '/auftrag/abfragen', { id: 'auftrag-netz01', warteMs: 20_000 }, steuerung.signal).catch((e: unknown) => e)
    await warte(100)
    steuerung.abort()
    await abfrage
    await warte(100)
    // Kein Abbruch am PC
    expect(aufrufe.some((a) => a.kanal === 'ai:cancel')).toBe(false)

    // Die App startet neu: neue Anmeldung, dieselbe Gerätekennung
    const neu = await anmelden()
    const liste = (await (await post(neu, G1, '/auftrag/liste', {})).json()) as {
      auftraege: {
        id: string
        zustand: string
        fortschritt?: { chars: number }
      }[]
    }
    expect(liste.auftraege).toEqual([
      expect.objectContaining({
        id: 'auftrag-netz01',
        zustand: 'laeuft',
        fortschritt: { chars: 77 }
      })
    ])
    // Ein anderes Gerät sieht ihn nicht
    expect(
      (
        await post(neu, G2, '/auftrag/abfragen', {
          id: 'auftrag-netz01',
          warteMs: 0
        })
      ).status
    ).toBe(404)

    const warten = post(neu, G1, '/auftrag/abfragen', {
      id: 'auftrag-netz01',
      warteMs: 20_000
    })
    await warte(50)
    haengend.get(kennung)!.ok({ antwort: 'vom PC', bild: new Uint8Array([1, 2, 3]) })
    const ergebnis = (await (await warten).json()) as {
      auftrag: {
        zustand: string
        wert: { antwort: string; bild: { __bytes: string } }
      }
    }
    expect(ergebnis.auftrag.zustand).toBe('fertig')
    expect(ergebnis.auftrag.wert.antwort).toBe('vom PC')
    // Binärdaten wie bei /api verpackt
    expect(ergebnis.auftrag.wert.bild.__bytes).toBe('AQID')

    expect(((await (await post(neu, G1, '/auftrag/quittieren', { id: 'auftrag-netz01' })).json()) as { ok: boolean }).ok).toBe(true)
    expect(
      (
        await post(neu, G1, '/auftrag/abfragen', {
          id: 'auftrag-netz01',
          warteMs: 0
        })
      ).status
    ).toBe(404)
  })

  it('bricht nur auf ausdrücklichen Wunsch ab', async () => {
    const token = await anmelden()
    await post(token, G1, '/auftrag/starten', {
      id: 'auftrag-netz02',
      channel: 'ai:structured',
      args: [{ user: 'x', progressId: 'p2' }]
    })
    const ab = (await (await post(token, G1, '/auftrag/abbrechen', { id: 'auftrag-netz02' })).json()) as { ok: boolean }
    expect(ab.ok).toBe(true)
    await warte(50)
    expect(aufrufe.filter((a) => a.kanal === 'ai:cancel').map((a) => a.args[0])).toEqual(['netz-auftrag-auftrag-netz02'])
    const stand = (await (
      await post(token, G1, '/auftrag/abfragen', {
        id: 'auftrag-netz02',
        warteMs: 0
      })
    ).json()) as { auftrag: { zustand: string } }
    expect(stand.auftrag.zustand).toBe('abgebrochen')
  })

  it('bricht eine gewöhnliche Anfrage (/api) nicht mehr ab, wenn die Verbindung wegfällt', async () => {
    const token = await anmelden()
    const vorher = aufrufe.filter((a) => a.kanal === 'ai:cancel').length
    const steuerung = new AbortController()
    const anfrage = fetch(`${basis}/api`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-schulapps-token': token
      },
      body: JSON.stringify({
        channel: 'ai:structured',
        args: [{ user: 'y', progressId: 'api-1' }]
      }),
      signal: steuerung.signal
    }).catch((e: unknown) => e)
    await warte(100)
    steuerung.abort()
    await anfrage
    await warte(150)
    expect(aufrufe.filter((a) => a.kanal === 'ai:cancel').length).toBe(vorher)
  })
})
