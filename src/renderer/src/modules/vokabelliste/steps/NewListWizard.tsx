import { Alert, Badge, Button, Group, Modal, NumberInput, Progress, ScrollArea, Select, Stack, Table, Text, TextInput } from '@mantine/core'
import { useEffect, useState } from 'react'
import type { CefrTable, SavedVocabList } from '@shared/types'
import DropZone, { FILE_TYPES } from '../../../shared/components/DropZone'
import { notifyError } from '../../../shared/util'
import { schoolTypesForState } from '../../arbeitsblatt/didactics/schoolProfiles'
import { STATES } from '../../arbeitsblatt/didactics/states'
import SchulAngabe from '../../../shared/components/SchulAngabe'
import { importVocabFromFile } from '../../vokabeltest/input/importVocab'
import { newId } from '../../vokabeltest/model/random'
import { LANGUAGES } from '../../vokabeltest/model/types'
import type { VocabEntry } from '../../vokabeltest/model/types'
import { alsListenEintrag } from '../../vokabeltest/model/vocab'
import { aiCall } from '../../vokabeltest/store'
import HaeufigSelect from '../../../shared/components/HaeufigSelect'

/** Vorgaben, die der Wizard mitnimmt (Land, Schulform, Fach kommen aus der Übersicht) */
export interface WizardDefaults {
  stateId: string
  schoolTypeId: string
  language: string
}

/**
 * Neue Vokabelliste anlegen: Dateien hineinziehen, die KI liest die Vokabeln aus,
 * die Lehrkraft ergänzt nur noch die Angaben zur Lerngruppe.
 */
export default function NewListWizard({
  opened,
  defaults,
  onClose,
  onCreated
}: {
  opened: boolean
  defaults: WizardDefaults
  onClose: () => void
  onCreated: (list: SavedVocabList) => void
}): React.JSX.Element {
  const [entries, setEntries] = useState<VocabEntry[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number; message: string } | null>(null)
  const [name, setName] = useState('')
  const [language, setLanguage] = useState(defaults.language)
  const [stateId, setStateId] = useState(defaults.stateId)
  const [schoolTypeId, setSchoolTypeId] = useState(defaults.schoolTypeId)
  const [grade, setGrade] = useState<number | ''>('')
  const [table, setTable] = useState<CefrTable>({ version: 1, states: [] })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!opened) return
    setEntries([])
    setProgress(null)
    setName('')
    setLanguage(defaults.language)
    setStateId(defaults.stateId)
    setSchoolTypeId(defaults.schoolTypeId)
    setGrade('')
    window.api.cefr.get().then(setTable).catch(notifyError)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened])

  /** Alle hineingezogenen Dateien nacheinander von der KI auslesen lassen */
  const read = async (files: File[]): Promise<void> => {
    const found: VocabEntry[] = []
    for (let i = 0; i < files.length; i++) {
      setProgress({ done: i, total: files.length, message: `${files[i].name} wird gelesen …` })
      try {
        found.push(...(await importVocabFromFile(files[i], aiCall, (m) => setProgress({ done: i, total: files.length, message: m }))))
      } catch (e) {
        notifyError(e, `${files[i].name} konnte nicht gelesen werden`)
      }
    }
    setProgress(null)
    if (!found.length) return
    setEntries((old) => [...old, ...found])
    if (!name.trim()) setName(files[0].name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' '))
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const list: SavedVocabList = {
        id: newId(),
        name: name.trim() || `Liste vom ${new Date().toLocaleDateString('de-DE')}`,
        updatedAt: new Date().toISOString(),
        language,
        ...(grade === '' ? {} : { grade: Number(grade) }),
        source: [STATES.find((s) => s.id === stateId)?.name, schoolTypesForState(table, stateId).find((t) => t.value === schoolTypeId)?.label]
          .filter(Boolean)
          .join(' · '),
        entries: entries.filter((e) => e.term.trim()).map(alsListenEintrag)
      }
      onCreated(list)
    } catch (e) {
      notifyError(e)
    } finally {
      setSaving(false)
    }
  }

  const schoolTypes = schoolTypesForState(table, stateId)

  return (
    <Modal opened={opened} onClose={onClose} title="Neue Vokabelliste anlegen" size="xl">
      <Stack>
        <DropZone
          onFiles={read}
          accept={[...FILE_TYPES.image, ...FILE_TYPES.pdf, ...FILE_TYPES.docx, ...FILE_TYPES.csv, ...FILE_TYPES.xlsx]}
          title={progress ? progress.message : 'Eine oder mehrere Dateien hierher ziehen'}
          hint="Fotos und Scans der Vokabelseite, PDF, Word, Excel oder CSV. Die Texterkennung nutzt die eingestellte KI."
          loading={Boolean(progress)}
          minHeight={140}
        />
        {progress && progress.total > 1 && <Progress value={(progress.done / progress.total) * 100} size="sm" />}

        {/* Name und Fach auch ohne Datei: Eine leere Liste lässt sich von Hand füllen (Paket 7) */}
        <Group grow align="flex-start">
          <TextInput label="Name der Liste" placeholder="z. B. Unit 3 – Station 2" value={name} onChange={(e) => setName(e.currentTarget.value)} />
          <Select
            label="Fach / Sprache"
            data={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
            value={language}
            onChange={(v) => v && setLanguage(v)}
            allowDeselect={false}
          />
        </Group>

        {entries.length > 0 && (
          <>
            <Group gap="xs">
              <Badge variant="light" size="lg">
                {entries.length} Vokabeln erkannt
              </Badge>
              <Text size="xs" c="dimmed">
                Im nächsten Schritt lässt sich jede Zeile ändern, ergänzen oder als Zusatzwortschatz (im Buch grau) kennzeichnen.
              </Text>
            </Group>

            {/* Bundesland und Schulform stehen eingeklappt, solange sie den Einstellungen entsprechen */}
            <SchulAngabe
              stateId={stateId}
              stateName={STATES.find((s) => s.id === stateId)?.name ?? stateId}
              schoolTypeId={schoolTypeId}
              schoolTypeName={schoolTypes.find((t) => t.value === schoolTypeId)?.label ?? ''}
            >
              <Group grow align="flex-start">
                <HaeufigSelect
                  art="bundesland"
                  label="Bundesland"
                  data={STATES.map((s) => ({ value: s.id, label: s.name }))}
                  value={stateId}
                  onChange={(v) => v && setStateId(v)}
                  allowDeselect={false}
                  searchable
                />
                <HaeufigSelect
                  art="schulform"
                  label="Schulform"
                  data={schoolTypes}
                  value={schoolTypes.some((t) => t.value === schoolTypeId) ? schoolTypeId : (schoolTypes[0]?.value ?? '')}
                  onChange={(v) => v && setSchoolTypeId(v)}
                  allowDeselect={false}
                />
              </Group>
            </SchulAngabe>
            <Group grow align="flex-start">
              <NumberInput
                label="Jahrgang (optional)"
                placeholder="z. B. 8"
                min={1}
                max={13}
                clampBehavior="blur"
                value={grade}
                onChange={(v) => setGrade(v === '' ? '' : Number(v))}
              />
            </Group>

            <ScrollArea.Autosize mah={260}>
              <Table striped withTableBorder fz="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Wort</Table.Th>
                    <Table.Th>Übersetzung</Table.Th>
                    <Table.Th w={90}>Wortart</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {entries.slice(0, 40).map((e) => (
                    <Table.Tr key={e.id}>
                      <Table.Td>{e.term}</Table.Td>
                      <Table.Td>{e.translation}</Table.Td>
                      <Table.Td>{e.pos ?? ''}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              {entries.length > 40 && (
                <Text size="xs" c="dimmed" mt={4}>
                  … und {entries.length - 40} weitere
                </Text>
              )}
            </ScrollArea.Autosize>
          </>
        )}

        {!entries.length && !progress && (
          <Alert color="gray" p="xs">
            <Text size="sm">
              Es lassen sich mehrere Dateien auf einmal hineinziehen – die Vokabeln aller Dateien landen in derselben Liste. Ohne Datei entsteht eine leere
              Liste zum Eintippen.
            </Text>
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          {/* Bis Paket 7 ging es nur mit erkannten Vokabeln – eine Liste von Hand ließ sich nicht anlegen */}
          <Button loading={saving} disabled={Boolean(progress)} onClick={() => void save()}>
            {entries.length ? 'Liste anlegen und bearbeiten' : 'Leere Liste anlegen'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
