import { Anchor, Collapse, Text, type TextProps } from '@mantine/core'
import { useState } from 'react'
import { ersterSatz } from '../ersterSatz'

/**
 * Ein langer Erklärtext, gekürzt auf einen Satz mit „Mehr".
 *
 * Wunsch der Lehrkraft (Paket 6, 25.09.2026): Rechtliche und didaktische Hinweise (Herkunft der
 * Operatoren, Erlass-Zitate, Landesvorgaben) machten die Formulare lang. Der Inhalt bleibt
 * VOLLSTÄNDIG erhalten – die Lehrkraft beurteilt ihn fachlich –, nur steht zuerst ein Satz,
 * und der Rest klappt auf Wunsch auf. Warnungen, die eine Handlung verlangen, gehören nicht
 * hier hinein, sondern bleiben sichtbar.
 *
 * Zwei Arten:
 * - `text`: Der erste Satz steht da, der Rest nach „Mehr" (bei nur einem Satz kein „Mehr").
 * - `kurz` + `children`: eigener Satz vorn, beliebiger Inhalt nach „Mehr".
 */
export default function MehrText({
  text,
  kurz,
  children,
  ...textProps
}: {
  text?: string
  kurz?: React.ReactNode
  children?: React.ReactNode
} & TextProps): React.JSX.Element | null {
  const [offen, setOffen] = useState(false)
  const [satz, rest] = text !== undefined ? ersterSatz(text) : [null, '']
  const vorn = kurz ?? satz
  const hinten = children ?? (rest ? rest : null)
  if (!vorn && !hinten) return null
  return (
    <div>
      <Text size="xs" c="dimmed" {...textProps}>
        {vorn}
        {hinten && (
          <>
            {' '}
            {/* Beim Fließtext geht der Rest im selben Absatz weiter – so liest er sich wie vorher */}
            {offen && text !== undefined && !children ? `${rest} ` : null}
            <Anchor component="button" type="button" size="xs" onClick={() => setOffen(!offen)} aria-expanded={offen}>
              {offen ? 'Weniger' : 'Mehr'}
            </Anchor>
          </>
        )}
      </Text>
      {children && (
        <Collapse expanded={offen}>
          <div style={{ marginTop: 4 }}>{children}</div>
        </Collapse>
      )}
    </div>
  )
}
