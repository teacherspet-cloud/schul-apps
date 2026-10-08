import { Button, Tooltip } from '@mantine/core'
import { IconMessageCheck } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { notifyError } from '../../shared/util'
import type { MaterialEintrag } from './generation'
import { rueckmeldungIdZu, rueckmeldungZu } from './vorgabe'

/**
 * „Rückmeldung …" in der Leiste der Editoren (Großprogramm 0.4, F3): öffnet das Programm
 * „Rückmeldung" mit diesem Material als Grundlage – die Aufgaben und der Erwartungshorizont
 * gehen mit, Abgaben kommen dort dazu. Gibt es zu diesem Material schon eine Rückmeldung,
 * heißt der Knopf „Rückmeldung öffnen" und öffnet sie (08.10.2026).
 */
export default function RueckmeldungKnopf({ art, docId }: { art: MaterialEintrag['art']; docId: string }): React.JSX.Element {
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
  return (
    <Tooltip
      label={vorhanden ? 'Die Rückmeldung zu diesem Material öffnen' : 'Rückmeldung ohne Note zu Schülerarbeiten – mit diesem Material als Grundlage'}
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
}
