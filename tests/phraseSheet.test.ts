import { describe, expect, it } from 'vitest'
import { phraseSheetRules, systemPrompt } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { profileFromMeta, isPhraseSheet, blockLayout } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { newBlock, BLOCK_LABELS } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import { convertBlock } from '../src/renderer/src/modules/arbeitsblatt/generation/convert'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'
import type { WorksheetMeta, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  grade: 8,
  ...patch
})

describe('Hilfsblatt: Auftrag an die KI', () => {
  it('schweigt, solange keines gewünscht ist', () => {
    expect(phraseSheetRules(meta())).toBe('')
    expect(phraseSheetRules(meta({ phraseSheet: 'aus' }))).toBe('')
  })

  it('ordnet die Wendungen nach Sprachhandlung, nicht alphabetisch', () => {
    const rules = phraseSheetRules(meta({ phraseSheet: 'blatt' }))
    expect(rules).toContain('SPRACHHANDLUNG')
    expect(rules).toContain('nicht alphabetisch')
    expect(rules).toContain('phraseGroups')
  })

  it('verlangt vollständige Wendungen statt Einzelwörter', () => {
    expect(phraseSheetRules(meta({ phraseSheet: 'inline' }))).toContain('keine Einzelwörter ohne Kontext')
  })

  it('sagt der KI, wo das Blatt steht', () => {
    expect(phraseSheetRules(meta({ phraseSheet: 'blatt' }))).toContain('eigene Seite')
    expect(phraseSheetRules(meta({ phraseSheet: 'inline' }))).toContain('auf dem Aufgabenblatt')
  })

  it('erreicht den Auftrag an die KI', () => {
    const m = meta({ phraseSheet: 'blatt' })
    expect(systemPrompt(m, profileFromMeta(m))).toContain('NÜTZLICHE AUSDRÜCKE')
    const off = meta()
    expect(systemPrompt(off, profileFromMeta(off))).not.toContain('NÜTZLICHE AUSDRÜCKE')
  })
})

describe('Hilfsblatt: Baustein', () => {
  it('lässt sich im Editor hinzufügen und hat eine Bezeichnung', () => {
    const block = newBlock('phrases')
    expect(block.type).toBe('phrases')
    expect(BLOCK_LABELS.phrases).toContain('Ausdrücke')
  })

  it('übernimmt die Gruppen aus der KI-Antwort und wirft Leeres weg', () => {
    const block = convertBlock(
      {
        type: 'phrases',
        title: 'Useful phrases',
        body: 'Diese Wendungen helfen dir.',
        phraseGroups: [
          {
            label: 'eine Meinung äußern',
            items: [
              { text: 'In my opinion, …', german: 'Meiner Meinung nach …' },
              { text: '', german: 'leer' }
            ]
          },
          { label: 'leer', items: [] }
        ]
      },
      createRng(1),
      []
    )
    expect(block?.type).toBe('phrases')
    if (block?.type !== 'phrases') return
    expect(block.groups).toHaveLength(1)
    expect(block.groups[0].items).toHaveLength(1)
    expect(block.groups[0].items[0].german).toBe('Meiner Meinung nach …')
  })
})

describe('Hilfsblatt: Platz auf dem Material', () => {
  const phrases = { id: 'p', type: 'phrases', title: 'Useful phrases', hint: '', groups: [] } as unknown as WsBlock
  const task = {
    id: 't',
    type: 'task',
    instruction: 'Write.',
    operator: '',
    afbReason: '',
    socialForm: 'EA',
    answer: { kind: 'lines', count: 3 },
    parts: [],
    solution: 'x',
    points: 0,
    minutes: 5
  } as unknown as WsBlock

  it('erkennt den Baustein', () => {
    expect(isPhraseSheet(phrases)).toBe(true)
    expect(isPhraseSheet(task)).toBe(false)
  })

  it('nimmt ihn aus dem Aufgabenfluss, wenn er ein eigenes Blatt sein soll', () => {
    // Sonst stünde er zweimal da: im Fluss und auf der eigenen Seite
    expect(blockLayout([phrases, task], true).map((e) => e.block.id)).toEqual(['t'])
    expect(blockLayout([phrases, task], false).map((e) => e.block.id)).toEqual(['p', 't'])
  })
})
