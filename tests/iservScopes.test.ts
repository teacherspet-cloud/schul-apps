import { describe, expect, it } from 'vitest'
import { scopeStufen } from '../src/server/anmeldung'

describe('IServ: Rückfall bei invalid_scope (09.10.2026)', () => {
  it('fragt der Reihe nach weniger an, ohne Doppelte', () => {
    const s = scopeStufen('openid profile email roles groups iserv:roles iserv:groups')
    expect(s[0]).toBe('openid profile email roles groups iserv:roles iserv:groups')
    expect(s).toContain('openid profile email')
    expect(s.at(-1)).toBe('openid profile')
    expect(new Set(s).size).toBe(s.length)
  })
  it('eine schon schlanke Einstellung wird nicht wiederholt', () => {
    expect(scopeStufen('openid  profile email')).toEqual(['openid profile email', 'openid profile'])
  })
})
