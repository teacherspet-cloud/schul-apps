/**
 * Überthemen der Materialien einer Lerngruppe am Server (19.10.2026, abgestimmt mit der Lehrkraft; Regeln in
 * shared/ueberthemen.ts).
 *
 * Material = Arbeitsblätter (ohne Reihen-Schritte), Unterrichtsreihen, Onlinetests, Rückmeldungen und Tafelbilder
 * einer Lerngruppe – dazu die der Mitlehrkräfte desselben Kurses (gleiche IServ-Gruppe bzw. gleicher Name, gleiches
 * Fach). Je Material: Schuljahr, Jahrgang damals, Überthema (Lehrplan bzw. Q-Phase mit Halbjahr und Modul). Die
 * Lehrkraft kann Überthemen je Lerngruppe umbenennen und Material umhängen (Tabelle `ueberthemen`, Wert verschlüsselt).
 *
 *   GET  /server/themen/<lerngruppe>                 → { themen, kandidaten, schuljahr }   (Lehrkraft)
 *   POST /server/themen/<lerngruppe>/umbenennen      {schluessel, name}  ('' = Name des Lehrplans)
 *   POST /server/themen/<lerngruppe>/zuordnen        {material: "blatt:<id>", schluessel}  ('' = automatisch)
 *   GET  /server/themen/vorschau?fach=&jahrgang=&thema=&titel=  → Zuordnung schon beim Erstellen (Q-Phase: Modul)
 *   GET  /s/api/themen?fach=<Fach>                   → { eintraege, schuljahr }   (Lernende: nur Zuordnungen, keine Titel)
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { alleNutzer, datenbank, type NutzerInfo } from './datenbank'
import { alsNutzer, json, type Anfrage } from './http'
import { alleLerngruppen, gehoertZu, lerngruppe, type Lerngruppe } from './onlinetest'
import { leseSchule } from './schule'
import { fachVorgaben } from './fachvorgaben'
import { RESSOURCEN } from './pfade'
import { blaetterDerGruppe } from './arbeitsblaetter'
import { reihenDerGruppe } from './reihen'
import { leseLehrplan } from '../main/services/storage/lehrplan'
import { lehrplanSchulform, type LehrplanEintrag } from '../shared/lehrplan'
import { fachAusName } from '../shared/faecher'
import { gruppeErkennen } from '../shared/iservKurse'
import { schuljahrVon } from '../shared/schulkalender'
import {
  abiturjahrVon,
  kandidatenFuer,
  semesterVon,
  WEITERE,
  zuordnen,
  type OberstufeFach,
  type UeberthemaKandidat
} from '../shared/ueberthemen'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ueberthemen (
  lerngruppe_id TEXT NOT NULL,
  art TEXT NOT NULL,
  schluessel TEXT NOT NULL,
  wert TEXT NOT NULL,
  geaendert TEXT NOT NULL,
  PRIMARY KEY (lerngruppe_id, art, schluessel)
);
CREATE TABLE IF NOT EXISTS mitlehrkraft_einladungen (
  lerngruppe_id TEXT NOT NULL REFERENCES lerngruppen(id) ON DELETE CASCADE,
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  erstellt TEXT NOT NULL,
  PRIMARY KEY (lerngruppe_id, lehrkraft_id)
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

export type MaterialArt = 'blatt' | 'reihe' | 'test' | 'rueckmeldung' | 'tafel'

export interface ThemaMaterial {
  /** "<art>:<id>" */
  schluessel: string
  art: MaterialArt
  id: string
  titel: string
  erstellt: string
  status: string
  lerngruppeId: string
  /** Mitlehrkraft: Name der Lehrkraft, die es angelegt hat */
  von?: string
  modul?: string
  /** Von Hand umgehängt */
  vonHand?: boolean
  /** Onlinetest: Code */
  code?: string
  /** Arbeitsblatt: eingeholte Rückmeldungen */
  rueckmeldungen?: number
}

export interface ThemaGruppe {
  schluessel: string
  name: string
  /** Name im Lehrplan (vor dem Umbenennen) */
  original: string
  umbenannt: boolean
  schuljahr: number
  jahrgang: number | null
  semester?: string
  rang: number
  materialien: ThemaMaterial[]
}

// ---------------------------------------------------------------- Kontext der Lerngruppe

/** Jahrgang aus dem Gruppennamen („7b" → 7, „Ge 12 gA Kon" → 12, „Q1" → 12) */
export function jahrgangDerGruppe(g: Pick<Lerngruppe, 'name'>): number | null {
  const e = gruppeErkennen(g.name)
  if (e?.jahrgang) return e.jahrgang
  const n = Number(/^\s*(\d{1,2})(?!\d)/.exec(g.name)?.[1])
  return Number.isInteger(n) && n >= 1 && n <= 13 ? n : null
}

let oberstufeCache: { land: string; daten: Record<string, OberstufeFach> } | null = null
function oberstufe(land: string): Record<string, OberstufeFach> {
  if (oberstufeCache?.land === land) return oberstufeCache.daten
  const datei = join(RESSOURCEN, 'lehrplaene', 'oberstufe', `${land}.json`)
  let daten: Record<string, OberstufeFach> = {}
  try {
    if (existsSync(datei)) daten = (JSON.parse(readFileSync(datei, 'utf8')) as { faecher?: Record<string, OberstufeFach> }).faecher ?? {}
  } catch {
    daten = {}
  }
  oberstufeCache = { land, daten }
  return daten
}

interface Kontext {
  fachId: string
  land: string
  schulformen: string[]
  jahrgangJetzt: number | null
  niveau?: 'eA' | 'gA'
  schuljahrJetzt: number
  lehrplan: LehrplanEintrag[]
}

function kontextVon(g: Lerngruppe, jetzt: number): Kontext | null {
  const fachId = fachAusName(g.fach)?.id
  if (!fachId) return null
  const schule = leseSchule()
  const land = schule?.stateId ?? ''
  const schulformen = [...new Set((schule?.schulformen ?? []).map((s) => lehrplanSchulform(s)).filter((s): s is string => Boolean(s)))]
  const e = gruppeErkennen(g.name)
  return {
    fachId,
    land,
    schulformen,
    jahrgangJetzt: jahrgangDerGruppe(g),
    ...(e?.niveau ? { niveau: e.niveau } : {}),
    schuljahrJetzt: schuljahrVon(jetzt),
    lehrplan: land ? (leseLehrplan(land)?.eintraege ?? []) : []
  }
}

function kandidatenImJahr(k: Kontext, jahrgang: number | null): UeberthemaKandidat[] {
  const fv = fachVorgaben(k.fachId)?.themen?.[String(jahrgang ?? '')] ?? []
  const q = jahrgang && jahrgang >= 12 ? oberstufe(k.land)[k.fachId] : undefined
  // Oberstufe: Schulformen mit gymnasialer Oberstufe zuerst
  const schulformen = jahrgang && jahrgang >= 11 ? k.schulformen.filter((s) => s === 'gymnasium' || s === 'integriert') : k.schulformen
  return kandidatenFuer({
    lehrplan: k.lehrplan,
    fachId: k.fachId,
    schulformen: schulformen.length ? schulformen : k.schulformen,
    jahrgang: jahrgang ?? undefined,
    fachvorgaben: fv,
    oberstufe: q ?? null,
    ...(k.jahrgangJetzt ? { abiturjahr: abiturjahrVon(k.jahrgangJetzt, k.schuljahrJetzt) } : {}),
    ...(k.niveau ? { niveau: k.niveau } : {})
  })
}

// ---------------------------------------------------------------- Mitlehrkräfte und Material

const klassenName = (n: string): string => n.trim().toLowerCase().replace(/\s+/g, ' ')
const echteIserv = (s: string): boolean => Boolean(s) && !s.startsWith('klasse:') && !s.startsWith('vorschau:')

/** Dieselbe Lerngruppe bei anderen Lehrkräften (gleiche IServ-Gruppe bzw. gleicher Name) mit gleichem Fach */
export function kursGeschwister(g: Lerngruppe, alle: Lerngruppe[] = alleLerngruppen()): Lerngruppe[] {
  return alle.filter(
    (x) =>
      x.id !== g.id &&
      x.lehrkraft_id !== g.lehrkraft_id &&
      x.fach === g.fach &&
      (echteIserv(g.iserv_gruppe) ? x.iserv_gruppe === g.iserv_gruppe : klassenName(x.name) === klassenName(g.name))
  )
}

/*
 * Mitlehrkraft NUR PER EINLADUNG (23.10.2026, Prüfung „jeder sieht nur Eigenes“, Entscheidung der Lehrkraft): Bis dahin
 * genügte ein gleich benannter Kurs (bzw. dieselbe, frei eintragbare IServ-Gruppe) mit gleichem Fach – jede Lehrkraft
 * hätte sich so Material, Abgaben und Namen der Lernenden einer Kollegin anzeigen lassen können. Jetzt lädt die Lehrkraft
 * der Lerngruppe ausdrücklich ein; der gleiche Kurs bestimmt nur noch, in welcher eigenen Lerngruppe das Material erscheint.
 */
export function eingeladen(lerngruppeId: string, lehrkraftId: string): boolean {
  return Boolean(db().prepare('SELECT 1 FROM mitlehrkraft_einladungen WHERE lerngruppe_id = ? AND lehrkraft_id = ?').get(lerngruppeId, lehrkraftId))
}

export function einladungen(lerngruppeId: string): string[] {
  return (db().prepare('SELECT lehrkraft_id FROM mitlehrkraft_einladungen WHERE lerngruppe_id = ?').all(lerngruppeId) as { lehrkraft_id: string }[]).map(
    (z) => z.lehrkraft_id
  )
}

export function setzeEinladungen(lerngruppeId: string, ids: readonly string[]): string[] {
  const g = lerngruppe(lerngruppeId)
  if (!g) return []
  const lehrkraefte = new Set(alleNutzer().filter((n) => (n.rolle === 'lehrkraft' || n.rolle === 'admin') && !n.gesperrt && n.id !== g.lehrkraft_id).map((n) => n.id))
  const gueltig = [...new Set(ids)].filter((id) => lehrkraefte.has(id))
  const d = db()
  d.prepare('DELETE FROM mitlehrkraft_einladungen WHERE lerngruppe_id = ?').run(lerngruppeId)
  const neu = d.prepare('INSERT INTO mitlehrkraft_einladungen (lerngruppe_id, lehrkraft_id, erstellt) VALUES (?, ?, ?)')
  for (const id of gueltig) neu.run(lerngruppeId, id, new Date().toISOString())
  return gueltig
}

/** Lerngruppen anderer Lehrkräfte im selben Kurs, die die Lehrkraft von `g` eingeladen haben */
export function eingeladeneGeschwister(g: Lerngruppe): Lerngruppe[] {
  return kursGeschwister(g).filter((x) => eingeladen(x.id, g.lehrkraft_id))
}

/** Mitlehrkraft darf Material der Lerngruppe ANSEHEN (mit Lernstand) – nur eingeladen; verwalten nur, wer sie angelegt hat */
export function mitlehrkraftDarfSehen(ichId: string, lerngruppeId: string): boolean {
  const g = lerngruppe(lerngruppeId)
  if (!g || g.lehrkraft_id === ichId) return false
  return eingeladen(g.id, ichId)
}

interface Roh {
  art: MaterialArt
  id: string
  titel: string
  thema: string
  oberthema: string
  erstellt: string
  status: string
  lerngruppeId: string
  lehrkraftId: string
  /** Onlinetest: Code (Lernende kennen Tests nur darüber) */
  code?: string
  /** Arbeitsblatt: eingeholte Rückmeldungen (Feedback außerhalb der App) */
  rueckmeldungen?: number
}

const tabelleDa = (t: string): boolean => Boolean(datenbank().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t))

function rohMaterial(gruppen: string[]): Roh[] {
  if (!gruppen.length) return []
  const d = datenbank()
  const platz = gruppen.map(() => '?').join(',')
  const aus: Roh[] = []
  const zeilen = <T>(t: string, sql: string): T[] => (tabelleDa(t) ? (d.prepare(sql).all(...gruppen) as T[]) : [])
  type Z = Record<string, string | null>
  // Rückmeldungen zum Blatt (19.10.2026, abgestimmt): Teil des Blatts – gezählt, kein eigenes Material
  const rueck = (id: string): number =>
    tabelleDa('feedback_abgaben') && id
      ? Number((d.prepare('SELECT COUNT(*) AS n FROM feedback_abgaben WHERE freigabe_id = ?').get(id) as { n: number }).n)
      : 0
  for (const z of zeilen<Z>(
    'blatt_freigaben',
    `SELECT id, titel, thema, erstellt, status, lerngruppe_id, lehrkraft_id, rueckmeldung_id FROM blatt_freigaben WHERE reihe = '' AND lerngruppe_id IN (${platz})`
  ))
    aus.push({
      art: 'blatt',
      id: String(z.id),
      titel: String(z.titel ?? ''),
      thema: String(z.thema ?? ''),
      oberthema: '',
      erstellt: String(z.erstellt),
      status: String(z.status),
      lerngruppeId: String(z.lerngruppe_id),
      lehrkraftId: String(z.lehrkraft_id),
      rueckmeldungen: rueck(String(z.rueckmeldung_id ?? ''))
    })
  for (const z of zeilen<Z>(
    'reihen_zuweisungen',
    `SELECT z.id, z.erstellt, z.status, z.lerngruppe_id, z.lehrkraft_id, r.titel, r.daten FROM reihen_zuweisungen z JOIN reihen r ON r.id = z.reihe_id WHERE z.lerngruppe_id IN (${platz})`
  )) {
    let oberthema = ''
    try {
      oberthema = String((JSON.parse(String(z.daten ?? '{}')) as { oberthema?: string }).oberthema ?? '')
    } catch {
      /* ohne Oberthema */
    }
    aus.push({ art: 'reihe', id: String(z.id), titel: String(z.titel ?? ''), thema: '', oberthema, erstellt: String(z.erstellt), status: String(z.status), lerngruppeId: String(z.lerngruppe_id), lehrkraftId: String(z.lehrkraft_id) })
  }
  for (const z of zeilen<Z>('onlinetests', `SELECT id, code, titel, erstellt, status, lerngruppe_id, lehrkraft_id FROM onlinetests WHERE lerngruppe_id IN (${platz})`))
    aus.push({ art: 'test', id: String(z.id), code: String(z.code ?? ''), titel: String(z.titel ?? ''), thema: '', oberthema: '', erstellt: String(z.erstellt), status: String(z.status), lerngruppeId: String(z.lerngruppe_id), lehrkraftId: String(z.lehrkraft_id) })
  // Nur eigenständige Rückmeldungen – die zu einem Blatt bzw. einer Reihe gehören dorthin (art 'blatt' / 'reihe')
  for (const z of zeilen<Z>('feedback_freigaben', `SELECT id, titel, erstellt, status, lerngruppe_id, lehrkraft_id FROM feedback_freigaben WHERE COALESCE(art, '') = '' AND lerngruppe_id IN (${platz})`))
    aus.push({ art: 'rueckmeldung', id: String(z.id), titel: String(z.titel ?? ''), thema: '', oberthema: '', erstellt: String(z.erstellt), status: String(z.status), lerngruppeId: String(z.lerngruppe_id), lehrkraftId: String(z.lehrkraft_id) })
  for (const z of zeilen<Z>('tafel_freigaben', `SELECT id, titel, thema, erstellt, lerngruppe_id, lehrkraft_id FROM tafel_freigaben WHERE lerngruppe_id IN (${platz})`))
    aus.push({ art: 'tafel', id: String(z.id), titel: String(z.titel ?? ''), thema: String(z.thema ?? ''), oberthema: '', erstellt: String(z.erstellt), status: 'offen', lerngruppeId: String(z.lerngruppe_id), lehrkraftId: String(z.lehrkraft_id) })
  return aus
}

// ---------------------------------------------------------------- Umbenennen und Umhängen

function eingriffe(gruppen: string[]): { namen: Map<string, Map<string, string>>; zuordnung: Map<string, string> } {
  const namen = new Map<string, Map<string, string>>()
  const zuordnung = new Map<string, string>()
  if (!gruppen.length) return { namen, zuordnung }
  const zeilen = db()
    .prepare(`SELECT lerngruppe_id, art, schluessel, wert FROM ueberthemen WHERE lerngruppe_id IN (${gruppen.map(() => '?').join(',')})`)
    .all(...gruppen) as { lerngruppe_id: string; art: string; schluessel: string; wert: string }[]
  for (const z of zeilen) {
    if (z.art === 'name') {
      if (!namen.has(z.lerngruppe_id)) namen.set(z.lerngruppe_id, new Map())
      namen.get(z.lerngruppe_id)!.set(z.schluessel, z.wert)
    } else if (z.art === 'zuordnung') zuordnung.set(z.schluessel, z.wert)
  }
  return { namen, zuordnung }
}

export function themaUmbenennen(gruppeId: string, schluessel: string, name: string): void {
  const n = name.trim().slice(0, 120)
  if (!schluessel || schluessel.length > 400) throw new Error('Unbekanntes Überthema.')
  if (!n) db().prepare("DELETE FROM ueberthemen WHERE lerngruppe_id = ? AND art = 'name' AND schluessel = ?").run(gruppeId, schluessel)
  else
    db()
      .prepare("INSERT OR REPLACE INTO ueberthemen (lerngruppe_id, art, schluessel, wert, geaendert) VALUES (?, 'name', ?, ?, ?)")
      .run(gruppeId, schluessel, n, new Date().toISOString())
}

export function materialZuordnen(gruppeId: string, material: string, schluessel: string): void {
  if (!/^(blatt|reihe|test|rueckmeldung|tafel):[\w-]{1,80}$/.test(material)) throw new Error('Unbekanntes Material.')
  if (schluessel.length > 400) throw new Error('Unbekanntes Überthema.')
  if (!schluessel) db().prepare("DELETE FROM ueberthemen WHERE lerngruppe_id = ? AND art = 'zuordnung' AND schluessel = ?").run(gruppeId, material)
  else
    db()
      .prepare("INSERT OR REPLACE INTO ueberthemen (lerngruppe_id, art, schluessel, wert, geaendert) VALUES (?, 'zuordnung', ?, ?, ?)")
      .run(gruppeId, material, schluessel, new Date().toISOString())
}

// ---------------------------------------------------------------- Gruppieren

/**
 * Überthemen der Lerngruppe `g` mit dem Material aus `gruppen` (eigene Lerngruppe und Geschwister). Namen gelten je
 * Lerngruppe: Für die Lehrkraft gilt ihre Benennung (`namenVon`). Für Lernende (`namenVon` null) die der Lerngruppe des
 * Materials, sonst die einer anderen Lehrkraft desselben Kurses – so steht ein Überthema nur einmal da.
 */
export function themenAus(g: Lerngruppe, gruppen: Lerngruppe[], jetzt = Date.now(), namenVon: string | null = g.id): ThemaGruppe[] {
  const k = kontextVon(g, jetzt)
  const ids = gruppen.map((x) => x.id)
  const roh = rohMaterial(ids)
  const { namen, zuordnung } = eingriffe(ids)
  const lehrkraefte = new Map(alleNutzer().map((n) => [n.id, n.name || n.benutzer] as const))
  const kandidatenCache = new Map<string, UeberthemaKandidat[]>()
  const aus = new Map<string, ThemaGruppe>()
  for (const m of roh) {
    const ms = Date.parse(m.erstellt) || jetzt
    const sj = schuljahrVon(ms)
    const jahrgang = k?.jahrgangJetzt ? k.jahrgangJetzt - (k.schuljahrJetzt - sj) : null
    const key = `${jahrgang ?? ''}`
    if (k && !kandidatenCache.has(key)) kandidatenCache.set(key, kandidatenImJahr(k, jahrgang))
    const kandidaten = kandidatenCache.get(key) ?? []
    const mSchluessel = `${m.art}:${m.id}`
    const hand = zuordnung.get(mSchluessel)
    const auto = zuordnen({ titel: m.titel, thema: m.thema, oberthema: m.oberthema }, kandidaten)
    const kandidat = hand ? kandidaten.find((x) => x.schluessel === hand) : auto?.kandidat
    const schluessel = hand ?? kandidat?.schluessel ?? WEITERE
    const original = kandidat?.name ?? (hand?.startsWith('frei:') ? hand.slice(5) : hand ? hand.replace(/^\w+:/, '') : 'Weitere Materialien')
    const semester = kandidat?.semester ?? (jahrgang && jahrgang >= 12 ? (semesterVon(ms, jahrgang) ?? undefined) : undefined)
    const umbenannt =
      namenVon !== null
        ? namen.get(namenVon)?.get(schluessel)
        : (namen.get(m.lerngruppeId)?.get(schluessel) ?? [...namen.values()].map((x) => x.get(schluessel)).find(Boolean))
    const gk = `${sj}|${schluessel}`
    if (!aus.has(gk))
      aus.set(gk, {
        schluessel,
        name: umbenannt ?? original,
        original,
        umbenannt: Boolean(umbenannt),
        schuljahr: sj,
        jahrgang,
        ...(semester ? { semester } : {}),
        rang: schluessel === WEITERE ? 1e6 : (kandidat?.rang ?? 5000),
        materialien: []
      })
    aus.get(gk)!.materialien.push({
      schluessel: mSchluessel,
      art: m.art,
      id: m.id,
      titel: m.titel,
      erstellt: m.erstellt,
      status: m.status,
      lerngruppeId: m.lerngruppeId,
      ...(m.lerngruppeId !== g.id ? { von: lehrkraefte.get(m.lehrkraftId) ?? '' } : {}),
      ...(!hand && auto?.modul ? { modul: auto.modul } : {}),
      ...(hand ? { vonHand: true } : {}),
      ...(m.code ? { code: m.code } : {}),
      ...(m.rueckmeldungen ? { rueckmeldungen: m.rueckmeldungen } : {})
    })
  }
  for (const t of aus.values()) t.materialien.sort((a, b) => (Date.parse(b.erstellt) || 0) - (Date.parse(a.erstellt) || 0))
  return [...aus.values()]
}

/** Kandidaten des aktuellen Jahrgangs (Auswahl beim Umhängen) */
export function kandidatenDerGruppe(g: Lerngruppe, jetzt = Date.now()): { schluessel: string; name: string; semester?: string }[] {
  const k = kontextVon(g, jetzt)
  if (!k) return []
  return kandidatenImJahr(k, k.jahrgangJetzt).map((x) => ({ schluessel: x.schluessel, name: x.name, ...(x.semester ? { semester: x.semester } : {}) }))
}

/** Lernende: Zuordnung je Material ihrer Lerngruppen eines Fachs (Namen der jeweiligen Lerngruppe) */
export function themenFuerLernende(
  ich: NutzerInfo,
  fach: string,
  jetzt = Date.now()
): Record<string, { thema: string; schluessel: string; schuljahr: number; jahrgang: number | null; semester?: string; rang: number; modul?: string; erstellt: string }> {
  const fId = fachAusName(fach)?.id
  const meine = alleLerngruppen().filter(
    (g) => fachAusName(g.fach)?.id === fId && (ich.quelle === 'gast' ? g.mitglieder.includes(ich.benutzer) : gehoertZu(g, ich))
  )
  const aus: ReturnType<typeof themenFuerLernende> = {}
  // Je Kurs (Lerngruppen derselben IServ-Gruppe bzw. desselben Namens) gemeinsam – Namen der Mitlehrkräfte gelten mit
  const erledigt = new Set<string>()
  for (const g of meine) {
    if (erledigt.has(g.id)) continue
    const kurs = [g, ...kursGeschwister(g).filter((x) => meine.some((y) => y.id === x.id))]
    for (const x of kurs) erledigt.add(x.id)
    for (const t of themenAus(g, kurs, jetzt, null))
      for (const m of t.materialien)
        // Tests kennen Lernende über ihren Code
        aus[m.art === 'test' && m.code ? `test:${m.code}` : m.schluessel] = {
          thema: t.name,
          erstellt: m.erstellt,
          schluessel: t.schluessel,
          schuljahr: t.schuljahr,
          jahrgang: t.jahrgang,
          ...(t.semester ? { semester: t.semester } : {}),
          rang: t.rang,
          ...(m.modul ? { modul: m.modul } : {})
        }
  }
  return aus
}

/** Zuordnung eines entstehenden Materials (ohne Lerngruppe): Jahrgang aus dem Blatt, Land/Schulform der Schule */
export function themenVorschau(
  fach: string,
  jahrgang: number | null,
  thema: string,
  titel: string,
  jetzt = Date.now()
): { ueberthema: string | null; semester?: string; modul?: string; module: { rahmenthema: string; semester?: string; name: string; art: string }[] } {
  const k = kontextVon({ id: '', lehrkraft_id: '', name: jahrgang ? String(jahrgang) : '', fach, iserv_gruppe: '', mitglieder: [], erstellt: '' }, jetzt)
  if (!k) return { ueberthema: null, module: [] }
  const kandidaten = kandidatenImJahr(k, jahrgang)
  const z = zuordnen({ titel: titel || thema, thema }, kandidaten)
  return {
    ueberthema: z?.kandidat.name ?? null,
    ...(z?.kandidat.semester ? { semester: z.kandidat.semester } : {}),
    ...(z?.modul ? { modul: z.modul } : {}),
    module: kandidaten.flatMap((x) => (x.module ?? []).map((m) => ({ rahmenthema: x.name, ...(x.semester ? { semester: x.semester } : {}), name: m.name, art: m.art })))
  }
}

/** Lernstand der Blätter und Reihen der Mitlehrkräfte (die eigenen kennt „Meine Klassen" schon) */
function fremdStand(geschwister: Lerngruppe[]): Record<string, { fertig: number; begonnen: number; offen: number; von: number; text: string }> {
  const aus: ReturnType<typeof fremdStand> = {}
  for (const x of geschwister) {
    for (const b of blaetterDerGruppe(x.lehrkraft_id, x.id)) {
      const von = Math.max(0, b.gesamt)
      const fertig = Math.min(b.eingereicht, von)
      const begonnen = Math.max(0, Math.min(b.begonnen, von) - fertig)
      aus[`blatt:${b.id}`] = { fertig, begonnen, offen: von - fertig - begonnen, von, text: `${fertig} von ${von} eingereicht` }
    }
    for (const r of reihenDerGruppe(x.lehrkraft_id, x.id)) {
      const von = r.lernende.length
      const fertig = Math.min(r.fertig, von)
      const offen = Math.min(r.nichtBegonnen.length, von - fertig)
      aus[`reihe:${r.zid}`] = { fertig, begonnen: von - fertig - offen, offen, von, text: `${fertig} von ${von} fertig` }
    }
  }
  return aus
}

// ---------------------------------------------------------------- Route

export function ueberthemenRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    const lernende = url.pathname === '/s/api/themen'
    if (!lernende && !url.pathname.startsWith('/server/themen/')) return false
    if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
    if (lernende) {
      if (req.method !== 'GET') return json(res, 405, { fehler: 'Nicht erlaubt.' }), true
      return json(res, 200, { eintraege: themenFuerLernende(sitzung.nutzer, String(url.searchParams.get('fach') ?? '')), schuljahr: schuljahrVon(Date.now()) }), true
    }
    if (sitzung.nutzer.rolle === 'schueler') return json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true
    const ich = alsNutzer(sitzung.nutzer, sitzung.kennung)
    const teile = url.pathname.split('/').filter(Boolean).slice(2)
    // Nur für Browsertests (wie sprachstand.ts `testzeit`): Freigabezeit eines eigenen Blatts zurückdatieren – so lassen
    // sich „frühere Schuljahre" („Alle Jahrgänge") prüfen. Sonst gibt es den Weg nicht.
    if (req.method === 'POST' && teile[0] === 'testzeit' && process.env.SCHULAPPS_KALENDER_TESTUHR === '1') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const n = datenbank()
        .prepare("UPDATE blatt_freigaben SET erstellt = ? WHERE id = ? AND lehrkraft_id = ?")
        .run(new Date(Number(k0.zeit) || Date.now()).toISOString(), String(k0.id ?? ''), ich.id).changes
      return json(res, n ? 200 : 404, { ok: Boolean(n) }), true
    }
    // Schon beim Erstellen (19.10.2026, Wunsch der Lehrkraft: Q-Phase-Material gleich dem Wahlmodul zuordnen)
    if (req.method === 'GET' && teile[0] === 'vorschau') {
      const p = url.searchParams
      return json(res, 200, themenVorschau(p.get('fach') ?? '', Number(p.get('jahrgang')) || null, p.get('thema') ?? '', p.get('titel') ?? '')), true
    }
    const g = lerngruppe(teile[0] ?? '')
    if (!g || g.lehrkraft_id !== ich.id) return json(res, 404, { fehler: 'Diese Lerngruppe gibt es nicht.' }), true
    // Mitlehrkräfte einladen (23.10.2026): nur die Lehrkraft der Lerngruppe
    if (teile[1] === 'mitlehrkraefte') {
      const lehrkraefte = (): { id: string; name: string }[] =>
        alleNutzer()
          .filter((n) => (n.rolle === 'lehrkraft' || n.rolle === 'admin') && !n.gesperrt && n.id !== ich.id && n.quelle !== 'vorschau' && n.quelle !== 'gast')
          .map((n) => ({ id: n.id, name: n.name || n.benutzer }))
          .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      if (req.method === 'GET') return json(res, 200, { eingeladen: einladungen(g.id), lehrkraefte: lehrkraefte() }), true
      if (req.method !== 'POST' || typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nicht erlaubt.' }), true
      const k1 = (await k.koerper()) as Record<string, unknown>
      const ids = Array.isArray(k1.ids) ? (k1.ids as unknown[]).map(String) : []
      return json(res, 200, { eingeladen: setzeEinladungen(g.id, ids) }), true
    }
    if (req.method === 'GET' && teile.length === 1) {
      // Material der Mitlehrkräfte: nur aus Lerngruppen, die mich eingeladen haben (23.10.2026)
      const geschwister = eingeladeneGeschwister(g)
      const themen = themenAus(g, [g, ...geschwister])
      return json(res, 200, { themen, kandidaten: kandidatenDerGruppe(g), schuljahr: schuljahrVon(Date.now()), fremdStand: fremdStand(geschwister) }), true
    }
    if (req.method !== 'POST' || typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nicht erlaubt.' }), true
    const k0 = (await k.koerper()) as Record<string, unknown>
    try {
      if (teile[1] === 'umbenennen') return themaUmbenennen(g.id, String(k0.schluessel ?? ''), String(k0.name ?? '')), json(res, 200, { ok: true }), true
      if (teile[1] === 'zuordnen') return materialZuordnen(g.id, String(k0.material ?? ''), String(k0.schluessel ?? '')), json(res, 200, { ok: true }), true
    } catch (e) {
      return json(res, 400, { fehler: e instanceof Error ? e.message : String(e) }), true
    }
    return json(res, 404, { fehler: 'Unbekannt.' }), true
  }
}
