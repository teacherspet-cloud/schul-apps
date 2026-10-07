/**
 * Medienbank der Vokabeln – Abläufe in der Oberfläche (05.10.2026; Ablage: main/services/storage/medienbank.ts).
 *
 * Bilder: Die Bildsuche (Openverse, Wikimedia, Pixabay mit Schlüssel) liefert Kandidaten; die eingestellte
 * KI sieht die Vorschauen und wählt das geeignetste (oder keines). Das Bild wird verkleinert (höchstens
 * 512 px) gespeichert, die übrigen Kandidaten bleiben zum Umwählen. Alternativ erzeugt die Bild-KI eines.
 * Aussprache: die Sprach-KI (ElevenLabs bzw. OpenAI-Stimme) mit der Standardstimme der Sprache.
 * Alle Wege laufen über die vorhandenen Kanäle – mit Schlüsseln, Namensschutz und Verbrauch wie sonst.
 *
 * Seit 06.10.2026 laufen sie als Hintergrund-Aufträge (medienAuftrag.ts): Die KI-Aufrufe kommen dann über den
 * Auftrag (`Ki`), damit Fortschritt, Warteplatz und Abbruch in der Auftragsleiste stimmen. Für jüngere Lernende
 * (bis Klasse 6) sucht die Bildsuche zuerst Cliparts und Illustrationen, Fotos nur als Rückfall.
 */
import type { OnlineImageHit, OnlineImageSource, StructuredRequest } from '@shared/types'
import type { MedienKandidat, Stimmlage, TonArt } from '@shared/medienbank'
import { istBegrenzung } from './medienWarten'

export interface Vokabel {
  term: string
  translation: string
  example?: string
}

/** Wie die Abläufe die KI erreichen – im Auftrag über dessen Kontext, sonst direkt */
export interface Ki {
  ai: <T>(req: StructuredRequest) => Promise<T>
  bild: (prompt: string) => Promise<string>
}
const direkt = (): Ki => ({ ai: (req) => window.api.ai.structured(req), bild: (prompt) => window.api.ai.image(prompt) })

/** Wer die Vokabeln lernt – steuert Bildart und Bildsprache */
export interface Lernende {
  /** Klassenstufe aus Liste oder Lehrwerk (fehlt = unbekannt) */
  klasse?: number
}

/** Bis zu dieser Klasse bevorzugt die Bildsuche Cliparts (Wunsch der Lehrkraft, 06.10.2026) */
export const CLIPART_BIS_KLASSE = 6
export const clipartZuerst = (l?: Lernende): boolean => Boolean(l?.klasse && l.klasse <= CLIPART_BIS_KLASSE)

const SPRACHE_NAME: Record<string, string> = {
  de: 'Deutsch',
  en: 'Englisch',
  fr: 'Französisch',
  es: 'Spanisch',
  it: 'Italienisch',
  la: 'Latein',
  nl: 'Niederländisch',
  pl: 'Polnisch',
  ru: 'Russisch',
  tr: 'Türkisch'
}

/** Bild verkleinern (JPEG, höchstens `max` px) – die Medienbank bleibt klein, Laden geht schnell */
export async function verkleinern(dataUrl: string, max = 512): Promise<string> {
  const bild = await new Promise<HTMLImageElement>((ok, fehler) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = () => fehler(new Error('Das Bild ließ sich nicht laden.'))
    i.src = dataUrl
  })
  const f = Math.min(1, max / Math.max(bild.naturalWidth, bild.naturalHeight))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bild.naturalWidth * f))
  c.height = Math.max(1, Math.round(bild.naturalHeight * f))
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(bild, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85)
}

const nachweisVon = (k: MedienKandidat): string => [k.titel, k.urheber, k.lizenz, k.quelle].filter(Boolean).join(' · ')

/** Eine Suchanfrage: Quelle und – bei Pixabay – die Bildart */
type Suche = { quelle: OnlineImageSource; bildart?: 'photo' | 'illustration' | 'vector' }

/**
 * Reihenfolge der Suchen. Jüngere Lernende: zuerst Cliparts (Openverse-Illustrationen, Pixabay Illustration und
 * Vektor), Fotos nur, wenn das zu wenig liefert. Ältere: wie bisher Fotos und Grafiken gemischt.
 */
export function suchReihe(l?: Lernende): { zuerst: Suche[]; rueckfall: Suche[] } {
  const fotos: Suche[] = [{ quelle: 'openverse' }, { quelle: 'wikimedia' }, { quelle: 'pixabay' }]
  if (!clipartZuerst(l)) return { zuerst: fotos, rueckfall: [] }
  return {
    zuerst: [{ quelle: 'clipart' }, { quelle: 'pixabay', bildart: 'vector' }, { quelle: 'pixabay', bildart: 'illustration' }],
    rueckfall: [{ quelle: 'openverse' }, { quelle: 'pixabay', bildart: 'photo' }]
  }
}

/** Suchbegriff: der englische Begriff bei Englisch (und das Wort selbst bei Deutsch), sonst die deutsche Bedeutung */
const suchbegriff = (sprache: string, v: Vokabel): string => (sprache === 'en' || sprache === 'de' ? v.term : v.translation || v.term)

/**
 * Kandidaten aus der Bildsuche. Scheitern ALLE Quellen an einer Begrenzung (z. B. Pixabay 429) und es gibt
 * keinen Treffer, kommt der Fehler durch – dann wartet der Auftrag, statt das Wort als „ohne Bild" abzuhaken.
 */
export async function bildKandidaten(sprache: string, v: Vokabel, lernende?: Lernende): Promise<MedienKandidat[]> {
  const suche = suchbegriff(sprache, v)
  const { zuerst, rueckfall } = suchReihe(lernende)
  const treffer: OnlineImageHit[] = []
  const begrenzt: unknown[] = []
  const hole = async (reihe: Suche[]): Promise<void> => {
    for (const s of reihe) {
      const t = await window.api.images.searchOnline(suche, s.quelle, s.bildart ? { bildart: s.bildart } : undefined).catch((e: unknown) => {
        if (istBegrenzung(e instanceof Error ? e.message : String(e))) begrenzt.push(e)
        return [] as OnlineImageHit[]
      })
      treffer.push(...t.slice(0, 4))
    }
  }
  await hole(zuerst)
  // Zu wenig Cliparts: Fotos als Rückfall
  if (treffer.length < 4 && rueckfall.length) await hole(rueckfall)
  if (!treffer.length && begrenzt.length) throw begrenzt[0]
  const gesehen = new Set<string>()
  return (
    treffer
      // https – oder kleine data-Bilder (KI-Attrappe der Tests)
      .filter((h) => (/^https:\/\//.test(h.url) || (h.url.startsWith('data:image/') && h.url.length < 4000)) && !gesehen.has(h.url) && gesehen.add(h.url))
      .slice(0, 10)
      .map((h) => ({ url: h.url, vorschau: h.thumbnail || h.url, titel: h.title, urheber: h.creator, lizenz: h.license, quelle: h.source }))
  )
}

/** Hinweis an die KI zur Bildart, je nach Alter der Lernenden */
export function bildartHinweis(l?: Lernende): string {
  if (clipartZuerst(l))
    return `Die Lernenden sind in Klasse ${l!.klasse} (etwa ${l!.klasse! + 5}–${
      l!.klasse! + 6
    } Jahre): Bevorzuge klare, freundliche Cliparts oder Illustrationen; ein Foto nur, wenn kein Clipart die Bedeutung eindeutig zeigt.`
  return 'Fotos und klare Grafiken sind gleichermaßen geeignet.'
}

/** Die KI wählt aus den Vorschauen das Bild, das die Bedeutung am eindeutigsten zeigt; -1 = keines */
export async function kiWaehlt(sprache: string, v: Vokabel, kandidaten: MedienKandidat[], lernende?: Lernende, ki: Ki = direkt()): Promise<number> {
  const vorschauen: { i: number; dataUrl: string }[] = []
  for (const [i, k] of kandidaten.slice(0, 6).entries()) {
    const d = await window.api.images.fetch(k.vorschau).catch(() => '')
    if (d) vorschauen.push({ i, dataUrl: await verkleinern(d, 256).catch(() => d) })
  }
  if (!vorschauen.length) return -1
  const antwort = await ki.ai<{ wahl: number; begruendung: string }>({
    system: `Du wählst Beispielbilder für Vokabelkarten. Ein gutes Bild zeigt die Bedeutung eindeutig, ohne Text, kindgerecht und ohne bekannte Marken oder erkennbare Personen im Mittelpunkt. ${bildartHinweis(
      lernende
    )}`,
    user: [
      `Vokabel (${SPRACHE_NAME[sprache] ?? sprache}): „${v.term}" – Deutsch: „${v.translation}"${v.example ? ` – Beispiel: „${v.example}"` : ''}`,
      `Die ${vorschauen.length} Bilder sind von 1 bis ${vorschauen.length} nummeriert (in dieser Reihenfolge).`,
      'Antworte mit der Nummer des Bildes, das die Bedeutung am eindeutigsten zeigt; 0, wenn keines passt (z. B. bei abstrakten Wörtern ohne passendes Bild).'
    ].join('\n'),
    images: vorschauen.map((x) => x.dataUrl),
    schemaName: 'vokabel_bildwahl',
    schema: {
      type: 'object',
      properties: { wahl: { type: 'integer' }, begruendung: { type: 'string' } },
      required: ['wahl', 'begruendung'],
      additionalProperties: false
    }
  })
  const n = Math.round(Number(antwort?.wahl) || 0)
  return n >= 1 && n <= vorschauen.length ? vorschauen[n - 1].i : -1
}

/** Ein Kandidat als Bild der Medienbank (in voller Größe geladen, dann verkleinert) */
export async function kandidatUebernehmen(sprache: string, wort: string, k: MedienKandidat, alle?: MedienKandidat[]): Promise<void> {
  const d = await window.api.images.fetch(k.url).catch(() => window.api.images.fetch(k.vorschau))
  await window.api.medien.bildSetzen(sprache, wort, {
    dataUrl: await verkleinern(d),
    herkunft: 'suche',
    nachweis: nachweisVon(k),
    ...(alle ? { kandidaten: alle } : {})
  })
}

/** Bild von der Bild-KI erzeugen lassen – für jüngere Lernende im Clipart-Stil */
export async function bildErzeugen(sprache: string, v: Vokabel, lernende?: Lernende, ki: Ki = direkt()): Promise<void> {
  const stil = clipartZuerst(lernende)
    ? 'Cheerful cartoon clipart for young learners, bold clean outlines, flat friendly colours'
    : 'Simple, friendly illustration'
  const prompt = `${stil} for a vocabulary flashcard showing "${v.translation || v.term}" (${SPRACHE_NAME[sprache] ?? sprache} word: "${
    v.term
  }"). Clear single subject, plain light background, no text, no letters, no logos.`
  const d = await ki.bild(prompt)
  await window.api.medien.bildSetzen(sprache, v.term, { dataUrl: await verkleinern(d), herkunft: 'ki', nachweis: 'KI-generiert' })
}

/** Aussprache erzeugen – `lage`: weibliche oder männliche Fassung (07.10.2026) */
export async function tonErzeugen(sprache: string, wort: string, art: TonArt, text: string, stimme: string, lage: Stimmlage = 'w'): Promise<void> {
  const id = `vok-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const r = await window.api.audio.speak({ id, turns: [{ voiceId: stimme, text }], languageCode: sprache })
  if (!r?.dataUrl) throw new Error('Die Sprach-KI hat keine Aufnahme geliefert.')
  await window.api.medien.tonSetzen(sprache, wort, art, { dataUrl: r.dataUrl, stimme, text }, lage)
}

let laeuft: HTMLAudioElement | null = null
/** Ton der Medienbank abspielen (Datei oder Adresse) */
export async function abspielen(quelle: { datei?: string; url?: string }): Promise<void> {
  laeuft?.pause()
  const src = quelle.url ?? (quelle.datei ? await window.api.medien.datei(quelle.datei) : null)
  if (!src) throw new Error('Die Aufnahme fehlt.')
  laeuft = new Audio(src)
  await laeuft.play()
}
