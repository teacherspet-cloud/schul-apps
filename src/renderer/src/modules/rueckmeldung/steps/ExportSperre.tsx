import { Badge, Button, Group, Modal, Paper, Stack, Text } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { gesamtEinstufen, kriterienEinstufen, offeneBestaetigungen } from '../art'
import type { Bogen, Rueckmeldung } from '../model/types'
import { useRueckmeldung } from '../store'
import EinstufungWahl from './EinstufungWahl'

/** Alle Vorschläge eines Bogens bestätigen (Gesamteinstufung und Kriterien) */
export function allesBestaetigen(b: Bogen): void {
  if (b.gesamt?.wert) b.gesamt.bestaetigt = true
  b.kriterienStufen?.forEach((s) => s?.wert && (s.bestaetigt = true))
}

/** Abgaben (Kennungen) mit noch offener Einstufung */
export function offeneAbgaben(r: Rueckmeldung, ids: string[]): string[] {
  return ids.filter((id) => offeneBestaetigungen(r.meta, r.abgaben.find((a) => a.id === id)?.bogen).length > 0)
}

/**
 * Export-Sperre (29.09.2026, Wunsch der Lehrkraft: „Vor dem Öffnen von PDF, Word etc. muss erst
 * die Einstufung bestätigt werden"): Vor PDF, Word, Drucken und MP3 zeigt dieses Fenster die
 * offenen Einstufungen je Abgabe – einzeln oder alle auf einmal zu bestätigen. Erst danach läuft
 * der Export weiter. Ohne Einstufung (`keine`) erscheint es nie.
 */
export default function ExportSperre({ ids, weiter, schliessen }: { ids: string[] | null; weiter: () => void; schliessen: () => void }): React.JSX.Element {
  const { dok: r, update } = useRueckmeldung()
  const liste = r && ids ? r.abgaben.filter((a) => ids.includes(a.id) && a.bogen) : []
  const offen = r && ids ? offeneAbgaben(r, ids) : []
  const bestaetige = (id: string): void =>
    update((d) => {
      const b = d.abgaben.find((a) => a.id === id)?.bogen
      if (b) allesBestaetigen(b)
    })
  const fortfahren = (): void => {
    if (offen.length)
      update((d) => {
        for (const a of d.abgaben) if (a.bogen && offen.includes(a.id)) allesBestaetigen(a.bogen)
      })
    schliessen()
    weiter()
  }
  return (
    <Modal opened={Boolean(ids)} onClose={schliessen} title="Einstufung bestätigen" size="lg" data-rm-sperre>
      {r && (
        <Stack gap="sm" data-rm-sperre>
          <Text size="sm">
            Die KI schlägt die Einstufung nur vor – ausgegeben wird erst, was bestätigt ist.{' '}
            {offen.length ? `Noch offen: ${offen.length === 1 ? 'eine Abgabe' : `${offen.length} Abgaben`}.` : 'Alles bestätigt.'}
          </Text>
          {liste.map((a) => {
            const b = a.bogen as Bogen
            const fehlt = offeneBestaetigungen(r.meta, b)
            const i = r.abgaben.indexOf(a)
            return (
              <Paper key={a.id} withBorder p="xs" radius="md" data-rm-sperre-abgabe={a.kuerzel}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={4}>
                    <Group gap={6}>
                      <Text fw={600} size="sm">
                        {a.name.trim() || a.kuerzel}
                      </Text>
                      <Badge size="xs" variant="light">
                        {a.kuerzel}
                      </Badge>
                      {fehlt.length ? (
                        <Badge size="xs" color="orange" variant="light">
                          offen: {fehlt.join(', ')}
                        </Badge>
                      ) : (
                        <Badge size="xs" color="teal" variant="light" leftSection={<IconCheck size={10} />}>
                          bestätigt
                        </Badge>
                      )}
                    </Group>
                    {gesamtEinstufen(r.meta) && (
                      <Group gap={6}>
                        <Text size="xs" c="dimmed" w={110}>
                          Gesamt{b.gesamt ? ` (${b.gesamt.anteil} %)` : ''}
                        </Text>
                        <EinstufungWahl r={r} w={b.gesamt} setze={(w) => update((d) => d.abgaben[i].bogen && (d.abgaben[i].bogen!.gesamt = w))} />
                      </Group>
                    )}
                    {kriterienEinstufen(r.meta) &&
                      b.kriterien.map((k, n) =>
                        b.kriterienStufen?.[n] ? (
                          <Group key={n} gap={6} wrap="nowrap">
                            <Text size="xs" c="dimmed" w={110} truncate>
                              {k.kriterium}
                            </Text>
                            <EinstufungWahl
                              r={r}
                              klein
                              w={b.kriterienStufen[n]}
                              setze={(w) =>
                                update((d) => {
                                  const x = d.abgaben[i].bogen
                                  if (x?.kriterienStufen) x.kriterienStufen[n] = w
                                })
                              }
                            />
                          </Group>
                        ) : null
                      )}
                  </Stack>
                  {fehlt.length > 0 && (
                    <Button size="xs" color="teal" variant="light" leftSection={<IconCheck size={14} />} onClick={() => bestaetige(a.id)} data-rm-sperre-bestaetigen>
                      Bestätigen
                    </Button>
                  )}
                </Group>
              </Paper>
            )
          })}
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={schliessen}>
              Abbrechen
            </Button>
            <Button color="teal" leftSection={<IconCheck size={16} />} onClick={fortfahren} data-rm-sperre-weiter>
              {offen.length ? 'Alle bestätigen und fortfahren' : 'Fortfahren'}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
