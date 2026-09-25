import { Badge, Group, MultiSelect, Stack, Text, Textarea } from '@mantine/core'
import { useEffect, useState } from 'react'
import type { SavedVocabList } from '@shared/types'
import { targetWordCount } from '../didactics/vocabWork'
import { subjectById } from '../model/subjects'
import type { WorksheetMeta } from '../model/types'
import { TextbookPicker } from '../../vokabeltest/steps/TextbookPicker'
import type { KnownVocab } from '../../../shared/knownVocab'
import VocabChoiceModal from './VocabChoiceModal'
import type { VocabCandidate } from '../generation/vocabSuggest'

/** Wörter aus einem Text herauslösen (je Zeile oder durch Komma getrennt) */
const asWords = (text: string): string[] =>
  text
    .split(/[\n,;]+/)
    .map((w) => w.trim())
    .filter(Boolean)

/**
 * Zielwörter für den Schwerpunkt „Vokabeln": aus dem Schulbuch, aus gespeicherten
 * Vokabellisten oder von Hand.
 *
 * Vorgeschlagen wird das Lehrwerk, das zu Bundesland, Schulform und Jahrgang der
 * Lerngruppe passt – wie im Programm Vokabeltest lässt es sich frei ändern.
 */
export default function VocabWordsPicker({
  meta,
  onChange,
  onKnown,
  hint
}: {
  meta: WorksheetMeta
  onChange: (words: string) => void
  /** Meldet den Wortschatz, den die Klasse laut Lehrwerk schon kennt */
  onKnown?: (known: KnownVocab | undefined) => void
  hint: string
}): React.JSX.Element {
  const [lists, setLists] = useState<SavedVocabList[]>([])
  const [chosen, setChosen] = useState<string[]>([])
  /** Vokabeln, die gerade im Auswahlfenster stehen (null = geschlossen) */
  const [choice, setChoice] = useState<VocabCandidate[] | null>(null)
  const language = subjectById(meta.subjectId).foreignLanguage ?? (meta.subjectId === 'daz' ? 'de' : undefined)

  useEffect(() => {
    window.api.library
      .list()
      .then(setLists)
      .catch(() => setLists([]))
  }, [])

  const add = (words: string[]): void => {
    if (!words.length) return
    const have = new Set(asWords(meta.vocabWords ?? '').map((w) => w.toLowerCase()))
    const added = words.filter((w) => w.trim() && !have.has(w.trim().toLowerCase()))
    if (!added.length) return
    onChange([...asWords(meta.vocabWords ?? ''), ...added].join(', '))
  }

  const usable = lists.filter((l) => !language || !l.language || l.language === language)
  const count = asWords(meta.vocabWords ?? '').length
  const want = targetWordCount(meta)
  // Mehr Wörter als vorgesehen: Ein Blatt trägt nur eine überschaubare Menge
  const tooMany = count > want.max

  return (
    <Stack gap="xs">
      <TextbookPicker
        title="Zielwörter aus dem Schulbuch"
        grau="filtern"
        prefer={{ stateId: meta.stateId, schoolTypeId: meta.schoolTypeId, grade: meta.grade, language }}
        // Die Wörter erscheinen erst im Auswahlfenster – ein ganzer Abschnitt wäre zu viel
        onEntries={(entries, _name, context) => {
          setChoice(entries.map((e) => ({ term: e.term, translation: e.translation, pos: e.pos, note: e.note })))
          onKnown?.(context.known)
        }}
      />

      <MultiSelect
        label="Aus gespeicherten Vokabellisten"
        description={
          usable.length
            ? 'Die Wörter der gewählten Listen werden unten eingetragen – grau markierte bleiben außen vor.'
            : 'Noch keine Vokabellisten gespeichert. Im Programm Vokabellisten angelegte Listen erscheinen hier.'
        }
        placeholder={usable.length ? 'Liste wählen' : 'keine Listen vorhanden'}
        disabled={!usable.length}
        data={usable.map((l) => ({ value: l.id, label: `${l.name} (${l.entries.length} Vokabeln)` }))}
        value={chosen}
        onChange={(ids) => {
          const fresh = ids.filter((id) => !chosen.includes(id))
          setChosen(ids)
          // Grau markierte Vokabeln müssen die Schüler nicht lernen – sie kommen nicht mit
          const entries = fresh
            .map((id) => usable.find((l) => l.id === id))
            .filter((l): l is SavedVocabList => Boolean(l))
            .flatMap((l) => l.entries.filter((e) => !e.grey && e.term.trim()))
          if (entries.length) setChoice(entries.map((e) => ({ term: e.term, translation: e.translation, pos: e.pos, note: e.note })))
        }}
        clearable
        searchable
      />

      <div>
        <Group justify="space-between" mb={4}>
          <Text size="sm" fw={500}>
            Zielwörter
          </Text>
          {count > 0 && (
            <Badge variant="light" size="sm" color={tooMany ? 'orange' : 'gray'}>
              {count} Wörter
            </Badge>
          )}
        </Group>
        {tooMany && (
          <Text size="xs" c="orange" mb={4}>
            Das sind mehr Wörter, als ein Blatt tragen kann. Vorgesehen sind {want.min}–{want.max}: einzelne Abschnitte wählen oder die Liste unten kürzen.
          </Text>
        )}
        <Textarea
          aria-label="Zielwörter"
          description={hint}
          placeholder="z. B. the library, to borrow, due date, fine, to return"
          autosize
          minRows={2}
          maxRows={8}
          value={meta.vocabWords ?? ''}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      </div>

      <VocabChoiceModal
        candidates={choice}
        meta={meta}
        onClose={() => setChoice(null)}
        onTake={(terms) => {
          add(terms)
          setChoice(null)
        }}
      />
    </Stack>
  )
}
