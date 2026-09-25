import { readFileSync } from 'fs'
import { CefrTable } from '@shared/types'
import { resourcePath } from './paths'

let cached: CefrTable | null = null

/** Mitgelieferte Zuordnung Bundesland × Schulform × Jahrgang → GER-Niveau (für Vorschläge in den Programmen). */
export function getCefrTable(): CefrTable {
  if (!cached) {
    try {
      cached = JSON.parse(readFileSync(resourcePath('cefr', 'levels.json'), 'utf8')) as CefrTable
    } catch {
      return { version: 1, states: [] }
    }
  }
  return cached!
}
