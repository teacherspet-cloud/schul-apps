/**
 * Automatische Sicherung (27.09.2026, Großprogramm 0.4, Paket Verlässlichkeit).
 *
 * Bis dahin gab es nur die Sicherung per Knopf – und eine Erinnerung auf der Startseite. Wer sie
 * übersah, hatte nach einem Plattendefekt oder versehentlichem Zurücksetzen nichts. Jetzt legt
 * die App einmal am Tag (60 s nach dem Start, dann stündlich geprüft) eine Sicherung unter
 * `userData/sicherungen` an und behält die neuesten sieben. Auf Wunsch geht eine Kopie zusätzlich
 * in einen selbst gewählten Ordner (USB-Stick, Netzlaufwerk, Cloud-Ordner).
 *
 * Die Sicherung ist dieselbe wie beim Knopf (`wartung.sicherung()`): ohne API-Schlüssel, mit
 * Lehrwerken, Vokabel-Bibliothek und Maskottchen. `sicherungen/` ist vor dem Zurücksetzen
 * geschützt (wartung.GESCHUETZT).
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import { getSettings, setSettings } from './settings'
import { writeAtomic } from './atomar'
import { sicherung } from './wartung'
import { protokolliere } from '../protokoll'

const TAG = 24 * 60 * 60 * 1000
export const STANDARD_BEHALTEN = 7
const NAME = /^Schul-Apps Sicherung \d{4}-\d{2}-\d{2} \d{2}-\d{2}\.json$/

export function sicherungsOrdner(wurzel = app.getPath('userData')): string {
  const dir = join(wurzel, 'sicherungen')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

const zweistellig = (n: number): string => String(n).padStart(2, '0')
export const dateiname = (d: Date): string =>
  `Schul-Apps Sicherung ${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}-${zweistellig(d.getDate())} ${zweistellig(d.getHours())}-${zweistellig(d.getMinutes())}.json`

export interface SicherungsEintrag {
  name: string
  groesse: number
  erstellt: string
}

/** Die vorhandenen automatischen Sicherungen, neueste zuerst */
export function listeSicherungen(dir = sicherungsOrdner()): SicherungsEintrag[] {
  return readdirSync(dir)
    .filter((n) => NAME.test(n))
    .map((name) => {
      const st = statSync(join(dir, name))
      return { name, groesse: st.size, erstellt: st.mtime.toISOString() }
    })
    .sort((a, b) => b.name.localeCompare(a.name))
}

/** Eine Sicherung laden – nur Namen, die die App selbst vergeben hat */
export function ladeSicherung(name: string, dir = sicherungsOrdner()): Uint8Array {
  if (!NAME.test(name)) throw new Error('Unbekannte Sicherung.')
  return new Uint8Array(readFileSync(join(dir, name)))
}

/** Nur die neuesten `behalten` Stände bleiben */
export function raeumeAuf(dir: string, behalten: number): string[] {
  const weg = listeSicherungen(dir).slice(Math.max(1, behalten))
  for (const e of weg) rmSync(join(dir, e.name), { force: true })
  return weg.map((e) => e.name)
}

/** Ist eine Sicherung fällig? (automatisch an, letzte älter als ein Tag) */
export function faellig(letzte: string | undefined, automatisch: boolean | undefined, jetzt: Date): boolean {
  if (automatisch === false) return false
  if (!letzte) return true
  const t = Date.parse(letzte)
  return !Number.isFinite(t) || jetzt.getTime() - t >= TAG
}

/**
 * Legt jetzt eine Sicherung an (auch per Knopf „Jetzt sichern"). Gibt den Dateinamen zurück;
 * der Spiegel in einen eigenen Ordner scheitert still ins Protokoll, nie ins Gesicht.
 */
export function sichereJetzt(jetzt = new Date()): SicherungsEintrag {
  const s = getSettings()
  const dir = sicherungsOrdner()
  const name = dateiname(jetzt)
  const { daten } = sicherung()
  writeAtomic(join(dir, name), daten)
  raeumeAuf(dir, s.sicherung?.behalten ?? STANDARD_BEHALTEN)
  const spiegel = s.sicherung?.ordner
  if (spiegel) {
    try {
      writeAtomic(join(spiegel, name), daten)
      raeumeAuf(spiegel, s.sicherung?.behalten ?? STANDARD_BEHALTEN)
    } catch (e) {
      protokolliere('warnung', 'sicherung', `Kopie in „${spiegel}" nicht möglich: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  setSettings({ letzteSicherung: jetzt.toISOString() })
  protokolliere('info', 'sicherung', `Automatische Sicherung ${name} (${Math.round(daten.byteLength / 1024)} KB)`)
  return { name, groesse: daten.byteLength, erstellt: jetzt.toISOString() }
}

/** Beim Start einrichten: nach 60 s prüfen, dann stündlich */
export function starteAutoSicherung(): void {
  const pruefe = (): void => {
    try {
      const s = getSettings()
      if (faellig(s.letzteSicherung, s.sicherung?.automatisch, new Date())) sichereJetzt()
    } catch (e) {
      protokolliere('fehler', 'sicherung', `Automatische Sicherung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  setTimeout(pruefe, 60_000)
  setInterval(pruefe, 60 * 60 * 1000)
}
