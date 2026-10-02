/**
 * Maße einer Tabelle von Hand (27.09.2026).
 *
 * Wunsch der Lehrkraft: Spalten breiter oder schmaler ziehen, Zeilen höher oder niedriger,
 * und das Blatt bricht danach von selbst neu um. Gespeichert werden Spaltenbreiten in
 * PROZENT der Tabellenbreite (die Summe ist immer 100 – wer eine Spalte breiter zieht, nimmt
 * es der Nachbarspalte), Zeilenhöhen als Mindesthöhe in MILLIMETERN (0 = so hoch wie der
 * Inhalt) und die Breite der ganzen Tabelle in Prozent der Textspalte. Prozent statt Pixel,
 * weil dieselbe Tabelle am Bildschirm verkleinert, im Druck und in Word gleich aussehen soll.
 */
import type { TableBlock } from '../model/types'

/** Schmaler als das wird keine Spalte – sonst passt kein Wort mehr hinein */
export const MIN_SPALTE_PROZENT = 8
/** Niedriger als das wird keine Zeile gezogen; darunter gilt wieder „so hoch wie der Inhalt" */
export const MIN_ZEILE_MM = 5
export const MIN_TABELLE_PROZENT = 30

export const spaltenZahl = (block: Pick<TableBlock, 'headers' | 'rows'>): number => Math.max(block.headers.length, ...block.rows.map((r) => r.length), 1)

/** Die Spaltenbreiten in Prozent – genau eine je Spalte, Summe 100; ohne Vorgabe alle gleich */
export function spaltenBreiten(block: Pick<TableBlock, 'headers' | 'rows' | 'colWidths'>): number[] {
  const n = spaltenZahl(block)
  const roh = block.colWidths ?? []
  if (roh.length === n && roh.every((w) => Number.isFinite(w) && w > 0)) {
    const summe = roh.reduce((a, b) => a + b, 0)
    return roh.map((w) => (w / summe) * 100)
  }
  return Array.from({ length: n }, () => 100 / n)
}

/** Hat die Lehrkraft Maße von Hand gesetzt? */
export const hatMasse = (block: Pick<TableBlock, 'colWidths' | 'rowHeightsMm' | 'widthPercent'>): boolean =>
  Boolean(block.colWidths?.length || block.rowHeightsMm?.some((h) => h > 0) || (block.widthPercent && block.widthPercent !== 100))

/**
 * Die Trennlinie rechts von Spalte `c` um `delta` Prozentpunkte verschieben: Spalte `c` wächst,
 * die Nachbarspalte schrumpft (oder umgekehrt). Keine Spalte wird schmaler als das Minimum.
 */
export function spalteVerschieben(breiten: number[], c: number, delta: number): number[] {
  if (c < 0 || c >= breiten.length - 1) return breiten
  const out = [...breiten]
  const links = out[c]
  const rechts = out[c + 1]
  const d = Math.max(MIN_SPALTE_PROZENT - links, Math.min(rechts - MIN_SPALTE_PROZENT, delta))
  out[c] = links + d
  out[c + 1] = rechts - d
  return out.map((w) => Math.round(w * 10) / 10)
}

/** Die Breite der ganzen Tabelle (Prozent der Textspalte), begrenzt */
export const tabellenBreite = (prozent: number): number => Math.round(Math.max(MIN_TABELLE_PROZENT, Math.min(100, prozent)))

/** Die Mindesthöhe einer Zeile in mm; unterhalb des Minimums wieder automatisch (0) */
export function zeilenHoehe(mm: number): number {
  if (!Number.isFinite(mm) || mm < MIN_ZEILE_MM) return 0
  return Math.round(Math.min(200, mm) * 2) / 2
}

/** Zeilenhöhen so setzen, dass die Liste genau die Zeilen der Tabelle abdeckt */
export function zeilenHoehen(block: Pick<TableBlock, 'rows' | 'rowHeightsMm'>): number[] {
  return block.rows.map((_, r) => block.rowHeightsMm?.[r] ?? 0)
}

/**
 * Von Hand gezogene Maße der übrigen Tabellen (02.10.2026): Richtig/Falsch, Zuordnung,
 * Fragenreihe zum Ankreuzen und Selbsteinschätzung. Befund der Lehrkraft: Antwortfelder zu klein,
 * Tabellen nicht größer zu ziehen. Ohne Maße bleibt die bisherige Darstellung unverändert.
 */
export interface HandMasse {
  colWidths?: number[]
  rowHeightsMm?: number[]
  headerHeightMm?: number
}

/** Ein Zug an einer Tabellenlinie (render/tabelleZiehen.ts) */
export interface Zug {
  art: 'spalte' | 'zeile' | 'kopf'
  index: number
  colWidths?: number[]
  hoeheMm?: number
}

/** Eigene Spaltenbreiten in Prozent (Summe 100), wenn sie zur Spaltenzahl passen – sonst undefined */
export function eigeneBreiten(m: HandMasse | undefined, n: number): number[] | undefined {
  const roh = m?.colWidths
  if (!roh || roh.length !== n || !roh.every((w) => Number.isFinite(w) && w > 0)) return undefined
  const summe = roh.reduce((a, b) => a + b, 0)
  return roh.map((w) => Math.round((w / summe) * 1000) / 10)
}

/** Einen Zug in die Maße übernehmen – EIN Aufruf je Geste, damit es ein Rückgängig-Schritt bleibt */
export function zugUebernehmen(d: HandMasse, z: Zug, zeilen: number): void {
  if (z.art === 'spalte') {
    if (z.colWidths) d.colWidths = z.colWidths
  } else if (z.art === 'kopf') {
    if (z.hoeheMm) d.headerHeightMm = z.hoeheMm
    else delete d.headerHeightMm
  } else {
    const h = Array.from({ length: Math.max(zeilen, z.index + 1) }, (_, r) => d.rowHeightsMm?.[r] ?? 0)
    h[z.index] = z.hoeheMm ?? 0
    if (h.some((x) => x > 0)) d.rowHeightsMm = h
    else delete d.rowHeightsMm
  }
}
