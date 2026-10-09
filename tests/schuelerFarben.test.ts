import { describe, expect, it } from 'vitest'
import { FARB_WERTE, farbSatz, fruehGrund, kontrast, SCHUELER_FARBEN } from '../src/shared/schuelerFarben'

// Farben des Schülerbereichs (09.10.2026): „Helle, ruhige Flächen + Akzentfarbe", WCAG geprüft
describe('Farben des Schülerbereichs', () => {
  it('zehn Farben, darunter die vier neuen', () => {
    expect(FARB_WERTE).toHaveLength(10)
    for (const w of ['lavendel', 'koralle', 'salbei', 'ozean']) expect(FARB_WERTE).toContain(w)
    // Bisherige Werte gelten weiter
    for (const w of ['blue', 'teal', 'green', 'grape', 'pink', 'orange']) expect(FARB_WERTE).toContain(w)
  })

  it('kontrast() rechnet nach WCAG', () => {
    expect(kontrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(kontrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
  })

  for (const f of SCHUELER_FARBEN)
    it(`${f.name}: Schrift auf Knöpfen, Kopfband, Flächen lesbar`, () => {
      const s = farbSatz(f.wert)
      expect(s.reihe).toHaveLength(10)
      expect(s.reihe[6]).toBe(s.knopf)
      // Weiße Schrift auf dem Knopf (hell und dunkel dieselbe Stufe) und auf dem Kopfband (Stufen 6–9)
      for (const i of [6, 7, 8, 9]) expect(kontrast('#ffffff', s.reihe[i])).toBeGreaterThanOrEqual(4.5)
      // Hell: Grund nur leicht getönt (fast weiß), Karten weiß, Text (Mantine #000) gut lesbar
      expect(s.hell.karte).toBe('#ffffff')
      expect(kontrast('#000000', s.hell.grund)).toBeGreaterThanOrEqual(17)
      expect(kontrast(s.hell.grund, '#ffffff')).toBeLessThan(1.2)
      // Dunkel: Karten eine Stufe heller als der Grund, Text (Mantine dark #c9c9c9) gut lesbar
      expect(kontrast(s.dunkel.karte, '#000000')).toBeGreaterThan(kontrast(s.dunkel.grund, '#000000'))
      expect(kontrast('#c9c9c9', s.dunkel.karte)).toBeGreaterThanOrEqual(7)
      expect(kontrast('#c9c9c9', s.dunkel.grund)).toBeGreaterThanOrEqual(7)
      // Akzent als Schrift/Fokusrahmen: auf hellen Karten ≥ 4.5, Fokusrahmen im Dunkeln (Stufe 4) ≥ 3
      expect(kontrast(s.knopf, '#ffffff')).toBeGreaterThanOrEqual(4.5)
      expect(kontrast(s.reihe[4], s.dunkel.karte)).toBeGreaterThanOrEqual(3)
      // Kartenrand sichtbar, aber ruhig
      for (const m of [s.hell, s.dunkel]) {
        expect(kontrast(m.rand, m.karte)).toBeGreaterThan(1.2)
        expect(kontrast(m.rand, m.karte)).toBeLessThan(2.2)
      }
    })

  it('unbekannte Farbe fällt auf Blau zurück; früher Hintergrund für alle Farben', () => {
    expect(farbSatz('rot').knopf).toBe(farbSatz('blue').knopf)
    const g = fruehGrund()
    expect(Object.keys(g)).toEqual(FARB_WERTE)
    for (const [h, d] of Object.values(g)) expect(h).not.toBe(d)
  })
})
