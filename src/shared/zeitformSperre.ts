/**
 * Zeitform-Sperre der Grammatik-Aufgaben (09.10.2026, Befund der Lehrkraft): Zu „There is / There are" in Klasse 5
 * schrieb die KI auch Aufgaben mit „There was / There were" – das simple past kennt die Lerngruppe noch nicht.
 *
 * Zwei Teile:
 *  1. `sperreFuer` ermittelt aus der bekannten Grammatik (Lehrwerk-Stand, Freigegebenes, Thema) die Zeitformen, die
 *     NICHT vorkommen dürfen – ohne Angaben aus dem Jahrgang (Bände der Vorjahre). `sperrRegel` macht daraus die
 *     strikte Regel für die KI.
 *  2. `ohneGesperrteZeitformen` prüft danach jede Aufgabe deterministisch (englische Faustregeln: was/were/did und
 *     Vergangenheitsformen, will/going to, have/has + Partizip, had + Partizip, would, Passiv) und streicht Treffer.
 * Seit 09.10.2026 (Nachtrag der Lehrkraft) für alle Fremdsprachen mit Daten im Grammatikkatalog: Französisch, Spanisch,
 * Italienisch, Latein, Russisch, Niederländisch, Portugiesisch (shared/zeitformSprachen.ts). Englisch steht hier.
 */
import { bekannteGrammatik, istOptional, LEHRWERK_GRAMMATIK } from '../renderer/src/shared/lehrwerkGrammatik'
import { BASIS, bekanntLatein, lateinLehrwerk, ZEITFORMEN_SPRACHEN } from './zeitformSprachen'

export interface SperrbareZeitform {
  /** Sprache (fehlt = Englisch) */
  sprache?: string
  id: string
  name: string
  /** Katalogthemen, mit denen die Zeitform als bekannt gilt */
  themen: string[]
  /** Name der Zeitform in Anweisung, Vorgabe oder Erklärung (deutsch oder englisch) */
  titel: RegExp
  /** Treffer im Text der Zielsprache (Satz, Lösungen) – Kleinschreibung, Apostroph vereinheitlicht (Latein ohne Längen) */
  erkenne: (text: string, roh: string) => boolean
  /** Latein: Wert einer Lesart beim Bestimmen („Perf.", „Plusqpf.") */
  lesart?: RegExp
}

/** Immer erlaubt (Englisch, ab Klasse 5) */
export const BASIS_EN = ['simple present', 'present progressive', 'Imperativ', 'can / can’t', 'to be und have got', 'there is / there are']

// Unregelmäßige Formen ohne Doppeldeutigkeit (nicht: got – „have got" ist Gegenwart; left, lost, read – Adjektiv/Gegenwart)
const PAST_UNREG = [
  'went', 'saw', 'came', 'took', 'gave', 'ate', 'drank', 'ran', 'swam', 'wrote', 'bought', 'brought', 'thought', 'knew', 'met', 'sat',
  'stood', 'began', 'sang', 'slept', 'spent', 'won', 'flew', 'drove', 'rode', 'broke', 'chose', 'forgot', 'heard', 'sold', 'taught',
  'caught', 'fell', 'told', 'said', 'found', 'made', 'became', 'built', 'woke', 'wore', 'threw', 'grew', 'drew', 'spoke', 'stole',
  'understood', 'felt', 'kept', 'paid', 'sent', 'had', 'did', 'was', 'were'
]
const PP_UNREG = [
  'been', 'done', 'gone', 'seen', 'eaten', 'written', 'taken', 'given', 'known', 'flown', 'driven', 'ridden', 'broken', 'chosen', 'forgotten',
  'spoken', 'stolen', 'worn', 'thrown', 'grown', 'drawn', 'fallen', 'begun', 'sung', 'swum', 'drunk', 'won', 'had', 'made', 'bought',
  'brought', 'thought', 'met', 'slept', 'spent', 'sold', 'taught', 'caught', 'told', 'said', 'found', 'built', 'felt', 'kept', 'paid', 'sent',
  'heard', 'understood', 'become', 'come', 'run'
]
/** -ed-Wörter, die keine Vergangenheit sind (Adjektive, Nomen) */
const KEIN_PAST_ED = new Set([
  'tired', 'bored', 'interested', 'excited', 'scared', 'worried', 'surprised', 'married', 'called', 'named', 'pleased', 'annoyed', 'amazed',
  'disappointed', 'frightened', 'embarrassed', 'relaxed', 'confused', 'crowded', 'closed', 'shocked', 'stressed', 'mixed', 'used', 'hundred',
  'naked', 'wicked', 'sacred', 'shed', 'sled', 'fred', 'ted', 'ned', 'red', 'bed', 'wed', 'fed', 'need', 'feed', 'seed', 'speed', 'weed',
  'bleed', 'breed', 'greed', 'indeed', 'skilled', 'talented', 'colored', 'coloured', 'striped', 'spotted'
])
const istPastEd = (w: string): boolean => w.length > 4 && w.endsWith('ed') && !w.endsWith('eed') && !KEIN_PAST_ED.has(w)

const W = (liste: string[]): string => liste.join('|')
const SUBJEKT = '(?:i|you|he|she|it|we|they)'

const hatEd = (text: string, re: RegExp): boolean => {
  for (const m of text.matchAll(re)) if (istPastEd(m[m.length - 1])) return true
  return false
}

/** Nach „going to" kein Verb: Ort, Begleiter, Eigenname („I'm going to school" ist present progressive) */
const KEIN_VERB_NACH_GOING_TO = new Set([
  'the', 'a', 'an', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'this', 'that', 'these', 'those', 'school', 'bed', 'work', 'church',
  'town', 'class', 'lunch', 'dinner', 'breakfast', 'some', 'any', 'grandma', 'grandpa', 'granny', 'mum', 'dad'
])

/** Reihenfolge = Prüfreihenfolge: die genaueren Formen (had/have + Partizip, Passiv) vor dem simple past */
export const SPERRBARE_ZEITFORMEN: SperrbareZeitform[] = [
  {
    id: 'past_progressive',
    name: 'past progressive (was/were + -ing)',
    themen: ['en.verb.past_progressive'],
    titel: /past progressive|past continuous/i,
    erkenne: (t) => /\b(?:was|were)(?:n't|\s+not)?\s+[a-z]+ing\b/.test(t)
  },
  {
    id: 'present_perfect',
    name: 'present perfect (have/has + Partizip)',
    themen: ['en.verb.present_perfect', 'en.verb.pp_vs_past', 'en.verb.present_perfect_prog'],
    titel: /present perfect/i,
    erkenne: (t) => {
      const pp = `(?:${W(PP_UNREG)})`
      const adv = '(?:not\\s+|never\\s+|ever\\s+|already\\s+|just\\s+|always\\s+)?'
      return (
        new RegExp(`\\b(?:have|has|'ve|haven't|hasn't)\\s+${adv}${pp}\\b`).test(t) ||
        new RegExp(`\\b(?:have|has|haven't|hasn't)\\s+[a-z]+\\s+${adv}${pp}\\b`).test(t) ||
        new RegExp(`'s\\s+${adv}(?:been|gone|done|seen|eaten|written|taken|given)\\b`).test(t) ||
        hatEd(t, /\b(?:have|has|'ve|haven't|hasn't)\s+(?:not\s+|never\s+|ever\s+|already\s+|just\s+)?([a-z]+)\b/g) ||
        hatEd(t, /\b(?:have|has|haven't|hasn't)\s+[a-z]+\s+(?:ever\s+|already\s+|just\s+)?([a-z]+)\b/g)
      )
    }
  },
  {
    id: 'past_perfect',
    name: 'past perfect (had + Partizip)',
    themen: ['en.verb.past_perfect', 'en.verb.past_perfect_prog'],
    titel: /past perfect|plusquamperfekt/i,
    erkenne: (t) =>
      new RegExp(`\\b(?:had|hadn't)\\s+(?:not\\s+|already\\s+|just\\s+|never\\s+)?(?:${W(PP_UNREG)})\\b`).test(t) ||
      hatEd(t, /\b(?:had|hadn't)\s+(?:not\s+|already\s+|just\s+|never\s+)?([a-z]+)\b/g)
  },
  {
    id: 'will_future',
    name: 'will-future (will, won’t, ’ll)',
    themen: ['en.verb.will_future', 'en.verb.will_vs_goingto', 'en.verb.future_prog', 'en.verb.future_perfect', 'en.cond.type1'],
    titel: /will[- ]futur|will-future|future with will/i,
    erkenne: (t) => /\b(?:will|won't)\b|[a-z]'ll\b/.test(t)
  },
  {
    id: 'going_to',
    name: 'going to-future',
    themen: ['en.verb.going_to', 'en.verb.will_vs_goingto'],
    titel: /going[- ]to[- ]futur|going to-future/i,
    erkenne: (t, roh) => {
      if (/\bgonna\b/.test(t)) return true
      for (const m of roh.matchAll(/\bgoing\s+to\s+([A-Za-z]+)/gi)) {
        const w = m[1]
        if (/^[A-Z]/.test(w) && w !== 'I') continue
        if (!KEIN_VERB_NACH_GOING_TO.has(w.toLowerCase())) return true
      }
      return false
    }
  },
  {
    id: 'conditional',
    name: 'would / Bedingungssätze Typ 2 und 3',
    themen: ['en.cond.type2', 'en.cond.type3', 'en.verb.modals_ext'],
    titel: /conditional|bedingungssatz typ (?:2|3|ii|iii)|if-satz typ (?:2|3)/i,
    erkenne: (t) => /\b(?:would|wouldn't)\b(?!\s+(?:you\s+|he\s+|she\s+|they\s+|we\s+)?(?:like|love|prefer)\b)/.test(t)
  },
  {
    id: 'passive',
    name: 'Passiv (be + Partizip)',
    themen: ['en.verb.passive_basic', 'en.verb.passive_ext', 'en.verb.passive_personal', 'en.verb.passive_prep', 'en.verb.passive_reporting'],
    titel: /passiv|passive/i,
    erkenne: (t) => {
      const be = "(?:am|is|are|was|were|be|been|being|'m|'re|isn't|aren't|wasn't|weren't)"
      const pp = PP_UNREG.filter((w) => !['done', 'gone', 'been', 'had', 'come', 'run'].includes(w))
      return new RegExp(`\\b${be}\\s+(?:not\\s+)?(?:${W(pp)})\\b`).test(t) || hatEd(t, new RegExp(`\\b${be}\\s+(?:not\\s+)?([a-z]+)\\b`, 'g'))
    }
  },
  {
    id: 'past_simple',
    name: 'simple past (was/were, did, -ed und unregelmäßige Vergangenheitsformen)',
    themen: ['en.verb.past_simple', 'en.verb.past_progressive', 'en.verb.pp_vs_past'],
    titel: /simple past|past simple|past tense|vergangenheit|präteritum/i,
    erkenne: (t, roh) =>
      new RegExp(`\\b(?:${W(PAST_UNREG)}|wasn't|weren't|didn't)\\b(?!')`).test(t) ||
      /\b(?:yesterday|ago|last (?:night|week|weekend|month|year|summer|winter|spring|autumn|monday|tuesday|wednesday|thursday|friday|saturday|sunday|holidays?))\b/.test(
        t
      ) ||
      hatEd(t, new RegExp(`\\b${SUBJEKT}\\s+(?:also\\s+|often\\s+|never\\s+|always\\s+)?([a-z]+)\\b`, 'g')) ||
      // Eigenname + -ed („Tom played football.")
      hatEd(roh, /\b[A-Z][a-z]+\s+([a-z]+)\b/g)
  }
]

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Band der Grammatikliste („green-line-1-nds" oder „Green Line 1" → „Green Line 1") */
export function grammatikBandVon(lehrwerk: string): string | undefined {
  const n = norm(lehrwerk)
  if (!n) return undefined
  return Object.keys(LEHRWERK_GRAMMATIK)
    .filter((b) => n.startsWith(norm(b)))
    .sort((a, b) => b.length - a.length)[0]
}

/**
 * Bekannte Grammatik (Katalogkennungen) nach Lehrwerk-Stand: alle früheren Bände, frühere Units und die Unit selbst.
 * Ohne Lehrwerk nach Jahrgang (Englisch ab Klasse 5 = Green Line 1): die Bände der Vorjahre und der Band des Jahrgangs
 * bis Unit 1 – so streng wie zu Beginn des Schuljahres.
 */
export function bekanntNachStand(lehrwerk: { buch?: string; unit?: string } | undefined, jahrgang?: number): string[] {
  // Latein (09.10.2026): Stichwörter der Lektionen bis zum Stand (Pontes, Campus, prima …)
  if (lehrwerk?.buch && lateinLehrwerk(lehrwerk.buch)) return bekanntLatein(lehrwerk.buch, lehrwerk.unit)
  const baende = Object.keys(LEHRWERK_GRAMMATIK)
  const alle = (b: string, nurPflicht: boolean): string[] =>
    Object.entries(LEHRWERK_GRAMMATIK[b])
      .filter(([k]) => !nurPflicht || !istOptional(k))
      .flatMap(([, s]) => Object.values(s).flat().flatMap((p) => p.t))
  const buch = lehrwerk?.buch ? grammatikBandVon(lehrwerk.buch) : undefined
  if (buch) {
    const i = baende.indexOf(buch)
    const frueher = baende.slice(0, i).flatMap((b) => alle(b, true))
    if (!lehrwerk?.unit || !LEHRWERK_GRAMMATIK[buch][lehrwerk.unit]) return frueher
    const kapitel = Object.keys(LEHRWERK_GRAMMATIK[buch])
    const { bekannt, neu } = bekannteGrammatik(kapitel, buch, lehrwerk.unit)
    return [...frueher, ...[...bekannt, ...neu].flatMap((p) => p.t)]
  }
  if (!jahrgang || !Number.isFinite(jahrgang)) return []
  if (jahrgang >= 11) return baende.flatMap((b) => alle(b, false))
  // Band des Jahrgangs bis Unit 1 (Schuljahresbeginn): Klasse 6 kennt das simple past (Green Line 2, Welcome back/Unit 1)
  const band = baende[jahrgang - 5]
  return bekanntNachStand(band ? { buch: band, unit: 'Unit 1' } : undefined)
}

export const istEnglisch = (sprache: string, fach = ''): boolean => sprache === 'en' || /englisch|english/i.test(fach)

const FACH_SPRACHE: [RegExp, string][] = [
  [/englisch|english/i, 'en'],
  [/franz/i, 'fr'],
  [/spani/i, 'es'],
  [/itali/i, 'it'],
  [/latein/i, 'la'],
  [/russi/i, 'ru'],
  [/niederl/i, 'nl'],
  [/portug/i, 'pt']
]

/** Sprache mit sperrbaren Zeitformen („en", „fr" …) – null, wenn für die Sprache keine erfasst sind */
export function sperrSprache(sprache: string, fach = ''): string | null {
  const s = sprache === 'en' || ZEITFORMEN_SPRACHEN[sprache] ? sprache : FACH_SPRACHE.find(([re]) => re.test(fach))?.[1]
  return s ?? null
}

/** Sperrbare Zeitformen einer Sprache */
export const zeitformenDer = (sprache: string): SperrbareZeitform[] => (sprache === 'en' ? SPERRBARE_ZEITFORMEN : ZEITFORMEN_SPRACHEN[sprache] ?? [])

/**
 * Gesperrte Zeitformen: alle sperrbaren, die weder bekannt sind (Kennungen, auch mit Teilform) noch Thema des Auftrags
 * (Kennungen oder Name im Thema, z. B. eigenes Thema „Simple past").
 */
export function sperreFuer(o: { bekannt: string[]; themen?: string[]; thema?: string; sprache?: string }): SperrbareZeitform[] {
  const themen = new Set([...o.bekannt, ...(o.themen ?? [])].map((b) => b.split('/')[0]))
  return zeitformenDer(o.sprache ?? 'en').filter((z) => !z.themen.some((t) => themen.has(t)) && !(o.thema && z.titel.test(o.thema)))
}

/** Strikte Regel für die KI (leer, wenn nichts gesperrt ist) */
export function sperrRegel(gesperrt: SperrbareZeitform[]): string {
  if (!gesperrt.length) return ''
  const sprache = gesperrt[0].sprache ?? 'en'
  const erlaubt = zeitformenDer(sprache)
    .filter((z) => !gesperrt.includes(z))
    .map((z) => z.name.replace(/ \(.*$/, ''))
  return [
    'BEKANNTE GRAMMATIK – STRIKT: Die Lerngruppe kennt bisher NUR diese Zeitformen und Formen:',
    `${[...(sprache === 'en' ? BASIS_EN : BASIS[sprache] ?? []), ...erlaubt].join('; ')} – dazu das Thema selbst.`,
    `VERBOTEN in Sätzen, Lösungen, Möglichkeiten, Satzbau-Teilen, Formen zum Bestimmen, Tabellen und Beispielen: ${gesperrt.map((z) => z.name).join('; ')}.`,
    sprache === 'en'
      ? 'Das gilt auch dann, wenn eine Teilform des Themas eine dieser Zeitformen nennt (z. B. „there was / there were" ohne bekanntes simple past) – solche Teilformen weglassen. Keine Signalwörter der Vergangenheit (yesterday, last week, … ago), wenn das simple past verboten ist.'
      : 'Das gilt auch dann, wenn eine Teilform des Themas eine dieser Formen nennt – solche Teilformen weglassen. Keine Signalwörter, die eine verbotene Zeitform verlangen.'
  ].join('\n')
}

interface PruefAufgabe {
  art?: string
  satz?: string
  loesungen?: string[]
  teile?: string[]
  form?: string
  lesarten?: string[][]
  zeilen?: { loesungen: string[] }[]
  anweisung?: string
  vorgabe?: string
  erklaerung?: string
}

const einheitlich = (s: string): string => s.replace(/[’‘`´]/g, "'")

/**
 * Texte einer Aufgabe in der Zielsprache: Satz, Lösungen, Satz mit eingesetzter Lösung, Teile. Übersetzen: in den
 * modernen Sprachen ist der Satz deutsch (nur die Lösungen zählen), in Latein umgekehrt. Latein dazu Form und Tabelle.
 */
function zielTexte(a: PruefAufgabe, sprache: string): string[] {
  const latein = sprache === 'la'
  const satz = a.art === 'uebersetzen' && !latein ? '' : (a.satz ?? '')
  const loes = a.art === 'uebersetzen' && latein ? [] : (a.loesungen ?? [])
  return [
    satz,
    ...(a.art === 'bestimmen' ? [] : loes),
    ...(satz.includes('___') ? loes.slice(0, 3).map((l) => satz.replace(/_{3,}/, l)) : []),
    (a.teile ?? []).join(' '),
    a.form ?? '',
    ...(a.zeilen ?? []).flatMap((z) => z.loesungen)
  ]
    .map(einheitlich)
    .filter((t) => t.trim())
}

/** Latein ohne Längenzeichen (ā → a), j → i */
const ohneLaengen = (t: string): string => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/j/g, 'i')

/** Erste gesperrte Zeitform in einem Text der Zielsprache (oder null) */
export function zeitformIn(text: string, gesperrt: SperrbareZeitform[]): SperrbareZeitform | null {
  if (!gesperrt.length) return null
  const roh = einheitlich(text)
  const t = gesperrt[0].sprache === 'la' ? ohneLaengen(roh.toLowerCase()) : roh.toLowerCase()
  return gesperrt.find((z) => z.erkenne(t, roh)) ?? null
}

/** Gesperrte Zeitform einer Aufgabe (oder null) */
export function zeitformDerAufgabe(a: PruefAufgabe, gesperrt: SperrbareZeitform[]): SperrbareZeitform | null {
  if (!gesperrt.length) return null
  for (const t of zielTexte(a, gesperrt[0].sprache ?? 'en')) {
    const z = zeitformIn(t, gesperrt)
    if (z) return z
  }
  // Latein: Lesarten beim Bestimmen („Perf.", „Konj." …)
  for (const l of a.lesarten ?? []) {
    const z = gesperrt.find((x) => x.lesart && l.some((w) => x.lesart!.test(w.trim())))
    if (z) return z
  }
  const deutsch = [a.anweisung, a.vorgabe, a.erklaerung].filter(Boolean).join(' ')
  return gesperrt.find((z) => z.titel.test(deutsch)) ?? null
}

/** Aufgaben ohne gesperrte Zeitformen; Beispiele der Regelkarten ebenso bereinigt */
export function ohneGesperrteZeitformen<A extends PruefAufgabe, R extends { beispiele?: string[] }>(
  p: { regeln: R[]; aufgaben: A[] },
  gesperrt: SperrbareZeitform[]
): { regeln: R[]; aufgaben: A[]; entfernt: number; zeitformen: string[] } {
  if (!gesperrt.length) return { regeln: p.regeln, aufgaben: p.aufgaben, entfernt: 0, zeitformen: [] }
  const gefunden = new Set<string>()
  const aufgaben = p.aufgaben.filter((a) => {
    const z = zeitformDerAufgabe(a, gesperrt)
    if (z) gefunden.add(z.name.replace(/ \(.*$/, ''))
    return !z
  })
  const regeln = p.regeln.map((r) => (r.beispiele ? { ...r, beispiele: r.beispiele.filter((b) => !zeitformIn(b, gesperrt)) } : r))
  return { regeln, aufgaben, entfernt: p.aufgaben.length - aufgaben.length, zeitformen: [...gefunden] }
}
