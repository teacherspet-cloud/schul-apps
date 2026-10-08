import { describe, expect, it, vi } from 'vitest'
import { entwuerfeIn, leererInhalt, materialienDerReihe, materialName, type Schritt } from '../src/shared/reihe'

vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined })
const { dauerWorte, schaetzeGesamtdauer } = await import('../src/renderer/src/shared/restzeit')

/**
 * Unterrichtsreihe (08.10.2026, Plan Abschnitte A und D): Materialien auffindbar (Name, Liste der Reihe), Marke
 * „KI-Entwurf" und die Vorschau „Alle Platzhalter erstellen" mit geschätzter Dauer.
 */

const schritt = (id: string, teil: Partial<Schritt> = {}): Schritt => ({
  id,
  titel: `Schritt ${id}`,
  lernziele: [],
  rolle: 'pflicht',
  erfolg: { art: 'abgabe' },
  inhalt: leererInhalt('aufgabe'),
  ...teil
})

describe('Name eines Materials aus der Reihe', () => {
  it('heißt „<Reihe> – <Schritt>"', () => {
    expect(materialName('Julikrise 1914', 'Das Attentat von Sarajevo')).toBe('Julikrise 1914 – Das Attentat von Sarajevo')
  })
  it('kommt mit fehlenden oder gleichen Teilen zurecht', () => {
    expect(materialName('', 'Das Attentat')).toBe('Das Attentat')
    expect(materialName('Julikrise', '  ')).toBe('Julikrise')
    expect(materialName('Julikrise', 'julikrise')).toBe('Julikrise')
    expect(materialName('', '')).toBe('Arbeitsblatt')
  })
})

describe('KI-Entwürfe in der Reihe', () => {
  it('zählt Schritte mit Marke, aber keine noch leeren Platzhalter', () => {
    const r = {
      schritte: [
        schritt('a', { kiEntwurf: true }),
        schritt('b'),
        schritt('c', { kiEntwurf: true, platzhalter: { beschreibung: 'kommt noch' } }),
        schritt('d', { kiEntwurf: true })
      ]
    }
    expect(entwuerfeIn(r)).toBe(2)
    expect(entwuerfeIn({ schritte: [] })).toBe(0)
  })
})

describe('Materialien der Reihe', () => {
  it('listet verknüpfte Arbeitsblätter und Tests in der Reihenfolge der Schritte', () => {
    const blatt = { ...(leererInhalt('arbeitsblatt') as Extract<Schritt['inhalt'], { art: 'arbeitsblatt' }>), quelle: 'ws1', titel: 'Das Attentat' }
    const liste = materialienDerReihe({
      schritte: [
        schritt('a', { inhalt: blatt }),
        schritt('b'),
        schritt('c', { inhalt: { ...blatt, quelle: '' } }),
        schritt('d', { titel: 'Test zur Julikrise', test: { modul: 'lernzielkontrolle', docId: 'lzk1' } })
      ]
    })
    expect(liste.map((m) => [m.art, m.moduleId, m.docId, m.titel])).toEqual([
      ['arbeitsblatt', 'arbeitsblatt', 'ws1', 'Das Attentat'],
      ['test', 'lernzielkontrolle', 'lzk1', 'Test zur Julikrise']
    ])
  })
})

describe('Geschätzte Dauer mehrerer Aufträge', () => {
  const dauer = (art: string): number | null => ({ blatt: 240_000, karten: 30_000 })[art] ?? null

  it('teilt die Summe durch die Plätze, mindestens aber der längste Auftrag', () => {
    // 4 × 4 min + 2 × 30 s = 17 min auf 3 Plätzen ≈ 5:40 min
    expect(schaetzeGesamtdauer(['blatt', 'blatt', 'blatt', 'blatt', 'karten', 'karten'], dauer)).toEqual({ ms: 340_000, unbekannt: 0 })
    // Ein Blatt und ein Kärtchen: das Blatt bestimmt die Dauer
    expect(schaetzeGesamtdauer(['blatt', 'karten'], dauer).ms).toBe(240_000)
  })

  it('zählt Arten ohne gemerkten Lauf als unbekannt', () => {
    expect(schaetzeGesamtdauer(['blatt', 'neu'], dauer)).toEqual({ ms: 240_000, unbekannt: 1 })
    expect(schaetzeGesamtdauer(['neu', 'neu'], dauer)).toEqual({ ms: null, unbekannt: 2 })
  })

  it('nennt die Dauer in Worten', () => {
    expect(dauerWorte(40_000)).toBe('etwa 40 Sek.')
    expect(dauerWorte(340_000)).toBe('etwa 6 min')
    expect(dauerWorte(70 * 60_000)).toBe('etwa 1 h 10 min')
  })
})
