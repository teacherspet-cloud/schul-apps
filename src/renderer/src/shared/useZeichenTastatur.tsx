/**
 * Tastatur-Bedienung einer Zeichenfläche (23.10.2026, Barrierefreiheit – WCAG 2.1 AA 2.1.1): Fokus, Fadenkreuz,
 * Hilfetext und Ansagen. Die Tastenlogik selbst steht ohne React in shared/zeichenTastatur.ts.
 *
 * Die Fläche bekommt `flaeche` (tabIndex, role="application", aria-label, aria-describedby, onKeyDown/onFocus/onBlur)
 * und zeigt `kreuz` (Fadenkreuz in Flächenkoordinaten) und `hilfe` (unsichtbarer Hilfetext). Das Fadenkreuz erscheint
 * nur bei Bedienung mit der Tastatur – Maus, Stift und Finger bleiben unverändert.
 */
import { useId, useRef, useState } from 'react'
import {
  aktionsAnsage,
  klemmePunkt,
  startZustand,
  zeichenTaste,
  type ZeichenAktion,
  type ZeichenModus,
  type ZeichenZustand,
  type ZPunkt
} from '@shared/zeichenTastatur'
import { ansagen } from './ansage'

/** Zuletzt benutzte Lage je Fläche – beim Werkzeugwechsel springt das Fadenkreuz nicht zurück in die Mitte */
const letzteLage = new Map<string, ZPunkt>()

export interface ZeichenTastaturOptionen {
  breite: number
  hoehe: number
  modus: ZeichenModus
  /** Fläche bedienbar (sonst nicht per Tab erreichbar, Tasten werden nicht abgefangen) */
  aktiv: boolean
  bezeichnung: string
  hilfe: string
  /** Führt die Aktion aus; Rückgabe: eigener Ansagetext, `false` = keine Ansage, sonst der Standardtext */
  ausfuehren: (a: ZeichenAktion, z: ZeichenZustand) => string | false | void
  /** Vorab: 'erledigt' = Taste verarbeitet, 'durchlassen' = nicht abfangen (z. B. Pfeile für ein gewähltes Element) */
  eigeneTaste?: (e: React.KeyboardEvent) => 'erledigt' | 'durchlassen' | void
  /** Name des Werkzeugs für die Ansagen („Stift aufgesetzt") */
  ding?: string
  /** Ansage nach „ende" (Standard „Linie gezeichnet") */
  ergebnis?: string
  /** Schlüssel, unter dem die Lage des Fadenkreuzes über Werkzeugwechsel hinweg gemerkt wird */
  merkSchluessel?: string
}

export interface ZeichenTastatur {
  flaeche: {
    tabIndex: number
    role: 'application'
    'aria-label': string
    'aria-describedby': string
    'aria-roledescription': string
    'data-zeichen-flaeche': string
    onKeyDown: (e: React.KeyboardEvent) => void
    onFocus: (e: React.FocusEvent) => void
    onBlur: (e: React.FocusEvent) => void
  }
  zustand: ZeichenZustand
  /** Fadenkreuz sichtbar (Fläche mit der Tastatur bedient) */
  sichtbar: boolean
  /** Unsichtbarer Hilfetext (irgendwo im Baum rendern) */
  hilfe: React.JSX.Element
}

export function useZeichenTastatur(o: ZeichenTastaturOptionen): ZeichenTastatur {
  const id = useId()
  const hilfeId = `zt-hilfe-${id}`
  const [zustand, setZustand] = useState<ZeichenZustand>(() =>
    startZustand(o.breite, o.hoehe, o.merkSchluessel ? letzteLage.get(o.merkSchluessel) : null)
  )
  const [sichtbar, setSichtbar] = useState(false)
  const stand = useRef(zustand)
  stand.current = zustand
  const optionen = useRef(o)
  optionen.current = o

  const setze = (z: ZeichenZustand): void => {
    stand.current = z
    setZustand(z)
    const s = optionen.current.merkSchluessel
    if (s) letzteLage.set(s, { x: z.x, y: z.y })
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const op = optionen.current
    // Tasten aus Feldern in der Fläche (Textkästchen, Werte) gehören diesen
    if (!op.aktiv || e.target !== e.currentTarget || e.nativeEvent.isComposing) return
    const eigen = op.eigeneTaste?.(e)
    if (eigen === 'erledigt') {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (eigen === 'durchlassen') return
    // Fläche kann inzwischen kleiner sein (Fenster verkleinert): erst einklemmen
    const z0 = { ...stand.current, ...klemmePunkt(stand.current, op.breite, op.hoehe) }
    const r = zeichenTaste(z0, e, op.modus, { breite: op.breite, hoehe: op.hoehe })
    if (!r) return
    e.preventDefault()
    e.stopPropagation()
    setSichtbar(true)
    setze(r.zustand)
    if (!r.aktion) return
    const text = op.ausfuehren(r.aktion, r.zustand)
    if (text === false) return
    const ansage = text || aktionsAnsage(r.aktion, op.ding, op.ergebnis)
    if (ansage) ansagen(ansage)
  }

  const onFocus = (e: React.FocusEvent): void => {
    if (e.target !== e.currentTarget) return
    // Nur mit der Tastatur erreicht (Tab) zeigt das Fadenkreuz – ein Mausklick fokussiert ohne :focus-visible
    let tastatur = false
    try {
      tastatur = (e.currentTarget as HTMLElement).matches(':focus-visible')
    } catch {
      tastatur = false
    }
    if (tastatur) setSichtbar(true)
  }

  const onBlur = (e: React.FocusEvent): void => {
    // Blur eines Felds in der Fläche (Textkästchen) zählt nicht
    if (e.target !== e.currentTarget) return
    setSichtbar(false)
    // Ein aufgesetzter Stift wird beim Verlassen abgesetzt
    const z = stand.current
    if (z.unten) {
      optionen.current.ausfuehren({ art: 'absetzen', punkt: { x: z.x, y: z.y } }, { ...z, unten: false })
      setze({ ...z, unten: false, start: null })
    } else if (z.start) {
      optionen.current.ausfuehren({ art: 'abbrechen' }, { ...z, start: null })
      setze({ ...z, start: null })
    }
  }

  return {
    flaeche: {
      tabIndex: o.aktiv ? 0 : -1,
      role: 'application',
      'aria-label': o.bezeichnung,
      'aria-describedby': hilfeId,
      'aria-roledescription': 'Zeichenfläche',
      'data-zeichen-flaeche': o.modus,
      onKeyDown,
      onFocus,
      onBlur
    },
    zustand,
    sichtbar: sichtbar && o.aktiv,
    hilfe: (
      <span id={hilfeId} style={UNSICHTBAR}>
        {o.hilfe}
      </span>
    )
  }
}

const UNSICHTBAR: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0
}

/**
 * Fadenkreuz in Flächenkoordinaten (absolut über der Fläche). Mit gesetztem Anfangspunkt: gestrichelte Hilfslinie;
 * mit aufgesetztem Stift: gefüllte Mitte. `massstab` = Flächeneinheiten je Bildschirmpunkt (Strichbreite).
 */
export function Fadenkreuz({
  z,
  links = 0,
  oben = 0,
  massstab = 1,
  farbe = '#d6336c'
}: {
  z: ZeichenZustand
  links?: number
  oben?: number
  massstab?: number
  farbe?: string
}): React.JSX.Element {
  const r = 11 * massstab
  const sw = 1.6 * massstab
  const s = z.start
  return (
    <svg
      aria-hidden
      data-fadenkreuz
      style={{ position: 'absolute', left: links, top: oben, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none', zIndex: 40 }}
    >
      {s && <line x1={s.x} y1={s.y} x2={z.x} y2={z.y} stroke={farbe} strokeWidth={sw} strokeDasharray={`${4 * massstab} ${3 * massstab}`} />}
      {s && <circle cx={s.x} cy={s.y} r={3 * massstab} fill={farbe} />}
      <g>
        <circle cx={z.x} cy={z.y} r={r * 0.55} fill={z.unten ? farbe : 'none'} fillOpacity={0.35} stroke={farbe} strokeWidth={sw} />
        <line x1={z.x - r} y1={z.y} x2={z.x + r} y2={z.y} stroke="#fff" strokeWidth={sw * 2.4} opacity={0.8} />
        <line x1={z.x} y1={z.y - r} x2={z.x} y2={z.y + r} stroke="#fff" strokeWidth={sw * 2.4} opacity={0.8} />
        <line x1={z.x - r} y1={z.y} x2={z.x + r} y2={z.y} stroke={farbe} strokeWidth={sw} />
        <line x1={z.x} y1={z.y - r} x2={z.x} y2={z.y + r} stroke={farbe} strokeWidth={sw} />
      </g>
    </svg>
  )
}
