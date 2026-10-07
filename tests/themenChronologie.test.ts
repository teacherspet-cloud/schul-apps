import { describe, expect, it } from 'vitest'
import type { Themenbereich } from '../src/shared/themen'
import { chronologisch, zeitpunktVon } from '../src/renderer/src/shared/themenChronologie'

/**
 * Themenbereiche in der Reihenfolge des Unterrichts (07.10.2026): Klasse 5 vor Klasse 6, Anfang des Schuljahres vor
 * dem Laufe des Jahres, sonst alphabetisch. Vorher stand Green Line 5 vor Green Line 1 und 6 (Reihenfolge des Anlegens).
 */
const B = (id: string, name: string, reihenfolge: number, elternId?: string): Themenbereich => ({
  id,
  fachId: 'englisch',
  name,
  reihenfolge,
  angelegt: '',
  ...(elternId ? { elternId } : {})
})
const baende = { 'Green Line 1': 5, 'Green Line 5': 9, 'Green Line 6': 10 }

describe('Themenbereiche chronologisch', () => {
  it('Bände nach Klasse, Bereiche nach den Jahrgängen ihrer Materialien, Rest alphabetisch', () => {
    const alle = [
      B('gl5', 'Green Line 5', 0),
      B('gl1', 'Green Line 1', 1),
      B('gl6', 'Green Line 6', 2),
      B('shak', 'Shakespeare', 3),
      B('gent', 'Gentrification in London', 4),
      B('allg', 'Englisch', 5)
    ]
    const jahrgaenge: Record<string, number[]> = { gent: [9, 10], shak: [] }
    const r = chronologisch(alle, (b) => zeitpunktVon(b, alle, baende, (id) => jahrgaenge[id] ?? []))
    // Gentrification (Kl. 9, im Laufe des Jahres) nach Green Line 5 (Anfang Kl. 9); ohne Angabe alphabetisch am Ende
    expect(r.map((b) => b.name)).toEqual(['Green Line 1', 'Green Line 5', 'Gentrification in London', 'Green Line 6', 'Englisch', 'Shakespeare'])
  })
  it('Kapitel unter einem Band in der Reihenfolge des Buches', () => {
    const alle = [B('gl1', 'Green Line 1', 0), B('u3', 'Unit 3: Our Greenwich', 0, 'gl1'), B('u1', 'Unit 1: A new school', 1, 'gl1'), B('h', 'Hello', 2, 'gl1')]
    const kinder = alle.filter((b) => b.elternId === 'gl1')
    const r = chronologisch(kinder, (b) => zeitpunktVon(b, alle, baende, () => []))
    expect(r.map((b) => b.name)).toEqual(['Hello', 'Unit 1: A new school', 'Unit 3: Our Greenwich'])
  })
  it('„Unit 1" ist nicht „Unit 10"; Zahlen im Rückfall natürlich sortiert', () => {
    const alle = [B('x', 'Thema 10', 0), B('y', 'Thema 2', 1)]
    expect(chronologisch(alle, () => null).map((b) => b.name)).toEqual(['Thema 2', 'Thema 10'])
  })
})
