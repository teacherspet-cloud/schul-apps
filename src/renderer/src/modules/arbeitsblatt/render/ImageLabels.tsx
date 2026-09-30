import type { ImageLabel } from '../model/types'
import { imageSizeFromDataUrl } from '../../../shared/imageSize'
import { imageHeightMmFor, layoutImageLabels, leitweg } from './imageLabelLayout'

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
 * einem Bild ist schlecht lesbar (DBSV) – und ist über eine Linie mit dem Bildpunkt verbunden.
 * Solange es geht, liegt die Linie waagerecht: Schild und Punkt auf gleicher Höhe, die
 * Zuordnung gelingt ohne Verfolgen der Linie.
 *
 * SEIT 26.09.2026 werden die Schilder GESETZT (`imageLabelLayout.ts`): Liegen zwei Punkte auf
 * gleicher Höhe, lagen ihre Schilder deckend übereinander, und ein Teil der Beschriftung war
 * „übermalt" (Befund der Lehrkraft am Blatt „Strahlung aus Atomkernen"). Jetzt rücken die
 * Schilder einer Spalte so weit auseinander, dass sich keines mit einem anderen überschneidet,
 * und die Linie knickt zum Punkt. Das geschieht ohne Messung im Browser, damit es im
 * Druck-HTML (PDF) genauso aussieht wie im Editor; die Bildhöhe kommt aus dem Seitenverhältnis
 * der Bilddatei.
 *
 * `blank` macht daraus eine Beschriftungsaufgabe: Auf dem Schülerblatt steht eine leere Linie
 * an der richtigen Stelle, im Lösungsteil der Text.
 */

/** Breite der Schilderspalte in mm – muss zu `.ws-imglabel-grid` in ws.css passen */
export const LABEL_COL_MM = 26

export function ImageLabelLayer({
  labels,
  showAnswers,
  onMove,
  widthMm,
  imageDataUrl,
  children
}: {
  labels: ImageLabel[]
  /** Lösungsteil: auch die leeren Beschriftungen zeigen ihren Text */
  showAnswers: boolean
  /** Im Editor: Punkt verschieben (Anteile 0–100) */
  onMove?: (id: string, x: number, y: number) => void
  /** Breite des Bildbausteins in mm (Bild plus beide Spalten) – für die Höhenschätzung */
  widthMm?: number
  /** Die Bilddatei – ihr Seitenverhältnis bestimmt die Bildhöhe */
  imageDataUrl?: string
  /** Das Bild selbst */
  children: React.ReactNode
}): React.JSX.Element {
  const imageHeightMm = imageHeightMmFor(widthMm ?? 170, LABEL_COL_MM, imageSizeFromDataUrl(imageDataUrl))
  const gesetzt = layoutImageLabels(labels, { imageHeightMm, colWidthMm: LABEL_COL_MM })
  const platz = (label: ImageLabel) => gesetzt.get(label.id) ?? { side: label.x < 50 ? ('left' as const) : ('right' as const), top: label.y, heightPct: 0, lines: 1 }

  const box = (label: ImageLabel): React.JSX.Element => (
    <div key={label.id} className="ws-imglabel-box" style={{ top: `${platz(label).top}%` }}>
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

  /*
   * Die Linie vom Punkt zum Schild: waagerecht bis kurz vor den Bildrand, dann – falls das
   * Schild verschoben wurde – schräg zur Schildmitte am Rand. Als SVG in Prozentkoordinaten
   * über dem Bild; die Strichstärke skaliert nicht mit (vector-effect in ws.css).
   * Gezeichnete Schaltpläne bringen einen rechtwinkligen Leitweg mit (`route`): vom Bauteil
   * in einen freien Streifen, erst dort waagerecht – so läuft keine Linie durch ein Symbol.
   */
  const linie = (label: ImageLabel): string => {
    const p = platz(label)
    const links = p.side === 'left'
    const weg = leitweg(label)
    const aus = weg[weg.length - 1]
    const knick = links ? Math.min(aus.x, 4) : Math.max(aus.x, 96)
    const rand = links ? 0 : 100
    return [...weg.map((q) => `${q.x},${q.y}`), `${knick},${aus.y}`, `${rand},${p.top}`].join(' ')
  }

  return (
    <div className="ws-imglabel-grid">
      <div className="ws-imglabel-col">{labels.filter((l) => platz(l).side === 'left').map(box)}</div>
      <div className="ws-imglabel-area">
        {children}
        <svg className="ws-imglabel-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {labels.map((label) => (
            <polyline key={label.id} points={linie(label)} />
          ))}
        </svg>
        {labels.map((label) => (
          <button
            key={label.id}
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
        ))}
      </div>
      <div className="ws-imglabel-col">{labels.filter((l) => platz(l).side === 'right').map(box)}</div>
    </div>
  )
}
