/**
 * Sprachpaket für Spielnamen und Spieltexte (09.10.2026, Entscheidung der Lehrkraft: ALLE Fremdsprachen der App).
 * Je Sprache eine Datei; die Haupttabellen in spielSprache.ts/spielTexte.ts enthalten de, en, fr, es, it, la (dort
 * zum Teil mit einfacher Fassung für Klasse 5–6). Die Pakete hier sind durchgehend in einfacher Sprache geschrieben.
 * Platzhalter {0}, {1} … wie in den Haupttabellen.
 */
import type { TextSchluessel } from '../spielSprache'
import type { Lexikon } from '../mehrspieler/reiseLexikon'

export interface SprachPaket {
  /** Spielnamen, Schlüssel `art:id` (mehr:/vok:/gram:) – fehlt einer, gilt Englisch */
  namen?: Record<string, string>
  /** Regel in einem Satz je Mehrspieler-Spiel (Kennung) */
  beschreibung: Record<string, string>
  /** Beschreibung je Einzelspiel (`vok:id` bzw. `gram:id`) */
  einzel: Record<string, string>
  /** Einheiten (Schlüssel: deutsche Einheit) */
  einheiten: Record<string, string>
  /** Alle Spieltexte */
  texte: Record<TextSchluessel, string>
  /** Reiseplaner: Begriffe und Satzvorlagen */
  reise: Lexikon
}
