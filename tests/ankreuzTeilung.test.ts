import { describe, expect, it } from 'vitest'
import { ankreuzTeilung } from '../src/renderer/src/modules/arbeitsblatt/render/mcGrid'

describe('ankreuzTeilung – Kästchen hinter dem Ankreuz-Wort', () => {
  it('setzt hinter „tick"', () => {
    expect(ankreuzTeilung('Read M1. Then decide and tick the correct answer to each question.')).toEqual([
      'Read M1. Then decide and tick',
      ' the correct answer to each question.'
    ])
  })
  it('hinter das Ende einer Fettung', () => {
    expect(ankreuzTeilung('Read M1. Then **decide and tick** the correct answer.')?.[0]).toBe('Read M1. Then **decide and tick**')
    expect(ankreuzTeilung('**Tick** the correct box.')?.[0]).toBe('**Tick**')
  })
  it('nur ganze Wörter, sonst null', () => {
    expect(ankreuzTeilung('Read the ticket and answer the questions.')).toBeNull()
    expect(ankreuzTeilung('Kreuze die richtige Antwort an.')?.[0]).toBe('Kreuze')
    expect(ankreuzTeilung('Lis le texte et coche la bonne réponse.')?.[0]).toBe('Lis le texte et coche')
  })
})
