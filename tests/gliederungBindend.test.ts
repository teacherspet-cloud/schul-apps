import { describe, expect, it } from 'vitest'
import { generateSheet } from '../src/renderer/src/modules/arbeitsblatt/generation/generate'
import { listeningTextRules } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { profileFromMeta } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { Outline, WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  grade: 8,
  ...patch
})

const outline = (types: string[]): Outline => ({
  title: 'Test',
  learningGoals: ['Ich kann …'],
  minutes: 45,
  teacherNote: '',
  items: types.map((type, i) => ({
    id: `i${i}`,
    type: type as Outline['items'][number]['type'],
    purpose: 'etwas',
    operator: '',
    socialForm: 'EA' as const,
    answerKind: 'lines' as const
  }))
})

/** Fängt den Auftrag ab, statt die KI zu fragen. */
async function promptOf(m: WorksheetMeta, o: Outline): Promise<string> {
  let seen = ''
  const ai = async <T>(req: { user: string }): Promise<T> => {
    seen = req.user
    return { blocks: [] } as T
  }
  await generateSheet({ meta: m, outline: o, sources: [] }, profileFromMeta(m), null, ai as never)
  return seen
}

describe('Die Gliederung ist verbindlich', () => {
  it('verbietet die Selbsteinschätzung, wenn sie aus der Gliederung entfernt wurde', async () => {
    /*
     * Unter den Profilregeln steht „Selbsteinschätzung am Ende" – die gilt für die Planung.
     * Wurde sie danach abgewählt, erschien sie trotzdem: zwei Anweisungen widersprachen sich.
     */
    const auftrag = await promptOf(meta(), outline(['learningGoals', 'text', 'task']))
    expect(auftrag).toMatch(/KEINE Selbsteinschätzung/)
    expect(auftrag).toMatch(/Gliederung ist verbindlich/)
  })

  it('schweigt dazu, wenn die Selbsteinschätzung in der Gliederung steht', async () => {
    const auftrag = await promptOf(meta(), outline(['task', 'selfCheck']))
    expect(auftrag).toMatch(/Gliederung ist verbindlich/)
    expect(auftrag).not.toMatch(/KEINE Selbsteinschätzung/)
  })
})

describe('Sprache der Vorentlastung beim Hörverstehen', () => {
  const hoeren = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => meta({ skillFocus: 'listening', audioAi: true, ...patch })

  it('steht in der Zielsprache, nicht auf Deutsch', () => {
    // Sie stand fest auf Deutsch – mitten zwischen den zielsprachigen Aufgaben
    const rules = listeningTextRules(hoeren())
    expect(rules).toMatch(/VORENTLASTUNG.*auf Englisch/)
    expect(rules).not.toMatch(/VORENTLASTUNG.*auf Deutsch/)
  })

  it('bleibt deutsch, wenn die Lehrkraft deutsche Arbeitsanweisungen gewählt hat', () => {
    expect(listeningTextRules(hoeren({ instructionsInGerman: true }))).toMatch(/VORENTLASTUNG.*auf Deutsch/)
  })

  it('richtet sich nach dem Fach', () => {
    expect(listeningTextRules(hoeren({ subjectId: 'franzoesisch', subjectLabel: 'Französisch' }))).toMatch(/VORENTLASTUNG.*auf Französisch/)
  })
})
