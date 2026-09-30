/**
 * Bild für einen Einstiegsimpuls beschaffen (Wunsch der Lehrkraft, 01.10.2026).
 *
 * Reihenfolge wie bei den Arbeitsblattbildern – ein echtes Bild hat Vorrang, Erzeugtes ist der
 * Rückfall:
 * 1. Gezielte Suche nach einem freien Bild (Wikimedia Commons, Openverse-Cliparts) über die
 *    vorhandene Bildsuche; die KI prüft die Funde auf Motiv, Lernzielbezug und Eignung als Impuls.
 * 2. Passt keines: Entwurf per Bild-KI – Auftrag aus Lernziel und Impulsidee, als KI-Bild
 *    gekennzeichnet. Nie automatisch bei einem bestimmten echten Werk (historische Quelle,
 *    Karikatur): ein erzeugtes Bild wäre keine Quelle. Auf ausdrücklichen Wunsch („KI-Bild
 *    entwerfen") entsteht es trotzdem, dann mit dem Hinweis „nachgestellte Darstellung".
 *
 * Ohne Oberfläche prüfbar: Suche, Bild-KI und Umwandlung kommen als Abhängigkeiten herein.
 */
import type { ImageRef } from '../../modules/arbeitsblatt/model/types'
import { chooseImages, gatherCandidates, type AiCall, type ImageCandidate, type ImageNeed, type ImageServices } from '../imageChoice'
import type { Einstiegsimpuls, ImpulsMeta } from './einstiegsimpuls'

export interface ImpulsBildDeps {
  ai: AiCall
  services: ImageServices
  /** Bild-KI (roh, data:-URL), falls eingerichtet */
  generateImage?: (prompt: string) => Promise<string>
  /** Suchvarianten (genau → locker) */
  variants: (query: string) => string[]
  /** Seitenverhältnis eines Bildes (Breite/Höhe) – optional */
  format?: (dataUrl: string) => Promise<number>
}

/**
 * auto  = Suche, sonst KI-Entwurf (die Einstellung „Bildquelle" des Blattes gilt)
 * suche = nur Suche (z. B. „Anderes Bild"), schon gezeigte Bilder ausgeschlossen
 * ki    = nur Entwurf per Bild-KI
 */
export type ImpulsBildModus = 'auto' | 'suche' | 'ki'

export interface ImpulsBildErgebnis {
  image?: ImageRef
  bildFormat?: number
  /** Hinweis für die Lehrkraft */
  hinweis: string
  /** Schon gezeigte Bilder (für „Anderes Bild") */
  gesehen: string[]
  /** Woher das Bild kam */
  weg: 'suche' | 'ki' | 'keins'
}

/** Kennung eines Fundes – damit „Anderes Bild" ihn nicht noch einmal zeigt */
export const kandidatSchluessel = (c: Pick<ImageCandidate, 'title' | 'credit' | 'citation'>): string =>
  `${c.citation?.url ?? ''}|${c.title}|${c.credit}`.toLowerCase()

/** Wonach gesucht wird und was das Bild zeigen muss */
export function impulsBildBedarf(i: Einstiegsimpuls, meta: ImpulsMeta, variants: (q: string) => string[], wunsch = ''): ImageNeed {
  const b = i.bild!
  const suche = [b.suche, b.original ? b.werk : ''].filter(Boolean)
  const queries = [...new Set(suche.flatMap((q) => variants(q)).filter((q) => q.trim().length > 3))]
  return {
    id: 'einstieg',
    subject: [
      b.original ? `Originalquelle: ${b.werk || b.motiv}` : b.motiv,
      `Einstiegsimpuls („${i.titel}") zur Leitfrage „${i.leitfrage}"`,
      meta.learningGoals?.trim() ? `Lernziel: ${meta.learningGoals.trim().split('\n')[0]}` : '',
      wunsch.trim() ? `Wunsch der Lehrkraft: ${wunsch.trim()}` : ''
    ]
      .filter(Boolean)
      .join(' – '),
    queries: queries.length ? queries : [b.motiv],
    // Historische Werke gibt es nur als Foto/Scan; sonst auch Cliparts
    kinds: b.original ? ['photo'] : b.stil === 'karikatur' || b.stil === 'zeichnung' ? ['clipart', 'photo'] : ['photo', 'clipart']
  }
}

/** Prüfregeln für die KI: Wann taugt ein Fund als Einstiegsimpuls? (Recherche, Regel 13) */
export function impulsBildRegeln(meta: ImpulsMeta, i: Einstiegsimpuls): string {
  return [
    `Bildimpuls für den EINSTIEG einer Unterrichtsstunde: ${meta.subjectLabel}, Klasse ${meta.grade}, Thema „${meta.topic}".`,
    `Leitfrage der Stunde: „${i.leitfrage}". Das Bild wird zunächst ohne Kommentar per Beamer gezeigt (stummer Impuls); die Lernenden beschreiben es, deuten es und entwickeln daraus die Leitfrage.`,
    'Geeignet ist ein Bild, das das beschriebene Kernmotiv fachlich richtig zeigt, direkt zur Leitfrage führt, ein klares Hauptmotiv hat, ohne Vorwissen beschreibbar ist und groß projiziert gut erkennbar bleibt. Offene, leicht irritierende Motive, die Fragen auslösen, sind besser als eindeutige Lehrbuchschemata.',
    'Ungeeignet: falsches oder nur ungefähr passendes Motiv, Schock- oder Gewaltbilder, Opferbilder als Effekt, bloßstellende Darstellungen realer Privatpersonen, nicht altersgerechte Inhalte, Wasserzeichen, sehr kleine oder unscharfe Bilder, Bilder, die die Antwort auf die Leitfrage schon zeigen (fertige beschriftete Schemata), viel fremdsprachiger Text (außer bei Fremdsprachen und bei der Beschriftung einer Karikatur).',
    'Einträge mit „Originalquelle": geeignet ist nur das genannte Werk selbst (Urheber, Titel, Jahr) – ein ähnliches anderes Werk ist ungeeignet.',
    '„brauchbar" nur, wenn das Bild den Zweck erfüllt, aber nicht ideal ist.'
  ].join('\n')
}

const STIL: Record<string, string> = {
  foto: 'Realistic documentary photograph style, natural light.',
  zeichnung: 'Clear, friendly illustrated style with clean outlines and calm colours.',
  karikatur:
    'Editorial cartoon style (black ink drawing with light grey shading): exaggeration and symbols make the problem visible, respectful, without insulting real persons.',
  quelle: 'Modern illustration in the look of a period scene – clearly a present-day drawing, not a forged historical document or photograph.'
}

/** Auftrag an die Bild-KI: aus Lernziel und Impulsidee, stilistisch passend (Recherche, Regeln 3, 8, 13) */
export function impulsBildPrompt(i: Einstiegsimpuls, meta: ImpulsMeta, wunsch = ''): string {
  const b = i.bild!
  const ziel = meta.learningGoals?.trim().split('\n')[0]
  return [
    `Image for the opening impulse of a school lesson (${meta.subjectLabel}, grade ${meta.grade}, topic: ${meta.topic}).`,
    ziel ? `Learning goal (German): ${ziel}.` : '',
    `Guiding question the pupils should develop from the image (German): ${i.leitfrage}`,
    `The image shows: ${b.entwurf || b.motiv}.`,
    STIL[b.stil] ?? STIL.foto,
    'The scene is open and slightly puzzling so that pupils first describe it, then interpret it and ask the guiding question – it must not already show the answer.',
    'Age-appropriate: no violence, no gore, no shocking or humiliating content, no real private persons.',
    'Landscape composition (16:9) for a classroom projector, one clear main motif, uncluttered background, high contrast.',
    'Absolutely no text, no letters, no numbers, no speech bubbles with words anywhere in the image.',
    wunsch.trim() ? `Teacher's request (implement exactly): ${wunsch.trim()}` : ''
  ]
    .filter(Boolean)
    .join(' ')
}

/** Die Kennung „KI-generiert" samt Auftrag – der Auftrag bleibt gespeichert (Offenlegung, gezielt neu erzeugen) */
export function kiImpulsBild(dataUrl: string, prompt: string): ImageRef {
  return { dataUrl, source: 'ai', credit: 'KI-generiert (Entwurf der Bild-KI passend zum Lernziel)', aiPrompt: prompt }
}

/**
 * Beschafft das Bild eines Einstiegsimpulses: erst Suche mit KI-Prüfung, sonst Entwurf per Bild-KI.
 * `bildquelle` ist die Einstellung des Blattes (auto, web, ai, placeholder).
 */
export async function beschaffeImpulsBild(
  i: Einstiegsimpuls,
  meta: ImpulsMeta & { imageSource?: string },
  deps: ImpulsBildDeps,
  opts: { modus?: ImpulsBildModus; wunsch?: string } = {}
): Promise<ImpulsBildErgebnis> {
  const modus = opts.modus ?? 'auto'
  const wunsch = opts.wunsch ?? ''
  const gesehen = [...(i.gesehen ?? [])]
  if (!i.bild?.motiv.trim()) return { hinweis: 'Kein Bildimpuls geplant.', gesehen, weg: 'keins' }
  const quelle = meta.imageSource ?? 'auto'
  const original = i.bild.original
  const format = async (d: string): Promise<number | undefined> => (deps.format ? deps.format(d).catch(() => undefined) : undefined)
  let grund = ''

  // 1. Suche (bei „nur KI-Bilder" trotzdem für echte Werke – ein erzeugtes Bild ist keine Quelle)
  const suchen = modus === 'suche' || (modus === 'auto' && (quelle !== 'ai' || original))
  if (suchen) {
    const need = impulsBildBedarf(i, meta, deps.variants, wunsch)
    const alle = await gatherCandidates(need, deps.services, original ? 4 : 3).catch(() => [] as ImageCandidate[])
    const kandidaten = alle.filter((c) => !gesehen.includes(kandidatSchluessel(c)))
    if (kandidaten.length) {
      const wahl = (await chooseImages([{ need, candidates: kandidaten }], impulsBildRegeln(meta, i), deps.ai)).get(need.id)
      grund = wahl?.reason ?? ''
      const c = wahl?.candidate
      const dataUrl = c ? await c.load().catch(() => null) : null
      if (c && dataUrl) {
        gesehen.push(kandidatSchluessel(c))
        const image: ImageRef = { dataUrl, source: c.source === 'ai' ? 'ai' : c.source, credit: c.credit, ...(c.citation ? { citation: c.citation } : {}) }
        const bildFormat = await format(dataUrl)
        return {
          image,
          ...(bildFormat ? { bildFormat } : {}),
          hinweis: `Bild gefunden („${c.title.slice(0, 70)}") und von der KI geprüft${
            wahl!.fit === 'brauchbar' ? `, passt aber nicht ideal (${wahl!.reason})` : ''
          } – bitte kurz ansehen. Quelle und Lizenz beim Zeigen nennen.`,
          gesehen,
          weg: 'suche'
        }
      }
    } else grund = alle.length ? 'keine weiteren Funde' : 'keine freien Bilder gefunden'
    if (modus === 'suche')
      return {
        hinweis: `Kein ${alle.length ? 'weiteres ' : ''}passendes freies Bild gefunden${
          grund ? ` (${grund})` : ''
        }. Über „KI-Bild entwerfen" oder „Eigenes Bild" geht es weiter.`,
        gesehen,
        weg: 'keins'
      }
  }

  // 2. Entwurf per Bild-KI – automatisch nie für ein echtes Werk, nie bei „nur freie Bilder"/„Platzhalter"
  const kiErlaubt = modus === 'ki' || (!original && (quelle === 'auto' || quelle === 'ai'))
  if (!kiErlaubt) {
    return {
      hinweis: original
        ? `Die Quelle „${i.bild.werk || i.bild.suche}" wurde nicht sicher gefunden${
            grund ? ` (${grund})` : ''
          }. Ein KI-Bild wäre keine historische Quelle – bitte über „Eigenes Bild" das Original einfügen oder „Anderes Bild" versuchen.`
        : `Kein passendes freies Bild gefunden${grund ? ` (${grund})` : ''}.`,
      gesehen,
      weg: 'keins'
    }
  }
  if (!deps.generateImage)
    return {
      hinweis: `Kein passendes freies Bild gefunden${
        grund ? ` (${grund})` : ''
      }, und es ist keine Bild-KI eingerichtet (Einstellungen). Über „Eigenes Bild" lässt sich eines einfügen.`,
      gesehen,
      weg: 'keins'
    }
  const prompt = impulsBildPrompt(i, meta, wunsch)
  const roh = await deps.generateImage(prompt)
  const dataUrl = await deps.services.normalize(roh, 1600, 'jpeg').catch(() => roh)
  const bildFormat = await format(dataUrl)
  return {
    image: kiImpulsBild(dataUrl, prompt),
    ...(bildFormat ? { bildFormat } : {}),
    hinweis: [
      'KI-Entwurf passend zum Lernziel – kein reales Foto; beim Zeigen als KI-Bild kennzeichnen und fachlich prüfen.',
      original ? 'Achtung: nachgestellte Darstellung, keine historische Quelle.' : '',
      grund && modus === 'auto' ? `(Kein passendes freies Bild: ${grund})` : ''
    ]
      .filter(Boolean)
      .join(' '),
    gesehen,
    weg: 'ki'
  }
}
