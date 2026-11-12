/**
 * Spaltenköpfe der Selbsteinschätzung (12.11.2026, Befund der Lehrkraft): Unter „How well can I do
 * this?" standen „sicher / teilweise / noch nicht" immer auf Deutsch. Sie folgen jetzt der Sprache
 * der Arbeitsanweisungen – am Bildschirm/PDF (blockview) und in Word (docx/bausteine).
 */
import { describe, expect, it } from 'vitest'
import { anweisungsSprache } from '../src/renderer/src/modules/arbeitsblatt/didactics/anrede'
import { EINSCHAETZUNG_KOPF, KOPF_SPRACHEN, kopfSpracheVon } from '../src/renderer/src/shared/kopfSprache'

const kopf = (meta: Parameters<typeof anweisungsSprache>[0]): readonly string[] => EINSCHAETZUNG_KOPF[kopfSpracheVon(anweisungsSprache(meta))]

describe('Selbsteinschätzung in der Sprache der Anweisungen', () => {
  it('Englisch mit englischen Anweisungen: englische Köpfe', () => {
    expect(kopf({ subjectId: 'englisch', instructionsInGerman: false })).toEqual(['well', 'partly', 'not yet'])
  })
  it('Französisch/Spanisch in der Zielsprache', () => {
    expect(kopf({ subjectId: 'franzoesisch', instructionsInGerman: false })[2]).toBe('pas encore')
    expect(kopf({ subjectId: 'spanisch', instructionsInGerman: false })[2]).toBe('todavía no')
  })
  it('Anweisungen auf Deutsch gewählt: deutsche Köpfe', () => {
    expect(kopf({ subjectId: 'englisch', instructionsInGerman: true })).toEqual(['sicher', 'teilweise', 'noch nicht'])
  })
  it('Sachfach und Latein: Deutsch', () => {
    expect(kopf({ subjectId: 'geschichte', instructionsInGerman: false })[0]).toBe('sicher')
    expect(kopf({ subjectId: 'latein', instructionsInGerman: false })[0]).toBe('sicher')
  })
  it('bilingual: Arbeitssprache, bei Prüfsprache deutsch Deutsch', () => {
    const b = { an: true, sprache: 'en', spracheLabel: 'Englisch', form: 'modul' } as never
    expect(kopf({ subjectId: 'geschichte', instructionsInGerman: false, bilingual: b })[0]).toBe('well')
    const d = { an: true, sprache: 'en', spracheLabel: 'Englisch', form: 'modul', pruefsprache: 'deutsch' } as never
    expect(kopf({ subjectId: 'geschichte', instructionsInGerman: false, bilingual: d })[0]).toBe('sicher')
  })
  it('jede Blattsprache hat drei Köpfe', () => {
    for (const s of KOPF_SPRACHEN) expect(EINSCHAETZUNG_KOPF[s].filter(Boolean)).toHaveLength(3)
  })
})
