import { describe, expect, it } from 'vitest'
import { faerbeMarken, mitAntworten } from '../src/renderer/src/modules/onlinetest/blattAnsicht'
import type { Variant } from '../src/renderer/src/modules/vokabeltest/model/types'

/* Korrekturzeichen in der Blattansicht (03.10.2026): anklickbar, auch (✓) und ? der Lehrkraft */
describe('Korrekturzeichen', () => {
  const v = {
    id: 'A',
    label: 'A',
    blocks: [
      {
        id: 'g',
        kind: 'gap',
        taskType: 'gapSentences',
        title: '',
        instruction: '',
        pointsPerItem: 1,
        wordBank: false,
        firstLetterHint: false,
        extraBankWords: [],
        items: ['a', 'b', 'c', 'd'].map((id) => ({ id, sentences: [{ before: 'x', after: 'y' }], answer: 'z' }))
      }
    ]
  } as unknown as Variant
  it('Lehrkraft-Zeichen stehen mit Kennung an der Lücke', () => {
    const r = mitAntworten(
      v,
      { 'g.a.a': 'eins', 'g.b.a': 'zwei', 'g.c.a': 'drei', 'g.d.a': 'vier' },
      {
        'g.a.a': { status: 'richtig', punkte: 1, quelle: 'lehrkraft' },
        'g.b.a': { status: 'richtig', punkte: 1, quelle: 'lehrkraft', knapp: true },
        'g.c.a': { status: 'falsch', punkte: 0, quelle: 'lehrkraft' },
        'g.d.a': { status: 'falsch', punkte: 0, quelle: 'lehrkraft', frage: true }
      }
    )
    const antworten = (r.blocks[0] as unknown as { items: { answer: string }[] }).items.map((i) => i.answer)
    expect(antworten).toEqual(['eins ✓⟦g.a.a⟧', 'zwei (✓)⟦g.b.a⟧', 'drei ✗⟦g.c.a⟧', 'vier ?⟦g.d.a⟧'])
  })
  it('im HTML anklickbar, Kennung nicht sichtbar', () => {
    const html = faerbeMarken('<span>zwei (✓)⟦g.b.a⟧</span><span>vier ?⟦g.d.a⟧</span><span>alt ✓</span>')
    expect(html).toContain('<span class="vt-marke vt-marke-ok vt-marke-knapp" data-einheit="g.b.a">(✓)</span>')
    expect(html).toContain('<span class="vt-marke vt-marke-offen" data-einheit="g.d.a">?</span>')
    expect(html).toContain('<span class="vt-marke vt-marke-ok">✓</span>')
    expect(html).not.toContain('⟦')
  })
})
