import { normalizeDesign } from '@shared/design'
import type { Kurztest } from './model/types'

/**
 * Weitergebbare Datei einer Lernzielkontrolle (27.09.2026) – wie `.arbeitsblatt`:
 * „Als Datei speichern" in der Werkzeugleiste, „Datei öffnen …" in der Bibliothek.
 */
interface ProjectFile {
  app: 'schul-apps'
  type: 'lernzielkontrolle'
  version: 1
  test: Kurztest
}

export const KURZTEST_FILTER = [{ name: 'Lernzielkontrolle', extensions: ['lernzielkontrolle'] }]

export function serializeKurztest(test: Kurztest): string {
  const file: ProjectFile = { app: 'schul-apps', type: 'lernzielkontrolle', version: 1, test }
  return JSON.stringify(file)
}

export function parseKurztestFile(data: Uint8Array): Kurztest {
  let parsed: ProjectFile
  try {
    parsed = JSON.parse(new TextDecoder().decode(data)) as ProjectFile
  } catch {
    throw new Error('Die Datei ist keine gültige Lernzielkontrolle-Datei.')
  }
  if (parsed?.type !== 'lernzielkontrolle' || !Array.isArray(parsed.test?.varianten)) {
    throw new Error('Die Datei ist keine gültige Lernzielkontrolle-Datei.')
  }
  const test = parsed.test
  return { ...test, design: normalizeDesign(test.design) }
}
