/**
 * Diagnose-Protokolle (08.10.2026, Befund im Unterricht: Seiten hingen, Spiele mussten neu geladen werden – das
 * Container-Protokoll war nach dem Neustart weg). Zwei Dateien im Datenordner (überstehen Neustarts):
 *  - langsam.log: Anfragen über 1 Sekunde (Zeit, Dauer, Methode, Pfad ohne Abfrageteil),
 *  - browser.log: Fehlerberichte aus den Browsern der Lernenden (Seite, Meldung, Gerät) – ohne Namen.
 * Je Datei höchstens 2 MB, danach eine Vorgängerdatei (.1).
 */
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ordner = (): string | null => {
  const d = process.env.SCHULAPPS_DATEN
  if (!d) return null
  const o = join(d, 'protokolle')
  if (!existsSync(o)) mkdirSync(o, { recursive: true })
  return o
}

export function protokoll(name: 'langsam' | 'browser', zeile: string): void {
  try {
    const o = ordner()
    if (!o) return
    const datei = join(o, `${name}.log`)
    if (existsSync(datei) && statSync(datei).size > 2_000_000) renameSync(datei, `${datei}.1`)
    appendFileSync(datei, `${new Date().toISOString()} ${zeile.replace(/\s+/g, ' ').slice(0, 1500)}\n`)
  } catch {
    // Diagnose darf nie den Betrieb stören
  }
}

/** Höchstens 20 Browser-Berichte je Adresse und Minute */
const zaehler = new Map<string, { n: number; ab: number }>()
export function berichtErlaubt(ip: string): boolean {
  const jetzt = Date.now()
  const z = zaehler.get(ip)
  if (!z || jetzt - z.ab > 60_000) {
    zaehler.set(ip, { n: 1, ab: jetzt })
    if (zaehler.size > 5000) zaehler.clear()
    return true
  }
  z.n++
  return z.n <= 20
}
