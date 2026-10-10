/**
 * Medaillen auf Jahresreihen umstellen (10.10.2026, Entscheidung der Lehrkraft; Regeln in shared/auszeichnungen.ts
 * `jahreUmstellen`, Konzept recherche/achievements-medaillen-titel.md Abschnitt 7).
 *
 * Einmalige Wartung `auszeichnungen-jahre-2026-10-10`: Jede Person mit Medaillen aus der ersten Fassung bekommt sie als
 * Reihe des laufenden Schuljahres (2026/27) – Stufen und Zeitpunkte unverändert, dazu der Jahrestitel aus ihren Punkten.
 * Haupttitel, Zähler, Titelwahl und alte Achievements bleiben, wie sie sind. Wer schon Jahresreihen hat, bleibt
 * unberührt (wiederholbar ohne Wirkung). Der Jahrgang der Reihe kommt bei der nächsten Auswertung dazu.
 *
 * Die Achievement-Daten sind verschlüsselt (feldschutz.ts): gelesen und geschrieben wird über den geschützten Zugang,
 * den `datenbank()` der Wartung übergibt. Das Protokoll nennt nur Zahlen.
 */
import type { DatabaseSync } from 'node:sqlite'
import { jahreUmstellen, type AuszStand } from '../shared/auszeichnungen'
import { schuljahrText, schuljahrVon } from '../shared/schulkalender'

const tabelleDa = (d: DatabaseSync, t: string): boolean => Boolean(d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t))

/** Alle Einträge umstellen; Ergebnis: Satz fürs Protokoll */
export function auszeichnungenJahre(d: DatabaseSync, jetzt = Date.now(), schuljahr = schuljahrVon(jetzt)): string {
  if (!tabelleDa(d, 'achievements')) return 'keine Achievements – nichts geändert'
  let personen = 0
  let medaillen = 0
  for (const z of d.prepare('SELECT nutzer_id, daten FROM achievements').all() as { nutzer_id: string; daten: string }[]) {
    let daten: { ausz?: Partial<AuszStand> }
    try {
      daten = JSON.parse(z.daten) as typeof daten
    } catch {
      continue
    }
    if (!daten || typeof daten !== 'object' || !daten.ausz || typeof daten.ausz !== 'object') continue
    const ausz: AuszStand = { medaillen: daten.ausz.medaillen ?? {}, titel: daten.ausz.titel ?? {}, ...(daten.ausz.jahre ? { jahre: daten.ausz.jahre } : {}) }
    if (!jahreUmstellen(ausz, schuljahr, jetzt)) continue
    personen++
    for (const m of Object.values(ausz.medaillen)) medaillen += Object.values(m ?? {}).filter((x) => (x?.stufe ?? 0) >= 1).length
    d.prepare('UPDATE achievements SET daten = ? WHERE nutzer_id = ?').run(JSON.stringify({ ...daten, ausz }), z.nutzer_id)
  }
  return `${personen} ${personen === 1 ? 'Person' : 'Personen'} auf Jahresreihen umgestellt (${medaillen} ${medaillen === 1 ? 'Medaille' : 'Medaillen'} im Schuljahr ${schuljahrText(schuljahr)})`
}

export const AUSZEICHNUNGEN_JAHRE: [string, (d: DatabaseSync) => string] = ['auszeichnungen-jahre-2026-10-10', (d) => auszeichnungenJahre(d)]
