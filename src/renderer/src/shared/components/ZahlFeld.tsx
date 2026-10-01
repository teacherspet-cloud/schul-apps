import { NumberInput, type NumberInputProps } from '@mantine/core'
import { useZahlEntwurf } from '../zahlEntwurf'

/**
 * Zahlenfeld, das sich beim Tippen leeren lässt (01.10.2026, shared/zahlEntwurf.ts).
 *
 * Gleiche Eigenschaften wie Mantines `NumberInput`. Unterschied: Ein leeres oder halbes Feld wird
 * erst beim Verlassen gemeldet – dann als `''`, und der Aufrufer setzt wie bisher seinen Standard
 * ein. So wird aus „60" beim Überschreiben nicht mehr „6045".
 */
export default function ZahlFeld({ value, onChange, onBlur, ...rest }: NumberInputProps): React.JSX.Element {
  const feld = useZahlEntwurf(value, onChange)
  return (
    <NumberInput
      {...rest}
      value={feld.value}
      onChange={feld.onChange}
      onBlur={(e) => {
        feld.onBlur()
        onBlur?.(e)
      }}
    />
  )
}
