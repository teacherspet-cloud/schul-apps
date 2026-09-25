import type { ImageLabel } from '../model/types'

/**
 * Beschriftungen direkt an den Elementen eines Bildes.
 *
 * Warum dieser Aufwand: Auf Papier ist das der stärkste gemessene Hebel. Gegenüber einem
 * Textabsatz unter dem Bild brachte die Beschriftung am Element d = 0,80 im Transfer, gegenüber
 * einer Legende darunter noch d = 0,35 (Johnson & Mayer 2012). Die verbreitete Gegenform –
 * Ziffern im Bild und eine nummerierte Liste darunter – war in einer Untersuchung mit
 * Studierenden das am schwersten verständliche Diagrammformat (Kottmeyer u. a. 2020).
 *
 * Aufbau: Das Schild steht in einer Spalte NEBEN dem Bild, nicht darauf – Text unmittelbar auf
 * einem Bild ist schlecht lesbar (DBSV) – und ist über eine waagerechte Linie mit dem Bildpunkt
 * verbunden. Waagerecht deshalb, weil Schild und Punkt dann auf gleicher Höhe liegen und die
 * Zuordnung gelingt, ohne die Linie mit dem Auge verfolgen zu müssen.
 *
 * `blank` macht daraus eine Beschriftungsaufgabe: Auf dem Schülerblatt steht eine leere Linie
 * an der richtigen Stelle, im Lösungsteil der Text.
 */

/** Auf welcher Seite das Schild steht – aus der Angabe oder nach der Lage des Punktes. */
const sideOf = (label: ImageLabel): 'left' | 'right' => label.side ?? (label.x < 50 ? 'left' : 'right')

export function ImageLabelLayer({
  labels,
  showAnswers,
  onMove,
  children
}: {
  labels: ImageLabel[]
  /** Lösungsteil: auch die leeren Beschriftungen zeigen ihren Text */
  showAnswers: boolean
  /** Im Editor: Punkt verschieben (Anteile 0–100) */
  onMove?: (id: string, x: number, y: number) => void
  /** Das Bild selbst */
  children: React.ReactNode
}): React.JSX.Element {
  const box = (label: ImageLabel): React.JSX.Element => (
    <div key={label.id} className="ws-imglabel-box" style={{ top: `${label.y}%` }}>
      {label.blank && !showAnswers ? <span className="ws-imglabel-blank" /> : <span className="ws-imglabel-text">{label.text}</span>}
    </div>
  )

  const drag = (label: ImageLabel) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!onMove) return
    const area = e.currentTarget.closest('.ws-imglabel-area')
    if (!area) return
    e.preventDefault()
    const rect = area.getBoundingClientRect()
    const move = (ev: PointerEvent): void => {
      const x = Math.min(100, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100))
      const y = Math.min(100, Math.max(0, ((ev.clientY - rect.top) / rect.height) * 100))
      onMove(label.id, Math.round(x), Math.round(y))
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="ws-imglabel-grid">
      <div className="ws-imglabel-col">{labels.filter((l) => sideOf(l) === 'left').map(box)}</div>
      <div className="ws-imglabel-area">
        {children}
        {labels.map((label) => (
          <div key={label.id}>
            <div
              className="ws-imglabel-line"
              style={sideOf(label) === 'left' ? { top: `${label.y}%`, left: 0, width: `${label.x}%` } : { top: `${label.y}%`, left: `${label.x}%`, right: 0 }}
            />
            <button
              type="button"
              className={`ws-imglabel-dot ${onMove ? 'ws-imglabel-move' : ''}`}
              style={{ left: `${label.x}%`, top: `${label.y}%` }}
              /* Bei einer Lückenbeschriftung darf der Text hier NICHT stehen: Er wäre sonst
                 im Markup des Schülerblattes zu finden – über den Vorleser oder beim
                 Herauskopieren des PDF-Textes – und die Aufgabe wäre verraten. */
              aria-label={(label.blank && !showAnswers ? '' : label.text) || 'Beschriftungspunkt'}
              disabled={!onMove}
              onPointerDown={drag(label)}
            />
          </div>
        ))}
      </div>
      <div className="ws-imglabel-col">{labels.filter((l) => sideOf(l) === 'right').map(box)}</div>
    </div>
  )
}
