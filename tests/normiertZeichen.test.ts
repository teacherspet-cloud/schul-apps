import { describe, expect, it } from 'vitest'
import { normiert } from '../src/shared/grammatiktrainer'

describe('normiert – Zeichen der iPad-Tastatur (26.11.2026)', () => {
  it('Apostroph-Varianten, Auslassungspunkte und unsichtbare Zeichen', () => {
    expect(normiert('He’s playing…')).toBe(normiert("He's playing"))
    expect(normiert('He\u200bs playing...')).toBe(normiert('Hes playing'))
    expect(normiert('Is he playing?!')).toBe(normiert('Is he playing'))
  })
})
