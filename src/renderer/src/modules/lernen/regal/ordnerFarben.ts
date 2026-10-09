/**
 * Farben der Fachordner (08.10.2026, Wunsch der Lehrkraft: Fachfarbe, angepasst an hell/dunkel, Schrift stets lesbar).
 * Die Fachfarben sind für den Druck auf Weiß gewählt, also dunkel. Im dunklen Modus wird der Rücken aufgehellt, bis er
 * sich vom Regal abhebt (3 : 1, WCAG für Bedienelemente); jede Schrift erreicht 4,5 : 1 auf ihrer Fläche.
 * Register: drei Abstufungen derselben Fachfarbe – dazu immer Symbol und Name, damit es nicht nur an der Farbe hängt.
 */
import { kontrast, lesbarAuf, mische, MINDESTKONTRAST } from '../vtFarben'
import type { Register } from './beschriftung'

export const REGAL_HELL = '#e9dcc7'
export const REGAL_DUNKEL = '#2b2622'

export interface Flaeche {
  bg: string
  text: string
}

/** Schrift Schwarz/Weiß; reicht der Kontrast nicht, die Fläche von der Schrift wegschieben */
export function flaecheMitSchrift(bg: string): Flaeche {
  let f = bg
  let text = lesbarAuf(f)
  for (let i = 0; i < 20 && kontrast(text, f) < MINDESTKONTRAST; i++) {
    f = mische(f, text === '#ffffff' ? '#000000' : '#ffffff', 0.08)
    text = lesbarAuf(f)
  }
  return { bg: f, text }
}

export interface OrdnerFarben {
  ruecken: Flaeche
  register: Record<Register, Flaeche>
}

export function ordnerFarben(farbe: string, dunkel: boolean): OrdnerFarben {
  let basis = /^#[0-9a-f]{6}$/i.test(farbe) ? farbe : '#5c6b7a'
  const regal = dunkel ? REGAL_DUNKEL : REGAL_HELL
  for (let i = 0; i < 20 && kontrast(basis, regal) < 3; i++) basis = mische(basis, dunkel ? '#ffffff' : '#000000', 0.08)
  const ruecken = flaecheMitSchrift(basis)
  return {
    ruecken,
    register: {
      vok: ruecken,
      // Wortliste (09.10.2026): zwischen Vokabeln und Grammatik
      wort: flaecheMitSchrift(mische(basis, '#ffffff', 0.18)),
      // Alphabetische Liste (09.10.2026): gleich hinter „Meine Bücher"
      abc: flaecheMitSchrift(mische(basis, '#ffffff', 0.27)),
      gram: flaecheMitSchrift(mische(basis, '#ffffff', 0.35)),
      mat: flaecheMitSchrift(mische(basis, '#000000', 0.35))
    }
  }
}
