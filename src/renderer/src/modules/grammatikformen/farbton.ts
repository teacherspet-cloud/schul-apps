/**
 * Farben in „Grammatikformen" (13.10.2026, abgestimmt: Fachfarbe wie in Meine Klassen und Sprachenlernen). Die Fachfarbe
 * ist ein Hex-Wert (shared/fachfarben.ts); ohne sie gilt die Programmfarbe (Mantine-Palette). Diese Helfer liefern für
 * beide Fälle die CSS-Werte für Fläche, Linie und Text.
 */
import { useFachFarbe } from '../../shared/components/FachFarbe'
import { useProgrammFarbe } from '../../shared/components/AppKopf'

const istHex = (f: string): boolean => f.startsWith('#') || f.startsWith('rgb')

/** Volle Farbe (Linien, Symbole, Balken) */
export const tonVoll = (f: string): string => (istHex(f) ? f : `var(--mantine-color-${f}-filled)`)
/** Helle Fläche (aktive Zeile, Kopf, Symbolgrund) */
export const tonHell = (f: string): string => (istHex(f) ? `color-mix(in srgb, ${f} 13%, var(--mantine-color-body))` : `var(--mantine-color-${f}-light)`)
/** Ganz zarte Fläche (Kartengrund) */
export const tonZart = (f: string): string => (istHex(f) ? `color-mix(in srgb, ${f} 6%, var(--mantine-color-body))` : `var(--mantine-color-${f}-light)`)
/** Text in der Farbe (gut lesbar auf hellem Grund) */
export const tonText = (f: string): string => (istHex(f) ? `color-mix(in srgb, ${f} 85%, var(--mantine-color-text))` : `var(--mantine-color-${f}-light-color)`)

/** Farbe eines Fachs (Sprachcode), sonst die Programmfarbe */
export function useGrammatikFarbe(sprache: string | undefined): string {
  const programm = useProgrammFarbe()
  return useFachFarbe(sprache) ?? programm
}

/** Ampel der Übungsaufgaben einer Form: vollständig, teilweise, noch keine */
export type AufgabenAmpel = 'voll' | 'teil' | 'keine'
export const AMPEL_FARBE: Record<AufgabenAmpel, string> = { voll: 'teal', teil: 'orange', keine: 'gray' }
export const AMPEL_TEXT: Record<AufgabenAmpel, string> = {
  voll: 'Übungsaufgaben vollständig',
  teil: 'Übungsaufgaben teilweise',
  keine: 'noch keine Übungsaufgaben'
}
