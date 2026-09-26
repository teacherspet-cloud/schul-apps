import { describe, expect, it } from 'vitest'
import { eigeneWerte, gruppiereHaeufig } from '../src/renderer/src/shared/haeufig'

/*
 * Auswahllisten Bundesland, Schulform, Fach: alphabetisch, die häufig gewählten oben
 * (Wunsch der Lehrkraft vom 25.09.2026).
 */
const FAECHER = [
  { value: 'deutsch', label: 'Deutsch' },
  { value: 'englisch', label: 'Englisch' },
  { value: 'biologie', label: 'Biologie' },
  { value: 'erdkunde', label: 'Erdkunde / Geographie' },
  { value: 'geschichte', label: 'Geschichte' },
  { value: 'anderes', label: 'Anderes Fach …' },
  { value: 'aesthetik', label: 'Ästhetik' },
  { value: 'sport', label: 'Sport' }
]

const labels = (l: { label: string }[]): string[] => l.map((e) => e.label)

describe('gruppiereHaeufig', () => {
  it('sortiert ohne Zählung alphabetisch nach deutschen Regeln, „Anderes" ans Ende', () => {
    const r = gruppiereHaeufig(FAECHER, {})
    expect(Array.isArray(r) && !('group' in r[0])).toBe(true)
    expect(labels(r as { label: string }[])).toEqual([
      'Ästhetik',
      'Biologie',
      'Deutsch',
      'Englisch',
      'Erdkunde / Geographie',
      'Geschichte',
      'Sport',
      'Anderes Fach …'
    ])
  })

  it('eine einzelne Wahl macht noch nichts häufig', () => {
    const r = gruppiereHaeufig(FAECHER, { englisch: 1 })
    expect('group' in (r as object[])[0]).toBe(false)
  })

  it('stellt ab zwei Wahlen die meistgewählten (höchstens drei) als Gruppe davor, ohne Dubletten', () => {
    const r = gruppiereHaeufig(FAECHER, { englisch: 5, geschichte: 3, sport: 2, biologie: 2, deutsch: 1 }) as {
      group: string
      items: { value: string; label: string }[]
    }[]
    expect(r.map((g) => g.group)).toEqual(['Häufig gewählt', 'Alle'])
    // Englisch vor Geschichte (mehr Wahlen), bei Gleichstand alphabetisch: Biologie vor Sport
    expect(labels(r[0].items)).toEqual(['Englisch', 'Geschichte', 'Biologie'])
    const alle = r[1].items.map((e) => e.value)
    expect(alle).not.toContain('englisch')
    expect(alle).toContain('sport')
    expect(alle[alle.length - 1]).toBe('anderes')
    const werte = r.flatMap((g) => g.items.map((e) => e.value))
    expect(new Set(werte).size).toBe(werte.length)
    expect(werte.length).toBe(FAECHER.length)
  })

  it('entfernt doppelte Werte aus der Eingabe', () => {
    const r = gruppiereHaeufig([...FAECHER, { value: 'deutsch', label: 'Deutsch' }], {}) as { value: string }[]
    expect(r.filter((e) => e.value === 'deutsch').length).toBe(1)
  })

  it('ignoriert Zählungen für Werte, die in dieser Liste nicht vorkommen', () => {
    const r = gruppiereHaeufig(FAECHER, { latein: 9 })
    expect('group' in (r as object[])[0]).toBe(false)
  })
})

describe('eigene Fächer oben (Paket 12)', () => {
  it('Gruppe „Eigene Fächer", dann „Häufig gewählt" ohne Dubletten, dann „Andere Fächer" alphabetisch', () => {
    const r = gruppiereHaeufig(FAECHER, { englisch: 5, sport: 3, deutsch: 2 }, ['anderes'], ['geschichte', 'englisch']) as {
      group: string
      items: { label: string }[]
    }[]
    expect(r.map((g) => g.group)).toEqual(['Eigene Fächer', 'Häufig gewählt', 'Andere Fächer'])
    expect(labels(r[0].items)).toEqual(['Englisch', 'Geschichte'])
    expect(labels(r[1].items)).toEqual(['Sport', 'Deutsch'])
    expect(labels(r[2].items)).toEqual(['Ästhetik', 'Biologie', 'Erdkunde / Geographie', 'Anderes Fach …'])
    const alle = r.flatMap((g) => g.items.map((i) => i.label))
    expect(new Set(alle).size).toBe(alle.length)
  })

  it('ohne häufige Wahlen: nur „Eigene Fächer" und „Andere Fächer"', () => {
    const r = gruppiereHaeufig(FAECHER, {}, ['anderes'], ['sport']) as { group: string }[]
    expect(r.map((g) => g.group)).toEqual(['Eigene Fächer', 'Andere Fächer'])
  })

  it('Sprachkürzel der Vokabellisten werden den Fächern zugeordnet', () => {
    const data = [{ value: 'en' }, { value: 'fr' }, { value: 'la' }, { value: 'ru' }]
    expect(eigeneWerte(['englisch', 'latein', 'geschichte'], data)).toEqual(['en', 'la'])
    expect(eigeneWerte([], data)).toEqual([])
  })
})
