import { describe, expect, it } from 'vitest'
import { curriculumBand, curriculumThemen, darfFachVorgaben, notenschluesselGueltig, vorgabenBereinigt } from '../src/shared/fachvorgaben'
import { siehtLehrwerkPflege } from '../src/shared/fachobleute'
import { mitSchulOperatoren, setzeSchulOperatoren } from '../src/shared/operatoren/zugriff'
import { vorwissenAus, vorwissenText } from '../src/shared/vorwissenLerngruppe'
import { teileVorwissen } from '../src/renderer/src/modules/arbeitsblatt/didactics/vorwissen/vorwissen'

/*
 * Vorgaben der Fächer (13.10.2026, abgestimmt): Fachobleute pflegen Curriculum und Standards ihres Fachs; Standards sind
 * persönlich änderbar, das Curriculum je Kurs.
 */
describe('Fachvorgaben', () => {
  it('bereinigt: nur gültige Jahrgänge, Notenschlüssel fallend, Stufe 1–5, Erinnerungen an/aus', () => {
    const v = vorgabenBereinigt({
      lehrwerke: { '5': 'Green Line 1', '14': 'X', '6': '' },
      themen: { '5': ['Family', 'Family', ' School '], abc: ['x'] },
      notenschluessel: [90, 80, 65, 50, 20],
      problemStufe: 7,
      erinnerungen: 'aus',
      operatoren: {
        zusatz: [
          { name: 'skizzieren', erklaerung: 'grob darstellen' },
          { name: '', erklaerung: 'x' }
        ],
        weglassen: ['outline', 'outline']
      },
      fremd: 1
    })
    expect(v).toEqual({
      lehrwerke: { '5': 'Green Line 1' },
      themen: { '5': ['Family', 'School'] },
      notenschluessel: [90, 80, 65, 50, 20],
      erinnerungen: 'aus',
      operatoren: { zusatz: [{ name: 'skizzieren', erklaerung: 'grob darstellen' }], weglassen: ['outline'] }
    })
    expect(notenschluesselGueltig([50, 60, 70, 80, 90])).toBeUndefined()
  })

  it('Rechte: Admin alles, Fachobleute nur ihr Fach, Lernende nichts', () => {
    expect(darfFachVorgaben('admin', [], 'geschichte')).toBe(true)
    expect(darfFachVorgaben('lehrkraft', ['englisch'], 'englisch')).toBe(true)
    expect(darfFachVorgaben('lehrkraft', ['englisch'], 'geschichte')).toBe(false)
    expect(darfFachVorgaben('schueler', ['englisch'], 'englisch')).toBe(false)
    // Lehrwerk-Apps nur für Fachobleute eines Fachs mit Lehrwerken
    expect(siehtLehrwerkPflege('lehrkraft', ['geschichte'])).toBe(false)
    expect(siehtLehrwerkPflege('lehrkraft', ['englisch'])).toBe(true)
  })

  it('Curriculum: Band des Jahrgangs, frühere Themen', () => {
    const v = { lehrwerke: { '7': 'Green Line 3' }, themen: { '5': ['A'], '6': ['B'], '7': ['C'] } }
    expect(curriculumBand(v, 7)).toBe('Green Line 3')
    expect(curriculumBand(v, 8)).toBeUndefined()
    expect(curriculumThemen(v, 7)).toEqual({ jetzt: ['C'], frueher: ['A', 'B'] })
  })

  it('Schulinterne Operatoren: weglassen und ergänzen', () => {
    setzeSchulOperatoren((fach) => (fach === 'englisch' ? { zusatz: [{ name: 'sketch', erklaerung: 'draw roughly' }], weglassen: ['Outline'] } : undefined))
    const l = mitSchulOperatoren('englisch', [
      { operator: 'outline', definition: 'x' },
      { operator: 'describe', definition: 'y' }
    ])
    expect(l.map((o) => o.operator)).toEqual(['describe', 'sketch'])
    expect(mitSchulOperatoren('geschichte', [{ operator: 'outline', definition: 'x' }])).toHaveLength(1)
    setzeSchulOperatoren(null)
  })

  it('Vorwissen: Curriculum als eigener Abschnitt, Zeilen richtig eingeordnet', () => {
    const v = vorwissenAus({ themen: [], lernziele: [], grammatik: [], testSchwerpunkte: [], kinder: [] }, [])
    v.curriculum = { frueher: ['Family'], spaeter: ['Shakespeare'] }
    const text = vorwissenText(v)
    expect(text).toBe('Laut schulinternem Curriculum:\nBehandelt: Family\nNoch nicht behandelt: Shakespeare')
    const t = teileVorwissen(text)
    expect(t.vorwissen).toEqual(['Family'])
    expect(t.nochNicht).toEqual(['Shakespeare'])
  })
})
