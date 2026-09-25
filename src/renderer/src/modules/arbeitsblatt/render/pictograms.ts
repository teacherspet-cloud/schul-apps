/**
 * Piktogramme für Arbeitsanweisungen und Sozialformen.
 *
 * Warum ein eigener Satz und nicht ein fertiger:
 * - ARASAAC steht unter CC BY-NC-SA und die Programmierschnittstelle ausdrücklich nur für
 *   nichtkommerzielle Anwendungen zur Verfügung – für eine ausgelieferte App also nicht nutzbar.
 * - METACOM, Widgit und Boardmaker sind proprietär; METACOM untersagt zusätzlich ausdrücklich,
 *   die Symbole an KI-Systeme weiterzureichen.
 * - Mulberry und OpenMoji stehen unter CC BY-SA 4.0 und wären erlaubt, ziehen aber eine
 *   ungeklärte Frage nach sich: Ob die Share-alike-Bedingung auf das ganze Arbeitsblatt
 *   durchschlägt, ist eine Einzelfallfrage. Ein eigener Satz macht sie gegenstandslos.
 *
 * Gestaltung nach den Empfehlungen des DBSV (leserlich.info/bilder): **flächig, nicht linear** –
 * flächige Umsetzungen wurden als leichter erkennbar bewertet –, ohne für die Erkennbarkeit
 * unwichtige Bestandteile, und in einer Form, die die Graustufen-Fotokopie übersteht. Die
 * Symbole zeichnen in `currentColor`, übernehmen also die Textfarbe des Blattes und erreichen
 * damit denselben Kontrast wie die Schrift.
 *
 * Sie werden NICHT automatisch nach Jahrgang gesetzt: Eine belegte Altersgrenze, ab der
 * Piktogramme überflüssig oder albern werden, gibt es nicht. Das beurteilt die Lehrkraft.
 */

import { GREEN_SCREEN_PROMPT } from '../../../shared/images'

export interface Pictogram {
  id: string
  /** Bezeichnung für Auswahl und Alternativtext */
  label: string
  /** Pfade in einem Feld von 24 × 24 */
  paths: string[]
  /**
   * Innenliegende Teilpfade werden zu Löchern statt zu Flächen.
   * Nötig überall dort, wo ein Symbol eine Aussparung braucht – ein Haken in einer Scheibe,
   * Augen in einer Maske. Ohne diese Angabe läge die Aussparung farbgleich auf der Fläche
   * und wäre unsichtbar.
   */
  evenodd?: boolean
}

/** Kopf und Rumpf einer Person, verschoben und skaliert. */
const person = (cx: number, cy: number, r: number): string[] => [
  `M${cx} ${cy - r}a${r} ${r} 0 1 1 0 ${2 * r}a${r} ${r} 0 1 1 0 ${-2 * r}z`,
  `M${cx - r * 2.1} ${cy + r * 4.4}c0-${r * 2.3} ${r * 0.95}-${r * 3.6} ${r * 2.1}-${r * 3.6}s${r * 2.1} ${r * 1.3} ${r * 2.1} ${r * 3.6}z`
]

export const PICTOGRAMS: Pictogram[] = [
  // ---------- Sozialformen ----------
  { id: 'einzelarbeit', label: 'Einzelarbeit', paths: person(12, 7, 3.6) },
  { id: 'partnerarbeit', label: 'Partnerarbeit', paths: [...person(7, 7, 3), ...person(17, 7, 3)] },
  { id: 'gruppenarbeit', label: 'Gruppenarbeit', paths: [...person(5.5, 7, 2.4), ...person(12, 6, 2.6), ...person(18.5, 7, 2.4)] },
  {
    id: 'plenum',
    label: 'Plenum',
    paths: [
      // Eine Person vorn, die übrigen als Halbkreis dahinter
      ...person(12, 15, 3),
      'M4 9a2 2 0 1 1 0 4a2 2 0 1 1 0-4z',
      'M20 9a2 2 0 1 1 0 4a2 2 0 1 1 0-4z',
      'M8 5a2 2 0 1 1 0 4a2 2 0 1 1 0-4z',
      'M16 5a2 2 0 1 1 0 4a2 2 0 1 1 0-4z'
    ]
  },
  {
    id: 'rollenspiel',
    label: 'Rollenspiel',
    // Zwei Theatermasken – Augen und Mund sind ausgespart, sonst wären es dunkle Klötze
    evenodd: true,
    paths: [
      // lachende Maske, links oben
      'M1 2h11v9.5a5.5 5.5 0 0 1-11 0z M4.2 5.4a1.2 1.2 0 1 0 0 2.4a1.2 1.2 0 0 0 0-2.4z M8.8 5.4a1.2 1.2 0 1 0 0 2.4a1.2 1.2 0 0 0 0-2.4z M3.6 9.2h5.8c-.6 1.8-1.6 2.7-2.9 2.7s-2.3-.9-2.9-2.7z',
      // ernste Maske, rechts unten
      'M12 10.5h11V20a5.5 5.5 0 0 1-11 0z M15.2 13.9a1.2 1.2 0 1 0 0 2.4a1.2 1.2 0 0 0 0-2.4z M19.8 13.9a1.2 1.2 0 1 0 0 2.4a1.2 1.2 0 0 0 0-2.4z M14.8 18.3h5.4v1.7h-5.4z'
    ]
  },

  // ---------- Arbeitsanweisungen ----------
  {
    id: 'schreiben',
    label: 'Schreibe',
    paths: [
      // Stift, schräg, mit Spitze links unten
      'M17.6 2.6l3.8 3.8-2.1 2.1-3.8-3.8z',
      'M14.4 5.8l3.8 3.8-9.3 9.3-3.8-3.8z',
      'M4.3 16.2l3.5 3.5-4.8 1.3z',
      'M3 22h18v1.6H3z'
    ]
  },
  {
    id: 'lesen',
    label: 'Lies',
    paths: [
      // Aufgeschlagenes Buch
      'M2 5.2c2.9-1 5.8-1.4 9-.4v14c-3.2-1-6.1-.6-9 .4z',
      'M22 5.2c-2.9-1-5.8-1.4-9-.4v14c3.2-1 6.1-.6 9 .4z'
    ]
  },
  {
    id: 'malen',
    label: 'Male an',
    paths: [
      // Pinsel mit breiter Spitze
      'M15.6 2.4l6 6-6.6 6.6-6-6z',
      'M8.2 9.8l6 6-1.6 1.6a4.2 4.2 0 0 1-6-6z',
      'M6.4 18.2c-1.1 1.6-2.4 2.4-3.9 2.4.6-1.5 1.4-2.8 2.5-3.9z'
    ]
  },
  {
    id: 'ausschneiden',
    label: 'Schneide aus',
    paths: [
      // Schere: zwei Griffe, gekreuzte Klingen
      'M5 2.6l8.6 12.2-1.9 1.4L3.1 4z',
      'M19 2.6L10.4 14.8l1.9 1.4L20.9 4z',
      'M6.2 16.4a3.4 3.4 0 1 1 0 6.8a3.4 3.4 0 0 1 0-6.8zm0 1.9a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3z',
      'M17.8 16.4a3.4 3.4 0 1 1 0 6.8a3.4 3.4 0 0 1 0-6.8zm0 1.9a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3z'
    ]
  },
  {
    id: 'sprechen',
    label: 'Sprich',
    paths: ['M2.6 3.4h18.8v13.2H9.4L4.2 21v-4.4H2.6z', 'M6.4 7.8h11.2v1.8H6.4zm0 3.6h7.6v1.8H6.4z']
  },
  {
    id: 'hoeren',
    label: 'Höre zu',
    paths: [
      // Kopfhörer: Bügel und zwei Muscheln
      'M12 2.6c-5 0-9 4-9 9v3.2h2.6V11.6c0-3.6 2.9-6.4 6.4-6.4s6.4 2.8 6.4 6.4v3.2H21V11.6c0-5-4-9-9-9z',
      'M2.2 13.4h4.2v8H4a1.8 1.8 0 0 1-1.8-1.8z',
      'M17.6 13.4h4.2v6.2A1.8 1.8 0 0 1 20 21.4h-2.4z'
    ]
  },
  {
    id: 'nachdenken',
    label: 'Denke nach',
    paths: [
      // Glühbirne mit Sockel
      'M12 2.2a6.6 6.6 0 0 0-3.8 12c.5.4.8.9.9 1.5h5.8c.1-.6.4-1.1.9-1.5A6.6 6.6 0 0 0 12 2.2z',
      'M9.1 17.2h5.8v1.8H9.1z',
      'M10 20.2h4c-.3 1.1-1 1.7-2 1.7s-1.7-.6-2-1.7z'
    ]
  },
  {
    id: 'markieren',
    label: 'Markiere',
    paths: [
      // Textmarker über einer Zeile
      'M14.6 3.2l6.2 6.2-7.4 7.4-6.2-6.2z',
      'M6.4 11.4l6.2 6.2-2 2H5.2l-1.4-2.6z',
      'M3 21.4h18V23H3z'
    ]
  },
  {
    id: 'zuordnen',
    label: 'Ordne zu',
    paths: [
      // Zwei Felder, dazwischen ein Pfeil
      'M1.6 5h6.8v6H1.6zm0 8h6.8v6H1.6z',
      'M15.6 5h6.8v6h-6.8zm0 8h6.8v6h-6.8z',
      'M9 7.4h3.6v1.6H9zM9 15h3.6v1.6H9z',
      'M12.2 6.2l2.6 2-2.6 2zM12.2 13.8l2.6 2-2.6 2z'
    ]
  },
  {
    id: 'vergleichen',
    label: 'Vergleiche',
    paths: [
      // Waage: Balken mit zwei Schalen
      'M11.2 2.4h1.6v18h-1.6z',
      'M4 7h16v1.6H4z',
      'M7.6 20.4h8.8V22H7.6z',
      'M2 13.6c0 1.7 1.4 3 3 3s3-1.3 3-3zM5 8.2L2 13.6h6z',
      'M16 13.6c0 1.7 1.4 3 3 3s3-1.3 3-3zM19 8.2l-3 5.4h6z'
    ]
  },
  {
    id: 'hausaufgabe',
    label: 'Hausaufgabe',
    paths: ['M12 2.4L1.8 11h2.8v10.6h14.8V11h2.8z', 'M9.4 13.6h5.2v8H9.4z']
  },
  {
    id: 'merke',
    label: 'Merke dir',
    paths: [
      // Ausrufezeichen in einem runden Feld
      'M12 1.8a10.2 10.2 0 1 0 0 20.4a10.2 10.2 0 0 0 0-20.4zm0 2.2a8 8 0 1 1 0 16a8 8 0 0 1 0-16z',
      'M10.9 6.6h2.2v7.6h-2.2z',
      'M12 15.8a1.4 1.4 0 1 1 0 2.8a1.4 1.4 0 0 1 0-2.8z'
    ]
  },
  {
    id: 'kontrolle',
    label: 'Kontrolliere',
    // Der Haken ist aus der Scheibe ausgespart; als zweite Fläche läge er unsichtbar darauf
    evenodd: true,
    paths: ['M12 1.8a10.2 10.2 0 1 0 0 20.4a10.2 10.2 0 0 0 0-20.4z M10.4 17.2L5.2 12l2.1-2.1 3.1 3.1 6.3-6.3 2.1 2.1z']
  }
]

export const pictogramById = (id: string): Pictogram | undefined => PICTOGRAMS.find((p) => p.id === id)

/** Piktogramm zu einer Sozialform, soweit es eines gibt. */
export function pictogramForSocialForm(form: string): Pictogram | undefined {
  const map: Record<string, string> = {
    EA: 'einzelarbeit',
    PA: 'partnerarbeit',
    GA: 'gruppenarbeit',
    Plenum: 'plenum',
    Rollenspiel: 'rollenspiel'
  }
  return pictogramById(map[form] ?? '')
}

/**
 * Piktogramm zu einer Arbeitsanweisung.
 * Trifft nur bei eindeutigen Handlungsverben zu; im Zweifel lieber keines als ein falsches.
 */
const OPERATOR_HINTS: [RegExp, string][] = [
  [/\bschreib|verfass|notier|trag .*ein\b/i, 'schreiben'],
  [/\blies\b|\blesen\b|\bliest\b/i, 'lesen'],
  [/\bmal|zeichne|färbe|male an\b/i, 'malen'],
  [/\bschneide|klebe\b/i, 'ausschneiden'],
  [/\bsprich|erzähl|besprich|diskutier|nenne deinem\b/i, 'sprechen'],
  [/\bhör|hörst du|hörtext\b/i, 'hoeren'],
  [/\büberleg|denk nach|vermute|stelle eine vermutung\b/i, 'nachdenken'],
  [/\bmarkier|unterstreich|hebe .*hervor\b/i, 'markieren'],
  [/\bordne zu|verbinde|zuordn\b/i, 'zuordnen'],
  [/\bvergleich|gegenüberstell\b/i, 'vergleichen'],
  [/\bkontrollier|überprüf|vergleicht eure\b/i, 'kontrolle']
]

export function pictogramForInstruction(text: string): Pictogram | undefined {
  for (const [pattern, id] of OPERATOR_HINTS) if (pattern.test(text)) return pictogramById(id)
  return undefined
}

/**
 * Auftrag an die Bild-KI, ein Piktogramm neu zu gestalten.
 *
 * Die Vorgaben sind dieselben, die den mitgelieferten Satz bestimmen: flächig statt linear
 * (so gezeichnete Symbole werden als leichter erkennbar bewertet), ein einziges Motiv, keine
 * Schrift – und kräftig genug, um die Graustufen-Fotokopie zu überstehen. Der neongrüne
 * Hintergrund wird nach dem Erzeugen von der App entfernt, damit das Symbol frei steht.
 */
export function pictogramPrompt(picto: Pictogram, style = ''): string {
  return [
    `A single flat pictogram meaning "${picto.label}" for a German school worksheet.`,
    'One clearly recognisable motif, solid filled shapes in one single dark colour, no outlines-only style, no thin hairlines.',
    'Extremely simple and uncluttered: it must stay recognisable when printed small and photocopied in greyscale.',
    'No text, no letters, no numbers, no speech bubbles with writing, no frame, no shadow, no gradient.',
    style.trim(),
    GREEN_SCREEN_PROMPT
  ]
    .filter(Boolean)
    .join(' ')
}
