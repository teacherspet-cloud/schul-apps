/**
 * „Verstehend zuhören" im Fach Deutsch.
 *
 * Deutsch ist neben Musik das einzige Fach außerhalb der Fremdsprachen mit einem EIGENEN
 * Hör-Kompetenzbereich. Belegt in den KMK-Bildungsstandards Deutsch ESA/MSA (23.06.2022),
 * Kernbereich „Verstehend zuhören" – dort ausdrücklich mit „Hörtexten":
 *
 *   „erfassen dem Lernstand entsprechende (komplexere) Hörtexte, Gesprächsphasen oder
 *    Gespräche (z. B. zentrale Aussagen sowie Sprech- und Gesprächsabsichten)"
 *   „zeigen Aufmerksamkeit für paraverbale (z. B. Stimmführung) und nonverbale Äußerungen"
 *   „wählen aus einem Repertoire kognitiver und metakognitiver Strategien aus, die sie VOR,
 *    WÄHREND UND NACH DEM ZUHÖREN einsetzen … Informationen sichern und zusammenfassen:
 *    Notizen, Protokoll."
 *
 * „Zuhören" ist außerdem eine getestete Domäne in VERA-8 (IQB).
 *
 * ZWEI BAUFORMEN – Entscheidung der Lehrkraft (22.09.2026: beide anbieten):
 *
 * MÜNDLICH ist die einzige Form, die in den Standards als Aufgabenbeispiel vorkommt
 * (KMK Deutsch MSA 2003, Kap. 4.3): „Vortrag im Anschluss an eine Hörverstehensaufgabe:
 * Zuhören – Mitschrift/Stichwörter – Zusammenfassung – Vortrag". Sie prüft das Zuhören in
 * seinem eigenen Zusammenhang, verlangt aber eine mündliche Leistungssituation.
 *
 * SCHRIFTLICH ist in den Deutsch-Standards NICHT als Format festgelegt – anders als in den
 * Fremdsprachen, wo geschlossene Formate ausdrücklich vorgesehen sind. Für eine
 * Klassenarbeit braucht es die Form trotzdem; sie ist deshalb erlaubt, aber als das
 * gekennzeichnet, was sie ist: eine Übertragung aus der Fremdsprachendidaktik.
 *
 * UNTERSCHIED ZUR FREMDSPRACHE, der in die Aufgaben gehört: Deutsch-Zuhören ist stark
 * gesprächsbezogen und bezieht para- und nonverbale Signale ein (Stimmführung, Sprechabsicht).
 * Danach wird in einer Fremdsprachen-Hörverstehensaufgabe nie gefragt.
 */
export type ZuhoerenMode = 'muendlich' | 'schriftlich'

export const ZUHOEREN_MODES: { value: ZuhoerenMode; label: string; description: string }[] = [
  {
    value: 'muendlich',
    label: 'Zuhören – Mitschrift – Zusammenfassung – Vortrag',
    description: 'Die in den Bildungsstandards belegte Form (KMK Deutsch 2003). Endet mit einem mündlichen Vortrag, nicht mit angekreuzten Fragen.'
  },
  {
    value: 'schriftlich',
    label: 'Schriftliche Fragen zum Hörtext',
    description: 'Fragen wie beim Hörverstehen in den Fremdsprachen. Praktisch für Klassenarbeiten, in den Deutsch-Standards so aber nicht vorgesehen.'
  }
]

/** Hat das Blatt den Schwerpunkt „Zuhören" im Fach Deutsch? */
export const istDeutschZuhoeren = (meta: { subjectId: string; skillFocus?: string }): boolean => meta.subjectId === 'deutsch' && meta.skillFocus === 'listening'

/**
 * Regelteil für den KI-Auftrag.
 *
 * Die para- und nonverbale Ebene steht bewusst in BEIDEN Bauformen: Sie ist der Kern dessen,
 * was die Deutsch-Standards unter Zuhören verstehen, und geht sonst unter, weil die
 * Fremdsprachenformate sie nicht kennen.
 */
export function zuhoerenRules(meta: { subjectId: string; skillFocus?: string; listeningMode?: ZuhoerenMode }): string {
  if (!istDeutschZuhoeren(meta)) return ''
  const gemeinsam = [
    'SCHWERPUNKT ZUHÖREN (Deutsch):',
    '- Grundlage ist der Kernbereich „Verstehend zuhören" der KMK-Bildungsstandards Deutsch. Geprüft wird das Hören selbst: Der Text wird zweimal gehört, das Skript liegt der Klasse nicht vor.',
    '- Mindestens eine Aufgabe fragt nach der SPRECHWEISE, nicht nur nach dem Inhalt: Stimmführung, Betonung, Sprechabsicht, Haltung der Sprechenden. Das ist der Unterschied zum Hörverstehen in den Fremdsprachen.',
    '- Eine Aufgabe betrifft das Vorgehen beim Zuhören selbst (vor dem Hören: Erwartung klären; während: Notizen; danach: ordnen).'
  ]
  if (meta.listeningMode === 'schriftlich') {
    return [
      ...gemeinsam,
      '- Bauform: schriftliche Fragen zum Hörtext, in der Reihenfolge des Textes und während des Hörens lösbar.',
      '- Die Fragen sind auf Deutsch und einfacher formuliert als der Hörtext.'
    ].join('\n')
  }
  return [
    ...gemeinsam,
    '- Bauform in GENAU dieser Reihenfolge (KMK Deutsch 2003, Aufgabenbeispiel): (1) Zuhören mit einem Beobachtungsauftrag, (2) Mitschrift in Stichwörtern – dafür ein vorstrukturiertes Notizfeld, (3) schriftliche Zusammenfassung aus den Notizen, (4) mündlicher Kurzvortrag.',
    '- Für die Mitschrift gehört ein VORSTRUKTURIERTES Feld aufs Blatt (Tabelle oder Mindmap mit benannten Rubriken), keine leeren Linien – die Struktur ist die eigentliche Hilfe.',
    '- Die letzte Aufgabe ist der Vortrag; sie bekommt keine Schreiblinien, sondern Hinweise, worauf beim Vortragen zu achten ist.'
  ].join('\n')
}
