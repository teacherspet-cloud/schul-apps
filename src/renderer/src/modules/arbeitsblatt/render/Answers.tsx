import { trueFalseLabels } from '../../../shared/trueFalseLabels'
import { RichText } from '../../../shared/richtext/RichText'
import type { Answer } from '../model/types'
import { isEditMode, isKeyMode, useWs, type WsContextValue } from './WsContext'
import { antwortTabellenMasse, hatFoerderbedarf, schreibRegel, type SchreibRegel } from '../didactics/schreibraum'
import { tabelleZiehen, type ZugErgebnis } from './tabelleZiehen'
import { eigeneBreiten, zugUebernehmen } from './tabelleMasse'
import { optionSpalten } from './mcGrid'
import { diagramDataUrl, diagramDrawing } from './diagramSvg'
import type { DiagramSpec } from '../model/types'

const letter = (i: number): string => String.fromCharCode(97 + i)

/**
 * Schreibraum der Antwortflächen (02.10.2026, didactics/schreibraum.ts): Regel nach Jahrgang und
 * Förderbedarf, Breite der Ausfülltabelle = Textspalte minus Einzug (CSS: 100 % − 8,5 mm, in
 * Teilaufgaben etwas weniger). Aus dem Kontext, damit Editor, Druck und Messfläche gleich rechnen.
 */
export interface AntwortRaum {
  regel: SchreibRegel
  breiteMm: number
}

export const antwortRaum = (ctx: Pick<WsContextValue, 'lerngruppeText' | 'contentWidthMm' | 'schreibRegel'>): AntwortRaum => ({
  regel: ctx.schreibRegel ?? schreibRegel(ctx.lerngruppeText?.jahrgang ?? 7, hatFoerderbedarf({ schoolTypeName: ctx.lerngruppeText?.schulform })),
  breiteMm: (ctx.contentWidthMm ?? 170) - 10
})

/**
 * Griffe an den Linien einer Tabellenzelle (02.10.2026): rechts die Spaltenlinie (nicht bei der
 * letzten Spalte), unten die Zeilenlinie. Für Ausfülltabelle, Richtig/Falsch, Zuordnung,
 * Fragenreihe und Selbsteinschätzung – dasselbe Muster wie die Tabelle als Baustein. Ein Klick
 * auf den Griff darf die Zelle darunter nicht auslösen (Richtig/Falsch-Kästchen im Lösungsmodus).
 */
export function TabellenGriffe({
  c,
  spalten,
  zeile,
  breiten,
  onZug
}: {
  c: number
  spalten: number
  /** undefined = kein Zeilengriff */
  zeile?: number | 'kopf'
  /** aktuelle Spaltenbreiten in Prozent; fehlt = am Bildschirm gemessen */
  breiten?: number[]
  onZug: (z: ZugErgebnis) => void
}): React.JSX.Element {
  const halt = (e: React.MouseEvent): void => e.stopPropagation()
  return (
    <>
      {c < spalten - 1 && (
        <span className="ws-spalten-griff" title="Spaltenbreite ziehen" onClick={halt} onPointerDown={(e) => tabelleZiehen(e, 'spalte', c, breiten, onZug)} />
      )}
      {zeile !== undefined && (
        <span
          className="ws-zeilen-griff"
          title="Zeilenhöhe ziehen"
          onClick={halt}
          onPointerDown={(e) => tabelleZiehen(e, zeile === 'kopf' ? 'kopf' : 'zeile', zeile === 'kopf' ? 0 : zeile, breiten, onZug)}
        />
      )}
    </>
  )
}

/** Spaltenkopf einer Tabelle mit eigenen Breiten; ohne Breiten leere Spalten (der Browser verteilt wie bisher) */
export const Spalten = ({ n, breiten }: { n: number; breiten?: number[] }): React.JSX.Element => (
  <colgroup>
    {Array.from({ length: n }, (_, c) => (
      <col key={c} style={breiten ? { width: `${breiten[c]}%` } : undefined} />
    ))}
  </colgroup>
)

/** Stil der Tabelle und ihrer Zeilen aus den von Hand gezogenen Maßen */
const zeilenStil = (mm: number | undefined): React.CSSProperties | undefined => (mm && mm > 0 ? { height: `${mm}mm` } : undefined)

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
    onChange,
    raum
  }: {
    key: boolean
    editText: boolean
    editKey: boolean
    editRoh: boolean
    answerLanguage: string
    onChange?: (fn: (a: Answer) => void) => void
    /** Schreibraum (02.10.2026); fehlt = Regel für Klasse 7 */
    raum?: AntwortRaum
  },
  einheit = true
): { einheiten: React.JSX.Element[]; rahmen: (stueck: React.ReactNode[], schluessel?: string) => React.JSX.Element } | null {
  const set = (fn: (a: Answer) => void) => (onChange ? () => onChange(fn) : undefined)
  const u = einheit ? { 'data-unit': '' } : {}
  switch (answer.kind) {
    case 'matching': {
      // Ziehbare Maße (02.10.2026) – ohne gezogene Breiten bleibt die bisherige Aufteilung (ws.css)
      const zeilenZahl = Math.max(answer.left.length, answer.right.length)
      const breiten = eigeneBreiten(answer, 3)
      const ziehbar = Boolean(onChange) && (editText || editKey)
      const speichern = (z: ZugErgebnis): void => onChange?.((a) => zugUebernehmen(a, z, zeilenZahl))
      const g = (r: number, c: number): React.ReactNode => ziehbar && <TabellenGriffe c={c} spalten={3} zeile={r} breiten={breiten} onZug={speichern} />
      const einheiten = Array.from({ length: zeilenZahl }, (_, r) => (
        <tr key={r} {...u} style={zeilenStil(answer.rowHeightsMm?.[r])}>
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
            {g(r, 0)}
          </td>
          <td className="ws-match-left">
            {r < answer.left.length && (
              <>
                <b>{r + 1}</b> <Zelle value={answer.left[r]} editable={editText} onChange={(v) => onChange?.((a) => (a.left[r] = v))} />
              </>
            )}
            {g(r, 1)}
          </td>
          <td className="ws-match-right">
            {r < answer.right.length && (
              <>
                <b>{letter(r)})</b> <Zelle value={answer.right[r]} editable={editText} onChange={(v) => onChange?.((a) => (a.right[r] = v))} />
              </>
            )}
            {g(r, 2)}
          </td>
        </tr>
      ))
      return {
        einheiten,
        rahmen: (stueck, k) => (
          <table className={`ws-match ${ziehbar ? 'ws-table-ziehbar' : ''}`} key={k} style={breiten ? { tableLayout: 'fixed' } : undefined}>
            <Spalten n={3} breiten={breiten} />
            <tbody>{stueck}</tbody>
          </table>
        )
      }
    }
    case 'trueFalse': {
      // Ziehbare Maße (02.10.2026) – Spalten: Aussage, richtig, falsch
      const breiten = eigeneBreiten(answer, 3)
      const ziehbar = Boolean(onChange) && (editText || editKey)
      const speichern = (z: ZugErgebnis): void => onChange?.((a) => zugUebernehmen(a, z, a.statements.length))
      const g = (r: number | 'kopf', c: number): React.ReactNode =>
        ziehbar && <TabellenGriffe c={c} spalten={3} zeile={r} breiten={breiten} onZug={speichern} />
      const einheiten = answer.statements.map((s, i) => (
        <tr key={i} {...u} style={zeilenStil(answer.rowHeightsMm?.[i])}>
          <td>
            <Zelle value={s.text} editable={editText} onChange={(v) => onChange?.((a) => (a.statements[i].text = v))} />
            {g(i, 0)}
          </td>
          {[true, false].map((val, k) => (
            <td key={String(val)} className="ws-tf-cell" onClick={editKey ? set((a) => (a.statements[i].isTrue = val)) : undefined}>
              <span className="ws-check">{key && s.isTrue === val ? '✗' : ''}</span>
              {g(i, k + 1)}
            </td>
          ))}
        </tr>
      ))
      return {
        einheiten,
        rahmen: (stueck, k) => (
          <table className={`ws-tf ${ziehbar ? 'ws-table-ziehbar' : ''}`} key={k} style={breiten ? { tableLayout: 'fixed' } : undefined}>
            <Spalten n={3} breiten={breiten} />
            <thead>
              <tr style={zeilenStil(answer.headerHeightMm)}>
                <th>{g('kopf', 0)}</th>
                <th>
                  {trueFalseLabels(answerLanguage).yes}
                  {g('kopf', 1)}
                </th>
                <th>
                  {trueFalseLabels(answerLanguage).no}
                  {g('kopf', 2)}
                </th>
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
      /*
       * Maße (02.10.2026): von Hand gezogen > KI-Prüfung > Regel nach Jahrgang und erwarteter
       * Lösung (didactics/schreibraum.ts). Im Editor (Schülerblatt und Lösungen) Griffe an den
       * Spalten- und Zeilenlinien wie bei der Tabelle als Baustein.
       */
      const r0 = raum ?? { regel: schreibRegel(7), breiteMm: 160 }
      const masse = antwortTabellenMasse(answer, r0.regel, r0.breiteMm)
      const ziehbar = Boolean(onChange) && (editText || editKey)
      const speichern = (z: ZugErgebnis): void => onChange?.((a) => zugUebernehmen(a, z, a.rows.length))
      const griffe = (r: number | 'kopf', c: number): React.ReactNode =>
        ziehbar && <TabellenGriffe c={c} spalten={masse.colWidths.length} zeile={r} breiten={masse.colWidths} onZug={speichern} />
      const einheiten = answer.rows.map((row, r) => (
        <tr key={r} {...u} style={masse.rowHeightsMm[r] ? { height: `${masse.rowHeightsMm[r]}mm` } : undefined}>
          {row.map((cell, c) => {
            const solution = answer.solutionRows[r]?.[c] ?? ''
            if (cell) {
              return (
                <td key={c}>
                  <Zelle value={cell} editable={editText} onChange={(v) => onChange?.((a) => (a.rows[r][c] = v))} />
                  {griffe(r, c)}
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
                {griffe(r, c)}
              </td>
            )
          })}
        </tr>
      ))
      return {
        einheiten,
        rahmen: (stueck, k) => (
          <table className={`ws-table ws-table-fill ${ziehbar ? 'ws-table-ziehbar' : ''}`} key={k} style={{ tableLayout: 'fixed' }}>
            <colgroup>
              {masse.colWidths.map((w, c) => (
                <col key={c} style={{ width: `${w}%` }} />
              ))}
            </colgroup>
            {answer.headers.length > 0 && (
              <thead>
                <tr style={masse.headerHeightMm ? { height: `${masse.headerHeightMm}mm` } : undefined}>
                  {answer.headers.map((h, c) => (
                    <th key={c}>
                      <Zelle value={h} editable={editText} onChange={(v) => onChange?.((a) => (a.headers[c] = v))} />
                      {griffe('kopf', c)}
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
  const ctx = useWs()
  const { mode, answerLanguage, contentWidthMm } = ctx
  const key = isKeyMode(mode)
  const editText = mode === 'edit' && onChange
  const editKey = mode === 'keyEdit' && onChange
  // Zeilen der teilbaren Antwortformen – hier OHNE `data-unit`: Die Antwort steht dann innerhalb einer anderen Einheit
  const teilbar = teilbareAntwort(
    answer,
    {
      key,
      editText: Boolean(editText),
      editKey: Boolean(editKey),
      editRoh: isEditMode(mode),
      answerLanguage: answerLanguage ?? 'de',
      onChange,
      raum: antwortRaum(ctx)
    },
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
