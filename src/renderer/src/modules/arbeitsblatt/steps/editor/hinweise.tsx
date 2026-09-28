import { ActionIcon, Button, Group, Modal, Stack, Text, Tooltip } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useState } from 'react'
import { KiHinweise } from '../KiHinweise'
import '../../render/ws.css'
import '../../../vokabeltest/steps/editor.css'
import { AlleBehebenKnopf, KiBehebenKnopf } from '../../../../shared/components/KiBeheben'
import { istBehebbar } from '../../../../shared/kiBeheben'

/**
 * Fragt nach den Wörtern des KI-Tests.
 *
 * Wunsch der Lehrkraft (25.09.2026): „wenn man den ki test oben aktiviert, frage den nutzer
 * welche wörter als test benutzt werden sollen."
 *
 * Vorher würfelte das Programm ein Wort aus Titel und Thema. Das ist bequem, aber die
 * Lehrkraft sucht hinterher in den Abgaben danach – und nur sie weiß, ob ein Wort im eigenen
 * Unterricht gerade ohnehin vorkommt und als Test damit wertlos wäre.
 *
 * Der Satz, der auf dem Blatt landet, steht im Dialog. Ein unsichtbarer Text auf dem
 * Schülermaterial sollte nichts sein, das man erst im fertigen PDF entdeckt.
 */
/**
 * Die Hinweise zum ganzen Blatt hinter einem roten Ausrufezeichen.
 *
 * Getrennt gehalten: Was die KI der Lehrkraft mitteilt (`teacherNote`), steht oben; darunter
 * die Befunde der Prüfungen. Beides zusammen wurde als Kasten zu lang, verschwinden soll es
 * aber nicht – ein übersehener Hinweis ist genau das, was später auf dem Blatt auffällt.
 */
export function BlattHinweise({
  note,
  warnings,
  onBeheben,
  laeuft
}: {
  note?: string
  warnings: string[]
  onBeheben?: (hinweise: string[]) => void
  laeuft?: boolean
}): React.JSX.Element | null {
  const [offen, setOffen] = useState(false)
  const anzahl = warnings.length + (note?.trim() ? 1 : 0)
  if (!anzahl) return null
  return (
    <>
      <Tooltip label={`${anzahl} Hinweis${anzahl === 1 ? '' : 'e'} für die Lehrkraft`}>
        <ActionIcon size="lg" variant="light" color="red" aria-label="Hinweise für die Lehrkraft anzeigen" onClick={() => setOffen(true)}>
          <IconAlertTriangle size={18} />
        </ActionIcon>
      </Tooltip>
      <Modal opened={offen} onClose={() => setOffen(false)} title="Hinweise für die Lehrkraft" size="lg">
        <Stack gap="sm">
          {note?.trim() && <KiHinweise note={note} />}
          {warnings.length > 0 && (
            <Stack gap={6}>
              <Text size="sm" fw={600}>
                {warnings.length === 1 ? 'Ein Befund der Prüfung' : `${warnings.length} Befunde der Prüfung`}
              </Text>
              {warnings.map((w, i) => (
                <Group key={i} justify="space-between" gap="xs" wrap="nowrap" align="flex-start" data-hinweis>
                  <Text size="sm">· {w}</Text>
                  {onBeheben && istBehebbar(w) && (
                    <KiBehebenKnopf
                      laeuft={laeuft}
                      onClick={() => {
                        onBeheben([w])
                        setOffen(false)
                      }}
                    />
                  )}
                </Group>
              ))}
              {onBeheben && (
                <Group justify="flex-end">
                  <AlleBehebenKnopf
                    anzahl={warnings.filter(istBehebbar).length}
                    laeuft={laeuft}
                    onClick={() => {
                      onBeheben(warnings.filter(istBehebbar))
                      setOffen(false)
                    }}
                  />
                </Group>
              )}
            </Stack>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOffen(false)}>
              Schließen
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
