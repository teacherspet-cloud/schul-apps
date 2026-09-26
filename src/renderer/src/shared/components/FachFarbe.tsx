import { Box } from '@mantine/core'
import { useAppSettings } from '../settingsStore'
import { fachFarbeAus, fachName } from '../fachfarben'

/**
 * Fachfarbe in der Oberfläche (Paket 10a): Punkt am Fach in den Bibliotheken, in „Zuletzt
 * bearbeitet" und in den Suchtreffern der Startseite. Die Karten bleiben nach Materialart
 * getönt – der Punkt sagt nur, zu welchem Fach etwas gehört.
 */

/** Fachfarbe zu Kennung, Namen oder Sprachcode – folgt einer Änderung in den Einstellungen sofort */
export function useFachFarbe(fach: string | undefined): string | null {
  return fachFarbeAus(
    fach,
    useAppSettings((s) => s.settings.fachfarben)
  )
}

/** Kleiner runder Farbpunkt */
export function FarbPunkt({ farbe, groesse = 10, titel }: { farbe: string | null; groesse?: number; titel?: string }): React.JSX.Element | null {
  if (!farbe) return null
  return (
    <Box
      component="span"
      className="fach-punkt"
      data-farbe={farbe}
      title={titel}
      aria-hidden={titel ? undefined : true}
      style={{ width: groesse, height: groesse, background: farbe, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }}
    />
  )
}

/** Farbpunkt eines Fachs mit dem Fachnamen als Tooltip; unbekanntes Fach = nichts */
export function FachPunkt({ fach, groesse }: { fach: string | undefined; groesse?: number }): React.JSX.Element | null {
  return <FarbPunkt farbe={useFachFarbe(fach)} groesse={groesse} titel={fachName(fach)} />
}
