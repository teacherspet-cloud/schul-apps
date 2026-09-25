import type { TestDocument } from './model/types'

interface ProjectFile {
  app: 'schul-apps'
  type: 'vokabeltest'
  version: 1
  doc: TestDocument
}

export function serializeProject(doc: TestDocument): string {
  const file: ProjectFile = { app: 'schul-apps', type: 'vokabeltest', version: 1, doc }
  return JSON.stringify(file)
}

export function parseProjectFile(data: Uint8Array): TestDocument {
  let parsed: ProjectFile
  try {
    parsed = JSON.parse(new TextDecoder().decode(data)) as ProjectFile
  } catch {
    throw new Error('Die Datei ist keine gültige Vokabeltest-Datei.')
  }
  if (parsed?.type !== 'vokabeltest' || !parsed.doc?.variants) {
    throw new Error('Die Datei ist keine gültige Vokabeltest-Datei.')
  }
  return parsed.doc
}

export const PROJECT_FILTER = [{ name: 'Vokabeltest', extensions: ['vokabeltest'] }]
