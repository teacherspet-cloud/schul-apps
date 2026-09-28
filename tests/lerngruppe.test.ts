import { describe, expect, it } from 'vitest'
import type { CefrTable } from '../src/shared/types'
import levels from '../resources/cefr/levels.json'
import { mitLerngruppe, passeLerngruppeAn } from '../src/renderer/src/shared/lerngruppe'
import { gradeRange, schoolTypesForState } from '../src/renderer/src/modules/arbeitsblatt/didactics/schoolProfiles'

/*
 * Gemeinsame Lerngruppen-Regel (Großprogramm 0.4, D2): Beim Wechsel von Land oder Schulform
 * ziehen Schulform, Jahrgang und Kursniveau in allen Programmen gleich nach. Bis dahin tat das
 * nur das Arbeitsblatt; die Klassenarbeit behielt einen Jahrgang, den es nicht mehr gab.
 */
const table = levels as unknown as CefrTable

describe('Lerngruppe', () => {
  it('lässt eine stimmige Lerngruppe unverändert', () => {
    const typ = schoolTypesForState(table, 'NI').find((t) => t.value === 'gymnasium')!
    expect(passeLerngruppeAn(table, { stateId: 'NI', schoolTypeId: typ.value, schoolTypeName: typ.label, grade: 8, courseLevel: 'mixed' })).toEqual({})
  })

  it('zieht die Schulform auf eine des Landes', () => {
    const r = passeLerngruppeAn(table, { stateId: 'BY', schoolTypeId: 'gibt-es-nicht', schoolTypeName: 'X', grade: 7 })
    const typen = schoolTypesForState(table, 'BY')
    expect(typen.map((t) => t.value)).toContain(r.schoolTypeId)
    expect(r.schoolTypeName).toBe(typen.find((t) => t.value === r.schoolTypeId)!.label)
  })

  it('holt den Jahrgang in den Bereich der Schulform', () => {
    const r = passeLerngruppeAn(table, { stateId: 'NI', schoolTypeId: 'grundschule', schoolTypeName: 'Grundschule', grade: 11 })
    expect(r.grade).toBe(gradeRange(table, 'NI', 'grundschule').max)
  })

  it('setzt ein Kursniveau, das es nicht gibt, auf „gemischt"', () => {
    const r = passeLerngruppeAn(table, { stateId: 'NI', schoolTypeId: 'grundschule', schoolTypeName: 'Grundschule', grade: 3, courseLevel: 'E' })
    expect(r.courseLevel).toBe('mixed')
  })

  it('verbindet Änderung und Folgerungen', () => {
    const alt = { stateId: 'NI', schoolTypeId: 'grundschule', schoolTypeName: 'Grundschule', grade: 4, topic: 'x' }
    const neu = mitLerngruppe(table, alt, { schoolTypeId: 'gymnasium', schoolTypeName: 'Gymnasium', grade: 12 })
    expect(neu.schoolTypeId).toBe('gymnasium')
    expect(neu.grade).toBe(12)
    expect('topic' in neu).toBe(false)
  })
})
