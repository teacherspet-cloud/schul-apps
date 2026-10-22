/**
 * Alle Daten einer Person aus der Datenbank entfernen (23.10.2026, Prüfung des Schulträgers, Löschkonzept).
 *
 * Bisher ging beim Löschen eines Kontos nur mit, was per Fremdschlüssel (ON DELETE CASCADE) an `nutzer` hängt. Einige
 * Tabellen haben keinen Fremdschlüssel (krisen_hinweise, sprech_freigaben/_stand/_vorfaelle, ki_nutzung, plan_gesehen,
 * freigabe_plan, lehrwerk_stand, schuljahr_wechsel, sprech_bank …), und Listen von Lernenden stehen als JSON in Spalten
 * (`schueler` der Freigaben, `mitglieder` der Lerngruppen). Darum hier OHNE feste Tabellenliste:
 *  - jede Tabelle mit einer Personenspalte (`PERSONEN_SPALTEN`) – Zeilen der Person löschen;
 *  - Prüfprotokoll: die Zeilen bleiben (nur Zahlen, nie Namen), die Kennung der Person wird entfernt;
 *  - Listen-Spalten (`LISTEN_SPALTEN`): Kennung und Benutzername aus der Liste nehmen (über die Hülle aus feldschutz.ts
 *    entschlüsselt gelesen und verschlüsselt zurückgeschrieben);
 *  - Kinder ohne Fremdschlüssel, deren Eltern dabei wegfielen (`WAISEN`), z. B. der Stand der Lernenden in einem
 *    Sprechtraining einer gelöschten Lehrkraft.
 * Neue Tabellen sind damit automatisch dabei, solange ihre Personenspalte so heißt wie hier (tests/kontoEntfernen.test.ts
 * prüft das an allen CREATE TABLE des Servers).
 */
import type { DatabaseSync } from 'node:sqlite'

/** Spalten, die eine Person (Konto) bezeichnen */
export const PERSONEN_SPALTEN = ['nutzer_id', 'schueler_id', 'lehrkraft_id', 'besitzer_id', 'iserv_id', 'gast_id'] as const
/** JSON-Listen mit Kennungen bzw. Benutzernamen von Lernenden */
export const LISTEN_SPALTEN = ['schueler', 'mitglieder'] as const
/**
 * Tabellen, deren Zeilen bleiben – nur die Personenspalte wird geleert: das Prüfprotokoll (Nachweis, nur Zahlen) und
 * der schulweite Kartenpool der Sprechprüfungen (Material der Schule, nicht der Person)
 */
export const ANONYMISIEREN: Record<string, { spalte: string; wert: string | null }> = {
  protokoll: { spalte: 'nutzer_id', wert: null },
  sprech_bank: { spalte: 'lehrkraft_id', wert: '' }
}
/**
 * Verweise auf eine Person in Zeilen, die anderen gehören: nur den Verweis leeren. Krisenhinweise (23.10.2026, krise.ts):
 * `erst_gesehen_von` = wer als Erste/r „Gesehen" gesetzt hat – steht auch in den Zeilen anderer Empfänger des Falls.
 */
export const VERWEISE: Record<string, string[]> = { krisen_hinweise: ['erst_gesehen_von'] }
/** Kinder ohne Fremdschlüssel: Zeilen ohne Eltern löschen */
export const WAISEN: { tabelle: string; spalte: string; eltern: string; elternSpalte: string }[] = [
  { tabelle: 'sprech_stand', spalte: 'freigabe_id', eltern: 'sprech_freigaben', elternSpalte: 'id' },
  { tabelle: 'sprech_vorfaelle', spalte: 'freigabe_id', eltern: 'sprech_freigaben', elternSpalte: 'id' }
]

const q = (name: string): string => `"${name.replace(/"/g, '""')}"`

/** Alle Tabellen samt Spalten (ohne die von SQLite) */
export function tabellenMitSpalten(d: DatabaseSync): Map<string, string[]> {
  const aus = new Map<string, string[]>()
  const namen = d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
  for (const { name } of namen) aus.set(name, (d.prepare(`PRAGMA table_info(${q(name)})`).all() as { name: string }[]).map((s) => s.name))
  return aus
}

/** Personenspalten einer Tabelle: die bekannten Namen und jede Spalte mit Fremdschlüssel auf `nutzer` */
export function personenSpaltenVon(d: DatabaseSync, tabelle: string, spalten: string[]): string[] {
  const fk = (d.prepare(`PRAGMA foreign_key_list(${q(tabelle)})`).all() as { table: string; from: string }[]).filter((f) => f.table === 'nutzer').map((f) => f.from)
  return [...new Set([...spalten.filter((x) => (PERSONEN_SPALTEN as readonly string[]).includes(x)), ...fk])]
}

export interface PersonZiel {
  id: string
  /** Benutzername (Lerngruppen führen Mitglieder nach Benutzername) */
  benutzer?: string
}

/**
 * Daten der Personen entfernen. `d` ist der umhüllte Zugang (datenbank()), damit Listen verschlüsselt bleiben.
 * Liefert die Zahl der berührten Zeilen (nur fürs Protokoll).
 */
export function personenDatenEntfernen(d: DatabaseSync, personen: PersonZiel[]): number {
  const ziele = personen.filter((p) => p.id)
  if (!ziele.length) return 0
  const ids = ziele.map((p) => p.id)
  const merkmale = new Set<string>([...ids, ...ziele.map((p) => p.benutzer ?? '').filter(Boolean)])
  const platz = ids.map(() => '?').join(', ')
  let zeilen = 0
  const tabellen = tabellenMitSpalten(d)
  for (const [tabelle, spalten] of tabellen) {
    if (tabelle === 'nutzer') continue
    const anonym = ANONYMISIEREN[tabelle]
    for (const s of personenSpaltenVon(d, tabelle, spalten)) {
      const r =
        anonym?.spalte === s
          ? d.prepare(`UPDATE ${q(tabelle)} SET ${q(s)} = ? WHERE ${q(s)} IN (${platz})`).run(anonym.wert, ...ids)
          : d.prepare(`DELETE FROM ${q(tabelle)} WHERE ${q(s)} IN (${platz})`).run(...ids)
      zeilen += Number(r.changes)
    }
    for (const s of spalten.filter((x) => (LISTEN_SPALTEN as readonly string[]).includes(x))) {
      // Ohne Platzhalter im SELECT: die Hülle entschlüsselt nach dem Spaltennamen
      const alle = d.prepare(`SELECT rowid AS zeile, ${q(s)} AS ${s} FROM ${q(tabelle)}`).all() as Record<string, unknown>[]
      for (const z of alle) {
        let liste: unknown
        try {
          liste = JSON.parse(String(z[s] ?? '[]'))
        } catch {
          continue
        }
        if (!Array.isArray(liste) || !liste.some((x) => merkmale.has(String(x)))) continue
        const neu = liste.filter((x) => !merkmale.has(String(x)))
        d.prepare(`UPDATE ${tabelle} SET ${s} = ? WHERE rowid = ?`).run(JSON.stringify(neu), Number(z.zeile))
        zeilen++
      }
    }
  }
  for (const [tabelle, spalten] of Object.entries(VERWEISE)) {
    const da = tabellen.get(tabelle)
    if (!da) continue
    for (const s of spalten.filter((x) => da.includes(x)))
      zeilen += Number(d.prepare(`UPDATE ${q(tabelle)} SET ${q(s)} = NULL WHERE ${q(s)} IN (${platz})`).run(...ids).changes)
  }
  for (const w of WAISEN) {
    if (!tabellen.has(w.tabelle) || !tabellen.has(w.eltern)) continue
    zeilen += Number(
      d.prepare(`DELETE FROM ${q(w.tabelle)} WHERE ${q(w.spalte)} NOT IN (SELECT ${q(w.elternSpalte)} FROM ${q(w.eltern)})`).run().changes
    )
  }
  return zeilen
}
