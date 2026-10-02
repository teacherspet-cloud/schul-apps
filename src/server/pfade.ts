/**
 * Orte des Servers (02.10.2026) – alles unter EINEM Datenordner, damit Sicherung und Umzug ein
 * einziges Docker-Volume sind.
 *
 *   <DATEN>/schulapps.db          Nutzer, Sitzungen, Lerngruppen, Onlinetests … (node:sqlite)
 *   <DATEN>/nutzer/<id>/          dieselbe Ablage wie userData am PC (Einstellungen, Material …)
 *   <DATEN>/fach/<fachId>/        gemeinsame Fachordner
 *   <DATEN>/hoertexte/            freigegebene Hörtexte (QR-Code)
 *   <DATEN>/system/               Einstellungen ohne Nutzer (Modelllisten, Protokoll des Servers)
 *   <DATEN>/tls/                  Zertifikat (le.crt/le.key, vom Deploy-Hook)
 *
 * Der Hauptschlüssel liegt AUSSERHALB des Datenordners (Docker-Secret), damit eine Kopie des
 * Volumes allein keine Geheimnisse preisgibt.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const env = process.env

export const DATEN = resolve(env.SCHULAPPS_DATEN || './server-daten')
export const SCHLUESSEL_DATEI = resolve(env.SCHULAPPS_SCHLUESSEL || join(DATEN, '..', 'schulapps-hauptschluessel'))
/** Ordner mit der gebauten Oberfläche (out/renderer) */
export const OBERFLAECHE = resolve(env.SCHULAPPS_OBERFLAECHE || './out/renderer')
/** Mitgelieferte Daten (Lehrpläne, Schulverzeichnis, OpenMoji …) */
export const RESSOURCEN = resolve(env.SCHULAPPS_RESSOURCEN || './resources')

export function ordner(...teile: string[]): string {
  const p = join(DATEN, ...teile)
  if (!existsSync(p)) mkdirSync(p, { recursive: true, mode: 0o700 })
  return p
}

/** Nur Kennungen aus Kleinbuchstaben, Ziffern und Bindestrich – nie ein Pfad */
export const sichereKennung = (id: string): string => {
  if (!/^[a-z0-9-]{6,64}$/.test(id)) throw new Error('Ungültige Kennung.')
  return id
}

export const nutzerOrdner = (id: string): string => ordner('nutzer', sichereKennung(id))
export const systemOrdner = (): string => ordner('system')
