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

/**
 * Ein natürliches Stück eines Lückentextes: ein Absatz oder ein Listenpunkt (01.10.2026).
 *
 * `start`/`ende` sind Zeilen der Quelle [start, ende) – darüber wird beim Bearbeiten genau dieses
 * Stück ersetzt. Einzelne Zeilenumbrüche innerhalb eines Absatzes trennen nichts: `RichText`
 * setzt sie als Leerzeichen, der Absatz fließt – mitten darin wäre mitten im Satz.
 */
export interface LueckenStueck {
  start: number
  ende: number
  text: string
  art: 'absatz' | 'punkt' | 'formel'
}

export function lueckenStuecke(source: string): LueckenStueck[] {
  const zeilen = (source ?? '').replace(/\r\n?/g, '\n').split('\n')
  const aus: LueckenStueck[] = []
  let absatz: number | null = null
  const schliessen = (bis: number): void => {
    if (absatz === null) return
    aus.push({ start: absatz, ende: bis, text: zeilen.slice(absatz, bis).join('\n'), art: 'absatz' })
    absatz = null
  }
  zeilen.forEach((z, i) => {
    if (!z.trim()) return schliessen(i)
    if (/^\s*\$\$[\s\S]+?\$\$\s*$/.test(z)) {
      schliessen(i)
      aus.push({ start: i, ende: i + 1, text: z, art: 'formel' })
      return
    }
    if (/^\s*[-•*]\s+/.test(z) || /^\s*\d+[.)]\s+/.test(z)) {
      schliessen(i)
      aus.push({ start: i, ende: i + 1, text: z, art: 'punkt' })
      return
    }
    if (absatz === null) absatz = i
  })
  schliessen(zeilen.length)
  return aus
}

/**
 * TEILBARE ANTWORTFORM (01.10.2026): die Einheiten, an denen sie über eine Seite hinweg geteilt
 * werden darf, und der Rahmen, der ein Stück davon setzt.
 *
 * Wunsch der Lehrkraft: Bausteine „an geeigneten Stellen aufteilen … erster Teil auf S. 1 unten,
 * Fortsetzung auf S. 2" – nur an natürlichen Stellen: zwischen Zuordnungspaaren, Aussagen,
 * Schritten, Beschriftungen, Tabellenzeilen, Absätzen bzw. Listenpunkten eines Lückentextes. Nie
 * mitten in einer Zeile. Vorher war jede dieser Antwortformen EINE Einheit: Passte sie nicht
 * mehr ganz unter die Aufgabe, wanderte die ganze Aufgabe auf die nächste Seite.
 *
 * Ein Stück wiederholt die Kopfzeile seiner Tabelle (Richtig/Falsch, Ausfülltabelle) – ihre Höhe
 * misst die Seitenaufteilung als `unitRepeat`. `einheit` = false setzt dieselben Zeilen ohne
 * `data-unit` (Antwort INNERHALB einer anderen Einheit, z. B. bei der ungeteilten Darstellung).
 * Liefert null, wenn die Antwortform nicht teilbar ist oder weniger als zwei Stellen hat.
 */
export function teilbareAntwort(
  answer: Answer,
  {
    key,
    editText,
    editKey,
    editRoh,
    answerLanguage,
    onChange
  }: { key: boolean; editText: boolean; editKey: boolean; editRoh: boolean; answerLanguage: string; onChange?: (fn: (a: Answer) => void) => void },
  einheit = true
): { einheiten: React.JSX.Element[]; rahmen: (stueck: React.ReactNode[], schluessel?: string) => React.JSX.Element } | null {
  const set = (fn: (a: Answer) => void) => (onChange ? () => onChange(fn) : undefined)
  const u = einheit ? { 'data-unit': '' } : {}
  switch (answer.kind) {
    case 'matching': {
      const einheiten = Array.from({ length: Math.max(answer.left.length, answer.right.length) }, (_, r) => (
        <tr key={r} {...u}>
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
                <b>{r + 1}</b> <Zelle value={answer.left[r]} editable={editText} onChange={(v) => onChange?.((a) => (a.left[r] = v))} />
              </>
            )}
          </td>
          <td className="ws-match-right">
            {r < answer.right.length && (
              <>
                <b>{letter(r)})</b> <Zelle value={answer.right[r]} editable={editText} onChange={(v) => onChange?.((a) => (a.right[r] = v))} />
              </>
            )}
          </td>
        </tr>
      ))
      return {
        einheiten,
        rahmen: (stueck, k) => (
          <table className="ws-match" key={k}>
            <tbody>{stueck}</tbody>
          </table>
        )
      }
    }
    case 'trueFalse': {
      const einheiten = answer.statements.map((s, i) => (
        <tr key={i} {...u}>
          <td>
            <Zelle value={s.text} editable={editText} onChange={(v) => onChange?.((a) => (a.statements[i].text = v))} />
          </td>
          {[true, false].map((val) => (
            <td key={String(val)} className="ws-tf-cell" onClick={editKey ? set((a) => (a.statements[i].isTrue = val)) : undefined}>
              <span className="ws-check">{key && s.isTrue === val ? '✗' : ''}</span>
            </td>
          ))}
        </tr>
      ))
      return {
        einheiten,
        rahmen: (stueck, k) => (
          <table className="ws-tf" key={k}>
            <thead>
              <tr>
                <th />
                <th>{trueFalseLabels(answerLanguage).yes}</th>
                <th>{trueFalseLabels(answerLanguage).no}</th>
              </tr>
            </thead>
            <tbody>{stueck}</tbody>
          </table>
        )
      }
    }
    case 'ordering': {
      const order = answer.displayOrder.length === answer.items.length ? answer.displayOrder : answer.items.map((_, i) => i)
      const einheiten = order.map((itemIndex, pos) => (
        <div key={pos} className="ws-order-row" {...u}>
          <span className="ws-box">{key ? itemIndex + 1 : ''}</span>
          <Zelle value={answer.items[itemIndex] ?? ''} editable={editText} onChange={(v) => onChange?.((a) => (a.items[itemIndex] = v))} />
        </div>
      ))
      return {
        einheiten,
        rahmen: (stueck, k) => (
          <div className="ws-ordering" key={k}>
            {stueck}
          </div>
        )
      }
    }
    case 'labels': {
      const einheiten = Array.from({ length: Math.max(0, answer.count) }, (_, i) => (
        <div key={i} className="ws-label-row" {...u}>
          <span className="ws-label-num">{i + 1}</span>
          {key ? <span className="ws-key-text">{answer.labels[i] ?? ''}</span> : <span className="ws-label-line" />}
        </div>
      ))
      return {
        einheiten,
        rahmen: (stueck, k) => (
          <div className="ws-labels" key={k}>
            {stueck}
          </div>
        )
      }
    }
    case 'tableFill': {
      const einheiten = answer.rows.map((row, r) => (
        <tr key={r} {...u}>
          {row.map((cell, c) => {
            const solution = answer.solutionRows[r]?.[c] ?? ''
            if (cell) {
              return (
                <td key={c}>
                  <Zelle value={cell} editable={editText} onChange={(v) => onChange?.((a) => (a.rows[r][c] = v))} />
                </td>
              )
            }
            return (
              <td key={c} className="ws-cell-empty">
                {key && (
                  <Zelle
                    className="ws-key-text"
                    value={solution}
                    editable={editKey}
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
      ))
      return {
        einheiten,
        rahmen: (stueck, k) => (
          <table className="ws-table ws-table-fill" key={k}>
            {answer.headers.length > 0 && (
              <thead>
                <tr>
                  {answer.headers.map((h, c) => (
                    <th key={c}>
                      <Zelle value={h} editable={editText} onChange={(v) => onChange?.((a) => (a.headers[c] = v))} />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>{stueck}</tbody>
          </table>
        )
      }
    }
    case 'gapText': {
      // Ein einziger Absatz bleibt die gewohnte Darstellung (siehe AnswerView)
      const stuecke = lueckenStuecke(answer.gapText)
      if (!einheit || stuecke.length < 2) return null
      const renderText = gapRenderText(key)
      const einheiten = stuecke.map((s, i) => (
        <div key={i} className={`ws-gap-zeile ws-gap-${s.art}`} {...u}>
          <RichText
            className="ws-gaptext"
            value={s.text}
            editable={editRoh}
            onChange={
              onChange
                ? (v) =>
                    onChange((a) => {
                      const zeilen = (a.gapText ?? '').replace(/\r\n?/g, '\n').split('\n')
                      zeilen.splice(s.start, s.ende - s.start, ...v.split('\n'))
                      a.gapText = zeilen.join('\n')
                    })
                : undefined
            }
            renderText={renderText}
          />
        </div>
      ))
      return {
        einheiten,
        rahmen: (stueck, k) => (
          <div className="ws-gap-zeilen" key={k}>
            {stueck}
          </div>
        )
      }
    }
    default:
      return null
  }
}

export function AnswerView({ answer, onChange }: { answer: Answer; onChange?: (fn: (a: Answer) => void) => void }): React.JSX.Element | null {
  const { mode, answerLanguage, contentWidthMm } = useWs()
  const key = isKeyMode(mode)
  const editText = mode === 'edit' && onChange
  const editKey = mode === 'keyEdit' && onChange
  // Zeilen der teilbaren Antwortformen – hier OHNE `data-unit`: Die Antwort steht dann innerhalb einer anderen Einheit
  const teilbar = teilbareAntwort(
    answer,
    { key, editText: Boolean(editText), editKey: Boolean(editKey), editRoh: isEditMode(mode), answerLanguage: answerLanguage ?? 'de', onChange },
    false
  )

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
    case 'multipleChoice':
      /*
       * Dieselbe Darstellung wie in der Fragenreihe – untereinander, mit Buchstabe und
       * Kästchen davor. Vorher standen die Möglichkeiten hier nebeneinander und ohne
       * Buchstaben: zwei Bauformen für dasselbe Format, und die nebeneinander gesetzte ist
       * die schlechter belegte (Haladyna u. a. 2002, Guideline 10; VERA-3: Kreuz VOR der
       * Antwort).
       */
      return <McOptions answer={answer} onChange={onChange} />
    case 'labels':
    case 'matching':
    case 'trueFalse':
    case 'ordering':
    case 'tableFill':
      return teilbar ? teilbar.rahmen(teilbar.einheiten) : null
  }
}
