/** Überthemen (19.10.2026): Zuordnung ohne KI, Q-Phase Niedersachsen, Halbjahr und Abiturjahr */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { abiturjahrVon, kandidatenFuer, semesterVon, stamme, zuordnen, type OberstufeFach } from '../src/shared/ueberthemen'
import { pruefeLehrplan } from '../src/shared/lehrplan'
import { themenGruppieren, type ThemenStand } from '../src/renderer/src/modules/lernen/regal/materialThemen'

const ni = pruefeLehrplan(JSON.parse(readFileSync('resources/lehrplaene/NI.json', 'utf8')), 'NI')!
const oberstufe = JSON.parse(readFileSync('resources/lehrplaene/oberstufe/NI.json', 'utf8')).faecher as Record<string, OberstufeFach>

describe('Überthemen', () => {
  it('Stämme: klein, ohne Umlaute, Füllwörter weg', () => {
    expect(stamme('Die Industrialisierung und die Soziale Frage')).toEqual(['indust', 'sozial', 'frage'])
  })
  it('Geschichte 8 (NI, Gymnasium): Blatt zur Dampfmaschine landet bei der Industrialisierung', () => {
    const k = kandidatenFuer({ lehrplan: ni.eintraege, fachId: 'geschichte', schulformen: ['gymnasium'], jahrgang: 8 })
    expect(k.some((x) => x.name === 'Industrialisierung und Soziale Frage')).toBe(true)
    const z = zuordnen({ titel: 'Arbeitsbedingungen in der Fabrik', thema: 'Industrialisierung in England' }, k)
    expect(z?.kandidat.name).toBe('Industrialisierung und Soziale Frage')
  })
  it('ohne Treffer: null („Weitere Materialien")', () => {
    const k = kandidatenFuer({ lehrplan: ni.eintraege, fachId: 'geschichte', schulformen: ['gymnasium'], jahrgang: 8 })
    expect(zuordnen({ titel: 'Klassenfahrt-Infos' }, k)).toBeNull()
  })
  it('Fach-Vorgaben gehen vor', () => {
    const k = kandidatenFuer({ lehrplan: ni.eintraege, fachId: 'geschichte', schulformen: ['gymnasium'], jahrgang: 8, fachvorgaben: ['Dampf und Fabrik'] })
    expect(k[0].schluessel).toBe('fv:Dampf und Fabrik')
  })
  it('Q-Phase Geschichte NI, Abitur 2028: Rahmenthemen mit Halbjahr, Wahlmodul per Wortlaut', () => {
    const k = kandidatenFuer({ lehrplan: ni.eintraege, fachId: 'geschichte', schulformen: ['gymnasium'], jahrgang: 12, oberstufe: oberstufe.geschichte, abiturjahr: 2028, niveau: 'eA' })
    const rt1 = k.find((x) => x.name.startsWith('Rahmenthema 1'))
    expect(rt1?.semester).toBe('Q1.1')
    const z = zuordnen({ titel: 'Quellenarbeit', thema: 'Die Große Pest und die Folgen' }, k)
    expect(z?.kandidat.name.startsWith('Rahmenthema 1')).toBe(true)
    expect(z?.modul).toBe('Die Große Pest und die Folgen')
  })
  it('Halbjahr und Abiturjahr', () => {
    expect(semesterVon(Date.parse('2026-10-01'), 12)).toBe('Q1.1')
    expect(semesterVon(Date.parse('2027-03-01'), 12)).toBe('Q1.2')
    expect(semesterVon(Date.parse('2027-10-01'), 13)).toBe('Q2.1')
    expect(semesterVon(Date.parse('2027-10-01'), 9)).toBeNull()
    expect(abiturjahrVon(12, 2026)).toBe(2028)
    expect(abiturjahrVon(13, 2026)).toBe(2027)
  })
})

describe('Materialien der Lernenden nach Überthemen', () => {
  const st: ThemenStand = {
    schuljahr: 2026,
    eintraege: {
      'blatt:a': { thema: 'Industrialisierung', schluessel: 'kc:I', schuljahr: 2026, jahrgang: 8, rang: 101, erstellt: '2026-10-01' },
      'blatt:b': { thema: 'Revolutionen', schluessel: 'kc:R', schuljahr: 2026, jahrgang: 8, rang: 100, erstellt: '2026-09-01' },
      'blatt:c': { thema: 'Mittelalter', schluessel: 'kc:M', schuljahr: 2025, jahrgang: 7, rang: 102, erstellt: '2025-09-10' },
      'blatt:d': { thema: 'Reformation', schluessel: 'kc:F', schuljahr: 2025, jahrgang: 7, rang: 101, erstellt: '2026-03-10' }
    }
  }
  const items = ['a', 'b', 'c', 'd', 'x'].map((k) => ({ key: `blatt:${k}` }))
  it('Jahre absteigend, neuestes Jahr: Neuestes oben, frühere chronologisch, Weitere zuletzt', () => {
    const j = themenGruppieren(items, st)
    expect(j.map((x) => x.schuljahr)).toEqual([2026, 2025])
    expect(j[0].themen.map((t) => t.name)).toEqual(['Industrialisierung', 'Revolutionen', 'Weitere Materialien'])
    expect(j[1].themen.map((t) => t.name)).toEqual(['Mittelalter', 'Reformation'])
  })
  it('nur ein Schuljahr („Materialien")', () => {
    expect(themenGruppieren(items, st, 2026).map((x) => x.schuljahr)).toEqual([2026])
  })
})

describe('Überthemen: zusammengesetzte Wörter (Befund 6e, 19.10.2026)', () => {
  it('„Warum zerfiel das Weströmische Reich?" landet bei einem Rom-Thema, nicht unter „Weitere"', () => {
    const k = kandidatenFuer({ lehrplan: ni.eintraege, fachId: 'geschichte', schulformen: ['gymnasium'], jahrgang: 6 })
    const z = zuordnen({ titel: 'Warum zerfiel das Weströmische Reich?', thema: 'Der Untergang des Weströmischen Reichs' }, k)
    expect(z?.kandidat.name).toMatch(/Röm|Rom/)
  })
})
