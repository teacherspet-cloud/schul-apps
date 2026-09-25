import { tmpdir } from 'os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { kennzeichne, lanEreignis, lanRundruf, NETZ_EREIGNISSE, startLan, stopLan } from '../src/main/services/lanServer'
import { vereinePdfs, zerlegeStrom } from '../src/renderer/src/shared/netzZugang'

/**
 * Wache für die Ereignisse im Browser (Paket 3b).
 *
 * Anlass: Fortschritt, Warteplatz und Modellhinweise kamen im Browser nie an – der Balken am
 * Tablet stand still, ein wartender Auftrag sah aus wie ein hängender. Jetzt fließen sie über
 * einen Strom (GET /ereignisse). Festgehalten wird hier vor allem die ZUORDNUNG: Arbeiten
 * Rechner und Tablet (oder zwei Tablets) gleichzeitig, bekommt jedes Gerät nur, was zu SEINEN
 * Anfragen gehört – und ohne Anmeldung gibt es gar keinen Strom.
 */

let basis = ''
/** Was der Hauptprozess zu sehen bekommt: Kanal und Argumente jedes Aufrufs */
const aufrufe: { kanal: string; args: unknown[] }[] = []

beforeAll(async () => {
  const status = await startLan({
    port: 0,
    pin: '424242',
    wurzel: tmpdir(),
    aufruf: async (kanal, args) => {
      aufrufe.push({ kanal, args })
      return null
    }
  })
  basis = `http://127.0.0.1:${status.port}`
})
afterAll(() => stopLan())

async function anmelden(): Promise<string> {
  const res = await fetch(`${basis}/anmelden`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: '424242' }) })
  return ((await res.json()) as { token: string }).token
}

const api = (token: string, channel: string, args: unknown[]): Promise<Response> =>
  fetch(`${basis}/api`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-schulapps-token': token },
    body: JSON.stringify({ channel, args })
  })

/** Öffnet den Strom eines Geräts und sammelt, was ankommt */
async function strom(token: string, letzte?: string): Promise<{ ereignisse: { nr: string; kanal: string; wert: unknown }[]; zu: () => void }> {
  const steuerung = new AbortController()
  const res = await fetch(`${basis}/ereignisse`, {
    headers: { 'x-schulapps-token': token, ...(letzte ? { 'last-event-id': letzte } : {}) },
    signal: steuerung.signal
  })
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toMatch(/text\/event-stream/)
  const ereignisse: { nr: string; kanal: string; wert: unknown }[] = []
  const leser = res.body!.getReader()
  const decoder = new TextDecoder()
  let puffer = ''
  void (async () => {
    try {
      for (;;) {
        const { done, value } = await leser.read()
        if (done) return
        puffer += decoder.decode(value, { stream: true })
        const { ereignisse: neu, rest } = zerlegeStrom(puffer)
        puffer = rest
        ereignisse.push(...neu)
      }
    } catch {
      // beim Schließen
    }
  })()
  return { ereignisse, zu: () => steuerung.abort() }
}

const warte = (ms = 80): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('Ereignisse im Browser: Zuordnung', () => {
  it('kennzeichnet die Kennungen jeder Anfrage mit der Sitzung – auch beim Abbrechen', () => {
    expect(kennzeichne('ai:structured', [{ schemaName: 'x', progressId: 'p1-5' }], 'ab12')).toEqual([{ schemaName: 'x', progressId: 'netz-ab12-p1-5' }])
    expect(kennzeichne('ai:image', ['Igel', 'p2-5'], 'ab12')).toEqual(['Igel', 'netz-ab12-p2-5'])
    expect(kennzeichne('ai:websuche', ['Rom', 'p3-5'], 'ab12')).toEqual(['Rom', 'netz-ab12-p3-5'])
    expect(kennzeichne('ai:cancel', ['p1-5'], 'ab12')).toEqual(['netz-ab12-p1-5'])
    // Ohne Kennung bleibt alles, wie es ist
    expect(kennzeichne('ai:image', ['Igel'], 'ab12')).toEqual(['Igel'])
    expect(kennzeichne('sheets:list', [], 'ab12')).toEqual([])
  })

  it('schickt Fortschritt und Warteplatz nur an das Gerät, von dem die Anfrage kam', async () => {
    const tablet = await anmelden()
    const zweites = await anmelden()
    const a = await strom(tablet)
    const b = await strom(zweites)
    // Beide Geräte wählen zufällig DIESELBE Kennung – wie der Rechner auch
    aufrufe.length = 0
    await api(tablet, 'ai:structured', [{ schemaName: 'probe', progressId: 'p1-1' }])
    await api(zweites, 'ai:structured', [{ schemaName: 'probe', progressId: 'p1-1' }])
    const [idA, idB] = aufrufe.map((x) => (x.args[0] as { progressId: string }).progressId)
    expect(idA).not.toBe(idB)
    expect(idA).toMatch(/^netz-/)

    // So meldet der Hauptprozess: mit der gekennzeichneten Kennung
    expect(lanEreignis('ai:progress', { id: idA, chars: 120 })).toBe(true)
    expect(lanEreignis('ai:platz', { id: idB, zustand: 'wartend', abgebrochen: 1, abgebrocheneBilder: 1 })).toBe(true)
    // Eine Anfrage des Rechners gehört keinem Gerät – sie geht ans Fenster, nicht ins Netz
    expect(lanEreignis('ai:progress', { id: 'p1-1', chars: 9 })).toBe(false)
    await warte()
    expect(a.ereignisse.map((e) => [e.kanal, e.wert])).toEqual([['ai:progress', { id: 'p1-1', chars: 120 }]])
    expect(b.ereignisse.map((e) => [e.kanal, e.wert])).toEqual([['ai:platz', { id: 'p1-1', zustand: 'wartend', abgebrochen: 1, abgebrocheneBilder: 1 }]])

    // Allgemeines erreicht alle – aber nur, was ins Netz darf
    lanRundruf('models:updated', ['Neues Modell'])
    lanRundruf('ai:setup-event', { schritt: 'geheim' })
    await warte()
    expect(a.ereignisse.at(-1)).toMatchObject({ kanal: 'models:updated', wert: ['Neues Modell'] })
    expect(b.ereignisse.at(-1)).toMatchObject({ kanal: 'models:updated' })
    expect([...a.ereignisse, ...b.ereignisse].some((e) => e.kanal === 'ai:setup-event')).toBe(false)
    expect(NETZ_EREIGNISSE).not.toContain('fenster:schliessen')
    a.zu()
    b.zu()
  })

  it('bricht über das Netz nur eigene Anfragen ab', async () => {
    const tablet = await anmelden()
    aufrufe.length = 0
    await api(tablet, 'ai:cancel', ['p7-1'])
    expect(aufrufe[0].args[0]).toMatch(/^netz-[0-9a-f]+-p7-1$/)
  })

  it('liefert nach einer Unterbrechung nach, was dazwischen kam (ohne Fortschritt)', async () => {
    const tablet = await anmelden()
    aufrufe.length = 0
    await api(tablet, 'ai:image', ['Igel', 'b1-1'])
    const id = aufrufe[0].args[1] as string
    const erst = await strom(tablet)
    lanEreignis('ai:platz', { id, zustand: 'wartend' })
    await warte()
    const letzte = erst.ereignisse.at(-1)!.nr
    erst.zu()
    await warte()
    // Verbindung weg – in der Zeit wird der Platz frei
    lanEreignis('ai:progress', { id, chars: 50 })
    lanEreignis('ai:platz', { id, zustand: 'laufend' })
    const wieder = await strom(tablet, letzte)
    await warte()
    expect(wieder.ereignisse.map((e) => e.kanal)).toEqual(['ai:platz'])
    expect(wieder.ereignisse[0].wert).toEqual({ id: 'b1-1', zustand: 'laufend' })
    wieder.zu()
  })

  it('öffnet ohne Anmeldung keinen Strom', async () => {
    expect((await fetch(`${basis}/ereignisse`)).status).toBe(401)
    expect((await fetch(`${basis}/ereignisse`, { headers: { 'x-schulapps-token': 'geraten' } })).status).toBe(401)
  })
})

describe('Ereignisse im Browser: Strom lesen', () => {
  it('wertet nur vollständige Ereignisse aus – der Rest wartet auf das nächste Stück', () => {
    const teil1 = ': verbunden\n\nid: 1\ndata: {"kanal":"ai:progress","wert":{"id":"p1","chars":5}}\n\nid: 2\ndata: {"kanal":"ai:pl'
    const a = zerlegeStrom(teil1)
    expect(a.ereignisse).toEqual([{ nr: '1', kanal: 'ai:progress', wert: { id: 'p1', chars: 5 } }])
    const b = zerlegeStrom(a.rest + 'atz","wert":{"id":"p1","zustand":"laufend"}}\n\n: puls\n\n')
    expect(b.ereignisse).toEqual([{ nr: '2', kanal: 'ai:platz', wert: { id: 'p1', zustand: 'laufend' } }])
    expect(b.rest).toBe('')
  })

  it('übersteht Windows-Zeilenenden und kaputte Einträge', () => {
    const { ereignisse } = zerlegeStrom('id: 3\r\ndata: kaputt\r\n\r\nid: 4\r\ndata: {"kanal":"models:updated","wert":["x"]}\r\n\r\n')
    expect(ereignisse).toEqual([{ nr: '4', kanal: 'models:updated', wert: ['x'] }])
  })
})

describe('Drucken im Browser', () => {
  it('fügt Blatt und Lösungen zu EINEM PDF zusammen – die Lösungen beginnen auf eigener Seite', async () => {
    const pdf = async (seiten: number): Promise<Uint8Array> => {
      const d = await PDFDocument.create()
      for (let i = 0; i < seiten; i++) d.addPage([595, 842])
      return d.save()
    }
    const eins = await PDFDocument.load(await vereinePdfs([await pdf(2), await pdf(1)]))
    expect(eins.getPageCount()).toBe(3)
  })
})
