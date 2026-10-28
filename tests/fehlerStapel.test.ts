import { describe, expect, it } from 'vitest'
import { stapelKurz } from '../src/renderer/src/shared/components/Fehlergrenze'

// Befund 28.10.2026: In Firefox blieb die Stelle im Fehlerbericht leer – dort heißt es „Name@…“ statt „at Name (…)“
describe('Fehlerstapel kompakt', () => {
  it('liest das Format von Chrome und Edge', () => {
    expect(stapelKurz('\n    at Ebene (https://x/a.js:1:2)\n    at Ausfuellen (https://x/a.js:3:4)')).toBe('Ebene < Ausfuellen')
  })
  it('liest das Format von Firefox und Safari', () => {
    expect(stapelKurz('Ebene@https://x/a.js:1:2\nAusfuellen@https://x/a.js:3:4\n')).toBe('Ebene < Ausfuellen')
  })
})
