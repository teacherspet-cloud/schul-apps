import { Group, Switch, Text, Tooltip } from '@mantine/core'
import { useAppSettings, useExperte } from '../shared/settingsStore'
import { useTouch } from '../shared/touch/touchModus'

/**
 * Standard- / Expertenmodus in der linken Leiste (07.10.2026, Wunsch der Lehrkraft): ein Schalter,
 * nach links Standardmodus, nach rechts Expertenmodus. In der breiten Leiste mit beiden Wörtern,
 * in der schmalen nur der Schalter (Tooltip sagt, was gilt). Farben aus den Leisten-Variablen –
 * auch auf der farbigen Leiste gut zu sehen.
 */
export default function ModusSchalter({ breit }: { breit: boolean }): React.JSX.Element {
  const experte = useExperte()
  const update = useAppSettings((s) => s.update)
  // Mit dem Finger (09.10.2026): größerer Schalter (46 statt 38 Punkte breit) und kein Tooltip, der nach dem Antippen stehen bleibt
  const touch = useTouch()
  const umschalten = (an: boolean): void => void update({ oberflaeche: an ? 'experte' : 'standard' })
  const titel = experte
    ? 'Expertenmodus: alle Optionen sichtbar – nach links für den Standardmodus'
    : 'Standardmodus: nur das Wichtigste – nach rechts für den Expertenmodus'
  const schalter = (
    <Switch
      size={touch ? 'md' : 'sm'}
      checked={experte}
      onChange={(e) => umschalten(e.currentTarget.checked)}
      aria-label={experte ? 'Expertenmodus (umschalten auf Standardmodus)' : 'Standardmodus (umschalten auf Expertenmodus)'}
      className="modus-schalter-knopf"
      data-modus-schalter
      data-modus={experte ? 'experte' : 'standard'}
    />
  )
  return (
    <Tooltip label={titel} position="right" withArrow multiline w={240} disabled={touch}>
      <Group gap={6} wrap="nowrap" justify={breit ? 'flex-start' : 'center'} className="modus-schalter" data-breit={breit}>
        {breit && (
          <Text size="xs" fw={experte ? 400 : 700} className="modus-schalter-wort" onClick={() => umschalten(false)}>
            Standard
          </Text>
        )}
        {schalter}
        {breit && (
          <Text size="xs" fw={experte ? 700 : 400} className="modus-schalter-wort" onClick={() => umschalten(true)}>
            Experte
          </Text>
        )}
      </Group>
    </Tooltip>
  )
}
