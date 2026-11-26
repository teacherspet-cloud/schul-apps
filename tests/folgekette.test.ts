import { describe, expect, it } from 'vitest'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { folgeAuftrag, folgeBausteine, folgeUebernehmen } from '../src/renderer/src/modules/arbeitsblatt/generation/folgekette'

const text = (ref: string, body: string): WsBlock => ({ ...(newBlock('text') as Extract<WsBlock, { type: 'text' }>), ref, title: ref, body })
const aufgabe = (instruction: string): WsBlock => ({ ...(newBlock('task') as Extract<WsBlock, { type: 'task' }>), instruction })
const phrases = (title: string): WsBlock => ({ ...(newBlock('phrases') as Extract<WsBlock, { type: 'phrases' }>), title })
const meta = { subjectLabel: 'Englisch', grade: 7, cefrLevel: 'A2', topic: 'London' } as never

describe('Folgekette nach einer Überarbeitung (26.11.2026)', () => {
  it('findet Verweise auf das Material und die Kette über Aufgabennummern und Hilfen', () => {
    const m1 = text('london', 'Big Ben …')
    const a1 = aufgabe('Read M{london}. Answer the questions.')
    const a2 = aufgabe('Describe a picture.')
    const hilfe = phrases('Useful phrases')
    const a3 = aufgabe('Use your answers from task 1 to write an email.')
    const m2 = text('paris', 'Eiffel …')
    const bloecke = [m1, a1, a2, hilfe, a3, m2]
    expect(folgeBausteine(bloecke, m1.id).map((b) => b.id)).toEqual([a1.id, a3.id])
    // Die Phrases stehen hinter Aufgabe 2 → hängen an Aufgabe 2, nicht an der Kette von M1
    expect(folgeBausteine(bloecke, a2.id).map((b) => b.id)).toEqual([hilfe.id])
  })
  it('nimmt ohne jeden Verweis die Aufgaben direkt hinter dem Material', () => {
    const m1 = text('t', 'Text')
    const a1 = aufgabe('Answer the questions.')
    const a2 = aufgabe('True or false?')
    const m2 = text('u', 'Zweiter Text')
    const a3 = aufgabe('Summarise.')
    expect(folgeBausteine([m1, a1, a2, m2, a3], m1.id).map((b) => b.id)).toEqual([a1.id, a2.id])
  })
  it('übernimmt nur geänderte Bausteine und behält Kennung, Punkte und Material-Kennung', () => {
    const m1 = text('london', 'Big Ben')
    const a1 = { ...(aufgabe('Read M{london}.') as Extract<WsBlock, { type: 'task' }>), points: 4 }
    const a2 = aufgabe('Read M{london} again.')
    const anp = folgeUebernehmen(
      {
        bausteine: [
          { id: a1.id, geaendert: true, grund: 'Frage 2 neu', block: { type: 'task', instruction: 'Read M1. Answer.', parts: [] } },
          { id: a2.id, geaendert: false, grund: '', block: { type: 'task' } }
        ],
        zusammenfassung: 'x'
      },
      [a1, a2],
      [m1, a1, a2],
      'du'
    )
    expect([...anp.bloecke.keys()]).toEqual([a1.id])
    const neu = anp.bloecke.get(a1.id) as Extract<WsBlock, { type: 'task' }>
    expect(neu.points).toBe(4)
    expect(neu.instruction).toContain('M{london}')
    expect(anp.unveraendert).toEqual([a2.id])
    expect(folgeAuftrag(m1, m1, [a1], [m1, a1], meta)).toContain('von Hand geändert')
  })
})
