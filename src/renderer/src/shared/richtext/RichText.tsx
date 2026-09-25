import { useEffect, useRef, useState } from 'react'
import { texToSvg } from './math'
import { Inline, parseRichText } from './parse'

export const RICHTEXT_HELP = '**fett**   *kursiv*   $x^2$ Formel   $$…$$ abgesetzte Formel   \\ce{H2O} Chemie   „- " Aufzählung'

type TextRenderer = (text: string) => React.ReactNode

function InlineView({ inlines, renderText }: { inlines: Inline[]; renderText?: TextRenderer }): React.JSX.Element {
  return (
    <>
      {inlines.map((i, k) => {
        if (i.t === 'math') {
          return <span key={k} className="rt-math" dangerouslySetInnerHTML={{ __html: texToSvg(i.tex).svg }} />
        }
        let node: React.ReactNode = renderText ? renderText(i.text) : i.text
        if (i.italic) node = <em>{node}</em>
        if (i.bold) node = <strong>{node}</strong>
        return <span key={k}>{node}</span>
      })}
    </>
  )
}

/** Formatierter Text (fett, kursiv, Listen, Formeln) – nur Anzeige. */
export function RichTextView({
  value,
  className,
  renderText,
  inline
}: {
  value: string
  className?: string
  /** Eigene Darstellung von Textstücken (z. B. Lücken) */
  renderText?: TextRenderer
  /** Einzeilig ohne Absatz-Elemente (z. B. in Tabellenzellen) */
  inline?: boolean
}): React.JSX.Element {
  const blocks = parseRichText(value)
  if (inline) {
    return (
      <span className={`rt rt-inline ${className ?? ''}`}>
        {blocks.map((b, k) =>
          b.t === 'math' ? (
            <span key={k} className="rt-math" dangerouslySetInnerHTML={{ __html: texToSvg(b.tex).svg }} />
          ) : b.t === 'para' ? (
            <span key={k}>
              {k > 0 && ' '}
              <InlineView inlines={b.inlines} renderText={renderText} />
            </span>
          ) : (
            b.items.map((it, j) => (
              <span key={`${k}-${j}`}>
                {k > 0 || j > 0 ? ' ' : ''}
                {b.ordered ? `${(b.start ?? 1) + j}. ` : '• '}
                <InlineView inlines={it} renderText={renderText} />
              </span>
            ))
          )
        )}
      </span>
    )
  }
  return (
    <div className={`rt ${className ?? ''}`}>
      {blocks.map((b, k) => {
        if (b.t === 'math') return <div key={k} className="rt-math-display" dangerouslySetInnerHTML={{ __html: texToSvg(b.tex, true).svg }} />
        if (b.t === 'list') {
          const Tag = b.ordered ? 'ol' : 'ul'
          return (
            <Tag key={k} className="rt-list" start={b.ordered && b.start && b.start !== 1 ? b.start : undefined}>
              {b.items.map((it, j) => (
                <li key={j}>
                  <InlineView inlines={it} renderText={renderText} />
                </li>
              ))}
            </Tag>
          )
        }
        return (
          <p key={k} className="rt-p">
            <InlineView inlines={b.inlines} renderText={renderText} />
          </p>
        )
      })}
    </div>
  )
}

/**
 * Formatierter Text, der im Editor per Klick als Rohtext bearbeitet wird.
 * Im Druck erscheint immer nur die formatierte Ansicht.
 */
export function RichText({
  value,
  onChange,
  editable,
  className,
  placeholder,
  renderText,
  inline
}: {
  value: string
  onChange?: (v: string) => void
  editable: boolean
  className?: string
  placeholder?: string
  renderText?: TextRenderer
  inline?: boolean
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => setDraft(value), [value])
  useEffect(() => {
    const el = ref.current
    if (editing && el) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight + 2}px`
    }
  }, [editing, draft])

  if (!editable || !onChange) return <RichTextView value={value} className={className} renderText={renderText} inline={inline} />

  if (editing) {
    return (
      <textarea
        ref={ref}
        className={`rt-editor ${className ?? ''}`}
        value={draft}
        autoFocus
        spellCheck
        title={RICHTEXT_HELP}
        placeholder={RICHTEXT_HELP}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => {
          setEditing(false)
          if (draft !== value) onChange(draft)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
      />
    )
  }
  return (
    <div
      className={`vt-editable rt-editable ${inline ? 'rt-editable-inline' : ''}`}
      role="textbox"
      tabIndex={0}
      title="Klicken zum Bearbeiten"
      data-placeholder={placeholder}
      onClick={() => setEditing(true)}
      onFocus={() => setEditing(true)}
    >
      {value ? (
        <RichTextView value={value} className={className} renderText={renderText} inline={inline} />
      ) : (
        <span className="rt-placeholder">{placeholder}</span>
      )}
    </div>
  )
}
