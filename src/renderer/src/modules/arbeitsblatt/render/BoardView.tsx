import { RichText } from '../../../shared/richtext/RichText'
import type { BoardPlan, WorksheetMeta } from '../model/types'
import { BOARD_FIELD_LABELS, boardFormatInfo } from '../didactics/boardDesign'
import type { BoardField } from '../didactics/boardDesign'

interface BoardProps {
  board: BoardPlan
  meta: WorksheetMeta
  accent: string
  fontFamily: string
  /** Im Editor: Änderungen am Tafelbild */
  onChange?: (fn: (draft: BoardPlan) => void) => void
}

/** Viel Text → kleinere Schrift, damit Tafel und Ablauf auf eine A4-Seite passen. */
export function boardDensity(board: BoardPlan): 'normal' | 'compact' | 'dense' {
  const chars =
    board.title.length +
    board.conclusion.length +
    board.sections.reduce((n, s) => n + s.heading.length + s.points.join('').length + 20 * s.points.length + (s.sketch?.length ?? 0), 0) +
    board.steps.reduce((n, s) => n + s.phase.length + s.impulse.length + s.expected.length + 40, 0)
  return chars > 2200 ? 'dense' : chars > 1500 ? 'compact' : 'normal'
}

const pointsText = (points: string[]): string => points.map((p) => `- ${p}`).join('\n')
const parsePoints = (v: string): string[] =>
  v
    .split('\n')
    .map((p) => p.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean)

/** Die eigentliche Tafel: Überschrift, Bereiche in der gewählten Anordnung, Merksatz. Formeln ($…$) und **fett** werden dargestellt. */
export function BoardCanvas({ board, onChange }: Pick<BoardProps, 'board' | 'onChange'>): React.JSX.Element {
  const editable = Boolean(onChange)
  const edit = <T,>(apply: (d: BoardPlan, v: T) => void) => (onChange ? (v: T) => onChange((d) => apply(d, v)) : undefined)
  const sections = board.sections

  const section = (s: BoardPlan['sections'][number], i: number): React.JSX.Element => (
    <div className={`ws-board-section ${s.toNotebook ? 'ws-board-copy' : ''}`} key={i}>
      <RichText
        inline
        editable={editable}
        className="ws-board-heading"
        value={s.heading}
        placeholder="Überschrift"
        onChange={edit<string>((d, v) => (d.sections[i].heading = v))}
      />
      <RichText
        editable={editable}
        className="ws-board-points"
        value={pointsText(s.points)}
        placeholder="- Stichpunkt (je Zeile einer)"
        onChange={edit<string>((d, v) => (d.sections[i].points = parsePoints(v)))}
      />
      {(s.sketch || editable) && (
        <div className="ws-board-sketch">
          <span>✎ An die Tafel zeichnen: </span>
          <RichText
            inline
            editable={editable}
            value={s.sketch ?? ''}
            placeholder="was an die Tafel gezeichnet wird (optional)"
            onChange={edit<string>((d, v) => (d.sections[i].sketch = v))}
          />
        </div>
      )}
      {(s.fromTasks || editable) && (
        <RichText
          inline
          editable={editable}
          className="ws-board-from"
          value={s.fromTasks}
          placeholder="aus Aufgabe …"
          onChange={edit<string>((d, v) => (d.sections[i].fromTasks = v))}
        />
      )}
    </div>
  )

  // Sind die Bereiche den Tafelfeldern zugeordnet, wird in drei Spalten gezeichnet:
  // links Aufgabe, Mitte Erarbeitung (der Kern fürs Heft), rechts Merksatz.
  const byField = board.sections.some((s) => s.field)
  // Jedes Tafelbild ist für genau eine Fläche gezeichnet
  const info = boardFormatInfo(board.format)
  if (byField) {
    const fields: BoardField[] = ['links', 'mitte', 'rechts']
    /*
     * Seitenverhältnis der Tafel nur als MINDESThöhe (26.09.2026). Vorher stand hier
     * `aspect-ratio`: Bei viel Inhalt wuchs die Tafel nicht mit, die drei Felder liefen unten
     * aus dem Rahmen heraus, über die Überschrift „So entsteht das Tafelbild" und in die
     * Ablauftabelle hinein (Befund der Lehrkraft am Tafelbild „Julikrise 1914"). Die Breite
     * der Querformatseite ist fest (297 mm abzüglich 25 + 15 mm Rand = 257 mm).
     */
    return (
      <div className="ws-board ws-board-fields" style={{ minHeight: `${Math.round(257 / info.ratio)}mm` }}>
        <div className="ws-board-title">
          <RichText inline editable={editable} value={board.title} placeholder="Leitfrage" onChange={edit<string>((d, v) => (d.title = v))} />
        </div>
        <div className="ws-board-field-row">
          {fields.map((f) => {
            const own = board.sections.map((s, i) => [s, i] as const).filter(([s]) => (s.field ?? 'mitte') === f)
            return (
              <div className={`ws-board-field ws-board-field-${f}`} key={f}>
                <div className="ws-board-field-label">{BOARD_FIELD_LABELS[f]}</div>
                {own.map(([s, i]) => section(s, i))}
                {f === 'rechts' && (board.conclusion || editable) && (
                  <div className="ws-board-conclusion">
                    <span className="ws-board-conclusion-label">Merke: </span>
                    <RichText
                      inline
                      editable={editable}
                      value={board.conclusion}
                      placeholder="Merksatz"
                      onChange={edit<string>((d, v) => (d.conclusion = v))}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className={`ws-board ws-board-${board.layout}`}>
      <div className="ws-board-title">
        <RichText inline editable={editable} value={board.title} placeholder="Überschrift" onChange={edit<string>((d, v) => (d.title = v))} />
      </div>
      {board.layout === 'cluster' ? (
        <div className="ws-board-cluster-grid" style={{ ['--ws-board-count' as string]: String(Math.max(1, sections.length)) }}>
          {sections.map(section)}
        </div>
      ) : (
        <div className="ws-board-row">
          {sections.map((s, i) => (
            <div className="ws-board-cell" key={i}>
              {i > 0 && board.layout === 'flow' && <div className="ws-board-arrow">→</div>}
              {section(s, i)}
            </div>
          ))}
        </div>
      )}
      {(board.conclusion || editable) && (
        <div className="ws-board-conclusion">
          <span className="ws-board-conclusion-label">Merke: </span>
          <RichText inline editable={editable} value={board.conclusion} placeholder="Merksatz" onChange={edit<string>((d, v) => (d.conclusion = v))} />
        </div>
      )}
    </div>
  )
}

/** Ablauf für die Lehrkraft: Impulse und erwartete Beiträge. */
export function BoardSteps({ board, onChange }: Pick<BoardProps, 'board' | 'onChange'>): React.JSX.Element | null {
  const editable = Boolean(onChange)
  if (!board.steps.length) return null
  const edit = (i: number, field: keyof BoardPlan['steps'][number]) => (onChange ? (v: string) => onChange((d) => (d.steps[i][field] = v)) : undefined)
  return (
    <table className="ws-board-steps">
      <thead>
        <tr>
          <th>Schritt</th>
          <th>Arbeitsauftrag / Impuls der Lehrkraft</th>
          <th>Erwartete Beiträge → Tafel</th>
        </tr>
      </thead>
      <tbody>
        {board.steps.map((s, i) => (
          <tr key={i}>
            <td>
              {/* Die KI nummeriert die Phase oft selbst („1. Ergebnisse …") – dann nicht noch einmal */}
              <b>{i + 1}.</b> <RichText inline editable={editable} value={s.phase.replace(/^\s*\d+[.)]\s*/, '')} onChange={edit(i, 'phase')} />
            </td>
            <td>
              <RichText inline editable={editable} value={s.impulse} onChange={edit(i, 'impulse')} />
            </td>
            <td>
              <RichText inline editable={editable} value={s.expected} onChange={edit(i, 'expected')} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** A4-Seite „Tafelbild“ für Vorschau, Druck und PDF (Lehrkraftmaterial). */
export function BoardPage({ board, meta, accent, fontFamily, onChange }: BoardProps): React.JSX.Element {
  return (
    <div className={`ws-page ws-board-page ws-board-landscape ws-board-${boardDensity(board)}`} style={{ ['--ws-accent' as string]: accent, fontFamily }}>
      <div className="ws-board-page-head">
        <span>Tafelbild · für die Lehrkraft</span>
        <span>{[meta.subjectLabel, meta.grade ? `Klasse ${meta.grade}` : '', meta.title || meta.topic].filter(Boolean).join(' · ')}</span>
      </div>
      <BoardCanvas board={board} onChange={onChange} />
      {board.steps.length > 0 && <div className="ws-board-steps-title">So entsteht das Tafelbild</div>}
      <BoardSteps board={board} onChange={onChange} />
    </div>
  )
}
