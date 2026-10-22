/** Tastaturbedienung statt Ziehen/Antippen (22.10.2026, Prüfung des Schulträgers, Punkt 12 – shared/tastaturBedienung.ts) */
import { describe, expect, it } from 'vitest'
import { alsKnopf, istAusloeseTaste, pfeilVersatz } from '../src/shared/tastaturBedienung'

describe('Tastaturbedienung', () => {
  it('Enter und Leertaste lösen aus, andere Tasten nicht', () => {
    let n = 0
    const k = alsKnopf(() => n++)
    expect(k).toMatchObject({ role: 'button', tabIndex: 0 })
    let verhindert = 0
    k.onKeyDown({ key: 'Enter', preventDefault: () => verhindert++ })
    k.onKeyDown({ key: ' ', preventDefault: () => verhindert++ })
    k.onKeyDown({ key: 'a', preventDefault: () => verhindert++ })
    expect([n, verhindert]).toEqual([2, 2])
    expect(istAusloeseTaste('Tab')).toBe(false)
  })
  it('Tasten aus einem inneren Knopf gehören diesem; gesperrt löst nichts aus', () => {
    let n = 0
    alsKnopf(() => n++).onKeyDown({ key: 'Enter', target: {}, currentTarget: {}, preventDefault: () => undefined })
    const aus = alsKnopf(() => n++, true)
    expect(aus).toMatchObject({ tabIndex: -1, 'aria-disabled': true })
    aus.onKeyDown({ key: 'Enter', preventDefault: () => undefined })
    expect(n).toBe(0)
  })
  it('Pfeiltasten verschieben um 10 px, mit Umschalt fein um 1 px', () => {
    expect(pfeilVersatz('ArrowLeft')).toEqual({ dx: -10, dy: 0 })
    expect(pfeilVersatz('ArrowDown', true)).toEqual({ dx: 0, dy: 1 })
    expect(pfeilVersatz('Enter')).toBeNull()
  })
})
