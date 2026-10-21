/**
 * Regeln für jedes KI-Bild (21.10.2026, Befund der Lehrkraft: Personen, die in Büchern blättern, sahen ihre Bücher
 * kopfüber – die Bild-KI drehte das Buch zur Kamera statt zur lesenden Person). Sie hängen an JEDEM Bildauftrag
 * (main/kanaele.ts `generateImage`: Vokabelbilder, Arbeitsblätter, Tafelbild, Sprechkarten, Einstiegsbilder …), damit
 * kein Erzeugungsweg sie vergisst.
 */
export const BILD_REGELN =
  'Orientation and perspective: anything a person reads, writes on or looks at (books, magazines, newspapers, sheets of paper, maps, ' +
  'notebooks, tablets, phones, laptop screens, photos) faces that person, never the camera – the viewer sees its cover or back, or the ' +
  'scene from over the person’s shoulder; nothing is upside down from the person’s point of view, and people look at what they hold.'

/** Bildauftrag mit den Regeln – einmal, auch wenn ein Aufrufer sie schon mitgibt */
export const mitBildRegeln = (prompt: string): string => (prompt.includes(BILD_REGELN) ? prompt : `${prompt.trim()} ${BILD_REGELN}`)
