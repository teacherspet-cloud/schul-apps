import { useState } from 'react'
import type { ImageLabel } from '../model/types'
import { imageSizeFromDataUrl } from '../../../shared/imageSize'
import { bauteilLinie, begradigt, imageHeightMmFor, layoutImageLabels, schildAnker, spaltenLinie, type Prozentpunkt } from './imageLabelLayout'
import { BESCHRIFTUNG_PT, LEERLINIE_MM, SCHILD_ABSTAND_MM } from './schaltplanSvg'

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
 *
 * `inline` (gezeichnete Schaltpläne, 30.09.2026): Das Schild steht IM Bild direkt am Bauteil, in
 * dem Platz, den die Zeichnung dafür freihält – ohne Randspalten, die den Schaltplan vorher auf
 * einen Bruchteil der Breite schrumpfen ließen. Die Schrift folgt dem Maßstab, falls das Bild
 * kleiner als in Originalgröße (1 Einheit = 1 mm) gedruckt wird.
 *
 * VON HAND NACHJUSTIEREN (Wunsch der Lehrkraft, 30.09.2026 – „die runden Punkte mit ihren Linien
 * frei verschieben"): Im Editor lassen sich Punkt und Schild UNABHÄNGIG ziehen (Maus, Stift,
 * Finger), die Linie folgt live und bleibt rechtwinklig. Pfeiltasten schieben das gewählte
 * Element (mit Umschalt weiter). Ein Zug ist EIN Schritt für Strg+Z. Die Lage wird gespeichert
 * (`schild`, `ursprung`) und von keiner automatischen Setzung überschrieben; Druck, PDF und Word
 * zeigen sie genauso. Für das gewählte Schild: „Linie begradigen", „Automatische Lage" und bei
 * Schaltplänen „An Bauteil einrasten".
 */

/** Breite der Schilderspalte in mm – muss zu `.ws-imglabel-grid` in ws.css passen */
export const LABEL_COL_MM = 26

/** Ändert eine Beschriftung (im Editor ein Rückgängig-Schritt je Aufruf) */
export type LabelAenderung = (id: string, aendern: (l: ImageLabel) => void) => void

const VERSATZ: Record<NonNullable<ImageLabel['inline']>, (abstandMm: number) => string> = {
  oben: (a) => `translate(-50%, calc(-100% - ${a}mm))`,
  unten: (a) => `translate(-50%, ${a}mm)`,
  links: (a) => `translate(calc(-100% - ${a}mm), -50%)`,
  rechts: (a) => `translate(${a}mm, -50%)`
}

const klemme = (v: number, lo = 0, hi = 100): number => Math.round(Math.min(hi, Math.max(lo, v)) * 100) / 100

/** Punkt verschieben – beim ersten Mal die automatische Lage merken (für „Automatische Lage") */
export function punktVerschieben(l: ImageLabel, x: number, y: number): void {
  if (!l.ursprung) l.ursprung = { x: l.x, y: l.y }
  // Das Schild bleibt stehen, wo es war – Punkt und Schild sind unabhängig
  if (l.inline && !l.schild) l.schild = { x: l.x, y: l.y }
  l.x = klemme(x)
  l.y = klemme(y)
}

/** Zurück zur automatischen Lage von Punkt und Schild */
export function automatischeLage(l: ImageLabel): void {
  if (l.ursprung) {
    l.x = l.ursprung.x
    l.y = l.ursprung.y
  }
  delete l.ursprung
  delete l.schild
}

export function ImageLabelLayer({
  labels,
  showAnswers,
  onMove,
  onChange,
  einrasten,
  widthMm,
  imageDataUrl,
  children
}: {
  labels: ImageLabel[]
  /** Lösungsteil: auch die leeren Beschriftungen zeigen ihren Text */
  showAnswers: boolean
  /** Ältere Schnittstelle: nur den Punkt verschieben (Anteile 0–100) */
  onMove?: (id: string, x: number, y: number) => void
  /** Im Editor: Punkt und Schild ziehen, begradigen, zurücksetzen – ein Aufruf je Zug */
  onChange?: LabelAenderung
  /** Schaltpläne: nächster Punkt auf einem Bauteil (Prozent) – für „An Bauteil einrasten" */
  einrasten?: (p: Prozentpunkt) => Prozentpunkt | null
  /** Breite des Bildbausteins in mm (Bild plus beide Spalten) – für die Höhenschätzung */
  widthMm?: number
  /** Die Bilddatei – ihr Seitenverhältnis bestimmt die Bildhöhe */
  imageDataUrl?: string
  /** Das Bild selbst */
  children: React.ReactNode
}): React.JSX.Element {
  const aendern: LabelAenderung | undefined =
    onChange ??
    (onMove
      ? (id, fn) => {
          const l = labels.find((x) => x.id === id)
          if (!l) return
          const kopie = { ...l }
          fn(kopie)
          onMove(id, kopie.x, kopie.y)
        }
      : undefined)
  const bearbeitbar = Boolean(aendern)
  const [aktiv, setAktiv] = useState<string | null>(null)
  // Während eines Zuges: die Lage vor dem Speichern (die Linie folgt live)
  const [zug, setZug] = useState<{ id: string; label: ImageLabel } | null>(null)
  const alle = zug ? labels.map((l) => (l.id === zug.id ? zug.label : l)) : labels

  const groesse = imageSizeFromDataUrl(imageDataUrl)
  const amBauteil = alle.filter((l) => l.inline)
  const aussen = alle.filter((l) => !l.inline)
  const imageHeightMm = imageHeightMmFor(widthMm ?? 170, LABEL_COL_MM, groesse)
  const gesetzt = layoutImageLabels(aussen, { imageHeightMm, colWidthMm: LABEL_COL_MM })
  const flaecheMm = aussen.length ? (widthMm ?? 170) - 2 * LABEL_COL_MM : (widthMm ?? 170)
  const massstab = groesse && groesse.width > 0 ? Math.min(1, flaecheMm / groesse.width) : 1
  const platz = (label: ImageLabel) => gesetzt.get(label.id) ?? { side: label.x < 50 ? ('left' as const) : ('right' as const), top: label.y, heightPct: 0, lines: 1 }

  /** Ein Zug mit Zeiger (Maus, Stift, Finger): live anzeigen, beim Loslassen EINMAL speichern */
  const ziehen =
    (label: ImageLabel, was: 'punkt' | 'schild') =>
    (e: React.PointerEvent<HTMLElement>): void => {
      if (!aendern) return
      // Bezug ist immer die Bildfläche – auch beim Schild in der Randspalte
      const area = e.currentTarget.closest('.ws-imglabel-grid')?.querySelector('.ws-imglabel-area') ?? e.currentTarget.closest('.ws-imglabel-area')
      if (!area) return
      // Ein zweiter Finger gehört dem Zoom (shared/touch/zoom.tsx), nicht dem Griff
      if (!e.isPrimary) return
      e.preventDefault()
      e.stopPropagation()
      /*
       * iPad (01.10.2026): „Die Linien lassen sich nicht verschieben – oft wird das Bild oder der
       * Text markiert bzw. gezogen." Der Zeiger gehört ab jetzt dem Griff (Capture), und solange
       * der Zug läuft, markiert der Browser nichts (ws.css: html[data-griff-zug]).
       */
      const zeiger = e.pointerId
      try {
        e.currentTarget.setPointerCapture(zeiger)
      } catch {
        // ohne Capture tragen die Horcher am Fenster den Zug weiter
      }
      window.getSelection()?.removeAllRanges()
      document.documentElement.setAttribute('data-griff-zug', '')
      setAktiv(label.id)
      const rect = area.getBoundingClientRect()
      const startX = e.clientX
      const startY = e.clientY
      const startSchild = label.inline ? schildAnker(label) : { x: label.side === 'left' ? 0 : 100, y: platz(label).top }
      let letzte: ImageLabel | null = null
      const neu = (ev: PointerEvent): ImageLabel => {
        const l: ImageLabel = { ...label }
        const dx = ((ev.clientX - startX) / rect.width) * 100
        const dy = ((ev.clientY - startY) / rect.height) * 100
        if (was === 'punkt') punktVerschieben(l, ((ev.clientX - rect.left) / rect.width) * 100, ((ev.clientY - rect.top) / rect.height) * 100)
        else if (l.inline) l.schild = { x: klemme(startSchild.x + dx, -20, 120), y: klemme(startSchild.y + dy, -20, 120) }
        else {
          // Randspalte: Höhe frei, die Seite folgt dem Zeiger
          l.side = ev.clientX < rect.left + rect.width / 2 ? 'left' : 'right'
          l.schild = { x: l.side === 'left' ? 0 : 100, y: klemme(startSchild.y + dy) }
        }
        return l
      }
      const bewegen = (ev: PointerEvent): void => {
        if (ev.pointerId !== zeiger) return
        if (!letzte && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 2) return
        ev.preventDefault()
        letzte = neu(ev)
        setZug({ id: label.id, label: letzte })
      }
      const ende = (ev: PointerEvent): void => {
        // Der Zwei-Finger-Zoom meldet sein „Abbrechen" ohne Kennung des Fingers (zoom.tsx)
        if (ev.pointerId !== zeiger && ev.isTrusted) return
        document.documentElement.removeAttribute('data-griff-zug')
        window.removeEventListener('pointermove', bewegen)
        window.removeEventListener('pointerup', ende)
        window.removeEventListener('pointercancel', ende)
        setZug(null)
        const fertig = letzte
        if (!fertig) return
        aendern(label.id, (d) => {
          d.x = fertig.x
          d.y = fertig.y
          if (fertig.ursprung) d.ursprung = fertig.ursprung
          if (fertig.schild) d.schild = fertig.schild
          if (fertig.side) d.side = fertig.side
        })
      }
      window.addEventListener('pointermove', bewegen)
      window.addEventListener('pointerup', ende)
      window.addEventListener('pointercancel', ende)
    }

  /** Pfeiltasten: 0,5 % je Druck, mit Umschalt 2 % – je Druck ein Rückgängig-Schritt */
  const tasten =
    (label: ImageLabel, was: 'punkt' | 'schild') =>
    (e: React.KeyboardEvent<HTMLElement>): void => {
      if (!aendern) return
      const schritt = e.shiftKey ? 2 : 0.5
      const d = { ArrowLeft: [-schritt, 0], ArrowRight: [schritt, 0], ArrowUp: [0, -schritt], ArrowDown: [0, schritt] }[e.key]
      if (!d) return
      e.preventDefault()
      const [dx, dy] = d
      aendern(label.id, (l) => {
        if (was === 'punkt') punktVerschieben(l, l.x + dx, l.y + dy)
        else if (l.inline) {
          const s = schildAnker(l)
          l.schild = { x: klemme(s.x + dx, -20, 120), y: klemme(s.y + dy, -20, 120) }
        } else l.schild = { x: labelSeite(l), y: klemme((l.schild?.y ?? platz(l).top) + dy) }
      })
    }
  const labelSeite = (l: ImageLabel): number => (platz(l).side === 'left' ? 0 : 100)
  const griff = (label: ImageLabel, was: 'punkt' | 'schild') =>
    bearbeitbar
      ? {
          tabIndex: 0,
          onPointerDown: ziehen(label, was),
          onKeyDown: tasten(label, was),
          onFocus: () => setAktiv(label.id),
          'data-griff': was
        }
      : {}

  const box = (label: ImageLabel): React.JSX.Element => (
    <div
      key={label.id}
      className="ws-imglabel-box"
      style={{ top: `${platz(label).top}%`, ...(bearbeitbar ? { cursor: 'grab', touchAction: 'none' } : {}) }}
      {...griff(label, 'schild')}
      {...(bearbeitbar ? { 'data-label-id': label.id, 'aria-label': `Schild ${label.blank && !showAnswers ? '' : label.text}`.trim() } : {})}
    >
      {label.blank && !showAnswers ? <span className="ws-imglabel-blank" /> : <span className="ws-imglabel-text">{label.text}</span>}
    </div>
  )

  const schildAmBauteil = (label: ImageLabel): React.JSX.Element => {
    const s = schildAnker(label)
    return (
      <div
        key={label.id}
        className="ws-imglabel-inline"
        style={{
          position: 'absolute',
          left: `${s.x}%`,
          top: `${s.y}%`,
          transform: VERSATZ[label.inline!](Math.round(SCHILD_ABSTAND_MM * massstab * 100) / 100),
          fontSize: `${Math.round(BESCHRIFTUNG_PT * massstab * 10) / 10}pt`,
          lineHeight: 1.15,
          whiteSpace: 'nowrap',
          textAlign: label.inline === 'links' ? 'right' : label.inline === 'rechts' ? 'left' : 'center',
          padding: '0 0.4mm',
          background: label.schild ? '#fff' : undefined,
          ...(bearbeitbar ? { cursor: 'grab', touchAction: 'none', outline: aktiv === label.id ? '0.3mm dashed #1c7ed6' : undefined } : {})
        }}
        {...griff(label, 'schild')}
        {...(bearbeitbar ? { 'data-label-id': label.id } : {})}
      >
        {label.blank && !showAnswers ? (
          <span style={{ display: 'inline-block', width: `${Math.round(LEERLINIE_MM * massstab * 10) / 10}mm`, height: '1.1em', borderBottom: '0.5pt solid #000' }} />
        ) : (
          <span>{label.text}</span>
        )}
      </div>
    )
  }

  /*
   * Linien: Randspalte immer (Leitweg, dann rechtwinklig zum Schild); am Bauteil nur, wenn Punkt
   * und Schild getrennt verschoben wurden. Als SVG in Prozentkoordinaten über dem Bild; die
   * Strichstärke skaliert nicht mit (vector-effect in ws.css).
   */
  const linien = [
    ...aussen.map((l) => ({ l, pts: spaltenLinie(l, platz(l)) })),
    ...amBauteil.map((l) => ({ l, pts: bauteilLinie(l) })).filter((x): x is { l: ImageLabel; pts: Prozentpunkt[] } => Boolean(x.pts))
  ]
  // Punkte: in der Randspalte immer; am Bauteil, wenn eine Linie dazu gehört – im Editor immer als Griff
  const punkte = [...aussen, ...amBauteil.filter((l) => bearbeitbar || bauteilLinie(l))]

  const gewaehlt = aktiv ? alle.find((l) => l.id === aktiv) : undefined
  const werkzeug =
    bearbeitbar && gewaehlt && aendern ? (
      <div className="ws-imglabel-werkzeug" role="toolbar" aria-label="Beschriftung nachjustieren" style={{ display: 'flex', gap: '1mm', justifyContent: 'center', marginTop: '1mm', lineHeight: 1.2 }}>
        <button type="button" onClick={() => aendern(gewaehlt.id, (l) => void (l.schild = begradigt(l)))}>
          Linie begradigen
        </button>
        {einrasten && (
          <button
            type="button"
            onClick={() => {
              const p = einrasten({ x: gewaehlt.x, y: gewaehlt.y })
              if (p) aendern(gewaehlt.id, (l) => punktVerschieben(l, p.x, p.y))
            }}
          >
            An Bauteil einrasten
          </button>
        )}
        <button type="button" onClick={() => aendern(gewaehlt.id, automatischeLage)}>
          Automatische Lage
        </button>
      </div>
    ) : null

  const flaeche = (
    <div className={`ws-imglabel-area${bearbeitbar ? ' ws-imglabel-bearbeitbar' : ''}`}>
      {children}
      {linien.length > 0 && (
        <svg className="ws-imglabel-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {linien.map(({ l, pts }) => (
            <polyline key={l.id} points={pts.map((q) => `${q.x},${q.y}`).join(' ')} />
          ))}
        </svg>
      )}
      {amBauteil.map(schildAmBauteil)}
      {punkte.map((label) => (
        <button
          key={label.id}
          type="button"
          className={`ws-imglabel-dot ${bearbeitbar ? 'ws-imglabel-move' : ''}`}
          style={{ left: `${label.x}%`, top: `${label.y}%`, ...(bearbeitbar ? { touchAction: 'none', outline: aktiv === label.id ? '0.4mm solid #1c7ed6' : undefined } : {}) }}
          /* Bei einer Lückenbeschriftung darf der Text hier NICHT stehen: Er wäre sonst
             im Markup des Schülerblattes zu finden – über den Vorleser oder beim
             Herauskopieren des PDF-Textes – und die Aufgabe wäre verraten. */
          aria-label={(label.blank && !showAnswers ? '' : label.text) || 'Beschriftungspunkt'}
          disabled={!bearbeitbar}
          onPointerDown={bearbeitbar ? ziehen(label, 'punkt') : undefined}
          onKeyDown={bearbeitbar ? tasten(label, 'punkt') : undefined}
          onFocus={bearbeitbar ? () => setAktiv(label.id) : undefined}
          {...(bearbeitbar ? { 'data-griff': 'punkt', 'data-label-id': label.id } : {})}
        />
      ))}
    </div>
  )

  // Nur Schilder am Bauteil: keine Randspalten, das Bild behält die ganze Breite
  if (!aussen.length)
    return (
      <>
        {flaeche}
        {werkzeug}
      </>
    )

  return (
    <>
      <div className="ws-imglabel-grid">
        <div className="ws-imglabel-col">{aussen.filter((l) => platz(l).side === 'left').map(box)}</div>
        {flaeche}
        <div className="ws-imglabel-col">{aussen.filter((l) => platz(l).side === 'right').map(box)}</div>
      </div>
      {werkzeug}
    </>
  )
}
