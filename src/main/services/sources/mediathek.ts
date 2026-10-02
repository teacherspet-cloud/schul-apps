/**
 * Videos aus der ARD- und ZDF-Mediathek und von arte als Material (02.10.2026): Titel, Sender, Laufzeit,
 * „verfügbar bis" und – das Wichtigste – die Untertitel mit Zeitmarken.
 *
 * Beide Wege sind die Schnittstellen, die die Mediatheken selbst für ihre Webseiten benutzen;
 * sie sind nicht als offizielle Schnittstellen dokumentiert und können sich ändern. Geprüft am
 * 02.10.2026 mit echten Sendungen:
 * - ARD: `api.ardmediathek.de/page-gateway/pages/ard/item/{id}` – die Kennung ist der letzte
 *   Teil der Adresse. Untertitel unter `widgets[0].mediaCollection.embedded.subtitles[].sources[]`
 *   (WebVTT), Laufzeit in `meta.durationSeconds`, Ablauf in `widgets[0].availableTo`.
 * - ZDF: Die Videoseite enthält einen Zugangsschlüssel (`apiToken`) und je Video eine Vorlage
 *   `ptmdTemplate` mit Laufzeit; `api.zdf.de/tmd/2/android_native_6/…` liefert daraus die
 *   Untertitel (`captions[]`, WebVTT). Eine Seite kann mehrere Videos tragen (Trailer, Folgen) –
 *   gewählt wird das in der Adresse genannte (`#focus=…`), sonst das längste.
 *
 * arte (seit 02.10.2026, später am Tag): Untertitel nur im Videostrom, siehe `ladeArte`. Rechtlich: Die Untertitel dienen nur als
 * Eingabe für die KI und werden nicht verbreitet; auf dem Blatt stehen Link und QR-Code.
 */
import { politeFetch } from '../images/politeFetch'
import { begrenzteAntwort, GRENZEN } from '../netz/zieladresse'
import { BROWSER_UA, stripHtml } from '../images/sources'
import type { VideoQuelle } from '../../../shared/types'
import { alsTranskript, leseWebVtt } from './untertitel'

export type Mediathek = 'ard' | 'zdf' | 'arte'

/** Welche Mediathek gehört zu dieser Adresse? */
export function mediathekVon(adresse: string): Mediathek | null {
  try {
    const host = new URL(adresse).hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'ardmediathek.de' || host.endsWith('.ardmediathek.de')) return 'ard'
    if (host === 'zdf.de' || host.endsWith('.zdf.de') || host === 'zdfheute.de') return 'zdf'
    if (host === 'arte.tv' || host.endsWith('.arte.tv')) return 'arte'
    return null
  } catch {
    return null
  }
}

const text = async (res: Response): Promise<string> => new TextDecoder().decode(await begrenzteAntwort(res, GRENZEN.text))

async function ladeVtt(url: string): Promise<string> {
  const res = await politeFetch(url, { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) return ''
  return alsTranskript(leseWebVtt(await text(res)))
}

const leer = (url: string, anbieter: Mediathek): VideoQuelle => ({
  url,
  titel: '',
  kanal: anbieter === 'ard' ? 'ARD Mediathek' : anbieter === 'zdf' ? 'ZDF Mediathek' : 'arte',
  beschreibung: '',
  dauerSekunden: 0,
  transkript: '',
  transkriptSprache: '',
  automatisch: false,
  anbieter,
  inhaltQuelle: 'keine'
})

/** Die ARD-Kennung: letzter Pfadteil (Base64-ähnlich, z. B. „Y3JpZDovL2hyLmRl…") */
export function ardKennung(adresse: string): string | null {
  try {
    const teile = new URL(adresse).pathname.split('/').filter(Boolean)
    const letzter = teile[teile.length - 1]
    return letzter && /^[A-Za-z0-9_-]{16,}$/.test(letzter) ? letzter : null
  } catch {
    return null
  }
}

interface ArdUntertitel {
  languageCode?: string
  sources?: { kind?: string; url?: string }[]
}
interface ArdSeite {
  widgets?: {
    title?: string
    synopsis?: string
    availableTo?: string
    show?: { title?: string }
    publicationService?: { name?: string }
    mediaCollection?: { embedded?: { meta?: { durationSeconds?: number }; subtitles?: ArdUntertitel[] } }
  }[]
}

export async function ladeArd(adresse: string): Promise<VideoQuelle> {
  const ergebnis = leer(adresse, 'ard')
  const id = ardKennung(adresse)
  if (!id) return { ...ergebnis, fehler: 'In der Adresse steht keine Sendung der ARD Mediathek.' }
  const res = await politeFetch(`https://api.ardmediathek.de/page-gateway/pages/ard/item/${encodeURIComponent(id)}?devicetype=pc&embedded=true`, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000)
  })
  if (!res.ok) return { ...ergebnis, fehler: `Die ARD Mediathek antwortet nicht (${res.status}).` }
  const seite = JSON.parse(await text(res)) as ArdSeite
  const w = seite.widgets?.[0]
  if (!w) return { ...ergebnis, fehler: 'Die Sendung wurde in der ARD Mediathek nicht gefunden.' }
  const media = w.mediaCollection?.embedded
  const mit: VideoQuelle = {
    ...ergebnis,
    titel: (w.title ?? '').trim(),
    kanal: [w.publicationService?.name, w.show?.title].filter(Boolean).join(' – ') || ergebnis.kanal,
    beschreibung: (w.synopsis ?? '').trim(),
    dauerSekunden: Number(media?.meta?.durationSeconds) || 0,
    ...(w.availableTo ? { verfuegbarBis: w.availableTo } : {})
  }
  const spuren = media?.subtitles ?? []
  const deutsch = spuren.find((s) => (s.languageCode ?? '').startsWith('de')) ?? spuren[0]
  const vtt = deutsch?.sources?.find((s) => s.kind === 'webvtt' && s.url)?.url
  if (!vtt) return { ...mit, fehler: 'Zu dieser Sendung gibt es keine Untertitel – nur Titel und Beschreibung.' }
  const transkript = await ladeVtt(vtt).catch(() => '')
  if (!transkript) return { ...mit, fehler: 'Die Untertitel ließen sich nicht laden – nur Titel und Beschreibung stehen bereit.' }
  return { ...mit, transkript, transkriptSprache: 'de', inhaltQuelle: 'untertitel' }
}

/** Alle Videos einer ZDF-Seite: Vorlage, Laufzeit und Stelle im Quelltext */
export function zdfVideos(html: string): { vorlage: string; dauer: number; stelle: number }[] {
  const out: { vorlage: string; dauer: number; stelle: number }[] = []
  const muster = /ptmdTemplate\\?"\s*:\s*\\?"([^"\\]+)\\?"(?:\s*,\s*\\?"vodMediaType\\?"\s*:\s*\\?"[^"\\]*\\?")?\s*,\s*\\?"duration\\?"\s*:\s*(\d+)/g
  for (const m of html.matchAll(muster)) out.push({ vorlage: m[1], dauer: Number(m[2]), stelle: m.index ?? 0 })
  // Ohne Laufzeit dahinter: trotzdem mitnehmen (Dauer 0)
  if (!out.length) for (const m of html.matchAll(/ptmdTemplate\\?"\s*:\s*\\?"([^"\\]+)/g)) out.push({ vorlage: m[1], dauer: 0, stelle: m.index ?? 0 })
  return out
}

export function zdfSchluessel(html: string): string | null {
  return /apiToken\\?"\s*:\s*\\?"([A-Za-z0-9]{20,})/.exec(html)?.[1] ?? null
}

/** Das gemeinte Video: das aus `#focus=…`, sonst das längste der Seite */
export function zdfWahl(videos: { vorlage: string; dauer: number; stelle: number }[], html: string, adresse: string): string | null {
  if (!videos.length) return null
  let fokus = ''
  try {
    fokus = new URLSearchParams(new URL(adresse).hash.slice(1)).get('focus') ?? ''
  } catch {
    // ohne Fokus
  }
  if (fokus) {
    const bei = html.indexOf(fokus)
    if (bei >= 0) {
      const danach = videos.filter((v) => v.stelle > bei).sort((a, b) => a.stelle - b.stelle)[0]
      if (danach) return danach.vorlage
    }
  }
  return [...videos].sort((a, b) => b.dauer - a.dauer)[0].vorlage
}

const metaInhalt = (html: string, name: string): string =>
  stripHtml(new RegExp(`<meta[^>]+(?:property|name)="${name}"[^>]+content="([^"]*)"`, 'i').exec(html)?.[1] ?? '').trim()

export async function ladeZdf(adresse: string): Promise<VideoQuelle> {
  const ergebnis = leer(adresse, 'zdf')
  const seite = await politeFetch(adresse, { headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'de-DE,de;q=0.9' }, signal: AbortSignal.timeout(20000) })
  if (!seite.ok) return { ...ergebnis, fehler: `Die ZDF-Seite antwortet nicht (${seite.status}).` }
  const html = new TextDecoder().decode(await begrenzteAntwort(seite, GRENZEN.video))
  const titel = metaInhalt(html, 'og:title') || stripHtml(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').trim()
  const mit: VideoQuelle = { ...ergebnis, titel, beschreibung: metaInhalt(html, 'og:description') || metaInhalt(html, 'description') }
  const videos = zdfVideos(html)
  const vorlage = zdfWahl(videos, html, adresse)
  const schluessel = zdfSchluessel(html)
  if (!vorlage || !schluessel) return { ...mit, fehler: 'Auf der Seite wurde kein ZDF-Video gefunden.' }
  const dauer = videos.find((v) => v.vorlage === vorlage)?.dauer ?? 0
  const res = await politeFetch(`https://api.zdf.de${vorlage.replace('{playerId}', 'android_native_6')}`, {
    headers: { 'User-Agent': BROWSER_UA, 'Api-Auth': `Bearer ${schluessel}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000)
  })
  if (!res.ok) return { ...mit, dauerSekunden: dauer, fehler: `Das ZDF liefert keine Angaben zum Video (${res.status}).` }
  const ptmd = JSON.parse(await text(res)) as { captions?: { format?: string; language?: string; uri?: string }[] }
  const spuren = (ptmd.captions ?? []).filter((c) => c.uri && (c.format ?? '').includes('vtt'))
  const vtt = (spuren.find((c) => (c.language ?? '').startsWith('de')) ?? spuren[0])?.uri
  if (!vtt) return { ...mit, dauerSekunden: dauer, fehler: 'Zu diesem Video gibt es keine Untertitel – nur Titel und Beschreibung.' }
  const transkript = await ladeVtt(vtt).catch(() => '')
  if (!transkript) return { ...mit, dauerSekunden: dauer, fehler: 'Die Untertitel ließen sich nicht laden – nur Titel und Beschreibung stehen bereit.' }
  return { ...mit, dauerSekunden: dauer, transkript, transkriptSprache: 'de', inhaltQuelle: 'untertitel' }
}

/* ---------- arte (02.10.2026, geprüft mit „Gedächtnisverlust – Wenn das Gehirn plötzlich streikt")
 *
 * `api.arte.tv/api/player/v2/config/{sprache}/{kennung}` liefert Titel, Laufzeit, Rechte („verfügbar
 * bis") und die Adresse des Videostroms (HLS). Die Untertitel stehen NUR im Strom: Im Manifest
 * verweist eine Zeile `#EXT-X-MEDIA:TYPE=SUBTITLES` je Sprache auf eine Untertitel-Playlist, und
 * diese auf eine einzige WebVTT-Datei. Bevorzugt: Untertitel in der Sprache der Seite, nicht die
 * erzwungenen („FORCED=YES", nur Einblendungen). Altersbeschränkte Sendungen liefern keinen Strom.
 */

/** Sprache und Kennung aus „arte.tv/de/videos/111670-000-A/…" */
export function arteKennung(adresse: string): { sprache: string; id: string } | null {
  try {
    const m = /^\/([a-z]{2})\/videos\/(\d{6}-\d{3}-[A-Z])\b/.exec(new URL(adresse).pathname)
    return m ? { sprache: m[1], id: m[2] } : null
  } catch {
    return null
  }
}

/** Die Untertitel-Playlist aus dem HLS-Manifest: Sprache der Seite, nicht erzwungen */
export function arteUntertitelSpur(manifest: string, sprache: string, basis: string): string | null {
  const spuren = manifest
    .split('\n')
    .filter((z) => z.startsWith('#EXT-X-MEDIA:') && z.includes('TYPE=SUBTITLES'))
    .map((z) => ({
      sprache: /LANGUAGE="([^"]+)"/.exec(z)?.[1] ?? '',
      erzwungen: /FORCED=YES/.test(z),
      uri: /URI="([^"]+)"/.exec(z)?.[1] ?? ''
    }))
    .filter((s) => s.uri)
  const rang = (s: (typeof spuren)[number]): number => (s.sprache === sprache ? 0 : 2) + (s.erzwungen ? 1 : 0)
  const beste = [...spuren].sort((a, b) => rang(a) - rang(b))[0]
  return beste ? new URL(beste.uri, basis).toString() : null
}

interface ArteKonfig {
  data?: {
    attributes?: {
      metadata?: { title?: string; subtitle?: string; description?: string; duration?: { seconds?: number } }
      rights?: { end?: string }
      streams?: { url?: string }[]
      error?: { title?: string; message?: string }
    }
  }
}

export async function ladeArte(adresse: string): Promise<VideoQuelle> {
  const ergebnis = leer(adresse, 'arte')
  const k = arteKennung(adresse)
  if (!k) return { ...ergebnis, fehler: 'In der Adresse steht keine arte-Sendung.' }
  const res = await politeFetch(`https://api.arte.tv/api/player/v2/config/${k.sprache}/${k.id}`, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000)
  })
  if (!res.ok) return { ...ergebnis, fehler: `arte antwortet nicht (${res.status}).` }
  const a = (JSON.parse(await text(res)) as ArteKonfig).data?.attributes
  const m = a?.metadata
  const mit: VideoQuelle = {
    ...ergebnis,
    titel: [m?.title, m?.subtitle].filter(Boolean).join(' – '),
    beschreibung: (m?.description ?? '').trim(),
    dauerSekunden: Number(m?.duration?.seconds) || 0,
    ...(a?.rights?.end ? { verfuegbarBis: a.rights.end } : {})
  }
  const strom = a?.streams?.find((s) => s.url)?.url
  if (!strom) return { ...mit, fehler: a?.error?.title ? `${a.error.title} ${a.error.message ?? ''}`.trim() : 'arte liefert zu dieser Sendung keinen Videostrom.' }
  const manifest = await politeFetch(strom, { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(20000) })
  const spur = manifest.ok ? arteUntertitelSpur(await text(manifest), k.sprache, strom) : null
  if (!spur) return { ...mit, fehler: 'Zu dieser Sendung gibt es keine Untertitel – nur Titel und Beschreibung.' }
  const liste = await politeFetch(spur, { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(20000) })
  const datei = liste.ok
    ? (await text(liste))
        .split('\n')
        .map((z) => z.trim())
        .find((z) => z && !z.startsWith('#'))
    : undefined
  const transkript = datei ? await ladeVtt(new URL(datei, spur).toString()).catch(() => '') : ''
  if (!transkript) return { ...mit, fehler: 'Die Untertitel ließen sich nicht laden – nur Titel und Beschreibung stehen bereit.' }
  return { ...mit, transkript, transkriptSprache: k.sprache, inhaltQuelle: 'untertitel' }
}
