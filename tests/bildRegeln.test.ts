import { describe, expect, it } from 'vitest'
import { BILD_REGELN, mitBildRegeln } from '../src/shared/bildRegeln'

// Blickrichtung in KI-Bildern (21.10.2026, Befund der Lehrkraft: Bücher zeigten zur Kamera, die Lesenden sahen sie kopfüber)
describe('mitBildRegeln', () => {
  it('hängt die Regel an jeden Bildauftrag – genau einmal', () => {
    const p = mitBildRegeln('A girl reading a book on a bench.')
    expect(p).toContain('faces that person, never the camera')
    expect(mitBildRegeln(p)).toBe(p)
    expect(p.split(BILD_REGELN)).toHaveLength(2)
  })
})
