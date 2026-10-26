// Früheres Feedback je Aufgabe geht mit an die KI (26.10.2026, Befund der Lehrkraft: „Willkür" zwischen zwei Prüfrunden)
import { describe, expect, it } from 'vitest'
import { aufgabenFeedbackAnfrage, vorherigesFeedbackText, type BlattAufgabe } from '../src/shared/blattFreigabe'

const aufgabe: BlattAufgabe = { nr: 2, anweisung: 'Erkläre die Ursachen.', erwartung: 'Zwei Ursachen mit Beleg.' } as BlattAufgabe

describe('Früheres Feedback in der Prüfanfrage', () => {
  it('nennt das frühere Feedback mit der Regel zur Verlässlichkeit', () => {
    const r = aufgabenFeedbackAnfrage(aufgabe, 'Eine Ursache war die Bündnispolitik.', [], 'de', {
      vorher: [
        { einschaetzung: 'teilweise', gelungen: 'Die Bündnispolitik ist richtig genannt.', fehlt: 'Die zweite Ursache fehlt.', schritt: 'Lies Z. 5–9.' },
        { einschaetzung: 'teilweise', text: 'Fast geschafft.', abgabe: 1 }
      ]
    })
    expect(r.user).toContain('FRÜHERES FEEDBACK ZU DIESER AUFGABE')
    expect(r.user).toContain('Gelungen: Die Bündnispolitik ist richtig genannt.')
    expect(r.user).toContain('Fehlte: Die zweite Ursache fehlt.')
    expect(r.user).toContain('beim Einreichen')
    expect(r.user).toContain('VERLÄSSLICHKEIT')
    // Reihenfolge: das frühere Feedback steht vor der Aufgabe und der Antwort
    expect(r.user.indexOf('FRÜHERES FEEDBACK')).toBeLessThan(r.user.indexOf('AUFGABE 2:'))
  })
  it('ohne früheres Feedback bleibt der Auftrag wie bisher', () => {
    const r = aufgabenFeedbackAnfrage(aufgabe, 'Antwort', [], 'de', {})
    expect(r.user).not.toContain('FRÜHERES FEEDBACK')
    expect(r.user).not.toContain('VERLÄSSLICHKEIT')
  })
  it('kürzt auf die letzten drei Rückmeldungen und das Wesentliche', () => {
    const text = vorherigesFeedbackText(Array.from({ length: 5 }, (_, i) => ({ einschaetzung: 'noch nicht', fehlt: `Punkt ${i + 1} fehlt.` })))
    expect(text).toContain('Punkt 5 fehlt.')
    expect(text).not.toContain('Punkt 2 fehlt.')
    expect(text.split('\n')).toHaveLength(3)
  })
})
