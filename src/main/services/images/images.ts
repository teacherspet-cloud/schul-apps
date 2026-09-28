import { readFileSync } from 'fs'
import { exifEntfernen } from '@shared/exifEntfernen'
import { OnlineImageHit, OnlineImageSource, OpenMojiHit } from '@shared/types'
import { politeFetch } from './politeFetch'
import { begrenzteAntwort, GRENZEN } from '../netz/zieladresse'
import { searchWikimedia, WIKIMEDIA_UA } from './sources'
import { resourcePath } from '../storage/paths'

interface IndexEntry {
  h: string
  a: string
  t: string
  g: string
}

let index: IndexEntry[] | null = null

function loadIndex(): IndexEntry[] {
  if (!index) {
    try {
      index = JSON.parse(readFileSync(resourcePath('openmoji', 'index.json'), 'utf8')) as IndexEntry[]
    } catch {
      index = []
    }
  }
  return index
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Einfache Schlagwortsuche: exakte Bezeichnung > Schlagwort > ganzes Wort > Teilstring. */
export function searchOpenMoji(query: string, limit = 60): OpenMojiHit[] {
  const q = query
    .trim()
    .toLowerCase()
    .replace(/^(to|a|an|the)\s+/, '')
  if (!q) return []
  const words = q.split(/\s+/)
  const wholeWord = new RegExp(`\\b${escapeRe(q)}\\b`)
  const scored: { e: IndexEntry; s: number }[] = []
  for (const e of loadIndex()) {
    const a = e.a.toLowerCase()
    const tags = e.t.toLowerCase().split(/,\s*/)
    let s = 0
    if (a === q) s = 100
    else if (tags.includes(q)) s = 80
    else if (wholeWord.test(a)) s = 60 - a.length / 10
    else if (words.every((w) => a.includes(w) || tags.some((t) => t.includes(w)))) s = 30 - a.length / 10
    else if (a.includes(q)) s = 20
    if (s > 0) scored.push({ e, s })
  }
  return scored
    .sort((x, y) => y.s - x.s)
    .slice(0, limit)
    .map(({ e }) => ({ hexcode: e.h, annotation: e.a, tags: e.t }))
}

let svgs: Record<string, string> | null = null

/** SVGs liegen gebündelt in einer Datei (schnelleres Entpacken der portablen .exe); erst bei Bedarf laden. */
export function getOpenMojiSvg(hexcode: string): string {
  if (!/^[0-9A-F-]+$/i.test(hexcode)) throw new Error('Ungültiger Symbolcode.')
  if (!svgs) svgs = JSON.parse(readFileSync(resourcePath('openmoji', 'svgs.json'), 'utf8')) as Record<string, string>
  const svg = svgs[hexcode.toUpperCase()]
  if (!svg) throw new Error('Symbol nicht gefunden.')
  return svg
}

export async function searchOnline(query: string, source: OnlineImageSource, pixabayKey?: string): Promise<OnlineImageHit[]> {
  if (source === 'wikimedia') return searchWikimedia(query)
  if (source === 'openverse' || source === 'clipart') {
    // Cliparts: gemeinfreie Illustrationen (v. a. rawpixel und svgsilh) – klar, freigestellt, ohne Lizenzauflagen
    const filter = source === 'clipart' ? '&category=illustration&source=rawpixel,svgsilh,wikimedia&license=cc0,pdm' : ''
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=${source === 'clipart' ? 20 : 30}&mature=false${filter}`
    const res = await politeFetch(url, { headers: { 'User-Agent': WIKIMEDIA_UA } })
    if (!res.ok) throw new Error(`Openverse-Suche fehlgeschlagen (${res.status}).`)
    const json = (await res.json()) as {
      results: {
        id: string
        title?: string
        url: string
        thumbnail?: string
        creator?: string
        license: string
        license_version?: string
        license_url?: string
      }[]
    }
    return json.results.map((r) => ({
      id: r.id,
      thumbnail: r.thumbnail || r.url,
      url: r.url,
      title: r.title ?? '',
      creator: r.creator ?? 'unbekannt',
      license: `${r.license.toUpperCase()} ${r.license_version ?? ''}`.trim(),
      licenseUrl: r.license_url,
      source
    }))
  }
  if (!pixabayKey) throw new Error('Für die Pixabay-Suche wird ein API-Schlüssel benötigt (Einstellungen).')
  const url = `https://pixabay.com/api/?key=${encodeURIComponent(pixabayKey)}&q=${encodeURIComponent(query)}&safesearch=true&per_page=30`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Pixabay-Suche fehlgeschlagen (${res.status}).`)
  const json = (await res.json()) as {
    hits: { id: number; previewURL: string; webformatURL: string; tags: string; user: string }[]
  }
  return json.hits.map((h) => ({
    id: String(h.id),
    thumbnail: h.previewURL,
    url: h.webformatURL,
    title: h.tags,
    creator: h.user,
    license: 'Pixabay-Inhaltslizenz',
    licenseUrl: 'https://pixabay.com/service/license-summary/',
    source: 'pixabay' as const
  }))
}

export async function fetchAsDataUrl(url: string): Promise<string> {
  if (!/^https:\/\//.test(url)) throw new Error('Nur https-Adressen sind erlaubt.')
  const res = await politeFetch(url, { headers: { 'User-Agent': WIKIMEDIA_UA } })
  if (!res.ok) throw new Error(`Bild konnte nicht geladen werden (${res.status}).`)
  const type = res.headers.get('content-type') ?? 'image/jpeg'
  if (!type.startsWith('image/')) throw new Error('Die Adresse liefert kein Bild.')
  // Größengrenze (27.09.2026): stückweise lesen, darüber abbrechen – ein Riesenbild füllte sonst den Speicher
  // Ohne Aufnahmeort, Kamera und Urheber-Metadaten ins Blatt (Großprogramm 0.4) – verlustfrei, ohne Neukodierung
  const buf = Buffer.from(exifEntfernen(new Uint8Array(await begrenzteAntwort(res, GRENZEN.bild))))
  return `data:${type};base64,${buf.toString('base64')}`
}
