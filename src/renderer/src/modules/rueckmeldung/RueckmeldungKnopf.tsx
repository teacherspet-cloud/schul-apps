import { Button, Menu, Tooltip } from '@mantine/core'
import { IconChevronDown, IconClockPlus, IconMessageCheck } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { notifyError, notifySuccess } from '../../shared/util'
import { appFreigegeben } from '../../shared/plattform'
import type { MaterialEintrag } from './generation'
import { rueckmeldungIdZu, rueckmeldungVorbereiten, rueckmeldungZu } from './vorgabe'

/**
 * „Rückmeldung …" in der Leiste der Editoren (Großprogramm 0.4, F3): öffnet das Programm
 * „Rückmeldung" mit diesem Material als Grundlage – die Aufgaben und der Erwartungshorizont
 * gehen mit, Abgaben kommen dort dazu. Gibt es zu diesem Material schon eine Rückmeldung,
 * heißt der Knopf „Rückmeldung öffnen" und öffnet sie (08.10.2026).
 *
 * Daneben (23.10.2026, Wunsch der Lehrkraft) „Vorbereiten – Abgaben später": legt die
 * Rückmeldung nur an und speichert sie, ohne das Programm zu wechseln.
 */
export default function RueckmeldungKnopf({ art, docId }: { art: MaterialEintrag['art']; docId: string }): React.JSX.Element | null {
  const [vorhanden, setVorhanden] = useState(false)
  useEffect(() => {
    let aktuell = true
    setVorhanden(false)
    rueckmeldungIdZu(art, docId)
      .then((id) => aktuell && setVorhanden(Boolean(id)))
      .catch(() => undefined)
    return () => {
      aktuell = false
    }
  }, [art, docId])
  // App-Freigaben (23.10.2026): ohne Freigabe der Ziel-App kein Weg dorthin – seit 27.10.2026 auch nicht „Rückmeldung öffnen"
  // zu einer schon vorhandenen Rückmeldung (Befund der Lehrkraft: der Knopf stand trotz gesperrter App im Vokabeltest)
  if (!appFreigegeben('rueckmeldung')) return null
  const knopf = (
    <Tooltip
      label={vorhanden ? 'Die Rückmeldung zu diesem Material öffnen' : 'Rückmeldung zu Schülerarbeiten – mit diesem Material als Grundlage'}
      multiline
      w={260}
    >
      <Button
        size="xs"
        variant="default"
        leftSection={<IconMessageCheck size={14} />}
        onClick={() =>
          rueckmeldungZu(art, docId)
            .then(() => setVorhanden(true))
            .catch(notifyError)
        }
        data-rueckmeldung-zu={vorhanden ? 'vorhanden' : 'neu'}
      >
        {vorhanden ? 'Rückmeldung öffnen' : 'Rückmeldung …'}
      </Button>
    </Tooltip>
  )
  if (vorhanden) return knopf
  return (
    <Button.Group>
      {knopf}
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <Button size="xs" variant="default" px={6} aria-label="Weitere Wege zur Rückmeldung" data-rueckmeldung-mehr>
            <IconChevronDown size={14} />
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconClockPlus size={16} />}
            onClick={() =>
              rueckmeldungVorbereiten(art, docId)
                .then(() => {
                  setVorhanden(true)
                  notifySuccess('Rückmeldung vorbereitet – sie steht in „Meine Rückmeldungen“. Abgaben kommen später dazu.')
                })
                .catch(notifyError)
            }
            data-rueckmeldung-vorbereiten
          >
            Vorbereiten – Abgaben später
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Button.Group>
  )
}
