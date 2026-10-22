/**
 * Datenpannen (22.10.2026, Prüfung des Schulträgers, Punkt 12 – Art. 33/34 DSGVO): Die Verwaltung legt einen Vorfall an,
 * sieht die 72-Stunden-Frist ab der Entdeckung, hakt die Checkliste ab und erzeugt den Text für die Meldung an die LfD
 * Niedersachsen (Regeln: shared/datenpanne.ts). Nur Admins.
 *
 * Datenschutz: Der Inhalt (`daten`, JSON) liegt verschlüsselt (feldschutz.ts SENSIBEL `datenpannen`). Lesbar bleiben nur
 * Kennung und Zeitpunkte – sie werden für Sortierung und Frist gebraucht und nennen keine Person.
 * Aufbewahrung: Vorfälle werden NICHT automatisch gelöscht – Art. 33 Abs. 5 verlangt die Dokumentation, damit die
 * Aufsichtsbehörde die Einhaltung prüfen kann. Löschen kann die Verwaltung einen Eintrag ausdrücklich.
 */
import { randomBytes } from 'node:crypto'
import { datenbank, protokolliereServer } from './datenbank'
import { json, type Anfrage } from './http'
import { pannePruefen, type Datenpanne, type PannenDaten } from '../shared/datenpanne'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS datenpannen (
  id TEXT PRIMARY KEY,
  entdeckt INTEGER NOT NULL,
  erstellt INTEGER NOT NULL,
  abgeschlossen INTEGER,
  daten TEXT NOT NULL
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

/** Für Tests nach einer neuen Datenbank */
export const datenpannenZuruecksetzen = (): void => {
  bereit = false
}

interface Zeile {
  id: string
  entdeckt: number
  erstellt: number
  abgeschlossen: number | null
  daten: string
}

function ausZeile(z: Zeile): Datenpanne {
  let d: PannenDaten
  try {
    d = JSON.parse(z.daten) as PannenDaten
  } catch {
    d = { was: '(nicht lesbar)', datenarten: '', personen: 0, datensaetze: 0, massnahmen: '', risiko: 'risiko', erledigt: {} }
  }
  return { ...d, erledigt: d.erledigt ?? {}, id: z.id, entdeckt: z.entdeckt, erstellt: z.erstellt, ...(z.abgeschlossen ? { abgeschlossen: z.abgeschlossen } : {}) }
}

/** Alle Vorfälle, neueste Entdeckung zuerst */
export function datenpannen(): Datenpanne[] {
  return (db().prepare('SELECT id, entdeckt, erstellt, abgeschlossen, daten FROM datenpannen ORDER BY entdeckt DESC').all() as unknown as Zeile[]).map(ausZeile)
}

export function datenpanne(id: string): Datenpanne | null {
  const z = db().prepare('SELECT id, entdeckt, erstellt, abgeschlossen, daten FROM datenpannen WHERE id = ?').get(id) as unknown as Zeile | undefined
  return z ? ausZeile(z) : null
}

export function datenpanneAnlegen(roh: Record<string, unknown>, jetzt = Date.now()): Datenpanne | { fehler: string } {
  const p = pannePruefen(roh, jetzt)
  if ('fehler' in p) return p
  const id = randomBytes(9).toString('base64url')
  db().prepare('INSERT INTO datenpannen (id, entdeckt, erstellt, daten) VALUES (?, ?, ?, ?)').run(id, p.entdeckt, jetzt, JSON.stringify(p.daten))
  return datenpanne(id)!
}

/** Ändern (Maßnahmen ergänzen, Checkliste abhaken, abschließen) – die Entdeckung bleibt änderbar, falls falsch erfasst */
export function datenpanneAendern(id: string, roh: Record<string, unknown>, jetzt = Date.now()): Datenpanne | { fehler: string } {
  const alt = datenpanne(id)
  if (!alt) return { fehler: 'Vorfall nicht gefunden.' }
  const p = pannePruefen({ ...alt, ...roh, erledigt: { ...alt.erledigt, ...((roh.erledigt as object) ?? {}) } }, jetzt)
  if ('fehler' in p) return p
  const abgeschlossen = roh.abgeschlossen === true ? alt.abgeschlossen ?? jetzt : roh.abgeschlossen === false ? null : alt.abgeschlossen ?? null
  db().prepare('UPDATE datenpannen SET daten = ?, entdeckt = ?, abgeschlossen = ? WHERE id = ?').run(JSON.stringify(p.daten), p.entdeckt, abgeschlossen, id)
  return datenpanne(id)!
}

export function datenpanneLoeschen(id: string): boolean {
  return db().prepare('DELETE FROM datenpannen WHERE id = ?').run(id).changes > 0
}

/** /server/datenpannen – nur Admins */
export function datenpanneRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    if (!url.pathname.startsWith('/server/datenpannen')) return false
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer
    if (ich.rolle !== 'admin') return (json(res, 403, { fehler: 'Nur für die Verwaltung.' }), true)
    const teil = url.pathname.slice('/server/datenpannen'.length).replace(/^\//, '')
    if (req.method === 'GET') {
      if (!teil) return (json(res, 200, { pannen: datenpannen() }), true)
      return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    }
    if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
    if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nicht erlaubt.' }), true)
    const b = ((await k.koerper()) ?? {}) as Record<string, unknown>
    if (teil === 'neu') {
      const r = datenpanneAnlegen({ ...b, von: ich.name })
      if ('fehler' in r) return (json(res, 400, r), true)
      // Protokoll ohne Inhalt – nur dass ein Vorfall angelegt wurde
      protokolliereServer('verwaltung', 'Datenpanne dokumentiert', ich.id)
      return (json(res, 200, { panne: r }), true)
    }
    if (teil === 'aendern') {
      const r = datenpanneAendern(String(b.id ?? ''), b)
      if ('fehler' in r) return (json(res, 400, r), true)
      return (json(res, 200, { panne: r }), true)
    }
    if (teil === 'loeschen') {
      const ok = datenpanneLoeschen(String(b.id ?? ''))
      if (ok) protokolliereServer('verwaltung', 'Dokumentierte Datenpanne gelöscht', ich.id)
      return (json(res, 200, { ok }), true)
    }
    return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  }
}
