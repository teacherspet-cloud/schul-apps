import type { MediaCheck, OnlineImageHit, QuoteCheck } from '@shared/types'
import { politeFetch } from './politeFetch'
import { fliesstext } from '../sources/fliesstext'

// Wikimedia verlangt eine aussagekräftige Programmkennung
export const WIKIMEDIA_UA = 'Schul-Apps/0.1 (Unterrichtsmaterial fuer Lehrkraefte; Electron)'

/**
 * Kennung für gewöhnliche Internetseiten.
 *
 * Nachgemessen am 24.09.2026: Mit der Programmkennung oben antwortete goethe.de mit 403.
 * Viele Redaktionsseiten lehnen unbekannte Kennungen pauschal ab – und damit fielen genau
 * die aktuellen Sachtexte weg, für die die Websuche überhaupt gebaut wurde.
 *
 * Das umgeht keine Bezahlschranke und keine Anmeldung: Gelesen wird ausschließlich, was die
 * Seite auch einem gewöhnlichen Besucher zeigt.
 *
 * Wikimedia und Projekt Gutenberg bekommen weiterhin die Programmkennung – dort ist sie
 * ausdrücklich erwünscht.
 */
export const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

/** Welche Kennung diese Adresse bekommt. */
export function kennungFuer(url: URL): string {
  const host = url.hostname.toLowerCase()
  return /(^|\.)(wikimedia|wikisource|wikipedia|wikidata)\.org$|(^|\.)gutenberg\.org$/.test(host) ? WIKIMEDIA_UA : BROWSER_UA
}

/** Entfernt HTML aus den Metadaten von Wikimedia Commons (Urheber, Datum). */
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<div[^>]*display:\s*none[^>]*>[\s\S]*?<\/div>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '' }
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return named[code.toLowerCase()] ?? m
  })
}

interface CommonsPage {
  pageid: number
  index?: number
  title: string
  imageinfo?: {
    thumburl?: string
    url: string
    descriptionurl: string
    mime?: string
    extmetadata?: Record<string, { value: string }>
  }[]
}

/**
 * Suche in Wikimedia Commons – dort liegen historische Bildquellen (Gemälde, Fotos, Karikaturen, Plakate, Karten)
 * gemeinfrei oder unter freien Lizenzen, jeweils mit Urheber- und Lizenzangabe.
 */
export async function searchWikimedia(query: string, limit = 30): Promise<OnlineImageHit[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: String(limit),
    gsrsearch: `${query} filetype:bitmap|drawing`,
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|mime',
    iiurlwidth: '1000',
    iiextmetadatafilter: 'Artist|LicenseShortName|DateTimeOriginal|ObjectName',
    iiextmetadatalanguage: 'de'
  })
  const res = await politeFetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { 'User-Agent': WIKIMEDIA_UA } })
  if (!res.ok) throw new Error(`Wikimedia-Suche fehlgeschlagen (${res.status}).`)
  const json = (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } }
  return commonsHits(json)
}

export function commonsHits(json: { query?: { pages?: Record<string, CommonsPage> } }): OnlineImageHit[] {
  const pages = Object.values(json.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  const hits: OnlineImageHit[] = []
  for (const p of pages) {
    const info = p.imageinfo?.[0]
    if (!info || !/^image\/(jpeg|png|gif|webp|tiff|svg\+xml)$/.test(info.mime ?? 'image/jpeg')) continue
    const meta = info.extmetadata ?? {}
    const fileTitle = p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '')
    const date = stripHtml(meta.DateTimeOriginal?.value ?? '')
    hits.push({
      id: String(p.pageid),
      // Kleine Vorschau (Standardbreite 330 px) für Auswahl und KI-Prüfung
      thumbnail: info.thumburl ? info.thumburl.replace(/\/\d+px-/, '/330px-') : info.url,
      url: info.thumburl ?? info.url,
      title: stripHtml(meta.ObjectName?.value ?? '') || fileTitle,
      creator: stripHtml(meta.Artist?.value ?? '') || 'unbekannt',
      license: stripHtml(meta.LicenseShortName?.value ?? '') || 'siehe Dateiseite',
      licenseUrl: info.descriptionurl,
      date: date.length <= 40 ? date : undefined,
      source: 'wikimedia'
    })
  }
  return hits
}

// ---------- Wortlaut von Textquellen prüfen ----------

/** Nur Buchstaben und Ziffern, klein, einheitliche Schreibweisen – damit Satzzeichen und Umbrüche keine Rolle spielen. */
export function normalizeForCompare(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/ſ/g, 's')
    .replace(/ß/g, 'ss')
    .replace(/\[(…|\.\.\.)\]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

const SHINGLE = 5

/** Anteil der Fünf-Wort-Folgen des Zitats, die im Quelltext vorkommen (Kürzungen […] werden getrennt betrachtet). */
export function quoteCoverage(quote: string, sourceText: string): { ratio: number; shingles: number } {
  const hay = ` ${normalizeForCompare(sourceText).join(' ')} `
  let total = 0
  let found = 0
  for (const piece of quote.split(/\[(?:…|\.\.\.)\]|\n\s*\n/)) {
    const words = normalizeForCompare(piece.replace(/\*\*|\$[^$]*\$/g, ' '))
    for (let i = 0; i + SHINGLE <= words.length; i += 2) {
      total++
      if (hay.includes(` ${words.slice(i, i + SHINGLE).join(' ')} `)) found++
    }
  }
  return { ratio: total ? found / total : 0, shingles: total }
}

function isPublicHttps(url: URL): boolean {
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  return !(host === 'localhost' || host.endsWith('.local') || /^[\d.]+$/.test(host) || host.includes(':'))
}

/**
 * Lädt eine Seite als Fließtext.
 *
 * Auch die Materialsuche (`services/sources/materialSuche.ts`) benutzt genau diese Funktion.
 * Zwei getrennte Ladewege wären die Art Fehler, die still bleibt: Beim Prüfen eines Zitats
 * käme ein anderer Text heraus als beim Beschaffen desselben Textes.
 */
export async function fetchText(url: URL): Promise<{ text: string; raw: string } | { error: string }> {
  try {
    const res = await politeFetch(url, {
      headers: {
        'User-Agent': kennungFuer(url),
        // Dieselben Angaben wie ein Browser – manche Seiten prüfen auch darauf
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8'
      },
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) return { error: `Die Quelle ist nicht erreichbar (${res.status}).` }
    const type = res.headers.get('content-type') ?? ''
    if (!/text\/(html|plain)|xhtml/.test(type)) return { error: 'Die Adresse liefert keinen Text.' }
    const raw = new TextDecoder().decode((await res.arrayBuffer()).slice(0, 6 * 1024 * 1024))
    const istHtml = /<html|<body|<p[\s>]/i.test(raw)
    if (!istHtml) return { text: raw, raw }
    /*
     * Fliesstext statt platt entfernter Tags.
     *
     * `stripHtml` macht aus der ganzen Seite EINE Zeile und laesst Navigation, Cookie-Hinweis
     * und Impressum darin stehen. Nachgemessen am 24.09.2026: Damit fiel JEDER Suchtreffer
     * durch die Qualitaetspruefung – nicht wegen der Quelle, sondern wegen der Aufbereitung.
     *
     * Findet die Extraktion keinen zusammenhaengenden Text (Uebersichts- oder
     * Navigationsseite), bleibt der platte Weg als Rueckfall: Dann entscheidet die
     * Qualitaetspruefung, statt dass hier schon nichts ankommt.
     */
    const text = fliesstext(raw)
    return { text: text.length >= 200 ? text : stripHtml(raw), raw }
  } catch (e) {
    return { error: `Die Quelle ist nicht erreichbar (${e instanceof Error ? e.message : String(e)}).` }
  }
}

function verdict(ratio: number, shingles: number): Pick<QuoteCheck, 'status' | 'message'> {
  if (shingles === 0) return { status: 'found', message: 'Zitat zu kurz für einen Abgleich.' }
  if (ratio >= 0.75) return { status: 'found', message: 'Wortlaut in der angegebenen Quelle gefunden.' }
  if (ratio >= 0.3) return { status: 'partial', message: 'Wortlaut nur teilweise in der angegebenen Quelle gefunden.' }
  return { status: 'notFound', message: 'Wortlaut nicht in der angegebenen Quelle gefunden.' }
}

/** Wortfolge aus dem Zitat, mit der sich die Quelle per Volltextsuche finden lässt. */
export function searchPhrase(quote: string): string {
  const piece = quote.split(/\[(?:…|\.\.\.)\]|\n\s*\n/).sort((a, b) => b.length - a.length)[0] ?? ''
  const words = piece
    .replace(/\*\*|\$[^$]*\$/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)
  return words.slice(0, 7).join(' ')
}

/** Sucht den Wortlaut in Wikisource (typischer Fundort gemeinfreier Texte), wenn die angegebene Adresse nicht passt. */
async function findOnWikisource(quote: string, lang: string): Promise<{ url: string; ratio: number; shingles: number } | null> {
  const phrase = searchPhrase(quote)
  if (phrase.split(' ').length < 5) return null
  const api = `https://${lang}.wikisource.org/w/api.php?${new URLSearchParams({ action: 'query', list: 'search', format: 'json', srlimit: '3', srprop: '', srsearch: `"${phrase}"` })}`
  try {
    const res = await politeFetch(api, { headers: { 'User-Agent': WIKIMEDIA_UA }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    const json = (await res.json()) as { query?: { search?: { title: string }[] } }
    let best: { url: string; ratio: number; shingles: number } | null = null
    for (const hit of json.query?.search ?? []) {
      const url = `https://${lang}.wikisource.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, '_'))}`
      const page = await fetchText(new URL(url))
      if ('error' in page) continue
      const cov = quoteCoverage(quote, page.text)
      if (!best || cov.ratio > best.ratio) best = { url: decodeURI(url), ...cov }
      if (cov.ratio >= 0.75) break
    }
    return best && best.ratio >= 0.3 ? best : null
  } catch {
    return null
  }
}

/**
 * Prüft eine von der KI genannte Ton- oder Filmquelle.
 *
 * Bei einem Zeitzeugeninterview oder einer Rede lässt sich kein Wortlaut abgleichen – die
 * Seite enthält ja nur das Abspielgerät. Geprüft wird deshalb, ob die Seite existiert und
 * ob die Begriffe darauf vorkommen, die die KI behauptet (Name der sprechenden Person,
 * Jahr, Thema). Beides zusammen entlarvt die erfundene Adresse zuverlässig genug, ohne der
 * Lehrkraft Arbeit abzunehmen, die sie ohnehin tun muss.
 */
export async function checkMediaSource(urlText: string, expect: string[]): Promise<MediaCheck> {
  let url: URL
  try {
    url = new URL(urlText)
  } catch {
    return { status: 'unreachable', matched: [], missing: expect, message: 'Die Internetadresse der Aufnahme ist ungültig.' }
  }
  if (!isPublicHttps(url)) return { status: 'unreachable', matched: [], missing: expect, message: 'Nur öffentliche https-Adressen werden geprüft.' }
  const page = await fetchText(url)
  if ('error' in page) return { status: 'unreachable', matched: [], missing: expect, message: page.error }

  const haystack = page.text.toLowerCase()
  const begriffe = expect.map((e) => e.trim()).filter((e) => e.length >= 3)
  const matched: string[] = []
  const missing: string[] = []
  for (const b of begriffe) {
    // Mehrwortangaben („Konrad Adenauer") gelten als getroffen, wenn JEDES Wort vorkommt:
    // Archivseiten schreiben Namen oft umgestellt oder mit Zusatz.
    const teile = b
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 3)
    const da = teile.length ? teile.every((t) => haystack.includes(t)) : haystack.includes(b.toLowerCase())
    ;(da ? matched : missing).push(b)
  }
  // Der Seitentitel steht im HTML, nicht im entschlackten Text – dort sind die Tags schon weg
  const title = stripHtml(/<title[^>]*>([\s\S]{1,200}?)<\/title>/i.exec(page.raw)?.[1] ?? '') || undefined
  // Nichts zu prüfen: Dann sagt die Erreichbarkeit allein schon etwas
  if (!begriffe.length) return { status: 'ok', title, matched, missing, message: 'Die Adresse ist erreichbar.' }
  if (matched.length >= Math.ceil(begriffe.length / 2))
    return { status: 'ok', title, matched, missing, message: 'Die Seite ist erreichbar und nennt die angegebenen Angaben.' }
  return {
    status: 'mismatch',
    title,
    matched,
    missing,
    message: `Die Seite ist erreichbar, nennt aber nicht: ${missing.join(', ')}. Möglicherweise ist es nicht die gemeinte Aufnahme.`
  }
}

/**
 * Lädt die angegebene Internetquelle und prüft, ob der Wortlaut des Zitats dort steht.
 * Passt die Adresse nicht, wird der Wortlaut in Wikisource gesucht und ggf. die richtige Adresse vorgeschlagen.
 */
export async function checkQuote(urlText: string, quote: string): Promise<QuoteCheck> {
  let url: URL
  try {
    url = new URL(urlText)
  } catch {
    return { status: 'unreachable', ratio: 0, message: 'Die Internetadresse der Quelle ist ungültig.' }
  }
  if (!isPublicHttps(url)) return { status: 'unreachable', ratio: 0, message: 'Nur öffentliche https-Adressen werden geprüft.' }
  const page = await fetchText(url)
  const own = 'error' in page ? null : quoteCoverage(quote, page.text)
  if (own && (own.shingles === 0 || own.ratio >= 0.75)) return { ratio: own.shingles ? own.ratio : 1, ...verdict(own.ratio, own.shingles) }

  const lang = /^([a-z]{2,3})\.wikisource\.org$/.exec(url.hostname)?.[1] ?? 'de'
  const alt = quote.trim() ? await findOnWikisource(quote, lang) : null
  if (alt && alt.ratio > (own?.ratio ?? 0)) {
    const v = verdict(alt.ratio, alt.shingles)
    return {
      status: v.status,
      ratio: alt.ratio,
      suggestedUrl: alt.url,
      message: `${v.message.replace('in der angegebenen Quelle', 'in Wikisource')} Richtige Adresse: ${alt.url}`
    }
  }
  if ('error' in page)
    return {
      status: 'unreachable',
      ratio: 0,
      message: quote.trim() ? `${page.error} Der Wortlaut wurde auch in Wikisource nicht gefunden.` : page.error
    }
  return { ratio: own!.ratio, ...verdict(own!.ratio, own!.shingles) }
}
