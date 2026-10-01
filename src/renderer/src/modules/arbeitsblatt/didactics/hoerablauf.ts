/**
 * Ablauf eines Hörverstehensteils: Einlesezeit, Durchgänge, Pausen, Nachbearbeitung (01.10.2026).
 *
 * Wunsch der Lehrkraft: Sobald die Aufnahme da ist, soll die Bearbeitungszeit des Hörteils aus
 * der ECHTEN Spieldauer folgen – „zweimal hören + Lesezeit + Pausen". Die Zeiten stammen aus den
 * Prüfungsvorgaben, die in `listeningStates.ts` (Feld `note`) mit Fundstelle stehen; hier stehen
 * sie als Zahlen. Wo ein Land nichts Eigenes belegt, gilt der übliche Rahmen der zentralen
 * Prüfungen: eine Minute Einlesezeit je Text, eine Minute zwischen den Durchgängen, eine Minute
 * zum Fertigschreiben, 15 Sekunden zwischen zwei Texten.
 */
import type { ListeningStage } from './listeningStates'

export interface Hoerablauf {
  /** Einlesezeit vor dem ersten Hören, je Text (Sekunden) */
  einlesen: number
  /** Pause zwischen zwei Durchgängen desselben Textes */
  zwischen: number
  /** Zeit zum Fertigschreiben nach dem letzten Durchgang, je Text */
  nachbearbeiten: number
  /** Pause zwischen zwei Texten */
  zwischenTexten: number
  /** Woher die Zahlen stammen – für den Hinweis an die Lehrkraft */
  quelle: string
}

export const STANDARD_ABLAUF: Hoerablauf = {
  einlesen: 60,
  zwischen: 60,
  nachbearbeiten: 60,
  zwischenTexten: 15,
  quelle: 'üblicher Ablauf zentraler Prüfungen'
}

/** Belegte Abweichungen je Land und Stufe (Zahlen aus den Notizen in listeningStates.ts). */
const LAENDER: Record<string, Partial<Record<ListeningStage, Partial<Hoerablauf>>>> = {
  // Mittlere Reife: je Aufgabenblatt eine Minute Einlesezeit, 15 s zwischen den Texten, eine Minute Fertigschreiben
  MV: { sek1: { einlesen: 60, zwischenTexten: 15, nachbearbeiten: 60, quelle: 'Prüfung zur Mittleren Reife MV' } },
  // Abitur-Musteraufgaben: zwei bis drei Minuten Einlesezeit, je zwei Minuten Bearbeitung nach jedem Durchgang
  NI: { sek2: { einlesen: 150, zwischen: 120, nachbearbeiten: 120, quelle: 'Abitur-Musteraufgaben Niedersachsen' } },
  // Fachanforderungen: drei bis fünf Minuten Einlesezeit, je 60 Sekunden Pause
  SH: { sek2: { einlesen: 240, zwischen: 60, quelle: 'Fachanforderungen Schleswig-Holstein' } },
  // Abitur: etwa eine Minute Orientierungszeit zwischen den Durchgängen, Lesezeit höchstens zwei Minuten je Text
  NW: { sek2: { einlesen: 120, zwischen: 60, quelle: 'Abitur Nordrhein-Westfalen' } }
}

export function hoerablaufFuer(stateId: string | undefined, stufe: ListeningStage): Hoerablauf {
  const eigen = stateId ? LAENDER[stateId]?.[stufe] : undefined
  return { ...STANDARD_ABLAUF, ...(eigen ?? {}) }
}

/** Stufe aus dem Jahrgang: Oberstufe ab Klasse 11 */
export const hoerStufe = (grade: number | undefined): ListeningStage => ((grade ?? 0) >= 11 ? 'sek2' : 'sek1')
