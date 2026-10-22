/**
 * Zeichnen mit der Tastatur (23.10.2026, Barrierefreiheit – WCAG 2.1 AA 2.1.1 „Tastatur“).
 *
 * Alle Zeichenflächen (Stift, Textmarker, Radierer, Linien, Formen, Textkästchen auf dem Online-Arbeitsblatt,
 * Schreibfläche der Handschrift, Tafelbild) bekommen dieselbe Tastenbelegung – ein sichtbares Fadenkreuz statt
 * des Zeigers:
 *
 *  - Pfeiltasten bewegen das Fadenkreuz (8 px, Umschalt 1 px fein, Strg/Alt 32 px weit).
 *  - Leertaste: Stift aufsetzen bzw. absetzen – solange er aufgesetzt ist, zeichnet jede Bewegung eine Strecke.
 *  - Enter: Anfangs- und Endpunkt (Linie, Form, gerader Strich) bzw. eine Stelle setzen (Textkästchen, Punkt).
 *  - Escape bricht ab, Entf/Rücktaste (oder Strg+Z) nimmt den letzten Schritt zurück, Tab verlässt die Fläche.
 *
 * Ohne React-Abhängigkeit (vitest: tests/zeichenTastatur.test.ts). Die Fläche führt die Aktionen aus.
 */

export interface ZPunkt {
  x: number
  y: number
}

/**
 *  - `frei`: Stift, Textmarker, Radierer, Schreibfläche (Leertaste setzt auf/ab; Enter: gerader Strich)
 *  - `zweiPunkte`: Linie, Form, Pfeil (Enter bzw. Leertaste: Anfang, dann Ende)
 *  - `punkt`: Textkästchen, Punkt mit Wert, Auswahl (Enter bzw. Leertaste: an dieser Stelle)
 */
export type ZeichenModus = 'frei' | 'zweiPunkte' | 'punkt'

export interface ZeichenZustand extends ZPunkt {
  /** Stift aufgesetzt (nur `frei`) */
  unten: boolean
  /** Gesetzter Anfangspunkt (Linie, Form, gerader Strich) */
  start: ZPunkt | null
}

/** Ausschnitt eines Tastaturereignisses (React oder DOM) */
export interface ZeichenTasteEreignis {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  metaKey?: boolean
}

export type ZeichenAktion =
  | { art: 'bewegen'; von: ZPunkt; nach: ZPunkt; zeichnen: boolean }
  | { art: 'aufsetzen'; punkt: ZPunkt }
  | { art: 'absetzen'; punkt: ZPunkt }
  | { art: 'start'; punkt: ZPunkt }
  | { art: 'ende'; von: ZPunkt; nach: ZPunkt }
  | { art: 'punkt'; punkt: ZPunkt }
  | { art: 'abbrechen' }
  | { art: 'loeschen' }

export const SCHRITT = 8
export const SCHRITT_FEIN = 1
export const SCHRITT_WEIT = 32

/** Schrittweite einer Pfeiltaste: 8 px, Umschalt 1 px, Strg/Alt 32 px */
export function schrittWeite(t: ZeichenTasteEreignis): number {
  if (t.shiftKey) return SCHRITT_FEIN
  if (t.ctrlKey || t.altKey || t.metaKey) return SCHRITT_WEIT
  return SCHRITT
}

/** Anfang: Fadenkreuz in der Mitte der Fläche */
export function startZustand(breite: number, hoehe: number, lage?: ZPunkt | null): ZeichenZustand {
  const z = lage ?? { x: breite / 2, y: hoehe / 2 }
  return { ...klemmePunkt(z, breite, hoehe), unten: false, start: null }
}

export function klemmePunkt(p: ZPunkt, breite: number, hoehe: number): ZPunkt {
  return { x: Math.max(0, Math.min(Math.max(0, breite), p.x)), y: Math.max(0, Math.min(Math.max(0, hoehe), p.y)) }
}

const PFEILE: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/**
 * Eine Taste auf der Zeichenfläche: neuer Zustand und die auszuführende Aktion.
 * `null` = die Taste gehört nicht der Fläche (Tab, Buchstaben …) – nicht abfangen.
 */
export function zeichenTaste(
  z: ZeichenZustand,
  t: ZeichenTasteEreignis,
  modus: ZeichenModus,
  grenzen: { breite: number; hoehe: number }
): { zustand: ZeichenZustand; aktion: ZeichenAktion | null } | null {
  const pfeil = PFEILE[t.key]
  if (pfeil) {
    const s = schrittWeite(t)
    const nach = klemmePunkt({ x: z.x + pfeil[0] * s, y: z.y + pfeil[1] * s }, grenzen.breite, grenzen.hoehe)
    const von = { x: z.x, y: z.y }
    return { zustand: { ...z, ...nach }, aktion: { art: 'bewegen', von, nach, zeichnen: modus === 'frei' && z.unten } }
  }
  const hier = { x: z.x, y: z.y }
  const mitStrg = Boolean(t.ctrlKey || t.metaKey)
  if (t.key === 'Delete' || t.key === 'Backspace' || (mitStrg && (t.key === 'z' || t.key === 'Z'))) {
    // Ein angefangener Strich wird erst abgesetzt, dann zurückgenommen
    return { zustand: { ...z, unten: false, start: null }, aktion: { art: 'loeschen' } }
  }
  if (t.key === 'Escape' || t.key === 'Esc') {
    // Nichts angefangen: Escape gehört dem Umfeld (z. B. Fenster schließen)
    if (!z.unten && !z.start) return null
    if (z.unten) return { zustand: { ...z, unten: false, start: null }, aktion: { art: 'absetzen', punkt: hier } }
    return { zustand: { ...z, start: null }, aktion: { art: 'abbrechen' } }
  }
  if (mitStrg || t.altKey) return null
  const leer = t.key === ' ' || t.key === 'Spacebar'
  if (!leer && t.key !== 'Enter') return null
  if (modus === 'punkt') return { zustand: z, aktion: { art: 'punkt', punkt: hier } }
  if (modus === 'frei' && (leer || z.unten)) {
    // Leertaste schaltet um; Enter bei aufgesetztem Stift setzt ab
    return z.unten
      ? { zustand: { ...z, unten: false }, aktion: { art: 'absetzen', punkt: hier } }
      : { zustand: { ...z, unten: true, start: null }, aktion: { art: 'aufsetzen', punkt: hier } }
  }
  // Anfang, dann Ende (Linie, Form – und der gerade Strich mit Enter)
  if (!z.start) return { zustand: { ...z, start: hier }, aktion: { art: 'start', punkt: hier } }
  return { zustand: { ...z, start: null }, aktion: { art: 'ende', von: z.start, nach: hier } }
}

/** Tastenkürzel eines Werkzeugs: ein Buchstabe ohne Strg/Alt/Meta (Groß/Klein egal) */
export function werkzeugKuerzel<W extends string>(t: ZeichenTasteEreignis, kuerzel: Partial<Record<string, W>>): W | null {
  if (t.ctrlKey || t.altKey || t.metaKey || t.key.length !== 1) return null
  return kuerzel[t.key.toLowerCase()] ?? null
}

/** Ansagetext einer Aktion (Bildschirmleser); `ding` = Name des Werkzeugs, `ergebnis` = was entstanden ist */
export function aktionsAnsage(a: ZeichenAktion, ding = 'Stift', ergebnis = 'Linie gezeichnet'): string | null {
  switch (a.art) {
    case 'aufsetzen':
      return `${ding} aufgesetzt`
    case 'absetzen':
      return `${ding} abgesetzt`
    case 'start':
      return 'Anfangspunkt gesetzt – mit den Pfeiltasten zum Endpunkt, dann Enter'
    case 'ende':
      return ergebnis
    case 'abbrechen':
      return 'abgebrochen'
    case 'loeschen':
      return 'rückgängig'
    default:
      return null
  }
}

/** Hilfetext der Tastenbelegung (für aria-describedby) – unpersönlich, passt für Lernende und Lehrkraft */
export function zeichenHilfe(modus: ZeichenModus, zusatz = ''): string {
  const teile = ['Pfeiltasten bewegen das Fadenkreuz (Umschalt: fein, Strg: weit).']
  if (modus === 'frei') teile.push('Leertaste setzt den Stift auf oder ab – aufgesetzt zeichnet jede Bewegung.', 'Enter setzt Anfang und Ende eines geraden Strichs.')
  else if (modus === 'zweiPunkte') teile.push('Enter setzt den Anfangspunkt, ein zweites Enter den Endpunkt.')
  else teile.push('Enter setzt an dieser Stelle.')
  teile.push('Escape bricht ab, Entf nimmt den letzten Schritt zurück, Tab verlässt die Fläche.')
  if (zusatz) teile.push(zusatz)
  return teile.join(' ')
}

export interface ZRechteck {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Verbindungslinie zwischen zwei Kästchen (Tastatur: Kästchen A, Taste V, Kästchen B, Enter): die einander
 * nächsten Kantenmitten – so liegt die Linie wie von Hand gezogen an den Rändern.
 */
export function verbindungsPunkte(a: ZRechteck, b: ZRechteck): { von: ZPunkt; nach: ZPunkt } {
  const mitten = (r: ZRechteck): ZPunkt[] => [
    { x: r.x + r.w / 2, y: r.y },
    { x: r.x + r.w / 2, y: r.y + r.h },
    { x: r.x, y: r.y + r.h / 2 },
    { x: r.x + r.w, y: r.y + r.h / 2 }
  ]
  let best = { von: mitten(a)[0], nach: mitten(b)[0], d: Infinity }
  for (const p of mitten(a))
    for (const q of mitten(b)) {
      const d = Math.hypot(p.x - q.x, p.y - q.y)
      if (d < best.d) best = { von: p, nach: q, d }
    }
  return { von: best.von, nach: best.nach }
}

/**
 * Enden einer Linie, die an einem verschobenen Kästchen hängen, wandern mit (23.10.2026, Befund: mit den Pfeiltasten
 * verschoben, blieben die Linien stehen). `v1` = Anfang hängt am Kästchen, `v2` = Ende.
 */
export function linieMitziehen<L extends { x: number; y: number; x2?: number; y2?: number; v1?: string; v2?: string }>(
  l: L,
  kasten: string,
  dx: number,
  dy: number
): L {
  if (l.v1 !== kasten && l.v2 !== kasten) return l
  return {
    ...l,
    ...(l.v1 === kasten ? { x: l.x + dx, y: l.y + dy } : {}),
    ...(l.v2 === kasten ? { x2: (l.x2 ?? l.x) + dx, y2: (l.y2 ?? l.y) + dy } : {})
  }
}
