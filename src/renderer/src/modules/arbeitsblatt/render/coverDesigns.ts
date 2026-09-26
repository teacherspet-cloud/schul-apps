/**
 * Deckblätter für Arbeitsblätter.
 *
 * Das Deckblatt richtet sich an Lehrkräfte, nicht an Lernende: Wer eine Sammlung durchblättert
 * oder ein Blatt weitergibt, soll in Sekunden sehen, worum es geht, welches Fach und welcher
 * Jahrgang gemeint sind und ob Lösungen dabei sind.
 *
 * Es ist bewusst vom Design der Arbeitsblätter getrennt: Ein zurückhaltendes Blatt darf ein
 * kräftiges Deckblatt haben, und dieselbe Deckblattfarbe kann über verschiedene Fächer laufen.
 *
 * Die Vorgabe „Blau" stammt aus einem Deckblatt der Lehrkraft; die Farbwerte sind daraus
 * ausgelesen (dunkel #2F528F, mittel #B4C7E7, hell #DAE3F3).
 */
import { aufhellen, geltendeFachfarbe } from '../../../shared/fachfarben'

export interface CoverDesign {
  id: string
  label: string
  /** Kräftige Farbe für Kopfbereich und Schrift darauf */
  dark: string
  /** Mittlerer Ton für Flächen und Rahmen */
  mid: string
  /** Heller Grund der unteren Hälfte */
  light: string
  /** Schriftfarbe auf dunklem Grund */
  onDark: string
  description: string
}

export const COVER_DESIGNS: CoverDesign[] = [
  {
    id: 'blau',
    label: 'Blau',
    dark: '#2f528f',
    mid: '#b4c7e7',
    light: '#dae3f3',
    onDark: '#ffffff',
    description: 'Die Vorlage: kräftiges Blau oben, heller Verlauf darunter.'
  },
  {
    id: 'gruen',
    label: 'Grün',
    dark: '#375623',
    mid: '#c5e0b4',
    light: '#e2f0d9',
    onDark: '#ffffff',
    description: 'Ruhig und sachlich – passt zu Naturwissenschaften.'
  },
  {
    id: 'rot',
    label: 'Rot',
    dark: '#843c0c',
    mid: '#f8cbad',
    light: '#fbe5d6',
    onDark: '#ffffff',
    description: 'Warm und auffällig – gut für Sprachen und Gesellschaftsfächer.'
  },
  {
    id: 'violett',
    label: 'Violett',
    dark: '#4a2a6d',
    mid: '#d6c7e8',
    light: '#ece5f4',
    onDark: '#ffffff',
    description: 'Kräftig, aber nicht laut.'
  },
  {
    id: 'anthrazit',
    label: 'Anthrazit',
    dark: '#33383d',
    mid: '#c9ced3',
    light: '#e9ecef',
    onDark: '#ffffff',
    description: 'Zurückhaltend und sehr gut kopierbar.'
  },
  {
    id: 'sand',
    label: 'Sand',
    dark: '#7f6000',
    mid: '#ffe699',
    light: '#fff2cc',
    onDark: '#ffffff',
    description: 'Freundlich und hell – gut für die Unterstufe.'
  }
]

export const coverDesign = (id?: string): CoverDesign => COVER_DESIGNS.find((d) => d.id === id) ?? COVER_DESIGNS[0]

/** Kennung der Deckblattfarbe, die der Fachfarbe folgt (Paket 10a) */
export const FACH_COVER_ID = 'fach'

/**
 * Farben des Deckblatts für ein Blatt.
 *
 * Paket 10a: Ohne eigene Wahl folgt das Deckblatt der Fachfarbe – dunkel die Fachfarbe selbst,
 * mittel und hell daraus aufgehellt, so wie die mitgelieferten Farbsätze aufgebaut sind. Eine
 * ausdrücklich gewählte Deckblattfarbe (Blau, Grün …) behält Vorrang; bei „Farbe der Vorlage
 * verwenden" oder unbekanntem Fach bleibt es beim bisherigen Blau. Das neue Deckblatt aus
 * Paket 11 übernimmt diese Farbe.
 */
export function deckblattFarben(meta: { coverDesign?: string; subjectId?: string; vorlagenfarbe?: boolean }): CoverDesign {
  const eigene = meta.coverDesign && meta.coverDesign !== FACH_COVER_ID ? COVER_DESIGNS.find((d) => d.id === meta.coverDesign) : undefined
  if (eigene) return eigene
  const fach = geltendeFachfarbe(meta.subjectId, meta.vorlagenfarbe)
  if (!fach) return COVER_DESIGNS[0]
  return {
    id: FACH_COVER_ID,
    label: 'Fachfarbe',
    dark: fach,
    mid: aufhellen(fach, 0.65),
    light: aufhellen(fach, 0.85),
    onDark: '#ffffff',
    description: 'Folgt der Farbe des Fachs aus den Einstellungen.'
  }
}

/**
 * Mitgelieferter Fuchs, solange keiner erzeugt wurde.
 * Bewusst eine schlichte Zeichnung: Sie druckt sauber und kostet kein Kontingent.
 */
export function foxPlaceholder(dark: string, mid: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <circle cx="60" cy="60" r="58" fill="${mid}" opacity="0.5"/>
  <path d="M26 44 L34 18 L52 34 Z" fill="${dark}"/>
  <path d="M94 44 L86 18 L68 34 Z" fill="${dark}"/>
  <path d="M60 30c20 0 34 16 34 34 0 18-15 30-34 30S26 82 26 64c0-18 14-34 34-34z" fill="${dark}"/>
  <path d="M60 58c12 0 20 9 20 20 0 10-9 16-20 16s-20-6-20-16c0-11 8-20 20-20z" fill="#ffffff" opacity="0.92"/>
  <circle cx="48" cy="60" r="4.5" fill="#1d2b3a"/>
  <circle cx="72" cy="60" r="4.5" fill="#1d2b3a"/>
  <path d="M60 76c-4 0-7 3-7 6s3 5 7 5 7-2 7-5-3-6-7-6z" fill="#1d2b3a"/>
  <path d="M60 87v7" stroke="#1d2b3a" stroke-width="2.5" stroke-linecap="round"/>
</svg>`
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}

/**
 * Auftrag für das KI-Bild.
 * Der Fuchs soll zum Fach passen, aber nichts Fachliches behaupten – er ist Schmuck,
 * kein Material.
 */
export function foxPrompt(subject: string, topic: string): string {
  return [
    `Eine freundliche, anthropomorphe Fuchsfigur als Maskottchen für ein Unterrichtsmaterial im Fach ${subject}.`,
    topic ? `Thema des Materials: ${topic}. Kleidung und ein Gegenstand in der Hand dürfen dazu passen.` : '',
    'Ganzfigur oder Brustbild, freundlich und ruhig, kindgerecht, ohne Text und ohne Schrift im Bild.',
    'Klare Vektorgrafik-Anmutung mit wenigen Flächen, kräftigen Konturen und hellem, einfarbigem Hintergrund.',
    'Keine realistische Fotografie, keine Gewalt, keine Marken, keine realen Personen.'
  ]
    .filter(Boolean)
    .join(' ')
}
