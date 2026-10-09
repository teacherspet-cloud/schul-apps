/**
 * Titel für Lernende ohne Klasse (08.10.2026, Wunsch der Lehrkraft): Kurse heißen bei der Lehrkraft „10b - Englisch",
 * Lernende sehen nur „Englisch". Entfernt eine Klassenangabe vorn (10b, 6, Q1, EF, Jg. 7, Klasse 9a) samt Trennzeichen.
 */
const KLASSE_VORN = /^\s*(?:\d{1,2}\s?[a-zäöü]{0,3}\d?|[QE]\d|EF|Jg\.?\s?\d{1,2}|Klasse\s?\d{1,2}\s?[a-zäöü]{0,3})\s*[-–—:·|]\s*(?=\S)/i

export function ohneKlasse(titel: string): string {
  if (!KLASSE_VORN.test(titel)) return titel
  return titel.replace(KLASSE_VORN, '').trim() || titel
}

/** Teile ohne Klassenangabe: „Wackelige Wörter – 6b - Englisch" → „Wackelige Wörter – Englisch" (Klassenname bekannt) */
export function ohneKlassenname(titel: string, klasse: string): string {
  const k = klasse.trim()
  if (!k) return ohneKlasse(titel)
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const t = titel
    .replace(new RegExp(`(^|\\s)${esc}\\s*[-–—:·|]\\s*`, 'i'), '$1')
    .replace(new RegExp(`\\s*[-–—:·|]?\\s*${esc}$`, 'i'), '')
    .trim()
  return ohneKlasse(t || titel)
}

/**
 * Reiter-Namen für mehrere Kurse eines Fachs (09.10.2026, Befund: zwei Reiter „Englisch"): gleiche Titel bekommen den
 * eigenen Kursnamen dazu, sonst eine Nummer in der Reihenfolge der Liste.
 */
export function kursReiterNamen(kurse: { titel: string; name?: string }[]): string[] {
  const zahl = (t: string): number => kurse.filter((k) => k.titel === t).length
  const erste = kurse.map((k) => (zahl(k.titel) > 1 && k.name && k.name !== k.titel ? k.name : k.titel))
  return erste.map((t, i) => {
    const gleiche = erste.filter((x) => x === t).length
    if (gleiche < 2) return t
    return `${t} (${erste.slice(0, i + 1).filter((x) => x === t).length})`
  })
}
