/**
 * Grammatik-Lern-App (06.10.2026) – Server. Regeln in shared/grammatiktrainer.ts, Grundgerüst wie vokabeln.ts.
 *
 *  Lehrkraft: GET /server/grammatik · POST /server/grammatik/freigeben (mit dem fertigen, von der KI erzeugten Paket)
 *             GET /server/grammatik/<id> · POST /server/grammatik/<id>/status|loeschen|gast-entfernen
 *  Lernende:  GET /s/api/grammatik · GET /s/api/grammatik/liste?id= · POST /s/api/grammatik/antwort · POST /s/api/grammatik/spiel
 *  Gäste:     GET /s/api/grammatik/zugang?code= · POST /s/api/grammatik/gast {code, name} · POST /s/api/grammatik/wieder
 *
 * Der Lernstand je Person liegt verschlüsselt (feldschutz.ts: gram_stand.daten, gram_zuweisungen.schueler). Lernende lösen
 * keine KI-Anfragen aus – der Aufgabenpool entsteht einmal beim Freigeben.
 */
import { ohneKlasse } from '../shared/ohneKlasse'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { codePruefwert } from './feldschutz'
import {
  GRAMMATIK_SPIELE,
  grammatikRekord,
  paketBereinigt,
  pruefeGrammatik,
  alsKarten,
  type GrammatikPaket,
  type GrammatikSpielId
} from '../shared/grammatiktrainer'
import { istSicher, nachAbfrage, sitzungsWoerter, TAG, tagVon, uebersicht, type Vokabel, type WortStand } from '../shared/vokabeltrainer'
import { nachSpielfehler } from '../shared/vokabelSpiele'
import { alleNutzer, datenbank, nutzerAnlegen, nutzerLoeschen, nutzerNachId, protokolliereServer, sitzungAnlegen, type NutzerInfo } from './datenbank'
import { alsNutzer, json, setzeSitzungsCookie, type Anfrage } from './http'
import { imNutzer } from './kontext'
import { getSettings } from '../main/services/storage/settings'
import { alleLernenden, gastInLerngruppe, gastName, gehoertZu, lerngruppe, mitgliederVon } from './onlinetest'
import { iservBereit } from './anmeldung'
import { gastEntfernen } from './gaeste'
import {
  klasseFuer,
  kursGastAufnehmen,
  kursHaken,
  lernendeVon as vokLernende,
  ueberschriftVon,
  vokabelListenFuer,
  vokabelnZuweisen,
  vokIstFuer,
  vokStatusSetzen,
  zeile as vokZeile,
  ausgeblendetFiltern,
  sprachfaecherDerGruppe,
  teileVon
} from './vokabeln'
import { registerVergessen } from './namensschutz'
import { rekordEintragen } from './rekordbuch'
import { themenTeilung } from './grammatikTeilen'
import { buchFuer } from './vokabelweg'
import { jahrgangDerFreigabe, unitStelle } from '../shared/grammatikJahrgang'
import { quelleUnits, type Quelle } from '../shared/vokabelLaufbahn'
import { jahrgangAus } from '../shared/lernstand'
import { ampelVon } from '../shared/grammatikBereiche'
import { bekannteGrammatik, LEHRWERK_GRAMMATIK } from '../renderer/src/shared/lehrwerkGrammatik'
import { aufgabenAnhaengen, gleichesThema, paketeZusammen } from '../shared/kursEntfernen'
import { abschnitteAusName, bandErkennen, bekanntNachBand, stelleImLehrwerk, type Erkennung, type FreigegebeneUnit, type SchulOrt } from '../shared/lehrwerkBand'
import { abschnitteEinordnen, buchAusKennung, mitBaenden } from '../shared/kursAbschnitte'
import { kursFuerLernende } from '../shared/freigabePlan'
import { geplantAb, kennungenVon, nachFreigabe, nochGeplant } from './freigabePlan'
import { zugangPlan } from './planen'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS gram_zuweisungen (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  lerngruppe_id TEXT NOT NULL DEFAULT '',
  schueler TEXT NOT NULL DEFAULT '[]',
  titel TEXT NOT NULL,
  fach TEXT NOT NULL DEFAULT '',
  sprache TEXT NOT NULL DEFAULT '',
  thema TEXT NOT NULL DEFAULT '',
  paket TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offen',
  erstellt TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  bis INTEGER
);
CREATE TABLE IF NOT EXISTS gram_stand (
  zuweisung_id TEXT NOT NULL REFERENCES gram_zuweisungen(id) ON DELETE CASCADE,
  schueler_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  daten TEXT NOT NULL,
  aktualisiert INTEGER NOT NULL,
  PRIMARY KEY (zuweisung_id, schueler_id)
);
CREATE TABLE IF NOT EXISTS lehrwerk_stand (
  lerngruppe_id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL,
  buch TEXT NOT NULL,
  unit TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gram_gaeste (
  zuweisung_id TEXT NOT NULL REFERENCES gram_zuweisungen(id) ON DELETE CASCADE,
  nutzer_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  wieder TEXT NOT NULL,
  PRIMARY KEY (zuweisung_id, nutzer_id)
);`

let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(SCHEMA)
    // Fest mit einem Vokabeltraining verbunden (08.10.2026, abgestimmt): gilt für genau dessen Lernende
    const spalten = new Set((d.prepare('PRAGMA table_info(gram_zuweisungen)').all() as { name: string }[]).map((s) => s.name))
    if (!spalten.has('vok_id')) d.exec("ALTER TABLE gram_zuweisungen ADD COLUMN vok_id TEXT NOT NULL DEFAULT ''")
    // Sprachenlernen (08.10.2026): Art ('' normal, 'foerder'/'forder' = Extra für einzelne) und Angaben der Freigabe
    // (Themen, Teilformen, Klasse, Lehrwerk) – für bekannte Grammatik und passende Spiele
    if (!spalten.has('art')) d.exec("ALTER TABLE gram_zuweisungen ADD COLUMN art TEXT NOT NULL DEFAULT ''")
    if (!spalten.has('info')) d.exec("ALTER TABLE gram_zuweisungen ADD COLUMN info TEXT NOT NULL DEFAULT ''")
    // „Am häufigsten falsch" – von der Lehrkraft aus der Liste genommen (08.10.2026): JSON {aufgabeId: Fehlerzahl beim Entfernen}
    if (!spalten.has('problem_aus')) d.exec("ALTER TABLE gram_zuweisungen ADD COLUMN problem_aus TEXT NOT NULL DEFAULT ''")
    bereit = true
  }
  return d
}
export const grammatikZuruecksetzen = (): void => {
  bereit = false
}
const json_ = <T>(s: string | null | undefined, r: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : r
  } catch {
    return r
  }
}

interface Zeile {
  id: string
  lehrkraft_id: string
  lerngruppe_id: string
  schueler: string
  titel: string
  fach: string
  sprache: string
  thema: string
  paket: string
  /** 'entfernt' (08.10.2026): aus dem Kurs genommen – für Lernende unsichtbar, der Lernstand bleibt für ein Wiederherstellen */
  status: 'offen' | 'beendet' | 'entfernt'
  erstellt: string
  code: string
  bis: number | null
  /** Verbundenes Vokabeltraining (08.10.2026) */
  vok_id?: string
  /** '' = Grammatik des Kurses; 'foerder'/'forder' = Extra für einzelne Lernende (08.10.2026) */
  art?: string
  /** JSON GrammatikInfo */
  info?: string
  /** JSON {aufgabeId: falsch beim Entfernen} – aus „Am häufigsten falsch" genommen (08.10.2026) */
  problem_aus?: string
}

/** Angaben der Freigabe (08.10.2026) */
export interface GrammatikInfo {
  themen: string[]
  teilformen: string[]
  jahrgang?: number
  lehrwerk?: { buch?: string; unit?: string }
  /** Extra: die Regeln, für die sie gedacht sind */
  fuerRegeln?: string[]
}
export function infoBereinigt(roh: unknown): GrammatikInfo {
  const r = (roh ?? {}) as Record<string, unknown>
  const liste = (x: unknown, n: number): string[] =>
    Array.isArray(x)
      ? x
          .map(String)
          .filter((s) => s.length <= 120)
          .slice(0, n)
      : []
  const lw = (r.lehrwerk ?? {}) as Record<string, unknown>
  return {
    themen: liste(r.themen, 40),
    teilformen: liste(r.teilformen, 120),
    ...(Number.isFinite(Number(r.jahrgang)) && Number(r.jahrgang) >= 1 && Number(r.jahrgang) <= 13 ? { jahrgang: Math.round(Number(r.jahrgang)) } : {}),
    ...(typeof lw.buch === 'string' && lw.buch
      ? { lehrwerk: { buch: lw.buch.slice(0, 80), ...(typeof lw.unit === 'string' ? { unit: lw.unit.slice(0, 80) } : {}) } }
      : {}),
    ...(liste(r.fuerRegeln, 6).length ? { fuerRegeln: liste(r.fuerRegeln, 6) } : {})
  }
}
const infoVon = (z: Zeile): GrammatikInfo => infoBereinigt(json_(z.info, {}))
const istExtra = (z: Pick<Zeile, 'art'>): boolean => z.art === 'foerder' || z.art === 'forder'

// ---------------------------------------------------------------- Bekannte Grammatik (08.10.2026, abgestimmt)

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')
/** Band der Grammatikliste zu einer Lehrwerk-Kennung oder einem Namen („green-line-1-nds" → „Green Line 1") */
export function grammatikBand(lehrwerk: string): string | undefined {
  const n = norm(lehrwerk)
  return Object.keys(LEHRWERK_GRAMMATIK)
    .filter((b) => n.startsWith(norm(b)))
    .sort((a, b) => b.length - a.length)[0]
}
/** Lehrwerk-Stand einer Lerngruppe, von der Lehrkraft in „Meine Klassen" gesetzt */
export const lehrwerkStandVon = (lerngruppeId: string): { buch: string; unit: string } | null =>
  (db().prepare('SELECT buch, unit FROM lehrwerk_stand WHERE lerngruppe_id = ?').get(lerngruppeId) as { buch: string; unit: string } | undefined) ?? null

/** Höchste Unit der Grammatikliste aus den Quellen von Vokabeltrainings (JSON mit lehrwerk und unit) – der automatische Stand */
export function hoechsteUnit(quellen: string[]): { buch: string; unit: string } | null {
  let best: { buch: string; unit: string; rang: number } | null = null
  for (const roh of quellen) {
    const q = json_(roh, {} as Partial<Quelle>)
    const buch = q.lehrwerk ? grammatikBand(q.lehrwerk) : undefined
    if (!buch) continue
    // Mehrere Units je Kurs (08.10.2026): jede zählt, die höchste gewinnt
    for (const { unit } of quelleUnits(q)) {
      const rang = Object.keys(LEHRWERK_GRAMMATIK).indexOf(buch) * 100 + Object.keys(LEHRWERK_GRAMMATIK[buch]).indexOf(unit)
      if (!best || rang > best.rang) best = { buch, unit, rang }
    }
  }
  return best ? { buch: best.buch, unit: best.unit } : null
}

/** Katalog-Kennungen bis zu einer Unit (alles aus früheren Bänden und Units, dazu die Unit selbst) */
export function bisUnit(buch: string, unit: string): string[] {
  const baende = Object.keys(LEHRWERK_GRAMMATIK)
  const i = baende.indexOf(buch)
  if (i < 0) return []
  const kapitel = Object.keys(LEHRWERK_GRAMMATIK[buch])
  const fruehere = baende.slice(0, i).map((b) => ({ buch: b, kapitel: Object.keys(LEHRWERK_GRAMMATIK[b]) }))
  const { bekannt, neu } = bekannteGrammatik(kapitel, buch, unit, undefined, fruehere)
  return [...bekannt, ...neu].flatMap((p) => p.t)
}

/** Schulort der Lehrkraft (Einstellungen › Schule) für die Band-Erkennung – kurz zwischengespeichert */
const ortCache = new Map<string, { ort: SchulOrt; zeit: number }>()
export function schulOrtVon(lehrkraftId: string): SchulOrt {
  const c = ortCache.get(lehrkraftId)
  if (c && Date.now() - c.zeit < 60_000) return c.ort
  let ort: SchulOrt = {}
  try {
    const lk = nutzerNachId(lehrkraftId)
    const d = lk ? imNutzer(alsNutzer(lk), () => getSettings().defaults) : undefined
    ort = { land: d?.stateId || undefined, schulform: d?.schoolTypeId || undefined }
  } catch {
    // Einstellungen nicht lesbar: ohne Ort (gilt als G9)
  }
  ortCache.set(lehrkraftId, { ort, zeit: Date.now() })
  return ort
}

type VokKurs = NonNullable<ReturnType<typeof vokZeile>>

/** Bände und freigegebene Units aus Vokabelkursen – nur Freigegebenes (geplante Abschnitte zählen noch nicht) */
export function lehrwerkAusKursen(kurse: VokKurs[]): { baende: string[]; freigegeben: FreigegebeneUnit[] } {
  const baende: string[] = []
  const freigegeben: FreigegebeneUnit[] = []
  for (const roh of kurse) {
    const z = kursFuerLernende(roh)
    const q = json_(z.quelle || '{}', {} as Partial<Quelle>)
    const teile = json_(z.woerter, [] as unknown[]).length ? teileVon(z) : []
    for (const e of mitBaenden(teile, abschnitteEinordnen(teile, q), q, z.titel)) {
      if (!e.buch) continue
      baende.push(e.buch)
      // Abschnittsname wie „Check-in, Station 1"; ein ganzer Titel („Green Line 1 - Unit 3") nennt keine – dann die Herkunft
      if (e.unit && !e.name.includes(' - ')) freigegeben.push({ buch: e.buch, unit: e.unit, abschnitte: abschnitteAusName(e.name) })
    }
    if (q.lehrwerk) {
      const buch = buchAusKennung(q.lehrwerk)
      baende.push(buch)
      for (const u of quelleUnits(q)) freigegeben.push({ buch, unit: u.unit, abschnitte: u.abschnitte })
    }
  }
  return { baende, freigegeben }
}

/**
 * Automatischer Lehrwerk-Stand einer Lerngruppe (09.10.2026, abgestimmt; Regeln in shared/lehrwerkBand.ts): Band nach
 * Jahrgang, Schulform und Bundesland, Reihe aus den Vokabeln – ohne Unit. Ohne Jahrgang der höchste Band der Vokabeln.
 */
export function lehrwerkAutomatisch(gid: string): (Erkennung & { freigegeben: FreigegebeneUnit[] }) | null {
  const g = lerngruppe(gid)
  if (!g) return null
  const sprache = sprachfaecherDerGruppe(g.fach)[0]?.sprache
  let kurse: VokKurs[] = []
  let ueblich: string[] = []
  try {
    kurse = (
      db().prepare("SELECT * FROM vok_zuweisungen WHERE lerngruppe_id = ? AND lehrkraft_id = ? AND status = 'offen'").all(gid, g.lehrkraft_id) as unknown as VokKurs[]
    ).filter((z) => !sprache || z.sprache === sprache)
    ueblich = (
      db()
        .prepare("SELECT quelle FROM vok_zuweisungen WHERE lehrkraft_id = ? AND sprache = ? AND quelle != '' ORDER BY erstellt DESC LIMIT 50")
        .all(g.lehrkraft_id, sprache ?? 'en') as { quelle: string }[]
    )
      .map((z) => json_(z.quelle, {} as Partial<Quelle>).lehrwerk ?? '')
      .filter(Boolean)
      .map(buchAusKennung)
  } catch {
    // Noch keine Vokabeltrainings (Tabelle fehlt)
  }
  const { baende, freigegeben } = lehrwerkAusKursen(kurse)
  const e = bandErkennen({ jahrgang: jahrgangAus(g.name), ort: schulOrtVon(g.lehrkraft_id), baende, ueblich })
  return e ? { ...e, freigegeben } : null
}

/**
 * Was ein Kind an Grammatik kennt (09.10.2026 neu abgestimmt: „Frühere Bände + Freigegebenes"): je Lerngruppe der von
 * Hand gesetzte Lehrwerk-Stand (bis zu dieser Unit), sonst der automatisch erkannte Band – alle früheren Bände ganz, vom
 * aktuellen das Freigegebene. Kurse ohne Lerngruppe (QR-Code): höchster Band ihrer Vokabeln, ebenso. Dazu die Themen
 * freigegebener Grammatik. Ohne fein erfasstes Lehrwerk (z. B. Latein) bleibt nur das Freigegebene.
 * Ergebnis: Themen- und Teilform-Kennungen, Themen auch ohne Teilform („en.verb.past_simple").
 */
export function bekannteGrammatikFuer(ich: NutzerInfo): string[] {
  const kennungen = new Set<string>()
  const plus = (t: string): void => {
    kennungen.add(t)
    kennungen.add(t.split('/')[0])
  }
  // 1. Lehrwerk-Stand je Lerngruppe: von Hand gesetzt, sonst erkannt
  const kurse = vokabelListenFuer(ich)
    .map((v) => vokZeile(v.id))
    .filter((z): z is VokKurs => Boolean(z))
  const gruppen = new Set(kurse.map((z) => z.lerngruppe_id).filter(Boolean))
  for (const r of db().prepare('SELECT lerngruppe_id FROM lehrwerk_stand').all() as { lerngruppe_id: string }[]) {
    const g = lerngruppe(r.lerngruppe_id)
    if (g && gehoertZu(g, ich)) gruppen.add(g.id)
  }
  for (const gid of gruppen) {
    const hand = lehrwerkStandVon(gid)
    if (hand) for (const t of bisUnit(hand.buch, hand.unit)) plus(t)
    else {
      const auto = lehrwerkAutomatisch(gid)
      if (auto) for (const t of bekanntNachBand(auto.buch, auto.freigegeben)) plus(t)
    }
  }
  for (const z of kurse.filter((k) => !k.lerngruppe_id)) {
    const { baende, freigegeben } = lehrwerkAusKursen([z])
    const e = bandErkennen({ jahrgang: null, baende })
    if (e) for (const t of bekanntNachBand(e.buch, freigegeben)) plus(t)
  }
  // 2. Freigegebene Grammatik
  for (const z of (db().prepare("SELECT * FROM gram_zuweisungen WHERE status = 'offen'").all() as unknown as Zeile[]).filter((z) => istFuer(z, ich))) {
    const i = infoVon(z)
    for (const t of [...i.themen, ...i.teilformen]) plus(t)
  }
  return [...kennungen].sort()
}

/** Das verbundene Vokabeltraining (falls es noch existiert) */
const vokVon = (z: Zeile): ReturnType<typeof vokZeile> => (z.vok_id ? vokZeile(z.vok_id) : null)

/** Lernstand einer Person: je Aufgabe wie ein Wort im Kasten, dazu Übungstage, Rekorde, „nochmal ansehen" */
interface GramStand {
  aufgaben: Record<string, WortStand>
  tage: string[]
  rekorde?: Record<string, number>
  ansehen?: string[]
}

const istOffen = (z: Pick<Zeile, 'status' | 'bis'>): boolean => z.status === 'offen' && !(z.bis && z.bis < Date.now())
const zeile = (id: string): Zeile | null => (db().prepare('SELECT * FROM gram_zuweisungen WHERE id = ?').get(id) as Zeile | undefined) ?? null
const paketVon = (z: Zeile): GrammatikPaket => json_(z.paket, { thema: z.thema, regeln: [], aufgaben: [] } as GrammatikPaket)
const standVon = (zid: string, sid: string): GramStand =>
  json_((db().prepare('SELECT daten FROM gram_stand WHERE zuweisung_id = ? AND schueler_id = ?').get(zid, sid) as { daten: string } | undefined)?.daten, {
    aufgaben: {},
    tage: []
  } as GramStand)
function standSpeichern(zid: string, sid: string, s: GramStand): void {
  db()
    .prepare(
      'INSERT INTO gram_stand (zuweisung_id, schueler_id, daten, aktualisiert) VALUES (?, ?, ?, ?) ON CONFLICT (zuweisung_id, schueler_id) DO UPDATE SET daten = excluded.daten, aktualisiert = excluded.aktualisiert'
    )
    .run(zid, sid, JSON.stringify(s), Date.now())
}

const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function neuerCode(n = 6): string {
  for (;;) {
    const c = Array.from(randomBytes(n), (b) => CODE_ZEICHEN[b % CODE_ZEICHEN.length]).join('')
    if (!db().prepare('SELECT 1 FROM gram_zuweisungen WHERE code = ?').get(c)) return c
  }
}
// Prüfwert des persönlichen Codes: HMAC mit dem Hauptschlüssel statt ungesalzenem SHA-256 (08.10.2026, feldschutz.ts)
const hashVon = codePruefwert
const nachCode = (code: string): Zeile | null =>
  code ? (db().prepare("SELECT * FROM gram_zuweisungen WHERE code = ? AND code != ''").get(code.toUpperCase()) as Zeile | undefined) ?? null : null
const gaesteVon = (zid: string): NutzerInfo[] =>
  (db().prepare('SELECT nutzer_id FROM gram_gaeste WHERE zuweisung_id = ?').all(zid) as { nutzer_id: string }[])
    .map((g) => nutzerNachId(g.nutzer_id))
    // Vorschaukonten (vorschau.ts) zählen nie mit
    .filter((n): n is NutzerInfo => Boolean(n && n.quelle !== 'vorschau'))
const gastDauer = (z: Pick<Zeile, 'bis'>): number => Math.max(864e5, Math.min(120 * 864e5, (z.bis ?? Date.now() + 90 * 864e5) - Date.now() + 864e5))

/** `kurse`: Merkliste der Kurse (Vokabeltrainings) für viele Prüfungen hintereinander – die Zeile samt Wortliste zu entschlüsseln kostet */
function istFuer(z: Zeile, ich: NutzerInfo, kurse?: Map<string, ReturnType<typeof vokVon>>): boolean {
  if (ich.rolle !== 'schueler') return false
  // Geplante Freischaltung (09.10.2026, freigabePlan.ts): die Aufgaben dürfen schon fertig sein, die Lernenden sehen sie erst ab dann
  if (nochGeplant('gram', z.id)) return false
  if (db().prepare('SELECT 1 FROM gram_gaeste WHERE zuweisung_id = ? AND nutzer_id = ?').get(z.id, ich.id)) return true
  // Extra (Förder/Forder, 08.10.2026): nur für die gewählten Lernenden, nicht für den ganzen Kurs
  if (istExtra(z)) return ich.quelle !== 'gast' && json_(z.schueler, [] as string[]).includes(ich.benutzer)
  // Verbunden mit einem Vokabeltraining: wer dort lernt (auch eingetragene Gäste), hat auch diese Grammatik
  const v = !kurse ? vokVon(z) : kurse.has(z.vok_id ?? '') ? kurse.get(z.vok_id ?? '')! : (kurse.set(z.vok_id ?? '', vokVon(z)), kurse.get(z.vok_id ?? '')!)
  if (v && vokIstFuer(v, ich)) return true
  // Gäste nur, wenn die Lehrkraft sie in die Lerngruppe eingetragen hat (08.10.2026, „Lernende einer Klasse zuordnen“)
  if (ich.quelle === 'gast' && !gastInLerngruppe(z.lerngruppe_id, ich)) return false
  const nur = json_(z.schueler, [] as string[])
  if (!z.lerngruppe_id) return nur.includes(ich.benutzer)
  const g = lerngruppe(z.lerngruppe_id)
  if (!g || !gehoertZu(g, ich)) return false
  return !nur.length || nur.includes(ich.benutzer)
}

function lernendeVon(z: Zeile): NutzerInfo[] {
  const nur = json_(z.schueler, [] as string[])
  if (istExtra(z)) {
    const feste = alleNutzer().filter((n) => n.rolle === 'schueler' && n.quelle !== 'gast' && nur.includes(n.benutzer))
    const ids = new Set(feste.map((n) => n.id))
    return [...feste, ...gaesteVon(z.id).filter((n) => !ids.has(n.id))]
  }
  const g = z.lerngruppe_id ? lerngruppe(z.lerngruppe_id) : null
  const feste = !z.lerngruppe_id
    ? alleNutzer().filter((n) => n.rolle === 'schueler' && n.quelle !== 'gast' && nur.includes(n.benutzer))
    : g
    ? mitgliederVon(g).filter((n) => !nur.length || nur.includes(n.benutzer))
    : []
  const v = vokVon(z)
  if (v) {
    // Lernende des verbundenen Vokabeltrainings – zusätzlich zu den bisherigen Empfängern
    const ids = new Set<string>()
    return [...vokLernende(v), ...feste, ...gaesteVon(z.id)].filter((n) => !ids.has(n.id) && Boolean(ids.add(n.id)))
  }
  const ids = new Set(feste.map((n) => n.id))
  return [...feste, ...gaesteVon(z.id).filter((n) => !ids.has(n.id))]
}

const karten = (p: GrammatikPaket): Vokabel[] => alsKarten(p.aufgaben) as Vokabel[]

/** „Am häufigsten falsch" eines Trainings (ohne Grenze): ab 3 Versuchen mit Fehlern, höchste Fehlerquote zuerst */
function haeufigFalsch(p: GrammatikPaket, staende: Record<string, WortStand>[]) {
  return p.aufgaben
    .map((a) => {
      let versuche = 0
      let falsch = 0
      const texte = new Map<string, number>()
      for (const st of staende) {
        const s = st[a.id]
        if (!s) continue
        versuche += s.versuche
        falsch += s.falsch
        for (const t of s.fehlerTexte) texte.set(t, (texte.get(t) ?? 0) + 1)
      }
      return {
        id: a.id,
        art: a.art,
        satz: a.satz,
        loesung: a.loesungen[0],
        versuche,
        falsch,
        quote: versuche ? falsch / versuche : 0,
        typisch: [...texte.entries()]
          .sort((x, y) => y[1] - x[1])
          .slice(0, 3)
          .map(([t]) => t)
      }
    })
    .filter((x) => x.versuche >= 3 && x.falsch > 0)
    .sort((x, y) => y.quote - x.quote)
}

/** Für den Lernraum der Lernenden */
export function grammatikFuer(ich: NutzerInfo): {
  id: string
  titel: string
  fach: string
  extra: boolean
  erstellt: string
  uebersicht: ReturnType<typeof uebersicht> & { unbearbeitet: number }
}[] {
  return (
    (db().prepare("SELECT * FROM gram_zuweisungen WHERE status = 'offen' ORDER BY erstellt DESC, rowid").all() as unknown as Zeile[])
      .filter((z) => istOffen(z) && istFuer(z, ich))
      .map((z) => {
        const kk = karten(paketVon(z))
        const st = standVon(z.id, ich.id).aufgaben
        return {
          id: z.id,
          // Extra heißt bei den Lernenden „Extra für dich: …" – ohne Etikett Förder/Forder (abgestimmt)
          titel: istExtra(z) ? `Extra für dich: ${z.thema || z.titel}` : ohneKlasse(z.titel),
          fach: z.fach,
          extra: istExtra(z),
          // Freigabedatum für „Mein Lernraum" auf der Startseite (08.10.2026)
          erstellt: z.erstellt,
          // Startkarte (08.10.2026): „Noch 23 von 40 Übungen nicht bearbeitet"
          uebersicht: { ...uebersicht(kk, st), unbearbeitet: kk.filter((k) => !st[k.id]?.versuche).length }
        }
      })
      // Extra zuerst
      .sort((a, b) => Number(b.extra) - Number(a.extra))
  )
}

/**
 * Jahrgang und Stelle im Lehrwerk einer Grammatik für den Ordner der Lernenden (08.10.2026, abgestimmt; Reihenfolge der
 * Quellen in shared/grammatikJahrgang.ts): Lehrwerk-Band der Freigabe, Lehrwerk des Kurses, Klasse beim Freigeben,
 * Lerngruppe, sonst die heutige Klasse zurückgerechnet.
 */
export async function jahrgangDerGrammatik(z: Zeile, ich: NutzerInfo): Promise<{ jahrgang: number | null; stelle: number | null }> {
  const info = infoVon(z)
  const v = vokVon(z)
  const q = json_(v?.quelle, {} as { lehrwerk?: string; unit?: string })
  const buch = q.lehrwerk ? await buchFuer(q.lehrwerk, z.lehrkraft_id).catch(() => null) : null
  const band = info.lehrwerk?.buch ? grammatikBand(info.lehrwerk.buch) ?? info.lehrwerk.buch : undefined
  const gruppe = z.lerngruppe_id || v?.lerngruppe_id || ''
  const jahrgang = jahrgangDerFreigabe({
    sprache: z.sprache || v?.sprache || '',
    grammatikBand: band,
    buchJahrgang: (buch as { grade?: number } | null)?.grade ?? null,
    buchBand: buch ? buch.band || buch.name : undefined,
    freigabeKlasse: info.jahrgang ?? null,
    gruppenKlasse: gruppe ? jahrgangAus(lerngruppe(gruppe)?.name) : null,
    heutigeKlasse: klasseFuer({ lerngruppe_id: '' }, ich),
    erstellt: Date.parse(z.erstellt) || undefined
  })
  const stelle = info.lehrwerk?.unit
    ? unitStelle(info.lehrwerk.unit, band && LEHRWERK_GRAMMATIK[band] ? Object.keys(LEHRWERK_GRAMMATIK[band]) : undefined)
    : unitStelle(q.unit, buch?.units.map((u) => u.name))
  return { jahrgang, stelle }
}

/** Band und Unit einer Grammatik: aus der Freigabe (Lehrwerk der Auswahl), sonst aus dem Katalog (erste Einführung) */
export function lehrwerkDerGrammatik(z: Zeile): { buch?: string; unit?: string } {
  const info = infoVon(z)
  if (info.lehrwerk?.buch) return { buch: grammatikBand(info.lehrwerk.buch) ?? info.lehrwerk.buch, ...(info.lehrwerk.unit ? { unit: info.lehrwerk.unit } : {}) }
  return stelleImLehrwerk(info.themen, info.teilformen) ?? {}
}

/**
 * Sprachenlernen (08.10.2026): Grammatiktrainings ohne Kurs werden einmalig zu Kursen ohne Vokabeln – mit ihren
 * Empfängern, Gästen, Code und Zeitraum. Danach hängt die Grammatik über `vok_id` am Kurs.
 */
export function grammatikKurseAnlegen(lehrkraftId: string): void {
  // `art` ist verschlüsselt (08.10.2026) – nach dem Entschlüsseln filtern
  const ohne = (db().prepare("SELECT * FROM gram_zuweisungen WHERE lehrkraft_id = ? AND vok_id = ''").all(lehrkraftId) as unknown as Zeile[]).filter(
    (z) => !z.art
  )
  for (const z of ohne) {
    const vid = vokabelnZuweisen({
      lehrkraftId,
      lerngruppeId: z.lerngruppe_id,
      schueler: json_(z.schueler, [] as string[]),
      titel: z.titel,
      sprache: z.sprache,
      fach: z.fach,
      woerter: [],
      leer: true,
      gaeste: Boolean(z.code),
      bis: z.bis
    })
    for (const g of db().prepare('SELECT nutzer_id, wieder FROM gram_gaeste WHERE zuweisung_id = ?').all(z.id) as { nutzer_id: string; wieder: string }[])
      kursGastAufnehmen(vid, g.nutzer_id, g.wieder)
    db().prepare('UPDATE gram_zuweisungen SET vok_id = ? WHERE id = ?').run(vid, z.id)
    if (!istOffen(z)) vokStatusSetzen(vid, 'beendet')
  }
}
// ---------------------------------------------------------------- Stärken und Schwächen (08.10.2026, abgestimmt)

export interface ProfilPunkt {
  /** Regel (über Pakete hinweg nach Titel zusammengefasst) */
  titel: string
  erklaerung: string
  beispiele: string[]
  versuche: number
  /** Anteil richtig (0–1) */
  quote: number
  /** Letzte falsche Antworten mit der richtigen Lösung – Grundlage der Förderaufgaben (ohne Namen) */
  fehler: { antwort: string; richtig: string }[]
  /** Themen der Freigaben, aus denen die Regel stammt */
  themen: string[]
  /** Katalog-Kennungen der Freigaben („en.verb.past_simple", Teilformen mit „/") – für die Bereiche (08.10.2026) */
  kennungen?: string[]
  /** Zuletzt geübt (ms) – „seit 3 Wochen nicht geübt" (08.10.2026) */
  zuletzt?: number
  /** Mittleres Fach der geübten Aufgaben – „sicher" ab 85 % mit Fach ≥ 3 (08.10.2026) */
  fach?: number
  /** Band und Unit der Freigabe, falls angegeben – Lehrwerk-Stelle (08.10.2026) */
  lehrwerk?: { buch: string; unit: string }
}
export interface GrammatikProfil {
  staerken: ProfilPunkt[]
  schwaechen: ProfilPunkt[]
  extra: { id: string; art: string; titel: string; bearbeitet: number; gesamt: number; status: string }[]
  /** Alle geübten Regeln (ab 1 Versuch) – für die Grammatik-Übersicht der Lehrkraft und Fördern/Fordern je Regel (08.10.2026) */
  regeln: ProfilPunkt[]
}

/** Schwellen (abgestimmt): Schwäche ab 5 Versuchen unter 60 % richtig; Stärke ab 5 Versuchen mit 85 % und Fach ≥ 3 */
export const SCHWAECHE_UNTER = 0.6
export const STAERKE_AB = 0.85
export const MIN_VERSUCHE = 5

/**
 * Stärken und Schwächen einer Person in Grammatik einer Sprache – ohne KI aus den Antworten: je Regel aller
 * Grammatik dieser Lehrkraft, die die Person hat (Extra-Aufgaben eingeschlossen).
 */
export function grammatikProfil(n: NutzerInfo, sprache: string, lehrkraftId: string): GrammatikProfil {
  const zs = (
    db().prepare("SELECT * FROM gram_zuweisungen WHERE lehrkraft_id = ? AND sprache = ? AND status != 'entfernt'").all(lehrkraftId, sprache) as unknown as Zeile[]
  ).filter((z) => istFuer(z, n))
  const jeRegel = new Map<string, ProfilPunkt & { fachSumme: number; geuebt: number }>()
  const extra: GrammatikProfil['extra'] = []
  for (const z of zs) {
    const p = paketVon(z)
    const st = standVon(z.id, n.id).aufgaben
    if (istExtra(z))
      extra.push({
        id: z.id,
        art: z.art ?? '',
        titel: z.thema || z.titel,
        bearbeitet: p.aufgaben.filter((a) => st[a.id]?.versuche).length,
        gesamt: p.aufgaben.length,
        status: istOffen(z) ? 'offen' : 'beendet'
      })
    for (const r of p.regeln) {
      const schluessel = norm(r.titel)
      const e = jeRegel.get(schluessel) ?? {
        titel: r.titel,
        erklaerung: r.erklaerung,
        beispiele: r.beispiele,
        versuche: 0,
        quote: 0,
        fehler: [],
        themen: [],
        kennungen: [],
        zuletzt: 0,
        fachSumme: 0,
        geuebt: 0
      }
      let richtig = e.quote * e.versuche
      for (const a of p.aufgaben.filter((x) => x.regelId === r.id)) {
        const s = st[a.id]
        if (!s?.versuche) continue
        e.versuche += s.versuche
        richtig += s.versuche - s.falsch
        e.fachSumme += s.fach
        e.geuebt++
        e.zuletzt = Math.max(e.zuletzt ?? 0, s.zuletzt ?? 0)
        for (const t of s.fehlerTexte ?? []) e.fehler.push({ antwort: t, richtig: a.loesungen[0] ?? '' })
      }
      e.quote = e.versuche ? richtig / e.versuche : 0
      if (!e.themen.includes(z.thema)) e.themen.push(z.thema)
      // Bereiche und Lehrwerk-Stelle (08.10.2026): Kennungen und Band/Unit aus den Angaben der Freigabe
      const info = infoVon(z)
      for (const k of [...info.themen, ...info.teilformen]) if (!e.kennungen!.includes(k)) e.kennungen!.push(k)
      if (!e.lehrwerk && info.lehrwerk?.buch && info.lehrwerk.unit) e.lehrwerk = { buch: info.lehrwerk.buch, unit: info.lehrwerk.unit }
      e.fehler = e.fehler.slice(-6)
      jeRegel.set(schluessel, e)
    }
  }
  const alle = [...jeRegel.values()].filter((e) => e.versuche >= MIN_VERSUCHE)
  const ohne = ({ fachSumme, geuebt, ...rest }: ProfilPunkt & { fachSumme: number; geuebt: number }): ProfilPunkt => ({
    ...rest,
    fach: geuebt ? Math.round((fachSumme / geuebt) * 10) / 10 : 0
  })
  return {
    schwaechen: alle
      .filter((e) => e.quote < SCHWAECHE_UNTER)
      .sort((a, b) => a.quote - b.quote)
      .slice(0, 3)
      .map(ohne),
    staerken: alle
      .filter((e) => e.quote >= STAERKE_AB && e.geuebt && e.fachSumme / e.geuebt >= 3)
      .sort((a, b) => b.quote - a.quote)
      .slice(0, 3)
      .map(ohne),
    extra,
    regeln: [...jeRegel.values()].filter((e) => e.versuche > 0).map(ohne)
  }
}
kursHaken.profil = grammatikProfil

/**
 * Wer braucht Fördern? (09.10.2026, Handlungsbedarf der Klassenkurse) – dasselbe Ergebnis wie
 * `empfehlung(grammatikProfil(n).regeln).art === 'foerder'`, aber für viele Lernende auf einmal und schnell genug für die
 * Klassenübersicht (Messung mit 8 Klassen à 26: je Person ein Profil kostete ~650 ms je Aufruf von GET /server/klassen):
 *  - die Zuweisungen der Lehrkraft in der Sprache EINMAL lesen (statt je Person), Pakete höchstens einmal entschlüsseln;
 *  - welche Person überhaupt etwas geübt hat, steht in gram_stand (Kennungen unverschlüsselt) – EINE Abfrage ohne Daten;
 *  - nur für diese Paare „ist für" prüfen und den Lernstand entschlüsseln. Schwäche = Regel mit Ampel „schwaeche".
 */
export function grammatikFoerder(nutzer: NutzerInfo[], sprache: string, lehrkraftId: string): Set<string> {
  const aus = new Set<string>()
  if (!nutzer.length) return aus
  const zs = db()
    .prepare("SELECT * FROM gram_zuweisungen WHERE lehrkraft_id = ? AND sprache = ? AND status != 'entfernt'")
    .all(lehrkraftId, sprache) as unknown as Zeile[]
  if (!zs.length) return aus
  const jeId = new Map(nutzer.map((n) => [n.id, n]))
  const paare = new Map<string, Zeile[]>()
  const nachZ = new Map(zs.map((z) => [z.id, z]))
  const abfrage = db().prepare(`SELECT zuweisung_id, schueler_id FROM gram_stand WHERE zuweisung_id IN (${zs.map(() => '?').join(',')})`)
  for (const r of abfrage.all(...zs.map((z) => z.id)) as { zuweisung_id: string; schueler_id: string }[]) {
    if (!jeId.has(r.schueler_id)) continue
    const z = nachZ.get(r.zuweisung_id)
    if (z) paare.set(r.schueler_id, [...(paare.get(r.schueler_id) ?? []), z])
  }
  const pakete = new Map<string, GrammatikPaket>()
  const paket = (z: Zeile): GrammatikPaket => pakete.get(z.id) ?? (pakete.set(z.id, paketVon(z)), pakete.get(z.id)!)
  const kurse = new Map<string, ReturnType<typeof vokVon>>()
  for (const [sid, liste] of paare) {
    const n = jeId.get(sid)!
    const jeRegel = new Map<string, { versuche: number; richtig: number }>()
    for (const z of liste) {
      if (!istFuer(z, n, kurse)) continue
      const p = paket(z)
      const st = standVon(z.id, n.id).aufgaben
      for (const r of p.regeln) {
        const e = jeRegel.get(norm(r.titel)) ?? { versuche: 0, richtig: 0 }
        for (const a of p.aufgaben) {
          const s = a.regelId === r.id ? st[a.id] : undefined
          if (!s?.versuche) continue
          e.versuche += s.versuche
          e.richtig += s.versuche - s.falsch
        }
        jeRegel.set(norm(r.titel), e)
      }
    }
    if ([...jeRegel.values()].some((e) => e.versuche > 0 && ampelVon({ versuche: e.versuche, quote: e.richtig / e.versuche }) === 'schwaeche')) aus.add(sid)
  }
  return aus
}
kursHaken.bekannt = bekannteGrammatikFuer
kursHaken.vorListe = grammatikKurseAnlegen
kursHaken.grammatikZahl = (vokId) =>
  (db().prepare("SELECT art FROM gram_zuweisungen WHERE vok_id = ? AND status != 'entfernt'").all(vokId) as { art: string }[]).filter((z) => !z.art).length

/** Vorschaukonto („Als Schüler ansehen", vorschau.ts): Beispielstand je offenem Training – `stand` bekommt die Kennungen der Aufgaben */
export function grammatikStandSetzen(ich: NutzerInfo, stand: (ids: string[]) => { aufgaben: Record<string, WortStand>; tage: string[] }): void {
  for (const z of (db().prepare("SELECT * FROM gram_zuweisungen WHERE status = 'offen'").all() as unknown as Zeile[]).filter(
    (z) => istOffen(z) && istFuer(z, ich)
  ))
    standSpeichern(z.id, ich.id, stand(karten(paketVon(z)).map((k) => k.id)))
}

/**
 * Schon freigegebene Grammatik eines Kurses bzw. einer Klasse (10.10.2026, Wunsch der Lehrkraft: im Dialog „Grammatik zum
 * Üben freigeben" standardmäßig ausblenden). Als freigegeben zählt nur, was für den GANZEN Kurs bzw. die ganze Klasse gilt:
 * Grammatik der Kurse `kurse` (ganze Gruppe) und der Lerngruppen `gruppen` ohne Einzel-Empfänger. Einzel-Freigaben
 * (Förder-/Forder-Extras, einzelne Lernende) zählen NICHT – sie kommen als Hinweis „für n Lernende schon freigegeben".
 */
export function grammatikFreigegeben(
  lehrkraftId: string,
  kurse: Set<string>,
  gruppen: Set<string>,
  sprache: string
): { frei: string[]; einzeln: { id: string; lernende: number }[] } {
  const frei = new Set<string>()
  const einzeln = new Map<string, Set<string>>()
  const zeilen = db()
    .prepare("SELECT id, lerngruppe_id, schueler, sprache, status, vok_id, art, info FROM gram_zuweisungen WHERE lehrkraft_id = ? AND status != 'entfernt'")
    .all(lehrkraftId) as unknown as Pick<Zeile, 'id' | 'lerngruppe_id' | 'schueler' | 'sprache' | 'status' | 'vok_id' | 'art' | 'info'>[]
  for (const z of zeilen) {
    if (z.sprache && sprache && z.sprache !== sprache) continue
    const imKurs = Boolean(z.vok_id && kurse.has(z.vok_id))
    const inGruppe = Boolean(z.lerngruppe_id && gruppen.has(z.lerngruppe_id))
    if (!imKurs && !inGruppe) continue
    const themen = json_(z.info ?? '', { themen: [] as string[] } as Partial<GrammatikInfo>).themen ?? []
    const schueler = json_(z.schueler, [] as string[])
    if (!z.art && (imKurs || !schueler.length)) for (const t of themen) frei.add(t)
    else for (const t of themen) einzeln.set(t, new Set([...(einzeln.get(t) ?? []), ...(schueler.length ? schueler : [z.id])]))
  }
  return { frei: [...frei], einzeln: [...einzeln.entries()].filter(([id]) => !frei.has(id)).map(([id, l]) => ({ id, lernende: l.size })) }
}

/**
 * „Meine Klassen": Grammatiktrainings einer Lerngruppe – Anteil sicherer Aufgaben je Person (nur laufende), dazu je
 * Training Status, Zeitraum, Umfang, aktive Lernende der letzten 7 Tage und die schwierigsten Aufgaben (Runde 2, 06.10.2026).
 */
export function grammatikDerGruppe(
  lehrkraftId: string,
  lerngruppeId: string,
  jetzt = Date.now()
): {
  trainings: {
    id: string
    titel: string
    sicherSchnitt: number
    status: 'offen' | 'beendet'
    erstellt: string
    bis: number | null
    thema: string
    aufgaben: number
    regeln: number
    lernende: number
    aktiv7: number
    probleme: { satz: string; loesung: string; quote: number; typisch: string[] }[]
    /** Kurs (Vokabeltraining), zu dem die Grammatik gehört – '' = eigenständig (08.10.2026) */
    vokId: string
    /** Extra-Aufgabe für einzelne (Förder-/Forderaufgabe) */
    extra: boolean
    /** Geplante Freischaltung (09.10.2026) */
    geplantAb: number | null
  }[]
  jePerson: Record<string, { sicher: number; gesamt: number }>
} {
  // Auch Grammatik, die nur über den Kurs der Lerngruppe läuft (vok_id, z. B. Extras für einzelne; 08.10.2026)
  let zs: Zeile[]
  try {
    zs = db()
      .prepare(
        'SELECT * FROM gram_zuweisungen WHERE lehrkraft_id = ? AND (lerngruppe_id = ? OR (vok_id != \'\' AND vok_id IN (SELECT id FROM vok_zuweisungen WHERE lehrkraft_id = ? AND lerngruppe_id = ?))) ORDER BY erstellt DESC, rowid'
      )
      .all(lehrkraftId, lerngruppeId, lehrkraftId, lerngruppeId) as unknown as Zeile[]
  } catch {
    // Ohne Vokabeltabelle (noch nie ein Kurs): nur die Lerngruppe selbst
    zs = db()
      .prepare('SELECT * FROM gram_zuweisungen WHERE lehrkraft_id = ? AND lerngruppe_id = ? ORDER BY erstellt DESC, rowid')
      .all(lehrkraftId, lerngruppeId) as unknown as Zeile[]
  }
  const jePerson: Record<string, { sicher: number; gesamt: number }> = {}
  const vor7 = new Date(jetzt - 7 * TAG).toISOString().slice(0, 10)
  // Entfernte Grammatik (08.10.2026) zählt in „Meine Klassen" nicht
  zs = zs.filter((z) => z.status !== 'entfernt')
  const trainings = zs.map((z) => {
    const offen = istOffen(z)
    const p = paketVon(z)
    const k = karten(p)
    const lernende = lernendeVon(z)
    let aktiv7 = 0
    const geplant = geplantAb('gram', z.id, jetzt)
    const jeAufgabe = new Map<string, { versuche: number; falsch: number; texte: Map<string, number> }>()
    const anteile = lernende.map((n) => {
      const st = standVon(z.id, n.id)
      const u = uebersicht(k, st.aufgaben, jetzt)
      if (st.tage.some((t) => t >= vor7)) aktiv7++
      for (const [id, s] of Object.entries(st.aufgaben)) {
        if (!s.versuche) continue
        const j = jeAufgabe.get(id) ?? { versuche: 0, falsch: 0, texte: new Map<string, number>() }
        j.versuche += s.versuche
        j.falsch += s.falsch
        for (const t of s.fehlerTexte ?? []) j.texte.set(t, (j.texte.get(t) ?? 0) + 1)
        jeAufgabe.set(id, j)
      }
      // Extras (einzelne Lernende) zählen nicht in den Grammatik-Stand der Person – Geplantes (09.10.2026) auch nicht
      if (offen && !istExtra(z) && !geplant) {
        const q = (jePerson[n.id] ??= { sicher: 0, gesamt: 0 })
        q.sicher += u.sicher
        q.gesamt += u.gesamt
      }
      return u.gesamt ? u.sicher / u.gesamt : 0
    })
    return {
      id: z.id,
      titel: z.titel,
      sicherSchnitt: anteile.length ? anteile.reduce((a, b) => a + b, 0) / anteile.length : 0,
      status: offen ? ('offen' as const) : ('beendet' as const),
      erstellt: z.erstellt,
      bis: z.bis ?? null,
      thema: z.thema,
      aufgaben: p.aufgaben.length,
      regeln: p.regeln.length,
      lernende: lernende.length,
      aktiv7,
      vokId: z.vok_id ?? '',
      extra: istExtra(z),
      // Geplante Freischaltung (09.10.2026): „geplant ab …"
      geplantAb: geplant,
      probleme: p.aufgaben
        .map((a) => ({ a, j: jeAufgabe.get(a.id) }))
        .filter((x): x is { a: (typeof p.aufgaben)[number]; j: { versuche: number; falsch: number; texte: Map<string, number> } } =>
          Boolean(x.j && x.j.versuche >= 3 && x.j.falsch > 0)
        )
        .sort((x, y) => y.j.falsch / y.j.versuche - x.j.falsch / x.j.versuche)
        .slice(0, 5)
        .map(({ a, j }) => ({
          satz: a.satz || (a.teile ?? []).join(' / '),
          loesung: a.loesungen[0] ?? '',
          quote: j.falsch / j.versuche,
          typisch: [...j.texte.entries()]
            .sort((x, y) => y[1] - x[1])
            .slice(0, 2)
            .map(([t]) => t)
        }))
    }
  })
  return { trainings, jePerson }
}

/**
 * Grammatik anlegen (Freigabe). Kurs-Grammatik mit mehreren Themen wird je Thema ein eigenes Training (08.10.2026,
 * abgestimmt; grammatikTeilen.ts) – gleiche Empfänger und Einstellungen, eigener Code je Training. Extras bleiben eins.
 * Ergebnis: die Kennungen in Themen-Reihenfolge.
 */
export function grammatikAnlegen(f: {
  lehrkraftId: string
  lerngruppeId: string
  schueler: string[]
  titel: string
  fach: string
  sprache: string
  paket: GrammatikPaket
  code: boolean
  bis: number | null
  vokId: string
  art: string
  info: GrammatikInfo
}): string[] {
  const gruppen = f.art
    ? [{ titel: f.titel, paket: f.paket, info: f.info as unknown as Record<string, unknown> }]
    : themenTeilung(f.paket, f.info as unknown as Record<string, unknown>, f.titel).gruppen
  const erstellt = new Date().toISOString()
  // Entfernte Kurs-Grammatik mit gleichem Thema (08.10.2026): wiederherstellen statt neu anlegen – Kennungen und Lernstand bleiben
  const entfernte = f.art
    ? []
    : (
        db()
          .prepare("SELECT * FROM gram_zuweisungen WHERE lehrkraft_id = ? AND status = 'entfernt' AND vok_id = ? AND lerngruppe_id = ? ORDER BY erstellt DESC")
          .all(f.lehrkraftId, f.vokId, f.lerngruppeId) as unknown as Zeile[]
      ).filter((z) => !istExtra(z))
  return gruppen.map((gr) => {
    const info = infoBereinigt(gr.info)
    const alt = entfernte.find((z) => gleichesThema({ titel: z.titel, themen: infoVon(z).themen }, { titel: gr.titel, themen: info.themen }))
    if (alt) {
      entfernte.splice(entfernte.indexOf(alt), 1)
      const { paket } = paketeZusammen(paketVon(alt), gr.paket)
      const ai = infoVon(alt)
      const zusammen: GrammatikInfo = {
        ...ai,
        themen: [...new Set([...ai.themen, ...info.themen])],
        teilformen: [...new Set([...ai.teilformen, ...info.teilformen])],
        ...(info.jahrgang ? { jahrgang: info.jahrgang } : {}),
        ...(info.lehrwerk ? { lehrwerk: info.lehrwerk } : {})
      }
      db()
        .prepare("UPDATE gram_zuweisungen SET status = 'offen', paket = ?, schueler = ?, bis = ?, info = ?, code = ? WHERE id = ?")
        .run(
          JSON.stringify(paket),
          JSON.stringify([...new Set([...json_(alt.schueler, [] as string[]), ...f.schueler])]),
          f.bis,
          JSON.stringify(infoBereinigt(zusammen)),
          alt.code || (f.code ? neuerCode() : ''),
          alt.id
        )
      return alt.id
    }
    const id = randomBytes(8).toString('hex')
    db()
      .prepare(
        "INSERT INTO gram_zuweisungen (id, lehrkraft_id, lerngruppe_id, schueler, titel, fach, sprache, thema, paket, status, erstellt, code, bis, vok_id, art, info) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'offen', ?, ?, ?, ?, ?, ?)"
      )
      .run(
        id,
        f.lehrkraftId,
        f.lerngruppeId,
        JSON.stringify(f.schueler),
        gr.titel.slice(0, 160),
        f.fach.slice(0, 40),
        f.sprache.slice(0, 8),
        gr.paket.thema.slice(0, 160),
        JSON.stringify(gr.paket),
        erstellt,
        f.code ? neuerCode() : '',
        f.bis,
        f.vokId,
        f.art,
        JSON.stringify(info)
      )
    return id
  })
}

export function grammatikRoute(adresse = ''): (k: Anfrage) => Promise<boolean> {
  const link = (code: string): string => `${adresse.replace(/\/$/, '')}/s/gt/${code}`
  return async (k) => {
    const { url, req, res, sitzung } = k
    const schueler = url.pathname === '/s/api/grammatik' || url.pathname.startsWith('/s/api/grammatik/')
    const lehrer = url.pathname === '/server/grammatik' || url.pathname.startsWith('/server/grammatik/')
    if (!schueler && !lehrer) return false
    if (req.method === 'POST' && typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nur aus der App.' }), true
    const sicher = Boolean((req.socket as { encrypted?: boolean }).encrypted)

    // ---------------------------------------------------------------- Zugang per Code
    if (req.method === 'GET' && url.pathname === '/s/api/grammatik/zugang') {
      const z = nachCode(String(url.searchParams.get('code') ?? ''))
      if (!z || !istOffen(z)) return json(res, 404, { fehler: 'Dieses Grammatiktraining gibt es nicht (mehr). Bitte den Code prüfen.' }), true
      return json(res, 200, { id: z.id, titel: ohneKlasse(z.titel), gaeste: !iservBereit(), dabei: Boolean(sitzung && istFuer(z, sitzung.nutzer)), bis: z.bis, ...zugangPlan('gram', z.id, sitzung?.nutzer) }), true
    }
    if (req.method === 'POST' && (url.pathname === '/s/api/grammatik/gast' || url.pathname === '/s/api/grammatik/wieder')) {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const z = nachCode(String(k0.code ?? ''))
      if (!z || !istOffen(z)) return json(res, 404, { fehler: 'Dieses Grammatiktraining gibt es nicht (mehr). Bitte den Code prüfen.' }), true
      // Schon dabei – auch vor einer geplanten Freischaltung (09.10.2026)
      if (sitzung && (istFuer(z, sitzung.nutzer) || zugangPlan('gram', z.id, sitzung.nutzer).dabei)) return json(res, 200, { ok: true, id: z.id }), true
      if (sitzung && sitzung.nutzer.quelle !== 'gast' && sitzung.nutzer.rolle === 'schueler') {
        db().prepare('INSERT OR IGNORE INTO gram_gaeste (zuweisung_id, nutzer_id, wieder) VALUES (?, ?, ?)').run(z.id, sitzung.nutzer.id, '')
        return json(res, 200, { ok: true, id: z.id }), true
      }
      if (iservBereit()) return json(res, 403, { fehler: 'Bitte mit IServ anmelden.' }), true
      const name = gastName(k0.name)
      if (!name) return json(res, 400, { fehler: 'Bitte Vorname und Anfangsbuchstaben des Nachnamens eingeben, z. B. „Anna K.“' }), true
      const gaeste = gaesteVon(z.id).filter((n) => n.quelle === 'gast')
      const gleich = gaeste.find((n) => n.name.toLowerCase() === name.toLowerCase())
      if (url.pathname === '/s/api/grammatik/wieder') {
        const soll = gleich
          ? (db().prepare('SELECT wieder FROM gram_gaeste WHERE zuweisung_id = ? AND nutzer_id = ?').get(z.id, gleich.id) as { wieder: string } | undefined)
              ?.wieder
          : undefined
        const ist = hashVon(String(k0.wieder ?? ''))
        if (!gleich || !soll || soll.length !== ist.length || !timingSafeEqual(Buffer.from(soll), Buffer.from(ist)))
          return json(res, 403, { fehler: 'Name und persönlicher Code passen nicht zusammen.' }), true
        const neu = sitzungAnlegen(gleich.id, 'schueler', gastDauer(z))
        setzeSitzungsCookie(res, neu.cookie, gastDauer(z), sicher)
        return json(res, 200, { ok: true, id: z.id }), true
      }
      if (gleich)
        return (
          json(res, 409, {
            fehler: `„${name}“ ist schon dabei. Zum Weiterlernen unten „Schon dabei?“ wählen – oder einen zweiten Buchstaben des Nachnamens dazunehmen, z. B. „Anna Ko.“`
          }),
          true
        )
      if (gaeste.length >= 120) return json(res, 429, { fehler: 'Für dieses Training sind schon zu viele Gäste angemeldet.' }), true
      const gast = nutzerAnlegen({ benutzer: `gast-${randomBytes(6).toString('hex')}`, name, rolle: 'schueler', quelle: 'gast' })
      registerVergessen()
      const wieder = neuerCode(6)
      db().prepare('INSERT INTO gram_gaeste (zuweisung_id, nutzer_id, wieder) VALUES (?, ?, ?)').run(z.id, gast.id, hashVon(wieder))
      const neu = sitzungAnlegen(gast.id, 'schueler', gastDauer(z))
      setzeSitzungsCookie(res, neu.cookie, gastDauer(z), sicher)
      protokolliereServer('grammatik', 'Beitritt mit Namen (ohne IServ)', gast.id)
      return json(res, 200, { ok: true, id: z.id, wieder }), true
    }

    if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
    const ich = sitzung.nutzer

    // ---------------------------------------------------------------- Lernende
    if (schueler) {
      if (req.method === 'GET' && url.pathname === '/s/api/grammatik') {
        // Jahrgang und Lehrwerk-Stelle je Training (08.10.2026): der Ordner gliedert danach
        const listen = await Promise.all(
          grammatikFuer(ich).map(async (l) => {
            const z = zeile(l.id)
            return { ...l, ...(z ? await jahrgangDerGrammatik(z, ich).catch(() => ({ jahrgang: null, stelle: null })) : {}) }
          })
        )
        return json(res, 200, { listen }), true
      }
      const k0 = req.method === 'POST' ? ((await k.koerper()) as Record<string, unknown>) : {}
      const id = req.method === 'GET' ? String(url.searchParams.get('id') ?? '') : String(k0.id ?? '')
      const z = zeile(id)
      if (!z || !istFuer(z, ich)) return json(res, 404, { fehler: 'Dieses Grammatiktraining ist nicht für dich freigegeben.' }), true
      const p = paketVon(z)
      const st = standVon(z.id, ich.id)
      if (req.method === 'GET' && url.pathname === '/s/api/grammatik/liste')
        return (
          json(res, 200, {
            id: z.id,
            titel: ohneKlasse(z.titel),
            fach: z.fach,
            sprache: z.sprache,
            paket: p,
            staende: st.aufgaben,
            rekorde: st.rekorde ?? {},
            ansehen: st.ansehen ?? [],
            // Sprachenlernen (08.10.2026): Art (Extra), Angaben der Freigabe, bekannte Grammatik (für passende Spiele)
            art: z.art ?? '',
            info: infoVon(z),
            // „Gerade dran" (08.10.2026): in den letzten 14 Tagen freigegeben
            erstellt: z.erstellt,
            bekannt: bekannteGrammatikFuer(ich)
          }),
          true
        )
      if (req.method === 'POST' && url.pathname === '/s/api/grammatik/antwort') {
        if (!istOffen(z)) return json(res, 409, { fehler: 'Dieses Training ist abgeschlossen.' }), true
        const a = p.aufgaben.find((x) => x.id === k0.aufgabeId)
        if (!a) return json(res, 400, { fehler: 'Unbekannte Aufgabe.' }), true
        // Tabellen und Bestimmungen kommen als JSON – deshalb mehr Platz als für einen Satz
        const antwort = String(k0.antwort ?? '').slice(0, 4000)
        const selbst = k0.selbst === 'richtig' || k0.selbst === 'fast' || k0.selbst === 'falsch' ? k0.selbst : undefined
        const e = pruefeGrammatik(a, antwort, typeof k0.wort === 'string' ? k0.wort : undefined, selbst)
        const jetzt = Date.now()
        const neu = nachAbfrage(
          st.aufgaben[a.id] ?? { fach: 0, faellig: 0, frei: [], erkannt: 0, erkennenVersuche: 0, versuche: 0, falsch: 0, fehlerTexte: [], zuletzt: 0 },
          'frei',
          e.urteil,
          antwort,
          jetzt
        )
        st.aufgaben[a.id] = neu
        if (e.urteil === 'richtig' && st.ansehen?.includes(a.id)) st.ansehen = st.ansehen.filter((x) => x !== a.id)
        const heute = new Date(jetzt).toISOString().slice(0, 10)
        if (!st.tage.includes(heute)) st.tage = [...st.tage, heute].slice(-60)
        standSpeichern(z.id, ich.id, st)
        return json(res, 200, { urteil: e.urteil, richtig: e.richtig, erklaerung: a.erklaerung ?? '', stand: neu, sicher: istSicher(neu) }), true
      }
      if (req.method === 'POST' && url.pathname === '/s/api/grammatik/spiel') {
        const spiel = String(k0.spiel ?? '') as GrammatikSpielId
        const wert = Number(k0.wert)
        if (!GRAMMATIK_SPIELE.some((x) => x.id === spiel) || !Number.isFinite(wert) || wert < 0 || wert > 100000)
          return json(res, 400, { fehler: 'Unbekanntes Spiel.' }), true
        const rekord = grammatikRekord(spiel, wert, st.rekorde?.[spiel])
        if (rekord) st.rekorde = { ...(st.rekorde ?? {}), [spiel]: wert }
        // Rekordbuch (08.10.2026): persönlicher Rekord des Schuljahres
        const v = vokVon(z)
        rekordEintragen(ich, `gram:${spiel}`, wert, v ? klasseFuer(v, ich) : klasseFuer({ lerngruppe_id: z.lerngruppe_id }, ich), Date.now(), undefined, z.sprache)
        // Fehler wie bei den Vokabelspielen: wackelig, gleich wieder dran; sichere ein Fach zurück
        const fehler = (Array.isArray(k0.fehler) ? k0.fehler : []).map(String).filter((x) => p.aufgaben.some((a) => a.id === x))
        st.ansehen = [...new Set([...(st.ansehen ?? []), ...fehler])].slice(-30)
        for (const f of new Set(fehler)) if (st.aufgaben[f]) st.aufgaben[f] = nachSpielfehler(st.aufgaben[f])
        const heute = new Date().toISOString().slice(0, 10)
        if (!st.tage.includes(heute)) st.tage = [...st.tage, heute].slice(-60)
        standSpeichern(z.id, ich.id, st)
        return json(res, 200, { rekord, rekorde: st.rekorde ?? {}, ansehen: st.ansehen }), true
      }
      return json(res, 404, { fehler: 'Unbekannt.' }), true
    }

    // ---------------------------------------------------------------- Lehrkraft
    if (ich.rolle === 'schueler') return json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true
    const teile = url.pathname.split('/').filter(Boolean).slice(2)
    const gruppeName = (z: Zeile): string =>
      vokVon(z)
        ? `${z.lerngruppe_id ? `${lerngruppe(z.lerngruppe_id)?.name ?? ''} + ` : ''}wie Vokabeltraining „${ueberschriftVon(vokVon(z)!)}“`
        : z.lerngruppe_id
        ? lerngruppe(z.lerngruppe_id)?.name ?? ''
        : z.code && !json_(z.schueler, [] as string[]).length
        ? 'Per QR-Code'
        : 'Einzelne Lernende'
    if (req.method === 'GET' && teile.length === 0) {
      const liste = db().prepare('SELECT * FROM gram_zuweisungen WHERE lehrkraft_id = ? ORDER BY erstellt DESC, rowid').all(ich.id) as unknown as Zeile[]
      // Jahrgang und Lehrwerk-Stelle je Training (08.10.2026): die Kursseite gliedert die Grammatik nach Schuljahren
      const jahre = await Promise.all(liste.map((z) => jahrgangDerGrammatik(z, ich).catch(() => ({ jahrgang: null, stelle: null }))))
      return (
        json(res, 200, {
          zuweisungen: liste.map((z, i) => {
            const kk = karten(paketVon(z))
            const l = lernendeVon(z)
            // Je Person EINMAL lesen (09.10.2026, Leistung: vorher je Aufgabe neu entschlüsselt)
            const staende = l.map((n) => standVon(z.id, n.id).aufgaben)
            const sicherZahl = staende.map((st) => uebersicht(kk, st).sicher)
            return {
              id: z.id,
              titel: z.titel,
              fach: z.fach,
              thema: z.thema,
              lerngruppe: gruppeName(z),
              vokId: z.vok_id ?? '',
              lerngruppeId: z.lerngruppe_id,
              // Geplante Freischaltung (09.10.2026): Uhr „geplant ab …" auf der Kursseite
              geplantAb: geplantAb('gram', z.id),
              art: z.art ?? '',
              ...(istExtra(z) ? { fuer: l.map((n) => ({ id: n.id, name: n.name || n.benutzer })) } : {}),
              bearbeitetSchnitt:
                l.length && kk.length
                  ? staende.reduce((s, st) => s + kk.filter((k) => st[k.id]?.versuche).length, 0) / l.length / kk.length
                  : 0,
              aufgaben: kk.length,
              lernende: l.length,
              sicherSchnitt: l.length && kk.length ? sicherZahl.reduce((a, b) => a + b, 0) / l.length / kk.length : 0,
              status: z.status === 'entfernt' ? 'entfernt' : istOffen(z) ? 'offen' : 'beendet',
              // Regeltitel für die Suche auf der Kursseite (08.10.2026)
              regeln: paketVon(z).regeln.map((r) => r.titel),
              // Katalog-Themen der Freigabe (08.10.2026): im Dialog „Grammatik hinzufügen" vorab angehakt
              themen: infoVon(z).themen,
              erstellt: z.erstellt,
              jahrgang: jahre[i].jahrgang,
              stelle: jahre[i].stelle,
              // Band und Unit (09.10.2026): Kursseite gliedert die Grammatik nach Lehrwerk, sonst nach Schuljahr
              ...lehrwerkDerGrammatik(z),
              ...(z.code ? { code: z.code, link: link(z.code) } : {})
            }
          })
        }),
        true
      )
    }
    // Lehrwerk-Stand einer Lerngruppe („Meine Klassen", 08.10.2026): leer = automatisch aus den Vokabeln
    if (teile[0] === 'lehrwerkstand') {
      if (req.method === 'GET') {
        const gid = String(url.searchParams.get('gruppe') ?? '')
        const g = lerngruppe(gid)
        if (!g || g.lehrkraft_id !== ich.id) return json(res, 404, { fehler: 'Unbekannte Lerngruppe.' }), true
        // Was „automatisch" gerade ergibt (09.10.2026): Band nach Jahrgang, Schulform und Land – ohne Unit
        const auto = lehrwerkAutomatisch(gid)
        const automatisch = auto ? { buch: auto.buch, unit: '', grund: auto.grund } : null
        return (
          json(res, 200, {
            stand: lehrwerkStandVon(gid),
            automatisch,
            baende: Object.fromEntries(Object.entries(LEHRWERK_GRAMMATIK).map(([b, k]) => [b, Object.keys(k)]))
          }),
          true
        )
      }
      const k0 = (await k.koerper()) as Record<string, unknown>
      const gid = String(k0.gruppe ?? '')
      const g = lerngruppe(gid)
      if (!g || g.lehrkraft_id !== ich.id) return json(res, 404, { fehler: 'Unbekannte Lerngruppe.' }), true
      const buch = String(k0.buch ?? '')
      const unit = String(k0.unit ?? '')
      // Band oder Unit geleert („Automatisch"): Eintrag löschen – dann gilt wieder der Stand aus den Vokabeln
      if (!buch || !unit) db().prepare('DELETE FROM lehrwerk_stand WHERE lerngruppe_id = ?').run(gid)
      else {
        if (!LEHRWERK_GRAMMATIK[buch]?.[unit]) return json(res, 400, { fehler: 'Unbekannter Band oder unbekannte Unit.' }), true
        db()
          .prepare(
            'INSERT INTO lehrwerk_stand (lerngruppe_id, lehrkraft_id, buch, unit) VALUES (?, ?, ?, ?) ON CONFLICT(lerngruppe_id) DO UPDATE SET buch = excluded.buch, unit = excluded.unit'
          )
          .run(gid, ich.id, buch, unit)
      }
      return json(res, 200, { ok: true }), true
    }
    if (req.method === 'POST' && teile[0] === 'freigeben') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const gid = String(k0.lerngruppeId ?? '')
      const g = gid ? lerngruppe(gid) : null
      if (gid && (!g || g.lehrkraft_id !== ich.id)) return json(res, 400, { fehler: 'Bitte eine eigene Lerngruppe wählen.' }), true
      const erlaubt = new Set((g ? mitgliederVon(g) : alleLernenden()).map((n) => n.benutzer))
      const einzelne = Array.isArray(k0.schueler) ? [...new Set((k0.schueler as unknown[]).map(String).filter((b) => erlaubt.has(b)))] : []
      const mitGaesten = k0.gaeste === true
      // Lernende eines eigenen Vokabeltrainings (08.10.2026)
      const vok = k0.vokId ? vokZeile(String(k0.vokId)) : null
      if (k0.vokId && (!vok || vok.lehrkraft_id !== ich.id)) return json(res, 400, { fehler: 'Bitte ein eigenes Vokabeltraining wählen.' }), true
      if (!g && !einzelne.length && !mitGaesten && !vok)
        return json(res, 400, { fehler: 'Bitte eine Lerngruppe, einzelne Lernende oder den Zugang per QR-Code wählen.' }), true
      // Extra (Förder/Forder, 08.10.2026): nur für einzelne Lernende des Kurses (Nutzer-Kennungen)
      const art = k0.art === 'foerder' || k0.art === 'forder' ? k0.art : ''
      const extraFuer: NutzerInfo[] = []
      if (art) {
        if (!vok) return json(res, 400, { fehler: 'Extra-Aufgaben gehören zu einem Kurs.' }), true
        const imKurs = new Map(vokLernende(vok).map((n) => [n.id, n]))
        for (const nid of Array.isArray(k0.fuer) ? (k0.fuer as unknown[]).map(String) : []) if (imKurs.has(nid)) extraFuer.push(imKurs.get(nid)!)
        if (!extraFuer.length) return json(res, 400, { fehler: 'Bitte mindestens eine Person aus dem Kurs wählen.' }), true
        einzelne.length = 0
        einzelne.push(...extraFuer.filter((n) => n.quelle !== 'gast').map((n) => n.benutzer))
      }
      const paket = paketBereinigt(k0.paket, String(k0.thema ?? ''))
      if (paket.aufgaben.length < (art ? 4 : 8))
        return json(res, 400, { fehler: `Der Aufgabenpool ist zu klein (mindestens ${art ? 4 : 8} brauchbare Aufgaben).` }), true
      // „Planen …" (09.10.2026): nur NEUE (oder zurückgeholte) Trainings werden geplant – Aufgaben, die an ein laufendes
      // Training angehängt werden, verschwänden sonst samt dem Bisherigen
      const schonSichtbar = new Set([...kennungenVon('gram_zuweisungen', ich.id)].filter((x) => zeile(x)?.status !== 'entfernt'))
      const ids = grammatikAnlegen({
        lehrkraftId: ich.id,
        lerngruppeId: art ? '' : g?.id ?? '',
        schueler: einzelne,
        titel: String(k0.titel ?? paket.thema ?? 'Grammatik'),
        fach: String(k0.fach ?? ''),
        sprache: String(k0.sprache ?? ''),
        paket,
        code: mitGaesten && !art,
        bis: typeof k0.bis === 'number' && k0.bis > Date.now() ? k0.bis : null,
        vokId: vok?.id ?? '',
        art,
        info: infoBereinigt(k0.info)
      })
      const id = ids[0]
      // Gäste unter den Empfängern einer Extra-Freigabe
      for (const n of extraFuer.filter((x) => x.quelle === 'gast'))
        db().prepare('INSERT OR IGNORE INTO gram_gaeste (zuweisung_id, nutzer_id, wieder) VALUES (?, ?, ?)').run(id, n.id, '')
      const geplant = nachFreigabe('gram', ids.filter((x) => !schonSichtbar.has(x)), k0, ich.id, art ? '' : g?.id ?? vok?.lerngruppe_id ?? '')
      protokolliereServer(
        'grammatik',
        geplant
          ? 'Grammatik-Freigabe geplant'
          : art ? `Extra-Aufgaben (${art}) freigegeben` : ids.length > 1 ? `Grammatik freigegeben – ${ids.length} Trainings (je Thema eines)` : 'Grammatiktraining freigegeben',
        ich.id
      )
      return json(res, 200, { id, ids, aufgaben: paket.aufgaben.length, geplant }), true
    }
    const z = teile[0] ? zeile(teile[0]) : null
    if (!z || z.lehrkraft_id !== ich.id) return json(res, 404, { fehler: 'Unbekannt.' }), true
    if (req.method === 'GET' && teile.length === 1) {
      const p = paketVon(z)
      const kk = karten(p)
      const jetzt = Date.now()
      const vor7 = new Date(jetzt - 7 * TAG).toISOString().slice(0, 10)
      const lernende = lernendeVon(z).map((n) => {
        const st = standVon(z.id, n.id)
        return {
          id: n.id,
          name: n.name || n.benutzer,
          gast: n.quelle === 'gast',
          uebersicht: uebersicht(kk, st.aufgaben, jetzt),
          tage7: st.tage.filter((t) => t >= vor7).length,
          stand: st.aufgaben
        }
      })
      // Aus der Liste genommene erst wieder bei neuen Fehlern (08.10.2026); die 10 erst nach dem Ausblenden
      const problem = ausgeblendetFiltern(
        haeufigFalsch(p, lernende.map((l) => l.stand)),
        json_(z.problem_aus, {} as Record<string, number>)
      ).sichtbar.slice(0, 10)
      return (
        json(res, 200, {
          id: z.id,
          titel: z.titel,
          fach: z.fach,
          // Sprache und Angaben der Freigabe für „+ Aufgaben" (08.10.2026)
          sprache: z.sprache,
          info: infoVon(z),
          thema: z.thema,
          status: istOffen(z) ? 'offen' : 'beendet',
          bis: z.bis,
          ...(z.code ? { code: z.code, link: link(z.code) } : {}),
          lerngruppe: gruppeName(z),
          paket: p,
          lernende: lernende.map(({ stand: _s, ...rest }) => rest),
          problem
        }),
        true
      )
    }
    if (req.method === 'POST') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      // Aufgabe aus „Am häufigsten falsch" nehmen (08.10.2026): kommt wieder, wenn ihre Fehlerzahl steigt
      if (teile[1] === 'problem-aus') {
        const aid = String(k0.id ?? '')
        const alle = haeufigFalsch(
          paketVon(z),
          lernendeVon(z).map((n) => standVon(z.id, n.id).aufgaben)
        )
        const pr = alle.find((x) => x.id === aid)
        if (!pr) return json(res, 404, { fehler: 'Diese Aufgabe steht nicht in der Liste.' }), true
        const { gueltig } = ausgeblendetFiltern(alle, json_(z.problem_aus, {} as Record<string, number>))
        gueltig[aid] = pr.falsch
        db().prepare('UPDATE gram_zuweisungen SET problem_aus = ? WHERE id = ?').run(JSON.stringify(gueltig), z.id)
        return json(res, 200, { ok: true }), true
      }
      // Aus dem Kurs entfernen bzw. wiederherstellen (08.10.2026): der Lernstand bleibt, Lernende sehen es nicht mehr
      if (teile[1] === 'entfernen' || teile[1] === 'wiederherstellen') {
        db()
          .prepare('UPDATE gram_zuweisungen SET status = ? WHERE id = ?')
          .run(teile[1] === 'entfernen' ? 'entfernt' : 'offen', z.id)
        protokolliereServer('grammatik', teile[1] === 'entfernen' ? 'Grammatik aus dem Kurs entfernt' : 'Grammatik wiederhergestellt', ich.id)
        return json(res, 200, { ok: true }), true
      }
      if (teile[1] === 'status') {
        db()
          .prepare('UPDATE gram_zuweisungen SET status = ? WHERE id = ?')
          .run(k0.status === 'beendet' ? 'beendet' : 'offen', z.id)
        return json(res, 200, { ok: true }), true
      }
      // Aufgaben und Regeln bearbeiten (08.10.2026, Grammatik-Fenster): Kennungen bleiben, der Lernstand gilt weiter
      if (teile[1] === 'paket') {
        const paket = paketBereinigt(k0.paket, z.thema)
        if (paket.aufgaben.length < 3) return json(res, 400, { fehler: 'Es müssen mindestens 3 brauchbare Aufgaben bleiben.' }), true
        db()
          .prepare('UPDATE gram_zuweisungen SET paket = ?, titel = ?, thema = ? WHERE id = ?')
          .run(JSON.stringify(paket), String(k0.titel ?? z.titel).slice(0, 160) || z.titel, paket.thema.slice(0, 160), z.id)
        return json(res, 200, { ok: true, aufgaben: paket.aufgaben.length, paket }), true
      }
      /*
       * Weitere Aufgaben anhängen (08.10.2026, „+ Aufgaben" in der Grammatik des Kurses): die KI-Aufgaben kommen geprüft
       * und bereinigt; die bisherigen behalten ihre Kennungen, die neuen bekommen frische (Lernstand bleibt richtig).
       */
      if (teile[1] === 'anhaengen') {
        const alt = paketVon(z)
        const neu = paketBereinigt({ ...(k0.paket as Record<string, unknown>), regeln: (k0.paket as { regeln?: unknown })?.regeln ?? alt.regeln }, z.thema)
        if (!neu.aufgaben.length) return json(res, 400, { fehler: 'Keine brauchbaren neuen Aufgaben.' }), true
        const { paket: zusammen } = aufgabenAnhaengen(alt, neu, `m${Date.now().toString(36)}`)
        const paket = paketBereinigt(zusammen, z.thema)
        const dazu = paket.aufgaben.length - alt.aufgaben.length
        if (dazu <= 0)
          return json(res, 400, { fehler: 'Keine neuen Aufgaben übernommen – alle waren schon da, oder die Höchstzahl ist erreicht.' }), true
        db().prepare('UPDATE gram_zuweisungen SET paket = ? WHERE id = ?').run(JSON.stringify(paket), z.id)
        protokolliereServer('grammatik', `${dazu} Aufgaben angehängt`, ich.id)
        return json(res, 200, { ok: true, dazu, aufgaben: paket.aufgaben.length }), true
      }
      // Mit einem Vokabeltraining verbinden bzw. lösen (08.10.2026: auch fertige Grammatiktrainings zuordnen)
      if (teile[1] === 'verbinden') {
        const vid = String(k0.vokId ?? '')
        const vok = vid ? vokZeile(vid) : null
        if (vid && (!vok || vok.lehrkraft_id !== ich.id)) return json(res, 400, { fehler: 'Bitte ein eigenes Vokabeltraining wählen.' }), true
        db()
          .prepare('UPDATE gram_zuweisungen SET vok_id = ? WHERE id = ?')
          .run(vok?.id ?? '', z.id)
        return json(res, 200, { ok: true }), true
      }
      if (teile[1] === 'gast-entfernen') {
        const ok = gastEntfernen(
          { tabelle: 'gram_gaeste', spalte: 'zuweisung_id', freigabeId: z.id, stand: [{ tabelle: 'gram_stand', spalte: 'zuweisung_id' }] },
          String(k0.id ?? ''),
          ich.id
        )
        return ok ? (json(res, 200, { ok: true }), true) : (json(res, 404, { fehler: 'Diese Person ist nicht per Code beigetreten.' }), true)
      }
      if (teile[1] === 'loeschen') {
        const gaeste = gaesteVon(z.id).filter((n) => n.quelle === 'gast')
        db().prepare('DELETE FROM gram_zuweisungen WHERE id = ?').run(z.id)
        // Gäste, die noch in einem Vokabel- oder anderen Grammatiktraining sind, behalten ihr Konto (08.10.2026)
        for (const n of gaeste)
          if (!db().prepare('SELECT 1 FROM gram_gaeste WHERE nutzer_id = ? UNION SELECT 1 FROM vok_gaeste WHERE nutzer_id = ?').get(n.id, n.id))
            nutzerLoeschen(n.id)
        return json(res, 200, { ok: true }), true
      }
    }
    return json(res, 404, { fehler: 'Unbekannt.' }), true
  }
}

/**
 * Achievements der Lernenden (08.10.2026): Regeln über alle eigenen Grammatik-Pakete (nach Titel zusammengefasst wie im
 * Profil). Sicher = mindestens drei (bei kleinen Regeln alle) Aufgaben sicher; Schwäche/Stärke mit den Schwellen des
 * Profils. Dazu, wie viele „Extra für dich" ganz bearbeitet sind. Nur Pakete, in denen die Person schon geübt hat.
 */
export function grammatikFuerAchievements(ich: NutzerInfo): {
  regeln: { schluessel: string; sicher: boolean; schwaeche: boolean; staerke: boolean; sprache: string }[]
  extrasGeschafft: number
  tage: string[]
  /** Medaillen je Sprache (10.10.2026): Übungstage je Sprache */
  tageJe: Record<string, string[]>
} {
  const jeRegel = new Map<string, { n: number; sicher: number; versuche: number; richtig: number; fachSumme: number; geuebt: number; sprache: string }>()
  let extrasGeschafft = 0
  const tage = new Set<string>()
  const tageJe: Record<string, string[]> = {}
  for (const { zuweisung_id } of db().prepare('SELECT zuweisung_id FROM gram_stand WHERE schueler_id = ?').all(ich.id) as { zuweisung_id: string }[]) {
    const z = zeile(zuweisung_id)
    if (!z || z.status === 'entfernt' || !istFuer(z, ich)) continue
    const p = paketVon(z)
    const st = standVon(z.id, ich.id)
    for (const t of st.tage ?? []) tage.add(t)
    if (z.sprache) tageJe[z.sprache] = [...(tageJe[z.sprache] ?? []), ...(st.tage ?? [])]
    if (istExtra(z) && p.aufgaben.length && p.aufgaben.every((a) => st.aufgaben[a.id]?.versuche)) extrasGeschafft++
    for (const r of p.regeln) {
      const k = norm(r.titel)
      const e = jeRegel.get(k) ?? { n: 0, sicher: 0, versuche: 0, richtig: 0, fachSumme: 0, geuebt: 0, sprache: z.sprache }
      for (const a of p.aufgaben.filter((x) => x.regelId === r.id)) {
        e.n++
        const s = st.aufgaben[a.id]
        if (!s?.versuche) continue
        if (istSicher(s)) e.sicher++
        e.versuche += s.versuche
        e.richtig += s.versuche - s.falsch
        e.fachSumme += s.fach
        e.geuebt++
      }
      jeRegel.set(k, e)
    }
  }
  return {
    regeln: [...jeRegel.entries()]
      .filter(([, e]) => e.geuebt > 0)
      .map(([schluessel, e]) => {
        const quote = e.versuche ? e.richtig / e.versuche : 0
        return {
          schluessel,
          sicher: e.sicher >= Math.min(3, e.n),
          schwaeche: e.versuche >= MIN_VERSUCHE && quote < SCHWAECHE_UNTER,
          staerke: e.versuche >= MIN_VERSUCHE && quote >= STAERKE_AB && e.fachSumme / e.geuebt >= 3,
          sprache: e.sprache
        }
      }),
    extrasGeschafft,
    tage: [...tage],
    tageJe
  }
}

/**
 * Erinnerungen zum Üben (10.10.2026, erinnerungen.ts): die Grammatik einer Person aus Kursen mit angebotenen
 * Erinnerungen – je Freigabe, seit wann sie da ist, was heute offen ist (fällige Aufgaben und neue bis zu 10 je Tag,
 * wie vor den Spielen) und die Übungstage. Nur Zahlen, keine Inhalte.
 */
export function grammatikFuerErinnerung(ich: NutzerInfo, vokIds: Set<string>, jetzt = Date.now()): { id: string; seit: number; offen: number; tage: string[] }[] {
  if (!vokIds.size) return []
  const heute = tagVon(jetzt)
  return (db().prepare("SELECT * FROM gram_zuweisungen WHERE status = 'offen'").all() as unknown as Zeile[])
    .filter((z) => vokIds.has(z.vok_id ?? '') && istOffen(z) && istFuer(z, ich))
    .map((z) => {
      const p = paketVon(z)
      const st = standVon(z.id, ich.id)
      const auf = st.aufgaben ?? {}
      const faellig = sitzungsWoerter(karten(p), auf, jetzt, 0).length
      const schonNeu = p.aufgaben.filter((a) => auf[a.id]?.erstmals && tagVon(auf[a.id].erstmals!) === heute).length
      const neu = Math.min(Math.max(0, 10 - schonNeu), p.aufgaben.filter((a) => !auf[a.id]?.versuche).length)
      return { id: z.id, seit: Date.parse(z.erstellt) || 0, offen: faellig + neu, tage: st.tage ?? [] }
    })
}

/**
 * Zugriff für die Mehrspieler-Spiele (08.10.2026, server/spiel.ts): Zugang, Paket, Lernstand und Angaben der Freigaben –
 * ohne die Zeilen-Struktur nach außen zu geben.
 */
export const grammatikFuerSpiel = {
  zeile: (id: string) => zeile(id),
  offen: (id: string): boolean => {
    const z = zeile(id)
    return Boolean(z && istOffen(z))
  },
  istFuer: (id: string, ich: NutzerInfo): boolean => {
    const z = zeile(id)
    return Boolean(z && istOffen(z) && istFuer(z, ich))
  },
  paket: (id: string): GrammatikPaket | null => {
    const z = zeile(id)
    return z ? paketVon(z) : null
  },
  info: (id: string): GrammatikInfo | null => {
    const z = zeile(id)
    return z ? infoVon(z) : null
  },
  kopf: (id: string): { id: string; titel: string; thema: string; sprache: string; vokId: string; lerngruppe: string } | null => {
    const z = zeile(id)
    return z ? { id: z.id, titel: z.titel, thema: z.thema, sprache: z.sprache, vokId: z.vok_id ?? '', lerngruppe: z.lerngruppe_id } : null
  },
  stand: (id: string, sid: string): { aufgaben: Record<string, WortStand>; tage: string[]; ansehen?: string[] } => standVon(id, sid),
  speichern: (id: string, sid: string, s: { aufgaben: Record<string, WortStand>; tage: string[]; ansehen?: string[] }): void =>
    standSpeichern(id, sid, s as GramStand),
  /** Offene Freigaben (ohne Extras), z. B. derselben Sprache – für die Formen in der Lobby und dieselbe Katalogform */
  alle: (sprache: string): string[] =>
    (db().prepare("SELECT * FROM gram_zuweisungen WHERE status = 'offen'").all() as unknown as Zeile[])
      .filter((z) => istOffen(z) && !istExtra(z) && (!sprache || z.sprache === sprache))
      .map((z) => z.id),
  bekannt: (ich: NutzerInfo): string[] => bekannteGrammatikFuer(ich)
}
