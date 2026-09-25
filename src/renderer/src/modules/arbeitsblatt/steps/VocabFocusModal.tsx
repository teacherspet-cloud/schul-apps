import { Alert, Badge, Button, Checkbox, Group, Modal, MultiSelect, ScrollArea, Select, Stack, Table, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import type { SavedVocabList } from '@shared/types'
import { TextbookPicker } from '../../vokabeltest/steps/TextbookPicker'
import { STRICT_UP_TO_GRADE } from '../../../shared/knownVocab'
import type { KnownVocab } from '../../../shared/knownVocab'
import { splitVocabWords, VOCAB_WORK } from '../didactics/vocabWork'
import { subjectById } from '../model/subjects'
import type { VocabWorkMode, WorksheetMeta } from '../model/types'

/** Ein Wort mit Übersetzung, aus welcher Quelle auch immer. */
interface Word {
  term: string
  translation: string
  /** Woher es stammt – nur zur Anzeige */
  source: string
}

/** Ein Verfahren für die ganze App, damit Wendungen mit Komma überall gleich behandelt werden. */
export const splitWords = splitVocabWords

const key = (term: string): string => term.trim().toLowerCase()

/**
 * Auswahl der Vokabeln, die auf diesem Arbeitsblatt besonders vorkommen sollen.
 *
 * Gedacht für Blätter, deren Schwerpunkt ein anderer ist – Leseverstehen, Grammatik,
 * Schreiben –, auf denen aber der Wortschatz mitlaufen soll, den die Klasse gerade lernt.
 * Deshalb ein Pop-up und kein weiteres Feld im Formular: Es ist eine Entscheidung, die man
 * einmal trifft, nicht eine, die ständig sichtbar sein muss.
 *
 * Zwei Ebenen, weil beide gebraucht werden: erst die QUELLE (Schulbuchabschnitt oder
 * gespeicherte Liste), dann die einzelnen WÖRTER daraus – eine ganze Unit ist für ein Blatt
 * meist zu viel.
 *
 * Die Wahl eines Schulbuchabschnitts setzt zugleich die Obergrenze des Wortschatzes: Alles
 * bis dorthin gilt als bekannt, alles danach nicht. Bis Klasse 7 ist das streng.
 */
export default function VocabFocusModal({
  opened,
  meta,
  onClose,
  onTake
}: {
  opened: boolean
  meta: WorksheetMeta
  onClose: () => void
  onTake: (words: string, mode: VocabWorkMode, known: KnownVocab | undefined) => void
}): React.JSX.Element {
  const language = subjectById(meta.subjectId).foreignLanguage ?? (meta.subjectId === 'daz' ? 'de' : undefined)
  const [lists, setLists] = useState<SavedVocabList[]>([])
  const [listIds, setListIds] = useState<string[]>([])
  const [words, setWords] = useState<Word[]>([])
  const [chosen, setChosen] = useState<string[]>([])
  const [mode, setMode] = useState<VocabWorkMode>(meta.vocabWork ?? 'practise')
  const [known, setKnown] = useState<KnownVocab | undefined>(meta.knownVocab)
  /** Erklärt, warum weniger Wörter in der Liste stehen, als der Knopf angekündigt hat */
  const [hinweis, setHinweis] = useState('')

  useEffect(() => {
    window.api.library
      .list()
      .then(setLists)
      .catch(() => setLists([]))
  }, [])

  // Beim Öffnen: Was schon gewählt ist, steht wieder da und ist angehakt
  useEffect(() => {
    if (!opened) return
    const have = splitWords(meta.vocabWords ?? '')
    setWords(have.map((term) => ({ term, translation: '', source: 'bereits gewählt' })))
    setChosen(have.map(key))
    setMode(meta.vocabWork ?? 'practise')
    setKnown(meta.knownVocab)
    setHinweis('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened])

  const usable = useMemo(() => lists.filter((l) => !language || !l.language || l.language === language), [lists, language])

  /**
   * Neue Wörter dazunehmen – jedes Wort steht am Ende GENAU EINMAL in der Liste.
   *
   * Dubletten entstehen auf zwei Wegen, und beide kamen vor:
   * - INNERHALB einer Holung: Pronomen wie „I", „you", „she" stehen in mehreren Abschnitten
   *   einer Unit. Bei „Hello" + „Unit 1" von Green Line 1 waren es 375 Einträge, aber nur
   *   332 verschiedene Wörter.
   * - ZWISCHEN zwei Holungen: Wer erst ohne und dann mit „Kästen/grau" holt, bekam die
   *   Schnittmenge doppelt gezählt – aus 375 wurden so 346.
   *
   * Vorher wurde nur gegen den BESTAND geprüft, nicht innerhalb der frischen Menge. Die Zahl
   * im Abzeichen passte dadurch zu nichts: weder zur Zahl im Knopf noch zur Zahl der Wörter.
   *
   * Kommt ein Wort aus mehreren Abschnitten, werden die Herkünfte zusammengefasst, statt eine
   * davon wegzuwerfen – die Lehrkraft sieht dann, dass es in beiden vorkommt.
   */
  const addWords = (fresh: Word[]): void => {
    let neu = 0
    let schonDa = 0
    setWords((old) => {
      const byKey = new Map(old.map((w) => [key(w.term), w]))
      for (const w of fresh) {
        if (!w.term.trim()) continue
        const vorhanden = byKey.get(key(w.term))
        if (!vorhanden) {
          byKey.set(key(w.term), w)
          neu++
          continue
        }
        schonDa++
        // Neues Objekt statt Änderung am alten: Der Zustand bleibt unangetastet
        if (w.source && !vorhanden.source.includes(w.source)) byKey.set(key(w.term), { ...vorhanden, source: `${vorhanden.source}, ${w.source}` })
      }
      return [...byKey.values()]
    })
    /*
     * Die Zahl im Knopf zählt EINTRÄGE des Buches, die Liste WÖRTER – und weil Pronomen in
     * mehreren Abschnitten stehen, sind das verschiedene Zahlen. Ohne Erklärung sieht der
     * Unterschied wie ein Fehler aus (genau so wurde er auch gemeldet). Deshalb sagt die
     * Meldung, was PASSIERT ist, nicht was intern weggefallen ist.
     */
    setHinweis(schonDa ? `${neu} neu dazu, ${schonDa} waren schon dabei oder stehen im Buch mehrfach.` : '')
    // Frisch geholte Wörter sind angehakt: Wer eine Quelle wählt, will sie in aller Regel
    setChosen((old) => [...new Set([...old, ...fresh.filter((w) => w.term.trim()).map((w) => key(w.term))])])
  }

  const toggle = (term: string): void => setChosen((c) => (c.includes(key(term)) ? c.filter((t) => t !== key(term)) : [...c, key(term)]))
  const selected = words.filter((w) => chosen.includes(key(w.term)))
  const strict = meta.grade <= STRICT_UP_TO_GRADE

  return (
    <Modal opened={opened} onClose={onClose} title="Vokabeln für dieses Arbeitsblatt" size="xl">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Wähle die Listen oder Abschnitte, um die es gerade geht, und daraus die Wörter, die auf dem Blatt besonders vorkommen sollen – in Texten, Hörtexten
          und Aufgaben.
        </Text>

        <TextbookPicker
          title="Aus dem Schulbuch"
          multiUnit
          prefer={{ stateId: meta.stateId, schoolTypeId: meta.schoolTypeId, grade: meta.grade, language }}
          onEntries={(entries, name, context) => {
            addWords(entries.map((e) => ({ term: e.term, translation: e.translation, source: name })))
            // Der gewählte Abschnitt legt zugleich fest, was die Klasse schon kennt
            if (context.known) setKnown(context.known)
          }}
        />

        <MultiSelect
          label="Aus gespeicherten Vokabellisten"
          description={
            usable.length
              ? 'Die Wörter der gewählten Listen erscheinen unten – grau markierte bleiben außen vor.'
              : 'Noch keine Vokabellisten für dieses Fach. Lege sie im Programm Vokabellisten an, dann erscheinen sie hier.'
          }
          placeholder={usable.length ? 'Liste wählen' : 'keine Listen vorhanden'}
          disabled={!usable.length}
          data={usable.map((l) => ({ value: l.id, label: `${l.name} (${l.entries.length} Vokabeln)` }))}
          value={listIds}
          onChange={(ids) => {
            const fresh = ids.filter((id) => !listIds.includes(id))
            setListIds(ids)
            for (const id of fresh) {
              const list = usable.find((l) => l.id === id)
              if (!list) continue
              // Grau markierte Wörter muss die Klasse nicht lernen – sie kommen nicht mit
              addWords(list.entries.filter((e) => !e.grey && e.term.trim()).map((e) => ({ term: e.term, translation: e.translation, source: list.name })))
            }
          }}
          clearable
          searchable
        />

        {known && (
          <Alert color={strict ? 'blue' : 'gray'} icon={<IconAlertTriangle size={16} />} p="xs">
            <Text size="xs">
              Bekannter Wortschatz: {known.source} ({known.total} Wörter).{' '}
              {strict
                ? `Bis Klasse ${STRICT_UP_TO_GRADE} gilt das streng – Texte, Hörtexte und Aufgaben benutzen keine Wörter aus späteren Abschnitten.`
                : 'Ab Klasse 8 ist das eine Orientierung; Wortschatz aus anderen Quellen darf vorkommen.'}
            </Text>
          </Alert>
        )}

        {words.length > 0 && (
          <div>
            <Group justify="space-between" mb={4}>
              <Badge variant="light" size="lg" color="teal">
                {selected.length} von {words.length} gewählt
              </Badge>
              <Group gap="xs">
                {hinweis && (
                  <Text size="xs" c="dimmed">
                    {hinweis}
                  </Text>
                )}
                <Button size="compact-xs" variant="subtle" onClick={() => setChosen(words.map((w) => key(w.term)))}>
                  Alle
                </Button>
                <Button size="compact-xs" variant="subtle" onClick={() => setChosen([])}>
                  Keine
                </Button>
              </Group>
            </Group>
            <ScrollArea.Autosize mah={280} type="auto">
              <Table highlightOnHover striped withTableBorder>
                <Table.Tbody>
                  {words.map((w) => (
                    <Table.Tr key={key(w.term)} onClick={() => toggle(w.term)} style={{ cursor: 'pointer' }}>
                      <Table.Td w={36}>
                        <Checkbox checked={chosen.includes(key(w.term))} onChange={() => toggle(w.term)} aria-label={w.term} />
                      </Table.Td>
                      <Table.Td>{w.term}</Table.Td>
                      <Table.Td c="dimmed">{w.translation}</Table.Td>
                      <Table.Td w={160}>
                        <Text size="xs" c="dimmed">
                          {w.source}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          </div>
        )}

        <Select
          label="Was mit diesen Wörtern geschehen soll"
          description={VOCAB_WORK.find((v) => v.value === mode)?.description}
          data={VOCAB_WORK.map((v) => ({ value: v.value, label: v.label }))}
          value={mode}
          onChange={(v) => v && setMode(v as VocabWorkMode)}
          allowDeselect={false}
        />

        <Text size="xs" c="dimmed">
          Die Wörter sind vorrangig, nicht verpflichtend: Die KI baut so viele ein, wie Texte und Aufgaben natürlich tragen. Der Schwerpunkt des Blattes bleibt,
          was du eingestellt hast.
        </Text>

        <Group justify="space-between">
          <Button variant="subtle" color="gray" onClick={() => setChosen([])} disabled={!selected.length}>
            Auswahl leeren
          </Button>
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              Abbrechen
            </Button>
            {/* Zeilenweise, nicht mit Komma: Eine Wendung wie „to look after sb., sth." bliebe
                sonst nicht ein Eintrag, sondern zerfiele in zwei. */}
            <Button onClick={() => onTake(selected.map((w) => w.term).join('\n'), mode, known)}>
              {selected.length ? `${selected.length} Wörter übernehmen` : 'Ohne Vokabeln fortfahren'}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
