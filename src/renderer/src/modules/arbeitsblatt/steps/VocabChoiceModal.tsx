import { Alert, Badge, Button, Group, Modal, ScrollArea, Table, Text } from '@mantine/core'
import { IconSparkles } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { notifyError, notifySuccess } from '../../../shared/util'
import { targetWordCount } from '../didactics/vocabWork'
import { pickVocabWords, suggestVocabWords } from '../generation/vocabSuggest'
import type { VocabCandidate } from '../generation/vocabSuggest'
import type { WorksheetMeta } from '../model/types'
import { aiCall } from '../store'

/**
 * Auswahlfenster für die Zielwörter – wie die Vokabelliste im Programm Vokabeltest:
 * alle Wörter mit Häkchen, dazu ein Knopf, der die sinnvollsten Wörter vorschlägt.
 */
export default function VocabChoiceModal({
  candidates,
  meta,
  onClose,
  onTake
}: {
  /** null = geschlossen */
  candidates: VocabCandidate[] | null
  meta: WorksheetMeta
  onClose: () => void
  onTake: (terms: string[]) => void
}): React.JSX.Element {
  const [chosen, setChosen] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const want = targetWordCount(meta)

  useEffect(() => {
    if (!candidates) return
    // Vorauswahl ohne KI, damit sofort eine sinnvolle Menge dasteht
    setChosen(pickVocabWords(candidates, want.max))
    setReason('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates])

  const suggest = async (): Promise<void> => {
    if (!candidates) return
    setBusy(true)
    try {
      const result = await suggestVocabWords(candidates, meta, aiCall)
      setChosen(result.terms)
      setReason(result.reason)
      notifySuccess(`${result.terms.length} Wörter vorgeschlagen.`)
    } catch (e) {
      notifyError(e, 'Die KI konnte keine Auswahl treffen – es gilt die Regelauswahl')
      setChosen(pickVocabWords(candidates, want.max))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (term: string): void => setChosen((c) => (c.includes(term) ? c.filter((t) => t !== term) : [...c, term]))
  const tooMany = chosen.length > want.max

  return (
    <Modal opened={candidates !== null} onClose={onClose} title="Vokabeln für das Arbeitsblatt auswählen" size="xl">
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <Badge variant="light" size="lg" color={tooMany ? 'orange' : 'teal'}>
            {chosen.length} von {candidates?.length ?? 0} gewählt
          </Badge>
          <Text size="xs" c="dimmed">
            Für Klasse {meta.grade} sind {want.min}–{want.max} Zielwörter vorgesehen.
          </Text>
        </Group>
        <Group gap="xs">
          <Button size="compact-sm" variant="subtle" onClick={() => setChosen(candidates?.map((c) => c.term) ?? [])}>
            Alle
          </Button>
          <Button size="compact-sm" variant="subtle" onClick={() => setChosen([])}>
            Keine
          </Button>
          <Button size="compact-sm" variant="light" leftSection={<IconSparkles size={14} />} loading={busy} onClick={() => void suggest()}>
            Vokabeln vorschlagen
          </Button>
        </Group>
      </Group>

      {reason && (
        <Alert color="teal" p="xs" mb="xs">
          <Text size="xs">{reason}</Text>
        </Alert>
      )}
      {tooMany && (
        <Alert color="orange" p="xs" mb="xs">
          <Text size="xs">Mehr als {want.max} Wörter überfrachten das Blatt. Beim Erstellen wählt die App daraus die passendsten aus.</Text>
        </Alert>
      )}

      <ScrollArea.Autosize mah="55vh">
        <Table striped withTableBorder fz="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={44}>
                <span aria-hidden>✓</span>
              </Table.Th>
              <Table.Th>Wort</Table.Th>
              <Table.Th>Übersetzung</Table.Th>
              <Table.Th w={110}>Wortart</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(candidates ?? []).map((c) => (
              <Table.Tr key={c.term} onClick={() => toggle(c.term)} style={{ cursor: 'pointer' }}>
                <Table.Td>
                  <input
                    type="checkbox"
                    aria-label={`${c.term} auswählen`}
                    checked={chosen.includes(c.term)}
                    onChange={() => toggle(c.term)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Table.Td>
                <Table.Td>{c.term}</Table.Td>
                <Table.Td>{c.translation}</Table.Td>
                <Table.Td>{c.pos ?? ''}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>

      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          disabled={!chosen.length}
          onClick={() => {
            // In der Reihenfolge der Vorlage übernehmen
            onTake((candidates ?? []).filter((c) => chosen.includes(c.term)).map((c) => c.term))
          }}
        >
          {chosen.length} Wörter übernehmen
        </Button>
      </Group>
    </Modal>
  )
}
