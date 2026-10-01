import { cleanImageBackground, KEY_GREEN } from './imageCleanup'
import { ImageServices, onlineCredit } from './imageChoice'
import { loadImage, normalizeImage, svgToDataUrl } from './util'
import { findeAblehnung, leereAblehnungen, type AblehnungsDaten } from '@shared/quellenAblehnung'

/**
 * Bildsuche und -umwandlung über die App (für die KI-geprüfte Bildauswahl).
 *
 * `thema`: Mit Thema gelten auch die Ausblendungen „für dieses Thema", sonst nur „Nie wieder
 * vorschlagen" (01.10.2026, dieselbe Liste wie für Textquellen). Die Liste wird einmal je
 * Suche geholt, nicht je Treffer.
 */
export function browserImageServices(thema = ''): ImageServices {
  let ablehnungen: Promise<AblehnungsDaten> | null = null
  return {
    searchOpenMoji: (q) => window.api.images.searchOpenMoji(q),
    openMojiPng: (hex, size) => openMojiAsPng(hex, size),
    search: (q, source) => window.api.images.searchOnline(q, source),
    fetchImage: (url) => window.api.images.fetch(url),
    normalize: (dataUrl, size, format) => normalizeImage(dataUrl, size, format),
    clean: (dataUrl) => cleanImageBackground(dataUrl),
    abgelehnt: async (url) => {
      ablehnungen ??= window.api.sources.ablehnungen().catch(() => leereAblehnungen())
      return Boolean(findeAblehnung(await ablehnungen, url, thema))
    }
  }
}

/** Bild übernehmen: Hintergrund (Schachbrett, Greenscreen) entfernen und auf Druckgröße bringen. */
export async function preparePickedImage(dataUrl: string, size = 1000): Promise<string> {
  const cleaned = await cleanImageBackground(dataUrl)
  return normalizeImage(cleaned.dataUrl, size, cleaned.kind === 'none' ? 'jpeg' : 'png')
}

/** Ist eine Bild-KI eingerichtet? */
export async function imageGenerationAvailable(): Promise<boolean> {
  try {
    return (await window.api.ai.status()).hasImageKey
  } catch {
    return false
  }
}

export interface PickedImage {
  dataUrl: string
  source: 'openmoji' | 'own' | 'openverse' | 'pixabay' | 'wikimedia' | 'clipart' | 'ai'
  credit?: string
}

/** Rastert ein OpenMoji-Symbol als PNG (für Word und PDF). */
export async function openMojiAsPng(hexcode: string, size = 512): Promise<string> {
  const svg = await window.api.images.openMojiSvg(hexcode)
  return normalizeImage(svgToDataUrl(svg), size, 'png')
}

/** Sucht zu Schlagwörtern das am besten passende Piktogramm. */
export async function findOpenMoji(keywords: string[]): Promise<PickedImage | undefined> {
  for (const kw of keywords) {
    const hits = await window.api.images.searchOpenMoji(kw)
    if (hits.length) {
      return { dataUrl: await openMojiAsPng(hits[0].hexcode), source: 'openmoji', credit: 'OpenMoji, CC BY-SA 4.0' }
    }
  }
  return undefined
}

/** Bildnachweis passend zur Bildquelle */
export const imageCredit = onlineCredit

const GENRE_WORDS =
  /^(karikatur|caricature|cartoon|gemälde|painting|peinture|foto|fotografie|photo|photograph|plakat|poster|stich|kupferstich|engraving|gravure|zeichnung|drawing|flugblatt|lithographie|lithograph|holzschnitt|woodcut|bild|image|map|karte|isolated|freigestellt|background|transparent|blank|png|jpg|vector|stock|hd|closeup)$/i

/**
 * Suchvarianten für Wikimedia Commons: Die Suche verlangt alle Wörter, deshalb von genau zu locker –
 * ohne Gattungswörter, dann nur markante Wörter (ab 4 Buchstaben), zuletzt ohne Jahreszahl.
 */
export function sourceSearchVariants(query: string): string[] {
  const words = query.normalize('NFC').split(/\s+/).filter(Boolean)
  const noGenre = words.filter((w) => !GENRE_WORDS.test(w))
  const strong = noGenre.map((w) => w.replace(/^[a-z]{1,2}['’]/i, '').replace(/[^\p{L}\p{N}-]/gu, '')).filter((w) => w.length >= 4)
  const noYear = strong.filter((w) => !/^\d{3,4}$/.test(w))
  const variants = [
    words.join(' '),
    noGenre.join(' '),
    strong.slice(0, 5).join(' '),
    noYear.slice(0, 4).join(' '),
    noYear.slice(0, 3).join(' '),
    noGenre.slice(0, 2).join(' ')
  ]
  return [...new Set(variants.filter((v) => v.split(' ').length >= 2 || v.length >= 6))]
}

/**
 * Hintergrundvorgabe für KI-Bilder: ein reines Neongrün, das die App anschließend zuverlässig freistellt.
 * Das Motiv selbst darf kein Grün in diesem Ton enthalten.
 */
export const GREEN_SCREEN_PROMPT = `Place the motif on a plain, uniform neon green background (exactly ${KEY_GREEN}, chroma key green), edge to edge, with no shadows, no gradient and no frame on the background. The motif itself must not use this neon green.`

export function aiImagePrompt(subject: string): string {
  return `A simple black-and-white line drawing in pictogram style showing: ${subject}. For a school vocabulary test. One single, clearly recognisable motif, thick clean outlines, no text, no letters, no numbers. ${GREEN_SCREEN_PROMPT}`
}

/**
 * Erzeugt ein KI-Bild und stellt es frei (der neongrüne Hintergrund wird transparent).
 * `erzeuge`: der Bildaufruf eines Hintergrund-Auftrags (abbrechbar) – sonst der allgemeine.
 */
export async function generateAiImage(
  prompt: string,
  size = 512,
  erzeuge: (prompt: string) => Promise<string> = (p) => window.api.ai.image(p)
): Promise<PickedImage> {
  const raw = await erzeuge(prompt)
  const cleaned = await cleanImageBackground(raw)
  return { dataUrl: await normalizeImage(cleaned.dataUrl, size, 'png'), source: 'ai', credit: 'KI-generiert' }
}

export async function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  const img = await loadImage(dataUrl)
  return { width: img.naturalWidth || 100, height: img.naturalHeight || 100 }
}
