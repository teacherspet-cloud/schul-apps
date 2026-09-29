/**
 * Russischer Numerus nach Zahlwörtern (29.09.2026).
 *
 * Nach einer Zahl richtet sich das Substantiv nach deren letzten Ziffern:
 * 1, 21, 31 … → Nominativ Singular (1 балл, 21 минута),
 * 2–4, 22–24 … → Genitiv Singular (2 балла, 3 минуты),
 * 0, 5–20, 25–30 … → Genitiv Plural (5 баллов, 11 минут, 12 слов).
 * Beleg: FIPI-Demoversion ЕГЭ 2026 („1 баллом", „2 балла", „0 баллов", „90–154 слова", „180–275 слов").
 */
export function russischPlural(n: number, formen: [eins: string, wenige: string, viele: string]): string {
  const ganz = Math.abs(Math.trunc(n))
  // Bruchzahlen (2,5 балла) stehen immer im Genitiv Singular
  if (ganz !== Math.abs(n)) return formen[1]
  const mod10 = ganz % 10
  const mod100 = ganz % 100
  if (mod10 === 1 && mod100 !== 11) return formen[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return formen[1]
  return formen[2]
}

export const RU_BALL: [string, string, string] = ['балл', 'балла', 'баллов']
export const RU_MINUTA: [string, string, string] = ['минута', 'минуты', 'минут']
export const RU_SLOVO: [string, string, string] = ['слово', 'слова', 'слов']
