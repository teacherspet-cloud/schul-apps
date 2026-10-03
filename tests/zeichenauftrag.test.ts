import { describe, expect, it } from 'vitest'
import { nurZeichenauftrag } from '../src/renderer/src/modules/arbeitsblatt/generation/zeichenauftrag'

describe('Zeichenfläche: nur der Zeichenauftrag', () => {
  it('schneidet den angehängten Erklärauftrag ab (Befund Zeitleiste)', () => {
    expect(
      nurZeichenauftrag('Ordne die Ereignisse aus M1 auf der Zeitleiste und erkläre anhand ihrer Abfolge, wie sich die militärische Lage veränderte.')
    ).toBe('Ordne die Ereignisse aus M1 auf der Zeitleiste.')
    expect(nurZeichenauftrag('Zeichne den Graphen der Messreihe, und begründe den Verlauf.')).toBe('Zeichne den Graphen der Messreihe.')
    expect(nurZeichenauftrag('Mark the events on the timeline and explain the turning point.')).toBe('Mark the events on the timeline.')
  })
  it('lässt reine Zeichen- und Markieraufträge stehen', () => {
    const a = 'Trage die Ereignisse ein und markiere den Wendepunkt farbig.'
    expect(nurZeichenauftrag(a)).toBe(a)
    expect(nurZeichenauftrag('Zeichne das Schrägbild des Quaders.')).toBe('Zeichne das Schrägbild des Quaders.')
  })
})
