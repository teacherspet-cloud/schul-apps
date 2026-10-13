import { describe, expect, it } from 'vitest'
import { bankStand } from '../src/renderer/src/modules/grammatikformen/bank'

/* Ampel der Grammatikformen (13.10.2026, Entscheidung der Lehrkraft): keine · noch zu wenig · genug zum Üben · vollständig */
const feld = (n: number) => ({ g: n, m: n, a: n })
const zahl = (kern: number, zusatz: number) => ({
  erkennen: kern * 3,
  bilden: kern * 3,
  anwenden: kern * 3,
  unterscheiden: zusatz * 3,
  fehler: zusatz * 3,
  stufen: { erkennen: feld(kern), bilden: feld(kern), anwenden: feld(kern), unterscheiden: feld(zusatz), fehler: feld(zusatz) }
})
const ST = ['g', 'm', 'a'] as const

describe('bankStand', () => {
  it('ohne Aufgaben: keine', () => expect(bankStand(undefined, ST)).toBe('keine'))
  it('Kern unter 5: noch zu wenig', () => expect(bankStand(zahl(4, 8), ST)).toBe('wenig'))
  it('Kern ab 5, Zusatz fehlt: genug zum Üben', () => expect(bankStand(zahl(5, 0), ST)).toBe('genug'))
  it('alles mit 8: vollständig', () => expect(bankStand(zahl(8, 8), ST)).toBe('voll'))
})
