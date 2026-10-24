/**
 * Sechsstellige Einladungscodes (08.10.2026 Spielrunden, 24.10.2026 auch Partnerarbeit): zufällig, nicht doppelt
 * vergeben, nur Ziffern – leicht abzutippen und laut vorzusagen.
 */
import { randomInt } from 'node:crypto'

export const istSechsstellig = (code: string): boolean => /^\d{6}$/.test(code)

export function sechsstelligerCode(belegt: (code: string) => boolean): string {
  for (;;) {
    const c = String(randomInt(0, 1_000_000)).padStart(6, '0')
    if (!belegt(c)) return c
  }
}
