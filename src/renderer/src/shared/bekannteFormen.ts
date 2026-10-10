/**
 * Bekannte Wortformen einer Lerngruppe (10.10.2026, Befund der Lehrkraft, Klasse 5 Englisch, Green Line 1): Unter
 * Lückenaufgaben stand „You may have to change the form of the word (e.g. plural, past tense)." – das simple past kommt
 * in Green Line erst in Band 2 (Klasse 6). Anweisungen, Hinweise und Aufgaben dürfen nur Formen nennen bzw. verlangen,
 * die die Klasse SCHON kennt.
 *
 * EINE Quelle für alle Erzeugungswege (Vokabeltest, Arbeitsblatt, Klassenarbeit):
 *  - Englisch mit Lehrwerk-Stand (Band + Unit): die Grammatik der Green-Line-Liste bis dahin
 *    (shared/lehrwerkGrammatik.ts über `bekanntNachStand` in @shared/zeitformSperre).
 *  - Englisch ohne Lehrwerk: Jahrgang nach dem Kerncurriculum (Niedersachsen G9 = Green-Line-Folge): Klasse 5 kennt
 *    Plural, simple present, present progressive, can und den Besitz-’s; ab Klasse 6 (Band 2, Welcome back/Unit 1) das
 *    simple past usw. – je Jahrgang der Band bis Unit 1 (Schuljahresbeginn, so streng wie möglich).
 *  - Andere Sprachen: Grammatiktabelle der App je Lernjahr (vokabeltest/didactics/formVorwissen.ts); was dort nur
 *    „vielleicht" eingeführt ist, gilt hier als NICHT bekannt.
 */
import type { CefrLevel } from '@shared/types'
import { bekanntNachStand, grammatikBandVon, sperrSprache } from '@shared/zeitformSperre'
import { learningYear } from '../modules/arbeitsblatt/didactics/grammar'
import { formVorwissen } from '../modules/vokabeltest/didactics/formVorwissen'
import type { KnownVocab } from './knownVocab'

export type FormArt =
  | 'kasus'
  | 'plural'
  | 'present'
  | 'ing'
  | 'possessive'
  | 'past'
  | 'perfect'
  | 'future'
  | 'comparison'
  | 'adverb'
  | 'passive'
  | 'derivation'

export interface FormKontext {
  /** Zielsprache („en", „fr" …) */
  sprache: string
  jahrgang: number
  bundesland?: string
  /** 1., 2. oder 3. Fremdsprache (fehlt = 1.) */
  fremdsprachenfolge?: number
  niveau?: CefrLevel
  /** Lehrwerk-Stand (Band, Unit, frühere Bände) – genauer als der Jahrgang */
  known?: KnownVocab | null
}

export interface BekannteFormen {
  sprache: string
  /** Formänderungen, die die Klasse bilden kann (Reihenfolge wie FORM_ARTEN) */
  bekannt: FormArt[]
  /** Formänderungen, die noch nicht eingeführt sind – nie verlangen, nie nennen */
  nochNicht: FormArt[]
  quelle: 'lehrwerk' | 'jahrgang' | 'tabelle'
  /** Für Prompt und Anzeige: „Green Line 1, Unit 2" bzw. „Klasse 5" */
  stand: string
}

export const FORM_ARTEN: FormArt[] = ['kasus', 'plural', 'present', 'ing', 'possessive', 'past', 'perfect', 'future', 'comparison', 'adverb', 'passive', 'derivation']

/** Englisch: Form → Katalogthemen, mit denen sie als eingeführt gilt */
const EN_THEMEN: Partial<Record<FormArt, string[]>> = {
  present: ['en.verb.present_simple'],
  ing: ['en.verb.present_progressive'],
  possessive: ['en.noun.genitive'],
  past: ['en.verb.past_simple'],
  perfect: ['en.verb.present_perfect'],
  future: ['en.verb.will_future'],
  comparison: ['en.adj.comparison'],
  adverb: ['en.adv.formation', 'en.adv.manner'],
  passive: ['en.verb.passive_basic']
}
const EN_ARTEN: FormArt[] = ['plural', 'present', 'ing', 'possessive', 'past', 'perfect', 'future', 'comparison', 'adverb', 'passive', 'derivation']
/** Kerncurriculum Englisch Klasse 5 (ohne Lehrwerk-Stand): Plural, simple present, present progressive, can, Besitz-’s */
const EN_KLASSE5: FormArt[] = ['plural', 'present', 'ing', 'possessive']

/** Sprachen, in denen die Fälle von Anfang an zur Wortform gehören */
const KASUS_SPRACHEN = new Set(['ru', 'pl', 'cs', 'el', 'tr', 'la', 'grc'])

const sortiert = (xs: Iterable<FormArt>): FormArt[] => {
  const s = new Set(xs)
  return FORM_ARTEN.filter((a) => s.has(a))
}

function sequenz(k: FormKontext): 'fs1' | 'fs2' | 'fs3' {
  const f = k.fremdsprachenfolge ?? 1
  return f >= 3 ? 'fs3' : f === 2 ? 'fs2' : 'fs1'
}

/** Englisch: Formen aus den bekannten Katalogthemen */
function ausThemen(ids: string[]): FormArt[] {
  const themen = new Set(ids.map((i) => i.split('/')[0]))
  return (Object.entries(EN_THEMEN) as [FormArt, string[]][]).filter(([, t]) => t.some((x) => themen.has(x))).map(([a]) => a)
}

/** Welche Wortformen die Klasse schon bilden kann – aus Lehrwerk-Stand oder Jahrgang (s. o.) */
export function bekannteFormen(k: FormKontext): BekannteFormen {
  const sprache = k.sprache || 'en'
  const lernjahr = learningYear(k.jahrgang, sequenz(k), k.bundesland ?? '')
  const wortbildung = (): boolean =>
    formVorwissen(
      { targetLanguage: sprache, grade: k.jahrgang, languageOrder: k.fremdsprachenfolge ?? 1, stateId: k.bundesland ?? '', level: k.niveau ?? 'B2' },
      k.known ?? undefined
    ).wortbildung
  if (sprache === 'en') {
    const band = k.known?.buch ? grammatikBandVon(k.known.buch) : undefined
    if (band && k.known?.unit) {
      const bekannt = sortiert(['plural', ...ausThemen(bekanntNachStand({ buch: k.known.buch, unit: k.known.unit })), ...(wortbildung() ? ['derivation' as const] : [])])
      return { sprache, bekannt, nochNicht: EN_ARTEN.filter((a) => !bekannt.includes(a)), quelle: 'lehrwerk', stand: `${k.known.buch}, ${k.known.unit}` }
    }
    // Ohne Lehrwerk: Jahrgang des Englischunterrichts (Englisch als 2. Fremdsprache: Lernjahr + 4)
    const klasse = (k.fremdsprachenfolge ?? 1) > 1 ? lernjahr + 4 : k.jahrgang
    const basis: FormArt[] = klasse >= 5 ? EN_KLASSE5 : klasse >= 3 ? ['plural'] : []
    const bekannt = sortiert([...basis, ...(klasse >= 6 ? ausThemen(bekanntNachStand(undefined, klasse)) : []), ...(klasse >= 7 && wortbildung() ? ['derivation' as const] : [])])
    return { sprache, bekannt, nochNicht: EN_ARTEN.filter((a) => !bekannt.includes(a)), quelle: 'jahrgang', stand: `Klasse ${k.jahrgang}` }
  }
  const v = formVorwissen(
    { targetLanguage: sprache, grade: k.jahrgang, languageOrder: k.fremdsprachenfolge ?? 1, stateId: k.bundesland ?? '', level: k.niveau ?? 'B2' },
    k.known ?? undefined
  )
  const kandidaten: FormArt[] = [...(KASUS_SPRACHEN.has(sprache) ? ['kasus' as const] : []), 'plural', 'present', 'past', 'future', 'comparison', 'derivation']
  const hat = (re: RegExp): boolean => v.bekannt.some((t) => re.test(t))
  const bekannt = sortiert([
    ...(KASUS_SPRACHEN.has(sprache) ? ['kasus' as const] : []),
    'plural',
    'present',
    ...(v.vergangenheit ? ['past' as const] : []),
    ...(hat(/futur|future|будущ/i) ? ['future' as const] : []),
    ...(hat(/compar|komparativ|steiger|сравнит/i) ? ['comparison' as const] : []),
    ...(v.wortbildung ? ['derivation' as const] : [])
  ])
  return {
    sprache,
    bekannt,
    nochNicht: kandidaten.filter((a) => !bekannt.includes(a)),
    quelle: v.lehrwerk ? 'lehrwerk' : 'tabelle',
    stand: v.lehrwerk?.quelle ?? `Lernjahr ${v.lernjahr}`
  }
}

// ---------------------------------------------------------------- Regeln für die KI

const NAME_EN: Record<FormArt, string> = {
  kasus: 'case endings',
  plural: 'plural of nouns',
  present: 'present tense (simple present, he/she/it -s)',
  ing: 'present progressive (-ing form)',
  possessive: "possessive 's",
  past: 'past tense (simple past: -ed and irregular past forms, was/were, did)',
  perfect: 'present perfect / past participle',
  future: 'future forms (will)',
  comparison: 'comparison of adjectives (-er/-est, more/most)',
  adverb: 'adverbs with -ly',
  passive: 'passive',
  derivation: 'word formation (derivation, e.g. decide → decision)'
}
const NAME_ANDERE: Partial<Record<FormArt, string>> = {
  present: 'present tense conjugation',
  past: 'past tense forms',
  future: 'future tense forms',
  comparison: 'comparison of adjectives'
}
const NAME_DE: Record<FormArt, string> = {
  kasus: 'Kasusendungen',
  plural: 'Plural der Nomen',
  present: 'Präsens (simple present, he/she/it -s)',
  ing: 'present progressive (-ing-Form)',
  possessive: 'Besitz-’s',
  past: 'Vergangenheit (simple past: -ed und unregelmäßige Formen, was/were, did)',
  perfect: 'present perfect / Partizip Perfekt',
  future: 'Futur (will)',
  comparison: 'Steigerung der Adjektive (-er/-est, more/most)',
  adverb: 'Adverbien auf -ly',
  passive: 'Passiv',
  derivation: 'Wortbildung (Ableitungen, z. B. decide → decision)'
}
const NAME_DE_ANDERE: Partial<Record<FormArt, string>> = { present: 'Präsens (Konjugation)', past: 'Vergangenheitsformen', future: 'Futurformen', comparison: 'Steigerung der Adjektive' }

const nameEn = (a: FormArt, sprache: string): string => (sprache === 'en' ? NAME_EN[a] : NAME_ANDERE[a] ?? NAME_EN[a])
const nameDe = (a: FormArt, sprache: string): string => (sprache === 'en' ? NAME_DE[a] : NAME_DE_ANDERE[a] ?? NAME_DE[a])

/** Strikte Regel für englische Prompts (Vokabeltest) – leer, wenn nichts gesperrt ist */
export function formenRegel(f: BekannteFormen): string {
  if (!f.nochNicht.length) return ''
  return [
    `KNOWN WORD FORMS – STRICT (${f.stand}):`,
    `- Only require word forms the class already knows: ${f.bekannt.map((a) => nameEn(a, f.sprache)).join('; ') || 'base forms only'}.`,
    `- Never require ${f.nochNicht.map((a) => nameEn(a, f.sprache)).join('; ')} – not yet introduced. No gap, answer, option or word in brackets may need such a form; rewrite the sentence so that the base form or a known form fits.`,
    '- Instructions and help lines must not mention forms that are not yet known (e.g. no "past tense" in "(e.g. …)").'
  ].join('\n')
}

/** Dieselbe Regel deutsch (Arbeitsblatt, Klassenarbeit) */
export function formenRegelDe(f: BekannteFormen): string {
  if (!f.nochNicht.length) return ''
  return [
    `BEKANNTE WORTFORMEN – STRIKT (${f.stand}):`,
    `- Verlange in Lücken, Lösungen und Auswahlmöglichkeiten nur Wortformen, die die Lerngruppe schon kennt: ${f.bekannt.map((a) => nameDe(a, f.sprache)).join('; ') || 'nur Grundformen'}.`,
    `- Niemals verlangen: ${f.nochNicht.map((a) => nameDe(a, f.sprache)).join('; ')} – noch nicht eingeführt (außer es ist ausdrücklich das Thema des Materials). Satz so bauen, dass die Grundform oder eine bekannte Form passt.`,
    '- Arbeitsanweisungen und Hinweise nennen keine noch nicht eingeführten Formen (z. B. kein „past tense" in „(e.g. …)").'
  ].join('\n')
}

// ---------------------------------------------------------------- Hinweiszeile „Form anpassen"

/** Satz ohne Klammer, Einleitung der Beispiele, Satzende und Namen der Formen – in der Sprache der Hinweise */
const HINWEIS: Record<string, { satz: string; zB?: string; ende?: string; namen?: Partial<Record<FormArt, string>> }> = {
  en: {
    satz: 'You may have to change the form of the word',
    zB: 'e.g.',
    namen: { plural: 'plural', present: 'he/she/it + -s', ing: '-ing form', possessive: "'s", past: 'past tense', perfect: 'past participle', comparison: '-er/-est', adverb: '-ly' }
  },
  fr: { satz: 'Il faut parfois changer la forme du mot', zB: 'p. ex.', namen: { plural: 'pluriel', present: 'conjugaison', past: 'temps du passé', future: 'futur', comparison: 'comparatif' } },
  es: { satz: 'A veces tienes que cambiar la forma de la palabra', zB: 'p. ej.', namen: { plural: 'plural', present: 'conjugación', past: 'pasado', future: 'futuro', comparison: 'comparativo' } },
  it: { satz: 'A volte devi cambiare la forma della parola', zB: 'per esempio:', namen: { plural: 'plurale', present: 'coniugazione', past: 'passato', future: 'futuro', comparison: 'comparativo' } },
  nl: { satz: 'Soms moet je de vorm van het woord veranderen', zB: 'bijv.', namen: { plural: 'meervoud', present: 'vervoeging', past: 'verleden tijd', future: 'toekomende tijd', comparison: 'vergrotende trap' } },
  ru: {
    satz: 'Иногда слово нужно поставить в другую форму',
    zB: 'например:',
    namen: { kasus: 'падеж', plural: 'множественное число', present: 'спряжение', past: 'прошедшее время', future: 'будущее время', comparison: 'сравнительная степень' }
  },
  de: { satz: 'Manchmal muss die Form des Wortes angepasst werden', zB: 'z. B.', namen: { kasus: 'Kasus', plural: 'Plural', present: 'Personalendung', past: 'Vergangenheitsform', future: 'Futur', comparison: 'Steigerung' } },
  pl: { satz: 'Czasem trzeba zmienić formę wyrazu', zB: 'np.', namen: { kasus: 'przypadek', plural: 'liczba mnoga', present: 'odmiana czasownika', past: 'czas przeszły', future: 'czas przyszły', comparison: 'stopień wyższy' } },
  cs: { satz: 'Někdy musíš změnit tvar slova', zB: 'např.', namen: { kasus: 'pád', plural: 'množné číslo', present: 'časování', past: 'minulý čas', future: 'budoucí čas', comparison: 'druhý stupeň' } },
  pt: { satz: 'Às vezes tens de mudar a forma da palavra', zB: 'p. ex.', namen: { plural: 'plural', present: 'conjugação', past: 'passado', future: 'futuro', comparison: 'comparativo' } },
  tr: { satz: 'Bazen kelimenin biçimini değiştirmen gerekir', zB: 'ör.', namen: { kasus: 'hâl eki', plural: 'çoğul', present: 'fiil çekimi', past: 'geçmiş zaman', future: 'gelecek zaman', comparison: 'karşılaştırma' } },
  da: { satz: 'Nogle gange skal du ændre ordets form', zB: 'f.eks.', namen: { plural: 'flertal', present: 'bøjning', past: 'datid', future: 'fremtid', comparison: 'komparativ' } },
  el: {
    satz: 'Μερικές φορές πρέπει να αλλάξεις τη μορφή της λέξης',
    zB: 'π.χ.',
    namen: { kasus: 'πτώση', plural: 'πληθυντικός', present: 'κλίση ρήματος', past: 'παρελθοντικός χρόνος', future: 'μέλλοντας', comparison: 'συγκριτικός' }
  },
  zh: { satz: '有的词语需要根据句子稍作改变', ende: '。' },
  ja: { satz: 'ことばの形を変える必要がある場合があります', ende: '。' },
  ar: { satz: 'قد تحتاج أحيانًا إلى تغيير صيغة الكلمة' }
}

/**
 * Hinweis „Form anpassen" mit Beispielen NUR aus bekannten Formen: `arten` = die Formen, die in der Aufgabe wirklich
 * vorkommen (falls erkannt); sonst die ersten bekannten. Ohne passende Form entfällt die Klammer.
 */
export function formHinweisText(lang: string, formen?: BekannteFormen, arten: FormArt[] = [], max = 2): string {
  const h = HINWEIS[lang] ?? HINWEIS.en
  const ende = h.ende ?? '.'
  if (!formen || !h.namen || !h.zB) return `${h.satz}${ende}`
  const bekannt = formen.bekannt.filter((a) => h.namen![a])
  const vorkommend = arten.filter((a) => bekannt.includes(a))
  // Vorrang: Formen, die in der Aufgabe vorkommen; sonst die häufigsten bekannten (ohne Kasus/Besitz, die Lernende selten als „Form" lesen)
  const wahl = (vorkommend.length ? vorkommend : bekannt.filter((a) => a !== 'possessive' && a !== 'kasus').slice(0, max)).slice(0, max)
  if (!wahl.length) return `${h.satz}${ende}`
  return `${h.satz} (${h.zB} ${wahl.map((a) => h.namen![a]).join(', ')})${ende}`
}

/** Satz ohne Beispiele (Rückfall ohne Kontext) */
export const formHinweisOhneBeispiele = (lang: string): string => formHinweisText(lang)

const PLURAL_UNREG: Record<string, string> = { child: 'children', man: 'men', woman: 'women', foot: 'feet', tooth: 'teeth', mouse: 'mice', person: 'people', sheep: 'sheep', fish: 'fish' }
const PAST_UNREG_KURZ = new Set([
  'went', 'saw', 'came', 'took', 'gave', 'ate', 'drank', 'ran', 'swam', 'wrote', 'bought', 'brought', 'thought', 'knew', 'met', 'sat', 'stood', 'began',
  'sang', 'slept', 'spent', 'won', 'flew', 'drove', 'rode', 'broke', 'chose', 'forgot', 'heard', 'sold', 'taught', 'caught', 'fell', 'told', 'said',
  'found', 'made', 'became', 'built', 'woke', 'wore', 'threw', 'grew', 'drew', 'spoke', 'felt', 'kept', 'paid', 'sent', 'had', 'did', 'was', 'were', 'got', 'left', 'lost'
])

/**
 * Englisch: welche Formänderung zwischen Grundform (Wortkasten) und Lösung liegt? null = keine bzw. nicht erkannt.
 * `wortart` aus der Wortliste trennt Plural-s und he/she/it-s.
 */
export function formAenderung(grund: string, loesung: string, wortart = ''): FormArt | null {
  const b = grund.toLowerCase().replace(/^to\s+/, '').trim()
  const a = loesung.toLowerCase().trim()
  if (!b || !a || a === b) return null
  const verb = /verb|\bv\b/i.test(wortart) || /^to\s/i.test(grund)
  const ohneE = b.endsWith('e') ? b.slice(0, -1) : b
  const doppel = b + b.at(-1)
  if (a === `${b}'s` || a === `${b}s'`) return 'possessive'
  if (a === `${b}ing` || a === `${ohneE}ing` || a === `${doppel}ing` || (b.endsWith('ie') && a === `${b.slice(0, -2)}ying`)) return 'ing'
  if (PAST_UNREG_KURZ.has(a.split(' ')[0]) && a.split(' ')[0] !== b) return 'past'
  if (a === `${b}ed` || a === `${b}d` || a === `${doppel}ed` || (/[^aeiou]y$/.test(b) && a === `${b.slice(0, -1)}ied`)) return 'past'
  if (/^(more|most)\s/.test(a) || a === `${b}er` || a === `${b}est` || a === `${b}r` || a === `${b}st` || a === `${doppel}er` || a === `${doppel}est`) return 'comparison'
  if (/[^aeiou]y$/.test(b) && (a === `${b.slice(0, -1)}ier` || a === `${b.slice(0, -1)}iest`)) return 'comparison'
  if (a === `${b}ly` || (b.endsWith('y') && a === `${b.slice(0, -1)}ily`) || (b.endsWith('le') && a === `${b.slice(0, -1)}y`)) return 'adverb'
  if (PLURAL_UNREG[b] === a) return 'plural'
  if (a === `${b}s` || a === `${b}es` || (/[^aeiou]y$/.test(b) && a === `${b.slice(0, -1)}ies`)) return verb ? 'present' : 'plural'
  return null
}

/** Aus den Einstellungen eines Vokabeltests (Sprache, Klasse, Land, Fremdsprachenfolge, Niveau) */
export function formenDerEinstellungen(
  s: { targetLanguage: string; grade: number; stateId: string; languageOrder: number; level: CefrLevel },
  known?: KnownVocab | null
): BekannteFormen {
  return bekannteFormen({ sprache: s.targetLanguage, jahrgang: s.grade, bundesland: s.stateId, fremdsprachenfolge: s.languageOrder, niveau: s.level, known })
}

/** Nennung einer Form in einer (englischen oder deutschen) Anweisung */
const ERWAEHNUNG: Partial<Record<FormArt, RegExp>> = {
  past: /past tense|simple past|past simple|past form|-ed form|vergangenheit|präteritum|passé|pasado|passato|verleden tijd|прошедш/i,
  perfect: /past participle|present perfect|partizip|participe|participio/i,
  future: /future|will-futur|futur|futuro|будущ/i,
  comparison: /comparative|superlative|comparison|-er\/-est|steigerung|komparativ|comparati/i,
  adverb: /\badverb/i,
  passive: /passive|passiv/i,
  derivation: /word formation|wortbildung/i,
  ing: /-ing form|progressive/i
}

/**
 * KI-Anweisungen bereinigen (10.10.2026): Nennt eine Anweisung in „(e.g. …)" eine noch nicht eingeführte Form, fällt
 * dieser Teil weg – bleibt nichts, die ganze Klammer; ein eigener Satz nur über eine solche Form ebenso.
 */
export function ohneUnbekannteFormen(text: string, f: BekannteFormen | undefined): string {
  if (!f || !text || !f.nochNicht.length) return text
  const verboten = f.nochNicht.map((a) => ERWAEHNUNG[a]).filter((r): r is RegExp => Boolean(r))
  const nennt = (t: string): boolean => verboten.some((r) => r.test(t))
  if (!nennt(text)) return text
  let out = text.replace(/\s*\(([^()]*)\)/g, (ganz, inhalt: string) => {
    if (!nennt(inhalt)) return ganz
    const m = /^\s*(e\.\s?g\.|z\.\s?B\.|p\.\s?ex\.|p\.\s?ej\.|bijv\.|np\.|např\.)\s*/i.exec(inhalt)
    const kopf = m ? m[1] : ''
    const teile = inhalt
      .slice(m ? m[0].length : 0)
      .split(/\s*(?:,|;|\bor\b|\boder\b|\/)\s*/)
      .filter((t) => t.trim() && !nennt(t))
    return teile.length ? ` (${kopf ? `${kopf} ` : ''}${teile.join(', ')})` : ''
  })
  // Ganze Sätze über eine verbotene Form („Use the past tense.") – nur, wenn noch etwas übrig bleibt
  const saetze = out.split(/(?<=[.!?])\s+/)
  if (saetze.length > 1) {
    const rest = saetze.filter((x) => !nennt(x))
    if (rest.length) out = rest.join(' ')
  }
  return out.replace(/\s+([.,;!?])/g, '$1').trim()
}

/**
 * Regel für Arbeitsblatt und Klassenarbeit (deutsch): nur bei Fremdsprachen mit Daten (Fach aus dem Namen, z. B.
 * „Englisch"); leer sonst. Ab Klasse 11 ist alles eingeführt – dann ebenfalls leer.
 */
export function formenRegelFuerFach(m: {
  subjectLabel: string
  grade: number
  stateId: string
  languageOrder?: number
  cefrLevel?: CefrLevel
  known?: KnownVocab | null
}): string {
  const sprache = sperrSprache('', m.subjectLabel)
  if (!sprache || sprache === 'la') return ''
  return formenRegelDe(
    bekannteFormen({ sprache, jahrgang: m.grade, bundesland: m.stateId, fremdsprachenfolge: m.languageOrder ?? (sprache === 'en' ? 1 : 2), niveau: m.cefrLevel, known: m.known })
  )
}
