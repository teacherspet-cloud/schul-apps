import { Anchor } from '@mantine/core'
import { openSettings, SettingsTab } from '../navigation'

/**
 * Verweis auf einen Reiter der Einstellungen – als Link, nicht als Wegbeschreibung.
 *
 * Vorher standen in den Programmen Sätze wie „Bitte links unten unter Einstellungen …".
 * Wer dem folgte, landete beim ersten Reiter und musste den richtigen erst suchen. Der Link
 * öffnet ihn direkt; die angefangene Arbeit bleibt im Programm erhalten und wird vorher
 * gesichert.
 */
export default function EinstellungenLink({
  tab,
  children,
  vorher
}: {
  tab: SettingsTab
  children: React.ReactNode
  /** z. B. ein offenes Fenster schließen, bevor die Einstellungen erscheinen */
  vorher?: () => void
}): React.JSX.Element {
  return (
    <Anchor
      component="button"
      type="button"
      inherit
      fw={600}
      onClick={() => {
        vorher?.()
        openSettings(tab)
      }}
    >
      {children}
    </Anchor>
  )
}
