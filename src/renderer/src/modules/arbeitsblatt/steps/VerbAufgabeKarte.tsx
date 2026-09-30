/**
 * Unregelmäßige Verben im Arbeitsblatt (30.09.2026, Erweiterung der Lehrkraft: „auch in
 * Arbeitsblättern und Vokabeltests abfragen").
 *
 * - `VerbAufgabeKarte`: bei den Angaben unter der Grammatikauswahl – die App hängt die Aufgaben
 *   nach dem Ausformulieren an (generation/verbAufgabe.ts).
 * - `VerbEinfuegenDialog`: im Editor über „Darüber/Darunter einfügen → Unregelmäßige Verben …".
 * Beide mit derselben Auswahl wie im Grammatiktest (shared/verben/VerbAufgabeWahl).
 */
import { Button, Collapse, Group, Modal, Stack, Switch, Text } from '@mantine/core'
import { IconSparkles } from '@tabler/icons-react'
import { useState } from 'react'
import { SPRACHE_DES_FACHS } from '@shared/verben'
import VerbAufgabeWahl from '../../../shared/verben/VerbAufgabeWahl'
import { neueVerbAufgabe } from '../../../shared/verben/quellen'
import { brauchtKi, erzeugeVerbBloecke } from '../../../shared/verben/aufgaben'
import type { VerbAufgabe } from '../../../shared/verben/formate'
import { notifyError } from '../../../shared/util'
import { learningYear, sequenceOf } from '../didactics/grammar'
import { anredeFuerMeta } from '../didactics/anrede'
import type { WorksheetMeta, WsBlock } from '../model/types'

const lernjahrVon = (meta: WorksheetMeta): number => learningYear(meta.grade, sequenceOf(meta), meta.stateId)

/** Gibt es für dieses Fach eine Verbliste? */
export const verbenMoeglich = (meta: Pick<WorksheetMeta, 'subjectId'>): boolean => Boolean(SPRACHE_DES_FACHS[meta.subjectId])

export function VerbAufgabeKarte({ meta, onChange }: { meta: WorksheetMeta; onChange: (patch: Partial<WorksheetMeta>) => void }): React.JSX.Element | null {
  const sprache = SPRACHE_DES_FACHS[meta.subjectId]
  if (!sprache) return null
  // Passt die gespeicherte Aufgabe nicht mehr zur Sprache (Fachwechsel), gilt sie als aus
  const a = meta.verbAufgabe?.sprache === sprache ? meta.verbAufgabe : undefined
  return (
    <Stack gap={6} data-arbeitsblatt-verben>
      <Switch
        label="Unregelmäßige Verben abfragen"
        description="Tabellen, Lücken und Zuordnungen aus der Verbliste des Lehrwerks – die App hängt sie ans Blatt an, die Formen stehen genau wie in der Liste."
        checked={Boolean(a)}
        onChange={(e) => onChange({ verbAufgabe: e.currentTarget.checked ? neueVerbAufgabe(sprache, lernjahrVon(meta)) : undefined })}
      />
      <Collapse expanded={Boolean(a)}>{a && <VerbAufgabeWahl wert={a} onChange={(verbAufgabe) => onChange({ verbAufgabe })} />}</Collapse>
    </Stack>
  )
}

export function VerbEinfuegenDialog({
  opened,
  meta,
  onClose,
  onEinfuegen
}: {
  opened: boolean
  meta: WorksheetMeta
  onClose: () => void
  onEinfuegen: (bloecke: WsBlock[]) => void
}): React.JSX.Element | null {
  const sprache = SPRACHE_DES_FACHS[meta.subjectId]
  const [a, setA] = useState<VerbAufgabe | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  if (!sprache) return null
  const wert = a?.sprache === sprache ? a : (meta.verbAufgabe?.sprache === sprache ? meta.verbAufgabe : null) ?? neueVerbAufgabe(sprache, lernjahrVon(meta))

  const einfuegen = async (): Promise<void> => {
    setLaeuft(true)
    try {
      onEinfuegen(await erzeugeVerbBloecke(wert, anredeFuerMeta(meta), brauchtKi(wert) ? window.api.ai.structured : null))
      onClose()
    } catch (e) {
      notifyError(e, 'Die Aufgaben konnten nicht erstellt werden')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} size="xl" title="Unregelmäßige Verben einfügen" data-verben-einfuegen>
      <Stack>
        <VerbAufgabeWahl wert={wert} onChange={setA} />
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {brauchtKi(wert) ? 'Sätze im Zusammenhang schreibt die KI; die Lösungen prüft die App gegen die Liste.' : 'Entsteht ohne KI aus der Liste.'}
          </Text>
          <Group>
            <Button variant="default" onClick={onClose}>
              Abbrechen
            </Button>
            <Button
              leftSection={brauchtKi(wert) ? <IconSparkles size={16} /> : undefined}
              onClick={() => void einfuegen()}
              loading={laeuft}
              disabled={!wert.verben.length || !wert.formate.length}
              data-verben-einfuegen-ok
            >
              Einfügen
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
