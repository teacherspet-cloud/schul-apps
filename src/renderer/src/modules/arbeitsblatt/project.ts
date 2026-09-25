import { normalizeDesign } from '@shared/design'
import type { Worksheet } from './model/types'

interface ProjectFile {
  app: 'schul-apps'
  type: 'arbeitsblatt'
  version: 1
  worksheet: Worksheet
}

export const WORKSHEET_FILTER = [{ name: 'Arbeitsblatt', extensions: ['arbeitsblatt'] }]

/** Die Designvorlage wird als Kopie mitgespeichert, damit das Blatt überall gleich aussieht. */
export function serializeWorksheet(ws: Worksheet): string {
  const file: ProjectFile = { app: 'schul-apps', type: 'arbeitsblatt', version: 1, worksheet: ws }
  return JSON.stringify(file)
}

export function parseWorksheetFile(data: Uint8Array): Worksheet {
  let parsed: ProjectFile
  try {
    parsed = JSON.parse(new TextDecoder().decode(data)) as ProjectFile
  } catch {
    throw new Error('Die Datei ist keine gültige Arbeitsblatt-Datei.')
  }
  if (parsed?.type !== 'arbeitsblatt' || !Array.isArray(parsed.worksheet?.sheets)) {
    throw new Error('Die Datei ist keine gültige Arbeitsblatt-Datei.')
  }
  const ws = parsed.worksheet
  return { ...ws, design: normalizeDesign(ws.design) }
}
