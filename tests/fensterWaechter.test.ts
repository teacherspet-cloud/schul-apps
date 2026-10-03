import { describe, expect, it } from 'vitest'
import { istGeteilt } from '../src/renderer/src/modules/onlinetest/fensterWaechter'

/* Kein zweites Fenster neben dem Onlinetest (03.10.2026) */
const pc = { amPc: true, innenBreite: 0, quer: true, bildBreite: 1920, bildHoehe: 1040 }
const ipad = { amPc: false, aussenBreite: 0, aussenHoehe: 0, bildBreite: 820, bildHoehe: 1180 }

describe('Fenster-Wächter', () => {
  it('PC: maximiert ist in Ordnung, halbe Breite nicht', () => {
    expect(istGeteilt({ ...pc, aussenBreite: 1936, aussenHoehe: 1056 })).toBe(false)
    expect(istGeteilt({ ...pc, aussenBreite: 1920, aussenHoehe: 1040 })).toBe(false)
    expect(istGeteilt({ ...pc, aussenBreite: 960, aussenHoehe: 1040 })).toBe(true)
    expect(istGeteilt({ ...pc, aussenBreite: 1920, aussenHoehe: 600 })).toBe(true)
  })
  it('iPad: volle Breite hoch und quer, Split View erkannt', () => {
    expect(istGeteilt({ ...ipad, innenBreite: 820, quer: false })).toBe(false)
    expect(istGeteilt({ ...ipad, innenBreite: 1180, quer: true })).toBe(false)
    expect(istGeteilt({ ...ipad, innenBreite: 590, quer: true })).toBe(true)
    expect(istGeteilt({ ...ipad, innenBreite: 410, quer: false })).toBe(true)
  })
})
