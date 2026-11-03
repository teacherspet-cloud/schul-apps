import { describe, expect, it } from 'vitest'
import { autoBefund } from '../src/shared/blattPruefung'
import { aufgabenFeedbackAnfrage, type BlattAufgabe, type BlattFeld } from '../src/shared/blattFreigabe'

// Befund 03.11.2026 (9c, „Why the Midterms Matter"): richtige Zuordnungen galten bei „Aufgabe prüfen" als falsch
const aufgabe: BlattAufgabe = {
  nr: 1,
  anweisung: 'Match each paragraph of M{artikel} with the correct heading. There is one more heading than you need.',
  erwartung: 'Zuordnen: Paragraph A → A vote without the president; …',
  schluessel: { teile: [{ teil: -1, art: 'zuordnen', paare: [1, 2, 5, 3, 4] }] }
}
const felder: BlattFeld[] = ['A', 'B', 'C', 'D', 'E'].map((p, i) => ({ id: `f${i}`, nr: 1, art: 'text', seite: 0, text: `Paragraph ${p}`, bezug: `-1.zuordnen.${i}` }))
const mit = (w: string[]): Record<string, string> => Object.fromEntries(w.map((x, i) => [`f${i}`, x]))

describe('Feste Lösungen vor der KI prüfen (03.11.2026)', () => {
  it('richtige Zuordnung = sicher, in jeder Schreibweise', () => {
    for (const w of [['B', 'C', 'F', 'D', 'E'], ['b', 'c', 'f', 'd', 'e'], ['B)', 'C)', 'F)', 'D)', 'E)']]) {
      const b = autoBefund(aufgabe, felder, mit(w))!
      expect(b.einschaetzung).toBe('sicher')
      expect(b.text).toMatch(/^5 von 5 richtig/)
      expect(b.text).toContain('Paragraph A: eingetragen „' + w[0] + '" → RICHTIG')
    }
  })
  it('ein Fehler = teilweise, vier Fehler = noch nicht', () => {
    expect(autoBefund(aufgabe, felder, mit(['B', 'C', 'F', 'D', 'A']))!.einschaetzung).toBe('teilweise')
    expect(autoBefund(aufgabe, felder, mit(['B', 'A', 'A', 'A', 'A']))!.einschaetzung).toBe('noch nicht')
  })
  it('die KI bekommt den Befund als verbindliche Tatsache', () => {
    const b = autoBefund(aufgabe, felder, mit(['B', 'C', 'F', 'D', 'E']))!
    const r = aufgabenFeedbackAnfrage(aufgabe, '1) Paragraph A: B', [], 'en', { auto: b.text })
    expect(r.user).toMatch(/AUTOMATISCHE PRÜFUNG MIT DEM LÖSUNGSSCHLÜSSEL \(verbindlich/)
    expect(r.user).toContain('5 von 5 richtig')
  })
  it('ohne Schlüssel kein Befund', () => {
    expect(autoBefund({ ...aufgabe, schluessel: undefined, erwartung: 'Offene Aufgabe' }, felder, mit(['B']))).toBeNull()
  })
})
