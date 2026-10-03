/**
 * Abgeschrieben statt bearbeitet? (03.10.2026, Befund der Lehrkraft: „Für die Aufgabe erhalte ich das
 * Feedback, dass sie gut gemacht worden sei. Allerdings habe ich nur den Text darüber abgeschrieben.")
 *
 * Zählt, welcher Anteil der Antwort in Folgen von fünf Wörtern wörtlich im Material des Blatts steht.
 * Deterministisch, damit das Urteil nicht vom guten Willen der KI abhängt: Der Anteil geht als Befund
 * in die Anfrage, und die Einschätzung wird danach gedeckelt.
 */
const N = 5

const woerter = (t: string): string[] =>
  t
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/** Text eines Blatts aus seinem HTML (ohne Stil und Skripte) */
export function blattText(html: string): string {
  return html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ')
}

export interface AbschriftBefund {
  /** Anteil der Antwortwörter (0–1), die in einer wörtlich übernommenen Fünf-Wort-Folge stehen */
  anteil: number
  /** Längste wörtlich übernommene Stelle (Wörter) */
  laengste: number
  woerter: number
}

export function abschrift(antwort: string, material: string): AbschriftBefund {
  const a = woerter(antwort)
  if (a.length < N * 2) return { anteil: 0, laengste: 0, woerter: a.length }
  const m = woerter(material)
  const folgen = new Set<string>()
  for (let i = 0; i + N <= m.length; i++) folgen.add(m.slice(i, i + N).join(' '))
  const gedeckt = new Array<boolean>(a.length).fill(false)
  let lauf = 0
  let laengste = 0
  for (let i = 0; i + N <= a.length; i++) {
    if (folgen.has(a.slice(i, i + N).join(' '))) {
      for (let j = i; j < i + N; j++) gedeckt[j] = true
      lauf = lauf ? lauf + 1 : N
      laengste = Math.max(laengste, lauf)
    } else lauf = 0
  }
  return { anteil: gedeckt.filter(Boolean).length / a.length, laengste, woerter: a.length }
}

/** Operatoren, bei denen wörtliche Übernahme die Aufgabe erfüllen kann */
const ZITIER_OPERATOREN = /\b(zitiere|zitieren|schreibe\s+ab|abschreiben|übertrage|markiere|unterstreiche|copy|quote)\b/i

export const abschriftZaehlt = (anweisung: string): boolean => !ZITIER_OPERATOREN.test(anweisung)

/** Einschätzung nach dem Befund deckeln: überwiegend abgeschrieben → „noch nicht", in Teilen → höchstens „teilweise" */
export function deckeln<E extends 'sicher' | 'teilweise' | 'noch nicht'>(e: E, b: AbschriftBefund): 'sicher' | 'teilweise' | 'noch nicht' {
  if (b.anteil >= 0.7) return 'noch nicht'
  if (b.anteil >= 0.4 && e === 'sicher') return 'teilweise'
  return e
}
