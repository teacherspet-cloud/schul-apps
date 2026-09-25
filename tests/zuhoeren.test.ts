import { describe, expect, it } from 'vitest'
import { istDeutschZuhoeren, ZUHOEREN_MODES, zuhoerenRules } from '../src/renderer/src/modules/arbeitsblatt/didactics/zuhoeren'
import { skillFocusOptions } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { wantsListening } from '../src/renderer/src/modules/arbeitsblatt/generation/listening'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'deutsch',
  subjectLabel: 'Deutsch',
  grade: 8,
  skillFocus: 'listening',
  audioAi: true,
  ...patch
})

/*
 * Belegte Grundlage: KMK-Bildungsstandards Deutsch ESA/MSA (23.06.2022), Kernbereich
 * „Verstehend zuhören" – dort ausdrücklich mit „Hörtexten" und mit Strategien „vor, während
 * und nach dem Zuhören". „Zuhören" ist außerdem eine getestete Domäne in VERA-8 (IQB).
 * Die mündliche Bauform steht als Aufgabenbeispiel in KMK Deutsch MSA 2003, Kap. 4.3.
 */
describe('Zuhören im Fach Deutsch', () => {
  it('bietet Deutsch jetzt Zuhören und Lesen als Schwerpunkt an', () => {
    const werte = skillFocusOptions('deutsch').map((f) => f.value)
    expect(werte).toContain('listening')
    expect(werte).toContain('reading')
    // Sprachmittlung gibt es im Fach Deutsch nicht
    expect(werte).not.toContain('mediation')
  })

  it('lässt die übrigen Fächer unverändert', () => {
    // Nur Deutsch und Musik haben außerhalb der Fremdsprachen einen Hör-Kompetenzbereich
    expect(skillFocusOptions('geschichte').map((f) => f.value)).toEqual(['mixed'])
    expect(skillFocusOptions('biologie').map((f) => f.value)).toEqual(['mixed'])
  })

  it('lässt die KI auch für Deutsch einen Hörtext schreiben', () => {
    expect(wantsListening(meta())).toBe(true)
    // Ohne den Schwerpunkt bleibt es beim alten Verhalten
    expect(wantsListening(meta({ skillFocus: 'mixed' }))).toBe(false)
    expect(wantsListening(meta({ subjectId: 'geschichte', subjectLabel: 'Geschichte' }))).toBe(false)
  })

  it('erkennt den Schwerpunkt nur im Fach Deutsch', () => {
    expect(istDeutschZuhoeren(meta())).toBe(true)
    expect(istDeutschZuhoeren(meta({ subjectId: 'englisch' }))).toBe(false)
  })
})

describe('Die beiden Bauformen', () => {
  it('bietet genau zwei an und erklärt ihren Stand', () => {
    expect(ZUHOEREN_MODES).toHaveLength(2)
    const muendlich = ZUHOEREN_MODES.find((m) => m.value === 'muendlich')!
    const schriftlich = ZUHOEREN_MODES.find((m) => m.value === 'schriftlich')!
    // Ehrlich gekennzeichnet: nur die mündliche Form steht so in den Standards
    expect(muendlich.description).toMatch(/Bildungsstandards/)
    expect(schriftlich.description).toMatch(/so aber nicht vorgesehen/)
  })

  it('baut die mündliche Form in der belegten Reihenfolge', () => {
    // KMK Deutsch 2003: „Zuhören – Mitschrift/Stichwörter – Zusammenfassung – Vortrag"
    const r = zuhoerenRules(meta({ listeningMode: 'muendlich' }))
    expect(r).toMatch(/Zuhören mit einem Beobachtungsauftrag/)
    expect(r).toMatch(/Mitschrift in Stichwörtern/)
    expect(r).toMatch(/mündlicher Kurzvortrag/)
    // Für die Mitschrift ist die Struktur die eigentliche Hilfe
    expect(r).toMatch(/VORSTRUKTURIERTES Feld/)
  })

  it('baut die schriftliche Form wie ein Verstehenstest', () => {
    const r = zuhoerenRules(meta({ listeningMode: 'schriftlich' }))
    expect(r).toMatch(/schriftliche Fragen zum Hörtext/)
    expect(r).not.toMatch(/Kurzvortrag/)
  })

  it('nimmt ohne Angabe die belegte Form', () => {
    expect(zuhoerenRules(meta())).toMatch(/Kurzvortrag/)
  })

  it('verlangt in BEIDEN Formen eine Frage zur Sprechweise', () => {
    /*
     * Das ist der Kern des Unterschieds zur Fremdsprache: Die Deutsch-Standards nennen
     * ausdrücklich „Aufmerksamkeit für paraverbale (z. B. Stimmführung) und nonverbale
     * Äußerungen". Danach fragt eine Fremdsprachen-Höraufgabe nie.
     */
    for (const modus of ['muendlich', 'schriftlich'] as const) {
      expect(zuhoerenRules(meta({ listeningMode: modus })), modus).toMatch(/SPRECHWEISE/)
    }
  })

  it('schweigt außerhalb des Schwerpunkts', () => {
    expect(zuhoerenRules(meta({ skillFocus: 'mixed' }))).toBe('')
    expect(zuhoerenRules(meta({ subjectId: 'englisch' }))).toBe('')
  })
})
