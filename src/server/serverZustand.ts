/**
 * Zustand des Servers für den Reiter „Server" der Verwaltung (09.10.2026, Wunsch des Admins: klar, einfach, mit
 * Diagrammen). Bewusst leicht – der Container hat nur 2 GB:
 *
 *  - Messwerte alle 5 Minuten (Last, Arbeitsspeicher von System und Schul-Apps) in `server_messwerte`, nach 8 Tagen
 *    gelöscht (höchstens ~2 300 Zeilen, nur Zahlen).
 *  - Tageszahlen in `server_tage`: Anfragen, langsame Anfragen, Fehler, Summe der Antwortzeiten, Zahl der aktiven
 *    Lehrkräfte und Lernenden. Gezählt wird im Speicher (je Anfrage nur ein Zähler bzw. ein Set.add), geschrieben mit
 *    der Messung. Keine Namen, keine Kennungen in der Tabelle – nur Zahlen je Tag (15 Tage).
 *  - Platz je Bereich (Datenbank, Medienbank, Ablagen, Sicherungen): Ordner höchstens einmal je Stunde asynchron
 *    durchlaufen, höchstens 300 000 Einträge.
 *  - Zertifikat: Ablaufdatum aus der Datei (crypto.X509Certificate), gemerkt bis zur nächsten Änderung der Datei.
 *  - Fehler: die letzten Zeilen der Diagnose-Protokolle und des Server-Protokolls, zusammengefasst (serverRegeln.ts).
 *    Seit 10.10.2026 getrennt: fehlgeschlagene Passwort-Anmeldungen (Abschnitt „Anmeldungen", Ampel nur bei möglichem
 *    Rateversuch), Browser-Meldungen ohne Einzelheiten („Script error."), und „Fehlerlog leeren" als Marke
 *    `fehler-geleert-ab` in server_einstellungen – die Protokolle selbst bleiben (Nachweis).
 */
import { X509Certificate } from 'node:crypto'
import { existsSync, readFileSync, statSync, statfsSync } from 'node:fs'
import { opendir, stat } from 'node:fs/promises'
import { availableParallelism, freemem, loadavg, totalmem } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { datenbank, leseServerProtokoll, protokolliereServer, serverWert, setzeServerWert } from './datenbank'
import { leseDiagnose } from './diagnose'
import { offeneStroeme } from './ereignisse'
import { listeSicherungen, sicherungsStand } from './sicherungen'
import {
  anmeldungenUebersicht,
  diagnoseZeile,
  fehlerGruppieren,
  fehlversuchMerkmale,
  gesundheitPruefen,
  istFehlversuch,
  istOhneDetails,
  istProtokollFehler,
  istServerFehler,
  nachMarke,
  tageAuffuellen,
  tagVon,
  verdichten,
  type AnmeldeUebersicht,
  type FehlerZeile,
  type Fehlversuch,
  type Messwert
} from './serverRegeln'

export const MESS_MS = 5 * 60_000
export const AUFHEBEN_MS = 8 * 864e5
const TAGE_AUFHEBEN = 15

const TABELLEN = `
CREATE TABLE IF NOT EXISTS server_messwerte (
  zeit INTEGER PRIMARY KEY,
  cpu REAL NOT NULL,
  system REAL NOT NULL,
  prozess REAL NOT NULL,
  prozess_byte REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS server_tage (
  tag TEXT NOT NULL,
  messgroesse TEXT NOT NULL,
  wert REAL NOT NULL,
  PRIMARY KEY (tag, messgroesse)
);
`
let angelegt: DatabaseSync | null = null
function db(): DatabaseSync {
  const d = datenbank()
  if (angelegt !== d) {
    d.exec(TABELLEN)
    angelegt = d
  }
  return d
}

// ---------------------------------------------------------------- Arbeitsspeicher

const zahlAus = (datei: string): number | null => {
  try {
    const t = readFileSync(datei, 'utf8').trim()
    const n = Number(t)
    return t !== 'max' && Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/** Grenze und Belegung des Containers (cgroup v2, sonst v1) – null außerhalb eines Containers */
export function containerSpeicher(): { belegt: number; grenze: number } | null {
  const grenze = zahlAus('/sys/fs/cgroup/memory.max') ?? zahlAus('/sys/fs/cgroup/memory/memory.limit_in_bytes')
  const belegt = zahlAus('/sys/fs/cgroup/memory.current') ?? zahlAus('/sys/fs/cgroup/memory/memory.usage_in_bytes')
  if (!grenze || belegt === null || grenze >= totalmem()) return null
  return { belegt, grenze }
}

function speicherJetzt(): { systemAnteil: number; prozessAnteil: number; prozessByte: number; container: { belegt: number; grenze: number } | null } {
  const gesamt = totalmem()
  const rss = process.memoryUsage.rss()
  const c = containerSpeicher()
  return {
    systemAnteil: gesamt ? (gesamt - freemem()) / gesamt : 0,
    prozessAnteil: c ? rss / c.grenze : gesamt ? rss / gesamt : 0,
    prozessByte: rss,
    container: c
  }
}

const cpuJetzt = (): number => Math.min(1, loadavg()[0] / Math.max(1, availableParallelism()))

// ---------------------------------------------------------------- Zähler je Tag

interface Tageszaehler {
  tag: string
  anfragen: number
  langsam: number
  fehler: number
  ms: number
  lehrkraefte: Set<string>
  lernende: Set<string>
}
const neuerTag = (tag: string): Tageszaehler => ({ tag, anfragen: 0, langsam: 0, fehler: 0, ms: 0, lehrkraefte: new Set(), lernende: new Set() })
let heute = neuerTag(tagVon(Date.now()))
/** Zuletzt gesehen je Konto (für „gerade angemeldet"), nur im Speicher */
const zuletzt = new Map<string, { rolle: string; zeit: number }>()

function zaehlerFuer(jetzt: number): Tageszaehler {
  const tag = tagVon(jetzt)
  if (heute.tag !== tag) {
    zaehlerSchreiben()
    heute = neuerTag(tag)
  }
  return heute
}

/** Aus http.ts nach jeder Antwort (ohne Ereignisströme/Aufträge): nur Zähler */
export function anfrageGemessen(ms: number, status: number, jetzt = Date.now()): void {
  const z = zaehlerFuer(jetzt)
  z.anfragen++
  z.ms += ms
  if (ms > 1000) z.langsam++
  if (status >= 500) z.fehler++
}

/** Aus http.ts je Anfrage mit Sitzung: zählt das Konto einmal je Tag (Vorschaukonten nie) */
export function kontoAktiv(n: { id: string; rolle: string; quelle?: string }, jetzt = Date.now()): void {
  if (n.quelle === 'vorschau') return
  const z = zaehlerFuer(jetzt)
  if (n.rolle === 'schueler') z.lernende.add(n.id)
  else z.lehrkraefte.add(n.id)
  zuletzt.set(n.id, { rolle: n.rolle, zeit: jetzt })
}

/** Konten mit einer Anfrage in den letzten 15 Minuten */
export function geradeAktiv(jetzt = Date.now()): { lehrkraefte: number; lernende: number } {
  let lehrkraefte = 0
  let lernende = 0
  for (const [id, z] of zuletzt) {
    if (jetzt - z.zeit > 15 * 60_000) {
      zuletzt.delete(id)
      continue
    }
    if (z.rolle === 'schueler') lernende++
    else lehrkraefte++
  }
  return { lehrkraefte, lernende }
}

/**
 * Tageszahlen schreiben: Zähler addieren sich (Delta seit dem letzten Schreiben), die Zahl der aktiven Konten zählt
 * als Höchstwert – so zählt ein Neustart am Vormittag niemanden doppelt (höchstens zu wenig).
 */
let geschrieben = { tag: '', anfragen: 0, langsam: 0, fehler: 0, ms: 0 }
export function zaehlerSchreiben(): void {
  try {
    const d = db()
    const z = heute
    if (geschrieben.tag !== z.tag) geschrieben = { tag: z.tag, anfragen: 0, langsam: 0, fehler: 0, ms: 0 }
    const summe = d.prepare('INSERT INTO server_tage (tag, messgroesse, wert) VALUES (?, ?, ?) ON CONFLICT(tag, messgroesse) DO UPDATE SET wert = wert + excluded.wert')
    const hoechst = d.prepare('INSERT INTO server_tage (tag, messgroesse, wert) VALUES (?, ?, ?) ON CONFLICT(tag, messgroesse) DO UPDATE SET wert = MAX(wert, excluded.wert)')
    for (const k of ['anfragen', 'langsam', 'fehler', 'ms'] as const) {
      const delta = z[k] - geschrieben[k]
      if (delta) summe.run(z.tag, k, delta)
      geschrieben[k] = z[k]
    }
    if (z.lehrkraefte.size) hoechst.run(z.tag, 'lehrkraefte', z.lehrkraefte.size)
    if (z.lernende.size) hoechst.run(z.tag, 'lernende', z.lernende.size)
    d.prepare('DELETE FROM server_tage WHERE tag < ?').run(tagVon(Date.now() - TAGE_AUFHEBEN * 864e5))
  } catch {
    // Zählen darf nie den Betrieb stören
  }
}

// ---------------------------------------------------------------- Messung

let letzteCpu = { zeit: Date.now(), nutzung: process.cpuUsage() }

/** Eine Messung speichern und Altes löschen (Ringpuffer über die Zeit) */
export function messen(jetzt = Date.now(), wert?: Omit<Messwert, 'zeit'>): void {
  try {
    const s = speicherJetzt()
    const w = wert ?? { cpu: cpuJetzt(), system: s.systemAnteil, prozess: s.prozessAnteil, prozessByte: s.prozessByte }
    const d = db()
    d.prepare('INSERT OR REPLACE INTO server_messwerte (zeit, cpu, system, prozess, prozess_byte) VALUES (?, ?, ?, ?, ?)').run(jetzt, w.cpu, w.system, w.prozess, w.prozessByte)
    messwerteAufraeumen(jetzt)
  } catch {
    // Messen darf nie den Betrieb stören
  }
}

export const messwerteAufraeumen = (jetzt = Date.now()): void => void db().prepare('DELETE FROM server_messwerte WHERE zeit < ?').run(jetzt - AUFHEBEN_MS)

export function messwerte(seit: number): Messwert[] {
  return (db().prepare('SELECT zeit, cpu, system, prozess, prozess_byte FROM server_messwerte WHERE zeit >= ? ORDER BY zeit').all(seit) as {
    zeit: number
    cpu: number
    system: number
    prozess: number
    prozess_byte: number
  }[]).map((z) => ({ zeit: z.zeit, cpu: z.cpu, system: z.system, prozess: z.prozess, prozessByte: z.prozess_byte }))
}

/** Alle 5 Minuten messen und die Tageszahlen schreiben (start.ts) */
export function messungenStarten(): () => void {
  const runde = (): void => {
    messen()
    zaehlerSchreiben()
  }
  const erst = setTimeout(runde, 15_000)
  const t = setInterval(runde, MESS_MS)
  erst.unref()
  t.unref()
  return () => (clearTimeout(erst), clearInterval(t))
}

/** CPU-Anteil von Schul-Apps seit dem letzten Aufruf (an einem Kern) – nur für „Technische Details" */
function prozessCpu(): number {
  const jetzt = Date.now()
  const n = process.cpuUsage()
  const dauer = (jetzt - letzteCpu.zeit) * 1000
  const anteil = dauer > 0 ? (n.user - letzteCpu.nutzung.user + n.system - letzteCpu.nutzung.system) / dauer : 0
  letzteCpu = { zeit: jetzt, nutzung: n }
  return Math.max(0, anteil)
}

// ---------------------------------------------------------------- Tageszahlen lesen

export interface TagesZahl {
  tag: string
  lehrkraefte: number
  lernende: number
  anfragen: number
  langsam: number
  fehler: number
  ms: number
}

const LEER_TAG = { lehrkraefte: 0, lernende: 0, anfragen: 0, langsam: 0, fehler: 0, ms: 0 }

/** Die letzten `tage` Tage; der heutige Tag mit den Zählern im Speicher (auch noch nicht geschrieben) */
export function tagesZahlen(tage = 14, jetzt = Date.now()): TagesZahl[] {
  const werte = new Map<string, Partial<typeof LEER_TAG>>()
  try {
    const zeilen = db().prepare('SELECT tag, messgroesse, wert FROM server_tage WHERE tag >= ?').all(tagVon(jetzt - tage * 864e5)) as { tag: string; messgroesse: string; wert: number }[]
    for (const z of zeilen) {
      if (!(z.messgroesse in LEER_TAG)) continue
      const w = werte.get(z.tag) ?? {}
      w[z.messgroesse as keyof typeof LEER_TAG] = z.wert
      werte.set(z.tag, w)
    }
  } catch {
    // leer
  }
  const z = zaehlerFuer(jetzt)
  const h = werte.get(z.tag) ?? {}
  werte.set(z.tag, {
    lehrkraefte: Math.max(h.lehrkraefte ?? 0, z.lehrkraefte.size),
    lernende: Math.max(h.lernende ?? 0, z.lernende.size),
    anfragen: (h.anfragen ?? 0) + z.anfragen - (geschrieben.tag === z.tag ? geschrieben.anfragen : 0),
    langsam: (h.langsam ?? 0) + z.langsam - (geschrieben.tag === z.tag ? geschrieben.langsam : 0),
    fehler: (h.fehler ?? 0) + z.fehler - (geschrieben.tag === z.tag ? geschrieben.fehler : 0),
    ms: (h.ms ?? 0) + z.ms - (geschrieben.tag === z.tag ? geschrieben.ms : 0)
  })
  return tageAuffuellen(werte, jetzt, tage, { ...LEER_TAG })
}

// ---------------------------------------------------------------- Platz

export interface Platz {
  datenbank: number
  medienbank: number
  ablagen: number
  sicherungen: number
  /** Rest des Datenordners (Protokolle, Hörtexte, System …) */
  sonstiges: number
  frei: number
  gesamt: number
  /** Rest der Platte außerhalb des Datenordners (System, andere Programme) */
  ausserhalb: number
  /** Zeit der Zählung */
  zeit: number
  /** Zählung abgebrochen (zu viele Dateien) – Werte sind Untergrenzen */
  unvollstaendig: boolean
}

let platzMerk: Platz | null = null
let platzLaeuft = false

/** Größe eines Ordners, asynchron und begrenzt; `budget` zählt die Einträge herunter */
async function ordnerGroesse(pfad: string, budget: { rest: number }): Promise<number> {
  let summe = 0
  let dir
  try {
    dir = await opendir(pfad, { bufferSize: 64 })
  } catch {
    return 0
  }
  for await (const e of dir) {
    if (--budget.rest < 0) break
    const p = join(pfad, e.name)
    if (e.isDirectory()) summe += await ordnerGroesse(p, budget)
    else if (e.isFile())
      try {
        summe += (await stat(p)).size
      } catch {
        // gerade entfernt
      }
  }
  return summe
}

/** Platz zählen – höchstens einmal je Stunde, nie zweimal gleichzeitig. Liefert den gemerkten Stand (oder null). */
export function platz(daten: string, jetzt = Date.now()): Platz | null {
  if (!platzLaeuft && (!platzMerk || jetzt - platzMerk.zeit > 36e5)) {
    platzLaeuft = true
    void platzZaehlen(daten)
      .then((p) => (platzMerk = p))
      .catch(() => undefined)
      .finally(() => (platzLaeuft = false))
  }
  return platzMerk
}

export const platzWirdGezaehlt = (): boolean => platzLaeuft

/** Ein Durchlauf durch den Datenordner; die oberste Ebene entscheidet über den Bereich */
export async function platzZaehlen(daten: string): Promise<Platz> {
  const budget = { rest: 300_000 }
  const b = { datenbank: 0, medienbank: 0, ablagen: 0, sicherungen: 0, sonstiges: 0 }
  let dir
  try {
    dir = await opendir(daten, { bufferSize: 64 })
  } catch {
    dir = null
  }
  if (dir)
    for await (const e of dir) {
      if (--budget.rest < 0) break
      const p = join(daten, e.name)
      let groesse = 0
      if (e.isDirectory()) groesse = await ordnerGroesse(p, budget)
      else if (e.isFile())
        try {
          groesse = (await stat(p)).size
        } catch {
          // gerade entfernt
        }
      const bereich: keyof typeof b = /^schulapps\.db(-wal|-shm)?$/.test(e.name)
        ? 'datenbank'
        : e.name === 'medienbank'
          ? 'medienbank'
          : e.name === 'nutzer' || e.name === 'fach'
            ? 'ablagen'
            : e.name === 'sicherungen' || /^sicherung-.*\.db(\.gz)?$/i.test(e.name)
              ? 'sicherungen'
              : 'sonstiges'
      b[bereich] += groesse
    }
  let frei = 0
  let gesamt = 0
  try {
    const s = statfsSync(daten)
    frei = s.bavail * s.bsize
    gesamt = s.blocks * s.bsize
  } catch {
    // unbekannt
  }
  const alles = Object.values(b).reduce((x, y) => x + y, 0)
  return { ...b, frei, gesamt, ausserhalb: Math.max(0, gesamt - frei - alles), zeit: Date.now(), unvollstaendig: budget.rest < 0 }
}

// ---------------------------------------------------------------- Zertifikat

const zertMerk = new Map<string, { mtime: number; bis: number }>()

/** Ablaufdatum der Zertifikate aus SCHULAPPS_TLS_DOMAIN_CERT und SCHULAPPS_TLS_CERT */
export function zertifikate(env = process.env): { name: string; bis: number }[] {
  const aus: { name: string; bis: number }[] = []
  const quellen: [string, string | undefined][] = [
    [(env.SCHULAPPS_TLS_DOMAIN_NAMEN || '').split(',')[0]?.trim() || 'Domain', env.SCHULAPPS_TLS_DOMAIN_CERT],
    ['IP-Adresse', env.SCHULAPPS_TLS_CERT]
  ]
  for (const [name, datei] of quellen) {
    if (!datei || !existsSync(datei)) continue
    try {
      const mtime = statSync(datei).mtimeMs
      let m = zertMerk.get(datei)
      if (!m || m.mtime !== mtime) {
        m = { mtime, bis: Date.parse(new X509Certificate(readFileSync(datei)).validTo) }
        zertMerk.set(datei, m)
      }
      if (Number.isFinite(m.bis)) aus.push({ name, bis: m.bis })
    } catch {
      // unlesbar
    }
  }
  return aus
}

// ---------------------------------------------------------------- Fehler

let diagnoseMerk: { zeit: number; zeilen: FehlerZeile[]; ohneDetails: FehlerZeile[]; langsam24h: number } | null = null

export interface FehlerQuellen {
  /** echte Fehler (zählen für Zahl und Ampel) */
  zeilen: FehlerZeile[]
  /** Browser-Meldungen ohne Einzelheiten („Script error.") – eigener Abschnitt, zählen nicht */
  ohneDetails: FehlerZeile[]
  /** fehlgeschlagene Passwort-Anmeldungen – eigener Abschnitt */
  versuche: Fehlversuch[]
  langsam24h: number
}

/**
 * Zeilen der letzten 7 Tage aus Diagnose-Protokollen (60 s gemerkt – Dateien lesen und entschlüsseln kostet) und dem
 * Server-Protokoll (immer frisch: eine Abfrage, so erscheinen Anmeldeversuche und das Leeren sofort), dazu die
 * langsamen Anfragen der letzten 24 h
 */
export function fehlerZeilen(jetzt = Date.now()): FehlerQuellen {
  const ab = new Date(jetzt - 7 * 864e5).toISOString()
  if (!diagnoseMerk || jetzt - diagnoseMerk.zeit >= 60_000 || jetzt < diagnoseMerk.zeit) {
    const ab24 = new Date(jetzt - 864e5).toISOString()
    const zeilen: FehlerZeile[] = []
    const ohneDetails: FehlerZeile[] = []
    let langsam24h = 0
    for (const z of leseDiagnose('langsam', 3000)) {
      const { zeit, text } = diagnoseZeile(z)
      if (zeit < ab) continue
      if (istServerFehler(text)) zeilen.push({ zeit, quelle: 'server', text })
      else if (zeit >= ab24 && /^\d+ ms /.test(text)) langsam24h++
    }
    for (const z of leseDiagnose('browser', 1500)) {
      const { zeit, text } = diagnoseZeile(z)
      if (zeit >= ab) (istOhneDetails(text) ? ohneDetails : zeilen).push({ zeit, quelle: 'browser', text })
    }
    diagnoseMerk = { zeit: jetzt, zeilen, ohneDetails, langsam24h }
  }
  const zeilen = diagnoseMerk.zeilen.filter((z) => z.zeit >= ab)
  const versuche: Fehlversuch[] = []
  try {
    for (const e of leseServerProtokoll(2000)) {
      if (e.zeit < ab) continue
      if (istFehlversuch(e.text)) versuche.push({ zeit: e.zeit, ...fehlversuchMerkmale(e.text) })
      else if (istProtokollFehler(e.text)) zeilen.push({ zeit: e.zeit, quelle: 'protokoll', text: `${e.art}: ${e.text}` })
    }
  } catch {
    // keine Datenbank
  }
  return { zeilen, ohneDetails: diagnoseMerk.ohneDetails.filter((z) => z.zeit >= ab), versuche, langsam24h: diagnoseMerk.langsam24h }
}

/** Marke „Fehlerlog geleert" (ISO-Zeit) – '' = nie geleert */
export const FEHLER_MARKE = 'fehler-geleert-ab'
export function fehlerMarke(): string {
  try {
    return serverWert<string>(FEHLER_MARKE, '')
  } catch {
    return ''
  }
}

/** „Fehlerlog leeren": nur die Marke setzen; Diagnose-Dateien und Protokoll bleiben (Nachweis) */
export function fehlerLeeren(nutzerId: string, jetzt = Date.now()): string {
  const marke = new Date(jetzt).toISOString()
  setzeServerWert(FEHLER_MARKE, marke)
  protokolliereServer('verwaltung', 'Fehlerlog geleert', nutzerId)
  return marke
}

export interface FehlerUebersicht {
  gruppen: ReturnType<typeof fehlerGruppieren>
  letzte24h: number
  langsam24h: number
  roh: FehlerZeile[]
  /** Browser-Meldungen ohne Einzelheiten (zählen nicht) */
  ohneDetails: { anzahl: number; letzte24h: number; gruppen: ReturnType<typeof fehlerGruppieren> }
  anmeldungen: AnmeldeUebersicht
  /** Marke des Leerens und wie viele Einträge (7 Tage) davor ausgeblendet sind; `alle`: Marke nicht angewandt */
  geleert: { ab: string; ausgeblendet: number; alle: boolean }
}

/** Übersicht; ohne `alle` nur Einträge ab der Marke „Fehlerlog geleert" */
export function fehlerUebersicht(jetzt = Date.now(), alle = false): FehlerUebersicht {
  const q = fehlerZeilen(jetzt)
  const marke = fehlerMarke()
  const m = alle ? '' : marke
  const zeilen = nachMarke(q.zeilen, m)
  const ohne = nachMarke(q.ohneDetails, m)
  const versuche = nachMarke(q.versuche, m)
  const ab = new Date(jetzt - 864e5).toISOString()
  const vorher = (l: { zeit: string }[]): number => (marke ? l.filter((z) => z.zeit < marke).length : 0)
  const ausgeblendet = vorher(q.zeilen) + vorher(q.ohneDetails) + vorher(q.versuche)
  return {
    gruppen: fehlerGruppieren(zeilen),
    letzte24h: zeilen.filter((z) => z.zeit >= ab).length,
    langsam24h: q.langsam24h,
    roh: [...zeilen, ...ohne].sort((a, b) => b.zeit.localeCompare(a.zeit)).slice(0, 300),
    ohneDetails: { anzahl: ohne.length, letzte24h: ohne.filter((z) => z.zeit >= ab).length, gruppen: fehlerGruppieren(ohne, 10) },
    anmeldungen: anmeldungenUebersicht(versuche, jetzt),
    geleert: { ab: marke, ausgeblendet, alle }
  }
}

// ---------------------------------------------------------------- KI (Zusammenfassung)

/**
 * KI-Nutzung je Tag kommt aus dem Modul des Reiters „KI-Zugänge" (kiNutzung.ts) – NUR über die Schlüssel der Schule,
 * nie private Zugänge. Dieses Modul meldet seine Quelle hier an; ohne Quelle zeigt der Reiter keinen KI-Verlauf.
 * Zeilen dürfen je Lehrkraft kommen – hier wird je Tag summiert.
 */
type KiQuelle = (tage: number) => { tag: string; auftraege?: number; anfragen?: number }[]
let kiQuelle: KiQuelle | null = null
export const setzeKiNutzungQuelle = (q: KiQuelle | null): void => void (kiQuelle = q)

export function kiJeTag(tage = 14, jetzt = Date.now()): { tag: string; auftraege: number; anfragen: number }[] | null {
  if (!kiQuelle) return null
  try {
    const werte = new Map<string, { auftraege: number; anfragen: number }>()
    for (const z of kiQuelle(tage)) {
      const w = werte.get(z.tag) ?? { auftraege: 0, anfragen: 0 }
      w.auftraege += Number(z.auftraege) || 0
      w.anfragen += Number(z.anfragen) || 0
      werte.set(z.tag, w)
    }
    return tageAuffuellen(werte, jetzt, tage, { auftraege: 0, anfragen: 0 })
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- Gesamtbild

export function serverZustand(daten: string, zeitraum: '24h' | '7d', jetzt = Date.now()): Record<string, unknown> {
  const s = speicherJetzt()
  const cpu = cpuJetzt()
  let platte: { frei: number; gesamt: number } | null = null
  try {
    const f = statfsSync(daten)
    platte = { frei: f.bavail * f.bsize, gesamt: f.blocks * f.bsize }
  } catch {
    platte = null
  }
  const sicherungen = listeSicherungen(daten)
  const tls = zertifikate()
  const tage = tagesZahlen(14, jetzt)
  // Anteil der langsamen Anfragen: Anfragen von heute und gestern (Tageszähler) als Bezug
  const zweiTage = tage.slice(-2)
  const fehler = fehlerUebersicht(jetzt)
  const neueste = sicherungen[0]
  const gesundheit = gesundheitPruefen({
    speicherAnteil: s.container ? s.container.belegt / s.container.grenze : s.systemAnteil,
    platteFrei: platte && platte.gesamt ? platte.frei / platte.gesamt : null,
    zertifikatTage: tls.length ? Math.min(...tls.map((t) => (t.bis - jetzt) / 864e5)) : null,
    sicherungStunden: neueste ? (jetzt - neueste.zeit) / 36e5 : null,
    fehler24h: fehler.letzte24h,
    rateVerdacht: fehler.anmeldungen.verdacht,
    langsam24h: fehler.langsam24h,
    anfragen24h: zweiTage.reduce((a, t) => a + t.anfragen, 0)
  })
  const roh = messwerte(jetzt - (zeitraum === '7d' ? 7 * 864e5 : 864e5))
  return {
    gesundheit,
    jetzt: {
      cpu,
      prozessCpu: prozessCpu(),
      kerne: availableParallelism(),
      last: loadavg(),
      systemAnteil: s.systemAnteil,
      prozessAnteil: s.prozessAnteil,
      prozessByte: s.prozessByte,
      speicher: { frei: freemem(), gesamt: totalmem() },
      container: s.container,
      platte,
      stroeme: offeneStroeme(),
      aktiv: geradeAktiv(jetzt),
      laufzeit: process.uptime()
    },
    verlauf: zeitraum === '7d' ? verdichten(roh, 36e5) : roh,
    tage,
    platz: platz(daten, jetzt),
    platzWirdGezaehlt: platzWirdGezaehlt(),
    sicherungen: sicherungen.slice(0, 40),
    sicherung: sicherungsStand(),
    tls,
    ki: kiJeTag(14, jetzt),
    fehler: { letzte24h: fehler.letzte24h, gruppen: fehler.gruppen.slice(0, 8), ohneDetails: fehler.ohneDetails, geleert: fehler.geleert },
    anmeldungen: fehler.anmeldungen
  }
}
