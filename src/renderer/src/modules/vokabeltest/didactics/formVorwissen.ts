/**
 * Vorwissen der Klasse bei Wortformen (30.09.2026, Wunsch der Lehrkraft: „Wortänderungen (z. B.
 * Verben ins simple past setzen usw.) könnten für frühe Jahrgänge noch zu viel sein. Gib der KI
 * dies als mögliches noch fehlendes Vorwissen (basierend auf dem Jahrgang der Klasse) mit.").
 *
 * Quelle ist die Grammatiktabelle der App (arbeitsblatt/didactics/grammarTopics.ts – Lehrpläne und
 * Lehrwerke), gemessen am LERNJAHR wie im Grammatiktest (`learningYear`, `topicStart`):
 * - Einführung in einem früheren Lernjahr → bekannt.
 * - Einführung im laufenden Lernjahr → bekannt nur, wenn das Thema in diesem Jahr abgeschlossen
 *   ist (`to` = `from`), unstrittig und nicht über dem gewählten GER-Niveau. Sonst „vielleicht
 *   noch nicht": Die Tabelle nennt nur das Jahr, nicht den Monat. So fällt in Klasse 5 das simple
 *   past (Lernjahr 1–2, strittig; Green Line bringt es erst in Band 2) unter „vielleicht noch
 *   nicht", Plural und simple present bleiben bekannt.
 * - Einführung in einem späteren Lernjahr → noch nicht.
 * Ist das Lehrwerk mit Unit gewählt, kommen die Grammatikangaben der Units dazu
 * (shared/lehrwerkThemen.ts); sie sind genauer als die Tabelle.
 * Ohne Daten (Italienisch, Niederländisch, Russisch) gilt eine vorsichtige Faustregel je Lernjahr.
 */
import { cefrIndex, type CefrLevel } from '@shared/types'
import { einfuehrungsNiveau, GRAMMAR_TOPICS, learningYear, topicStart, type GrammarTopic, type LanguageSequence } from '../../arbeitsblatt/didactics/grammar'
import { LEHRWERK_THEMEN, lehrwerkStand } from '../../../shared/lehrwerkThemen'
import type { KnownVocab } from '../../../shared/knownVocab'
import type { Block, TaskTypeId, TestSettings, VocabEntry } from '../model/types'

export type FormSettings = Pick<TestSettings, 'targetLanguage' | 'grade' | 'languageOrder' | 'stateId' | 'level'>

export interface FormVorwissen {
  lernjahr: number
  /** Fach-Kennung der Grammatiktabelle, falls es Daten gibt */
  fach?: string
  /** Formänderungen, die die Klasse bilden kann (fremdsprachliche Termini) */
  bekannt: string[]
  /** Im laufenden Lernjahr eingeführt – die Klasse hat sie vielleicht noch nicht */
  vielleicht: string[]
  /** Erst später eingeführt */
  nochNicht: string[]
  /** Wortbildung (Ableitungen) ist eingeführt */
  wortbildung: boolean
  /** Einfache Vergangenheit ist sicher eingeführt */
  vergangenheit: boolean
  /** Genauere Angaben aus dem gewählten Lehrwerk */
  lehrwerk?: {
    quelle: string
    vorher: string[]
    aktuell?: string
    danach: string[]
  }
  quelle: 'tabelle' | 'faustregel'
}

const FACH: Record<string, string> = {
  en: 'englisch',
  fr: 'franzoesisch',
  es: 'spanisch',
  it: 'italienisch',
  la: 'latein'
}

/** Nur Bereiche, in denen sich das Wort selbst verändert – keine Satzbau-, Präpositions- oder Begleiterthemen */
const FORMBEREICH = /^(Verb|Nomen|Adjektiv|Adverb|Wortbildung|Formenlehre)/
const KEIN_FORMBEREICH = /Satzbau|Begleiter|Menge|Präposition|Zahlwort|Lektüre/

/** Einfache Vergangenheit je Sprache (Kennungen der Grammatiktabelle) */
const VERGANGENHEIT: Record<string, string[]> = {
  englisch: ['en.verb.past_simple'],
  franzoesisch: ['fr.verb.passe_compose'],
  spanisch: ['es.verb.indefinido_reg'],
  latein: ['la.form.perfekt']
}

function sequenz(s: FormSettings, fach: string | undefined): LanguageSequence {
  if (s.languageOrder >= 3) return s.grade >= 11 && fach === 'spanisch' ? 'spaet' : 'fs3'
  if (s.languageOrder === 2) return 'fs2'
  return 'fs1'
}

/** Lernjahr aus Jahrgang und Fremdsprachenfolge – dieselbe Rechnung wie im Grammatiktest */
export function lernjahrVon(s: FormSettings): number {
  return learningYear(s.grade, sequenz(s, FACH[s.targetLanguage]), s.stateId)
}

type Stand = 'bekannt' | 'vielleicht' | 'nochNicht'

/** Einordnung eines Themas der Grammatiktabelle für diese Klasse */
export function standVon(t: GrammarTopic, lj: number, seq: LanguageSequence, level: CefrLevel): Stand {
  const start = topicStart(t, seq)
  if (start > lj) return 'nochNicht'
  const niveau = einfuehrungsNiveau(t.level)
  const ueber = Boolean(niveau && cefrIndex(niveau) > cefrIndex(level))
  // Zunächst nur zum Erkennen: erst zwei Lernjahre nach der Einführung zum Bilden
  if (t.receptive && start >= lj - 1) return 'vielleicht'
  if (start < lj) return ueber ? 'vielleicht' : 'bekannt'
  return t.to > t.from || t.contested || ueber ? 'vielleicht' : 'bekannt'
}

/** Vorsichtige Faustregel für Sprachen ohne Grammatiktabelle */
function faustregel(lj: number): Pick<FormVorwissen, 'bekannt' | 'vielleicht' | 'nochNicht' | 'wortbildung' | 'vergangenheit'> {
  if (lj <= 1)
    return {
      bekannt: ['plural of nouns', 'present tense of regular verbs'],
      vielleicht: ['present tense of irregular verbs'],
      nochNicht: ['past tenses', 'future forms', 'comparison of adjectives', 'word formation (derivation)'],
      wortbildung: false,
      vergangenheit: false
    }
  if (lj === 2)
    return {
      bekannt: ['plural of nouns', 'present tense'],
      vielleicht: ['first past tense', 'comparison of adjectives'],
      nochNicht: ['further past tenses', 'conditional and subjunctive', 'word formation (derivation)'],
      wortbildung: false,
      vergangenheit: false
    }
  if (lj === 3)
    return {
      bekannt: ['plural of nouns', 'present tense', 'first past tense', 'comparison of adjectives'],
      vielleicht: ['further past tenses', 'future forms', 'frequent word formation'],
      nochNicht: ['conditional and subjunctive', 'passive'],
      wortbildung: false,
      vergangenheit: true
    }
  return {
    bekannt: ['common tenses', 'comparison of adjectives', 'frequent word formation'],
    vielleicht: lj === 4 ? ['conditional and subjunctive', 'passive'] : [],
    nochNicht: [],
    wortbildung: true,
    vergangenheit: true
  }
}

/** Grammatikangaben des gewählten Lehrwerks: frühere Bände, frühere Units, aktuelle Unit, spätere Units */
function ausLehrwerk(known: KnownVocab | undefined): FormVorwissen['lehrwerk'] {
  if (!known?.buch || !known.unit || !LEHRWERK_THEMEN[known.buch]) return undefined
  const stand = lehrwerkStand(known.buch, known.unit)
  if (!stand.aktuell && !stand.vorher.length) return undefined
  const frueher = (known.fruehereBaende ?? []).flatMap((b) => Object.values(LEHRWERK_THEMEN[b]?.kapitel ?? {}).map((k) => k.grammatik))
  const g = (xs: (string | undefined)[]): string[] => xs.filter((x): x is string => Boolean(x && x.trim()))
  return {
    quelle: `${known.buch}, ${known.unit}`,
    vorher: g([...frueher, ...stand.vorher.map((x) => x.k.grammatik)]),
    aktuell: stand.aktuell?.grammatik || undefined,
    danach: g(stand.danach.map((x) => x.k.grammatik))
  }
}

/** Welche Formänderungen die Klasse schon kann – aus Sprache, Jahrgang, Fremdsprachenfolge und ggf. Lehrwerk */
export function formVorwissen(s: FormSettings, known?: KnownVocab): FormVorwissen {
  const fach = FACH[s.targetLanguage]
  const lj = lernjahrVon(s)
  const lehrwerk = ausLehrwerk(known)
  const themen = GRAMMAR_TOPICS.filter((t) => t.subject === fach && t.scale === 'lernjahr' && FORMBEREICH.test(t.area) && !KEIN_FORMBEREICH.test(t.area))
  if (!fach || !themen.length) return { lernjahr: lj, ...faustregel(lj), lehrwerk, quelle: 'faustregel' }

  const seq = sequenz(s, fach)
  const eingeordnet = themen.map((t) => ({
    t,
    stand: standVon(t, lj, seq, s.level),
    start: topicStart(t, seq)
  }))
  const liste = (stand: Stand): string[] =>
    eingeordnet
      .filter((x) => x.stand === stand)
      .sort((a, b) => a.start - b.start)
      .map((x) => x.t.term + (x.t.receptive && stand !== 'bekannt' ? ' (recognition only)' : ''))
  const wb = eingeordnet.filter((x) => x.t.area.startsWith('Wortbildung'))
  const vergangen = VERGANGENHEIT[fach] ?? []
  return {
    lernjahr: lj,
    fach,
    bekannt: liste('bekannt'),
    vielleicht: liste('vielleicht'),
    nochNicht: liste('nochNicht'),
    // Ohne Wortbildungsthema in der Tabelle (Spanisch, Latein): Faustregel ab Lernjahr 3
    wortbildung: wb.length ? wb.some((x) => x.stand === 'bekannt') : lj >= 3,
    vergangenheit: eingeordnet.some((x) => vergangen.includes(x.t.id) && x.stand === 'bekannt'),
    lehrwerk,
    quelle: 'tabelle'
  }
}

/** Gibt es überhaupt etwas, das die Klasse noch nicht (sicher) kann? */
export const hatLuecken = (v: FormVorwissen): boolean => v.vielleicht.length > 0 || v.nochNicht.length > 0 || Boolean(v.lehrwerk?.danach.length)

/** Aus langen Listen die zuletzt eingeführten nennen – wer das present perfect kann, kann auch das simple present */
const kuerzen = (xs: string[], max: number, vorne = false): string =>
  xs.length > max ? (vorne ? `${xs.slice(0, max).join(', ')} …` : `… ${xs.slice(-max).join(', ')}`) : xs.join(', ')

/**
 * Abschnitt „VORWISSEN DER KLASSE" für den Systemprompt. Leer, wenn die Klasse alle Formen der
 * Tabelle kennt (späte Lernjahre).
 */
export function vorwissenRegel(v: FormVorwissen): string {
  if (!hatLuecken(v)) return ''
  const zeilen = [
    `VORWISSEN DER KLASSE (prior knowledge of word forms) – learning year ${v.lernjahr}${
      v.quelle === 'faustregel' ? ' (rule of thumb, no curriculum data)' : ' (curricula and textbooks)'
    }:`,
    v.bekannt.length ? `- Word-form changes the class already knows: ${kuerzen(v.bekannt, 14)}.` : '- The class knows hardly any word-form changes yet.',
    v.vielleicht.length ? `- Possibly NOT yet taught (introduced during this learning year, maybe later than now): ${kuerzen(v.vielleicht, 10, true)}.` : '',
    v.nochNicht.length ? `- NOT yet taught: ${kuerzen(v.nochNicht, 10, true)}.` : '',
    v.lehrwerk?.vorher.length ? `- Textbook (${v.lehrwerk.quelle}) – grammar already covered: ${kuerzen(v.lehrwerk.vorher, 8)}.` : '',
    v.lehrwerk?.aktuell ? `- Textbook – grammar of the current unit (just being introduced, use only with support): ${v.lehrwerk.aktuell}.` : '',
    v.lehrwerk?.danach.length ? `- Textbook – grammar of later units (NOT yet taught): ${kuerzen(v.lehrwerk.danach, 6, true)}.` : '',
    v.lehrwerk ? '- The textbook information is more precise than the general lists; follow it where they differ.' : '',
    'Rules for word forms:',
    // Latein: nur Lesen und Übersetzen – es geht um die Formen in den lateinischen Sätzen
    ...(v.fach === 'latein'
      ? [
          '- Latin sentences and phrases use only forms the class already knows; tested words appear in their dictionary form or in a known form.',
          '- Forms that are not yet taught do not occur; if one is unavoidable, explain it in brackets.'
        ]
      : [
          '- A gap, answer or option may only require a form change the class already knows. Otherwise the answer is the base form exactly as in the word list.',
          '- Build sentences so that the base form fits naturally (e.g. present tense, imperative, a modal verb + infinitive instead of a past tense).',
          '- If a not-yet-taught form is unavoidable, give it in brackets as a help – it must not be what the item tests.',
          v.wortbildung ? '' : '- Do not ask students to derive new words (word formation) – it has not been taught yet.',
          '- The rest of the sentence may use known forms only, too.'
        ])
  ]
  return zeilen.filter(Boolean).join('\n')
}

/**
 * Aufgabenarten und Formänderung:
 * - 'wortbildung': verlangt Ableitungen (decide → decision) – erst mit eingeführter Wortbildung.
 * - 'flexion': Lücken, deren Antwort gebeugt sein KANN – die KI passt die Form an das Vorwissen an.
 */
export const FORMAENDERUNG: Partial<Record<TaskTypeId, 'wortbildung' | 'flexion'>> = {
  wordFormation: 'wortbildung',
  wordFamily: 'wortbildung',
  gapSentences: 'flexion',
  gapText: 'flexion',
  dialogue: 'flexion',
  multipleChoice: 'flexion',
  wrongWord: 'flexion',
  twoSentences: 'flexion'
}

/** Aufgabenart für diese Klasse noch zu schwer, weil sie Formänderungen verlangt, die fehlen? */
export function formZuSchwer(id: TaskTypeId, v: FormVorwissen): boolean {
  return FORMAENDERUNG[id] === 'wortbildung' && !v.wortbildung
}

/** Hinweis auf der Aufgabenkarte in „Test einstellen" */
export function formHinweis(id: TaskTypeId, v: FormVorwissen): string | undefined {
  if (formZuSchwer(id, v)) return `Verlangt Formänderungen (Wortbildung) – für Lernjahr ${v.lernjahr} ggf. noch zu schwer.`
  if (FORMAENDERUNG[id] === 'flexion' && !v.vergangenheit && v.lernjahr <= 2)
    return `Lücken werden auf die Grundform bzw. bekannte Formen beschränkt (Lernjahr ${v.lernjahr}).`
  return undefined
}

/** Satz für die KI-Planung der Zusammensetzung */
export function planHinweis(v: FormVorwissen): string {
  if (!hatLuecken(v)) return ''
  return [
    `Learning year ${v.lernjahr}: the class does not know all word-form changes yet${
      v.nochNicht.length ? ` (not yet: ${kuerzen(v.nochNicht, 5, true)})` : ''
    }.`,
    v.wortbildung ? '' : 'Avoid formats that require word formation (wordFormation, wordFamily).',
    'Prefer formats in which the words appear in their base form.'
  ]
    .filter(Boolean)
    .join(' ')
}

// ---------- Örtliche Prüfung (Englisch): Verbformen, die noch nicht eingeführt sind ----------

const BE = ['be', 'am', 'is', 'are', "'m", "'s", "'re"]
const HAVE = ['have', 'has', "'ve"]

/** Erlaubte Formen eines englischen Verbs ohne Vergangenheit: Grundform, 3. Person -s, -ing */
export function englischeGegenwartsformen(verb: string): string[] {
  const v = verb.toLowerCase()
  if (v === 'be') return BE
  if (v === 'have') return HAVE
  const formen = [v, `${v}s`, `${v}es`, `${v}ing`]
  if (/[^aeiou]y$/.test(v)) formen.push(`${v.slice(0, -1)}ies`)
  if (v.endsWith('e')) formen.push(`${v.slice(0, -1)}ing`)
  if (/[^aeiou][aeiou][bdgmnprt]$/.test(v)) formen.push(`${v}${v.at(-1)}ing`)
  return formen
}

const istVerb = (v: VocabEntry): boolean => /verb/i.test(v.pos ?? '') || /^to\s+/i.test(v.term)
/** Erstes Wort ohne „to" – bei Wendungen („go shopping") das Verb */
const kopf = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/^to\s+/, '')
    .trim()
    .split(/\s+/)[0] ?? ''

/**
 * Befunde am fertigen Block: Englisch, einfache Vergangenheit noch nicht sicher eingeführt –
 * verlangt eine Lücke von einem Verb der Liste eine andere Form als Grundform, -s oder -ing?
 */
export function formBefunde(block: Block, vocab: VocabEntry[], v: FormVorwissen): { item?: number; message: string }[] {
  if (v.fach !== 'englisch' || v.vergangenheit) return []
  const byId = new Map(vocab.map((x) => [x.id, x]))
  const antworten: { nr: number; vocabId?: string; answer: string }[] =
    block.kind === 'gap'
      ? block.taskType === 'wordFamily'
        ? []
        : block.items.map((it, i) => ({
            nr: i + 1,
            vocabId: it.vocabId,
            answer: it.answer
          }))
      : block.kind === 'gapText'
      ? block.parts.flatMap((p) => (p.type === 'gap' ? [p] : [])).map((p, i) => ({ nr: i + 1, vocabId: p.vocabId, answer: p.answer }))
      : block.kind === 'choice'
      ? block.items.map((it, i) => ({
          nr: i + 1,
          vocabId: it.vocabId,
          answer: it.options[it.correct] ?? ''
        }))
      : []
  const out: { item?: number; message: string }[] = []
  for (const a of antworten) {
    const vok = a.vocabId ? byId.get(a.vocabId) : undefined
    if (!vok || !istVerb(vok) || !a.answer) continue
    const verb = kopf(vok.term)
    const form = kopf(a.answer)
    if (!verb || !form || englischeGegenwartsformen(verb).includes(form)) continue
    out.push({
      item: a.nr,
      message: `Verlangt die Form „${a.answer.trim()}" von „${vok.term}" – in Lernjahr ${
        v.lernjahr
      } ist die Vergangenheit ggf. noch nicht eingeführt. Besser die Grundform abfragen oder die Form in Klammern vorgeben.`
    })
  }
  return out
}
