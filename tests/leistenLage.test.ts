import { describe, expect, it } from 'vitest'
import { leistenVersatz } from '../src/renderer/src/shared/touch/leistenLage'

/** Werkzeugleiste eines Bausteins: bleibt ganz im sichtbaren Feld (01.10.2026) */
describe('leistenVersatz', () => {
  const feld = { left: 0, top: 0, right: 800, bottom: 1000 }
  const baustein = { left: 100, top: 400, right: 700, bottom: 600 }

  it('lässt eine Leiste stehen, die ganz zu sehen ist', () => {
    expect(leistenVersatz({ left: 710, top: 420, right: 754, bottom: 800 }, feld, baustein)).toEqual({ dx: 0, dy: 0 })
  })

  it('rückt nach links, wenn sie rechts aus dem Feld ragt', () => {
    expect(leistenVersatz({ left: 780, top: 420, right: 824, bottom: 800 }, feld, baustein).dx).toBe(-24)
  })

  it('rückt nach oben, wenn sie unten herausragt – höchstens bis zum oberen Rand', () => {
    expect(leistenVersatz({ left: 710, top: 420, right: 754, bottom: 1100 }, feld, baustein).dy).toBe(-100)
    expect(leistenVersatz({ left: 710, top: 420, right: 754, bottom: 1600 }, feld, baustein).dy).toBe(-420)
  })

  it('folgt nach unten, wenn der Baustein oben aus dem Bild rollt, aber nicht über seine Unterkante hinaus', () => {
    const oben = { left: 100, top: -300, right: 700, bottom: 200 }
    expect(leistenVersatz({ left: 710, top: -280, right: 754, bottom: 100 }, feld, oben).dy).toBe(280)
    const kurz = { left: 100, top: -300, right: 700, bottom: -100 }
    expect(leistenVersatz({ left: 710, top: -280, right: 754, bottom: 100 }, feld, kurz).dy).toBe(156)
  })
})
