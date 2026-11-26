import { describe, expect, it } from 'vitest'
import { nummerierePunkte } from '../src/renderer/src/modules/arbeitsblatt/generation/worksheetImages'
import { convertAnswer } from '../src/renderer/src/modules/arbeitsblatt/generation/convert'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'
import type { TaskBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

describe('Beschriftung am Bild (26.11.2026, Befund „Gradnetz der Erde")', () => {
  const aufgabe = { type: 'task', answer: { kind: 'none' }, parts: [{ answer: { kind: 'labels', labels: ['Nordpol', 'Äquator', 'Nullmeridian'] } }] } as unknown as TaskBlock
  it('Punkte werden zu Ziffern in der Reihenfolge der Begriffe statt gelöscht', () => {
    const punkte = [
      { id: 'a', text: 'Äquator', x: 50, y: 50, blank: true },
      { id: 'b', text: 'Nordpol', x: 50, y: 5, blank: true },
      { id: 'c', text: 'Nullmeridian', x: 52, y: 40, blank: true },
      { id: 'd', text: 'Wolke', x: 10, y: 10, blank: true }
    ]
    const aus = nummerierePunkte(punkte, [aufgabe])
    expect(aus.map((l) => [l.id, l.text, l.blank])).toEqual([
      ['b', '1', false],
      ['a', '2', false],
      ['c', '3', false]
    ])
  })
  it('eine Linie je Begriff', () => {
    const a = convertAnswer({ kind: 'labels', count: 3, labels: ['Nordpol', 'Südpol', 'Äquator', 'Nullmeridian', 'Breitenkreis', 'Längenhalbkreis'] }, createRng(1))
    expect(a.count).toBe(6)
  })
})
