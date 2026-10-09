/**
 * Geplante Freischaltungen (09.10.2026, shared/freigabePlan.ts): eine Zeile je geplantem Material (Arbeitsblatt,
 * Grammatik, Tafelbild, Schreibaufgabe, Unterrichtsreihe) mit „ab" und optional „bis". Vokabelabschnitte tragen ihr
 * „ab" selbst (vok_zuweisungen.teile, verschlüsselt).
 *
 * Kein Zeitplaner: Die Freigabeprüfungen der Module (blattIstFuer, istFuer …) fragen `nochGeplant` – bis zum Zeitpunkt
 * sehen die Lernenden nichts davon, danach ist es da. Zeiten und Kennungen stehen im Klartext (keine Angabe zur Person,
 * datenschutzSpalten.test.ts). Abhängig nur von der Datenbank – die Module importieren von hier, nie umgekehrt.
 */
import { datenbank } from './datenbank'
import { istGeplant, istVorbei, planBereinigt, teilePlanen, testterminNach, type PlanEingabe, type PlanTeil, type PlanTyp } from '../shared/freigabePlan'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS freigabe_plan (
  typ TEXT NOT NULL,
  ziel_id TEXT NOT NULL,
  lehrkraft_id TEXT NOT NULL,
  lerngruppe_id TEXT NOT NULL DEFAULT '',
  ab INTEGER NOT NULL,
  bis INTEGER,
  PRIMARY KEY (typ, ziel_id)
);
CREATE INDEX IF NOT EXISTS freigabe_plan_lk ON freigabe_plan(lehrkraft_id);
CREATE TABLE IF NOT EXISTS plan_gesehen (
  nutzer_id TEXT PRIMARY KEY,
  bis INTEGER NOT NULL
);`

let bereit = false
export const planDb = (): ReturnType<typeof datenbank> => {
  const d = datenbank()
  if (!bereit) {
    d.exec(SCHEMA)
    bereit = true
  }
  return d
}
/** Für Tests: neue Datenbank, Tabellen neu anlegen */
export const planZuruecksetzen = (): void => {
  bereit = false
}

export interface PlanZeile {
  typ: PlanTyp
  ziel_id: string
  lehrkraft_id: string
  lerngruppe_id: string
  ab: number
  bis: number | null
}

export const planVon = (typ: PlanTyp, id: string): PlanZeile | null =>
  (planDb().prepare('SELECT * FROM freigabe_plan WHERE typ = ? AND ziel_id = ?').get(typ, id) as PlanZeile | undefined) ?? null

/** Für Lernende noch verborgen? (Freigabeprüfungen aller Module) */
export function nochGeplant(typ: PlanTyp, id: string, jetzt = Date.now()): boolean {
  const z = planDb().prepare('SELECT ab FROM freigabe_plan WHERE typ = ? AND ziel_id = ?').get(typ, id) as { ab: number } | undefined
  return Boolean(z && istGeplant(z.ab, jetzt))
}

/** Geplanter Zeitpunkt, solange er noch aussteht (Kennzeichen „geplant ab …" in den Listen der Lehrkraft) */
export function geplantAb(typ: PlanTyp, id: string, jetzt = Date.now()): number | null {
  const z = planVon(typ, id)
  return z && istGeplant(z.ab, jetzt) ? z.ab : null
}

/** Ende aus der Planung vorbei? (Material ohne eigenes „bis", z. B. Unterrichtsreihen) – danach nur ansehen */
export function planVorbei(typ: PlanTyp, id: string, jetzt = Date.now()): boolean {
  return istVorbei(planVon(typ, id)?.bis, jetzt)
}

export function planSetzen(e: { typ: PlanTyp; id: string; lehrkraftId: string; lerngruppeId?: string; ab: number | null; bis?: number | null }): void {
  if (!e.ab && !e.bis) {
    planDb().prepare('DELETE FROM freigabe_plan WHERE typ = ? AND ziel_id = ?').run(e.typ, e.id)
    return
  }
  planDb()
    .prepare(
      'INSERT INTO freigabe_plan (typ, ziel_id, lehrkraft_id, lerngruppe_id, ab, bis) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (typ, ziel_id) DO UPDATE SET ab = excluded.ab, bis = excluded.bis, lerngruppe_id = excluded.lerngruppe_id'
    )
    .run(e.typ, e.id, e.lehrkraftId, e.lerngruppeId ?? '', e.ab ?? 0, e.bis ?? null)
}

export const planLoeschen = (typ: PlanTyp, id: string): void => {
  planDb().prepare('DELETE FROM freigabe_plan WHERE typ = ? AND ziel_id = ?').run(typ, id)
}

/** `plan` aus dem Anfragekörper einer Freigabe */
export const planAus = (k0: Record<string, unknown>): PlanEingabe => planBereinigt(k0.plan)

/**
 * Nach dem Anlegen einer Freigabe: die neuen Kennungen planen (nur, wenn die Lehrkraft „Planen …" gewählt hat oder ein
 * Ende ohne eigenes Feld gilt). Gibt zurück, ob geplant wurde – für die Rückmeldung.
 */
export function nachFreigabe(typ: PlanTyp, ids: string[], k0: Record<string, unknown>, lehrkraftId: string, lerngruppeId = ''): boolean {
  const p = planAus(k0)
  if (!p.ab && !p.bis) return false
  for (const id of ids) planSetzen({ typ, id, lehrkraftId, lerngruppeId, ab: p.ab, bis: p.bis })
  return Boolean(p.ab)
}

/** Kennungen einer Tabelle, die eine Lehrkraft schon hat – um nach einer Freigabe nur die NEUEN zu planen */
export function kennungenVon(tabelle: 'gram_zuweisungen' | 'blatt_freigaben' | 'feedback_freigaben', lehrkraftId: string): Set<string> {
  try {
    return new Set((planDb().prepare(`SELECT id FROM ${tabelle} WHERE lehrkraft_id = ?`).all(lehrkraftId) as { id: string }[]).map((x) => x.id))
  } catch {
    return new Set()
  }
}

// ---------------------------------------------------------------- Vokabelabschnitte

interface VokPlanZeile {
  id: string
  teile: string
  woerter: string
  titel: string
  erstellt: string
  test_termin: number | null
}

/** Abschnitte eines Kurses (wie vokabeln.ts teileVon: ältere Freigaben haben einen Abschnitt mit allen Wörtern) */
function teileAus(z: VokPlanZeile): PlanTeil[] {
  let t: PlanTeil[] = []
  try {
    t = z.teile ? (JSON.parse(z.teile) as PlanTeil[]) : []
  } catch {
    t = []
  }
  if (t.length) return t
  let n = 0
  try {
    n = (JSON.parse(z.woerter || '[]') as unknown[]).length
  } catch {
    n = 0
  }
  return n ? [{ titel: z.titel, anzahl: n, zeit: Date.parse(z.erstellt) || 0 }] : []
}

const vokZeile = (id: string): VokPlanZeile | null =>
  (planDb().prepare('SELECT id, teile, woerter, titel, erstellt, test_termin FROM vok_zuweisungen WHERE id = ?').get(id) as VokPlanZeile | undefined) ?? null

export const vokTeile = (id: string): PlanTeil[] => {
  const z = vokZeile(id)
  return z ? teileAus(z) : []
}

function vokTeileSchreiben(id: string, teile: PlanTeil[], testTermin?: number | null): void {
  if (testTermin !== undefined)
    planDb().prepare('UPDATE vok_zuweisungen SET teile = ?, test_termin = ? WHERE id = ?').run(JSON.stringify(teile), testTermin, id)
  else planDb().prepare('UPDATE vok_zuweisungen SET teile = ? WHERE id = ?').run(JSON.stringify(teile), id)
}

/** Testtermin aus dem gekoppelten Abschnitt (falls einer gekoppelt ist) */
function gekoppelterTermin(teile: PlanTeil[]): number | undefined {
  const t = [...teile].reverse().find((x) => x.testAbstand)
  return t ? testterminNach(t.ab ?? t.zeit, t.testAbstand!) : undefined
}

/**
 * Neue Abschnitte eines Kurses planen (nach „Neuer Kurs" bzw. „Vokabeln hinzufügen"): ab Stelle `start` je Abschnitt ein
 * Zeitpunkt; mit `testAbstand` hängt der Testtermin am letzten Abschnitt. Ohne Plan geschieht nichts.
 */
export function vokAbschnittePlanen(id: string, start: number, k0: Record<string, unknown>): boolean {
  const p = planAus(k0)
  if (!p.ab && !p.teile.some(Boolean) && !p.testAbstand) return false
  const z = vokZeile(id)
  if (!z) return false
  const teile = teilePlanen(teileAus(z), start, p)
  vokTeileSchreiben(id, teile, gekoppelterTermin(teile))
  return true
}

/** Einen geplanten Abschnitt verschieben (null = jetzt freischalten); gekoppelter Testtermin rückt mit */
export function vokAbschnittVerschieben(id: string, index: number, ab: number | null, jetzt = Date.now()): boolean {
  const z = vokZeile(id)
  if (!z) return false
  const teile = teileAus(z)
  if (!teile[index]) return false
  const neu = teile.map((t, i) => {
    if (i !== index) return t
    if (!ab || ab <= jetzt) {
      const { ab: _ab, ...rest } = t
      return { ...rest, zeit: jetzt }
    }
    return { ...t, ab, zeit: ab }
  })
  vokTeileSchreiben(id, neu, gekoppelterTermin(neu))
  return true
}

// ---------------------------------------------------------------- Hinweis „Neu freigeschaltet"

export const gesehenBis = (nutzerId: string): number | null =>
  (planDb().prepare('SELECT bis FROM plan_gesehen WHERE nutzer_id = ?').get(nutzerId) as { bis: number } | undefined)?.bis ?? null

export function gesehenSetzen(nutzerId: string, bis = Date.now()): void {
  planDb()
    .prepare('INSERT INTO plan_gesehen (nutzer_id, bis) VALUES (?, ?) ON CONFLICT (nutzer_id) DO UPDATE SET bis = MAX(plan_gesehen.bis, excluded.bis)')
    .run(nutzerId, bis)
}
