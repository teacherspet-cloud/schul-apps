/**
 * Fachobleute der Schule (12.10.2026, Wunsch der Lehrkraft; Regeln in shared/fachobleute.ts).
 *
 *   GET  /server/fachobleute  – Lehrkräfte: die eigenen Fächer ({ eigene }); Admin dazu alle Zuordnungen und die
 *                               Lehrkräfte zur Auswahl ({ eigene, obleute: { nutzerId: [fach] }, lehrkraefte })
 *   POST /server/fachobleute  – { nutzerId, faecher } setzen (nur Admin, mit x-schulapps-token); leere Liste = keine
 *
 * Gespeichert in der Tabelle `fach_obleute` (nutzer_id → Fächer als JSON). Die Fächer einer Person sind eine Angabe zur
 * Person – die Spalte steht deshalb in SENSIBEL (feldschutz.ts) und liegt nur verschlüsselt vor. Löschen eines Kontos
 * löscht die Zuordnung mit (ON DELETE CASCADE). Die Dienste des Hauptprozesses fragen über main/services/rolle.ts
 * (`setzeFachobmannQuelle` in start.ts), /server/ich.js liefert die eigenen Fächer an die Oberfläche.
 */
import { pruefeFaecher } from '@shared/fachobleute'
import { alleNutzer, datenbank, nutzerNachId, protokolliereServer } from './datenbank'
import { json, type Anfrage } from './http'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS fach_obleute (
  nutzer_id TEXT PRIMARY KEY REFERENCES nutzer(id) ON DELETE CASCADE,
  daten TEXT NOT NULL DEFAULT '[]',
  stand TEXT NOT NULL
);
`
let bereit: unknown = null
const db = () => {
  const d = datenbank()
  if (bereit !== d) {
    d.exec(SCHEMA)
    bereit = d
  }
  return d
}

/** Kurzer Zwischenspeicher je Person (jede Anfrage fragt sonst neu und entschlüsselt) */
const merk = new Map<string, { faecher: string[]; zeit: number }>()

/** Fächer, für die diese Person Fachobfrau/-mann ist */
export function fachobmannFaecher(nutzerId: string | undefined): string[] {
  if (!nutzerId) return []
  const m = merk.get(nutzerId)
  if (m && Date.now() - m.zeit < 10_000) return m.faecher
  let faecher: string[] = []
  try {
    const z = db().prepare('SELECT daten FROM fach_obleute WHERE nutzer_id = ?').get(nutzerId) as { daten: string } | undefined
    faecher = z ? pruefeFaecher(JSON.parse(z.daten)) : []
  } catch {
    faecher = []
  }
  merk.set(nutzerId, { faecher, zeit: Date.now() })
  return faecher
}

/** Alle Zuordnungen (nur Konten mit mindestens einem Fach) */
export function alleFachobleute(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const z of db().prepare('SELECT nutzer_id, daten FROM fach_obleute').all() as { nutzer_id: string; daten: string }[]) {
    try {
      const f = pruefeFaecher(JSON.parse(z.daten))
      if (f.length) out[z.nutzer_id] = f
    } catch {
      // beschädigter Eintrag: zählt nicht
    }
  }
  return out
}

/** Fächer einer Lehrkraft setzen (leer = keine Fachobfrau/kein Fachobmann mehr) */
export function setzeFachobmann(nutzerId: string, roh: unknown): string[] | { fehler: string } {
  const n = nutzerNachId(nutzerId)
  if (!n || (n.rolle !== 'lehrkraft' && n.rolle !== 'admin')) return { fehler: 'Fachobleute können nur Lehrkräfte sein.' }
  const faecher = pruefeFaecher(roh)
  if (!faecher.length) db().prepare('DELETE FROM fach_obleute WHERE nutzer_id = ?').run(nutzerId)
  else
    db()
      .prepare(
        'INSERT INTO fach_obleute (nutzer_id, daten, stand) VALUES (?, ?, ?) ON CONFLICT(nutzer_id) DO UPDATE SET daten = excluded.daten, stand = excluded.stand'
      )
      .run(nutzerId, JSON.stringify(faecher), new Date().toISOString())
  merk.delete(nutzerId)
  return faecher
}

export async function fachobleuteRoute(k: Anfrage): Promise<boolean> {
  const { url, req, res, sitzung } = k
  if (url.pathname !== '/server/fachobleute') return false
  if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
  const ich = sitzung.nutzer
  if (ich.rolle === 'schueler') return json(res, 403, { fehler: 'Kein Zugang.' }), true
  if (req.method === 'GET') {
    if (ich.rolle !== 'admin') return json(res, 200, { eigene: fachobmannFaecher(ich.id) }), true
    const lehrkraefte = alleNutzer()
      .filter((n) => (n.rolle === 'lehrkraft' || n.rolle === 'admin') && !n.gesperrt)
      .map((n) => ({ id: n.id, name: n.name, benutzer: n.benutzer, rolle: n.rolle }))
    return json(res, 200, { eigene: fachobmannFaecher(ich.id), obleute: alleFachobleute(), lehrkraefte }), true
  }
  if (req.method !== 'POST') return json(res, 405, { fehler: 'Nicht erlaubt.' }), true
  if (typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nur aus der App.' }), true
  if (ich.rolle !== 'admin') return json(res, 403, { fehler: 'Nur für die Verwaltung.' }), true
  const b = ((await k.koerper()) ?? {}) as Record<string, unknown>
  if (typeof b.nutzerId !== 'string') return json(res, 400, { fehler: 'Lehrkraft fehlt.' }), true
  const r = setzeFachobmann(b.nutzerId, b.faecher)
  if (!Array.isArray(r)) return json(res, 400, r), true
  protokolliereServer('verwaltung', `Fachobleute geändert (${r.length ? r.join(', ') : 'keine Fächer'})`, ich.id)
  return json(res, 200, { obleute: alleFachobleute() }), true
}
