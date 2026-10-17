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
  type GrammatikAufgabe,
  type GrammatikPaket,
  type GrammatikSpielId
} from '../shared/grammatiktrainer'
import { istSicher, nachAbfrage, TAG, uebersicht, type Vokabel, type WortStand } from '../shared/vokabeltrainer'
import { nachSpielfehler } from '../shared/vokabelSpiele'
import { alleNutzer, datenbank, nutzerAnlegen, nutzerLoeschen, nutzerNachId, protokolliereServer, sitzungAnlegen, type NutzerInfo } from './datenbank'
import { alsNutzer, json, setzeSitzungsCookie, type Anfrage } from './http'
import { imNutzer } from './kontext'
import { getSettings } from '../main/services/storage/settings'
import { alleLernenden, gastInLerngruppe, gastName, gehoertZu, iservGruppeVon, lerngruppe, mitgliederVon } from './onlinetest'
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
  teileVon,
  kursTest,
  onlineTermineVon
} from './vokabeln'
import { registerVergessen } from './namensschutz'
import { gramNachziehen, mitnahmeVon, ruht } from './mitnahme'
import { rekordEintragen } from './rekordbuch'
import { themenTeilung } from './grammatikTeilen'
import { buchFuer } from './vokabelweg'
import { jahrgangDerFreigabe, unitStelle } from '../shared/grammatikJahrgang'
import { quelleUnits, type Quelle } from '../shared/vokabelLaufbahn'
import { jahrgangAus } from '../shared/lernstand'
import { ampelVon } from '../shared/grammatikBereiche'
import { formAusTeilen, formBefund, mitErstemVersuch, nachSpielfehlerGrammatik, type FormAmpel } from '../shared/grammatikSicher'
import { GRAMMATIK_NEU_JE_TAG, grammatikHeute, grammatikKarten } from '../shared/grammatikVorrang'
import { tageszielVorTest } from '../shared/uebungsVorrang'
import { GRAM_PRAEFIX } from '../shared/testAbschnitte'
import { bekannteGrammatik, fruehereBaendeDerReihe, LEHRWERK_GRAMMATIK } from '../renderer/src/shared/lehrwerkGrammatik'
import { aufgabenAnhaengen, gleichesThema, paketeZusammen } from '../shared/kursEntfernen'
import {
  abschnitteAusName,
  bandErkennen,
  bekanntNachBand,
  stationInUnit,
  stelleImBand,
  stelleImLehrwerk,
  type Erkennung,
  type FreigegebeneUnit,
  type SchulOrt
} from '../shared/lehrwerkBand'
import { abschnitteEinordnen, buchAusKennung, mitBaenden } from '../shared/kursAbschnitte'
import { kursFuerLernende } from '../shared/freigabePlan'
import { curriculumBand } from '../shared/fachvorgaben'
import { fachVorgaben } from './fachvorgaben'
import { geplantAb, kennungenVon, nachFreigabe, nochGeplant } from './freigabePlan'
import { zugangPlan } from './planen'
import { bankEintraege, bankMixe, beiBankAenderung } from './grammatikBank'
import {
  bankPaket,
  formVon,
  istKern,
  mixKennungen,
  schluesselGueltig,
  stufenBereinigt,
  stufenFuerSchulform,
  unitVon,
  type Stufe
} from '../shared/grammatikBank'

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
  /**
   * Aufgabenbank (13.10.2026): Schlüssel der hinterlegten Aufgaben (Teilbereiche bzw. gemischt) – das Paket wird aus der
   * Bank gebaut und nach jeder Änderung dort neu (grammatikBank.ts); Bearbeiten nur in der App „Grammatikformen".
   */
  bank?: string[]
  /** Stufen der Aufgaben im Kurs (13.10.2026): nach Schulform vorbelegt, je Kurs änderbar */
  stufen?: Stufe[]
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
    ...(liste(r.fuerRegeln, 6).length ? { fuerRegeln: liste(r.fuerRegeln, 6) } : {}),
    ...(Array.isArray(r.bank) && r.bank.some(schluesselGueltig) ? { bank: [...new Set(r.bank.filter(schluesselGueltig))].slice(0, 80) } : {}),
    ...(stufenBereinigt(r.stufen) ? { stufen: stufenBereinigt(r.stufen) } : {})
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
  // Frühere Bände derselben Reihe (12.10.2026, weitere Lehrwerke aus der App „Grammatikformen")
  const fruehere = fruehereBaendeDerReihe(buch).map((b) => ({ buch: b, kapitel: Object.keys(LEHRWERK_GRAMMATIK[b]) }))
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
      db()
        .prepare("SELECT * FROM vok_zuweisungen WHERE lerngruppe_id = ? AND lehrkraft_id = ? AND status = 'offen'")
        .all(gid, g.lehrkraft_id) as unknown as VokKurs[]
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
  // Schulinternes Curriculum (13.10.2026, Vorgaben der Fachobleute): Band des Jahrgangs vor der Erkennung
  const laut = curriculumBand(fachVorgaben(g.fach), jahrgangAus(g.name))
  if (laut) return { buch: laut, grund: 'jahrgang', freigegeben }
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
const standVon = (zid: string, sid: string): GramStand => {
  const st = json_(
    (db().prepare('SELECT daten FROM gram_stand WHERE zuweisung_id = ? AND schueler_id = ?').get(zid, sid) as { daten: string } | undefined)?.daten,
    {
      aufgaben: {},
      tage: []
    } as GramStand
  )
  // Wiederholer/Klassenwechsel (10.10.2026, mitnahme.ts): Grammatik, die die Person schon geübt hat, zählt sofort
  if (mitnahmeVon(sid)?.gram.length) {
    const z = zeile(zid)
    if (z && gramNachziehen(z, sid, st)) standSpeichern(zid, sid, st)
  }
  return st
}
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
  // Ruhende Einzel-Freigabe (Wiederholer/Klassenwechsel, 10.10.2026, mitnahme.ts)
  if (ruht('gram', z.id, ich.id)) return false
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

/** Lernende einer Grammatik – ohne die, für die sie ruht (Wiederholer/Klassenwechsel, 10.10.2026) */
function lernendeVon(z: Zeile): NutzerInfo[] {
  return lernendeAlle(z).filter((n) => !ruht('gram', z.id, n.id))
}

function lernendeAlle(z: Zeile): NutzerInfo[] {
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
    : unitStelle(
        q.unit,
        buch?.units.map((u) => u.name)
      )
  return { jahrgang, stelle }
}

/**
 * Band, Unit und Station einer Grammatik: aus der Freigabe (Lehrwerk der Auswahl; die Station dann aus dem Katalog dieser
 * Unit), sonst aus dem Katalog (erste Einführung). Station seit 10.10.2026 (Gliederung Band › Unit › Station).
 */
export function lehrwerkDerGrammatik(z: Zeile): { buch?: string; unit?: string; station?: string } {
  const info = infoVon(z)
  if (info.lehrwerk?.buch) {
    const buch = grammatikBand(info.lehrwerk.buch) ?? info.lehrwerk.buch
    // Stelle im Lehrwerk vor der Unit der Freigabe (17.10.2026, shared/lehrwerkBand.ts `stelleImBand`)
    const imBand = stelleImBand(buch, info.themen, info.teilformen)
    if (imBand) return { buch, ...imBand }
    const unit = info.lehrwerk.unit
    const station = unit ? stationInUnit(buch, unit, info.themen, info.teilformen) : undefined
    return { buch, ...(unit ? { unit } : {}), ...(station ? { station } : {}) }
  }
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
  /**
   * Ampel nach der Regel „erster Versuch" (12.10.2026, shared/grammatikSicher.ts `formBefund`); `quote` ist seitdem der
   * Anteil der beim ERSTEN Versuch richtigen Aufgaben, `aufgaben` die Zahl der bearbeiteten verschiedenen Aufgaben.
   */
  ampel?: FormAmpel
  aufgaben?: number
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
    db()
      .prepare("SELECT * FROM gram_zuweisungen WHERE lehrkraft_id = ? AND sprache = ? AND status != 'entfernt'")
      .all(lehrkraftId, sprache) as unknown as Zeile[]
  ).filter((z) => istFuer(z, n))
  type Sammel = ProfilPunkt & {
    fachSumme: number
    geuebt: number
    liste: { id: string; stufe?: number; uebung?: GrammatikAufgabe['uebung'] }[]
    staende: Record<string, WortStand | undefined>
  }
  const jeRegel = new Map<string, Sammel>()
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
        geuebt: 0,
        liste: [],
        staende: {}
      }
      let richtig = e.quote * e.versuche
      for (const a of p.aufgaben.filter((x) => x.regelId === r.id)) {
        const s = st[a.id]
        // Aufgabenreihe der Form (12.10.2026): Kennung je Freigabe – gleiche Kennungen in verschiedenen Paketen sind verschiedene Aufgaben
        e.liste.push({ id: `${z.id}:${a.id}`, stufe: a.stufe, uebung: a.uebung })
        e.staende[`${z.id}:${a.id}`] = s
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
  /*
   * Ampel je Form (12.10.2026, Entscheidung der Lehrkraft – shared/grammatikSicher.ts): nach den VERSCHIEDENEN Aufgaben
   * beim ersten Versuch statt nach allen Versuchen; Stärke = sicher, Schwäche = unter 60 % beim ersten Versuch.
   */
  for (const e of jeRegel.values()) {
    const b = formBefund(e.liste, e.staende)
    e.ampel = b.ampel
    e.quote = b.quote
    e.aufgaben = b.bearbeitet
  }
  const alle = [...jeRegel.values()].filter((e) => e.ampel !== 'wenig')
  const ohne = ({ fachSumme, geuebt, liste: _l, staende: _s, ...rest }: Sammel): ProfilPunkt => ({
    ...rest,
    fach: geuebt ? Math.round((fachSumme / geuebt) * 10) / 10 : 0
  })
  return {
    schwaechen: alle
      .filter((e) => e.ampel === 'schwaeche')
      .sort((a, b) => a.quote - b.quote)
      .slice(0, 3)
      .map(ohne),
    staerken: alle
      .filter((e) => e.ampel === 'sicher')
      .sort((a, b) => b.quote - a.quote)
      .slice(0, 3)
      .map(ohne),
    extra,
    regeln: [...jeRegel.values()].filter((e) => e.versuche > 0).map(ohne)
  }
}

/**
 * „Sicher" in Aufgaben gezählt (12.10.2026, Klassenzahlen): die Aufgaben der Formen, die nach shared/grammatikSicher.ts
 * sicher sind – je Paket (die Zahl teilt durch die Aufgaben des Pakets).
 */
export function sicherAufgaben(p: GrammatikPaket, st: Record<string, WortStand | undefined>): { sicher: number; gesamt: number } {
  let sicher = 0
  for (const r of p.regeln) {
    const reihe = p.aufgaben.filter((a) => a.regelId === r.id)
    if (reihe.length && formBefund(reihe, st).ampel === 'sicher') sicher += reihe.length
  }
  return { sicher, gesamt: p.aufgaben.length }
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
    // Je Form die Aufgabenreihe samt Ständen – Ampel nach dem ersten Versuch (12.10.2026, shared/grammatikSicher.ts)
    const jeRegel = new Map<
      string,
      { liste: { id: string; stufe?: number; uebung?: GrammatikAufgabe['uebung'] }[]; staende: Record<string, WortStand | undefined> }
    >()
    for (const z of liste) {
      if (!istFuer(z, n, kurse)) continue
      const p = paket(z)
      const st = standVon(z.id, n.id).aufgaben
      for (const r of p.regeln) {
        const e = jeRegel.get(norm(r.titel)) ?? { liste: [], staende: {} }
        for (const a of p.aufgaben) {
          if (a.regelId !== r.id) continue
          e.liste.push({ id: `${z.id}:${a.id}`, stufe: a.stufe, uebung: a.uebung })
          e.staende[`${z.id}:${a.id}`] = st[a.id]
        }
        jeRegel.set(norm(r.titel), e)
      }
    }
    if ([...jeRegel.values()].some((e) => ampelVon({ versuche: 0, quote: 0, ampel: formBefund(e.liste, e.staende).ampel }) === 'schwaeche')) aus.add(sid)
  }
  return aus
}
kursHaken.bekannt = bekannteGrammatikFuer
kursHaken.vorListe = grammatikKurseAnlegen
kursHaken.grammatikZahl = (vokId) =>
  (db().prepare("SELECT art FROM gram_zuweisungen WHERE vok_id = ? AND status != 'entfernt'").all(vokId) as { art: string }[]).filter((z) => !z.art).length
// Testabschnitte (12.10.2026): die Grammatik des Kurses (ohne Extras) steht in der Auswahl unter dem Testtermin
kursHaken.grammatikTeile = (vokId) =>
  (db().prepare("SELECT * FROM gram_zuweisungen WHERE vok_id = ? AND status != 'entfernt' ORDER BY erstellt ASC, rowid").all(vokId) as unknown as Zeile[])
    .filter((z) => !istExtra(z))
    .map((z) => ({ id: z.id, titel: z.thema || z.titel, zeit: Date.parse(z.erstellt) || 0 }))

/**
 * Angekündigter Test, der diese Grammatik abfragt (12.10.2026, Übungsvorrang): der Testtermin des verbundenen Kurses
 * (bzw. ein angekündigter Vokabel-Onlinetest der Lerngruppe), wenn die Lehrkraft die Grammatik dafür gewählt hat bzw.
 * die Vorbelegung sie nennt. Dann mehr neue Aufgaben je Tag, bis jede bis 3 Tage vorher einmal dran war.
 */
function grammatikUebung(
  z: Zeile,
  p: GrammatikPaket,
  st: Record<string, WortStand>,
  ich: NutzerInfo,
  jetzt = Date.now()
): { neuJeTag: number; test: boolean; termin: number | null } {
  const v = vokVon(z)
  let t: { termin: number; keys: string[] } | null = null
  try {
    t = v ? kursTest(kursFuerLernende(v, jetzt), onlineTermineVon(ich, jetzt), jetzt) : null
  } catch {
    t = null
  }
  if (!t || !t.keys.includes(`${GRAM_PRAEFIX}${z.id}`)) return { neuJeTag: GRAMMATIK_NEU_JE_TAG, test: false, termin: null }
  const karten = grammatikKarten(p, Date.parse(z.erstellt) || 0, true)
  return { neuJeTag: tageszielVorTest(GRAMMATIK_NEU_JE_TAG, karten, st, t.termin, jetzt), test: true, termin: t.termin }
}

/** Heute offene Aufgaben einer Freigabe für eine Person (Trainer, Erinnerungen, Mehrspieler-Freigabe – 12.10.2026) */
export function grammatikHeuteOffen(z: Zeile, ich: NutzerInfo, jetzt = Date.now()): number {
  const p = paketVon(z)
  const auf = standVon(z.id, ich.id).aufgaben ?? {}
  const u = grammatikUebung(z, p, auf, ich, jetzt)
  return grammatikHeute(p, auf, { erstellt: Date.parse(z.erstellt) || 0, neuJeTag: u.neuJeTag, test: u.test, jetzt }).length
}

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
    /** Aus der Aufgabenbank (13.10.2026) */
    bank?: boolean
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
        "SELECT * FROM gram_zuweisungen WHERE lehrkraft_id = ? AND (lerngruppe_id = ? OR (vok_id != '' AND vok_id IN (SELECT id FROM vok_zuweisungen WHERE lehrkraft_id = ? AND lerngruppe_id = ?))) ORDER BY erstellt DESC, rowid"
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
    const lernende = lernendeVon(z)
    let aktiv7 = 0
    const geplant = geplantAb('gram', z.id, jetzt)
    const jeAufgabe = new Map<string, { versuche: number; falsch: number; texte: Map<string, number> }>()
    const anteile = lernende.map((n) => {
      const st = standVon(z.id, n.id)
      // „Sicher" nach der Form-Regel (12.10.2026, shared/grammatikSicher.ts) statt je Aufgabe nach dem Karteikasten
      const u = sicherAufgaben(p, st.aufgaben)
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
      ...(infoVon(z).bank?.length ? { bank: true } : {}),
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

// ---------------------------------------------------------------- Aufgabenbank (13.10.2026, abgestimmt)

/** Paket eines Trainings aus den hinterlegten Aufgaben (shared/grammatikBank.ts `bankPaket`) */
const paketAusBank = (titel: string, schluessel: readonly string[], stufen?: readonly Stufe[]): GrammatikPaket =>
  bankPaket(titel, bankEintraege(schluessel), stufen)

/** Stufen eines Kurses: was die Lehrkraft je Kurs gewählt hat (an seiner Bank-Grammatik), sonst nach Schulform */
function kursStufen(lehrkraftId: string, vokId: string): Stufe[] {
  for (const z of db().prepare('SELECT * FROM gram_zuweisungen WHERE lehrkraft_id = ? AND vok_id = ?').all(lehrkraftId, vokId) as unknown as Zeile[]) {
    const st = infoVon(z).stufen
    if (st?.length && infoVon(z).bank?.length) return st
  }
  return stufenFuerSchulform(schulOrtVon(lehrkraftId).schulform)
}

/** Formen (Katalogthemen) einer gemischten Wiederholung je Unit aus der Lehrwerk-Liste */
function unitFormen(schluessel: string): string[] {
  const u = unitVon(schluessel)
  const kapitel = u ? LEHRWERK_GRAMMATIK[u.band]?.[u.unit] : undefined
  return kapitel ? [...new Set(Object.values(kapitel).flatMap((punkte) => punkte.flatMap((p) => p.t.map(formVon))))] : []
}

/** Ein Training aus der Bank für einen Kurs anlegen – sofort freigeschaltet (abgestimmt), ohne Code und Enddatum */
function bankTrainingAnlegen(lehrkraftId: string, vok: VokKurs, titel: string, paket: GrammatikPaket, info: GrammatikInfo): string {
  const id = randomBytes(8).toString('hex')
  db()
    .prepare(
      "INSERT INTO gram_zuweisungen (id, lehrkraft_id, lerngruppe_id, schueler, titel, fach, sprache, thema, paket, status, erstellt, code, bis, vok_id, art, info) VALUES (?, ?, '', '[]', ?, ?, ?, ?, ?, 'offen', ?, '', NULL, ?, '', ?)"
    )
    .run(
      id,
      lehrkraftId,
      titel.slice(0, 160),
      String(vok.fach ?? '').slice(0, 40),
      String(vok.sprache ?? '').slice(0, 8),
      titel.slice(0, 160),
      JSON.stringify(paket),
      new Date().toISOString(),
      vok.id,
      JSON.stringify(infoBereinigt(info))
    )
  return id
}

/**
 * Gemischte Aufgaben zuweisen (abgestimmt): je Grammatikpunkt bzw. je Unit, sobald ALLE ihre Formen im Kurs sind und
 * die Bank Aufgaben dazu hat. Einmal Zugewiesenes (auch später Entferntes) kommt nicht von selbst wieder.
 */
function mixeZuweisen(lehrkraftId: string, vokId: string): string[] {
  const vok = vokZeile(vokId)
  if (!vok || !vok.sprache) return []
  const zeilen = (db().prepare('SELECT * FROM gram_zuweisungen WHERE lehrkraft_id = ? AND vok_id = ?').all(lehrkraftId, vokId) as unknown as Zeile[]).filter(
    (z) => !istExtra(z)
  )
  const formen = new Set(zeilen.filter((z) => z.status !== 'entfernt').flatMap((z) => infoVon(z).themen))
  if (!formen.size) return []
  const schon = new Set(zeilen.flatMap((z) => infoVon(z).bank ?? []))
  const ids: string[] = []
  for (const m of bankMixe(vok.sprache)) {
    if (schon.has(m)) continue
    const noetig = m.startsWith('unit:') ? unitFormen(m) : [...new Set(mixKennungen(m).map(formVon))]
    if (!noetig.length || !noetig.every((f) => formen.has(f))) continue
    const e = bankEintraege([m])[0]
    if (!e?.aufgaben.length) continue
    const titel = e.regel.titel || 'Gemischte Übung'
    const stufen = kursStufen(lehrkraftId, vokId)
    const paket = paketAusBank(titel, [m], stufen)
    if (!paket.aufgaben.length) continue
    ids.push(bankTrainingAnlegen(lehrkraftId, vok, titel, paket, { themen: [], teilformen: [], bank: [m], stufen }))
  }
  return ids
}

/**
 * Nach einer Änderung in der Bank: alle Trainings neu bauen, die auf einen der Schlüssel verweisen (Kennungen bleiben,
 * gelöschte Aufgaben fallen weg). Neue gemischte Aufgaben bekommen gleich die Kurse, die schon alle Formen haben.
 */
export function bankKurseNeu(schluessel: string[]): number {
  const s = new Set(schluessel)
  let n = 0
  const kurse = new Map<string, string>()
  for (const z of db().prepare('SELECT * FROM gram_zuweisungen').all() as unknown as Zeile[]) {
    const bank = infoVon(z).bank
    if (!bank?.length) continue
    if (z.vok_id && z.status !== 'entfernt') kurse.set(z.vok_id, z.lehrkraft_id)
    if (!bank.some((x) => s.has(x))) continue
    db()
      .prepare('UPDATE gram_zuweisungen SET paket = ? WHERE id = ?')
      .run(JSON.stringify(paketAusBank(z.thema || z.titel, bank, infoVon(z).stufen)), z.id)
    n++
  }
  if (schluessel.some((x) => !formVon(x))) for (const [vokId, lk] of kurse) n += mixeZuweisen(lk, vokId).length
  return n
}
beiBankAenderung(bankKurseNeu)

/**
 * „Grammatik hinzufügen" mit hinterlegten Aufgaben (13.10.2026): je Form ein Training aus der Bank, sofort für die
 * Lernenden des Kurses freigeschaltet. Schon (oder früher) vorhandene Kurs-Grammatik derselben Form wird übernommen.
 */
export function ausBankZuweisen(
  lehrkraftId: string,
  vok: VokKurs,
  formen: { thema: string; titel: string; teile: string[] }[],
  info0: GrammatikInfo
): { ids: string[]; leer: string[]; mixe: number } {
  const vorhanden = (
    db().prepare('SELECT * FROM gram_zuweisungen WHERE lehrkraft_id = ? AND vok_id = ?').all(lehrkraftId, vok.id) as unknown as Zeile[]
  ).filter((z) => !istExtra(z))
  const ids: string[] = []
  const leer: string[] = []
  const stufen = info0.stufen ?? kursStufen(lehrkraftId, vok.id)
  for (const f of formen) {
    const paket = paketAusBank(f.titel, f.teile, stufen)
    if (!paket.aufgaben.length) {
      leer.push(f.thema)
      continue
    }
    const info: GrammatikInfo = { ...info0, themen: [f.thema], teilformen: f.teile.filter((t) => t.includes('/')), bank: f.teile, stufen }
    const alt = vorhanden.find((z) => infoVon(z).themen.includes(f.thema))
    if (alt) {
      db()
        .prepare("UPDATE gram_zuweisungen SET status = 'offen', paket = ?, info = ? WHERE id = ?")
        .run(JSON.stringify(paket), JSON.stringify(infoBereinigt({ ...infoVon(alt), ...info })), alt.id)
      ids.push(alt.id)
      continue
    }
    ids.push(bankTrainingAnlegen(lehrkraftId, vok, f.titel, paket, info))
  }
  return { ids, leer, mixe: mixeZuweisen(lehrkraftId, vok.id).length }
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
      return (
        json(res, 200, {
          id: z.id,
          titel: ohneKlasse(z.titel),
          gaeste: !iservBereit(),
          dabei: Boolean(sitzung && istFuer(z, sitzung.nutzer)),
          bis: z.bis,
          ...zugangPlan('gram', z.id, sitzung?.nutzer)
        }),
        true
      )
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
        // Jahrgang und Lehrwerk-Stelle je Training (08.10.2026): der Ordner gliedert danach – seit 17.10.2026 im Jahr
        // nach Unit › Station (Band, Unit und Station wie auf der Kursseite der Lehrkraft)
        const listen = await Promise.all(
          grammatikFuer(ich).map(async (l) => {
            const z = zeile(l.id)
            return {
              ...l,
              ...(z ? await jahrgangDerGrammatik(z, ich).catch(() => ({ jahrgang: null, stelle: null })) : {}),
              ...(z ? lehrwerkDerGrammatik(z) : {})
            }
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
            bekannt: bekannteGrammatikFuer(ich),
            // Übungsvorrang (12.10.2026, shared/grammatikVorrang.ts): neue Aufgaben je Tag – vor einem Test mehr
            ...((u) => ({ neuJeTag: u.neuJeTag, test: u.test }))(grammatikUebung(z, p, st.aufgaben, ich))
          }),
          true
        )
      if (req.method === 'POST' && url.pathname === '/s/api/grammatik/antwort') {
        if (!istOffen(z)) return json(res, 409, { fehler: 'Dieses Training ist abgeschlossen.' }), true
        // Auch Aufgaben der Förderreserve (13.10.2026, grundlegend bei Schwierigkeiten)
        const a = p.aufgaben.find((x) => x.id === k0.aufgabeId) ?? p.reserve?.find((x) => x.id === k0.aufgabeId)
        if (!a) return json(res, 400, { fehler: 'Unbekannte Aufgabe.' }), true
        // Tabellen und Bestimmungen kommen als JSON – deshalb mehr Platz als für einen Satz
        const antwort = String(k0.antwort ?? '').slice(0, 4000)
        const selbst = k0.selbst === 'richtig' || k0.selbst === 'fast' || k0.selbst === 'falsch' ? k0.selbst : undefined
        const e = pruefeGrammatik(a, antwort, typeof k0.wort === 'string' ? k0.wort : undefined, selbst)
        const jetzt = Date.now()
        const alt = st.aufgaben[a.id]
        // Erster Versuch und spätere Fehler festhalten (12.10.2026, „sicher" nach shared/grammatikSicher.ts); Termin-Anker
        // wie bei den Vokabeln, wenn ein angekündigter Test diese Grammatik abfragt
        const neu = mitErstemVersuch(
          alt,
          nachAbfrage(
            alt ?? { fach: 0, faellig: 0, frei: [], erkannt: 0, erkennenVersuche: 0, versuche: 0, falsch: 0, fehlerTexte: [], zuletzt: 0 },
            'frei',
            e.urteil,
            antwort,
            jetzt,
            grammatikUebung(z, p, st.aufgaben, ich, jetzt).termin ?? undefined
          ),
          e.urteil
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
        rekordEintragen(
          ich,
          `gram:${spiel}`,
          wert,
          v ? klasseFuer(v, ich) : klasseFuer({ lerngruppe_id: z.lerngruppe_id }, ich),
          Date.now(),
          undefined,
          z.sprache
        )
        // Fehler wie bei den Vokabelspielen: wackelig, gleich wieder dran; sichere ein Fach zurück
        const fehler = (Array.isArray(k0.fehler) ? k0.fehler : []).map(String).filter((x) => p.aufgaben.some((a) => a.id === x))
        st.ansehen = [...new Set([...(st.ansehen ?? []), ...fehler])].slice(-30)
        // Spielfehler gelten als späterer Fehler der Aufgabe – die Form ist dann „im Aufbau" (12.10.2026)
        for (const f of new Set(fehler)) if (st.aufgaben[f]) st.aufgaben[f] = nachSpielfehlerGrammatik(nachSpielfehler(st.aufgaben[f]))
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
            // „Sicher" nach der Form-Regel (12.10.2026, shared/grammatikSicher.ts)
            const sicherZahl = staende.map((st) => sicherAufgaben(paketVon(z), st).sicher)
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
                l.length && kk.length ? staende.reduce((s, st) => s + kk.filter((k) => st[k.id]?.versuche).length, 0) / l.length / kk.length : 0,
              aufgaben: kk.length,
              lernende: l.length,
              sicherSchnitt: l.length && kk.length ? sicherZahl.reduce((a, b) => a + b, 0) / l.length / kk.length : 0,
              status: z.status === 'entfernt' ? 'entfernt' : istOffen(z) ? 'offen' : 'beendet',
              // Regeltitel für die Suche auf der Kursseite (08.10.2026)
              regeln: paketVon(z).regeln.map((r) => r.titel),
              // Katalog-Themen der Freigabe (08.10.2026): im Dialog „Grammatik hinzufügen" vorab angehakt
              themen: infoVon(z).themen,
              // Aus der Aufgabenbank (13.10.2026): Aufgaben werden in „Grammatikformen" gepflegt
              ...(infoVon(z).bank?.length ? { bank: true } : {}),
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
    // Stufen eines Kurses ändern (13.10.2026): gilt für alle Bank-Trainings des Kurses, Pakete neu gebaut
    if (req.method === 'POST' && teile[0] === 'kurs-stufen') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const vok = vokZeile(String(k0.vokId ?? ''))
      if (!vok || vok.lehrkraft_id !== ich.id) return json(res, 400, { fehler: 'Bitte einen eigenen Kurs wählen.' }), true
      const stufen = stufenBereinigt(k0.stufen)
      if (!stufen) return json(res, 400, { fehler: 'Bitte mindestens eine Stufe wählen.' }), true
      let n = 0
      for (const z of db().prepare('SELECT * FROM gram_zuweisungen WHERE lehrkraft_id = ? AND vok_id = ?').all(ich.id, vok.id) as unknown as Zeile[]) {
        const info = infoVon(z)
        if (!info.bank?.length) continue
        db()
          .prepare('UPDATE gram_zuweisungen SET paket = ?, info = ? WHERE id = ?')
          .run(JSON.stringify(paketAusBank(z.thema || z.titel, info.bank, stufen)), JSON.stringify(infoBereinigt({ ...info, stufen })), z.id)
        n++
      }
      return json(res, 200, { stufen, trainings: n }), true
    }
    if (req.method === 'GET' && teile[0] === 'kurs-stufen') {
      const vok = vokZeile(String(url.searchParams.get('vokId') ?? ''))
      if (!vok || vok.lehrkraft_id !== ich.id) return json(res, 400, { fehler: 'Bitte einen eigenen Kurs wählen.' }), true
      return json(res, 200, { stufen: kursStufen(ich.id, vok.id), schulform: stufenFuerSchulform(schulOrtVon(ich.id).schulform) }), true
    }
    if (req.method === 'POST' && teile[0] === 'aus-bank') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const vok = vokZeile(String(k0.vokId ?? ''))
      if (!vok || vok.lehrkraft_id !== ich.id) return json(res, 400, { fehler: 'Bitte einen eigenen Kurs wählen.' }), true
      const formen = (Array.isArray(k0.formen) ? k0.formen : [])
        .slice(0, 40)
        .map((f) => {
          const x = (f ?? {}) as Record<string, unknown>
          return {
            thema: String(x.thema ?? ''),
            titel: String(x.titel ?? '').slice(0, 160),
            teile: (Array.isArray(x.teile) ? x.teile : []).filter(schluesselGueltig).slice(0, 40)
          }
        })
        .filter((f) => /^[a-z]{2,3}\.[a-z0-9_.-]+$/i.test(f.thema) && f.titel && f.teile.length)
      if (!formen.length) return json(res, 400, { fehler: 'Keine Grammatikform gewählt.' }), true
      const r = ausBankZuweisen(ich.id, vok, formen, infoBereinigt(k0.info))
      protokolliereServer(
        'grammatik',
        `Grammatik aus der Aufgabenbank zugewiesen – ${r.ids.length} Formen${r.mixe ? `, ${r.mixe} gemischte Übungen` : ''}`,
        ich.id
      )
      return json(res, 200, r), true
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
      const geplant = nachFreigabe(
        'gram',
        ids.filter((x) => !schonSichtbar.has(x)),
        k0,
        ich.id,
        art ? '' : g?.id ?? vok?.lerngruppe_id ?? ''
      )
      protokolliereServer(
        'grammatik',
        geplant
          ? 'Grammatik-Freigabe geplant'
          : art
          ? `Extra-Aufgaben (${art}) freigegeben`
          : ids.length > 1
          ? `Grammatik freigegeben – ${ids.length} Trainings (je Thema eines)`
          : 'Grammatiktraining freigegeben',
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
        haeufigFalsch(
          p,
          lernende.map((l) => l.stand)
        ),
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
          // Lernende aus IServ (12.10.2026): kein QR-Code in der Ansicht der Lehrkraft
          iservGruppe: iservGruppeVon(z.lerngruppe_id),
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
      if ((teile[1] === 'paket' || teile[1] === 'anhaengen') && infoVon(z).bank?.length)
        return json(res, 400, { fehler: 'Diese Aufgaben sind in der App „Grammatikformen“ hinterlegt und werden dort bearbeitet.' }), true
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
        if (dazu <= 0) return json(res, 400, { fehler: 'Keine neuen Aufgaben übernommen – alle waren schon da, oder die Höchstzahl ist erreicht.' }), true
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
 * Profil). Schwäche/Stärke mit den Schwellen des Profils. Dazu, wie viele „Extra für dich" ganz bearbeitet sind. Nur
 * Pakete, in denen die Person schon geübt hat.
 * Seit 12.10.2026 (Entscheidung der Lehrkraft, Medaillen sollen echtes Können zeigen): „geübt" erst mit mindestens einer
 * RICHTIG beantworteten Aufgabe (nicht schon beim bloßen Ansehen oder nur Fehlversuchen); „sicher" nach der gemeinsamen
 * Regel shared/grammatikSicher.ts `formBefund` (≥ 80 % der verschiedenen Aufgaben beim ersten Versuch richtig, mindestens
 * 5 bzw. alle; Bilden-Aufgaben ebenso; kein offener späterer Fehler) – statt „drei Aufgaben weit gerückt".
 */
export function grammatikFuerAchievements(ich: NutzerInfo): {
  /** `geuebt` (12.10.2026): mindestens eine Aufgabe richtig – nur solche zählen für die Medaille „Grammatik" */
  regeln: { schluessel: string; sicher: boolean; geuebt: boolean; schwaeche: boolean; staerke: boolean; sprache: string }[]
  extrasGeschafft: number
  tage: string[]
  /** Medaillen je Sprache (10.10.2026): Übungstage je Sprache */
  tageJe: Record<string, string[]>
  /**
   * Aufgabenbank (13.10.2026): je Sprache die Ampel jeder Form (aus ihren Teilbereichen, shared/grammatikSicher.ts
   * `formAusTeilen`) und je Form die richtig gelösten Kern-Aufgaben (verschiedene, mindestens einmal richtig)
   */
  bank: Record<string, { formen: Record<string, FormAmpel>; geloest: Record<string, number> }>
} {
  const jeRegel = new Map<
    string,
    {
      aufgaben: { id: string; stufe?: number; uebung?: GrammatikAufgabe['uebung'] }[]
      staende: Record<string, WortStand | undefined>
      richtigeAufgaben: number
      versuche: number
      richtig: number
      fachSumme: number
      geuebt: number
      sprache: string
    }
  >()
  let extrasGeschafft = 0
  const tage = new Set<string>()
  const tageJe: Record<string, string[]> = {}
  // Aufgabenbank: je Sprache und Teilbereich die Aufgaben (Bank-Kennungen sind schulweit eindeutig) und ihr bester Stand
  const teile = new Map<
    string,
    { sprache: string; aufgaben: Map<string, { id: string; uebung?: GrammatikAufgabe['uebung'] }>; staende: Record<string, WortStand> }
  >()
  const geloest = new Map<string, Set<string>>()
  for (const { zuweisung_id } of db().prepare('SELECT zuweisung_id FROM gram_stand WHERE schueler_id = ?').all(ich.id) as { zuweisung_id: string }[]) {
    const z = zeile(zuweisung_id)
    if (!z || z.status === 'entfernt' || !istFuer(z, ich)) continue
    const p = paketVon(z)
    const st = standVon(z.id, ich.id)
    for (const r of p.regeln) {
      if (!r.kennung || !formVon(r.kennung)) continue
      const t = teile.get(r.kennung) ?? { sprache: z.sprache, aufgaben: new Map(), staende: {} as Record<string, WortStand> }
      for (const a of p.aufgaben.filter((x) => x.regelId === r.id && x.uebung)) {
        t.aufgaben.set(a.id, { id: a.id, uebung: a.uebung })
        const s0 = st.aufgaben[a.id]
        // Dieselbe Aufgabe in zwei Kursen: der Stand mit mehr Versuchen zählt
        if (s0 && (s0.versuche ?? 0) >= (t.staende[a.id]?.versuche ?? 0)) t.staende[a.id] = s0
        if (s0?.versuche && s0.versuche > s0.falsch && istKern(a.uebung)) {
          const k = `${z.sprache}|${formVon(r.kennung)}`
          geloest.set(k, (geloest.get(k) ?? new Set()).add(a.id))
        }
      }
      teile.set(r.kennung, t)
    }
    for (const t of st.tage ?? []) tage.add(t)
    if (z.sprache) tageJe[z.sprache] = [...(tageJe[z.sprache] ?? []), ...(st.tage ?? [])]
    if (istExtra(z) && p.aufgaben.length && p.aufgaben.every((a) => st.aufgaben[a.id]?.versuche)) extrasGeschafft++
    for (const r of p.regeln) {
      const k = norm(r.titel)
      const e = jeRegel.get(k) ?? { aufgaben: [], staende: {}, richtigeAufgaben: 0, versuche: 0, richtig: 0, fachSumme: 0, geuebt: 0, sprache: z.sprache }
      for (const a of p.aufgaben.filter((x) => x.regelId === r.id)) {
        const s = st.aufgaben[a.id]
        // Kennung je Freigabe – gleiche Aufgaben-Kennungen in verschiedenen Paketen sind verschiedene Aufgaben
        const id = `${z.id}:${a.id}`
        e.aufgaben.push({ id, stufe: a.stufe, uebung: a.uebung })
        e.staende[id] = s
        if (!s?.versuche) continue
        if (s.versuche > s.falsch) e.richtigeAufgaben++
        e.versuche += s.versuche
        e.richtig += s.versuche - s.falsch
        e.fachSumme += s.fach
        e.geuebt++
      }
      jeRegel.set(k, e)
    }
  }
  const bank: Record<string, { formen: Record<string, FormAmpel>; geloest: Record<string, number> }> = {}
  const jeForm = new Map<string, FormAmpel[]>()
  for (const [kennung, t] of teile) {
    const k = `${t.sprache}|${formVon(kennung)}`
    jeForm.set(k, [...(jeForm.get(k) ?? []), formBefund([...t.aufgaben.values()], t.staende).ampel])
  }
  for (const [k, ampeln] of jeForm) {
    const [sprache, form] = k.split('|')
    const b = (bank[sprache] ??= { formen: {}, geloest: {} })
    b.formen[form] = formAusTeilen(ampeln)
    b.geloest[form] = geloest.get(k)?.size ?? 0
  }
  return {
    bank,
    regeln: [...jeRegel.entries()]
      .filter(([, e]) => e.geuebt > 0)
      .map(([schluessel, e]) => {
        // Eine Regel für Ampel, Lehrkraft und Medaillen (12.10.2026): Befund der Aufgabenreihe beim ersten Versuch
        const ampel = formBefund(e.aufgaben, e.staende).ampel
        return {
          schluessel,
          sicher: ampel === 'sicher',
          geuebt: e.richtigeAufgaben > 0,
          schwaeche: ampel === 'schwaeche',
          staerke: ampel === 'sicher',
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
export function grammatikFuerErinnerung(
  ich: NutzerInfo,
  vokIds: Set<string>,
  jetzt = Date.now()
): { id: string; seit: number; offen: number; tage: string[] }[] {
  if (!vokIds.size) return []
  return (db().prepare("SELECT * FROM gram_zuweisungen WHERE status = 'offen'").all() as unknown as Zeile[])
    .filter((z) => vokIds.has(z.vok_id ?? '') && istOffen(z) && istFuer(z, ich))
    .map((z) => {
      const st = standVon(z.id, ich.id)
      // Dieselbe Rechnung wie im Trainer (12.10.2026, shared/grammatikVorrang.ts – vor einem Test mehr neue)
      return { id: z.id, seit: Date.parse(z.erstellt) || 0, offen: grammatikHeuteOffen(z, ich, jetzt), tage: st.tage ?? [] }
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
  bekannt: (ich: NutzerInfo): string[] => bekannteGrammatikFuer(ich),
  /** Heute noch offene Aufgaben (Mehrspieler erst danach frei) – wie im Trainer (12.10.2026) */
  heuteOffen: (id: string, ich: NutzerInfo, jetzt = Date.now()): number => {
    const z = zeile(id)
    return z ? grammatikHeuteOffen(z, ich, jetzt) : 0
  }
}
