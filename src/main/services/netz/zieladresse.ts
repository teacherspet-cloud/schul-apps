/**
 * Zielprüfung für Abrufe aus dem Netz (27.09.2026, Sicherheitsbefund).
 *
 * Die App lädt Bilder, Webseiten und PDFs von Adressen, die aus der KI-Antwort oder – über
 * den Tablet-Zugang – von einem angemeldeten Gerät stammen. Ohne Prüfung ließe sich damit
 * der eigene Rechner oder das Heimnetz abfragen (localhost, 192.168.x.x, Router, Drucker) –
 * und ein Bild ohne Größengrenze füllt den Speicher. Deshalb:
 *
 * - `istLokal(host)`: Rechnernamen und Adressen des eigenen Netzes werden abgewiesen.
 * - `pruefeZiel(url)`: nur https, Name wird VOR dem Abruf aufgelöst und die Adresse geprüft
 *   (ein Name, der auf 127.0.0.1 zeigt, ist sonst der klassische Umweg – „DNS-Rebinding").
 * - `begrenzteAntwort(res, maxBytes)`: der Körper wird stückweise gelesen und bei
 *   Überschreitung abgebrochen, statt erst alles zu laden und dann zu kürzen.
 *
 * Weiterleitungen folgt `politeFetch` selbst, Station für Station, mit derselben Prüfung.
 */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/** Private und besondere IPv4-Bereiche (RFC 1918, Loopback, Link-Local, „this network", Carrier-NAT) */
const PRIVAT_V4: [number, number][] = [
  [ip4('10.0.0.0'), 8],
  [ip4('172.16.0.0'), 12],
  [ip4('192.168.0.0'), 16],
  [ip4('127.0.0.0'), 8],
  [ip4('169.254.0.0'), 16],
  [ip4('0.0.0.0'), 8],
  [ip4('100.64.0.0'), 10]
]

function ip4(s: string): number {
  return s.split('.').reduce((n, t) => ((n << 8) | Number(t)) >>> 0, 0)
}

function inBereich(adresse: number, [netz, bits]: [number, number]): boolean {
  const maske = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (adresse & maske) >>> 0 === (netz & maske) >>> 0
}

/** Ist diese IP-Adresse (v4 oder v6) eine lokale bzw. private? */
export function istPrivateAdresse(adresse: string): boolean {
  const art = isIP(adresse)
  if (art === 4) return PRIVAT_V4.some((b) => inBereich(ip4(adresse), b))
  if (art === 6) {
    const a = adresse.toLowerCase()
    // IPv4 in IPv6 verpackt („::ffff:192.168.0.1")
    const v4 = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a)
    if (v4) return istPrivateAdresse(v4[1])
    return (
      a === '::1' ||
      a === '::' ||
      a.startsWith('fc') ||
      a.startsWith('fd') ||
      a.startsWith('fe80') ||
      a.startsWith('fe9') ||
      a.startsWith('fea') ||
      a.startsWith('feb')
    )
  }
  return false
}

/** Rechnername oder Adresse, die nicht ins Internet zeigt */
export function istLokal(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.home') || h.endsWith('.lan'))
    return true
  if (isIP(h)) return istPrivateAdresse(h)
  // Rechnernamen ohne Punkt („drucker", „router") sind Namen im eigenen Netz
  return !h.includes('.')
}

export class ZielAbgelehnt extends Error {}

/**
 * Prüft die Adresse vor dem Abruf. Wirft `ZielAbgelehnt` mit lesbarer Begründung.
 * `aufloesen` lässt sich in Tests ersetzen.
 */
export async function pruefeZiel(url: string | URL, aufloesen: (host: string) => Promise<string[]> = aufloeseAdressen): Promise<URL> {
  let ziel: URL
  try {
    ziel = url instanceof URL ? url : new URL(url)
  } catch {
    throw new ZielAbgelehnt('Die Adresse ist ungültig.')
  }
  if (ziel.protocol !== 'https:') throw new ZielAbgelehnt('Nur https-Adressen sind erlaubt.')
  if (ziel.username || ziel.password) throw new ZielAbgelehnt('Adressen mit Zugangsdaten sind nicht erlaubt.')
  if (istLokal(ziel.hostname)) throw new ZielAbgelehnt('Adressen im eigenen Netz werden nicht abgerufen.')
  const adressen = await aufloesen(ziel.hostname)
  if (!adressen.length) throw new ZielAbgelehnt('Der Rechnername ließ sich nicht auflösen.')
  if (adressen.some(istPrivateAdresse)) throw new ZielAbgelehnt('Der Rechnername zeigt in das eigene Netz.')
  return ziel
}

async function aufloeseAdressen(host: string): Promise<string[]> {
  if (isIP(host)) return [host]
  try {
    const eintraege = await lookup(host, { all: true, verbatim: true })
    return eintraege.map((e) => e.address)
  } catch {
    return []
  }
}

export class AntwortZuGross extends Error {}

/**
 * Liest den Antwortkörper bis zur Grenze; darüber wird abgebrochen. Der Aufrufer bekommt
 * nie mehr Bytes als erlaubt in den Speicher – anders als `arrayBuffer().slice(…)`.
 */
export async function begrenzteAntwort(res: Response, maxBytes: number): Promise<Uint8Array> {
  const laenge = Number(res.headers.get('content-length'))
  if (Number.isFinite(laenge) && laenge > maxBytes) {
    await res.body?.cancel().catch(() => undefined)
    throw new AntwortZuGross(`Die Antwort ist größer als ${Math.round(maxBytes / 1024 / 1024)} MB.`)
  }
  if (!res.body) return new Uint8Array(await res.arrayBuffer())
  const leser = res.body.getReader()
  const teile: Uint8Array[] = []
  let summe = 0
  for (;;) {
    const { done, value } = await leser.read()
    if (done) break
    summe += value.byteLength
    if (summe > maxBytes) {
      await leser.cancel().catch(() => undefined)
      throw new AntwortZuGross(`Die Antwort ist größer als ${Math.round(maxBytes / 1024 / 1024)} MB.`)
    }
    teile.push(value)
  }
  const out = new Uint8Array(summe)
  let pos = 0
  for (const t of teile) {
    out.set(t, pos)
    pos += t.byteLength
  }
  return out
}

/** Obergrenzen je Art des Abrufs (Bytes) */
export const GRENZEN = { bild: 15 * 1024 * 1024, text: 6 * 1024 * 1024, pdf: 30 * 1024 * 1024, video: 8 * 1024 * 1024 } as const
