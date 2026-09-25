import { describe, expect, it } from 'vitest'
import { defaultTestMeta, newTest } from '../src/renderer/src/modules/grammatiktest/model/defaults'
import { errorTargets, suggestedFormats, testingRules } from '../src/renderer/src/modules/grammatiktest/model/testRules'
import { spreadPoints, testPrompt } from '../src/renderer/src/modules/grammatiktest/generation/generateTest'
import { testHeadBlock, worksheetMetaForTest } from '../src/renderer/src/modules/grammatiktest/render/testWorksheet'
import { defaultTestName, testStats, testTopicLine } from '../src/renderer/src/modules/grammatiktest/library'
import { GRAMMAR_TOPICS } from '../src/renderer/src/modules/arbeitsblatt/didactics/grammar'
import type { GrammarTest, GrammarTestMeta } from '../src/renderer/src/modules/grammatiktest/model/types'
import type { WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const design = { id: 'd', name: 'Standard', header: {}, page: {}, tasks: {} } as never

const test = (patch: Partial<GrammarTestMeta> = {}, blocks: WsBlock[] = []): GrammarTest => {
  const t = newTest(design, 'NI', 'gymnasium', 'Gymnasium')
  return { ...t, meta: { ...t.meta, ...patch }, blocks }
}

const task = (id: string, points = 0): WsBlock =>
  ({
    id,
    type: 'task',
    instruction: 'Ergänze.',
    operator: '',
    afbReason: '',
    socialForm: 'EA',
    answer: { kind: 'lines', count: 2 },
    parts: [],
    solution: '',
    points,
    minutes: 2
  }) as unknown as WsBlock

describe('Voreinstellungen', () => {
  it('legt einen Test vorsichtig an: eingebettet und ohne Note', () => {
    const m = defaultTestMeta('NI', 'gymnasium', 'Gymnasium')
    // Eingebettet ist in mehr Ländern als Leistung verwendbar; benotet wird nur auf Ansage
    expect(m.embedded).toBe(true)
    expect(m.graded).toBe(false)
    expect(m.errorProfile).toBe(true)
    // Der Notenschlüssel steht im Lösungsteil, nicht auf dem Schülermaterial
    expect(m.gradeScaleOnSheet).toBe(false)
  })
})

describe('Landesvorgaben', () => {
  it('weist in Niedersachsen auf die nicht isolierte Bewertung hin', () => {
    const rules = testingRules(defaultTestMeta('NI', 'gymnasium', 'Gymnasium'))
    expect(rules.some((r) => r.text.includes('nicht isoliert'))).toBe(true)
  })

  it('schlägt dort das Einbetten vor, solange es nicht gewählt ist', () => {
    const off = testingRules({ ...defaultTestMeta('NI', 'gymnasium', 'Gymnasium'), embedded: false })
    expect(off.some((r) => r.suggestion?.includes('Zusammenhang einbetten'))).toBe(true)
    const on = testingRules(defaultTestMeta('NI', 'gymnasium', 'Gymnasium'))
    expect(on.find((r) => r.text.includes('nicht isoliert'))?.suggestion).toBeUndefined()
  })

  it('unterscheidet in Nordrhein-Westfalen nach dem Lernjahr', () => {
    const base = { ...defaultTestMeta('NW', 'gymnasium', 'Gymnasium'), languageOrder: 1 }
    // Klasse 7 = 3. Lernjahr: der Teil darf eine Kompetenz ersetzen
    const early = testingRules({ ...base, grade: 7 })
    expect(early.some((r) => r.text.includes('ersetzen') && r.severity === 'hinweis')).toBe(true)
    // Klasse 10 = 6. Lernjahr: nur noch ergänzend
    const late = testingRules({ ...base, grade: 10 })
    expect(late.some((r) => r.text.includes('nur noch ergänzen'))).toBe(true)
  })

  it('sagt beim benoteten Einzelsatz-Test, was er misst', () => {
    const rules = testingRules({ ...defaultTestMeta('BY', 'gymnasium', 'Gymnasium'), graded: true, embedded: false })
    expect(rules.some((r) => r.text.includes('nicht den Gebrauch'))).toBe(true)
  })
})

describe('Formatvorschlag', () => {
  it('nimmt die Formate der gewählten Formen', () => {
    const topic = GRAMMAR_TOPICS.find((t) => t.id === 'en.verb.past_simple')!
    expect(suggestedFormats([topic])).toEqual(topic.formats)
  })

  it('lässt bei rein rezeptiven Formen keine offenen Formate zu', () => {
    // Wer eine Form nur erkennen soll, kann sie noch nicht produzieren
    const receptive = GRAMMAR_TOPICS.find((t) => t.receptive && t.formats.length)!
    const formats = suggestedFormats([receptive])
    expect(formats).not.toContain('freieanwendung')
    expect(formats).not.toContain('satzbildung')
  })

  it('fällt ohne Angabe auf eine brauchbare Grundausstattung zurück', () => {
    expect(suggestedFormats([]).length).toBeGreaterThan(0)
  })
})

describe('Fehlerprofil', () => {
  it('zerlegt mehrere Stolperstellen eines Themas in einzelne Ziele', () => {
    const targets = errorTargets({ ...defaultTestMeta('NI', 'gymnasium', 'Gymnasium'), topics: ['en.verb.present_simple'] })
    expect(targets.length).toBeGreaterThan(1)
    expect(targets.every((t) => t.error.trim().length > 0)).toBe(true)
  })

  it('bleibt leer, wenn zum Thema keine Fehler hinterlegt sind', () => {
    const without = GRAMMAR_TOPICS.find((t) => !t.errors.trim())
    if (!without) return
    expect(errorTargets({ ...defaultTestMeta('NI', 'gymnasium', 'Gymnasium'), topics: [without.id] })).toHaveLength(0)
  })
})

describe('Auftrag an die KI', () => {
  it('sagt, dass geprüft und nicht erarbeitet wird', () => {
    const prompt = testPrompt(test({ topics: ['en.verb.past_simple'] }))
    expect(prompt).toContain('GEPRÜFT, nicht erarbeitet')
    expect(prompt).toContain('kein Merkkasten')
  })

  it('gibt die belegten Stolperstellen mit', () => {
    const prompt = testPrompt(test({ topics: ['en.verb.pp_vs_past'] }))
    expect(prompt).toContain('STOLPERSTELLEN')
    expect(prompt).toContain('I have seen him yesterday')
  })

  it('verlangt den zusammenhängenden Text, wenn eingebettet', () => {
    expect(testPrompt(test({ topics: ['en.verb.past_simple'], embedded: true }))).toContain('EINGEBETTET')
    expect(testPrompt(test({ topics: ['en.verb.past_simple'], embedded: false }))).not.toContain('EINGEBETTET')
  })

  it('sperrt Produktionsaufgaben bei rein rezeptiven Formen', () => {
    const receptive = GRAMMAR_TOPICS.find((t) => t.receptive)!
    const prompt = testPrompt(test({ subjectId: receptive.subject, topics: [receptive.id] }))
    expect(prompt).toContain('NUR ERKENNEN')
  })
})

describe('Punkte', () => {
  it('verteilt sie ohne Rest auf die Aufgaben', () => {
    const blocks = [task('a'), task('b'), task('c')]
    spreadPoints(blocks, 20)
    const sum = blocks.reduce((n, b) => n + (b.type === 'task' ? b.points : 0), 0)
    expect(sum).toBe(20)
    // Der Rest geht an die vorderen Aufgaben
    expect(blocks.map((b) => (b.type === 'task' ? b.points : 0))).toEqual([7, 7, 6])
  })

  it('kommt mit einer einzigen Aufgabe zurecht', () => {
    const blocks = [task('a')]
    spreadPoints(blocks, 5)
    expect(blocks[0].type === 'task' && blocks[0].points).toBe(5)
  })
})

describe('Test als Blatt', () => {
  it('nennt Zeit, Punkte und die geprüfte Form im Kopf', () => {
    const head = testHeadBlock(test({ topics: ['en.verb.past_simple'] }, [task('a', 20)]))
    const body = head?.type === 'infoBox' ? head.body : ''
    expect(body).toContain('Time: 20 minutes')
    expect(body).toContain('20 points')
    expect(body).toContain('Focus:')
  })

  it('druckt den Notenschlüssel nur auf Wunsch aufs Testblatt', () => {
    const off = testHeadBlock(test({ topics: ['en.verb.past_simple'], graded: true }, [task('a', 20)]))
    expect(off?.type === 'infoBox' ? off.body : '').not.toContain('Marks:')
    const on = testHeadBlock(test({ topics: ['en.verb.past_simple'], graded: true, gradeScaleOnSheet: true }, [task('a', 20)]))
    expect(on?.type === 'infoBox' ? on.body : '').toContain('Marks:')
  })

  it('gibt den Schlüssel an den Lösungsteil weiter – aber nur bei Benotung', () => {
    const graded = worksheetMetaForTest(test({ topics: ['en.verb.past_simple'], graded: true }, [task('a', 20)]))
    expect(graded.gradeScale?.groups[0].points).toBe(20)
    const ungraded = worksheetMetaForTest(test({ topics: ['en.verb.past_simple'], graded: false }, [task('a', 20)]))
    expect(ungraded.gradeScale).toBeUndefined()
  })
})

describe('Speichern', () => {
  it('kennzeichnet einen Test in der Übersicht über die geprüften Formen', () => {
    const t = test({ topics: ['en.verb.past_simple', 'en.verb.present_perfect'] }, [task('a', 10), task('b', 10)])
    expect(testTopicLine(t)).toBe('Einfache Vergangenheit, Perfekt')
    const stats = testStats(t)
    expect(stats.taskCount).toBe(2)
    expect(stats.points).toBe(20)
    expect(stats.grade).toBe(7)
    expect(stats.graded).toBe(false)
  })

  it('schlägt einen Namen vor: Titel, sonst Fach und Formen', () => {
    expect(defaultTestName(test({ title: 'Test 3', topics: ['en.verb.past_simple'] }))).toBe('Test 3')
    expect(defaultTestName(test({ topics: ['en.verb.past_simple'] }))).toBe('Englisch – Einfache Vergangenheit')
    // Ohne gewählte Form bleibt wenigstens das Fach stehen
    expect(defaultTestName(test())).toBe('Grammatiktest Englisch')
  })

  it('zählt nur Aufgaben, nicht den Materialtext', () => {
    const material = { id: 'm', type: 'text', title: 'M1', body: 'Text', lineNumbers: false, source: '', glossary: [] } as unknown as WsBlock
    const stats = testStats(test({ topics: ['en.verb.past_simple'] }, [material, task('a', 12)]))
    expect(stats.taskCount).toBe(1)
    expect(stats.points).toBe(12)
  })
})

describe('Der KI-Auftrag ist vollständig', () => {
  it('trägt einen Schemanamen – die Anbieter verlangen ihn', async () => {
    // Ohne Namen scheiterte der Aufruf still; ein `as never`-Cast hatte den Typfehler verdeckt
    const { generateTest } = await import('../src/renderer/src/modules/grammatiktest/generation/generateTest')
    const seen: Record<string, unknown>[] = []
    const ai = async <T>(req: Record<string, unknown>): Promise<T> => {
      seen.push(req)
      return { blocks: [] } as T
    }
    await expect(generateTest(test({ topics: ['en.verb.past_simple'] }), ai as never)).rejects.toThrow(/keine Aufgaben/)
    expect(seen[0].schemaName).toBe('grammar_test')
    expect(seen[0].schema).toBeDefined()
    expect(String(seen[0].system)).toContain('GRAMMATIKTEST')
  })

  it('meldet einen Zwischenstand, solange die eine lange Anfrage läuft', async () => {
    // Ein Grammatiktest ist EIN Aufruf über mehrere Minuten. Ohne Rückmeldung drehte sich nur
    // der Knopf, und man konnte Arbeiten nicht von Hängen unterscheiden.
    const { generateTest } = await import('../src/renderer/src/modules/grammatiktest/generation/generateTest')
    const steps: string[] = []
    const ai = async <T>(): Promise<T> =>
      ({
        blocks: [{ type: 'task', instruction: 'Setze ein.', answer: { kind: 'gapText', gapText: 'He [[has seen]] it.' }, solution: 'has seen', minutes: 3 }]
      }) as T
    await generateTest(test({ topics: ['en.verb.past_simple'] }), ai as never, (m) => steps.push(m))
    expect(steps.length).toBeGreaterThan(0)
    expect(steps[0]).toMatch(/\S/)
  })

  it('verlangt jedes Feld des Schemas, wie es der strikte Modus fordert', async () => {
    const { TEST_SCHEMA } = await import('../src/renderer/src/modules/grammatiktest/generation/generateTest')
    const item = (TEST_SCHEMA as { properties: { blocks: { items: { properties: object; required: string[] } } } }).properties.blocks.items
    expect(item.required.length).toBe(Object.keys(item.properties).length)
    expect(item.required).toContain('grammarTopicId')
    expect(item.required).toContain('grammarError')
  })

  it('bleibt schlank – ein Test braucht keine Bild- und Gitterfelder', async () => {
    // Im strikten Modus muss die KI JEDES Feld für JEDEN Baustein ausfüllen.
    // Überflüssige Felder kosten bei jeder Aufgabe Platz und machen die Antwort fehleranfälliger.
    const { TEST_SCHEMA } = await import('../src/renderer/src/modules/grammatiktest/generation/generateTest')
    const props = Object.keys(
      (TEST_SCHEMA as { properties: { blocks: { items: { properties: Record<string, unknown> } } } }).properties.blocks.items.properties
    )
    for (const unwanted of ['imageDescription', 'imageLabels', 'axes', 'speakers', 'brief', 'glossary', 'phraseGroups']) {
      expect(props, unwanted).not.toContain(unwanted)
    }
    expect(props.length).toBeLessThan(15)
  })

  it('scheitert hörbar, wenn keine Aufgabe zurückkommt', async () => {
    const { generateTest } = await import('../src/renderer/src/modules/grammatiktest/generation/generateTest')
    const ai = async <T>(): Promise<T> => ({ blocks: [{ type: 'text', title: 'M1', body: 'Nur Material' }] }) as T
    await expect(generateTest(test({ topics: ['en.verb.past_simple'] }), ai as never)).rejects.toThrow(/keine Aufgaben/)
  })
})
