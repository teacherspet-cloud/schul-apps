import { CEFR_SCALE, CefrLevel, CefrTable, cefrIndex } from '@shared/types'

/** Sprachliche Vorgaben je GER-Niveau, die in jeden KI-Auftrag einfließen. */
export const CEFR_DESCRIPTORS: Record<CefrLevel, string> = {
  'Pre-A1':
    'Very short, simple sentences (max. 6 words). Present simple only. Only the most basic, concrete everyday words (colours, numbers, family, school things). No subordinate clauses.',
  A1: 'Short, simple sentences (max. 8–10 words). Mainly present simple and present progressive, "can", simple imperatives. Concrete everyday topics (family, school, hobbies, food, home). Very frequent words only. No subordinate clauses except "and", "but", "because".',
  'A1+':
    'Short sentences (max. 10–12 words). Present tenses, simple past of frequent verbs, "going to"-future. Everyday topics familiar to 10–11-year-olds. High-frequency vocabulary; simple linking with and/but/because/when.',
  A2: 'Simple sentences (max. 12–14 words). Present and past tenses, will-future, comparatives, simple modal verbs. Topics: daily life, school, free time, travel, shopping, animals, weather. Frequent vocabulary; simple subordinate clauses (because, when, if).',
  'A2+':
    'Sentences up to about 15 words. Present perfect, past progressive, conditional type 1, relative clauses with who/which/that. Topics relevant to young teenagers (friends, media, environment, sports, holidays).',
  B1: 'Sentences up to about 18 words. All common tenses including present perfect progressive and past perfect, passive voice, conditional types 1 and 2, reported speech. Topics: personal experiences, opinions, media, environment, relationships, work experience. Common vocabulary plus some topic-specific words.',
  'B1+':
    'Sentences up to about 20 words with some complex structures (participle clauses, gerund/infinitive). Topics of teenage and social interest, including abstract topics like identity, technology, society. Wider range of vocabulary and some idiomatic phrases.',
  B2: 'Natural, varied sentences up to about 25 words, complex clauses, all conditionals, modal perfects. Abstract and socially relevant topics (politics, globalisation, science, literature). Broad vocabulary including collocations and some idioms.',
  'B2+':
    'Sophisticated, varied sentences typical of quality journalism for young adults. Abstract and academic topics. Wide range of vocabulary, collocations, idiomatic and register-specific language.',
  C1: 'Complex, well-structured sentences of authentic academic or journalistic style. Abstract, specialised and nuanced topics. Precise and idiomatic vocabulary, fine differences in meaning and register.',
  C2: 'Authentic, sophisticated language of any register, including subtle nuance, figurative language and rare idioms.'
}

export interface GradeOption {
  value: string
  label: string
  level: CefrLevel
  basis: string
}

export function languageTracks(table: CefrTable, stateId: string, schoolTypeId: string) {
  return table.states.find((s) => s.id === stateId)?.schoolTypes.find((t) => t.id === schoolTypeId)?.languages ?? []
}

export function gradeOptions(table: CefrTable, stateId: string, schoolTypeId: string, order: number): GradeOption[] {
  const track = languageTracks(table, stateId, schoolTypeId).find((l) => l.order === order)
  if (!track) return []
  return Object.entries(track.grades)
    .filter(([, e]) => (CEFR_SCALE as readonly string[]).includes(e.level))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([grade, e]) => ({
      value: grade,
      label: `Klasse ${grade} · ${Number(grade) - track.startGrade + 1}. Lernjahr`,
      level: e.level,
      basis: e.basis
    }))
}

/** Vorgeschlagenes Niveau für einen Test während des Schuljahres (Tabellenwert = Ziel am Ende des Jahres). */
export function suggestLevel(
  table: CefrTable,
  stateId: string,
  schoolTypeId: string,
  order: number,
  grade: number
): { level: CefrLevel; basis: string } | null {
  const opt = gradeOptions(table, stateId, schoolTypeId, order).find((o) => Number(o.value) === grade)
  return opt ? { level: opt.level, basis: opt.basis } : null
}

export function levelAtLeast(level: CefrLevel, min: CefrLevel): boolean {
  return cefrIndex(level) >= cefrIndex(min)
}
