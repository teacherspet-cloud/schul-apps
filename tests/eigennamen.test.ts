import { describe, expect, it } from 'vitest'
import { eigennamenAngleichen } from '../src/renderer/src/modules/vokabeltest/generation/taskTypes'

/*
 * Eigennamen groß (27.10.2026, Befund der Lehrkraft): „Du hast einen wirklich vornehmen Akzent, will.“ mit der Lösung
 * „You really have a posh accent, Will.“ – der Name blieb im deutschen Satz klein.
 */
describe('Eigennamen im deutschen Satz', () => {
  const an = (prompt: string, modelAnswer: string): string => eigennamenAngleichen([{ prompt, modelAnswer }])[0].prompt
  it('schreibt den Namen aus der Musterlösung auch im deutschen Satz groß', () => {
    expect(an('Du hast einen wirklich vornehmen Akzent, will.', 'You really have a posh accent, Will.')).toBe('Du hast einen wirklich vornehmen Akzent, Will.')
    expect(an('will entdeckte zu spät, dass sein Handy weg war.', 'Will discovered too late that his phone was gone.')).toBe(
      'Will entdeckte zu spät, dass sein Handy weg war.'
    )
    expect(an('olivia und dan fahren nach london.', 'Olivia and Dan are going to London.')).toBe('Olivia und Dan fahren nach London.')
  })
  it('lässt gewöhnliche Wörter und schon richtige Sätze in Ruhe', () => {
    // „will“ als Verb: kommt öfter vor als der Name in der Lösung → unverändert
    expect(an('Will will nach Hause, aber sie will bleiben.', 'Will wants to go home, but she wants to stay.')).toBe(
      'Will will nach Hause, aber sie will bleiben.'
    )
    expect(an('Ich bin müde.', 'I am tired.')).toBe('Ich bin müde.')
    expect(an('Wir lernen Englisch am Montag.', 'We learn English on Monday.')).toBe('Wir lernen Englisch am Montag.')
  })
})
