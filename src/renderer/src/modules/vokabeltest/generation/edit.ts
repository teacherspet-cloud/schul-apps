import { createRng, randomSeed } from '../model/random'
import type { Block, TaskTypeId, TestDocument, Variant, VocabEntry } from '../model/types'
import { AiCall, analyzeVocab, generateBlock, GenerateOptions, languageName } from './generate'
import { GenContext, TASK_TYPES } from './taskTypes'

/** Welche Vokabeln fragt ein Block ab? */
export function blockVocabIds(block: Block): string[] {
  const ids: (string | undefined)[] = []
  switch (block.kind) {
    case 'gap':
    case 'choice':
    case 'open':
    case 'trueFalse':
    case 'oddOneOut':
    case 'picture':
    case 'scramble':
    case 'mindmap':
      ids.push(...block.items.map((i) => i.vocabId))
      break
    case 'gapText':
      ids.push(...block.parts.map((p) => (p.type === 'gap' ? p.vocabId : undefined)))
      break
    case 'match':
      ids.push(...block.left.map((l) => l.vocabId))
      break
    case 'categorize':
      ids.push(...block.words.map((w) => w.vocabId))
      break
    case 'crossword':
      ids.push(...block.entries.map((e) => e.vocabId))
      break
  }
  return [...new Set(ids.filter((x): x is string => Boolean(x)))]
}

function context(doc: TestDocument): GenContext {
  return {
    settings: doc.settings,
    languageName: languageName(doc.settings.targetLanguage),
    rng: createRng(randomSeed()),
    allVocab: doc.vocab
  }
}

const variantLabel = (doc: TestDocument, variant: Variant): string | undefined => (doc.variants.length > 1 ? variant.label : undefined)

/** Erzeugt eine Aufgabe mit denselben Vokabeln neu; Titel und Punkte bleiben erhalten. */
export async function regenerateBlock(
  doc: TestDocument,
  variant: Variant,
  block: Block,
  ai: AiCall,
  images: Pick<GenerateOptions, 'findImage' | 'findImages'> = {},
  /** Hinweise, die behoben werden sollen („Mit KI beheben", Paket 12) */
  hinweis?: string
): Promise<Block> {
  const ids = blockVocabIds(block)
  const vocab = doc.vocab.filter((v) => ids.includes(v.id))
  const fresh = await generateBlock(block.taskType, vocab, context(doc), { ai, review: false, ...images }, variantLabel(doc, variant), hinweis)
  return { ...fresh, id: block.id, title: block.title, pointsPerItem: block.pointsPerItem }
}

const ITEM_KINDS = new Set(['gap', 'choice', 'open', 'trueFalse', 'oddOneOut', 'scramble'])

export function canRegenerateItem(block: Block): boolean {
  return ITEM_KINDS.has(block.kind)
}

/** Erzeugt ein einzelnes Item neu und gibt den aktualisierten Block zurück. */
export async function regenerateItem(doc: TestDocument, variant: Variant, block: Block, itemId: string, ai: AiCall): Promise<Block> {
  if (!('items' in block) || block.kind === 'picture') return block
  const items = block.items as { id: string; vocabId?: string }[]
  const index = items.findIndex((i) => i.id === itemId)
  const vocab = doc.vocab.find((v) => v.id === items[index]?.vocabId)
  if (index < 0 || !vocab) return block
  const fresh = await generateBlock(block.taskType, [vocab], context(doc), { ai, review: false }, variantLabel(doc, variant))
  const newItem = 'items' in fresh ? (fresh.items as { id: string }[])[0] : undefined
  if (!newItem) throw new Error('Die KI hat kein neues Item geliefert.')
  const next = structuredClone(block)
  ;(next.items as { id: string }[])[index] = { ...newItem, id: itemId }
  return next
}

/** Fügt eine neue Aufgabe mit noch nicht abgefragten Vokabeln hinzu. */
export async function createAdditionalBlock(
  doc: TestDocument,
  variant: Variant,
  type: TaskTypeId,
  count: number,
  ai: AiCall,
  images: Pick<GenerateOptions, 'findImage' | 'findImages'> = {}
): Promise<{ block: Block; vocab: VocabEntry[] }> {
  const used = new Set(variant.blocks.flatMap(blockVocabIds))
  let vocab = doc.vocab
  if (type === 'pictureLabel') vocab = await analyzeVocab(vocab, doc.settings, ai)
  const ctx = context({ ...doc, vocab })
  const def = TASK_TYPES[type]
  const candidates = vocab.filter((v) => !used.has(v.id) && (!def.accepts || def.accepts(v)))
  const pool = candidates.length >= count ? candidates : vocab.filter((v) => !def.accepts || def.accepts(v))
  const picked = pool.slice(0, def.usesVocab ? count : 0)
  const settings = {
    ...doc.settings,
    tasks: [...doc.settings.tasks.filter((t) => t.type !== type), { type, count, pointsPerItem: def.defaultPoints }]
  }
  const block = await generateBlock(type, picked, { ...ctx, settings }, { ai, review: false, ...images }, variantLabel(doc, variant))
  return { block, vocab }
}
