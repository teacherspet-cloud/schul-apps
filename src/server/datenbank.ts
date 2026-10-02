/**
 * Datenbank des Servers (02.10.2026) – node:sqlite (in Node 24 eingebaut, keine native Erweiterung).
 *
 * Hier steht nur, was es am PC nicht gibt: Nutzer und Rollen, Sitzungen, Einstellungen des
 * Servers (IServ-Anbindung, freigegebene Schlüssel), das Prüfprotokoll und – in eigenen Dateien –
 * Lerngruppen, Onlinetests und Hörtext-Freigaben. Das Material selbst bleibt in den Ablagen der
 * Nutzer (JSON wie am PC, Ordner je Nutzer).
 *
 * Sitzungen: gespeichert wird nur der SHA-256 des Cookies – wer die Datenbank liest, kann sich
 * damit nicht anmelden. Passwörter (Testkonten, Notzugang) nur als scrypt-Hash.
 */
import { DatabaseSync } from 'node:sqlite'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { DATEN, ordner } from './pfade'
import type { Nutzer, Rolle } from './kontext'
import { entschluessle, verschluessle } from './geheim'
import { geschuetzt, migriere, SENSIBEL } from './feldschutz'

let db: DatabaseSync | null = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS nutzer (
  id TEXT PRIMARY KEY,
  benutzer TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  rolle TEXT NOT NULL,
  quelle TEXT NOT NULL,
  passwort_hash TEXT,
  gesperrt INTEGER NOT NULL DEFAULT 0,
  eingerichtet INTEGER NOT NULL DEFAULT 0,
  gruppen TEXT NOT NULL DEFAULT '[]',
  iserv_sub TEXT,
  erstellt TEXT NOT NULL,
  zuletzt TEXT
);
CREATE TABLE IF NOT EXISTS sitzungen (
  hash TEXT PRIMARY KEY,
  kennung TEXT NOT NULL,
  nutzer_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  erstellt TEXT NOT NULL,
  laeuft_ab INTEGER NOT NULL,
  zuletzt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sitzungen_nutzer ON sitzungen(nutzer_id);
CREATE TABLE IF NOT EXISTS server_einstellungen (
  schluessel TEXT PRIMARY KEY,
  wert TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS protokoll (
  nr INTEGER PRIMARY KEY AUTOINCREMENT,
  zeit TEXT NOT NULL,
  nutzer_id TEXT,
  art TEXT NOT NULL,
  text TEXT NOT NULL
);
`

export function datenbank(datei = join(DATEN, 'schulapps.db')): DatabaseSync {
  if (db) return db
  ordner()
  const roh = new DatabaseSync(datei)
  roh.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  roh.exec(SCHEMA)
  ergaenze(roh)
  // Personenbezogenes nur verschlüsselt (feldschutz.ts): alle vorhandenen Tabellen gleich beim Start umschreiben
  for (const t of Object.keys(SENSIBEL)) migriere(roh, t)
  db = geschuetzt(roh)
  return db
}

/** Nur für Tests: eigene Datenbank im Speicher */
export function datenbankFuerTests(): DatabaseSync {
  db?.close()
  const roh = new DatabaseSync(':memory:')
  roh.exec('PRAGMA foreign_keys = ON;')
  roh.exec(SCHEMA)
  ergaenze(roh)
  migriere(roh, 'nutzer')
  db = geschuetzt(roh)
  return db
}

/** Spalten, die nach der ersten Fassung dazukamen (vorhandene Datenbanken nachrüsten) */
function ergaenze(d: DatabaseSync): void {
  const spalten = new Set((d.prepare('PRAGMA table_info(nutzer)').all() as { name: string }[]).map((s) => s.name))
  // Vom Admin angelegte Konten: vorübergehendes Passwort, bei der ersten Anmeldung zu ändern (02.10.2026)
  if (!spalten.has('passwort_wechseln')) d.exec('ALTER TABLE nutzer ADD COLUMN passwort_wechseln INTEGER NOT NULL DEFAULT 0')
}

const jetzt = (): string => new Date().toISOString()

// ---------------------------------------------------------------- Nutzer

interface NutzerZeile {
  id: string
  benutzer: string
  name: string
  rolle: Rolle
  quelle: Nutzer['quelle']
  passwort_hash: string | null
  gesperrt: number
  eingerichtet: number
  gruppen: string
  erstellt: string
  zuletzt: string | null
  passwort_wechseln: number
}

export interface NutzerInfo extends Nutzer {
  gesperrt: boolean
  eingerichtet: boolean
  gruppen: { id: string; name: string }[]
  erstellt: string
  zuletzt: string | null
  hatPasswort: boolean
  /** Vorübergehendes Passwort – bei der nächsten Anmeldung ein eigenes setzen */
  passwortWechseln: boolean
}

const alsInfo = (z: NutzerZeile): NutzerInfo => ({
  id: z.id,
  benutzer: z.benutzer,
  name: z.name,
  rolle: z.rolle,
  quelle: z.quelle,
  gesperrt: Boolean(z.gesperrt),
  eingerichtet: Boolean(z.eingerichtet),
  gruppen: (() => {
    try {
      return JSON.parse(z.gruppen) as { id: string; name: string }[]
    } catch {
      return []
    }
  })(),
  erstellt: z.erstellt,
  zuletzt: z.zuletzt,
  hatPasswort: Boolean(z.passwort_hash),
  passwortWechseln: Boolean(z.passwort_wechseln)
})

export function nutzerNachBenutzer(benutzer: string): NutzerInfo | null {
  const z = datenbank().prepare('SELECT * FROM nutzer WHERE benutzer = ?').get(benutzer.toLowerCase()) as NutzerZeile | undefined
  return z ? alsInfo(z) : null
}

export function nutzerNachId(id: string): NutzerInfo | null {
  const z = datenbank().prepare('SELECT * FROM nutzer WHERE id = ?').get(id) as NutzerZeile | undefined
  return z ? alsInfo(z) : null
}

export const passwortHashVon = (benutzer: string): string | null =>
  ((datenbank().prepare('SELECT passwort_hash FROM nutzer WHERE benutzer = ?').get(benutzer.toLowerCase()) as { passwort_hash: string | null } | undefined)
    ?.passwort_hash ?? null)

export function alleNutzer(): NutzerInfo[] {
  // Sortiert nach dem (entschlüsselten) Benutzernamen – in der Spalte steht nur der Suchschlüssel
  return (datenbank().prepare('SELECT * FROM nutzer').all() as unknown as NutzerZeile[])
    .map(alsInfo)
    .sort((a, b) => a.rolle.localeCompare(b.rolle) || a.benutzer.localeCompare(b.benutzer))
}

/** Neue Kennung für einen Nutzer: Kleinbuchstaben/Ziffern (taugt als Ordnername) */
export const neueNutzerId = (): string => randomUUID().replace(/-/g, '').slice(0, 20)

export function nutzerAnlegen(n: {
  benutzer: string
  name: string
  rolle: Rolle
  quelle: Nutzer['quelle']
  passwortHash?: string
  gruppen?: { id: string; name: string }[]
  passwortWechseln?: boolean
}): NutzerInfo {
  const id = neueNutzerId()
  datenbank()
    .prepare('INSERT INTO nutzer (id, benutzer, benutzer_v, name, rolle, quelle, passwort_hash, gruppen, erstellt, passwort_wechseln) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, n.benutzer.toLowerCase(), n.benutzer.toLowerCase(), n.name, n.rolle, n.quelle, n.passwortHash ?? null, JSON.stringify(n.gruppen ?? []), jetzt(), n.passwortWechseln ? 1 : 0)
  return nutzerNachId(id)!
}

export function nutzerAendern(
  id: string,
  patch: Partial<{ name: string; rolle: Rolle; quelle: Nutzer['quelle']; passwortHash: string | null; gesperrt: boolean; eingerichtet: boolean; gruppen: { id: string; name: string }[]; passwortWechseln: boolean }>
): void {
  const felder: string[] = []
  const werte: (string | number | null)[] = []
  if (patch.name !== undefined) (felder.push('name = ?'), werte.push(patch.name))
  if (patch.rolle !== undefined) (felder.push('rolle = ?'), werte.push(patch.rolle))
  if (patch.quelle !== undefined) (felder.push('quelle = ?'), werte.push(patch.quelle))
  if (patch.passwortHash !== undefined) (felder.push('passwort_hash = ?'), werte.push(patch.passwortHash))
  if (patch.gesperrt !== undefined) (felder.push('gesperrt = ?'), werte.push(patch.gesperrt ? 1 : 0))
  if (patch.eingerichtet !== undefined) (felder.push('eingerichtet = ?'), werte.push(patch.eingerichtet ? 1 : 0))
  if (patch.gruppen !== undefined) (felder.push('gruppen = ?'), werte.push(JSON.stringify(patch.gruppen)))
  if (patch.passwortWechseln !== undefined) (felder.push('passwort_wechseln = ?'), werte.push(patch.passwortWechseln ? 1 : 0))
  if (!felder.length) return
  datenbank()
    .prepare(`UPDATE nutzer SET ${felder.join(', ')} WHERE id = ?`)
    .run(...werte, id)
}

export function nutzerLoeschen(id: string): void {
  datenbank().prepare('DELETE FROM nutzer WHERE id = ?').run(id)
}

export const nutzerGesehen = (id: string): void => void datenbank().prepare('UPDATE nutzer SET zuletzt = ? WHERE id = ?').run(jetzt(), id)

// ---------------------------------------------------------------- Sitzungen

const hash = (s: string): string => createHash('sha256').update(s).digest('hex')

/** Gültigkeit: Lehrkräfte 180 Tage (gleitend), Schülerinnen und Schüler 12 Stunden */
export const SITZUNG_MS: Record<Rolle, number> = { admin: 180 * 864e5, lehrkraft: 180 * 864e5, schueler: 12 * 36e5 }

export function sitzungAnlegen(nutzerId: string, rolle: Rolle): { cookie: string; kennung: string; laeuftAb: number } {
  const cookie = randomBytes(32).toString('base64url')
  const kennung = randomBytes(6).toString('hex')
  const laeuftAb = Date.now() + SITZUNG_MS[rolle]
  datenbank()
    .prepare('INSERT INTO sitzungen (hash, kennung, nutzer_id, erstellt, laeuft_ab, zuletzt) VALUES (?, ?, ?, ?, ?, ?)')
    .run(hash(cookie), kennung, nutzerId, jetzt(), laeuftAb, Date.now())
  return { cookie, kennung, laeuftAb }
}

/** Sitzung zum Cookie – verlängert sie gleitend (höchstens einmal je Stunde geschrieben) */
export function sitzungPruefen(cookie: string): { nutzer: NutzerInfo; kennung: string; laeuftAb: number } | null {
  if (!cookie || cookie.length > 200) return null
  const h = hash(cookie)
  const s = datenbank().prepare('SELECT kennung, nutzer_id, laeuft_ab, zuletzt FROM sitzungen WHERE hash = ?').get(h) as
    | { kennung: string; nutzer_id: string; laeuft_ab: number; zuletzt: number }
    | undefined
  if (!s) return null
  if (s.laeuft_ab < Date.now()) {
    datenbank().prepare('DELETE FROM sitzungen WHERE hash = ?').run(h)
    return null
  }
  const nutzer = nutzerNachId(s.nutzer_id)
  if (!nutzer || nutzer.gesperrt) return null
  let laeuftAb = s.laeuft_ab
  if (Date.now() - s.zuletzt > 36e5) {
    laeuftAb = Date.now() + SITZUNG_MS[nutzer.rolle]
    datenbank().prepare('UPDATE sitzungen SET laeuft_ab = ?, zuletzt = ? WHERE hash = ?').run(laeuftAb, Date.now(), h)
    nutzerGesehen(nutzer.id)
  }
  return { nutzer, kennung: s.kennung, laeuftAb }
}

export const sitzungBeenden = (cookie: string): void => void datenbank().prepare('DELETE FROM sitzungen WHERE hash = ?').run(hash(cookie))
export const sitzungenDesNutzersBeenden = (nutzerId: string): void => void datenbank().prepare('DELETE FROM sitzungen WHERE nutzer_id = ?').run(nutzerId)
export const abgelaufeneSitzungenEntfernen = (): void => void datenbank().prepare('DELETE FROM sitzungen WHERE laeuft_ab < ?').run(Date.now())

// ---------------------------------------------------------------- Einstellungen des Servers

/** Klartext-Einstellung (JSON) */
export function serverWert<T>(schluessel: string, rueckfall: T): T {
  const z = datenbank().prepare('SELECT wert FROM server_einstellungen WHERE schluessel = ?').get(schluessel) as { wert: string } | undefined
  if (!z) return rueckfall
  try {
    return JSON.parse(z.wert) as T
  } catch {
    return rueckfall
  }
}

export function setzeServerWert(schluessel: string, wert: unknown): void {
  datenbank()
    .prepare('INSERT INTO server_einstellungen (schluessel, wert) VALUES (?, ?) ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert')
    .run(schluessel, JSON.stringify(wert))
}

/** Verschlüsselte Einstellung (Geheimnisse) – liegt nie im Klartext in der Datenbank */
export function serverGeheimnis(schluessel: string): string {
  const v = serverWert<string>(`geheim:${schluessel}`, '')
  if (!v) return ''
  try {
    return entschluessle(v)
  } catch {
    return ''
  }
}

export function setzeServerGeheimnis(schluessel: string, wert: string): void {
  if (!wert) {
    datenbank().prepare('DELETE FROM server_einstellungen WHERE schluessel = ?').run(`geheim:${schluessel}`)
    return
  }
  setzeServerWert(`geheim:${schluessel}`, verschluessle(wert))
}

// ---------------------------------------------------------------- Prüfprotokoll

/** Ein Eintrag OHNE Klarnamen und ohne Inhalte – nur, was geschah */
export function protokolliereServer(art: string, text: string, nutzerId?: string): void {
  try {
    datenbank().prepare('INSERT INTO protokoll (zeit, nutzer_id, art, text) VALUES (?, ?, ?, ?)').run(jetzt(), nutzerId ?? null, art, text.slice(0, 500))
    // Höchstens 20 000 Einträge
    datenbank().prepare('DELETE FROM protokoll WHERE nr <= (SELECT MAX(nr) - 20000 FROM protokoll)').run()
  } catch {
    // Das Protokoll darf nie den Betrieb stören
  }
}

export function leseServerProtokoll(anzahl = 300): { zeit: string; nutzer_id: string | null; art: string; text: string }[] {
  return datenbank().prepare('SELECT zeit, nutzer_id, art, text FROM protokoll ORDER BY nr DESC LIMIT ?').all(anzahl) as unknown as {
    zeit: string
    nutzer_id: string | null
    art: string
    text: string
  }[]
}
