/**
 * Auswahl der Zielwörter für ein Arbeitsblatt mit Schwerpunkt „Vokabeln".
 *
 * Eine ganze Unit hat schnell über hundert Wörter – auf ein Blatt gehören aber nur
 * so viele, wie eine Stunde trägt. Die KI wählt deshalb die Wörter aus, die zum Thema,
 * zur Anlage der Wortschatzarbeit und zum Jahrgang passen; ohne KI greift eine
 * einfache Regelauswahl.
 */
import type { StructuredRequest } from '@shared/types'
import { arr, obj, str } from '../../../shared/aiSchema'
import { targetWordCount, VOCAB_WORK } from '../didactics/vocabWork'
import type { WorksheetMeta } from '../model/types'

export interface VocabCandidate {
  term: string
  translation: string
  pos?: string
  note?: string
}

export interface VocabSuggestion {
  terms: string[]
  reason: string
}

/** Wortart grob zusammenfassen, damit die Auswahl gemischt bleibt. */
const group = (c: VocabCandidate): string => {
  const pos = (c.pos ?? '').toLowerCase()
  if (pos.startsWith('verb') || /^to /.test(c.term)) return 'verb'
  if (pos.startsWith('noun')) return 'noun'
  if (pos.startsWith('adj')) return 'adjective'
  if (pos.startsWith('adv')) return 'adverb'
  if (pos.startsWith('phrase')) return 'phrase'
  return 'other'
}

/**
 * Regelauswahl ohne KI: möglichst gemischte Wortarten, Wendungen und Funktionswörter
 * hinten anstellen, Reihenfolge des Buches beibehalten.
 */
export function pickVocabWords(candidates: VocabCandidate[], count: number): string[] {
  const buckets = new Map<string, VocabCandidate[]>()
  for (const c of candidates) {
    const key = group(c)
    buckets.set(key, [...(buckets.get(key) ?? []), c])
  }
  // Erst die tragenden Wortarten reihum, Wendungen und Funktionswörter nur, wenn noch Platz ist
  const main = ['noun', 'verb', 'adjective', 'adverb']
  const rest = [...buckets.keys()].filter((k) => !main.includes(k))
  const picked = new Set<VocabCandidate>()
  const roundRobin = (keys: string[]): void => {
    const longest = Math.max(0, ...keys.map((k) => buckets.get(k)?.length ?? 0))
    for (let round = 0; round < longest && picked.size < count; round++) {
      for (const key of keys) {
        const entry = buckets.get(key)?.[round]
        if (entry && picked.size < count) picked.add(entry)
      }
    }
  }
  roundRobin(main)
  roundRobin(rest)
  // In der Reihenfolge der Vorlage ausgeben
  return candidates.filter((c) => picked.has(c)).map((c) => c.term)
}

const SCHEMA = obj({
  terms: arr(str('A word exactly as written in the list'), 'The chosen target words'),
  reason: str('Kurze Begründung auf Deutsch, warum diese Auswahl passt')
})

/** Die KI wählt die Zielwörter für dieses Blatt aus. */
export async function suggestVocabWords(
  candidates: VocabCandidate[],
  meta: WorksheetMeta,
  ai: <T>(req: StructuredRequest) => Promise<T>
): Promise<VocabSuggestion> {
  const { min, max } = targetWordCount(meta)
  const mode = VOCAB_WORK.find((v) => v.value === (meta.vocabWork ?? 'introduce'))
  const list = candidates.map((c) => `- ${c.term} | ${c.translation}${c.pos ? ` | ${c.pos}` : ''}`).join('\n')
  const user = [
    `Fach: ${meta.subjectLabel}. Klasse ${meta.grade}. Thema des Arbeitsblatts: ${meta.topic || '(noch offen)'}.`,
    `Anlage der Wortschatzarbeit: ${mode?.label} – ${mode?.description}`,
    `Wähle aus der folgenden Liste ${min} bis ${max} Wörter für GENAU EIN Arbeitsblatt aus.`,
    '',
    'Auswahlregeln:',
    '- Die Wörter müssen zum Thema passen und sich in einem gemeinsamen Zusammenhang gebrauchen lassen.',
    '- Gemischte Wortarten (Nomen, Verben, Adjektive), keine reinen Funktionswörter.',
    '- Nimm Wörter, die im Alltag der Lernenden tragen und die sich üben lassen – keine Eigennamen.',
    '- Nimm NICHT mehrere Wörter derselben geschlossenen Reihe (Farben, Wochentage, Zahlen) und keine Synonym- oder Antonympaare zusammen: Gemeinsam gelernt behindern sie sich.',
    '- Wendungen und ganze Sätze nur, wenn sie für das Thema zentral sind.',
    '- Gib die Wörter exakt so zurück, wie sie in der Liste stehen.',
    '',
    'Liste:',
    list
  ].join('\n')

  const res = await ai<VocabSuggestion>({
    system: 'Du hilfst einer Lehrkraft, Zielwörter für ein Vokabel-Arbeitsblatt auszuwählen. Antworte nur mit Wörtern aus der vorgelegten Liste.',
    user,
    schema: SCHEMA,
    schemaName: 'vocab_selection'
  })

  const known = new Map(candidates.map((c) => [c.term.toLowerCase(), c.term]))
  const terms = (res.terms ?? []).map((t) => known.get(String(t).trim().toLowerCase())).filter((t): t is string => Boolean(t))
  // Hat die KI danebengegriffen, füllt die Regelauswahl auf
  return { terms: terms.length >= min ? terms.slice(0, max) : pickVocabWords(candidates, max), reason: res.reason ?? '' }
}
