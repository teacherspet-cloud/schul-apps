/**
 * Ereignisse an die Browser der Nutzer (02.10.2026) – Fortschritt, Warteplatz, Modellhinweise,
 * Einrichtung des Abo-Zugangs.
 *
 * Wie der Netzzugang am PC (main/services/lanServer.ts): Server-Sent Events über GET /ereignisse,
 * Kennungen der Anfragen mit Vorsatz „netz-<sitzung>-…", Aufträge mit „netz-auftrag-<ID>". Neu:
 * Es gibt viele Nutzer. Ein Ereignis geht NUR an die Sitzungen, denen es gehört – Rundrufe an
 * alle nur für allgemeine Hinweise; die Einrichtung des Abos nur an den Nutzer, der sie startete.
 */
import type { ServerResponse, IncomingMessage } from 'node:http'
import { AUFTRAG_VORSATZ, AuftragsRegister } from '../main/services/lanAuftraege'

interface Ereignis {
  nr: number
  kanal: string
  wert: unknown
}

interface Strombuendel {
  kennung: string
  nutzerId: string
  geraete: Set<string>
  stroeme: Set<ServerResponse>
  puffer: Ereignis[]
  nr: number
  zuletzt: number
}

const PUFFER = 100
const MAX_STROEME = 8
const HERZSCHLAG_MS = 15_000
const VORSATZ = 'netz-'

/** Ereignisse, die überhaupt an Browser gehen */
export const SERVER_EREIGNISSE: readonly string[] = ['ai:progress', 'ai:platz', 'models:updated', 'ai:setup-event']

const sitzungen = new Map<string, Strombuendel>()

export const auftragsRegister = new AuftragsRegister()

/** Bündel einer Sitzung (wird beim ersten Kontakt angelegt) */
export function buendel(kennung: string, nutzerId: string): Strombuendel {
  let b = sitzungen.get(kennung)
  if (!b) {
    b = { kennung, nutzerId, geraete: new Set(), stroeme: new Set(), puffer: [], nr: 0, zuletzt: Date.now() }
    sitzungen.set(kennung, b)
  }
  b.zuletzt = Date.now()
  return b
}

export function sitzungVergessen(kennung: string): void {
  const b = sitzungen.get(kennung)
  if (!b) return
  for (const r of b.stroeme) r.end()
  sitzungen.delete(kennung)
}

function schreibe(res: ServerResponse, e: Ereignis): void {
  res.write(`id: ${e.nr}\ndata: ${JSON.stringify({ kanal: e.kanal, wert: e.wert })}\n\n`)
}

function zustellen(b: Strombuendel, kanal: string, wert: unknown): void {
  const e: Ereignis = { nr: ++b.nr, kanal, wert }
  if (kanal !== 'ai:progress') {
    b.puffer.push(e)
    if (b.puffer.length > PUFFER) b.puffer.shift()
  }
  for (const res of b.stroeme) schreibe(res, e)
}

/** Ein Ereignis zu EINER Anfrage – anhand der Kennung der Sitzung bzw. des Auftrags zugestellt */
export function ereignisZuAnfrage(kanal: string, wert: unknown): void {
  if (!SERVER_EREIGNISSE.includes(kanal)) return
  const id = wert && typeof wert === 'object' ? (wert as { id?: unknown }).id : undefined
  if (typeof id !== 'string' || !id.startsWith(VORSATZ)) return
  if (id.startsWith(AUFTRAG_VORSATZ)) {
    const auftrag = id.slice(AUFTRAG_VORSATZ.length)
    const geraet = auftragsRegister.ereignis(auftrag, kanal, wert)
    if (!geraet) return
    for (const b of sitzungen.values()) if (b.geraete.has(geraet)) zustellen(b, kanal, { ...(wert as object), id: `auftrag:${auftrag}` })
    return
  }
  const rest = id.slice(VORSATZ.length)
  const trenn = rest.indexOf('-')
  const b = trenn > 0 ? sitzungen.get(rest.slice(0, trenn)) : undefined
  if (b) zustellen(b, kanal, { ...(wert as object), id: rest.slice(trenn + 1) })
}

/** An alle Sitzungen EINES Nutzers (Einrichtung des Abos, geänderte Modelle dieses Nutzers) */
export function anNutzer(nutzerId: string, kanal: string, wert: unknown): void {
  if (!SERVER_EREIGNISSE.includes(kanal)) return
  for (const b of sitzungen.values()) if (b.nutzerId === nutzerId) zustellen(b, kanal, wert)
}

/** GET /ereignisse */
export function oeffneStrom(req: IncomingMessage, res: ServerResponse, b: Strombuendel): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no'
  })
  req.socket.setNoDelay(true)
  req.socket.setKeepAlive(true, HERZSCHLAG_MS)
  res.write(': verbunden\n\n')
  const letzte = Number(req.headers['last-event-id'])
  if (Number.isFinite(letzte) && letzte > 0) for (const e of b.puffer) if (e.nr > letzte) schreibe(res, e)
  b.stroeme.add(res)
  if (b.stroeme.size > MAX_STROEME) {
    const alt = b.stroeme.values().next().value
    if (alt) {
      b.stroeme.delete(alt)
      alt.end()
    }
  }
  res.on('close', () => b.stroeme.delete(res))
}

/** Herzschlag für alle offenen Ströme; Bündel ohne Strom nach 24 h vergessen */
export function herzschlagStarten(): () => void {
  const t = setInterval(() => {
    for (const b of sitzungen.values()) {
      for (const r of b.stroeme) r.write(': puls\n\n')
      if (!b.stroeme.size && Date.now() - b.zuletzt > 24 * 36e5) sitzungen.delete(b.kennung)
    }
    auftragsRegister.aufraeumen()
  }, HERZSCHLAG_MS)
  t.unref?.()
  return () => clearInterval(t)
}

export const offeneStroeme = (): number => [...sitzungen.values()].reduce((s, b) => s + b.stroeme.size, 0)
