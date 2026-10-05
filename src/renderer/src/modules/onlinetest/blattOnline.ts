/**
 * Fassungen eines Grammatiktests bzw. einer Lernzielkontrolle für den Onlinetest (05.10.2026): je Blatt
 * (Fassung A, B …) die Druckfassung OHNE Lösungen, daraus die Material-Ausschnitte, dazu die Aufgaben
 * übersetzt (kernBlatt.ts). Läuft in der Oberfläche der Lehrkraft – dort steht das Zeichnen zur Verfügung.
 */
import type { Worksheet } from '../arbeitsblatt/model/types'
import { buildWorksheetHtml } from '../arbeitsblatt/render/printHtml'
import { taskNumbersFor } from '../arbeitsblatt/render/SheetPages'
import type { OnlineFassung } from './kern'
import { materialAusDruck, onlineFassungAusBloecke } from './kernBlatt'

export function fassungenAusBlatt(ws: Worksheet, logo: string | null, schoolName: string): { label: string; fassung: OnlineFassung }[] {
  const ergebnis = ws.sheets.map((sheet, i) => {
    const html = buildWorksheetHtml(ws, new Map(), { sheetIds: [sheet.id], includeKey: false }, logo, schoolName)
    const m = materialAusDruck(html)
    return {
      label: (sheet.label || '').replace(/^(Gruppe|Fassung|Variante)\s+/i, '').trim() || String.fromCharCode(65 + i),
      fassung: onlineFassungAusBloecke(sheet.blocks, { materialHtml: m.material, stil: m.stil, nummern: taskNumbersFor(sheet) })
    }
  })
  if (!ergebnis.some((e) => e.fassung.einheiten.length)) throw new Error('Der Test hat keine Aufgaben, die sich online bearbeiten lassen.')
  return ergebnis
}
