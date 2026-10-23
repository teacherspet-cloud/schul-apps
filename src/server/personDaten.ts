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
import { createHmac } from 'node:crypto'
import { hauptschluessel } from './geheim'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { systemOrdner } from './pfade'

/** Spalten, die eine Person (Konto) bezeichnen */
export const PERSONEN_SPALTEN = ['nutzer_id', 'schueler_id', 'lehrkraft_id', 'besitzer_id', 'iserv_id', 'gast_id'] as const
/** JSON-Listen mit Kennungen bzw. Benutzernamen von Lernenden */
export const LISTEN_SPALTEN = ['schueler', 'mitglieder'] as const
/**
 * Listen in einem Feld eines JSON-Objekts (23.10.2026, Nachprüfung des Schulträgers): `transkript_wahl` der
 * Hörtext-Freigaben = { wer, schueler: [Benutzernamen in Kleinschreibung] } (hoertexte.ts)
 */
export const JSON_LISTEN: { spalte: string; feld: string }[] = [{ spalte: 'transkript_wahl', feld: 'schueler' }]
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
  // Benutzernamen stehen in manchen Listen klein geschrieben (transkript_wahl)
  for (const p of ziele) if (p.benutzer) merkmale.add(p.benutzer.trim().toLowerCase())
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
  for (const [tabelle, spalten] of tabellen) {
    for (const j of JSON_LISTEN.filter((x) => spalten.includes(x.spalte))) {
      const alle = d.prepare(`SELECT rowid AS zeile, ${q(j.spalte)} AS ${j.spalte} FROM ${q(tabelle)}`).all() as Record<string, unknown>[]
      for (const z of alle) {
        let obj: unknown
        try {
          obj = JSON.parse(String(z[j.spalte] || '{}'))
        } catch {
          continue
        }
        const liste = obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[j.feld] : null
        if (!Array.isArray(liste) || !liste.some((x) => merkmale.has(String(x)))) continue
        const neu = { ...(obj as Record<string, unknown>), [j.feld]: liste.filter((x) => !merkmale.has(String(x))) }
        d.prepare(`UPDATE ${q(tabelle)} SET ${q(j.spalte)} = ? WHERE rowid = ?`).run(JSON.stringify(neu), Number(z.zeile))
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
  geloeschtVermerken(d, ids)
  return zeilen
}

/*
 * Löschungen nach einer Wiederherstellung nachziehen (23.10.2026, Nachprüfung des Schulträgers): Gelöschte Personen
 * stehen bis zum Ablauf noch in den Sicherungen. Wird eine ältere Sicherung zurückgespielt, kämen sie wieder. Darum
 * merkt sich der Server je gelöschtem Konto NUR einen HMAC der Kennung (mit dem Hauptschlüssel, kein Name, keine
 * Kennung im Klartext) und das Datum (`geloeschte_konten`). Der Nachtlauf (loeschkonzept.ts) und „Löschungen
 * nachziehen" in der Verwaltung löschen jedes Konto, dessen Kennung in dieser Liste steht. Einträge nach
 * `GELOESCHT_TAGE` entfernen – länger reicht keine Sicherung zurück.
 * Weil die Tabelle mit der Datenbank zurückgespielt würde, steht dieselbe Liste zusätzlich in einer Textdatei
 * (`system/geloeschte-konten.txt`, je Zeile „HMAC Tag"): WIEDERHERSTELLEN.md legt sie vor dem Zurückspielen beiseite
 * und hängt sie danach wieder an – beim Nachziehen kommt jede Zeile der Datei in die Tabelle.
 */
export const GELOESCHT_TAGE = 400
const geloeschtDatei = (): string => join(systemOrdner(), 'geloeschte-konten.txt')
/** Datenbank im Speicher (Tests): keine Textdatei schreiben oder lesen */
const imSpeicher = (d: DatabaseSync): boolean => {
  try {
    return !(d.prepare('PRAGMA database_list').all() as { name: string; file: string }[]).find((x) => x.name === 'main')?.file
  } catch {
    return true
  }
}

function geloeschtTabelle(d: DatabaseSync): void {
  d.exec('CREATE TABLE IF NOT EXISTS geloeschte_konten (id_hmac TEXT PRIMARY KEY, datum TEXT NOT NULL)')
}

/** HMAC der Kennung (Hauptschlüssel, eigener Zweck) – null ohne Schlüssel */
export function kontoHmac(id: string): string | null {
  try {
    return createHmac('sha256', hauptschluessel()).update(`geloeschtes-konto:${id}`).digest('hex')
  } catch {
    return null
  }
}

/** Gelöschte Kennungen vermerken (nur HMAC und Tag) */
export function geloeschtVermerken(d: DatabaseSync, ids: string[], jetzt = Date.now()): void {
  geloeschtTabelle(d)
  const ein = d.prepare('INSERT OR IGNORE INTO geloeschte_konten (id_hmac, datum) VALUES (?, ?)')
  const tag = new Date(jetzt).toISOString().slice(0, 10)
  const zeilen: string[] = []
  for (const id of ids) {
    const h = kontoHmac(id)
    if (h) (ein.run(h, tag), zeilen.push(`${h} ${tag}`))
  }
  if (!zeilen.length || imSpeicher(d)) return
  try {
    appendFileSync(geloeschtDatei(), zeilen.map((z) => `${z}\n`).join(''), { mode: 0o600 })
  } catch {
    // Datei nicht schreibbar – die Tabelle reicht für den laufenden Betrieb
  }
}

/** Zeilen der Textdatei in die Tabelle übernehmen (nach dem Zurückspielen einer Sicherung) */
function dateiUebernehmen(d: DatabaseSync): void {
  let roh = ''
  if (imSpeicher(d)) return
  try {
    if (existsSync(geloeschtDatei())) roh = readFileSync(geloeschtDatei(), 'utf8')
  } catch {
    return
  }
  const ein = d.prepare('INSERT OR IGNORE INTO geloeschte_konten (id_hmac, datum) VALUES (?, ?)')
  for (const z of roh.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64}) (\d{4}-\d{2}-\d{2})$/.exec(z.trim())
    if (m) ein.run(m[1], m[2])
  }
}

/**
 * Konten, deren Kennung als gelöscht vermerkt ist, erneut löschen (nach dem Zurückspielen einer Sicherung).
 * `entfernen` ist der volle Löschweg (datenbank.ts › kontoEntfernen). Liefert die Zahl der nachgezogenen Konten.
 */
export function loeschungenNachziehen(d: DatabaseSync, entfernen: (id: string) => void, jetzt = Date.now()): number {
  geloeschtTabelle(d)
  dateiUebernehmen(d)
  d.prepare('DELETE FROM geloeschte_konten WHERE datum < ?').run(new Date(jetzt - GELOESCHT_TAGE * 864e5).toISOString().slice(0, 10))
  const alle = d.prepare('SELECT id_hmac, datum FROM geloeschte_konten ORDER BY datum, id_hmac').all() as { id_hmac: string; datum: string }[]
  // Datei = Tabelle (ohne Abgelaufenes und Doppeltes)
  if (!imSpeicher(d))
    try {
      writeFileSync(geloeschtDatei(), alle.map((x) => `${x.id_hmac} ${x.datum}\n`).join(''), { mode: 0o600 })
    } catch {
      // nicht schreibbar – beim nächsten Lauf wieder
    }
  const liste = new Set(alle.map((x) => x.id_hmac))
  if (!liste.size) return 0
  let n = 0
  for (const { id } of d.prepare('SELECT id FROM nutzer').all() as { id: string }[]) {
    const h = kontoHmac(id)
    if (h && liste.has(h)) (entfernen(id), n++)
  }
  return n
}
