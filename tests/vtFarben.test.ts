import { describe, expect, it } from 'vitest'
import { kontrast, lesbarAuf, MINDESTKONTRAST, vtFarben } from '../src/renderer/src/modules/lernen/vtFarben'
import { FACH_PALETTE } from '../src/renderer/src/shared/fachfarben'

/*
 * Lesbarkeit im Vokabeltraining (03.10.2026, Wunsch der Lehrkraft): Für jede Fachfarbe der Palette – und
 * ein paar sehr helle/sehr dunkle Extremfälle (eigene Farbe der Lernenden) – trägt jede Schrift auf ihrem
 * Hintergrund mindestens 4,5 : 1 (WCAG 2.1 AA), hell wie dunkel.
 */
const FARBEN = [...FACH_PALETTE.map((f) => f.hex), '#facc15', '#ffd43b', '#e9ecef', '#1a1b1e', '#4dabf7', '#fab005']

/** Paare aus Schrift und Hintergrund, wie sie in Trainer, Spielen und Vokabelweg vorkommen */
const PAARE: [string, string, string][] = [
  ['--vt-auf-a', '--vt-a-mittel', 'Kopf und Hauptknopf (Anfang des Verlaufs)'],
  ['--vt-auf-a', '--vt-a-tief', 'Kopf und Hauptknopf (Ende des Verlaufs)'],
  ['--vt-auf-akzent', '--vt-a', 'gelernter Abschnitt im Vokabelweg'],
  ['--vt-a', '--vt-flaeche', 'Akzentschrift auf Karten'],
  ['--vt-a-dunkel', '--vt-a-hell', 'Fragen, Kacheln, Buchstaben'],
  ['--vt-a-dunkel', '--vt-a-hell2', 'fallende Wörter'],
  ['--vt-a-dunkel', '--vt-flaeche', 'Überschriften, Ring'],
  ['--vt-tinte', '--vt-flaeche', 'Fließtext'],
  ['--vt-tinte', '--vt-a-rand', 'gewählter Buchstabe im Suchsel'],
  ['--vt-leise', '--vt-flaeche', 'leise Hinweise'],
  ['--vt-gut-text', '--vt-gut-bg', 'richtig'],
  ['--vt-schlecht-text', '--vt-schlecht-bg', 'falsch']
]

describe('Vokabeltraining: Schrift trägt auf jedem Hintergrund', () => {
  for (const dunkel of [false, true])
    it(`${dunkel ? 'dunkel' : 'hell'}: alle Fach- und Extremfarben`, () => {
      const fehler: string[] = []
      for (const f of FARBEN) {
        const v = vtFarben(f, dunkel).variablen
        for (const [schrift, grund, wo] of PAARE) {
          const k = kontrast(v[schrift], v[grund])
          if (k < MINDESTKONTRAST) fehler.push(`${f} ${wo}: ${v[schrift]} auf ${v[grund]} = ${k.toFixed(2)}`)
        }
      }
      expect(fehler).toEqual([])
    })
  it('Schwarz oder Weiß – je nachdem, was trägt', () => {
    expect(lesbarAuf('#1d4e89')).toBe('#ffffff')
    expect(lesbarAuf('#facc15')).toBe('#111827')
  })
})
