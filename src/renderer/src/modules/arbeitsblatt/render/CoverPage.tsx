import { RichText } from '../../../shared/richtext/RichText'
import type { Worksheet } from '../model/types'
import { coverDesign, foxPlaceholder } from './coverDesigns'

/**
 * Deckblatt als Seite 0 vor den Arbeitsblättern.
 *
 * Es richtet sich an Lehrkräfte: Titel, ein Maskottchen, eine sehr kurze Beschreibung, der
 * Hinweis auf Lösungen – und darunter die Blätter als kleine Vorschau, damit man sofort sieht,
 * was einen erwartet. Die Vorschau entsteht aus den echten Seiten und ist deshalb immer aktuell;
 * ein abgelegter Bildschirmabzug wäre es nach der ersten Änderung nicht mehr.
 *
 * Titel und Kurzbeschreibung laufen wie das ganze Blatt über `RichText`, nicht über
 * `Editable`: Sonst stünde auf dem Deckblatt eines Mathematikblattes „Rechnen mit $a^2$"
 * wörtlich da, während dieselbe Formel eine Seite weiter gesetzt wird.
 */
export function CoverPage({
  ws,
  previews,
  onChange,
  onRegenerateFox
}: {
  ws: Worksheet
  /** Verkleinerte Seiten des Blattes */
  previews?: React.ReactNode[]
  onChange?: (fn: (ws: Worksheet) => void) => void
  onRegenerateFox?: () => void
}): React.JSX.Element {
  const d = coverDesign(ws.meta.coverDesign)
  const fox = ws.meta.coverImage || foxPlaceholder(d.dark, d.mid)
  const editable = Boolean(onChange)
  const set = (fn: (m: Worksheet['meta'], v: string) => void) => (onChange ? (v: string) => onChange((w) => fn(w.meta, v)) : undefined)
  const levels = ws.meta.differentiation.levels
  const facts = [
    ws.meta.subjectLabel,
    ws.meta.grade ? `Klasse ${ws.meta.grade}` : '',
    levels > 1 ? `${levels} Niveaustufen` : '',
    `${ws.sheets[0]?.blocks.filter((b) => b.type === 'task').length ?? 0} Aufgaben`
  ].filter(Boolean)

  return (
    <div className="ws-page ws-cover" style={{ ['--cover-dark' as string]: d.dark, ['--cover-mid' as string]: d.mid, ['--cover-light' as string]: d.light }}>
      <div className="ws-cover-top">
        <div className="ws-cover-headline">
          <div className="ws-cover-title">
            <RichText value={ws.meta.title || ws.meta.topic} inline editable={editable} onChange={set((m, v) => (m.title = v))} />
          </div>
          <div className="ws-cover-facts">{facts.join(' · ')}</div>
        </div>
        <button
          type="button"
          className="ws-cover-fox"
          title={onRegenerateFox ? 'Neuen Fuchs von der KI zeichnen lassen' : undefined}
          onClick={onRegenerateFox}
          disabled={!onRegenerateFox}
        >
          <img src={fox} alt="" />
          {onRegenerateFox && (
            <span className="ws-cover-fox-hint" aria-hidden>
              ↻
            </span>
          )}
        </button>
      </div>

      <div className="ws-cover-blurb">
        <RichText
          value={ws.meta.coverText ?? ''}
          editable={editable}
          placeholder="In einem Satz: worum geht es auf diesem Blatt?"
          onChange={set((m, v) => (m.coverText = v))}
        />
      </div>

      <div className="ws-cover-badges">
        {ws.meta.answerKey && <span className="ws-cover-badge">mit Lösungen</span>}
        {ws.meta.boardPlan && <span className="ws-cover-badge">mit Tafelbild</span>}
        {ws.sheets.some((s) => s.blocks.some((b) => b.type === 'audio')) && <span className="ws-cover-badge">mit Hörtexten</span>}
        {ws.meta.helpCards !== false && <span className="ws-cover-badge">mit Hilfekarten</span>}
      </div>

      {previews && previews.length > 0 && (
        /*
          Vier bis sechs EINZELNE Seiten, gefächert statt in einer Reihe.
          Gewünscht am 24.09.2026: „Trenne auf dem Deckblatt die Seiten voneinander und nutze
          4-6 repräsentative Seiten des Materials einzeln angeordnet in ein ästhetisch
          ansprechenden Positionierungen."
          Die Nummer am Blattrand sagt, welche Seite man sieht – sonst wirkt der Stapel wie
          eine zufällige Auswahl.
        */
        <div className={`ws-cover-previews ws-cover-previews-${Math.min(previews.length, 6)}`} aria-hidden>
          {previews.slice(0, 6).map((p, i) => (
            <div className="ws-cover-thumb" key={i}>
              <div className="ws-cover-thumb-inner">{p}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
