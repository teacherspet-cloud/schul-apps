import { describe, expect, it } from 'vitest'
import { alternativen, bewerte, onlineFassung } from '../src/renderer/src/modules/onlinetest/kern'
import { alternativenAnfrage as grammatikAnfrage, alternativenEinarbeiten } from '../src/renderer/src/modules/grammatiktest/generation/lueckenAlternativen'
import type { WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { alternativenAnfrage, alternativenUebernehmen, hatWortkasten, kastenWoerter } from '../src/renderer/src/modules/vokabeltest/generation/lueckenAlternativen'
import type { GapBlock, GapTextBlock, Variant } from '../src/renderer/src/modules/vokabeltest/model/types'

/*
 * Befund der Lehrkraft (23.10.2026): In manchen Lücken passen mehrere Wörter des Wortkastens. Abgestimmt: alle passenden
 * gelten (Lösung „auch: …“, Onlinetest richtig), jede Lücke wird für sich gewertet.
 */
const basis = { title: 'T', instruction: 'Fill in.', pointsPerItem: 1 }
const lueckenSaetze = (): GapBlock =>
  ({
    id: 'b-gap',
    taskType: 'gapSentences',
    kind: 'gap',
    ...basis,
    wordBank: true,
    firstLetterHint: false,
    extraBankWords: ['angry'],
    items: [
      { id: 'g1', sentences: [{ before: 'The elephant is very', after: '.' }], answer: 'big', bankWord: 'big' },
      { id: 'g2', sentences: [{ before: 'Our flat is', after: 'for five people.' }], answer: 'large', bankWord: 'large' },
      { id: 'g3', sentences: [{ before: 'She was', after: 'because he lied.' }], answer: 'sad', bankWord: 'sad' }
    ]
  }) as GapBlock
const lueckenText = (): GapTextBlock =>
  ({
    id: 'b-text',
    taskType: 'gapText',
    kind: 'gapText',
    ...basis,
    wordBank: true,
    firstLetterHint: false,
    extraBankWords: [],
    parts: [
      { type: 'text', text: 'Tom ' },
      { type: 'gap', id: 'p1', answer: 'eats', bankWord: 'eat' },
      { type: 'text', text: ' an apple and ' },
      { type: 'gap', id: 'p2', answer: 'drinks', bankWord: 'drink' },
      { type: 'text', text: ' tea.' }
    ]
  }) as GapTextBlock

describe('Auch richtig in Lücken mit Wortkasten', () => {
  it('nur Aufgaben mit Wortkasten; Kasten mit Zusatzwörtern', () => {
    expect(hatWortkasten(lueckenSaetze())).toBe(true)
    expect(hatWortkasten({ ...lueckenSaetze(), wordBank: false })).toBe(false)
    expect(kastenWoerter(lueckenSaetze())).toEqual(['big', 'large', 'sad', 'angry'])
    expect(alternativenAnfrage(lueckenSaetze(), 'sys').user).toContain('big, large, sad, angry')
  })

  it('übernimmt nur Wörter aus dem Kasten, nie die Lösung selbst – auch angepasste Formen', () => {
    const b = lueckenSaetze()
    const mit = alternativenUebernehmen(b, {
      gaps: [
        { itemNumber: 1, alsoCorrect: ['large', 'huge', 'big'] },
        { itemNumber: 2, alsoCorrect: ['big'] },
        { itemNumber: 3, alsoCorrect: ['angry'] }
      ]
    })
    expect(mit).toEqual([1, 2, 3])
    expect(b.items.map((i) => i.auchRichtig)).toEqual([['large'], ['big'], ['angry']])
    const t = lueckenText()
    expect(alternativenUebernehmen(t, { gaps: [{ itemNumber: 1, alsoCorrect: ['drinks', 'cooks'] }, { itemNumber: 2, alsoCorrect: [] }] })).toEqual([1])
    expect(t.parts.flatMap((p) => (p.type === 'gap' ? [p.auchRichtig] : []))).toEqual([['drinks'], undefined])
  })

  it('Onlinetest: Alternative zählt, jede Lücke für sich (kein Ausgleich für die „verbrauchte“ Lücke)', () => {
    const b = lueckenSaetze()
    b.items[0].auchRichtig = ['large']
    b.items[1].auchRichtig = ['big']
    const variante: Variant = { id: 'A', label: 'A', blocks: [b] }
    const f = onlineFassung(variante)
    const [e1, e2, e3] = f.einheiten.map((e) => e.felder[0])
    // „large“ in Lücke 1 (richtig als Alternative), Lücke 2 leer, Lücke 3 falsch
    const w = bewerte(f, { [e1]: 'large', [e2]: '', [e3]: 'happy' })
    expect(w[e1].status).toBe('richtig')
    expect(w[e2].status).not.toBe('richtig')
    expect(w[e3].status).not.toBe('richtig')
    // Die Schülerfassung verrät die Alternativen nicht
    expect(JSON.stringify(f).includes('auchRichtig')).toBe(false)
  })
})

// Grammatiktest (23.10.2026): gleiche Frage – dort gab es keine Prüfrunde auf weitere richtige Lösungen

describe('Grammatiktest: weitere richtige Lösungen in Lücken', () => {
  const aufgabe = (): WsBlock[] =>
    [
      {
        id: 't1',
        type: 'task',
        instruction: 'Fill in the relative pronoun.',
        answer: { kind: 'gapText', gapText: 'The man [[who]] lives next door is a pilot. The book [[which / that]] I read was long.' },
        parts: [],
        solution: ''
      }
    ] as unknown as WsBlock[]

  it('fragt nummeriert nach, arbeitet Alternativen in die Lücke ein – ohne Doppeltes', () => {
    const b = aufgabe()
    const a = grammatikAnfrage(b, 'Englisch')!
    expect(a.user).toContain('(1)[[who]]')
    expect(a.user).toContain('(2)[[which / that]]')
    const neu = alternativenEinarbeiten(b, { aufgaben: [{ id: 'a1', luecken: [{ nr: 1, auch: ['that'] }, { nr: 2, auch: ['That'] }] }] })
    expect(neu).toBe(1)
    const text = (b[0] as unknown as { answer: { gapText: string } }).answer.gapText
    expect(text).toBe('The man [[who / that]] lives next door is a pilot. The book [[which / that]] I read was long.')
    // Der Onlinetest wertet jede Form der Lücke als richtig
    expect(alternativen('who / that')).toEqual(['who', 'that'])
  })

  it('ohne Lückentext keine Anfrage', () => {
    expect(grammatikAnfrage([{ id: 'x', type: 'task', instruction: 'Write.', answer: { kind: 'lines', count: 3 }, parts: [], solution: '' }] as unknown as WsBlock[], 'Englisch')).toBeNull()
  })
})
