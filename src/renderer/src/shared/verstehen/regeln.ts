/**
 * Regeln für KI-Aufträge rund um die Schwierigkeitsstufen (29.09.2026).
 *
 * Grundlage: Bericht `recherche/hoerverstehen-schwierigkeit-2026-09-29.md`, Abschnitte 2 und 3
 * (Raster, Regeln für Zusatzfragen im gleichen Format). Die KI-Aufträge stehen bewusst in
 * einer .ts-Datei und nicht in der Oberfläche.
 */
import { STUFEN, STUFEN_WERTE, stufenMixText } from './stufen'

/** Das Raster als Auftragstext – für jede Anfrage, die Verstehensitems schreibt oder einstuft. */
export function stufenRaster(): string {
  return [
    'SCHWIERIGKEITSSTUFEN JE ITEM (1–5) – maßgeblich ist der Weg vom Text zur Lösung, nicht das Thema:',
    ...STUFEN_WERTE.map((s) => `- Stufe ${s} (${STUFEN[s].name}): ${STUFEN[s].merkmal} ${STUFEN[s].distraktoren}`),
    '- Wortgleichheit ist KEIN Fehler, sondern ein Stellrad der Stufe: 1:1 übernehmbar = Stufe 1. Ab Stufe 2 steht das gefragte Wort nicht mehr in derselben Form in Stamm oder Option, ab Stufe 3 gar nicht mehr (Synonym, Umschreibung).',
    '- Textwörter in Distraktoren sind ab Stufe 3 erlaubt und ab Stufe 4 gewollt – jeder Distraktor bleibt eindeutig falsch.',
    '- Weise jedem Item seine Stufe mit kurzer Begründung aus (z. B. „Option wörtlich im Text" oder „Synonym cheap ↔ expensive") und prüfe die Zuordnung am Text.'
  ].join('\n')
}

/**
 * Regeln für ZUSÄTZLICHE Fragen im gleichen Format (Bericht, Abschnitt 3).
 * `mix` = gewünschte Anzahl je Stufe [1..5].
 */
export function zusatzfragenRegeln(mix: readonly number[], trueFalseErlaubt = true): string {
  const summe = mix.reduce((a, b) => a + b, 0)
  return [
    `ERGÄNZE GENAU ${summe} NEUE ITEMS: ${stufenMixText(mix)}.`,
    '1. Gleiches Format: Aufgabenstellung, Antwortform, Zahl der Optionen, Lücken- bzw. Tabellenstruktur, Punktwert je Item und Sprache der Items wie bei der vorhandenen Aufgabe. Die vorhandenen Items werden NICHT umgeschrieben.',
    '2. Reihenfolge entlang des Textes: Jedes neue Item steht an der Stelle, an der seine Information im Text vorkommt (Feld position). Globalitems (Thema, Zweck) stehen am Anfang oder Ende.',
    '3. Keine Überlappung: Jedes neue Item fragt nach einer Textstelle, die noch nicht abgefragt ist; nie zwei Lösungen im selben Satz.',
    '4. Unabhängigkeit: Kein Item verrät die Lösung eines anderen, weder im Stamm noch in den Optionen.',
    '5. Kein Weltwissen: Keine Frage darf ohne den Text lösbar sein.',
    '6. Genau eine richtige Lösung; offene Formate mit Erwartungshorizont und zulässigen Varianten.',
    '7. Distraktoren gleich lang, grammatisch parallel, thematisch passend, ohne „all/none of the above".',
    '8. Sprachliche Last niedrig: kurze Stämme, eine Frage je Item, keine doppelte Verneinung, Wortschatz unter dem Niveau des Textes.',
    '9. Die Items müssen WÄHREND des Hörens bzw. Lesens lösbar sein.',
    '10. Keine Items zu Stellen, die im Text unklar oder unvollständig sind.',
    trueFalseErlaubt ? '' : '11. KEINE Richtig/Falsch-Aussagen und keine Ja/Nein-Fragen: In diesem Land sind sie hier nicht zugelassen.',
    '',
    stufenRaster()
  ]
    .filter(Boolean)
    .join('\n')
}

/** Kurzer Hinweis für die Blatterzeugung: Stufenmix als Zielverteilung. */
export function stufenMixHinweis(anteile: readonly number[]): string {
  const teile = anteile.map((a, i) => (a > 0 ? `Stufe ${i + 1}: ${a} %` : '')).filter(Boolean)
  return teile.length ? `- Verteile die Items ungefähr so auf die Schwierigkeitsstufen: ${teile.join(', ')}. Steigere innerhalb einer Aufgabe nicht streng, sondern folge dem Text.` : ''
}
