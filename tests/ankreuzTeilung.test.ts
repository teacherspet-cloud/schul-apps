import { describe, expect, it } from 'vitest'
import { ankreuzAnzeige, ankreuzTeilung, ohneKreuzZeichen } from '../src/renderer/src/modules/arbeitsblatt/render/mcGrid'

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
  it('kein zusätzliches „(✓)" neben dem Kästchen (18.11.2026)', () => {
    expect(ankreuzTeilung('Read the text. Then tick (✓) the correct answer.')).toEqual(['Read the text. Then tick', ' the correct answer.'])
    expect(ankreuzTeilung('**Tick (✓)** the correct answer.')?.[0]).toBe('**Tick**')
    expect(ankreuzTeilung('**Tick** (✔) the correct box.')).toEqual(['**Tick**', ' the correct box.'])
    expect(ohneKreuzZeichen('Mark (x) the right picture.')).toBe('Mark the right picture.')
    expect(ohneKreuzZeichen('Read the text (M1) and answer.')).toBe('Read the text (M1) and answer.')
  })
  it('ein Zeichen für „angekreuzt": Beispiel mit ☒, Kästchen hinter „tick" bleibt (18.11.2026)', () => {
    const roh = 'Read M{blog}. **Tick** (✓) the correct answer.\n\nExample: How old is Maya? ☐ nine ☑ eleven ☐ ten'
    expect(ankreuzAnzeige(roh)).toBe('Read M{blog}. **Tick** the correct answer.\n\nExample: How old is Maya? ☐ nine ☒ eleven ☐ ten')
    expect(ankreuzAnzeige('Example: How old is Maya? ten / eleven ✓ / twelve')).toBe('Example: How old is Maya? ten / eleven ☒ / twelve')
    expect(ankreuzTeilung(ankreuzAnzeige(roh))?.[0]).toBe('Read M{blog}. **Tick**')
    // Schreibt die Anweisung selbst ein Kästchen hinters Wort, steht es nicht doppelt da
    expect(ankreuzTeilung('**Tick** ☒ the correct answer.')).toEqual(['**Tick**', ' the correct answer.'])
    expect(ankreuzTeilung('Tick ✓ the correct answer.')).toEqual(['Tick', ' the correct answer.'])
  })
  it('nur ganze Wörter, sonst null', () => {
    expect(ankreuzTeilung('Read the ticket and answer the questions.')).toBeNull()
    expect(ankreuzTeilung('Kreuze die richtige Antwort an.')?.[0]).toBe('Kreuze')
    expect(ankreuzTeilung('Lis le texte et coche la bonne réponse.')?.[0]).toBe('Lis le texte et coche')
  })
})
