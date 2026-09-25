import { Alert, Badge, Button, Group, Menu, Modal, ScrollArea, Stack, Text, Textarea } from '@mantine/core'
import { IconChecklist } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { notifyError } from '../../../shared/util'
import { parseDelimited } from '../input/parseTable'
import type { VocabEntry } from '../model/types'
import { isIncluded, specialVocab } from '../model/vocab'
import VokabelTabelle, { ZUSATZ } from './VokabelTabelle'

/**
 * Gemeinsame Teile zum Übernehmen von Vokabeln (Paket 7): Auswahlleiste „abfragen",
 * Prüffenster und Einfügen-Fenster. Vokabeltest (Schritt 1) und Vokabellisten nutzen dieselben
 * – vorher fügte die Liste eine kopierte Tabelle ohne Prüfansicht direkt ein, der Test über
 * ein Fenster mit Prüfansicht.
 */

/** Sammelaktionen: alle / keine abfragen, umkehren, Zusatzwortschatz und Kästen gruppenweise */
export function AuswahlLeiste({ entries, onChange }: { entries: VocabEntry[]; onChange: (entries: VocabEntry[]) => void }): React.JSX.Element {
  const filled = entries.filter((v) => v.term.trim())
  const selected = filled.filter(isIncluded).length
  const special = specialVocab(filled)
  const setAll = (fn: (v: VocabEntry) => boolean): void => onChange(entries.map((v) => ({ ...v, include: fn(v) })))
  return (
    <Group gap="xs" mb="xs">
      <Badge variant="light" size="lg" tt="none" leftSection={<IconChecklist size={14} />} data-testid="abfrage-zaehler">
        {selected} von {filled.length} werden abgefragt
      </Badge>
      <Button size="compact-sm" variant="subtle" onClick={() => setAll(() => true)}>
        Alle abfragen
      </Button>
      <Button size="compact-sm" variant="subtle" onClick={() => setAll(() => false)}>
        Keine abfragen
      </Button>
      <Button size="compact-sm" variant="subtle" onClick={() => setAll((v) => !isIncluded(v))}>
        Umkehren
      </Button>
      {special.grey.length > 0 && (
        <Menu shadow="md">
          <Menu.Target>
            <Button size="compact-sm" variant="subtle" color="gray">
              {ZUSATZ} ({special.grey.length}) …
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => setAll((v) => (v.grey ? true : isIncluded(v)))}>alle abfragen</Menu.Item>
            <Menu.Item onClick={() => setAll((v) => (v.grey ? false : isIncluded(v)))}>keine abfragen</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
      {special.box.length > 0 && (
        <Menu shadow="md">
          <Menu.Target>
            <Button size="compact-sm" variant="subtle" color="gray">
              Aus Kästen ({special.box.length}) …
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => setAll((v) => (v.inBox ? true : isIncluded(v)))}>alle abfragen</Menu.Item>
            <Menu.Item onClick={() => setAll((v) => (v.inBox ? false : isIncluded(v)))}>keine abfragen</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
    </Group>
  )
}

/**
 * Prüfansicht vor dem Übernehmen – für Datei, Schulbuch, eingefügte Tabelle und gespeicherte
 * Listen gleich. Kennzeichnungen aus der Vorlage bleiben sichtbar; mit `abfragen` lässt sich
 * zugleich festlegen, welche Wörter der Test abfragt.
 */
export function PruefFenster({
  entries,
  onClose,
  onApply,
  abfragen = true,
  titel
}: {
  entries: VocabEntry[] | null
  onClose: () => void
  onApply: (entries: VocabEntry[], replace: boolean) => void
  abfragen?: boolean
  titel?: string
}): React.JSX.Element {
  const [draft, setDraft] = useState<VocabEntry[]>([])

  useEffect(() => setDraft(entries ?? []), [entries])

  const special = specialVocab(draft)

  return (
    <Modal
      opened={entries !== null}
      onClose={onClose}
      title={titel ?? (abfragen ? 'Vokabeln prüfen und festlegen, was abgefragt wird' : 'Vokabeln prüfen')}
      size="80%"
    >
      <Text size="sm" c="dimmed" mb="xs">
        {abfragen
          ? 'Kurz kontrollieren und bei Bedarf korrigieren. Abgefragt werden nur Vokabeln mit Häkchen; die übrigen bleiben in der Liste und lassen sich später einschalten. Leere Zeilen werden ignoriert.'
          : 'Kurz kontrollieren und bei Bedarf korrigieren. Leere Zeilen werden ignoriert.'}
      </Text>
      {(special.grey.length > 0 || special.box.length > 0) && (
        <Alert color="gray" p="xs" mb="xs">
          <Text size="xs">
            Kennzeichnungen aus der Vorlage: <b>grau</b> = {ZUSATZ}, {abfragen ? 'zunächst nicht abgefragt' : 'muss nicht unbedingt gelernt werden'};{' '}
            <b>Kasten</b> = stand in einem Kasten. Umschalten über das ⋯-Menü der Zeile.
          </Text>
        </Alert>
      )}
      {abfragen && <AuswahlLeiste entries={draft} onChange={setDraft} />}
      <ScrollArea.Autosize mah="55vh">
        <VokabelTabelle zeilen={draft} onChange={setDraft} abfragen={abfragen} />
      </ScrollArea.Autosize>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="light"
          onClick={() =>
            onApply(
              draft.filter((v) => v.term.trim()),
              true
            )
          }
        >
          Bisherige Liste ersetzen
        </Button>
        <Button
          onClick={() =>
            onApply(
              draft.filter((v) => v.term.trim()),
              false
            )
          }
        >
          An Liste anhängen
        </Button>
      </Group>
    </Modal>
  )
}

/** Tabelle aus Word oder Excel einfügen – danach geht es in die Prüfansicht */
export function EinfuegenFenster({
  opened,
  onClose,
  onParsed
}: {
  opened: boolean
  onClose: () => void
  onParsed: (entries: VocabEntry[]) => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  return (
    <Modal opened={opened} onClose={onClose} title="Tabelle einfügen" size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          Tabelle aus Word oder Excel kopieren und hier einfügen (Spalte 1: Wort, Spalte 2: Deutsch, optional Wortart und Notiz). Auch Zeilen wie „to explore –
          erkunden“ funktionieren.
        </Text>
        <Textarea
          autosize
          minRows={10}
          maxRows={20}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          aria-label="Eingefügte Tabelle"
          data-autofocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            disabled={!text.trim()}
            onClick={() => {
              const entries = parseDelimited(text)
              if (entries.length === 0) notifyError('Keine Vokabeln erkannt.')
              else {
                onParsed(entries)
                setText('')
              }
            }}
          >
            Prüfen und übernehmen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
