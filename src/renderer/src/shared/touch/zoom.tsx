import { ActionIcon, Button, Tooltip } from '@mantine/core'
import { IconArrowsHorizontal, IconBook2, IconZoomIn, IconZoomOut } from '@tabler/icons-react'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { abstand, pinchZoom, zoomBegrenzen, zoomSchritt, zoomTaste, type Punkt, type ZoomAktion as Aktion } from './gestenLogik'

/**
 * Zoom der Blätter – EINE Bedienung für alle Programme (30.09.2026).
 *
 * Anlass 1 (Touch-Modus): Auf dem iPhone passt eine A4-Seite nur in etwa 40 % ihrer Größe auf den
 * Bildschirm; zum Lesen und Bearbeiten muss man hineinzoomen können – wie in jeder Dokument-App.
 *
 * Anlass 2 (Wunsch der Lehrkraft, 30.09.2026): „Das erstellte Material scheint linksbündig
 * angezeigt zu werden. Das fällt vor allem auf, wenn die linke Seitenleiste ausgeblendet wird und
 * rechts ein großer freier Platz entsteht. Zeige das Material auf der freien Fläche immer
 * zentriert (und heranzoombar) an, sodass es die freie Fläche dort sinnvoll füllt."
 *
 * Deshalb:
 *  - Standard ist „Breite einpassen" – bis höchstens EINPASSEN_MAX (größer wirkt ein A4-Blatt
 *    aufgeblasen). Das Blatt steht mittig; ändert sich der Platz (Seitenleiste, Fenster), passt
 *    sich der Zoom an.
 *  - Eigener Zoom: Knöpfe „–", „Prozent" (zurück auf Einpassen), „+", „Breite einpassen",
 *    Strg/⌘ + Mausrad (auch Aufziehen auf dem Trackpad – der Browser meldet es als Strg + Rad),
 *    zwei Finger auf dem Touchscreen, Strg + Plus/Minus, Strg + Umschalt + 0 = Einpassen.
 *    (Strg + 0 bleibt die Startseite – das Kürzel der Hauptapp gab es zuerst.)
 *  - Der Zoom gilt je Programm und wird gemerkt; alle Blätter eines Programms (Deckblatt und
 *    Seiten) teilen ihn.
 *  - Gezoomt wird mit CSS-`zoom` nur die Ansicht – Druck und PDF entstehen aus eigenem HTML.
 *
 * WCAG 2.5.1: Jede Mehrfinger-Geste hat einen Weg mit einem Finger (die Knöpfe).
 */

/** Obergrenze für „Breite einpassen": ein A4-Blatt füllt die Fläche, wird aber nicht übergroß */
export const EINPASSEN_MAX = 1.5
/** Grenzen des eigenen Zooms */
export const ZOOM_KLEINST = 0.3
export const ZOOM_GROESST = 3

export interface BlattZoom {
  /** true: „Breite einpassen" (Zoom folgt dem Platz); false: fester Zoom `z` */
  einpassen: boolean
  z: number
  /** Zwei Seiten nebeneinander */
  doppelseite: boolean
}
const STANDARD: BlattZoom = { einpassen: true, z: 1, doppelseite: false }

/** Programm, zu dem ein Blatt gehört – App.tsx setzt es je Modul */
export const ZoomProgramm = createContext('')

// ---------- Gemerkter Zoom je Programm

const SPEICHER = 'schul-apps-blattzoom'
function lesen(): Record<string, BlattZoom> {
  try {
    const roh = JSON.parse(localStorage.getItem(SPEICHER) ?? '{}') as Record<string, Partial<BlattZoom>>
    const erg: Record<string, BlattZoom> = {}
    for (const [k, v] of Object.entries(roh ?? {})) {
      if (!v || typeof v !== 'object') continue
      erg[k] = {
        einpassen: v.einpassen !== false,
        z: zoomBegrenzen(Number(v.z ?? 1), ZOOM_KLEINST, ZOOM_GROESST),
        doppelseite: v.doppelseite === true
      }
    }
    return erg
  } catch {
    return {}
  }
}
let zustaende: Record<string, BlattZoom> | null = null
const hoerer = new Set<() => void>()
const alle = (): Record<string, BlattZoom> => (zustaende ??= lesen())

function setzeZustand(programm: string, teil: Partial<BlattZoom>): void {
  const neu = { ...(alle()[programm] ?? STANDARD), ...teil }
  zustaende = { ...alle(), [programm]: neu }
  try {
    localStorage.setItem(SPEICHER, JSON.stringify(zustaende))
  } catch {
    // ohne lokalen Speicher gilt der Zoom nur für diese Sitzung
  }
  hoerer.forEach((h) => h())
}

/** Zoom des Programms, in dem die Komponente steht */
export function useProgrammZoom(): [BlattZoom, (teil: Partial<BlattZoom>) => void] {
  const programm = useContext(ZoomProgramm)
  const z = useSyncExternalStore(
    (h) => {
      hoerer.add(h)
      return () => hoerer.delete(h)
    },
    () => alle()[programm] ?? STANDARD,
    () => STANDARD
  )
  return [z, (teil) => setzeZustand(programm, teil)]
}

// ---------- Tastenkürzel (ein Horcher für alle Flächen)

interface TastenZiel {
  el: () => HTMLElement | null
  aktion: (a: Aktion) => void
}
const tastenZiele: TastenZiel[] = []
let tastenHorcher = false

function tasteGedrueckt(e: KeyboardEvent): void {
  if (e.defaultPrevented) return
  const a = zoomTaste(e)
  if (!a) return
  // Die zuletzt erschienene sichtbare Fläche (Dialog vor Programm)
  for (let i = tastenZiele.length - 1; i >= 0; i--) {
    const el = tastenZiele[i].el()
    if (!el || !el.isConnected || !el.checkVisibility()) continue
    e.preventDefault()
    tastenZiele[i].aktion(a)
    return
  }
}

// ---------- Hilfen

/** Nächster Vorfahr, der senkrecht rollt (ScrollArea-Fenster) */
function senkrechtRollend(el: HTMLElement | null): HTMLElement | null {
  for (let e = el?.parentElement ?? null; e; e = e.parentElement) {
    const oy = getComputedStyle(e).overflowY
    if ((oy === 'auto' || oy === 'scroll') && e.scrollHeight > e.clientHeight) return e
  }
  return null
}

/**
 * Hängt den Zwei-Finger-Zoom an `flaeche`. `inhalt` ist das Element mit CSS-`zoom`;
 * `basis` der Zoom ohne Zutun der Lehrkraft, `faktor` ihr eigener darauf.
 */
export function useZweiFingerZoom(opts: {
  aktiv: boolean
  flaeche: React.RefObject<HTMLElement | null>
  inhalt: React.RefObject<HTMLElement | null>
  basis: number
  faktor: number
  setFaktor: (f: number) => void
  min?: number
  max?: number
}): void {
  const aktuell = useRef(opts)
  aktuell.current = opts

  useEffect(() => {
    const el = opts.flaeche.current
    if (!opts.aktiv || !el) return
    let start: { abstand: number; faktor: number } | null = null
    let letzter = opts.faktor

    const mitte = (t: TouchList): Punkt => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 })
    const punkte = (t: TouchList): [Punkt, Punkt] => [
      { x: t[0].clientX, y: t[0].clientY },
      { x: t[1].clientX, y: t[1].clientY }
    ]

    /** Zoom setzen und den Punkt unter den Fingern festhalten */
    const anwenden = (faktor: number, m: Punkt): void => {
      const { inhalt, basis } = aktuell.current
      const innen = inhalt.current
      if (!innen) return
      const vorher = innen.getBoundingClientRect()
      const zAlt = basis * letzter
      const zNeu = basis * faktor
      const ix = (m.x - vorher.left) / zAlt
      const iy = (m.y - vorher.top) / zAlt
      innen.style.zoom = String(zNeu)
      letzter = faktor
      const nachher = innen.getBoundingClientRect()
      el.scrollLeft += nachher.left - (m.x - ix * zNeu)
      const senk = senkrechtRollend(el)
      if (senk) senk.scrollTop += nachher.top - (m.y - iy * zNeu)
    }

    const beginn = (e: TouchEvent): void => {
      if (e.touches.length !== 2) return
      const [a, b] = punkte(e.touches)
      letzter = aktuell.current.faktor
      start = { abstand: abstand(a, b), faktor: letzter }
      /*
       * Der erste Finger lag schon – für das Blatt sah das wie „langes Drücken zum Verschieben"
       * eines Bausteins aus (BausteinRahmen). Ein pointercancel beendet solche angefangenen
       * Gesten; der Zoom gehört jetzt beiden Fingern.
       */
      e.touches[0].target.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerType: 'touch', isPrimary: true }))
    }
    const bewegung = (e: TouchEvent): void => {
      if (!start || e.touches.length !== 2) return
      // Zwei Finger gehören dem Zoom – nicht dem Rollen und nicht dem Zoom der ganzen Seite
      e.preventDefault()
      const [a, b] = punkte(e.touches)
      const { min, max } = aktuell.current
      const f = pinchZoom(start.faktor, start.abstand, abstand(a, b), min, max)
      if (Math.abs(f - letzter) >= 0.01) anwenden(f, mitte(e.touches))
    }
    const ende = (e: TouchEvent): void => {
      if (!start || e.touches.length >= 2) return
      start = null
      aktuell.current.setFaktor(letzter)
    }
    /*
     * Bewegen und Loslassen am DOKUMENT: Touch-Ereignisse gehen immer an das Element, auf dem der
     * Finger aufsetzte. Baut das Blatt dieses Element währenddessen neu, erreichten sie die
     * Fläche nicht mehr – der Zoom blieb dann halb stehen.
     */
    el.addEventListener('touchstart', beginn, { passive: true })
    document.addEventListener('touchmove', bewegung, { passive: false })
    document.addEventListener('touchend', ende, { passive: true })
    document.addEventListener('touchcancel', ende, { passive: true })
    return () => {
      el.removeEventListener('touchstart', beginn)
      document.removeEventListener('touchmove', bewegung)
      document.removeEventListener('touchend', ende)
      document.removeEventListener('touchcancel', ende)
    }
  }, [opts.aktiv, opts.flaeche, opts.inhalt])
}

// ---------- Die Ansicht eines Blattes

export interface BlattAnsicht {
  /** Wirksamer Zoom (CSS-`zoom` des Inhalts) */
  zoom: number
  /** Ist der gezoomte Inhalt breiter als die Fläche? Dann rollt sie seitwärts. */
  breiter: boolean
  zustand: BlattZoom
  /** Zoom-Knöpfe für diese Fläche */
  knoepfe: React.JSX.Element
}

/**
 * Zoom einer Blattfläche: misst den Platz in `flaeche`, rechnet „Breite einpassen" aus, verbindet
 * Knöpfe, Strg + Mausrad, zwei Finger und Tastenkürzel. `inhalt` trägt das CSS-`zoom` (setzt der
 * Aufrufer) – über ihn bleibt beim Zoomen der Punkt unter dem Zeiger stehen.
 *
 * Für Flächen, die ihr Blatt selbst setzen (Rückmeldung, Tafelbild), ist das der Weg zur
 * einheitlichen Bedienung; FitToWidth baut darauf auf.
 */
export function useBlattAnsicht(opts: {
  flaeche: React.RefObject<HTMLElement | null>
  inhalt: React.RefObject<HTMLElement | null>
  /** Breite des Inhalts bei 100 % in Bildschirmpunkten */
  breitePx: number
  /** Breite bei zwei Seiten nebeneinander – nur wenn der Inhalt das kann */
  doppelBreitePx?: number
  /** Bei Doppelseite nur die Breite übernehmen (Deckblatt über den Seiten), selbst keinen Umschalter zeigen */
  doppelNurBreite?: boolean
  randPx?: number
  /** Kleinster Zoom beim Einpassen */
  minEinpassen?: number
  obergrenze?: number
  /** Eigener Zustand statt des Programm-Zooms (Druckvorschau) */
  lokal?: [BlattZoom, (teil: Partial<BlattZoom>) => void]
}): BlattAnsicht {
  const programmZoom = useProgrammZoom()
  const [zustand, setzen] = opts.lokal ?? programmZoom
  const [platz, setPlatz] = useState(0)
  const randPx = opts.randPx ?? 24
  const doppelt = Boolean(opts.doppelBreitePx) && zustand.doppelseite
  const breite = doppelt ? (opts.doppelBreitePx as number) : opts.breitePx
  const obergrenze = opts.obergrenze ?? EINPASSEN_MAX
  const minEinpassen = opts.minEinpassen ?? 0.5
  const passend = platz > 0 ? Math.max(minEinpassen, Math.min(obergrenze, Math.floor((platz / breite) * 100) / 100)) : 1
  const zoom = zustand.einpassen ? passend : zustand.z
  const breiter = platz > 0 && breite * zoom > platz + randPx

  // Platz messen
  useEffect(() => {
    const el = opts.flaeche.current
    if (!el) return
    let zuletzt = 0
    const messen = (): void => {
      const verfuegbar = el.clientWidth - randPx
      if (verfuegbar <= 0) return
      // Kleine Schwankungen (auftauchender Rollbalken) nicht beachten, sonst schaltet der Zoom im Kreis
      if (Math.abs(verfuegbar - zuletzt) < 8) return
      zuletzt = verfuegbar
      setPlatz(verfuegbar)
    }
    messen()
    const beobachter = new ResizeObserver(messen)
    beobachter.observe(el)
    return () => beobachter.disconnect()
  }, [opts.flaeche, randPx])

  // Zoomen um einen festen Punkt (Mauszeiger, Knopf): nach dem Zeichnen zurückrollen
  const anker = useRef<{ ix: number; iy: number; mx: number; my: number } | null>(null)
  const aktuell = useRef({ zoom, setzen })
  aktuell.current = { zoom, setzen }
  const zoomAuf = (neu: number, m?: Punkt): void => {
    const { zoom: alt, setzen: s } = aktuell.current
    const z = zoomBegrenzen(neu, ZOOM_KLEINST, ZOOM_GROESST)
    const innen = opts.inhalt.current
    if (m && innen && alt > 0) {
      const r = innen.getBoundingClientRect()
      anker.current = { ix: (m.x - r.left) / alt, iy: (m.y - r.top) / alt, mx: m.x, my: m.y }
    }
    s({ einpassen: false, z })
  }
  useLayoutEffect(() => {
    const a = anker.current
    const innen = opts.inhalt.current
    const el = opts.flaeche.current
    anker.current = null
    if (!a || !innen || !el) return
    const r = innen.getBoundingClientRect()
    el.scrollLeft += r.left + a.ix * zoom - a.mx
    const senk = senkrechtRollend(el)
    if (senk) senk.scrollTop += r.top + a.iy * zoom - a.my
  }, [zoom, opts.inhalt, opts.flaeche])

  // Strg/⌘ + Mausrad und Aufziehen auf dem Trackpad (kommt als Strg + Rad)
  useEffect(() => {
    const el = opts.flaeche.current
    if (!el) return
    let summe = 0
    let takt = 0
    let punkt: Punkt = { x: 0, y: 0 }
    const rad = (e: WheelEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      // Zeilen/Seiten in Punkte umrechnen; das Trackpad liefert kleine Schritte, das Mausrad große
      summe += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1)
      punkt = { x: e.clientX, y: e.clientY }
      if (takt) return
      takt = requestAnimationFrame(() => {
        takt = 0
        const faktor = Math.exp(-Math.max(-300, Math.min(300, summe)) * 0.0022)
        summe = 0
        zoomAuf(aktuell.current.zoom * faktor, punkt)
      })
    }
    el.addEventListener('wheel', rad, { passive: false })
    return () => {
      el.removeEventListener('wheel', rad)
      if (takt) cancelAnimationFrame(takt)
    }
    // zoomAuf liest alles über `aktuell` – die Verbindung bleibt stehen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.flaeche])

  // Tastenkürzel
  useEffect(() => {
    const ziel: TastenZiel = {
      el: () => opts.flaeche.current,
      aktion: (a) => {
        if (a === 'einpassen') aktuell.current.setzen({ einpassen: true })
        else zoomAuf(zoomSchritt(aktuell.current.zoom, a === 'plus' ? 1 : -1, ZOOM_KLEINST, ZOOM_GROESST))
      }
    }
    tastenZiele.push(ziel)
    if (!tastenHorcher) {
      tastenHorcher = true
      window.addEventListener('keydown', tasteGedrueckt)
    }
    return () => {
      const i = tastenZiele.indexOf(ziel)
      if (i >= 0) tastenZiele.splice(i, 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.flaeche])

  // Zwei Finger
  useZweiFingerZoom({
    aktiv: true,
    flaeche: opts.flaeche,
    inhalt: opts.inhalt,
    basis: 1,
    faktor: zoom,
    setFaktor: (f) => aktuell.current.setzen({ einpassen: false, z: f }),
    min: ZOOM_KLEINST,
    max: ZOOM_GROESST
  })

  // Doppelseite nur anbieten, wenn zwei Seiten noch lesbar nebeneinander passen (oder sie schon an ist)
  const doppelMoeglich = Boolean(opts.doppelBreitePx) && !opts.doppelNurBreite && (zustand.doppelseite || platz >= (opts.doppelBreitePx as number) * 0.6)

  const knoepfe = (
    <ZoomKnoepfe
      zoom={zoom}
      einpassen={zustand.einpassen}
      onSchritt={(r) => zoomAuf(zoomSchritt(zoom, r, ZOOM_KLEINST, ZOOM_GROESST))}
      onEinpassen={() => setzen({ einpassen: true })}
      doppelseite={doppelMoeglich ? { an: zustand.doppelseite, umschalten: () => setzen({ doppelseite: !zustand.doppelseite }) } : undefined}
    />
  )
  return { zoom, breiter, zustand, knoepfe }
}

/**
 * „–", Prozent (zurück auf „Breite einpassen"), „+", „Breite einpassen" und – wo es geht –
 * „Doppelseite". Die Knöpfe sind der Weg mit einem Finger (WCAG 2.5.1) und der mit der Maus.
 */
export function ZoomKnoepfe({
  zoom,
  einpassen,
  onSchritt,
  onEinpassen,
  doppelseite,
  min = ZOOM_KLEINST,
  max = ZOOM_GROESST
}: {
  zoom: number
  einpassen: boolean
  onSchritt: (richtung: 1 | -1) => void
  onEinpassen: () => void
  doppelseite?: { an: boolean; umschalten: () => void }
  min?: number
  max?: number
}): React.JSX.Element {
  return (
    <div className="zoom-knoepfe" data-zoom-knoepfe role="group" aria-label="Zoom">
      <Tooltip label="Verkleinern (Strg + Minus)" withArrow>
        <ActionIcon variant="subtle" radius="xl" aria-label="Verkleinern" disabled={zoom <= min} onClick={() => onSchritt(-1)}>
          <IconZoomOut size={20} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Zurück auf Breite einpassen" withArrow>
        <Button variant="subtle" radius="xl" size="xs" className="zoom-wert" aria-label="Zoom zurücksetzen" onClick={onEinpassen} data-zoom-wert>
          {Math.round(zoom * 100)} %
        </Button>
      </Tooltip>
      <Tooltip label="Vergrößern (Strg + Plus, Strg + Mausrad)" withArrow>
        <ActionIcon variant="subtle" radius="xl" aria-label="Vergrößern" disabled={zoom >= max} onClick={() => onSchritt(1)}>
          <IconZoomIn size={20} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Breite einpassen (Strg + Umschalt + 0)" withArrow>
        <ActionIcon
          variant={einpassen ? 'light' : 'subtle'}
          radius="xl"
          aria-label="Breite einpassen"
          aria-pressed={einpassen}
          onClick={onEinpassen}
          data-zoom-einpassen
        >
          <IconArrowsHorizontal size={20} />
        </ActionIcon>
      </Tooltip>
      {doppelseite && (
        <Tooltip label={doppelseite.an ? 'Eine Seite je Zeile' : 'Zwei Seiten nebeneinander'} withArrow>
          <ActionIcon
            variant={doppelseite.an ? 'light' : 'subtle'}
            radius="xl"
            aria-label="Doppelseite"
            aria-pressed={doppelseite.an}
            onClick={doppelseite.umschalten}
            data-zoom-doppelseite
          >
            <IconBook2 size={20} />
          </ActionIcon>
        </Tooltip>
      )}
    </div>
  )
}

/**
 * Eine Fläche mit Zoom (Knöpfe, Strg + Mausrad, zwei Finger) für Vorschauen, die sich selbst
 * einpassen (Druckvorschau): „Einpassen" = 100 %, so wie der Inhalt sich setzt. Der Zoom gilt nur hier.
 */
export function ZoomFlaeche({ children, className }: { children: React.ReactNode; className?: string }): React.JSX.Element {
  const flaeche = useRef<HTMLDivElement>(null)
  const inhalt = useRef<HTMLDivElement>(null)
  const [lokal, setLokal] = useState<BlattZoom>(STANDARD)
  const { zoom, knoepfe } = useBlattAnsicht({
    flaeche,
    inhalt,
    breitePx: 1,
    minEinpassen: 1,
    obergrenze: 1,
    lokal: [lokal, (teil) => setLokal((z) => ({ ...z, ...teil }))]
  })
  return (
    <>
      <div
        ref={flaeche}
        className={`zoom-flaeche ${className ?? ''}`}
        data-gezoomt={zoom > 1 || undefined}
        style={{ overflowX: zoom > 1 ? 'auto' : undefined, touchAction: 'pan-x pan-y' }}
      >
        <div ref={inhalt} style={zoom !== 1 ? { zoom } : undefined}>
          {children}
        </div>
      </div>
      {knoepfe}
    </>
  )
}
