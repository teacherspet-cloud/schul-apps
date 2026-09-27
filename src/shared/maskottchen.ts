/**
 * Maskottchen für altersgerechte Illustrationen (26.09.2026).
 *
 * Wunsch der Lehrkraft: Für jüngere Jahrgänge sollen altersgerechte Illustrationen
 * (Maskottchen) in den Einstellungen angelegt und auf den Materialien platziert werden
 * können – an Merkkästen, an Aufgaben, frei verschiebbar, auf Wunsch mit Sprechblase.
 *
 * Eine Figur hat eine VORLAGE (KI-gezeichnet aus einer Beschreibung oder hochgeladen) und
 * einen Satz POSEN, die die Bild-KI aus der Beschreibung der Vorlage zeichnet. Die Dateien
 * liegen im Profil unter `maskottchen/<id>/`; die Materialien verweisen nur auf Kennung und
 * Pose (kein Bild im Blatt), die Oberfläche hält alle Bilder in einem Speicher vor.
 */

export interface MaskottchenPose {
  id: string
  label: string
  /** Wofür die Pose steht – bestimmt, wo die Automatik sie einsetzt */
  zweck: string
  /** Wie die Figur dabei aussieht – für die Bild-KI */
  prompt: string
}

/** Die zwölf Standardposen (Entscheidung der Lehrkraft, 26.09.2026). */
export const MASKOTTCHEN_POSEN: MaskottchenPose[] = [
  { id: 'winkend', label: 'winkend', zweck: 'Begrüßung am Anfang', prompt: 'winkt freundlich mit erhobener Hand' },
  { id: 'zeigend', label: 'zeigend', zweck: 'Merke, Info, Regel', prompt: 'zeigt mit ausgestrecktem Arm und erhobenem Zeigefinger zur Seite, als erkläre es etwas Wichtiges' },
  { id: 'denkend', label: 'denkend', zweck: 'Denkaufgabe', prompt: 'denkt nach, Hand am Kinn, Blick nach oben, kleine Fragezeichen über dem Kopf' },
  { id: 'schreibend', label: 'schreibend', zweck: 'Schreibaufgabe', prompt: 'schreibt mit einem Stift auf ein Blatt Papier' },
  { id: 'sprechend', label: 'sprechend', zweck: 'Tipp, Sprechblase', prompt: 'spricht mit offenem Mund und einladender Geste, als gebe es einen Tipp' },
  { id: 'lesend', label: 'lesend', zweck: 'Lesetext, Material', prompt: 'liest konzentriert in einem aufgeschlagenen Buch' },
  { id: 'jubelnd', label: 'jubelnd', zweck: 'Geschafft, Selbstcheck', prompt: 'jubelt mit beiden Armen in der Luft, strahlend' },
  { id: 'warnend', label: 'warnend', zweck: 'Achtung, Regel', prompt: 'hebt warnend die Hand, ernster, aber freundlicher Blick, kleines Ausrufezeichen daneben' },
  { id: 'hoerend', label: 'hörend', zweck: 'Hörtext', prompt: 'hält die Hand hinter das Ohr und lauscht, Kopfhörer um den Hals' },
  { id: 'rechnend', label: 'rechnend', zweck: 'Rechenaufgabe', prompt: 'rechnet an einer kleinen Tafel mit Zahlen und einem Pluszeichen' },
  { id: 'zeichnend', label: 'zeichnend', zweck: 'Zeichenaufgabe, Diagramm', prompt: 'zeichnet mit Lineal und Buntstift eine Linie auf ein Blatt' },
  { id: 'fragend', label: 'fragend', zweck: 'Frage, Rätsel', prompt: 'zuckt fragend mit den Schultern, Handflächen nach oben, großes Fragezeichen daneben' }
]

export const posenById = (id: string): MaskottchenPose | undefined => MASKOTTCHEN_POSEN.find((p) => p.id === id)

/** Gespeicherte Angaben einer Figur (ohne Bilddaten). */
export interface MaskottchenMeta {
  id: string
  name: string
  /** Genaue Beschreibung (Figur, Farben, Merkmale) – die Grundlage aller Posen */
  beschreibung: string
  quelle: 'ki' | 'upload'
  angelegt: string
}

/** Figur mit Bildern als data:-Adressen – so hält sie die Oberfläche vor. */
export interface MaskottchenInfo extends MaskottchenMeta {
  /** Vorlage (freigestellt) */
  vorlage: string
  /** Pose → Bild */
  posen: Record<string, string>
}

/** Vorschlag der Bild-KI für eine Pose – ein Bild je Anfrage. */
export function posePrompt(beschreibung: string, pose: MaskottchenPose): string {
  return [
    `Maskottchen für Unterrichtsmaterialien der Klassen 1 bis 6, GENAU diese Figur: ${beschreibung}.`,
    `Die Figur ${pose.prompt}.`,
    'Ganzfigur, kindgerecht, klare Vektorgrafik-Anmutung mit wenigen Flächen, kräftigen Konturen und weichen Farben – derselbe Stil, dieselben Farben und Merkmale wie in der Beschreibung, damit die Figur wiedererkennbar bleibt.',
    'Reinweißer, einfarbiger Hintergrund ohne Schatten, ohne Text und ohne Schrift im Bild.',
    'Keine realistische Fotografie, keine Marken, keine realen Personen.'
  ].join(' ')
}

/** Vorschlag für die Vorlage aus einer Kurzangabe („ein Pinguin als Professor"). */
export function vorlagePrompt(angabe: string): string {
  return [
    `Maskottchen für Unterrichtsmaterialien der Klassen 1 bis 6: ${angabe}, leicht vermenschlicht, aufrecht stehend, freundlich winkend.`,
    'Ganzfigur, kindgerecht, klare Vektorgrafik-Anmutung mit wenigen Flächen, kräftigen Konturen und weichen Farben.',
    'Reinweißer, einfarbiger Hintergrund ohne Schatten, ohne Text und ohne Schrift im Bild.',
    'Keine realistische Fotografie, keine Marken, keine realen Personen.'
  ].join(' ')
}

/** Auftrag an die Text-KI, eine Vorlage so zu beschreiben, dass die Posen dieselbe Figur zeigen. */
export const BESCHREIBUNGS_AUFTRAG = {
  system: 'Aufgabe: eine gezeichnete Figur so genau beschreiben, dass eine Bild-KI sie in anderen Posen wiedererkennbar zeichnen kann.',
  user: (angabe?: string): string =>
    `${angabe ? `Die Figur wurde nach dieser Angabe gezeichnet: „${angabe}". ` : ''}Beschreibung der Figur auf dem Bild in 2–3 Sätzen: Tierart bzw. Figur, Körperbau, Farben, Gesicht, Kleidung, Accessoires, Stil. Keine Pose, keine Bewertung.`
}

/** Kennung aus dem Namen: „Professor Pengu" → „professor-pengu" */
export function maskottchenId(name: string): string {
  const k = name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return k || `figur-${Date.now().toString(36)}`
}
