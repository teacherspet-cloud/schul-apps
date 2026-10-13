/**
 * „Mein Fach" (13.10.2026, abgestimmt mit der Lehrkraft): Hier pflegen die Fachobleute (und Admins) die schulweiten
 * Vorgaben ihres Fachs – Regeln in shared/fachvorgaben.ts, Server server/fachvorgaben.ts.
 *
 *  - Curriculum (Vorgabe, je Kurs änderbar): Lehrwerk (Band) und Themen/Reihen je Jahrgang.
 *  - Vorgaben (Standard für alle Lehrkräfte des Fachs, persönlich änderbar): Notenschlüssel, Problemwort-Empfindlichkeit,
 *    Erinnerungen für Lernende, schulinterne Operatoren.
 *  - Fachfarbe (schulweit, Entscheidung 09.10.2026).
 * Fachschafts-Material ordnen die Fachobleute direkt in der Liste „Von der Fachschaft" (⋯ an jedem Eintrag).
 */
import {
  ActionIcon,
  Alert,
  Autocomplete,
  Button,
  Card,
  ColorInput,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  TagsInput,
  Text,
  TextInput,
  Textarea,
  Title
} from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { FAECHER, fachVon } from '@shared/faecher'
import type { FachVorgaben, SchulOperator } from '@shared/fachvorgaben'
import { PROBLEM_STUFE_NAME, PROBLEM_STUFEN } from '@shared/problemWoerter'
import { operatorenAuswahl } from '@shared/operatoren/zugriff'
import { fachVorgabenSpeichern, useFachVorgaben } from '../shared/fachvorgaben'
import { LEHRWERK_GRAMMATIK } from '../shared/lehrwerkGrammatik'
import { useAppSettings } from '../shared/settingsStore'
import { senden } from '../modules/onlinetest/serverApi'
import { notifyError, notifySuccess } from '../shared/util'

const JAHRGAENGE = Array.from({ length: 9 }, (_, i) => String(i + 5))
const STANDARD_NOTEN = [91, 78, 64, 50, 25]

export default function MeinFach(): React.JSX.Element {
  const { vorgaben, darf, geladen } = useFachVorgaben()
  const settings = useAppSettings((s) => s.settings)
  const faecher = useMemo(() => FAECHER.filter((f) => darf.includes(f.id)), [darf])
  const [fach, setFach] = useState<string | null>(null)
  useEffect(() => {
    if (!fach && faecher.length) setFach(faecher[0].id)
  }, [faecher, fach])
  const [v, setV] = useState<FachVorgaben>({})
  const [farbe, setFarbe] = useState('')
  useEffect(() => {
    if (!fach) return
    setV(vorgaben[fach] ?? {})
    setFarbe(settings.fachfarben?.[fach] ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fach, geladen])
  const [laeuft, setLaeuft] = useState(false)
  const baende = useMemo(() => Object.keys(LEHRWERK_GRAMMATIK).sort((a, b) => a.localeCompare(b, 'de', { numeric: true })), [])
  // Operatoren der amtlichen Liste des Landes (Vorschläge zum Weglassen)
  const amtlich = useMemo(() => {
    if (!fach) return []
    const a = operatorenAuswahl({ stateId: settings.defaults?.stateId ?? 'NI', fach, stufe: 'sek1', schulform: settings.defaults?.schoolTypeId })
    return [...new Set([...(a?.operatoren ?? []).map((o) => o.operator), ...(v.operatoren?.weglassen ?? [])])]
  }, [fach, settings.defaults?.stateId, settings.defaults?.schoolTypeId, v.operatoren?.weglassen])

  if (!geladen) return <Text c="dimmed">Lädt …</Text>
  if (!faecher.length)
    return <Alert color="gray">Die Vorgaben eines Fachs pflegen die Fachobleute. Ernannt werden sie von der Verwaltung (Schule & Daten › Fachobleute).</Alert>
  const setze = (p: Partial<FachVorgaben>): void => setV((x) => ({ ...x, ...p }))
  const zusatz = v.operatoren?.zusatz ?? []
  const setzeZusatz = (z: SchulOperator[]): void => setze({ operatoren: { ...v.operatoren, zusatz: z } })
  const speichern = async (): Promise<void> => {
    if (!fach) return
    setLaeuft(true)
    try {
      setV(await fachVorgabenSpeichern(fach, v))
      if (farbe && farbe !== settings.fachfarben?.[fach]) {
        await senden('/server/fachfarben', { farben: { ...(settings.fachfarben ?? {}), [fach]: farbe } })
        await useAppSettings.getState().load()
      }
      notifySuccess(`Vorgaben für ${fachVon(fach)?.label ?? fach} gespeichert.`)
    } catch (e) {
      notifyError(e, 'Nicht gespeichert')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <Stack gap="lg" data-mein-fach>
      <Card withBorder>
        <Group justify="space-between" align="flex-end">
          <Select
            label="Fach"
            data={faecher.map((f) => ({ value: f.id, label: f.label }))}
            value={fach}
            onChange={setFach}
            allowDeselect={false}
            searchable
            w={260}
            data-mein-fach-wahl
          />
          <Text size="xs" c="dimmed" maw={420}>
            Vorgaben gelten für alle Lehrkräfte des Fachs als Standard – wer persönlich etwas anderes einstellt, behält es.
            {v.geaendert ? ` Zuletzt geändert von ${v.geaendert.von} am ${new Date(v.geaendert.am).toLocaleDateString('de-DE')}.` : ''}
          </Text>
        </Group>
      </Card>

      <Card withBorder data-mein-fach-curriculum>
        <Title order={4}>Schulinternes Curriculum</Title>
        <Text size="sm" c="dimmed" mb="sm">
          Lehrwerk und Themen je Jahrgang – füllt Lehrwerk-Stand, Oberthemen der Reihen und das Vorwissen vor. In jedem Kurs änderbar.
        </Text>
        <Stack gap="xs">
          {JAHRGAENGE.map((j) => (
            <Group key={j} align="flex-start" wrap="nowrap" gap="xs" data-curriculum-jahrgang={j}>
              <Text size="sm" fw={600} w={70} pt={6} style={{ flexShrink: 0 }}>
                Klasse {j}
              </Text>
              <Autocomplete
                placeholder="Lehrwerk (Band)"
                data={baende}
                value={v.lehrwerke?.[j] ?? ''}
                onChange={(x) => setze({ lehrwerke: { ...v.lehrwerke, [j]: x } })}
                w={200}
                style={{ flexShrink: 0 }}
                data-curriculum-lehrwerk={j}
              />
              <TagsInput
                placeholder="Themen bzw. Reihen (Enter nach jedem)"
                value={v.themen?.[j] ?? []}
                onChange={(x) => setze({ themen: { ...v.themen, [j]: x } })}
                style={{ flex: 1 }}
                data-curriculum-themen={j}
              />
            </Group>
          ))}
        </Stack>
      </Card>

      <Card withBorder data-mein-fach-vorgaben>
        <Title order={4} mb="sm">
          Vorgaben für alle Lehrkräfte des Fachs
        </Title>
        <Stack gap="md">
          <div>
            <Group gap="xs" mb={4}>
              <Text size="sm" fw={600}>
                Notenschlüssel
              </Text>
              <SegmentedControl
                size="xs"
                value={v.notenschluessel ? 'ja' : 'nein'}
                onChange={(x) => setze({ notenschluessel: x === 'ja' ? v.notenschluessel ?? STANDARD_NOTEN : undefined })}
                data={[
                  { value: 'nein', label: 'keine Vorgabe' },
                  { value: 'ja', label: 'Vorgabe' }
                ]}
                data-vorgabe-noten
              />
            </Group>
            {v.notenschluessel && (
              <Group gap="xs">
                {v.notenschluessel.map((w, i) => (
                  <NumberInput
                    key={i}
                    label={`Note ${i + 1} ab`}
                    suffix=" %"
                    min={0}
                    max={100}
                    value={w}
                    onChange={(x) => setze({ notenschluessel: v.notenschluessel!.map((y, k) => (k === i ? Number(x) || 0 : y)) })}
                    w={100}
                  />
                ))}
              </Group>
            )}
          </div>
          <Select
            label="Problemwörter: Empfindlichkeit"
            description="Standard für die Vokabelkurse des Fachs"
            data={[{ value: '', label: 'keine Vorgabe' }, ...PROBLEM_STUFEN.map((s) => ({ value: String(s), label: `${s} – ${PROBLEM_STUFE_NAME[s]}` }))]}
            value={v.problemStufe ? String(v.problemStufe) : ''}
            onChange={(x) => setze({ problemStufe: x ? Number(x) : undefined })}
            w={360}
            data-vorgabe-problemstufe
          />
          <div>
            <Text size="sm" fw={600} mb={4}>
              Erinnerungen zum Üben für Lernende
            </Text>
            <SegmentedControl
              size="xs"
              value={v.erinnerungen ?? ''}
              onChange={(x) => setze({ erinnerungen: x === 'an' || x === 'aus' ? x : undefined })}
              data={[
                { value: '', label: 'keine Vorgabe (an)' },
                { value: 'an', label: 'anbieten' },
                { value: 'aus', label: 'nicht anbieten' }
              ]}
              data-vorgabe-erinnerungen
            />
          </div>
          <ColorInput label="Fachfarbe (schulweit)" value={farbe} onChange={setFarbe} w={220} data-vorgabe-farbe />
        </Stack>
      </Card>

      <Card withBorder data-mein-fach-operatoren>
        <Title order={4}>Schulinterne Operatoren</Title>
        <Text size="sm" c="dimmed" mb="sm">
          Ergänzen und weglassen gegenüber der amtlichen Liste – gilt in Klassenarbeiten, Kurztests und Arbeitsblättern des Fachs.
        </Text>
        <Stack gap="xs">
          <TagsInput
            label="Nicht verwenden"
            data={amtlich}
            value={v.operatoren?.weglassen ?? []}
            onChange={(x) => setze({ operatoren: { ...v.operatoren, weglassen: x } })}
            data-operatoren-weglassen
          />
          <Text size="sm" fw={600} mt="xs">
            Zusätzlich
          </Text>
          {zusatz.map((o, i) => (
            <Group key={i} align="flex-start" wrap="nowrap" gap="xs">
              <TextInput
                placeholder="Operator"
                value={o.name}
                onChange={(e) => setzeZusatz(zusatz.map((x, k) => (k === i ? { ...x, name: e.currentTarget.value } : x)))}
                w={180}
              />
              <Textarea
                placeholder="Erklärung"
                autosize
                minRows={1}
                value={o.erklaerung}
                onChange={(e) => setzeZusatz(zusatz.map((x, k) => (k === i ? { ...x, erklaerung: e.currentTarget.value } : x)))}
                style={{ flex: 1 }}
              />
              <ActionIcon variant="subtle" color="red" onClick={() => setzeZusatz(zusatz.filter((_, k) => k !== i))} aria-label="Operator entfernen" mt={4}>
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))}
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlus size={14} />}
            onClick={() => setzeZusatz([...zusatz, { name: '', erklaerung: '' }])}
            style={{ alignSelf: 'flex-start' }}
            data-operator-dazu
          >
            Operator hinzufügen
          </Button>
        </Stack>
      </Card>

      <Group justify="flex-end">
        <Button loading={laeuft} onClick={() => void speichern()} data-mein-fach-speichern>
          Vorgaben speichern
        </Button>
      </Group>
    </Stack>
  )
}
