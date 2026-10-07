/**
 * „← Zurück zur Reihe" (06.10.2026, Tests aus der Unterrichtsreihe): Wer aus einem anderen Programm hierher geschickt
 * wurde (Rückweg in shared/navigation.ts), kommt mit diesem Knopf dorthin zurück. Ohne Rückweg zeigt er nichts.
 */
import { Button } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import { useNavigation } from '../navigation'

export default function RueckwegKnopf({ modul }: { modul: string }): React.JSX.Element | null {
  const r = useNavigation((s) => s.rueckweg)
  if (!r || r.fuer !== modul) return null
  return (
    <Button
      size="compact-sm"
      variant="light"
      leftSection={<IconArrowLeft size={14} />}
      onClick={() => {
        useNavigation.getState().setRueckweg(null)
        useNavigation.getState().openModule(r.nach)
      }}
      data-rueckweg={r.nach}
    >
      {r.name}
    </Button>
  )
}
