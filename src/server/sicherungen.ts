/**
 * Sicherungen der Datenbank (09.10.2026, Reiter „Server" der Verwaltung).
 *
 *   <DATEN>/sicherungen/schulapps-<Datum>.db.gz   „Sicherung jetzt anlegen" und die nächtliche Sicherung des Hosts (cron)
 *   <DATEN>/sicherung-vor-*.db                    ältere Einzelsicherungen (z. B. vor dem IServ-Abgleich) – gelistet, nach 14 Tagen gelöscht (23.10.2026)
 *
 * Anlegen: VACUUM INTO eine Kopie (stimmig auch bei laufendem Betrieb), dann gestreamt mit gzip gepackt (wenig Speicher
 * – der Container hat nur 2 GB), Rechte 600, die neuesten 14 bleiben. Nie zwei gleichzeitig; vorher muss mindestens das
 * 1,5-Fache der Datenbank frei sein.
 *
 * Zweite Kopie außerhalb des Servers (23.10.2026, Prüfung des Schulträgers, Löschkonzept/Sicherung): Die nächtliche
 * Sicherung des Hosts (deploy/strato/schul-apps-sicherung.sh) packt Datenbank UND Dateiablagen (nutzer, fach, system …)
 * in ein Archiv, verschlüsselt es mit dem ÖFFENTLICHEN Schlüssel des Betreiber-PCs und legt es in /root/sicherungen; der
 * PC holt es täglich ab (scripts/sicherung-holen.ps1). Der Host schreibt seinen Stand nach
 * <DATEN>/sicherungen/stand-nacht.json (und stand-abgeholt.json, wenn der PC abgeholt hat). Monatlich entpackt er die
 * unverschlüsselte Zwischenkopie nach <DATEN>/sicherungen/.pruefung-<Name>/ – den Wiederherstellungstest macht dann
 * dieser Server (`pruefungenAbarbeiten`): integrity_check, Zeilen je Tabelle gegen inhalt.json, Stichprobe der
 * Verschlüsselung mit dem Hauptschlüssel; Ergebnis in stand-pruefung.json und im Protokoll, danach wird entfernt.
 * Anleitung zur Wiederherstellung: deploy/strato/WIEDERHERSTELLEN.md.
 */
import { chmodSync, createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, statfsSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { createGzip } from 'node:zlib'
import { datenbank, protokolliereServer } from './datenbank'
import { zuEntfernen } from './serverRegeln'
import { dateiVon, istVerschluesselt } from './shims/fs'
import { entschluessle } from './geheim'

export const BEHALTEN = 14

export interface Sicherung {
  name: string
  /** 'sicherungen' = Ordner sicherungen/, 'daten' = direkt im Datenordner */
  ort: 'sicherungen' | 'daten'
  groesse: number
  /** Zeit der Datei in ms */
  zeit: number
}

export interface SicherungsStand {
  laeuft: boolean
  schritt: '' | 'kopieren' | 'packen' | 'fertig' | 'fehler'
  /** 0–1 beim Packen */
  anteil: number
  meldung: string
  datei: string
  zeit: number
}

const stand: SicherungsStand = { laeuft: false, schritt: '', anteil: 0, meldung: '', datei: '', zeit: 0 }
export const sicherungsStand = (): SicherungsStand => ({ ...stand })

export function sicherungsOrdner(daten: string): string {
  const o = join(daten, 'sicherungen')
  if (!existsSync(o)) mkdirSync(o, { recursive: true, mode: 0o700 })
  return o
}

/** Alle Sicherungen, neueste zuerst */
export function listeSicherungen(daten: string): Sicherung[] {
  const aus: Sicherung[] = []
  const lies = (o: string, ort: Sicherung['ort'], passt: (n: string) => boolean): void => {
    let namen: string[] = []
    try {
      namen = readdirSync(o)
    } catch {
      return
    }
    for (const name of namen) {
      if (!passt(name) || name.endsWith('.teil')) continue
      try {
        const s = statSync(join(o, name))
        if (s.isFile()) aus.push({ name, ort, groesse: s.size, zeit: s.mtimeMs })
      } catch {
        // gerade entfernt
      }
    }
  }
  lies(sicherungsOrdner(daten), 'sicherungen', (n) => /\.(db|gz|sqlite|bak)$/i.test(n))
  lies(daten, 'daten', (n) => /^sicherung-.*\.db(\.gz)?$/i.test(n))
  return aus.sort((a, b) => b.zeit - a.zeit)
}

/** Über die neuesten `behalten` hinaus entfernen (nur schulapps-*.db[.gz] im Ordner sicherungen/) */
export function sicherungenAufraeumen(daten: string, behalten = BEHALTEN): string[] {
  const o = sicherungsOrdner(daten)
  const weg = zuEntfernen(
    listeSicherungen(daten).filter((s) => s.ort === 'sicherungen'),
    behalten
  )
  for (const n of weg) rmSync(join(o, n), { force: true })
  return weg
}

const stempel = (d: Date): string => d.toISOString().slice(0, 16).replace(/[:T]/g, '-')

/**
 * Sicherung anlegen. Liefert sofort (läuft im Hintergrund); den Fortschritt zeigt `sicherungsStand`.
 * `vacuum` nur für Tests (Kopie ohne node:sqlite-Datenbank).
 */
export function sicherungStarten(daten: string, nutzerId?: string, jetzt = new Date(), vacuum?: (ziel: string) => void): { ok: boolean; fehler?: string; fertig?: Promise<void> } {
  if (stand.laeuft) return { ok: false, fehler: 'Eine Sicherung läuft bereits.' }
  const o = sicherungsOrdner(daten)
  const db = join(daten, 'schulapps.db')
  const groesse = existsSync(db) ? statSync(db).size : 0
  try {
    const s = statfsSync(daten)
    if (s.bavail * s.bsize < groesse * 1.5) return { ok: false, fehler: 'Zu wenig Platz auf der Platte für eine Sicherung (nötig: das 1,5-Fache der Datenbank).' }
  } catch {
    // statfs nicht verfügbar – das Schreiben selbst meldet Platzmangel
  }
  const name = `schulapps-${stempel(jetzt)}`
  const roh = join(o, `${name}.db.teil`)
  const ziel = join(o, `${name}.db.gz`)
  Object.assign(stand, { laeuft: true, schritt: 'kopieren', anteil: 0, meldung: '', datei: `${name}.db.gz`, zeit: Date.now() })
  const fertig = (async (): Promise<void> => {
    const teilGz = `${ziel}.teil`
    try {
      rmSync(roh, { force: true })
      // Erst in der nächsten Runde der Ereignisschleife – die Antwort an den Browser geht vorher hinaus
      await new Promise((r) => setImmediate(r))
      if (vacuum) vacuum(roh)
      else datenbank().exec(`VACUUM INTO '${roh.replace(/'/g, "''")}'`)
      stand.schritt = 'packen'
      const gesamt = Math.max(1, statSync(roh).size)
      let gelesen = 0
      const zaehler = new Transform({
        transform(stueck: Buffer, _e, weiter) {
          gelesen += stueck.length
          stand.anteil = Math.min(1, gelesen / gesamt)
          weiter(null, stueck)
        }
      })
      await pipeline(createReadStream(roh, { highWaterMark: 256 * 1024 }), zaehler, createGzip({ level: 6 }), createWriteStream(teilGz, { mode: 0o600 }))
      rmSync(ziel, { force: true })
      // Erst fertig gepackt bekommt die Datei ihren Namen – eine halbe Sicherung sieht nie wie eine ganze aus
      renameSync(teilGz, ziel)
      try {
        chmodSync(ziel, 0o600)
      } catch {
        // Windows/Test
      }
      sicherungenAufraeumen(daten)
      Object.assign(stand, { schritt: 'fertig', anteil: 1, meldung: 'Sicherung angelegt.' })
      protokolliereServer('verwaltung', `Sicherung angelegt (${Math.round(statSync(ziel).size / 1024)} KB)`, nutzerId)
    } catch (e) {
      rmSync(teilGz, { force: true })
      Object.assign(stand, { schritt: 'fehler', meldung: `Die Sicherung ist fehlgeschlagen: ${e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120)}` })
      protokolliereServer('verwaltung', 'Sicherung fehlgeschlagen', nutzerId)
    } finally {
      rmSync(roh, { force: true })
      stand.laeuft = false
    }
  })()
  return { ok: true, fertig }
}

// ---------------------------------------------------------------- Zweite Kopie und Wiederherstellungstest (23.10.2026)

export const PRUEF_VORSILBE = '.pruefung-'
/** Ein Test, der älter ist, gilt als überfällig (der Host prüft am 1. jedes Monats) */
export const PRUEF_TAGE = 35
/** Abholen durch den PC: länger her als das → Fehler */
export const ABHOL_TAGE = 3

/** Stand der Nachtsicherung, geschrieben vom Host (schul-apps-sicherung.sh) */
export interface NachtStand {
  zeit: string
  ok: boolean
  /** Name des verschlüsselten Archivs in /root/sicherungen */
  archiv: string
  groesse: number
  /** 'age' | 'openssl' | '' (kein Schlüssel des PCs hinterlegt – keine Kopie für den PC) */
  verfahren: string
  meldung: string
}

export interface PruefErgebnis {
  zeit: string
  archiv: string
  ok: boolean
  /** Antwort von PRAGMA integrity_check („ok") oder die erste Meldung */
  integritaet: string
  tabellen: number
  zeilen: number
  abweichungen: { tabelle: string; erwartet: number; gefunden: number }[]
  /** Dateien laut Archivliste und nach dem Entpacken (vom Host gezählt) */
  dateien: { erwartet: number; gefunden: number } | null
  /** Stichprobe: verschlüsselte Dateien und Datenbankwerte, die sich mit dem Hauptschlüssel öffnen lassen */
  entschluesselt: { geprueft: number; ok: number }
  meldung: string
}

function leseJson<T>(datei: string): T | null {
  try {
    return JSON.parse(String(readFileSync(datei, 'utf8'))) as T
  } catch {
    return null
  }
}

export const nachtStand = (daten: string): NachtStand | null => leseJson<NachtStand>(join(sicherungsOrdner(daten), 'stand-nacht.json'))
export const pruefStand = (daten: string): PruefErgebnis | null => leseJson<PruefErgebnis>(join(sicherungsOrdner(daten), 'stand-pruefung.json'))
export const abholStand = (daten: string): { zeit: string; archiv: string } | null =>
  leseJson<{ zeit: string; archiv: string }>(join(sicherungsOrdner(daten), 'stand-abgeholt.json'))

const q = (name: string): string => `"${name.replace(/"/g, '""')}"`

/** Zeilen je Tabelle (dieselbe Zählung wie im Skript des Hosts beim Anlegen von inhalt.json) */
export function tabellenZaehlen(d: DatabaseSync): Record<string, number> {
  const aus: Record<string, number> = {}
  for (const { name } of d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[])
    aus[name] = Number((d.prepare(`SELECT COUNT(*) AS n FROM ${q(name)}`).get() as { n: number }).n)
  return aus
}

/** Abweichungen zwischen erwarteten und gefundenen Zeilenzahlen (eine fehlende Tabelle zählt als Abweichung) */
export function zaehlungVergleichen(erwartet: Record<string, number>, gefunden: Record<string, number>): PruefErgebnis['abweichungen'] {
  const namen = [...new Set([...Object.keys(erwartet), ...Object.keys(gefunden)])].sort()
  return namen.filter((t) => (erwartet[t] ?? -1) !== (gefunden[t] ?? -1)).map((t) => ({ tabelle: t, erwartet: erwartet[t] ?? 0, gefunden: gefunden[t] ?? 0 }))
}

/** Bis zu `max` Dateien unter den Ablagen des entpackten Archivs */
function dateienUnter(wurzel: string, max: number): string[] {
  const aus: string[] = []
  const lauf = (o: string): void => {
    if (aus.length >= max) return
    let namen: string[] = []
    try {
      namen = readdirSync(o)
    } catch {
      return
    }
    for (const n of namen) {
      if (aus.length >= max) return
      const p = join(o, n)
      try {
        const s = statSync(p)
        if (s.isDirectory()) lauf(p)
        else if (s.isFile() && s.size > 0 && s.size < 5_000_000) aus.push(p)
      } catch {
        // gerade entfernt
      }
    }
  }
  for (const t of ['nutzer', 'fach', 'system']) lauf(join(wurzel, t))
  return aus
}

/**
 * Wiederherstellungstest eines entpackten Archivs (Ordner mit schulapps.db, inhalt.json, bereit.json, nutzer/ …). Rein
 * lesend; den Ordner entfernt `pruefungenAbarbeiten`.
 */
export function wiederherstellungPruefen(ordner: string, jetzt = new Date()): PruefErgebnis {
  const bereit = leseJson<{ archiv?: string; dateien?: { erwartet: number; gefunden: number } }>(join(ordner, 'bereit.json')) ?? {}
  const inhalt = leseJson<{ tabellen?: Record<string, number> }>(join(ordner, 'inhalt.json'))
  const e: PruefErgebnis = {
    zeit: jetzt.toISOString(),
    archiv: String(bereit.archiv ?? '').slice(0, 120),
    ok: false,
    integritaet: '',
    tabellen: 0,
    zeilen: 0,
    abweichungen: [],
    dateien: bereit.dateien && Number.isFinite(Number(bereit.dateien.erwartet)) ? { erwartet: Number(bereit.dateien.erwartet), gefunden: Number(bereit.dateien.gefunden) } : null,
    entschluesselt: { geprueft: 0, ok: 0 },
    meldung: ''
  }
  const fehler: string[] = []
  const db = join(ordner, 'schulapps.db')
  if (!existsSync(db)) fehler.push('Datenbank fehlt im Archiv')
  else {
    let d: DatabaseSync | null = null
    try {
      d = new DatabaseSync(db, { readOnly: true })
      const antwort = (d.prepare('PRAGMA integrity_check').all() as Record<string, unknown>[]).map((z) => String(Object.values(z)[0] ?? ''))
      e.integritaet = antwort.length === 1 && antwort[0] === 'ok' ? 'ok' : (antwort[0] ?? 'keine Antwort').slice(0, 200)
      if (e.integritaet !== 'ok') fehler.push('integrity_check meldet Fehler')
      const gefunden = tabellenZaehlen(d)
      e.tabellen = Object.keys(gefunden).length
      e.zeilen = Object.values(gefunden).reduce((a, b) => a + b, 0)
      if (!inhalt?.tabellen) fehler.push('inhalt.json fehlt')
      else {
        e.abweichungen = zaehlungVergleichen(inhalt.tabellen, gefunden).slice(0, 30)
        if (e.abweichungen.length) fehler.push(`${e.abweichungen.length} Tabellen mit anderer Zeilenzahl`)
      }
      // Stichprobe: verschlüsselte Namen in der Datenbank lassen sich mit dem Hauptschlüssel öffnen
      if (gefunden.nutzer) {
        const werte = d.prepare("SELECT name FROM nutzer WHERE name LIKE 'v1:%' LIMIT 20").all() as { name: string }[]
        for (const { name } of werte) {
          e.entschluesselt.geprueft++
          try {
            entschluessle(name)
            e.entschluesselt.ok++
          } catch {
            // falscher Schlüssel oder beschädigt
          }
        }
      }
    } catch (x) {
      fehler.push(`Datenbank nicht lesbar (${x instanceof Error ? x.message.slice(0, 80) : 'Fehler'})`)
    } finally {
      d?.close()
    }
  }
  // Stichprobe der Dateiablagen (verschlüsselt mit demselben Hauptschlüssel, shims/fs.ts)
  for (const p of dateienUnter(ordner, 400)) {
    if (e.entschluesselt.geprueft >= 60) break
    let roh: Buffer
    try {
      roh = Buffer.from(readFileSync(p) as Uint8Array)
    } catch {
      continue
    }
    if (!istVerschluesselt(roh)) continue
    e.entschluesselt.geprueft++
    try {
      dateiVon(roh)
      e.entschluesselt.ok++
    } catch {
      // falscher Schlüssel oder beschädigt
    }
  }
  if (e.entschluesselt.ok < e.entschluesselt.geprueft) fehler.push(`${e.entschluesselt.geprueft - e.entschluesselt.ok} Stichproben lassen sich mit dem Hauptschlüssel nicht öffnen`)
  if (e.dateien && e.dateien.erwartet !== e.dateien.gefunden) fehler.push(`Dateien: ${e.dateien.gefunden} von ${e.dateien.erwartet} entpackt`)
  e.ok = fehler.length === 0
  e.meldung = e.ok ? 'Wiederherstellung geprüft: Datenbank und Dateien vollständig.' : fehler.join('; ')
  return e
}

/**
 * Entpackte Archive des Hosts prüfen (alle 10 Minuten aus loeschkonzept.ts): nur Ordner mit bereit.json (fertig
 * entpackt); Ergebnis nach stand-pruefung.json und ins Protokoll (nur Zahlen), danach wird der Ordner entfernt.
 * Liegengebliebene Ordner ohne bereit.json (abgebrochenes Entpacken) gehen nach 12 Stunden.
 */
export function pruefungenAbarbeiten(daten: string, jetzt = new Date()): PruefErgebnis[] {
  const o = sicherungsOrdner(daten)
  const aus: PruefErgebnis[] = []
  let namen: string[] = []
  try {
    namen = readdirSync(o).filter((n) => n.startsWith(PRUEF_VORSILBE))
  } catch {
    return aus
  }
  for (const n of namen) {
    const p = join(o, n)
    let fertig = false
    try {
      if (!statSync(p).isDirectory()) continue
      if (!existsSync(join(p, 'bereit.json'))) {
        if (jetzt.getTime() - statSync(p).mtimeMs > 12 * 36e5) rmSync(p, { recursive: true, force: true })
        continue
      }
      fertig = true
      const e = wiederherstellungPruefen(p, jetzt)
      writeFileSync(join(o, 'stand-pruefung.json'), JSON.stringify(e, null, 1), { mode: 0o600 })
      protokolliereServer(
        'sicherung',
        e.ok
          ? `Wiederherstellungstest bestanden: ${e.tabellen} Tabellen, ${e.zeilen} Zeilen, ${e.dateien?.gefunden ?? 0} Dateien, ${e.entschluesselt.ok} Stichproben entschlüsselt`
          : `Wiederherstellungstest FEHLGESCHLAGEN: ${e.meldung.slice(0, 300)}`
      )
      aus.push(e)
    } catch {
      // beim nächsten Durchgang
    } finally {
      if (fertig) rmSync(p, { recursive: true, force: true })
    }
  }
  return aus
}

/*
 * Einzelsicherungen und Vor-Update-Kopien nach 14 Tagen löschen (23.10.2026, Nachprüfung des Schulträgers): wie die
 * Archive – sonst lägen gelöschte Personen darin unbegrenzt. <DATEN>/sicherung-vor-*.db (vor IServ-Abgleich bzw.
 * Schuljahreswechsel) und <DATEN>/sicherungen/vor-*.db. Nachtlauf des Löschkonzepts; das Skript des Hosts tut dasselbe.
 */
export const EINZEL_TAGE = 14

export function alteEinzelsicherungenLoeschen(daten: string, jetzt = Date.now()): number {
  let n = 0
  const lauf = (o: string, passt: RegExp): void => {
    let namen: string[] = []
    try {
      namen = readdirSync(o)
    } catch {
      return
    }
    for (const name of namen) {
      if (!passt.test(name)) continue
      try {
        const st = statSync(join(o, name))
        if (st.isFile() && jetzt - st.mtimeMs > EINZEL_TAGE * 864e5) (rmSync(join(o, name), { force: true }), n++)
      } catch {
        // gerade entfernt
      }
    }
  }
  lauf(daten, /^sicherung-vor-.*\.db$/)
  lauf(join(daten, 'sicherungen'), /^vor-.*\.db$/)
  return n
}

export type Ampel = 'ok' | 'warnung' | 'fehler'

export interface SicherungAussen {
  nacht: NachtStand | null
  pruefung: PruefErgebnis | null
  abgeholt: { zeit: string; archiv: string } | null
  ampel: { nacht: Ampel; pruefung: Ampel; abgeholt: Ampel }
}

/** Übersicht für Verwaltung › Server (Karte „Sicherung außerhalb des Servers") */
export function sicherungAussen(daten: string, jetzt = Date.now()): SicherungAussen {
  const nacht = nachtStand(daten)
  const pruefung = pruefStand(daten)
  const abgeholt = abholStand(daten)
  const alt = (z: string | undefined, tage: number): boolean => !z || !Number.isFinite(Date.parse(z)) || jetzt - Date.parse(z) > tage * 864e5
  return {
    nacht,
    pruefung,
    abgeholt,
    ampel: {
      /*
       * Grün nur mit verschlüsselter Kopie für den PC (23.10.2026, Nachprüfung des Schulträgers): ohne Archiv bzw.
       * Verfahren rot – auch für Stände älterer Skripte, die dann noch „ok" meldeten.
       */
      nacht: !nacht || !nacht.ok || alt(nacht.zeit, 2) || !nacht.verfahren || !nacht.archiv ? 'fehler' : 'ok',
      pruefung: !pruefung ? 'warnung' : !pruefung.ok ? 'fehler' : alt(pruefung.zeit, PRUEF_TAGE) ? 'warnung' : 'ok',
      abgeholt: !abgeholt ? 'warnung' : alt(abgeholt.zeit, ABHOL_TAGE) ? 'fehler' : 'ok'
    }
  }
}
