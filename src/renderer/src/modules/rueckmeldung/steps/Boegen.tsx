import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Grid,
  Group,
  NavLink,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title
} from '@mantine/core'
import { bogenUeberschriften } from '../render/texte'
import { IconFileTypeDocx, IconFileTypePdf, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { speichereAusgabe, WORD_FILTER } from '../../../shared/export/ausgabe'
import { notifyError, safeFileName } from '../../../shared/util'
import { boegenDocx, boegenHtml } from '../ausgabe'
import { rueckmeldungenErzeugen } from '../auftrag'
import type { Abgabe, Bogen, Einschaetzung, Rueckmeldung } from '../model/types'
import { useRueckmeldung } from '../store'

/**
 * Schritt 2 der Rückmeldung (Großprogramm 0.4, F3): die Bögen durchsehen, bearbeiten und als
 * PDF oder Word speichern – einzeln oder alle in einer Datei (je Bogen eine Seite).
 */
export default function Boegen(): React.JSX.Element | null {
  const { dok: r, update, docId } = useRueckmeldung()
  const [auswahl, setAuswahl] = useState<string | null>(null)
  if (!r) return null
  const fertige = r.abgaben.filter((a) => a.bogen)
  const aktiv = r.abgaben.find((a) => a.id === auswahl && a.bogen) ?? fertige[0]
  const i = aktiv ? r.abgaben.indexOf(aktiv) : -1

  const speichern = (liste: Abgabe[], art: 'pdf' | 'docx'): void => {
    const basis = safeFileName(
      `${r.meta.title || r.grundlage.titel || 'Rückmeldung'}${liste.length === 1 ? ` - ${liste[0].name.trim() || liste[0].kuerzel}` : ''}`
    )
    void speichereAusgabe(
      art === 'pdf'
        ? [{ name: `${basis}.pdf`, html: boegenHtml(r, liste) }]
        : [{ name: `${basis}.docx`, filter: WORD_FILTER, daten: () => boegenDocx(r, liste) }],
      liste.length === 1 ? 'Rückmeldung gespeichert.' : `${liste.length} Rückmeldungen gespeichert.`
    ).catch(notifyError)
  }

  const setzeBogen = (fn: (b: Bogen) => void, gruppe?: string): void =>
    update((d) => {
      const b = d.abgaben[i]?.bogen
      if (b) fn(b)
    }, gruppe)

  const liste = (feld: 'staerken' | 'schritte', titel: string): React.JSX.Element => (
    <Stack gap={4}>
      <Text fw={600}>{titel}</Text>
      {aktiv!.bogen![feld].map((s, k) => (
        <Group key={k} gap={4} wrap="nowrap" align="flex-start">
          <Textarea
            style={{ flex: 1 }}
            size="xs"
            autosize
            minRows={1}
            value={s}
            onChange={(e) => {
              const x = e.currentTarget.value
              setzeBogen((b) => (b[feld][k] = x), `rm-${aktiv!.id}-${feld}-${k}`)
            }}
          />
          <ActionIcon size="sm" variant="subtle" color="red" aria-label="Zeile entfernen" onClick={() => setzeBogen((b) => b[feld].splice(k, 1))}>
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      ))}
      <Button size="compact-xs" variant="subtle" leftSection={<IconPlus size={12} />} w="fit-content" onClick={() => setzeBogen((b) => b[feld].push(''))}>
        Zeile hinzufügen
      </Button>
    </Stack>
  )

  return (
    <ScrollArea h="100%">
      <Container size="xl" py="lg">
        <Group justify="space-between" mb="md">
          <Title order={2}>Rückmeldungen</Title>
          <Group gap="xs">
            {r.abgaben.some((a) => !a.bogen && (a.text.trim() || a.bilder.length)) && (
              <Button size="xs" variant="light" onClick={() => rueckmeldungenErzeugen(r, docId)}>
                Fehlende Bögen schreiben
              </Button>
            )}
            <Button size="xs" variant="light" leftSection={<IconFileTypePdf size={14} />} disabled={!fertige.length} onClick={() => speichern(fertige, 'pdf')}>
              Alle als PDF
            </Button>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconFileTypeDocx size={14} />}
              disabled={!fertige.length}
              onClick={() => speichern(fertige, 'docx')}
            >
              Alle als Word
            </Button>
          </Group>
        </Group>
        <Grid>
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Card withBorder padding={4}>
              {r.abgaben.map((a) => (
                <NavLink
                  key={a.id}
                  active={a.id === aktiv?.id}
                  disabled={!a.bogen}
                  label={a.name.trim() || a.kuerzel}
                  description={a.bogen ? `${a.kuerzel} · Bogen fertig` : `${a.kuerzel} · noch ohne Bogen`}
                  onClick={() => setAuswahl(a.id)}
                />
              ))}
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 9 }}>
            {!aktiv?.bogen ? (
              <Text c="dimmed">Noch kein Bogen fertig.</Text>
            ) : (
              <Card withBorder>
                <Stack gap="md">
                  <Group justify="space-between">
                    <Group gap="xs">
                      <Title order={4}>Rückmeldung für {aktiv.name.trim() || aktiv.kuerzel}</Title>
                      <Badge variant="light">{aktiv.kuerzel}</Badge>
                    </Group>
                    <Group gap="xs">
                      <Button size="xs" variant="default" leftSection={<IconFileTypePdf size={14} />} onClick={() => speichern([aktiv], 'pdf')}>
                        PDF
                      </Button>
                      <Button size="xs" variant="default" leftSection={<IconFileTypeDocx size={14} />} onClick={() => speichern([aktiv], 'docx')}>
                        Word
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        leftSection={<IconRefresh size={14} />}
                        onClick={() => {
                          update((d) => delete d.abgaben[i].bogen)
                          const neu = useRueckmeldung.getState().dok as Rueckmeldung
                          rueckmeldungenErzeugen(neu, docId)
                        }}
                      >
                        Neu schreiben
                      </Button>
                    </Group>
                  </Group>
                  {aktiv.name.trim() && (
                    <Text size="xs" c="dimmed">
                      Im Ausdruck (PDF, Word) steht statt „{aktiv.kuerzel}" der Name „{aktiv.name.trim()}" – eingesetzt auf diesem Rechner.
                    </Text>
                  )}
                  {aktiv.bogen.entfernt ? (
                    <Alert color="yellow" variant="light" p="xs">
                      {aktiv.bogen.entfernt} Aussage{aktiv.bogen.entfernt > 1 ? 'n' : ''} mit Note oder Punkten wurde{aktiv.bogen.entfernt > 1 ? 'n' : ''}{' '}
                      entfernt – die Rückmeldung bleibt ohne Bewertung.
                    </Alert>
                  ) : null}
                  {liste('staerken', bogenUeberschriften(r.meta.anrede).staerken)}
                  {liste('schritte', bogenUeberschriften(r.meta.anrede).schritte)}
                  <Stack gap={4}>
                    <Text fw={600}>Worauf es ankam</Text>
                    <Table withTableBorder verticalSpacing={4} fz="xs">
                      <Table.Tbody>
                        {aktiv.bogen.kriterien.map((k, n) => (
                          <Table.Tr key={n}>
                            <Table.Td w="32%">
                              <TextInput
                                size="xs"
                                variant="unstyled"
                                value={k.kriterium}
                                onChange={(e) => {
                                  const x = e.currentTarget.value
                                  setzeBogen((b) => (b.kriterien[n].kriterium = x), `rm-k-${n}`)
                                }}
                                aria-label="Kriterium"
                              />
                            </Table.Td>
                            <Table.Td w="18%">
                              <Select
                                size="xs"
                                variant="unstyled"
                                data={['sicher', 'teilweise', 'noch nicht']}
                                value={k.einschaetzung}
                                onChange={(x) => x && setzeBogen((b) => (b.kriterien[n].einschaetzung = x as Einschaetzung))}
                                aria-label="Einschätzung"
                                allowDeselect={false}
                              />
                            </Table.Td>
                            <Table.Td>
                              <Textarea
                                size="xs"
                                variant="unstyled"
                                autosize
                                minRows={1}
                                value={k.beleg ?? ''}
                                onChange={(e) => {
                                  const x = e.currentTarget.value
                                  setzeBogen((b) => (b.kriterien[n].beleg = x), `rm-b-${n}`)
                                }}
                                aria-label="Beleg"
                              />
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Stack>
                  <Textarea
                    label="Schlusssatz"
                    size="xs"
                    autosize
                    minRows={1}
                    value={aktiv.bogen.schluss ?? ''}
                    onChange={(e) => {
                      const x = e.currentTarget.value
                      setzeBogen((b) => (b.schluss = x), `rm-schluss-${aktiv.id}`)
                    }}
                  />
                </Stack>
              </Card>
            )}
          </Grid.Col>
        </Grid>
      </Container>
    </ScrollArea>
  )
}
