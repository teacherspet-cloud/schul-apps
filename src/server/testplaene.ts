/**
 * Geplante Tests in Fächern ohne Sprachkurs (02.11.2026, Wunsch der Lehrkraft – Knopf „Test planen" in „Meine Klassen"):
 * Termin, Thema, Buchseiten (optional mit Abschnitten der Seite) und Material der Lerngruppe – ganze Arbeitsblätter bzw.
 * Reihen oder einzelne Aufgaben/Schritte daraus. In Sprachfächern plant das Fenster den Testtermin des Kurses
 * (vokabeln.ts, Abschnitte und Grammatik) – dafür gibt es hier nichts.
 *
 *   GET  /server/testplaene/<lerngruppe>            → { plaene, material }
 *   POST /server/testplaene/<lerngruppe>            { id?, termin, thema, seiten, material } → { plan }
 *   POST /server/testplaene/<lerngruppe>/loeschen   { id }
 *
 * Datenschutz: Thema, Seiten und Materialwahl (`daten`, JSON) liegen verschlüsselt (feldschutz.ts SENSIBEL `testplaene`);
 * lesbar bleiben Kennungen und der Termin (Sortierung). Löschen: mit der Lerngruppe (ON DELETE CASCADE); vergangene
 * Termine räumt `testplaeneAufraeumen` nach 400 Tagen weg.
 */
import { randomBytes } from 'node:crypto'
import { datenbank } from './datenbank'
import { alsNutzer, json, type Anfrage } from './http'
import { lerngruppe } from './onlinetest'
import { istSprachfach, klassenKursVon } from './klassen'
import { zeile as vokZeile } from './vokabeln'
import { testPlanBereinigt, type TestPlan, type TestPlanDaten, type TestPlanMaterialQuelle } from '../shared/testPlan'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS testplaene (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL,
  lerngruppe_id TEXT NOT NULL REFERENCES lerngruppen(id) ON DELETE CASCADE,
  termin INTEGER,
  erstellt INTEGER NOT NULL,
  daten TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS testplaene_gruppe ON testplaene(lerngruppe_id);`

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
export const testplaeneZuruecksetzen = (): void => {
  bereit = false
}

interface Zeile {
  id: string
  lerngruppe_id: string
  termin: number | null
  erstellt: number
  daten: string
}

const TAG = 86_400_000

function ausZeile(z: Zeile): TestPlan {
  let d: TestPlanDaten
  try {
    d = testPlanBereinigt(JSON.parse(z.daten))
  } catch {
    d = { thema: '', seiten: [], material: [] }
  }
  return { ...d, id: z.id, termin: z.termin ?? null, erstellt: z.erstellt }
}

/** Pläne einer Lerngruppe: kommende zuerst (nächster oben), dann vergangene der letzten 60 Tage */
export function testplaeneDerGruppe(lerngruppeId: string, jetzt = Date.now()): TestPlan[] {
  const alle = (db().prepare('SELECT * FROM testplaene WHERE lerngruppe_id = ?').all(lerngruppeId) as unknown as Zeile[]).map(ausZeile)
  const heute = jetzt - TAG
  const kommend = alle.filter((p) => !p.termin || p.termin >= heute).sort((a, b) => (a.termin ?? Infinity) - (b.termin ?? Infinity))
  const vorbei = alle.filter((p) => p.termin && p.termin < heute && p.termin > jetzt - 60 * TAG).sort((a, b) => (b.termin ?? 0) - (a.termin ?? 0))
  return [...kommend, ...vorbei]
}

/** Nächster kommender Termin einer Lerngruppe (Knopf „Test am …", Kennzahl) */
export function naechsterTestplan(lerngruppeId: string, jetzt = Date.now()): number | null {
  try {
    const z = db()
      .prepare('SELECT MIN(termin) AS t FROM testplaene WHERE lerngruppe_id = ? AND termin >= ?')
      .get(lerngruppeId, jetzt - TAG) as { t: number | null } | undefined
    return z?.t ?? null
  } catch {
    return null
  }
}

export function testplanSpeichern(lehrkraftId: string, lerngruppeId: string, roh: Record<string, unknown>, jetzt = Date.now()): TestPlan {
  const daten = testPlanBereinigt(roh)
  const termin = typeof roh.termin === 'number' && Number.isFinite(roh.termin) && roh.termin > 0 ? Math.round(roh.termin) : null
  const id = typeof roh.id === 'string' && roh.id ? roh.id : ''
  const d = db()
  if (id) {
    const n = d
      .prepare('UPDATE testplaene SET termin = ?, daten = ? WHERE id = ? AND lerngruppe_id = ? AND lehrkraft_id = ?')
      .run(termin, JSON.stringify(daten), id, lerngruppeId, lehrkraftId).changes
    if (!n) throw new Error('Diesen Test gibt es nicht mehr.')
    return ausZeile(d.prepare('SELECT * FROM testplaene WHERE id = ?').get(id) as unknown as Zeile)
  }
  const neu = randomBytes(9).toString('base64url')
  d.prepare('INSERT INTO testplaene (id, lehrkraft_id, lerngruppe_id, termin, erstellt, daten) VALUES (?, ?, ?, ?, ?, ?)').run(
    neu,
    lehrkraftId,
    lerngruppeId,
    termin,
    jetzt,
    JSON.stringify(daten)
  )
  return ausZeile(d.prepare('SELECT * FROM testplaene WHERE id = ?').get(neu) as unknown as Zeile)
}

export function testplanLoeschen(lehrkraftId: string, lerngruppeId: string, id: string): boolean {
  return db().prepare('DELETE FROM testplaene WHERE id = ? AND lerngruppe_id = ? AND lehrkraft_id = ?').run(id, lerngruppeId, lehrkraftId).changes > 0
}

/** Vergangene Pläne nach 400 Tagen löschen (Löschkonzept: Unterrichtsplanung, ein Schuljahr plus Puffer) */
export function testplaeneAufraeumen(jetzt = Date.now()): number {
  try {
    return Number(db().prepare("DELETE FROM testplaene WHERE termin IS NOT NULL AND termin < ?").run(jetzt - 400 * TAG).changes)
  } catch {
    return 0
  }
}

const tabelleDa = (t: string): boolean => Boolean(datenbank().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t))
const json_ = <T>(roh: unknown, ersatz: T): T => {
  try {
    return typeof roh === 'string' && roh ? (JSON.parse(roh) as T) : ersatz
  } catch {
    return ersatz
  }
}
/** Anweisung kurz („Lies den Text auf S. 34 und …") – erste Zeile, höchstens 90 Zeichen */
const kurz = (s: string, n = 90): string => {
  const t = String(s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .split(/\n/)[0]
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t
}

/**
 * Material der Lerngruppe zur Auswahl: freigegebene Arbeitsblätter (mit Aufgaben) und zugewiesene Reihen (mit Schritten),
 * neueste zuerst. Blätter innerhalb von Reihen stehen als Schritt der Reihe.
 */
export function materialFuerTestplan(lehrkraftId: string, lerngruppeId: string): TestPlanMaterialQuelle[] {
  const d = datenbank()
  const aus: TestPlanMaterialQuelle[] = []
  if (tabelleDa('blatt_freigaben'))
    for (const z of d
      .prepare("SELECT id, titel, aufgaben, erstellt FROM blatt_freigaben WHERE lehrkraft_id = ? AND lerngruppe_id = ? AND reihe = '' ORDER BY erstellt DESC")
      .all(lehrkraftId, lerngruppeId) as { id: string; titel: string; aufgaben: string; erstellt: string }[]) {
      const aufgaben = json_(z.aufgaben, [] as { nr: number; anweisung?: string }[]).filter((a) => typeof a?.nr === 'number' && a.nr > 0)
      aus.push({
        art: 'blatt',
        id: z.id,
        titel: String(z.titel ?? ''),
        zeit: Date.parse(z.erstellt) || 0,
        teile: aufgaben.map((a) => ({ key: `a${a.nr}`, titel: `Aufgabe ${a.nr}`, text: kurz(a.anweisung ?? '') }))
      })
    }
  if (tabelleDa('reihen_zuweisungen') && tabelleDa('reihen'))
    for (const z of d
      .prepare(
        'SELECT r.*, z.id AS zid, z.erstellt AS zerstellt FROM reihen_zuweisungen z JOIN reihen r ON r.id = z.reihe_id WHERE z.lehrkraft_id = ? AND z.lerngruppe_id = ? ORDER BY z.erstellt DESC'
      )
      .all(lehrkraftId, lerngruppeId) as { zid: string; zerstellt: string; titel: string; daten: string; veroeffentlicht?: string | null }[]) {
      const r = json_(z.veroeffentlicht || z.daten, {} as { titel?: string; schritte?: { id: string; titel: string; abschnitt?: string; platzhalter?: unknown }[] })
      const schritte = (r.schritte ?? []).filter((s) => s && !s.platzhalter && s.id)
      aus.push({
        art: 'reihe',
        id: z.zid,
        titel: String(z.titel || r.titel || ''),
        zeit: Date.parse(z.zerstellt) || 0,
        teile: schritte.map((s, i) => ({ key: s.id, titel: `Schritt ${i + 1}`, text: kurz(s.titel ?? ''), ...(s.abschnitt ? { gruppe: s.abschnitt } : {}) }))
      })
    }
  return aus.sort((a, b) => b.zeit - a.zeit)
}

export function testplaeneRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    if (!url.pathname.startsWith('/server/testplaene/')) return false
    if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
    if (sitzung.nutzer.rolle === 'schueler') return json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true
    const ich = alsNutzer(sitzung.nutzer, sitzung.kennung)
    const teile = url.pathname.split('/').filter(Boolean).slice(2)
    const g = lerngruppe(teile[0] ?? '')
    if (!g || g.lehrkraft_id !== ich.id) return json(res, 404, { fehler: 'Diese Lerngruppe gibt es nicht.' }), true
    // Kopf: Sprachfach mit Kurs → das Fenster plant den Kurstermin; sonst Thema/Seiten/Material (nur Zahl und Termin)
    if (req.method === 'GET' && teile[1] === 'kopf') {
      const kurs = istSprachfach(g.fach) ? klassenKursVon(g, ich.id) : null
      const kz = kurs ? vokZeile(kurs) : null
      return (
        json(res, 200, {
          kurs: kz ? { id: kz.id, termin: kz.test_termin && kz.test_termin >= Date.now() - TAG ? kz.test_termin : null } : null,
          naechster: naechsterTestplan(g.id)
        }),
        true
      )
    }
    if (req.method === 'GET' && teile.length === 1)
      return json(res, 200, { plaene: testplaeneDerGruppe(g.id), material: materialFuerTestplan(ich.id, g.id) }), true
    if (req.method !== 'POST' || typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nicht erlaubt.' }), true
    const k0 = ((await k.koerper()) ?? {}) as Record<string, unknown>
    try {
      if (teile.length === 1) return json(res, 200, { plan: testplanSpeichern(ich.id, g.id, k0) }), true
      if (teile[1] === 'loeschen') return json(res, 200, { ok: testplanLoeschen(ich.id, g.id, String(k0.id ?? '')) }), true
    } catch (e) {
      return json(res, 400, { fehler: e instanceof Error ? e.message : String(e) }), true
    }
    return json(res, 404, { fehler: 'Unbekannt.' }), true
  }
}
