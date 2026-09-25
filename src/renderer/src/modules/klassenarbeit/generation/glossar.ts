/**
 * Das zweisprachige Fachglossar einer bilingualen Klassenarbeit.
 *
 * Entscheidung der Lehrkraft (25.09.2026): „Glossar als Hilfsmittel“ – es steht EINMAL am Ende
 * der Arbeit und wird bei den erlaubten Hilfsmitteln genannt. Berlin lässt bei Klassenarbeiten
 * im bilingualen Unterricht sogar zweisprachige Wörterbücher zu (AV bilingualer Unterricht
 * 2020, Nr. 8).
 *
 * Es entsteht NACH den Teilen, weil es sich auf deren Material und Aufgaben bezieht. Im Teil
 * selbst verbietet der Prompt einen Glossar-Baustein (bilingualRegeln mit `pruefung`), sonst
 * hätte jeder Teil sein eigenes.
 */
import { arr, obj, str } from '../../../shared/aiSchema'
import { describeBlock } from '../../arbeitsblatt/generation/describe'
import { newBlock } from '../../arbeitsblatt/model/factory'
import type { PhrasesBlock } from '../../arbeitsblatt/model/types'
import type { Exam, ExamPart } from '../model/types'
import type { AiCall } from './generateExam'

const TITEL: Record<string, string> = { en: 'Glossary', fr: 'Glossaire', es: 'Glosario', it: 'Glossario' }

const SCHEMA = obj({
  groups: arr(
    obj({
      label: str('Gruppenüberschrift in der Arbeitssprache, z. B. „Subject terms“ oder „Working vocabulary“'),
      items: arr(obj({ text: str('Begriff in der Arbeitssprache'), german: str('Deutscher Fachbegriff – nie leer') }))
    })
  )
})

export const GLOSSAR_HILFSMITTEL = 'zweisprachiges Fachglossar (liegt der Arbeit bei)'

export async function glossarFuerArbeit(exam: Exam, parts: ExamPart[], ai: AiCall): Promise<PhrasesBlock | null> {
  const b = exam.meta.bilingual
  if (!b?.an) return null
  const inhalt = parts.flatMap((p) => p.blocks.map(describeBlock)).join('\n')
  const system = [
    `Du erstellst das zweisprachige Fachglossar (${b.spracheLabel} – Deutsch) für eine bilinguale Klassenarbeit im Fach ${exam.meta.subjectLabel}, Klasse ${exam.meta.grade}.`,
    '- Nur Fachbegriffe und schwierige Wörter, die in Material und Aufgaben dieser Arbeit wirklich vorkommen; höchstens etwa 20 Fachbegriffe.',
    '- Zwei Gruppen: zuerst die Fachbegriffe, dann allgemeine Arbeitswörter der Aufgabenstellungen.',
    '- Das Glossar ist ein Hilfsmittel, keine Lösungshilfe: Es erklärt Wörter, aber es verrät keine Antworten und nennt keine Deutungen, Ursachen oder Urteile, nach denen die Aufgaben fragen.',
    '- Jeder Eintrag hat den Begriff auf ' + b.spracheLabel + ' und den deutschen Fachbegriff.'
  ].join('\n')
  const res = await ai<{ groups: PhrasesBlock['groups'] }>({ system, user: `Die Arbeit:\n${inhalt}`, schema: SCHEMA, schemaName: 'glossar' })
  const groups = (res.groups ?? [])
    .map((g) => ({ label: g.label?.trim() ?? '', items: (g.items ?? []).filter((i) => i.text?.trim() && i.german?.trim()) }))
    .filter((g) => g.items.length)
  if (!groups.length) return null
  return {
    ...(newBlock('phrases') as PhrasesBlock),
    title: TITEL[b.sprache] ?? 'Glossary',
    hint: 'Hilfsmittel: Fachbegriffe in der Arbeitssprache und auf Deutsch.',
    groups
  }
}
