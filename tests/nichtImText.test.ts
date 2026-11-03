import { describe, expect, it } from 'vitest'
import { istNichtImTextTabelle, nichtImTextBereinigen } from '../src/renderer/src/modules/arbeitsblatt/didactics/nichtImText'

describe('Right / Wrong / Not in the text (03.11.2026)', () => {
  const a = {
    headers: ['Statement', 'right', 'wrong', 'not in the text', 'Evidence'],
    rows: [
      ['Turnout was about 82 percent.', '', '', '', ''],
      ['Jake lives in Ohio.', '', '', '', '—'],
      ['The Senate has 100 seats.', '', '', '']
    ]
  }
  it('jede Zeile hat eine leere Belegzelle, Kopf und Anweisung sagen, was bei „not in the text" gilt', () => {
    const { answer, anweisung } = nichtImTextBereinigen(a, '**Tick** the correct box. For right and wrong, give one piece of evidence by quoting from the text.')
    expect(answer.headers[4]).toBe('Evidence (only for right/wrong)')
    expect(answer.rows.every((r) => r.length === 5 && r[4] === '')).toBe(true)
    expect(anweisung).toMatch(/If the statement is not in the text, leave the evidence box empty\.$/)
  })
  it('andere Tabellen bleiben unverändert, deutsche Fassung', () => {
    expect(istNichtImTextTabelle(['Criterion', 'USA', 'Germany'])).toBe(false)
    const de = nichtImTextBereinigen({ headers: ['Aussage', 'richtig', 'falsch', 'nicht im Text', 'Textbeleg'], rows: [['x', '', '', '', 'n/a']] }, 'Kreuze an.')
    expect(de.answer.headers[4]).toBe('Textbeleg (nur bei richtig/falsch)')
    expect(de.answer.rows[0][4]).toBe('')
    expect(de.anweisung).toMatch(/bleibt das Belegfeld leer/)
  })
})
