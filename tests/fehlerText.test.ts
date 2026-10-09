import { describe, expect, it } from 'vitest'
import { fehlerText } from '../src/renderer/src/shared/util'

/*
 * Lesbare Fehlermeldungen (09.10.2026, Befund: Verwaltung › Server zeigte „[object Object]"): notifyError nutzt
 * fehlerText – auch schlichte Objekte ergeben einen Satz, nie „[object Object]".
 */
describe('fehlerText', () => {
  it('Error und Text', () => {
    expect(fehlerText(new Error('Kaputt.'))).toBe('Kaputt.')
    expect(fehlerText('Nicht erlaubt.')).toBe('Nicht erlaubt.')
  })
  it('schlichte Objekte mit Meldung', () => {
    expect(fehlerText({ fehler: 'Nicht angemeldet.' })).toBe('Nicht angemeldet.')
    expect(fehlerText({ message: 'Zeit abgelaufen.' })).toBe('Zeit abgelaufen.')
  })
  it('Objekte ohne Meldung: nie „[object Object]"', () => {
    for (const e of [{}, { fehler: { letzte24h: 0 } }, [], null, undefined]) expect(fehlerText(e)).not.toContain('[object')
  })
})
