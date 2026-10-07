/**
 * Stimmen von ElevenLabs ordnen und filtern.
 *
 * HERKUNFT: Die Schnittstelle unterscheidet vier Kategorien (premade, cloned, professional,
 * generated). Für die Lehrkraft sind das Fachbegriffe ohne Aussage – und sie führen sogar in
 * die Irre, weil eine übernommene Bibliotheksstimme ebenfalls „cloned" oder „professional"
 * heißt, obwohl sie niemandem im Haus gehört. Hier zählen deshalb drei Gruppen, die einen
 * Unterschied im Alltag machen:
 *   Standardstimmen – immer da, in jedem Tarif nutzbar
 *   Eigene Stimmen  – selbst aufgenommen oder entworfen
 *   Bibliothek      – von anderen geteilt; im kostenlosen Tarif gesperrt
 *
 * SPRACHE: Das Modell eleven_multilingual_v2 spricht 29 Sprachen und erkennt die Sprache am
 * Text. Die Angabe an einer Stimme beschreibt also ihren AKZENT. Eine deutsche oder
 * Hindi-Stimme für ein englisches Blatt ist trotzdem unpassend – sie klingt falsch. Gefiltert
 * wird deshalb nach Akzent, aber nur, wo eine Angabe vorliegt: Stimmen ganz ohne Angabe
 * bleiben sichtbar, weil sich über sie nichts sagen lässt.
 */
import type { TtsVoice } from '@shared/types'

export type Herkunft = 'standard' | 'eigene' | 'bibliothek'

export const HERKUNFT: Record<Herkunft, { label: string; hilfe: string }> = {
  standard: { label: 'Standardstimmen', hilfe: 'Von ElevenLabs mitgeliefert – in jedem Tarif nutzbar.' },
  eigene: { label: 'Eigene Stimmen', hilfe: 'Selbst aufgenommen oder im Stimmen-Baukasten entworfen.' },
  bibliothek: { label: 'Aus der Bibliothek', hilfe: 'Von anderen geteilte Stimmen – im kostenlosen Tarif gesperrt.' }
}

/** Gruppe, in die eine Stimme gehört. */
export function herkunftVon(v: TtsVoice): Herkunft {
  if (v.fromLibrary) return 'bibliothek'
  if (v.isOwner || (v.category && v.category !== 'premade')) return 'eigene'
  return 'standard'
}

/** Beschriftung einer Stimme in der Auswahl. */
export const stimmenName = (v: TtsVoice): string => [v.name, v.language, v.gender, HERKUNFT[herkunftVon(v)].label].filter(Boolean).join(' · ')

/** Nur Gruppen, die es wirklich gibt – ein Filter mit leeren Schubladen verwirrt. */
export const vorhandeneHerkunft = (voices: TtsVoice[]): Herkunft[] =>
  (['standard', 'eigene', 'bibliothek'] as Herkunft[]).filter((h) => voices.some((v) => herkunftVon(v) === h))

/**
 * Wörter, an denen sich der Akzent einer Stimme erkennen lässt.
 *
 * Das Sprachkürzel wird getrennt geprüft und gilt nur als GANZES Wort: Als Teilzeichenfolge
 * steckt „en" in „french" und „it" in „british" – eine französische Stimme wäre damit als
 * englisch durchgegangen.
 */
const AKZENT: Record<string, string[]> = {
  en: ['english', 'american', 'british', 'australian', 'irish', 'scottish', 'canadian'],
  fr: ['french', 'français'],
  es: ['spanish', 'español', 'castilian', 'mexican'],
  it: ['italian', 'italiano'],
  de: ['german', 'deutsch', 'austrian', 'swiss'],
  nl: ['dutch', 'nederlands', 'flemish'],
  pl: ['polish', 'polski'],
  ru: ['russian'],
  tr: ['turkish']
}

/**
 * Passt die Stimme zur Sprache des Fachs?
 *
 * Eine Stimme OHNE Sprachangabe gilt als passend – über sie lässt sich nichts sagen, und sie
 * zu verbergen hieße, eigene Stimmen zu verstecken. Eine Stimme MIT Angabe muss passen;
 * genau daran scheiterte es vorher: Deutsche und Hindi-Stimmen blieben auf einem englischen
 * Blatt stehen, weil eigene Herkunft den Filter aushebelte.
 */
export function passtZurSprache(v: TtsVoice, language: string | undefined): boolean {
  if (!language) return true
  const feld = `${v.language} ${v.description}`.toLowerCase().trim()
  if (!feld) return true
  const woerter = feld.split(/[^a-zäöüß]+/).filter(Boolean)
  if (woerter.includes(language)) return true
  return (AKZENT[language] ?? []).some((w) => feld.includes(w))
}

/**
 * Akzent einer Stimme, wie ihn ElevenLabs im Feld `labels.accent` bzw. `labels.language`
 * hinterlegt („american", „british", „australian" …).
 *
 * Leer, wenn nichts hinterlegt ist – solche Stimmen bleiben von der Akzentwahl unberührt,
 * sonst verschwänden gerade die eigenen Stimmen, die nie eine Angabe tragen.
 */
export const akzentVon = (v: TtsVoice): string => (v.language ?? '').trim().toLowerCase()

/** Deutsche Bezeichnung eines Akzents, soweit bekannt – sonst die Angabe selbst. */
const AKZENT_NAME: Record<string, string> = {
  american: 'Amerikanisches Englisch',
  british: 'Britisches Englisch',
  australian: 'Australisches Englisch',
  irish: 'Irisches Englisch',
  scottish: 'Schottisches Englisch',
  canadian: 'Kanadisches Englisch',
  transatlantic: 'Transatlantisches Englisch',
  french: 'Französisch',
  german: 'Deutsch',
  spanish: 'Spanisch',
  italian: 'Italienisch',
  swedish: 'Schwedisch',
  hindi: 'Hindi'
}

export const akzentName = (akzent: string): string => AKZENT_NAME[akzent] ?? akzent.charAt(0).toUpperCase() + akzent.slice(1)

/**
 * Die Akzente, die es unter den angebotenen Stimmen WIRKLICH gibt.
 *
 * Eine Auswahl, die „Australisches Englisch" anbietet, obwohl keine solche Stimme nutzbar
 * ist, führt in eine leere Liste – und sieht aus wie ein Fehler.
 */
export const vorhandeneAkzente = (voices: TtsVoice[]): string[] => [...new Set(voices.map(akzentVon).filter(Boolean))].sort()

/** Ab so vielen Treffern lohnt der Sprachfilter; darunter werden alle Stimmen gezeigt. */
export const GENUG_STIMMEN = 3

/** Die anzuzeigenden Stimmen nach Nutzbarkeit, Sprache und Herkunft. */
export function sichtbareStimmen(
  voices: TtsVoice[],
  opts: { language?: string; sprachfilter: boolean; herkunft: Herkunft[]; akzente?: string[]; auchGesperrte?: boolean }
): { nutzbar: TtsVoice[]; gesperrt: TtsVoice[]; nachSprache: TtsVoice[]; sichtbar: TtsVoice[]; sprachfilterGriff: boolean } {
  // Gesperrte Stimmen gehören gar nicht erst zur Auswahl – sie scheitern erst beim Vertonen
  const gesperrt = voices.filter((v) => v.usable === false)
  const nutzbar = opts.auchGesperrte ? voices : voices.filter((v) => v.usable !== false)
  const passende = opts.sprachfilter ? nutzbar.filter((v) => passtZurSprache(v, opts.language)) : nutzbar
  const sprachfilterGriff = opts.sprachfilter && passende.length >= GENUG_STIMMEN
  const nachSprache = sprachfilterGriff ? passende : nutzbar
  const nachHerkunft = opts.herkunft.length ? nachSprache.filter((v) => opts.herkunft.includes(herkunftVon(v))) : nachSprache
  // Stimmen ohne Akzentangabe bleiben dabei – über sie sagt die Wahl nichts aus
  const sichtbar = opts.akzente?.length ? nachHerkunft.filter((v) => !akzentVon(v) || opts.akzente!.includes(akzentVon(v))) : nachHerkunft
  return { nutzbar, gesperrt, nachSprache, sichtbar, sprachfilterGriff }
}

/**
 * Eignung einer Stimme für eine Sprache (Aussprache der Vokabeln, 07.10.2026):
 * „geprueft" = von ElevenLabs für die Sprache geprüft oder mit passendem Akzent/Sprachetikett,
 * „mehrsprachig" = spricht mit dem mehrsprachigen Modell auch diese Sprache, „ohne" = eigene Stimme ohne Angabe,
 * null = passt nicht (z. B. eine rein englische Stimme für Französisch).
 */
export function stimmeEignung(v: TtsVoice, sprache: string): 'geprueft' | 'mehrsprachig' | 'ohne' | null {
  if (v.languages?.includes(sprache)) return 'geprueft'
  const feld = `${v.language} ${v.description}`.toLowerCase().trim()
  const woerter = feld.split(/[^a-zäöüß]+/).filter(Boolean)
  if (woerter.includes(sprache) || (AKZENT[sprache] ?? []).some((w) => feld.includes(w))) return 'geprueft'
  if (v.multilingual) return 'mehrsprachig'
  if (!feld && !v.languages?.length) return 'ohne'
  return null
}

/** Passt das Geschlecht der Stimme zur Fassung? Stimmen ohne Angabe (oder neutral) passen zu beiden */
export function passtZurLage(v: TtsVoice, lage: 'w' | 'm'): boolean {
  const g = (v.gender ?? '').toLowerCase()
  if (g === 'female' || g === 'weiblich') return lage === 'w'
  if (g === 'male' || g === 'männlich') return lage === 'm'
  return true
}
