/**
 * Sicherungen der Datenbank (09.10.2026, Reiter „Server" der Verwaltung).
 *
 *   <DATEN>/sicherungen/schulapps-<Datum>.db.gz   „Sicherung jetzt anlegen" und die nächtliche Sicherung des Hosts (cron)
 *   <DATEN>/sicherung-vor-*.db                    ältere Einzelsicherungen (z. B. vor dem IServ-Abgleich) – nur gelistet
 *
 * Anlegen: VACUUM INTO eine Kopie (stimmig auch bei laufendem Betrieb), dann gestreamt mit gzip gepackt (wenig Speicher
 * – der Container hat nur 2 GB), Rechte 600, die neuesten 14 bleiben. Nie zwei gleichzeitig; vorher muss mindestens das
 * 1,5-Fache der Datenbank frei sein.
 */
import { chmodSync, createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, statfsSync } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { createGzip } from 'node:zlib'
import { datenbank, protokolliereServer } from './datenbank'
import { zuEntfernen } from './serverRegeln'

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
