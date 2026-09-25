import type { CefrLevel } from '@shared/types'
import { CEFR_DESCRIPTORS } from '../../../shared/cefr'

/** Sprachniveau für Fächer, die keine Fremdsprache sind. */
export type LanguageMode = 'standard' | 'sensitive' | 'simple' | 'easyOriented' | 'dazA1' | 'dazA2' | 'dazB1'

export const LANGUAGE_MODES: { value: LanguageMode; label: string; description: string }[] = [
  { value: 'standard', label: 'Altersgerecht', description: 'Bildungssprache passend zum Jahrgang, Fachbegriffe werden erklärt.' },
  { value: 'sensitive', label: 'Sprachsensibel', description: 'Zusätzlich Wortspeicher, Satzanfänge und ein Mustersatz.' },
  { value: 'simple', label: 'Einfache Sprache', description: 'Kurze Sätze (max. 15 Wörter), Aktiv, kurze Absätze.' },
  { value: 'easyOriented', label: 'An Leichter Sprache orientiert', description: 'Eine Aussage pro Satz, keine Fremdwörter, Bilder zu Schlüsselbegriffen.' },
  { value: 'dazA1', label: 'DaZ – Niveau A1', description: 'Wort-Bild-Zuordnung, Einwortantworten.' },
  { value: 'dazA2', label: 'DaZ – Niveau A2', description: 'Kurze Hauptsätze mit Satzmustern.' },
  { value: 'dazB1', label: 'DaZ – Niveau B1', description: 'Einfache Sprache mit Formulierungshilfen.' }
]

/** Erhöht die Mindestschriftgröße und den Zeilenabstand (Leichte/Einfache Sprache, DaZ-Anfänger). */
export function needsLargeType(mode: LanguageMode): boolean {
  return mode === 'simple' || mode === 'easyOriented' || mode === 'dazA1' || mode === 'dazA2'
}

/** Satzlängen-Obergrenze des Sprachmodus (überschreibt ggf. das Altersband). */
export function modeMaxSentenceWords(mode: LanguageMode): number | null {
  switch (mode) {
    case 'simple':
    case 'dazB1':
      return 15
    case 'easyOriented':
      return 10
    case 'dazA2':
      return 12
    case 'dazA1':
      return 8
    default:
      return null
  }
}

export function languageModeRules(mode: LanguageMode): string[] {
  const simple = [
    'Schreibe in Einfacher Sprache: höchstens 15 Wörter pro Satz, höchstens ein Nebensatz, Aktiv statt Passiv, kein Konjunktiv, Verben statt Nominalisierungen.',
    'Gliedere Texte in kurze Absätze mit Zwischenüberschriften; erkläre jedes Fachwort direkt.'
  ]
  switch (mode) {
    case 'standard':
      return ['Nutze altersgerechte Bildungssprache. Markiere Fachbegriffe beim ersten Auftreten **fett** und erkläre sie kurz.']
    case 'sensitive':
      return [
        'Arbeite sprachsensibel: Markiere Fachbegriffe **fett** und erkläre sie.',
        'Ergänze einen Wortspeicher (Nomen mit Artikel und Plural) und Satzanfänge passend zu den Operatoren (z. B. „Ich vermute, dass …“, „Daraus folgt …“).',
        'Gib zu mindestens einer Schreibaufgabe einen Mustersatz vor.'
      ]
    case 'simple':
      return simple
    case 'easyOriented':
      return [
        'Orientiere dich an den Regeln der Leichten Sprache: eine Aussage pro Satz, jeder Satz in einer eigenen Zeile, keine Fremdwörter, Abkürzungen, Redewendungen oder Genitive.',
        'Vereinfache Zahlen („sehr viele“ statt Prozent), sprich die Lernenden direkt an, keine Rückverweise.',
        'Sieh zu jedem Schlüsselbegriff ein Bild vor (Bildbeschreibung im Baustein).'
      ]
    case 'dazA1':
      return [
        ...simple,
        'DaZ-Niveau A1: Aufgaben als Wort-Bild-Zuordnung, Einwortantworten, Nomen immer mit Artikel (der/die/das), Anweisungen zusätzlich mit Symbolen, keine Redewendungen.'
      ]
    case 'dazA2':
      return [
        ...simple,
        'DaZ-Niveau A2: kurze Hauptsätze (höchstens 12 Wörter), Satzmuster zum Ergänzen, Wortspeicher mit Artikel und Bild, keine Redewendungen.'
      ]
    case 'dazB1':
      return [...simple, 'DaZ-Niveau B1: Formulierungshilfen und Wortspeicher mit Artikel und Plural anbieten, keine Redewendungen.']
  }
}

/** Regeln für Fremdsprachen-Arbeitsblätter. */
export function foreignLanguageRules(languageName: string, level: CefrLevel, instructionsInGerman: boolean): string[] {
  const early = ['Pre-A1', 'A1', 'A1+', 'A2'].includes(level)
  return [
    `Materialtexte und Aufgaben sind auf ${languageName}, Niveau ${level} (GER). Sprachliche Vorgaben: ${CEFR_DESCRIPTORS[level]}`,
    'Lesetexte entsprechen dem gewählten Niveau, Aufgaben liegen höchstens eine Stufe darüber.',
    instructionsInGerman
      ? 'Formuliere die Arbeitsanweisungen auf Deutsch.'
      : early
        ? `Formuliere die Arbeitsanweisungen auf ${languageName} und gib bei jeder Aufgabe ein Beispiel; ergänze schwierige Anweisungen kurz auf Deutsch.`
        : `Formuliere die Arbeitsanweisungen auf ${languageName}.`
  ]
}
