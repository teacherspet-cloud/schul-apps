import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconFileTypeDocx, IconFileTypePdf, IconListDetails, IconPlus, IconSparkles, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { speichereAusgabe, WORD_FILTER } from '../../../shared/export/ausgabe'
import { verlaufDocx } from '../../../shared/stundenverlauf/docx'
import {
  leererVerlauf,
  minutenAngleichen,
  SOZIALFORMEN,
  summeMinuten,
  verlaufAus,
  verlaufHtml,
  verlaufsAnfrage,
  type Stundenverlauf
} from '../../../shared/stundenverlauf/stundenverlauf'
import { notifyError, safeFileName } from '../../../shared/util'
import type { LearnerProfile } from '../didactics/profile'
import { describeSheet } from '../generation/describe'
import { systemPrompt } from '../generation/prompts'
import type { Worksheet } from '../model/types'
import { aiCall, useArbeitsblatt } from '../store'

/**
 * Reiter „Stundenverlauf" im Editor des Arbeitsblatts (Großprogramm 0.4, F4): mit KI aus dem
 * Material entwerfen, als Tabelle bearbeiten, als Word oder PDF speichern. Nur für die Lehrkraft.
 */
export function StundenverlaufPanel({ ws, profile }: { ws: Worksheet; profile: LearnerProfile }): React.JSX.Element {
  const update = useArbeitsblatt((s) => s.update)
  const [busy, setBusy] = useState(false)
  const [wunsch, setWunsch] = useState('')
  const [dauer, setDauer] = useState<number>(ws.stundenverlauf?.dauer ?? (ws.meta.minutes > 50 ? 90 : 45))
  const v = ws.stundenverlauf
  const titel = ws.meta.title || ws.meta.topic
  const untertitel = `${ws.meta.subjectLabel} · Klasse ${ws.meta.grade}`

  const setze = (fn: (d: Stundenverlauf) => void, gruppe?: string): void =>
    update((w) => {
      if (w.stundenverlauf) fn(w.stundenverlauf)
    }, gruppe)

  const erstellen = async (): Promise<void> => {
    setBusy(true)
    try {
      const material = ws.sheets.map((s) => `${ws.sheets.length > 1 ? `[${s.label}]\n` : ''}${describeSheet(s)}`).join('\n\n')
      const antwort = await aiCall<unknown>(verlaufsAnfrage(systemPrompt(ws.meta, profile), material, dauer, wunsch.trim()))
      const neu = verlaufAus(antwort, dauer)
      update((w) => (w.stundenverlauf = neu))
    } catch (e) {
      notifyError(e, 'Der Stundenverlauf konnte nicht erstellt werden')
    } finally {
      setBusy(false)
    }
  }

  const speichern = (art: 'docx' | 'pdf'): void => {
    if (!v) return
    const name = safeFileName(`${titel} - Stundenverlauf`)
    void speichereAusgabe(
      art === 'docx'
        ? [{ name: `${name}.docx`, filter: WORD_FILTER, daten: () => verlaufDocx(v, titel, untertitel, ws.meta.ki) }]
        : [{ name: `${name}.pdf`, html: verlaufHtml(v, titel, untertitel, ws.meta.ki) }],
      'Stundenverlauf gespeichert.'
    ).catch(notifyError)
  }

  const kopf = (
    <Group gap="xs">
      <IconListDetails size={22} />
      <Title order={4}>Stundenverlauf</Title>
    </Group>
  )
  const erstellFelder = (
    <Stack gap="xs">
      <Group align="flex-end" gap="sm">
        <SegmentedControl
          size="xs"
          data={[
            { value: '45', label: '45 Minuten' },
            { value: '90', label: '90 Minuten' }
          ]}
          value={String(dauer === 90 ? 90 : 45)}
          onChange={(x) => setDauer(Number(x))}
        />
        <Textarea
          style={{ flex: 1 }}
          size="xs"
          placeholder="Wünsche (optional), z. B. „mit Placemat in der Erarbeitung“, „Einstieg über ein Bild“"
          autosize
          minRows={1}
          value={wunsch}
          onChange={(e) => setWunsch(e.currentTarget.value)}
        />
        <Button size="xs" leftSection={<IconSparkles size={14} />} loading={busy} onClick={() => void erstellen()} data-verlauf-erstellen>
          {v ? 'Neu mit KI erstellen' : 'Mit KI erstellen'}
        </Button>
      </Group>
    </Stack>
  )

  if (!v)
    return (
      <Card withBorder w="297mm" maw="100%" p="lg">
        <Stack gap="sm">
          {kopf}
          <Text size="sm" c="dimmed">
            Ein tabellarischer Verlauf der Stunde mit diesem Material: Phasen, Zeiten, geplantes Geschehen, Sozialformen, Medien. Die KI entwirft ihn aus den
            Aufgaben und Materialien des Blattes; danach ist jede Zeile bearbeitbar. Er erscheint nicht auf den Blättern der Lernenden.
          </Text>
          {erstellFelder}
          <Group justify="flex-end">
            <Button size="xs" variant="subtle" onClick={() => update((w) => (w.stundenverlauf = leererVerlauf(dauer)))}>
              Leere Vorlage
            </Button>
          </Group>
        </Stack>
      </Card>
    )

  const summe = summeMinuten(v)
  return (
    <Card withBorder w="297mm" maw="100%" p="lg">
      <Stack gap="sm">
        <Group justify="space-between">
          {kopf}
          <Group gap="xs">
            <Button size="xs" variant="light" leftSection={<IconFileTypeDocx size={14} />} onClick={() => speichern('docx')}>
              Word
            </Button>
            <Button size="xs" variant="light" leftSection={<IconFileTypePdf size={14} />} onClick={() => speichern('pdf')}>
              PDF
            </Button>
            <Tooltip label="Stundenverlauf entfernen">
              <ActionIcon variant="subtle" color="red" aria-label="Stundenverlauf entfernen" onClick={() => update((w) => delete w.stundenverlauf)}>
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
        {erstellFelder}
        <Group align="flex-end" gap="sm">
          <TextInput
            style={{ flex: 1 }}
            size="xs"
            label="Stundenziel"
            value={v.ziel}
            onChange={(e) => {
              const wert = e.currentTarget.value
              setze((d) => (d.ziel = wert), 'verlauf-ziel')
            }}
          />
          <NumberInput
            w={130}
            size="xs"
            label="Dauer (Minuten)"
            min={10}
            max={240}
            step={5}
            value={v.dauer}
            onChange={(x) => update((w) => w.stundenverlauf && (w.stundenverlauf = minutenAngleichen({ ...w.stundenverlauf, dauer: Number(x) || 45 })))}
          />
        </Group>
        {summe !== v.dauer && (
          <Alert color="yellow" variant="light" p="xs">
            <Group justify="space-between">
              <Text size="xs">
                Die Phasen ergeben {summe} statt {v.dauer} Minuten.
              </Text>
              <Button
                size="compact-xs"
                variant="light"
                onClick={() => update((w) => w.stundenverlauf && (w.stundenverlauf = minutenAngleichen(w.stundenverlauf)))}
              >
                Verhältnisgleich angleichen
              </Button>
            </Group>
          </Alert>
        )}
        <Table withTableBorder withColumnBorders verticalSpacing={4} fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w="13%">Phase</Table.Th>
              <Table.Th w="8%">Zeit</Table.Th>
              <Table.Th>Geplantes Geschehen</Table.Th>
              <Table.Th w="10%">Sozialform</Table.Th>
              <Table.Th w="18%">Medien / Material</Table.Th>
              <Table.Th w={70} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {v.phasen.map((p, i) => (
              <Table.Tr key={p.id}>
                <Table.Td>
                  <TextInput
                    size="xs"
                    variant="unstyled"
                    value={p.phase}
                    onChange={(e) => {
                      const x = e.currentTarget.value
                      setze((d) => (d.phasen[i].phase = x), `verlauf-${p.id}-phase`)
                    }}
                    aria-label="Phase"
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    size="xs"
                    variant="unstyled"
                    min={1}
                    value={p.minuten}
                    onChange={(x) => setze((d) => (d.phasen[i].minuten = Number(x) || 1), `verlauf-${p.id}-min`)}
                    aria-label="Minuten"
                  />
                </Table.Td>
                <Table.Td>
                  <Textarea
                    size="xs"
                    variant="unstyled"
                    autosize
                    minRows={1}
                    value={p.geschehen.replace(/ · /g, '\n')}
                    onChange={(e) => {
                      const x = e.currentTarget.value
                      setze(
                        (d) =>
                          (d.phasen[i].geschehen = x
                            .split('\n')
                            .map((z) => z.trim())
                            .filter(Boolean)
                            .join(' · ')),
                        `verlauf-${p.id}-text`
                      )
                    }}
                    aria-label="Geplantes Geschehen"
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    size="xs"
                    variant="unstyled"
                    data={[...new Set([...SOZIALFORMEN, p.sozialform].filter(Boolean))]}
                    value={p.sozialform}
                    onChange={(x) => x && setze((d) => (d.phasen[i].sozialform = x))}
                    aria-label="Sozialform"
                  />
                </Table.Td>
                <Table.Td>
                  <Textarea
                    size="xs"
                    variant="unstyled"
                    autosize
                    minRows={1}
                    value={p.medien}
                    onChange={(e) => {
                      const x = e.currentTarget.value
                      setze((d) => (d.phasen[i].medien = x), `verlauf-${p.id}-medien`)
                    }}
                    aria-label="Medien"
                  />
                </Table.Td>
                <Table.Td>
                  <Group gap={2} wrap="nowrap">
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      disabled={i === 0}
                      aria-label="Nach oben"
                      onClick={() => setze((d) => d.phasen.splice(i - 1, 0, ...d.phasen.splice(i, 1)))}
                    >
                      <IconArrowUp size={14} />
                    </ActionIcon>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      disabled={i === v.phasen.length - 1}
                      aria-label="Nach unten"
                      onClick={() => setze((d) => d.phasen.splice(i + 1, 0, ...d.phasen.splice(i, 1)))}
                    >
                      <IconArrowDown size={14} />
                    </ActionIcon>
                    <ActionIcon size="sm" variant="subtle" color="red" aria-label="Phase entfernen" onClick={() => setze((d) => d.phasen.splice(i, 1))}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Group justify="space-between">
          <Button
            size="xs"
            variant="subtle"
            leftSection={<IconPlus size={14} />}
            onClick={() =>
              setze((d) =>
                d.phasen.push({ id: Math.random().toString(36).slice(2, 10), phase: 'Phase', minuten: 5, geschehen: '', sozialform: 'UG', medien: '' })
              )
            }
          >
            Phase hinzufügen
          </Button>
          <Text size="xs" c={summe === v.dauer ? 'dimmed' : 'orange'}>
            Summe: {summe} von {v.dauer} Minuten
          </Text>
        </Group>
        <Textarea
          size="xs"
          label="Hinweise"
          autosize
          minRows={1}
          value={v.hinweise ?? ''}
          onChange={(e) => {
            const x = e.currentTarget.value
            setze((d) => (d.hinweise = x), 'verlauf-hinweise')
          }}
        />
      </Stack>
    </Card>
  )
}
