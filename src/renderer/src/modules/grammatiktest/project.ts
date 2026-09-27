import { normalizeDesign } from '@shared/design'
import type { GrammarTest } from './model/types'

/**
 * Weitergebbare Datei eines Grammatiktests (27.09.2026) – wie `.arbeitsblatt`:
 * „Als Datei speichern" in der Werkzeugleiste, „Datei öffnen …" in der Bibliothek.
 */
interface ProjectFile {
  app: 'schul-apps'
  type: 'grammatiktest'
  version: 1
  test: GrammarTest
}

export const GRAMMATIKTEST_FILTER = [{ name: 'Grammatiktest', extensions: ['grammatiktest'] }]

export function serializeGrammarTest(test: GrammarTest): string {
  const file: ProjectFile = { app: 'schul-apps', type: 'grammatiktest', version: 1, test }
  return JSON.stringify(file)
}

export function parseGrammarTestFile(data: Uint8Array): GrammarTest {
  let parsed: ProjectFile
  try {
    parsed = JSON.parse(new TextDecoder().decode(data)) as ProjectFile
  } catch {
    throw new Error('Die Datei ist keine gültige Grammatiktest-Datei.')
  }
  if (parsed?.type !== 'grammatiktest' || !Array.isArray(parsed.test?.blocks)) {
    throw new Error('Die Datei ist keine gültige Grammatiktest-Datei.')
  }
  const test = parsed.test
  return { ...test, design: normalizeDesign(test.design) }
}
