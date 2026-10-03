import type { CefrLevel } from '@shared/types'
import { anredeFuer } from '../../arbeitsblatt/didactics/anrede'
import { profilVon } from '@shared/schulformen'
import { newId, Rng, shuffle } from '../model/random'
import type { Block, BlockKind, CategorizeBlock, GapItem, MindmapItem, TaskTypeId, TestSettings, TextPart, VocabEntry } from '../model/types'
import { buildCrossword, crosswordForm, isCrosswordWord, scrambleWord } from './crossword'
import { arr, bool, enumOf, int, obj, str } from '../../../shared/aiSchema'
import type { KnownVocab } from '../../../shared/knownVocab'
import { baseForm } from '../render/helpTexts'
import { alteSpracheAdjektiv, NENNFORM_PUNKTE, nennformLabel } from '../didactics/latein'
import { mitNennform } from '../input/lateinNennform'
import { istGriechisch, mitGriechischerNennform } from '../didactics/griechisch'
import { ASPEKT_LABEL, LESUNG_LABEL, mitLesung, WURZEL_LABEL } from '../didactics/sprachAufgaben'
import { griechischUmschrift } from '../../../shared/sonderzeichen'
import { aufgabenText, FESTE_ANWEISUNG, mindmapAnweisung, synonymTexte, zuordnungsKoepfe, type SynonymArt } from '../render/aufgabenTexte'
import { baueVerbBlock } from './verbAufgabe'
import { LUECKEN_REGELN, ohneDoppelte, optionalesInLoesung, teileVon } from '@shared/luecken'
import { ersatzWoerter, wortartenVon, wortartVon } from './wortart'

export interface GenContext {
  settings: TestSettings
  languageName: string
  rng: Rng
  allVocab: VocabEntry[]
  /** Alle in dieser Testvariante abgefragten Vokabeln (für überzählige Wörter, die nichts verraten) */
  variantVocab?: VocabEntry[]
  /** Wortschatz, den die Klasse laut Lehrwerk schon kennt */
  known?: KnownVocab
  /** Kennungen der Vokabeln, die in dieser Variante schon in anderen Aufgaben stehen (Ersatzwörter im Bild-Teil) */
  belegt?: string[]
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface TaskTypeDef {
  id: TaskTypeId
  label: string
  description: string
  kind: BlockKind
  minLevel: CefrLevel
  usesVocab: boolean
  minItems?: number
  defaultPoints: number
  defaultTitle: string
  defaultInstruction: string
  /**
   * Dieselbe Anweisung in der Sie-Form für die Sekundarstufe II (Paket 8b). Nur bei den
   * Latein-Aufgaben: Nur dort steht die Anweisung auf Deutsch; in den modernen Fremdsprachen
   * steht sie in der Zielsprache und ist von der Regel nicht betroffen.
   */
  defaultInstructionSie?: string
  accepts?: (v: VocabEntry) => boolean
  /**
   * Braucht diese Aufgabe für DIESE Wörter die KI? Fehlt = ja, sobald es ein Schema gibt.
   * (Lesung: nur, wenn in der Liste Pinyin/Hiragana fehlen – 30.09.2026)
   */
  needsAi?: (vocab: VocabEntry[], ctx: GenContext) => boolean
  /** JSON-Schema der KI-Antwort; ohne Schema kommt der Block ohne KI aus */
  schema?: Record<string, unknown>
  prompt?: (vocab: VocabEntry[], ctx: GenContext) => string
  build: (vocab: VocabEntry[], data: any, ctx: GenContext) => Block
}

// ---------- Hilfen ----------

const vocabLines = (vocab: VocabEntry[]): string =>
  vocab
    .map(
      (v) =>
        `- id="${v.id}" | ${v.term} | German: ${v.translation}${v.lesung ? ` | reading: ${v.lesung}` : ''}${v.pos ? ` | ${v.pos}` : ''}${v.note ? ` | note: ${v.note}` : ''}`
    )
    .join('\n')

/** Ordnet eine KI-Antwort anhand der ID (oder notfalls des Wortes) einer Vokabel zu. */
function findVocab(vocab: VocabEntry[], id: string, term?: string): VocabEntry | undefined {
  return vocab.find((v) => v.id === id) ?? (term ? vocab.find((v) => v.term.toLowerCase() === term.toLowerCase()) : undefined)
}

const itemSchema = (props: Record<string, Record<string, unknown>>) =>
  obj({ instruction: str('Short task instruction for the students in the target language'), items: arr(obj(props)) })

/**
 * Grundgerüst eines Blocks. Überschrift und Anweisung in der Testsprache (render/aufgabenTexte.ts,
 * 30.09.2026): In Sprachen mit festen, geprüften Anweisungen (Niederländisch, Russisch und die
 * neuen Schulsprachen) hat der feste Text Vorrang vor der KI-Formulierung; sonst gilt die KI-
 * Anweisung und der feste Text ist der Rückfall.
 */
function base(def: Pick<TaskTypeDef, 'id' | 'defaultTitle' | 'defaultInstruction' | 'defaultInstructionSie'>, data: any, ctx: GenContext) {
  const points = ctx.settings.tasks.find((t) => t.type === def.id)?.pointsPerItem ?? 1
  const sie = def.defaultInstructionSie && anredeFuer(ctx.settings.grade, ctx.settings.schoolTypeId, ctx.settings.stateId) === 'sie'
  const sprache = ctx.settings.targetLanguage
  const fest = aufgabenText(def.id, sprache)
  const ki = typeof data?.instruction === 'string' ? data.instruction.trim() : ''
  return {
    id: newId(ctx.rng),
    taskType: def.id,
    title: fest?.title ?? def.defaultTitle,
    instruction:
      (fest && FESTE_ANWEISUNG.has(sprache) ? fest.instruction : '') || ki || fest?.instruction || (sie ? def.defaultInstructionSie! : def.defaultInstruction),
    pointsPerItem: points
  }
}

/**
 * „Write sentences": Situation und Musterbeispiel helfen am Gymnasium zu sehr (Lehrkraft,
 * 02.10.2026) – dort steht nur das Wort. Mit Vorgabe: Haupt- und Realschule, Förderschule,
 * Grundschule und integrierte Schulformen ohne Kursangabe (abgestimmt: E-Kurs wie Gymnasium;
 * der Vokabeltest kennt kein Kursniveau, deshalb gilt dort „mit Vorgabe").
 */
export function mitSituation(settings: Pick<TestSettings, 'schoolTypeId' | 'stateId'> & { kursniveau?: string }): boolean {
  const profil = profilVon(settings.schoolTypeId, settings.stateId)
  if (profil === 'gymnasium') return false
  if (profil === 'integriert' && (settings.kursniveau === 'E' || settings.kursniveau === 'BB-G' || settings.kursniveau === 'BB-H')) return false
  return true
}

/** Sätze der KI-Anweisung, die ein Beispiel bzw. eine „mögliche Antwort" ankündigen, fallen weg */
export const ohneBeispielHinweis = (anweisung: string): string =>
  anweisung
    .split(/(?<=[.!?])(?<!e\.g\.)\s+/)
    .filter((satz) => !/\b(example|examples|possible answer|exemple|ejemplo|esempio|voorbeeld|beispiel)\b|e\.g\./i.test(satz))
    .join(' ')
    .trim()

/** Sie-Form nach Stufe – nur für die deutschen Anweisungen der Altsprachen von Belang (Paket 8b) */
const sieAnrede = (ctx: GenContext): boolean => anredeFuer(ctx.settings.grade, ctx.settings.schoolTypeId, ctx.settings.stateId) === 'sie'

/** Mindmap-Anweisung zur gewählten Form, in der Testsprache und Anrede der Stufe (02.10.2026) */
export const mindmapAnweisungFuer = (settings: TestSettings, variante: 'oberbegriffe' | 'offen'): string =>
  mindmapAnweisung(settings.targetLanguage, variante, anredeFuer(settings.grade, settings.schoolTypeId, settings.stateId) === 'sie')

/** Gegenteile, die eine Synonym-/Gegenteil-Aufgabe mit n Paaren mindestens enthalten soll (02.10.2026) */
export const mindestGegenteile = (n: number): number => (n >= 3 ? Math.ceil(n / 3) : 0)

/** Welche Beziehungen kommen vor? Danach richtet sich die Anweisung. */
export function synonymArt(relationen: string[]): SynonymArt {
  const gleich = relationen.some((r) => r === '=')
  const gegenteil = relationen.some((r) => r === '≠')
  return gleich && gegenteil ? 'gemischt' : gegenteil ? 'gegenteil' : 'gleich'
}

const earlyLevel = (ctx: GenContext): boolean => ['Pre-A1', 'A1', 'A1+', 'A2'].includes(ctx.settings.level)

const PICTURE_INSTRUCTIONS: Record<string, string> = {
  en: 'Write the correct word under each picture.',
  fr: 'Écris le bon mot sous chaque image.',
  es: 'Escribe la palabra correcta debajo de cada imagen.',
  it: 'Scrivi la parola giusta sotto ogni immagine.',
  nl: 'Schrijf het juiste woord onder elke afbeelding.',
  ru: 'Напиши правильное слово под каждой картинкой.'
}

const UNIQUE_RULE = `Students must be able to see without doubt which word is asked for in each item:
- Students see all words of this task (e.g. in a word box). For every item, try each OTHER word of the list in any grammatical form. If another word would also make sense, add a clearer context clue (typical collocation, situation, reason, contrast) until only the target word fits.
- Avoid items where a synonym, a more general word or a word from the same topic would also be correct.`

/**
 * Ein Lückensatz (02.10.2026): doppelte Wörter an der Lücke aus der Lösung nehmen („to ___" + „to
 * reward" → „reward"), zweiteilige Wendungen mit Mittelteil (shared/luecken.ts).
 */
export function lueckenSatz(
  before: unknown,
  answer: unknown,
  after: unknown,
  middle?: unknown
): { sentences: { before: string; after: string; mitte?: string }[]; answer: string } {
  const vor = String(before ?? '').trim()
  const nach = String(after ?? '').trim()
  const mitte = String(middle ?? '').trim()
  const teile = teileVon(String(answer ?? ''))
  if (mitte && teile.length === 2) {
    const a = ohneDoppelte(vor, teile[0], mitte).loesung
    const b = ohneDoppelte(mitte, teile[1], nach).loesung
    return { sentences: [{ before: vor, mitte, after: nach }], answer: `${a} … ${b}` }
  }
  // Optionaler Teil der Vokabel an der Lücke („lots (of)" + „___ of books") gehört in die Lösung (03.10.2026)
  const o = optionalesInLoesung(vor, String(answer ?? '').trim(), nach)
  return { sentences: [{ before: o.vor.trim(), after: o.nach.trim() }], answer: ohneDoppelte(o.vor, o.loesung, o.nach).loesung }
}

const GAP_RULES = `${LUECKEN_REGELN}
For gap sentences with a two-part expression: put the text between the two parts in "middle" and write "answer" as "part 1 … part 2" (e.g. answer "not only … but also", before "The club", middle "sold cards", after "collected old books."); otherwise "middle" is "".
In texts with [[vocabId]] markers: for a two-part expression put the same [[vocabId]] at BOTH parts and give its answer as "part 1 … part 2".
Rules for gaps:
- "before" + [gap] + "after" together form one natural sentence; the gap replaces exactly the tested word/phrase.
- "answer" is the exact form that fits the gap. Inflect only with forms the class already knows (see VORWISSEN DER KLASSE); otherwise build the sentence so that the base form fits.
- The context must make the tested word the ONLY sensible solution among all words of the list. Add clues (collocations, typical situations) to remove ambiguity.
- The answer must never appear in "before" or "after".
${UNIQUE_RULE}`

/** Mindestens so viele überzählige Wörter stehen in jedem Wortkasten bzw. jeder Zuordnung */
export const MIN_EXTRA_WORDS = 2

// Überzählige Wörter (02.10.2026): dieselbe Wortart und Form wie die Wörter im Kasten – ein Verb
// zwischen lauter Nomen fällt sonst ohne Nachdenken heraus
const extraWordsRule = (_vocab: VocabEntry[], ctx: GenContext): string =>
  `Word box: the students see all tested words plus the "extraWords". Give 2 or 3 extra words that fit NONE of the gaps in any grammatical form – check every gap. Each extra word must be a real distractor: the same word class as at least one tested word (mirror the mix of word classes in the box), written in the same way as the words in the box (base form; with article / "to" exactly when the tested words have one), same level and topic, so that it looks plausible at first glance and can only be ruled out by meaning. Do NOT use any word from this vocabulary list as an extra word (they may be tested in other tasks): ${ctx.allVocab
    .map((v) => v.term)
    .slice(0, 60)
    .join(', ')}.`

/**
 * Überzählige Wörter für Wortkasten/Zuordnung: Vorschläge der KI, ergänzt um andere Wörter der Liste,
 * damit immer mindestens zwei Wörter nicht gebraucht werden.
 */
export function ensureExtraWords(
  proposed: unknown,
  vocab: VocabEntry[],
  ctx: GenContext,
  used: string[] = vocab.map((v) => v.term),
  max = 4,
  /** Ersatzwörter aus der Notreserve erlaubt? (nicht bei Kollokations-Enden – die sind keine Einzelwörter) */
  ersatz = true
): string[] {
  // Wörter, die in dieser Variante abgefragt werden, dürfen nicht als Ablenker auftauchen (sie würden Lösungen verraten)
  const tested = ctx.variantVocab ?? ctx.allVocab
  const taken = new Set([...used, ...tested.map((v) => v.term)].map(baseForm))
  const words: string[] = []
  const add = (w: string): void => {
    const clean = w.trim()
    if (!clean || taken.has(baseForm(clean))) return
    taken.add(baseForm(clean))
    words.push(clean)
  }
  if (Array.isArray(proposed)) proposed.forEach((w) => typeof w === 'string' && add(w))
  const sprache = ctx.settings.targetLanguage
  const arten = wortartenVon(vocab, sprache)
  if (words.length < MIN_EXTRA_WORDS && ctx.variantVocab) {
    // Nicht abgefragte Wörter der Liste sind unbedenklich – aber nur in einer Wortart, die auch
    // abgefragt wird (02.10.2026); Wörter unbekannter Wortart bleiben erlaubt
    const untested = shuffle(
      ctx.allVocab
        .filter((v) => !ctx.variantVocab!.some((x) => x.id === v.id))
        .filter((v) => {
          const art = wortartVon(v, sprache)
          return !art || !arten.length || arten.includes(art)
        })
        .map((v) => v.term),
      ctx.rng
    )
    for (const o of untested) if (words.length < MIN_EXTRA_WORDS) add(o)
  }
  if (words.length < MIN_EXTRA_WORDS && ersatz) {
    // Notreserve in der Wortart der abgefragten Wörter (generation/wortart.ts); passt keine, bleibt es dabei
    const fallback = shuffle(ersatzWoerter(vocab, sprache), ctx.rng)
    for (const o of fallback) if (words.length < MIN_EXTRA_WORDS) add(o)
  }
  return words.slice(0, max)
}

/*
 * Ablenker bei Multiple Choice (02.10.2026, Befund der Lehrkraft): Die Regel „bevorzugt andere
 * Wörter der Liste ODER Wörter derselben Wortart" widersprach sich – die KI nahm Listenwörter
 * jeder Wortart, die schon an der Form als falsch zu erkennen waren. Jetzt zuerst Wortart und
 * Form, dann Plausibilität, und nur eine Option passt nach Bedeutung bzw. Kollokation.
 */
const MC_DISTRACTOR_RULES = (ctx: GenContext): string =>
  `Rules for the 3 distractors:
- SAME word class as the correct answer, and inflected into exactly the SAME form the gap needs (same tense, person, number, comparison; same kind of article/gender where the sentence fixes it). Every option must fit the sentence grammatically, so that no option can be excluded by its form, its word class or its length alone.
- Plausible at first glance: same topic or a typical confusion (similar meaning field, similar spelling, typical learner mistakes). No absurd or obviously unrelated words.
- Only ONE option fits the meaning or the collocation of the sentence; no distractor may be a synonym or otherwise acceptable.
- Where possible take distractors from this vocabulary list – but ONLY words of the same word class, inflected like the answer: ${ctx.allVocab
    .map((v) => v.term)
    .slice(0, 60)
    .join(', ')}. Otherwise use other words of the same word class at the students' level.`

// ---------- Aufgabentypen ----------

const defs: TaskTypeDef[] = [
  {
    id: 'gapSentences',
    label: 'Lückensätze',
    description: 'Ein Satz pro Vokabel mit Lücke, optional mit Wortkasten und Anfangsbuchstaben.',
    kind: 'gap',
    minLevel: 'Pre-A1',
    usesVocab: true,
    defaultPoints: 1,
    defaultTitle: 'Fill in the gaps',
    defaultInstruction: 'Complete the sentences with the correct words.',
    schema: obj({
      instruction: str('Short task instruction for the students in the target language'),
      items: arr(
        obj({ vocabId: str(), before: str(), answer: str(), middle: str('Only for two-part expressions: text between the two gaps, else empty'), after: str() })
      ),
      extraWords: arr(str(), '2 or 3 extra words for the word box that fit none of the gaps')
    }),
    prompt: (vocab, ctx) =>
      `Task type: gap-fill sentences. Write exactly one sentence for each word below.\n${GAP_RULES}\n${extraWordsRule(vocab, ctx)}\n\nWords:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      const items: GapItem[] = (data.items ?? []).flatMap((it: any) => {
        const v = findVocab(vocab, it.vocabId)
        if (!v) return []
        return [{ id: newId(ctx.rng), vocabId: v.id, ...lueckenSatz(it.before, it.answer, it.after, it.middle), bankWord: v.term }]
      })
      // Ohne Wortkasten hilft der Anfangsbuchstabe, die gesuchte Vokabel eindeutig zu erkennen
      return {
        ...base(this, data, ctx),
        kind: 'gap',
        items,
        wordBank: earlyLevel(ctx),
        firstLetterHint: !earlyLevel(ctx),
        extraBankWords: ensureExtraWords(data.extraWords, vocab, ctx)
      }
    }
  },
  {
    id: 'gapText',
    label: 'Zusammenhängender Lückentext',
    description: 'Kurze Geschichte, E-Mail oder Blogeintrag, in dem alle Vokabeln als Lücken vorkommen.',
    kind: 'gapText',
    minLevel: 'A1+',
    usesVocab: true,
    minItems: 3,
    defaultPoints: 1,
    defaultTitle: 'Complete the text',
    defaultInstruction: 'Read the text and fill in the missing words.',
    schema: obj({
      instruction: str(),
      text: str('The text. Mark each gap with [[vocabId]], e.g. "We [[v3]] the museum."'),
      gaps: arr(obj({ vocabId: str(), answer: str() })),
      extraWords: arr(str(), '2 or 3 extra words for the word box that fit none of the gaps')
    }),
    prompt: (vocab, ctx) =>
      `Task type: coherent gap text (a short story, e-mail, diary or blog entry${ctx.settings.topic ? ` about: ${ctx.settings.topic}` : ''}). Use every word below exactly once as a gap. Mark each gap in "text" with [[vocabId]] and give the fitting form in "gaps".\n${GAP_RULES}\nUse paragraphs (\\n) where natural. Length: about ${Math.max(60, vocab.length * 18)} words.\n${extraWordsRule(vocab, ctx)}\n\nWords:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      return {
        ...base(this, data, ctx),
        kind: 'gapText',
        parts: parseGapText(data, vocab, ctx.rng),
        wordBank: true,
        firstLetterHint: false,
        extraBankWords: ensureExtraWords(data.extraWords, vocab, ctx)
      }
    }
  },
  {
    id: 'dialogue',
    label: 'Dialog ergänzen',
    description: 'Ein Alltagsdialog, in dem die Vokabeln in die Lücken eingesetzt werden.',
    kind: 'gapText',
    minLevel: 'A1',
    usesVocab: true,
    minItems: 3,
    defaultPoints: 1,
    defaultTitle: 'Complete the dialogue',
    defaultInstruction: 'Complete the dialogue with words from the box.',
    schema: obj({
      instruction: str(),
      text: str('The dialogue, one line per turn like "Tom: …\\nAnna: …". Mark each gap with [[vocabId]].'),
      gaps: arr(obj({ vocabId: str(), answer: str() })),
      extraWords: arr(str(), '2 or 3 extra words for the word box that fit none of the gaps')
    }),
    prompt: (vocab, ctx) =>
      `Task type: dialogue completion. Write a natural dialogue between two teenagers${ctx.settings.topic ? ` about: ${ctx.settings.topic}` : ''} (8–14 turns). Use every word below exactly once as a gap marked with [[vocabId]].\n${GAP_RULES}\n${extraWordsRule(vocab, ctx)}\n\nWords:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      return {
        ...base(this, data, ctx),
        kind: 'gapText',
        parts: parseGapText(data, vocab, ctx.rng),
        wordBank: true,
        firstLetterHint: false,
        extraBankWords: ensureExtraWords(data.extraWords, vocab, ctx)
      }
    }
  },
  {
    id: 'matchDefinitions',
    label: 'Erklärungen zuordnen',
    description: 'Einsprachige Erklärungen den Vokabeln zuordnen (mit überzähligen Wörtern).',
    kind: 'match',
    minLevel: 'A1',
    usesVocab: true,
    minItems: 3,
    defaultPoints: 1,
    defaultTitle: 'Match the words and the explanations',
    defaultInstruction: 'Match the explanations (1–…) with the words (a–…). There are more words than you need.',
    schema: obj({
      instruction: str(),
      pairs: arr(obj({ vocabId: str(), definition: str('Learner-friendly explanation that does not contain the word or its word family') })),
      extraWords: arr(str(), 'Exactly 2 plausible extra words (same level, same word class) that match none of the explanations')
    }),
    prompt: (vocab) =>
      `Task type: match explanations to words. Write a simple monolingual explanation (dictionary style for learners) for each word. The explanation must fit only this word – not any other word of the list and not the extra words – and must not contain the word itself or words of its family.\n${UNIQUE_RULE}\n\nWords:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      const pairs = (data.pairs ?? []).map((p: any) => ({ v: findVocab(vocab, p.vocabId), definition: p.definition })).filter((p: any) => p.v)
      const right = shuffle(
        [
          ...pairs.map((p: any) => ({ id: newId(ctx.rng), text: p.v.term, vocabId: p.v.id })),
          ...ensureExtraWords(data.extraWords, vocab, ctx).map((w: string) => ({ id: newId(ctx.rng), text: w, vocabId: undefined }))
        ],
        ctx.rng
      )
      const left = shuffle(pairs, ctx.rng).map((p: any) => ({
        id: newId(ctx.rng),
        vocabId: p.v.id,
        text: p.definition,
        answerId: right.find((r) => r.vocabId === p.v.id)!.id
      }))
      return {
        ...base(this, data, ctx),
        kind: 'match',
        leftLabel: zuordnungsKoepfe(ctx.settings.targetLanguage)[0],
        rightLabel: zuordnungsKoepfe(ctx.settings.targetLanguage)[1],
        left,
        right: right.map(({ id, text }) => ({ id, text }))
      }
    }
  },
  {
    id: 'writeDefinitions',
    label: 'Wörter erklären',
    description: 'Die Schülerinnen und Schüler schreiben selbst eine einsprachige Erklärung.',
    kind: 'open',
    minLevel: 'A2',
    usesVocab: true,
    defaultPoints: 2,
    defaultTitle: 'Explain the words',
    defaultInstruction: 'Explain the words in English. Do not translate them.',
    schema: itemSchema({
      vocabId: str(),
      prompt: str('The word as shown to students, optionally with a short context in brackets for ambiguous words'),
      modelAnswer: str()
    }),
    prompt: (vocab) =>
      `Task type: students write their own explanation of each word in the target language. Give the word as "prompt" (add a short context in brackets only if the word has several meanings) and a model answer at the students' level.\n\nWords:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      return { ...base(this, data, ctx), kind: 'open', items: openItems(vocab, data, ctx, 2) }
    }
  },
  {
    id: 'pictureLabel',
    label: 'Bilder beschriften',
    description: 'Zu eindeutig darstellbaren Vokabeln erscheinen Bilder, die beschriftet werden.',
    kind: 'picture',
    minLevel: 'Pre-A1',
    usesVocab: true,
    defaultPoints: 1,
    defaultTitle: 'Label the pictures',
    defaultInstruction: PICTURE_INSTRUCTIONS.en,
    accepts: (v) => v.depictable === true,
    build(vocab, data, ctx) {
      return {
        ...base(this, data, ctx),
        instruction:
          aufgabenText('pictureLabel', ctx.settings.targetLanguage)?.instruction ??
          PICTURE_INSTRUCTIONS[ctx.settings.targetLanguage] ??
          PICTURE_INSTRUCTIONS.en,
        kind: 'picture',
        items: vocab.map((v) => ({ id: newId(ctx.rng), vocabId: v.id, answer: v.term, imageKeywords: v.imageKeywords ?? [v.term] })),
        // Wortkasten nur, wenn die Lehrkraft ihn will: Die Wörter wären sonst eine Hilfe,
        // die am Gymnasium nicht vorgesehen ist. Mit Kasten kommen überzählige Wörter dazu,
        // damit ein Bild nicht durch Ausschluss zu beschriften ist.
        extraBankWords: ctx.settings.pictureWordBank ? ensureExtraWords([], vocab, ctx) : [],
        wordBank: Boolean(ctx.settings.pictureWordBank),
        columns: 4
      }
    }
  },
  {
    id: 'multipleChoice',
    label: 'Multiple Choice im Kontext',
    description: 'Satz mit Lücke und vier Antwortmöglichkeiten.',
    kind: 'choice',
    minLevel: 'Pre-A1',
    usesVocab: true,
    defaultPoints: 1,
    defaultTitle: 'Choose the correct word',
    defaultInstruction: 'Tick the word that fits best.',
    schema: itemSchema({
      vocabId: str(),
      before: str(),
      after: str(),
      options: arr(
        str(),
        'Exactly 4 options, all of the SAME word class and inflected into the SAME form that the gap needs (tense, person, number, gender/article): the correct answer and 3 distractors'
      ),
      correctIndex: int('0-based index of the correct option')
    }),
    prompt: (vocab, ctx) =>
      `Task type: multiple choice in context. One sentence per word with a gap and 4 options.\n${MC_DISTRACTOR_RULES(ctx)}\n${GAP_RULES}\n\nWords:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      const items = (data.items ?? []).flatMap((it: any) => {
        const v = findVocab(vocab, it.vocabId)
        if (!v || !Array.isArray(it.options) || it.options.length < 2) return []
        const correct = it.options[it.correctIndex] ?? it.options[0]
        const options = shuffle(it.options as string[], ctx.rng)
        return [{ id: newId(ctx.rng), vocabId: v.id, before: it.before, after: it.after, options, correct: options.indexOf(correct) }]
      })
      return { ...base(this, data, ctx), kind: 'choice', items }
    }
  },
  {
    id: 'synonymsAntonyms',
    label: 'Synonyme / Gegenteile',
    description: 'Vokabeln ihren Synonymen oder Gegenteilen zuordnen.',
    kind: 'match',
    minLevel: 'A2',
    usesVocab: true,
    minItems: 3,
    defaultPoints: 1,
    defaultTitle: 'Synonyms and opposites',
    defaultInstruction: 'Match each word with a word that has the same (=) or the opposite (≠) meaning.',
    schema: obj({
      instruction: str(),
      pairs: arr(
        obj({
          vocabId: str(),
          partner: str("A clear synonym or antonym at or below the students' level, same word class as the word"),
          relation: enumOf(['=', '≠'])
        })
      ),
      extraWords: arr(str(), '2 or 3 extra words that are neither synonym nor antonym of any word')
    }),
    /*
     * Mischung verlangt (02.10.2026, Befund der Lehrkraft): Die Anweisung nennt gleiche UND
     * entgegengesetzte Bedeutung, die KI lieferte aber fast nur Synonyme. Mindestens ein Drittel
     * Gegenteile, soweit die Wörter welche haben; was dann wirklich kommt, bestimmt die Anweisung
     * (build) und prüft quality.ts.
     */
    prompt: (vocab) => {
      const min = mindestGegenteile(vocab.length)
      return (
        'Task type: match synonyms and opposites. For each word give ONE clear partner word of the same word class and mark the relation: "=" for a synonym (same meaning), "≠" for an antonym (opposite meaning). Prefer partners that are unambiguous and known at this level.\n' +
        (min
          ? `MIX THE RELATIONS: at least ${min} of the ${vocab.length} pairs must be antonyms (≠), the others synonyms (=). Words with a clear opposite (most adjectives, many verbs and adverbs, some nouns) are the best candidates for ≠. Use fewer antonyms only if the words really have no clear opposite.\n`
          : 'Use an antonym (≠) wherever a clear opposite exists.\n') +
        'The mark must be correct: never mark a synonym as ≠ or an antonym as =. No partner may fit a second word of the list.\n\n' +
        `Words:\n${vocabLines(vocab)}`
      )
    },
    build(vocab, data, ctx) {
      const pairs = (data.pairs ?? [])
        .map((p: any) => ({ v: findVocab(vocab, p.vocabId), partner: String(p.partner ?? '').trim(), rel: p.relation === '≠' ? '≠' : '=' }))
        .filter((p: any) => p.v && p.partner)
      const art = synonymArt(pairs.map((p: any) => p.rel))
      // Anweisung, Überschrift und Spaltenkopf nach dem, was wirklich gefragt ist (nicht die KI-Formulierung)
      const texte = synonymTexte(ctx.settings.targetLanguage, art, sieAnrede(ctx))
      const right = shuffle(
        [
          ...pairs.map((p: any) => ({ id: newId(ctx.rng), text: p.partner, vocabId: p.v.id as string | undefined })),
          ...ensureExtraWords(data.extraWords, vocab, ctx, [...vocab.map((v) => v.term), ...pairs.map((p: any) => p.partner)]).map((w: string) => ({
            id: newId(ctx.rng),
            text: w,
            vocabId: undefined
          }))
        ],
        ctx.rng
      )
      const left = shuffle(pairs, ctx.rng).map((p: any) => ({
        id: newId(ctx.rng),
        vocabId: p.v.id,
        // Das Zeichen am Wort nur bei gemischter Aufgabe – sonst sagt es die Anweisung
        text: art === 'gemischt' ? `${p.v.term} (${p.rel})` : p.v.term,
        answerId: right.find((r) => r.vocabId === p.v.id)!.id,
        relation: p.rel
      }))
      return {
        ...base(this, data, ctx),
        title: texte.title,
        instruction: texte.instruction,
        kind: 'match',
        leftLabel: texte.leftLabel,
        rightLabel: texte.rightLabel,
        left,
        right: right.map(({ id, text }) => ({ id, text }))
      }
    }
  },
  {
    id: 'collocations',
    label: 'Kollokationen',
    description: 'Passende Wortverbindungen zusammenführen (z. B. make + a decision).',
    kind: 'match',
    minLevel: 'A2',
    usesVocab: true,
    minItems: 3,
    defaultPoints: 1,
    defaultTitle: 'Word partners',
    defaultInstruction: 'Match the words to make common word partnerships.',
    schema: obj({
      instruction: str(),
      pairs: arr(obj({ vocabId: str(), first: str(), second: str('first + second form a typical collocation; one of them contains the tested word') })),
      extraWords: arr(str(), '2 or 3 extra endings that do not fit any beginning')
    }),
    prompt: (vocab) =>
      `Task type: collocation matching. For each word create a strong, typical collocation (verb + noun, adjective + noun, verb + preposition …) and split it into "first" and "second". Every "second" part may fit only its own "first" part (check all combinations, including the extra endings).\n\nWords:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      const pairs = (data.pairs ?? []).map((p: any) => ({ v: findVocab(vocab, p.vocabId), first: p.first, second: p.second })).filter((p: any) => p.v)
      const right = shuffle(
        [
          ...pairs.map((p: any) => ({ id: newId(ctx.rng), text: p.second, vocabId: p.v.id as string | undefined })),
          ...ensureExtraWords(
            data.extraWords,
            vocab,
            ctx,
            pairs.map((p: any) => p.second)
          ).map((w: string) => ({ id: newId(ctx.rng), text: w, vocabId: undefined }))
        ],
        ctx.rng
      )
      const left = shuffle(pairs, ctx.rng).map((p: any) => ({
        id: newId(ctx.rng),
        vocabId: p.v.id,
        text: p.first,
        answerId: right.find((r) => r.vocabId === p.v.id)!.id
      }))
      return { ...base(this, data, ctx), kind: 'match', leftLabel: '', rightLabel: '', left, right: right.map(({ id, text }) => ({ id, text })) }
    }
  },
  {
    id: 'wordFormation',
    label: 'Wortbildung',
    description: 'Das Wort in Klammern in die passende Form bringen (z. B. decide → decision).',
    kind: 'gap',
    minLevel: 'A2+',
    usesVocab: true,
    defaultPoints: 1,
    defaultTitle: 'Word formation',
    defaultInstruction: 'Use the word in brackets to form a word that fits the gap.',
    schema: itemSchema({ vocabId: str(), before: str(), stem: str('Related word from the same family shown in brackets'), answer: str(), after: str() }),
    prompt: (vocab) =>
      `Task type: word formation. For each word write a sentence with a gap; "stem" is a different member of the word family (e.g. answer "decision", stem "decide"). The answer is the tested word (or its needed form).\n${GAP_RULES}\n\nWords:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      const items: GapItem[] = (data.items ?? []).flatMap((it: any) => {
        const v = findVocab(vocab, it.vocabId)
        return v ? [{ id: newId(ctx.rng), vocabId: v.id, ...lueckenSatz(it.before, it.answer, it.after), hint: it.stem }] : []
      })
      return { ...base(this, data, ctx), kind: 'gap', items, wordBank: false, firstLetterHint: false, extraBankWords: [] }
    }
  },
  {
    id: 'wordFamily',
    label: 'Wortfamilie',
    description: 'Ein verwandtes Wort ist vorgegeben (decisive, to decide) – gesucht ist das Wort aus der Liste (decision).',
    kind: 'gap',
    minLevel: 'A2',
    usesVocab: true,
    defaultPoints: 1,
    defaultTitle: 'Word families',
    defaultInstruction: 'Which word from the list belongs to the same word family? Write it on the line.',
    schema: itemSchema({
      vocabId: str(),
      related: str('A different word of the same family, NOT the tested word itself (e.g. "decisive" or "to decide" for "decision")'),
      relatedPos: str('Word class of the given word: noun, verb, adjective or adverb'),
      answer: str('The word from the list, exactly as it is written there')
    }),
    prompt: (vocab) =>
      `Task type: word families. For every word give ONE related word of the same family that the students can start from – a different word class if possible (noun → verb or adjective). The given word must never be the tested word itself and must not contain it as a separate word. The answer is the word from the list.

Words:
${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      const items: GapItem[] = (data.items ?? []).flatMap((it: any) => {
        const v = findVocab(vocab, it.vocabId)
        if (!v) return []
        const given = String(it.related ?? '').trim()
        // Das gesuchte Wort darf nicht schon dastehen
        if (!given || given.toLowerCase() === v.term.toLowerCase()) return []
        const label = it.relatedPos ? `${given} (${it.relatedPos})` : given
        return [{ id: newId(ctx.rng), vocabId: v.id, sentences: [{ before: `${label} →`, after: '' }], answer: v.term }]
      })
      return { ...base(this, data, ctx), kind: 'gap', items, wordBank: false, firstLetterHint: false, extraBankWords: [] }
    }
  },
  {
    id: 'mindmap',
    label: 'Mindmap',
    description: 'Oberbegriff in der Mitte, Äste mit vorgegebenen Oberbegriffen oder ganz offen; die gelernten Vokabeln kommen auf die Zweige.',
    kind: 'mindmap',
    minLevel: 'Pre-A1',
    usesVocab: true,
    minItems: 4,
    defaultPoints: 1,
    defaultTitle: 'Mind map',
    defaultInstruction: 'Write the words you have learned about this topic on the lines of the matching branch.',
    /*
     * Echte Mindmap (02.10.2026): Die KI schlägt neben dem Thema 3–5 Oberbegriffe für die Äste vor
     * (Orte, Tätigkeiten, Adjektive …) und ordnet jedes Wort genau einem zu. Die Oberbegriffe
     * kommen immer mit – so lässt sich im Editor ohne neue Anfrage zwischen „mit Oberbegriffen"
     * und „ganz offen" wechseln, und der Lösungsteil zeigt die Wörter je Ast.
     */
    schema: obj({
      instruction: str('Short task instruction for the students in the target language'),
      topic: str('Superordinate topic that fits ALL the words, in the target language (e.g. "School things")'),
      categories: arr(
        obj({
          name: str('Short branch label in the target language, e.g. "places", "activities", "adjectives"'),
          vocabIds: arr(str(), 'ids of the words that belong to this branch')
        }),
        '3 to 5 branches; every word belongs to exactly one branch'
      )
    }),
    prompt: (vocab) =>
      `Task type: mind map. Find ONE superordinate topic that fits all the words (e.g. "School things", "Free time", "Food"). Then divide the words into 3 to 5 branches with short, clear labels in the target language at the students' level – meaning-based sub-topics (e.g. places, people, activities, things, feelings) or word classes where that is clearer (e.g. "adjectives to describe …"). Every word belongs to exactly ONE branch without doubt; each branch should get at least 2 words where possible. The labels must not contain any of the words. List every word by its id.

Words:
${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      const variante = ctx.settings.mindmapVariante ?? 'oberbegriffe'
      const vergeben = new Set<string>()
      const branches: { id: string; label: string }[] = []
      const items: MindmapItem[] = []
      for (const c of Array.isArray(data?.categories) ? data.categories : []) {
        const label = String(c?.name ?? '').trim()
        if (!label) continue
        const id = newId(ctx.rng)
        const woerter = (Array.isArray(c.vocabIds) ? c.vocabIds : []).flatMap((vid: any) => {
          const v = findVocab(vocab, String(vid))
          if (!v || vergeben.has(v.id)) return []
          vergeben.add(v.id)
          return [{ id: newId(ctx.rng), vocabId: v.id, answer: v.term, branchId: id }]
        })
        if (!woerter.length) continue
        branches.push({ id, label })
        items.push(...woerter)
      }
      // Ältere Antwortform (nur Wortliste) und Wörter, die die KI keinem Ast zugeordnet hat: ohne Ast
      const rest = (Array.isArray(data?.words) && !branches.length ? data.words.map((w: any) => findVocab(vocab, w.vocabId)) : vocab).filter(
        (v: VocabEntry | undefined): v is VocabEntry => Boolean(v) && !vergeben.has(v!.id)
      )
      for (const v of rest) {
        vergeben.add(v.id)
        items.push({ id: newId(ctx.rng), vocabId: v.id, answer: v.term })
      }
      return {
        ...base(this, data, ctx),
        // Anweisung nach der Form – die KI kennt die gewählte Form nicht
        instruction: mindmapAnweisungFuer(ctx.settings, variante),
        kind: 'mindmap',
        topic: String(data?.topic ?? '').trim() || 'Topic',
        items,
        branches,
        variante,
        freierAst: variante === 'oberbegriffe' && Boolean(ctx.settings.mindmapFreierAst)
      }
    }
  },
  {
    id: 'oddOneOut',
    label: 'Odd one out',
    description: 'Welches Wort passt nicht in die Reihe? Mit kurzer Begründung.',
    kind: 'oddOneOut',
    minLevel: 'A2',
    usesVocab: true,
    defaultPoints: 1,
    defaultTitle: 'Odd one out',
    defaultInstruction: 'Circle the word that does not belong to the group and say why.',
    schema: itemSchema({
      vocabId: str(),
      words: arr(str(), 'Exactly 4 words, including the tested word'),
      answer: str('The odd word'),
      reason: str("Short reason at the students' level")
    }),
    prompt: (vocab) =>
      `Task type: odd one out. Create a group of 4 words for each tested word (the tested word must be in the group, either as odd word or as a member). There must be exactly one word that does not belong, for one clear, meaning-based reason (not spelling or grammar); no other word may be arguable.\n\nWords:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      const items = (data.items ?? []).flatMap((it: any) => {
        const v = findVocab(vocab, it.vocabId)
        return v ? [{ id: newId(ctx.rng), vocabId: v.id, words: shuffle(it.words as string[], ctx.rng), answer: it.answer, reason: it.reason }] : []
      })
      return { ...base(this, data, ctx), kind: 'oddOneOut', items, askReason: true }
    }
  },
  {
    id: 'categorize',
    label: 'Wortfelder sortieren',
    description: 'Vokabeln in passende Oberbegriffe einsortieren.',
    kind: 'categorize',
    minLevel: 'Pre-A1',
    usesVocab: true,
    minItems: 4,
    defaultPoints: 0.5,
    defaultTitle: 'Sort the words',
    defaultInstruction: 'Put the words into the correct groups.',
    schema: obj({
      instruction: str(),
      categories: arr(str(), '2–4 clear category names'),
      words: arr(obj({ vocabId: str(), category: str('Exactly one of the category names') }))
    }),
    prompt: (vocab) =>
      `Task type: sorting words into categories (word fields). Find 2–4 clear, meaning-based categories so that every word belongs to exactly one category without doubt (no word may fit two categories).\n\nWords:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      const categories = (data.categories ?? []).map((name: string) => ({ id: newId(ctx.rng), name }))
      const words = shuffle<CategorizeBlock['words'][number]>(
        (data.words ?? []).flatMap((w: any) => {
          const v = findVocab(vocab, w.vocabId)
          const cat = categories.find((c: any) => c.name === w.category)
          return v && cat ? [{ id: newId(ctx.rng), vocabId: v.id, text: v.term, categoryId: cat.id }] : []
        }),
        ctx.rng
      )
      return { ...base(this, data, ctx), kind: 'categorize', categories, words }
    }
  },
  {
    id: 'writeSentences',
    label: 'Sätze bilden',
    description: 'Eigene Sätze mit den Vokabeln schreiben – an Haupt- und Realschule mit kleiner Situationsvorgabe, am Gymnasium nur das Wort.',
    kind: 'open',
    minLevel: 'A2',
    usesVocab: true,
    defaultPoints: 2,
    defaultTitle: 'Write sentences',
    defaultInstruction: 'Write a sentence with each word. Show that you know what it means.',
    schema: itemSchema({ vocabId: str(), prompt: str('The word plus a short situation, e.g. "to explore – your last holiday"'), modelAnswer: str() }),
    prompt: (vocab, ctx) =>
      mitSituation(ctx.settings)
        ? `Task type: students write one meaningful sentence with each word. "prompt" shows the word and a short situation that helps them show the meaning. Give a model answer.\n\nWords:\n${vocabLines(vocab)}`
        : `Task type: students write one meaningful sentence with each word. "prompt" is ONLY the word itself – no situation, no example, no hint. Do not write any example or "possible answer" into the instruction. Give a model answer (for the answer key only).\n\nWords:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      const b = base(this, data, ctx)
      if (mitSituation(ctx.settings)) return { ...b, kind: 'open', items: openItems(vocab, data, ctx, 2) }
      // Gymnasium (Wunsch der Lehrkraft, 02.10.2026): nur das Wort – keine Situation, kein Beispiel
      return {
        ...b,
        instruction: ohneBeispielHinweis(b.instruction) || this.defaultInstruction,
        kind: 'open',
        items: openItems(vocab, data, ctx, 2).map((it: { vocabId?: string; prompt: string }) => ({
          ...it,
          prompt: findVocab(vocab, it.vocabId ?? '')?.term ?? it.prompt
        }))
      }
    }
  },
  {
    id: 'mediation',
    label: 'Sinngemäß übertragen (Mediation)',
    description: 'Deutsche Sätze sinngemäß in die Zielsprache übertragen, die Vokabel muss verwendet werden.',
    kind: 'open',
    minLevel: 'A2',
    usesVocab: true,
    defaultPoints: 2,
    defaultTitle: 'Mediation',
    defaultInstruction: 'Say it in English. Use the word in brackets.',
    schema: itemSchema({ vocabId: str(), prompt: str('German sentence followed by the target word in brackets'), modelAnswer: str() }),
    prompt: (vocab) =>
      `Task type: mediation. For each word write a natural GERMAN sentence from everyday life that students should render in the target language using the tested word. "prompt" = German sentence + " (" + word + ")". Keep the German simple so the difficulty lies in the vocabulary.\n\nWords:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      return { ...base(this, data, ctx), kind: 'open', items: openItems(vocab, data, ctx, 2) }
    }
  },
  {
    id: 'crossword',
    label: 'Kreuzworträtsel',
    description: 'Kreuzworträtsel mit einsprachigen Hinweisen (nur Einzelwörter).',
    kind: 'crossword',
    minLevel: 'Pre-A1',
    usesVocab: true,
    minItems: 4,
    defaultPoints: 1,
    defaultTitle: 'Crossword',
    defaultInstruction: 'Read the clues and complete the crossword.',
    accepts: (v) => isCrosswordWord(v.term),
    schema: itemSchema({ vocabId: str(), clue: str('Monolingual clue: short explanation or sentence with a gap (___); must not contain the word') }),
    prompt: (vocab) =>
      `Task type: crossword clues. Write one clear clue for each word (a short explanation or a sentence with ___). The clue must lead to exactly this word in its given form and must not fit any other word of the list.\n\nWords:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      const clues = new Map<string, string>((data.items ?? []).map((it: any) => [it.vocabId, it.clue]))
      const layout = buildCrossword(
        vocab.map((v) => ({ id: v.id, word: crosswordForm(v.term) })),
        ctx.rng
      )
      const entries = layout.placed.map((p) => ({
        id: newId(ctx.rng),
        vocabId: p.id,
        answer: p.word,
        clue: clues.get(p.id) ?? '',
        row: p.row,
        col: p.col,
        dir: p.dir,
        number: p.number
      }))
      return {
        ...base(this, data, ctx),
        kind: 'crossword',
        rows: layout.rows,
        cols: layout.cols,
        entries,
        unplaced: layout.unplaced.map((id) => vocab.find((v) => v.id === id)?.term ?? id)
      }
    }
  },
  {
    id: 'scrambled',
    label: 'Buchstabensalat mit Hinweis',
    description: 'Buchstaben ordnen, ein Kontextsatz hilft beim Erkennen.',
    kind: 'scramble',
    minLevel: 'Pre-A1',
    usesVocab: true,
    defaultPoints: 1,
    defaultTitle: 'Unscramble the words',
    defaultInstruction: 'Put the letters in the right order. The sentences help you.',
    accepts: (v) => isCrosswordWord(v.term),
    schema: itemSchema({ vocabId: str(), hint: str('Sentence with ___ where the word fits') }),
    prompt: (vocab) =>
      `Task type: scrambled letters with context. Write a short sentence with ___ for each word so that only this word (in its given base form) fits.\n${UNIQUE_RULE}\n\nWords:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      const hints = new Map<string, string>((data.items ?? []).map((it: any) => [it.vocabId, it.hint]))
      const items = vocab.map((v) => {
        const answer = v.term.replace(/^(to|a|an|the)\s+/i, '')
        return { id: newId(ctx.rng), vocabId: v.id, hint: hints.get(v.id) ?? '', scrambled: scrambleWord(answer, ctx.rng), answer }
      })
      return { ...base(this, data, ctx), kind: 'scramble', items }
    }
  },
  {
    id: 'wrongWord',
    label: 'Falsches Wort ersetzen',
    description: 'Im Satz steht ein unpassendes Wort, das durch die richtige Vokabel ersetzt wird.',
    kind: 'gap',
    minLevel: 'B1',
    usesVocab: true,
    defaultPoints: 1,
    defaultTitle: 'Correct the mistakes',
    defaultInstruction: 'One word in each sentence is wrong. Cross it out and write the correct word.',
    schema: itemSchema({
      vocabId: str(),
      before: str(),
      wrongWord: str('A real word that does not fit here (e.g. a false friend, a similar-looking or related word)'),
      after: str(),
      answer: str()
    }),
    prompt: (vocab) =>
      `Task type: wrong word. For each tested word write a sentence where the tested word is replaced by a wrong but plausible word (false friend, confusable word, wrong word of the same field). "answer" is the correct form. The wrong word must be clearly wrong, and only one word in the sentence may be wrong.\n${GAP_RULES}\n\nWords:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      const items: GapItem[] = (data.items ?? []).flatMap((it: any) => {
        const v = findVocab(vocab, it.vocabId)
        return v ? [{ id: newId(ctx.rng), vocabId: v.id, sentences: [{ before: it.before, after: it.after }], answer: it.answer, hint: it.wrongWord }] : []
      })
      return { ...base(this, data, ctx), kind: 'gap', items, wordBank: false, firstLetterHint: false, extraBankWords: [] }
    }
  },
  {
    id: 'twoSentences',
    label: 'Ein Wort – zwei Sätze',
    description: 'Ein Wort passt in beide Sätze (verschiedene Bedeutungen oder Verwendungen).',
    kind: 'gap',
    minLevel: 'B1+',
    usesVocab: true,
    defaultPoints: 1,
    defaultTitle: 'One word – two sentences',
    defaultInstruction: 'Find one word that fits both sentences.',
    schema: itemSchema({ vocabId: str(), before1: str(), after1: str(), before2: str(), after2: str(), answer: str('Same form in both sentences') }),
    prompt: (vocab) =>
      `Task type: one word fits two sentences. For each word write two different sentences (ideally using different meanings or typical collocations) where exactly the same form fits both gaps and no other word (from the list or in general) fits both.\n${GAP_RULES}\n\nWords:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      const items: GapItem[] = (data.items ?? []).flatMap((it: any) => {
        const v = findVocab(vocab, it.vocabId)
        return v
          ? [
              {
                id: newId(ctx.rng),
                vocabId: v.id,
                sentences: [
                  { before: it.before1, after: it.after1 },
                  { before: it.before2, after: it.after2 }
                ],
                answer: it.answer
              }
            ]
          : []
      })
      return { ...base(this, data, ctx), kind: 'gap', items, wordBank: false, firstLetterHint: false, extraBankWords: [] }
    }
  },
  {
    id: 'trueFalse',
    label: 'Richtig oder falsch?',
    description: 'Aussagen zur Wortbedeutung beurteilen und falsche Aussagen korrigieren.',
    kind: 'trueFalse',
    minLevel: 'A2',
    usesVocab: true,
    defaultPoints: 1,
    defaultTitle: 'True or false?',
    defaultInstruction: 'Are the sentences true or false? Correct the false ones.',
    schema: itemSchema({
      vocabId: str(),
      statement: str('Statement about the meaning/use of the word, word shown in the statement'),
      isTrue: bool(),
      correction: str('Corrected statement if false, otherwise empty string')
    }),
    prompt: (vocab) =>
      `Task type: true/false statements about word meaning (e.g. "You use a ladder to climb up."). About half of the statements should be false in a way that shows whether students understand the word. Never make statements false through trivial details.\n\nWords:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      const items = (data.items ?? []).flatMap((it: any) => {
        const v = findVocab(vocab, it.vocabId)
        return v ? [{ id: newId(ctx.rng), vocabId: v.id, statement: it.statement, isTrue: Boolean(it.isTrue), correction: it.correction ?? '' }] : []
      })
      return { ...base(this, data, ctx), kind: 'trueFalse', items, askCorrection: true }
    }
  },
  {
    id: 'freeText',
    label: 'Freie Aufgabe',
    description: 'Eigener Text oder eigene Aufgabe mit Schreiblinien.',
    kind: 'freeText',
    minLevel: 'Pre-A1',
    usesVocab: false,
    defaultPoints: 0,
    defaultTitle: 'Extra task',
    defaultInstruction: '',
    build(_vocab, data, ctx) {
      return { ...base(this, data, ctx), kind: 'freeText', text: '', lines: 4 }
    }
  },
  /*
   * ---------- LATEIN ----------
   *
   * Grundlage: Recherche vom 24.09.2026, zusammengefasst in `didactics/latein.ts`.
   * Der erste Typ ist der amtliche Muster-Vokabeltest; die drei weiteren decken die
   * Wortschatzarbeit ab, die die Lehrplaene fuer Latein ausdruecklich verlangen
   * (Wortbildung, Wortfamilien, Lehn- und Fremdwoerter, Monosemieren).
   */
  {
    id: 'latinForms',
    label: 'Nennform und Bedeutungen (Latein)',
    description: 'Die Vokabel steht da; ergänzt werden die verlangte Form und alle Bedeutungen. Aufbau des amtlichen Muster-Vokabeltests.',
    kind: 'latinForms',
    minLevel: 'Pre-A1',
    usesVocab: true,
    defaultPoints: 2,
    defaultTitle: 'Formen und Bedeutungen',
    defaultInstruction: 'Ergänze zu jeder Vokabel die verlangte Form und alle Bedeutungen.',
    defaultInstructionSie: 'Ergänzen Sie zu jeder Vokabel die verlangte Form und alle Bedeutungen.',
    /*
     * Ohne KI: Form und Bedeutungen stehen bereits in der Vokabelliste. Die KI zu fragen
     * hiesse, sie etwas erfinden zu lassen, was die Lehrkraft schon eingegeben hat – und
     * ein erfundener Genitiv faellt erst beim Korrigieren auf.
     */
    build(vocab, data, ctx) {
      /*
       * `mitNennform` hier und nicht beim Einlesen: Die Zielsprache steht erst in den
       * Einstellungen fest, die Vokabelliste kommt aber schon vorher herein – über Einfügen,
       * Datei, Schulbuch oder Bibliothek. An dieser Stelle ist sicher, dass es Latein ist.
       * Griechisch (30.09.2026): eigene Nennformen (Artikel statt Genus) und auf Wunsch die Umschrift.
       */
      const sprache = ctx.settings.targetLanguage
      const griechisch = istGriechisch(sprache)
      return {
        ...base(this, data, ctx),
        kind: 'latinForms',
        pointsForm: NENNFORM_PUNKTE.form,
        pointsMeaning: NENNFORM_PUNKTE.bedeutung,
        items: vocab.map(griechisch ? mitGriechischerNennform : mitNennform).map((v) => ({
          id: newId(ctx.rng),
          vocabId: v.id,
          term: v.term,
          formLabel: nennformLabel(v, sprache),
          form: v.nennform ?? '',
          meanings: v.translation,
          ...(griechisch && ctx.settings.umschrift ? { transliteration: griechischUmschrift(v.term) } : {})
        }))
      }
    }
  },
  {
    id: 'latinLoanWords',
    label: 'Fremd- und Lehnwörter (Latein)',
    description: 'Zu deutschen Fremdwörtern wird das lateinische bzw. griechische Ursprungswort gesucht – und umgekehrt.',
    kind: 'open',
    minLevel: 'Pre-A1',
    usesVocab: true,
    defaultPoints: 1,
    defaultTitle: 'Fremd- und Lehnwörter',
    defaultInstruction: 'Nenne zu jedem Wort ein deutsches Fremd- oder Lehnwort und erkläre den Zusammenhang.',
    defaultInstructionSie: 'Nennen Sie zu jedem Wort ein deutsches Fremd- oder Lehnwort und erklären Sie den Zusammenhang.',
    schema: itemSchema({
      vocabId: str(),
      prompt: str('Das lateinische bzw. griechische Wort, wie es den Lernenden vorgelegt wird'),
      modelAnswer: str('Deutsches Fremd- oder Lehnwort und in einem Satz der Bedeutungszusammenhang')
    }),
    prompt: (vocab, ctx) =>
      `Aufgabentyp: Zu jedem ${alteSpracheAdjektiv(ctx.settings.targetLanguage)}en Wort sollen die Lernenden ein deutsches Fremd- oder Lehnwort nennen und den Bedeutungszusammenhang erklären.\n` +
      'Nimm nur Wörter, zu denen es wirklich ein gebräuchliches deutsches Fremd- oder Lehnwort gibt; erfinde keine Verwandtschaft. Gibt es keines, lass das Wort weg.\n\n' +
      `Wörter:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      return { ...base(this, data, ctx), kind: 'open', items: openItems(vocab, data, ctx, 2) }
    }
  },
  {
    id: 'latinWordFormation',
    label: 'Wortbildung und Wortfamilie (Latein)',
    description: 'Komposita und Ableitungen werden in Bestandteile zerlegt oder einer Wortfamilie zugeordnet.',
    kind: 'open',
    minLevel: 'Pre-A1',
    usesVocab: true,
    defaultPoints: 2,
    defaultTitle: 'Wortbildung',
    defaultInstruction: 'Zerlege die Wörter in ihre Bestandteile und gib die Bedeutung der Teile an.',
    defaultInstructionSie: 'Zerlegen Sie die Wörter in ihre Bestandteile und geben Sie die Bedeutung der Teile an.',
    schema: itemSchema({
      vocabId: str(),
      prompt: str('Das zusammengesetzte oder abgeleitete Wort'),
      modelAnswer: str('Zerlegung in Präfix, Stamm und Endung mit den Bedeutungen der Teile')
    }),
    prompt: (vocab, ctx) =>
      'Aufgabentyp: Wortbildung. Die Lernenden zerlegen Komposita und Ableitungen in Präfix, Stamm und Suffix und geben die Bedeutung der Teile an.\n' +
      (istGriechisch(ctx.settings.targetLanguage)
        ? 'Berücksichtige Assimilation und Augment (συν+λέγω → συλλέγω), wenn sie vorkommen.\n'
        : 'Berücksichtige Assimilation (ad+ferre → afferre) und Vokalschwächung (per+facere → perficere), wenn sie vorkommen.\n') +
      'Nimm nur Wörter, die wirklich zusammengesetzt oder abgeleitet sind.\n\n' +
      `Wörter:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      return { ...base(this, data, ctx), kind: 'open', items: openItems(vocab, data, ctx, 2) }
    }
  },
  {
    id: 'latinContext',
    label: 'Bedeutung im Zusammenhang (Latein)',
    description: 'Ein kurzer lateinischer bzw. griechischer Satz zeigt das Wort im Kontext; gewählt wird die dort passende Bedeutung.',
    kind: 'choice',
    minLevel: 'Pre-A1',
    usesVocab: true,
    defaultPoints: 1,
    defaultTitle: 'Welche Bedeutung passt?',
    defaultInstruction: 'Kreuze die Bedeutung an, die im Satz passt.',
    defaultInstructionSie: 'Kreuzen Sie die Bedeutung an, die im Satz passt.',
    schema: itemSchema({
      vocabId: str(),
      sentence: str('Kurzer, einfacher Satz in der Zielsprache (Latein bzw. Altgriechisch), in dem das Wort vorkommt'),
      options: arr(str(), 'Drei deutsche Bedeutungen; nur eine passt im Satz'),
      correct: int('Index der passenden Bedeutung, beginnend bei 0')
    }),
    prompt: (vocab, ctx) =>
      `Aufgabentyp: Monosemieren. Zu jedem mehrdeutigen Wort ein kurzer ${alteSpracheAdjektiv(ctx.settings.targetLanguage)}er Satz und drei deutsche Bedeutungen, von denen nur eine im Satz passt.\n` +
      'Die falschen Bedeutungen sind ECHTE Bedeutungen des Wortes, die hier nur nicht passen – keine erfundenen.\n' +
      // Ablenker nicht schon an der Form erkennbar (02.10.2026): gleiche Wortart und Form im Deutschen
      'Alle drei Bedeutungen stehen in derselben Wortart und Form (z. B. alle als Infinitiv, alle als Nomen mit bzw. ohne Artikel), sind auf den ersten Blick plausibel, und nur eine passt nach Sinn und Zusammenhang des Satzes.\n' +
      'Der Satz benutzt nur Formen und Vokabeln, die zum Lernstand passen.\n\n' +
      `Wörter:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      return {
        ...base(this, data, ctx),
        kind: 'choice',
        items: (data.items ?? []).flatMap((it: any) => {
          const v = findVocab(vocab, it.vocabId)
          const options = (it.options ?? []).map((o: any) => String(o)).filter(Boolean)
          if (!v || options.length < 2) return []
          return [
            {
              id: newId(ctx.rng),
              vocabId: v.id,
              prompt: String(it.sentence ?? ''),
              options,
              correct: Math.max(0, Math.min(options.length - 1, Number(it.correct) || 0))
            }
          ]
        })
      }
    }
  },
  /*
   * ---------- SPRACHBESONDERE AUFGABEN (30.09.2026, didactics/sprachAufgaben.ts) ----------
   *
   * Chinesisch/Japanisch: Zeichen – Lesung – Bedeutung; Russisch/Polnisch/Tschechisch: Aspektpaare;
   * Kasus im Satz (auch Türkisch, Neugriechisch); Arabisch: Wurzel. Welche Sprache welche Aufgabe
   * bekommt, regelt `passtZurSprache`.
   */
  {
    id: 'readingForms',
    label: 'Zeichen: Lesung und Bedeutung',
    description:
      'Das Wort steht in Schriftzeichen da; ergänzt werden die Lesung (Pinyin bzw. Hiragana) und die deutsche Bedeutung – wie die drei Spalten im Lehrwerk.',
    kind: 'latinForms',
    minLevel: 'Pre-A1',
    usesVocab: true,
    defaultPoints: 2,
    defaultTitle: 'Reading and meaning',
    defaultInstruction: 'Write the reading and the German meaning of each word.',
    // Die Lesung steht meist in der Liste; die KI ergänzt nur fehlende (mit Hinweis zum Prüfen)
    needsAi: (vocab, ctx) => vocab.some((v) => !mitLesung(v, ctx.settings.targetLanguage).lesung),
    schema: obj({ items: arr(obj({ vocabId: str(), reading: str('Pinyin with tone marks (Chinese) or hiragana (Japanese)') })) }),
    prompt: (vocab, ctx) =>
      `Task type: give the standard reading of each word – ${
        ctx.settings.targetLanguage === 'ja' ? 'in hiragana' : 'in Hanyu Pinyin with tone marks (not tone numbers), syllables of one word written together'
      }. Only for these words (the others already have a reading):\n${vocabLines(vocab.filter((v) => !mitLesung(v, ctx.settings.targetLanguage).lesung))}`,
    build(vocab, data, ctx) {
      const sprache = ctx.settings.targetLanguage
      const ki = new Map<string, string>((data.items ?? []).map((it: any) => [String(it.vocabId), String(it.reading ?? '').trim()]))
      return {
        ...base(this, data, ctx),
        kind: 'latinForms',
        pointsForm: 1,
        pointsMeaning: 1,
        items: vocab
          .map((v) => mitLesung(v, sprache))
          .map((v) => ({
            id: newId(ctx.rng),
            vocabId: v.id,
            term: v.term,
            formLabel: LESUNG_LABEL[sprache] ?? 'Reading:',
            form: v.lesung ?? ki.get(v.id) ?? '',
            meanings: v.translation
          }))
      }
    }
  },
  {
    id: 'readingMatch',
    label: 'Zeichen, Lesung und Bedeutung zuordnen',
    description: 'Schriftzeichen (1, 2 …) werden Lesung und Bedeutung (a, b …) zugeordnet.',
    kind: 'match',
    minLevel: 'Pre-A1',
    usesVocab: true,
    minItems: 3,
    defaultPoints: 1,
    defaultTitle: 'Characters, reading and meaning',
    defaultInstruction: 'Match the characters (1–…) with the reading and the meaning (a–…).',
    needsAi: (vocab, ctx) => vocab.some((v) => !mitLesung(v, ctx.settings.targetLanguage).lesung),
    schema: obj({ items: arr(obj({ vocabId: str(), reading: str('Pinyin with tone marks (Chinese) or hiragana (Japanese)') })) }),
    prompt: (vocab, ctx) =>
      `Task type: give the standard reading of each word – ${
        ctx.settings.targetLanguage === 'ja' ? 'in hiragana' : 'in Hanyu Pinyin with tone marks'
      }. Only for these words:\n${vocabLines(vocab.filter((v) => !mitLesung(v, ctx.settings.targetLanguage).lesung))}`,
    build(vocab, data, ctx) {
      const sprache = ctx.settings.targetLanguage
      const ki = new Map<string, string>((data.items ?? []).map((it: any) => [String(it.vocabId), String(it.reading ?? '').trim()]))
      const rechts = (v: VocabEntry): string => [v.lesung ?? ki.get(v.id) ?? '', v.translation].filter(Boolean).join(' – ')
      const woerter = vocab.map((v) => mitLesung(v, sprache))
      // Überzählige Angaben nur aus nicht abgefragten Wörtern der Liste mit eigener Lesung – sie verraten nichts
      const getestet = new Set((ctx.variantVocab ?? vocab).map((v) => v.id))
      const extra = shuffle(
        ctx.allVocab.map((v) => mitLesung(v, sprache)).filter((v) => !getestet.has(v.id) && v.lesung),
        ctx.rng
      ).slice(0, 2)
      const right = shuffle(
        [
          ...woerter.map((v) => ({ id: newId(ctx.rng), text: rechts(v), vocabId: v.id as string | undefined })),
          ...extra.map((v) => ({ id: newId(ctx.rng), text: rechts(v), vocabId: undefined }))
        ],
        ctx.rng
      )
      const left = shuffle(woerter, ctx.rng).map((v) => ({
        id: newId(ctx.rng),
        vocabId: v.id,
        text: v.term,
        answerId: right.find((r) => r.vocabId === v.id)!.id
      }))
      return {
        ...base(this, data, ctx),
        kind: 'match',
        leftLabel: sprache === 'ja' ? '漢字' : '汉字',
        rightLabel: sprache === 'ja' ? 'よみ – いみ' : '拼音 – 意思',
        left,
        right: right.map(({ id, text }) => ({ id, text }))
      }
    }
  },
  {
    id: 'aspectPairs',
    label: 'Aspektpaare',
    description: 'Zu jedem Verb wird der Aspektpartner ergänzt (делать – сделать, robić – zrobić, dělat – udělat), dazu die Bedeutung.',
    kind: 'latinForms',
    minLevel: 'A1+',
    usesVocab: true,
    defaultPoints: 2,
    defaultTitle: 'Aspect pairs',
    defaultInstruction: 'Write the aspect partner of each verb.',
    accepts: (v) => /verb|глаг|czasown|sloves|\bv\.?$/i.test(v.pos ?? '') || /(ть|ться|ти|чь|ć|ść|c|at|át|et|ět|it|ít|out|ovat|nout)$/u.test(v.term.trim()),
    schema: itemSchema({
      vocabId: str(),
      partner: str('The other verb of the aspect pair (perfective for an imperfective verb and vice versa), infinitive, exactly as in standard dictionaries')
    }),
    prompt: (vocab) =>
      'Task type: aspect pairs. For each verb give its aspect partner (imperfective ↔ perfective) as used in school textbooks (e.g. делать – сделать, говорить – сказать, robić – zrobić, dělat – udělat). Skip words that are not verbs or have no common aspect partner (biaspectual verbs, verbs of motion without a clear pair). Never invent forms.\n\n' +
      `Verbs:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      const sprache = ctx.settings.targetLanguage
      return {
        ...base(this, data, ctx),
        kind: 'latinForms',
        pointsForm: 1,
        pointsMeaning: 1,
        items: (data.items ?? []).flatMap((it: any) => {
          const v = findVocab(vocab, it.vocabId)
          const partner = String(it.partner ?? '').trim()
          return v && partner
            ? [
                {
                  id: newId(ctx.rng),
                  vocabId: v.id,
                  term: v.term,
                  formLabel: ASPEKT_LABEL[sprache] ?? 'Aspect partner:',
                  form: partner,
                  meanings: v.translation
                }
              ]
            : []
        })
      }
    }
  },
  {
    id: 'caseForms',
    label: 'Kasus im Satz',
    description:
      'Das Wort in Klammern wird in den Fall gesetzt, den der Satz verlangt (Russisch, Polnisch, Tschechisch, Türkisch mit Vokalharmonie, Neugriechisch).',
    kind: 'gap',
    minLevel: 'A1+',
    usesVocab: true,
    defaultPoints: 1,
    defaultTitle: 'Cases',
    defaultInstruction: 'Put the words in brackets into the correct case.',
    accepts: (v) => !/verb|глаг|czasown|sloves|fiil|ρήμα|adv/i.test(v.pos ?? ''),
    schema: itemSchema({
      vocabId: str(),
      before: str(),
      base: str('Dictionary form of the tested word, shown in brackets'),
      answer: str('The tested word in the case the sentence requires'),
      after: str()
    }),
    prompt: (vocab, ctx) =>
      'Task type: cases. For each noun (or adjective/pronoun) write one sentence with a gap. The gap needs the tested word in a case OTHER than the dictionary form, clearly required by a preposition, verb or construction in the sentence, so that exactly one form is correct. "base" is the dictionary form shown in brackets, "answer" the correct inflected form' +
      (ctx.settings.targetLanguage === 'tr'
        ? ' (Turkish: case suffix with vowel harmony and consonant changes, e.g. ev → evde, kitap → kitabı; the suffix is written together with the word, after a proper name with an apostrophe)'
        : '') +
      '. Use only cases the class already knows (see VORWISSEN DER KLASSE); in early learning years prefer the most frequent cases (e.g. prepositional/locative, accusative).\n' +
      `${GAP_RULES}\n\nWords:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      const items: GapItem[] = (data.items ?? []).flatMap((it: any) => {
        const v = findVocab(vocab, it.vocabId)
        return v ? [{ id: newId(ctx.rng), vocabId: v.id, ...lueckenSatz(it.before, it.answer, it.after), hint: it.base || v.term }] : []
      })
      return { ...base(this, data, ctx), kind: 'gap', items, wordBank: false, firstLetterHint: false, extraBankWords: [] }
    }
  },
  {
    id: 'arabicRoots',
    label: 'Wurzel und Bedeutung (Arabisch)',
    description: 'Zu jedem Wort werden die Wurzelradikale (z. B. ك ت ب) und die Bedeutung angegeben – so wird im Wörterbuch gesucht.',
    kind: 'latinForms',
    minLevel: 'A1+',
    usesVocab: true,
    defaultPoints: 2,
    defaultTitle: 'Root and meaning',
    defaultInstruction: 'Write the root and the German meaning of each word.',
    schema: itemSchema({ vocabId: str(), root: str('The three (or four) root consonants, separated by spaces, e.g. ك ت ب') }),
    prompt: (vocab) =>
      'Task type: roots. For each Arabic word give its root consonants (usually three, e.g. كِتاب → ك ت ب; مَدرَسة → د ر س). Skip loanwords, particles and words without a clear root. Never guess a root.\n\n' +
      `Words:\n${vocabLines(vocab)}`,
    build(vocab, data, ctx) {
      return {
        ...base(this, data, ctx),
        kind: 'latinForms',
        pointsForm: 1,
        pointsMeaning: 1,
        items: (data.items ?? []).flatMap((it: any) => {
          const v = findVocab(vocab, it.vocabId)
          const root = String(it.root ?? '').trim()
          return v && root ? [{ id: newId(ctx.rng), vocabId: v.id, term: v.term, formLabel: WURZEL_LABEL, form: root, meanings: v.translation }] : []
        })
      }
    }
  },
  /*
   * ---------- UNREGELMÄSSIGE VERBEN (30.09.2026) ----------
   *
   * Ohne KI aus der Verbliste des Lehrwerks bzw. der Standardliste (shared/verben) – dieselben
   * Aufgaben wie im Grammatiktest und im Arbeitsblatt. Die Verben stellt die Lehrkraft bei der
   * Aufgabe ein; ohne Einstellung nimmt die App die unregelmäßigen Verben der Vokabelliste.
   */
  {
    id: 'irregularVerbs',
    label: 'Unregelmäßige Verben (Tabelle)',
    description: 'Formentabelle aus der Verbliste des Lehrwerks (z. B. infinitive – simple past – past participle – German), je Form ein Punkt.',
    kind: 'verbTable',
    minLevel: 'A1',
    usesVocab: false,
    defaultPoints: 1,
    defaultTitle: 'Irregular verbs',
    // Die Anweisung setzt der Erzeuger (Zielsprache bzw. Deutsch mit du/Sie, shared/verben/formate.ts)
    defaultInstruction: 'Complete the table.',
    build(_vocab, data, ctx) {
      return baueVerbBlock(ctx.settings, ctx.allVocab, ctx.rng, base(this, data, ctx), ctx.known)
    }
  }
]

export const TASK_TYPES = Object.fromEntries(defs.map((d) => [d.id, d])) as Record<TaskTypeId, TaskTypeDef>
export const TASK_TYPE_LIST = defs

// ---------- gemeinsame Bausteine ----------

function openItems(vocab: VocabEntry[], data: any, ctx: GenContext, lines: number) {
  return (data.items ?? []).flatMap((it: any) => {
    const v = findVocab(vocab, it.vocabId)
    return v ? [{ id: newId(ctx.rng), vocabId: v.id, prompt: it.prompt || v.term, modelAnswer: it.modelAnswer ?? '', lines }] : []
  })
}

export function parseGapText(data: any, vocab: VocabEntry[], rng: Rng): TextPart[] {
  const text: string = data.text ?? ''
  const gaps = new Map<string, string>((data.gaps ?? []).map((g: any) => [g.vocabId, g.answer]))
  const parts: TextPart[] = []
  const re = /\[\[([^\]]+)\]\]/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push({ type: 'text', text: text.slice(last, m.index) })
    const id = m[1].trim()
    const v = findVocab(vocab, id, id)
    parts.push({ type: 'gap', id: newId(rng), vocabId: v?.id, answer: gaps.get(id) ?? v?.term ?? id, bankWord: v?.term })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) })
  /*
   * Zweiteilige Wendung (02.10.2026): Steht dieselbe Vokabel zweimal als Lücke und hat ihre Lösung
   * zwei Teile („not only … but also"), bekommt jede Lücke ihren Teil; die zweite zählt mit der
   * ersten als ein Punkt. Danach an jeder Lücke doppelte Wörter aus der Lösung nehmen.
   */
  const gesehen = new Map<string, Extract<TextPart, { type: 'gap' }>>()
  parts.forEach((p, i) => {
    if (p.type !== 'gap') return
    const erste = p.vocabId ? gesehen.get(p.vocabId) : undefined
    const teile = teileVon(p.answer)
    if (erste && teile.length === 2) {
      erste.answer = teile[0]
      p.answer = teile[1]
      p.folge = true
    } else if (p.vocabId) gesehen.set(p.vocabId, p)
    const davor = parts[i - 1]?.type === 'text' ? (parts[i - 1] as { text: string }) : null
    const danach = parts[i + 1]?.type === 'text' ? (parts[i + 1] as { text: string }) : null
    // Optionaler Teil der Vokabel an der Lücke: aus dem Text in die Lösung (03.10.2026)
    const o = optionalesInLoesung(davor?.text ?? '', p.answer, danach?.text ?? '')
    if (davor) davor.text = o.vor
    if (danach) danach.text = o.nach
    p.answer = ohneDoppelte(o.vor, o.loesung, o.nach).loesung
  })
  return parts
}
