/** Zeichnen mit der Tastatur (23.10.2026, Barrierefreiheit – WCAG 2.1.1, shared/zeichenTastatur.ts) */
import { describe, expect, it } from 'vitest'
import {
  aktionsAnsage,
  linieMitziehen,
  schrittWeite,
  startZustand,
  verbindungsPunkte,
  werkzeugKuerzel,
  zeichenHilfe,
  zeichenTaste,
  type ZeichenModus,
  type ZeichenZustand
} from '../src/shared/zeichenTastatur'

const G = { breite: 200, hoehe: 100 }
/** Mehrere Tasten hintereinander; liefert Zustand und alle Aktionen */
function tippe(modus: ZeichenModus, tasten: (string | { key: string; shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean })[], z0?: ZeichenZustand) {
  let z = z0 ?? startZustand(G.breite, G.hoehe)
  const aktionen: unknown[] = []
  for (const t of tasten) {
    const r = zeichenTaste(z, typeof t === 'string' ? { key: t } : t, modus, G)
    if (!r) {
      aktionen.push(null)
      continue
    }
    z = r.zustand
    aktionen.push(r.aktion)
  }
  return { z, aktionen }
}

describe('Zeichnen mit der Tastatur', () => {
  it('Fadenkreuz beginnt in der Mitte (oder an der gemerkten Stelle) und bleibt in der Fläche', () => {
    expect(startZustand(200, 100)).toEqual({ x: 100, y: 50, unten: false, start: null })
    expect(startZustand(200, 100, { x: 500, y: -3 })).toMatchObject({ x: 200, y: 0 })
    const { z } = tippe('frei', Array(20).fill({ key: 'ArrowRight', ctrlKey: true }))
    expect(z.x).toBe(200)
  })
  it('Schrittweite: 8 px, Umschalt 1 px, Strg/Alt 32 px', () => {
    expect(schrittWeite({ key: 'ArrowLeft' })).toBe(8)
    expect(schrittWeite({ key: 'ArrowLeft', shiftKey: true })).toBe(1)
    expect(schrittWeite({ key: 'ArrowLeft', ctrlKey: true })).toBe(32)
    expect(schrittWeite({ key: 'ArrowLeft', altKey: true })).toBe(32)
    const { z } = tippe('frei', ['ArrowLeft', { key: 'ArrowUp', shiftKey: true }, { key: 'ArrowDown', altKey: true }])
    expect([z.x, z.y]).toEqual([92, 81])
  })
  it('Leertaste setzt den Stift auf; Bewegen zeichnet dann, abgesetzt nicht', () => {
    const { aktionen, z } = tippe('frei', [' ', 'ArrowRight', ' ', 'ArrowRight'])
    expect(aktionen).toEqual([
      { art: 'aufsetzen', punkt: { x: 100, y: 50 } },
      { art: 'bewegen', von: { x: 100, y: 50 }, nach: { x: 108, y: 50 }, zeichnen: true },
      { art: 'absetzen', punkt: { x: 108, y: 50 } },
      { art: 'bewegen', von: { x: 108, y: 50 }, nach: { x: 116, y: 50 }, zeichnen: false }
    ])
    expect(z.unten).toBe(false)
  })
  it('Enter: Anfang, dann Ende (Linie/Form) – auch als gerader Strich mit dem Stift', () => {
    for (const modus of ['zweiPunkte', 'frei'] as const) {
      const { aktionen } = tippe(modus, ['Enter', { key: 'ArrowRight', ctrlKey: true }, 'Enter'])
      expect(aktionen[0]).toEqual({ art: 'start', punkt: { x: 100, y: 50 } })
      expect(aktionen[2]).toEqual({ art: 'ende', von: { x: 100, y: 50 }, nach: { x: 132, y: 50 } })
    }
    // Bei aufgesetztem Stift setzt Enter ab
    expect(tippe('frei', [' ', 'Enter']).aktionen[1]).toMatchObject({ art: 'absetzen' })
    // Leertaste wirkt bei Linie/Form wie Enter
    expect(tippe('zweiPunkte', [' ', ' ']).aktionen.map((a) => (a as { art: string }).art)).toEqual(['start', 'ende'])
  })
  it('Punkt-Modus (Textkästchen, Punkt, Auswahl): Enter setzt an der Stelle', () => {
    expect(tippe('punkt', ['ArrowDown', 'Enter']).aktionen[1]).toEqual({ art: 'punkt', punkt: { x: 100, y: 58 } })
  })
  it('Escape bricht ab bzw. setzt ab – ohne Angefangenes gehört Escape dem Umfeld', () => {
    expect(tippe('zweiPunkte', ['Enter', 'Escape']).aktionen[1]).toEqual({ art: 'abbrechen' })
    expect(tippe('zweiPunkte', ['Enter', 'Escape']).z.start).toBeNull()
    expect(tippe('frei', [' ', 'Escape']).aktionen[1]).toMatchObject({ art: 'absetzen' })
    expect(tippe('frei', ['Escape']).aktionen[0]).toBeNull()
  })
  it('Entf, Rücktaste und Strg+Z nehmen zurück; Tab und Buchstaben gehören nicht der Fläche', () => {
    const { aktionen, z } = tippe('frei', [' ', 'Delete', 'Backspace', { key: 'z', ctrlKey: true }, 'Tab', 'a', { key: 'Enter', ctrlKey: true }])
    expect(aktionen.slice(1, 4)).toEqual([{ art: 'loeschen' }, { art: 'loeschen' }, { art: 'loeschen' }])
    expect(aktionen.slice(4)).toEqual([null, null, null])
    expect(z.unten).toBe(false)
  })
  it('Werkzeug-Kürzel: Buchstabe ohne Strg/Alt, Groß/Klein egal', () => {
    const k = { s: 'stift', t: 'marker' } as const
    expect(werkzeugKuerzel({ key: 'S' }, k)).toBe('stift')
    expect(werkzeugKuerzel({ key: 't' }, k)).toBe('marker')
    expect(werkzeugKuerzel({ key: 's', ctrlKey: true }, k)).toBeNull()
    expect(werkzeugKuerzel({ key: 'x' }, k)).toBeNull()
    expect(werkzeugKuerzel({ key: 'Enter' }, k)).toBeNull()
  })
  it('Ansagen und Hilfetext', () => {
    expect(aktionsAnsage({ art: 'aufsetzen', punkt: { x: 0, y: 0 } })).toBe('Stift aufgesetzt')
    expect(aktionsAnsage({ art: 'aufsetzen', punkt: { x: 0, y: 0 } }, 'Textmarker')).toBe('Textmarker aufgesetzt')
    expect(aktionsAnsage({ art: 'ende', von: { x: 0, y: 0 }, nach: { x: 1, y: 1 } })).toBe('Linie gezeichnet')
    expect(aktionsAnsage({ art: 'loeschen' })).toBe('rückgängig')
    expect(aktionsAnsage({ art: 'bewegen', von: { x: 0, y: 0 }, nach: { x: 1, y: 1 }, zeichnen: true })).toBeNull()
    const h = zeichenHilfe('frei', 'Zusatz.')
    expect(h).toMatch(/Pfeiltasten/)
    expect(h).toMatch(/Leertaste/)
    expect(h).toMatch(/Tab verlässt/)
    expect(h.endsWith('Zusatz.')).toBe(true)
    // Unpersönlich – passt für Lernende und Lehrkraft (tests/anrede.test.ts)
    expect(zeichenHilfe('zweiPunkte') + zeichenHilfe('punkt')).not.toMatch(/\b(du|dein|Sie|Ihr)\b/)
  })
  it('Verbindung zweier Kästchen: einander nächste Kantenmitten', () => {
    const a = { x: 0, y: 0, w: 100, h: 40 }
    expect(verbindungsPunkte(a, { x: 200, y: 0, w: 100, h: 40 })).toEqual({ von: { x: 100, y: 20 }, nach: { x: 200, y: 20 } })
    expect(verbindungsPunkte(a, { x: 0, y: 200, w: 100, h: 40 })).toEqual({ von: { x: 50, y: 40 }, nach: { x: 50, y: 200 } })
  })
  it('Linien an einem verschobenen Kästchen wandern mit (Befund: Pfeiltasten ließen sie stehen)', () => {
    const l = { id: 'l', x: 10, y: 10, x2: 50, y2: 60, v1: 'k1', v2: 'k2' }
    expect(linieMitziehen(l, 'k1', 5, -2)).toMatchObject({ x: 15, y: 8, x2: 50, y2: 60 })
    expect(linieMitziehen(l, 'k2', 5, -2)).toMatchObject({ x: 10, y: 10, x2: 55, y2: 58 })
    expect(linieMitziehen(l, 'k3', 5, -2)).toBe(l)
  })
})
