/**
 * Passt eine gefundene Quelle zum Unterricht? – Relevanzprüfung VOR dem Vorschlag (01.10.2026).
 *
 * Anlass, gemeldet von der Lehrkraft: Zum Thema „German Macbeth Adaptations" (Englisch, Sek II,
 * Sprachmittlung) schlug die Klassenarbeit wiederholt vor:
 *
 * - „Die Musikforschung" (Wikisource) – das Inhaltsverzeichnis einer Musikzeitschrift über
 *   67 Jahrgänge, rund 27.000 Wörter. „Macbeth" kommt darin genau EINMAL vor, im Titel eines
 *   Aufsatzes über Verdis Oper.
 * - „Friedrich Gundolf" (Wikisource) – eine Autorenseite, also die Werkliste eines
 *   Literaturwissenschaftlers. „Macbeth" steht zweimal darin, als Bandinhalt seiner
 *   Shakespeare-Übersetzung.
 *
 * Beide bestanden jede bisherige Prüfung: Die Qualitätsmessung (textQualitaet.ts) misst nur die
 * FORM – Länge, Stoppwörter, Satzenden –, und die Volltextsuche des Archivs findet jede Seite,
 * auf der die Suchwörter irgendwo stehen. Ob die Seite VOM Thema handelt, prüfte niemand, bevor
 * die Lehrkraft die Liste sah. Die KI sah die Texte erst NACH der Auswahl der Lehrkraft.
 *
 * Diese Prüfung hat zwei Stufen:
 *
 * 1. Feste Regeln (ohne KI, nachvollziehbar, testbar): Sprache des Textes, Seitenart
 *    (Autoren-, Zeitschriften-, Lexikonseite), Kernbegriffe des Themas im Text.
 * 2. Die KI bewertet jeden verbliebenen Fund nach Fach, Sprache, Thema, Lernziel und Jahrgang,
 *    ordnet die Textart ein (Primärquelle, Sachtext, Sekundärartikel …) und begründet in einem
 *    Satz. Unter der Schwelle wird NICHT vorgeschlagen – die Begründung steht in der Liste.
 *
 * Gemeinsam für alle Programme mit Quellensuche (Arbeitsblatt, Klassenarbeit; Lernzielkontrolle
 * und Tafelbilder suchen keine Textquellen). Gilt die Regel nur an einer Stelle, kommt der Fehler
 * über die andere wieder herein.
 */
import { istAbbruch } from '@shared/abbruch'
import { STOPPWOERTER } from '@shared/stoppwoerter'
import { SPRACHNAMEN } from '@shared/faecher'
import type { Quellentreffer, StructuredRequest } from '@shared/types'
import { arr, enumOf, int, obj, str } from './aiSchema'

export type AiRuf = <T>(req: StructuredRequest) => Promise<T>

export const QUELLENARTEN = ['primaerquelle', 'sachtext', 'sekundaertext', 'lexikonartikel', 'personenartikel', 'verzeichnis', 'themenfremd'] as const
export type Quellenart = (typeof QUELLENARTEN)[number]

export const QUELLENART_TEXT: Record<Quellenart, string> = {
  primaerquelle: 'Primärquelle',
  sachtext: 'Sach- bzw. Gebrauchstext',
  sekundaertext: 'Sekundärtext (über eine Quelle)',
  lexikonartikel: 'Lexikonartikel',
  personenartikel: 'Personenartikel',
  verzeichnis: 'Verzeichnis bzw. Werkliste',
  themenfremd: 'themenfremd'
}

/**
 * Mindestpunktzahl (0–10) der KI-Bewertung für einen Vorschlag.
 *
 * 7 heißt: „handelt erkennbar vom Thema und taugt als Material". Bei 5–6 handelt der Text nur
 * am Rand davon – genau die Fälle, die die Lehrkraft als „absurd" gemeldet hat. Eine harte
 * Schwelle statt einer bloßen Sortierung: Ein schlechter Fund weit unten in der Liste wird
 * trotzdem gezeigt, und die Lehrkraft muss ihn trotzdem lesen.
 */
export const RELEVANZ_SCHWELLE = 7

export interface RelevanzKontext {
  thema: string
  fach: string
  jahrgang: number
  /** geforderte Sprache des Textes (zweibuchstabig) */
  sprache: string
  lernziel?: string
  /**
   * Begriffe, ohne die ein Text nicht vom Thema handeln kann („Macbeth"), in der Sprache der
   * Quelle und ggf. zusätzlich im Wortlaut des Themas. Kommt aus der Suchbegriffsbildung der KI.
   */
  kernbegriffe?: string[]
  /** Sprachmittlung: der Ausgangstext ist absichtlich deutsch, auch im Fremdsprachenunterricht */
  mediation?: boolean
  /** Klausur – strengere Begründungspflicht */
  pruefung?: boolean
}

export interface RelevanzBefund {
  ok: boolean
  /** 0–10 aus der KI-Bewertung (fehlt ohne KI) */
  punkte?: number
  art?: Quellenart
  /** erkannte Sprache des Textes */
  sprache?: string
  /** kurze Begründung für die Lehrkraft */
  begruendung: string
  /** Ausschlussgründe (leer, wenn ok) */
  gruende: string[]
  kiGeprueft: boolean
}

const sprachname = (code: string): string => SPRACHNAMEN[code] ?? code

// ---------- Stufe 1: feste Regeln ----------

/**
 * Sprache eines Textes über die Stoppwortdichte je Sprache.
 *
 * Keine Bibliothek nötig: Stoppwörter sind das stabilste Sprachmerkmal überhaupt, und die
 * Listen liegen schon für die Fließtext-Erkennung bereit. Geprüft werden die ersten 4000
 * Zeichen – das reicht und hält Register mit Fremdwörtern am Ende aus der Wertung.
 * `sicher` nur bei klarem Abstand zur zweitbesten Sprache: Ein zweisprachiger Text soll nicht
 * wegen einer Fehlerkennung herausfallen.
 */
export function erkenneSprache(text: string): { sprache: string; anteil: number; sicher: boolean } {
  const woerter = (
    text
      .slice(0, 4000)
      .toLowerCase()
      .match(/[\p{L}]+/gu) ?? []
  ).filter((w) => w.length > 0)
  if (woerter.length < 30) return { sprache: '', anteil: 0, sicher: false }
  const werte = Object.entries(STOPPWOERTER)
    .map(([sprache, liste]) => {
      const satz = new Set(liste)
      return { sprache, anteil: woerter.filter((w) => satz.has(w)).length / woerter.length }
    })
    .sort((a, b) => b.anteil - a.anteil)
  const [erste, zweite] = werte
  const sicher = erste.anteil >= 0.08 && erste.anteil >= (zweite?.anteil ?? 0) * 1.8
  return { sprache: erste.anteil > 0 ? erste.sprache : '', anteil: erste.anteil, sicher }
}

/** Wikisource-Kategorien, die nie einen Quellentext bezeichnen, sondern eine Liste */
const KATEGORIE_PERSON = /^(Kategorie|Category):(Autoren|Autorinnen|Authors?|Personen|Übersetzer|Herausgeber)\b/i
const KATEGORIE_VERZEICHNIS =
  /^(Kategorie|Category):(Thema\b|Themen\b|Portal\b|Zeitschrift|Zeitung|Periodikum|Periodicals?|Kalender|Register|Begriffsklärung|Disambiguation|Werkliste|Bibliographie|Sammlung)/i

/**
 * Seitenart nach festen Merkmalen – nur, wenn sie eindeutig ist; sonst entscheidet die KI.
 */
export function seitenartNachMerkmalen(treffer: Pick<Quellentreffer, 'titel' | 'url' | 'herkunft' | 'kategorien'>, text: string): Quellenart | undefined {
  const kategorien = treffer.kategorien ?? []
  if (kategorien.some((k) => KATEGORIE_PERSON.test(k))) return 'personenartikel'
  if (kategorien.some((k) => KATEGORIE_VERZEICHNIS.test(k))) return 'verzeichnis'
  let host = ''
  try {
    host = new URL(treffer.url).hostname
  } catch {
    // ungültige Adresse – dann entscheidet der Text
  }
  const anfang = text.slice(0, 600)
  // Lebensdaten am Anfang: „Friedrich Gundolf (* 20. Juni 1880 in Darmstadt; † 12. Juli 1931 …)"
  const lebensdaten = /\(\s*\*\s*\d{1,2}\.?\s*\p{L}*\.?\s*\d{3,4}|\(\s*\d{3,4}\s*[–-]\s*\d{3,4}\s*\)|\bborn\s+\d{1,2}\s+\p{L}+\s+\d{4}|\(\s*born\b/iu.test(
    anfang
  )
  if (/(^|\.)wikipedia\.org$/.test(host)) return lebensdaten ? 'personenartikel' : 'lexikonartikel'
  // Autorenseite eines Archivs: Werkliste ohne Fließtext
  if (/^\s*(==\s*)?(Werke|Works|Schriften)\b/m.test(text.slice(0, 300)) && /\b(GND|Normdaten|Sekundärliteratur|Werke)\b/.test(text)) return 'personenartikel'
  return undefined
}

/** Wörter eines Begriffs, die im Text gesucht werden (Groß-/Kleinschreibung egal, ganze Wörter) */
function zaehle(text: string, begriff: string): number {
  const b = begriff.trim()
  if (b.length < 3) return 0
  const muster = new RegExp(`(?<![\\p{L}\\p{N}])${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}`, 'giu')
  return (text.match(muster) ?? []).length
}

export interface KernbegriffBefund {
  begriff: string
  anzahl: number
  imTitel: boolean
}

export function kernbegriffe(text: string, titel: string, begriffe: string[]): KernbegriffBefund[] {
  return begriffe
    .map((b) => b.trim())
    .filter((b) => b.length >= 3)
    .map((begriff) => ({ begriff, anzahl: zaehle(text, begriff), imTitel: zaehle(titel, begriff) > 0 }))
}

/**
 * Feste Ausschlussgründe – ohne KI, deshalb auch dann wirksam, wenn die KI-Prüfung ausfällt.
 *
 * Bewusst nur Fälle, die sich sicher erkennen lassen. Alles Weitere entscheidet die KI mit
 * Begründung; eine Regel, die gute Funde stillschweigend wegwirft, wäre schlimmer als keine.
 */
export function festeRegeln(
  treffer: Pick<Quellentreffer, 'titel' | 'url' | 'herkunft' | 'kategorien'>,
  text: string,
  kontext: RelevanzKontext
): { gruende: string[]; art?: Quellenart; sprache?: string } {
  const gruende: string[] = []

  // Sprache: Fremdsprachenfach → Zielsprache; Sprachmittlung und übrige Fächer → die geforderte (meist Deutsch)
  const erkannt = erkenneSprache(text)
  if (erkannt.sicher && kontext.sprache && erkannt.sprache !== kontext.sprache) {
    gruende.push(
      `Sprache: ${sprachname(erkannt.sprache)} statt ${sprachname(kontext.sprache)}${
        kontext.mediation ? ' (Sprachmittlung braucht einen deutschen Ausgangstext)' : ''
      }`
    )
  }

  // Seitenart
  const art = seitenartNachMerkmalen(treffer, text)
  if (art === 'verzeichnis') gruende.push('Verzeichnis bzw. Inhaltsübersicht (Zeitschrift, Register), kein Text zum Thema')
  // Eine Autorenseite des Archivs ist auch zur eigenen Person nur eine Werkliste
  if (art === 'personenartikel' && treffer.herkunft === 'wikisource') gruende.push(`Autorenseite „${treffer.titel}": Werkliste, kein Quellentext`)
  else if (art === 'personenartikel' && !personImThema(treffer.titel, kontext.thema)) {
    gruende.push(`Personenartikel zu „${treffer.titel}" – die Person ist nicht Gegenstand des Themas`)
  }

  // Kernbegriffe: Ein Text, der das Thema nur beiläufig nennt, handelt nicht davon
  const begriffe = kontext.kernbegriffe?.filter((b) => b.trim().length >= 3) ?? []
  if (begriffe.length) {
    const befund = kernbegriffe(text, treffer.titel, begriffe)
    const bester = befund.reduce((a, b) => (b.anzahl > a.anzahl ? b : a), befund[0])
    const woerter = (text.match(/[\p{L}\p{N}]+/gu) ?? []).length
    const imTitel = befund.some((b) => b.imTitel)
    if (!imTitel && bester.anzahl === 0) gruende.push(`Das Thema kommt im Text nicht vor (gesucht: ${begriffe.slice(0, 3).join(', ')})`)
    // Einmal in mehr als 1500 Wörtern – das ist eine Erwähnung, kein Gegenstand
    else if (!imTitel && bester.anzahl === 1 && woerter > 1500)
      gruende.push(`Das Thema wird nur beiläufig erwähnt („${bester.begriff}" einmal in ${woerter.toLocaleString('de-DE')} Wörtern)`)
  }

  return { gruende, art, sprache: erkannt.sicher ? erkannt.sprache : undefined }
}

/** Steht der Name aus dem Seitentitel im Thema? („Friedrich Gundolf" ↔ „German Macbeth Adaptations": nein) */
export function personImThema(titel: string, thema: string): boolean {
  const namen = titel
    .split(/[\s,()/]+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 4)
  const t = thema.toLowerCase()
  return namen.some((n) => t.includes(n))
}

// ---------- Stufe 2: KI-Bewertung ----------

const RELEVANZ_SCHEMA = obj({
  bewertungen: arr(
    obj({
      nummer: int('Nummer des Textes aus der Liste'),
      passung: int('0 bis 10: Wie gut taugt der Text als Material zu Thema, Fach, Lernziel und Jahrgang? 10 = handelt genau davon'),
      sprache: str('Sprache des Textes als zweibuchstabiger Code (de, en, fr …)'),
      art: enumOf([...QUELLENARTEN]),
      begruendung: str('Ein kurzer Satz für die Lehrkraft: warum passend oder nicht')
    }),
    'Eine Bewertung je Text, in der Reihenfolge der Liste'
  )
})

export interface RelevanzKandidat {
  treffer: Quellentreffer
  text: string
}

/** Wie viel Text die KI je Fund sieht – genug für Gegenstand und Textart, ohne das Kontingent zu sprengen */
const AUSZUG_ZEICHEN = 1800

export function relevanzAuftrag(kandidaten: RelevanzKandidat[], kontext: RelevanzKontext): StructuredRequest {
  const liste = kandidaten
    .map((k, i) => {
      const anfang = k.text.slice(0, AUSZUG_ZEICHEN)
      return [
        `--- Text ${i} ---`,
        `Titel: ${k.treffer.titel}${k.treffer.urheber ? ` · Urheber: ${k.treffer.urheber}` : ''}`,
        `Fundort: ${k.treffer.url}`,
        k.treffer.kategorien?.length ? `Kategorien im Archiv: ${k.treffer.kategorien.slice(0, 6).join(', ')}` : '',
        `Anfang des Textes:\n${anfang}${k.text.length > anfang.length ? ' […]' : ''}`
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')
  return {
    system:
      'Du prüfst gefundene Texte streng darauf, ob sie als Unterrichtsmaterial zum angegebenen Thema taugen. Ein Text, in dem die Suchwörter nur vorkommen, handelt deshalb noch nicht vom Thema. Du antwortest nur im verlangten JSON-Format.',
    user: [
      `Fach: ${kontext.fach}. Jahrgang: ${kontext.jahrgang}. Thema: ${kontext.thema}.`,
      kontext.lernziel?.trim() ? `Lernziel: ${kontext.lernziel.trim()}` : '',
      `Geforderte Sprache des Textes: ${sprachname(kontext.sprache)}${
        kontext.mediation ? ' (Sprachmittlung: Der Ausgangstext ist absichtlich deutsch, die Lernenden geben ihn in der Fremdsprache wieder).' : '.'
      }`,
      kontext.pruefung ? 'Der Text ist für eine Klausur der Oberstufe bestimmt.' : '',
      'BEWERTE JEDEN TEXT:',
      '- passung 9–10: handelt genau vom Thema und taugt unmittelbar als Material für diesen Jahrgang.',
      '- passung 7–8: handelt erkennbar vom Thema; brauchbar.',
      '- passung 4–6: berührt das Thema nur am Rand oder nur ein Nebenaspekt.',
      '- passung 0–3: handelt von etwas anderem; die Suchwörter stehen nur zufällig darin.',
      'TEXTART:',
      '- primaerquelle: das Werk, die Rede, der Brief, das Dokument selbst.',
      '- sachtext: Zeitungsartikel, Kommentar, Bericht, Essay, Informationstext ZUM Thema.',
      '- sekundaertext: Analyse, Interpretation, Rezension oder Unterrichtsvorbereitung über ein Werk.',
      '- lexikonartikel / personenartikel: Nachschlage- oder Biografieartikel. Nur passend, wenn genau dieser Begriff bzw. diese Person Gegenstand des Themas ist.',
      '- verzeichnis: Inhaltsverzeichnis, Register, Werkliste, Bibliografie, Zeitschriftenübersicht – nie Material.',
      '- themenfremd: handelt nicht vom Thema.',
      'SPRACHE: Ein Text in einer anderen als der geforderten Sprache ist ungeeignet (passung höchstens 3).',
      'Achte auf Fehltreffer durch gleichlautende Namen: Eine Oper, ein Film oder ein Musikaufsatz mit gleichem Titel ist ein anderes Thema als das Drama.',
      liste
    ]
      .filter(Boolean)
      .join('\n\n'),
    schemaName: 'material_relevanz',
    schema: RELEVANZ_SCHEMA
  }
}

interface KiBewertung {
  nummer: number
  passung: number
  sprache?: string
  art?: string
  begruendung?: string
}

/** Höchstens so viele Funde je KI-Anfrage */
const JE_ANFRAGE = 8

/**
 * Prüft alle Funde: feste Regeln, dann die KI.
 *
 * Fällt die KI aus oder antwortet unbrauchbar, bleiben die festen Regeln – der Fund wird dann
 * als „ohne KI-Prüfung" gekennzeichnet statt stillschweigend durchgewunken.
 */
export async function pruefeRelevanz(kandidaten: RelevanzKandidat[], kontext: RelevanzKontext, ai?: AiRuf): Promise<RelevanzBefund[]> {
  const befunde: RelevanzBefund[] = kandidaten.map((k) => {
    const fest = festeRegeln(k.treffer, k.text, kontext)
    return {
      ok: fest.gruende.length === 0,
      art: fest.art,
      sprache: fest.sprache,
      gruende: fest.gruende,
      begruendung: fest.gruende[0] ?? '',
      kiGeprueft: false
    }
  })
  if (!ai) return befunde
  const offen = kandidaten.map((k, i) => ({ k, i })).filter(({ i }) => befunde[i].ok)
  for (let start = 0; start < offen.length; start += JE_ANFRAGE) {
    const gruppe = offen.slice(start, start + JE_ANFRAGE)
    let antwort: { bewertungen?: KiBewertung[] } | null = null
    try {
      antwort = await ai<{ bewertungen?: KiBewertung[] }>(
        relevanzAuftrag(
          gruppe.map(({ k }) => k),
          kontext
        )
      )
    } catch (e) {
      // Abbruch durch die Lehrkraft muss durch – bei allem anderen bleiben die festen Regeln
      if (istAbbruch(e)) throw e
      antwort = null
    }
    const liste = Array.isArray(antwort?.bewertungen) ? antwort!.bewertungen : []
    gruppe.forEach(({ i }, nr) => {
      const b = liste.find((x) => Number(x?.nummer) === nr)
      if (!b || !Number.isFinite(Number(b.passung))) {
        befunde[i] = { ...befunde[i], begruendung: 'ohne KI-Prüfung (keine Bewertung erhalten)' }
        return
      }
      befunde[i] = kiEinarbeiten(befunde[i], b, kandidaten[i].treffer, kontext)
    })
  }
  return befunde
}

/** Die KI-Bewertung mit harter Schwelle in den Befund übernehmen */
export function kiEinarbeiten(befund: RelevanzBefund, b: KiBewertung, treffer: Quellentreffer, kontext: RelevanzKontext): RelevanzBefund {
  const punkte = Math.max(0, Math.min(10, Math.round(Number(b.passung))))
  const art = (QUELLENARTEN as readonly string[]).includes(String(b.art)) ? (b.art as Quellenart) : befund.art
  const sprache = typeof b.sprache === 'string' && /^[a-z]{2,3}$/i.test(b.sprache.trim()) ? b.sprache.trim().toLowerCase() : befund.sprache
  const begruendung = String(b.begruendung ?? '').trim()
  const gruende: string[] = []
  if (punkte < RELEVANZ_SCHWELLE) gruende.push(`passt nicht genug zum Thema (${punkte}/10)${begruendung ? `: ${begruendung}` : ''}`)
  if (art === 'verzeichnis' || art === 'themenfremd') gruende.push(`${QUELLENART_TEXT[art]}${begruendung && !gruende.length ? `: ${begruendung}` : ''}`)
  if ((art === 'personenartikel' || art === 'lexikonartikel') && !personImThema(treffer.titel, kontext.thema)) {
    gruende.push(`${QUELLENART_TEXT[art]} zu „${treffer.titel}" – nicht Gegenstand des Themas`)
  }
  if (sprache && kontext.sprache && sprache !== kontext.sprache && !(befund.sprache === kontext.sprache)) {
    gruende.push(`Sprache: ${sprachname(sprache)} statt ${sprachname(kontext.sprache)}`)
  }
  return {
    ok: gruende.length === 0,
    punkte,
    art,
    sprache,
    begruendung: begruendung || (gruende[0] ?? ''),
    gruende,
    kiGeprueft: true
  }
}

/** Kurzfassung für die Trefferliste: „Sachtext · 8/10 · Begründung" */
export function relevanzText(b: RelevanzBefund): string {
  const teile = [
    b.art ? QUELLENART_TEXT[b.art] : '',
    b.punkte !== undefined ? `Passung ${b.punkte}/10` : '',
    b.begruendung || (b.kiGeprueft ? '' : 'ohne KI-Prüfung')
  ]
  return teile.filter(Boolean).join(' · ')
}
