/**
 * Krisenhinweise (22.10.2026, Entscheidung der Lehrkraft nach der KI-Sicherheitsprüfung): Äußert ein Kind etwas zu
 * Selbstgefährdung (Sprechtrainer, Lerntagebuch, Rückmeldebogen, Arbeitsblatt …), gilt das NIE als Vorfall und führt nie
 * zu einer Sperre. Das Kind bekommt einen festen, freundlichen Hilfetext; die zuständige Lehrkraft bekommt einen
 * vertraulichen Hinweis OHNE Wortlaut (nur wer, wo, wann).
 *
 * Erkennung auf zwei Wegen:
 *  - `kriseVerdacht(text)`: einfache Wortliste (de/en/fr/es), ohne KI – Faustregel, lieber einmal zu oft
 *  - Feld `krise` in den Antwort-Schemata der KI (KRISEN_REGEL in den Anweisungen für Lernenden-Wege)
 *  - im Sprechtrainer zusätzlich die Moderation (Kategorie self-harm*)
 */
import { randomBytes } from 'node:crypto'
import { alleNutzer, datenbank } from './datenbank'
import { json, type Anfrage } from './http'

export { HILFETEXT, KRISEN_REGEL, KRISEN_FELD, kriseVerdacht } from '../shared/krise'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS krisen_hinweise (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL,
  schueler_id TEXT NOT NULL,
  quelle TEXT NOT NULL,
  zeit INTEGER NOT NULL,
  gesehen INTEGER
);`

let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(SCHEMA)
    bereit = true
  }
  return d
}

/** Hinweise nach 30 Tagen löschen – der Hinweis ist ein Anlass zum Gespräch, kein Akteneintrag */
const AUFBEWAHREN = 30 * 24 * 3600 * 1000
/** Höchstens ein Hinweis je Kind, Quelle und Stunde */
const SPERRE = 3600 * 1000

/**
 * Vertraulichen Hinweis an die Lehrkraft. `quelle` ist eine kurze Ortsangabe ohne Inhalt, z. B. „Sprechtraining
 * (Englisch 7b)“ oder „Lerntagebuch: Reihe Julikrise“. Nie Wortlaut übergeben.
 */
export function kriseMelden(lehrkraftId: string, schuelerId: string, quelle: string, jetzt = Date.now()): void {
  if (!lehrkraftId || !schuelerId) return
  const d = db()
  d.prepare('DELETE FROM krisen_hinweise WHERE zeit < ?').run(jetzt - AUFBEWAHREN)
  const q = String(quelle).slice(0, 120)
  const frisch = d
    .prepare('SELECT 1 FROM krisen_hinweise WHERE lehrkraft_id = ? AND schueler_id = ? AND quelle = ? AND zeit > ?')
    .get(lehrkraftId, schuelerId, q, jetzt - SPERRE)
  if (frisch) return
  d.prepare('INSERT INTO krisen_hinweise (id, lehrkraft_id, schueler_id, quelle, zeit) VALUES (?, ?, ?, ?, ?)').run(
    randomBytes(9).toString('base64url'),
    lehrkraftId,
    schuelerId,
    q,
    jetzt
  )
}

export interface KrisenHinweis {
  id: string
  schuelerId: string
  /** Anzeigename der/des Lernenden (22.10.2026, am Server aufgelöst – nur für die eigene Lehrkraft) */
  name: string
  quelle: string
  zeit: number
  gesehen?: number
}

export function krisenHinweise(lehrkraftId: string): KrisenHinweis[] {
  const d = db()
  d.prepare('DELETE FROM krisen_hinweise WHERE zeit < ?').run(Date.now() - AUFBEWAHREN)
  // Name wie im Überblick des Sprechtrainings (Name, sonst Benutzername)
  const namen = new Map(alleNutzer().map((n) => [n.id, n.name || n.benutzer] as const))
  return (
    d.prepare('SELECT id, schueler_id, quelle, zeit, gesehen FROM krisen_hinweise WHERE lehrkraft_id = ? ORDER BY zeit DESC LIMIT 100').all(lehrkraftId) as {
      id: string
      schueler_id: string
      quelle: string
      zeit: number
      gesehen: number | null
    }[]
  ).map((r) => ({ id: r.id, schuelerId: r.schueler_id, name: namen.get(r.schueler_id) ?? 'Unbekannte Person', quelle: r.quelle, zeit: r.zeit, ...(r.gesehen ? { gesehen: r.gesehen } : {}) }))
}

/** GET /server/krisen (eigene Hinweise), POST /server/krisen/gesehen { id } – nur Lehrkräfte */
export function kriseRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    if (!url.pathname.startsWith('/server/krisen')) return false
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer
    if (ich.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
    if (req.method === 'GET' && url.pathname === '/server/krisen') return (json(res, 200, { hinweise: krisenHinweise(ich.id) }), true)
    if (req.method === 'POST' && url.pathname === '/server/krisen/gesehen') {
      if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nicht erlaubt.' }), true)
      const b = (await k.koerper()) as { id?: unknown }
      db().prepare('UPDATE krisen_hinweise SET gesehen = ? WHERE id = ? AND lehrkraft_id = ?').run(Date.now(), String(b?.id ?? ''), ich.id)
      return (json(res, 200, { ok: true }), true)
    }
    return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  }
}
