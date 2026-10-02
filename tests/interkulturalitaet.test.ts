import { describe, expect, it } from 'vitest'
import { interkulturHinweis, interkulturName, interkulturSchwerpunktRegeln, interkulturZusatzRegeln } from '../src/renderer/src/modules/arbeitsblatt/didactics/interkulturalitaet'
import { skillFocusOptions, skillFocusPrompt } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts/fertigkeiten'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * Interkulturelle (kommunikative) Kompetenz (02.10.2026): eigener Schwerpunkt des Arbeitsblatts und
 * Zusatzschalter; in der Klassenarbeit nur integrativ (Entscheidung der Lehrkraft).
 */
const meta = (patch: Partial<WorksheetMeta>): WorksheetMeta =>
  ({ ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'englisch', subjectLabel: 'Englisch', grade: 8, ...patch }) as WorksheetMeta

describe('Interkulturalität', () => {
  it('ist ein Schwerpunkt der modernen Fremdsprachen – nicht in Latein, Deutsch oder Mathematik', () => {
    expect(skillFocusOptions('englisch').map((f) => f.value)).toContain('interkulturell')
    expect(skillFocusOptions('latein').map((f) => f.value)).not.toContain('interkulturell')
    expect(skillFocusOptions('deutsch').map((f) => f.value)).not.toContain('interkulturell')
    expect(skillFocusOptions('mathematik').map((f) => f.value)).not.toContain('interkulturell')
  })

  it('heißt je nach Land und Stufe wie in den Bildungsstandards bzw. dem KC', () => {
    expect(interkulturName({ stateId: 'BY', grade: 8 })).toBe('Interkulturelle Kompetenz')
    expect(interkulturName({ stateId: 'NI', grade: 8 })).toBe('Interkulturelle kommunikative Kompetenz')
    expect(interkulturName({ stateId: 'BY', grade: 12 })).toBe('Interkulturelle kommunikative Kompetenz')
  })

  it('eigener Schwerpunkt: das ganze Blatt mit den gewählten Teilbereichen', () => {
    const m = meta({ skillFocus: 'interkulturell', interkulturell: { aktiv: false, bereiche: ['begegnung'] } })
    const p = skillFocusPrompt(m)
    expect(p).toMatch(/SCHWERPUNKT INTERKULTURELLE KOMMUNIKATIVE KOMPETENZ/)
    expect(p).toMatch(/Begegnungssituationen/)
    expect(p).not.toMatch(/Soziokulturelles Orientierungswissen:/)
    expect(interkulturSchwerpunktRegeln(meta({ skillFocus: 'mixed' }))).toBe('')
  })

  it('Zusatzschalter: integriert, ohne eigene Punkte – in der Klassenarbeit NI Sek I mit Hinweis aus dem KC', () => {
    const an = { aktiv: true, bereiche: [] }
    expect(interkulturZusatzRegeln(meta({ skillFocus: 'mediation', interkulturell: an }))).toMatch(/integriert/)
    expect(interkulturZusatzRegeln(meta({ skillFocus: 'mediation', interkulturell: an }))).toMatch(/NICHT als eigene Punkte-Kategorie/)
    expect(interkulturZusatzRegeln(meta({ skillFocus: 'mediation' }))).toBe('')
    expect(interkulturZusatzRegeln(meta({ interkulturell: an }), { klassenarbeit: true })).toMatch(/nicht eigenständig in Leistungssituationen/)
    expect(interkulturHinweis({ subjectId: 'englisch', stateId: 'NI', grade: 8, interkulturell: an })).toMatch(/nicht eigenständig bewertet/)
    expect(interkulturHinweis({ subjectId: 'englisch', stateId: 'NI', grade: 12, interkulturell: an })).toBe('')
  })
})
