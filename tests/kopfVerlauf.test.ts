import { describe, expect, it } from 'vitest'
import { kontrast, kopfVerlauf, mix, THEMES } from '../src/renderer/src/shared/themes'

/*
 * Kopf der Startseite (10.10.2026): Verlauf in der Akzentfarbe jedes Themas – weiße Schrift erreicht überall WCAG AA
 * (4,5 : 1), hell und dunkel; das dunkle Ende ist sichtbar dunkler als das helle.
 */
describe('Kopf der Startseite: Verlauf in der Akzentfarbe', () => {
  for (const t of THEMES)
    for (const scheme of ['light', 'dark'] as const)
      it(`${t.id} (${scheme}): weiße Schrift AA an beiden Enden`, () => {
        const { von, bis } = kopfVerlauf(t, scheme)
        expect(kontrast(von, '#ffffff')).toBeGreaterThanOrEqual(4.5)
        expect(kontrast(bis, '#ffffff')).toBeGreaterThan(kontrast(von, '#ffffff'))
      })
  // Leiste im Rahmen: Grund = dunkles Ende; aktive App = 18 % Weiß darüber, Gruppenköpfe = 85 % Weiß (app.css)
  for (const t of THEMES)
    for (const scheme of ['light', 'dark'] as const)
      it(`${t.id} (${scheme}): Leiste – Pille der aktiven App und Gruppenköpfe AA`, () => {
        const { bis } = kopfVerlauf(t, scheme)
        expect(kontrast(mix(bis, '#ffffff', 0.18), '#ffffff')).toBeGreaterThanOrEqual(4.5)
        expect(kontrast(mix(bis, '#ffffff', 0.85), bis)).toBeGreaterThanOrEqual(4.5)
      })
  it('Kontrast nach WCAG: Schwarz auf Weiß 21 : 1', () => {
    expect(kontrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })
})
