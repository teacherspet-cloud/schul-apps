/**
 * Wiederholer und Klassenwechsel (10.10.2026, Entscheidungen der Lehrkraft): Was eine Person aus ihrer bisherigen Klasse
 * mitbringt. Ablauf und Erkennung in schuljahrWechsel.ts (`uebernahmeVersuchen`, `klassenwechselPruefen`), Regeln in
 * shared/schuljahrWechsel.ts.
 *
 *  1. Der FORTSCHRITT bleibt: Karteikasten, Grammatik, Medaillen, Übungstage – nichts wird gelöscht.
 *  2. Die FREIGABEN sind die der neuen Klasse: Einzel-Freigaben aus der bisherigen Klasse (Kurse nur für die Person,
 *     Förder-/Forder-Extras) RUHEN für die Person – nicht gelöscht, die Lehrkraft kann sie wieder aufnehmen, „Rückgängig"
 *     des Schuljahreswechsels stellt sie wieder her. Ruhende Freigaben sieht die Person nicht und sie zählt dort nicht mit.
 *  3. Gibt die neue Klasse später Wörter bzw. Grammatik frei, die die Person schon kennt, zählt der mitgebrachte Stand
 *     sofort: Beim Lesen eines Lernstands (vokabeln.ts/grammatik.ts `standVon`) werden FEHLENDE Einträge aus den
 *     mitgebrachten Kursen gefüllt (Wort + Übersetzung bzw. Wort, wie beim Übernehmen; Grammatik über die Aufgabe).
 *  4. Wackelige Wörter aus Abschnitten, die die neue Klasse noch nicht freigegeben hat, RUHEN von selbst: Die bisherigen
 *     Kurse sind für die Person nicht mehr sichtbar, die Einzel-Freigaben ruhen – sie kommen weder in die Tagesrunde noch
 *     in den Anteil früherer Bände. Frühere Bände (Vokabelweg) behalten ihren kleinen Wiederholungsanteil.
 *
 * Gespeichert je Person in `vok_laufbahn` unter der Kennung „§mitnahme" (verschlüsselt wie die übrigen Zeilen; wie die
 * Rekorde der Sprachrunde „sprache:<code>" – keine neue Tabelle). Die Zeile hat weder `woerter` noch `tage`, zählt also
 * in Achievements und Übungstagen nicht mit.
 */
import { fehlendeAuffuellen, vergleichsSchluessel, zuordnungUeber, zuordnungWoerter, type WechselGrund } from '@shared/schuljahrWechsel'
import { datenbank, nutzerNachId } from './datenbank'

export const MITNAHME = '§mitnahme'

export interface Mitnahme {
  /** Frühere Kurse, aus denen fehlende Wörter nachgezogen werden (gleiche Sprache) */
  vok: { kurs: string; sprache: string }[]
  /** Frühere Grammatik (gleiches Thema) */
  gram: { kurs: string; thema: string; themen: string[] }[]
  /** Einzel-Freigaben, die für die Person ruhen */
  ruhend: { art: 'vok' | 'gram'; kurs: string }[]
  /** Erkannte Wechsel – je bisheriger Lerngruppe einmal; `zurueckgenommen` = „Rückgängig" (nicht wieder erkennen) */
  wechsel: { von: string; nach: string; grund: WechselGrund; zeit: number; zurueckgesetzt: boolean; zurueckgenommen?: boolean }[]
  /** Änderungszähler (für den Zwischenspeicher beim Nachziehen) */
  stand: number
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS vok_laufbahn (
  schueler_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  reihe TEXT NOT NULL,
  daten TEXT NOT NULL,
  aktualisiert INTEGER NOT NULL,
  PRIMARY KEY (schueler_id, reihe)
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
const json_ = <T>(s: string | null | undefined, r: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : r
  } catch {
    return r
  }
}
const tabelleDa = (t: string): boolean => Boolean(datenbank().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t))

// Zwischenspeicher je Person (alle Schreibzugriffe laufen über `mitnahmeSetzen`)
const cache = new Map<string, Mitnahme | null>()
/** Nur für Tests: Zwischenspeicher leeren (neue Datenbank) */
export const mitnahmeZuruecksetzen = (): void => {
  cache.clear()
  memo.clear()
  bereit = false
}

export function mitnahmeVon(sid: string): Mitnahme | null {
  if (cache.has(sid)) return cache.get(sid) ?? null
  let m: Mitnahme | null = null
  try {
    const z = db().prepare('SELECT daten FROM vok_laufbahn WHERE schueler_id = ? AND reihe = ?').get(sid, MITNAHME) as { daten: string } | undefined
    m = z ? json_(z.daten, null as Mitnahme | null) : null
  } catch {
    m = null
  }
  if (m) m = { vok: m.vok ?? [], gram: m.gram ?? [], ruhend: m.ruhend ?? [], wechsel: m.wechsel ?? [], stand: m.stand ?? 0 }
  cache.set(sid, m)
  return m
}

export function mitnahmeSetzen(sid: string, m: Mitnahme | null): void {
  if (!m) db().prepare('DELETE FROM vok_laufbahn WHERE schueler_id = ? AND reihe = ?').run(sid, MITNAHME)
  else {
    m.stand = (m.stand ?? 0) + 1
    db()
      .prepare(
        'INSERT INTO vok_laufbahn (schueler_id, reihe, daten, aktualisiert) VALUES (?, ?, ?, ?) ON CONFLICT (schueler_id, reihe) DO UPDATE SET daten = excluded.daten, aktualisiert = excluded.aktualisiert'
      )
      .run(sid, MITNAHME, JSON.stringify(m), Date.now())
  }
  cache.set(sid, m ? JSON.parse(JSON.stringify(m)) : null)
}

/** Ruht diese Einzel-Freigabe für die Person? */
export const ruht = (art: 'vok' | 'gram', kurs: string, sid: string): boolean =>
  Boolean(kurs && mitnahmeVon(sid)?.ruhend.some((r) => r.art === art && r.kurs === kurs))

/** Lehrkraft nimmt eine ruhende Einzel-Freigabe für die Person wieder auf */
export function ruhendAufheben(sid: string, art: 'vok' | 'gram', kurs: string): boolean {
  const m = mitnahmeVon(sid)
  if (!m || !m.ruhend.some((r) => r.art === art && r.kurs === kurs)) return false
  mitnahmeSetzen(sid, { ...m, ruhend: m.ruhend.filter((r) => !(r.art === art && r.kurs === kurs)) })
  return true
}

// ---------------------------------------------------------------- Wechsel eintragen

interface VokRoh {
  id: string
  lerngruppe_id: string
  schueler: string
  sprache: string
  status: string
}
interface GramRoh {
  id: string
  lerngruppe_id: string
  schueler: string
  sprache: string
  thema: string
  info: string
  art: string
  vok_id: string
  status: string
}

const hatStand = (tabelle: 'vok_stand' | 'gram_stand', kurs: string, sid: string): boolean =>
  Boolean(datenbank().prepare(`SELECT 1 FROM ${tabelle} WHERE zuweisung_id = ? AND schueler_id = ?`).get(kurs, sid))
const themenVon = (info: string): string[] => json_(info || '{}', { themen: [] as string[] }).themen ?? []

export interface WechselEingabe {
  schuelerId: string
  grund: WechselGrund
  /** bisherige Lerngruppe */
  von: string
  /** neue Lerngruppe ('' = noch keine bekannt) */
  nach: string
  /** Freigaben auf den Stand der neuen Klasse setzen (Wiederholer, neue Klasse hinterher) */
  zuruecksetzen: boolean
  zeit: number
}

/**
 * Einen Wechsel für eine Person eintragen: Kurse und Grammatik der bisherigen Lerngruppe (mit Lernstand der Person) als
 * Quellen; beim Zurücksetzen ruhen ihre Einzel-Freigaben in den Sprachen der bisherigen Lerngruppe (Kurse nur für sie ohne
 * Lerngruppe, Förder-/Forder-Extras, Grammatik nur für sie) – auch sie werden Quellen. Liefert den Stand davor (für
 * „Rückgängig") und die Zahl ruhender Freigaben.
 */
export function wechselEintragen(e: WechselEingabe): { vorher: Mitnahme | null; ruhend: number; quellen: number } {
  const vorher = mitnahmeVon(e.schuelerId)
  const m: Mitnahme = vorher ? JSON.parse(JSON.stringify(vorher)) : { vok: [], gram: [], ruhend: [], wechsel: [], stand: 0 }
  const benutzer = nutzerNachId(e.schuelerId)?.benutzer ?? ''
  const vokDa = tabelleDa('vok_zuweisungen')
  const gramDa = tabelleDa('gram_zuweisungen')
  const vokAlle = vokDa ? (datenbank().prepare('SELECT id, lerngruppe_id, schueler, sprache, status FROM vok_zuweisungen').all() as unknown as VokRoh[]) : []
  const gramAlle = gramDa
    ? (datenbank().prepare('SELECT id, lerngruppe_id, schueler, sprache, thema, info, art, vok_id, status FROM gram_zuweisungen').all() as unknown as GramRoh[])
    : []
  const vokGruppe = vokAlle.filter((z) => z.lerngruppe_id === e.von)
  const vokIds = new Set(vokGruppe.map((z) => z.id))
  const gramGruppe = gramAlle.filter((z) => z.lerngruppe_id === e.von || (z.vok_id && vokIds.has(z.vok_id)))
  const sprachen = new Set([...vokGruppe, ...gramGruppe].map((z) => (z.sprache || '').toLowerCase()).filter(Boolean))
  const vokQuelle = (z: VokRoh): void => {
    if (!m.vok.some((q) => q.kurs === z.id) && hatStand('vok_stand', z.id, e.schuelerId)) m.vok.push({ kurs: z.id, sprache: (z.sprache || '').toLowerCase() })
  }
  const gramQuelle = (z: GramRoh): void => {
    if (!m.gram.some((q) => q.kurs === z.id) && hatStand('gram_stand', z.id, e.schuelerId)) m.gram.push({ kurs: z.id, thema: z.thema || '', themen: themenVon(z.info) })
  }
  for (const z of vokGruppe) vokQuelle(z)
  for (const z of gramGruppe) gramQuelle(z)
  let ruhend = 0
  if (e.zuruecksetzen && benutzer) {
    const fuerMich = (s: string): boolean => json_(s, [] as string[]).includes(benutzer)
    const ruhe = (art: 'vok' | 'gram', kurs: string): void => {
      if (m.ruhend.some((r) => r.art === art && r.kurs === kurs)) return
      m.ruhend.push({ art, kurs })
      ruhend++
    }
    for (const z of vokAlle)
      if (!z.lerngruppe_id && sprachen.has((z.sprache || '').toLowerCase()) && fuerMich(z.schueler)) (ruhe('vok', z.id), vokQuelle(z))
    for (const z of gramAlle) {
      if (z.status === 'entfernt' || !sprachen.has((z.sprache || '').toLowerCase()) || !fuerMich(z.schueler)) continue
      const extra = z.art === 'foerder' || z.art === 'forder'
      if (extra || (!z.lerngruppe_id && !z.vok_id)) (ruhe('gram', z.id), gramQuelle(z))
    }
  }
  m.wechsel.push({ von: e.von, nach: e.nach, grund: e.grund, zeit: e.zeit, zurueckgesetzt: e.zuruecksetzen })
  mitnahmeSetzen(e.schuelerId, m)
  return { vorher, ruhend, quellen: m.vok.length + m.gram.length }
}

/**
 * „Rückgängig": Was dieser Wechsel dazugebracht hat, wieder fort (ruhende Freigaben aktiv, Quellen fort) – Einträge
 * anderer Wechsel bleiben. Der Wechsel bleibt als zurückgenommen gemerkt, damit er nicht gleich wieder erkannt wird.
 */
export function wechselZuruecknehmen(sid: string, vorher: Mitnahme | null, von: string): void {
  const m = mitnahmeVon(sid)
  if (!m) return
  const v = vorher ?? { vok: [], gram: [], ruhend: [], wechsel: [], stand: 0 }
  mitnahmeSetzen(sid, {
    ...m,
    vok: m.vok.filter((q) => v.vok.some((x) => x.kurs === q.kurs)),
    gram: m.gram.filter((q) => v.gram.some((x) => x.kurs === q.kurs)),
    ruhend: m.ruhend.filter((r) => v.ruhend.some((x) => x.art === r.art && x.kurs === r.kurs)),
    wechsel: m.wechsel.map((w) => (w.von === von ? { ...w, zurueckgesetzt: false, zurueckgenommen: true } : w))
  })
}

// ---------------------------------------------------------------- Nachziehen

// Kurs|Person → Fingerabdruck beim letzten Nachziehen (Mitnahme-Stand, Zahl und letzte Kennung der Einträge)
const memo = new Map<string, string>()

interface Eintrag {
  fach?: number
  versuche?: number
  zuletzt?: number
}

/**
 * Vokabeln: fehlende Wörter des Kurses `z` aus den mitgebrachten Kursen derselben Sprache füllen (ändert `st`).
 * true = es kam etwas dazu (dann speichern).
 */
export function vokNachziehen(z: { id: string; sprache: string; woerter: string }, sid: string, st: { woerter: Record<string, Eintrag>; tage: string[] }): boolean {
  const m = mitnahmeVon(sid)
  if (!m) return false
  const sprache = (z.sprache || '').toLowerCase()
  const quellen = m.vok.filter((q) => q.kurs !== z.id && q.sprache === sprache)
  if (!quellen.length) return false
  const woerter = json_(z.woerter, [] as { id: string; term: string; translation: string }[])
  const fp = `${m.stand}:${woerter.length}:${woerter[woerter.length - 1]?.id ?? ''}:${Object.keys(st.woerter ?? {}).length}`
  const k = `v|${z.id}|${sid}`
  if (memo.get(k) === fp) return false
  memo.set(k, fp)
  if (!woerter.some((w) => !st.woerter?.[w.id])) return false
  const qs = quellen.flatMap((q) => {
    const zeile = datenbank().prepare('SELECT woerter FROM vok_zuweisungen WHERE id = ?').get(q.kurs) as { woerter: string } | undefined
    const roh = datenbank().prepare('SELECT daten FROM vok_stand WHERE zuweisung_id = ? AND schueler_id = ?').get(q.kurs, sid) as { daten: string } | undefined
    if (!zeile || !roh) return []
    const s = json_(roh.daten, { woerter: {}, tage: [] } as { woerter: Record<string, Eintrag>; tage: string[] })
    const alt = json_(zeile.woerter, [] as { id: string; term: string; translation: string }[])
    return [{ eintraege: s.woerter ?? {}, tage: s.tage ?? [], zuordnung: zuordnungWoerter(alt, woerter) }]
  })
  const r = fehlendeAuffuellen(qs, { eintraege: st.woerter ?? {}, tage: st.tage ?? [] })
  if (!r.neu) return false
  st.woerter = r.eintraege
  st.tage = r.tage
  memo.set(k, `${m.stand}:${woerter.length}:${woerter[woerter.length - 1]?.id ?? ''}:${Object.keys(st.woerter).length}`)
  return true
}

interface Aufgabe {
  id: string
  art?: string
  satz?: string
  vorgabe?: string
}

/** Grammatik: fehlende Aufgaben aus mitgebrachter Grammatik mit gleichem Thema füllen (Zuordnung wie beim Übernehmen) */
export function gramNachziehen(
  z: { id: string; thema: string; info?: string; paket: string },
  sid: string,
  st: { aufgaben: Record<string, Eintrag>; tage: string[] }
): boolean {
  const m = mitnahmeVon(sid)
  if (!m) return false
  const themen = new Set(themenVon(z.info ?? ''))
  const quellen = m.gram.filter((q) => q.kurs !== z.id && ((z.thema && q.thema === z.thema) || q.themen.some((t) => themen.has(t))))
  if (!quellen.length) return false
  const aufgaben = json_(z.paket, { aufgaben: [] as Aufgabe[] }).aufgaben ?? []
  const fp = `${m.stand}:${aufgaben.length}:${aufgaben[aufgaben.length - 1]?.id ?? ''}:${Object.keys(st.aufgaben ?? {}).length}`
  const k = `g|${z.id}|${sid}`
  if (memo.get(k) === fp) return false
  memo.set(k, fp)
  if (!aufgaben.some((a) => !st.aufgaben?.[a.id])) return false
  const schl = (a: Aufgabe): string => vergleichsSchluessel(a.art, a.satz, a.vorgabe)
  const qs = quellen.flatMap((q) => {
    const zeile = datenbank().prepare('SELECT paket FROM gram_zuweisungen WHERE id = ?').get(q.kurs) as { paket: string } | undefined
    const roh = datenbank().prepare('SELECT daten FROM gram_stand WHERE zuweisung_id = ? AND schueler_id = ?').get(q.kurs, sid) as { daten: string } | undefined
    if (!zeile || !roh) return []
    const s = json_(roh.daten, { aufgaben: {}, tage: [] } as { aufgaben: Record<string, Eintrag>; tage: string[] })
    const alt = json_(zeile.paket, { aufgaben: [] as Aufgabe[] }).aufgaben ?? []
    return [{ eintraege: s.aufgaben ?? {}, tage: s.tage ?? [], zuordnung: zuordnungUeber(alt, aufgaben, (a) => a.id, schl) }]
  })
  const r = fehlendeAuffuellen(qs, { eintraege: st.aufgaben ?? {}, tage: st.tage ?? [] })
  if (!r.neu) return false
  st.aufgaben = r.eintraege
  st.tage = r.tage
  memo.set(k, `${m.stand}:${aufgaben.length}:${aufgaben[aufgaben.length - 1]?.id ?? ''}:${Object.keys(st.aufgaben).length}`)
  return true
}
