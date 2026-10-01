import { ActionIcon, Badge, Button, Card, Group, Select, Stack, Text } from '@mantine/core'
import ZahlFeld from '../shared/components/ZahlFeld'
import { IconPlus, IconX } from '@tabler/icons-react'
import { useState } from 'react'
import type { AppSettings } from '@shared/types'
import { SUBJECTS, subjectById } from '../modules/arbeitsblatt/model/subjects'
import { DEFAULT_THRESHOLDS } from '../shared/gradeScale'

const NOTEN = [1, 2, 3, 4, 5]

/**
 * Notenschlüssel: allgemein und je Fach.
 *
 * Der Schlüssel arbeitet mit PROZENTSCHWELLEN, nicht mit Punktzahlen – so gilt derselbe
 * Schlüssel für eine Arbeit über 20 wie über 63 Punkte. Die Sechs steht nicht in der Liste;
 * sie gilt immer unterhalb der Fünf.
 *
 * Warum je Fach: Fachkonferenzen legen Notenschlüssel fachweise fest, und in den
 * Fremdsprachen sind andere Schwellen üblich als in Mathematik. Ein einziger Schlüssel für
 * alles hätte die Lehrkraft gezwungen, ihn vor jeder Arbeit von Hand umzustellen.
 */
function SchwellenZeile({ werte, onChange }: { werte: number[]; onChange: (w: number[]) => void }): React.JSX.Element {
  return (
    <Group gap="xs" wrap="nowrap">
      {NOTEN.map((note, i) => (
        <ZahlFeld
          key={note}
          size="xs"
          label={`Note ${note}`}
          suffix=" %"
          min={0}
          max={100}
          style={{ width: 92 }}
          value={werte[i] ?? DEFAULT_THRESHOLDS[i]}
          onChange={(v) => {
            const next = [...werte]
            next[i] = Number(v) || 0
            onChange(next)
          }}
        />
      ))}
    </Group>
  )
}

/** Fällt der Schlüssel von Note 1 zu Note 5 durchgehend? Sonst ist er unbrauchbar. */
const faellt = (w: number[]): boolean => w.every((v, i) => i === 0 || v < w[i - 1])

export default function GradeScaleSettings({ settings, update }: { settings: AppSettings; update: (patch: Partial<AppSettings>) => void }): React.JSX.Element {
  const scale = settings.gradeScale ?? { allgemein: DEFAULT_THRESHOLDS.slice(0, 5), jeFach: {} }
  const allgemein = scale.allgemein?.length ? scale.allgemein.slice(0, 5) : DEFAULT_THRESHOLDS.slice(0, 5)
  const jeFach = scale.jeFach ?? {}
  const [neuesFach, setNeuesFach] = useState<string | null>(null)

  const setzeAllgemein = (w: number[]): void => update({ gradeScale: { ...scale, allgemein: w, jeFach } })
  const setzeFach = (id: string, w: number[]): void => update({ gradeScale: { ...scale, allgemein, jeFach: { ...jeFach, [id]: w } } })
  const entferneFach = (id: string): void => {
    const rest = { ...jeFach }
    delete rest[id]
    update({ gradeScale: { ...scale, allgemein, jeFach: rest } })
  }

  const offeneFaecher = SUBJECTS.filter((s) => s.id !== 'anderes' && !(s.id in jeFach))

  return (
    <Card withBorder>
      <Text fw={600} mb={4}>
        Notenschlüssel
      </Text>
      <Text size="xs" c="dimmed" mb="sm">
        Ab welchem Anteil der Gesamtpunktzahl eine Note gilt. Die Sechs gilt unterhalb der Fünf. Der Schlüssel wird in Klassenarbeiten, Grammatiktests und
        Lernzielkontrollen verwendet und lässt sich dort für die einzelne Arbeit überschreiben.
      </Text>

      <Stack gap="sm">
        <div>
          <Group gap="xs" mb={4}>
            <Text size="sm" fw={500}>
              Für alle Fächer
            </Text>
            {!faellt(allgemein) && (
              <Badge size="xs" color="orange" variant="light">
                Die Schwellen fallen nicht
              </Badge>
            )}
          </Group>
          <SchwellenZeile werte={allgemein} onChange={setzeAllgemein} />
        </div>

        {Object.entries(jeFach).map(([id, werte]) => (
          <div key={id}>
            <Group gap="xs" mb={4}>
              <Text size="sm" fw={500}>
                {subjectById(id).label}
              </Text>
              {!faellt(werte) && (
                <Badge size="xs" color="orange" variant="light">
                  Die Schwellen fallen nicht
                </Badge>
              )}
              <ActionIcon size="sm" variant="subtle" color="gray" aria-label={`${subjectById(id).label} entfernen`} onClick={() => entferneFach(id)}>
                <IconX size={14} />
              </ActionIcon>
            </Group>
            <SchwellenZeile werte={werte} onChange={(w) => setzeFach(id, w)} />
          </div>
        ))}

        {offeneFaecher.length > 0 && (
          <Group gap="xs" align="flex-end">
            <Select
              size="xs"
              label="Eigener Schlüssel für ein Fach"
              placeholder="Fach wählen"
              data={offeneFaecher.map((s) => ({ value: s.id, label: s.label }))}
              value={neuesFach}
              onChange={setNeuesFach}
              searchable
              style={{ flex: 1, maxWidth: 320 }}
            />
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              disabled={!neuesFach}
              onClick={() => {
                if (!neuesFach) return
                setzeFach(neuesFach, [...allgemein])
                setNeuesFach(null)
              }}
            >
              Hinzufügen
            </Button>
          </Group>
        )}
      </Stack>
    </Card>
  )
}
