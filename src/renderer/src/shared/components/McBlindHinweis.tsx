import { useState } from 'react'
import { Alert, Button, Group, Text } from '@mantine/core'
import { IconEyeOff, IconWand } from '@tabler/icons-react'
import type { WsBlock } from '../../modules/arbeitsblatt/model/types'
import { blindprobeBloecke, blindprobeMeldung, ungepruefteMcAufgaben, type BlindprobeAi, type BlindprobeBericht } from '../verstehen/blindprobe'
import { useAppSettings } from '../settingsStore'
import { notifyError, notifySuccess } from '../util'

/**
 * Hinweis „MC-Frage ohne Text lösbar?" (01.10.2026) über bestehenden Materialien: Ankreuzfragen zu
 * Texten, Hörtexten oder Videos, die noch keine Blindprobe in ihrer jetzigen Fassung hatten (ältere
 * Blätter, von Hand geänderte Fragen). „Vorschlag der App umsetzen" startet die Blindprobe auf Abruf
 * und ersetzt, was ohne den Text lösbar war (shared/verstehen/blindprobe.ts). Strg+Z nimmt es zurück.
 *
 * `listen`: die Bausteinlisten, die je für sich geprüft werden (Blatt, Teil einer Fassung …) – das
 * Material für die Neufassung stammt aus derselben Liste. `uebernehmen` bekommt je Liste die Bausteine
 * vor und nach der Probe und arbeitet sie in den aktuellen Stand ein (`uebernimmBlindprobe`).
 */
export default function McBlindHinweis({
  listen,
  ai,
  uebernehmen,
  streng = false
}: {
  listen: WsBlock[][]
  ai: BlindprobeAi
  uebernehmen: (ergebnisse: { vorher: WsBlock[]; nachher: WsBlock[] }[]) => void
  streng?: boolean
}): React.JSX.Element | null {
  const an = useAppSettings((s) => s.settings.ai.mcBlindprobe !== false)
  const [laeuft, setLaeuft] = useState(false)
  const anzahl = listen.reduce((n, l) => n + ungepruefteMcAufgaben(l, streng).length, 0)
  if (!an || (!anzahl && !laeuft)) return null

  const umsetzen = async (): Promise<void> => {
    setLaeuft(true)
    try {
      const ergebnisse: { vorher: WsBlock[]; nachher: WsBlock[] }[] = []
      const summe: Pick<BlindprobeBericht, 'geprueft' | 'ersetzt' | 'markiert'> = { geprueft: 0, ersetzt: 0, markiert: 0 }
      for (const vorher of listen) {
        if (!ungepruefteMcAufgaben(vorher, streng).length) continue
        const b = await blindprobeBloecke(vorher, ai, { streng })
        ergebnisse.push({ vorher, nachher: b.bloecke })
        summe.geprueft += b.geprueft
        summe.ersetzt += b.ersetzt
        summe.markiert += b.markiert
      }
      if (ergebnisse.length) uebernehmen(ergebnisse)
      notifySuccess(blindprobeMeldung(summe), 'Blindprobe der Ankreuzfragen')
    } catch (e) {
      notifyError(e, 'Die Blindprobe ist fehlgeschlagen')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <Alert color="yellow" icon={<IconEyeOff size={18} />} mb="md" p="xs" w="100%" maw={820} data-testid="mc-blind-hinweis" title="MC-Frage ohne Text lösbar?">
      <Text size="sm">
        {anzahl === 1 ? 'Eine Aufgabe' : `${anzahl} Aufgaben`} mit Ankreuzfragen zu einem Text, Hörtext oder Video{' '}
        {anzahl === 1 ? 'hatte' : 'hatten'} noch keine Blindprobe. Wer den Text nicht kennt, soll keine Antwortmöglichkeit ausschließen können.
      </Text>
      <Group mt="sm" gap="xs">
        <Button size="compact-sm" variant="light" leftSection={<IconWand size={14} />} loading={laeuft} data-testid="mc-blind-umsetzen" onClick={() => void umsetzen()}>
          Vorschlag der App umsetzen
        </Button>
        <Text size="xs" c="dimmed">
          Eine KI-Anfrage beantwortet die Fragen ohne den Text; was sich so lösen lässt, wird neu gefasst oder markiert.
        </Text>
      </Group>
    </Alert>
  )
}
