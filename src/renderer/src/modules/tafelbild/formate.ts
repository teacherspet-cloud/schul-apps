/**
 * Tafelformate des Programms „Tafelbilder" (30.09.2026) – Maße, Zonen, Farben, Schrift und die
 * Grenzen, die die Qualitätsprüfung nach der Erzeugung anlegt.
 *
 * Die Zahlen stammen aus der Recherche (recherche/tafelbilder-gestaltung-2026-09-30.md) und aus
 * dem Tafelbild-Baustein des Arbeitsblatts (arbeitsblatt/didactics/boardDesign.ts):
 * - Klapptafel: Mittelteil 200 × 100 cm, Flügel je 100 cm → 400 × 100 cm. Versalhöhe aus der
 *   letzten Reihe ≥ 4–5 cm (Sitte 2001) – als Schriftgrad (em) etwa 6 % der Tafelhöhe.
 * - Whiteboard/Beamer 16:9: Folienschrift nicht unter 24 pt bei 7,5 Zoll Folienhöhe (≈ 4,4 %).
 * - Flipchart/Plakat hochkant (68 × 99 cm): aus 6 m Entfernung ≥ 2,5 cm Buchstabenhöhe.
 * - Hefteintrag A4: gewohnte Schriftgröße 12 pt – so lässt er sich abschreiben.
 *
 * Alle Koordinaten der Elemente sind RELATIV zur Fläche (0 … 1). Gezeichnet wird in Einheiten
 * `breite × hoehe`; Schriftgrade sind Anteile der Flächenhöhe.
 */

export type FormatId = 'klapptafel' | 'whiteboard' | 'flipchart' | 'heft'

/** Farbplätze mit fester Bedeutung – je Format anders eingefärbt (Kreide, Marker, Stift) */
export type Farbe = 'grund' | 'gelb' | 'blau' | 'rot' | 'gruen' | 'orange'
export const FARBEN: Farbe[] = ['grund', 'gelb', 'blau', 'rot', 'gruen', 'orange']

export type Medium = 'kreide' | 'marker' | 'papier'

export interface Zone {
  x: number
  y: number
  w: number
  h: number
}

export interface FormatInfo {
  id: FormatId
  label: string
  kurz: string
  beschreibung: string
  /** Zeichenfläche in Einheiten */
  breite: number
  hoehe: number
  medium: Medium
  hochkant: boolean
  /** Schriftgrad (em) als Anteil der Höhe */
  /** min = empfohlenes Minimum; notfall = nur wenn sonst Überlappung droht (mit Befund) */
  schrift: { min: number; text: number; titel: number; notfall: number }
  /** Freier Rand ringsum (Anteil der Breite bzw. Höhe) */
  rand: number
  /** Wörter insgesamt je Stufe der Textmenge (knapp, mittel, viel) */
  worte: [number, number, number]
  /** Höchstzahl der Text-Elemente (Kästen, Texte, Merksatz) */
  maxElemente: number
  /** Druckseite der PDF-Ausgabe */
  seite: 'quer' | 'hoch'
  /** Pixelbreite der PNG-Ausgabe */
  pngBreite: number
}

export const FORMATE: Record<FormatId, FormatInfo> = {
  klapptafel: {
    id: 'klapptafel',
    label: 'Klassische Klapptafel',
    kurz: 'Klapptafel',
    beschreibung: 'Breites Querformat (400 × 100 cm): links Entwicklung, Mitte Ergebnis, rechts Merksatz und Hausaufgabe. Kreide auf Dunkelgrün.',
    breite: 4000,
    hoehe: 1000,
    medium: 'kreide',
    hochkant: false,
    schrift: { min: 0.058, text: 0.066, titel: 0.09, notfall: 0.045 },
    rand: 0.045,
    worte: [45, 70, 100],
    maxElemente: 12,
    seite: 'quer',
    pngBreite: 3840
  },
  whiteboard: {
    id: 'whiteboard',
    label: 'Whiteboard / digitale Tafel (16:9)',
    kurz: 'Whiteboard 16:9',
    beschreibung: 'Weiße Fläche im Format des Beamers oder Smartboards, Boardmarker-Farben, alles ohne Scrollen sichtbar.',
    breite: 1600,
    hoehe: 900,
    medium: 'marker',
    hochkant: false,
    schrift: { min: 0.045, text: 0.056, titel: 0.08, notfall: 0.036 },
    rand: 0.045,
    worte: [30, 45, 65],
    maxElemente: 10,
    seite: 'quer',
    pngBreite: 3840
  },
  flipchart: {
    id: 'flipchart',
    label: 'Flipchart / Plakat (hochkant)',
    kurz: 'Flipchart',
    beschreibung: 'Hochformat 68 × 99 cm – für Plakate, Stationen oder einen Aushang im Raum.',
    breite: 1000,
    hoehe: 1456,
    medium: 'marker',
    hochkant: true,
    schrift: { min: 0.03, text: 0.04, titel: 0.06, notfall: 0.025 },
    rand: 0.05,
    worte: [25, 40, 55],
    maxElemente: 9,
    seite: 'hoch',
    pngBreite: 2480
  },
  heft: {
    id: 'heft',
    label: 'Hefteintrag A4',
    kurz: 'Hefteintrag',
    beschreibung: 'DIN A4 hochkant zum Abschreiben – oder als Lückentafelbild zum Ausfüllen.',
    breite: 1000,
    hoehe: 1414,
    medium: 'papier',
    hochkant: true,
    schrift: { min: 0.0145, text: 0.0165, titel: 0.026, notfall: 0.0125 },
    rand: 0.07,
    worte: [80, 130, 190],
    maxElemente: 16,
    seite: 'hoch',
    pngBreite: 2480
  }
}

export const FORMAT_IDS: FormatId[] = ['klapptafel', 'whiteboard', 'flipchart', 'heft']
export const formatInfo = (id: FormatId): FormatInfo => FORMATE[id] ?? FORMATE.whiteboard

/** Hintergrund und Farben je Medium. `gelb` auf Weiß ist ein Textmarker hinter dunkler Schrift. */
export interface Palette {
  hintergrund: string
  /** Fläche hinter Beschriftungen auf Pfeilen (deckt Linien ab) */
  tafel: string
  farben: Record<Farbe, string>
  /** Marker-Hinterlegung für `gelb` auf hellem Grund */
  marker?: string
  rahmen?: string
}

export const PALETTEN: Record<Medium, Palette> = {
  // Kreide auf Dunkelgrün: alle Farben hell, Kontrast ≥ 7 : 1 zum Grund
  kreide: {
    hintergrund: '#23402f',
    tafel: '#23402f',
    farben: { grund: '#f4f2ea', gelb: '#f8e46c', blau: '#a8d8ff', rot: '#ffb0b0', gruen: '#c4f29a', orange: '#ffc98a' },
    rahmen: '#8a6a45'
  },
  // Boardmarker auf Weiß: dunkle, satte Farben (Kontrast ≥ 4,5 : 1); Gelb nur als Textmarker
  marker: {
    hintergrund: '#ffffff',
    tafel: '#ffffff',
    farben: { grund: '#1d1d1f', gelb: '#1d1d1f', blau: '#1556b0', rot: '#b71c1c', gruen: '#1b6e2a', orange: '#a64300' },
    marker: '#fff27a'
  },
  papier: {
    hintergrund: '#ffffff',
    tafel: '#ffffff',
    farben: { grund: '#1d1d1f', gelb: '#1d1d1f', blau: '#1556b0', rot: '#b71c1c', gruen: '#1b6e2a', orange: '#a64300' },
    marker: '#fff27a'
  }
}

export const FARB_NAMEN: Record<Medium, Record<Farbe, string>> = {
  kreide: { grund: 'Weiß', gelb: 'Gelb', blau: 'Blau', rot: 'Rot', gruen: 'Grün', orange: 'Orange' },
  marker: { grund: 'Schwarz', gelb: 'Gelb (Textmarker)', blau: 'Blau', rot: 'Rot', gruen: 'Grün', orange: 'Orange' },
  papier: { grund: 'Schwarz', gelb: 'Gelb (Textmarker)', blau: 'Blau', rot: 'Rot', gruen: 'Grün', orange: 'Orange' }
}

/**
 * Zonen der Formate. Die Klapptafel folgt der Dreifeld-Logik (Universität Hamburg, Workshop
 * „Das Tafelbild"; Sitte): LINKS Impuls, Material, Nebenrechnung – MITTE das Ergebnis, das ins
 * Heft kommt – RECHTS Merksatz, Regel, Hausaufgabe. Die übrigen Formate lesen sich von oben
 * nach unten: Überschrift, Struktur, Sicherung.
 */
export interface Zonen {
  titel: Zone
  impuls: Zone | null
  haupt: Zone
  merksatz: Zone
  hausaufgabe: Zone | null
  /** Trennlinien der Tafelflügel (x relativ) */
  fluegel?: number[]
}

export function zonen(id: FormatId): Zonen {
  const f = formatInfo(id)
  // Gleicher Rand in Einheiten ringsum (R3: oben/unten ≥ 4 % der Höhe)
  const m = f.rand * Math.min(f.breite, f.hoehe)
  const rx = m / f.breite
  const ry = m / f.hoehe
  const unten = 1 - ry
  switch (id) {
    case 'klapptafel': {
      // Flügel je 25 %, Mitte 50 % (R2); zwischen den Feldern bleibt ein Streifen frei
      const s = 0.012
      return {
        titel: { x: 0.25 + s, y: ry, w: 0.5 - 2 * s, h: 0.15 },
        impuls: { x: rx, y: ry, w: 0.25 - s - rx, h: unten - ry },
        haupt: { x: 0.25 + s, y: ry + 0.19, w: 0.5 - 2 * s, h: unten - ry - 0.19 },
        merksatz: { x: 0.75 + s, y: ry, w: 0.25 - s - rx, h: 0.56 },
        hausaufgabe: { x: 0.75 + s, y: ry + 0.6, w: 0.25 - s - rx, h: unten - ry - 0.6 },
        fluegel: [0.25, 0.75]
      }
    }
    case 'whiteboard':
      return {
        titel: { x: rx, y: ry, w: 0.64 - rx, h: 0.13 },
        impuls: { x: 0.67, y: ry, w: 0.33 - rx, h: 0.13 },
        haupt: { x: rx, y: ry + 0.16, w: 1 - 2 * rx, h: 0.56 },
        merksatz: { x: rx, y: ry + 0.75, w: 0.64 - rx, h: unten - ry - 0.75 },
        hausaufgabe: { x: 0.67, y: ry + 0.75, w: 0.33 - rx, h: unten - ry - 0.75 }
      }
    case 'flipchart':
      return {
        titel: { x: rx, y: ry, w: 1 - 2 * rx, h: 0.085 },
        impuls: { x: rx, y: ry + 0.095, w: 1 - 2 * rx, h: 0.06 },
        haupt: { x: rx, y: ry + 0.17, w: 1 - 2 * rx, h: 0.54 },
        merksatz: { x: rx, y: ry + 0.73, w: 1 - 2 * rx, h: 0.14 },
        hausaufgabe: { x: rx, y: ry + 0.885, w: 1 - 2 * rx, h: unten - ry - 0.885 }
      }
    case 'heft':
    default:
      return {
        titel: { x: rx, y: ry, w: 0.74 - rx, h: 0.05 },
        impuls: { x: rx, y: ry + 0.058, w: 1 - 2 * rx, h: 0.045 },
        haupt: { x: rx, y: ry + 0.11, w: 1 - 2 * rx, h: 0.6 },
        merksatz: { x: rx, y: ry + 0.725, w: 1 - 2 * rx, h: 0.12 },
        hausaufgabe: { x: rx, y: ry + 0.855, w: 1 - 2 * rx, h: unten - ry - 0.855 }
      }
  }
}

/** Relative Kontrastberechnung nach WCAG 2.x */
export function kontrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) return 0
    const n = parseInt(m[1], 16)
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const [h, d] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (h + 0.05) / (d + 0.05)
}

/** Farbe eines Farbplatzes auf dem Medium */
export const farbwert = (medium: Medium, farbe: Farbe): string => PALETTEN[medium].farben[farbe] ?? PALETTEN[medium].farben.grund

/** Schrift: Tafelschrift (handschriftnah) oder Druckschrift */
export type Schriftart = 'hand' | 'druck'
export const SCHRIFTEN: Record<Schriftart, { familie: string; breite: number; label: string }> = {
  hand: { familie: "'Segoe Print','Chalkboard SE','Bradley Hand','Comic Sans MS',cursive", breite: 0.6, label: 'Tafelschrift' },
  druck: { familie: "'Segoe UI','Helvetica Neue',Arial,sans-serif", breite: 0.54, label: 'Druckschrift' }
}
export const standardSchrift = (id: FormatId): Schriftart => (id === 'klapptafel' ? 'hand' : 'druck')

/** Farben einschließlich der Grundfarbe: empfohlen Grund + 3 Akzente, ab 5 Akzenten ein Fehler (Recherche R19) */
export const MAX_FARBEN = 4
export const MAX_FARBEN_FEHLER = 6
/** Merksatz: höchstens so viele Wörter (R17) – er soll auswendig gelernt werden können */
export const MAX_MERKSATZ_WORTE = 25
/** Wörter je Element nach Jahrgang (R11): 5–6 → 12, 7–10 → 8, Oberstufe → 6 (Stichpunkte; ausformuliert doppelt) */
export const worteJeElement = (grade: number, ausformuliert: boolean): number => (grade <= 6 ? 12 : grade <= 10 ? 8 : 6) * (ausformuliert ? 2 : 1)
/** Aufbau: höchstens 8 Schritte, je Schritt höchstens 3 neue Elemente (R33) */
export const MAX_SCHRITTE = 8
export const MAX_NEU_JE_SCHRITT = 3
/** Hartes Minimum der Versalhöhe auf digitalen Tafeln: 2,5 % der Höhe (R7) – als Schriftgrad */
export const HARTES_MINIMUM = 0.036
/** Zeilen je Format: höchstens 12 im Mittelteil bzw. auf einer Folie (R13) */
export const MAX_ZEILEN = 12
/** Zeilenhöhe als Vielfaches des Schriftgrads */
export const ZEILENHOEHE = 1.25
