import { readFileSync } from 'fs'
import { CefrTable } from '@shared/types'
import { vollstaendigeGerTabelle } from '@shared/schulformen'
import { resourcePath } from './paths'

let cached: CefrTable | null = null

/**
 * Mitgelieferte Zuordnung Bundesland × Schulform × Jahrgang → GER-Niveau (für Vorschläge in den Programmen).
 * Vervollständigt um alle Schulformen des gemeinsamen Katalogs (@shared/schulformen) – so sehen auch
 * Programme, die die Tabelle direkt lesen (Einstellungen, Vokabeltest, Schulsuche), jede Schulform.
 */
export function getCefrTable(): CefrTable {
  if (!cached) {
    try {
      cached = vollstaendigeGerTabelle(JSON.parse(readFileSync(resourcePath('cefr', 'levels.json'), 'utf8')) as CefrTable)
    } catch {
      return { version: 1, states: [] }
    }
  }
  return cached!
}
