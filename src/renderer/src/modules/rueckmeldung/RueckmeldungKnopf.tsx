import { Button, Tooltip } from '@mantine/core'
import { IconMessageCheck } from '@tabler/icons-react'
import { notifyError } from '../../shared/util'
import type { MaterialEintrag } from './generation'
import { rueckmeldungZu } from './vorgabe'

/**
 * „Rückmeldung …" in der Leiste der Editoren (Großprogramm 0.4, F3): öffnet das Programm
 * „Rückmeldung" mit diesem Material als Grundlage – die Aufgaben und der Erwartungshorizont
 * gehen mit, Abgaben kommen dort dazu.
 */
export default function RueckmeldungKnopf({ art, docId }: { art: MaterialEintrag['art']; docId: string }): React.JSX.Element {
  return (
    <Tooltip label="Rückmeldung ohne Note zu Schülerarbeiten – mit diesem Material als Grundlage" multiline w={260}>
      <Button
        size="xs"
        variant="default"
        leftSection={<IconMessageCheck size={14} />}
        onClick={() => rueckmeldungZu(art, docId).catch(notifyError)}
        data-rueckmeldung-zu
      >
        Rückmeldung …
      </Button>
    </Tooltip>
  )
}
