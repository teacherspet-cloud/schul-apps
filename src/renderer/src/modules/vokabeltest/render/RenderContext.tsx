import { createContext, useContext } from 'react'
import { Editable, EditableProps } from '../../../shared/render/Editable'
import type { Block } from '../model/types'

/**
 * print   – Schülerblatt (Druck/PDF)
 * key     – Lösungsblatt (Druck/PDF)
 * edit    – Schülerblatt im Editor: bearbeitbar, aber ohne eingetragene Lösungen (so wie gedruckt)
 * editKey – Lösungsblatt im Editor: Lösungen sichtbar und bearbeitbar
 */
export type RenderMode = 'edit' | 'editKey' | 'print' | 'key'

export const showsAnswers = (mode: RenderMode): boolean => mode === 'key' || mode === 'editKey'
export const isEditable = (mode: RenderMode): boolean => mode === 'edit' || mode === 'editKey'

export interface ItemActions {
  regenerateBlock?: (blockId: string) => void
  regenerateItem?: (blockId: string, itemId: string) => void
  deleteItem?: (blockId: string, itemId: string) => void
  pickImage?: (blockId: string, itemId: string) => void
  busyItems?: Set<string>
}

export interface RenderContextValue {
  mode: RenderMode
  /** Zielsprache des Tests – feste Beschriftungen (richtig/falsch) stehen in dieser Sprache */
  language?: string
  /** Ändert einen Block (Entwurf wird geklont und übergeben) */
  updateBlock?: (blockId: string, fn: (draft: Block) => void) => void
  actions?: ItemActions
}

export const RenderContext = createContext<RenderContextValue>({ mode: 'print' })

export const useRender = (): RenderContextValue => useContext(RenderContext)

/**
 * Text, der im Editor direkt bearbeitet werden kann und im Druck als normaler Text erscheint.
 */
export function T(props: EditableProps): React.JSX.Element {
  const { mode } = useRender()
  return <Editable {...props} editable={isEditable(mode)} />
}
