import { describe, expect, it } from 'vitest'
import { ALLGEMEIN, fachAusDokument, fachVorschlag, freigabeFach, freigabeSichtbar } from '../src/shared/fachschaftFach'

/*
 * Fachschafts-Freigabe ohne erkanntes Fach (10.10.2026): Frage nach dem Fach statt „Allgemein" für alle; „Allgemein"
 * (Altbestand) sehen nur Lehrkräfte ohne eigene Fächer.
 */
describe('Fach aus dem Material', () => {
  it('Kennung im Dokument, in den Kennzahlen oder als Fachname; Vokabeltest über die Sprache', () => {
    expect(fachAusDokument('arbeitsblatt', { payload: { meta: { subjectId: 'geschichte' } } })).toBe('geschichte')
    expect(fachAusDokument('arbeitsblatt', { stats: { subjectId: 'biologie' }, payload: {} })).toBe('biologie')
    expect(fachAusDokument('lernzielkontrolle', { stats: { subjectLabel: 'Geschichte' }, payload: {} })).toBe('geschichte')
    expect(fachAusDokument('vokabeltest', { payload: { settings: { targetLanguage: 'fr' } } })).toBe('franzoesisch')
    expect(fachAusDokument('vokabeltest', { stats: { language: 'en' }, payload: {} })).toBe('englisch')
    // Wie die Ablage es liefert: Kennzahlen oben im Eintrag
    expect(fachAusDokument('lernzielkontrolle', { id: 'x', name: 'LZK', subjectLabel: 'Geschichte', payload: {} })).toBe('geschichte')
  })
  it('nichts zu erkennen: null', () => {
    expect(fachAusDokument('elternbrief', { payload: {} })).toBeNull()
    expect(fachAusDokument('arbeitsblatt', { payload: { meta: { subjectId: 'anderes' } } })).toBeNull()
    expect(fachAusDokument('arbeitsblatt', { stats: { subjectLabel: 'Quatsch' } })).toBeNull()
  })
})

describe('Freigabe verlangt ein Fach', () => {
  it('erkannt geht vor gewählt; ohne beides fragt die Oberfläche nach', () => {
    expect(freigabeFach('arbeitsblatt', { payload: { meta: { subjectId: 'geschichte' } } }, 'mathematik')).toEqual({ fach: 'geschichte' })
    expect(freigabeFach('elternbrief', { payload: {} }, 'mathematik')).toEqual({ fach: 'mathematik' })
    expect(freigabeFach('elternbrief', { payload: {} })).toEqual({ fachNoetig: true })
    // „Allgemein" oder Unbekanntes zählt nicht als Wahl
    expect(freigabeFach('elternbrief', { payload: {} }, ALLGEMEIN)).toEqual({ fachNoetig: true })
    expect(freigabeFach('elternbrief', { payload: {} }, 'quatsch')).toEqual({ fachNoetig: true })
  })
  it('Vorbelegung: das eigene Fach, wenn es genau eines ist', () => {
    expect(fachVorschlag(['geschichte'])).toBe('geschichte')
    expect(fachVorschlag(['geschichte', 'mathematik'])).toBeNull()
    expect(fachVorschlag([])).toBeNull()
    expect(fachVorschlag(undefined)).toBeNull()
  })
})

describe('Wer sieht eine Freigabe', () => {
  it('Fach passt oder keine eigenen Fächer; „Allgemein" nur ohne eigene Fächer', () => {
    expect(freigabeSichtbar('geschichte', ['geschichte', 'mathematik'])).toBe(true)
    expect(freigabeSichtbar('geschichte', ['englisch'])).toBe(false)
    expect(freigabeSichtbar('geschichte', [])).toBe(true)
    expect(freigabeSichtbar(ALLGEMEIN, ['englisch'])).toBe(false)
    expect(freigabeSichtbar(ALLGEMEIN, [])).toBe(true)
  })
})
