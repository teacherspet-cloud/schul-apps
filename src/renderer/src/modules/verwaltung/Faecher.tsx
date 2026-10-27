/**
 * Schule & Daten › Fächer (27.10.2026, abgestimmt mit der Lehrkraft): alle Fächer, die an der Schule unterrichtet werden,
 * und zu jedem Fach die Schulbücher (shared/components/Schulbuecher.tsx). Die Fächerliste ist aus Lerngruppen,
 * IServ-Fachschaften, eigenen Fächern der Lehrkräfte und Fachobleuten vorbelegt; der Admin ergänzt oder entfernt Fächer
 * aus dem Katalog (shared/faecher.ts). Bücher pflegen hier Admins, in „Mein Fach“ die Fachobleute ihres Fachs.
 */
import { Alert, Button, Group, Loader, Select, Stack, Text, Title, Tooltip } from '@mantine/core'
import { IconInfoCircle, IconPlus, IconRefresh, IconX } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { FAECHER, fachVon } from '@shared/faecher'
import { senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { FachPunkt } from '../../shared/components/FachFarbe'
import { KlappKarte } from '../../shared/components/KlappKarte'
import { SchulbuchListe, useSchulbuchKatalog, type Katalog } from '../../shared/components/Schulbuecher'

export function Faecher(): React.JSX.Element {
  const { katalog, setKatalog } = useSchulbuchKatalog()
  const [neuesFach, setNeuesFach] = useState<string | null>(null)
  const [speichert, setSpeichert] = useState(false)
  const liste = katalog?.faecher.liste ?? []
  const auswahl = useMemo(() => FAECHER.filter((f) => !liste.includes(f.id)).map((f) => ({ value: f.id, label: f.label })), [liste])

  const faecherSpeichern = async (neu: string[]): Promise<void> => {
    if (!katalog) return
    setSpeichert(true)
    try {
      const d = await senden<{ faecher: Katalog['faecher'] }>('/server/schulbuecher/faecher', { liste: neu })
      setKatalog({ ...katalog, faecher: d.faecher })
      notifySuccess('Fächer der Schule gespeichert.')
    } catch (e) {
      notifyError(e, 'Die Fächer ließen sich nicht speichern')
    } finally {
      setSpeichert(false)
    }
  }
  if (!katalog) return <Loader />
  const buecherJe = (fach: string): number => katalog.buecher.filter((b) => b.faecher.includes(fach)).length
  const aendern = (buecher: Katalog['buecher']): void => setKatalog({ ...katalog, buecher })

  return (
    <Stack gap="md" maw={980} data-faecher>
      <Group justify="space-between" align="start">
        <div>
          <Title order={3}>Fächer</Title>
          <Text size="sm" c="dimmed" maw={680}>
            Alle Fächer, die an der Schule unterrichtet werden, mit ihren Schulbüchern. Die Liste ist aus den Lerngruppen, den IServ-Fachschaften und den
            Fächern der Lehrkräfte vorbelegt. Bücher pflegen Admins hier und die Fachobleute unter „Mein Fach“.
          </Text>
        </div>
        <Group gap="xs">
          <Select placeholder="Fach hinzufügen" data={auswahl} value={neuesFach} onChange={setNeuesFach} searchable w={240} data-fach-wahl />
          <Button
            leftSection={<IconPlus size={16} />}
            disabled={!neuesFach}
            loading={speichert}
            onClick={() => {
              if (!neuesFach) return
              void faecherSpeichern([...liste, neuesFach])
              setNeuesFach(null)
            }}
            data-fach-hinzufuegen
          >
            Hinzufügen
          </Button>
        </Group>
      </Group>
      {!katalog.faecher.gespeichert && (
        <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
          Vorbelegung aus den Daten der Schule ({liste.length} {liste.length === 1 ? 'Fach' : 'Fächer'}). Sobald ein Fach hinzugefügt oder entfernt wird, gilt
          die gespeicherte Liste.
        </Alert>
      )}
      {katalog.faecher.gespeichert && katalog.faecher.abgeleitet.some((f) => !liste.includes(f)) && (
        <Alert color="gray" variant="light" icon={<IconInfoCircle size={16} />}>
          In den Daten kommen weitere Fächer vor, die nicht in der Liste stehen:{' '}
          {katalog.faecher.abgeleitet
            .filter((f) => !liste.includes(f))
            .map((f) => fachVon(f)?.label ?? f)
            .join(', ')}
          .{' '}
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<IconRefresh size={12} />}
            onClick={() => void faecherSpeichern([...new Set([...liste, ...katalog.faecher.abgeleitet])])}
          >
            Alle übernehmen
          </Button>
        </Alert>
      )}
      {liste.length === 0 && <Text c="dimmed">Noch kein Fach – oben ein Fach aus dem Katalog hinzufügen.</Text>}
      {/* Auf-/zuklappbar je Fach (27.10.2026, Wunsch der Lehrkraft) – Stand dauerhaft gemerkt wie in Schule & Daten › Schule */}
      {liste.map((fach) => (
        <KlappKarte
          key={fach}
          id={`faecher-${fach}`}
          dauerhaft
          titel={
            <Group gap="sm" wrap="nowrap">
              <FachPunkt fach={fach} groesse={16} />
              <span>{fachVon(fach)?.label ?? fach}</span>
            </Group>
          }
          status={buecherJe(fach) === 1 ? '1 Buch' : `${buecherJe(fach)} Bücher`}
          rahmen={{ 'data-fach-karte': fach }}
        >
          <Stack gap="xs">
            <Group justify="flex-end">
              <Tooltip label="Fach aus der Liste entfernen (Bücher und Materialien bleiben)">
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray"
                  leftSection={<IconX size={14} />}
                  onClick={() => void faecherSpeichern(liste.filter((f) => f !== fach))}
                  data-fach-entfernen={fach}
                >
                  Fach aus der Liste entfernen
                </Button>
              </Tooltip>
            </Group>
            <SchulbuchListe fach={fach} katalog={katalog} aendern={aendern} />
          </Stack>
        </KlappKarte>
      ))}
    </Stack>
  )
}
