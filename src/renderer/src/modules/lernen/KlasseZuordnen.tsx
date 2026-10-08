/**
 * „Lernende einer Klasse zuordnen…" (08.10.2026, Wunsch der Lehrkraft): Die Lernenden eines Kurses – vor allem die
 * eingetragenen Gäste mit persönlichem Anmeldecode – werden zusätzlich Mitglieder einer Lerngruppe aus „Meine Klassen".
 * Code, Name und Lernstand bleiben, die Anmeldung geht weiter wie bisher; danach sehen sie auch die Freigaben der
 * Lerngruppe (Arbeitsblätter, Aufgaben, Onlinetests, weitere Kurse). Auf Wunsch wird der Kurs mit der Lerngruppe
 * verbunden – nur angeboten, wenn das am Zugang nichts ändert. Server: vokabeln.ts (…/klasse-zuordnen).
 */
import { Alert, Badge, Button, Group, Loader, Modal, Select, Stack, Switch, Table, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { notifyError, notifySuccess } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'

interface Vorschau {
  lerngruppeId: string
  lernende: { id: string; name: string; gast: boolean }[]
  gruppen: { id: string; name: string; fach: string; schon: string[]; verknuepfbar: boolean }[]
}

export function KlasseZuordnen({ id, schliessen }: { id: string; schliessen: (geaendert: boolean) => void }): React.JSX.Element {
  const [v, setV] = useState<Vorschau | null>(null)
  const [gruppe, setGruppe] = useState<string | null>(null)
  const [verknuepfen, setVerknuepfen] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  useEffect(() => {
    void holen<Vorschau>(`/server/vokabeln/${id}/klasse-zuordnen`).then(
      (d) => {
        setV(d)
        // Vorauswahl: die Lerngruppe des Kurses
        if (d.lerngruppeId && d.gruppen.some((g) => g.id === d.lerngruppeId)) setGruppe(d.lerngruppeId)
      },
      (e: unknown) => notifyError(e)
    )
  }, [id])
  const g = v?.gruppen.find((x) => x.id === gruppe) ?? null
  const schon = new Set(g?.schon ?? [])
  const neu = v && g ? v.lernende.filter((l) => !schon.has(l.id)) : []
  const los = async (): Promise<void> => {
    if (!g) return
    setLaeuft(true)
    try {
      const r = await senden<{ dazu: number; verknuepft: boolean }>(`/server/vokabeln/${id}/klasse-zuordnen`, {
        lerngruppeId: g.id,
        verknuepfen: verknuepfen && g.verknuepfbar
      })
      notifySuccess(
        `${r.dazu} ${r.dazu === 1 ? 'Person' : 'Personen'} in ${g.name}${g.fach ? ` (${g.fach})` : ''} eingetragen${r.verknuepft ? ', Kurs verbunden' : ''}.`
      )
      schliessen(true)
    } catch (e) {
      notifyError(e)
      setLaeuft(false)
    }
  }
  return (
    <Modal opened onClose={() => schliessen(false)} title="Lernende einer Klasse zuordnen" size="lg">
      {!v ? (
        <Loader size="sm" />
      ) : (
        <Stack gap="sm" data-klasse-zuordnen>
          <Text size="sm">
            Die Lernenden dieses Kurses gehören danach auch zur gewählten Lerngruppe in „Meine Klassen“ und sehen deren Freigaben. Ihre
            Anmeldecodes, Namen und Lernstände bleiben unverändert.
          </Text>
          {v.gruppen.length === 0 ? (
            <Alert color="yellow">Noch keine Lerngruppe angelegt – zuerst unter „Meine Klassen“ eine Klasse anlegen.</Alert>
          ) : (
            <Select
              label="Lerngruppe"
              placeholder="Klasse wählen"
              data={v.gruppen.map((x) => ({ value: x.id, label: x.fach ? `${x.name} – ${x.fach}` : x.name }))}
              value={gruppe}
              onChange={(w) => (setGruppe(w), setVerknuepfen(false))}
              searchable
              data-klasse-wahl
            />
          )}
          {g && (
            <Table striped data-zuordnen-liste>
              <Table.Tbody>
                {v.lernende.map((l) => (
                  <Table.Tr key={l.id} data-schon={schon.has(l.id) ? '1' : undefined}>
                    <Table.Td fw={600}>{l.name}</Table.Td>
                    <Table.Td>
                      {l.gast ? (
                        <Badge size="xs" variant="light" color="gray">
                          mit Anmeldecode
                        </Badge>
                      ) : (
                        <Badge size="xs" variant="light">
                          Konto
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {schon.has(l.id) ? (
                        <Text size="xs" c="dimmed">
                          schon in der Klasse
                        </Text>
                      ) : (
                        <Text size="xs" c="teal" fw={600}>
                          kommt dazu
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
          {g && v.lerngruppeId === '' && g.verknuepfbar && (
            <Switch
              label={`Kurs außerdem mit ${g.name} verbinden`}
              description="Er erscheint dann in „Meine Klassen“ bei dieser Klasse. Wer Zugang hat, ändert sich nicht."
              checked={verknuepfen}
              onChange={(e) => setVerknuepfen(e.currentTarget.checked)}
              data-kurs-verbinden
            />
          )}
          {g && v.lerngruppeId === '' && !g.verknuepfbar && (
            <Text size="xs" c="dimmed">
              Den Kurs mit dieser Lerngruppe zu verbinden, würde weiteren Mitgliedern Zugang geben – deshalb nur Zuordnen.
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => schliessen(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={!g || (!neu.length && !(verknuepfen && g.verknuepfbar))}
              loading={laeuft}
              onClick={() => void los()}
              data-zuordnen-los
            >
              {neu.length ? `${neu.length} zuordnen` : verknuepfen ? 'Kurs verbinden' : 'Alle sind schon in der Klasse'}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
