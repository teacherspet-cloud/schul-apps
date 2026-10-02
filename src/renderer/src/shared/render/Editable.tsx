import { ohneTrennung } from '../silbentrennung'

export interface EditableProps {
  value: string
  onChange?: (v: string) => void
  className?: string
  placeholder?: string
  /** Mehrzeilig (div) statt einzeilig (span) */
  block?: boolean
}

/**
 * Text, der im Editor direkt bearbeitet werden kann und im Druck als normaler Text erscheint.
 * Die CSS-Klasse `vt-editable` sorgt in allen Programmen für die gleiche Hervorhebung.
 */
export function Editable({ value, onChange, className, placeholder, block, editable }: EditableProps & { editable: boolean }): React.JSX.Element {
  const Tag = block ? 'div' : 'span'
  if (!editable || !onChange) {
    return <Tag className={className}>{value}</Tag>
  }
  return (
    <Tag
      // Neu mounten, wenn sich der Wert von außen ändert (z. B. Rückgängig)
      key={value}
      className={`${className ?? ''} vt-editable`}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      data-placeholder={placeholder}
      spellCheck
      onBlur={(e) => {
        // Weiche Trennstriche der Silbentrennung (shared/silbentrennung.ts) gehören nicht zum Text
        const next = ohneTrennung(e.currentTarget.innerText.replace(/ /g, ' '))
        if (next !== value) onChange(next)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !block) {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).blur()
        }
      }}
    >
      {value}
    </Tag>
  )
}
