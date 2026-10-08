// Bildauswahl mit KI-Prüfung: Kandidaten aus Piktogrammen, Cliparts und Wikimedia Commons sammeln,
// die KI wählt das Bild, das eindeutig passt. Gemeinsam für Vokabeltest und Arbeitsblatt.
import type { OnlineImageHit, OnlineImageSource, StructuredRequest } from '@shared/types'
import { arr, enumOf, int, obj, str } from './aiSchema'
import type { SourceCitation } from './citation'

export type AiCall = <T>(req: StructuredRequest) => Promise<T>

export type CandidateKind = 'pictogram' | 'clipart' | 'photo'

export interface ImageCandidate {
  kind: CandidateKind
  source: 'openmoji' | 'clipart' | 'wikimedia' | 'openverse' | 'ai'
  title: string
  credit: string
  /** Einzelangaben der Quelle (Urheber, Titel, Datum, Lizenz, Adresse) */
  citation?: SourceCitation
  /** Kleine Vorschau (JPEG, data:-URL) für die KI-Prüfung */
  preview: string
  /** Bild in Druckgröße laden */
  load: () => Promise<string>
}

export interface ImageNeed {
  id: string
  /** Was das Bild eindeutig zeigen muss – für die KI-Prüfung */
  subject: string
  /** Suchbegriffe, genaueste zuerst */
  queries: string[]
  kinds: CandidateKind[]
}

export interface ImageServices {
  searchOpenMoji: (q: string) => Promise<{ hexcode: string; annotation: string }[]>
  openMojiPng: (hexcode: string, size: number) => Promise<string>
  search: (q: string, source: OnlineImageSource) => Promise<OnlineImageHit[]>
  fetchImage: (url: string) => Promise<string>
  /** Verkleinert/wandelt um (JPEG mit weißem Hintergrund bzw. PNG) */
  normalize: (dataUrl: string, maxSize: number, format: 'png' | 'jpeg') => Promise<string>
  /** Entfernt Schachbrett- und Greenscreen-Hintergründe (optional) */
  clean?: (dataUrl: string) => Promise<{ dataUrl: string; kind: string }>
  /**
   * Abgelehnte Fundstellen (01.10.2026) – dieselbe Liste wie für Textquellen
   * (@shared/quellenAblehnung). Was die Lehrkraft aussortiert hat, kommt nicht wieder.
   */
  abgelehnt?: (url: string) => boolean | Promise<boolean>
}

export interface Choice {
  candidate?: ImageCandidate
  fit: 'eindeutig' | 'brauchbar' | 'ungeeignet'
  reason: string
}

const PREVIEW = 256

async function settle<T>(tasks: (() => Promise<T>)[], limit = 4): Promise<T[]> {
  const out: T[] = []
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (i < tasks.length) {
        const idx = i++
        try {
          out[idx] = await tasks[idx]()
        } catch {
          // einzelne Bilder dürfen fehlen
        }
      }
    })
  )
  return out.filter(Boolean)
}

/**
 * Treffer der Online-Suche: genaueste Suchvariante mit Treffern plus die lockerste Variante (sehr genaue Suchbegriffe
 * liefern oft nur Randtreffer), abwechselnd gemischt.
 */
async function searchHits(queries: string[], source: OnlineImageSource, services: ImageServices): Promise<OnlineImageHit[]> {
  const variants = queries.filter((q) => q.trim())
  const run = async (q: string): Promise<OnlineImageHit[]> => services.search(q, source).catch(() => [])
  let precise: OnlineImageHit[] = []
  let index = 0
  for (; index < variants.length; index++) {
    precise = await run(variants[index])
    if (precise.length) break
  }
  const loosest = variants.length - 1
  const loose = loosest > index ? await run(variants[loosest]) : []
  const merged: OnlineImageHit[] = []
  const seen = new Set<string>()
  for (let k = 0; k < Math.max(precise.length, loose.length); k++) {
    for (const h of [precise[k], loose[k]]) {
      if (h && !seen.has(h.id)) {
        seen.add(h.id)
        merged.push(h)
      }
    }
  }
  return merged
}

/**
 * `fotoQuelle` (08.10.2026): Woher Fotos kommen – Standard Wikimedia Commons. Der Archiv-Durchgang für Geschichte
 * und Politik (arbeitsblatt/generation/worksheetImages.ts) sucht einmal über Openverse (Museen, Bibliotheken,
 * Flickr Commons).
 */
export async function gatherCandidates(need: ImageNeed, services: ImageServices, perKind = 3, fotoQuelle: OnlineImageSource = 'wikimedia'): Promise<ImageCandidate[]> {
  const jobs: (() => Promise<ImageCandidate>)[] = []

  if (need.kinds.includes('pictogram')) {
    const seen = new Set<string>()
    for (const q of need.queries.slice(0, 3)) {
      const hits = await services.searchOpenMoji(q).catch(() => [])
      for (const h of hits.slice(0, 2)) {
        if (seen.has(h.hexcode) || seen.size >= perKind) continue
        seen.add(h.hexcode)
        jobs.push(async () => ({
          kind: 'pictogram',
          source: 'openmoji',
          title: h.annotation,
          credit: 'OpenMoji, CC BY-SA 4.0',
          preview: await services.normalize(await services.openMojiPng(h.hexcode, PREVIEW), PREVIEW, 'jpeg'),
          load: () => services.openMojiPng(h.hexcode, 512)
        }))
      }
    }
  }

  const online = async (kind: CandidateKind, source: OnlineImageSource, queries: string[], count: number): Promise<void> => {
    const gefunden = await searchHits(queries, source, services)
    // Abgelehntes vor dem Laden herausnehmen – sonst nähme es einen der wenigen Plätze ein
    const pruefe = services.abgelehnt
    const hits = pruefe
      ? (
          await Promise.all(
            gefunden.map(async (h) => {
              const weg = await Promise.resolve(pruefe(h.url)).catch(() => false)
              const wegLizenz = !weg && h.licenseUrl ? await Promise.resolve(pruefe(h.licenseUrl)).catch(() => false) : false
              return weg || wegLizenz ? null : h
            })
          )
        ).filter((h): h is OnlineImageHit => h !== null)
      : gefunden
    for (const h of hits.slice(0, count)) {
      jobs.push(async () => {
        const raw = await services.fetchImage(h.thumbnail || h.url)
        return {
          kind,
          source: h.source === 'clipart' ? 'clipart' : h.source === 'wikimedia' ? 'wikimedia' : 'openverse',
          title: h.title,
          credit: onlineCredit(h),
          citation: onlineCitation(h),
          preview: await services.normalize(raw, PREVIEW, 'jpeg'),
          load: async () => {
            // Hintergrund (Schachbrett, Greenscreen) entfernen; danach PNG, damit die Transparenz erhalten bleibt
            // Manche Anbieter (svgsilh.com) sperren Downloads zeitweise (403, Bot-Schutz) – dann die Vorschau über Openverse (03.10.2026)
            const full = await services
              .fetchImage(h.url)
              .catch((e: unknown) => (h.thumbnail && h.thumbnail !== h.url ? services.fetchImage(h.thumbnail) : Promise.reject(e)))
            const cleaned = services.clean ? await services.clean(full) : { dataUrl: full, kind: 'none' }
            return services.normalize(cleaned.dataUrl, 1000, cleaned.kind !== 'none' || kind === 'clipart' ? 'png' : 'jpeg')
          }
        }
      })
    }
  }
  // Reihenfolge wie in need.kinds (die wichtigste Bildart zuerst)
  for (const kind of need.kinds) {
    if (kind === 'photo') await online('photo', fotoQuelle, need.queries, perKind + 1)
    if (kind === 'clipart') await online('clipart', 'clipart', need.queries, perKind)
  }

  return settle(jobs)
}

/**
 * Die Angaben eines Treffers als Quellenangabe.
 * Die Adresse der Fundstelle ging bisher verloren – ohne sie ist der Nachweis wertlos.
 */
export function onlineCitation(h: OnlineImageHit): SourceCitation {
  const repository = h.source === 'wikimedia' ? 'Wikimedia Commons' : h.source === 'pixabay' ? 'Pixabay' : 'Openverse'
  return {
    creator: h.creator && h.creator !== 'unbekannt' ? h.creator : undefined,
    title: h.title || undefined,
    date: h.date || undefined,
    license: h.license || undefined,
    repository,
    url: h.licenseUrl || h.url || undefined,
    retrieved: new Date().toISOString()
  }
}

export function onlineCredit(h: OnlineImageHit): string {
  if (h.source === 'wikimedia') {
    const work = [h.title, h.date].filter(Boolean).join(', ')
    return `Bildquelle: ${h.creator === 'unbekannt' ? 'Urheber unbekannt' : h.creator}${work ? `: ${work}` : ''} – ${h.license}, Wikimedia Commons`
  }
  if (h.source === 'clipart') return `Clipart: ${h.creator}, ${h.license} (via Openverse)`
  return `Bild: ${h.creator}, ${h.license}${h.source === 'openverse' ? ' (via Openverse)' : ' (Pixabay)'}`
}

const CHOICE_SCHEMA = obj({
  choices: arr(
    obj({
      id: str(),
      image: int('Nummer des am besten geeigneten Bildes oder 0, wenn keines passt'),
      fit: enumOf(['eindeutig', 'brauchbar', 'ungeeignet']),
      reason: str('kurze Begründung')
    })
  )
})

/** Höchstens so viele Bilder je KI-Anfrage */
const MAX_IMAGES_PER_CALL = 20

/**
 * Die KI sieht alle Kandidaten (nummeriert) und wählt je Bedarf das passende Bild.
 * `rules` beschreibt, wann ein Bild geeignet ist (Vokabeltest: eindeutig benennbar; Arbeitsblatt: fachlich passend).
 */
export async function chooseImages(items: { need: ImageNeed; candidates: ImageCandidate[] }[], rules: string, ai: AiCall): Promise<Map<string, Choice>> {
  const result = new Map<string, Choice>()
  const withCandidates = items.filter((i) => i.candidates.length)
  for (const i of items) if (!i.candidates.length) result.set(i.need.id, { fit: 'ungeeignet', reason: 'Keine Bilder gefunden.' })

  // In Gruppen aufteilen, damit eine Anfrage nicht zu viele Bilder enthält
  const batches: (typeof withCandidates)[] = []
  let current: typeof withCandidates = []
  let count = 0
  for (const item of withCandidates) {
    if (count + item.candidates.length > MAX_IMAGES_PER_CALL && current.length) {
      batches.push(current)
      current = []
      count = 0
    }
    current.push(item)
    count += item.candidates.length
  }
  if (current.length) batches.push(current)

  for (const batch of batches) {
    const images: string[] = []
    const lines: string[] = []
    const offsets = new Map<string, number>()
    for (const item of batch) {
      const first = images.length + 1
      offsets.set(item.need.id, images.length)
      images.push(...item.candidates.map((c) => c.preview))
      const nums = item.candidates.map((c, k) => `Bild ${first + k} (${KIND_LABEL[c.kind]}${c.title ? `: „${c.title.slice(0, 80)}“` : ''})`)
      lines.push(`- id="${item.need.id}": ${item.need.subject}\n  Kandidaten: ${nums.join('; ')}`)
    }
    const res = await ai<{ choices: { id: string; image: number; fit: Choice['fit']; reason: string }[] }>({
      system: 'Du prüfst Bilder für Unterrichtsmaterial sorgfältig und streng. Du antwortest nur im verlangten JSON-Format.',
      user: [
        rules,
        'Die Bilder sind in der angegebenen Reihenfolge beigefügt und fortlaufend nummeriert (Bild 1 = erstes beigefügtes Bild).',
        'Wähle je Eintrag genau ein Bild (Nummer) oder 0. fit: „eindeutig“ = passt ohne jeden Zweifel, „brauchbar“ = passt, aber nicht ideal, „ungeeignet“ = keines passt.',
        lines.join('\n')
      ].join('\n\n'),
      images,
      schemaName: 'image_choice',
      schema: CHOICE_SCHEMA
    })
    for (const item of batch) {
      const c = res?.choices?.find((x) => x.id === item.need.id)
      const offset = offsets.get(item.need.id) ?? 0
      const index = c ? c.image - 1 - offset : -1
      const candidate = c && c.fit !== 'ungeeignet' && index >= 0 && index < item.candidates.length ? item.candidates[index] : undefined
      result.set(item.need.id, { candidate, fit: candidate ? c!.fit : 'ungeeignet', reason: c?.reason ?? 'Keine Bewertung.' })
    }
  }
  return result
}

const KIND_LABEL: Record<CandidateKind, string> = { pictogram: 'Piktogramm', clipart: 'Clipart', photo: 'Foto/Grafik' }
