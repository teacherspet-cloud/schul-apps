/**
 * Gäste aus einer Freigabe entfernen (05.10.2026, Wunsch der Lehrkraft: „per QR-Code beigetretene Nutzer
 * aus freigeschaltetem Material entfernen").
 *
 * Ein Gast (Konto mit `quelle = 'gast'`) entsteht beim Beitritt mit Namen für GENAU eine Freigabe. Wird er
 * dort entfernt, verschwindet die Zuordnung samt seinem Stand. Hängt das Konto an keiner Freigabe mehr,
 * wird es ganz gelöscht – mit allen Daten (Fremdschlüssel) und seiner Sitzung: Der Gast ist sofort draußen.
 */
import { datenbank, nutzerLoeschen, nutzerNachId, protokolliereServer } from './datenbank'

/** Alle Tabellen, die Gäste mit einer Freigabe verbinden (Spalte `nutzer_id`) */
const ZUORDNUNGEN = ['blatt_gaeste', 'vok_gaeste', 'feedback_gaeste'] as const

const vorhanden = (tabelle: string): boolean => Boolean(datenbank().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabelle))

/**
 * `tabelle`/`spalte`: Zuordnung der Freigabe (z. B. blatt_gaeste/freigabe_id); `stand`: Tabellen mit dem
 * Stand der Person in dieser Freigabe (Spalte `schueler_id` und dieselbe Freigabe-Spalte).
 * Antwort: false, wenn die Person nicht per Code an dieser Freigabe hängt.
 */
export function gastEntfernen(
  e: { tabelle: (typeof ZUORDNUNGEN)[number]; spalte: string; freigabeId: string; stand: { tabelle: string; spalte: string }[] },
  nutzerId: string,
  lehrkraftId: string
): boolean {
  const db = datenbank()
  const n = nutzerNachId(nutzerId)
  if (!n) return false
  if (!db.prepare(`SELECT 1 FROM ${e.tabelle} WHERE ${e.spalte} = ? AND nutzer_id = ?`).get(e.freigabeId, nutzerId)) return false
  db.prepare(`DELETE FROM ${e.tabelle} WHERE ${e.spalte} = ? AND nutzer_id = ?`).run(e.freigabeId, nutzerId)
  for (const s of e.stand)
    if (vorhanden(s.tabelle)) db.prepare(`DELETE FROM ${s.tabelle} WHERE ${s.spalte} = ? AND schueler_id = ?`).run(e.freigabeId, nutzerId)
  const nochVerbunden = ZUORDNUNGEN.some((t) => vorhanden(t) && db.prepare(`SELECT 1 FROM ${t} WHERE nutzer_id = ?`).get(nutzerId))
  // Ein IServ-Konto, das per Code beigetreten war, bleibt – es verliert nur den Zugang zu dieser Freigabe
  if (!nochVerbunden && n.quelle === 'gast') nutzerLoeschen(nutzerId)
  protokolliereServer('freigaben', 'Gast aus einer Freigabe entfernt', lehrkraftId)
  return true
}
