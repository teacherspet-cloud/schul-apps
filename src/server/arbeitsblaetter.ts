/**
 * Arbeitsblätter für Lernende freigeben (Etappe 5 des Schülerbereichs, 02.10.2026).
 *
 * Abgestimmt mit der Lehrkraft:
 *  - Freigabe an eine Lerngruppe, an einzelne Lernende oder (QR-Code + Name) an Gäste.
 *  - Die Lernenden bekommen NUR das fertige Blatt – als Schülerfassung ohne Lösungen, gezeichnet
 *    beim Freigeben auf dem Rechner der Lehrkraft (dasselbe HTML wie Druck/PDF). Lösungen und
 *    Erwartungen bleiben hier auf dem Server und gehen nur an die KI.
 *  - Ausfüllen am iPad/PC direkt auf dem Blatt (Felder an Linien, Lücken, Kästchen – gemessen auf
 *    dem Gerät wie beim ausfüllbaren PDF), am Telefon als Liste; tippen oder mit dem Stift.
 *  - Mit KI-Feedback: kurz je Aufgabe UND nach dem Einreichen ein Bogen wie in der Rückmeldungs-App.
 *    Dazu gehört eine verknüpfte Rückmeldung (Aufgaben + Lösungsblatt = Erwartungshorizont); alle
 *    Abgaben landen dort, die Lehrkraft holt sie in der Rückmeldungs-App wie gewohnt.
 *  - KI: Zugang der freigebenden Lehrkraft (Schlüssel oder Abo), ohne Namen.
 *
 *  Lehrkraft:  GET /server/blaetter · POST /server/blaetter/freigeben · GET /server/blaetter/<id>
 *              POST /server/blaetter/<id>/status · POST /server/blaetter/<id>/loeschen
 *  Lernende:   GET /s/api/blaetter · GET /s/api/blatt?id= · POST /s/api/blatt/speichern|aufgabe|abgeben
 *  Gäste:      GET /s/api/blatt/zugang?code= · POST /s/api/blatt/gast   (Seite /s/w/<CODE>)
 */
import { mitlehrkraftDarfSehen } from './ueberthemen'
import { objekteAus, objekteText, OBJEKTE_SCHLUESSEL, type BlattObjekt } from '../shared/blattObjekte'
import { BILD_TINTE_MUSTER } from '../shared/blattBilder'
import { randomBytes } from 'node:crypto'
import { nurTag, tagesBeginn, verlaufOhneZeit } from './ohneUhrzeit'
import {
  alleNutzer,
  datenbank,
  nutzerAnlegen,
  nutzerLoeschen,
  nutzerNachBenutzer,
  nutzerNachId,
  OHNE_VORSCHAU,
  fehlerKurz,
  protokolliereServer,
  sitzungAnlegen,
  SITZUNG_MS,
  type NutzerInfo
} from './datenbank'
import { imNutzer } from './kontext'
import { alsNutzer, json, setzeSitzungsCookie, type Anfrage, type Aufruf } from './http'
import { GAST_BREMSE_MELDUNG, gastBremse } from './bremse'
import { gastInLerngruppe, gastName, gehoertZu, lerngruppe, mitgliederVon } from './onlinetest'
import { gastEntfernen } from './gaeste'
import { auswerten, mitarbeitAnfrage, mitarbeitAus, type AuswertungsKontext, type MitarbeitVorschlag, type PersonRoh } from './blattAuswertung'
import { spurEintragen, spurVon, type SpurQuelle } from './bewertungSpur'
import { MITARBEIT_NOTEN, type MitarbeitNote, type Strenge } from '../shared/blattAuswertung'
import { iservBereit } from './anmeldung'
import { mitNamensliste, registerVergessen } from './namensschutz'
import { blattFassung, blattFassungen, verknuepfteFreigabeAnlegen, verknuepfteFreigabeStatus } from './schuelerfeedback'
import { PULS_MS } from '../main/services/lanServer'
import { materialAusBlatt, pdfOhneSkripte, seitenMitTinte } from './druck'
import { injektionsVerdacht, LERNENDEN_FEHLER } from '../shared/kiSchutz'
import { kiGrenzeMeldung } from '../shared/kiGrenzen'
import { kriseMelden, kriseVerdacht } from './krise'
import { kiSperre, LAEUFT_SCHON } from './kiSperre'
import { feedbackOhneLeck, hinweisOhneLeck } from '../shared/blattKiSchutz'
import type { Rueckmeldung } from '../renderer/src/modules/rueckmeldung/model/types'
import { ohneNamen } from '../renderer/src/modules/rueckmeldung/generation'
import { abschrift, abschriftZaehlt, blattText, deckeln } from '../shared/abschrift'
import { ausgangstextAusMaterial, geschichteFeedbackBaustein, type FeedbackBaustein } from '../shared/operatoren/geschichteSchreibformen'
import { fachAusName } from '../shared/faecher'
import { geplantAb, nachFreigabe, nochGeplant, planVorbei } from './freigabePlan'
import { istVorbei } from '../shared/freigabePlan'
import { zugangPlan } from './planen'
import { zeichenFuer } from '../renderer/src/shared/korrekturzeichen'
import {
  ampelVon,
  aufgabenFeedbackAnfrage,
  aufgabenFeedbackAus,
  blattAbgabeText,
  sichtbarBis,
  type Ampel,
  type AufgabenVerlauf,
  type BlattAufgabe,
  type BlattFeld
} from '../shared/blattFreigabe'
import { eingabenAus, PLAUS_SCHLUESSEL, zuordnungAus, ZUORDNUNG_SCHLUESSEL } from '../shared/blattAuswertung'
import {
  abgabeAufgabenAnfrage,
  abgabeAufgabenAus,
  autoHinweis,
  autoPruefen,
  abgabeKriseAus,
  bezugAus,
  einschaetzungAus,
  pruefRunden,
  schluesselBereinigt,
  type AbgabeEintrag,
  type AbgabeFeedback
} from '../shared/blattPruefung'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS blatt_freigaben (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  lerngruppe_id TEXT NOT NULL DEFAULT '',
  schueler TEXT NOT NULL DEFAULT '[]',
  code TEXT,
  titel TEXT NOT NULL,
  html TEXT NOT NULL,
  aufgaben TEXT NOT NULL,
  einstellungen TEXT NOT NULL,
  rueckmeldung_id TEXT NOT NULL,
  status TEXT NOT NULL,
  erstellt TEXT NOT NULL,
  reihe TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS blatt_abgaben (
  freigabe_id TEXT NOT NULL REFERENCES blatt_freigaben(id) ON DELETE CASCADE,
  schueler_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  antworten TEXT NOT NULL DEFAULT '{}',
  tinte TEXT NOT NULL DEFAULT '{}',
  aufgaben_feedback TEXT NOT NULL DEFAULT '{}',
  abgaben INTEGER NOT NULL DEFAULT 0,
  aktualisiert INTEGER NOT NULL,
  PRIMARY KEY (freigabe_id, schueler_id)
);
CREATE TABLE IF NOT EXISTS blatt_gaeste (
  freigabe_id TEXT NOT NULL REFERENCES blatt_freigaben(id) ON DELETE CASCADE,
  nutzer_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  PRIMARY KEY (freigabe_id, nutzer_id)
);`

let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(SCHEMA)
    const spalten = new Set((d.prepare('PRAGMA table_info(blatt_freigaben)').all() as { name: string }[]).map((x) => x.name))
    if (!spalten.has('reihe')) d.exec("ALTER TABLE blatt_freigaben ADD COLUMN reihe TEXT NOT NULL DEFAULT ''")
    // Lern-App (03.10.2026): Fach, Thema und Merkkästen des Blattes für Mappen und Karteikästen
    if (!spalten.has('fach')) d.exec("ALTER TABLE blatt_freigaben ADD COLUMN fach TEXT NOT NULL DEFAULT ''")
    if (!spalten.has('thema')) d.exec("ALTER TABLE blatt_freigaben ADD COLUMN thema TEXT NOT NULL DEFAULT ''")
    // Überthema des Blatts (Lehrplan-Thema, 25.10.2026) – für die Zuordnung in den Fachordnern der Lernenden (ueberthemen.ts)
    if (!spalten.has('ueberthema')) d.exec("ALTER TABLE blatt_freigaben ADD COLUMN ueberthema TEXT NOT NULL DEFAULT ''")
    if (!spalten.has('merk')) d.exec("ALTER TABLE blatt_freigaben ADD COLUMN merk TEXT NOT NULL DEFAULT '[]'")
    // Lösungsblatt nach dem Einreichen und Zusatzrunden („zur Überarbeitung", 03.10.2026)
    if (!spalten.has('loesung')) d.exec("ALTER TABLE blatt_freigaben ADD COLUMN loesung TEXT NOT NULL DEFAULT ''")
    // Mitarbeitsvorschläge und Hilfen der KI samt Strenge (05.10.2026; verschlüsselt, feldschutz.ts)
    if (!spalten.has('auswertung')) d.exec("ALTER TABLE blatt_freigaben ADD COLUMN auswertung TEXT NOT NULL DEFAULT '{}'")
    const sp2 = new Set((d.prepare('PRAGMA table_info(blatt_abgaben)').all() as { name: string }[]).map((x) => x.name))
    if (!sp2.has('extra')) d.exec('ALTER TABLE blatt_abgaben ADD COLUMN extra INTEGER NOT NULL DEFAULT 0')
    // Von der Lehrkraft freigeschaltete Aufgaben (schrittweise Freischaltung, 05.10.2026)
    if (!sp2.has('freigeschaltet')) d.exec("ALTER TABLE blatt_abgaben ADD COLUMN freigeschaltet TEXT NOT NULL DEFAULT '[]'")
    // Geöffnete Hilfekarten je Aufgabe (06.10.2026; verschlüsselt, feldschutz.ts)
    if (!sp2.has('hilfen')) d.exec("ALTER TABLE blatt_abgaben ADD COLUMN hilfen TEXT NOT NULL DEFAULT '{}'")
    // Themenbereich, von Hand gewählt in „Freigegebene Blätter" (09.10.2026, ThemenBibliothek; verschlüsselt, feldschutz.ts)
    if (!spalten.has('themenbereich')) d.exec("ALTER TABLE blatt_freigaben ADD COLUMN themenbereich TEXT NOT NULL DEFAULT ''")
    // Hinweis für die Lehrkraft (22.10.2026, KI-Sicherheitsprüfung): Zeitpunkt der letzten Antwort mit Anweisungen an die KI
    if (!sp2.has('ki_hinweis')) d.exec('ALTER TABLE blatt_abgaben ADD COLUMN ki_hinweis INTEGER NOT NULL DEFAULT 0')
    bereit = true
  }
  return d
}

const json_ = <T>(s: string, r: T): T => {
  try {
    return JSON.parse(s) as T
  } catch {
    return r
  }
}

/** Was die Lehrkraft beim Freigeben festlegt */
export interface BlattEinstellungen {
  /** KI-Feedback (Bogen nach dem Einreichen) */
  feedback: boolean
  /** Kurzes KI-Feedback je Aufgabe während des Ausfüllens */
  aufgabenFeedback: boolean
  /** Einreichungen mit Bogen je Person (Überarbeiten) */
  runden: number
  /** Kurz-Feedbacks je Aufgabe und Person */
  aufgabenRunden: number
  /** Stift erlaubt */
  stift: boolean
  /** Zielsprache des Blattes (Fremdsprachen) – für die Ansprache im Feedback */
  sprache?: string
  /** Aufgaben schrittweise freischalten: die nächste erst, wenn die vorige mindestens „teilweise" ist (05.10.2026) */
  schrittweise?: boolean
  /** Merkkästen erst nach vollständiger Bearbeitung zeigen (05.10.2026) */
  merkAmEnde?: boolean
  /** Bearbeiten bis (ms) – Frist für „Meine Klassen" (06.10.2026); allein nur eine Erinnerung */
  bis?: number
  /** Nach der Frist nur noch ansehen (09.10.2026, Schalter beim Freigeben, Vorgabe aus) – sonst bleibt die Frist Erinnerung */
  fristHart?: boolean
  /** Original in der Bibliothek der Lehrkraft (Word-Export aus „Meine Klassen") */
  quelle?: { docId: string; sheetId?: string }
  /**
   * Förder-/Fordermaterial für einzelne Lernende (12.10.2026): erscheint im Fachordner unter „Für dich" – nur mit
   * Einzel-Freigabe (`schueler` nicht leer); jede Person sieht ohnehin nur ihre eigenen Blätter.
   */
  fuerDich?: boolean
}

export interface Zeile {
  id: string
  lehrkraft_id: string
  lerngruppe_id: string
  schueler: string
  code: string | null
  titel: string
  html: string
  aufgaben: string
  einstellungen: string
  rueckmeldung_id: string
  status: 'offen' | 'beendet'
  erstellt: string
}

interface Abgabe {
  freigabe_id: string
  schueler_id: string
  antworten: string
  tinte: string
  aufgaben_feedback: string
  abgaben: number
  aktualisiert: number
  /** JSON: Nummern der Aufgaben, die die Lehrkraft als erledigt freigeschaltet hat */
  freigeschaltet?: string
  /** JSON: Aufgabe → Zahl der geöffneten Hilfekarten (06.10.2026) */
  hilfen?: string
  /** Zeitpunkt der letzten Antwort mit Anweisungen an die KI (22.10.2026), 0 = keine */
  ki_hinweis?: number
}

const freigabe = (id: string): Zeile | null => (db().prepare('SELECT * FROM blatt_freigaben WHERE id = ?').get(id) as Zeile | undefined) ?? null
const nachCode = (code: string): Zeile | null =>
  /^[A-Z0-9]{4,12}$/.test(code) ? ((db().prepare('SELECT * FROM blatt_freigaben WHERE code = ?').get(code) as Zeile | undefined) ?? null) : null
const einstellungenVon = (z: Zeile): BlattEinstellungen =>
  json_(z.einstellungen, { feedback: false, aufgabenFeedback: false, runden: 1, aufgabenRunden: 2, stift: true })
const abgabeVon = (fid: string, sid: string): Abgabe | null =>
  (db().prepare('SELECT * FROM blatt_abgaben WHERE freigabe_id = ? AND schueler_id = ?').get(fid, sid) as Abgabe | undefined) ?? null

/** Gehört das Blatt dieser Person? (Lerngruppe, ggf. nur Ausgewählte, oder per Code beigetreten) */
/**
 * Namen für den Namensfilter vor der KI (08.10.2026): das Kind selbst und die Lerngruppe der Freigabe. Ob ein Name, der
 * zugleich ein Wort ist („Rose“), die Person meint, entscheidet der Server lokal (personOderWort.ts) – „Material“ ist nur
 * der Aufgaben-/Materialtext, nie die Antwort des Kindes.
 */
function namenFuerKi(z: Zeile, ich: NutzerInfo): string[] {
  const g = z.lerngruppe_id ? lerngruppe(z.lerngruppe_id) : null
  const namen = new Set<string>([ich.name, ...(g ? mitgliederVon(g).map((n) => n.name) : [])].filter(Boolean))
  return [...namen]
}

export function blattIstFuer(z: Zeile, ich: NutzerInfo): boolean {
  // Geplante Freischaltung (09.10.2026, freigabePlan.ts): bis dahin für niemanden sichtbar
  if (nochGeplant('blatt', z.id)) return false
  if (db().prepare('SELECT 1 FROM blatt_gaeste WHERE freigabe_id = ? AND nutzer_id = ?').get(z.id, ich.id)) return true
  // Gäste nur, wenn die Lehrkraft sie in die Lerngruppe eingetragen hat (08.10.2026, „Lernende einer Klasse zuordnen“)
  if (ich.quelle === 'gast' && !gastInLerngruppe(z.lerngruppe_id, ich)) return false
  const nur = json_(z.schueler, [] as string[])
  // Ohne Lerngruppe (Unterrichtsreihe an Einzelne, 03.10.2026): nur die genannten Lernenden
  if (!z.lerngruppe_id) return ich.rolle === 'schueler' && nur.includes(ich.benutzer)
  const g = lerngruppe(z.lerngruppe_id)
  if (!g || !gehoertZu(g, ich)) return false
  return !nur.length || nur.includes(ich.benutzer)
}

const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function neuerCode(): string {
  for (;;) {
    const c = Array.from(randomBytes(6), (b) => CODE_ZEICHEN[b % CODE_ZEICHEN.length]).join('')
    if (!db().prepare('SELECT 1 FROM blatt_freigaben WHERE code = ?').get(c)) return c
  }
}

/** Antworten der Lernenden begrenzen (Feld-IDs f0…f999, Text bis 4000 Zeichen, Kreuz „x") */
function bereinigeAntworten(roh: unknown): Record<string, string> {
  const aus: Record<string, string> = {}
  if (!roh || typeof roh !== 'object') return aus
  for (const [k, v] of Object.entries(roh as Record<string, unknown>).slice(0, 1002))
    if (/^f\d{1,3}$/.test(k) && typeof v === 'string') aus[k] = v.slice(0, 4000)
  // Kästchen/Linien/Punkte der Lernenden und zusätzliche Schreiblinien (digitale Fassung, 03.10.2026)
  const r = roh as Record<string, unknown>
  if (typeof r[OBJEKTE_SCHLUESSEL] === 'string') aus[OBJEKTE_SCHLUESSEL] = JSON.stringify(objekteAus(r[OBJEKTE_SCHLUESSEL]))
  if (typeof r.linien === 'string') aus.linien = JSON.stringify(linienAus(r.linien))
  // Eingabeverhalten und Zuordnung Feld → Aufgabe (Plausibilität, 05.10.2026) – nur Zahlen
  if (typeof r[PLAUS_SCHLUESSEL] === 'string') aus[PLAUS_SCHLUESSEL] = JSON.stringify(eingabenAus(r[PLAUS_SCHLUESSEL]))
  if (typeof r[ZUORDNUNG_SCHLUESSEL] === 'string') aus[ZUORDNUNG_SCHLUESSEL] = JSON.stringify(zuordnungAus(r[ZUORDNUNG_SCHLUESSEL]))
  return aus
}

/** Zusätzliche Schreiblinien: { Ankerlinie: Anzahl } */
function linienAus(roh: unknown): Record<string, number> {
  const aus: Record<string, number> = {}
  try {
    const o = JSON.parse(String(roh)) as Record<string, unknown>
    for (const [k, v] of Object.entries(o).slice(0, 300)) if ((/^\d{1,5}$/.test(k) || k === 'e') && Number(v) > 0) aus[k] = Math.min(60, Math.round(Number(v)))
  } catch {
    // ungültig – keine Zusatzlinien
  }
  return aus
}

/** Was außer den Stiftbildern auf die Seitenbilder gehört */
const blattExtra = (antworten: Record<string, string>): { objekte: BlattObjekt[]; zusatz: Record<string, number> } => ({
  objekte: objekteAus(antworten[OBJEKTE_SCHLUESSEL] ?? '[]'),
  zusatz: linienAus(antworten.linien ?? '{}')
})

/**
 * Stift-Seitenbilder: je Seite ein PNG (höchstens 16 Seiten, je 1,2 MB). Seit 22.10.2026 (KI-Sicherheitsprüfung) nur Seiten,
 * die das gespeicherte Blatt hat, und zusammen höchstens 6 MB (Faustregel: reicht für 5 voll beschriebene Seiten).
 */
const TINTE_GESAMT = 6_000_000
function bereinigeTinte(roh: unknown, seiten = 16): Record<string, string> {
  const aus: Record<string, string> = {}
  if (!roh || typeof roh !== 'object') return aus
  let summe = 0
  // Seiten „0", „1", … und Bilder „bild:b0", … (Vollbild mit Werkzeugen, 25.10.2026, shared/blattBilder.ts)
  for (const [k, v] of Object.entries(roh as Record<string, unknown>).slice(0, 40)) {
    const seite = /^\d{1,2}$/.test(k) ? Number(k) : BILD_TINTE_MUSTER.test(k) ? -1 : null
    if (seite === null || seite >= seiten || typeof v !== 'string' || !v.startsWith('data:image/png;base64,') || v.length >= 1_200_000) continue
    if (summe + v.length > TINTE_GESAMT) break
    summe += v.length
    aus[k] = v
  }
  return aus
}

/** Seiten des gespeicherten Blatts */
const seitenVon = (z: Zeile): number => Math.max(1, (z.html.match(/class="[^"]*\bws-page\b/g) ?? []).length)

/** Klassen der Eingabefelder (wie FELDER in renderer/…/onlinetest/blattDruck.ts) */
const FELD_KLASSEN = new Set(['ws-line', 'ws-label-line', 'ws-check', 'ws-gap', 'ws-space', 'ws-workspace', 'ws-box', 'ws-tf-cell', 'ws-cell-empty'])
const FELD_ARTEN = new Set(['text', 'zeilen', 'luecke', 'flaeche', 'kreuz'])
const NORMAL = (t: string): string =>
  t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')

/** Was das gespeicherte Blatt an Feldern hergibt: Obergrenze und Wörter (zwischengespeichert je Freigabe) */
const blattGerueste = new Map<string, { felder: number; woerter: Set<string> }>()
function geruestVon(z: Zeile): { felder: number; woerter: Set<string> } {
  const da = blattGerueste.get(z.id)
  if (da) return da
  let felder = 0
  for (const m of z.html.matchAll(/class="([^"]*)"/g)) {
    const k = m[1].split(/\s+/)
    if (k.includes('ws-check-demo')) continue
    if (k.some((x) => FELD_KLASSEN.has(x))) felder++
  }
  const woerter = new Set(NORMAL(blattText(z.html)).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2))
  // Beschriftungen, die das Gerät selbst ergänzt (Richtig/Falsch-Spalten, Teilaufgaben)
  for (const w of ['richtig', 'falsch', 'teilaufgabe', 'true', 'false']) woerter.add(w)
  const g = { felder, woerter }
  if (blattGerueste.size > 200) blattGerueste.clear()
  blattGerueste.set(z.id, g)
  return g
}

/**
 * Felder der Lernenden gegen das gespeicherte Blatt prüfen (22.10.2026, KI-Sicherheitsprüfung): Vorher kamen bis zu
 * 1000 Felddefinitionen ungeprüft vom Gerät. Gemessen wird weiter auf dem Gerät (Lage hängt an der Darstellung), aber der
 * Server lässt nur zu, was das gespeicherte Blatt hergibt: höchstens so viele Felder wie Eingabeelemente im Blatt (plus
 * zusätzliche Schreiblinien), nur Aufgabennummern und Seiten des Blatts, nur bekannte Feldarten – und eine Beschriftung
 * nur, wenn ihre Wörter auf dem Blatt stehen (sonst fällt sie weg; die Antwort bleibt).
 */
export function felderAusBlatt(z: Zeile, roh: unknown, antworten: Record<string, string> = {}): BlattFeld[] {
  const g = geruestVon(z)
  const zusatz = Object.values(linienAus(antworten.linien ?? '{}')).reduce((s, n) => s + n, 0)
  const hoechstens = Math.min(1000, g.felder + zusatz)
  const nummern = new Set([0, ...json_(z.aufgaben, [] as BlattAufgabe[]).map((a) => a.nr)])
  const seiten = seitenVon(z)
  const gesehen = new Set<string>()
  const aus: BlattFeld[] = []
  for (const x0 of Array.isArray(roh) ? roh : []) {
    if (aus.length >= hoechstens) break
    const x = (x0 ?? {}) as Record<string, unknown>
    const id = String(x.id)
    if (!/^f\d{1,3}$/.test(id) || gesehen.has(id)) continue
    const nr = Number(x.nr) || 0
    const seite = Number(x.seite) || 0
    if (!nummern.has(nr) || seite < 0 || seite >= seiten) continue
    gesehen.add(id)
    const art = FELD_ARTEN.has(String(x.art)) ? String(x.art) : 'text'
    const text = typeof x.text === 'string' ? x.text.slice(0, 200).trim() : ''
    const textOk = text && NORMAL(text).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2).every((w) => g.woerter.has(w))
    aus.push({
      id,
      nr,
      art,
      seite,
      // Text der Möglichkeit und Stelle im Lösungsschlüssel (08.10.2026)
      ...(textOk ? { text } : {}),
      ...(bezugAus(x.bezug) ? { bezug: String(x.bezug) } : {})
    })
  }
  return aus
}

/**
 * Text der Lernenden je KI-Anfrage begrenzen (22.10.2026, KI-Sicherheitsprüfung; Faustregel 20 000 Zeichen ≈ 3000 Wörter).
 * Vorher waren bis zu 1002 × 4000 Zeichen möglich.
 */
export const TEXT_HOECHSTENS = 20_000
export const ZU_LANG =
  'Deine Antworten sind zusammen zu lang für eine Rückmeldung (höchstens etwa 20 000 Zeichen). Bitte kürze sie – gespeichert ist alles.'

/** Materialtexte mit Zeilennummern – vom Server aus dem gespeicherten Blatt (nie vom Gerät), je Freigabe zwischengespeichert */
const materialSpeicher = new Map<string, { material: string; zeit: number }>()
export async function materialVon(z: Zeile, lesen: (html: string) => Promise<string> = materialAusBlatt): Promise<string> {
  const da = materialSpeicher.get(z.id)
  // Nach einem Fehler (kein Browser) erst nach 5 Minuten neu versuchen
  if (da && (da.material || Date.now() - da.zeit < 5 * 60_000)) return da.material
  let material = ''
  try {
    material = (await lesen(z.html)).slice(0, 24000)
  } catch (err) {
    protokolliereServer('arbeitsblatt', `Material nicht gelesen (${fehlerKurz(err)})`)
  }
  if (materialSpeicher.size > 200) materialSpeicher.clear()
  materialSpeicher.set(z.id, { material, zeit: Date.now() })
  return material
}

/** Antwort mit Anweisungen an die KI (22.10.2026): Hinweis für die Lehrkraft – nie eine Sanktion */
function kiHinweisMerken(z: Zeile, ich: NutzerInfo): void {
  db().prepare('UPDATE blatt_abgaben SET ki_hinweis = ? WHERE freigabe_id = ? AND schueler_id = ?').run(Date.now(), z.id, ich.id)
  protokolliereServer('arbeitsblatt', 'Antwort enthält Anweisungen an die KI (Hinweis an die Lehrkraft)', ich.id)
}

/**
 * Geschichte, „zusammenfassen"/„beurteilen" (12.10.2026): Vorlagen der Lehrkraft (Merkblatt Zusammenfassung,
 * „Beurteilen") nach Stufe und Land, dazu die Vorprüfung der Antwort als Fakten (Wortzahl/⅓ des Ausgangstexts,
 * Zitate, Zeilenangaben, Ich-Form, Konjunktiv) – @shared/operatoren/geschichteSchreibformen. Null außerhalb von
 * Geschichte bzw. ohne einen der beiden Operatoren. Auf dem Blatt werden die Lernenden geduzt (wie im übrigen Feedback).
 */
function schreibformFuer(
  z: Zeile,
  aufgabe: BlattAufgabe,
  felder: BlattFeld[],
  antworten: Record<string, string>,
  ich: NutzerInfo,
  material: string
): FeedbackBaustein | null {
  const k = kontextVon(z)
  const roh = felder
    .filter((f) => f.nr === aufgabe.nr)
    .map((f) => (antworten[f.id] ?? '').trim())
    .filter(Boolean)
    .join('\n\n')
  // Zitate aus der Antwort stehen im Befund – Namen vorher durch Kürzel ersetzen (wie beim Antworttext)
  const antwort = ohneNamen({ id: 'a', kuerzel: 'S1', name: ich.name, dateiname: '', text: roh, bilder: [] }).text
  return geschichteFeedbackBaustein({
    fach: k.fach,
    anweisung: aufgabe.anweisung,
    antwort,
    ...(k.jahrgang ? { jahrgang: k.jahrgang } : {}),
    ...(k.land ? { stateId: k.land } : {}),
    original: material ? ausgangstextAusMaterial(material, aufgabe.anweisung) : null,
    anrede: 'du'
  })
}

/**
 * Prüfung beim Einreichen (08.10.2026, shared/blattPruefung.ts): Ankreuzen, Richtig/Falsch, Lücken, Zuordnen, Ordnen
 * ohne KI; offene Aufgaben in EINER KI-Anfrage (Zugang der Lehrkraft, ohne Namen). Die Einträge landen im
 * Feedback-Verlauf der Aufgaben (Ampel, Hinweis an der Aufgabe) – zählen aber nicht als „prüfen lassen".
 * Wirft nie: Ohne KI bleiben die automatisch geprüften Aufgaben.
 */
async function pruefungBeimEinreichen(p: {
  z: Zeile
  e: BlattEinstellungen
  aufgaben: BlattAufgabe[]
  felder: BlattFeld[]
  antworten: Record<string, string>
  ich: NutzerInfo
  abgabe: number
  letzteRunde: boolean
  bilder: string[]
  material: string
  aufruf: Aufruf
}): Promise<{ eintraege: Record<string, AbgabeFeedback>; fehler?: string; meldung?: string; krise?: boolean }> {
  const zeit = Date.now()
  const eintraege: Record<string, AbgabeFeedback> = {}
  // `fehler` nur fürs Protokoll (fehlerKurz) – an die Lernenden geht LERNENDEN_FEHLER (22.10.2026)
  let fehler: string | undefined
  let krise = false
  // Überlast/Budget (kiGrenzen.ts): diese Meldung statt des allgemeinen Fehlertexts
  let meldung: string | undefined
  try {
    const auto = autoPruefen(p.aufgaben, p.felder, p.antworten, { letzteRunde: p.letzteRunde })
    const objekte = blattExtra(p.antworten).objekte
    const offen: AbgabeEintrag[] = []
    const teilweise: Record<string, Pick<AbgabeFeedback, 'auto' | 'marken'>> = {}
    // Geschichte (12.10.2026): gezählter Verstoß gegen den Operator (Zitat/Zeilenangabe, Ich-Form …) → höchstens „teilweise"
    const gedeckelt = new Set<string>()
    for (const a of p.aufgaben) {
      if (!a.nr) continue
      const eigene = p.felder.filter((f) => f.nr === a.nr)
      const marken = Object.fromEntries(eigene.filter((f) => auto.marken[f.id]).map((f) => [f.id, auto.marken[f.id]]))
      const mitMarken = Object.keys(marken).length ? { marken } : {}
      const au = auto.aufgaben[String(a.nr)]
      if (au?.nurAuto) {
        eintraege[String(a.nr)] = {
          einschaetzung: einschaetzungAus(au.richtig, au.gesamt),
          text: autoHinweis(au.richtig, au.gesamt, p.letzteRunde),
          zeit,
          abgabe: p.abgabe,
          auto: { richtig: au.richtig, gesamt: au.gesamt },
          ...mitMarken
        }
        continue
      }
      const leer = !eigene.some((f) => (p.antworten[f.id] ?? '').trim())
      // Zeichenaufgabe ohne Felder (Zeitleiste, Diagramm): zählt, wenn etwas gezeichnet bzw. eingetragen ist
      const gezeichnet = !eigene.length && (p.bilder.length > 0 || objekte.length > 0)
      if (leer && !gezeichnet) {
        if (!a.freiwillig) eintraege[String(a.nr)] = { einschaetzung: 'noch nicht', text: 'Hier hast du noch nichts eingetragen.', zeit, abgabe: p.abgabe }
        continue
      }
      const text = ohneNamen({
        id: 'a',
        kuerzel: 'S1',
        name: p.ich.name,
        dateiname: '',
        text: [blattAbgabeText([a], eigene, p.antworten), eigene.length ? '' : objekteText(objekte)].filter(Boolean).join('\n'),
        bilder: []
      }).text
      const gs = schreibformFuer(p.z, a, p.felder, p.antworten, p.ich, p.material)
      offen.push({ aufgabe: a, antwort: text, ...(gs ? { schreibform: gs.text } : {}) })
      if (gs?.fehler.length) gedeckelt.add(String(a.nr))
      if (au) teilweise[String(a.nr)] = { auto: { richtig: au.richtig, gesamt: au.gesamt }, ...mitMarken }
    }
    const lehrkraft = nutzerNachId(p.z.lehrkraft_id)
    if (offen.length && lehrkraft && (p.e.feedback || p.e.aufgabenFeedback)) {
      try {
        const roh = await mitNamensliste(
          { namen: namenFuerKi(p.z, p.ich), sprache: p.e.sprache, material: [p.material, ...offen.map((o) => `${o.aufgabe.anweisung ?? ''} ${o.aufgabe.erwartung ?? ''}`)].join(' ') },
          () => imNutzer(alsNutzer(lehrkraft), () => p.aufruf('ai:structured', [abgabeAufgabenAnfrage(offen, { sprache: p.e.sprache, material: p.material, bilder: p.bilder })]))
        )
        const urteile = abgabeAufgabenAus(
          roh,
          offen.map((o) => o.aufgabe.nr)
        )
        krise = abgabeKriseAus(roh)
        // Lösungsfilter (22.10.2026): verrät ein Hinweis die Erwartung, steht dort ein neutraler Text
        let ersetzt = 0
        for (const o of offen) {
          const u = urteile[String(o.aufgabe.nr)]
          if (u) {
            const f = hinweisOhneLeck(u.hinweis, o.aufgabe.erwartung ?? '', o.antwort)
            ersetzt += f.ersetzt
            eintraege[String(o.aufgabe.nr)] = {
              einschaetzung: u.einschaetzung === 'sicher' && gedeckelt.has(String(o.aufgabe.nr)) ? 'teilweise' : u.einschaetzung,
              text: f.hinweis,
              zeit,
              abgabe: p.abgabe,
              ...teilweise[String(o.aufgabe.nr)]
            }
          }
        }
        if (ersetzt) protokolliereServer('arbeitsblatt', `Lösungsfilter: ${ersetzt} Hinweis(e) ersetzt`, p.ich.id)
        protokolliereServer('arbeitsblatt', 'Feedback je Aufgabe beim Einreichen', p.ich.id)
      } catch (err) {
        fehler = fehlerKurz(err)
        meldung = kiGrenzeMeldung(err) ?? undefined
      }
    }
    // Ohne KI-Urteil: die geprüften Kästchen und Lücken einer gemischten Aufgabe bleiben sichtbar
    for (const [nr, t] of Object.entries(teilweise))
      if (!eintraege[nr] && t.auto) {
        const e0 = einschaetzungAus(t.auto.richtig, t.auto.gesamt)
        eintraege[nr] = {
          einschaetzung: e0 === 'sicher' ? 'teilweise' : e0,
          text: `${autoHinweis(t.auto.richtig, t.auto.gesamt, p.letzteRunde)} Zu deinem Text kam noch kein Hinweis.`,
          zeit,
          abgabe: p.abgabe,
          ...t
        }
      }
    if (Object.keys(eintraege).length) {
      // Frisch lesen: Der Bogen läuft parallel, „prüfen lassen“ kann dazwischenkommen
      const verlauf = json_(abgabeVon(p.z.id, p.ich.id)?.aufgaben_feedback ?? '{}', {} as Record<string, unknown[]>)
      for (const [nr, x] of Object.entries(eintraege)) verlauf[nr] = [...(verlauf[nr] ?? []), x].slice(-20)
      db().prepare('UPDATE blatt_abgaben SET aufgaben_feedback = ? WHERE freigabe_id = ? AND schueler_id = ?').run(JSON.stringify(verlauf), p.z.id, p.ich.id)
    }
  } catch (err) {
    fehler ??= fehlerKurz(err)
  }
  return { eintraege, ...(fehler ? { fehler } : {}), ...(meldung ? { meldung } : {}), ...(krise ? { krise } : {}) }
}

/** Für Lernende: Übersicht eines Blattes */
/**
 * Ende erreicht – nur noch ansehen (09.10.2026): bei harter Frist (Schalter „nach der Frist nur noch ansehen") oder mit
 * dem Ende einer geplanten Freischaltung. Eine Frist allein (auch bei allen älteren Blättern) bleibt eine Erinnerung.
 */
const endeErreicht = (z: Zeile, e: BlattEinstellungen): boolean => (Boolean(e.fristHart) && istVorbei(e.bis)) || planVorbei('blatt', z.id)

function kurz(z: Zeile, ich: NutzerInfo) {
  const e = einstellungenVon(z)
  const a = abgabeVon(z.id, ich.id)
  // Stand der Aufgaben für den Fortschrittsbalken der Lernenden (05.10.2026) – nur mit Feedback je Aufgabe
  const stand = e.aufgabenFeedback
    ? (() => {
        const verlauf = json_(a?.aufgaben_feedback ?? '{}', {} as AufgabenVerlauf)
        const frei = json_(a?.freigeschaltet ?? '[]', [] as number[])
        const ampeln = json_(z.aufgaben, [] as BlattAufgabe[])
          .filter((x) => !x.freiwillig)
          .map((x) => ampelVon(verlauf[String(x.nr)], frei.includes(x.nr)))
        return { gruen: ampeln.filter((x) => x === 'gruen').length, gelb: ampeln.filter((x) => x === 'gelb').length, aufgaben: ampeln.length }
      })()
    : undefined
  return {
    id: z.id,
    titel: z.titel,
    // Nach der Frist (09.10.2026) nur noch ansehen
    offen: z.status === 'offen' && !endeErreicht(z, e),
    feedback: e.feedback,
    runden: e.runden,
    genutzt: a?.abgaben ?? 0,
    begonnen: Boolean(a && a.aktualisiert > 0),
    // Fach und Thema für den Fachordner im Regal (08.10.2026); ohne eigene Angabe das Fach der Rückmeldungs-Vorlage
    fach: (z as Zeile & { fach?: string }).fach || kontextVon(z).fach || '',
    thema: (z as Zeile & { thema?: string }).thema ?? '',
    // Freigabedatum für „Mein Lernraum" auf der Startseite (08.10.2026)
    erstellt: z.erstellt,
    ...(stand ? { stand } : {}),
    // Fachordner „Für dich" (12.10.2026): nur bei Einzel-Freigabe gesetzt
    ...(e.fuerDich ? { fuerDich: true } : {})
  }
}

export function blaetterRoute(aufruf: Aufruf, adresse = ''): (k: Anfrage) => Promise<boolean> {
  const link = (code: string): string => `${adresse.replace(/\/$/, '')}/s/w/${code}`
  return async (k) => {
    const { url, req, res, sitzung } = k
    const schueler = url.pathname === '/s/api/blaetter' || url.pathname === '/s/api/blatt' || url.pathname.startsWith('/s/api/blatt/')
    const lehrer = url.pathname === '/server/blaetter' || url.pathname.startsWith('/server/blaetter/')
    if (!schueler && !lehrer) return false
    const mitKopf = typeof req.headers['x-schulapps-token'] === 'string'
    if (req.method === 'POST' && !mitKopf) return (json(res, 403, { fehler: 'Nur aus der App.' }), true)

    // ---------- Gäste per Code (vor der Anmeldeprüfung)
    if (req.method === 'GET' && url.pathname === '/s/api/blatt/zugang') {
      const z = nachCode(String(url.searchParams.get('code') ?? '').toUpperCase())
      if (!z || z.status !== 'offen') return (json(res, 404, { fehler: 'Dieses Arbeitsblatt gibt es nicht (mehr). Bitte den Code prüfen.' }), true)
      return (json(res, 200, { id: z.id, titel: z.titel, gaeste: !iservBereit(), dabei: Boolean(sitzung && blattIstFuer(z, sitzung.nutzer)), ...zugangPlan('blatt', z.id, sitzung?.nutzer) }), true)
    }
    if (req.method === 'POST' && url.pathname === '/s/api/blatt/gast') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const z = nachCode(String(k0.code ?? '').toUpperCase())
      if (!z || z.status !== 'offen') return (json(res, 404, { fehler: 'Dieses Arbeitsblatt gibt es nicht (mehr). Bitte den Code prüfen.' }), true)
      // Schon dabei – auch vor einer geplanten Freischaltung (09.10.2026), sonst entstünde ein zweiter Gast
      if (sitzung && (blattIstFuer(z, sitzung.nutzer) || zugangPlan('blatt', z.id, sitzung.nutzer).dabei)) return (json(res, 200, { ok: true, id: z.id }), true)
      if (sitzung && sitzung.nutzer.quelle !== 'gast' && sitzung.nutzer.rolle === 'schueler') {
        db().prepare('INSERT OR IGNORE INTO blatt_gaeste (freigabe_id, nutzer_id) VALUES (?, ?)').run(z.id, sitzung.nutzer.id)
        return (json(res, 200, { ok: true, id: z.id }), true)
      }
      if (iservBereit()) return (json(res, 403, { fehler: 'Bitte mit IServ anmelden.' }), true)
      const name = gastName(k0.name)
      if (!name) return (json(res, 400, { fehler: 'Bitte Vorname und Anfangsbuchstaben des Nachnamens eingeben, z. B. „Anna K.“' }), true)
      const gaeste = db().prepare('SELECT nutzer_id FROM blatt_gaeste WHERE freigabe_id = ?').all(z.id) as { nutzer_id: string }[]
      const namen = new Map(alleNutzer().map((n) => [n.id, n.name.toLowerCase()]))
      if (gaeste.some((x) => namen.get(x.nutzer_id) === name.toLowerCase()))
        return (json(res, 409, { fehler: `„${name}“ ist schon dabei. Bitte einen zweiten Buchstaben des Nachnamens dazunehmen, z. B. „Anna Ko.“` }), true)
      if (gaeste.length >= 80) return (json(res, 429, { fehler: 'Für dieses Blatt sind schon zu viele Gäste angemeldet.' }), true)
      if (!gastBremse(k.ip)) return (json(res, 429, { fehler: GAST_BREMSE_MELDUNG }), true) // 22.10.2026, KI-Sicherheitsprüfung M5
      const gast = nutzerAnlegen({ benutzer: `gast-${randomBytes(6).toString('hex')}`, name, rolle: 'schueler', quelle: 'gast' })
      registerVergessen()
      db().prepare('INSERT INTO blatt_gaeste (freigabe_id, nutzer_id) VALUES (?, ?)').run(z.id, gast.id)
      const neu = sitzungAnlegen(gast.id, 'schueler')
      setzeSitzungsCookie(res, neu.cookie, SITZUNG_MS.schueler, Boolean((req.socket as { encrypted?: boolean }).encrypted))
      protokolliereServer('arbeitsblatt', 'Beitritt mit Namen (ohne IServ)', gast.id)
      return (json(res, 200, { ok: true, id: z.id }), true)
    }

    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer

    // ---------- Lernende
    if (schueler) {
      if (req.method === 'GET' && url.pathname === '/s/api/blaetter') {
        // Blätter einer Unterrichtsreihe stehen dort, nicht hier
        const alle = (db().prepare("SELECT * FROM blatt_freigaben WHERE reihe = '' ORDER BY erstellt DESC").all() as unknown as Zeile[]).filter((z) =>
          blattIstFuer(z, ich)
        )
        // Beendete nur, wenn schon etwas eingetragen ist (zum Nachlesen)
        return (json(res, 200, { blaetter: alle.filter((z) => z.status === 'offen' || abgabeVon(z.id, ich.id)).map((z) => kurz(z, ich)) }), true)
      }
      const id = req.method === 'GET' ? String(url.searchParams.get('id') ?? '') : String(((await k.koerper()) as Record<string, unknown>).id ?? '')
      const z = freigabe(id)
      if (!z || !blattIstFuer(z, ich)) return (json(res, 404, { fehler: 'Dieses Arbeitsblatt ist nicht für dich freigegeben.' }), true)
      const e = einstellungenVon(z)
      const a = abgabeVon(z.id, ich.id)
      if (req.method === 'GET' && url.pathname === '/s/api/blatt') {
        // NUR die Schülerfassung – Aufgaben ohne Erwartungen
        return (
          json(res, 200, {
            ...kurz(z, ich),
            html: z.html,
            runden: e.runden + extraVon(z.id, ich.id),
            // Lösungsblatt erst nach dem ersten Einreichen (03.10.2026)
            ...((a?.abgaben ?? 0) > 0 && (z as Zeile & { loesung?: string }).loesung ? { loesung: (z as Zeile & { loesung?: string }).loesung } : {}),
            einstellungen: {
              feedback: e.feedback,
              aufgabenFeedback: e.aufgabenFeedback,
              aufgabenRunden: e.aufgabenRunden,
              stift: e.stift,
              ...(e.schrittweise ? { schrittweise: true } : {}),
              ...(e.merkAmEnde ? { merkAmEnde: true } : {})
            },
            freigeschaltet: json_(a?.freigeschaltet ?? '[]', [] as number[]),
            hilfen: json_(a?.hilfen ?? '{}', {} as Record<string, number>),
            antworten: json_(a?.antworten ?? '{}', {}),
            tinte: json_(a?.tinte ?? '{}', {}),
            aufgabenFeedback: json_(a?.aufgaben_feedback ?? '{}', {}),
            fassungen: blattFassungen(z.rueckmeldung_id, ich.id).map(({ volleBogen: _v, ...rest }) => rest)
          }),
          true
        )
      }
      if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
      // Ausgefülltes Blatt als PDF (speichern/drucken, 03.10.2026) – die App setzt es zusammen, der Server druckt ohne Skripte
      if (url.pathname === '/s/api/blatt/pdf') {
        const html = String(((await k.koerper()) as Record<string, unknown>).html ?? '')
        if (!html.includes('ws-page') || html.length > 30 * 1024 * 1024) return (json(res, 400, { fehler: 'Das Blatt konnte nicht vorbereitet werden.' }), true)
        try {
          const pdf = await pdfOhneSkripte(html)
          res.writeHead(200, { 'content-type': 'application/pdf', 'cache-control': 'no-store', 'content-length': pdf.byteLength })
          res.end(Buffer.from(pdf))
        } catch (e) {
          json(res, 500, { fehler: e instanceof Error ? e.message : String(e) })
        }
        return true
      }
      if (z.status !== 'offen') return (json(res, 409, { fehler: 'Dieses Arbeitsblatt ist abgeschlossen.' }), true)
      // Frist vorbei (09.10.2026, „bis" der Freigabe): nur noch ansehen
      if (endeErreicht(z, e)) return (json(res, 409, { fehler: 'Die Bearbeitungszeit ist vorbei – das Blatt lässt sich nur noch ansehen.' }), true)
      const k0 = (await k.koerper()) as Record<string, unknown>
      const speichern = (
        antworten: Record<string, string>,
        tinte: Record<string, string> | null,
        mehr: Partial<Pick<Abgabe, 'aufgaben_feedback' | 'abgaben'>> = {}
      ): void => {
        const jetzt = Date.now()
        const alt = abgabeVon(z.id, ich.id)
        if (!alt)
          db()
            .prepare(
              'INSERT INTO blatt_abgaben (freigabe_id, schueler_id, antworten, tinte, aufgaben_feedback, abgaben, aktualisiert) VALUES (?, ?, ?, ?, ?, ?, ?)'
            )
            .run(z.id, ich.id, JSON.stringify(antworten), JSON.stringify(tinte ?? {}), mehr.aufgaben_feedback ?? '{}', mehr.abgaben ?? 0, jetzt)
        else
          db()
            .prepare(
              'UPDATE blatt_abgaben SET antworten = ?, tinte = ?, aufgaben_feedback = ?, abgaben = ?, aktualisiert = ? WHERE freigabe_id = ? AND schueler_id = ?'
            )
            .run(
              JSON.stringify(antworten),
              tinte ? JSON.stringify(tinte) : alt.tinte,
              mehr.aufgaben_feedback ?? alt.aufgaben_feedback,
              mehr.abgaben ?? alt.abgaben,
              jetzt,
              z.id,
              ich.id
            )
      }
      // Hilfekarte geöffnet (06.10.2026): je Aufgabe die höchste Zahl geöffneter Karten
      if (url.pathname === '/s/api/blatt/hilfe') {
        const nr = Number(k0.nr)
        const karten = Math.max(0, Math.min(20, Math.round(Number(k0.karten) || 0)))
        if (!json_(z.aufgaben, [] as BlattAufgabe[]).some((x) => x.nr === nr) || !karten) return (json(res, 400, { fehler: 'Unbekannte Aufgabe.' }), true)
        db()
          .prepare(
            "INSERT OR IGNORE INTO blatt_abgaben (freigabe_id, schueler_id, antworten, tinte, aufgaben_feedback, abgaben, aktualisiert) VALUES (?, ?, '{}', '{}', '{}', 0, 0)"
          )
          .run(z.id, ich.id)
        const bisher = json_(abgabeVon(z.id, ich.id)?.hilfen ?? '{}', {} as Record<string, number>)
        if ((bisher[String(nr)] ?? 0) < karten) {
          bisher[String(nr)] = karten
          db().prepare('UPDATE blatt_abgaben SET hilfen = ? WHERE freigabe_id = ? AND schueler_id = ?').run(JSON.stringify(bisher), z.id, ich.id)
        }
        return (json(res, 200, { ok: true, hilfen: bisher }), true)
      }
      if (url.pathname === '/s/api/blatt/speichern') {
        speichern(bereinigeAntworten(k0.antworten), k0.tinte ? bereinigeTinte(k0.tinte, seitenVon(z)) : null)
        return (json(res, 200, { ok: true }), true)
      }
      const aufgaben = json_(z.aufgaben, [] as BlattAufgabe[])
      const lehrkraft = nutzerNachId(z.lehrkraft_id)
      if (url.pathname === '/s/api/blatt/aufgabe') {
        // Kurzes Feedback zu EINER Aufgabe – ohne die Lösung zu verraten
        if (!e.aufgabenFeedback || !lehrkraft) return (json(res, 403, { fehler: 'Für dieses Blatt ist kein Feedback je Aufgabe vorgesehen.' }), true)
        const nr = Number(k0.nr)
        const aufgabe = aufgaben.find((x) => x.nr === nr)
        if (!aufgabe) return (json(res, 400, { fehler: 'Unbekannte Aufgabe.' }), true)
        // Eine Anfrage je Person und Blatt (22.10.2026, KI-Sicherheitsprüfung): Sperre VOR dem Lesen der Runden
        const frei = kiSperre('blatt', z.id, ich.id)
        if (!frei) return (json(res, 429, { fehler: LAEUFT_SCHON }), true)
        try {
          // Frisch lesen – erst unter der Sperre zählen die Runden verlässlich
          const a1 = abgabeVon(z.id, ich.id)
          const antworten = bereinigeAntworten(k0.antworten)
          // Felder nur, soweit das gespeicherte Blatt sie hergibt (22.10.2026)
          const felder = felderAusBlatt(z, k0.felder, antworten).filter((f) => f.nr === nr)
          const tinte = k0.tinte ? bereinigeTinte(k0.tinte, seitenVon(z)) : json_(a1?.tinte ?? '{}', {} as Record<string, string>)
          const bisher = json_(a1?.aufgaben_feedback ?? '{}', {} as Record<string, { text: string; einschaetzung: string; zeit: number }[]>)
          const liste = bisher[String(nr)] ?? []
          // Schrittweise (05.10.2026): Feedback nur zu freigeschalteten Aufgaben
          if (
            e.schrittweise &&
            nr >
              sichtbarBis(
                aufgaben.filter((x) => !x.freiwillig).map((x) => x.nr),
                bisher,
                json_(a1?.freigeschaltet ?? '[]', [] as number[]),
                true,
                e.aufgabenRunden
              )
          )
            return (json(res, 403, { fehler: 'Diese Aufgabe ist noch nicht freigeschaltet.' }), true)
          // Die Einträge vom Einreichen (08.10.2026) zählen nicht als „prüfen lassen"
          if (pruefRunden(liste) >= e.aufgabenRunden)
            return (json(res, 409, { fehler: `Zu dieser Aufgabe gab es schon ${e.aufgabenRunden}× Feedback. Reiche das Blatt ein, wenn du fertig bist.` }), true)
          // Bereich der Aufgabe (Zeitleiste & Co. ohne Schreibfelder): ihre Seite und die Objekte darin zählen mit
          const b0 = (k0.bereich ?? {}) as { seite?: unknown; von?: unknown; bis?: unknown }
          const bereich =
            Number.isInteger(b0.seite) && Number(b0.seite) >= 0 && Number(b0.seite) < seitenVon(z)
              ? { seite: Number(b0.seite), von: Number(b0.von) || 0, bis: Number(b0.bis) || 1e6 }
              : null
          const seiten = [...new Set([...felder.map((f) => f.seite), ...(bereich ? [bereich.seite] : [])])]
          const imBereich = bereich ? blattExtra(antworten).objekte.filter((o) => o.s === bereich.seite && o.y >= bereich.von && o.y <= bereich.bis) : []
          const roherText = [blattAbgabeText([aufgabe], felder, antworten), objekteText(imBereich)].filter(Boolean).join('\n')
          // Höchstens etwa 20 000 Zeichen je Anfrage (22.10.2026) – deutlich sagen statt still abschneiden
          if (roherText.length > TEXT_HOECHSTENS) {
            speichern(antworten, k0.tinte ? tinte : null)
            return (json(res, 413, { fehler: ZU_LANG }), true)
          }
          const mitTinte = Object.fromEntries(seiten.filter((s) => tinte[String(s)]).map((s) => [String(s), tinte[String(s)]]))
          const ex = blattExtra(antworten)
          const bilder =
            e.stift || Object.keys(mitTinte).length || k0.nurZeichenflaeche === true
              ? await seitenMitTinte(z.html, mitTinte, { zusatz: ex.zusatz, objekte: ex.objekte.filter((o) => seiten.includes(o.s)) }).catch(() => [] as string[])
              : []
          // Eigene und fremde Namen im Text durch Kürzel ersetzen (wie beim Bogen); der Namensfilter greift zusätzlich
          const text = ohneNamen({ id: 'a', kuerzel: 'S1', name: ich.name, dateiname: '', text: roherText, bilder: [] }).text
          if (!text.trim() && !bilder.length)
            return (
              json(res, 400, {
                fehler: e.stift
                  ? 'Bitte zuerst etwas eintragen – auf dem Blatt, mit dem Stift oder mit Kästchen und Linien.'
                  : 'Bitte zuerst etwas eintragen (Text, Kästchen oder Linien).'
              }),
              true
            )
          // Nur die eigenen Einträge (ohne Aufgabentext und Beschriftungen) – für Abschrift, Krise und Anweisungen an die KI
          const eigen = felder.map((f) => antworten[f.id] ?? '').join(' ')
          // Krise (22.10.2026): Hinweis an die Lehrkraft schon vor der KI – auch wenn die KI danach ausfällt
          const kriseLokal = kriseVerdacht(eigen)
          if (kriseLokal) kriseMelden(z.lehrkraft_id, ich.id, `Arbeitsblatt: ${z.titel}`)
          if (injektionsVerdacht(eigen)) {
            speichern(antworten, k0.tinte ? tinte : null)
            kiHinweisMerken(z, ich)
          }
          try {
            // Abgeschrieben? (03.10.2026) – nur die eigenen Einträge zählen, ohne Aufgabentext
            const befund = abschriftZaehlt(aufgabe.anweisung) ? abschrift(eigen, blattText(z.html)) : undefined
            const fachId = fachAusName((z as Zeile & { fach?: string }).fach ?? '')?.id ?? ''
            // Korrekturzeichen der Lehrkraft (Einstellungen › Material), sonst die Voreinstellung des Fachs
            const einst = (await imNutzer(alsNutzer(lehrkraft), () => aufruf('settings:get', [])).catch(() => undefined)) as Parameters<typeof zeichenFuer>[1]
            const nurZeichenflaeche = k0.nurZeichenflaeche === true && !felder.some((f) => f.art === 'zeilen' || f.art === 'text')
            // Material vom Server aus dem gespeicherten Blatt (22.10.2026) – was das Gerät schickt, zählt nicht mehr
            const material = await materialVon(z)
            // Geschichte, „zusammenfassen"/„beurteilen" (12.10.2026): Vorlagen der Lehrkraft + Vorprüfung als Fakten
            const gs = schreibformFuer(z, aufgabe, felder, antworten, ich, material)
            const zusatz = {
              zeichen: zeichenFuer(fachId, einst),
              ...(nurZeichenflaeche ? { nurZeichenflaeche } : {}),
              ...(material ? { material } : {}),
              ...(befund ? { abschrift: befund } : {}),
              ...(gs ? { schreibform: gs.text } : {})
            }
            const antwort = await mitNamensliste(
              { namen: namenFuerKi(z, ich), sprache: e.sprache, material: `${material} ${aufgabe.anweisung ?? ''} ${aufgabe.erwartung ?? ''}` },
              () => imNutzer(alsNutzer(lehrkraft), () => aufruf('ai:structured', [aufgabenFeedbackAnfrage(aufgabe, text, bilder, e.sprache, zusatz)]))
            )
            const roh = aufgabenFeedbackAus(antwort)
            const fb0 = befund ? { ...roh, einschaetzung: deckeln(roh.einschaetzung, befund) } : roh
            // Gezählter Verstoß gegen den Operator (Geschichte, 12.10.2026): höchstens „teilweise"
            const fb1 = gs?.fehler.length && fb0.einschaetzung === 'sicher' ? { ...fb0, einschaetzung: 'teilweise' as const } : fb0
            // Lösungsfilter (22.10.2026): Felder, die die Erwartung verraten, werden neutral – im Protokoll nur die Zahl
            const { fb: fb2, ersetzt } = feedbackOhneLeck(fb1, aufgabe.erwartung ?? '', text)
            if (ersetzt) protokolliereServer('arbeitsblatt', `Lösungsfilter: ${ersetzt} Feld(er) ersetzt`, ich.id)
            const krise = Boolean(fb2.krise) || kriseLokal
            if (krise && !kriseLokal) kriseMelden(z.lehrkraft_id, ich.id, `Arbeitsblatt: ${z.titel}`)
            const fb = krise ? { ...fb2, krise: true } : fb2
            bisher[String(nr)] = [...liste, { ...fb, zeit: Date.now() }]
            speichern(antworten, k0.tinte ? tinte : null, { aufgaben_feedback: JSON.stringify(bisher) })
            protokolliereServer('arbeitsblatt', 'Feedback zu einer Aufgabe', ich.id)
            return (json(res, 200, { ...fb, rest: e.aufgabenRunden - pruefRunden(liste) - 1 }), true)
          } catch (err) {
            // Nichts gespeichert → die Runde zählt nicht (Kinder werden für Störungen nicht bestraft)
            protokolliereServer('arbeitsblatt', `Feedback zu einer Aufgabe fehlgeschlagen (${fehlerKurz(err)})`, ich.id)
            return (json(res, 503, { fehler: kiGrenzeMeldung(err) ?? LERNENDEN_FEHLER, ...(kriseLokal ? { krise: true } : {}) }), true)
          }
        } finally {
          frei()
        }
      }
      if (url.pathname === '/s/api/blatt/abgeben') {
        // Eine Anfrage je Person und Blatt (22.10.2026): Sperre VOR dem Lesen der Runden
        const frei = kiSperre('blatt', z.id, ich.id)
        if (!frei) return (json(res, 429, { fehler: LAEUFT_SCHON }), true)
        let gestreamt = false
        try {
          const a1 = abgabeVon(z.id, ich.id)
          const max = e.runden + extraVon(z.id, ich.id)
          if ((a1?.abgaben ?? 0) >= max) return (json(res, 409, { fehler: `Du hast das Blatt schon ${e.runden}× eingereicht.` }), true)
          const antworten = bereinigeAntworten(k0.antworten)
          const tinte = k0.tinte ? bereinigeTinte(k0.tinte, seitenVon(z)) : json_(a1?.tinte ?? '{}', {} as Record<string, string>)
          // Felder nur, soweit das gespeicherte Blatt sie hergibt (22.10.2026)
          const felder = felderAusBlatt(z, k0.felder, antworten)
          // Erst speichern (nichts geht verloren), dann die Runde reservieren
          speichern(antworten, k0.tinte ? tinte : null)
          // Kästchen und Linien (Zeitleiste & Co.) gehören zur Abgabe
          const text = [blattAbgabeText(aufgaben, felder, antworten), objekteText(blattExtra(antworten).objekte)].filter(Boolean).join('\n\n')
          if (text.length > TEXT_HOECHSTENS) return (json(res, 413, { fehler: ZU_LANG }), true)
          // Runde atomar reservieren (22.10.2026): zählt nur, wenn noch eine frei ist
          const reserviert = db()
            .prepare('UPDATE blatt_abgaben SET abgaben = abgaben + 1 WHERE freigabe_id = ? AND schueler_id = ? AND abgaben < ?')
            .run(z.id, ich.id, max)
          if (!Number(reserviert.changes)) return (json(res, 409, { fehler: `Du hast das Blatt schon ${e.runden}× eingereicht.` }), true)
          const genutzt = (abgabeVon(z.id, ich.id)?.abgaben ?? 1) - 1
          const rundeZurueck = (): void => {
            db().prepare('UPDATE blatt_abgaben SET abgaben = abgaben - 1 WHERE freigabe_id = ? AND schueler_id = ? AND abgaben > 0').run(z.id, ich.id)
          }
          const eigen = felder.map((f) => antworten[f.id] ?? '').join('\n')
          const kriseLokal = kriseVerdacht(eigen)
          if (kriseLokal) kriseMelden(z.lehrkraft_id, ich.id, `Arbeitsblatt: ${z.titel}`)
          if (injektionsVerdacht(eigen)) kiHinweisMerken(z, ich)
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          gestreamt = true
          const puls = setInterval(() => res.write(' '), PULS_MS)
          res.on('close', () => clearInterval(puls))
          try {
            // Material vom Server aus dem gespeicherten Blatt (22.10.2026) – was das Gerät schickt, zählt nicht mehr
            const material = await materialVon(z)
            // Stift-Einträge über dem Blatt als Seitenbilder (sonst sieht die KI nur Striche ohne Zusammenhang)
            // Zeichnungen gehen mit, auch wenn der Stift nicht freigegeben war (Zeichenaufgaben, 05.10.2026)
            const bilder = e.stift || Object.keys(tinte).length ? await seitenMitTinte(z.html, tinte, blattExtra(antworten)).catch(() => [] as string[]) : []
            /*
             * Alles auf einmal (08.10.2026, Entscheidung der Lehrkraft): feste Lösungen sofort geprüft (✓/✗), offene Aufgaben
             * mit Ampel und kurzem Hinweis (eine KI-Anfrage) – parallel zum Bogen, gespeichert im Feedback-Verlauf je Aufgabe
             */
            const pruefung = pruefungBeimEinreichen({
              z,
              e,
              aufgaben,
              felder,
              antworten,
              ich,
              abgabe: genutzt + 1,
              letzteRunde: genutzt + 1 >= max,
              bilder: Object.keys(tinte).length ? bilder : [],
              material,
              aufruf
            })
            const r = await blattFassung(z.rueckmeldung_id, nutzerNachId(ich.id)!, text, bilder, e.feedback, aufruf, material)
            const pr = await pruefung
            if (pr.fehler) protokolliereServer('arbeitsblatt', `Prüfung beim Einreichen fehlgeschlagen (${pr.fehler})`, ich.id)
            // KI ausgefallen → Runde zurück (der Bogen bzw. ohne Bogen die Prüfung der offenen Aufgaben fehlt)
            const ausgefallen = e.feedback ? Boolean(r.fehler) : Boolean(pr.fehler)
            if (ausgefallen) rundeZurueck()
            const krise = kriseLokal || Boolean(r.krise) || Boolean(pr.krise)
            if (krise && !kriseLokal) kriseMelden(z.lehrkraft_id, ich.id, `Arbeitsblatt: ${z.titel}`)
            res.end(
              JSON.stringify({
                ok: !r.fehler,
                // schon der feste Text bzw. die Meldung zu Überlast/Budget (blattFassung)
                fehler: r.fehler,
                bogen: r.bogen,
                nr: r.nr,
                aufgabenFeedback: pr.eintraege,
                ...(ausgefallen ? { rundeZurueck: true } : {}),
                ...(krise ? { krise: true } : {}),
                ...(pr.fehler ? { pruefFehler: pr.meldung ?? LERNENDEN_FEHLER } : {})
              })
            )
          } catch (err) {
            rundeZurueck()
            protokolliereServer('arbeitsblatt', `Einreichen fehlgeschlagen (${fehlerKurz(err)})`, ich.id)
            res.end(JSON.stringify({ ok: false, fehler: kiGrenzeMeldung(err) ?? LERNENDEN_FEHLER, rundeZurueck: true, ...(kriseLokal ? { krise: true } : {}) }))
          } finally {
            clearInterval(puls)
          }
          return true
        } catch (err) {
          protokolliereServer('arbeitsblatt', `Einreichen fehlgeschlagen (${fehlerKurz(err)})`, ich.id)
          if (gestreamt) res.end(JSON.stringify({ ok: false, fehler: kiGrenzeMeldung(err) ?? LERNENDEN_FEHLER }))
          else json(res, 500, { fehler: kiGrenzeMeldung(err) ?? LERNENDEN_FEHLER })
          return true
        } finally {
          frei()
        }
      }
      return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    }

    // ---------- Lehrkraft
    if (ich.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
    const teile = url.pathname.split('/').filter(Boolean).slice(2)
    if (req.method === 'GET' && teile.length === 0) {
      const liste = db().prepare("SELECT * FROM blatt_freigaben WHERE lehrkraft_id = ? AND reihe = '' ORDER BY erstellt DESC").all(ich.id) as unknown as Zeile[]
      return (
        json(res, 200, {
          blaetter: liste.map((z) => ({
            id: z.id,
            titel: z.titel,
            status: z.status,
            erstellt: z.erstellt,
            // Geplante Freischaltung (09.10.2026): Uhr „geplant ab …" in der Liste
            geplantAb: geplantAb('blatt', z.id),
            fach: (z as Zeile & { fach?: string }).fach ?? '',
            // Themen-Bibliothek (09.10.2026): Thema und von Hand gewählter Themenbereich
            thema: (z as Zeile & { thema?: string }).thema ?? '',
            themenbereich: (z as Zeile & { themenbereich?: string }).themenbereich ?? '',
            // Letzte Aktivität der Lernenden (für „neu eingereicht" auf der Startseite) – seit 23.10.2026
            // nur auf den Tag genau (Tagesbeginn), keine Uhrzeit (Nachprüfung des Schulträgers)
            zuletzt: tagesBeginn(
              (db().prepare(`SELECT MAX(aktualisiert) AS t FROM blatt_abgaben WHERE freigabe_id = ? AND abgaben > 0 AND schueler_id ${OHNE_VORSCHAU}`).get(z.id) as { t: number | null }).t ?? 0
            ),
            lerngruppe: (z.lerngruppe_id ? lerngruppe(z.lerngruppe_id)?.name : '') ?? '',
            schueler: json_(z.schueler, [] as string[]).length,
            einstellungen: einstellungenVon(z),
            ...(z.code ? { code: z.code, link: link(z.code) } : {}),
            abgaben: (db().prepare(`SELECT COUNT(*) AS n FROM blatt_abgaben WHERE freigabe_id = ? AND abgaben > 0 AND schueler_id ${OHNE_VORSCHAU}`).get(z.id) as { n: number }).n,
            begonnen: (db().prepare(`SELECT COUNT(*) AS n FROM blatt_abgaben WHERE freigabe_id = ? AND aktualisiert > 0 AND schueler_id ${OHNE_VORSCHAU}`).get(z.id) as { n: number }).n,
            // Für wie viele Personen (Fortschrittsbalken, 05.10.2026)
            gesamt: gesamtVon(z)
          }))
        }),
        true
      )
    }
    // Liste der abgeschlossenen Blätter leeren (03.10.2026): Freigaben samt Abgaben, Feedback und Gastkonten
    if (req.method === 'POST' && teile[0] === 'abgeschlossene-loeschen') {
      const alle = db().prepare("SELECT * FROM blatt_freigaben WHERE lehrkraft_id = ? AND reihe = '' AND status = 'beendet'").all(ich.id) as unknown as Zeile[]
      for (const z of alle) freigabeLoeschen(z)
      protokolliereServer('arbeitsblatt', `Abgeschlossene Freigaben gelöscht (${alle.length})`, ich.id)
      return (json(res, 200, { ok: true, geloescht: alle.length }), true)
    }
    if (req.method === 'POST' && teile[0] === 'freigeben') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const mitGaesten = k0.gaeste === true && !iservBereit()
      const gruppeId = String(k0.lerngruppeId ?? '')
      const g = gruppeId ? lerngruppe(gruppeId) : null
      if (gruppeId && (!g || g.lehrkraft_id !== ich.id)) return (json(res, 400, { fehler: 'Bitte eine eigene Lerngruppe wählen.' }), true)
      if (!g && !mitGaesten) return (json(res, 400, { fehler: 'Bitte eine Lerngruppe wählen oder Gäste mit QR-Code zulassen.' }), true)
      const html = String(k0.html ?? '')
      if (!html.includes('ws-page') || html.length > 30 * 1024 * 1024) return (json(res, 400, { fehler: 'Das Blatt fehlt oder ist zu groß.' }), true)
      const aufgaben = (Array.isArray(k0.aufgaben) ? k0.aufgaben : []).slice(0, 80).map((x) => {
        const y = x as Record<string, unknown>
        return {
          nr: Number(y.nr) || 0,
          anweisung: String(y.anweisung ?? '').slice(0, 4000),
          erwartung: String(y.erwartung ?? '').slice(0, 8000),
          ...(y.freiwillig === true ? { freiwillig: true } : {}),
          ...(Number(y.hilfekarten) > 0 ? { hilfekarten: Math.min(20, Math.round(Number(y.hilfekarten))) } : {}),
          // Lösungsschlüssel für die automatische Prüfung beim Einreichen (08.10.2026)
          ...(schluesselBereinigt(y.schluessel) ? { schluessel: schluesselBereinigt(y.schluessel) } : {})
        }
      })
      const vorlage = k0.rueckmeldung as Rueckmeldung | undefined
      if (!vorlage?.grundlage) return (json(res, 400, { fehler: 'Die Erwartung fehlt.' }), true)
      const erlaubt = new Set(g ? mitgliederVon(g).map((n) => n.benutzer) : [])
      const einzelne = Array.isArray(k0.schueler) ? [...new Set((k0.schueler as unknown[]).map(String).filter((b) => erlaubt.has(b)))] : []
      const e0 = (k0.einstellungen ?? {}) as Record<string, unknown>
      const einstellungen: BlattEinstellungen = {
        feedback: e0.feedback !== false,
        aufgabenFeedback: e0.aufgabenFeedback !== false,
        runden: Math.max(1, Math.min(5, Math.round(Number(e0.runden) || 2))),
        aufgabenRunden: Math.max(1, Math.min(5, Math.round(Number(e0.aufgabenRunden) || 2))),
        stift: e0.stift !== false,
        ...(typeof e0.sprache === 'string' ? { sprache: e0.sprache.slice(0, 8) } : {}),
        ...(e0.schrittweise === true ? { schrittweise: true } : {}),
        ...(e0.merkAmEnde === true ? { merkAmEnde: true } : {}),
        // Meine Klassen (06.10.2026): Frist und Verweis aufs Original (Word-Export aus der Bibliothek)
        ...(typeof e0.bis === 'number' && e0.bis > 0 ? { bis: e0.bis } : {}),
        // Harte Frist nur auf ausdrücklichen Wunsch (09.10.2026)
        ...(e0.fristHart === true && typeof e0.bis === 'number' && e0.bis > 0 ? { fristHart: true } : {}),
        // „Für dich" (12.10.2026, Förder-/Fordermaterial): nur bei Einzel-Freigabe
        ...(e0.fuerDich === true && einzelne.length ? { fuerDich: true } : {}),
        ...(e0.quelle && typeof (e0.quelle as { docId?: unknown }).docId === 'string'
          ? {
              quelle: {
                docId: String((e0.quelle as { docId: string }).docId).slice(0, 80),
                ...(typeof (e0.quelle as { sheetId?: unknown }).sheetId === 'string'
                  ? { sheetId: String((e0.quelle as { sheetId: string }).sheetId).slice(0, 80) }
                  : {})
              }
            }
          : {})
      }
      // Schrittweise braucht das Urteil je Aufgabe
      // Schrittweise und Merkkästen am Ende brauchen das Urteil je Aufgabe (Ampel)
      if (einstellungen.schrittweise || einstellungen.merkAmEnde) einstellungen.aufgabenFeedback = true
      const titel = String(k0.titel ?? 'Arbeitsblatt').slice(0, 160)
      const rid = verknuepfteFreigabeAnlegen({
        lehrkraftId: ich.id,
        lerngruppeId: g?.id ?? '',
        schueler: einzelne,
        titel: `Arbeitsblatt: ${titel}`,
        vorlage,
        runden: einstellungen.runden
      })
      const id = randomBytes(8).toString('hex')
      const code = mitGaesten ? neuerCode() : null
      db()
        .prepare(
          "INSERT INTO blatt_freigaben (id, lehrkraft_id, lerngruppe_id, schueler, code, titel, html, aufgaben, einstellungen, rueckmeldung_id, status, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offen', ?)"
        )
        .run(
          id,
          ich.id,
          g?.id ?? '',
          JSON.stringify(einzelne),
          code,
          titel,
          html,
          JSON.stringify(aufgaben),
          JSON.stringify(einstellungen),
          rid,
          new Date().toISOString()
        )
      db()
        .prepare('UPDATE blatt_freigaben SET fach = ?, thema = ?, ueberthema = ?, merk = ?, loesung = ? WHERE id = ?')
        .run(
          String(k0.fach ?? '').slice(0, 60),
          String(k0.thema ?? '').slice(0, 160),
          String(k0.ueberthema ?? '').slice(0, 160),
          JSON.stringify(merkBereinigt(k0.merk)),
          loesungBereinigt(k0.loesung),
          id
        )
      // „Planen …" (09.10.2026): sichtbar erst ab dem gewählten Zeitpunkt
      const geplant = nachFreigabe('blatt', [id], k0, ich.id, g?.id ?? '')
      protokolliereServer('arbeitsblatt', geplant ? 'Arbeitsblatt-Freigabe geplant' : 'Arbeitsblatt für Lernende freigegeben', ich.id)
      return (json(res, 200, { id, ...(geplant ? { geplantAb: geplantAb('blatt', id) } : {}), ...(code ? { code, link: link(code) } : {}) }), true)
    }
    if (req.method === 'POST' && teile[0] === 'pdf') {
      const html = String(((await k.koerper()) as Record<string, unknown>).html ?? '')
      if (!html.includes('ws-page') || html.length > 30 * 1024 * 1024) return (json(res, 400, { fehler: 'Das Blatt konnte nicht vorbereitet werden.' }), true)
      const pdf = await pdfOhneSkripte(html)
      res.writeHead(200, { 'content-type': 'application/pdf', 'cache-control': 'no-store', 'content-length': pdf.byteLength })
      res.end(Buffer.from(pdf))
      return true
    }
    const z = teile[0] ? freigabe(teile[0]) : null
    // Mitlehrkraft desselben Kurses (19.10.2026, ueberthemen.ts): nur ansehen – GET, ohne Ändern
    const nurLesen = Boolean(z && z.lehrkraft_id !== ich.id && req.method === 'GET' && mitlehrkraftDarfSehen(ich.id, z.lerngruppe_id))
    if (!z || (z.lehrkraft_id !== ich.id && !nurLesen)) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    if (req.method === 'GET' && teile.length === 1) {
      const namen = new Map(alleNutzer().map((n) => [n.id, n]))
      // Per Code beigetreten (Gäste mit Namen, auch IServ-Konten) – entfernbar (05.10.2026)
      const perCode = new Set(
        (db().prepare('SELECT nutzer_id FROM blatt_gaeste WHERE freigabe_id = ?').all(z.id) as { nutzer_id: string }[]).map((g) => g.nutzer_id)
      )
      const zeilen = db().prepare(`SELECT * FROM blatt_abgaben WHERE freigabe_id = ? AND schueler_id ${OHNE_VORSCHAU} ORDER BY aktualisiert DESC`).all(z.id) as unknown as Abgabe[]
      const nummern = json_(z.aufgaben, [] as BlattAufgabe[]).map((x) => x.nr)
      // Ampel je Aufgabe und Person (05.10.2026)
      const ampeln = (a: Abgabe): Record<string, Ampel> => {
        const verlauf = json_(a.aufgaben_feedback ?? '{}', {} as AufgabenVerlauf)
        const frei = json_(a.freigeschaltet ?? '[]', [] as number[])
        return Object.fromEntries(nummern.map((nr) => [String(nr), ampelVon(verlauf[String(nr)], frei.includes(nr))]))
      }
      const abgaben = zeilen.map((a) => ({
        ampeln: ampeln(a),
        id: a.schueler_id,
        name: namen.get(a.schueler_id)?.name ?? '',
        benutzer: namen.get(a.schueler_id)?.benutzer ?? '',
        gast: namen.get(a.schueler_id)?.quelle === 'gast',
        perCode: perCode.has(a.schueler_id),
        eingereicht: a.abgaben,
        // Keine Arbeitszeiten für Lehrkräfte (23.10.2026, Nachprüfung des Schulträgers, LfD-Eckpunkte):
        // nur Stand (begonnen/eingereicht) und das DATUM der letzten Einreichung – keine Uhrzeit,
        // keine Zwischenspeicherungen. Intern bleibt `aktualisiert` für die Logik erhalten.
        begonnen: a.aktualisiert > 0,
        abgegebenAm: a.abgaben > 0 ? nurTag(blattFassungen(z.rueckmeldung_id, a.schueler_id).at(-1)?.zeit) : '',
        fassungen: blattFassungen(z.rueckmeldung_id, a.schueler_id).map((f) => ({ nr: f.nr, zeit: nurTag(f.zeit), bogen: f.volleBogen, fehler: f.fehler })),
        // Antwort mit Anweisungen an die KI (22.10.2026): kleiner Hinweis „bitte selbst prüfen"
        kiHinweis: Number(a.ki_hinweis ?? 0) > 0
      }))
      // Beigetreten, aber noch nichts bearbeitet: auch sie stehen in der Liste
      const begonnen = new Set(zeilen.map((a) => a.schueler_id))
      for (const id of perCode) {
        if (begonnen.has(id)) continue
        const n = namen.get(id)
        if (n)
          abgaben.push({
            ampeln: Object.fromEntries(nummern.map((nr) => [String(nr), 'rot' as Ampel])),
            id,
            name: n.name,
            benutzer: n.benutzer,
            gast: n.quelle === 'gast',
            perCode: true,
            eingereicht: 0,
            begonnen: false,
            abgegebenAm: '',
            fassungen: [],
            kiHinweis: false
          })
      }
      return (
        json(res, 200, {
          id: z.id,
          titel: z.titel,
          status: z.status,
          ...(nurLesen ? { nurLesen: true } : {}),
          rueckmeldungId: z.rueckmeldung_id,
          aufgaben: nummern,
          einstellungen: einstellungenVon(z),
          // Nach Namen statt nach letzter Aktivität (23.10.2026): die Reihenfolge verrät sonst Arbeitszeiten
          abgaben: abgaben.sort((x, y) => (x.name || x.benutzer).localeCompare(y.name || y.benutzer, 'de'))
        }),
        true
      )
    }
    /*
     * Lehrkraft: das ausgefüllte Blatt einer Person ansehen (App „Freigegebene Blätter", 03.10.2026) –
     * dieselbe Form wie für die Lernenden, nur zum Ansehen, mit dem vollständigen Bogen.
     */
    // Meine Klassen (06.10.2026): Blatt und Lösung zum Speichern, Drucken, Ablegen in IServ
    if (req.method === 'GET' && teile[1] === 'druck')
      return (
        json(res, 200, {
          titel: z.titel,
          html: z.html,
          loesung: (z as Zeile & { loesung?: string }).loesung ?? '',
          quelle: einstellungenVon(z).quelle ?? null
        }),
        true
      )
    if (req.method === 'GET' && teile[1] === 'abgabe') {
      const person = nutzerNachBenutzer(String(url.searchParams.get('schueler') ?? ''))
      const a = person ? abgabeVon(z.id, person.id) : null
      if (!person || !a) return (json(res, 404, { fehler: 'Diese Person hat das Blatt noch nicht bearbeitet.' }), true)
      const e = einstellungenVon(z)
      return (
        json(res, 200, {
          id: z.id,
          titel: `${z.titel} – ${person.name || person.benutzer}`,
          offen: false,
          feedback: e.feedback,
          runden: e.runden,
          genutzt: a.abgaben,
          html: z.html,
          einstellungen: e,
          antworten: json_(a.antworten, {}),
          tinte: json_(a.tinte ?? '{}', {}),
          // Ohne Uhrzeiten der Feedback-Runden und Fassungen (23.10.2026, Nachprüfung des Schulträgers)
          aufgabenFeedback: verlaufOhneZeit(json_(a.aufgaben_feedback ?? '{}', {} as Record<string, Record<string, unknown>[]>)),
          fassungen: blattFassungen(z.rueckmeldung_id, person.id).map(({ volleBogen: _v, ...rest }) => ({ ...rest, zeit: nurTag(rest.zeit) }))
        }),
        true
      )
    }
    // Themenbereich der Freigabe (09.10.2026, „Themenbereich ändern …" bzw. Ziehen in „Freigegebene Blätter"); leer = automatisch
    if (req.method === 'POST' && teile[1] === 'themenbereich') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const name = typeof k0.themenbereich === 'string' ? k0.themenbereich.trim().slice(0, 160) : ''
      db().prepare('UPDATE blatt_freigaben SET themenbereich = ? WHERE id = ?').run(name, z.id)
      return (json(res, 200, { ok: true }), true)
    }
    if (req.method === 'POST' && teile[1] === 'status') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const status = k0.status === 'beendet' ? 'beendet' : 'offen'
      db().prepare('UPDATE blatt_freigaben SET status = ? WHERE id = ?').run(status, z.id)
      verknuepfteFreigabeStatus(z.rueckmeldung_id, status)
      return (json(res, 200, { ok: true }), true)
    }
    /*
     * Auswertung je Person (05.10.2026, blattAuswertung.ts): Ampeln, Hinweise zur Eigenständigkeit, gleiche
     * Abgaben je Aufgabe und – falls schon erstellt – die Vorschläge zu Mitarbeit und Hilfen.
     */
    if (req.method === 'GET' && teile[1] === 'auswertung') {
      const { aufgaben, roh } = auswertungsDaten(z)
      const erg = auswerten(aufgaben, roh, blattText(z.html))
      const gespeichert = json_((z as Zeile & { auswertung?: string }).auswertung ?? '{}', {} as GespeicherteAuswertung)
      return (
        json(res, 200, {
          ...erg,
          aufgaben: aufgaben.map((a) => ({ nr: a.nr, anweisung: a.anweisung, ...(a.hilfekarten ? { hilfekarten: a.hilfekarten } : {}) })),
          strenge: gespeichert.strenge ?? 'normal',
          mitarbeit: gespeichert.personen ?? {},
          entschieden: gespeichert.entschieden ?? {},
          erstellt: gespeichert.zeit ?? 0
        }),
        true
      )
    }
    if (req.method === 'POST' && teile[1] === 'mitarbeit') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const strenge: Strenge = k0.strenge === 'milde' || k0.strenge === 'streng' ? k0.strenge : 'normal'
      const { aufgaben, roh } = auswertungsDaten(z)
      const erg = auswerten(aufgaben, roh, blattText(z.html))
      const mitDaten = erg.personen.filter((p) => p.aufgaben.some((a) => a.text.trim() || a.ampel))
      if (!mitDaten.length) return (json(res, 400, { fehler: 'Noch hat niemand etwas bearbeitet.' }), true)
      const lehrkraft = nutzerNachId(z.lehrkraft_id)
      if (!lehrkraft) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
      try {
        const antwort = await imNutzer(alsNutzer(lehrkraft), () => aufruf('ai:structured', [mitarbeitAnfrage(kontextVon(z), aufgaben, mitDaten, strenge)]))
        const personen = mitarbeitAus(antwort, mitDaten)
        // Entscheidungen der Lehrkraft bleiben bei einer neuen Einschätzung erhalten (23.10.2026)
        const alt = json_((z as Zeile & { auswertung?: string }).auswertung ?? '{}', {} as GespeicherteAuswertung)
        const neu: GespeicherteAuswertung = { strenge, zeit: Date.now(), personen, ...(alt.entschieden ? { entschieden: alt.entschieden } : {}) }
        db().prepare('UPDATE blatt_freigaben SET auswertung = ? WHERE id = ?').run(JSON.stringify(neu), z.id)
        protokolliereServer('arbeitsblatt', 'Mitarbeit und Hilfen eingeschätzt', ich.id)
        // Verlauf der Bewertung (23.10.2026, Prüfung des Schulträgers): Vorschlag der KI zur Mitarbeitsnote je Person.
        // Die Entscheidung der Lehrkraft schreibt POST …/mitarbeit-note („Note übernehmen / ändern", 23.10.2026).
        for (const [sid, v] of Object.entries(personen))
          spurEintragen({ art: 'mitarbeit', bezugId: z.id, schuelerId: sid, lehrkraftId: z.lehrkraft_id, quelle: 'ki', kiVorschlag: { note: v.note, begruendung: v.begruendung, strenge } })
        return (json(res, 200, { strenge, mitarbeit: personen, erstellt: neu.zeit }), true)
      } catch (err) {
        return (json(res, 503, { fehler: err instanceof Error ? err.message : String(err) }), true)
      }
    }
    /*
     * Mitarbeitsnote festlegen (23.10.2026, Nachprüfung des Schulträgers): „Note übernehmen / ändern" in der Auswertung.
     * Die Entscheidung der Lehrkraft kommt in die Bewertungsspur – bestätigt (wie der KI-Vorschlag), geändert (anders als
     * der Vorschlag) oder lehrkraft (ohne Vorschlag) – und wird bei der Auswertung gespeichert.
     */
    if (req.method === 'POST' && teile[1] === 'mitarbeit-note') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const person = nutzerNachId(String(k0.schueler ?? ''))
      const note = String(k0.note ?? '') as MitarbeitNote
      if (!MITARBEIT_NOTEN.includes(note)) return (json(res, 400, { fehler: 'Unbekannte Note.' }), true)
      if (!person || (!blattIstFuer(z, person) && !abgabeVon(z.id, person.id))) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
      const gespeichert = json_((z as Zeile & { auswertung?: string }).auswertung ?? '{}', {} as GespeicherteAuswertung)
      const vorschlag = gespeichert.personen?.[person.id]
      const quelle = mitarbeitQuelle(vorschlag?.note, note)
      const zeit = Date.now()
      const neu: GespeicherteAuswertung = { ...gespeichert, entschieden: { ...(gespeichert.entschieden ?? {}), [person.id]: { note, zeit, quelle } } }
      db().prepare('UPDATE blatt_freigaben SET auswertung = ? WHERE id = ?').run(JSON.stringify(neu), z.id)
      spurEintragen({
        art: 'mitarbeit',
        bezugId: z.id,
        schuelerId: person.id,
        lehrkraftId: z.lehrkraft_id,
        quelle,
        ...(vorschlag ? { kiVorschlag: { note: vorschlag.note, begruendung: vorschlag.begruendung, strenge: gespeichert.strenge ?? 'normal' } } : {}),
        entscheidung: { note },
        zeit
      })
      protokolliereServer('arbeitsblatt', 'Mitarbeitsnote festgelegt', ich.id)
      return (json(res, 200, { entschieden: neu.entschieden }), true)
    }
    // „Verlauf der Bewertung" der Mitarbeitsnote einer Person (23.10.2026)
    if (req.method === 'GET' && teile[1] === 'spur') {
      const sid = url.searchParams.get('schueler') ?? ''
      const eintraege = spurVon({ lehrkraftId: ich.id, art: 'mitarbeit', bezugId: z.id, schuelerId: sid }).map(
        ({ schuelerId: _s, lehrkraftId: _l, bezugId: _b, ...rest }) => rest
      )
      return (json(res, 200, { eintraege }), true)
    }
    // Lehrkraft schaltet eine Aufgabe für eine Person frei – zählt wie „teilweise" (05.10.2026)
    if (req.method === 'POST' && teile[1] === 'freischalten') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const person = nutzerNachId(String(k0.id ?? ''))
      const nr = Number(k0.nr)
      if (!person || !blattIstFuer(z, person) || !json_(z.aufgaben, [] as BlattAufgabe[]).some((x) => x.nr === nr))
        return (json(res, 404, { fehler: 'Unbekannt.' }), true)
      db()
        // aktualisiert = 0: nur freigeschaltet, noch nicht begonnen (zählt nicht als „begonnen")
        .prepare(
          "INSERT OR IGNORE INTO blatt_abgaben (freigabe_id, schueler_id, antworten, tinte, aufgaben_feedback, abgaben, aktualisiert) VALUES (?, ?, '{}', '{}', '{}', 0, 0)"
        )
        .run(z.id, person.id)
      const frei = new Set(json_(abgabeVon(z.id, person.id)?.freigeschaltet ?? '[]', [] as number[]))
      if (k0.weg === true) frei.delete(nr)
      else frei.add(nr)
      db()
        .prepare('UPDATE blatt_abgaben SET freigeschaltet = ? WHERE freigabe_id = ? AND schueler_id = ?')
        .run(JSON.stringify([...frei]), z.id, person.id)
      return (json(res, 200, { ok: true }), true)
    }
    if (req.method === 'POST' && teile[1] === 'gast-entfernen') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const ok = gastEntfernen(
        { tabelle: 'blatt_gaeste', spalte: 'freigabe_id', freigabeId: z.id, stand: [{ tabelle: 'blatt_abgaben', spalte: 'freigabe_id' }] },
        String(k0.id ?? ''),
        ich.id
      )
      return ok ? (json(res, 200, { ok: true }), true) : (json(res, 404, { fehler: 'Diese Person ist nicht per Code beigetreten.' }), true)
    }
    if (req.method === 'POST' && teile[1] === 'loeschen') {
      freigabeLoeschen(z)
      return (json(res, 200, { ok: true }), true)
    }
    return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  }
}

/**
 * Eine Freigabe ganz löschen: Abgaben und Gast-Zuordnungen (per Fremdschlüssel), die verknüpfte
 * Rückmeldung mit ihren Fassungen und die Gastkonten, die nur für dieses Blatt angelegt wurden.
 */
function freigabeLoeschen(z: Zeile): void {
  const gaeste = (db().prepare('SELECT nutzer_id FROM blatt_gaeste WHERE freigabe_id = ?').all(z.id) as { nutzer_id: string }[])
    .map((g) => nutzerNachId(g.nutzer_id))
    .filter((n): n is NutzerInfo => Boolean(n && n.quelle === 'gast'))
  db().prepare('DELETE FROM blatt_freigaben WHERE id = ?').run(z.id)
  if (z.rueckmeldung_id) db().prepare("DELETE FROM feedback_freigaben WHERE id = ? AND art != ''").run(z.rueckmeldung_id)
  for (const g of gaeste) nutzerLoeschen(g.id)
}

interface GespeicherteAuswertung {
  strenge?: Strenge
  zeit?: number
  personen?: Record<string, MitarbeitVorschlag>
  /** Von der Lehrkraft festgelegte Mitarbeitsnote je Person (23.10.2026) */
  entschieden?: Record<string, { note: MitarbeitNote; zeit: number; quelle: SpurQuelle }>
}

/** Quelle der Entscheidung: wie der KI-Vorschlag = bestätigt, anders = geändert, ohne Vorschlag = lehrkraft (23.10.2026) */
export const mitarbeitQuelle = (vorschlag: MitarbeitNote | undefined, note: MitarbeitNote): SpurQuelle =>
  !vorschlag ? 'lehrkraft' : vorschlag === note ? 'bestaetigt' : 'geaendert'

/** Alles, was die Auswertung je Person braucht – aus Abgaben, Feedback und Bogen */
function auswertungsDaten(z: Zeile): { aufgaben: BlattAufgabe[]; roh: PersonRoh[] } {
  const aufgaben = json_(z.aufgaben, [] as BlattAufgabe[])
  const namen = new Map(alleNutzer().map((n) => [n.id, n.name || n.benutzer]))
  const zeilen = db().prepare(`SELECT * FROM blatt_abgaben WHERE freigabe_id = ? AND schueler_id ${OHNE_VORSCHAU}`).all(z.id) as unknown as Abgabe[]
  const roh = zeilen
    .map((a): PersonRoh => {
      const verlauf = json_(a.aufgaben_feedback ?? '{}', {} as Record<string, { einschaetzung: string; gelungen?: string; fehlt?: string; schritt?: string }[]>)
      const bogen = blattFassungen(z.rueckmeldung_id, a.schueler_id)
        .map((f) => f.volleBogen)
        .filter(Boolean)
        .at(-1)
      return {
        id: a.schueler_id,
        name: namen.get(a.schueler_id) ?? '',
        antworten: json_(a.antworten ?? '{}', {} as Record<string, string>),
        verlauf,
        freigeschaltet: json_(a.freigeschaltet ?? '[]', [] as number[]),
        hilfen: json_(a.hilfen ?? '{}', {} as Record<string, number>),
        eingereicht: a.abgaben,
        kriterien: (bogen?.kriterien ?? []).map((k) => k.einschaetzung),
        letzte: Object.fromEntries(
          Object.entries(verlauf).map(([nr, l]) => {
            const x = l.at(-1)
            return [nr, x ? { gelungen: x.gelungen, fehlt: x.fehlt, schritt: x.schritt } : undefined]
          })
        ),
        staerken: bogen?.staerken ?? [],
        schritte: bogen?.schritte ?? []
      }
    })
    .sort((x, y) => x.name.localeCompare(y.name, 'de'))
  return { aufgaben, roh }
}

/** Fach, Jahrgang, Schulform aus der verknüpften Rückmeldung (dort steht das Material-Meta) */
function kontextVon(z: Zeile): AuswertungsKontext {
  const v = db().prepare('SELECT vorlage FROM feedback_freigaben WHERE id = ?').get(z.rueckmeldung_id) as { vorlage?: string } | undefined
  const meta = json_(v?.vorlage ?? '{}', {} as { meta?: { subjectLabel?: string; grade?: number; schoolTypeName?: string; stateId?: string } }).meta ?? {}
  return {
    titel: z.titel,
    fach: meta.subjectLabel || ((z as Zeile & { fach?: string }).fach ?? ''),
    ...(meta.grade ? { jahrgang: meta.grade } : {}),
    ...(meta.schoolTypeName ? { schulform: meta.schoolTypeName } : {}),
    ...(meta.stateId ? { land: meta.stateId } : {})
  }
}

/** Wie viele Personen das Blatt bearbeiten sollen: Ausgewählte bzw. die Lerngruppe, dazu per Code Beigetretene */
function gesamtVon(z: Zeile): number {
  const nur = json_(z.schueler, [] as string[])
  const g = z.lerngruppe_id ? lerngruppe(z.lerngruppe_id) : null
  const ids = new Set<string>()
  if (nur.length) for (const n of alleNutzer()) if (nur.includes(n.benutzer)) ids.add(n.id)
  if (!nur.length && g) for (const n of mitgliederVon(g)) ids.add(n.id)
  for (const x of db().prepare(`SELECT nutzer_id FROM blatt_gaeste WHERE freigabe_id = ? AND nutzer_id ${OHNE_VORSCHAU}`).all(z.id) as { nutzer_id: string }[])
    ids.add(x.nutzer_id)
  // Wer schon dabei ist, zählt immer mit (z. B. später aus der Gruppe genommen)
  for (const x of db().prepare(`SELECT schueler_id FROM blatt_abgaben WHERE freigabe_id = ? AND schueler_id ${OHNE_VORSCHAU}`).all(z.id) as { schueler_id: string }[]) ids.add(x.schueler_id)
  return ids.size
}

/** Für die Unterrichtsreihe: Stand einer Person bei einem freigegebenen Blatt */
export function blattStand(freigabeId: string, schuelerId: string): { eingereicht: number; runden: number; kriterien?: string[] } | null {
  const z = freigabe(freigabeId)
  if (!z) return null
  const a = abgabeVon(z.id, schuelerId)
  const letzte = blattFassungen(z.rueckmeldung_id, schuelerId).at(-1)
  return {
    eingereicht: a?.abgaben ?? 0,
    runden: einstellungenVon(z).runden + extraVon(z.id, schuelerId),
    ...(letzte?.volleBogen ? { kriterien: letzte.volleBogen.kriterien.map((k) => k.einschaetzung) } : {})
  }
}

export { freigabe as blattFreigabe }
/** Kurzfassung eines Blatts für Lernende (Schüler-Startseite: Lernstand, 06.10.2026) */
export { kurz as blattKurz }

/** Blatt für einen Schritt einer Unterrichtsreihe freigeben (gleiche Ablage, nicht in der Liste „Arbeitsblätter") */
/**
 * Vorschau „vollständig bearbeitet" (25.10.2026): das Blatt gilt als einmal eingereicht, jede Aufgabe ist „sicher" –
 * so erscheinen Lösungsblatt, grüne Ampeln und Merkkästen. Die Antworten selbst lassen sich am Server nicht ausfüllen
 * (die Felder entstehen erst beim Messen am Gerät); die Marke `_vorschau` öffnet das Lösungsblatt gleich.
 */
export function blattVorschauAbgabe(fid: string, sid: string): void {
  const z = freigabe(fid)
  if (!z) return
  const jetzt = Date.now()
  const feedback = Object.fromEntries(
    json_(z.aufgaben, [] as BlattAufgabe[]).map((a) => [
      String(a.nr),
      [{ text: 'Musterlösung – Vorschau „vollständig bearbeitet“', einschaetzung: 'sicher', zeit: jetzt, abgabe: true }]
    ])
  )
  const antworten = JSON.stringify({ _vorschau: 'vollstaendig' })
  if (!abgabeVon(fid, sid))
    db()
      .prepare('INSERT INTO blatt_abgaben (freigabe_id, schueler_id, antworten, tinte, aufgaben_feedback, abgaben, aktualisiert) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(fid, sid, antworten, '{}', JSON.stringify(feedback), 1, jetzt)
  else
    db()
      .prepare('UPDATE blatt_abgaben SET antworten = ?, tinte = ?, aufgaben_feedback = ?, abgaben = ?, aktualisiert = ? WHERE freigabe_id = ? AND schueler_id = ?')
      .run(antworten, '{}', JSON.stringify(feedback), 1, jetzt, fid, sid)
}

export function reihenBlattAnlegen(e: {
  lehrkraftId: string
  lerngruppeId: string
  schueler: string[]
  titel: string
  html: string
  aufgaben: BlattAufgabe[]
  vorlage: Rueckmeldung
  runden: number
  stift: boolean
  reiheId: string
  fach?: string
  thema?: string
  merk?: { titel: string; text: string }[]
  loesung?: string
  /** Schrittweise Freischaltung, Merkkästen am Ende (05.10.2026) */
  schrittweise?: boolean
  merkAmEnde?: boolean
}): string {
  const einstellungen: BlattEinstellungen = {
    feedback: true,
    aufgabenFeedback: true,
    runden: Math.max(1, Math.min(5, e.runden)),
    aufgabenRunden: 2,
    stift: e.stift,
    ...(e.schrittweise ? { schrittweise: true } : {}),
    ...(e.merkAmEnde ? { merkAmEnde: true } : {})
  }
  const rid = verknuepfteFreigabeAnlegen({
    lehrkraftId: e.lehrkraftId,
    lerngruppeId: e.lerngruppeId,
    schueler: e.schueler,
    titel: `Arbeitsblatt: ${e.titel}`,
    vorlage: e.vorlage,
    runden: einstellungen.runden
  })
  const id = randomBytes(8).toString('hex')
  db()
    .prepare(
      "INSERT INTO blatt_freigaben (id, lehrkraft_id, lerngruppe_id, schueler, code, titel, html, aufgaben, einstellungen, rueckmeldung_id, status, erstellt, reihe) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'offen', ?, ?)"
    )
    .run(
      id,
      e.lehrkraftId,
      e.lerngruppeId,
      JSON.stringify(e.schueler),
      e.titel.slice(0, 160),
      e.html,
      JSON.stringify(e.aufgaben),
      JSON.stringify(einstellungen),
      rid,
      new Date().toISOString(),
      e.reiheId
    )
  db()
    .prepare('UPDATE blatt_freigaben SET fach = ?, thema = ?, merk = ?, loesung = ? WHERE id = ?')
    .run((e.fach ?? '').slice(0, 60), (e.thema ?? '').slice(0, 160), JSON.stringify(merkBereinigt(e.merk)), loesungBereinigt(e.loesung), id)
  return id
}

/** Merkkästen eines Blattes (Titel + Text), begrenzt */
function merkBereinigt(roh: unknown): { titel: string; text: string }[] {
  return (Array.isArray(roh) ? roh : [])
    .slice(0, 20)
    .map((x) => x as Record<string, unknown>)
    .map((x) => ({ titel: String(x.titel ?? '').slice(0, 160), text: String(x.text ?? '').slice(0, 4000) }))
    .filter((x) => x.text.trim())
}

/** Für die Lern-App: Blätter, die die Person bearbeitet hat (mit Fach, Thema, Merkkästen und letztem Bogen) */
export function blaetterFuerLernen(schuelerId: string): {
  id: string
  titel: string
  fach: string
  thema: string
  reihe: string
  datum: number
  eingereicht: number
  merk: { titel: string; text: string }[]
  bogen?: { staerken?: string[]; schritte?: string[] }
}[] {
  const zeilen = db()
    .prepare(
      'SELECT f.*, a.abgaben AS eingereicht, a.aktualisiert AS datum FROM blatt_freigaben f JOIN blatt_abgaben a ON a.freigabe_id = f.id WHERE a.schueler_id = ? ORDER BY a.aktualisiert DESC'
    )
    .all(schuelerId) as unknown as (Zeile & { fach: string; thema: string; merk: string; reihe: string; eingereicht: number; datum: number })[]
  return zeilen.map((z) => {
    const letzte = blattFassungen(z.rueckmeldung_id, schuelerId)
      .filter((f) => f.bogen)
      .at(-1)
    return {
      id: z.id,
      titel: z.titel,
      fach: z.fach,
      thema: z.thema,
      reihe: z.reihe,
      datum: z.datum,
      eingereicht: z.eingereicht,
      merk: json_(z.merk, [] as { titel: string; text: string }[]),
      ...(letzte?.bogen ? { bogen: { staerken: letzte.bogen.staerken, schritte: letzte.bogen.schritte } } : {})
    }
  })
}

function loesungBereinigt(roh: unknown): string {
  const t = typeof roh === 'string' ? roh : ''
  return t.includes('ws-page') && t.length < 30 * 1024 * 1024 ? t : ''
}

const extraVon = (fid: string, sid: string): number =>
  (db().prepare('SELECT extra FROM blatt_abgaben WHERE freigabe_id = ? AND schueler_id = ?').get(fid, sid) as { extra: number } | undefined)?.extra ?? 0

/** „Zur Überarbeitung" (Unterrichtsreihe): eine zusätzliche Einreichung erlauben */
export function blattZusatzrunde(fid: string, sid: string): void {
  const da = db().prepare('SELECT 1 FROM blatt_abgaben WHERE freigabe_id = ? AND schueler_id = ?').get(fid, sid)
  if (da) db().prepare('UPDATE blatt_abgaben SET extra = extra + 1 WHERE freigabe_id = ? AND schueler_id = ?').run(fid, sid)
}

/**
 * Arbeitsblätter je Person (12.10.2026, Förder- und Fordermaterial, server/foerdern.ts): Ampeln je Aufgabe aus dem
 * KI-Feedback je Aufgabe über alle eingereichten Blätter der Lerngruppe (ohne Reihen), die Anweisungen der roten
 * Aufgaben (gekürzt) und die „nächsten Schritte" aus dem jeweils letzten Bogen. Nur Blätter mit Feedback je Aufgabe
 * zählen für die Ampeln (sonst gibt es keine).
 */
export function blattAmpelnJePerson(
  lehrkraftId: string,
  lerngruppeId: string
): Record<string, { gruen: number; gelb: number; rot: number; schwierig: string[]; schritte: string[] }> {
  const aus: Record<string, { gruen: number; gelb: number; rot: number; schwierig: string[]; schritte: string[] }> = {}
  const zeilen = db()
    .prepare("SELECT * FROM blatt_freigaben WHERE lehrkraft_id = ? AND lerngruppe_id = ? AND reihe = '' ORDER BY erstellt DESC")
    .all(lehrkraftId, lerngruppeId) as unknown as Zeile[]
  for (const z of zeilen.slice(0, 20)) {
    const e = einstellungenVon(z)
    const aufgaben = json_(z.aufgaben, [] as BlattAufgabe[]).filter((a) => !a.freiwillig)
    const abgaben = db()
      .prepare(`SELECT schueler_id, abgaben, aufgaben_feedback, freigeschaltet FROM blatt_abgaben WHERE freigabe_id = ? AND abgaben > 0 AND schueler_id ${OHNE_VORSCHAU}`)
      .all(z.id) as { schueler_id: string; abgaben: number; aufgaben_feedback: string; freigeschaltet: string }[]
    for (const a of abgaben) {
      const p = (aus[a.schueler_id] ??= { gruen: 0, gelb: 0, rot: 0, schwierig: [], schritte: [] })
      if (e.aufgabenFeedback && aufgaben.length) {
        const verlauf = json_(a.aufgaben_feedback, {} as AufgabenVerlauf)
        const frei = json_(a.freigeschaltet, [] as number[])
        for (const x of aufgaben) {
          const amp = ampelVon(verlauf[String(x.nr)], frei.includes(x.nr))
          p[amp]++
          if (amp === 'rot' && p.schwierig.length < 3) p.schwierig.push(x.anweisung.slice(0, 120))
        }
      }
      if (p.schritte.length < 3) {
        const bogen = blattFassungen(z.rueckmeldung_id, a.schueler_id)
          .filter((f) => f.bogen)
          .at(-1)?.bogen
        for (const s of bogen?.schritte ?? []) if (p.schritte.length < 3 && typeof s === 'string' && s.trim()) p.schritte.push(s.trim().slice(0, 300))
      }
    }
  }
  return aus
}

/**
 * „Meine Klassen": Blätter einer Lerngruppe (ohne Reihen-Schritte). Runde 2 (06.10.2026): auch beendete, mit Frist,
 * Thema, Umfang (Seiten, Aufgaben, Lösung), wer noch nicht begonnen bzw. eingereicht hat, Ergebnis (Anteil grüner
 * Aufgaben der Einreichungen, sofern Kurz-Feedback lief) und die schwierigste Aufgabe.
 */
export function blaetterDerGruppe(
  lehrkraftId: string,
  lerngruppeId: string
): {
  id: string
  titel: string
  status: 'offen' | 'beendet'
  erstellt: string
  bis: number | null
  fach: string
  thema: string
  gesamt: number
  begonnen: number
  eingereicht: number
  eingereichtVon: string[]
  nichtBegonnen: string[]
  nichtEingereicht: string[]
  aufgaben: number
  seiten: number
  loesung: boolean
  ergebnis: number | null
  schwierigste: { nr: number; anweisung: string; rot: number } | null
  quelle: { docId: string; sheetId?: string } | null
  /** Geplante Freischaltung (09.10.2026): noch nicht bei den Lernenden */
  geplantAb: number | null
}[] {
  const zeilen = db()
    .prepare("SELECT * FROM blatt_freigaben WHERE lehrkraft_id = ? AND lerngruppe_id = ? AND reihe = '' ORDER BY erstellt DESC")
    .all(lehrkraftId, lerngruppeId) as unknown as Zeile[]
  const g = lerngruppe(lerngruppeId)
  const mitglieder = g ? mitgliederVon(g) : []
  return zeilen.map((z) => {
    const abgaben = db()
      .prepare(`SELECT schueler_id, abgaben, aktualisiert, aufgaben_feedback, freigeschaltet FROM blatt_abgaben WHERE freigabe_id = ? AND schueler_id ${OHNE_VORSCHAU}`)
      .all(z.id) as {
      schueler_id: string
      abgaben: number
      aktualisiert: number
      aufgaben_feedback: string
      freigeschaltet: string
    }[]
    const e = einstellungenVon(z)
    const aufgaben = json_(z.aufgaben, [] as BlattAufgabe[]).filter((a) => !a.freiwillig)
    const begonnen = new Set(abgaben.filter((a) => a.aktualisiert > 0).map((a) => a.schueler_id))
    const eingereicht = abgaben.filter((a) => a.abgaben > 0)
    // Ergebnis: Ampel je Aufgabe (nur mit Kurz-Feedback je Aufgabe aussagekräftig)
    const rot = new Map<number, number>()
    const anteile: number[] = []
    if (e.aufgabenFeedback && aufgaben.length)
      for (const a of eingereicht) {
        const verlauf = json_(a.aufgaben_feedback, {} as AufgabenVerlauf)
        const frei = json_(a.freigeschaltet, [] as number[])
        const ampeln = aufgaben.map((x) => ampelVon(verlauf[String(x.nr)], frei.includes(x.nr)))
        anteile.push(ampeln.filter((x) => x === 'gruen').length / aufgaben.length)
        ampeln.forEach((x, i) => x === 'rot' && rot.set(aufgaben[i].nr, (rot.get(aufgaben[i].nr) ?? 0) + 1))
      }
    const [schwerNr, schwerRot] = [...rot.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0]
    const schwer = aufgaben.find((a) => a.nr === schwerNr)
    const quelle = (e as BlattEinstellungen & { quelle?: { docId?: string; sheetId?: string } }).quelle
    return {
      id: z.id,
      titel: z.titel,
      status: z.status === 'offen' ? ('offen' as const) : ('beendet' as const),
      geplantAb: geplantAb('blatt', z.id),
      erstellt: z.erstellt,
      bis: e.bis ?? null,
      fach: (z as Zeile & { fach?: string }).fach ?? '',
      thema: (z as Zeile & { thema?: string }).thema ?? '',
      gesamt: gesamtVon(z),
      begonnen: begonnen.size,
      eingereicht: eingereicht.length,
      eingereichtVon: eingereicht.map((a) => a.schueler_id),
      nichtBegonnen: mitglieder.filter((n) => !begonnen.has(n.id)).map((n) => n.name || n.benutzer),
      nichtEingereicht: mitglieder.filter((n) => begonnen.has(n.id) && !eingereicht.some((a) => a.schueler_id === n.id)).map((n) => n.name || n.benutzer),
      aufgaben: aufgaben.length,
      seiten: Math.max(1, (z.html.match(/class="ws-page[ "]/g) ?? []).length),
      loesung: Boolean((z as Zeile & { loesung?: string }).loesung),
      ergebnis: anteile.length ? anteile.reduce((a, b) => a + b, 0) / anteile.length : null,
      schwierigste:
        schwer && schwerRot > 0 ? { nr: schwer.nr, anweisung: schwer.anweisung.slice(0, 160), rot: schwerRot / Math.max(1, eingereicht.length) } : null,
      quelle: quelle?.docId ? { docId: String(quelle.docId).slice(0, 80), ...(quelle.sheetId ? { sheetId: String(quelle.sheetId).slice(0, 80) } : {}) } : null
    }
  })
}
