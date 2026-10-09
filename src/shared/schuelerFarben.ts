/**
 * Farben des Schülerbereichs (09.10.2026, Entscheidung der Lehrkraft: „Helle, ruhige Flächen + Akzentfarbe").
 *
 *  - Hell: heller Seitengrund, ganz leicht in der gewählten Farbe getönt; Karten weiß.
 *  - Dunkel: dunkler, neutraler Grund, leicht getönt; Karten eine Stufe heller.
 *  - Die gewählte Farbe nur für Knöpfe, Fortschritt, Kopfband und Fokusrahmen.
 *
 * Alle Farben gedämpft. Die Knopffarbe (Stufe 6 der Mantine-Reihe) trägt weiße Schrift mit mindestens 4,5 : 1
 * (WCAG AA) – geprüft in tests/schuelerFarben.test.ts. Die Namen der ersten sechs bleiben die bisherigen
 * Mantine-Namen (gespeicherte Wahl gilt weiter); die Töne selbst kommen von hier und hängen am Schlüssel „akzent",
 * so dass Mantines eigene Farben (z. B. Fachordner der Lehrkraft mit color="blue") unverändert bleiben.
 * Geteilt von Server (frühe Hintergrundfarbe, Liste erlaubter Werte) und Oberfläche.
 */

export const SCHUELER_FARBEN = [
  { wert: 'blue', name: 'Blau', basis: '#3a68a6' },
  { wert: 'teal', name: 'Türkis', basis: '#2b7672' },
  { wert: 'green', name: 'Grün', basis: '#3a7546' },
  { wert: 'grape', name: 'Lila', basis: '#7f4f9c' },
  { wert: 'pink', name: 'Pink', basis: '#a5426f' },
  { wert: 'orange', name: 'Orange', basis: '#a85524' },
  // Neu 09.10.2026
  { wert: 'lavendel', name: 'Lavendel', basis: '#6a5ca8' },
  { wert: 'koralle', name: 'Koralle', basis: '#b14a42' },
  { wert: 'salbei', name: 'Salbei', basis: '#4f7356' },
  { wert: 'ozean', name: 'Ozean', basis: '#2a6787' }
] as const

export type SchuelerFarbe = (typeof SCHUELER_FARBEN)[number]['wert']
export const FARB_WERTE = SCHUELER_FARBEN.map((f) => f.wert) as SchuelerFarbe[]

const WEISS = '#ffffff'
const SCHWARZ = '#000000'
/** Neutraler Grund dunkel bzw. Karten dunkel, vor dem Tönen */
const GRUND_DUNKEL = '#16171b'
const KARTE_DUNKEL = '#232429'
const GRUND_HELL = '#f6f7f9'

const hexZuRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  const v = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, '0').slice(0, 6)
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]
}
const rgbZuHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')}`

/** Zwei Farben mischen: anteil 0 = a, 1 = b */
export function mischen(a: string, b: string, anteil: number): string {
  const x = hexZuRgb(a)
  const y = hexZuRgb(b)
  return rgbZuHex(...(x.map((c, i) => c + (y[i] - c) * anteil) as [number, number, number]))
}

/** Relative Leuchtdichte nach WCAG 2.x */
export function leuchtdichte(hex: string): number {
  const [r, g, b] = hexZuRgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Kontrastverhältnis nach WCAG (1 … 21) */
export function kontrast(a: string, b: string): number {
  const [h, d] = [leuchtdichte(a), leuchtdichte(b)].sort((x, y) => y - x)
  return (h + 0.05) / (d + 0.05)
}

export interface FarbSatz {
  /** Zehn Stufen für Mantine (0 hell … 9 dunkel); Stufe 6 = Knopf */
  reihe: [string, string, string, string, string, string, string, string, string, string]
  /** Knopffarbe (Stufe 6) */
  knopf: string
  /** Seitengrund, Karten und Kartenrand */
  hell: { grund: string; karte: string; rand: string }
  dunkel: { grund: string; karte: string; rand: string }
}

/** Alle Töne einer Farbe */
export function farbSatz(farbe: string): FarbSatz {
  const f = SCHUELER_FARBEN.find((x) => x.wert === farbe) ?? SCHUELER_FARBEN[0]
  const b = f.basis
  const reihe: FarbSatz['reihe'] = [
    mischen(b, WEISS, 0.92),
    mischen(b, WEISS, 0.82),
    mischen(b, WEISS, 0.66),
    mischen(b, WEISS, 0.5),
    mischen(b, WEISS, 0.34),
    mischen(b, WEISS, 0.18),
    b,
    mischen(b, SCHWARZ, 0.14),
    mischen(b, SCHWARZ, 0.28),
    mischen(b, SCHWARZ, 0.42)
  ]
  return {
    reihe,
    knopf: b,
    hell: { grund: mischen(GRUND_HELL, b, 0.06), karte: WEISS, rand: mischen('#d5d9de', b, 0.12) },
    dunkel: { grund: mischen(GRUND_DUNKEL, b, 0.08), karte: mischen(KARTE_DUNKEL, b, 0.07), rand: mischen('#3b3d44', b, 0.14) }
  }
}

/** Hintergrund vor dem Laden der App (Server, /server/ich.js): je Farbe [hell, dunkel] */
export const fruehGrund = (): Record<string, [string, string]> =>
  Object.fromEntries(SCHUELER_FARBEN.map((f) => [f.wert, [farbSatz(f.wert).hell.grund, farbSatz(f.wert).dunkel.grund]]))
