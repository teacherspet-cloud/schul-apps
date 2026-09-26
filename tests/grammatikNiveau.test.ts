import { describe, expect, it } from 'vitest'
import { einfuehrungsNiveau, grammarTopicsFor, grammarTopicsForMeta, ueberNiveau } from '../src/renderer/src/modules/arbeitsblatt/didactics/grammar'
import { stoffVorschlaege } from '../src/renderer/src/modules/arbeitsblatt/didactics/vorwissen/vorwissen'
import { suggestLevel } from '../src/renderer/src/shared/cefr'
import type { CefrTable } from '../src/shared/types'
import type { WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import tabelle from '../resources/cefr/levels.json'

/*
 * Befund der Lehrkraft vom 26.09.2026: Im Grammatiktest wurden bei A1 und Klasse 5 Themen mit
 * „A2/B1" angeboten, und das Niveau folgte dem Jahrgang nicht. Hier: die Auswahl der Themen
 * beachtet das Niveau, und die Niveautabelle liefert zu Klasse 5 das A1.
 */
const NI = { stateId: 'NI', schoolTypeId: 'gymnasium' }

describe('Einführungsniveau eines Themas', () => {
  it('nimmt das niedrigste GER-Niveau der Angabe', () => {
    expect(einfuehrungsNiveau('A2/B1')).toBe('A2')
    expect(einfuehrungsNiveau('A1→B1')).toBe('A1')
    expect(einfuehrungsNiveau('B1+/B2')).toBe('B1+')
    expect(einfuehrungsNiveau('A2 / B1+')).toBe('A2')
    expect(einfuehrungsNiveau('Lehrbuch')).toBeNull()
    expect(einfuehrungsNiveau('Sek I Stufe 1')).toBeNull()
  })

  it('Spielraum eine Teilstufe', () => {
    expect(ueberNiveau({ level: 'A2/B1' }, 'A1')).toBe(true)
    expect(ueberNiveau({ level: 'A2' }, 'A1')).toBe(true)
    expect(ueberNiveau({ level: 'A1/A2' }, 'A1')).toBe(false)
    expect(ueberNiveau({ level: 'A2' }, 'A1+')).toBe(false)
    expect(ueberNiveau({ level: 'B1' }, 'A1+')).toBe(true)
    expect(ueberNiveau({ level: 'B1' }, undefined)).toBe(false)
    expect(ueberNiveau({ level: 'Lehrbuch' }, 'A1')).toBe(false)
  })
})

describe('Grammatikthemen nach Niveau', () => {
  it('Englisch, Klasse 5, A1: kein Thema mit A2 oder A2/B1 – ohne Niveau waren sie dabei', () => {
    const ohne = grammarTopicsFor({ subjectId: 'englisch', grade: 5, ...NI, sequence: 'fs1' })
    const mit = grammarTopicsFor({ subjectId: 'englisch', grade: 5, ...NI, sequence: 'fs1', cefrLevel: 'A1' })
    expect(ohne.some((t) => /^A2|B1/.test(t.level))).toBe(true)
    expect(mit.length).toBeGreaterThan(10)
    expect(mit.filter((t) => ueberNiveau(t, 'A1'))).toEqual([])
    expect(mit.map((t) => t.level).every((l) => l.startsWith('A1'))).toBe(true)
  })

  it('Klasse 6 (A1+) behält Perfekt und Steigerung, Klasse 7 (A2) keine B1-Themen', () => {
    const k6 = grammarTopicsFor({ subjectId: 'englisch', grade: 6, ...NI, sequence: 'fs1', cefrLevel: 'A1+' }).map((t) => t.label)
    expect(k6).toContain('Perfekt')
    expect(k6).toContain('Steigerung und Vergleich der Adjektive')
    const k7 = grammarTopicsFor({ subjectId: 'englisch', grade: 7, ...NI, sequence: 'fs1', cefrLevel: 'A2' })
    expect(k7.some((t) => einfuehrungsNiveau(t.level) === 'B1')).toBe(false)
  })

  it('der Grammatiktest reicht sein Niveau durch (dieselbe Auswahl wie das Arbeitsblatt)', () => {
    const meta = { subjectId: 'franzoesisch', grade: 6, ...NI, languageOrder: 2, cefrLevel: 'A1' } as unknown as WorksheetMeta
    expect(grammarTopicsForMeta(meta).filter((t) => ueberNiveau(t, 'A1'))).toEqual([])
  })

  it('Latein und Deutsch haben kein GER-Niveau – dort ändert sich nichts', () => {
    const q = { subjectId: 'latein', grade: 7, ...NI, sequence: 'fs2' as const }
    expect(grammarTopicsFor({ ...q, cefrLevel: 'A1' })).toEqual(grammarTopicsFor(q))
  })

  it('Stoff-Vorschläge der Klassenarbeit: keine Grammatik über dem Niveau', () => {
    const v = stoffVorschlaege({ subjectId: 'englisch', topic: '', grade: 6, ...NI, gerRichtwert: 'A1' })
    const hoch = v.vorschlaege.filter((x) => x.text.startsWith('Grammatik:') && x.niveau && ueberNiveau({ level: x.niveau }, 'A1'))
    expect(hoch).toEqual([])
  })
})

describe('Niveautabelle: das Niveau folgt dem Jahrgang', () => {
  const t = tabelle as unknown as CefrTable
  it('Niedersachsen, Gymnasium, Englisch: Klasse 5 → A1, Klasse 7 → A2', () => {
    expect(suggestLevel(t, 'NI', 'gymnasium', 1, 5)?.level).toBe('A1')
    expect(suggestLevel(t, 'NI', 'gymnasium', 1, 7)?.level).toBe('A2')
    expect(suggestLevel(t, 'NI', 'gymnasium', 2, 6)?.level).toBe('A1')
  })
})
