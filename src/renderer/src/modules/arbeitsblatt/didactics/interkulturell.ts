import { subjectById } from '../model/subjects'

/**
 * Interkulturelle Aspekte, wenn eine Aufgabe an einem konkreten Ort spielt.
 *
 * Wunsch der Lehrkraft (24.09.2026): „Wenn bei Aufgaben konkrete Orte angegeben werden
 * (Länder, Städte etc.), versuch interkulturelle Aspekte mit in die Aufgabe zu integrieren.
 * Geh dabei nur von explizit genanntem Vorwissen der Schülerinnen und Schüler aus."
 *
 * Die zweite Hälfte des Satzes ist die schwierigere. Eine Aufgabe, die stillschweigend
 * Landeskunde voraussetzt, ist für die einen leicht und für die anderen unlösbar – in einer
 * Klassenarbeit verzerrt das die Note. Deshalb gilt: Was gebraucht wird und nicht im
 * eingetragenen Vorwissen steht, liefert das Blatt selbst – und zwar EINGEWOBEN in das, was
 * ohnehin da ist (Notizen, Inhaltspunkte, Materialtext), nicht als zusätzlicher Kasten.
 */

/**
 * Fächer, in denen die Regel greift.
 *
 * Fremdsprachen: Dort ist „interkulturelle kommunikative Kompetenz" ein eigener
 * Kompetenzbereich der Bildungsstandards.
 * Gesellschaftswissenschaften: Dort gehört der Perspektivwechsel zum Fach selbst.
 *
 * Bewusst NICHT in Mathematik, Physik und Co.: Dort ist ein Ortsname meist Rechenkulisse
 * („Ein Zug fährt von Hamburg nach München"). Ein interkultureller Einschub wäre aufgesetzt.
 */
const GESELLSCHAFT = ['geschichte', 'erdkunde', 'politik', 'religion', 'werte-und-normen']

export function interkulturellGilt(subjectId: string): boolean {
  return Boolean(subjectById(subjectId).foreignLanguage) || GESELLSCHAFT.includes(subjectId)
}

/**
 * In welcher Sprache die Ortserklärung steht.
 *
 * Wunsch der Lehrkraft (24.09.2026): „je nach Jahrgang, Niveaustufe und Fach in Deutsch oder
 * der Fremdsprache". In den Gesellschaftswissenschaften ist die Unterrichtssprache Deutsch.
 * In den Fremdsprachen entscheidet der Stand: Bis A2 würde eine fremdsprachige Erklärung die
 * Hürde verdoppeln, die sie abbauen soll – dort steht sie deutsch. Ab B1 gehört sie in die
 * Zielsprache, sonst fällt man mitten im Text aus ihr heraus.
 */
export function erklaerSprache(meta: { subjectId: string; grade?: number; cefrLevel?: string }): string {
  if (!subjectById(meta.subjectId).foreignLanguage) return 'auf Deutsch'
  const stufe = (meta.cefrLevel ?? '').toUpperCase()
  const frueh = stufe.startsWith('A') || stufe.startsWith('PRE') || (meta.grade ?? 0) <= 7
  return frueh
    ? 'auf DEUTSCH – auf diesem Stand wäre eine fremdsprachige Erklärung eine zweite Hürde statt einer Hilfe'
    : 'in der ZIELSPRACHE, in einfachen Worten'
}

/**
 * Regeln für die KI. Leer, wenn das Fach nicht dazugehört – dann steht auch nichts im Prompt.
 *
 * Nimmt bewusst nur die beiden Angaben, auf die es ankommt, statt eines ganzen Blatt-Metas:
 * So können auch die Lernzielkontrolle und die Klassenarbeit dieselbe Regel benutzen, obwohl
 * sie ihre Angaben anders nennen (dort heißt das Vorwissen „Stoff der letzten Stunden").
 */
export function interkulturellRegeln(meta: { subjectId: string; priorKnowledge?: string; grade?: number; cefrLevel?: string }): string {
  if (!interkulturellGilt(meta.subjectId)) return ''
  const vorwissen = (meta.priorKnowledge ?? '').trim()
  const sprache = erklaerSprache(meta)
  return [
    'ORTE UND INTERKULTURELLE ASPEKTE:',
    /*
     * Der Auslöser ist eng gefasst. „Jeder genannte Ort" hätte auch dort Bezüge erzeugt, wo
     * der Ort bloße Kulisse ist – das wirkt aufgesetzt und kostet Bearbeitungszeit.
     */
    '- Spielt die Aufgabe an einem konkreten Ort (Land, Stadt, Region) und TRÄGT dieser Ort den Inhalt – als Thema, Material oder Situierung –, dann baue einen interkulturellen Aspekt ein. Ist der Ort nur Kulisse (z. B. Start- und Zielort einer Rechenaufgabe), lass es.',
    '- Passend ist je nach Aufgabe: einen Perspektivwechsel oder Vergleich mit der eigenen Lebenswelt verlangen; sprachliches Handeln in einer Begegnungssituation (Anrede, Höflichkeit, Register, mögliche Missverständnisse); eine vorhandene Vorstellung am Material überprüfen; oder konkretes landeskundliches Wissen, das die Aufgabe selbst mitliefert.',
    '- Der Aspekt ist Teil der Aufgabe, kein Anhängsel: Er verändert, was zu tun ist, und wird mitbewertet – nicht „Schreibe außerdem etwas über die Kultur".',
    '',
    'NUR MIT AUSGEWIESENEM VORWISSEN:',
    vorwissen
      ? `- Als bekannt darfst du ausschließlich voraussetzen, was hier steht: „${vorwissen}". Alles Weitere liefert das Blatt selbst.`
      : '- Es ist KEIN Vorwissen angegeben. Setze deshalb kein landeskundliches Wissen voraus – auch nichts scheinbar Selbstverständliches über das Land, seine Geschichte, Feste, Institutionen oder Gepflogenheiten.',
    /*
     * Der eigentliche Wunsch: einweben statt anbauen. Ein zusätzlicher Infokasten macht das
     * Blatt länger; die Angaben, die eine Schreibaufgabe ohnehin mitbringt, stehen schon da.
     */
    '- Was die Lernenden dafür wissen müssen, WEBST du in das ein, was ohnehin auf dem Blatt steht: in die Notizen und Inhaltspunkte einer Schreibaufgabe, in den Materialtext, in die Situierung, in die Beispiele. Füge dafür KEINEN zusätzlichen Infokasten hinzu.',
    '- Eine Frage, die sich ohne dieses Wissen nicht beantworten lässt, ist unfair – in einer Klassenarbeit verzerrt sie die Note. Prüfe jede Teilaufgabe daraufhin.',
    '',
    'ORTSNAMEN KURZ ERKLÄREN:',
    /*
     * Wunsch der Lehrkraft (24.09.2026): „gib den Schülern eine kurze Erklärung […], worum
     * es sich handelt (z. B. „Marina Bay walking tour" sollte Marina Bay erklärt sein)."
     *
     * Ein Eigenname, den niemand einordnen kann, ist eine stille Hürde: Die Aufgabe ist
     * lösbar, aber man weiß nicht, wovon die Rede ist – und traut sich nicht zu fragen.
     */
    '- Jeder Orts- oder Eigenname, den die Lernenden nicht sicher kennen, bekommt beim ERSTEN Vorkommen eine kurze Erklärung in Klammern: was es ist und wo. Beispiel: „a Marina Bay walking tour (Marina Bay – the modern waterfront district of Singapore)".',
    '- Höchstens ein knapper Satz oder Halbsatz. Die Erklärung soll die Aufgabe tragen, nicht sie zum Lesetext machen.',
    `- Die Erklärung steht ${sprache}.`,
    '- Nicht erklärt werden Namen, die im ausgewiesenen Vorwissen stehen oder die das Blatt selbst schon erklärt hat.',
    '',
    'KEINE KLISCHEES:',
    '- Schreibe nichts über „die" Menschen eines Landes und keine typisierenden Eigenschaften.',
    '- Essen, Kleidung und Feste nur, wenn sie zur Aufgabe gehören – nicht als Ersatz für Inhalt.',
    '- Zeige Vielfalt INNERHALB des Ortes (verschiedene Menschen, Sichtweisen, Lebenslagen) statt eines einheitlichen Bildes.'
  ].join('\n')
}
