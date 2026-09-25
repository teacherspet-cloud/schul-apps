import type { VocabEntry } from './types'

/** Vokabel ist ausgefüllt und für den Test markiert. */
export const isIncluded = (v: VocabEntry): boolean => Boolean(v.term.trim()) && v.include !== false

export function includedVocab(vocab: VocabEntry[]): VocabEntry[] {
  return vocab.filter(isIncluded)
}

export interface SpecialVocabCounts {
  grey: VocabEntry[]
  box: VocabEntry[]
}

/** Grau gedruckte Vokabeln und Vokabeln aus Kästen (eine Vokabel kann in beiden Gruppen sein). */
export function specialVocab(vocab: VocabEntry[]): SpecialVocabCounts {
  return { grey: vocab.filter((v) => v.grey), box: vocab.filter((v) => v.inBox) }
}
