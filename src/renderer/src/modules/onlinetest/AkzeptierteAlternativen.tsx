/**
 * „Akzeptierte Alternativen" (10.10.2026): die Antworten, die die Lehrkraft in Onlinetests (Vokabeltest) schon einmal als
 * richtig akzeptiert hat – je Sprache, mit Anzahl; jede lässt sich mit × entfernen. Erreichbar in der Ansicht eines
 * Onlinetests und in der Lösungsansicht des Vokabeltest-Editors.
 */
import { ActionIcon, Badge, Button, Group, Modal, Stack, Text, Tooltip } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { aufServer } from '../../shared/plattform'
import { notifyError } from '../../shared/util'
import { akzeptierteEntfernen, akzeptierteLaden, useAkzeptierte } from './akzeptiertSpeicher'

export function AkzeptierteAlternativenKnopf({ sprache }: { sprache: string }): React.JSX.Element | null {
  const [offen, setOffen] = useState(false)
  if (!aufServer() || !sprache) return null
  return (
    <>
      <Button size="xs" variant="subtle" onClick={() => setOffen(true)} data-akzeptierte-alternativen>
        Akzeptierte Alternativen
      </Button>
      {offen && <AkzeptierteAlternativen sprache={sprache} schliessen={() => setOffen(false)} />}
    </>
  )
}

function AkzeptierteAlternativen({ sprache, schliessen }: { sprache: string; schliessen: () => void }): React.JSX.Element {
  const liste = useAkzeptierte(sprache)
  const [laeuft, setLaeuft] = useState<string | null>(null)
  useEffect(() => akzeptierteLaden(sprache, true), [sprache])
  const eintraege = Object.values(liste ?? {})
  const weg = (wort: string, text: string): void => {
    setLaeuft(`${wort}|${text}`)
    void akzeptierteEntfernen(sprache, wort, text)
      .catch((e: unknown) => notifyError(e))
      .finally(() => setLaeuft(null))
  }
  return (
    <Modal opened onClose={schliessen} title="Akzeptierte Alternativen" size="lg">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Antworten, die in Onlinetests schon einmal als richtig akzeptiert wurden. Sie stehen im Lösungsblatt neben der Lösung; schreibt jemand sie
          wieder, kommt die Antwort nach „Zu entscheiden“.
        </Text>
        {!liste && <Text size="sm">Wird geladen …</Text>}
        {liste && !eintraege.length && <Text size="sm">Noch keine.</Text>}
        {eintraege.map((e) => (
          <Group key={e.wort} gap="xs" align="center" wrap="wrap" data-akzeptiert-wort={e.wort}>
            <Text size="sm" fw={600} miw={120}>
              {e.wort}
            </Text>
            {e.alternativen.map((a) => (
              <Badge
                key={a.text}
                variant="light"
                color="green"
                size="lg"
                tt="none"
                rightSection={
                  <Tooltip label="Entfernen">
                    <ActionIcon
                      size="xs"
                      variant="transparent"
                      color="gray"
                      loading={laeuft === `${e.wort}|${a.text}`}
                      onClick={() => weg(e.wort, a.text)}
                      aria-label={`${a.text} entfernen`}
                      data-akzeptiert-entfernen={a.text}
                    >
                      <IconX size={12} />
                    </ActionIcon>
                  </Tooltip>
                }
              >
                {a.text}
                {a.anzahl > 1 ? ` (${a.anzahl}×)` : ''}
              </Badge>
            ))}
          </Group>
        ))}
      </Stack>
    </Modal>
  )
}
