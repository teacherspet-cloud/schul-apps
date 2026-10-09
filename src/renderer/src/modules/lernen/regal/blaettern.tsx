/**
 * Blättern im Fachordner (09.10.2026, Wunsch der Lehrkraft): Was im Ordner geöffnet wird (Grammatikform → Training →
 * Spiel, Übungsrunde, Arbeitsblatt …), erscheint als nächste Seite IM Ordner – die rechte Seite schlägt nach links um
 * (rund eine halbe Sekunde, 3D). „Zurück" blättert zurück: die vorige Seite kommt von links zurück auf das Blatt.
 *
 *  - Jede Ebene ist ein Eintrag im Verlauf des Browsers (pushState mit `ordnerTiefe`), „Zurück" des Browsers bzw. die
 *    Zurück-Geste blättert ebenso zurück, „Vorwärts" wieder vor.
 *  - Wischen auf dem Tablet: von links nach rechts = zurück, von rechts nach links = wieder vor (wie im Buch).
 *    Nicht in laufenden Übungen, Spielen und Arbeitsblättern – dort gehören die Gesten der Aufgabe.
 *  - „Ruhige Darstellung" bzw. reduzierte Bewegung: ohne Animation (ruhig() aus ordnerAnimation.ts).
 *
 * Bausteine im Ordner melden ihre Unterseiten über `useBlaettern()` an (außerhalb des Ordners null → wie bisher).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ruhig } from './ordnerAnimation'

export interface Blaettern {
  /**
   * Eine Seite weiter: `auf` zeigt die Unterseite, `zu` nimmt sie wieder weg (Zurück, Wischen, Zurück des Browsers).
   * `adresse` (optional, etwa „?r=gram&g=…") steht dann in der Adresszeile.
   */
  oeffne: (name: string, auf: () => void, zu: () => void, adresse?: string, ohneAnimation?: boolean) => void
  /** Eine Seite zurück; ist gar keine Unterseite offen, `ersatz` */
  zurueck: (ersatz?: () => void) => void
  /** Wie viele Seiten gerade über der Registerseite liegen */
  tiefe: number
}

interface Ebene {
  name: string
  auf: () => void
  zu: () => void
  adresse?: string
  lebt: () => boolean
}

interface Intern extends Blaettern {
  oeffneMit: (name: string, auf: () => void, zu: () => void, adresse: string | undefined, lebt: () => boolean, ohneAnimation?: boolean) => void
}

const Kontext = createContext<Intern | null>(null)

/** Für Bausteine im Ordner: Unterseiten anmelden. Außerhalb des Ordners null. */
export function useBlaettern(): Blaettern | null {
  const k = useContext(Kontext)
  const lebt = useRef(true)
  useEffect(() => {
    lebt.current = true
    return () => {
      lebt.current = false
    }
  }, [])
  return useMemo(
    () =>
      k && {
        tiefe: k.tiefe,
        zurueck: k.zurueck,
        oeffne: (name: string, auf: () => void, zu: () => void, adresse?: string, ohneAnimation?: boolean) =>
          k.oeffneMit(name, auf, zu, adresse, () => lebt.current, ohneAnimation)
      },
    [k]
  )
}

/**
 * Für den Ordner selbst: Seine Unterseiten (Training, Arbeitsblatt) gehören ihm, nicht der Liste, aus der sie
 * geöffnet wurden – sie bleiben für „Vorwärts" wiederherstellbar, auch wenn die Liste inzwischen neu gezeichnet wurde.
 */
export function useOrdnerBlaettern(): Blaettern | null {
  return useContext(Kontext)
}

const CSS = `
.og-umblatt { position: absolute; pointer-events: none; transform-style: preserve-3d; transform-origin: 0 50%; }
.og-umblatt *, .og-umblatt *::before, .og-umblatt *::after { animation: none !important; transition: none !important; }
.og-umblatt > .og-papier, .og-umblatt > .og-rueckseite { position: absolute; inset: 0; margin: 0; overflow: hidden; backface-visibility: hidden;
  -webkit-backface-visibility: hidden; border-radius: 0 6px 6px 0; }
.og-rueckseite { transform: rotateY(180deg); background: var(--og-papier);
  background-image: linear-gradient(90deg, rgba(0,0,0,.10), transparent 30%), repeating-linear-gradient(180deg, transparent 0 31px, var(--og-linie) 31px 32px); }
.og-umblatt-schatten { position: absolute; inset: 0; pointer-events: none; border-radius: 0 6px 6px 0;
  background: linear-gradient(270deg, rgba(0,0,0,.28), rgba(0,0,0,0) 55%); opacity: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
`

/** Kopie der Seite für die Animation: nur zum Ansehen – ohne Kennungen, Daten-Attribute und Bedienbarkeit */
function abbild(papier: HTMLElement): HTMLElement {
  const k = papier.cloneNode(true) as HTMLElement
  const alle = [k, ...Array.from(k.querySelectorAll<HTMLElement>('*'))]
  for (const el of alle) {
    for (const a of Array.from(el.attributes)) if (a.name.startsWith('data-') || a.name === 'id' || a.name === 'name' || a.name === 'for') el.removeAttribute(a.name)
    if (el.tagName === 'IFRAME' || el.tagName === 'VIDEO' || el.tagName === 'AUDIO') el.remove()
  }
  k.setAttribute('aria-hidden', 'true')
  k.setAttribute('inert', '')
  k.style.animation = 'none'
  return k
}

const DAUER = 520

/**
 * Blättern-Stapel des Ordners. `papier` = die Seite (.og-papier), `buehne` = der Ordner (position: relative).
 * `tiefeAnfang` aus dem Verlauf: Beim Neuladen auf einer Unterseite fängt der Stapel wieder unten an.
 */
export function BlaetternRahmen({
  papier,
  buehne,
  children
}: {
  papier: React.RefObject<HTMLDivElement | null>
  buehne: React.RefObject<HTMLDivElement | null>
  children: (b: { tiefe: number; zurueck: () => void; alleZu: (danach: () => void) => void; wischen: React.HTMLAttributes<HTMLDivElement> }) => React.ReactNode
}): React.JSX.Element {
  const stapel = useRef<Ebene[]>([])
  const vorwaerts = useRef<Ebene[]>([])
  const [tiefe, setTiefe] = useState(0)
  const laeuft = useRef<(() => void) | null>(null)
  /** Registerwechsel mit offenen Seiten: erst im Verlauf zurück, dann das hier */
  const nachZuklappen = useRef<(() => void) | null>(null)

  /** Laufende Animation sofort beenden (schnelles Doppeltippen) */
  const fertig = (): void => {
    laeuft.current?.()
    laeuft.current = null
  }

  /** Vor dem Wechsel: Lage und Abbild der jetzigen Seite */
  const vorher = useCallback((): { bild: HTMLElement; x: number; y: number; b: number; h: number } | null => {
    fertig()
    const p = papier.current
    if (!p || !buehne.current || ruhig()) return null
    return { bild: abbild(p), x: p.offsetLeft, y: p.offsetTop, b: p.offsetWidth, h: p.offsetHeight }
  }, [papier, buehne])

  /** Seite oben im Bild halten: Wer weit unten tippt, sieht die neue Seite von ihrem Anfang */
  const nachOben = (): void => {
    const o = buehne.current
    if (!o) return
    const r = o.getBoundingClientRect()
    if (r.top < 0) window.scrollTo({ top: window.scrollY + r.top - 12 })
  }

  /** Vorwärts: die alte Seite (Abbild) schlägt nach links um, darunter liegt schon die neue */
  const umschlagen = useCallback(
    (v: ReturnType<typeof vorher>) => {
      const o = buehne.current
      if (!v || !o) return
      const blatt = document.createElement('div')
      blatt.className = 'og-umblatt'
      blatt.setAttribute('data-ordner-umblaettern', 'vor')
      Object.assign(blatt.style, { left: `${v.x}px`, top: `${v.y}px`, width: `${v.b}px`, height: `${v.h}px`, zIndex: '4' })
      const rueck = document.createElement('div')
      rueck.className = 'og-rueckseite'
      const schatten = document.createElement('div')
      schatten.className = 'og-umblatt-schatten'
      blatt.append(v.bild, rueck, schatten)
      o.appendChild(blatt)
      const a = blatt.animate(
        [
          { transform: 'perspective(1800px) rotateY(0deg)', opacity: 1 },
          { transform: 'perspective(1800px) rotateY(-90deg)', opacity: 1, offset: 0.5 },
          { transform: 'perspective(1800px) rotateY(-165deg)', opacity: 0.85, offset: 0.85 },
          { transform: 'perspective(1800px) rotateY(-180deg)', opacity: 0 }
        ],
        { duration: DAUER, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' }
      )
      schatten.animate([{ opacity: 0 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], { duration: DAUER, fill: 'forwards' })
      // Safari/WebKit zeigt die Vorderseite trotz backface-visibility gespiegelt – ab der Hälfte ausdrücklich tauschen
      const wechsel = (sichtbarVorn: boolean): Keyframe[] => [
        { opacity: sichtbarVorn ? 1 : 0 },
        { opacity: sichtbarVorn ? 1 : 0, offset: 0.49 },
        { opacity: sichtbarVorn ? 0 : 1, offset: 0.5 },
        { opacity: sichtbarVorn ? 0 : 1 }
      ]
      v.bild.animate(wechsel(true), { duration: DAUER, fill: 'forwards' })
      rueck.animate(wechsel(false), { duration: DAUER, fill: 'forwards' })
      const weg = (): void => blatt.remove()
      a.onfinish = weg
      a.oncancel = weg
      laeuft.current = () => a.finish()
    },
    [buehne]
  )

  /** Zurück: die vorige Seite kommt von links zurück und legt sich über die jetzige (Abbild darunter) */
  const zurueckSchlagen = useCallback(
    (v: ReturnType<typeof vorher>) => {
      const o = buehne.current
      const p = papier.current
      if (!v || !o || !p) return
      const unten = document.createElement('div')
      unten.className = 'og-umblatt'
      unten.setAttribute('data-ordner-umblaettern', 'zurueck')
      Object.assign(unten.style, { left: `${v.x}px`, top: `${v.y}px`, width: `${v.b}px`, height: `${v.h}px`, zIndex: '0' })
      unten.append(v.bild)
      o.appendChild(unten)
      const alt = { z: p.style.zIndex, bf: p.style.backfaceVisibility, wbf: p.style.getPropertyValue('-webkit-backface-visibility'), to: p.style.transformOrigin }
      Object.assign(p.style, { zIndex: '1', backfaceVisibility: 'hidden', transformOrigin: '0 50%' })
      p.style.setProperty('-webkit-backface-visibility', 'hidden')
      const a = p.animate(
        [
          // Unsichtbar, solange die Rückseite zu sehen wäre (WebKit spiegelt sonst den Inhalt)
          { transform: 'perspective(1800px) rotateY(-180deg)', filter: 'brightness(.85)', opacity: 0 },
          { transform: 'perspective(1800px) rotateY(-91deg)', filter: 'brightness(.85)', opacity: 0, offset: 0.49 },
          { transform: 'perspective(1800px) rotateY(-90deg)', filter: 'brightness(.85)', opacity: 1, offset: 0.5 },
          { transform: 'perspective(1800px) rotateY(0deg)', filter: 'brightness(1)', opacity: 1 }
        ],
        { duration: DAUER, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'backwards' }
      )
      const weg = (): void => {
        unten.remove()
        Object.assign(p.style, { zIndex: alt.z, backfaceVisibility: alt.bf, transformOrigin: alt.to })
        p.style.setProperty('-webkit-backface-visibility', alt.wbf)
      }
      a.onfinish = weg
      a.oncancel = weg
      laeuft.current = () => a.finish()
    },
    [buehne, papier]
  )

  const oeffneMit = useCallback(
    (name: string, auf: () => void, zu: () => void, adresse: string | undefined, lebt: () => boolean, ohneAnimation = false) => {
      const v = ohneAnimation ? null : vorher()
      const e: Ebene = { name, auf, zu, adresse, lebt }
      stapel.current.push(e)
      vorwaerts.current = []
      const t = stapel.current.length
      window.history.pushState({ ...(window.history.state ?? {}), ordnerTiefe: t, ordnerEbene: name }, '', adresse ?? window.location.href)
      umschlagen(v)
      auf()
      setTiefe(t)
      if (v) nachOben()
    },
    [vorher, umschlagen]
  )

  const zurueck = useCallback((ersatz?: () => void) => {
    if (!stapel.current.length) return ersatz?.()
    window.history.back()
  }, [])

  const alleZu = (danach: () => void): void => {
    fertig()
    if (!stapel.current.length) return danach()
    nachZuklappen.current = danach
    window.history.go(-stapel.current.length)
  }

  // Verlauf des Browsers: Zurück blättert zurück, Vorwärts wieder vor
  useEffect(() => {
    const geh = (ev: PopStateEvent): void => {
      const ziel = Number((ev.state as { ordnerTiefe?: number } | null)?.ordnerTiefe ?? 0)
      const ist = stapel.current.length
      const danach = nachZuklappen.current
      nachZuklappen.current = null
      if (danach) {
        // Registerwechsel: ohne Umblättern alles schließen (die Lasche blättert selbst um)
        while (stapel.current.length) stapel.current.pop()!.zu()
        vorwaerts.current = []
        setTiefe(0)
        danach()
      } else if (ziel < ist) {
        const v = vorher()
        zurueckSchlagen(v)
        while (stapel.current.length > ziel) {
          const e = stapel.current.pop()!
          vorwaerts.current.push(e)
          e.zu()
        }
        setTiefe(stapel.current.length)
      } else if (ziel > ist) {
        const e = vorwaerts.current.pop()
        if (e && ziel === ist + 1 && e.lebt()) {
          const v = vorher()
          stapel.current.push(e)
          umschlagen(v)
          e.auf()
          setTiefe(stapel.current.length)
        } else {
          // Nicht wiederherstellbar (etwa nach dem Neuladen): auf der jetzigen Seite bleiben
          vorwaerts.current = []
          window.history.go(ist - ziel)
        }
      }
    }
    window.addEventListener('popstate', geh)
    return () => window.removeEventListener('popstate', geh)
  }, [vorher, umschlagen, zurueckSchlagen])

  // Beim Verlassen des Ordners keine Animation hängen lassen
  useEffect(() => () => laeuft.current?.(), [])

  // Wischen (Tablet, Telefon): nur mit dem Finger, deutlich waagerecht, nicht in Übungen/Spielen/Blättern
  const start = useRef<{ x: number; y: number; t: number } | null>(null)
  const wischen: React.HTMLAttributes<HTMLDivElement> = {
    onTouchStart: (e) => {
      const ziel = e.target as HTMLElement
      start.current =
        e.touches.length === 1 &&
        !ziel.closest(
          'input, textarea, select, canvas, iframe, [contenteditable="true"], [draggable="true"], [data-sitzung], [data-spiel], [data-spiel-laeuft], [data-verbspiel], [data-blatt-ausfuellen], [data-kein-wischen]'
        )
          ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }
          : null
    },
    onTouchEnd: (e) => {
      const s = start.current
      start.current = null
      const t = e.changedTouches[0]
      if (!s || !t || Date.now() - s.t > 800) return
      const dx = t.clientX - s.x
      const dy = t.clientY - s.y
      if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) / 2) return
      if (dx > 0 && stapel.current.length) window.history.back()
      else if (dx < 0 && vorwaerts.current.length) window.history.forward()
    }
  }

  const wert = useMemo<Intern>(
    () => ({
      tiefe,
      zurueck,
      oeffne: (name, auf, zu, adresse, ohneAnimation) => oeffneMit(name, auf, zu, adresse, () => true, ohneAnimation),
      oeffneMit
    }),
    [tiefe, zurueck, oeffneMit]
  )
  return (
    <Kontext.Provider value={wert}>
      <style>{CSS}</style>
      {children({ tiefe, zurueck: () => zurueck(), alleZu, wischen })}
    </Kontext.Provider>
  )
}
