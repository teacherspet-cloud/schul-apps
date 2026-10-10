/**
 * Kursordner in IServ für „Ablegen ▾" (10.10.2026): Kurse quer zu den Klassen (Sek I: Religion, Werte und Normen,
 * Französisch, Spanisch; Sek II „EN 13 eA Kon") landen in ihrem Gruppenordner, Klassenfächer in der Klassenstruktur.
 */
import { describe, expect, it } from 'vitest'
import { kursOrdnerKandidaten, kursPfadNachMuster, kursWahlSchluessel, lerngruppeAlsKurs } from '../src/shared/kursAblage'

const ORDNER = ['Klasse 7b', 'FR 7 Kon', 'SN 7 Abc', 'RE 7b/c Xyz', 'EN 13 eA Kon', 'Fachschaft Englisch']

describe('Lerngruppe als Kurs', () => {
  it('Klasse + Fach', () => {
    expect(lerngruppeAlsKurs('7b', 'Französisch')).toMatchObject({ fachId: 'franzoesisch', jahrgang: 7, klassen: ['7b'] })
    expect(lerngruppeAlsKurs('7b', 'Mathematik')).toMatchObject({ fachId: 'mathematik', jahrgang: 7, klassen: ['7b'] })
  })
  it('Kursname der Lerngruppe', () => {
    expect(lerngruppeAlsKurs('Französisch 7 (Kon)', 'Französisch')).toMatchObject({ fachId: 'franzoesisch', jahrgang: 7, klassen: [], kuerzel: 'Kon' })
    expect(lerngruppeAlsKurs('FR 7 Kon', '')).toMatchObject({ fachId: 'franzoesisch', jahrgang: 7, kuerzel: 'Kon' })
    expect(lerngruppeAlsKurs('Englisch 13 eA (Kon)', 'Englisch')).toMatchObject({ fachId: 'englisch', jahrgang: 13, niveau: 'eA', kuerzel: 'Kon' })
    expect(lerngruppeAlsKurs('13 gA', 'Englisch')).toMatchObject({ jahrgang: 13, niveau: 'gA' })
    expect(lerngruppeAlsKurs('Ev. Religion 7b/c', 'Evangelische Religion')).toMatchObject({ fachId: 'religion', klassen: ['7b', '7c'] })
  })
  it('nichts Erkennbares', () => {
    expect(lerngruppeAlsKurs('Theater-AG', '')).toBeNull()
    expect(lerngruppeAlsKurs('7b', '')).toBeNull()
  })
})

describe('Kursordner finden', () => {
  it('Französisch der 7b → FR 7 Kon; Mathe bleibt in der Klasse', () => {
    expect(kursOrdnerKandidaten(ORDNER, { lerngruppe: '7b', fach: 'Französisch' })).toEqual(['FR 7 Kon'])
    expect(kursOrdnerKandidaten(ORDNER, { lerngruppe: '7b', fach: 'Mathematik' })).toEqual([])
    expect(kursOrdnerKandidaten(ORDNER, { lerngruppe: '7b', fach: 'Englisch' })).toEqual([])
  })
  it('Spanisch, Religion mit Klassenliste, Werte und Normen ohne Ordner', () => {
    expect(kursOrdnerKandidaten(ORDNER, { lerngruppe: '7c', fach: 'Spanisch' })).toEqual(['SN 7 Abc'])
    expect(kursOrdnerKandidaten(ORDNER, { lerngruppe: '7b', fach: 'Religion' })).toEqual(['RE 7b/c Xyz'])
    expect(kursOrdnerKandidaten(ORDNER, { lerngruppe: '7a', fach: 'Religion' })).toEqual([])
    expect(kursOrdnerKandidaten(ORDNER, { lerngruppe: '7b', fach: 'Werte und Normen' })).toEqual([])
    expect(kursOrdnerKandidaten(ORDNER, { lerngruppe: '8b', fach: 'Französisch' })).toEqual([])
  })
  it('Lerngruppe mit Kursnamen', () => {
    expect(kursOrdnerKandidaten(ORDNER, { lerngruppe: 'FR 7 Kon', fach: 'Französisch' })).toEqual(['FR 7 Kon'])
    expect(kursOrdnerKandidaten(ORDNER, { lerngruppe: 'Französisch 7 (Kon)', fach: 'Französisch' })).toEqual(['FR 7 Kon'])
    expect(kursOrdnerKandidaten(ORDNER, { lerngruppe: 'Französisch 7 (Mül)', fach: 'Französisch' })).toEqual([])
    expect(kursOrdnerKandidaten(['fr-7-kon'], { lerngruppe: 'FR 7 Kon', fach: 'Französisch' })).toEqual(['fr-7-kon'])
  })
  it('Sek II: Niveau und Kürzel', () => {
    const o = [...ORDNER, 'EN 13 gA Mül', 'EN 13 eA Bre']
    expect(kursOrdnerKandidaten(o, { lerngruppe: 'Englisch 13 eA (Kon)', fach: 'Englisch' })).toEqual(['EN 13 eA Kon'])
    expect(kursOrdnerKandidaten(o, { lerngruppe: '13 eA', fach: 'Englisch', kuerzel: 'kon' })).toEqual(['EN 13 eA Kon'])
    expect(kursOrdnerKandidaten(o, { lerngruppe: '13 eA', fach: 'Englisch' })).toEqual(['EN 13 eA Bre', 'EN 13 eA Kon'])
    expect(kursOrdnerKandidaten(o, { lerngruppe: '13', fach: 'Englisch', kuerzel: 'Mül' })).toEqual(['EN 13 gA Mül'])
  })
  it('mehrdeutig ohne Kürzel, eindeutig mit Kürzel', () => {
    const o = ['FR 7 Kon', 'FR 7 Abc', 'FR 7 2 Kon', 'FR 8 Kon']
    expect(kursOrdnerKandidaten(o, { lerngruppe: '7b', fach: 'Französisch' })).toEqual(['FR 7 2 Kon', 'FR 7 Abc', 'FR 7 Kon'])
    expect(kursOrdnerKandidaten(o, { lerngruppe: '7b', fach: 'Französisch', kuerzel: 'Abc' })).toEqual(['FR 7 Abc'])
    expect(kursOrdnerKandidaten(o, { lerngruppe: '7b', fach: 'Französisch', kuerzel: 'Kon' })).toEqual(['FR 7 2 Kon', 'FR 7 Kon'])
    // Ordner ohne Kürzel passen zu jedem, das gleiche Kürzel geht vor
    expect(kursOrdnerKandidaten(['FR 7', 'FR 7 Kon'], { lerngruppe: '7b', fach: 'Französisch', kuerzel: 'Kon' })).toEqual(['FR 7 Kon'])
    expect(kursOrdnerKandidaten(['FR 7', 'FR 7 Abc'], { lerngruppe: '7b', fach: 'Französisch', kuerzel: 'Kon' })).toEqual(['FR 7'])
  })
  it('Konfession bei Religion', () => {
    const o = ['RK 7 Abc', 'REV 7 Xyz', 'WN 7 Kon']
    expect(kursOrdnerKandidaten(o, { lerngruppe: '7b', fach: 'Evangelische Religion' })).toEqual(['REV 7 Xyz'])
    expect(kursOrdnerKandidaten(o, { lerngruppe: '7b', fach: 'Katholische Religion' })).toEqual(['RK 7 Abc'])
    expect(kursOrdnerKandidaten(o, { lerngruppe: '7b', fach: 'Religion' })).toEqual(['REV 7 Xyz', 'RK 7 Abc'])
    expect(kursOrdnerKandidaten(o, { lerngruppe: '7a', fach: 'Werte und Normen' })).toEqual(['WN 7 Kon'])
  })
  it('aus IServ erkannte Gruppe geht vor', () => {
    expect(kursOrdnerKandidaten(ORDNER, { lerngruppe: 'Französisch 7 (Kon)', fach: 'Französisch', iservGruppe: 'kurs-fr-7-kon' })).toEqual(['FR 7 Kon'])
  })
})

describe('Pfad im Kursordner', () => {
  it('Fachordner fällt weg, weitere Ebenen bleiben', () => {
    expect(kursPfadNachMuster('Gruppen/Klasse {Klasse}/{Fach}', 'FR 7 Kon')).toEqual(['Gruppen', 'FR 7 Kon'])
    expect(kursPfadNachMuster('Groups/{Klasse}/{Fach}/{Schuljahr}', 'FR 7 Kon', (t) => t.replace('{Schuljahr}', '2026-27'))).toEqual([
      'Groups',
      'FR 7 Kon',
      '2026-27'
    ])
    expect(kursPfadNachMuster('Home/Unterricht/{Klasse}/{Fach}', 'FR 7 Kon')).toBeNull()
  })
  it('Schlüssel der gemerkten Wahl', () => expect(kursWahlSchluessel(' 7b ', 'Französisch')).toBe(kursWahlSchluessel('7B', 'französisch')))
})
