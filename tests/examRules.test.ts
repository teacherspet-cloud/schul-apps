/**
 * Länderregeln für Klassenarbeiten (29.09.2026): alle 16 Länder aus dem Recherchebericht
 * `recherche/klassenarbeiten-laender-2026-09-29.md`, dazu die Befunde F1/F3/F4/G1 der Prüfung
 * der vorhandenen Fächer.
 */
import { describe, expect, it } from 'vitest'
import {
  EXAM_STATE_RULES,
  examWarnings,
  stateRules,
  taktZeile,
  WORTZAHL_GRUND,
  wortzahlErlaubt
} from '../src/renderer/src/modules/klassenarbeit/model/examRules'

const LAENDER = ['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH']

describe('Länderregeln: Bestand', () => {
  it('enthält alle 16 Länder genau einmal', () => {
    expect(EXAM_STATE_RULES.map((r) => r.stateId).sort()).toEqual([...LAENDER].sort())
  })

  it('führt je Land mindestens eine Quelle und die Fächer mit Klassenarbeiten', () => {
    for (const r of EXAM_STATE_RULES) {
      expect(r.sources.length, r.stateId).toBeGreaterThan(0)
      expect(r.subjects.length, r.stateId).toBeGreaterThan(0)
      expect(Array.isArray(r.nichtGesichert), r.stateId).toBe(true)
    }
  })

  it('setzt Tag/Woche auf null, wo das Land nichts regelt', () => {
    expect(stateRules('HH')?.perDay).toBeNull()
    expect(stateRules('HH')?.perWeek).toBe(2)
    expect(stateRules('BE')?.perWeek).toBeNull()
    expect(stateRules('TH')?.perWeek).toBeNull()
    expect(stateRules('NW')?.perDay).toBe(1)
    expect(stateRules('NW')?.perWeek).toBe(2)
  })

  it('schreibt „nicht geregelt" statt einer leeren Zahl', () => {
    expect(taktZeile(stateRules('BE')!)).toBe('höchstens 1 pro Tag, pro Woche nicht geregelt')
    expect(taktZeile(stateRules('NI')!)).toBe('höchstens 1 pro Tag, höchstens 3 pro Woche')
    expect(taktZeile(stateRules('HH')!)).toContain('pro Tag nicht geregelt')
  })

  it('übernimmt die Korrekturen an den fünf bisherigen Ländern', () => {
    // NI: Drittel-Anteil nicht belegt, 30-%-Regel ergänzt
    expect(stateRules('NI')!.weighting).not.toMatch(/Drittel/)
    expect(stateRules('NI')!.notes.some((n) => n.includes('30 %'))).toBe(true)
    // NW: Zahl je Jahrgang
    expect(stateRules('NW')!.mainSubject).toContain('Kl. 7 5–6')
    // BY: Korrekturfrist zwei Wochen
    expect(stateRules('BY')!.correction).toMatch(/^zwei Wochen/)
    // HE: geänderte VOGSV
    expect(stateRules('HE')!.sources.join(' ')).toContain('22.06.2026')
    // BW: § 9 ab 01.08.2026
    expect(stateRules('BW')!.mainSubject).toContain('dreistündige Kernfächer mind. 3')
  })

  it('Bayern: Kernfächer je Ausbildungsrichtung nach GSO § 16 Abs. 2 (29.09.2026)', () => {
    const by = stateRules('BY')!
    for (const fach of ['Physik', 'Griechisch (HG)', 'Chemie (NTG)', 'Musik (MuG)', 'Wirtschaft und Recht (WWG)', 'Politik und Gesellschaft (SWG)']) {
      expect(by.otherSubject).toContain(fach)
    }
    expect(by.sources.join(' ')).toContain('BayGSO-16')
    expect(by.nichtGesichert.join(' ')).not.toMatch(/Ausbildungsrichtung/)
    expect(by.notes.some((n) => n.startsWith('Mittelschule: keine Schulaufgaben'))).toBe(true)
  })
})

describe('Niedersachsen: Regeln für alle modernen Fremdsprachen', () => {
  it('sperrt die Wortzahl auch in Französisch und Spanisch', () => {
    expect(wortzahlErlaubt('NI', 'franzoesisch')).toBe(false)
    expect(wortzahlErlaubt('NI', 'spanisch')).toBe(false)
    expect(wortzahlErlaubt('NI', 'englisch')).toBe(false)
    expect(WORTZAHL_GRUND).toMatch(/Schreibraum und Erwartungshorizont/)
  })

  it('lässt Deutsch, Latein und Sachfächer frei', () => {
    expect(wortzahlErlaubt('NI', 'deutsch')).toBe(true)
    expect(wortzahlErlaubt('NI', 'latein')).toBe(true)
    expect(wortzahlErlaubt('NI', 'mathematik')).toBe(true)
    expect(wortzahlErlaubt('NW', 'franzoesisch')).toBe(true)
  })

  it('warnt auch in Französisch vor isolierter Grammatik', () => {
    expect(examWarnings('NI', 'franzoesisch', 8, ['fr-grammar', 'fr-writing']).some((w) => w.includes('nicht isoliert'))).toBe(true)
    expect(examWarnings('NI', 'spanisch', 8, ['es-language']).some((w) => w.includes('nicht isoliert'))).toBe(true)
  })

  it('meldet in Französisch mehr als zwei Teilkompetenzen und Sprachmittlung vor Jg. 9', () => {
    const w = examWarnings('NI', 'franzoesisch', 8, ['fr-listening', 'fr-reading', 'fr-writing', 'fr-mediation'])
    expect(w.some((x) => x.includes('höchstens zwei Teilkompetenzen'))).toBe(true)
    expect(w.some((x) => x.includes('erst ab Jahrgang 9'))).toBe(true)
    expect(examWarnings('NI', 'franzoesisch', 9, ['fr-reading', 'fr-writing'])).toEqual([])
  })
})

describe('Nordrhein-Westfalen', () => {
  it('verlangt den Schreibteil auch in Französisch und Spanisch', () => {
    expect(examWarnings('NW', 'franzoesisch', 8, ['fr-reading']).some((w) => w.includes('Schreiben Bestandteil jeder Klassenarbeit im Fach Französisch'))).toBe(true)
    expect(examWarnings('NW', 'spanisch', 8, ['es-reading', 'es-writing'])).toEqual([])
  })

  it('warnt in allen Gesellschaftsfächern der Sek I (die tote Zeile wirkt jetzt)', () => {
    for (const fach of ['geschichte', 'erdkunde', 'politik']) {
      expect(examWarnings('NW', fach, 8, []).some((w) => w.includes('keine Klassenarbeiten')), fach).toBe(true)
    }
    expect(examWarnings('NW', 'geschichte', 12, [])).toEqual([])
  })

  it('warnt in Ländern ohne Klassenarbeiten außerhalb der Kernfächer', () => {
    expect(examWarnings('HB', 'geschichte', 8, []).some((w) => w.includes('Kurzarbeiten'))).toBe(true)
    expect(examWarnings('RP', 'erdkunde', 8, []).some((w) => w.includes('keine Klassenarbeiten'))).toBe(true)
    expect(examWarnings('NI', 'geschichte', 8, [])).toEqual([])
  })
})
