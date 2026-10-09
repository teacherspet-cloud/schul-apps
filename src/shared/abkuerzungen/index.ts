/**
 * Verzeichnis der Abkürzungs-Tabellen (09.10.2026). Eine neue Tabelle (Lehrwerk oder Fach) als eigene Datei anlegen
 * und hier in TABELLEN eintragen – mehr ist nicht nötig. Gesucht wird über alle Tabellen nach dem genauen Eintrag.
 */
import { GREEN_LINE } from './greenLine'
import type { AbkEintrag, AbkTabelle } from './typen'

export type { AbkArt, AbkEintrag, AbkTabelle, AbkUeben } from './typen'

export const TABELLEN: AbkTabelle[] = [GREEN_LINE]

/** Schlüssel: Leerraum zusammengefasst, Apostroph-Zeichen vereinheitlicht, Groß-/Kleinschreibung bleibt („US" ≠ „us") */
export const tabellenSchluessel = (term: string): string =>
  String(term ?? '')
    .normalize('NFC')
    .replace(/[’‘ʼ´`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

let verzeichnis: Map<string, AbkEintrag> | null = null
const index = (): Map<string, AbkEintrag> => {
  if (verzeichnis) return verzeichnis
  verzeichnis = new Map()
  for (const t of TABELLEN) for (const x of t.eintraege) if (!verzeichnis.has(tabellenSchluessel(x.term))) verzeichnis.set(tabellenSchluessel(x.term), x)
  return verzeichnis
}

/** Geprüfter Tabelleneintrag zu genau diesem Wort – sonst undefined (dann gelten die allgemeinen Regeln) */
export function abkEintrag(term: string | undefined | null, sprache?: string): AbkEintrag | undefined {
  const x = index().get(tabellenSchluessel(term ?? ''))
  return x && (!sprache || x.sprache === sprache.toLowerCase().split(/[-_]/)[0]) ? x : undefined
}
