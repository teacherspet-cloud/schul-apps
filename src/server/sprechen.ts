/**
 * Sprechprüfungstraining am Server (19.10.2026, Plan „synthetic-seeking-popcorn", abgestimmt mit der Lehrkraft).
 *
 * Freigabe je Kurs (Vokabelkurs der Klasse) und Teil (Interview, Monolog, Dialog, Simulation), zeitlich begrenzt
 * (Standard 2 Wochen), mit Minutengrenze je Woche, Niveau, nur Schulzeit (7–21 Uhr).
 *
 * Gespräch OHNE Audio auf unserem Server: Der Browser schickt seine WebRTC-Beschreibung (SDP, Text) hierher; der Server
 * meldet die Sitzung mit dem Schlüssel der freigebenden Lehrkraft (sonst der Schule) bei OpenAI an
 * (POST /v1/realtime/calls, feste Anweisungen, Ablauf-Aufzeichnung `tracing` aus) und gibt die Antwort-SDP zurück.
 * Richtiggestellt (23.10.2026, Nachprüfung des Schulträgers): Die Realtime-Sitzung kennt KEIN Feld `store`; abschaltbar
 * ist nur `tracing` (Aufzeichnung im Traces-Dashboard, null = aus). Audio und Text verarbeitet OpenAI; Missbrauchs-
 * protokolle bei OpenAI (bis 30 Tage) richten sich nach den Bedingungen von OpenAI. Das Audio fließt direkt
 * Browser ↔ OpenAI. Der Server hängt sich als Kontrollkanal an (wss …/realtime?call_id=): Er liest das Transkript als
 * Text im Speicher mit, setzt veränderte Anweisungen zurück (Umgehungsversuch), nimmt `uebung_beenden` entgegen und
 * legt bei Zeitablauf auf. Audio-Ereignisse verwirft er ungelesen. Gespeichert werden nur Einschätzung, Kennzahlen und
 * Tipps (verschlüsselt); das Transkript wird nach der Auswertung verworfen. Vorfälle: Art, Zeit und der eine Satz
 * (verschlüsselt, nach 14 Tagen gelöscht); nach 3 Vorfällen ist das Training für die Person gesperrt.
 *
 *   GET  /server/sprechen/verfuegbar                             Gesprächs-KI eingerichtet? (Reiter nur dann)
 *   GET  /server/sprechen?kurs=<vokId>                          Freigaben, Überblick je Person (Lehrkraft)
 *   POST /server/sprechen/freigeben {kurs, teile, tage, schueler, minutenWoche, niveau, nurSchulzeit}
 *   POST /server/sprechen/<id>/beenden · /<id>/entsperren {schueler}
 *   GET  /s/api/sprechen                                        meine Freigaben, Stand, Tipps
 *   POST /s/api/sprechen/start {freigabe, teil, modus, sdp}      → {sitzung, sdp | attrappe, karte, minuten}
 *   GET  /s/api/sprechen/status?sitzung=                         → {beendet, grund}
 *   POST /s/api/sprechen/attrappe {sitzung, text}                (nur Browsertests: Gespräch ohne KI)
 *   POST /s/api/sprechen/ende {sitzung, kennzahlen}             → Einschätzung
 *
 * Nachgeschärft (22.10.2026, KI-Sicherheitsprüfung):
 *  - Kontrollkanal prüft JEDES Ereignis (shared/sprechen/kontrolle.ts): getippter Text, eigene Antworten mit anderen
 *    Anweisungen, Textausgabe, abgeschaltete Transkription → auflegen (Vorfall „manipulation“); andere Änderungen an der
 *    Sitzung → zurücksetzen. Die Sitzung ist auf Audio-Ausgabe und eine Tokengrenze je Antwort festgelegt.
 *  - Minuten: ab /start gezählt, abgerechnet beim Ende (Knopf, Zeitablauf, Auflegen, Aufräumen, neue Sitzung) – auch ohne
 *    /ende. Höchstens eine laufende Sitzung je Kind (eine neue beendet die alte). Neben der Wochengrenze eine Tagesgrenze
 *    je Freigabe (Faustregel: halbe Wochengrenze, aufgerundet). Realtime-Sekunden und Moderation zählen zum Budget der
 *    Lehrkraft; ist es erschöpft, startet keine Übung.
 *  - Krise (Entscheidung der Lehrkraft): Selbstgefährdung (Moderation self-harm*, Wortliste, Werkzeug grund „hilfe“) ist
 *    NIE ein Vorfall; die Übung endet sanft, das Kind sieht den festen Hilfetext, die Lehrkraft einen vertraulichen
 *    Hinweis ohne Wortlaut (krise.ts).
 *  - Kein Name in den Anweisungen; rohe Fehler nur ins Protokoll, Lernende sehen LERNENDEN_FEHLER.
 */
import { randomBytes } from 'node:crypto'
import { alleNutzer, datenbank, protokolliereServer, type NutzerInfo } from './datenbank'
import { alsNutzer, json, type Anfrage, type Aufruf } from './http'
import { imNutzer } from './kontext'
import { lerngruppe } from './onlinetest'
import { vokIstFuer, zeile as vokZeile } from './vokabeln'
import { jahrgangDerGruppe } from './ueberthemen'
import { getSecret, getSettings, hatEigenesGeheimnis } from '../main/services/storage/settings'
import { anweisungen, SPRACHNAME, WERKZEUG_BEENDEN, type Gespraech } from '../shared/sprechen/anweisungen'
import { ATTRAPPE_EINSCHAETZUNG, bewertungsAnfrage, einschaetzungAus, istUmgehung, type Einschaetzung, type Kennzahlen, type TranskriptZeile } from '../shared/sprechen/bewertung'
import { GRUNDKARTEN, karteBereinigt, type SprechKarte } from '../shared/sprechen/karten'
import { bankKarten } from './sprechBank'
import { schulOrtVon } from './grammatik'
import { punkteVon, type KriteriumId } from '../shared/sprechen/kriterien'
import { hoechstMinuten, NIVEAUS, stufeVonNiveau, TEILE, zielNiveau, type Niveau, type SprechSprache, type Teil } from '../shared/sprechen/niveaus'
import { antwortKonto, kontrollEreignis, moderationsUrteil, type AntwortKonto, type FesteSitzung } from '../shared/sprechen/kontrolle'
import { LERNENDEN_FEHLER } from '../shared/kiSchutz'
import { kiGrenzeMeldung } from '../shared/kiGrenzen'
import { HILFETEXT, kriseMelden, kriseVerdacht } from './krise'
// Budget der Lehrkraft (22.10.2026; Abgleich mit kiNutzung.ts durch die Hauptsitzung)
import { budgetErschoepft, fremdNutzungBuchen } from './kiNutzung'
import { nurTag } from './ohneUhrzeit'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sprech_freigaben (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL,
  vok_id TEXT NOT NULL,
  lerngruppe_id TEXT NOT NULL DEFAULT '',
  schueler TEXT NOT NULL DEFAULT '[]',
  teile TEXT NOT NULL,
  bis INTEGER NOT NULL,
  einstellungen TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'offen',
  erstellt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sprech_stand (
  freigabe_id TEXT NOT NULL,
  schueler_id TEXT NOT NULL,
  daten TEXT NOT NULL,
  aktualisiert INTEGER NOT NULL,
  PRIMARY KEY (freigabe_id, schueler_id)
);
CREATE TABLE IF NOT EXISTS sprech_vorfaelle (
  id TEXT PRIMARY KEY,
  freigabe_id TEXT NOT NULL,
  schueler_id TEXT NOT NULL,
  art TEXT NOT NULL,
  satz TEXT NOT NULL DEFAULT '',
  zeit INTEGER NOT NULL
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

const json_ = <T>(s: unknown, leer: T): T => {
  try {
    return s ? (JSON.parse(String(s)) as T) : leer
  } catch {
    return leer
  }
}

const SPRACHEN: SprechSprache[] = ['en', 'fr', 'es']
const TAG = 86_400_000
export const VORFAELLE_BIS_SPERRE = 3
export const VORFALL_TAGE = 14

interface FreigabeZeile {
  id: string
  lehrkraft_id: string
  vok_id: string
  lerngruppe_id: string
  schueler: string
  teile: string
  bis: number
  einstellungen: string
  status: string
  erstellt: string
}

export interface SprechEinstellungen {
  minutenWoche: number
  niveau?: Niveau
  nurSchulzeit: boolean
  /** Vorgegebene Karten (Pool-Kennungen); leer = die App wählt */
  karten?: string[]
}

export interface Uebung {
  zeit: number
  teil: Teil
  modus: 'ueben' | 'pruefung'
  minuten: number
  wertung: Partial<Record<KriteriumId, number>>
  punkte: number
  staerke: string
  tipps: Einschaetzung['tipps']
  proaktiv?: string
  ausspracheUnsicher: boolean
  /** Sitzung, aus der die Minuten stammen (22.10.2026): /ende ersetzt den beim Abrechnen angelegten Eintrag */
  sitzung?: string
}

interface StandDaten {
  uebungen: Uebung[]
  gesperrt?: boolean
}

// ---------------------------------------------------------------- Freigaben

function freigabe(id: string): FreigabeZeile | null {
  return (db().prepare('SELECT * FROM sprech_freigaben WHERE id = ?').get(id) as FreigabeZeile | undefined) ?? null
}

const einstellungenVon = (f: FreigabeZeile): SprechEinstellungen => ({ minutenWoche: 30, nurSchulzeit: true, ...json_<Partial<SprechEinstellungen>>(f.einstellungen, {}) })
const teileVon = (f: FreigabeZeile): Teil[] => json_<Teil[]>(f.teile, []).filter((t) => TEILE.includes(t))

/** Laufend und für diese Person? */
export function sprechIstFuer(f: FreigabeZeile, ich: NutzerInfo, jetzt = Date.now()): boolean {
  if (ich.rolle !== 'schueler' || f.status !== 'offen' || f.bis < jetzt) return false
  const vok = vokZeile(f.vok_id)
  if (!vok || !vokIstFuer(vok, ich)) return false
  const nur = json_<string[]>(f.schueler, [])
  return !nur.length || nur.includes(ich.benutzer)
}

function sprachUndJahrgang(f: FreigabeZeile): { sprache: SprechSprache; jahrgang: number | null } {
  const vok = vokZeile(f.vok_id)
  const sprache = (SPRACHEN.includes((vok?.sprache ?? '') as SprechSprache) ? vok!.sprache : 'en') as SprechSprache
  const g = f.lerngruppe_id ? lerngruppe(f.lerngruppe_id) : null
  return { sprache, jahrgang: g ? jahrgangDerGruppe(g) : null }
}

function niveauVon(f: FreigabeZeile): Niveau {
  const e = einstellungenVon(f)
  if (e.niveau && NIVEAUS.includes(e.niveau)) return e.niveau
  const { sprache, jahrgang } = sprachUndJahrgang(f)
  // Schulform der Lehrkraft (24.10.2026): andere Schulformen erreichen die Niveaus später
  return zielNiveau(sprache, jahrgang, schulOrtVon(f.lehrkraft_id).schulform)
}

// ---------------------------------------------------------------- Stand und Vorfälle

function standVon(fid: string, sid: string): StandDaten {
  const z = db().prepare('SELECT daten FROM sprech_stand WHERE freigabe_id = ? AND schueler_id = ?').get(fid, sid) as { daten: string } | undefined
  return json_<StandDaten>(z?.daten, { uebungen: [] })
}

function standSpeichern(fid: string, sid: string, d: StandDaten): void {
  db()
    .prepare('INSERT OR REPLACE INTO sprech_stand (freigabe_id, schueler_id, daten, aktualisiert) VALUES (?, ?, ?, ?)')
    .run(fid, sid, JSON.stringify({ ...d, uebungen: d.uebungen.slice(-60) }), Date.now())
}

/** Minuten in der laufenden Woche (ab Montag) */
export function minutenDieseWoche(u: Uebung[], jetzt = Date.now()): number {
  const d = new Date(jetzt)
  const montag = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime()
  return u.filter((x) => x.zeit >= montag).reduce((s, x) => s + x.minuten, 0)
}

/** Minuten heute (ab Mitternacht) */
export function minutenHeute(u: Uebung[], jetzt = Date.now()): number {
  const d = new Date(jetzt)
  const mitternacht = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return u.filter((x) => x.zeit >= mitternacht).reduce((s, x) => s + x.minuten, 0)
}

/** Tagesgrenze je Freigabe (22.10.2026) – Faustregel: halbe Wochengrenze, aufgerundet */
export const tagesGrenze = (minutenWoche: number): number => Math.ceil(minutenWoche / 2)

/** Restminuten: das Kleinere aus Wochen- und Tagesrest */
export function restMinuten(minutenWoche: number, u: Uebung[], jetzt = Date.now()): { woche: number; tag: number; rest: number } {
  const woche = minutenWoche - minutenDieseWoche(u, jetzt)
  const tag = tagesGrenze(minutenWoche) - minutenHeute(u, jetzt)
  return { woche, tag, rest: Math.max(0, Math.min(woche, tag)) }
}

function vorfaelleAufraeumen(jetzt = Date.now()): void {
  db().prepare('DELETE FROM sprech_vorfaelle WHERE zeit < ?').run(jetzt - VORFALL_TAGE * TAG)
}

export function vorfallMerken(fid: string, sid: string, art: string, satz: string, jetzt = Date.now()): { gesperrt: boolean } {
  vorfaelleAufraeumen(jetzt)
  db()
    .prepare('INSERT INTO sprech_vorfaelle (id, freigabe_id, schueler_id, art, satz, zeit) VALUES (?, ?, ?, ?, ?, ?)')
    .run(`v${randomBytes(8).toString('hex')}`, fid, sid, art.slice(0, 30), satz.slice(0, 300), jetzt)
  const n = Number((db().prepare('SELECT COUNT(*) AS n FROM sprech_vorfaelle WHERE freigabe_id = ? AND schueler_id = ?').get(fid, sid) as { n: number }).n)
  if (n >= VORFAELLE_BIS_SPERRE) {
    const st = standVon(fid, sid)
    standSpeichern(fid, sid, { ...st, gesperrt: true })
    return { gesperrt: true }
  }
  return { gesperrt: false }
}

// ---------------------------------------------------------------- Gesprächs-KI der Lehrkraft

function lehrkraftVon(id: string): NutzerInfo | undefined {
  return alleNutzer().find((n) => n.id === id)
}

/** Gesprächs-KI eingerichtet (eigener Schlüssel oder Schulschlüssel)? */
export function gespraechVerfuegbar(lehrkraftId: string): boolean {
  if (process.env.SCHULAPPS_KI_ATTRAPPE) return true
  const n = lehrkraftVon(lehrkraftId)
  if (!n) return false
  return imNutzer(alsNutzer(n), () => {
    const g = getSettings().ai.gespraech
    return g?.anbieter === 'openai' && Boolean(getSecret('openai'))
  })
}

function schluesselUndModell(lehrkraftId: string, teil: Teil): { key: string; modell: string; schule: boolean } | null {
  const n = lehrkraftVon(lehrkraftId)
  if (!n) return null
  return imNutzer(alsNutzer(n), () => {
    const g = getSettings().ai.gespraech
    const key = getSecret('openai')
    if (g?.anbieter !== 'openai' || !key) return null
    const gross = g.modell === 'gross' || (teil === 'simulation' && g.simulationGross)
    // schule: läuft über den freigegebenen Schlüssel der Schule – nur dann zählt es zum Budget (22.10.2026, kiNutzung.ts)
    return { key, modell: gross ? 'gpt-realtime' : 'gpt-realtime-mini', schule: !hatEigenesGeheimnis('openai') }
  })
}

const STIMME: Record<SprechSprache, string> = { en: 'marin', fr: 'marin', es: 'marin' }

// ---------------------------------------------------------------- Sitzungen (nur im Speicher)

export interface Sitzung {
  id: string
  freigabeId: string
  schuelerId: string
  lehrkraftId: string
  teil: Teil
  modus: 'ueben' | 'pruefung'
  sprache: SprechSprache
  niveau: Niveau
  start: number
  maxMs: number
  anweisungen: string
  /** Ortsangabe für einen Krisenhinweis, ohne Inhalt („Sprechtraining (Englisch)“) */
  quelle: string
  transkript: TranskriptZeile[]
  themenfremd: number
  beendet: boolean
  grund?: string
  attrappe: boolean
  /** Festgelegte Sitzung, gegen die der Kontrollkanal prüft */
  fest?: FesteSitzung
  /** Krise erkannt: nie Vorfall, Hilfetext beim Ende */
  krise?: boolean
  /** Minuten gebucht (einmal je Sitzung) */
  abgerechnet?: boolean
  endeZeit?: number
  dauerMs?: number
  callId?: string
  key?: string
  /** Über den Schlüssel der Schule – nur dann wird aufs Budget gebucht (22.10.2026) */
  schule?: boolean
  /** Antworten nur mit Anlass (kontrolle.ts › antwortKonto) */
  konto?: AntwortKonto
  /** Senden über den Kontrollkanal (gesetzt, sobald er offen ist) */
  senden?: (x: unknown) => void
  /** Gesprächsbeginn: der Browser ist bereit („los“), der Server stößt die erste Antwort an */
  los?: 'wartet' | 'gesendet'
  ws?: WebSocket
  uhr?: ReturnType<typeof setTimeout>
}

const sitzungen = new Map<string, Sitzung>()

/** Tokengrenze je Antwort der Gesprächs-KI – Faustregel: reicht für gut eine Minute Sprechen */
export const MAX_ANTWORT_TOKENS = 1500
/** So lange bleibt eine beendete Sitzung für /ende im Speicher (Faustregel) */
export const NACHLAUF_MS = 10 * 60_000

/** Festgelegte Sitzung (Anmeldung und Zurücksetzen): nur Audio-Ausgabe, Transkription an, ein Werkzeug */
export function festeSitzung(anweisungenText: string, sprache: SprechSprache): FesteSitzung & { tools: (typeof WERKZEUG_BEENDEN)[] } {
  return {
    instructions: anweisungenText,
    output_modalities: ['audio'],
    max_output_tokens: MAX_ANTWORT_TOKENS,
    audio: {
      input: { transcription: { model: 'gpt-4o-mini-transcribe', language: sprache }, turn_detection: { type: 'semantic_vad', eagerness: 'low' } },
      output: { voice: STIMME[sprache] }
    },
    tools: [WERKZEUG_BEENDEN],
    tool_choice: 'auto'
  }
}

/** Laufende Sitzungen einer Person beenden (höchstens eine je Kind – eine neue beendet die alte) */
export function laufendeBeenden(schuelerId: string, jetzt = Date.now()): number {
  let n = 0
  for (const s of sitzungen.values())
    if (s.schuelerId === schuelerId && !s.beendet) {
      void beenden(s, 'neu', jetzt)
      n++
    }
  return n
}

let aufraeumUhr: ReturnType<typeof setInterval> | undefined

/** Neue Sitzung anmelden: alte der Person beenden, Uhr stellen, Aufräumen starten */
export function sitzungAnlegen(p: Omit<Sitzung, 'id' | 'transkript' | 'themenfremd' | 'beendet'>): Sitzung {
  laufendeBeenden(p.schuelerId, p.start)
  const s: Sitzung = { ...p, id: `t${randomBytes(10).toString('hex')}`, transkript: [], themenfremd: 0, beendet: false }
  sitzungen.set(s.id, s)
  s.uhr = setTimeout(() => void beenden(s, 'zeit'), s.maxMs + 15000)
  s.uhr.unref?.()
  if (!aufraeumUhr) {
    aufraeumUhr = setInterval(() => sitzungenAufraeumen(), 60_000)
    aufraeumUhr.unref?.()
  }
  return s
}

/** Sitzung, die nie zustande kam (Anmeldung beim Anbieter fehlgeschlagen): nichts buchen */
function verwerfen(s: Sitzung): void {
  if (s.uhr) clearTimeout(s.uhr)
  s.beendet = true
  s.abgerechnet = true
  sitzungen.delete(s.id)
}

export const sitzungVon = (id: string): Sitzung | undefined => sitzungen.get(id)

/**
 * Verwaiste Sitzungen aufräumen (jede Minute): über die Zeit hinaus offen → beenden (bucht die Minuten);
 * beendet und ohne /ende → nach dem Nachlauf aus dem Speicher.
 */
export function sitzungenAufraeumen(jetzt = Date.now()): void {
  for (const s of [...sitzungen.values()]) {
    if (!s.beendet && jetzt > s.start + s.maxMs + 60_000) void beenden(s, 'zeit', jetzt)
    else if (s.beendet && jetzt - (s.endeZeit ?? jetzt) > NACHLAUF_MS) {
      s.transkript = []
      sitzungen.delete(s.id)
    }
  }
}

/**
 * Minuten buchen – genau einmal je Sitzung, egal wie sie endet. Legt einen Eintrag ohne Wertung an; /ende ersetzt ihn
 * durch die Einschätzung. Die Dauer ist auf die erlaubte Zeit (+15 s) begrenzt.
 */
export function abrechnen(s: Sitzung, jetzt = Date.now()): number {
  if (s.abgerechnet) return 0
  s.abgerechnet = true
  s.endeZeit = jetzt
  const dauerMs = Math.max(0, Math.min(jetzt, s.start + s.maxMs + 15000) - s.start)
  s.dauerMs = dauerMs
  const minuten = Math.max(1, Math.round(dauerMs / 60000))
  const st = standVon(s.freigabeId, s.schuelerId)
  standSpeichern(s.freigabeId, s.schuelerId, {
    ...st,
    uebungen: [...st.uebungen, { zeit: jetzt, teil: s.teil, modus: s.modus, minuten, wertung: {}, punkte: 0, staerke: '', tipps: [], ausspracheUnsicher: true, sitzung: s.id }]
  })
  if (!s.attrappe && s.schule) fremdNutzungBuchen({ nutzerId: s.lehrkraftId, anbieter: 'openai', art: 'realtime', sekunden: Math.round(dauerMs / 1000) })
  return minuten
}

/**
 * Karten für eine Übung: zuerst aus dem Pool der Schule für Sprache und Jahrgang (App „Sprechprüfungen",
 * sprechBank.ts; vorgegebene Karten der Freigabe zuerst), sonst der eingebaute Grundbestand der Stufe.
 */
function karteWaehlen(sprache: SprechSprache, niveau: Niveau, teil: Teil, jahrgang: number | null, vorgabe: string[] = []): SprechKarte[] {
  const stufe = stufeVonNiveau(niveau)
  const pool = jahrgang ? bankKarten(sprache, jahrgang).map((b) => b.karte) : []
  const gewaehlt = vorgabe.length ? pool.filter((k) => vorgabe.includes(k.id)) : []
  const eingebaut = (GRUNDKARTEN[sprache]?.[stufe] ?? (sprache === 'en' ? GRUNDKARTEN.en?.A2 : []) ?? []).map((k) => karteBereinigt(k, k.id)).filter((k): k is SprechKarte => Boolean(k))
  const grund = gewaehlt.length ? gewaehlt : pool.length ? [...pool, ...eingebaut.filter((k) => !pool.some((p) => p.art === k.art))] : eingebaut
  const zufall = <T>(l: T[]): T[] => (l.length ? [l[Math.floor(Math.random() * l.length)]] : [])
  if (teil === 'simulation') return [...zufall(grund.filter((k) => k.art === 'interview')), ...zufall(grund.filter((k) => k.art === 'monolog')), ...zufall(grund.filter((k) => k.art === 'dialog'))]
  return zufall(grund.filter((k) => k.art === teil))
}

/** Für die Anzeige im Browser: was die/der Lernende auf der Karte sieht (keine Prüferfragen) */
function karteFuerAnzeige(k: SprechKarte): Record<string, unknown> {
  if (k.art === 'interview') return { art: k.art, thema: k.thema }
  if (k.art === 'monolog') return { art: k.art, titel: k.titel, bilder: k.bilder, leitfragen: k.leitfragen }
  return { art: k.art, titel: k.titel, situation: k.situation, rolle: k.rolleSchueler, punkte: k.punkte, ziel: k.ziel }
}

export async function beenden(s: Sitzung, grund: string, jetzt = Date.now()): Promise<void> {
  if (s.beendet) return
  s.beendet = true
  s.grund = grund
  if (s.uhr) clearTimeout(s.uhr)
  // Minuten sofort buchen – auch wenn der Browser /ende nie aufruft
  abrechnen(s, jetzt)
  try {
    s.ws?.close()
  } catch {
    /* schon zu */
  }
  if (s.callId && s.key)
    await fetch(`https://api.openai.com/v1/realtime/calls/${encodeURIComponent(s.callId)}/hangup`, { method: 'POST', headers: { Authorization: `Bearer ${s.key}` } }).catch(
      () => undefined
    )
}

/**
 * Krise erkannt (22.10.2026, Entscheidung der Lehrkraft): NIE ein Vorfall, nie eine Sperre. Vertraulicher Hinweis an die
 * Lehrkraft ohne Wortlaut; die Übung endet sanft – mit KI nach einer kurzen Pause, damit die freundliche Antwort noch
 * zu hören ist (Faustregel 8 s); das Kind sieht beim Ende den festen Hilfetext.
 */
export function kriseErkannt(s: Sitzung): void {
  if (s.krise) return
  s.krise = true
  kriseMelden(s.lehrkraftId, s.schuelerId, s.quelle)
  if (s.attrappe || !s.key) void beenden(s, 'krise')
  else setTimeout(() => void beenden(s, 'krise'), 8000).unref?.()
}

/** Äußerung der/des Lernenden prüfen: Krise zuerst (nie Vorfall), dann Umgehung (2. Mal = Ende) und Moderation */
export async function schuelerSagt(s: Sitzung, text: string): Promise<void> {
  const t = text.trim()
  if (!t || s.krise || s.beendet) return
  s.transkript.push({ rolle: 'schueler', text: t.slice(0, 1000) })
  if (kriseVerdacht(t)) return kriseErkannt(s)
  if (istUmgehung(t)) {
    s.themenfremd++
    if (s.themenfremd >= 2) {
      vorfallMerken(s.freigabeId, s.schuelerId, 'umgehung', t)
      await beenden(s, 'themenfremd')
    }
  }
  // Inhaltsfilter (Text, ohne Speicherung): Moderation des Anbieters, Kategorien getrennt ausgewertet
  if (s.key && !s.beendet) {
    if (s.schule) fremdNutzungBuchen({ nutzerId: s.lehrkraftId, anbieter: 'openai', art: 'moderation', zeichen: t.length })
    const r = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: t })
    })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null)
    const urteil = moderationsUrteil(r)
    if (urteil === 'krise') kriseErkannt(s)
    else if (urteil === 'unangemessen' && !s.krise && !s.beendet) {
      vorfallMerken(s.freigabeId, s.schuelerId, 'unangemessen', t)
      await beenden(s, 'unangemessen')
    }
  }
}

/** Werkzeug `uebung_beenden` der KI: „hilfe“ (oder ein Krisensatz) ist eine Krise, kein Vorfall */
export function werkzeugBeenden(s: Sitzung, argumente: unknown): void {
  const a = json_<{ grund?: string; satz?: string }>(argumente, {})
  if (s.krise) return
  if (a.grund === 'hilfe' || kriseVerdacht(a.satz)) return kriseErkannt(s)
  if (a.grund === 'themenfremd' || a.grund === 'unangemessen') vorfallMerken(s.freigabeId, s.schuelerId, a.grund, a.satz ?? '')
  setTimeout(() => void beenden(s, a.grund === 'themenfremd' || a.grund === 'unangemessen' ? a.grund : 'fertig'), 4000).unref?.()
}

/** Erste Antwort durch den Server (nie durch den Browser) – mit Anlass im Antwortkonto */
export function gespraechBeginnen(s: Sitzung): void {
  if (s.beendet || s.los === 'gesendet') return
  if (!s.senden) {
    s.los = 'wartet'
    return
  }
  s.los = 'gesendet'
  s.konto = { guthaben: (s.konto?.guthaben ?? 0) + 1, fremd: s.konto?.fremd ?? 0 }
  s.senden({ type: 'response.create' })
}

/** Ausgabe der KI moderieren: Unangemessenes beendet die Übung – ohne Vorfall für das Kind (es hat es nicht gesagt) */
async function kiSagt(s: Sitzung, text: string): Promise<void> {
  const t = text.trim()
  s.transkript.push({ rolle: 'ki', text: t.slice(0, 1000) })
  if (!t || !s.key || s.beendet) return
  if (s.schule) fremdNutzungBuchen({ nutzerId: s.lehrkraftId, anbieter: 'openai', art: 'moderation', zeichen: t.length })
  const r = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: t })
  })
    .then((x) => (x.ok ? x.json() : null))
    .catch(() => null)
  if (moderationsUrteil(r) && !s.beendet) {
    protokolliereServer('sprechen', 'Ausgabe der Gesprächs-KI von der Moderation beanstandet – Übung beendet', s.schuelerId)
    await beenden(s, 'unangemessen')
  }
}

/** Kontrollkanal-Ereignis anwenden (Entscheidung: shared/sprechen/kontrolle.ts) */
export function kontrollAnwenden(s: Sitzung, e: unknown, senden: (x: unknown) => void): void {
  if (!s.fest || s.beendet) return
  // Antworten nur mit Anlass (22.10.2026): sonst hat der Browser sie angestoßen
  const ak = antwortKonto(s.konto ?? { guthaben: 0, fremd: 0 }, e)
  s.konto = ak.konto
  if (ak.entscheidung !== 'ok') {
    if (ak.antwortId) senden({ type: 'response.cancel', response_id: ak.antwortId })
    else senden({ type: 'response.cancel' })
    protokolliereServer('sprechen', `Kontrollkanal: Antwort ohne Anlass ${ak.entscheidung === 'auflegen' ? '– aufgelegt' : 'abgebrochen'}`, s.schuelerId)
    if (ak.entscheidung === 'auflegen') {
      vorfallMerken(s.freigabeId, s.schuelerId, 'manipulation', '')
      void beenden(s, 'manipulation')
    }
    return
  }
  const d = kontrollEreignis(e, s.fest)
  if (d.art === 'ok') return
  const typ = String((e as { type?: unknown })?.type ?? '')
  protokolliereServer('sprechen', `Kontrollkanal: ${d.art} (${d.felder.join(', ')})`, s.schuelerId)
  if (d.art === 'auflegen') {
    if (d.antwortId) senden({ type: 'response.cancel', response_id: d.antwortId })
    vorfallMerken(s.freigabeId, s.schuelerId, 'manipulation', '')
    void beenden(s, 'manipulation')
    return
  }
  // Zurücksetzen auf die festgelegte Fassung; beim ersten Stand (session.created) ohne Vorfall
  senden({ type: 'session.update', session: { type: 'realtime', ...s.fest } })
  if (typ === 'session.created') return
  const { gesperrt } = vorfallMerken(s.freigabeId, s.schuelerId, 'manipulation', '')
  if (gesperrt) void beenden(s, 'manipulation')
}

/** Kontrollkanal: jedes Ereignis prüfen, Transkript mitlesen, Werkzeugaufruf und Ende */
function kontrollkanal(s: Sitzung): void {
  if (!s.callId || !s.key) return
  const url = `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(s.callId)}`
  // Node (undici) nimmt Kopfzeilen als zweites Argument; der Schlüssel bleibt am Server
  const WS = WebSocket as unknown as new (u: string, o: unknown) => WebSocket
  const ws = new WS(url, { headers: { Authorization: `Bearer ${s.key}` } })
  s.ws = ws
  const senden = (x: unknown): void => {
    if (ws.readyState === 1) ws.send(JSON.stringify(x))
  }
  ws.addEventListener('open', () => {
    s.senden = senden
    // Der Browser war schon bereit: jetzt die erste Antwort anstoßen
    if (s.los === 'wartet') gespraechBeginnen(s)
  })
  ws.addEventListener('message', (ev: MessageEvent) => {
    let e: { type?: string; transcript?: string; name?: string; arguments?: string }
    try {
      e = JSON.parse(String(ev.data))
    } catch {
      return
    }
    const typ = e.type ?? ''
    // Anlässe für Antworten (abgeschlossene Äußerung) vor dem Verwerfen der Audio-Ereignisse zählen
    if (typ === 'input_audio_buffer.committed' || typ === 'input_audio_buffer.timeout_triggered') return kontrollAnwenden(s, e, senden)
    // Audio-Ereignisse ungelesen verwerfen
    if (typ.includes('audio') && !typ.includes('transcript') && !typ.includes('transcription')) return
    // Jedes andere Ereignis gegen die festgelegte Sitzung prüfen (22.10.2026, KI-Sicherheitsprüfung)
    kontrollAnwenden(s, e, senden)
    if (s.beendet) return
    if (typ === 'conversation.item.input_audio_transcription.completed' && e.transcript) void schuelerSagt(s, e.transcript)
    else if ((typ === 'response.output_audio_transcript.done' || typ === 'response.audio_transcript.done') && e.transcript) void kiSagt(s, e.transcript)
    else if (typ === 'response.function_call_arguments.done' && e.name === 'uebung_beenden') werkzeugBeenden(s, e.arguments)
  })
}

// ---------------------------------------------------------------- Lernende: Übersicht

interface MeineFreigabe {
  id: string
  fach: string
  sprache: SprechSprache
  teile: Teil[]
  bis: number
  niveau: Niveau
  jahrgang: number | null
  minutenRest: number
  gesperrt: boolean
  uebungen: Uebung[]
}

export function meineFreigaben(ich: NutzerInfo, jetzt = Date.now()): MeineFreigabe[] {
  const alle = db().prepare("SELECT * FROM sprech_freigaben WHERE status = 'offen' AND bis > ?").all(jetzt) as unknown as FreigabeZeile[]
  return alle
    .filter((f) => sprechIstFuer(f, ich, jetzt))
    .map((f) => {
      const st = standVon(f.id, ich.id)
      const e = einstellungenVon(f)
      const { sprache, jahrgang } = sprachUndJahrgang(f)
      return {
        id: f.id,
        fach: vokZeile(f.vok_id)?.fach ?? '',
        sprache,
        teile: teileVon(f),
        bis: f.bis,
        niveau: niveauVon(f),
        jahrgang,
        // Wochen- und Tagesgrenze (22.10.2026)
        minutenRest: restMinuten(e.minutenWoche, st.uebungen, jetzt).rest,
        gesperrt: Boolean(st.gesperrt),
        uebungen: st.uebungen
      }
    })
}

// ---------------------------------------------------------------- Lehrkraft: Überblick

/*
 * Übung, wie die Lehrkraft sie sieht (23.10.2026, Nachprüfung des Schulträgers, LfD-Eckpunkte):
 * Werte, Tipps und das DATUM der Übung – keine Uhrzeit, keine Minuten, keine Sitzungskennung.
 */
export type LehrUebung = Omit<Uebung, 'zeit' | 'minuten' | 'sitzung'> & { datum: string }

export function fuerLehrkraft(u: Uebung): LehrUebung {
  const { zeit, minuten: _m, sitzung: _s, ...rest } = u
  return { ...rest, datum: nurTag(zeit) }
}

export function ueberblick(vokId: string, lehrkraftId: string, jetzt = Date.now()) {
  const zeilen = db().prepare('SELECT * FROM sprech_freigaben WHERE vok_id = ? AND lehrkraft_id = ? ORDER BY erstellt DESC').all(vokId, lehrkraftId) as unknown as FreigabeZeile[]
  const freigaben = zeilen.map(
    (f) => ({ id: f.id, teile: teileVon(f), bis: f.bis, status: f.bis < jetzt ? 'abgelaufen' : f.status, einstellungen: einstellungenVon(f), schueler: json_<string[]>(f.schueler, []), erstellt: f.erstellt, niveau: niveauVon(f) })
  )
  vorfaelleAufraeumen()
  const namen = new Map(alleNutzer().map((n) => [n.id, n.name || n.benutzer] as const))
  const personen = new Map<
    string,
    { id: string; name: string; uebungen: Uebung[]; gesperrt: boolean; kontingentErreicht: boolean; vorfaelle: { art: string; satz: string; datum: string; freigabe: string }[] }
  >()
  const neu = (id: string) => ({ id, name: namen.get(id) ?? '?', uebungen: [] as Uebung[], gesperrt: false, kontingentErreicht: false, vorfaelle: [] as { art: string; satz: string; datum: string; freigabe: string }[] })
  for (const f of zeilen) {
    const e = einstellungenVon(f)
    const laeuft = f.status === 'offen' && f.bis >= jetzt
    for (const z of db().prepare('SELECT schueler_id, daten FROM sprech_stand WHERE freigabe_id = ?').all(f.id) as { schueler_id: string; daten: string }[]) {
      const d = json_<StandDaten>(z.daten, { uebungen: [] })
      const p = personen.get(z.schueler_id) ?? neu(z.schueler_id)
      p.uebungen.push(...d.uebungen)
      p.gesperrt = p.gesperrt || Boolean(d.gesperrt)
      // Wochenminuten nur als „Kontingent erreicht ja/nein" (23.10.2026)
      if (laeuft && restMinuten(e.minutenWoche, d.uebungen, jetzt).woche <= 0) p.kontingentErreicht = true
      personen.set(z.schueler_id, p)
    }
    for (const v of db().prepare('SELECT schueler_id, art, satz, zeit FROM sprech_vorfaelle WHERE freigabe_id = ? ORDER BY zeit DESC').all(f.id) as {
      schueler_id: string
      art: string
      satz: string
      zeit: number
    }[]) {
      const p = personen.get(v.schueler_id) ?? neu(v.schueler_id)
      p.vorfaelle.push({ art: v.art, satz: v.satz, datum: nurTag(v.zeit), freigabe: f.id })
      personen.set(v.schueler_id, p)
    }
  }
  return {
    freigaben,
    personen: [...personen.values()].map((p) => ({ ...p, uebungen: p.uebungen.sort((a, b) => a.zeit - b.zeit).map(fuerLehrkraft) }))
  }
}

// ---------------------------------------------------------------- Route

export function sprechenRoute(aufruf: Aufruf): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    const lernende = url.pathname === '/s/api/sprechen' || url.pathname.startsWith('/s/api/sprechen/')
    const lehrer = url.pathname === '/server/sprechen' || url.pathname.startsWith('/server/sprechen/')
    if (!lernende && !lehrer) return false
    if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
    const ich = sitzung.nutzer

    // ---------- Lehrkraft
    if (lehrer) {
      if (ich.rolle === 'schueler') return json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true
      // Reiter nur mit Gesprächs-KI (eigener Schlüssel oder Schulschlüssel)
      if (req.method === 'GET' && url.pathname === '/server/sprechen/verfuegbar') return json(res, 200, { verfuegbar: gespraechVerfuegbar(ich.id) }), true
      if (req.method === 'GET' && url.pathname === '/server/sprechen') {
        const vokId = String(url.searchParams.get('kurs') ?? '')
        const vok = vokZeile(vokId)
        if (!vok || vok.lehrkraft_id !== ich.id) return json(res, 404, { fehler: 'Unbekannter Kurs.' }), true
        const g = vok.lerngruppe_id ? lerngruppe(vok.lerngruppe_id) : null
        return json(res, 200, { verfuegbar: gespraechVerfuegbar(ich.id), sprache: vok.sprache, jahrgang: g ? jahrgangDerGruppe(g) : null, ...ueberblick(vokId, ich.id) }), true
      }
      if (req.method !== 'POST' || typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nicht erlaubt.' }), true
      const k0 = (await k.koerper()) as Record<string, unknown>
      const teile = url.pathname.split('/').filter(Boolean).slice(2)
      if (teile[0] === 'freigeben') {
        const vok = vokZeile(String(k0.kurs ?? ''))
        if (!vok || vok.lehrkraft_id !== ich.id) return json(res, 404, { fehler: 'Unbekannter Kurs.' }), true
        if (!SPRACHEN.includes(vok.sprache as SprechSprache)) return json(res, 400, { fehler: 'Das Sprechtraining gibt es für Englisch, Französisch und Spanisch.' }), true
        const t = (Array.isArray(k0.teile) ? k0.teile : []).map(String).filter((x): x is Teil => TEILE.includes(x as Teil))
        if (!t.length) return json(res, 400, { fehler: 'Bitte mindestens einen Teil wählen.' }), true
        const tage = Math.max(1, Math.min(90, Math.round(Number(k0.tage) || 14)))
        const e: SprechEinstellungen = {
          minutenWoche: Math.max(5, Math.min(300, Math.round(Number(k0.minutenWoche) || 30))),
          nurSchulzeit: k0.nurSchulzeit !== false,
          ...(NIVEAUS.includes(k0.niveau as Niveau) ? { niveau: k0.niveau as Niveau } : {}),
          // Vorgegebene Karten aus dem Pool (App „Sprechprüfungen")
          ...(Array.isArray(k0.karten) && k0.karten.length ? { karten: (k0.karten as unknown[]).map(String).filter((x) => /^k[a-f0-9]{16}$/.test(x)).slice(0, 40) } : {})
        }
        const schueler = (Array.isArray(k0.schueler) ? k0.schueler : []).map(String).slice(0, 200)
        const id = `s${randomBytes(8).toString('hex')}`
        db()
          .prepare('INSERT INTO sprech_freigaben (id, lehrkraft_id, vok_id, lerngruppe_id, schueler, teile, bis, einstellungen, status, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, ich.id, vok.id, vok.lerngruppe_id ?? '', JSON.stringify(schueler), JSON.stringify(t), Date.now() + tage * TAG, JSON.stringify(e), 'offen', new Date().toISOString())
        protokolliereServer('sprechen', `Sprechtraining freigegeben (${t.join(', ')}, ${tage} Tage)`, ich.id)
        return json(res, 200, { id }), true
      }
      const f = freigabe(teile[0] ?? '')
      if (!f || f.lehrkraft_id !== ich.id) return json(res, 404, { fehler: 'Unbekannte Freigabe.' }), true
      if (teile[1] === 'beenden') return db().prepare("UPDATE sprech_freigaben SET status = 'beendet' WHERE id = ?").run(f.id), json(res, 200, { ok: true }), true
      if (teile[1] === 'entsperren') {
        // Für alle Freigaben dieses Kurses (die Sperre gilt der Person, nicht einer einzelnen Freigabe)
        const sid = String(k0.schueler ?? '')
        for (const x of db().prepare('SELECT id FROM sprech_freigaben WHERE vok_id = ? AND lehrkraft_id = ?').all(f.vok_id, ich.id) as { id: string }[]) {
          const st = standVon(x.id, sid)
          if (st.gesperrt) standSpeichern(x.id, sid, { ...st, gesperrt: false })
          db().prepare('DELETE FROM sprech_vorfaelle WHERE freigabe_id = ? AND schueler_id = ?').run(x.id, sid)
        }
        return json(res, 200, { ok: true }), true
      }
      return json(res, 404, { fehler: 'Unbekannt.' }), true
    }

    // ---------- Lernende
    if (req.method === 'GET' && url.pathname === '/s/api/sprechen') return json(res, 200, { freigaben: meineFreigaben(ich) }), true
    if (req.method === 'GET' && url.pathname === '/s/api/sprechen/status') {
      const s = sitzungen.get(String(url.searchParams.get('sitzung') ?? ''))
      if (!s || s.schuelerId !== ich.id) return json(res, 404, { fehler: 'Unbekannte Sitzung.' }), true
      return json(res, 200, { beendet: s.beendet, grund: s.grund ?? null }), true
    }
    if (req.method !== 'POST') return json(res, 405, { fehler: 'Nicht erlaubt.' }), true
    const k0 = (await k.koerper()) as Record<string, unknown>

    if (url.pathname === '/s/api/sprechen/start') {
      const f = freigabe(String(k0.freigabe ?? ''))
      const jetzt = Date.now()
      if (!f || !sprechIstFuer(f, ich, jetzt)) return json(res, 404, { fehler: 'Dieses Sprechtraining ist nicht (mehr) für dich freigegeben.' }), true
      const teil = String(k0.teil ?? '') as Teil
      if (!teileVon(f).includes(teil)) return json(res, 400, { fehler: 'Dieser Teil ist nicht freigegeben.' }), true
      const attrappe = Boolean(process.env.SCHULAPPS_KI_ATTRAPPE)
      // Hartes Budget der Lehrkraft (22.10.2026): erschöpft → keine neue Übung
      if (!attrappe && budgetErschoepft(f.lehrkraft_id)) return json(res, 403, { fehler: 'Das Sprechtraining ist gerade nicht möglich – das KI-Kontingent deiner Lehrkraft ist aufgebraucht.' }), true
      // Höchstens eine laufende Sitzung je Kind: die alte endet (und wird abgerechnet), bevor der Rest berechnet wird
      laufendeBeenden(ich.id, jetzt)
      const e = einstellungenVon(f)
      const st = standVon(f.id, ich.id)
      if (st.gesperrt) return json(res, 403, { fehler: 'Das Sprechtraining ist für dich gesperrt. Bitte sprich mit deiner Lehrkraft.' }), true
      const stunde = new Date(jetzt).getHours()
      if (e.nurSchulzeit && (stunde < 7 || stunde >= 21)) return json(res, 403, { fehler: 'Das Sprechtraining geht zwischen 7 und 21 Uhr.' }), true
      const r0 = restMinuten(e.minutenWoche, st.uebungen, jetzt)
      if (r0.woche < 1) return json(res, 403, { fehler: 'Deine Übungszeit für diese Woche ist aufgebraucht.' }), true
      if (r0.tag < 1) return json(res, 403, { fehler: 'Deine Übungszeit für heute ist aufgebraucht. Morgen geht es weiter.' }), true
      const { sprache, jahrgang } = sprachUndJahrgang(f)
      const niveau = niveauVon(f)
      const oberstufe = (jahrgang ?? 0) >= 11
      const minuten = Math.min(r0.rest, hoechstMinuten(teil, niveau, oberstufe))
      const karten = karteWaehlen(sprache, niveau, teil, jahrgang, e.karten ?? [])
      if (!karten.length) return json(res, 409, { fehler: 'Für diesen Teil gibt es noch keine Aufgabenkarten. Bitte die Lehrkraft, welche anzulegen.' }), true
      const modus = teil === 'simulation' || k0.modus === 'pruefung' ? 'pruefung' : 'ueben'
      // Kein Name an den Anbieter (22.10.2026, KI-Sicherheitsprüfung) – die KI spricht neutral an
      const g: Gespraech = { sprache, teil, niveau, modus, karten, minuten }
      const text = anweisungen(g, oberstufe)
      const fest = festeSitzung(text, sprache)
      const s = sitzungAnlegen({
        freigabeId: f.id,
        schuelerId: ich.id,
        lehrkraftId: f.lehrkraft_id,
        teil,
        modus,
        sprache,
        niveau,
        start: jetzt,
        maxMs: minuten * 60000,
        anweisungen: text,
        quelle: `Sprechtraining (${vokZeile(f.vok_id)?.fach || SPRACHNAME[sprache]})`,
        attrappe,
        fest
      })
      const anzeige = { karten: karten.map(karteFuerAnzeige), minuten, niveau, sprache }
      if (s.attrappe) return json(res, 200, { sitzung: s.id, attrappe: true, ...anzeige }), true
      const ks = schluesselUndModell(f.lehrkraft_id, teil)
      if (!ks) return verwerfen(s), json(res, 409, { fehler: 'Die Gesprächs-KI ist nicht eingerichtet.' }), true
      const sdp = String(k0.sdp ?? '')
      if (!sdp.startsWith('v=')) return verwerfen(s), json(res, 400, { fehler: 'Verbindung fehlgeschlagen.' }), true
      s.key = ks.key
      s.schule = ks.schule
      // Festgelegt: Anweisungen, ein Werkzeug, nur Audio-Ausgabe, Tokengrenze je Antwort, Transkription an
      // tracing: null (23.10.2026) – keine Ablauf-Aufzeichnung bei OpenAI; nur bei der Anmeldung, nicht beim Zurücksetzen
      const sitzungKonfig = { type: 'realtime', model: ks.modell, ...fest, tracing: null }
      const form = new FormData()
      form.set('sdp', sdp)
      form.set('session', JSON.stringify(sitzungKonfig))
      const r = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', headers: { Authorization: `Bearer ${ks.key}` }, body: form }).catch(() => null)
      if (!r || !r.ok) {
        verwerfen(s)
        protokolliereServer('sprechen', `Gesprächs-KI lehnt ab (${r?.status ?? 'nicht erreichbar'})`, f.lehrkraft_id)
        return json(res, 502, { fehler: 'Die Gesprächs-KI ist gerade nicht erreichbar.' }), true
      }
      const antwortSdp = await r.text()
      s.callId = (r.headers.get('location') ?? '').split('/').pop() || undefined
      kontrollkanal(s)
      protokolliereServer('sprechen', `Sprechübung gestartet (${teil})`, ich.id)
      return json(res, 200, { sitzung: s.id, sdp: antwortSdp, ...anzeige }), true
    }

    const s = sitzungen.get(String(k0.sitzung ?? ''))
    if (!s || s.schuelerId !== ich.id) return json(res, 404, { fehler: 'Unbekannte Sitzung.' }), true

    // Attrappe (Browsertests): Gespräch ohne KI – die „KI" antwortet mit einer festen Frage
    // Gesprächsbeginn (22.10.2026): der Browser meldet nur „bereit“, die erste Antwort stößt der Server an
    if (url.pathname === '/s/api/sprechen/los') {
      gespraechBeginnen(s)
      return json(res, 200, { ok: true }), true
    }

    if (url.pathname === '/s/api/sprechen/attrappe') {
      if (!s.attrappe) return json(res, 403, { fehler: 'Nicht erlaubt.' }), true
      await schuelerSagt(s, String(k0.text ?? ''))
      if (!s.beendet) s.transkript.push({ rolle: 'ki', text: s.themenfremd ? "Let's get back to our exam. Tell me about your family." : 'That sounds great. Why do you like it?' })
      return json(res, 200, { antwort: s.beendet ? '' : (s.transkript[s.transkript.length - 1]?.text ?? ''), beendet: s.beendet, grund: s.grund ?? null }), true
    }

    if (url.pathname === '/s/api/sprechen/ende') {
      // Beenden bucht die Minuten (falls noch nicht geschehen); danach aus dem Speicher
      await beenden(s, s.grund ?? 'fertig')
      sitzungen.delete(s.id)
      const kn = (k0.kennzahlen ?? {}) as Partial<Kennzahlen>
      const kennzahlen: Kennzahlen = {
        sprechzeitMs: Math.max(0, Math.min(3_600_000, Number(kn.sprechzeitMs) || 0)),
        dauerMs: Math.max(0, Math.min(3_600_000, s.dauerMs ?? Date.now() - s.start)),
        langePausen: Math.max(0, Math.min(500, Math.round(Number(kn.langePausen) || 0)))
      }
      // Krise: nie Vorfall, keine Einschätzung – der feste Hilfetext (Entscheidung der Lehrkraft)
      if (s.krise || s.grund === 'krise') {
        s.transkript = []
        return json(res, 200, { gewertet: false, grund: 'krise', hilfe: HILFETEXT }), true
      }
      // Missbrauch oder zu wenig gesprochen: zählt nicht, keine Einschätzung (die Minuten zählen – schon gebucht)
      const eigene = s.transkript.filter((z) => z.rolle === 'schueler')
      const missbrauch = s.grund === 'themenfremd' || s.grund === 'unangemessen' || s.grund === 'manipulation'
      if (missbrauch || eigene.length < 2) {
        s.transkript = []
        return json(res, 200, { gewertet: false, grund: missbrauch ? (s.grund === 'manipulation' ? 'themenfremd' : s.grund) : 'zu_kurz' }), true
      }
      let ein: Einschaetzung
      if (s.attrappe) ein = ATTRAPPE_EINSCHAETZUNG
      else {
        const lk = lehrkraftVon(s.lehrkraftId)
        if (!lk) return json(res, 500, { fehler: LERNENDEN_FEHLER }), true
        try {
          const roh = await imNutzer(alsNutzer(lk), () =>
            aufruf('ai:structured', [bewertungsAnfrage({ sprache: s.sprache, teil: s.teil, niveau: s.niveau, transkript: s.transkript, kennzahlen })])
          )
          ein = einschaetzungAus(roh, true)
        } catch (e) {
          // Rohe Anbieterfehler nur ins Protokoll (22.10.2026, KI-Sicherheitsprüfung)
          protokolliereServer('sprechen', `Einschätzung fehlgeschlagen (${(e instanceof Error ? e.message : String(e)).slice(0, 200)})`, s.lehrkraftId)
          s.transkript = []
          return json(res, 502, { fehler: kiGrenzeMeldung(e) ?? LERNENDEN_FEHLER }), true
        }
      }
      // Transkript verwerfen – gespeichert werden nur Werte, Kennzahlen und Tipps
      s.transkript = []
      const st = standVon(s.freigabeId, s.schuelerId)
      const gebucht = st.uebungen.find((x) => x.sitzung === s.id)
      const u: Uebung = {
        zeit: gebucht?.zeit ?? Date.now(),
        teil: s.teil,
        modus: s.modus,
        minuten: gebucht?.minuten ?? Math.max(1, Math.round(kennzahlen.dauerMs / 60000)),
        wertung: ein.wertung,
        punkte: punkteVon(ein.wertung),
        staerke: ein.staerke,
        tipps: ein.tipps,
        ...(ein.proaktiv ? { proaktiv: ein.proaktiv } : {}),
        ausspracheUnsicher: ein.ausspracheUnsicher,
        sitzung: s.id
      }
      // Den beim Abrechnen angelegten Eintrag ersetzen (die Minuten zählen nur einmal)
      standSpeichern(s.freigabeId, s.schuelerId, { ...st, uebungen: gebucht ? st.uebungen.map((x) => (x === gebucht ? u : x)) : [...st.uebungen, u] })
      return json(res, 200, { gewertet: true, uebung: u }), true
    }
    return json(res, 404, { fehler: 'Unbekannt.' }), true
  }
}
