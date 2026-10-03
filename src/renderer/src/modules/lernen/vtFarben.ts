/**
 * Farben des Vokabeltrainings (03.10.2026, Wunsch der Lehrkraft: „nach Farbschema des Faches
 * (Kopfband der Arbeitsblätter) … auch Schüler in den Darkmode wechseln können").
 *
 * Aus EINER Akzentfarbe – der Fachfarbe des Kopfbands (Einstellung der Lehrkraft, sonst der Vorschlag
 * des Fachs) oder der eigenen Farbe der Lernenden – entstehen alle Töne als CSS-Variablen, je für
 * hell und dunkel. Die Fächerfolge des Karteikastens (warm → kühl) bleibt in jedem Fach gleich:
 * Sie zeigt den Lernstand, nicht das Fach.
 */
import { createContext, useContext } from 'react'

const hexZuRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  const v = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, '0').slice(0, 6)
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]
}
const rgbZuHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b]
    .map((x) =>
      Math.round(Math.max(0, Math.min(255, x)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`

/** Zwei Farben mischen: anteil 0 = a, 1 = b */
export function mische(a: string, b: string, anteil: number): string {
  const x = hexZuRgb(a)
  const y = hexZuRgb(b)
  return rgbZuHex(...(x.map((c, i) => c + (y[i] - c) * anteil) as [number, number, number]))
}

const alpha = (hex: string, a: number): string => {
  const [r, g, b] = hexZuRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

export interface VtFarben {
  /** Akzent für Mantine-Knöpfe (Hex) */
  a: string
  dunkel: boolean
  variablen: Record<string, string>
}

const WEISS = '#ffffff'
const SCHWARZ = '#000000'
const GRUND_DUNKEL = '#1a1b1e'
const TEXT_DUNKEL = '#111827'
/** WCAG 2.1 AA für normalen Text */
export const MINDESTKONTRAST = 4.5

/*
 * Lesbarkeit (03.10.2026, Wunsch der Lehrkraft: „Schriftfarben … an ihren jeweiligen Hintergrund
 * anpassen, damit sie stets sichtbar und lesbar sind"): Jede Schrift wird gegen ihren Hintergrund
 * gerechnet (WCAG-Kontrast) – auf Flächen in Fachfarbe Schwarz oder Weiß, je nachdem, was trägt;
 * Akzentschrift wird so weit aufgehellt bzw. abgedunkelt, bis sie 4,5 : 1 erreicht.
 */
const linear = (c: number): number => {
  const x = c / 255
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}
export const leuchtdichte = (hex: string): number => {
  const [r, g, b] = hexZuRgb(hex).map(linear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const kontrast = (a: string, b: string): number => {
  const [x, y] = [leuchtdichte(a), leuchtdichte(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
/** Schwarz oder Weiß – was auf diesem Hintergrund besser trägt */
export const lesbarAuf = (bg: string): string => (kontrast(WEISS, bg) >= kontrast(TEXT_DUNKEL, bg) ? WEISS : TEXT_DUNKEL)

/** Schrift so lange aufhellen bzw. abdunkeln, bis sie auf allen Hintergründen trägt */
function bisLesbar(farbe: string, hintergruende: string[], richtung: 'heller' | 'dunkler', ziel = MINDESTKONTRAST): string {
  let f = farbe
  for (let i = 0; i < 30 && !hintergruende.every((h) => kontrast(f, h) >= ziel); i++) f = mische(f, richtung === 'heller' ? WEISS : SCHWARZ, 0.1)
  return f
}
/** Fläche so lange von der Schrift weg verschieben, bis die Schrift darauf trägt */
// Helle Schrift → Fläche dunkler ziehen, dunkle Schrift → heller
const flaecheFuer = (flaeche: string, schrift: string, ziel = MINDESTKONTRAST): string =>
  bisLesbar(flaeche, [schrift], leuchtdichte(schrift) > 0.18 ? 'dunkler' : 'heller', ziel)

export function vtFarben(akzent: string, dunkel: boolean): VtFarben {
  const a = /^#[0-9a-f]{3,6}$/i.test(akzent) ? akzent : '#ea580c'
  const flaeche = dunkel ? '#25262b' : WEISS
  const grund = dunkel ? '#242424' : WEISS
  // Akzent für Schrift, Rahmen und Mantine-Knöpfe: trägt auf Fläche und Seitengrund
  const ak = dunkel ? bisLesbar(mische(a, WEISS, 0.28), [flaeche, grund], 'heller') : bisLesbar(a, [flaeche, grund], 'dunkler')
  // Farbflächen (Kopf, Hauptknopf, Memory-Rücken): Schrift Schwarz oder Weiß, die Fläche wird notfalls nachgezogen
  const auf = lesbarAuf(dunkel ? a : ak)
  const mittel = flaecheFuer(dunkel ? a : ak, auf)
  const tief = flaecheFuer(mische(mittel, SCHWARZ, 0.15), auf)
  const hell = dunkel ? mische(a, GRUND_DUNKEL, 0.82) : mische(a, WEISS, 0.93)
  const hell2 = dunkel ? mische(a, GRUND_DUNKEL, 0.72) : mische(a, WEISS, 0.86)
  const tinte = dunkel ? '#e9ecef' : '#1f2937'
  // Randflächen tragen auch Schrift (gewählte Zelle im Suchsel): notfalls nachziehen
  const rand = flaecheFuer(dunkel ? mische(a, GRUND_DUNKEL, 0.45) : mische(a, WEISS, 0.72), tinte)
  // Akzentschrift auf den hellen Akzentflächen (Fragen, Kacheln, Überschriften)
  const aDunkel = dunkel
    ? bisLesbar(mische(a, WEISS, 0.5), [hell, hell2, flaeche, grund], 'heller')
    : bisLesbar(mische(a, SCHWARZ, 0.28), [hell, hell2, flaeche, rand], 'dunkler')
  const v: Record<string, string> = {
    '--vt-a': ak,
    '--vt-auf-akzent': lesbarAuf(ak),
    '--vt-a-dunkel': aDunkel,
    '--vt-a-mittel': mittel,
    '--vt-a-tief': tief,
    '--vt-auf-a': auf,
    '--vt-a-zart': dunkel ? mische(a, WEISS, 0.25) : mische(a, WEISS, 0.42),
    '--vt-a-rand': rand,
    '--vt-a-rand2': dunkel ? mische(a, GRUND_DUNKEL, 0.65) : mische(a, WEISS, 0.84),
    '--vt-a-hell': hell,
    '--vt-a-hell2': hell2,
    '--vt-flaeche': flaeche,
    '--vt-tinte': bisLesbar(tinte, [flaeche, rand, hell2], dunkel ? 'heller' : 'dunkler'),
    '--vt-leise': dunkel ? '#a6a7ab' : '#5f6672',
    '--vt-linie': dunkel ? '#373a40' : '#eef2f6',
    '--vt-schatten': dunkel ? 'rgba(0,0,0,0.45)' : alpha(a, 0.22),
    '--vt-gut-bg': dunkel ? '#0f3d2e' : '#d1fae5',
    '--vt-gut-rand': dunkel ? '#34d399' : '#10b981',
    '--vt-gut-text': dunkel ? '#a7f3d0' : '#065f46',
    '--vt-schlecht-bg': dunkel ? '#4c1d24' : '#ffe4e6',
    '--vt-schlecht-rand': dunkel ? '#fb7185' : '#f43f5e',
    '--vt-schlecht-text': dunkel ? '#fecdd3' : '#9f1239'
  }
  return { a: ak, dunkel, variablen: v }
}

export const VtFarbe = createContext<VtFarben>(vtFarben('#ea580c', false))
export const useVtFarbe = (): VtFarben => useContext(VtFarbe)
