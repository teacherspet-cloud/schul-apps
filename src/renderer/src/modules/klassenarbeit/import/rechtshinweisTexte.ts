/**
 * Rechtshinweis vor dem Hochladen von Verlagsmaterial an die KI (29.09.2026).
 *
 * Belegt (Bericht recherche/hoerverstehen-schwierigkeit-2026-09-29.md, Abschnitt 4): Der
 * Verband Bildungsmedien (schulbuchkopie.de) schreibt, Inhalte aus Unterrichtswerken dürften
 * nicht in KI-Anwendungen geladen werden – auch nicht, um daraus Aufgaben erstellen zu lassen.
 *
 * Entscheidung der Lehrkraft: deutlicher Hinweis + Bestätigungs-Häkchen, unpersönlich
 * formuliert; erst danach geht das Material an die KI. Die Bestätigung gilt für GENAU EINEN
 * Import und wird nicht gespeichert – es gibt bewusst kein „nicht mehr anzeigen".
 */

export const RECHTSHINWEIS_TITEL = 'Verlagsmaterial und KI'

export const RECHTSHINWEIS_ABSAETZE = [
  'Schulbücher, Arbeitshefte, Lehrerbände, Testhefte und die Transkripte der Hörtexte dazu sind urheberrechtlich geschützte Unterrichtswerke. Nach Auskunft der Schulbuchverlage (schulbuchkopie.de) dürfen Inhalte aus Unterrichtswerken nicht in KI-Anwendungen geladen werden – auch nicht, um daraus Aufgaben erstellen zu lassen.',
  'Das Kopieren für die eigene Klasse und für Klassenarbeiten bleibt im Rahmen des Gesamtvertrags erlaubt (bis 15 %, höchstens 20 Seiten; Kopiervorlagen ohne Grenze).',
  'Beim Einlesen wird das Material an den eingestellten KI-Dienst übermittelt. Geeignet ist Material, das selbst erstellt oder frei lizenziert ist oder dessen Lizenz die Verarbeitung durch KI ausdrücklich erlaubt.'
]

/** Text des Häkchens – unpersönlich (Wunsch der Lehrkraft) */
export const RECHTSHINWEIS_BESTAETIGUNG = 'Die Nutzungsrechte für dieses Material liegen vor; die Verantwortung liegt bei der Lehrkraft.'

/** Kein Ersatz für eine Rechtsberatung – steht klein darunter */
export const RECHTSHINWEIS_FUSS = 'Keine Rechtsberatung. Maßgeblich sind die Lizenzbedingungen des jeweiligen Verlags bzw. Produkts.'
