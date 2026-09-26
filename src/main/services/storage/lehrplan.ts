// Lehrplan-Themen je Land (Paket 12): resources/lehrplaene/<LAND>.json, erstellt von der
// Recherche (Paket 14). Gelesen wird nur; fehlt die Datei, liefert der Aufruf null und die
// Oberfläche greift auf die mitgebrachten Themen zurück (renderer/shared/themenKatalog.ts).
import { existsSync, readFileSync, statSync } from 'fs'
import { gueltigesLand, pruefeLehrplan, type LehrplanDatei } from '@shared/lehrplan'
import { resourcePath } from './paths'

/** Nach Änderungszeit gemerkt – eine neu gelieferte Datei gilt ohne Neustart */
const cache = new Map<string, { mtime: number; daten: LehrplanDatei | null }>()

export function leseLehrplan(stateId: string): LehrplanDatei | null {
  if (!gueltigesLand(stateId)) return null
  const datei = resourcePath('lehrplaene', `${stateId}.json`)
  try {
    if (!existsSync(datei)) return null
    const mtime = statSync(datei).mtimeMs
    const da = cache.get(stateId)
    if (da && da.mtime === mtime) return da.daten
    const daten = pruefeLehrplan(JSON.parse(readFileSync(datei, 'utf8')), stateId)
    cache.set(stateId, { mtime, daten })
    return daten
  } catch {
    // Halb geschriebene oder beschädigte Datei: wie „nicht vorhanden"
    return null
  }
}
