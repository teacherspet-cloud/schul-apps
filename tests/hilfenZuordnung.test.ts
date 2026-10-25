import { describe, expect, it } from 'vitest'
import { hilfenZuordnung } from '../src/renderer/src/modules/arbeitsblatt/didactics/aufgabenVerweise'
import type { WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/* Hilfen gehören zu Aufgaben (06.10.2026): Verweis im Text, sonst die Aufgabe davor */
const aufgabe = (id: string): WsBlock => ({ id, type: 'task' }) as unknown as WsBlock
const hilfe = (id: string, variant: string, title: string, items: string[] = []): WsBlock =>
  ({ id, type: 'scaffold', variant, title, items }) as unknown as WsBlock

describe('hilfenZuordnung', () => {
  it('Verweis im Text gewinnt, sonst die Aufgabe davor, vor der ersten Aufgabe keine Zuordnung', () => {
    const m = hilfenZuordnung({
      blocks: [
        hilfe('vorher', 'wortspeicher', 'Wortspeicher'),
        aufgabe('a1'),
        hilfe('satz1', 'satzanfaenge', 'Satzanfänge'),
        aufgabe('a2'),
        aufgabe('a3'),
        hilfe('karten', 'hilfekarten', 'Optional help cards for task 2', ['Hint'])
      ]
    })
    expect(m.get('vorher')).toBeUndefined()
    expect(m.get('satz1')).toBe(1)
    expect(m.get('karten')).toBe(2)
  })

  it('Formulierungshilfen zwischen zwei Aufgaben gehören zur Aufgabe davor, hinter der letzten gelten sie fürs Blatt (25.10.2026)', () => {
    const phrases = (id: string, title: string): WsBlock => ({ id, type: 'phrases', title, hint: '', groups: [{ label: '', items: [{ text: 'I think …', german: '' }] }] }) as unknown as WsBlock
    const m = hilfenZuordnung({ blocks: [aufgabe('a1'), phrases('p1', 'Useful phrases'), aufgabe('a2'), phrases('p2', 'Useful phrases for task 1'), aufgabe('a3'), phrases('ende', 'Useful phrases')] })
    expect(m.get('p1')).toBe(1)
    expect(m.get('p2')).toBe(1)
    expect(m.get('ende')).toBeUndefined()
  })
})
