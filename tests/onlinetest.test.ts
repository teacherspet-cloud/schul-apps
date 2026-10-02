import { describe, expect, it } from 'vitest'
import { bewerte, normalisiere, offeneEinheiten, onlineFassung, summe, vergleiche } from '../src/renderer/src/modules/onlinetest/kern'
import { kiAnfrage, urteileAus } from '../src/renderer/src/modules/onlinetest/kiBewertung'
import type { Block, Variant } from '../src/renderer/src/modules/vokabeltest/model/types'

/*
 * Onlinetest (02.10.2026): Schülerfassung OHNE Lösungen, Bewertung ganz oder gar nicht,
 * Offenes an die KI (nur mit Kennungen), halbe Punkte gibt es nicht.
 */
const basis = { title: 'T', instruction: 'Do it.', pointsPerItem: 1 }
const bl = (b: Partial<Block> & { kind: Block['kind'] }): Block => ({ id: `b-${b.kind}`, taskType: 'gapSentences', ...basis, ...b }) as Block

const variante: Variant = {
  id: 'A',
  label: 'A',
  blocks: [
    bl({ kind: 'gap', items: [{ id: 'g1', sentences: [{ before: 'I go to', after: 'every day.' }], answer: 'school' }], wordBank: false, firstLetterHint: false, extraBankWords: [] }),
    bl({
      kind: 'match',
      leftLabel: 'EN',
      rightLabel: 'DE',
      left: [{ id: 'l1', text: 'dog', answerId: 'r2' }],
      right: [
        { id: 'r1', text: 'Katze' },
        { id: 'r2', text: 'Hund' }
      ]
    }),
    bl({ kind: 'choice', items: [{ id: 'c1', before: 'She', after: 'home.', options: ['go', 'goes'], correct: 1 }] }),
    bl({ kind: 'open', items: [{ id: 'o1', prompt: 'Neue Schüler integrieren sich leichter. (to integrate)', modelAnswer: 'New students integrate more easily.', lines: 2 }] }),
    bl({ kind: 'trueFalse', askCorrection: true, items: [{ id: 't1', statement: 'A cat barks.', isTrue: false, correction: 'A dog barks.' }] }),
    bl({ kind: 'oddOneOut', askReason: true, items: [{ id: 'x1', words: ['apple', 'pear', 'car'], answer: 'car', reason: 'not a fruit' }] }),
    bl({ kind: 'categorize', pointsPerItem: 0.5, categories: [{ id: 'k1', name: 'Fruit' }, { id: 'k2', name: 'Vehicle' }], words: [{ id: 'w1', text: 'bus', categoryId: 'k2' }] }),
    bl({ kind: 'picture', items: [{ id: 'p1', answer: 'a pen', imageKeywords: [] }], wordBank: false, columns: 3 }),
    bl({ kind: 'verbTable', headers: ['infinitive', 'past', 'pp'], rows: [{ id: 'v1', cells: ['go', '', ''], solution: ['go', 'went', 'gone'] }] }),
    bl({ kind: 'freeText', text: 'Write about your holidays.', lines: 8, pointsPerItem: 4 })
  ]
}

describe('Schülerfassung', () => {
  const f = onlineFassung(variante)
  const roh = JSON.stringify(f.aufgaben)
  it('enthält keine Lösungsfelder und keine Lösungswörter, die nicht auf dem Blatt stehen', () => {
    for (const schluessel of ['"answer"', '"answerId"', '"correct"', '"modelAnswer"', '"solution"', '"isTrue"', '"correction"', '"reason"']) expect(roh).not.toContain(schluessel)
    expect(roh).not.toContain('school')
    expect(roh).not.toContain('integrate more easily')
    expect(roh).not.toContain('A dog barks')
    expect(roh).not.toContain('not a fruit')
    expect(roh).not.toContain('went')
    expect(roh).not.toContain('a pen')
  })
  it('jede Aufgabe ist da; Korrekturfeld bei JEDER Aussage (verrät nicht, welche falsch ist)', () => {
    expect(f.aufgaben.map((a) => a.art)).toEqual(['gap', 'match', 'choice', 'open', 'trueFalse', 'oddOneOut', 'categorize', 'picture', 'verbTable', 'freeText'])
    const tf = f.aufgaben.find((a) => a.art === 'trueFalse')!
    expect(tf.eintraege[0].felder.map((x) => x.art)).toEqual(['wahr', 'text'])
  })
  it('nur ganze Punkte: 0,5 wird 1; Freitext mit seinen Punkten', () => {
    expect(f.einheiten.find((e) => e.aufgabe === 'b-categorize')!.punkte).toBe(1)
    expect(f.einheiten.find((e) => e.aufgabe === 'b-freeText')!.punkte).toBe(4)
    expect(f.einheiten.every((e) => Number.isInteger(e.punkte))).toBe(true)
  })
})

describe('Bewertung', () => {
  const f = onlineFassung(variante)
  const id = (aufgabe: string, teil = 0): string => f.einheiten.filter((e) => e.aufgabe === aufgabe)[teil].felder[0]
  it('alles Eindeutige sofort; Offenes wartet auf KI bzw. Lehrkraft', () => {
    const tf = f.einheiten.find((e) => e.aufgabe === 'b-trueFalse')!
    const oo = f.einheiten.find((e) => e.aufgabe === 'b-oddOneOut')!
    const b = bewerte(f, {
      [id('b-gap')]: ' school. ',
      [id('b-match')]: 'r2',
      [id('b-choice')]: '1',
      [id('b-open')]: 'New pupils integrate more easily.',
      [tf.felder[0]]: 'false',
      [tf.felder[1]]: 'A dog barks.',
      [oo.felder[0]]: 'car',
      [oo.felder[1]]: 'it is not a fruit',
      [id('b-categorize')]: 'k2',
      [id('b-picture')]: 'pen',
      [id('b-verbTable', 0)]: 'went',
      [id('b-verbTable', 1)]: 'gone',
      [id('b-freeText')]: 'Last summer I went to Spain.'
    })
    expect(b[id('b-gap')].status).toBe('richtig')
    expect(b[id('b-picture')].status).toBe('richtig')
    expect(b[f.einheiten.find((e) => e.aufgabe === 'b-open')!.id].status).toBe('ki')
    expect(b[tf.id].status).toBe('ki')
    expect(b[f.einheiten.find((e) => e.aufgabe === 'b-freeText')!.id].status).toBe('lehrkraft')
    expect(offeneEinheiten(b)).toBe(4)
    expect(summe(b)).toBe(7)
  })
  it('ein falsches Feld macht die Einheit falsch – ohne KI', () => {
    const tf = f.einheiten.find((e) => e.aufgabe === 'b-trueFalse')!
    const b = bewerte(f, { [tf.felder[0]]: 'true', [tf.felder[1]]: '' })
    expect(b[tf.id]).toMatchObject({ status: 'falsch', punkte: 0 })
  })
  it('Groß-/Kleinschreibung: falsch, aber für die Lehrkraft markiert', () => {
    const b = bewerte(f, { [id('b-gap')]: 'School' })
    expect(b[id('b-gap')]).toMatchObject({ status: 'falsch', hinweis: expect.stringContaining('Groß') })
  })
  it('Urteile der KI und der Lehrkraft bleiben bei erneuter Bewertung stehen', () => {
    const e = f.einheiten.find((x) => x.aufgabe === 'b-open')!
    const b = bewerte(f, { [e.felder[0]]: 'x' }, { [e.id]: { status: 'richtig', punkte: 1, quelle: 'lehrkraft' } })
    expect(b[e.id]).toMatchObject({ status: 'richtig', quelle: 'lehrkraft' })
  })
})

describe('Vergleich', () => {
  it('Normalisieren: Leerzeichen, Apostroph, Schlusspunkt', () => {
    expect(normalisiere("  don’t   go. ")).toBe("don't go")
  })
  it('Alternativen in der Lösung, Artikel nur bei Bildern frei', () => {
    expect(vergleiche('color', ['colour / color'])).toBe('richtig')
    expect(vergleiche('pen', ['a pen'], true)).toBe('richtig')
    expect(vergleiche('pen', ['a pen'], false)).toBe('falsch')
    expect(vergleiche('', ['x'])).toBe('leer')
  })
})

describe('KI-Anfrage', () => {
  it('nur Kennungen, Aufgabe, Erwartung, Antwort – ganz oder gar nicht', () => {
    const r = kiAnfrage('en', 'B1', [{ id: 'A1', frage: 'Use the word', erwartung: 'x', antwort: 'y' }])
    expect(r.system).toContain('Teilpunkte gibt es nicht')
    expect(r.user).toContain('A1')
  })
  it('unbekannte Kennungen und kaputte Urteile werden verworfen', () => {
    const u = urteileAus({ urteile: [{ id: 'A1', richtig: true, begruendung: 'ok' }, { id: 'A9', richtig: true }, { id: 'A1', richtig: false }] }, [{ id: 'A1', frage: '', erwartung: '', antwort: '' }])
    expect([...u.values()]).toEqual([{ id: 'A1', richtig: true, begruendung: 'ok' }])
  })
})
