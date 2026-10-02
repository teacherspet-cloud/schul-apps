/**
 * Zellen markieren und Tabellen angleichen (02.10.2026).
 *
 * Wunsch der Lehrkraft: „Wenn man Spalten / Zeilen / Zellen markiert und einen Rechtsklick macht,
 * soll man über ein Radialmenü die Tabellenformatierung anpassen können, z. B. ‚Spaltenbreite
 * angleichen' oder ‚Zeilenhöhe angleichen'. Dabei sollen immer nur die markierten Zellen /
 * Zeilen / Spalten angeglichen werden."
 *
 * - Markieren: In einer Zelle drücken und über andere Zellen ziehen (Maus, Stift) – die Zellen im
 *   Rechteck leuchten auf. Umschalt + Klick erweitert die Markierung bis zur geklickten Zelle.
 *   Ein Klick daneben hebt sie auf.
 * - iPad (Finger): langer Druck auf eine Zelle setzt den Anfang, Tippen auf eine zweite Zelle
 *   markiert das Rechteck dazwischen (Wischen bleibt Blättern).
 * - Rechtsklick in die Markierung (iPad: langer Druck) → Kreismenü. Ein Eintrag wirkt sofort.
 * - Spaltenbreite angleichen: Die markierten Spalten teilen sich ihre bisherige Gesamtbreite zu
 *   gleichen Teilen; die übrigen Spalten bleiben, wie sie sind.
 * - Zeilenhöhe angleichen: Die markierten Zeilen werden so hoch wie die höchste von ihnen (so
 *   passt der Inhalt jeder Zeile weiter hinein); die übrigen bleiben.
 * - Jede Änderung ist EIN Rückgängig-Schritt – sie läuft über denselben Speicherweg wie das
 *   Ziehen an den Linien (tabelleMasse.ts, tabelleZiehen.ts).
 *
 * Woher eine Zelle ihren Platz kennt: Die Griffe jeder Zelle (TabellenGriffe in Answers.tsx, die
 * Tabelle als Baustein in baustein/tabelle.tsx) melden die Zelle hier an – mit Spalte, Zeile,
 * Spaltenzahl, aktuellen Breiten und der Funktion, die die Maße speichert. Tabellen ohne Griffe
 * (Lese-Ansicht, Druck) kennen das Menü nicht.
 */
import { Portal } from '@mantine/core'
import { IconArrowsHorizontal, IconArrowsVertical, IconLayoutGrid, IconRestore, IconX } from '@tabler/icons-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { kreisLage, kreisRadius } from '../../../shared/components/Kreismenue'
import '../../../shared/components/kreismenue.css'
import { touchAktiv } from '../../../shared/touch/touchModus'
import { MIN_SPALTE_PROZENT, zeilenHoehe } from './tabelleMasse'

/** Zeile einer Tabelle: Index im Baustein oder die Kopfzeile */
export type ZeilenIndex = number | 'kopf'

/** Was die Auswahl speichern lässt: ganze Spaltenbreiten (Prozent, Summe 100) und/oder Zeilenhöhen in mm (0 = automatisch) */
export interface Angleichung {
  colWidths?: number[]
  zeilen?: { index: ZeilenIndex; mm: number }[]
}

export interface ZellInfo {
  c: number
  /** undefined = diese Tabelle hat keine Zeilenmaße */
  zeile?: ZeilenIndex
  spalten: number
  /** aktuelle Spaltenbreiten in Prozent; fehlt = am Bildschirm messen */
  breiten?: number[]
  anwenden: (a: Angleichung) => void
}

const zellen = new WeakMap<Element, ZellInfo>()

/**
 * Eine Zelle anmelden – als ref-Funktion an einem Element IN der Zelle. Hält die Angaben aktuell
 * (jede Darstellung setzt sie neu), abmelden ist unnötig: Die WeakMap vergisst entfernte Zellen.
 */
export function zelleAnmelden(info: ZellInfo): (el: HTMLElement | null) => void {
  return (el) => {
    const zelle = el?.closest('td, th')
    if (zelle) zellen.set(zelle, info)
  }
}

// ---------------------------------------------------------------- Auswahl

interface Auswahl {
  table: HTMLTableElement
  /** Zellen der Auswahl (im Rechteck) */
  zellen: HTMLTableCellElement[]
}

interface Menue {
  x: number
  y: number
  auswahl: Auswahl
}

const useMenue = create<{ offen: Menue | null }>(() => ({ offen: null }))

let anker: HTMLTableCellElement | null = null
let aktuell: Auswahl | null = null
/** iPad: nach langem Druck wartet der Anfang auf die zweite Zelle */
let touchAnker: HTMLTableCellElement | null = null

const KLASSE = 'ws-zelle-markiert'
const ANKER_KLASSE = 'ws-zelle-anker'

function setzeTouchAnker(z: HTMLTableCellElement | null): void {
  touchAnker?.classList.remove(ANKER_KLASSE)
  touchAnker = z
  z?.classList.add(ANKER_KLASSE)
}

function zelleVon(ziel: EventTarget | null): HTMLTableCellElement | null {
  const el = ziel instanceof Element ? ziel.closest('td, th') : null
  return el && zellen.has(el) ? (el as HTMLTableCellElement) : null
}

/** Zeile der Zelle in der Tabelle (DOM) – für das Rechteck */
const domZeile = (z: HTMLTableCellElement): number => (z.parentElement as HTMLTableRowElement).rowIndex

/** Alle angemeldeten Zellen der Tabelle im Rechteck zwischen a und b (Spalten nach Anmeldung, Zeilen nach DOM) */
function rechteck(a: HTMLTableCellElement, b: HTMLTableCellElement): Auswahl | null {
  const table = a.closest('table')
  if (!table || b.closest('table') !== table) return null
  const ia = zellen.get(a)!
  const ib = zellen.get(b)!
  const [c1, c2] = [Math.min(ia.c, ib.c), Math.max(ia.c, ib.c)]
  const [r1, r2] = [Math.min(domZeile(a), domZeile(b)), Math.max(domZeile(a), domZeile(b))]
  const drin: HTMLTableCellElement[] = []
  for (const z of table.querySelectorAll<HTMLTableCellElement>('td, th')) {
    if (z.closest('table') !== table) continue
    const i = zellen.get(z)
    if (!i) continue
    const r = domZeile(z)
    if (r >= r1 && r <= r2 && i.c >= c1 && i.c <= c2) drin.push(z)
  }
  return { table, zellen: drin }
}

function zeige(neu: Auswahl | null): void {
  aktuell?.zellen.forEach((z) => z.classList.remove(KLASSE))
  aktuell = neu && neu.zellen.length > 1 ? neu : null
  aktuell?.zellen.forEach((z) => z.classList.add(KLASSE))
}

export function auswahlAufheben(): void {
  zeige(null)
  anker = null
  setzeTouchAnker(null)
}

/** Spalten und Zeilen der Auswahl */
export function auswahlUmfang(zs: HTMLTableCellElement[]): { spalten: number[]; zeilen: ZeilenIndex[] } {
  const spalten = new Set<number>()
  const zeilen = new Map<string, ZeilenIndex>()
  for (const z of zs) {
    const i = zellen.get(z)
    if (!i) continue
    spalten.add(i.c)
    if (i.zeile !== undefined) zeilen.set(String(i.zeile), i.zeile)
  }
  return { spalten: [...spalten].sort((a, b) => a - b), zeilen: [...zeilen.values()] }
}

// ---------------------------------------------------------------- Rechnen (rein, getestet)

/**
 * Die markierten Spalten teilen sich ihre bisherige Gesamtbreite zu gleichen Teilen; die übrigen
 * bleiben unverändert. Ergebnis wieder mit Summe 100, auf eine Nachkommastelle.
 */
export function spaltenAngleichen(breiten: number[], markiert: number[]): number[] {
  const m = markiert.filter((c) => c >= 0 && c < breiten.length)
  if (m.length < 2) return breiten
  const summe = m.reduce((s, c) => s + breiten[c], 0)
  const je = Math.max(MIN_SPALTE_PROZENT, summe / m.length)
  const out = breiten.map((w, c) => (m.includes(c) ? je : w))
  const gesamt = out.reduce((a, b) => a + b, 0) || 1
  const gerundet = out.map((w) => Math.round((w / gesamt) * 1000) / 10)
  // Rundungsrest auf die letzte NICHT markierte Spalte (sonst die letzte), damit die markierten wirklich gleich sind
  const rest = Math.round((100 - gerundet.reduce((a, b) => a + b, 0)) * 10) / 10
  if (rest) {
    const frei = [...gerundet.keys()].reverse().find((c) => !m.includes(c)) ?? gerundet.length - 1
    gerundet[frei] = Math.round((gerundet[frei] + rest) * 10) / 10
  }
  return gerundet
}

/** Zeilenhöhen angleichen: alle markierten auf die höchste (mm, auf 0,5 gerundet, aufgerundet) */
export function zeilenAngleichen(hoehenMm: { index: ZeilenIndex; mm: number }[]): { index: ZeilenIndex; mm: number }[] {
  if (hoehenMm.length < 2) return []
  const max = Math.ceil(Math.max(...hoehenMm.map((h) => h.mm)) * 2) / 2
  const mm = zeilenHoehe(max) || max
  return hoehenMm.map((h) => ({ index: h.index, mm }))
}

// ---------------------------------------------------------------- Messen am Bildschirm

/** Millimeter je Bildschirmpunkt – stimmt auch in der verkleinerten Vorschau (CSS-Pixel 96 dpi) */
const mmProPunkt = (el: HTMLElement): number => (25.4 / 96) * (el.offsetWidth / Math.max(1, el.getBoundingClientRect().width))

function gemesseneBreiten(table: HTMLTableElement, n: number): number[] {
  const cols = [...table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col')]
  const quelle = cols.length === n ? cols : [...(table.rows[0]?.cells ?? [])]
  const b = quelle.map((z) => z.getBoundingClientRect().width)
  const gesamt = b.reduce((s, w) => s + w, 0) || 1
  return b.length === n ? b.map((w) => (w / gesamt) * 100) : Array.from({ length: n }, () => 100 / n)
}

/** Die Angleichung für die Auswahl berechnen und EINMAL speichern */
export function angleichen(a: Auswahl, art: 'spalten' | 'zeilen' | 'beides' | 'automatisch'): void {
  const info = zellen.get(a.zellen[0])
  if (!info) return
  const { spalten, zeilen } = auswahlUmfang(a.zellen)
  const aenderung: Angleichung = {}
  if (art === 'spalten' || art === 'beides') {
    const start = info.breiten?.length === info.spalten ? info.breiten : gemesseneBreiten(a.table, info.spalten)
    aenderung.colWidths = spaltenAngleichen(start, spalten)
  }
  if (art === 'zeilen' || art === 'beides') {
    const mm = mmProPunkt(a.table)
    const hoehen = zeilen.map((index) => {
      const zelle = a.zellen.find((z) => zellen.get(z)?.zeile === index)
      const tr = zelle?.parentElement
      return { index, mm: tr ? tr.getBoundingClientRect().height * mm : 0 }
    })
    aenderung.zeilen = zeilenAngleichen(hoehen)
  }
  if (art === 'automatisch') aenderung.zeilen = zeilen.map((index) => ({ index, mm: 0 }))
  if (!aenderung.colWidths && !aenderung.zeilen?.length) return
  info.anwenden(aenderung)
}

// ---------------------------------------------------------------- Ereignisse (einmal je Fenster)

let installiert = false

/** Einmal beim Start der Oberfläche (main.tsx) */
export function installiereTabellenAuswahl(): void {
  if (installiert || typeof window === 'undefined') return
  installiert = true
  let ziehen = false
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (useMenue.getState().offen) return
      const z = zelleVon(e.target)
      // Griffe an den Linien: deren Ziehen geht vor
      const griff = e.target instanceof Element && e.target.closest('.ws-spalten-griff, .ws-zeilen-griff')
      if (e.button !== 0 || griff) return
      if (!z) {
        auswahlAufheben()
        return
      }
      if (e.pointerType === 'touch') {
        // iPad: zweite Zelle nach langem Druck auf die erste → Rechteck markieren
        if (touchAnker && touchAnker !== z && touchAnker.closest('table') === z.closest('table')) {
          zeige(rechteck(touchAnker, z))
          anker = touchAnker
          setzeTouchAnker(null)
        } else if (!aktuell?.zellen.includes(z)) {
          zeige(null)
          setzeTouchAnker(null)
        }
        return
      }
      if (e.shiftKey && anker && anker.closest('table') === z.closest('table')) {
        zeige(rechteck(anker, z))
        e.preventDefault()
        window.getSelection()?.removeAllRanges()
        return
      }
      zeige(null)
      anker = z
      ziehen = true
    },
    true
  )
  window.addEventListener(
    'pointermove',
    (e) => {
      if (!ziehen || !anker || !(e.buttons & 1)) return
      const z = zelleVon(document.elementFromPoint(e.clientX, e.clientY))
      if (!z || z === anker) return
      const neu = rechteck(anker, z)
      if (!neu) return
      zeige(neu)
      // Über mehrere Zellen gezogen: keine Textmarkierung dazu
      window.getSelection()?.removeAllRanges()
    },
    true
  )
  window.addEventListener('pointerup', () => (ziehen = false), true)
  /*
   * Rechtsklick – bzw. auf dem iPad der lange Druck, den shared/touch/gesten.ts als `contextmenu`
   * meldet: in der Markierung öffnet er das Kreismenü; im Touch-Modus außerhalb einer Markierung
   * setzt er den Anfang (es sei denn, Text ist markiert – dann gilt das Textauswahl-Menü).
   */
  window.addEventListener(
    'contextmenu',
    (e) => {
      const z = zelleVon(e.target)
      if (!z || e.shiftKey) return
      if (aktuell?.zellen.includes(z)) {
        e.preventDefault()
        e.stopPropagation()
        window.getSelection()?.removeAllRanges()
        useMenue.setState({ offen: { x: e.clientX, y: e.clientY, auswahl: aktuell } })
        return
      }
      const textMarkiert = !(window.getSelection()?.isCollapsed ?? true)
      if (touchAktiv() && !textMarkiert) {
        e.preventDefault()
        e.stopPropagation()
        zeige(null)
        setzeTouchAnker(z)
      }
    },
    true
  )
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && aktuell && !useMenue.getState().offen) auswahlAufheben()
  })
}

// ---------------------------------------------------------------- Kreismenü

const EINTRAG_BREITE = 170

interface Eintrag {
  id: 'spalten' | 'zeilen' | 'beides' | 'automatisch'
  label: string
  icon: React.ReactNode
}

export function eintraegeFuer(spalten: number, zeilen: number, mitZeilenMassen: boolean): Eintrag[] {
  const e: Eintrag[] = []
  if (spalten >= 2) e.push({ id: 'spalten', label: 'Spaltenbreite angleichen', icon: <IconArrowsHorizontal size={15} /> })
  if (zeilen >= 2) e.push({ id: 'zeilen', label: 'Zeilenhöhe angleichen', icon: <IconArrowsVertical size={15} /> })
  if (spalten >= 2 && zeilen >= 2) e.push({ id: 'beides', label: 'Breite und Höhe angleichen', icon: <IconLayoutGrid size={15} /> })
  if (zeilen >= 1 && mitZeilenMassen) e.push({ id: 'automatisch', label: 'Zeilenhöhe nach Inhalt', icon: <IconRestore size={15} /> })
  return e
}

/** Das Menü – einmal in der Oberfläche eingehängt (main.tsx) */
export function TabellenKreismenue(): React.JSX.Element | null {
  const offen = useMenue((s) => s.offen)
  if (!offen) return null
  return <Kreis menue={offen} onSchliessen={() => useMenue.setState({ offen: null })} />
}

function Kreis({ menue, onSchliessen }: { menue: Menue; onSchliessen: () => void }): React.JSX.Element {
  const { spalten, zeilen } = auswahlUmfang(menue.auswahl.zellen)
  const mitZeilen = zellen.get(menue.auswahl.zellen[0])?.zeile !== undefined
  const eintraege = eintraegeFuer(spalten.length, mitZeilen ? zeilen.length : 0, mitZeilen)
  const n = Math.max(eintraege.length, 3)
  const radius = Math.min(kreisRadius(n), 120)
  const rand = radius + EINTRAG_BREITE / 2 + 8
  const x = Math.min(Math.max(menue.x, rand), Math.max(rand, window.innerWidth - rand))
  const y = Math.min(Math.max(menue.y, radius + 30), Math.max(radius + 30, window.innerHeight - radius - 30))
  const ersterRef = useRef<HTMLButtonElement>(null)
  const [auf, setAuf] = useState(false)
  useLayoutEffect(() => {
    ersterRef.current?.focus()
    const t = requestAnimationFrame(() => setAuf(true))
    return () => cancelAnimationFrame(t)
  }, [])
  useEffect(() => {
    const taste = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onSchliessen()
      }
    }
    window.addEventListener('keydown', taste, true)
    return () => window.removeEventListener('keydown', taste, true)
  }, [onSchliessen])
  const ausfuehren = (id: Eintrag['id']): void => {
    onSchliessen()
    angleichen(menue.auswahl, id)
    auswahlAufheben()
  }
  return (
    <Portal>
      <div className="kreismenue-schleier" onMouseDown={onSchliessen} onContextMenu={(e) => e.preventDefault()} />
      <div
        className={`kreismenue ${auf ? 'kreismenue-offen' : ''}`}
        style={{ left: x, top: y }}
        role="menu"
        aria-label="Tabelle angleichen"
        data-tabellen-kreis
      >
        <svg className="kreismenue-ring" width={radius * 2} height={radius * 2} style={{ left: -radius, top: -radius }} aria-hidden>
          <circle cx={radius} cy={radius} r={radius - 1} />
        </svg>
        {eintraege.map((e, i) => {
          const lage = kreisLage(i, n, radius)
          return (
            <button
              key={e.id}
              ref={i === 0 ? ersterRef : undefined}
              type="button"
              role="menuitem"
              className="kreismenue-eintrag"
              style={{
                width: EINTRAG_BREITE,
                transform: auf ? `translate(calc(${lage.x}px - 50%), calc(${lage.y}px - 50%))` : 'translate(-50%, -50%) scale(0.4)'
              }}
              onClick={() => ausfuehren(e.id)}
              data-tabelle-aktion={e.id}
            >
              {e.icon}
              <span>{e.label}</span>
            </button>
          )
        })}
        {!eintraege.length && (
          <span className="kreismenue-eintrag" style={{ width: EINTRAG_BREITE, transform: `translate(-50%, calc(${-radius}px - 50%))` }}>
            Mehr als eine Zeile oder Spalte markieren
          </span>
        )}
        <button type="button" className="kreismenue-mitte" onClick={onSchliessen} aria-label="Schließen">
          <IconX size={18} />
        </button>
      </div>
    </Portal>
  )
}
