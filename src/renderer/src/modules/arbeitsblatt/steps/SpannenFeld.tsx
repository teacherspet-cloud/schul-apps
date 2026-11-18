import { useState } from 'react'
import { TextInput } from '@mantine/core'
import { leseSpanne, spanneText, type Spanne } from '../didactics/anzahlSpanne'

/**
 * Feld für eine Zahl oder eine Spanne (18.11.2026, Wunsch der Lehrkraft: „5-10" bei „Zahl der Aufgaben" und
 * „Fragen zum Text"). Angenommen werden „6", „5-10", „5–10", „5 bis 10". Beim Tippen bleibt Halbes („5-") Entwurf;
 * übernommen wird jede lesbare Eingabe, ein leeres Feld heißt „keine Vorgabe". Beim Verlassen zeigt das Feld wieder
 * den gültigen Wert.
 */
export default function SpannenFeld({
  label,
  description,
  placeholder,
  wert,
  onChange
}: {
  label: string
  description?: string
  placeholder?: string
  wert: Spanne | null
  onChange: (s: Spanne | null) => void
}): React.JSX.Element {
  const [entwurf, setEntwurf] = useState<string | null>(null)
  const text = entwurf ?? (wert ? spanneText(wert) : '')
  const gelesen = entwurf === null ? wert : leseSpanne(entwurf)
  return (
    <TextInput
      label={label}
      description={description}
      placeholder={placeholder}
      value={text}
      inputMode="numeric"
      error={entwurf !== null && gelesen === undefined && /\d\s*(?:-|–|bis)?\s*$/.test(entwurf) === false ? 'Eine Zahl oder Spanne, z. B. 6 oder 5–10' : undefined}
      onChange={(e) => {
        const t = e.currentTarget.value
        setEntwurf(t)
        const s = leseSpanne(t)
        if (s !== undefined) onChange(s)
      }}
      onBlur={() => setEntwurf(null)}
    />
  )
}
