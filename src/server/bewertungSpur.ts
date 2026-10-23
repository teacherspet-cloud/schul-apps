/**
 * Verlauf der Bewertung (23.10.2026, Prüfung des Schulträgers, Punkt 8 „menschliche Aufsicht über KI-Bewertungen";
 * Art. 22 DSGVO, § 50 NSchG, KI-Verordnung Anhang III Nr. 3): Jede Bewertung, an der die KI beteiligt ist, hinterlässt
 * eine Spur – was die KI vorgeschlagen hat und was die Lehrkraft daraus gemacht hat (bestätigt, geändert, selbst
 * entschieden). Die Lehrkraft sieht den Verlauf je Person und Test/Schritt („Verlauf der Bewertung").
 *
 *  - `ki_vorschlag` und `entscheidung` sind JSON und liegen verschlüsselt (feldschutz.ts SENSIBEL `bewertung_spur`).
 *  - `schueler_id` heißt bewusst so: Beim Löschen eines Kontos werden alle Zeilen mit dieser Spalte mitgelöscht
 *    (kontoEntfernen, Vollständigkeitstest der Kontolöschung). Zusätzlich `spurLoeschen` für Tests/Teilnahmen.
 *  - Eine Spur darf eine Bewertung nie verhindern: Fehler beim Schreiben werden geschluckt.
 */
import { randomBytes } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { datenbank } from './datenbank'

// 'bogen' entfernt (23.10.2026, Nachprüfung des Schulträgers): Rückmeldebögen haben keinen Bestätigungsschritt der Lehrkraft
export type SpurArt = 'onlinetest' | 'abschluss' | 'mitarbeit'
/** ki = Vorschlag der KI; lehrkraft = selbst entschieden (ohne Vorschlag); bestaetigt = Vorschlag übernommen; geaendert = Vorschlag geändert */
export type SpurQuelle = 'ki' | 'lehrkraft' | 'bestaetigt' | 'geaendert'

export interface SpurEintrag {
  id: string
  art: SpurArt
  bezugId: string
  schuelerId: string
  lehrkraftId: string
  kiVorschlag?: unknown
  entscheidung?: unknown
  zeit: number
  quelle: SpurQuelle
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS bewertung_spur (
  id TEXT PRIMARY KEY,
  art TEXT NOT NULL,
  bezug_id TEXT NOT NULL,
  schueler_id TEXT NOT NULL,
  lehrkraft_id TEXT NOT NULL,
  ki_vorschlag TEXT,
  entscheidung TEXT,
  zeit INTEGER NOT NULL,
  quelle TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bewertung_spur_bezug ON bewertung_spur(art, bezug_id, schueler_id);
CREATE INDEX IF NOT EXISTS bewertung_spur_schueler ON bewertung_spur(schueler_id);`

// Je Datenbank einmal anlegen (Tests wechseln die Datenbank)
let bereitFuer: DatabaseSync | null = null
const db = (): DatabaseSync => {
  const d = datenbank()
  if (bereitFuer !== d) {
    d.exec(SCHEMA)
    bereitFuer = d
  }
  return d
}

const ARTEN: SpurArt[] = ['onlinetest', 'abschluss', 'mitarbeit']
const QUELLEN: SpurQuelle[] = ['ki', 'lehrkraft', 'bestaetigt', 'geaendert']

/** Höchstens so viel JSON je Feld (ein Vorschlag mit Begründungen passt bequem hinein) */
const MAX_JSON = 20_000

const alsJson = (w: unknown): string | null => {
  if (w === undefined || w === null) return null
  const s = JSON.stringify(w)
  return s.length > MAX_JSON ? JSON.stringify({ gekuerzt: true, anfang: s.slice(0, MAX_JSON) }) : s
}

/** Einen Eintrag schreiben – nie mit Fehler (die Bewertung selbst geht vor) */
export function spurEintragen(e: {
  art: SpurArt
  bezugId: string
  schuelerId: string
  lehrkraftId: string
  quelle: SpurQuelle
  kiVorschlag?: unknown
  entscheidung?: unknown
  zeit?: number
}): void {
  if (!ARTEN.includes(e.art) || !QUELLEN.includes(e.quelle) || !e.bezugId || !e.schuelerId) return
  try {
    db()
      .prepare(
        'INSERT INTO bewertung_spur (id, art, bezug_id, schueler_id, lehrkraft_id, ki_vorschlag, entscheidung, zeit, quelle) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        randomBytes(9).toString('base64url'),
        e.art,
        e.bezugId,
        e.schuelerId,
        e.lehrkraftId ?? '',
        alsJson(e.kiVorschlag),
        alsJson(e.entscheidung),
        e.zeit ?? Date.now(),
        e.quelle
      )
  } catch {
    /* Spur fehlt lieber, als dass die Bewertung scheitert */
  }
}

const lies = (s: string | null): unknown => {
  if (s == null || s === '') return undefined
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}

/** Verlauf für die eigene Lehrkraft (älteste zuerst); ohne `schuelerId` alle Personen des Bezugs */
export function spurVon(f: { lehrkraftId: string; art: SpurArt; bezugId: string; schuelerId?: string }): SpurEintrag[] {
  const zeilen = (
    f.schuelerId
      ? db()
          .prepare('SELECT * FROM bewertung_spur WHERE lehrkraft_id = ? AND art = ? AND bezug_id = ? AND schueler_id = ? ORDER BY zeit, rowid')
          .all(f.lehrkraftId, f.art, f.bezugId, f.schuelerId)
      : db().prepare('SELECT * FROM bewertung_spur WHERE lehrkraft_id = ? AND art = ? AND bezug_id = ? ORDER BY zeit, rowid').all(f.lehrkraftId, f.art, f.bezugId)
  ) as {
    id: string
    art: SpurArt
    bezug_id: string
    schueler_id: string
    lehrkraft_id: string
    ki_vorschlag: string | null
    entscheidung: string | null
    zeit: number
    quelle: SpurQuelle
  }[]
  return zeilen.map((z) => {
    const v = lies(z.ki_vorschlag)
    const e = lies(z.entscheidung)
    return {
      id: z.id,
      art: z.art,
      bezugId: z.bezug_id,
      schuelerId: z.schueler_id,
      lehrkraftId: z.lehrkraft_id,
      zeit: z.zeit,
      quelle: z.quelle,
      ...(v !== undefined ? { kiVorschlag: v } : {}),
      ...(e !== undefined ? { entscheidung: e } : {})
    }
  })
}

/** Spur eines gelöschten Tests/Schritts (ohne `schuelerId`) bzw. einer entfernten Teilnahme */
export function spurLoeschen(art: SpurArt, bezugId: string, schuelerId?: string): void {
  try {
    if (schuelerId) db().prepare('DELETE FROM bewertung_spur WHERE art = ? AND bezug_id = ? AND schueler_id = ?').run(art, bezugId, schuelerId)
    else db().prepare('DELETE FROM bewertung_spur WHERE art = ? AND bezug_id = ?').run(art, bezugId)
  } catch {
    /* nichts zu löschen */
  }
}

/** Alle Einträge einer Person (für die Kontolöschung, falls dort gezielt aufgerufen) */
export const spurDerPersonLoeschen = (schuelerId: string): void => {
  try {
    db().prepare('DELETE FROM bewertung_spur WHERE schueler_id = ?').run(schuelerId)
  } catch {
    /* nichts zu löschen */
  }
}
