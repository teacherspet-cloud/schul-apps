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

export function vtFarben(akzent: string, dunkel: boolean): VtFarben {
  const a = /^#[0-9a-f]{3,6}$/i.test(akzent) ? akzent : '#ea580c'
  // Im Dunkeln heller, damit der Akzent auf dunklem Grund trägt
  const ak = dunkel ? mische(a, WEISS, 0.28) : a
  const v: Record<string, string> = dunkel
    ? {
        '--vt-a': ak,
        '--vt-a-dunkel': mische(a, WEISS, 0.5),
        '--vt-a-tief': mische(a, SCHWARZ, 0.15),
        '--vt-a-mittel': a,
        '--vt-a-zart': mische(a, WEISS, 0.25),
        '--vt-a-rand': mische(a, GRUND_DUNKEL, 0.45),
        '--vt-a-rand2': mische(a, GRUND_DUNKEL, 0.65),
        '--vt-a-hell': mische(a, GRUND_DUNKEL, 0.82),
        '--vt-a-hell2': mische(a, GRUND_DUNKEL, 0.72),
        '--vt-flaeche': '#25262b',
        '--vt-tinte': '#e9ecef',
        '--vt-leise': '#a6a7ab',
        '--vt-linie': '#373a40',
        '--vt-schatten': 'rgba(0,0,0,0.45)',
        '--vt-gut-bg': '#0f3d2e',
        '--vt-gut-rand': '#34d399',
        '--vt-gut-text': '#a7f3d0',
        '--vt-schlecht-bg': '#4c1d24',
        '--vt-schlecht-rand': '#fb7185',
        '--vt-schlecht-text': '#fecdd3'
      }
    : {
        '--vt-a': a,
        '--vt-a-dunkel': mische(a, SCHWARZ, 0.28),
        '--vt-a-tief': mische(a, SCHWARZ, 0.12),
        '--vt-a-mittel': mische(a, WEISS, 0.12),
        '--vt-a-zart': mische(a, WEISS, 0.42),
        '--vt-a-rand': mische(a, WEISS, 0.72),
        '--vt-a-rand2': mische(a, WEISS, 0.84),
        '--vt-a-hell': mische(a, WEISS, 0.93),
        '--vt-a-hell2': mische(a, WEISS, 0.86),
        '--vt-flaeche': '#ffffff',
        '--vt-tinte': '#1f2937',
        '--vt-leise': '#6b7280',
        '--vt-linie': '#eef2f6',
        '--vt-schatten': alpha(a, 0.22),
        '--vt-gut-bg': '#d1fae5',
        '--vt-gut-rand': '#10b981',
        '--vt-gut-text': '#065f46',
        '--vt-schlecht-bg': '#ffe4e6',
        '--vt-schlecht-rand': '#f43f5e',
        '--vt-schlecht-text': '#9f1239'
      }
  return { a: ak, dunkel, variablen: v }
}

export const VtFarbe = createContext<VtFarben>(vtFarben('#ea580c', false))
export const useVtFarbe = (): VtFarben => useContext(VtFarbe)
