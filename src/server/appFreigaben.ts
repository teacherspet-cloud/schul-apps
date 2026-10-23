/**
 * App-Freigaben der Schule (23.10.2026, Wunsch der Lehrkraft; Regeln in shared/appFreigaben.ts).
 *
 *   GET  /server/app-freigaben – nur Admin: { gruppen, lehrkraefte }
 *   POST /server/app-freigaben – { gruppen } ersetzen (nur Admin, mit x-schulapps-token)
 *
 * Gespeichert als eine Zeile der Tabelle `app_freigaben` (alle Gruppen als JSON). Wer in welcher Gruppe ist, ist eine
 * Angabe zur Person – die Spalte steht deshalb in SENSIBEL (feldschutz.ts) und liegt nur verschlüsselt vor.
 * /server/ich.js liefert die eigenen Apps an die Oberfläche, http.ts sperrt Änderungen an fremden Ablagen.
 */
import { appsAus, grundgruppe, pruefeGruppen, type AppGruppe } from '@shared/appFreigaben'
import { alleNutzer, datenbank, protokolliereServer } from './datenbank'
import { json, type Anfrage } from './http'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS app_freigaben (
  id TEXT PRIMARY KEY,
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

/** Kurzer Zwischenspeicher (jede Anfrage an /api fragt sonst neu und entschlüsselt) */
let merk: { gruppen: AppGruppe[]; zeit: number } | null = null

/** Alle Gruppen; ohne Eintrag nur die Grundgruppe mit allen Apps von heute */
export function appGruppen(): AppGruppe[] {
  if (merk && Date.now() - merk.zeit < 10_000) return merk.gruppen
  let gruppen = [grundgruppe()]
  try {
    const z = db().prepare("SELECT daten FROM app_freigaben WHERE id = 'gruppen'").get() as { daten: string } | undefined
    if (z) gruppen = pruefeGruppen(JSON.parse(z.daten))
  } catch {
    // Beschädigt oder nicht lesbar: die Vorgabe – sie sperrt nichts, was es heute gibt
    gruppen = [grundgruppe()]
  }
  merk = { gruppen, zeit: Date.now() }
  return gruppen
}

/** Apps einer Person; `null` = alle (Admin) */
export function appsFuer(n: { id: string; rolle: string } | undefined): string[] | null {
  if (!n || n.rolle === 'admin') return null
  return appsAus(appGruppen(), n.id)
}

export function setzeAppGruppen(roh: unknown): AppGruppe[] {
  const lehrkraefte = new Set(alleNutzer().filter((n) => n.rolle === 'lehrkraft').map((n) => n.id))
  const gruppen = pruefeGruppen(roh).map((g) => ({ ...g, mitglieder: g.mitglieder.filter((m) => lehrkraefte.has(m)) }))
  db()
    .prepare(
      "INSERT INTO app_freigaben (id, daten, stand) VALUES ('gruppen', ?, ?) ON CONFLICT(id) DO UPDATE SET daten = excluded.daten, stand = excluded.stand"
    )
    .run(JSON.stringify(gruppen), new Date().toISOString())
  merk = null
  return gruppen
}

export async function appFreigabenRoute(k: Anfrage): Promise<boolean> {
  const { url, req, res, sitzung } = k
  if (url.pathname !== '/server/app-freigaben') return false
  if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
  const ich = sitzung.nutzer
  if (ich.rolle !== 'admin') return json(res, 403, { fehler: 'Nur für die Verwaltung.' }), true
  const lehrkraefte = () =>
    alleNutzer()
      .filter((n) => n.rolle === 'lehrkraft' && !n.gesperrt && n.quelle !== 'vorschau')
      .map((n) => ({ id: n.id, name: n.name, benutzer: n.benutzer }))
  if (req.method === 'GET') return json(res, 200, { gruppen: appGruppen(), lehrkraefte: lehrkraefte() }), true
  if (req.method !== 'POST') return json(res, 405, { fehler: 'Nicht erlaubt.' }), true
  if (typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nur aus der App.' }), true
  const b = ((await k.koerper()) ?? {}) as Record<string, unknown>
  if (!Array.isArray(b.gruppen)) return json(res, 400, { fehler: 'Gruppen fehlen.' }), true
  const gruppen = setzeAppGruppen(b.gruppen)
  protokolliereServer('verwaltung', `App-Freigaben geändert (${gruppen.length} Gruppen)`, ich.id)
  return json(res, 200, { gruppen, lehrkraefte: lehrkraefte() }), true
}
