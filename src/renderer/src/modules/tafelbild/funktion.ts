/**
 * Funktionsterme für Koordinatensysteme sicher auswerten – ohne `eval`.
 * Erlaubt: Zahlen, x, + − * / ^, Klammern, sin cos tan sqrt abs exp ln log, pi, e.
 * Auch „2x", „x²" und das Komma als Dezimaltrennzeichen werden verstanden.
 */
type Fn = (x: number) => number

const FUNKTIONEN: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  wurzel: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10
}

export function parseFunktion(roh: string): Fn | null {
  const text = roh
    .replace(/^\s*[fgh]?\s*\(x\)\s*=/, '')
    .replace(/^\s*y\s*=/, '')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/·|×/g, '*')
    .replace(/−/g, '-')
    .replace(/(\d),(\d)/g, '$1.$2')
    .toLowerCase()
  let i = 0
  const ws = (): void => {
    while (text[i] === ' ') i++
  }
  const peek = (): string => {
    ws()
    return text[i] ?? ''
  }
  // Grammatik: summe := produkt (('+'|'-') produkt)* ; produkt := potenz (('*'|'/'|implizit) potenz)* ; potenz := unaer ('^' potenz)?
  function summe(): Fn {
    let l = produkt()
    for (;;) {
      const c = peek()
      if (c === '+' || c === '-') {
        i++
        const r = produkt()
        const a = l
        l = c === '+' ? (x) => a(x) + r(x) : (x) => a(x) - r(x)
      } else return l
    }
  }
  function produkt(): Fn {
    let l = potenz()
    for (;;) {
      const c = peek()
      if (c === '*' || c === '/') {
        i++
        const r = potenz()
        const a = l
        l = c === '*' ? (x) => a(x) * r(x) : (x) => a(x) / r(x)
      } else if (c && /[a-z(0-9.]/.test(c)) {
        // Implizite Multiplikation: 2x, 3(x+1), x sin(x)
        const r = potenz()
        const a = l
        l = (x) => a(x) * r(x)
      } else return l
    }
  }
  function potenz(): Fn {
    const b = unaer()
    if (peek() === '^') {
      i++
      const e = potenz()
      return (x) => b(x) ** e(x)
    }
    return b
  }
  function unaer(): Fn {
    const c = peek()
    if (c === '-') {
      i++
      const v = potenz()
      return (x) => -v(x)
    }
    if (c === '+') {
      i++
      return unaer()
    }
    return atom()
  }
  function atom(): Fn {
    const c = peek()
    if (c === '(') {
      i++
      const v = summe()
      if (peek() !== ')') throw new Error('Klammer')
      i++
      return v
    }
    const zahl = /^\d+(\.\d+)?|^\.\d+/.exec(text.slice(i))
    if (zahl) {
      i += zahl[0].length
      const n = Number(zahl[0])
      return () => n
    }
    const wort = /^[a-z]+/.exec(text.slice(i))
    if (wort) {
      const w = wort[0]
      if (w === 'x') {
        i += 1
        return (x) => x
      }
      if (w === 'pi') {
        i += 2
        return () => Math.PI
      }
      const fn = Object.keys(FUNKTIONEN).find((f) => w.startsWith(f))
      if (fn) {
        i += fn.length
        const arg = potenz()
        const f = FUNKTIONEN[fn]
        return (x) => f(arg(x))
      }
      if (w[0] === 'e') {
        i += 1
        return () => Math.E
      }
      if (w[0] === 'x') {
        i += 1
        return (x) => x
      }
    }
    throw new Error(`Unerwartet: ${text.slice(i, i + 5)}`)
  }
  try {
    const f = summe()
    if (peek() !== '') return null
    return f
  } catch {
    return null
  }
}

/** Punkte der Funktion im Bereich, als Streckenzüge (Sprünge und Polstellen trennen) */
export function funktionsPunkte(f: Fn, xMin: number, xMax: number, yMin: number, yMax: number, schritte = 240): { x: number; y: number }[][] {
  const zuege: { x: number; y: number }[][] = []
  let zug: { x: number; y: number }[] = []
  const hoch = (yMax - yMin) * 4
  for (let s = 0; s <= schritte; s++) {
    const x = xMin + ((xMax - xMin) * s) / schritte
    const y = f(x)
    if (!Number.isFinite(y) || y > yMax + hoch || y < yMin - hoch) {
      if (zug.length > 1) zuege.push(zug)
      zug = []
      continue
    }
    const vor = zug[zug.length - 1]
    if (vor && Math.abs(y - vor.y) > (yMax - yMin) * 1.5) {
      if (zug.length > 1) zuege.push(zug)
      zug = []
    }
    zug.push({ x, y })
  }
  if (zug.length > 1) zuege.push(zug)
  return zuege
}
