/**
 * Einmalige Bereinigung (13.10.2026, von der Lehrkraft ausdrücklich gewünscht): ALLE bisherigen Grammatik-Trainings
 * löschen – samt der Bearbeitungen durch die Lernenden. Seit der Aufgabenbank (shared/grammatikBank.ts) hängen die
 * Aufgaben an der Grammatikform; die Kurse bekommen sie neu über „Grammatik hinzufügen".
 *
 * Gelöscht wie über POST /server/grammatik/<id>/loeschen (grammatik.ts), nur für alle: jede Zeile in gram_zuweisungen
 * (auch Förder- und Forder-Extras), dazu Lernstand (gram_stand) und Code-Beitritte (gram_gaeste); Gäste, die danach in
 * keinem Training mehr sind, verlieren ihr Konto. Die Grammatik-Medaillen berichtigt achievements.ts beim Start still
 * (Regelstand 3). Vorher legt das Aufspielen eine Sicherung der Datenbank an. Das Protokoll nennt nur Zahlen.
 */
import type { DatabaseSync } from 'node:sqlite'

const tabelleDa = (d: DatabaseSync, t: string): boolean => Boolean(d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t))
const spalteDa = (d: DatabaseSync, t: string, s: string): boolean =>
  (d.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).some((x) => x.name === s)

/** Ergebnis: Satz fürs Wartungsprotokoll (nur Zahlen) */
export function grammatikAlleLoeschen(d: DatabaseSync): string {
  if (!tabelleDa(d, 'gram_zuweisungen')) return 'keine Grammatik – nichts gelöscht'
  const standDa = tabelleDa(d, 'gram_stand')
  const gaesteDa = tabelleDa(d, 'gram_gaeste')
  const nutzerDa = tabelleDa(d, 'nutzer') && spalteDa(d, 'nutzer', 'quelle')
  const vokGaesteDa = tabelleDa(d, 'vok_gaeste')
  const trainings = Number((d.prepare('SELECT COUNT(*) AS n FROM gram_zuweisungen').get() as { n: number }).n)
  const staende = standDa ? Number((d.prepare('SELECT COUNT(*) AS n FROM gram_stand').get() as { n: number }).n) : 0
  const gaeste = gaesteDa ? [...new Set((d.prepare('SELECT nutzer_id FROM gram_gaeste').all() as { nutzer_id: string }[]).map((g) => g.nutzer_id))] : []
  // Ausdrücklich, auch ohne Fremdschlüssel (ON DELETE CASCADE)
  if (standDa) d.prepare('DELETE FROM gram_stand').run()
  if (gaesteDa) d.prepare('DELETE FROM gram_gaeste').run()
  d.prepare('DELETE FROM gram_zuweisungen').run()
  // Gäste ohne weiteres Training verlieren ihr Konto (wie beim Löschen über die Oberfläche)
  let konten = 0
  if (nutzerDa)
    for (const n of gaeste) {
      const gast = d.prepare("SELECT 1 FROM nutzer WHERE id = ? AND quelle = 'gast'").get(n)
      const nochDa = vokGaesteDa && d.prepare('SELECT 1 FROM vok_gaeste WHERE nutzer_id = ?').get(n)
      if (gast && !nochDa) {
        d.prepare('DELETE FROM nutzer WHERE id = ?').run(n)
        konten++
      }
    }
  return `${trainings} Grammatiktrainings gelöscht (${staende} Lernstände, ${konten} Gastkonten)`
}

/** Eintrag für wartung.ts */
export const GRAMMATIK_ALLE: [string, (d: DatabaseSync) => string] = ['grammatik-alle-loeschen-2026-10-13', grammatikAlleLoeschen]
