/**
 * Apostroph-Toleranz für alle Antwortvergleiche (08.10.2026, Befund der Lehrkraft: „l’école" vom iPad galt als falsch).
 * Bildschirmtastaturen und Textverarbeitung setzen typografische Apostrophe (’ ‘ ʼ …), Lösungen enthalten oft das gerade '.
 * Alle Vergleiche (Vokabeltrainer, Spiele, Grammatik, Verben, Onlinetest) falten deshalb dieselben Zeichen.
 */

/** Apostroph-ähnliche Zeichen: ' ’ ‘ ʼ ´ ` ′ ‛ */
export const APOSTROPHE = /['’‘ʼ´`′‛]/g

/** Jedes apostroph-ähnliche Zeichen wird zum geraden ' */
export const apostrophNormal = (s: string): string => String(s ?? '').replace(APOSTROPHE, "'")

/** Enthält die Eingabe ein apostroph-ähnliches Zeichen außer dem geraden '? (für den Tastatur-Hinweis) */
export const falschesApostroph = (eingabe: string): boolean => /[’‘ʼ´`′‛]/.test(String(eingabe ?? ''))

/** Ist das Zeichen ein Apostroph (beim Buchstabenlegen vorbelegt wie ein Leerzeichen)? */
export const istApostroph = (c: string): boolean => /^['’‘ʼ´`′‛]$/.test(c)
