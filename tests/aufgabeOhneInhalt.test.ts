// Aufgabe ohne ihre Items (18.11.2026, Befund Englisch 5b „Welcome to Maya's home!"): „Complete the statements …"
// mit Beispiel, aber ohne einen einzigen Satzanfang – auch nach dem Neuerzeugen. Prüfung + Nachforderung.
import { describe, expect, it } from 'vitest'
import { fehlenderAufgabeninhalt, leeresFormat } from '../src/renderer/src/modules/arbeitsblatt/didactics/antwortInhalt'
import { aufgabeOhneInhalt, checkIntegrity } from '../src/renderer/src/modules/arbeitsblatt/didactics/integrity'
import { regenerateBlock } from '../src/renderer/src/modules/arbeitsblatt/generation/generate'
import { taskContext } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer, newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { Answer, Sheet, TaskBlock, TextBlock, Worksheet, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { profileFromMeta } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'

const antwort = (kind: Answer['kind'], mehr: Partial<Answer> = {}): Answer => ({ ...emptyAnswer(kind), ...mehr })
const aufgabe = (instruction: string, answer: Answer, parts: TaskBlock['parts'] = []): TaskBlock =>
  ({ ...(newBlock('task') as TaskBlock), instruction, answer, parts, solution: 'x' }) as TaskBlock

// Wortlaut des echten Blattes
const BEFUND = "**Complete** the statements according to M{blog}. Use your own words. (Ergänze die Sätze mit Informationen aus dem Blog.)\n\nExample: Tom's room is … → small."

describe('Aufgabe ohne Items', () => {
  it('meldet den Befund der 5b – Format none und Format gapText ohne Lücken', () => {
    expect(fehlenderAufgabeninhalt(aufgabe(BEFUND, antwort('none', { count: 3 })))).toHaveLength(1)
    expect(fehlenderAufgabeninhalt(aufgabe(BEFUND, antwort('lines', { count: 3 })))).toHaveLength(1)
    expect(fehlenderAufgabeninhalt(aufgabe(BEFUND, antwort('gapText', { gapText: '' })))[0]).toMatch(/Lückentext ist leer/)
  })

  it('lässt vollständige Aufgaben in Ruhe', () => {
    expect(fehlenderAufgabeninhalt(aufgabe(BEFUND, antwort('gapText', { gapText: "5 On Saturdays Dad likes to [[watch football]].\n6 In the bathroom there is [[no bath]]." })))).toEqual([])
    // Items als Teilaufgaben (wie Aufgabe 3 des Blattes)
    const teil = { id: 'p', instruction: 'Where can Maya read?', answer: antwort('lines', { count: 1 }), solution: 'x' }
    expect(fehlenderAufgabeninhalt(aufgabe('**Answer** the questions about M{blog}.', antwort('lines'), [teil]))).toEqual([])
    // Items als Liste in der Anweisung (wie Aufgabe 4)
    expect(fehlenderAufgabeninhalt(aufgabe('**Complete** the sentences.\n\n- Dad watches football in …\n- Maya reads next to …', antwort('lines')))).toEqual([])
    // Freie Schreibaufgabe
    expect(fehlenderAufgabeninhalt(aufgabe('**Write** an email to Maya about your favourite room.', antwort('lines', { count: 8 })))).toEqual([])
    // „Answer the questions" allein wird nicht gemeldet – die Fragen können im Material stehen
    expect(fehlenderAufgabeninhalt(aufgabe('**Answer** the questions in M2.', antwort('lines')))).toEqual([])
  })

  it('meldet leere Formate auch in Teilaufgaben und bei allen Formaten mit Inhalt', () => {
    expect(leeresFormat(antwort('trueFalse'))).toBeTruthy()
    expect(leeresFormat(antwort('multipleChoice', { options: ['a'] }))).toBeTruthy()
    expect(leeresFormat(antwort('matching', { left: ['a', 'b'], right: [] }))).toBeTruthy()
    expect(leeresFormat(antwort('ordering', { items: ['a', 'b'] }))).toBeNull()
    expect(leeresFormat(antwort('lines'))).toBeNull()
    const leer = { id: 'p', instruction: 'Tick.', answer: antwort('multipleChoice'), solution: 'x' }
    expect(fehlenderAufgabeninhalt(aufgabe('**Tick** the correct answer.', antwort('multipleChoice'), [leer]))[0]).toMatch(/^Teilaufgabe a\)/)
  })

  it('erkennt deutsche und französische/spanische Anweisungen', () => {
    expect(fehlenderAufgabeninhalt(aufgabe('**Ergänze** die Sätze mithilfe von M1.', antwort('none')))).toHaveLength(1)
    expect(fehlenderAufgabeninhalt(aufgabe('**Kreuze** die richtige Antwort an.', antwort('lines')))).toHaveLength(1)
    expect(fehlenderAufgabeninhalt(aufgabe('**Complète** les phrases.', antwort('none')))).toHaveLength(1)
    expect(fehlenderAufgabeninhalt(aufgabe('**Completa** las frases.', antwort('none')))).toHaveLength(1)
  })

  it('stehen die Lücken im verwiesenen Material, ist die Aufgabe vollständig', () => {
    const text = { ...(newBlock('text') as TextBlock), title: 'M1', body: 'Maya lives in ___ house.' } as WsBlock
    const t = aufgabe('**Fill in** the gaps in M1.', antwort('none'))
    expect(aufgabeOhneInhalt(t, [text, t])).toEqual([])
    expect(aufgabeOhneInhalt(t, [t])).toHaveLength(1)
  })

  it('checkIntegrity meldet den Befund als schwer – die Nachbesserung läuft dann an', () => {
    const text = { ...(newBlock('text') as TextBlock), title: 'M1', body: 'Maya’s blog …' } as WsBlock
    const t = aufgabe(BEFUND.replace('M{blog}', 'M1'), antwort('none'))
    const sheet: Sheet = { id: 's', label: 'A', blocks: [text, t] }
    const f = checkIntegrity(sheet).filter((x) => x.blockId === t.id)
    expect(f.map((x) => x.severity)).toEqual(['hoch'])
  })

  it('jeder Erzeugungsauftrag verlangt vollständige Aufgaben', () => {
    const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'englisch', grade: 5 }
    expect(taskContext(meta, profileFromMeta(meta))).toMatch(/VOLLSTÄNDIGE AUFGABEN/)
  })

  it('Neuerzeugen fordert fehlende Items einmal nach und meldet sie, wenn sie dann noch fehlen', async () => {
    const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'englisch', grade: 5 }
    const alt = aufgabe(BEFUND, antwort('none'))
    const sheet: Sheet = { id: 's', label: 'A', blocks: [alt] }
    const ws = { meta, sheets: [sheet], sources: [] } as unknown as Worksheet
    const leer = { block: { type: 'task', instruction: BEFUND, answer: { kind: 'none' }, parts: [], solution: '5 … 6 …' } }
    const voll = { block: { type: 'task', instruction: BEFUND, answer: { kind: 'gapText', gapText: '5 Dad likes to [[watch football]].' }, parts: [], solution: '5 watch football' } }

    // 1. Versuch leer, Nachforderung liefert → vollständig, ohne Hinweis
    const anfragen: string[] = []
    let n = 0
    const ai1 = (async (req: { user: string }) => {
      anfragen.push(req.user)
      return n++ === 0 ? leer : voll
    }) as never
    const b1 = (await regenerateBlock(ws, sheet, alt.id, profileFromMeta(meta), ai1, '', 'einfacher', 'neu')) as TaskBlock
    expect(b1.answer.gapText).toContain('[[watch football]]')
    expect(anfragen).toHaveLength(2)
    expect(anfragen[1]).toMatch(/PFLICHT: .*Liefere alle Items vollständig/)
    expect((b1.warnings ?? []).some((w) => w.startsWith('[Vollständigkeit]'))).toBe(false)

    // 2. Beide Versuche leer → Hinweis am Baustein statt stillem Fehler
    const ai2 = (async () => leer) as never
    const b2 = await regenerateBlock(ws, sheet, alt.id, profileFromMeta(meta), ai2)
    expect((b2.warnings ?? []).some((w) => w.startsWith('[Vollständigkeit]'))).toBe(true)
  })
})
