import { ActionIcon, Badge, Button, Group, Stack, Table, Text, TextInput } from '@mantine/core'
import ZahlFeld from '../../../shared/components/ZahlFeld'
import { IconDeviceFloppy, IconPlus, IconTrash } from '@tabler/icons-react'
import { notifyError, notifySuccess } from '../../../shared/util'
import { newId } from '../../vokabeltest/model/random'
import { speichereTabellenVorlage } from '../ablagen'
import { setzeForm } from '../art'
import type { Bewertungstabelle } from '../model/types'
import { useRueckmeldung } from '../store'

/**
 * Bewertungstabelle der Rückmeldung (29.09.2026): frei bearbeitbar und als Vorlage ablegbar, gilt für alle Abgaben.
 * Seit 23.10.2026 nur noch der Editor – Anlegen (hochladen, KI, selbst, Vorlage) steht in BewertungKarte.tsx.
 */
export default function TabelleKarte(): React.JSX.Element | null {
  const { dok: r, update } = useRueckmeldung()
  if (!r?.tabelle) return null
  const t = r.tabelle

  const setze = (fn: (t: Bewertungstabelle) => void, gruppe?: string): void =>
    update((d) => {
      if (d.tabelle) fn(d.tabelle)
    }, gruppe)

  const summe = t.kriterien.reduce((s, k) => s + (k.punkte ?? 0), 0)

  return (
    <div data-rm-tabelle>
      {t.entwurf && (
        <Badge color="orange" variant="light" mb="xs">
          Entwurf der KI – bitte prüfen
        </Badge>
      )}
      <Stack gap="xs">
        <TextInput size="xs" label="Titel" value={t.titel} onChange={(e) => setze((x) => (x.titel = e.currentTarget.value), 'rm-tab-titel')} />
        <Table withTableBorder fz="xs" verticalSpacing={2}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w="22%">Bereich</Table.Th>
              <Table.Th>Kriterium</Table.Th>
              <Table.Th w={90}>Punkte</Table.Th>
              <Table.Th w={30} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {t.kriterien.map((k, i) => (
              <Table.Tr key={k.id}>
                <Table.Td>
                  <TextInput
                    size="xs"
                    variant="unstyled"
                    value={k.bereich ?? ''}
                    aria-label="Bereich"
                    onChange={(e) => {
                      const x = e.currentTarget.value
                      setze((tt) => (tt.kriterien[i].bereich = x || undefined), `rm-tab-b-${k.id}`)
                    }}
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    size="xs"
                    variant="unstyled"
                    value={k.kriterium}
                    aria-label="Kriterium"
                    onChange={(e) => {
                      const x = e.currentTarget.value
                      setze((tt) => (tt.kriterien[i].kriterium = x), `rm-tab-k-${k.id}`)
                    }}
                  />
                </Table.Td>
                <Table.Td>
                  <ZahlFeld
                    size="xs"
                    variant="unstyled"
                    min={0}
                    max={100}
                    value={k.punkte ?? 0}
                    aria-label="Höchstpunktzahl (0 = Stufen)"
                    onChange={(v) => setze((tt) => (tt.kriterien[i].punkte = Number(v) > 0 ? Number(v) : undefined), `rm-tab-p-${k.id}`)}
                  />
                </Table.Td>
                <Table.Td>
                  <ActionIcon size="sm" variant="subtle" color="red" aria-label="Kriterium entfernen" onClick={() => setze((tt) => tt.kriterien.splice(i, 1))}>
                    <IconTrash size={14} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Group justify="space-between">
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<IconPlus size={12} />}
            onClick={() => setze((tt) => tt.kriterien.push({ id: newId(), kriterium: '', punkte: 4 }))}
          >
            Kriterium hinzufügen
          </Button>
          <Text size="xs" c="dimmed">
            {summe ? `Summe: ${summe} Punkte` : 'Bewertung über Stufen'}
            {t.kriterien.some((k) => !k.punkte) ? ` · Stufen: ${t.stufen.join(' / ')}` : ''}
          </Text>
        </Group>
        {t.kriterien.some((k) => !k.punkte) && (
          <TextInput
            size="xs"
            label="Stufen (beste zuerst, mit Schrägstrich getrennt)"
            value={t.stufen.join(' / ')}
            onChange={(e) => {
              const x = e.currentTarget.value
                .split('/')
                .map((s) => s.trim())
                .filter(Boolean)
              if (x.length >= 2) setze((tt) => (tt.stufen = x), 'rm-tab-stufen')
            }}
          />
        )}
        <Group gap="xs">
          {t.entwurf && (
            <Button size="xs" variant="light" color="teal" onClick={() => setze((tt) => delete tt.entwurf)}>
              Durchgesehen
            </Button>
          )}
          <Button
            size="xs"
            variant="default"
            leftSection={<IconDeviceFloppy size={14} />}
            onClick={() =>
              void speichereTabellenVorlage(t, t.titel)
                .then((id) => {
                  setze((tt) => (tt.vorlageId = id))
                  notifySuccess('Als Vorlage gespeichert.')
                })
                .catch(notifyError)
            }
          >
            Als Vorlage speichern
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color="red"
            onClick={() =>
              update((d) => {
                delete d.tabelle
                // Ohne Tabelle keine Form „Bewertungstabelle" (23.10.2026)
                setzeForm(d.meta, 'tabelle', false)
              })
            }
          >
            Tabelle entfernen
          </Button>
        </Group>
      </Stack>
    </div>
  )
}
