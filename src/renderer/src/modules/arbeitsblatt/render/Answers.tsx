import { trueFalseLabels } from '../../../shared/trueFalseLabels'
import { RichText } from '../../../shared/richtext/RichText'
import type { Answer } from '../model/types'
import { isEditMode, isKeyMode, useWs } from './WsContext'
import { optionSpalten } from './mcGrid'
import { diagramDataUrl, diagramDrawing } from './diagramSvg'
import type { DiagramSpec } from '../model/types'

const letter = (i: number): string => String.fromCharCode(97 + i)

/** Lückentext: [[Lösung]] wird im Schülerblatt zur Lücke. */
export function gapTextParts(source: string): { text: string; answers: string[] } {
  const answers: string[] = []
  const text = source.replace(/\[\[(.+?)\]\]/g, (_m, a: string) => {
    answers.push(a.trim())
    return `⟦${answers.length - 1}⟧`
  })
  return { text, answers }
}

/**
 * Stellt [[Lösung]] als Lücke dar – im Lösungsblatt mit dem Wort, sonst leer.
 *
 * Der Merkkasten benutzt dieselbe Schreibweise: Die Lernenden füllen ihn selbst aus.
 * Ohne diese Darstellung standen die eckigen Klammern roh auf dem Blatt.
 */
export function gapRenderText(showAnswers: boolean): (t: string) => React.ReactNode {
  return (t: string) =>
    t.split(/\[\[(.+?)\]\]/).map((piece, i) =>
      i % 2 === 1 ? (
        <span key={i} className={`ws-gap ${showAnswers ? 'ws-gap-key' : ''}`}>
          {showAnswers ? piece : ' '}
        </span>
      ) : (
        piece
      )
    )
}

/**
 * Die Antwortmöglichkeiten einer Ankreuzfrage untereinander, mit Buchstaben.
 *
 *   a) ☐ a dog
 *   b) ☐ a ball
 *
 * Die gewöhnliche Darstellung setzt die Möglichkeiten nebeneinander und lässt die
 * Buchstaben weg. Das trägt bei drei kurzen Wörtern, aber nicht bei einer Fragenreihe: Dort
 * braucht jede Möglichkeit eine Marke, auf die sich Lösung und Besprechung beziehen können
 * („1 b"), und die Zuordnung Frage → Möglichkeit muss auf einen Blick stimmen.
 */
/**
 * Text in einer Antwortzelle – mit Formeln.
 *
 * `Editable` gibt den Wert als REINEN TEXT aus. Deshalb stand in Zuordnungen, Ausfüll-
 * tabellen und Antwortmöglichkeiten bisher `$b^4\cdot b^3=b^7$` wörtlich auf dem Blatt,
 * während dieselbe Formel in der Arbeitsanweisung sauber gesetzt war – dort läuft `RichText`.
 * Aufgefallen ist das an einer Lernzielkontrolle zu den Potenzgesetzen.
 *
 * `RichText` kann beides: Formeln in $…$ und **fett**. Die Bearbeitung im Editor bleibt.
 */
function Zelle({
  value,
  editable,
  onChange,
  className
}: {
  value: string
  editable: boolean
  onChange?: (v: string) => void
  className?: string
}): React.JSX.Element {
  return <RichText className={className} value={value} inline editable={editable} onChange={onChange} />
}

export function McOptions({
  answer,
  onChange,
  showSolution
}: {
  answer: Answer
  onChange?: (fn: (a: Answer) => void) => void
  /** Lösung IMMER zeigen – für das gelöste Beispiel, das auch auf dem Schülerblatt steht */
  showSolution?: boolean
}): React.JSX.Element | null {
  const { mode } = useWs()
  const key = isKeyMode(mode) || Boolean(showSolution)
  const editText = mode === 'edit' && onChange
  const editKey = mode === 'keyEdit' && onChange
  if (answer.kind !== 'multipleChoice') return null
  // Viele kurze Möglichkeiten dürfen zweispaltig stehen – siehe `optionSpalten`
  const spalten = optionSpalten(answer.options)
  return (
    <div className={`ws-mc-options ${spalten === 2 ? 'ws-mc-options-2' : ''}`}>
      {answer.options.map((o, i) => {
        const correct = answer.correct.includes(i)
        return (
          <div
            key={i}
            className={`ws-mc-option ${key && correct ? 'ws-option-correct' : ''}`}
            onClick={
              editKey && onChange
                ? () =>
                    onChange((a) => (a.kind === 'multipleChoice' ? (a.correct = correct ? a.correct.filter((c) => c !== i) : [...a.correct, i]) : undefined))
                : undefined
            }
            title={editKey ? 'Klicken: als richtig/falsch markieren' : undefined}
          >
            <span className="ws-mc-letter">{letter(i)})</span>
            <span className="ws-check">{key && correct ? '✗' : ''}</span>
            <Zelle value={o} editable={Boolean(editText)} onChange={(v) => onChange?.((a) => (a.kind === 'multipleChoice' ? (a.options[i] = v) : undefined))} />
          </div>
        )
      })}
    </div>
  )
}

/**
 * Breite der Zeichenfläche: der Satzspiegel abzüglich Einzug, höchstens 160 mm – dieselbe
 * Zahl nimmt `generation/solution.ts` für die Skizze, damit Musterlösung und Fläche
 * deckungsgleich sind.
 */
export const diagramWidthMm = (contentWidthMm: number | undefined): number => Math.min(160, (contentWidthMm ?? 170) - 8.5)

/** Zeichenfläche mit Achsen (Diagramm-Antwortform); `sketch` = Musterlösung als SVG darüber (Lösungsansicht). */
export function DiagramView({ spec, widthMm, sketch }: { spec: DiagramSpec | undefined; widthMm: number; sketch?: string }): React.JSX.Element {
  const drawing = diagramDrawing(spec, widthMm)
  return (
    <div className="ws-diagram" style={{ width: `${drawing.widthMm}mm`, height: `${drawing.heightMm}mm` }}>
      <img className="ws-diagram-img" src={diagramDataUrl(drawing)} alt="Zeichenfläche mit Achsen" style={{ width: `${drawing.widthMm}mm`, height: `${drawing.heightMm}mm` }} />
      {sketch && <div className="ws-muster-skizze" dangerouslySetInnerHTML={{ __html: sketch }} />}
    </div>
  )
}

export function AnswerView({ answer, onChange }: { answer: Answer; onChange?: (fn: (a: Answer) => void) => void }): React.JSX.Element | null {
  const { mode, answerLanguage, contentWidthMm } = useWs()
  const key = isKeyMode(mode)
  const editText = mode === 'edit' && onChange
  const editKey = mode === 'keyEdit' && onChange
  const set = (fn: (a: Answer) => void) => (onChange ? () => onChange(fn) : undefined)

  switch (answer.kind) {
    case 'none':
      return null
    case 'lines':
      return (
        <div className="ws-lines">
          {Array.from({ length: Math.max(0, answer.count) }, (_, i) => (
            <div key={i} className="ws-line" />
          ))}
        </div>
      )
    case 'grid':
      return <div className="ws-grid" style={{ height: `${Math.max(1, answer.count) * 5}mm` }} />
    case 'diagram':
      return <DiagramView spec={answer.diagram} widthMm={diagramWidthMm(contentWidthMm)} />
    case 'space':
      return <div className="ws-space" style={{ height: `${Math.max(5, answer.heightMm)}mm` }} />
    case 'labels':
      return (
        <div className="ws-labels">
          {Array.from({ length: Math.max(0, answer.count) }, (_, i) => (
            <div key={i} className="ws-label-row">
              <span className="ws-label-num">{i + 1}</span>
              {key ? <span className="ws-key-text">{answer.labels[i] ?? ''}</span> : <span className="ws-label-line" />}
            </div>
          ))}
        </div>
      )
    case 'gapText': {
      // [[Lösung]] wird beim Darstellen zur Lücke; ein Klick im Editor zeigt den Rohtext
      const renderText = gapRenderText(key)
      return (
        <RichText
          className="ws-gaptext"
          value={answer.gapText}
          editable={isEditMode(mode)}
          onChange={onChange ? (v) => onChange((a) => (a.gapText = v)) : undefined}
          placeholder="Text mit [[Lösung]] für jede Lücke"
          renderText={renderText}
        />
      )
    }
    case 'matching':
      return (
        <table className="ws-match">
          <tbody>
            {Array.from({ length: Math.max(answer.left.length, answer.right.length) }, (_, r) => (
              <tr key={r}>
                <td className="ws-match-box">
                  {r < answer.left.length && (
                    <span
                      className="ws-box"
                      title={editKey ? 'Klicken: nächsten Buchstaben zuordnen' : undefined}
                      onClick={editKey ? set((a) => (a.pairs[r] = ((a.pairs[r] ?? -1) + 1) % Math.max(1, a.right.length))) : undefined}
                    >
                      {key && (answer.pairs[r] ?? -1) >= 0 ? letter(answer.pairs[r]) : ''}
                    </span>
                  )}
                </td>
                <td className="ws-match-left">
                  {r < answer.left.length && (
                    <>
                      <b>{r + 1}</b> <Zelle value={answer.left[r]} editable={Boolean(editText)} onChange={(v) => onChange?.((a) => (a.left[r] = v))} />
                    </>
                  )}
                </td>
                <td className="ws-match-right">
                  {r < answer.right.length && (
                    <>
                      <b>{letter(r)})</b> <Zelle value={answer.right[r]} editable={Boolean(editText)} onChange={(v) => onChange?.((a) => (a.right[r] = v))} />
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'multipleChoice':
      /*
       * Dieselbe Darstellung wie in der Fragenreihe – untereinander, mit Buchstabe und
       * Kästchen davor. Vorher standen die Möglichkeiten hier nebeneinander und ohne
       * Buchstaben: zwei Bauformen für dasselbe Format, und die nebeneinander gesetzte ist
       * die schlechter belegte (Haladyna u. a. 2002, Guideline 10; VERA-3: Kreuz VOR der
       * Antwort).
       */
      return <McOptions answer={answer} onChange={onChange} />
    case 'trueFalse':
      return (
        <table className="ws-tf">
          <thead>
            <tr>
              <th />
              <th>{trueFalseLabels(answerLanguage).yes}</th>
              <th>{trueFalseLabels(answerLanguage).no}</th>
            </tr>
          </thead>
          <tbody>
            {answer.statements.map((s, i) => (
              <tr key={i}>
                <td>
                  <Zelle value={s.text} editable={Boolean(editText)} onChange={(v) => onChange?.((a) => (a.statements[i].text = v))} />
                </td>
                {[true, false].map((val) => (
                  <td key={String(val)} className="ws-tf-cell" onClick={editKey ? set((a) => (a.statements[i].isTrue = val)) : undefined}>
                    <span className="ws-check">{key && s.isTrue === val ? '✗' : ''}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'ordering': {
      const order = answer.displayOrder.length === answer.items.length ? answer.displayOrder : answer.items.map((_, i) => i)
      return (
        <div className="ws-ordering">
          {order.map((itemIndex, pos) => (
            <div key={pos} className="ws-order-row">
              <span className="ws-box">{key ? itemIndex + 1 : ''}</span>
              <Zelle value={answer.items[itemIndex] ?? ''} editable={Boolean(editText)} onChange={(v) => onChange?.((a) => (a.items[itemIndex] = v))} />
            </div>
          ))}
        </div>
      )
    }
    case 'tableFill':
      return (
        <table className="ws-table ws-table-fill">
          {answer.headers.length > 0 && (
            <thead>
              <tr>
                {answer.headers.map((h, c) => (
                  <th key={c}>
                    <Zelle value={h} editable={Boolean(editText)} onChange={(v) => onChange?.((a) => (a.headers[c] = v))} />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {answer.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => {
                  const solution = answer.solutionRows[r]?.[c] ?? ''
                  if (cell) {
                    return (
                      <td key={c}>
                        <Zelle value={cell} editable={Boolean(editText)} onChange={(v) => onChange?.((a) => (a.rows[r][c] = v))} />
                      </td>
                    )
                  }
                  return (
                    <td key={c} className="ws-cell-empty">
                      {key && (
                        <Zelle
                          className="ws-key-text"
                          value={solution}
                          editable={Boolean(editKey)}
                          onChange={(v) =>
                            onChange?.((a) => {
                              while (a.solutionRows.length <= r) a.solutionRows.push([])
                              a.solutionRows[r][c] = v
                            })
                          }
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )
  }
}
