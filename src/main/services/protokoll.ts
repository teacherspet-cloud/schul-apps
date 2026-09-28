/**
 * Protokolldatei (27.09.2026, Großprogramm 0.4, Paket Verlässlichkeit).
 *
 * Bis dahin gab es kein Protokoll: Ein Fehler, den die Lehrkraft meldete („die exe bleibt weiß",
 * „der Export bricht ab"), ließ sich nur nachstellen, nicht nachlesen. Jetzt schreibt der
 * Hauptprozess Fehler, Abstürze, IPC-Ausnahmen und wichtige Ereignisse (Sicherung, Wiederholung
 * einer KI-Anfrage) in `userData/protokoll.log`. Ab 2 MB wird die Datei zu `protokoll.1.log`
 * (die vorige verschwindet) – mehr als 4 MB belegt das Protokoll nie.
 *
 * Es stehen KEINE Inhalte darin: keine Prompts, keine Schülertexte, keine Schlüssel – nur Kanal,
 * Art und Meldung. Über „Protokoll speichern" kann die Lehrkraft die Datei weitergeben.
 */
import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'fs'
import { join } from 'path'

export type Stufe = 'info' | 'warnung' | 'fehler'

const MAX_BYTES = 2 * 1024 * 1024
const MAX_ZEILE = 2000

let verzeichnis: string | null = null
/** In Tests: anderes Verzeichnis setzen */
export function setzeProtokollOrdner(dir: string | null): void {
  verzeichnis = dir
}

function ordner(): string {
  const dir = verzeichnis ?? app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export const protokollDatei = (): string => join(ordner(), 'protokoll.log')

/** Geheimnisähnliches unkenntlich machen, bevor es in die Datei geht */
export function entschaerfe(text: string): string {
  return text
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|sk-ant-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,})/g, '[Schlüssel]')
    .replace(/(x-schulapps-token|authorization|api[-_]?key)["':=\s]+[^\s",}]+/gi, '$1=[entfernt]')
    .replace(/[\r\n]+/g, ' ⏎ ')
    .slice(0, MAX_ZEILE)
}

export function protokolliere(stufe: Stufe, quelle: string, meldung: string): void {
  try {
    const datei = protokollDatei()
    if (existsSync(datei) && statSync(datei).size > MAX_BYTES) {
      const alt = join(ordner(), 'protokoll.1.log')
      rmSync(alt, { force: true })
      renameSync(datei, alt)
    }
    const version = (() => {
      try {
        return app.getVersion()
      } catch {
        return '?'
      }
    })()
    appendFileSync(datei, `${new Date().toISOString()} [${stufe}] ${quelle} (v${version}): ${entschaerfe(meldung)}\n`, 'utf8')
  } catch {
    // Das Protokoll darf nie selbst einen Fehler auslösen
  }
}

/** Inhalt beider Protokolldateien, älteste zuerst (für „Protokoll speichern") */
export function leseProtokoll(): string {
  const teile = [join(ordner(), 'protokoll.1.log'), protokollDatei()].filter(existsSync).map((f) => readFileSync(f, 'utf8'))
  return teile.join('')
}

/** Ungefangene Fehler und Abstürze der Prozesse ins Protokoll */
export function fangeAbstuerze(): void {
  process.on('uncaughtException', (e) => protokolliere('fehler', 'hauptprozess', `Ungefangener Fehler: ${e?.stack ?? String(e)}`))
  process.on('unhandledRejection', (e) =>
    protokolliere('fehler', 'hauptprozess', `Unbehandelte Ablehnung: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`)
  )
  app.on('render-process-gone', (_e, _wc, details) =>
    protokolliere('fehler', 'oberflaeche', `Oberfläche beendet: ${details.reason} (Code ${details.exitCode})`)
  )
  app.on('child-process-gone', (_e, details) =>
    protokolliere('fehler', 'hilfsprozess', `${details.type} beendet: ${details.reason} (Code ${details.exitCode})`)
  )
}
