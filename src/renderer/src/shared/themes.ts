import { createTheme, CSSVariablesResolver, MantineColorShade, MantineColorsTuple, MantineRadius, MantineThemeOverride } from '@mantine/core'

/** Farben einer Oberfläche (je Thema einmal hell, einmal dunkel). */
export interface ThemePalette {
  /** Hintergrund des Arbeitsbereichs */
  bg: string
  /** Karten, Dialoge, Eingabefelder, Werkzeugleisten */
  surface: string
  border: string
  text: string
  dimmed: string
  /** Navigationsleiste links (Farbe oder Verlauf) */
  nav: string
  /** Hintergrund hinter den A4-Seiten im Editor */
  canvas: string
  /** Kopfbereich der Startseite (Farbe oder Verlauf) */
  hero: string
}

/** Ein Oberflächenthema: Farben, Schriften, Ecken, Navigation und Kartenstil. Gedruckte Blätter bleiben unverändert. */
export interface AppTheme {
  id: string
  label: string
  description: string
  /** Farbton für Knöpfe, Markierungen, Fortschritt */
  primary: MantineColorsTuple
  primaryShade: { light: MantineColorShade; dark: MantineColorShade }
  radius: MantineRadius
  fontFamily: string
  headingFontFamily: string
  headingWeight: string
  /** surface = helle Leiste mit farbigen Symbolen, filled = farbige Leiste mit hellen Symbolen */
  nav: 'surface' | 'filled'
  /** border = Rahmen, shadow = schwebend mit Schatten, flat = flächig ohne Rahmen, bold = kräftiger Rahmen */
  cards: 'border' | 'shadow' | 'flat' | 'bold'
  /** Dezentes Hintergrundmuster */
  pattern: 'none' | 'dots' | 'grid' | 'paper'
  light: ThemePalette
  dark: ThemePalette
}

const SEGOE = "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"

// Farbreihen (hell → dunkel), angelehnt an die Mantine-Standardfarben
const TEAL: MantineColorsTuple = ['#e6fcf5', '#c3fae8', '#96f2d7', '#63e6be', '#38d9a9', '#20c997', '#12b886', '#0ca678', '#099268', '#087f5b']
const BLUE: MantineColorsTuple = ['#e8f0fb', '#cddcf3', '#a4c0e9', '#77a1dd', '#5087d3', '#3875cc', '#2b6cb0', '#1f5a9a', '#174a82', '#0f3a69']
const INDIGO: MantineColorsTuple = ['#edf2ff', '#dbe4ff', '#bac8ff', '#91a7ff', '#748ffc', '#5c7cfa', '#4c6ef5', '#4263eb', '#3b5bdb', '#364fc7']
const GRAPE: MantineColorsTuple = ['#f8f0fc', '#f3d9fa', '#eebefa', '#e599f7', '#da77f2', '#cc5de8', '#be4bdb', '#ae3ec9', '#9c36b5', '#862e9c']
const ORANGE: MantineColorsTuple = ['#fff4e6', '#ffe8cc', '#ffd8a8', '#ffc078', '#ffa94d', '#ff922b', '#fd7e14', '#f76707', '#e8590c', '#d9480f']
const GREEN: MantineColorsTuple = ['#eef6ea', '#d9ebd1', '#b5d7a6', '#8fc278', '#6fb052', '#5aa33b', '#4a8f2f', '#3d7a27', '#31661f', '#255216']
const RED: MantineColorsTuple = ['#fff5f5', '#ffe3e3', '#ffc9c9', '#ffa8a8', '#ff8787', '#ff6b6b', '#fa5252', '#f03e3e', '#e03131', '#c92a2a']
const GRAPHITE: MantineColorsTuple = ['#f1f3f5', '#e9ecef', '#dee2e6', '#ced4da', '#adb5bd', '#868e96', '#5c636a', '#454b51', '#343a40', '#212529']

export const THEMES: AppTheme[] = [
  {
    id: 'teal',
    label: 'Frisch',
    description: 'Mint und Türkis, schwebende Karten',
    primary: TEAL,
    primaryShade: { light: 7, dark: 8 },
    radius: 'md',
    fontFamily: SEGOE,
    headingFontFamily: "'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif",
    headingWeight: '700',
    nav: 'surface',
    cards: 'shadow',
    pattern: 'none',
    light: {
      bg: '#edf6f4',
      surface: '#ffffff',
      border: '#cfe3de',
      text: '#15302b',
      dimmed: '#56716b',
      nav: '#ffffff',
      canvas: '#dbe8e5',
      hero: 'linear-gradient(135deg, #12b886 0%, #1098ad 100%)'
    },
    dark: {
      bg: '#0e1918',
      surface: '#152422',
      border: '#27403c',
      text: '#e2f1ee',
      dimmed: '#8ea9a3',
      nav: '#112120',
      canvas: '#091211',
      hero: 'linear-gradient(135deg, #087f5b 0%, #0b7285 100%)'
    }
  },
  {
    id: 'blue',
    label: 'Klassisch',
    description: 'Blaue Leiste, sachlich wie ein Büroprogramm',
    primary: BLUE,
    primaryShade: { light: 6, dark: 6 },
    radius: 'sm',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    headingFontFamily: "'Segoe UI Semibold', 'Segoe UI', system-ui, sans-serif",
    headingWeight: '600',
    nav: 'filled',
    cards: 'border',
    pattern: 'none',
    light: {
      bg: '#f2f4f8',
      surface: '#ffffff',
      border: '#cfd7e3',
      text: '#1a2536',
      dimmed: '#5d697b',
      nav: '#1f4f94',
      canvas: '#dfe5ee',
      hero: 'linear-gradient(90deg, #1f4f94 0%, #2b6cb0 100%)'
    },
    dark: {
      bg: '#0f141d',
      surface: '#172030',
      border: '#2b3749',
      text: '#e3e9f2',
      dimmed: '#8c98ab',
      nav: '#0d2548',
      canvas: '#0a0e15',
      hero: 'linear-gradient(90deg, #123a75 0%, #1f5a9a 100%)'
    }
  },
  {
    id: 'indigo',
    label: 'Ruhig',
    description: 'Sanftes Lavendel, weiche Flächen ohne Rahmen',
    primary: INDIGO,
    primaryShade: { light: 6, dark: 7 },
    radius: 'lg',
    fontFamily: SEGOE,
    headingFontFamily: "Candara, 'Segoe UI', system-ui, sans-serif",
    headingWeight: '700',
    nav: 'surface',
    cards: 'flat',
    pattern: 'none',
    light: {
      bg: '#efeefa',
      surface: '#ffffff',
      border: '#dcd9f1',
      text: '#24213c',
      dimmed: '#6a6785',
      nav: '#e5e3f6',
      canvas: '#e0def0',
      hero: 'linear-gradient(135deg, #7950f2 0%, #4c6ef5 100%)'
    },
    dark: {
      bg: '#13121e',
      surface: '#1d1b2c',
      border: '#302d47',
      text: '#e6e4f5',
      dimmed: '#9794b3',
      nav: '#181626',
      canvas: '#0d0c15',
      hero: 'linear-gradient(135deg, #5f3dc4 0%, #364fc7 100%)'
    }
  },
  {
    id: 'grape',
    label: 'Verspielt',
    description: 'Bunter Verlauf, runde Formen, Punktemuster',
    primary: GRAPE,
    primaryShade: { light: 7, dark: 7 },
    radius: 'xl',
    fontFamily: "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
    headingFontFamily: "'Segoe Print', 'Trebuchet MS', 'Segoe UI', sans-serif",
    headingWeight: '700',
    nav: 'filled',
    cards: 'shadow',
    pattern: 'dots',
    light: {
      bg: '#fbf0fa',
      surface: '#ffffff',
      border: '#efd2ee',
      text: '#34173a',
      dimmed: '#7f5f7e',
      nav: 'linear-gradient(180deg, #ae3ec9 0%, #e64980 100%)',
      canvas: '#efdfee',
      hero: 'linear-gradient(120deg, #f06595 0%, #ae3ec9 50%, #7048e8 100%)'
    },
    dark: {
      bg: '#1b101c',
      surface: '#271a29',
      border: '#452d47',
      text: '#f5e6f5',
      dimmed: '#b092b0',
      nav: 'linear-gradient(180deg, #6b1f7c 0%, #8e1d4d 100%)',
      canvas: '#110911',
      hero: 'linear-gradient(120deg, #a61e4d 0%, #862e9c 50%, #5f3dc4 100%)'
    }
  },
  {
    id: 'orange',
    label: 'Warm',
    description: 'Papierton, Serifenschrift in Überschriften',
    primary: ORANGE,
    primaryShade: { light: 8, dark: 8 },
    radius: 'lg',
    fontFamily: SEGOE,
    headingFontFamily: "Georgia, Cambria, 'Times New Roman', serif",
    headingWeight: '700',
    nav: 'surface',
    cards: 'border',
    pattern: 'paper',
    light: {
      bg: '#f9f3e8',
      surface: '#fffcf6',
      border: '#e6d6bc',
      text: '#3a2918',
      dimmed: '#836c55',
      nav: '#f1e4cf',
      canvas: '#e9dcc6',
      hero: 'linear-gradient(135deg, #e8590c 0%, #f59f00 100%)'
    },
    dark: {
      bg: '#1a140e',
      surface: '#261d15',
      border: '#453628',
      text: '#f3e8da',
      dimmed: '#af9a83',
      nav: '#201810',
      canvas: '#100c08',
      hero: 'linear-gradient(135deg, #a33b06 0%, #a86400 100%)'
    }
  },
  {
    id: 'green',
    label: 'Natur',
    description: 'Waldgrüne Leiste, Salbei-Töne',
    primary: GREEN,
    primaryShade: { light: 7, dark: 6 },
    radius: 'md',
    fontFamily: SEGOE,
    headingFontFamily: 'Cambria, Georgia, serif',
    headingWeight: '700',
    nav: 'filled',
    cards: 'border',
    pattern: 'grid',
    light: {
      bg: '#eef3ea',
      surface: '#fbfcf9',
      border: '#d2dec9',
      text: '#1e2c1b',
      dimmed: '#5f7059',
      nav: '#2c5d35',
      canvas: '#dde6d5',
      hero: 'linear-gradient(135deg, #2b8a3e 0%, #74b816 100%)'
    },
    dark: {
      bg: '#10170f',
      surface: '#182217',
      border: '#2d3c29',
      text: '#e4eee0',
      dimmed: '#92a58c',
      nav: '#142c19',
      canvas: '#090e08',
      hero: 'linear-gradient(135deg, #1b5e2a 0%, #4a7a10 100%)'
    }
  },
  {
    id: 'red',
    label: 'Kräftig',
    description: 'Hoher Kontrast, schwarze Leiste, klare Kanten',
    primary: RED,
    primaryShade: { light: 8, dark: 8 },
    radius: 'xs',
    fontFamily: "Bahnschrift, 'Segoe UI', system-ui, sans-serif",
    headingFontFamily: "Bahnschrift, 'Segoe UI', system-ui, sans-serif",
    headingWeight: '700',
    nav: 'filled',
    cards: 'bold',
    pattern: 'none',
    light: {
      bg: '#f4f4f5',
      surface: '#ffffff',
      border: '#c6c6cc',
      text: '#111114',
      dimmed: '#55555f',
      nav: '#141418',
      canvas: '#e2e2e6',
      hero: 'linear-gradient(90deg, #141418 0%, #141418 55%, #c92a2a 100%)'
    },
    dark: {
      bg: '#0b0b0d',
      surface: '#17171b',
      border: '#3a3a43',
      text: '#f5f5f7',
      dimmed: '#a0a0ac',
      nav: '#000000',
      canvas: '#050506',
      hero: 'linear-gradient(90deg, #000000 0%, #000000 55%, #a61e1e 100%)'
    }
  },
  {
    id: 'dark',
    label: 'Schlicht',
    description: 'Graphit, flach und reduziert',
    primary: GRAPHITE,
    primaryShade: { light: 8, dark: 6 },
    radius: 0,
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    headingFontFamily: "'Segoe UI', system-ui, sans-serif",
    headingWeight: '600',
    nav: 'surface',
    cards: 'border',
    pattern: 'none',
    light: { bg: '#f8f9fa', surface: '#ffffff', border: '#dee2e6', text: '#212529', dimmed: '#6c757d', nav: '#f1f3f5', canvas: '#e9ecef', hero: '#343a40' },
    dark: { bg: '#161718', surface: '#1f2022', border: '#34363a', text: '#e9ecef', dimmed: '#8d9196', nav: '#1a1b1d', canvas: '#0f1011', hero: '#2b2d30' }
  }
]

export function themeById(id: string): AppTheme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

// ---------- Farben mischen ----------

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Mischt zwei Hex-Farben (t = Anteil von b). */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = toRgb(a)
  const [r2, g2, b2] = toRgb(b)
  const c = (x: number, y: number): string =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0')
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`
}

/** Erste Farbe eines Verlaufs (für Stellen, die eine Vollfarbe brauchen). */
function solid(value: string): string {
  return value.match(/#[0-9a-f]{6}/i)?.[0] ?? value
}

const MANTINE_GRAY = ['#f8f9fa', '#f1f3f5', '#e9ecef', '#dee2e6', '#ced4da', '#adb5bd', '#868e96', '#495057', '#343a40', '#212529']

/**
 * Dunkle Farbreihe aus der Palette: Mantine nutzt dark-0 … dark-9 im Dunkelmodus für Text, Rahmen,
 * Eingabefelder und Flächen. So übernehmen alle Bedienelemente automatisch den Farbton des Themas.
 */
function darkTuple(p: ThemePalette): MantineColorsTuple {
  return [
    p.text,
    mix(p.text, p.dimmed, 0.5),
    p.dimmed,
    mix(p.dimmed, p.border, 0.5),
    p.border,
    mix(p.border, p.surface, 0.45),
    mix(p.surface, p.border, 0.3),
    p.surface,
    p.bg,
    p.canvas
  ]
}

/** Graustufen leicht in Richtung des Themas tönen (Hover-Flächen, Stepper, Tabellen im Hellmodus). */
function grayTuple(p: ThemePalette): MantineColorsTuple {
  const tint = mix(p.border, p.text, 0.25)
  return MANTINE_GRAY.map((g, i) => mix(g, i < 5 ? p.border : tint, i < 5 ? 0.35 : 0.2)) as unknown as MantineColorsTuple
}

export function buildMantineTheme(t: AppTheme): MantineThemeOverride {
  return createTheme({
    colors: { themed: t.primary, dark: darkTuple(t.dark), gray: grayTuple(t.light) },
    primaryColor: 'themed',
    primaryShade: t.primaryShade,
    defaultRadius: t.radius,
    fontFamily: t.fontFamily,
    headings: { fontFamily: t.headingFontFamily, fontWeight: t.headingWeight },
    other: { appTheme: t }
  })
}

function paletteVariables(p: ThemePalette, scheme: 'light' | 'dark'): Record<string, string> {
  return {
    '--mantine-color-body': p.surface,
    '--mantine-color-text': p.text,
    '--mantine-color-dimmed': p.dimmed,
    '--mantine-color-default': scheme === 'light' ? p.surface : mix(p.surface, p.border, 0.3),
    '--mantine-color-default-hover': mix(p.surface, p.border, scheme === 'light' ? 0.35 : 0.6),
    '--mantine-color-default-border': p.border,
    '--app-bg': p.bg,
    '--app-surface': p.surface,
    '--app-border': p.border,
    '--app-nav-bg': p.nav,
    '--app-nav-solid': solid(p.nav),
    '--app-hero': p.hero,
    '--editor-canvas': p.canvas,
    '--app-pattern-color': mix(p.bg, p.text, scheme === 'light' ? 0.09 : 0.12)
  }
}

export const themeCssVariables: CSSVariablesResolver = (theme) => {
  const t = (theme.other as { appTheme: AppTheme }).appTheme
  return { variables: {}, light: paletteVariables(t.light, 'light'), dark: paletteVariables(t.dark, 'dark') }
}

/** Stil-Merkmale als Attribute am Wurzelelement, damit app.css Navigation, Karten und Muster umschalten kann. */
export function applyThemeAttributes(t: AppTheme): void {
  const root = document.documentElement
  root.dataset.appTheme = t.id
  root.dataset.appNav = t.nav
  root.dataset.appCards = t.cards
  root.dataset.appPattern = t.pattern
}
