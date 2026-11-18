// „Zahl der Aufgaben" und „Fragen zum Text" als Spanne (18.11.2026, Wunsch der Lehrkraft: „5-10" eingeben)
import { describe, expect, it } from 'vitest'
import { aufgabenFelder, aufgabenSpanne, fragenFelder, fragenSpanne, leseSpanne, spanneText } from '../src/renderer/src/modules/arbeitsblatt/didactics/anzahlSpanne'
import { checkTaskCount } from '../src/renderer/src/modules/arbeitsblatt/didactics/sheetChecks'
import { seitenSchaetzung } from '../src/renderer/src/modules/arbeitsblatt/didactics/seiten'
import { comprehensionRules, taskCountRules, wantedTasks } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { Sheet, WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { profileFromMeta } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'

const meta = (m: Partial<WorksheetMeta> = {}): WorksheetMeta => ({ ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'englisch', grade: 7, ...m })
const blatt = (n: number): Sheet => ({ id: 's', label: 'A', blocks: Array.from({ length: n }, () => newBlock('task')) })

describe('Zahl oder Spanne', () => {
  it('liest Zahlen und Spannen in allen üblichen Schreibweisen', () => {
    expect(leseSpanne('6')).toEqual({ min: 6, max: 6 })
    expect(leseSpanne('5-10')).toEqual({ min: 5, max: 10 })
    expect(leseSpanne('5–10')).toEqual({ min: 5, max: 10 })
    expect(leseSpanne(' 5 - 10 ')).toEqual({ min: 5, max: 10 })
    expect(leseSpanne('5 bis 10')).toEqual({ min: 5, max: 10 })
    expect(leseSpanne('10-5')).toEqual({ min: 5, max: 10 })
    expect(leseSpanne('')).toBeNull()
    expect(leseSpanne('5-')).toBeUndefined()
    expect(leseSpanne('abc')).toBeUndefined()
  })

  it('speichert wie die Seitenzahl: Untergrenze im alten Feld, Obergrenze daneben', () => {
    expect(aufgabenFelder({ min: 5, max: 10 })).toEqual({ taskCount: 5, taskCountBis: 10 })
    expect(aufgabenFelder({ min: 6, max: 6 })).toEqual({ taskCount: 6, taskCountBis: undefined })
    expect(aufgabenFelder(null)).toEqual({ taskCount: 0, taskCountBis: undefined })
    expect(fragenFelder({ min: 5, max: 10 })).toEqual({ itemCount: 5, itemCountBis: 10 })
    // Ältere Blätter (nur taskCount) behalten ihre genaue Zahl
    expect(aufgabenSpanne(meta({ taskCount: 4 }))).toEqual({ min: 4, max: 4 })
    expect(spanneText({ min: 5, max: 10 })).toBe('5–10')
  })

  it('der KI-Auftrag nennt die Spanne statt einer genauen Zahl', () => {
    const m = meta({ taskCount: 5, taskCountBis: 8 })
    const regel = taskCountRules(m, profileFromMeta(m))
    expect(regel).toMatch(/ZWISCHEN 5 UND 8 Aufgaben/)
    expect(regel).not.toMatch(/GENAU \d/)
    expect(wantedTasks(m)).toBe(0)
    expect(taskCountRules(meta({ taskCount: 6 }), profileFromMeta(meta()))).toMatch(/GENAU 6 Aufgaben/)
    expect(wantedTasks(meta({ taskCount: 1 }))).toBe(1)
  })

  it('Fragen zum Text: Spanne im Auftrag', () => {
    const m = meta({ skillFocus: 'reading', itemCount: 5, itemCountBis: 10, comprehensionFormats: ['multiple-choice'] })
    expect(fragenSpanne(m)).toEqual({ min: 5, max: 10 })
    expect(comprehensionRules(m)).toMatch(/ZWISCHEN 5 UND 10 Items je Text – die Lehrkraft hat diese Spanne vorgegeben/)
  })

  it('die Prüfung meldet nur Zahlen außerhalb der Spanne', () => {
    const m = meta({ taskCount: 5, taskCountBis: 8 })
    const p = profileFromMeta(m)
    expect(checkTaskCount(blatt(6), m, p).filter((w) => /vorgegeben/.test(w.message))).toEqual([])
    expect(checkTaskCount(blatt(4), m, p)[0].message).toMatch(/4 Aufgaben, vorgegeben waren 5–8/)
    expect(checkTaskCount(blatt(9), m, p)[0].message).toMatch(/zusammenfassen/)
  })

  it('die Seitenschätzung nimmt die Mitte der Spanne', () => {
    expect(seitenSchaetzung(meta({ taskCount: 4, taskCountBis: 12 }))).toBe(seitenSchaetzung(meta({ taskCount: 8 })))
  })
})
