/**
 * Ein YouTube-Video als Material: Titel, Kanal, Laufzeit, Beschreibung und – wo vorhanden –
 * das Transkript aus den Untertiteln.
 *
 * Wunsch der Lehrkraft (26.09.2026): Überall, wo eigenes Material hineingezogen werden kann,
 * soll auch eine Internetadresse genügen – „Video oder generell eine Webseite", die die KI
 * dann weiterverarbeitet. Webseiten laden über `ladeOriginalquelle`; Videos brauchen einen
 * eigenen Weg, weil die Seite selbst keinen Fließtext enthält.
 *
 * Es wird KEIN Programm nachgeladen (kein yt-dlp): Die Wiedergabeseite trägt ihre Angaben
 * als JSON (`ytInitialPlayerResponse`), darunter die Liste der Untertitelspuren. Die Spur wird
 * als json3 geholt und zu Fließtext zusammengesetzt. Bevorzugt werden von Hand erstellte
 * Untertitel (Sprache der Oberfläche zuerst); automatisch erzeugte sind der Rückfall und
 * werden als solche gekennzeichnet, weil sie Fehler enthalten können.
 *
 * Ohne Untertitel bleibt die Beschreibung – und der Hinweis, dass kein Transkript vorliegt.
 */
import { politeFetch } from '../images/politeFetch'
import { BROWSER_UA, stripHtml } from '../images/sources'
import type { VideoQuelle } from '../../../shared/types'

/** Höchstlänge des Transkripts in Zeichen – ein 90-Minuten-Film hat rund 80 000 */
const TRANSKRIPT_MAX = 120_000

/** Die Video-Kennung aus den gängigen YouTube-Adressformen; null, wenn es keine ist. */
export function youtubeId(adresse: string): string | null {
  let url: URL
  try {
    url = new URL(adresse)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, '')
  const gueltig = (id: string | null | undefined): string | null => (id && /^[\w-]{11}$/.test(id) ? id : null)
  if (host === 'youtu.be') return gueltig(url.pathname.split('/')[1])
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null
  if (url.pathname === '/watch') return gueltig(url.searchParams.get('v'))
  const m = /^\/(?:shorts|embed|live|v)\/([\w-]{11})/.exec(url.pathname)
  return m ? m[1] : null
}

const kopf = {
  'User-Agent': BROWSER_UA,
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
  // Ohne Einwilligungs-Cookie liefert YouTube in der EU nur die Einwilligungsseite
  Cookie: 'CONSENT=YES+cb.20240101-00-p0.de+FX+000; SOCS=CAISEwgDEgk2ODM4NDgwNzUaAmRlIAEaBgiA_LyaBg'
}

/** Das JSON-Objekt hinter `name = ` – mit Klammernzählung, weil es Zeichenketten mit „}" enthält. */
function jsonNach(html: string, name: string): unknown {
  const start = html.indexOf(`${name} = {`)
  if (start < 0) return null
  let i = html.indexOf('{', start)
  let tiefe = 0
  let inString = false
  for (let j = i; j < html.length; j++) {
    const c = html[j]
    if (inString) {
      if (c === '\\') j++
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') tiefe++
    else if (c === '}') {
      tiefe--
      if (tiefe === 0) {
        try {
          return JSON.parse(html.slice(i, j + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

interface Spur {
  baseUrl: string
  languageCode?: string
  kind?: string
  name?: { simpleText?: string; runs?: { text: string }[] }
}

/** Die beste Untertitelspur: von Hand vor automatisch, Deutsch vor Englisch vor allem anderen. */
function besteSpur(spuren: Spur[]): Spur | undefined {
  const rang = (s: Spur): number => {
    const sprache = (s.languageCode ?? '').toLowerCase()
    const hand = s.kind !== 'asr' ? 0 : 10
    return hand + (sprache.startsWith('de') ? 0 : sprache.startsWith('en') ? 1 : 2)
  }
  return [...spuren].filter((s) => s.baseUrl).sort((a, b) => rang(a) - rang(b))[0]
}

/** Holt eine Spur als json3 und setzt sie zu Fließtext zusammen (Satzweise, ohne Zeitmarken). */
async function ladeSpur(spur: Spur): Promise<string> {
  const url = `${spur.baseUrl}${spur.baseUrl.includes('fmt=') ? '' : '&fmt=json3'}`
  const res = await politeFetch(url, { headers: kopf, signal: AbortSignal.timeout(15000) })
  if (!res.ok) return ''
  const rohtext = await res.text()
  let stuecke: string[] = []
  try {
    const json = JSON.parse(rohtext) as { events?: { segs?: { utf8?: string }[] }[] }
    stuecke = (json.events ?? []).map((e) => (e.segs ?? []).map((s) => s.utf8 ?? '').join('')).filter((t) => t.trim())
  } catch {
    // XML-Form (timedtext): <text start="..">…</text>
    stuecke = [...rohtext.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => stripHtml(m[1]))
  }
  const text = stuecke
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([.,;:!?])/g, '$1')
  return text.length > TRANSKRIPT_MAX ? `${text.slice(0, TRANSKRIPT_MAX)} …` : text
}

/** Rückfall ohne Wiedergabeseite: wenigstens Titel und Kanal über oEmbed. */
async function oembed(adresse: string): Promise<{ titel: string; kanal: string } | null> {
  try {
    const res = await politeFetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(adresse)}&format=json`, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) return null
    const j = (await res.json()) as { title?: string; author_name?: string }
    return { titel: j.title ?? '', kanal: j.author_name ?? '' }
  } catch {
    return null
  }
}

export async function ladeVideo(adresse: string): Promise<VideoQuelle> {
  const leer: VideoQuelle = { url: adresse, titel: '', kanal: '', beschreibung: '', dauerSekunden: 0, transkript: '', transkriptSprache: '', automatisch: false }
  const id = youtubeId(adresse)
  if (!id) return { ...leer, fehler: 'Das ist keine YouTube-Adresse. Andere Videoseiten werden als Webseite gelesen.' }

  let html = ''
  try {
    const res = await politeFetch(`https://www.youtube.com/watch?v=${id}&hl=de`, { headers: kopf, signal: AbortSignal.timeout(20000) })
    if (res.ok) html = new TextDecoder().decode((await res.arrayBuffer()).slice(0, 8 * 1024 * 1024))
  } catch {
    html = ''
  }

  const player = jsonNach(html, 'ytInitialPlayerResponse') as
    | {
        videoDetails?: { title?: string; author?: string; shortDescription?: string; lengthSeconds?: string }
        captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: Spur[] } }
        playabilityStatus?: { status?: string; reason?: string }
      }
    | null

  if (!player?.videoDetails) {
    const o = await oembed(adresse)
    if (!o) return { ...leer, fehler: 'Das Video ließ sich nicht laden – Adresse prüfen; ist es öffentlich?' }
    return { ...leer, ...o, fehler: 'Zu diesem Video konnte nur der Titel gelesen werden – kein Transkript, keine Beschreibung.' }
  }

  const d = player.videoDetails
  const ergebnis: VideoQuelle = {
    ...leer,
    titel: (d.title ?? '').trim(),
    kanal: (d.author ?? '').trim(),
    beschreibung: (d.shortDescription ?? '').trim(),
    dauerSekunden: Number(d.lengthSeconds) || 0
  }
  if (player.playabilityStatus?.status && player.playabilityStatus.status !== 'OK') {
    return { ...ergebnis, fehler: `Das Video ist nicht abrufbar (${player.playabilityStatus.reason ?? player.playabilityStatus.status}).` }
  }

  const spur = besteSpur(player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [])
  if (!spur) return { ...ergebnis, fehler: 'Das Video hat keine Untertitel – es gibt kein Transkript, nur Titel und Beschreibung.' }
  const transkript = await ladeSpur(spur).catch(() => '')
  if (!transkript) return { ...ergebnis, fehler: 'Die Untertitel ließen sich nicht laden – nur Titel und Beschreibung stehen bereit.' }
  return {
    ...ergebnis,
    transkript,
    transkriptSprache: spur.languageCode ?? '',
    automatisch: spur.kind === 'asr'
  }
}
