/**
 * Ziehen an den Linien einer Ausfülltabelle in einer Aufgabe (02.10.2026).
 *
 * Befund der Lehrkraft: Die Antwortfelder sind oft viel zu klein, und anders als die Tabelle als
 * eigener Baustein (baustein/tabelle.tsx) ließ sich die Ausfülltabelle einer Aufgabe gar nicht
 * größer ziehen. Gleiches Muster wie dort: Die Verfolgung hängt am FENSTER (der Baustein wird
 * beim Messen neu aufgebaut), während des Zuges zeigt die Tabelle die Maße direkt im DOM, und
 * erst beim Loslassen wird EINMAL gespeichert – ein Rückgängig-Schritt je Geste. Die Vorschau
 * läuft im DOM statt in React-Zustand, weil eine geteilte Tabelle aus mehreren Stücken besteht,
 * die getrennt gerendert werden; vor dem Speichern wird sie zurückgesetzt, damit React wieder
 * allein bestimmt, was zu sehen ist.
 */
import { spalteVerschieben, zeilenHoehe, type Zug } from './tabelleMasse'

export type ZugArt = Zug['art']

/** zeile/kopf: `hoeheMm` = neue Mindesthöhe in mm (0 = wieder automatisch) */
export type ZugErgebnis = Zug

/**
 * Spaltenbreiten in Prozent, wie sie gerade gesetzt sind – für Tabellen ohne eigene Maße
 * (Richtig/Falsch, Zuordnung …, 02.10.2026): gemessen an der ersten Zeile.
 */
function gemesseneBreiten(table: HTMLTableElement): number[] {
  const zellen = [...(table.rows[0]?.cells ?? [])]
  const gesamt = zellen.reduce((s, z) => s + z.getBoundingClientRect().width, 0) || 1
  return zellen.map((z) => Math.round((z.getBoundingClientRect().width / gesamt) * 1000) / 10)
}

/** Millimeter je Bildschirmpunkt – stimmt auch in der verkleinerten Vorschau (CSS-Pixel 96 dpi) */
const mmProPunkt = (el: HTMLElement): number => (25.4 / 96) * (el.offsetWidth / Math.max(1, el.getBoundingClientRect().width))

export function tabelleZiehen(e: React.PointerEvent, art: ZugArt, index: number, breiten: number[] | undefined, fertig: (z: ZugErgebnis) => void): void {
  const griff = e.currentTarget as HTMLElement
  const table = griff.closest('table')
  if (!table) return
  e.preventDefault()
  e.stopPropagation()
  const rect = table.getBoundingClientRect()
  const startX = e.clientX
  const startY = e.clientY
  const mm = mmProPunkt(table)
  const zeile = art === 'spalte' ? null : griff.closest('tr')
  const startHoehe = zeile ? zeile.getBoundingClientRect().height * mm : 0
  const cols = [...table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col')]
  const start = breiten?.length ? breiten : gemesseneBreiten(table)
  const alt = { zeile: zeile?.style.height ?? '', cols: cols.map((c) => c.style.width), layout: table.style.tableLayout }
  let ergebnis: ZugErgebnis = { art, index }
  const bewegen = (ev: PointerEvent): void => {
    if (art === 'spalte') {
      const colWidths = spalteVerschieben(start, index, ((ev.clientX - startX) / Math.max(1, rect.width)) * 100)
      // Vorschau mit festen Spalten – sonst verteilt der Browser die Breiten nach dem Inhalt neu
      table.style.tableLayout = 'fixed'
      colWidths.forEach((w, c) => {
        if (cols[c]) cols[c].style.width = `${w}%`
      })
      ergebnis = { art, index, colWidths }
    } else if (zeile) {
      const hoeheMm = zeilenHoehe(startHoehe + (ev.clientY - startY) * mm)
      zeile.style.height = hoeheMm ? `${hoeheMm}mm` : ''
      ergebnis = { art, index, hoeheMm }
    }
  }
  const ende = (): void => {
    window.removeEventListener('pointermove', bewegen)
    window.removeEventListener('pointerup', ende)
    window.removeEventListener('pointercancel', ende)
    if (zeile) zeile.style.height = alt.zeile
    cols.forEach((c, i) => (c.style.width = alt.cols[i]))
    table.style.tableLayout = alt.layout
    // Nur ein Antippen ohne Bewegung speichert nichts
    if (ergebnis.colWidths || ergebnis.hoeheMm !== undefined) fertig(ergebnis)
  }
  window.addEventListener('pointermove', bewegen)
  window.addEventListener('pointerup', ende)
  window.addEventListener('pointercancel', ende)
}
