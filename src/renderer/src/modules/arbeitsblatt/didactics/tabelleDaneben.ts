/**
 * Darf eine Tabelle NEBEN der Aufgabe stehen? (03.11.2026, Befund der Lehrkraft „Midterm elections": Die Faktenbox zur
 * Bundestagswahl – 7 Zeilen mit ganzen Sätzen – stand als schmale Spalte (38 %) neben Aufgabe 4, darunter blieb ein
 * Großteil des Blattes leer.)
 *
 * Ursache: Die KI darf je Tabelle `blockSide` wählen, und das wurde ungeprüft übernommen. Neben der Aufgabe sind nur
 * ~62 mm Platz – eine Tabelle mit Sätzen wird dort sehr lang und schmal. Regel: daneben nur, wenn die Tabelle in dieser
 * Breite höchstens ~70 mm hoch wird (Stichwort-Tabellen, kurze Datenreihen). Gilt bei der Erzeugung (convert.ts) und beim
 * Darstellen (render/SheetPages.tsx `seiteVon`) – so sind auch bestehende Blätter berichtigt. Eine von Hand gewählte
 * Seite (`seiteVonHand`) bleibt.
 *
 * FAUSTREGEL: Spaltenbreite ≈ 62 mm ÷ Spalten, ≈ 2 mm je Zeichen, 4,6 mm je Textzeile plus 1,5 mm Zellrand, 7 mm Titel.
 */
export const DANEBEN_BREITE_MM = 62
export const DANEBEN_HOEHE_MM = 70

export function tabellenHoeheDaneben(t: { title?: string; headers: string[]; rows: string[][] }, breiteMm = DANEBEN_BREITE_MM): number {
  const spalten = Math.max(1, t.headers.length, ...t.rows.map((r) => r.length))
  const zeichen = Math.max(4, Math.floor(breiteMm / spalten / 2))
  const zeilen = (r: string[]): number => Math.max(1, ...r.map((z) => Math.ceil((z ?? '').trim().length / zeichen) || 1))
  const kopf = t.headers.some((h) => h.trim()) ? zeilen(t.headers) * 4.6 + 1.5 : 0
  const rumpf = t.rows.reduce((s, r) => s + zeilen(r) * 4.6 + 1.5, 0)
  return (t.title?.trim() ? 7 : 0) + kopf + rumpf
}

/** Zu groß für „daneben"? */
export const tabelleZuGrossDaneben = (t: { title?: string; headers: string[]; rows: string[][] }): boolean => tabellenHoeheDaneben(t) > DANEBEN_HOEHE_MM
