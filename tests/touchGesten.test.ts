import { describe, expect, it } from 'vitest'
import {
  istDoppeltipp,
  istTipp,
  pinchZoom,
  tastaturHoehe,
  tippText,
  verdeckt,
  wischRichtung,
  zeichnetZeiger,
  zoomBegrenzen,
  zoomSchritt,
  zoomTaste
} from '../src/renderer/src/shared/touch/gestenLogik'

// Rechenkern der Fingergesten (30.09.2026, shared/touch) – Schwellen nach Apple/WCAG
describe('Fingergesten', () => {
  it('Tippen: kurz und ohne Bewegung', () => {
    expect(istTipp({ x: 10, y: 10 }, { x: 14, y: 12 }, 120)).toBe(true)
    expect(istTipp({ x: 10, y: 10 }, { x: 30, y: 10 }, 120)).toBe(false)
    expect(istTipp({ x: 10, y: 10 }, { x: 10, y: 10 }, 600)).toBe(false)
  })

  it('Doppeltippen: zweimal rasch an derselben Stelle', () => {
    expect(istDoppeltipp(null, { x: 0, y: 0, zeit: 100 })).toBe(false)
    expect(istDoppeltipp({ x: 0, y: 0, zeit: 0 }, { x: 5, y: 5, zeit: 250 })).toBe(true)
    expect(istDoppeltipp({ x: 0, y: 0, zeit: 0 }, { x: 5, y: 5, zeit: 500 })).toBe(false)
    expect(istDoppeltipp({ x: 0, y: 0, zeit: 0 }, { x: 60, y: 0, zeit: 200 })).toBe(false)
  })

  it('Wischen: deutlich waagerecht, weit genug, zügig', () => {
    expect(wischRichtung(-120, 10, 250)).toBe('vor')
    expect(wischRichtung(120, -20, 250)).toBe('zurueck')
    // zu kurz, zu schräg, zu langsam
    expect(wischRichtung(-40, 0, 200)).toBeNull()
    expect(wischRichtung(-120, 90, 200)).toBeNull()
    expect(wischRichtung(-200, 0, 1500)).toBeNull()
  })

  it('Zoom: Grenzen, Aufziehen, Stufen', () => {
    expect(zoomBegrenzen(10)).toBe(3)
    expect(zoomBegrenzen(0.1)).toBe(0.5)
    expect(zoomBegrenzen(Number.NaN)).toBe(1)
    expect(pinchZoom(1, 100, 200)).toBe(2)
    expect(pinchZoom(1, 100, 20)).toBe(0.5)
    expect(pinchZoom(1.5, 0, 50)).toBe(1.5)
    expect(zoomSchritt(1, 1)).toBe(1.25)
    expect(zoomSchritt(1, -1)).toBe(0.9)
    expect(zoomSchritt(3, 1)).toBe(3)
    expect(zoomSchritt(1.1, -1)).toBe(1)
  })

  it('Zoom-Tasten: Strg + Plus/Minus, Strg + Umschalt + 0; Strg + 0 bleibt der Startseite, AltGr zoomt nie', () => {
    const t = (key: string, code: string, m: { shift?: boolean; alt?: boolean; ctrl?: boolean; meta?: boolean } = {}) =>
      zoomTaste({ key, code, ctrlKey: m.ctrl ?? !m.meta, metaKey: m.meta ?? false, altKey: m.alt ?? false, shiftKey: m.shift ?? false })
    expect(t('+', 'BracketRight')).toBe('plus')
    expect(t('=', 'Equal')).toBe('plus')
    expect(t('+', 'NumpadAdd')).toBe('plus')
    expect(t('-', 'Slash')).toBe('minus')
    expect(t('-', 'NumpadSubtract')).toBe('minus')
    expect(t('=', 'Digit0', { shift: true })).toBe('einpassen')
    expect(t('+', 'BracketRight', { meta: true })).toBe('plus')
    expect(t('0', 'Digit0')).toBeNull()
    expect(t('}', 'Digit0', { alt: true })).toBeNull()
    expect(t('+', 'BracketRight', { ctrl: false })).toBeNull()
  })

  it('Hinweis beim langen Druck nur, wenn er mehr sagt als die Aufschrift', () => {
    expect(tippText('Rückgängig', '')).toBe('Rückgängig')
    expect(tippText('Speichern', ' Speichern ')).toBeNull()
    expect(tippText('', 'x')).toBeNull()
    expect(tippText('„Mathe" öffnen', 'Öffnen')).toBe('„Mathe" öffnen')
  })

  it('Bildschirmtastatur: Höhe und verdeckte Felder', () => {
    expect(tastaturHoehe(1024, 700, 0)).toBe(324)
    // Wortvorschläge allein oder Rundung zählen nicht
    expect(tastaturHoehe(1024, 990, 0)).toBe(0)
    expect(tastaturHoehe(1024, 1024, 0)).toBe(0)
    expect(verdeckt({ top: 650, bottom: 690 }, 0, 700)).toBe(true)
    expect(verdeckt({ top: 300, bottom: 340 }, 0, 700)).toBe(false)
    expect(verdeckt({ top: -20, bottom: 20 }, 0, 700)).toBe(true)
  })
})

describe('Stift oder Finger', () => {
  it('Stift und Maus zeichnen, der Finger nur auf Wunsch', () => {
    expect(zeichnetZeiger('pen')).toBe(true)
    expect(zeichnetZeiger('mouse')).toBe(true)
    expect(zeichnetZeiger('touch')).toBe(false)
    expect(zeichnetZeiger('touch', true)).toBe(true)
  })
})
