import { describe, expect, it } from 'vitest'
import {
  COMPREHENSION_FORMATS,
  comprehensionFormatById,
  comprehensionFormatsFor,
  defaultComprehensionFormats
} from '../src/renderer/src/modules/arbeitsblatt/didactics/comprehensionFormats'
import { comprehensionRules, skillFocusOptions } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  grade: 9,
  ...patch
})

describe('Formate für Hör- und Leseverstehen', () => {
  it('nennt zu jedem Format Eignung, Konstruktion und Punkte', () => {
    for (const f of COMPREHENSION_FORMATS) {
      expect(f.skills.length).toBeGreaterThan(0)
      expect(f.purpose.length).toBeGreaterThan(5)
      expect(f.construction.length).toBeGreaterThan(10)
      expect(f.scoring.length).toBeGreaterThan(5)
    }
  })

  it('trennt Hör- und Leseverstehen', () => {
    const listening = comprehensionFormatsFor('listening', 9).map((f) => f.id)
    const reading = comprehensionFormatsFor('reading', 9).map((f) => f.id)
    // Textbeleg gibt es nur beim Lesen
    expect(reading).toContain('true-false-evidence')
    expect(listening).not.toContain('true-false-evidence')
    // Sprecherzuordnung nur beim Hören
    expect(listening).toContain('matching-speakers')
  })

  it('schlägt nach Jahrgang gestufte Formate vor', () => {
    /*
     * Klasse 5: geschlossen und mit wenig Schreibanteil – aber richtig/falsch beim Lesen
     * IMMER mit Textbeleg. Vorgabe der Lehrkraft; belegt durch NRW ZP10 („Richtig-/Falsch-
     * Aufgaben mit Begründung", für alle Schulformen) und KMK 2012. Das belegfreie Format
     * bleibt dem Hörverstehen vorbehalten, wo der Text flüchtig ist.
     */
    expect(defaultComprehensionFormats('reading', 5)).toContain('true-false-evidence')
    expect(defaultComprehensionFormats('reading', 5)).not.toContain('true-false')
    expect(defaultComprehensionFormats('reading', 5)).not.toContain('short-answers-evidence')
    // Oberstufe: anspruchsvollere Formate
    expect(defaultComprehensionFormats('reading', 12)).toContain('true-false-not-in-text')
    for (const id of defaultComprehensionFormats('listening', 7)) expect(comprehensionFormatById(id)).toBeTruthy()
  })

  it('bietet Leseverstehen als Schwerpunkt an', () => {
    expect(skillFocusOptions('englisch').map((f) => f.value)).toContain('reading')
    expect(skillFocusOptions('geschichte').map((f) => f.value)).not.toContain('reading')
  })

  it('schreibt die gewählten Formate in den KI-Auftrag', () => {
    expect(comprehensionRules(meta({ skillFocus: 'mixed' }))).toBe('')
    const rules = comprehensionRules(meta({ skillFocus: 'reading', comprehensionFormats: ['matching-headings', 'true-false-evidence'] }))
    expect(rules).toContain('Zuordnung: Überschriften')
    expect(rules).toContain('Richtig / Falsch mit Textbeleg')
    expect(rules).toContain('answer.kind = "matching"')
    // Querschnittsregeln der KMK-Vorgaben
    expect(rules).toContain('Rechtschreibung zählen nicht')
    expect(rules).toContain('Reihenfolge des Textes')
    expect(rules).toContain('Zeilennummern')
  })

  it('nimmt ohne eigene Auswahl den Vorschlag des Jahrgangs', () => {
    const rules = comprehensionRules(meta({ skillFocus: 'listening', comprehensionFormats: [] }))
    expect(rules).toContain('zweimal gehört')
    expect(rules.length).toBeGreaterThan(200)
  })
})
