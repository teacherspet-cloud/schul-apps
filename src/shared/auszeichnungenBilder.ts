/**
 * Bilder zu Medaillen und Titeln (10.10.2026, Wunsch der Lehrkraft) – PLATZHALTER.
 *
 * Alle Bilder entstehen hier als schlichtes SVG aus Code (keine KI, keine fremden Dateien): je Medaille (Kategorie ×
 * Stufe) eine runde Medaille mit Band, Stufenfarbe und Piktogramm der Kategorie; je Titel (Stufe einer Titelleiter) ein
 * Wappen mit dem Motiv der Sprache und einem Schmuck, der mit dem Rang wächst. Gesperrt: graue Silhouette mit Schloss.
 *
 * Echte Grafiken ersetzen die Platzhalter später über die Kennung: Liegt resources/auszeichnungen/<id>.svg oder
 * <id>.png vor, liefert der Server (server/achievements.ts, GET /s/api/auszeichnungen/bild/<id>) diese Datei statt
 * des Platzhalters – nur für freigeschaltete Bilder; die gesperrte Silhouette bleibt immer der Platzhalter.
 *
 * Freigeschaltet ist ein Bild, sobald die Medaille (mindestens diese Stufe in dieser Kategorie) bzw. der Titel in einer
 * Sprache erreicht ist. Als Profilbild lässt sich nur ein freigeschaltetes wählen (darstellungFelder.ts prüft das).
 */
import { KATEGORIEN, STUFEN_NAMEN, TITEL_LEITERN, sprachName, type AuszStand, type KategorieId } from './auszeichnungen'

/** Diese Bilder sind Platzhalter – echte Grafiken folgen (siehe oben) */
export const BILDER_SIND_PLATZHALTER = true

export interface BildInfo {
  id: string
  art: 'medaille' | 'titel'
  stufe: number
  kategorie?: KategorieId
  /** Titelleiter (en, fr, es, la, it, allgemein) */
  leiter?: string
  name: string
  /** Wie es freigeschaltet wird – für die gesperrte Ansicht */
  wie: string
}

const LEITER_NAMEN: Record<string, string> = { allgemein: 'allen anderen Sprachen' }
const leiterName = (l: string): string => LEITER_NAMEN[l] ?? sprachName(l)

/** Alle Bilder: 42 Medaillen (7 Kategorien × 6 Stufen) und je Titelleiter 8 Titel */
export const BILDER: BildInfo[] = [
  ...KATEGORIEN.flatMap((k) =>
    STUFEN_NAMEN.map((s, i) => ({
      id: `m-${k.id}-${i + 1}`,
      art: 'medaille' as const,
      stufe: i + 1,
      kategorie: k.id,
      name: `${k.name} · ${s}`,
      wie: `${s}-Medaille „${k.name}" in einer Sprache erreichen.`
    }))
  ),
  ...Object.entries(TITEL_LEITERN).flatMap(([l, leiter]) =>
    leiter.map((t, i) => ({
      id: `t-${l}-${i + 1}`,
      art: 'titel' as const,
      stufe: i + 1,
      leiter: l,
      name: t.n === t.m && t.m === t.w ? t.n : `${t.m} / ${t.w} / ${t.n}`,
      wie: `Titel ${i + 1} (${t.n}) in ${leiterName(l)} erreichen.`
    }))
  )
]
const NACH_ID = new Map(BILDER.map((b) => [b.id, b]))
export const bildInfo = (id: string): BildInfo | undefined => NACH_ID.get(id)

/** Titelleiter einer Sprache */
export const leiterVon = (sprache: string): string => (TITEL_LEITERN[sprache] ? sprache : 'allgemein')

/** Die Bilder der Sammlung einer Sprache: alle Medaillen und die Titel ihrer Leiter */
export const bilderFuerSprache = (sprache: string): BildInfo[] => BILDER.filter((b) => b.art === 'medaille' || b.leiter === leiterVon(sprache))

/** In dieser Sprache freigeschaltet? */
export function freigeschaltetIn(stand: AuszStand, sprache: string, id: string): boolean {
  const b = NACH_ID.get(id)
  if (!b) return false
  if (b.art === 'medaille') return (stand.medaillen[sprache]?.[b.kategorie!]?.stufe ?? 0) >= b.stufe
  return leiterVon(sprache) === b.leiter && (stand.titel[sprache]?.stufe ?? 0) >= b.stufe
}

/** In irgendeiner Sprache freigeschaltet (Profilbild) */
export function freigeschaltet(stand: AuszStand, id: string): boolean {
  const sprachen = new Set([...Object.keys(stand.medaillen), ...Object.keys(stand.titel)])
  return [...sprachen].some((s) => freigeschaltetIn(stand, s, id))
}

// ---------------------------------------------------------------- SVG

/** Farben je Medaillenstufe: hell, mittel, dunkel */
const STUFEN_FARBEN: [string, string, string][] = [
  ['#e8b07a', '#b8733a', '#6e421d'],
  ['#f1f3f5', '#aab4bf', '#5f6b77'],
  ['#ffe48a', '#d4a017', '#7f5d07'],
  ['#f2fbfb', '#9fd3d3', '#3f7f86'],
  ['#e3f6ff', '#74c0fc', '#1864ab'],
  ['#efe6ff', '#8f6ff0', '#3f2196']
]
const GRAU: [string, string, string] = ['#dee2e6', '#adb5bd', '#868e96']

/** Bandfarbe je Kategorie */
const BAND: Record<KategorieId, string> = {
  wortschatz: '#1c7ed6',
  grammatik: '#7048e8',
  dranbleiben: '#e8590c',
  hoeren: '#0ca678',
  lehrwerk: '#2f9e44',
  spiele: '#d6336c',
  zusammen: '#f59f00'
}

/** Piktogramme der Kategorien (in einem 40×40-Feld, Mitte 20/20) */
const PIKTO: Record<KategorieId, string> = {
  // Offenes Buch
  wortschatz:
    '<path d="M4 9 Q12 6 20 10 Q28 6 36 9 V31 Q28 28 20 32 Q12 28 4 31 Z" fill="none" stroke-width="3" stroke-linejoin="round"/><path d="M20 10 V32" stroke-width="2.5"/>',
  // Klammern { }
  grammatik:
    '<path d="M14 5 Q8 5 8 11 V16 Q8 20 4 20 Q8 20 8 24 V29 Q8 35 14 35" fill="none" stroke-width="3.5" stroke-linecap="round"/><path d="M26 5 Q32 5 32 11 V16 Q32 20 36 20 Q32 20 32 24 V29 Q32 35 26 35" fill="none" stroke-width="3.5" stroke-linecap="round"/>',
  // Flamme
  dranbleiben: '<path d="M20 3 Q30 14 29 23 Q29 35 20 36 Q11 35 11 24 Q11 17 17 12 Q17 19 21 20 Q24 12 20 3 Z" stroke-width="1.5" stroke-linejoin="round"/>',
  // Sprechblase mit Schallwellen
  hoeren:
    '<path d="M5 8 H27 Q30 8 30 11 V23 Q30 26 27 26 H14 L8 32 V26 H5 Q2 26 2 23 V11 Q2 8 5 8 Z" fill="none" stroke-width="3" stroke-linejoin="round"/><path d="M33 12 Q36 17 33 22 M36 9 Q41 17 36 25" fill="none" stroke-width="2.5" stroke-linecap="round"/>',
  // Wegstrecke mit Fahne
  lehrwerk:
    '<path d="M4 34 Q12 24 20 30 Q26 34 30 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-dasharray="3 3"/><path d="M30 24 V4" stroke-width="3" stroke-linecap="round"/><path d="M30 5 L40 9 L30 13 Z" stroke-width="1.5" stroke-linejoin="round"/>',
  // Spielsteuerung
  spiele:
    '<path d="M8 12 H32 Q39 12 39 21 Q39 31 33 31 Q29 31 27 26 H13 Q11 31 7 31 Q1 31 1 21 Q1 12 8 12 Z" fill="none" stroke-width="3" stroke-linejoin="round"/><path d="M11 17 V25 M7 21 H15" stroke-width="2.5" stroke-linecap="round"/><circle cx="28" cy="18" r="2"/><circle cx="32" cy="23" r="2"/>',
  // Zwei Personen, Hand in Hand
  zusammen:
    '<circle cx="12" cy="9" r="5"/><circle cx="28" cy="9" r="5"/><path d="M3 34 V24 Q3 16 12 16 Q18 16 20 22 Q22 16 28 16 Q37 16 37 24 V34" fill="none" stroke-width="3" stroke-linejoin="round"/><path d="M15 26 H25" stroke-width="3" stroke-linecap="round"/>'
}

/** Motive der Titelleitern (40×40-Feld) */
const MOTIV: Record<string, string> = {
  // Krone
  en: '<path d="M4 30 L6 12 L14 21 L20 8 L26 21 L34 12 L36 30 Z" stroke-width="1.5" stroke-linejoin="round"/><rect x="4" y="31" width="32" height="5" rx="1.5"/>',
  // Lilienähnliche Form
  fr: '<path d="M20 3 Q27 12 22 22 L20 26 L18 22 Q13 12 20 3 Z"/><path d="M18 22 Q8 22 6 14 Q3 9 8 9 Q12 10 14 16 Q16 20 18 22 Z"/><path d="M22 22 Q32 22 34 14 Q37 9 32 9 Q28 10 26 16 Q24 20 22 22 Z"/><rect x="10" y="25" width="20" height="4" rx="1.5"/><path d="M18 29 L20 37 L22 29 Z"/>',
  // Sonne
  es: '<circle cx="20" cy="20" r="8"/><path d="M20 2 V8 M20 32 V38 M2 20 H8 M32 20 H38 M7 7 L11 11 M29 29 L33 33 M33 7 L29 11 M7 33 L11 29" stroke-width="3" stroke-linecap="round"/>',
  // Lorbeerkranz
  la:
    '<path d="M20 36 Q5 32 6 14 M20 36 Q35 32 34 14" fill="none" stroke-width="2.5" stroke-linecap="round"/>' +
    [0, 1, 2, 3]
      .map((i) => {
        const y = 30 - i * 5.5
        const x = 8 + i * 0.4
        return `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="4.8" transform="rotate(-35 ${x} ${y})"/><ellipse cx="${40 - x}" cy="${y}" rx="2.6" ry="4.8" transform="rotate(35 ${40 - x} ${y})"/>`
      })
      .join(''),
  // Stern
  it: '<path d="M20 3 L24.7 14.6 L37 15.3 L27.5 23.3 L30.6 35.4 L20 28.7 L9.4 35.4 L12.5 23.3 L3 15.3 L15.3 14.6 Z" stroke-width="1.5" stroke-linejoin="round"/>',
  // Kompass
  allgemein:
    '<circle cx="20" cy="20" r="15" fill="none" stroke-width="3"/><path d="M20 7 L24 20 L20 33 L16 20 Z" stroke-width="1"/><circle cx="20" cy="20" r="2.5"/>'
}

/** Farbe des Wappens je Leiter */
const WAPPEN: Record<string, string> = { en: '#1c3d8f', fr: '#2b4fae', es: '#c92a2a', la: '#862e2e', it: '#2b8a3e', allgemein: '#495057' }
/** Randfarbe des Wappens je Titelstufe (wächst mit dem Rang) */
const RAND_STUFE = [0, 0, 1, 1, 2, 2, 3, 5]

const ROEMISCH = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

const schloss = (x: number, y: number): string =>
  `<g transform="translate(${x} ${y})"><circle r="15" fill="#495057"/><rect x="-7" y="-2" width="14" height="11" rx="2" fill="#f1f3f5"/><path d="M-4.5 -2 V-6 Q-4.5 -10.5 0 -10.5 Q4.5 -10.5 4.5 -6 V-2" fill="none" stroke="#f1f3f5" stroke-width="2.5"/></g>`

function medailleSvg(b: BildInfo, gesperrt: boolean): string {
  const [hell, mittel, dunkel] = gesperrt ? GRAU : STUFEN_FARBEN[b.stufe - 1]
  const band = gesperrt ? '#adb5bd' : BAND[b.kategorie!]
  const g = `g${b.id.replace(/[^a-z0-9]/g, '')}`
  const meister = b.stufe === 6 && !gesperrt
  const diamant = b.stufe === 5 && !gesperrt
  const strahlen = meister
    ? `<g fill="#ffd43b" opacity="0.9">${Array.from({ length: 12 }, (_, i) => `<path d="M60 82 L${(60 + 58 * Math.cos((i * Math.PI) / 6 - 0.13)).toFixed(1)} ${(82 + 58 * Math.sin((i * Math.PI) / 6 - 0.13)).toFixed(1)} L${(60 + 58 * Math.cos((i * Math.PI) / 6 + 0.13)).toFixed(1)} ${(82 + 58 * Math.sin((i * Math.PI) / 6 + 0.13)).toFixed(1)} Z"/>`).join('')}</g>`
    : ''
  const glanz = diamant
    ? '<path d="M38 64 L48 56 L56 66 Z M70 52 L80 60 L72 66 Z" fill="#ffffff" opacity="0.7"/>'
    : meister
      ? '<circle cx="60" cy="82" r="40" fill="none" stroke="#ffd43b" stroke-width="3"/>'
      : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 140" width="120" height="140" role="img" aria-label="${esc(b.name)}${gesperrt ? ' (gesperrt)' : ''}">` +
    `<defs><radialGradient id="${g}" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="${hell}"/><stop offset="0.6" stop-color="${mittel}"/><stop offset="1" stop-color="${dunkel}"/></radialGradient></defs>` +
    `<path d="M34 4 H54 L66 44 H46 Z" fill="${band}"/><path d="M86 4 H66 L54 44 H74 Z" fill="${band}" opacity="0.85"/>` +
    strahlen +
    `<circle cx="60" cy="82" r="46" fill="url(#${g})" stroke="${dunkel}" stroke-width="3"/>` +
    `<circle cx="60" cy="82" r="36" fill="none" stroke="${hell}" stroke-width="2" opacity="0.8"/>` +
    glanz +
    `<g transform="translate(40 62)" fill="${dunkel}" stroke="${dunkel}">${PIKTO[b.kategorie!]}</g>` +
    (gesperrt ? schloss(92, 118) : '') +
    '</svg>'
  )
}

function titelSvg(b: BildInfo, gesperrt: boolean): string {
  const rand = gesperrt ? GRAU : STUFEN_FARBEN[RAND_STUFE[b.stufe - 1]]
  const feld = gesperrt ? '#adb5bd' : WAPPEN[b.leiter!] ?? WAPPEN.allgemein
  const g = `g${b.id.replace(/[^a-z0-9]/g, '')}`
  // Sterne über dem Wappen: so viele wie die Stufe
  const sterne = Array.from({ length: b.stufe }, (_, i) => {
    const w = Math.PI * (1.15 + (0.7 * (i + 0.5)) / b.stufe)
    const x = 60 + 52 * Math.cos(w)
    const y = 70 + 52 * Math.sin(w)
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${rand[1]}" stroke="${rand[2]}" stroke-width="1"/>`
  }).join('')
  const spitze = b.stufe === 8 && !gesperrt ? '<circle cx="60" cy="74" r="50" fill="none" stroke="#ffd43b" stroke-width="2" stroke-dasharray="4 4"/>' : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 140" width="120" height="140" role="img" aria-label="${esc(b.name)}${gesperrt ? ' (gesperrt)' : ''}">` +
    `<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${rand[0]}"/><stop offset="0.5" stop-color="${rand[1]}"/><stop offset="1" stop-color="${rand[2]}"/></linearGradient></defs>` +
    spitze +
    sterne +
    `<path d="M24 34 H96 V78 Q96 110 60 126 Q24 110 24 78 Z" fill="url(#${g})"/>` +
    `<path d="M31 40 H89 V78 Q89 104 60 118 Q31 104 31 78 Z" fill="${feld}"/>` +
    `<g transform="translate(40 52)" fill="${rand[0]}" stroke="${rand[0]}">${MOTIV[b.leiter!] ?? MOTIV.allgemein}</g>` +
    `<rect x="36" y="118" width="48" height="16" rx="4" fill="${rand[2]}"/>` +
    `<text x="60" y="130" text-anchor="middle" font-family="Georgia, serif" font-size="12" font-weight="700" fill="#ffffff">${ROEMISCH[b.stufe - 1]}</text>` +
    (gesperrt ? schloss(94, 112) : '') +
    '</svg>'
  )
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** SVG eines Bildes (Platzhalter) – null bei unbekannter Kennung. Gleiche Eingabe, gleiches Ergebnis. */
export function bildSvg(id: string, gesperrt = false): string | null {
  const b = NACH_ID.get(id)
  if (!b) return null
  return b.art === 'medaille' ? medailleSvg(b, gesperrt) : titelSvg(b, gesperrt)
}

/** Adresse eines Bildes beim Server (mit Ersatz aus resources/auszeichnungen, siehe oben) */
export const bildAdresse = (id: string, gesperrt = false): string => `/s/api/auszeichnungen/bild/${encodeURIComponent(id)}${gesperrt ? '?gesperrt=1' : ''}`

/** Titelleitern als Liste (für Tests und die Sammlung) */
export const LEITERN = Object.keys(TITEL_LEITERN)
