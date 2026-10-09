import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { pruefeLehrplan } from '../src/shared/lehrplan'
import { katalogFuer } from '../src/renderer/src/shared/themenKatalog'
import type { KatalogThema } from '../src/renderer/src/shared/themenVorschlag'
import {
  gruppiereNachThema,
  klassenSpanne,
  OHNE_FACH,
  OHNE_THEMENBEREICH,
  passtZuSuche,
  themenAuswahl,
  themenbereichFuer,
  vergleicheEintraege,
  zuletztBearbeitet,
  type ThemenEintrag
} from '../src/renderer/src/shared/themenBibliothek'

/*
 * Themen-Bibliothek (09.10.2026, Tafelbilder, Rückmeldungen, freigegebene Blätter): Themenbereich
 * OHNE KI aus dem Lehrplankatalog, Vorrang der Handwahl, Gliederung Fach → Themenbereich, Sortierung
 * nach Klasse und Titel, Klassenspanne, „Zuletzt bearbeitet", Suche.
 */

const NI = pruefeLehrplan(JSON.parse(readFileSync(resolve(__dirname, '../resources/lehrplaene/NI.json'), 'utf8')), 'NI')!
const geschichte = katalogFuer('geschichte', NI, 'gymnasium', 'NI')

let n = 0
const eintrag = (o: Partial<ThemenEintrag>): ThemenEintrag => ({
  id: `e${++n}`,
  titel: 'Ohne Titel',
  fach: 'Geschichte',
  fachId: 'geschichte',
  updatedAt: '2026-10-01T10:00:00.000Z',
  ...o
})

/** Kleiner, fester Katalog für die Regeln, die nicht vom Lehrplan abhängen */
const KLEIN: KatalogThema[] = [
  { name: 'Der Erste Weltkrieg', quelle: 'lehrplan', jahrgaenge: [9, 10] },
  { name: 'Ursachen des Ersten Weltkriegs', quelle: 'lehrplan', pfad: ['Der Erste Weltkrieg'], jahrgaenge: [9, 10] },
  { name: 'Die Weimarer Republik', quelle: 'lehrplan', jahrgaenge: [9, 10] },
  { name: 'Das Römische Reich', quelle: 'lehrplan', jahrgaenge: [6] }
]

describe('Themenbereich ohne KI', () => {
  it('ordnet nach Stichwörtern dem obersten Katalogthema zu', () => {
    const z = themenbereichFuer(eintrag({ titel: 'Ursachen des Ersten Weltkriegs', grade: 9 }), KLEIN)
    expect(z).toEqual({ name: 'Der Erste Weltkrieg', herkunft: 'katalog' })
  })

  it('nimmt das Thema mit, wenn der Titel nichts sagt', () => {
    const z = themenbereichFuer(eintrag({ titel: 'Tafelbild 3', thema: 'Weimarer Republik – Krisenjahre', grade: 10 }), KLEIN)
    expect(z.name).toBe('Die Weimarer Republik')
  })

  it('beachtet den Jahrgang des Katalogthemas', () => {
    expect(themenbereichFuer(eintrag({ titel: 'Das Römische Reich', grade: 6 }), KLEIN).name).toBe('Das Römische Reich')
    expect(themenbereichFuer(eintrag({ titel: 'Das Römische Reich', grade: 10 }), KLEIN).name).toBe(OHNE_THEMENBEREICH)
  })

  it('ein Überthema mit dem Namen eines Katalogthemas zählt vor den Stichwörtern', () => {
    const z = themenbereichFuer(eintrag({ titel: 'Die Weimarer Republik im Vergleich', ueberthema: 'Ursachen des Ersten Weltkriegs' }), KLEIN)
    expect(z).toEqual({ name: 'Der Erste Weltkrieg', herkunft: 'ueberthema' })
  })

  it('ein unbekanntes Überthema gilt im Wortlaut, sonst „Ohne Themenbereich"', () => {
    expect(themenbereichFuer(eintrag({ titel: 'Stundeneinstieg', ueberthema: 'Projektwoche › Tag 1' }), KLEIN)).toEqual({ name: 'Projektwoche', herkunft: 'wortlaut' })
    expect(themenbereichFuer(eintrag({ titel: 'Stundeneinstieg' }), KLEIN)).toEqual({ name: OHNE_THEMENBEREICH, herkunft: 'ohne' })
    expect(themenbereichFuer(eintrag({ titel: 'Ursachen des Ersten Weltkriegs' }), [])).toEqual({ name: OHNE_THEMENBEREICH, herkunft: 'ohne' })
  })

  it('Handwahl vor Bereich der App vor Katalog', () => {
    const e = eintrag({ titel: 'Ursachen des Ersten Weltkriegs', grade: 9 })
    expect(themenbereichFuer({ ...e, bereichVorgabe: 'Imperialismus' }, KLEIN)).toEqual({ name: 'Imperialismus', herkunft: 'bereich' })
    expect(themenbereichFuer({ ...e, bereichVorgabe: 'Imperialismus', themenbereich: 'Wiederholung' }, KLEIN)).toEqual({ name: 'Wiederholung', herkunft: 'hand' })
  })

  it('mit dem echten Kerncurriculum Niedersachsen (Geschichte)', () => {
    expect(geschichte.length).toBeGreaterThan(5)
    const z = themenbereichFuer(eintrag({ titel: 'Die Weimarer Republik', thema: 'Weimarer Republik', grade: 9 }), geschichte)
    expect(z.herkunft).toBe('katalog')
    // Das oberste Thema des Pfads, nicht ein Unterthema
    const k = geschichte.find((x) => x.name === z.name)
    expect(k?.pfad ?? []).toEqual([])
  })
})

describe('Gliederung Fach → Themenbereich', () => {
  const liste = [
    eintrag({ titel: 'Versailler Vertrag', grade: 10, themenbereich: 'Der Erste Weltkrieg' }),
    eintrag({ titel: 'Ursachen des Ersten Weltkriegs', grade: 9 }),
    eintrag({ titel: 'Julikrise', grade: 9, themenbereich: 'der erste weltkrieg' }),
    eintrag({ titel: 'Stundeneinstieg' }),
    eintrag({ titel: 'Brüche', fach: 'Mathematik', fachId: 'mathematik', grade: 6 }),
    eintrag({ titel: 'Notizen', fach: '', fachId: '' })
  ]
  const gruppen = gruppiereNachThema(liste, (e) => themenbereichFuer(e, KLEIN))

  it('Fächer alphabetisch, „Ohne Fach" zuletzt; Anzahl und Klassenspanne', () => {
    expect(gruppen.map((g) => g.fach)).toEqual(['Geschichte', 'Mathematik', OHNE_FACH])
    expect(gruppen[0].anzahl).toBe(4)
    expect(gruppen[0].klassen).toBe('Kl. 9–10')
  })

  it('Bereiche alphabetisch, „Ohne Themenbereich" zuletzt; gleich geschriebene zusammen', () => {
    expect(gruppen[0].themen.map((t) => t.name)).toEqual(['Der Erste Weltkrieg', OHNE_THEMENBEREICH])
    expect(gruppen[0].themen[0].eintraege.length).toBe(3)
  })

  it('im Bereich nach Klasse, dann Titel', () => {
    expect(gruppen[0].themen[0].eintraege.map((e) => e.titel)).toEqual(['Julikrise', 'Ursachen des Ersten Weltkriegs', 'Versailler Vertrag'])
    expect(gruppen[0].themen[0].klassen).toBe('Kl. 9–10')
  })

  it('ohne Klasse ans Ende, Titel mit Zahlen natürlich sortiert', () => {
    const l = [{ titel: 'Teil 10', grade: 7 }, { titel: 'Ohne' }, { titel: 'Teil 2', grade: 7 }, { titel: 'Anfang', grade: 5 }].sort(vergleicheEintraege)
    expect(l.map((x) => x.titel)).toEqual(['Anfang', 'Teil 2', 'Teil 10', 'Ohne'])
  })
})

describe('Kleinigkeiten', () => {
  it('Klassenspanne', () => {
    expect(klassenSpanne([])).toBe('')
    expect(klassenSpanne([undefined, 7])).toBe('Kl. 7')
    expect(klassenSpanne([10, 9, 9])).toBe('Kl. 9–10')
  })

  it('Zuletzt bearbeitet: die neuesten vier', () => {
    const l = [1, 5, 3, 2, 4, 6].map((t) => ({ t, updatedAt: `2026-10-0${t}T08:00:00.000Z` }))
    expect(zuletztBearbeitet(l).map((x) => x.t)).toEqual([6, 5, 4, 3])
  })

  it('Suche über Titel, Thema, Themenbereich und Zusatz – ohne Umlaut-Sorgen', () => {
    const e = eintrag({ titel: 'Julikrise', thema: 'Bündnissysteme', grade: 9, suchtext: '9b' })
    expect(passtZuSuche(e, 'Der Erste Weltkrieg', 'weltkrieg')).toBe(true)
    expect(passtZuSuche(e, 'Der Erste Weltkrieg', 'bundnis juli')).toBe(true)
    expect(passtZuSuche(e, 'Der Erste Weltkrieg', '9b')).toBe(true)
    expect(passtZuSuche(e, 'Der Erste Weltkrieg', 'weimar')).toBe(false)
  })

  it('Auswahl: benutzte Bereiche zuerst, dann die obersten Katalogthemen (passende Klasse vorn), ohne Doppelte', () => {
    const a = themenAuswahl(KLEIN, ['Wiederholung', 'der erste weltkrieg', OHNE_THEMENBEREICH], 6)
    expect(a).toEqual(['Wiederholung', 'der erste weltkrieg', 'Das Römische Reich', 'Die Weimarer Republik'])
  })
})
