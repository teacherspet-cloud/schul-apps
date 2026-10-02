import type { StructuredRequest } from '@shared/types'
import { CEFR_DESCRIPTORS } from '../model/cefr'
import { createRng, newId, Rng } from '../model/random'
import type { Block, ImageRef, PictureItem, TestDocument, TestHeader, TestSettings, Variant, VocabEntry } from '../model/types'
import { LANGUAGES } from '../model/types'
import { planVariants } from './distribute'
import { checkBlock, describeBlock, Issue } from './quality'
import { arr, bool, obj, str } from '../../../shared/aiSchema'
import { runLimited } from '../../../shared/async'
import { knownVocabRules } from '../../../shared/knownVocab'
import type { KnownVocab } from '../../../shared/knownVocab'
import { GenContext, TASK_TYPES } from './taskTypes'
import type { PictureFinder } from './pictures'
import { istAlteSprache, lateinRegeln } from '../didactics/latein'
import { istGriechisch } from '../didactics/griechisch'
import { mitLesung, SCHRIFT_REGELN } from '../didactics/sprachAufgaben'
import { istStandardTitel, kopfTexte } from '../render/aufgabenTexte'
import { anredeMeldung, anredeRegel, falscheAnrede } from '../../../shared/anrede'
import { anredeFuer } from '../../arbeitsblatt/didactics/anrede'
import { formBefunde, formVorwissen, vorwissenRegel } from '../didactics/formVorwissen'

export type AiCall = <T>(req: StructuredRequest) => Promise<T>
export type ImageFinder = (item: PictureItem, settings: TestSettings) => Promise<ImageRef | undefined>

export interface GenerateOptions {
  ai: AiCall
  review: boolean
  findImage?: ImageFinder
  /** Bilder einer ganzen Aufgabe gemeinsam suchen und prüfen (hat Vorrang vor findImage) */
  findImages?: PictureFinder
  onProgress?: (done: number, total: number, message: string) => void
  concurrency?: number
  /**
   * Sparmodus: alle Aufgaben einer Variante in EINER KI-Anfrage, ohne zusätzliche KI-Prüfung
   * (nur eine gezielte Wiederholung bei lokal erkannten Problemen). Spart bei Abos viel Kontingent.
   */
  combined?: boolean
  /** Wortschatz aus früheren Units und Bänden: begrenzt die Sätze der KI */
  known?: KnownVocab
  /** Live-Vorschau (02.10.2026, shared/zwischenstand.ts): der Test nach jeder fertigen Aufgabe */
  zwischenstand?: (doc: TestDocument, was: string) => void
}

export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.value === code)?.english ?? 'English'
}

export function systemPrompt(settings: TestSettings, variantLabel?: string, known?: KnownVocab): string {
  const lang = languageName(settings.targetLanguage)
  return [
    istAlteSprache(settings.targetLanguage)
      ? `Du bist eine erfahrene ${istGriechisch(settings.targetLanguage) ? 'Griechischlehrkraft' : 'Lateinlehrkraft'} an einer deutschen Schule und entwirfst Vokabeltests.`
      : `You are an experienced teacher of ${lang} as a foreign language at German schools. You create vocabulary tests that check words in context, not by translation.`,
    `Target language: ${lang}${settings.targetLanguage === 'en' ? ' (British English spelling)' : ''}.`,
    // Schrift und Rechtschreibung der Sprache (30.09.2026): Tonzeichen, Diakritika, Vokalisierung …
    SCHRIFT_REGELN[settings.targetLanguage] ?? '',
    `Students: grade ${settings.grade}, learning ${lang} as their ${settings.languageOrder}. foreign language. CEFR level: ${settings.level}.`,
    `Language requirements for ${settings.level}: ${CEFR_DESCRIPTORS[settings.level]}`,
    'General rules:',
    `- All student-facing text is in ${lang} unless the task says otherwise. Instructions are short and simple.`,
    '- Apart from the tested words, use only vocabulary and grammar that students at this level know.',
    '- Content is age-appropriate, inclusive and free of stereotypes, violence, brands and real persons. Vary names and situations.',
    '- Every item has exactly one correct solution, and no item reveals its own solution or the solution of another item.',
    '- Use the vocabId values exactly as given. Treat every given word; do not add other tested words.',
    settings.topic ? `- Where it fits naturally, set the sentences in this context/topic: ${settings.topic}.` : '',
    variantLabel ? `- This is test version ${variantLabel}. Write sentences that differ from other versions.` : '',
    ...knownVocabRules(known).map((r) => `- ${r}`),
    // Vorwissen bei Wortformen (30.09.2026): simple past & Co. erst, wenn eingeführt
    vorwissenRegel(formVorwissen(settings, known)),
    /*
     * Latein arbeitet anders. Die Regeln stehen auf Deutsch, weil sie deutsche Fachbegriffe
     * tragen (Nennform, Stammformen, Monosemieren) und weil bei Latein alles Schülermaterial
     * außer den lateinischen Wörtern ohnehin deutsch ist.
     */
    istAlteSprache(settings.targetLanguage)
      ? `
${lateinRegeln(settings.targetLanguage)}`
      : '',
    // Bei Latein stehen die Anweisungen auf Deutsch – dann gilt die Anrede nach Stufe (Paket 8b)
    istAlteSprache(settings.targetLanguage)
      ? `
${anredeRegel(anredeFuer(settings.grade, settings.schoolTypeId, settings.stateId))}`
      : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/** KI-Analyse: welche Vokabeln lassen sich eindeutig als Bild darstellen? */
export async function analyzeVocab(vocab: VocabEntry[], settings: TestSettings, ai: AiCall): Promise<VocabEntry[]> {
  const todo = vocab.filter((v) => v.depictable === undefined)
  if (todo.length === 0) return vocab
  const res = await ai<{ entries: { id: string; depictable: boolean; imageKeywords: string[]; picture: string; pos: string }[] }>({
    system: systemPrompt(settings),
    user:
      'For each word decide whether it can be shown UNAMBIGUOUSLY as a simple picture/pictogram so that students name exactly this word (concrete nouns like "ladder", "bread", "cow", clear actions like "to swim"). Concrete everyday objects, food, animals, clothes, places and clear actions ARE depictable, even with an article (e.g. "le pain"). Abstract words, feelings/relationships, words whose picture would clearly be named with a different or more general word (e.g. "trainers" → "shoes"), or words needing context are NOT depictable. Give 2–4 simple English search keywords for a pictogram/clipart library (most specific first, in the correct meaning), a short English picture idea that shows exactly this meaning (e.g. "a bat, the flying animal"), and the word class.\n\n' +
      todo.map((v) => `- id="${v.id}" | ${v.term} | German: ${v.translation}`).join('\n'),
    schemaName: 'vocab_analysis',
    schema: obj({ entries: arr(obj({ id: str(), depictable: bool(), imageKeywords: arr(str()), picture: str(), pos: str() })) })
  })
  const byId = new Map(res.entries.map((e) => [e.id, e]))
  return vocab.map((v) => {
    const e = byId.get(v.id)
    return e ? { ...v, depictable: e.depictable, imageKeywords: e.imageKeywords, imageHint: e.picture || undefined, pos: v.pos || e.pos } : v
  })
}

/** Erzeugt einen einzelnen Block (mit optionaler Prüfung und einem Korrekturdurchlauf). */
export async function generateBlock(
  taskType: keyof typeof TASK_TYPES,
  vocab: VocabEntry[],
  ctx: GenContext,
  opts: Pick<GenerateOptions, 'ai' | 'review' | 'findImage' | 'findImages'>,
  variantLabel?: string,
  /** Zu behebende Hinweise („Mit KI beheben", Paket 12) – gehen schon in den ersten Versuch ein */
  hinweis?: string
): Promise<Block> {
  const def = TASK_TYPES[taskType]
  const system = systemPrompt(ctx.settings, variantLabel, ctx.known)

  const produce = async (feedback?: string): Promise<Block> => {
    let data: unknown = {}
    if (def.schema && def.prompt && vocab.length > 0 && (def.needsAi?.(vocab, ctx) ?? true)) {
      data = await opts.ai({
        system,
        user: def.prompt(vocab, ctx) + (feedback ? `\n\nA previous attempt had these problems – avoid them:\n${feedback}` : ''),
        schemaName: taskType,
        schema: def.schema
      })
    }
    return def.build(vocab, data, ctx)
  }

  const aiReview = opts.review && Boolean(def.schema) && vocab.length > 0 && (def.needsAi?.(vocab, ctx) ?? true)
  const words = vocab.map((v) => v.term)

  let block = await produce(hinweis)
  let issues = checkBlock(block, vocab, ctx.settings.targetLanguage, ctx.allVocab).filter((i) => block.kind !== 'picture' || !i.message.startsWith('Kein Bild'))
  if (aiReview) issues = [...issues, ...(await reviewBlock(block, ctx.settings, opts.ai, words, ctx.known))]

  if (issues.length > 0 && def.schema) {
    block = await produce(issues.map(formatIssue).join('\n'))
    issues = checkBlock(block, vocab, ctx.settings.targetLanguage, ctx.allVocab)
    if (aiReview) {
      // Zweite Prüfung: Was dann noch mehrdeutig ist, bekommt den Anfangsbuchstaben als Hilfe
      const remaining = await reviewBlock(block, ctx.settings, opts.ai, words, ctx.known)
      issues = [
        ...issues,
        ...remaining.map((i) => (addFirstLetterHint(block, i.item) ? { ...i, message: `${i.message} → Anfangsbuchstabe als Hilfe ergänzt.` } : i))
      ]
    }
  }

  return finishBlock(block, vocab, ctx, opts, issues)
}

/** Bilder einsetzen und verbleibende Hinweise am Block speichern. */
async function finishBlock(
  block: Block,
  vocab: VocabEntry[],
  ctx: GenContext,
  opts: Pick<GenerateOptions, 'findImage' | 'findImages'>,
  issues: Issue[]
): Promise<Block> {
  if (block.kind === 'picture' && opts.findImages) {
    let notes: string[] = []
    try {
      notes = await opts.findImages(block.items, vocab, ctx.settings)
    } catch (e) {
      notes = [`Bilder konnten nicht automatisch gewählt werden: ${e instanceof Error ? e.message : String(e)}`]
    }
    block.warnings = [
      ...checkBlock(block, vocab)
        .filter((i) => !i.message.startsWith('Kein Bild'))
        .map(formatIssue),
      ...notes
    ]
    return block
  }
  if (block.kind === 'picture' && opts.findImage) {
    for (const item of block.items) {
      try {
        item.image = await opts.findImage(item, ctx.settings)
      } catch {
        item.image = undefined
      }
    }
    issues = checkBlock(block, vocab)
  }
  block.warnings = [...issues.map(formatIssue), ...anredeHinweise(block, ctx.settings), ...formHinweise(block, vocab, ctx), ...lesungHinweise(block, vocab, ctx.settings)]
  return block
}

/**
 * Latein: Die Anweisungen stehen auf Deutsch – passt ihre Anrede zur Stufe (Paket 8b)?
 * Gemeldet am Block, nicht korrigiert. In den modernen Fremdsprachen gibt es nichts zu prüfen.
 */
export function anredeHinweise(block: Block, settings: TestSettings): string[] {
  if (!istAlteSprache(settings.targetLanguage)) return []
  const soll = anredeFuer(settings.grade, settings.schoolTypeId, settings.stateId)
  const fund = falscheAnrede(block.instruction ?? '', soll)
  return fund ? [anredeMeldung('Arbeitsanweisung', fund, soll)] : []
}

/**
 * Chinesisch/Japanisch (30.09.2026): Lesungen, die nicht aus der Liste stammen, hat die KI ergänzt –
 * Pinyin mit falschem Ton fällt sonst erst beim Korrigieren auf.
 */
export function lesungHinweise(block: Block, vocab: VocabEntry[], settings: TestSettings): string[] {
  if (block.taskType !== 'readingForms' && block.taskType !== 'readingMatch') return []
  const ohne = vocab.filter((v) => !mitLesung(v, settings.targetLanguage).lesung).length
  return ohne ? [`Lesung bei ${ohne} ${ohne === 1 ? 'Wort' : 'Wörtern'} nicht in der Liste – von der KI ergänzt, bitte prüfen.`] : []
}

/** Lücken, die eine noch nicht eingeführte Wortform verlangen (örtliche Prüfung, 30.09.2026) */
export function formHinweise(block: Block, vocab: VocabEntry[], ctx: Pick<GenContext, 'settings' | 'known'>): string[] {
  return formBefunde(block, vocab, formVorwissen(ctx.settings, ctx.known)).map(formatIssue)
}

const localIssues = (block: Block, vocab: VocabEntry[], ctx?: GenContext): Issue[] =>
  checkBlock(block, vocab, ctx?.settings.targetLanguage, ctx?.allVocab).filter((i) => block.kind !== 'picture' || !i.message.startsWith('Kein Bild'))

/**
 * Sparmodus: alle Aufgaben einer Variante in einer einzigen Anfrage.
 * Die KI prüft die Eindeutigkeit selbst vor der Antwort; nur Aufgaben mit lokal erkannten Problemen werden einzeln wiederholt.
 */
export async function generateVariantCombined(
  assignments: { taskType: keyof typeof TASK_TYPES; vocab: VocabEntry[] }[],
  ctx: GenContext,
  opts: Pick<GenerateOptions, 'ai' | 'review' | 'findImage' | 'findImages'>,
  variantLabel?: string
): Promise<Block[]> {
  const system = systemPrompt(ctx.settings, variantLabel, ctx.known)
  const parts = assignments.map((a, i) => ({ ...a, def: TASK_TYPES[a.taskType], key: `task${i + 1}` }))
  const aiParts = parts.filter((p) => p.def.schema && p.def.prompt && p.vocab.length > 0 && (p.def.needsAi?.(p.vocab, ctx) ?? true))
  let data: Record<string, unknown> = {}
  if (aiParts.length > 0) {
    data = await opts.ai<Record<string, unknown>>({
      system,
      user: [
        `Create ${aiParts.length} task(s) for one vocabulary test. Each task below has its own instructions and its own word list.`,
        `Return ONE JSON object with one property per task (${aiParts.map((p) => p.key).join(', ')}), each in exactly the format described for that task.`,
        'Before answering, check every item yourself: exactly one correct solution, no other word of the same task would fit, nothing reveals a solution, language at the required level.',
        ...aiParts.map((p) => `\n### ${p.key}: ${p.def.label}\n${p.def.prompt!(p.vocab, ctx)}`)
      ].join('\n'),
      schemaName: 'vocabulary_test',
      schema: obj(Object.fromEntries(aiParts.map((p) => [p.key, p.def.schema!])))
    })
  }

  const blocks: Block[] = []
  for (const p of parts) {
    let block: Block | null = null
    try {
      block = p.def.build(p.vocab, data[p.key] ?? {}, ctx)
    } catch {
      block = null
    }
    let issues = block ? localIssues(block, p.vocab, ctx) : []
    // Nur fehlerhafte Aufgaben einzeln wiederholen (eine Anfrage, ohne weitere KI-Prüfung)
    if ((!block || issues.length > 0) && p.def.schema && p.def.prompt && p.vocab.length > 0 && (p.def.needsAi?.(p.vocab, ctx) ?? true)) {
      const retry = await opts.ai({
        system,
        user:
          p.def.prompt(p.vocab, ctx) + (issues.length ? `\n\nA previous attempt had these problems – avoid them:\n${issues.map(formatIssue).join('\n')}` : ''),
        schemaName: p.taskType,
        schema: p.def.schema
      })
      block = p.def.build(p.vocab, retry, ctx)
      issues = localIssues(block, p.vocab, ctx)
    }
    if (!block) block = p.def.build(p.vocab, {}, ctx)
    blocks.push(await finishBlock(block, p.vocab, ctx, opts, issues))
  }

  // Auch im Sparmodus kann der fertige Test einmal geprüft werden – eine einzige Anfrage für
  // alle Aufgaben zusammen. Befunde stehen danach als Hinweis am jeweiligen Baustein.
  // Wer die Prüfung abwählt, bekommt sie auch hier nicht.
  if (!opts.review) return blocks
  try {
    const problems = await reviewVariant(blocks, ctx.settings, opts.ai, ctx.known)
    for (const p of problems) {
      const block = blocks[p.taskNumber - 1]
      if (block) block.warnings = [...(block.warnings ?? []), `[Prüfung] ${p.problem}`]
    }
  } catch {
    // Ohne Prüfung bleibt der Test wie erzeugt
  }
  return blocks
}

/**
 * Prüft alle Aufgaben eines Tests in einer einzigen Anfrage.
 * Gedacht für den Sparmodus, in dem die Einzelprüfung je Aufgabe entfällt.
 */
export async function reviewVariant(blocks: Block[], settings: TestSettings, ai: AiCall, known?: KnownVocab): Promise<{ taskNumber: number; problem: string }[]> {
  if (!blocks.length) return []
  const res = await ai<{ problems: { taskNumber: number; problem: string }[] }>({
    system: systemPrompt(settings, undefined, known),
    user: [
      'Check this finished vocabulary test like a strict colleague. Report ONLY real problems:',
      '- an item has no clear solution, or another word of the same task would fit as well',
      '- a solution is revealed somewhere else in the test',
      '- a given answer is wrong or has the wrong form, or there are language errors',
      '- an instruction does not make clear what students have to do',
      `- language clearly above level ${settings.level}`,
      FORM_PRUEFUNG,
      ABLENKER_PRUEFUNG,
      '- a task refers to material or a word list that is not part of the test',
      'taskNumber is the number of the task (starting at 1). Return an empty list if everything is fine.',
      '',
      ...blocks.map(
        (b, i) => `### Task ${i + 1}
${describeBlock(b)}`
      )
    ].join('\n'),
    schemaName: 'review',
    schema: obj({ problems: arr(obj({ taskNumber: { type: 'integer' }, problem: str() })) })
  })
  return res.problems ?? []
}

function formatIssue(i: Issue): string {
  return i.item ? `Nr. ${i.item}: ${i.message}` : i.message
}

/**
 * Setzt bei einem mehrdeutigen Lücken-Item den Anfangsbuchstaben als Hilfe.
 * Liefert true, wenn das möglich war (nur Lückenaufgaben).
 */
export function addFirstLetterHint(block: Block, itemNumber?: number): boolean {
  if (!itemNumber) return false
  if (block.kind === 'gap' && block.taskType !== 'wrongWord') {
    const item = block.items[itemNumber - 1]
    if (!item) return false
    item.firstLetter = true
    return true
  }
  if (block.kind === 'gapText') {
    const gap = block.parts.filter((p) => p.type === 'gap')[itemNumber - 1]
    if (!gap || gap.type !== 'gap') return false
    gap.firstLetter = true
    return true
  }
  return false
}

/*
 * Prüfpunkte Ablenker und Beziehungen (02.10.2026, Befund der Lehrkraft): Ablenker, die schon an
 * Wortart oder Form als falsch zu erkennen sind, und Synonym-/Gegenteil-Paare mit falschem
 * Zeichen fielen in der Prüfung nicht auf – die Liste fragte nur nach Eindeutigkeit.
 */
export const ABLENKER_PRUEFUNG =
  '- multiple choice options or extra words in a word box: a distractor can be ruled out by its form alone (different word class, tense, person, number, gender/article or "to" that does not fit the gap), or is obviously absurd at first glance – all options must have the same word class and form, be plausible, and only ONE may fit by meaning/collocation\n' +
  '- synonyms/opposites: the mark (= same meaning, ≠ opposite meaning) is wrong, or the partner is not a real synonym/antonym'

/** Prüfpunkt Wortformen: Befund, wenn eine Aufgabe eine noch nicht eingeführte Form verlangt (VORWISSEN DER KLASSE) */
export const FORM_PRUEFUNG =
  '- an item requires a word form the class has not learned yet (see VORWISSEN DER KLASSE, e.g. a past tense or a derived word in early learning years) – name the form and suggest the base form or a form given in brackets'

/** Zweiter KI-Durchgang: prüft Eindeutigkeit, Niveau und Korrektheit. */
export async function reviewBlock(block: Block, settings: TestSettings, ai: AiCall, words: string[] = [], known?: KnownVocab): Promise<Issue[]> {
  const res = await ai<{ problems: { itemNumber: number; problem: string }[] }>({
    system: systemPrompt(settings, undefined, known),
    user:
      'Check this vocabulary test task carefully like a strict colleague. The students must be able to tell without doubt which word is asked for in each item. Report ONLY real problems:\n' +
      '- AMBIGUITY: for every item, try each of the other words of this task (list below, in any grammatical form): if another word would also be acceptable, report it and name that word\n' +
      '- an item has no clear solution, or a synonym / more general word would also be correct\n' +
      '- a solution is revealed in the item or in another item\n' +
      '- the given answer is wrong, has the wrong form, or there are language errors\n' +
      '- the instruction does not make clear what students have to do\n' +
      `- language clearly above level ${settings.level}\n` +
      `${FORM_PRUEFUNG}\n` +
      `${ABLENKER_PRUEFUNG}\n` +
      'Use itemNumber 0 for problems concerning the whole task. Return an empty list if everything is fine.\n\n' +
      (words.length ? `Words tested in this task: ${words.join(', ')}\n\n` : '') +
      describeBlock(block),
    schemaName: 'review',
    schema: obj({ problems: arr(obj({ itemNumber: { type: 'integer' }, problem: str() })) })
  })
  return res.problems.map((p) => ({ item: p.itemNumber || undefined, message: p.problem }))
}

/** Kopf eines neuen Tests – Titel in der Testsprache (30.09.2026; ohne Sprache englisch wie bisher) */
export function defaultHeader(schoolName: string, sprache?: string): TestHeader {
  return {
    title: kopfTexte(sprache).title,
    showName: true,
    showDate: true,
    showClass: true,
    showSchool: Boolean(schoolName),
    schoolName,
    showVariant: true,
    showPoints: true,
    showGrade: false,
    subtitle: ''
  }
}

export async function generateTest(vocabInput: VocabEntry[], settings: TestSettings, headerInput: TestHeader, opts: GenerateOptions): Promise<TestDocument> {
  const rng: Rng = createRng(settings.seed)
  // Unveränderter Standardtitel („Vocabulary test", „Vokabeltest" …) folgt der Testsprache
  const header = istStandardTitel(headerInput.title) ? { ...headerInput, title: kopfTexte(settings.targetLanguage).title } : headerInput
  let vocab = vocabInput
  const needsAnalysis = settings.tasks.some((t) => t.type === 'pictureLabel')
  const total0 = settings.variantCount * settings.tasks.length + (needsAnalysis ? 1 : 0)
  let done = 0
  const progress = (msg: string): void => opts.onProgress?.(done, total0, msg)

  if (needsAnalysis) {
    progress('Vokabeln werden analysiert …')
    vocab = await analyzeVocab(vocab, settings, opts.ai)
    done++
  }

  const plans = planVariants(vocab, settings)
  const ctx: GenContext = { settings, languageName: languageName(settings.targetLanguage), rng, allVocab: vocab, known: opts.known }
  /*
   * Vorschau: die fertigen Aufgaben jeder Variante in der geplanten Reihenfolge (sie entstehen
   * gleichzeitig und kommen durcheinander an). Die Varianten tragen vorläufige Kennungen.
   */
  const vorlaeufig = plans.map((p, vi) => ({ id: `vorschau-${vi}`, label: p.label }))
  const fertig = plans.map((p) => p.assignments.map((): Block | null => null))
  const zeige = (was: string): void =>
    opts.zwischenstand?.(
      {
        version: 1,
        header,
        settings,
        vocab,
        variants: vorlaeufig.map((v, vi) => ({ ...v, blocks: fertig[vi].filter((b): b is Block => b !== null) })),
        fontSize: 12,
        createdAt: ''
      },
      was
    )

  if (opts.combined) {
    const variantJobs = plans.map((plan, vi) => async () => {
      progress(`Variante ${plan.label}: alle Aufgaben in einer Anfrage …`)
      const blocks = await generateVariantCombined(
        plan.assignments.map((a) => ({ taskType: a.task.type, vocab: a.vocab })),
        { ...ctx, variantVocab: plan.assignments.flatMap((a) => a.vocab) },
        opts,
        plans.length > 1 ? plan.label : undefined
      )
      plan.assignments.forEach((a, i) => {
        if (a.shortfall > 0 && blocks[i]) {
          blocks[i].warnings = [...(blocks[i].warnings ?? []), `${a.shortfall} Vokabel(n) weniger als gewünscht: nicht genug passende Wörter in der Liste.`]
        }
      })
      done += plan.assignments.length
      progress(`Variante ${plan.label} fertig`)
      blocks.forEach((b, i) => (fertig[vi][i] = b))
      zeige(`Variante ${plan.label} steht`)
      return { vi, blocks }
    })
    const done2 = await runLimited(variantJobs, 2)
    return {
      version: 1,
      header,
      settings,
      vocab,
      variants: plans.map((p, vi) => ({ id: newId(rng), label: p.label, blocks: done2.find((r) => r.vi === vi)?.blocks ?? [] })),
      fontSize: 12,
      createdAt: new Date().toISOString()
    }
  }

  const jobs = plans.flatMap((plan, vi) =>
    plan.assignments.map((a, ti) => async () => {
      progress(`Variante ${plan.label}: ${TASK_TYPES[a.task.type].label} …`)
      const block = await generateBlock(
        a.task.type,
        a.vocab,
        { ...ctx, variantVocab: plan.assignments.flatMap((x) => x.vocab) },
        opts,
        plans.length > 1 ? plan.label : undefined
      )
      if (a.shortfall > 0) {
        block.warnings = [...(block.warnings ?? []), `${a.shortfall} Vokabel(n) weniger als gewünscht: nicht genug passende Wörter in der Liste.`]
      }
      done++
      progress(`Variante ${plan.label}: ${TASK_TYPES[a.task.type].label} fertig`)
      fertig[vi][ti] = block
      zeige(`${plans.length > 1 ? `Variante ${plan.label}: ` : ''}${TASK_TYPES[a.task.type].label} steht`)
      return { vi, block }
    })
  )

  const results = await runLimited(jobs, opts.concurrency ?? 4)
  const variants: Variant[] = plans.map((p, vi) => ({
    id: newId(rng),
    label: p.label,
    blocks: results.filter((r) => r.vi === vi).map((r) => r.block)
  }))

  return {
    version: 1,
    header,
    settings,
    vocab,
    variants,
    fontSize: 12,
    createdAt: new Date().toISOString()
  }
}
