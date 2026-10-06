/**
 * Onlinetest und Lerngruppen auf dem Server (02.10.2026).
 *
 * Wunsch der Lehrkraft:
 *  - „Onlinetest" am Vokabeltest; eigene App mit Lerngruppen und Historie (Datum, Ergebnisse,
 *    Notenverteilung, Durchschnitt, Durchschnitt je Schülerin/Schüler)
 *  - Zugang der Lernenden über QR-Code oder Link, Anmeldung über IServ
 *  - einfache Antworten sofort auswerten, komplexere per KI auf Korrektheit/Plausibilität; keine halben Punkte
 *  - Zeitlimit durch die Lehrkraft; wer die Seite verlässt, gibt automatisch ab (gegen Nachschlagen)
 *  - Hinweis, dass die Lehrkraft die Abgaben trotzdem prüfen muss (steht in der App)
 *
 * Zweite Runde (02.10.2026 abends, abgestimmt):
 *  - Die Lehrkraft startet den Test für alle gemeinsam; vorher sehen die Lernenden einen
 *    Wartebildschirm (Status „wartend"). Wer später kommt, bekommt die volle Zeit.
 *  - Solange IServ nicht freigeschaltet ist, treten Lernende mit „Vorname + Anfangsbuchstabe"
 *    bei (Gastkonto nur für diesen Test, Quelle „gast").
 *  - Nach jeder Abgabe wertet die KI automatisch aus (Zugang der Lehrkraft) und prüft auch die
 *    automatisch falschen Wort-Antworten auf Sinn im Zusammenhang; kleine Fehler und vertretbare
 *    Abweichungen entscheidet die Lehrkraft (bis dahin 0 Punkte).
 *  - Das Ergebnis sehen die Lernenden, sobald alle abgegeben haben oder die Lehrkraft es
 *    freigibt – als „vorläufig", solange noch etwas offen ist; mit den Lösungen.
 *  - Optional die Figur des Tests (Maskottchen) auf Wartebildschirm, im Kopf und beim Ergebnis.
 *
 * Die Lösungen bleiben auf dem Server: Die Lernenden bekommen nur die Schülerfassung
 * (renderer/modules/onlinetest/kern.ts), Lösungen erst mit dem Ergebnis. Die Uhr läuft auf dem
 * Server – ein verstelltes Gerät ändert nichts. Abgeben geht auch per sendBeacon (beim Verlassen
 * der Seite): Statt der Kopfzeile schützt dort das Geheimnis der Teilnahme (nur dieses Gerät kennt es).
 */
import { randomBytes } from 'node:crypto'
import type { TestDocument } from '../renderer/src/modules/vokabeltest/model/types'
import {
  bewerte,
  felderVon,
  kontextVon,
  offeneEinheiten,
  onlineFassung,
  summe,
  vergleiche,
  zuEntscheiden,
  type Antworten,
  type Bewertung,
  type OnlineFassung
} from '../renderer/src/modules/onlinetest/kern'
import { kiAnfrage, urteileAus, type KiFall, type KiUrteil } from '../renderer/src/modules/onlinetest/kiBewertung'
import { erkennungenAus, erkennungsAnfrage, type Erkennung } from '../renderer/src/modules/onlinetest/handschrift'
import { gradeForPoints, thresholdsForSubject } from '../renderer/src/shared/gradeScale'
import { FAECHER } from '@shared/faecher'
import { getSettings } from '../main/services/storage/settings'
import { alleNutzer, datenbank, nutzerAnlegen, nutzerNachId, protokolliereServer, sitzungAnlegen, SITZUNG_MS, type NutzerInfo } from './datenbank'
import { imNutzer, type Nutzer } from './kontext'
import { alsNutzer, json, leseKoerper, setzeSitzungsCookie, type Anfrage, type Aufruf } from './http'
import { iservBereit } from './anmeldung'
import { registerVergessen } from './namensschutz'
import { PULS_MS } from '../main/services/lanServer'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS lerngruppen (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  fach TEXT NOT NULL DEFAULT '',
  iserv_gruppe TEXT NOT NULL DEFAULT '',
  mitglieder TEXT NOT NULL DEFAULT '[]',
  erstellt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS onlinetests (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  lerngruppe_id TEXT REFERENCES lerngruppen(id) ON DELETE SET NULL,
  titel TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  fassungen TEXT NOT NULL,
  einstellungen TEXT NOT NULL,
  status TEXT NOT NULL,
  erstellt TEXT NOT NULL,
  beendet TEXT
);
CREATE TABLE IF NOT EXISTS teilnahmen (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL REFERENCES onlinetests(id) ON DELETE CASCADE,
  schueler_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  variante INTEGER NOT NULL,
  geheim TEXT NOT NULL,
  beginn INTEGER NOT NULL,
  ende INTEGER NOT NULL,
  abgabe INTEGER,
  grund TEXT,
  antworten TEXT NOT NULL DEFAULT '{}',
  bewertung TEXT NOT NULL DEFAULT '{}',
  verlassen INTEGER NOT NULL DEFAULT 0,
  UNIQUE (test_id, schueler_id)
);
CREATE TABLE IF NOT EXISTS onlinetest_tinte (
  teilnahme_id TEXT NOT NULL REFERENCES teilnahmen(id) ON DELETE CASCADE,
  feld TEXT NOT NULL,
  segment TEXT NOT NULL,
  png BLOB NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  unsicher INTEGER NOT NULL DEFAULT 0,
  erstellt INTEGER NOT NULL,
  PRIMARY KEY (teilnahme_id, feld, segment)
);
CREATE TABLE IF NOT EXISTS onlinetest_figuren (
  test_id TEXT NOT NULL REFERENCES onlinetests(id) ON DELETE CASCADE,
  pose TEXT NOT NULL,
  png BLOB NOT NULL,
  PRIMARY KEY (test_id, pose)
);
`

let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(SCHEMA)
    // Aufsicht (06.10.2026): Vorfälle je Teilnahme (Seite verlassen, Fenster daneben, Übersetzen …), verschlüsselt
    const sp = new Set((d.prepare('PRAGMA table_info(teilnahmen)').all() as { name: string }[]).map((x) => x.name))
    if (!sp.has('vorfaelle')) d.exec("ALTER TABLE teilnahmen ADD COLUMN vorfaelle TEXT NOT NULL DEFAULT '[]'")
    bereit = true
  }
  return d
}
export const onlinetestZuruecksetzen = (): void => {
  bereit = false
  kiLaeufe.clear()
}

const neueId = (): string => randomBytes(10).toString('hex')
const json_ = <T>(s: string, rueck: T): T => {
  try {
    return JSON.parse(s) as T
  } catch {
    return rueck
  }
}

// ---------------------------------------------------------------- Lerngruppen

export interface Lerngruppe {
  id: string
  lehrkraft_id: string
  name: string
  fach: string
  iserv_gruppe: string
  mitglieder: string[]
  erstellt: string
}

const alsGruppe = (z: Record<string, unknown>): Lerngruppe => ({
  ...(z as unknown as Lerngruppe),
  mitglieder: json_(String(z.mitglieder ?? '[]'), [] as string[])
})

export function lerngruppenVon(lehrkraftId: string): Lerngruppe[] {
  return (db().prepare('SELECT * FROM lerngruppen WHERE lehrkraft_id = ? ORDER BY name').all(lehrkraftId) as Record<string, unknown>[]).map(alsGruppe)
}

export function lerngruppe(id: string): Lerngruppe | null {
  const z = db().prepare('SELECT * FROM lerngruppen WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return z ? alsGruppe(z) : null
}

/** Gehört die Schülerin/der Schüler zur Lerngruppe? (IServ-Gruppe oder von Hand eingetragen) */
export function gehoertZu(g: Lerngruppe, n: Pick<NutzerInfo, 'benutzer' | 'gruppen'>): boolean {
  if (g.mitglieder.includes(n.benutzer)) return true
  return Boolean(g.iserv_gruppe) && n.gruppen.some((x) => x.id === g.iserv_gruppe)
}

/**
 * Alle Schülerkonten der Schule (03.10.2026): Einzelne Lernende lassen sich auch ohne eigene
 * Lerngruppe wählen (gemeldet: „M. Mustermann" war nicht zu finden, weil er in keiner Lerngruppe
 * der Lehrkraft stand). Gäste nicht, gesperrte Konten nicht.
 */
export function alleLernenden(): NutzerInfo[] {
  return alleNutzer().filter((n) => n.rolle === 'schueler' && n.quelle !== 'gast' && !n.gesperrt)
}

/** Klasse eines Schülerkontos (aus der Klassenliste bzw. IServ), sonst leer */
export const klasseVon = (n: Pick<NutzerInfo, 'gruppen'>): string => n.gruppen.find((g) => g.id.startsWith('klasse:'))?.name ?? n.gruppen[0]?.name ?? ''

export function mitgliederVon(g: Lerngruppe): NutzerInfo[] {
  return alleNutzer().filter((n) => n.rolle === 'schueler' && n.quelle !== 'gast' && gehoertZu(g, n))
}

// ---------------------------------------------------------------- Tests

export type TestStatus = 'wartend' | 'offen' | 'beendet'

export interface Einstellungen {
  zeitMin: number
  /** abwechselnd = A, B, A, B … in der Reihenfolge des Beitretens */
  zuteilung: 'abwechselnd' | 'zufall' | number
  fach: string
  zielsprache: string
  niveau: string
  schwellen: number[]
  /** Hinweis der Lehrkraft an die Lernenden (optional) */
  hinweis?: string
  /** Testart für die Liste der Lehrkraft (bisher nur „Vokabeltest") */
  art?: string
  /** Thema/Unit des Tests – macht gleichnamige Tests unterscheidbar */
  thema?: string
  /** Zeitpunkt, zu dem die Lehrkraft den Test gestartet hat */
  gestartet?: number
  /** Ergebnisse für die Lernenden freigegeben (sonst erst, wenn alle abgegeben haben) */
  ergebnisFrei?: boolean
  /** Figur (Maskottchen) auf Wartebildschirm, im Kopf und beim Ergebnis */
  figur?: boolean
  /** Handschrift erlaubt (Schreibfläche mit Erkennung, renderer/modules/onlinetest/handschrift.ts) */
  handschrift?: boolean
  /**
   * Beitritt mit Namen erlaubt (Etappe 3, 02.10.2026)? false = nur mit Schülerkonto – dann stehen alle
   * Ergebnisse auch in „Meine Ergebnisse". Fehlt bei älteren Tests: erlaubt (wie bisher).
   */
  gaeste?: boolean
  /** Gehört zu einer Unterrichtsreihe (eigenes Tempo, startet beim Beitreten; nicht in der Liste „Offene Tests") */
  reihe?: boolean
  /** Kopf und Einstellungen des Vokabeltests – für die Abgabe als Blatt (renderer/modules/onlinetest/blattAnsicht.tsx) */
  blatt?: Pick<TestDocument, 'header' | 'settings' | 'fontSize'>
}

interface TestZeile {
  id: string
  lehrkraft_id: string
  lerngruppe_id: string | null
  titel: string
  code: string
  fassungen: string
  einstellungen: string
  status: TestStatus
  erstellt: string
  beendet: string | null
}

interface Test extends Omit<TestZeile, 'fassungen' | 'einstellungen'> {
  /** `original`: die Variante des Vokabeltests (Abgabe als Blatt); fehlt bei Tests vor dem 02.10.2026 abends */
  fassungen: { label: string; fassung: OnlineFassung; original?: TestDocument['variants'][number] }[]
  einstellungen: Einstellungen
}

const alsTest = (z: TestZeile): Test => ({ ...z, fassungen: json_(z.fassungen, []), einstellungen: json_(z.einstellungen, {} as Einstellungen) })

function testNachCode(code: string): Test | null {
  const z = db().prepare('SELECT * FROM onlinetests WHERE code = ?').get(code.toUpperCase()) as TestZeile | undefined
  return z ? alsTest(z) : null
}

function testNachId(id: string): Test | null {
  const z = db().prepare('SELECT * FROM onlinetests WHERE id = ?').get(id) as TestZeile | undefined
  return z ? alsTest(z) : null
}

const einstellungenSetzen = (test: Test, patch: Partial<Einstellungen>): void => {
  test.einstellungen = { ...test.einstellungen, ...patch }
  db().prepare('UPDATE onlinetests SET einstellungen = ? WHERE id = ?').run(JSON.stringify(test.einstellungen), test.id)
}

const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function neuerCode(): string {
  for (;;) {
    const c = Array.from(randomBytes(6), (b) => CODE_ZEICHEN[b % CODE_ZEICHEN.length]).join('')
    if (!db().prepare('SELECT 1 FROM onlinetests WHERE code = ?').get(c)) return c
  }
}

/** Fach zur Zielsprache des Vokabeltests (für den Notenschlüssel je Fach) */
const fachZuSprache = (sprache: string): string => FAECHER.find((f) => f.sprache === sprache)?.id ?? 'englisch'

/** PNG aus einer data:-Adresse (Figur), höchstens 3 MB */
function pngAus(dataUrl: unknown): Buffer | null {
  if (typeof dataUrl !== 'string' || !/^data:image\/png;base64,/i.test(dataUrl)) return null
  const b = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
  return b.length > 0 && b.length <= 3 * 1024 * 1024 ? b : null
}

/**
 * Onlinefassung aus Grammatiktest/Lernzielkontrolle (05.10.2026): von der Oberfläche der Lehrkraft gebaut
 * (renderer/modules/onlinetest/kernBlatt.ts). Form und Längen prüfen; Material-HTML ohne Skripte und
 * Ereignis-Attribute (es steht später abgeschottet im Rahmen ohne Skripte – doppelt hält besser).
 */
export function bereinigeFassung(roh: unknown): OnlineFassung {
  const f = (roh ?? {}) as Partial<OnlineFassung>
  const html = (x: unknown): string =>
    String(x ?? '')
      .slice(0, 400_000)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript:/gi, '')
  const aufgaben = (Array.isArray(f.aufgaben) ? f.aufgaben : []).slice(0, 80).map((a) => ({ ...a, ...(a.html ? { html: html(a.html) } : {}) }))
  const einheiten = (Array.isArray(f.einheiten) ? f.einheiten : []).slice(0, 800).map((e) => ({
    id: String(e.id),
    aufgabe: String(e.aufgabe),
    felder: (e.felder ?? []).map(String).slice(0, 60),
    punkte: Math.max(1, Math.min(100, Math.round(Number(e.punkte) || 1)))
  }))
  const loesungen = Object.fromEntries(Object.entries(f.loesungen ?? {}).slice(0, 4000)) as OnlineFassung['loesungen']
  if (JSON.stringify(aufgaben).length > 6_000_000) throw new Error('Der Test ist zu groß für einen Onlinetest.')
  return {
    aufgaben,
    einheiten,
    loesungen,
    punkte: einheiten.reduce((s, e) => s + e.punkte, 0),
    ...(f.stil
      ? {
          stil: String(f.stil)
            .slice(0, 600_000)
            .replace(/<\/?style[^>]*>/gi, '')
        }
      : {})
  }
}

export function testErstellen(
  lehrkraft: NutzerInfo,
  e: {
    titel: string
    /** Vokabeltest – ODER `blatt`: Grammatiktest/Lernzielkontrolle als fertige Onlinefassungen (05.10.2026) */
    test?: TestDocument
    blatt?: { art: string; fach: string; fassungen: { label: string; fassung: OnlineFassung }[] }
    lerngruppeId?: string
    zeitMin?: number
    zuteilung?: Einstellungen['zuteilung']
    hinweis?: string
    thema?: string
    figur?: { winkend?: unknown; jubelnd?: unknown }
    handschrift?: boolean
    gaeste?: boolean
  }
): Test {
  if (!e.test?.variants?.length && !e.blatt?.fassungen?.length) throw new Error('Der Test hat keine Variante.')
  if (e.lerngruppeId) {
    const g = lerngruppe(e.lerngruppeId)
    if (!g || g.lehrkraft_id !== lehrkraft.id) throw new Error('Unbekannte Lerngruppe.')
  }
  const fach = e.test ? fachZuSprache(e.test.settings.targetLanguage) : String(e.blatt!.fach || 'Allgemein').slice(0, 60)
  // Notenschlüssel der Lehrkraft (Einstellungen › Material) – in ihrem Kontext gelesen
  const schwellen = imNutzer(alsNutzer(lehrkraft), () => thresholdsForSubject(getSettings().gradeScale, fach))
  const figuren = Object.entries(e.figur ?? {})
    .map(([pose, url]) => [pose, pngAus(url)] as const)
    .filter((x): x is readonly [string, Buffer] => (x[0] === 'winkend' || x[0] === 'jubelnd') && Boolean(x[1]))
  const einstellungen: Einstellungen = {
    zeitMin: Math.max(1, Math.min(240, Math.round(e.zeitMin ?? 20))),
    zuteilung: e.zuteilung ?? 'zufall',
    fach,
    zielsprache: e.test?.settings.targetLanguage ?? '',
    niveau: e.test?.settings.level ?? '',
    schwellen,
    art: e.test ? 'Vokabeltest' : ['Grammatiktest', 'Lernzielkontrolle'].includes(e.blatt!.art) ? e.blatt!.art : 'Test',
    ...(e.thema ? { thema: e.thema.slice(0, 120) } : {}),
    ...(e.hinweis ? { hinweis: e.hinweis.slice(0, 500) } : {}),
    ...(figuren.length ? { figur: true } : {}),
    handschrift: e.handschrift !== false,
    gaeste: e.gaeste !== false,
    ...(e.test ? { blatt: { header: { ...e.test.header, illustrationen: { an: false } }, settings: e.test.settings, fontSize: e.test.fontSize } } : {})
  }
  const fassungen = e.test
    ? e.test.variants.map((v) => ({ label: v.label, fassung: onlineFassung(v), original: v }))
    : e
        .blatt!.fassungen.slice(0, 4)
        .map((f, i) => ({ label: String(f.label || String.fromCharCode(65 + i)).slice(0, 20), fassung: bereinigeFassung(f.fassung) }))
  const id = neueId()
  const code = neuerCode()
  db()
    .prepare(
      'INSERT INTO onlinetests (id, lehrkraft_id, lerngruppe_id, titel, code, fassungen, einstellungen, status, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      id,
      lehrkraft.id,
      e.lerngruppeId ?? null,
      e.titel.trim().slice(0, 160) || e.test?.header.title || 'Onlinetest',
      code,
      JSON.stringify(fassungen),
      JSON.stringify(einstellungen),
      'wartend',
      new Date().toISOString()
    )
  for (const [pose, png] of figuren) db().prepare('INSERT INTO onlinetest_figuren (test_id, pose, png) VALUES (?, ?, ?)').run(id, pose, png)
  protokolliereServer('onlinetest', `Onlinetest erstellt (${fassungen.length} Fassung(en))`, lehrkraft.id)
  return testNachId(id)!
}

const figurPosen = (testId: string): string[] =>
  (db().prepare('SELECT pose FROM onlinetest_figuren WHERE test_id = ?').all(testId) as { pose: string }[]).map((x) => x.pose)

// ---------------------------------------------------------------- Teilnahmen

interface TeilnahmeZeile {
  id: string
  test_id: string
  schueler_id: string
  variante: number
  geheim: string
  /** 0 = wartet auf den Start durch die Lehrkraft */
  beginn: number
  ende: number
  abgabe: number | null
  grund: string | null
  antworten: string
  bewertung: string
  verlassen: number
  vorfaelle?: string
}

/**
 * Aufsicht im Onlinetest (06.10.2026, abgestimmt mit der Lehrkraft): Verlassen der Seite gibt NICHT mehr ab
 * (ausgeschaltetes iPad galt sonst als Abgabe), sondern wird wie alles andere protokolliert – mit Uhrzeit und Dauer.
 */
export const VORFALL_ARTEN = ['verlassen', 'fokus', 'geteilt', 'vollbild', 'uebersetzt', 'kopieren', 'einfuegen', 'markieren'] as const
export type VorfallArt = (typeof VORFALL_ARTEN)[number]
export interface Vorfall {
  art: VorfallArt
  /** Beginn (Serverzeit, ms) */
  zeit: number
  /** Dauer in Sekunden (wenn bekannt) */
  dauer?: number
  /** Kurzer Zusatz (z. B. erkannte Sprache), höchstens 60 Zeichen */
  info?: string
}
const MAX_VORFAELLE = 300

function vorfallAus(roh: unknown, jetzt: number): Vorfall | null {
  if (!roh || typeof roh !== 'object') return null
  const r = roh as Record<string, unknown>
  const art = String(r.art ?? '') as VorfallArt
  if (!VORFALL_ARTEN.includes(art)) return null
  const vorSek = Math.max(0, Math.min(6 * 3600, Number(r.vorSek) || 0))
  const dauer = Number(r.dauer)
  return {
    art,
    zeit: jetzt - Math.round(vorSek * 1000),
    ...(Number.isFinite(dauer) && dauer > 0 ? { dauer: Math.min(6 * 3600, Math.round(dauer)) } : {}),
    ...(r.info ? { info: String(r.info).slice(0, 60) } : {})
  }
}

function vorfaelleVon(t: TeilnahmeZeile): Vorfall[] {
  return json_(t.vorfaelle ?? '[]', [] as Vorfall[])
}

const NACHFRIST_MS = 30_000

function teilnahme(id: string): TeilnahmeZeile | null {
  return (db().prepare('SELECT * FROM teilnahmen WHERE id = ?').get(id) as TeilnahmeZeile | undefined) ?? null
}

function teilnahmenVon(testId: string): TeilnahmeZeile[] {
  return db().prepare('SELECT * FROM teilnahmen WHERE test_id = ? ORDER BY rowid').all(testId) as unknown as TeilnahmeZeile[]
}

/** Endgültig abgeben: Antworten festschreiben, sofort bewerten, was eindeutig ist – den Rest danach die KI */
function abschliessen(t: TeilnahmeZeile, test: Test, antworten: Antworten, grund: string): void {
  if (t.abgabe) return
  const fassung = test.fassungen[t.variante]?.fassung
  if (!fassung) return
  const bewertung = bewerte(fassung, antworten, json_(t.bewertung, {} as Bewertung))
  db()
    .prepare('UPDATE teilnahmen SET abgabe = ?, grund = ?, antworten = ?, bewertung = ?, verlassen = ? WHERE id = ? AND abgabe IS NULL')
    .run(Date.now(), grund, JSON.stringify(antworten), JSON.stringify(bewertung), t.verlassen, t.id)
  kiPlanen(test.id)
}

/** Antworten nur für bekannte Felder, als kurze Texte */
function bereinigeAntworten(f: OnlineFassung, roh: unknown): Antworten {
  const felder = new Set(f.einheiten.flatMap((e) => e.felder).concat(f.aufgaben.flatMap((a) => a.eintraege.flatMap((x) => x.felder.map((y) => y.id)))))
  const out: Antworten = {}
  if (!roh || typeof roh !== 'object') return out
  for (const [k, v] of Object.entries(roh as Record<string, unknown>)) if (felder.has(k) && typeof v === 'string') out[k] = v.slice(0, 4000)
  return out
}

/** Neue Teilnahme: Fassung nach Zuteilung; vor dem Start wartet sie (beginn 0), danach volle Zeit ab jetzt */
function teilnahmeAnlegen(test: Test, schuelerId: string): TeilnahmeZeile {
  const n = (db().prepare('SELECT COUNT(*) AS n FROM teilnahmen WHERE test_id = ?').get(test.id) as { n: number }).n
  const z = test.einstellungen.zuteilung
  const variante =
    typeof z === 'number'
      ? Math.min(test.fassungen.length - 1, Math.max(0, z))
      : z === 'zufall'
        ? randomBytes(1)[0] % test.fassungen.length
        : n % test.fassungen.length
  const id = neueId()
  const jetzt = test.status === 'offen' ? Date.now() : 0
  db()
    .prepare('INSERT INTO teilnahmen (id, test_id, schueler_id, variante, geheim, beginn, ende) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, test.id, schuelerId, variante, randomBytes(18).toString('base64url'), jetzt, jetzt ? jetzt + test.einstellungen.zeitMin * 60_000 : 0)
  return teilnahme(id)!
}

function abgelaufeneAbschliessen(test: Test): void {
  for (const t of teilnahmenVon(test.id))
    if (!t.abgabe && t.beginn > 0 && Date.now() > t.ende + NACHFRIST_MS) abschliessen(t, test, json_(t.antworten, {}), 'zeit')
}

/** Ergebnisse sichtbar: freigegeben, oder alle, die mitschreiben, haben abgegeben */
function ergebnisFrei(test: Test, ts = teilnahmenVon(test.id)): boolean {
  if (test.einstellungen.ergebnisFrei) return true
  if (test.status === 'wartend') return false
  return ts.length > 0 && ts.every((t) => t.abgabe)
}

// ---------------------------------------------------------------- Auswertung

const noteFuer = (test: Test, punkte: number, max: number): number => gradeForPoints(punkte, max, test.einstellungen.schwellen).grade

/** Für die Historie: Gäste über ihren Namen, sonst über den Benutzernamen */
const schluesselVon = (n: NutzerInfo | undefined): string => (n?.quelle === 'gast' ? `gast:${n.name.toLowerCase()}` : (n?.benutzer ?? ''))

/** Übersicht einer Teilnahme für die Lehrkraft */
function ueberblick(test: Test, t: TeilnahmeZeile, namen: Map<string, NutzerInfo>) {
  const b = json_(t.bewertung, {} as Bewertung)
  const max = test.fassungen[t.variante]?.fassung.punkte ?? 0
  const punkte = summe(b)
  const n = namen.get(t.schueler_id)
  return {
    id: t.id,
    name: n?.name ?? '',
    benutzer: n?.quelle === 'gast' ? '' : (n?.benutzer ?? ''),
    schluessel: schluesselVon(n),
    gast: n?.quelle === 'gast',
    variante: test.fassungen[t.variante]?.label ?? '',
    beginn: t.beginn,
    ende: t.ende,
    abgabe: t.abgabe,
    grund: t.grund,
    verlassen: Boolean(t.verlassen),
    vorfaelle: vorfaelleVon(t),
    punkte,
    max,
    offen: offeneEinheiten(b),
    zuEntscheiden: zuEntscheiden(b),
    note: t.abgabe ? noteFuer(test, punkte, max) : null
  }
}

type Fall = KiFall & { teilnahme: string; einheit: string; feld: string; art: 'ki' | 'wort' }

/**
 * KI-Auswertung – im Namen der LEHRKRAFT (ihr Schlüssel bzw. Abo), über den Namensschutz des
 * Servers. Eine Anfrage je Aufgabe und Fassung, alle Abgaben gesammelt. Geprüft werden
 *  - offene Antworten (Status „ki"): richtig / falsch / Lehrkraft entscheidet
 *  - automatisch falsche Wort-Antworten (einmal): kleiner Fehler oder im Zusammenhang sinnvoll? →
 *    Lehrkraft entscheidet, sonst bleibt es falsch
 * Urteile der Lehrkraft werden nie überschrieben.
 */
async function kiAuswerten(test: Test, lehrkraft: NutzerInfo, aufruf: Aufruf): Promise<{ anfragen: number; bewertet: number }> {
  const alle = teilnahmenVon(test.id).filter((t) => t.abgabe)
  let anfragen = 0
  let bewertet = 0
  for (let v = 0; v < test.fassungen.length; v++) {
    const { fassung } = test.fassungen[v]
    const teil = alle.filter((t) => t.variante === v)
    for (const aufgabe of fassung.aufgaben) {
      const einheiten = fassung.einheiten.filter((e) => e.aufgabe === aufgabe.id)
      const faelle: Fall[] = []
      /** Automatisch falsche Einheiten ohne prüfbares Wort: nur als geprüft vermerken */
      const ohneFall = new Map<string, string[]>()
      let nr = 0
      for (const t of teil) {
        const b = json_(t.bewertung, {} as Bewertung)
        const antworten = json_(t.antworten, {} as Antworten)
        for (const e of einheiten) {
          const be = b[e.id]
          if (!be || be.quelle === 'lehrkraft') continue
          if (be.status === 'ki') {
            for (const feld of e.felder) {
              const l = fassung.loesungen[feld]
              if (!l || (l.art !== 'ki' && l.art !== 'menge')) continue
              faelle.push({
                id: `A${++nr}`,
                frage: l.frage,
                erwartung: l.art === 'ki' ? l.erwartung : `eines dieser Wörter oder ein anderes passendes: ${l.werte.join(', ')}`,
                antwort: antworten[feld] ?? '',
                teilnahme: t.id,
                einheit: e.id,
                feld,
                art: 'ki'
              })
            }
          } else if (be.status === 'falsch' && be.quelle === 'auto' && !be.kiGeprueft) {
            // Nur Einheiten, bei denen ausschließlich Wörter abweichen (eine falsche Auswahl bleibt falsch)
            const falscheWoerter: string[] = []
            let andererFehler = false
            for (const feld of e.felder) {
              const l = fassung.loesungen[feld]
              if (!l) continue
              const a = antworten[feld] ?? ''
              if (l.art === 'genau') {
                const vgl = vergleiche(a, l.werte, l.artikelFrei)
                if (vgl === 'leer') andererFehler = true
                else if (vgl !== 'richtig') falscheWoerter.push(feld)
              } else if (l.art === 'auswahl' && a !== l.wert) andererFehler = true
            }
            if (andererFehler || !falscheWoerter.length) {
              ohneFall.set(t.id, [...(ohneFall.get(t.id) ?? []), e.id])
              continue
            }
            for (const feld of falscheWoerter) {
              const l = fassung.loesungen[feld] as { art: 'genau'; werte: string[] }
              faelle.push({
                id: `A${++nr}`,
                frage: kontextVon(fassung, feld),
                erwartung: l.werte.join(' / '),
                antwort: antworten[feld] ?? '',
                wortloesung: true,
                teilnahme: t.id,
                einheit: e.id,
                feld,
                art: 'wort'
              })
            }
          }
        }
      }
      // Nichts zu fragen – nur vermerken, damit es nicht jedes Mal neu durchsucht wird
      for (const [tid, eids] of ohneFall) {
        const t = teilnahme(tid)
        if (!t) continue
        const b = json_(t.bewertung, {} as Bewertung)
        for (const eid of eids) if (b[eid] && b[eid].quelle === 'auto') b[eid] = { ...b[eid], kiGeprueft: true }
        db().prepare('UPDATE teilnahmen SET bewertung = ? WHERE id = ?').run(JSON.stringify(b), tid)
      }
      // In Paketen zu höchstens 40 Antworten
      for (let i = 0; i < faelle.length; i += 40) {
        const paket = faelle.slice(i, i + 40)
        const antwort = await imNutzer(alsNutzer(lehrkraft), () =>
          aufruf('ai:structured', [
            kiAnfrage(
              test.einstellungen.zielsprache,
              test.einstellungen.niveau,
              paket,
              test.einstellungen.art === 'Vokabeltest' || !test.einstellungen.art ? undefined : { art: test.einstellungen.art, fach: test.einstellungen.fach }
            )
          ])
        )
        anfragen++
        bewertet += einarbeiten(fassung, paket, urteileAus(antwort, paket))
      }
    }
  }
  protokolliereServer('onlinetest', `KI-Auswertung: ${anfragen} Anfrage(n), ${bewertet} Antworten bewertet`, lehrkraft.id)
  return { anfragen, bewertet }
}

/** Urteile je Teilnahme und Einheit einarbeiten – frisch gelesen, Urteile der Lehrkraft bleiben */
function einarbeiten(fassung: OnlineFassung, paket: Fall[], urteile: Map<string, KiUrteil>): number {
  let bewertet = 0
  const jeTeilnahme = new Map<string, Fall[]>()
  for (const f of paket) jeTeilnahme.set(f.teilnahme, [...(jeTeilnahme.get(f.teilnahme) ?? []), f])
  for (const [tid, fs] of jeTeilnahme) {
    const t = teilnahme(tid)
    if (!t) continue
    const b = json_(t.bewertung, {} as Bewertung)
    const jeEinheit = new Map<string, Fall[]>()
    for (const f of fs) jeEinheit.set(f.einheit, [...(jeEinheit.get(f.einheit) ?? []), f])
    for (const [eid, efs] of jeEinheit) {
      if (b[eid]?.quelle === 'lehrkraft') continue
      const us = efs.map((f) => urteile.get(f.id))
      if (us.some((u) => !u)) continue
      const e = fassung.einheiten.find((x) => x.id === eid)!
      const hinweis = us
        .map((u) => u!.begruendung)
        .filter(Boolean)
        .join(' ')
      const pruefen = us.some((u) => u!.urteil === 'kleinerFehler') ? 'kleinerFehler' : 'sinnvoll'
      if (efs[0].art === 'wort') {
        // Bleibt falsch – außer die Lehrkraft akzeptiert
        b[eid] = us.some((u) => u!.urteil === 'falsch')
          ? { ...b[eid], kiGeprueft: true, ...(hinweis ? { hinweis: [b[eid]?.hinweis, `KI: ${hinweis}`].filter(Boolean).join('; ') } : {}) }
          : { status: 'falsch', punkte: 0, quelle: 'ki', pruefen, kiGeprueft: true, hinweis }
      } else if (us.every((u) => u!.urteil === 'richtig')) b[eid] = { status: 'richtig', punkte: e.punkte, quelle: 'ki', hinweis }
      else if (us.some((u) => u!.urteil === 'falsch')) b[eid] = { status: 'falsch', punkte: 0, quelle: 'ki', hinweis }
      else b[eid] = { status: 'falsch', punkte: 0, quelle: 'ki', pruefen, hinweis }
      bewertet++
    }
    db().prepare('UPDATE teilnahmen SET bewertung = ? WHERE id = ?').run(JSON.stringify(b), tid)
  }
  return bewertet
}

// ---------- Automatisch nach jeder Abgabe (gebündelt: 4 s Ruhe, je Test nacheinander)

const kiLaeufe = new Map<string, { laeuft: boolean; erneut: boolean; zeitgeber?: ReturnType<typeof setTimeout>; fehler?: string }>()
let kiAufruf: Aufruf | null = null

function kiPlanen(testId: string): void {
  if (!kiAufruf) return
  const s = kiLaeufe.get(testId) ?? { laeuft: false, erneut: false }
  kiLaeufe.set(testId, s)
  if (s.laeuft) {
    s.erneut = true
    return
  }
  if (s.zeitgeber) clearTimeout(s.zeitgeber)
  s.zeitgeber = setTimeout(() => void kiLauf(testId), 4000)
}

async function kiLauf(testId: string): Promise<void> {
  const s = kiLaeufe.get(testId)
  const test = testNachId(testId)
  const lehrkraft = test ? nutzerNachId(test.lehrkraft_id) : null
  if (!s || !test || !lehrkraft || !kiAufruf) return
  s.laeuft = true
  s.zeitgeber = undefined
  try {
    await kiAuswerten(test, lehrkraft, kiAufruf)
    s.fehler = undefined
  } catch (e) {
    s.fehler = e instanceof Error ? e.message : String(e)
    protokolliereServer('onlinetest', `KI-Auswertung fehlgeschlagen: ${s.fehler.slice(0, 200)}`, lehrkraft.id)
  } finally {
    s.laeuft = false
    if (s.erneut) {
      s.erneut = false
      kiPlanen(testId)
    }
  }
}

const kiStand = (testId: string): { laeuft: boolean; fehler: string | null } => {
  const s = kiLaeufe.get(testId)
  return { laeuft: Boolean(s && (s.laeuft || s.zeitgeber)), fehler: s?.fehler ?? null }
}

// ---------------------------------------------------------------- Handschrift

/**
 * Erkennung im Namen der Lehrkraft, die den Test angelegt und gestartet hat – mit IHREM KI-Zugang,
 * auch über ihr Abo (Wunsch der Lehrkraft, 02.10.2026). Gebündelt: Was aus einem Test innerhalb von
 * 1,2 s ankommt, geht als EINE Anfrage mit mehreren Bildern hinaus (höchstens 8 je Anfrage).
 */
const BUENDEL_MS = 1200
const BUENDEL_MAX = 8
const warteschlangen = new Map<
  string,
  { proben: { png: string; kontext: string; ok: (e: Erkennung) => void; fehler: (e: unknown) => void }[]; zeit: ReturnType<typeof setTimeout> | null }
>()

function handschriftErkennen(test: Test, png: string, kontext: string): Promise<Erkennung> {
  return new Promise((ok, fehler) => {
    const w = warteschlangen.get(test.id) ?? { proben: [], zeit: null }
    warteschlangen.set(test.id, w)
    w.proben.push({ png, kontext, ok, fehler })
    if (w.proben.length >= BUENDEL_MAX) {
      if (w.zeit) clearTimeout(w.zeit)
      w.zeit = null
      void buendelSenden(test)
    } else if (!w.zeit) w.zeit = setTimeout(() => void buendelSenden(test), BUENDEL_MS)
  })
}

async function buendelSenden(test: Test): Promise<void> {
  const w = warteschlangen.get(test.id)
  if (!w) return
  w.zeit = null
  const proben = w.proben.splice(0, BUENDEL_MAX)
  if (w.proben.length && !w.zeit) w.zeit = setTimeout(() => void buendelSenden(test), 50)
  if (!proben.length) return
  try {
    const lehrkraft = nutzerNachId(test.lehrkraft_id)
    if (!lehrkraft || !kiAufruf) throw new Error('Keine Erkennung möglich.')
    const aufruf = kiAufruf
    const antwort = await imNutzer(alsNutzer(lehrkraft), () => aufruf('ai:structured', [erkennungsAnfrage(proben, test.einstellungen.zielsprache)]))
    const ergebnisse = erkennungenAus(antwort, proben.length)
    proben.forEach((p, i) => p.ok(ergebnisse[i]))
  } catch (e) {
    for (const p of proben) p.fehler(e)
  }
}

// ---------------------------------------------------------------- Gäste (ohne IServ)

/** „anna k", „Anna K." → „Anna K."; bis zu drei Buchstaben des Nachnamens (zwei Annas) */
export function gastName(roh: unknown): string | null {
  const s = String(roh ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
  const m = /^(\p{L}[\p{L}'-]{0,29}(?: \p{L}[\p{L}'-]{0,29})?) (\p{L}{1,3})\.?$/u.exec(s)
  if (!m) return null
  const gross = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1)
  return `${m[1].split(' ').map(gross).join(' ')} ${gross(m[2].toLowerCase())}.`
}

const MAX_GAESTE = 80

// ---------------------------------------------------------------- Routen: Lernende

async function koerperRoh(k: Anfrage): Promise<Record<string, unknown>> {
  // sendBeacon schickt text/plain – darum selbst lesen
  const t = await leseKoerper(k.req, 2 * 1024 * 1024)
  return t ? (JSON.parse(t) as Record<string, unknown>) : {}
}

/** Was die Lernenden nach der Freigabe sehen: eigene Antworten, Bewertung, Lösungen */
function ergebnisFuer(test: Test, t: TeilnahmeZeile) {
  const f = test.fassungen[t.variante].fassung
  const b = json_(t.bewertung, {} as Bewertung)
  const punkte = summe(b)
  const ki = kiStand(test.id)
  return {
    punkte,
    max: f.punkte,
    note: noteFuer(test, punkte, f.punkte),
    vorlaeufig: ki.laeuft || offeneEinheiten(b) > 0 || zuEntscheiden(b) > 0,
    aufgaben: f.aufgaben,
    einheiten: f.einheiten,
    loesungen: f.loesungen,
    antworten: json_(t.antworten, {}),
    // Für die Lernenden ohne Begründungen der KI (die richten sich an die Lehrkraft)
    bewertung: Object.fromEntries(
      Object.entries(b).map(([k, x]) => [k, { status: x.status, punkte: x.punkte, ...(x.pruefen && x.quelle !== 'lehrkraft' ? { pruefen: x.pruefen } : {}) }])
    )
  }
}

export function schuelerRoute(aufruf?: Aufruf): (k: Anfrage) => Promise<boolean> {
  if (aufruf) kiAufruf = aufruf
  return async (k) => {
    const { url, req, res, sitzung } = k
    if (!url.pathname.startsWith('/s/api/')) return false
    const was = url.pathname.slice('/s/api/'.length)
    const mitKopf = typeof req.headers['x-schulapps-token'] === 'string'

    // ---------- Beitritt mit Namen (ohne IServ): Gastkonto nur für diesen Test
    if (req.method === 'POST' && was === 'gast') {
      if (!mitKopf) return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
      if (iservBereit()) return (json(res, 403, { fehler: 'Bitte mit IServ anmelden.' }), true)
      const k0 = await koerperRoh(k)
      const test = testNachCode(String(k0.code ?? ''))
      if (!test) return (json(res, 404, { fehler: 'Diesen Test gibt es nicht. Bitte den Code prüfen.' }), true)
      if (test.status === 'beendet') return (json(res, 409, { fehler: 'Dieser Test ist beendet.' }), true)
      if (test.einstellungen.gaeste === false)
        return (json(res, 403, { fehler: 'Diesen Test schreibst du mit deinem Schülerkonto – bitte anmelden.', anmelden: true }), true)
      const name = gastName(k0.name)
      if (!name) return (json(res, 400, { fehler: 'Bitte Vorname und Anfangsbuchstaben des Nachnamens eingeben, z. B. „Anna K.“' }), true)
      const ts = teilnahmenVon(test.id)
      const namen = new Map(alleNutzer().map((n) => [n.id, n]))
      // Schon in diesem Test (dasselbe Gerät, z. B. nach einem Neuladen)? Dann einfach weiter
      if (sitzung?.nutzer.quelle === 'gast' && ts.some((t) => t.schueler_id === sitzung.nutzer.id))
        return (json(res, 200, { ok: true, name: sitzung.nutzer.name }), true)
      if (ts.some((t) => namen.get(t.schueler_id)?.name.toLowerCase() === name.toLowerCase()))
        return (
          json(res, 409, {
            fehler: `„${name}“ schreibt diesen Test schon. Bitte einen zweiten Buchstaben des Nachnamens dazunehmen, z. B. „Anna Ko.“ statt „Anna K.“`
          }),
          true
        )
      if (ts.length >= MAX_GAESTE) return (json(res, 429, { fehler: 'Der Test ist voll.' }), true)
      const gast = nutzerAnlegen({ benutzer: `gast-${neueId().slice(0, 12)}`, name, rolle: 'schueler', quelle: 'gast' })
      registerVergessen()
      teilnahmeAnlegen(test, gast.id)
      const neu = sitzungAnlegen(gast.id, 'schueler')
      setzeSitzungsCookie(res, neu.cookie, SITZUNG_MS.schueler, Boolean((req.socket as { encrypted?: boolean }).encrypted))
      protokolliereServer('onlinetest', 'Beitritt mit Namen (ohne IServ)', gast.id)
      return (json(res, 200, { ok: true, name }), true)
    }

    // Vor dem Beitritt: Darf man mit Namen hinein oder nur mit Konto? (ohne Anmeldung abfragbar)
    if (req.method === 'GET' && was === 'zugang') {
      const test = testNachCode(String(url.searchParams.get('code') ?? ''))
      return (json(res, 200, { gaeste: !test || test.einstellungen.gaeste !== false }), true)
    }

    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer
    const gast = ich.quelle === 'gast'

    if (req.method === 'GET' && was === 'ich') return (json(res, 200, { name: ich.name, benutzer: gast ? '' : ich.benutzer, rolle: ich.rolle, gast }), true)
    if (req.method === 'GET' && was === 'tests') {
      const meine = new Map(
        (db().prepare('SELECT test_id, abgabe FROM teilnahmen WHERE schueler_id = ?').all(ich.id) as { test_id: string; abgabe: number | null }[]).map((x) => [
          x.test_id,
          x.abgabe
        ])
      )
      // Offene Tests der eigenen Lerngruppen (Gäste: nur der eigene Test)
      const tests = (db().prepare("SELECT * FROM onlinetests WHERE status != 'beendet'").all() as unknown as TestZeile[]).map(alsTest).filter((t) => {
        if (gast) return meine.has(t.id)
        if (t.einstellungen.reihe) return false
        const g = t.lerngruppe_id ? lerngruppe(t.lerngruppe_id) : null
        return g && gehoertZu(g, ich)
      })
      return (
        json(res, 200, {
          tests: tests.map((t) => ({
            code: t.code,
            titel: t.titel,
            zeitMin: t.einstellungen.zeitMin,
            abgegeben: Boolean(meine.get(t.id)),
            wartend: t.status === 'wartend'
          }))
        }),
        true
      )
    }
    if (req.method === 'GET' && was === 'ergebnisse') {
      // Frühere Ergebnisse (Schüler-Startseite, 02.10.2026) – nur mit Konto; Gäste gehören nur zu einem Test
      if (gast) return (json(res, 200, { ergebnisse: [] }), true)
      const zeilen = db()
        .prepare('SELECT * FROM teilnahmen WHERE schueler_id = ? AND abgabe IS NOT NULL ORDER BY abgabe DESC')
        .all(ich.id) as unknown as TeilnahmeZeile[]
      const ergebnisse = zeilen.flatMap((t) => {
        const test = testNachId(t.test_id)
        if (!test) return []
        const frei = ergebnisFrei(test)
        const e = frei ? ergebnisFuer(test, t) : null
        return [
          {
            id: t.id,
            code: test.code,
            titel: test.titel,
            datum: t.abgabe,
            frei,
            ...(e ? { punkte: e.punkte, max: e.max, note: e.note, vorlaeufig: e.vorlaeufig } : {}),
            figur: test.einstellungen.figur ? figurPosen(test.id) : []
          }
        ]
      })
      return (json(res, 200, { ergebnisse }), true)
    }
    if (req.method === 'GET' && was.startsWith('figur/')) {
      // Figur des Tests (Maskottchen) – nur für Angemeldete, lange zwischenspeicherbar
      const [, code, pose] = was.split('/')
      const test = testNachCode(String(code ?? ''))
      const z = test
        ? (db()
            .prepare('SELECT png FROM onlinetest_figuren WHERE test_id = ? AND pose = ?')
            .get(test.id, String(pose ?? '')) as { png: Uint8Array } | undefined)
        : undefined
      if (!z) return (json(res, 404, { fehler: 'Keine Figur.' }), true)
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'private, max-age=86400' })
      return (res.end(Buffer.from(z.png)), true)
    }
    if (req.method === 'GET' && was === 'ergebnis') {
      const t = teilnahme(url.searchParams.get('id') ?? '')
      if (!t || t.schueler_id !== ich.id) return (json(res, 404, { fehler: 'Unbekannte Teilnahme.' }), true)
      const test = testNachId(t.test_id)!
      if (!t.abgabe) return (json(res, 200, { frei: false, abgegeben: false }), true)
      if (!ergebnisFrei(test)) {
        const ts = teilnahmenVon(test.id)
        return (json(res, 200, { frei: false, abgegeben: true, fertig: ts.filter((x) => x.abgabe).length, alle: ts.length }), true)
      }
      return (json(res, 200, { frei: true, abgegeben: true, ...ergebnisFuer(test, t) }), true)
    }
    if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)

    if (was === 'beitreten') {
      if (!mitKopf) return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
      const k0 = await koerperRoh(k)
      const test = testNachCode(String(k0.code ?? ''))
      if (!test) return (json(res, 404, { fehler: 'Diesen Test gibt es nicht. Bitte den Code prüfen.' }), true)
      if (test.lerngruppe_id && !gast) {
        const g = lerngruppe(test.lerngruppe_id)
        if (g && !gehoertZu(g, ich) && ich.rolle === 'schueler') return (json(res, 403, { fehler: 'Dieser Test ist für eine andere Lerngruppe.' }), true)
      }
      abgelaufeneAbschliessen(test)
      let t = db().prepare('SELECT * FROM teilnahmen WHERE test_id = ? AND schueler_id = ?').get(test.id, ich.id) as TeilnahmeZeile | undefined
      if (!t) {
        if (test.status === 'beendet') return (json(res, 409, { fehler: 'Dieser Test ist beendet.' }), true)
        // Gast eines anderen Tests: die Seite fragt neu nach dem Namen (SchuelerBereich, 03.10.2026)
        if (gast) return (json(res, 403, { fehler: 'Dieser Name gehört zu einem anderen Test.' }), true)
        t = teilnahmeAnlegen(test, ich.id)
      } else if (!t.abgabe && t.beginn === 0 && test.status === 'offen') {
        // Gestartet, während dieses Gerät gewartet hat (Sicherheitsnetz zu „starten")
        const jetzt = Date.now()
        db()
          .prepare('UPDATE teilnahmen SET beginn = ?, ende = ? WHERE id = ? AND beginn = 0')
          .run(jetzt, jetzt + test.einstellungen.zeitMin * 60_000, t.id)
        t = teilnahme(t.id)!
      }
      const fassung = test.fassungen[t.variante].fassung
      const wartet = !t.abgabe && t.beginn === 0
      return (
        json(res, 200, {
          id: t.id,
          geheim: t.abgabe ? undefined : t.geheim,
          titel: test.titel,
          name: ich.name,
          hinweis: test.einstellungen.hinweis ?? '',
          variante: test.fassungen[t.variante].label,
          zeitMin: test.einstellungen.zeitMin,
          wartet,
          ende: t.ende,
          jetzt: Date.now(),
          abgegeben: Boolean(t.abgabe),
          figur: test.einstellungen.figur ? figurPosen(test.id) : [],
          handschrift: Boolean(test.einstellungen.handschrift),
          // NUR die Schülerfassung – die Lösungen bleiben hier (bis zum Ergebnis)
          aufgaben: t.abgabe || wartet ? [] : fassung.aufgaben,
          ...(fassung.stil && !(t.abgabe || wartet) ? { stil: fassung.stil } : {}),
          antworten: t.abgabe || wartet ? {} : json_(t.antworten, {})
        }),
        true
      )
    }

    if (was === 'handschrift') {
      // Handschrift erkennen, sobald die Lernenden kurz absetzen – Tinte bleibt als Beleg gespeichert
      if (!mitKopf) return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
      const k0 = await koerperRoh(k)
      const t = teilnahme(String(k0.id ?? ''))
      if (!t || t.schueler_id !== ich.id || t.geheim !== String(k0.geheim ?? '')) return (json(res, 404, { fehler: 'Unbekannte Teilnahme.' }), true)
      const test = testNachId(t.test_id)!
      if (!test.einstellungen.handschrift) return (json(res, 403, { fehler: 'Handschrift ist in diesem Test nicht vorgesehen.' }), true)
      if (t.abgabe || t.beginn === 0 || Date.now() > t.ende + NACHFRIST_MS) return (json(res, 409, { fehler: 'Der Test läuft nicht.' }), true)
      const fassung = test.fassungen[t.variante].fassung
      const feld = String(k0.feld ?? '')
      const segment = String(k0.segment ?? '')
        .replace(/[^a-z0-9-]/gi, '')
        .slice(0, 40)
      const f = felderVon(fassung).get(feld)
      if (!f || (f.feld.art !== 'text' && f.feld.art !== 'langtext') || !segment) return (json(res, 400, { fehler: 'Unbekanntes Feld.' }), true)
      const png = pngAus(k0.png)
      if (!png || png.length > 600 * 1024) return (json(res, 400, { fehler: 'Das Schriftbild fehlt oder ist zu groß.' }), true)
      const anzahl = (db().prepare('SELECT COUNT(*) AS n FROM onlinetest_tinte WHERE teilnahme_id = ?').get(t.id) as { n: number }).n
      if (anzahl >= 600) return (json(res, 429, { fehler: 'Zu viele Schriftproben in diesem Test.' }), true)
      try {
        const e = await handschriftErkennen(test, `data:image/png;base64,${png.toString('base64')}`, kontextVon(fassung, feld))
        db()
          .prepare('INSERT OR REPLACE INTO onlinetest_tinte (teilnahme_id, feld, segment, png, text, unsicher, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(t.id, feld, segment, png, e.text, e.unsicher ? 1 : 0, Date.now())
        return (json(res, 200, e), true)
      } catch (e) {
        // Tinte trotzdem aufbewahren – die Lehrkraft kann sie lesen
        db()
          .prepare('INSERT OR REPLACE INTO onlinetest_tinte (teilnahme_id, feld, segment, png, text, unsicher, erstellt) VALUES (?, ?, ?, ?, ?, 1, ?)')
          .run(t.id, feld, segment, png, '', Date.now())
        return (json(res, 503, { fehler: e instanceof Error ? e.message : String(e) }), true)
      }
    }

    /*
     * Vorfall melden (Aufsicht, 06.10.2026). Auch per sendBeacon (Seite wird gerade unsichtbar) – geschützt durch das
     * Geheimnis der Teilnahme. `verlassen` alter Seiten (vor 0.4.63 noch im Browser) landet ebenfalls hier: Verlassen
     * gibt nicht mehr ab.
     */
    if (was === 'vorfall') {
      const k0 = await koerperRoh(k)
      const t = teilnahme(String(k0.id ?? ''))
      if (!t || t.schueler_id !== ich.id || t.geheim !== String(k0.geheim ?? '')) return (json(res, 404, { fehler: 'Unbekannte Teilnahme.' }), true)
      if (t.abgabe || t.beginn === 0) return (json(res, 200, { ok: true }), true)
      const jetzt = Date.now()
      const roh = (Array.isArray(k0.vorfaelle) ? k0.vorfaelle : [k0]) as Record<string, unknown>[]
      const liste = vorfaelleVon(t)
      let gueltig = 0
      for (const r of roh) {
        const v = vorfallAus(r, jetzt)
        if (!v) continue
        gueltig++
        // Ende eines Zeitraums: den offenen Vorfall derselben Art abschließen (sonst neu, rückdatiert um die Dauer)
        const offen = r.ende ? [...liste].reverse().find((x) => x.art === v.art && x.dauer === undefined) : undefined
        if (offen) offen.dauer = v.dauer ?? Math.max(1, Math.round((jetzt - offen.zeit) / 1000))
        else liste.push(r.ende && v.dauer ? { ...v, zeit: jetzt - v.dauer * 1000 } : v)
      }
      if (!gueltig) return (json(res, 400, { fehler: 'Unbekannter Vorfall.' }), true)
      liste.splice(0, Math.max(0, liste.length - MAX_VORFAELLE))
      db()
        .prepare('UPDATE teilnahmen SET vorfaelle = ?, verlassen = ? WHERE id = ? AND abgabe IS NULL')
        .run(JSON.stringify(liste), liste.some((x) => x.art !== 'einfuegen') ? 1 : 0, t.id)
      return (json(res, 200, { ok: true }), true)
    }

    if (was === 'verlassen') {
      // Alte Seiten: Verlassen nur noch protokollieren, nicht mehr abgeben
      const k0 = await koerperRoh(k)
      const t = teilnahme(String(k0.id ?? ''))
      if (!t || t.schueler_id !== ich.id || t.geheim !== String(k0.geheim ?? '')) return (json(res, 404, { fehler: 'Unbekannte Teilnahme.' }), true)
      if (!t.abgabe && t.beginn > 0) {
        const liste = [...vorfaelleVon(t), { art: 'verlassen' as const, zeit: Date.now() }].slice(-MAX_VORFAELLE)
        db().prepare('UPDATE teilnahmen SET vorfaelle = ?, verlassen = 1 WHERE id = ? AND abgabe IS NULL').run(JSON.stringify(liste), t.id)
      }
      return (json(res, 200, { ok: true }), true)
    }

    if (was === 'speichern' || was === 'abgeben') {
      // Abgeben geht auch per sendBeacon (keine Kopfzeile) – geschützt durch das Geheimnis der Teilnahme
      if (was === 'speichern' && !mitKopf) return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
      const k0 = await koerperRoh(k)
      const t = teilnahme(String(k0.id ?? ''))
      if (!t || t.schueler_id !== ich.id || t.geheim !== String(k0.geheim ?? '')) return (json(res, 404, { fehler: 'Unbekannte Teilnahme.' }), true)
      const test = testNachId(t.test_id)!
      if (t.abgabe) return (json(res, 200, { abgegeben: true }), true)
      if (t.beginn === 0) return (json(res, 409, { fehler: 'Der Test ist noch nicht gestartet.' }), true)
      const antworten = bereinigeAntworten(test.fassungen[t.variante].fassung, k0.antworten)
      const zuSpaet = Date.now() > t.ende + NACHFRIST_MS
      if (was === 'speichern' && !zuSpaet) {
        db().prepare('UPDATE teilnahmen SET antworten = ? WHERE id = ? AND abgabe IS NULL').run(JSON.stringify(antworten), t.id)
        return (json(res, 200, { ok: true, ende: t.ende, jetzt: Date.now() }), true)
      }
      // Nach Ablauf zählen die zuletzt (rechtzeitig) gespeicherten Antworten
      const gueltig = zuSpaet ? json_(t.antworten, {}) : antworten
      const grund = zuSpaet ? 'zeit' : String(k0.grund ?? 'selbst') === 'zeit' ? 'zeit' : 'selbst'
      abschliessen(t, test, gueltig, grund)
      return (json(res, 200, { abgegeben: true }), true)
    }
    return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  }
}

// ---------------------------------------------------------------- Routen: Lehrkraft

export function lehrkraftRoute(aufruf: Aufruf, adresse: string): (k: Anfrage) => Promise<boolean> {
  kiAufruf = aufruf
  return async (k) => {
    const { url, req, res, sitzung } = k
    const istTest = url.pathname.startsWith('/server/onlinetest')
    const istGruppe = url.pathname.startsWith('/server/lerngruppen')
    if (!istTest && !istGruppe) return false
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer
    if (ich.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
    const mitKopf = typeof req.headers['x-schulapps-token'] === 'string'
    if (req.method === 'POST' && !mitKopf) return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
    const teile = url.pathname.split('/').filter(Boolean).slice(2)
    const link = (code: string): string => `${adresse.replace(/\/$/, '')}/s/t/${code}`

    // ---------- Lerngruppen
    if (istGruppe) {
      if (req.method === 'GET' && teile.length === 0) {
        const gruppen = lerngruppenVon(ich.id).map((g) => ({ ...g, anzahl: mitgliederVon(g).length }))
        // Klassen der Schülerkonten aus der Verwaltung („klasse:10b") stehen zur Auswahl wie IServ-Gruppen
        const klassen = new Map<string, { id: string; name: string }>()
        for (const n of alleNutzer())
          if (n.rolle === 'schueler') for (const g of n.gruppen) if (g.id.startsWith('klasse:')) klassen.set(g.id, { id: g.id, name: `Klasse ${g.name}` })
        return (
          json(res, 200, {
            gruppen,
            iservGruppen: [
              ...(nutzerNachId(ich.id)?.gruppen ?? []),
              ...[...klassen.values()].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
            ]
          }),
          true
        )
      }
      if (req.method === 'GET' && teile.length === 1) {
        const g = lerngruppe(teile[0])
        if (!g || g.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
        return (json(res, 200, historie(g)), true)
      }
      if (req.method === 'POST' && teile[0] === 'anlegen') {
        const k0 = (await k.koerper()) as Record<string, unknown>
        const name = String(k0.name ?? '')
          .trim()
          .slice(0, 80)
        if (!name) return (json(res, 400, { fehler: 'Bitte einen Namen angeben.' }), true)
        const id = neueId()
        const mitglieder = Array.isArray(k0.mitglieder)
          ? (k0.mitglieder as unknown[]).map((x) => String(x).trim().toLowerCase()).filter((x) => /^[a-z0-9._-]{2,64}$/.test(x))
          : []
        db()
          .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(
            id,
            ich.id,
            name,
            String(k0.fach ?? '').slice(0, 40),
            String(k0.iservGruppe ?? '').slice(0, 120),
            JSON.stringify(mitglieder),
            new Date().toISOString()
          )
        return (json(res, 200, { id }), true)
      }
      if (req.method === 'POST' && teile[0] === 'aendern') {
        const k0 = (await k.koerper()) as Record<string, unknown>
        const g = lerngruppe(String(k0.id ?? ''))
        if (!g || g.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
        const mitglieder = Array.isArray(k0.mitglieder)
          ? (k0.mitglieder as unknown[]).map((x) => String(x).trim().toLowerCase()).filter((x) => /^[a-z0-9._-]{2,64}$/.test(x))
          : g.mitglieder
        db()
          .prepare('UPDATE lerngruppen SET name = ?, fach = ?, iserv_gruppe = ?, mitglieder = ? WHERE id = ?')
          .run(
            String(k0.name ?? g.name).slice(0, 80),
            String(k0.fach ?? g.fach).slice(0, 40),
            String(k0.iservGruppe ?? g.iserv_gruppe).slice(0, 120),
            JSON.stringify(mitglieder),
            g.id
          )
        return (json(res, 200, { ok: true }), true)
      }
      if (req.method === 'POST' && teile[0] === 'loeschen') {
        const k0 = (await k.koerper()) as Record<string, unknown>
        db()
          .prepare('DELETE FROM lerngruppen WHERE id = ? AND lehrkraft_id = ?')
          .run(String(k0.id ?? ''), ich.id)
        return (json(res, 200, { ok: true }), true)
      }
      return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    }

    // ---------- Tests
    if (req.method === 'GET' && teile.length === 0) {
      const tests = (db().prepare('SELECT * FROM onlinetests WHERE lehrkraft_id = ? ORDER BY erstellt DESC').all(ich.id) as unknown as TestZeile[]).map(alsTest)
      return (
        json(res, 200, {
          tests: tests.map((t) => {
            abgelaufeneAbschliessen(t)
            const ts = teilnahmenVon(t.id)
            const bs = ts.map((x) => json_(x.bewertung, {} as Bewertung))
            return {
              id: t.id,
              titel: t.titel,
              art: t.einstellungen.art ?? 'Vokabeltest',
              thema: t.einstellungen.thema ?? '',
              zielsprache: t.einstellungen.zielsprache,
              code: t.code,
              link: link(t.code),
              status: t.status,
              erstellt: t.erstellt,
              lerngruppe: t.lerngruppe_id ? (lerngruppe(t.lerngruppe_id)?.name ?? '') : '',
              teilnehmer: ts.length,
              abgegeben: ts.filter((x) => x.abgabe).length,
              offen: bs.reduce((s, b) => s + offeneEinheiten(b), 0),
              zuEntscheiden: bs.reduce((s, b) => s + zuEntscheiden(b), 0)
            }
          })
        }),
        true
      )
    }
    if (req.method === 'POST' && teile[0] === 'erstellen') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      try {
        const t = testErstellen(ich, {
          titel: String(k0.titel ?? ''),
          ...(k0.blatt && typeof k0.blatt === 'object'
            ? { blatt: k0.blatt as { art: string; fach: string; fassungen: { label: string; fassung: OnlineFassung }[] } }
            : { test: k0.test as TestDocument }),
          lerngruppeId: typeof k0.lerngruppeId === 'string' && k0.lerngruppeId ? k0.lerngruppeId : undefined,
          zeitMin: Number(k0.zeitMin) || 20,
          zuteilung: k0.zuteilung === 'zufall' ? 'zufall' : typeof k0.zuteilung === 'number' ? k0.zuteilung : 'abwechselnd',
          hinweis: typeof k0.hinweis === 'string' ? k0.hinweis : undefined,
          thema: typeof k0.thema === 'string' ? k0.thema : undefined,
          figur: k0.figur && typeof k0.figur === 'object' ? (k0.figur as { winkend?: unknown; jubelnd?: unknown }) : undefined,
          handschrift: k0.handschrift !== false,
          gaeste: k0.gaeste !== false
        })
        return (json(res, 200, { id: t.id, code: t.code, link: link(t.code) }), true)
      } catch (e) {
        return (json(res, 400, { fehler: e instanceof Error ? e.message : String(e) }), true)
      }
    }
    const test = teile[0] ? testNachId(teile[0]) : null
    if (!test || test.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Unbekannter Test.' }), true)
    abgelaufeneAbschliessen(test)
    const namen = new Map(alleNutzer().map((n) => [n.id, n]))

    if (req.method === 'GET' && teile.length === 1) {
      const ts = teilnahmenVon(test.id)
      const mitglieder = test.lerngruppe_id ? mitgliederVon(lerngruppe(test.lerngruppe_id)!) : []
      return (
        json(res, 200, {
          id: test.id,
          titel: test.titel,
          code: test.code,
          link: link(test.code),
          status: test.status,
          einstellungen: test.einstellungen,
          erstellt: test.erstellt,
          lerngruppe: test.lerngruppe_id ? lerngruppe(test.lerngruppe_id) : null,
          ohneIserv: !iservBereit(),
          ki: kiStand(test.id),
          ergebnisSichtbar: ergebnisFrei(test, ts),
          // Wer aus der Lerngruppe noch nicht begonnen hat
          fehlend: mitglieder.filter((m) => !ts.some((t) => t.schueler_id === m.id)).map((m) => ({ name: m.name, benutzer: m.benutzer })),
          fassungen: test.fassungen.map((f) => ({
            label: f.label,
            punkte: f.fassung.punkte,
            aufgaben: f.fassung.aufgaben,
            einheiten: f.fassung.einheiten,
            loesungen: f.fassung.loesungen,
            original: f.original ?? null
          })),
          teilnahmen: ts.map((t) => ({
            ...ueberblick(test, t, namen),
            antworten: json_(t.antworten, {}),
            bewertung: json_(t.bewertung, {}),
            varianteNr: t.variante
          }))
        }),
        true
      )
    }
    if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
    const k0 = (await k.koerper()) as Record<string, unknown>
    if (teile[1] === 'status') {
      if (k0.status === 'starten') {
        // Gemeinsamer Start: alle Wartenden bekommen jetzt ihre Zeit
        if (test.status !== 'wartend') return (json(res, 409, { fehler: 'Der Test läuft schon.' }), true)
        const jetzt = Date.now()
        db().prepare("UPDATE onlinetests SET status = 'offen' WHERE id = ?").run(test.id)
        db()
          .prepare('UPDATE teilnahmen SET beginn = ?, ende = ? WHERE test_id = ? AND beginn = 0 AND abgabe IS NULL')
          .run(jetzt, jetzt + test.einstellungen.zeitMin * 60_000, test.id)
        einstellungenSetzen(test, { gestartet: jetzt })
        protokolliereServer('onlinetest', 'Onlinetest gestartet', ich.id)
        return (json(res, 200, { ok: true }), true)
      }
      if (k0.status === 'gaeste' || k0.status === 'nurKonto') {
        einstellungenSetzen(test, { gaeste: k0.status === 'gaeste' })
        return (json(res, 200, { ok: true }), true)
      }
      if (k0.status === 'freigeben' || k0.status === 'zurueckhalten') {
        einstellungenSetzen(test, { ergebnisFrei: k0.status === 'freigeben' })
        return (json(res, 200, { ok: true }), true)
      }
      const status: TestStatus = k0.status === 'beendet' ? 'beendet' : test.einstellungen.gestartet ? 'offen' : 'wartend'
      db()
        .prepare('UPDATE onlinetests SET status = ?, beendet = ? WHERE id = ?')
        .run(status, status === 'beendet' ? new Date().toISOString() : null, test.id)
      if (status === 'beendet') {
        for (const t of teilnahmenVon(test.id)) {
          if (t.abgabe) continue
          // Nie gestartet: Die Wartenden haben nichts geschrieben – ihre Teilnahme entfällt
          if (t.beginn === 0) db().prepare('DELETE FROM teilnahmen WHERE id = ?').run(t.id)
          // Laufende geben mit dem zuletzt gespeicherten Stand ab
          else abschliessen(t, test, json_(t.antworten, {}), 'lehrkraft')
        }
      }
      return (json(res, 200, { ok: true }), true)
    }
    if (teile[1] === 'abschliessen') {
      const t = teilnahme(String(k0.teilnahme ?? ''))
      if (!t || t.test_id !== test.id) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
      if (t.beginn === 0) return (json(res, 409, { fehler: 'Der Test ist für diese Person noch nicht gestartet.' }), true)
      abschliessen(t, test, json_(t.antworten, {}), 'lehrkraft')
      return (json(res, 200, { ok: true }), true)
    }
    if (teile[1] === 'tinte') {
      const t = teilnahme(String(k0.teilnahme ?? ''))
      if (!t || t.test_id !== test.id) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
      const zeilen = db()
        .prepare('SELECT feld, segment, png, text, unsicher, erstellt FROM onlinetest_tinte WHERE teilnahme_id = ? ORDER BY erstellt')
        .all(t.id) as {
        feld: string
        segment: string
        png: Uint8Array
        text: string
        unsicher: number
        erstellt: number
      }[]
      return (
        json(res, 200, {
          tinte: zeilen.map((z) => ({
            feld: z.feld,
            segment: z.segment,
            text: z.text,
            unsicher: Boolean(z.unsicher),
            bild: `data:image/png;base64,${Buffer.from(z.png).toString('base64')}`
          }))
        }),
        true
      )
    }
    if (teile[1] === 'entfernen') {
      // Eine Teilnahme entfernen (z. B. vertippter Name im Wartebildschirm)
      const t = teilnahme(String(k0.teilnahme ?? ''))
      if (!t || t.test_id !== test.id) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
      db().prepare('DELETE FROM teilnahmen WHERE id = ?').run(t.id)
      return (json(res, 200, { ok: true }), true)
    }
    if (teile[1] === 'korrektur') {
      const t = teilnahme(String(k0.teilnahme ?? ''))
      if (!t || t.test_id !== test.id) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
      const e = test.fassungen[t.variante].fassung.einheiten.find((x) => x.id === k0.einheit)
      if (!e) return (json(res, 404, { fehler: 'Unbekannte Aufgabe.' }), true)
      const b = json_(t.bewertung, {} as Bewertung)
      // Ganze Punkte zwischen 0 und dem Höchstwert der Einheit (Freitext); sonst richtig/falsch.
      // Korrekturzeichen aus der Blattansicht (03.10.2026): ✓, (✓) knapp richtig, ✗, ? zu allgemein
      const zeichen = ['richtig', 'knapp', 'falsch', 'frage'].includes(String(k0.zeichen)) ? String(k0.zeichen) : null
      const punkte =
        typeof k0.punkte === 'number'
          ? Math.max(0, Math.min(e.punkte, Math.round(k0.punkte)))
          : zeichen
            ? zeichen === 'richtig' || zeichen === 'knapp'
              ? e.punkte
              : 0
            : k0.richtig
              ? e.punkte
              : 0
      const alt = b[e.id]
      b[e.id] = {
        status: punkte > 0 ? 'richtig' : 'falsch',
        punkte,
        quelle: 'lehrkraft',
        ...(zeichen === 'knapp' ? { knapp: true } : {}),
        ...(zeichen === 'frage' ? { frage: true } : {}),
        ...(alt?.pruefen ? { pruefen: alt.pruefen } : {}),
        ...(typeof k0.hinweis === 'string' && k0.hinweis ? { hinweis: k0.hinweis.slice(0, 300) } : alt?.hinweis ? { hinweis: alt.hinweis } : {})
      }
      db().prepare('UPDATE teilnahmen SET bewertung = ? WHERE id = ?').run(JSON.stringify(b), t.id)
      return (json(res, 200, { ok: true }), true)
    }
    if (teile[1] === 'auswerten') {
      // Von Hand anstoßen (z. B. nach einem Fehler) – lange Anfrage: Lebenszeichen wie bei /api
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      const puls = setInterval(() => res.write(' '), PULS_MS)
      res.on('close', () => clearInterval(puls))
      const s = kiLaeufe.get(test.id) ?? { laeuft: false, erneut: false }
      kiLaeufe.set(test.id, s)
      try {
        if (s.laeuft) throw new Error('Die KI wertet gerade schon aus – gleich noch einmal neu laden.')
        if (s.zeitgeber) clearTimeout(s.zeitgeber)
        s.zeitgeber = undefined
        s.laeuft = true
        const lehrkraft = nutzerNachId(ich.id)!
        const r = await kiAuswerten(test, lehrkraft, aufruf)
        s.fehler = undefined
        res.end(JSON.stringify({ ok: true, ...r }))
      } catch (e) {
        s.fehler = e instanceof Error ? e.message : String(e)
        res.end(JSON.stringify({ ok: false, fehler: s.fehler }))
      } finally {
        s.laeuft = false
        clearInterval(puls)
      }
      return true
    }
    if (teile[1] === 'umbenennen') {
      const titel = String(k0.titel ?? '')
        .trim()
        .slice(0, 160)
      if (!titel) return (json(res, 400, { fehler: 'Bitte einen Namen angeben.' }), true)
      db().prepare('UPDATE onlinetests SET titel = ? WHERE id = ?').run(titel, test.id)
      return (json(res, 200, { ok: true }), true)
    }
    if (teile[1] === 'loeschen') {
      db().prepare('DELETE FROM onlinetests WHERE id = ?').run(test.id)
      kiLaeufe.delete(test.id)
      protokolliereServer('onlinetest', 'Onlinetest gelöscht', ich.id)
      return (json(res, 200, { ok: true }), true)
    }
    return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  }
}

/** Historie einer Lerngruppe: je Test Datum, Ergebnisse, Notenverteilung, Durchschnitt; je Schüler Durchschnitt */
export function historie(g: Lerngruppe) {
  const namen = new Map(alleNutzer().map((n) => [n.id, n]))
  const tests = (db().prepare('SELECT * FROM onlinetests WHERE lerngruppe_id = ? ORDER BY erstellt').all(g.id) as unknown as TestZeile[]).map(alsTest)
  const jeSchueler = new Map<string, { name: string; benutzer: string; noten: number[]; prozente: number[] }>()
  const liste = tests.map((t) => {
    abgelaufeneAbschliessen(t)
    const ts = teilnahmenVon(t.id).filter((x) => x.abgabe)
    const ergebnisse = ts.map((x) => ueberblick(t, x, namen))
    const verteilung = [1, 2, 3, 4, 5, 6].map((n) => ergebnisse.filter((e) => e.note === n).length)
    for (const e of ergebnisse) {
      if (e.note == null) continue
      // Gäste (ohne IServ) über ihren Namen in der Lerngruppe
      const s = jeSchueler.get(e.schluessel) ?? { name: e.name, benutzer: e.benutzer, noten: [], prozente: [] }
      s.noten.push(e.note)
      s.prozente.push(e.max ? (e.punkte / e.max) * 100 : 0)
      jeSchueler.set(e.schluessel, s)
    }
    const noten = ergebnisse.map((e) => e.note).filter((n): n is number => n != null)
    return {
      id: t.id,
      titel: t.titel,
      datum: t.erstellt,
      status: t.status,
      teilnehmer: ergebnisse.length,
      offen: ergebnisse.reduce((s, e) => s + e.offen + e.zuEntscheiden, 0),
      durchschnitt: noten.length ? Math.round((noten.reduce((a, b) => a + b, 0) / noten.length) * 100) / 100 : null,
      verteilung,
      ergebnisse: ergebnisse.map((e) => ({ name: e.name, benutzer: e.benutzer, punkte: e.punkte, max: e.max, note: e.note, verlassen: e.verlassen }))
    }
  })
  return {
    gruppe: { ...g, mitglieder: g.mitglieder },
    mitglieder: mitgliederVon(g).map((m) => ({ name: m.name, benutzer: m.benutzer })),
    tests: liste,
    schueler: [...jeSchueler.values()]
      .map((s) => ({
        name: s.name,
        benutzer: s.benutzer,
        tests: s.noten.length,
        durchschnitt: Math.round((s.noten.reduce((a, b) => a + b, 0) / s.noten.length) * 100) / 100,
        prozent: Math.round(s.prozente.reduce((a, b) => a + b, 0) / s.prozente.length)
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
  }
}

export type { Nutzer }

// ---------------------------------------------------------------- Unterrichtsreihe (Etappe 6)

/** Test für eine Reihe: eigenes Tempo – sofort offen, Ergebnis gleich nach der Abgabe */
export function reihenTestAnlegen(lehrkraftId: string, e: { titel: string; test: TestDocument; lerngruppeId?: string; zeitMin: number }): string {
  const lehrkraft = nutzerNachId(lehrkraftId)
  if (!lehrkraft) throw new Error('Unbekannte Lehrkraft.')
  const t = testErstellen(lehrkraft, { titel: e.titel, test: e.test, lerngruppeId: e.lerngruppeId, zeitMin: e.zeitMin, gaeste: false, handschrift: true })
  db().prepare("UPDATE onlinetests SET status = 'offen' WHERE id = ?").run(t.id)
  einstellungenSetzen(t, { gestartet: Date.now(), ergebnisFrei: true, reihe: true })
  return t.id
}

export const reihenTestCode = (testId: string): string | null => testNachId(testId)?.code ?? null

/** Stand einer Person in einem Test: abgegeben? Prozent (sobald frei) */
export function onlinetestStand(testId: string, schuelerId: string): { eingereicht: number; runden: number; prozent?: number } | null {
  const test = testNachId(testId)
  if (!test) return null
  const t = db().prepare('SELECT * FROM teilnahmen WHERE test_id = ? AND schueler_id = ?').get(test.id, schuelerId) as unknown as TeilnahmeZeile | undefined
  if (!t?.abgabe) return { eingereicht: 0, runden: 1 }
  const max = test.fassungen[t.variante]?.fassung.punkte ?? 0
  const punkte = summe(json_(t.bewertung, {} as Bewertung))
  return { eingereicht: 1, runden: 1, ...(max ? { prozent: Math.round((punkte / max) * 100) } : {}) }
}
