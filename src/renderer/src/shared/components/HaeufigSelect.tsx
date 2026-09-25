import { Select } from '@mantine/core'
import type { SelectProps } from '@mantine/core'
import { useMemo, useState } from 'react'
import { gruppiereHaeufig, HaeufigArt, ladeZaehler, zaehleWahl } from '../haeufig'

/**
 * Auswahlfeld für Bundesland, Schulform oder Fach: alphabetisch, die häufig gewählten oben.
 *
 * Gilt in allen Programmen, in den Einstellungen und in der Einrichtung – deshalb EINE
 * Komponente statt einer Sortierung in jedem Formular (die dann in einem davon fehlt).
 *
 * Die Zählung wird beim Erscheinen des Feldes gelesen und nicht bei jeder Wahl neu: Sonst
 * spränge ein Eintrag unter dem Mauszeiger nach oben, während man noch in der Liste ist.
 */
export default function HaeufigSelect({
  art,
  data,
  onChange,
  ...rest
}: Omit<SelectProps, 'data'> & { art: HaeufigArt; data: { value: string; label: string }[] }): React.JSX.Element {
  const [zaehler] = useState(() => ladeZaehler(art))
  // Nur Wert und Beschriftung: Manche Listen tragen weitere Felder, die Mantine nicht kennt
  const schluessel = data.map((d) => `${d.value}\u0000${d.label}`).join('\u0001')
  const gruppiert = useMemo(
    () =>
      gruppiereHaeufig(
        data.map((d) => ({ value: d.value, label: d.label })),
        zaehler
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schluessel, zaehler]
  )
  return (
    <Select
      {...rest}
      data={gruppiert}
      onChange={(v, option) => {
        // Nur echte Wechsel zählen – ein erneutes Anklicken des gewählten Eintrags nicht
        if (v && v !== rest.value) zaehleWahl(art, v)
        onChange?.(v, option)
      }}
    />
  )
}
