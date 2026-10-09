import { describe, expect, it } from 'vitest'
import { bandFuerJahrgang, grammatikUnits, naechsterAbschnitt, vorwahlBuch, type VorwahlBuch, type VorwahlDaten } from '../src/shared/lehrwerkVorwahl'

/* Lehrwerk vorwählen beim Hinzufügen von Vokabeln und Grammatik (09.10.2026, Wunsch der Lehrkraft) */

const units = [
  { name: 'Unit 1', sections: [{ name: 'Station 1' }, { name: 'Station 2' }] },
  { name: 'Unit 2', sections: [{ name: 'Station 1' }, { name: 'Station 2' }] }
]
const gl = (n: number, o: Partial<VorwahlBuch> = {}): VorwahlBuch => ({
  id: `green-line-${n}`,
  name: `Green Line ${n}`,
  language: 'en',
  grade: n + 4,
  stateId: 'NI',
  schoolTypeId: 'gymnasium',
  reihe: 'Green Line',
  units,
  ...o
})
const buecher: VorwahlBuch[] = [
  gl(1),
  gl(2),
  gl(3),
  gl(1, { id: 'green-line-1-by', stateId: 'BY' }),
  { id: 'access-1', name: 'Access 1', language: 'en', grade: 5, reihe: 'Access', units },
  { id: 'decouvertes-1', name: 'Découvertes 1', language: 'fr', grade: 6, reihe: 'Découvertes', units }
]
const leer: VorwahlDaten = { sprache: 'en', jahrgang: 6, kursLehrwerk: null, kursUnits: [], stand: null, klassenLehrwerke: [], ueblicheLehrwerke: [] }

describe('Lehrwerk vorwählen', () => {
  it('1. was der Kurs nutzt geht vor', () => {
    expect(vorwahlBuch({ ...leer, kursLehrwerk: 'access-1', ueblicheLehrwerke: ['green-line-1'] }, buecher)?.id).toBe('access-1')
  })
  it('1. dann der Lehrwerk-Stand der Lerngruppe (Grammatik-Band) und die übrigen Kurse der Klasse', () => {
    expect(vorwahlBuch({ ...leer, stand: { buch: 'Green Line 3', unit: 'Unit 1' } }, buecher)?.id).toBe('green-line-3')
    expect(vorwahlBuch({ ...leer, klassenLehrwerke: ['gibts-nicht', 'access-1'] }, buecher)?.id).toBe('access-1')
  })
  it('2. übliche Reihe der Lehrkraft, Band nach Jahrgang; Land der Schule zuerst', () => {
    expect(vorwahlBuch({ ...leer, jahrgang: 5, ueblicheLehrwerke: ['green-line-3'] }, buecher, { land: 'NI' })?.id).toBe('green-line-1')
    expect(vorwahlBuch({ ...leer, jahrgang: 5, ueblicheLehrwerke: ['green-line-3'] }, buecher, { land: 'BY' })?.id).toBe('green-line-1-by')
    expect(vorwahlBuch({ ...leer, jahrgang: 7, ueblicheLehrwerke: ['green-line-1'] }, buecher)?.id).toBe('green-line-3')
    expect(bandFuerJahrgang(buecher, 'Green Line', 'en', 12)).toBeNull()
  })
  it('3. sonst nichts – auch nicht aus einer anderen Sprache', () => {
    expect(vorwahlBuch(leer, buecher)).toBeNull()
    expect(vorwahlBuch({ ...leer, ueblicheLehrwerke: ['decouvertes-1'] }, buecher)).toBeNull()
    expect(vorwahlBuch({ ...leer, jahrgang: null, ueblicheLehrwerke: ['green-line-1'] }, buecher)).toBeNull()
  })
})

describe('Nächster Abschnitt und Grammatik-Units', () => {
  it('Vokabeln: nach dem höchsten Abschnitt im Kurs, auch über die Unit hinaus', () => {
    expect(naechsterAbschnitt(gl(1), [{ unit: 'Unit 1', abschnitte: ['Station 1'] }])).toEqual({ unit: 'Unit 1', abschnitt: 'Station 2' })
    expect(naechsterAbschnitt(gl(1), [{ unit: 'Unit 1', abschnitte: ['Station 1', 'Station 2'] }])).toEqual({ unit: 'Unit 2', abschnitt: 'Station 1' })
    expect(naechsterAbschnitt(gl(1), [{ unit: 'Unit 2', abschnitte: ['Station 2'] }])).toBeNull()
    expect(naechsterAbschnitt(gl(1), [])).toBeNull()
  })
  it('Grammatik: Units bis zum Stand der Klasse, sonst bis zur höchsten Unit des Kurses', () => {
    const kap = ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4']
    expect(grammatikUnits(kap, 'Green Line 1', { stand: { buch: 'Green Line 1', unit: 'Unit 3' }, kursUnits: [] })).toEqual(['Unit 1', 'Unit 2', 'Unit 3'])
    expect(grammatikUnits(kap, 'Green Line 1', { stand: null, kursUnits: [{ unit: 'Unit 2', abschnitte: [] }] })).toEqual(['Unit 1', 'Unit 2'])
    expect(grammatikUnits(kap, 'Green Line 2', { stand: { buch: 'Green Line 1', unit: 'Unit 3' }, kursUnits: [] })).toEqual([])
  })
})
