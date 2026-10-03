import { stufenRaster } from '../../../../shared/verstehen/regeln'
import type { LearnerProfile } from '../../didactics/profile'
import type { WorksheetMeta } from '../../model/types'
import { GEZAEHLTE_SEITEN, seitenBereich, seitenVorgabe } from '../../didactics/seiten'
import { subjectById } from '../../model/subjects'
import { vorwissenRegeln } from '../../didactics/vorwissen/vorwissen'
import { comprehensionFormatById, ComprehensionSkill, defaultComprehensionFormats } from '../../didactics/comprehensionFormats'
import { sheetTypePrompt, wantedTasks } from './grundregeln'

/**
 * Aufgabenformate für Hör- und Leseverstehen.
 *
 * Belegt aus den KMK-Bildungsstandards (MSA 2003, Abitur 2012), dem Kernlehrplan Englisch NRW
 * mit den Empfehlungen der Fachaufsicht und dem Kerncurriculum Englisch Niedersachsen.
 */
export function comprehensionRules(meta: WorksheetMeta): string {
  const skill: ComprehensionSkill | null = meta.skillFocus === 'listening' ? 'listening' : meta.skillFocus === 'reading' ? 'reading' : null
  if (!skill) return ''
  const chosen = (meta.comprehensionFormats?.length ? meta.comprehensionFormats : defaultComprehensionFormats(skill, meta.grade))
    .map(comprehensionFormatById)
    .filter((f): f is NonNullable<typeof f> => Boolean(f))
  if (!chosen.length) return ''
  return [
    /*
     * „Benutze genau diese" war zu schwach: Bei mehreren gewählten Formaten nahm die KI
     * einzelne heraus, und ein ausdrücklich bestelltes Format fehlte auf dem Blatt. Deshalb
     * steht jetzt dabei, dass JEDES gewählte Format vorkommen muss – und bei genau einem
     * Format, dass es das einzige ist.
     */
    `AUFGABENFORMATE (${skill === 'listening' ? 'Hör-/Sehverstehen' : 'Leseverstehen'}):`,
    // Wunsch der Lehrkraft (02.10.2026): nur die gewählten Formate zum vorgegebenen Hör-/Sehtext, sonst nichts
    meta.nurGewaehlteFormate ? '- NUR diese Formate: Außer den Verstehensaufgaben in diesen Formaten entsteht keine weitere Aufgabe.' : '',
    chosen.length === 1
      ? `- Benutze AUSSCHLIESSLICH dieses eine Format. Kein anderes Antwortformat kommt vor.`
      : wantedTasks(meta) === 1
        ? `- Wähle EINES dieser ${chosen.length} Formate – die Lehrkraft hat nur eine Aufgabe bestellt.`
        : `- JEDES dieser ${chosen.length} Formate kommt mindestens einmal vor; andere Formate sind nicht erlaubt.`,
    // `stem` nennt den Wortlaut der Frage – ohne ihn schrieb die KI zu jedem Format denselben Satz
    ...chosen.map((f) => `- ${f.label} (answer.kind = "${f.answerKind}"): ${f.purpose}. ${f.construction} ${f.stem} Punkte: ${f.scoring}.`),
    '',
    /*
     * Anforderungsbereiche bei Hör- und Leseverstehen.
     *
     * Recherche in den amtlichen Quellen (KMK, IQB, NRW, Hamburg, Bayern, Brandenburg, SH):
     * Eine Zuordnung „Format → Anforderungsbereich" gibt es NICHT und wäre sachlich falsch.
     * Der Bereich ergibt sich aus der verlangten Denkleistung – KMK 2012: die Zuordnung ist
     * „vom Kontext der Aufgabenstellung … abhängig"; abitur.nrw: „Grundsätzlich können sich
     * alle Operatoren auf alle drei Anforderungsbereiche beziehen."
     *
     * Belegt ist dagegen die OBERGRENZE: Für rezeptive Prüfungsteile gilt durchgängig I–II
     * (IQB: „schwerpunktmäßig Anforderungsbereich I, vereinzelt Anforderungsbereich II";
     * Hamburg: „Leistungen in den Anforderungsbereichen I und II"). Bereich III wird über
     * die produktiven Teile eingelöst; begründungspflichtige Formate sind im Hörverstehen
     * testtheoretisch sogar ausgeschlossen (NRW).
     */
    'ANFORDERUNGSBEREICHE (Hör-/Leseverstehen):',
    '- Nur AFB I und AFB II. KEINE Verstehensaufgabe bekommt AFB III – Bewerten und Gestalten gehören zu den produktiven Aufgaben, nicht zum Verstehen.',
    '- Der Bereich hängt an der Denkleistung, NICHT am Antwortformat: Eine Ankreuzaufgabe ist AFB I, wenn die Antwort ausdrücklich im Text steht, und AFB II, wenn sie erst erschlossen werden muss (Haltung, Absicht, Ursache, Folge).',
    '- Eine offene Frage nach einer ausdrücklich genannten Einzelheit bleibt AFB I; das Format hebt sie nicht.',
    '',
    'REGELN FÜR ALLE VERSTEHENSAUFGABEN:',
    // Die Zahl gilt JE Text: Bei zwei Hörtexten bekommt jeder so viele Fragen.
    meta.itemCount && meta.itemCount > 0 ? `- GENAU ${Math.round(meta.itemCount)} Items je Text – die Lehrkraft hat diese Zahl vorgegeben.` : '',
    '- Die Items folgen der Reihenfolge des Textes und verteilen sich über den ganzen Text.',
    // 29.09.2026 (Entscheidung der Lehrkraft): Wortgleichheit ist kein Fehler, sondern Stufe 1 – das Raster steuert die Schwierigkeit
    stufenRaster(),
    '- Mische die Stufen: überwiegend Stufe 2–4; Stufe 1 (1:1 aus dem Text) höchstens für ein Viertel der Items, in Übungen für den Einstieg.',
    '- Jede Antwort steht wörtlich oder sinngemäß im Text; nichts ist aus Vorwissen allein lösbar.',
    '- Bewertet wird nur, ob die Lösung das richtige Verständnis nachweist; sprachliche Verstöße und Rechtschreibung zählen nicht.',
    wantedTasks(meta) === 1 ? '' : '- Mische ein geschlossenes und ein halboffenes Format; zum Ende der Sekundarstufe I überwiegen die offeneren Formate.',
    skill === 'listening'
      ? '- Vor dem Hören bekommen die Lernenden Zeit, die Aufgaben zu lesen; der Text wird zweimal gehört.'
      : '- Der Lesetext trägt Zeilennummern, damit Textbelege angegeben werden können.'
  ].join('\n')
}

/**
 * Wie eine Reihe von Ankreuzfragen formuliert wird.
 *
 * Gemeldet wurde: „Die Multiple-Choice-Antworten werden alle formuliert mit **Tick** …" –
 * bei vier Fragen stand der Operator viermal da, obwohl er schon in der Arbeitsanweisung
 * steht. Er gehört dort genau einmal hin; daneben zeigt ein angekreuztes Kästchen, was zu
 * tun ist. Die einzelnen Punkte sind dann das, was sie sein sollen: FRAGEN.
 *
 * Das ist keine Geschmacksfrage. Eine Anweisung, die sich wortgleich wiederholt, wird nicht
 * mehr gelesen – und wer „Tick" liest, wo eine Frage stehen sollte, sucht die Frage.
 */
export const mcItemRules = [
  'AUFBAU EINER REIHE VON ANKREUZFRAGEN (answer.kind = "multipleChoice" in parts):',
  '- Der Operator („Tick", „Choose", „Kreuze an") steht EINMAL in der Arbeitsanweisung der Aufgabe (instruction), niemals in den einzelnen Teilaufgaben.',
  '- Jede Teilaufgabe ist eine vollständige FRAGE mit Fragezeichen, z. B. „Where does Ruby go after school?" – kein „Tick …", kein „Choose …", keine Wiederholung der Anweisung.',
  '- Die Frage steht ohne Nummer und ohne Buchstaben davor; die Zählung vergibt das Arbeitsblatt.',
  '- Die Antwortmöglichkeiten sind kurz (höchstens fünf Wörter) und stehen ohne „a)", „b)" – auch diese Marken setzt das Arbeitsblatt.',
  '- Alle Möglichkeiten einer Frage sind gleich gebaut und gleich lang; die falschen sind plausibel, nicht abwegig.'
].join('\n')

/**
 * Wortlaut der EINZELNEN Fragen bei Hör- und Leseverstehen.
 *
 * Bis hierher sagte der Auftrag, WELCHE Formate vorkommen und WIE VIELE Items – aber nichts
 * darüber, wie der Satz lauten soll, den die Lernenden lesen. Das ist der Satz, an dem sich
 * entscheidet, ob Verstehen geprüft wird oder Wortgleichheit.
 *
 * Belegt aus den amtlichen Vorgaben (Fundstellen in `didactics/itemWording.ts`):
 * - QUA-LiS/MSB NRW (27.10.2025, S. 13–14): Items „sind so formuliert, dass ihr Sprachniveau
 *   nicht das Sprachniveau des Hörtextes übersteigt"; sie „vermeiden Verneinungen"; sie sind
 *   „ohne Einschränkungs- und Ausschließlichkeitspartikel"; sie „sind voneinander
 *   unabhängig"; sie „sind nicht allein durch Weltwissen zu lösen"; der Wortlaut des
 *   Originaltexts wird weder im Attraktor noch in den Distraktoren wiederholt.
 * - KMK 2012: „Das sprachliche Anforderungsniveau der einzelnen Items liegt jeweils
 *   unterhalb des Anforderungsniveaus der Hörtexte."
 * - ALTE/Council of Europe (2011): keine wörtliche Übernahme; Antworttyp und Höchstlänge
 *   müssen angegeben sein; Items dürfen nicht voneinander abhängen.
 * - Rodriguez (2005), Metaanalyse über 80 Jahre: drei Antwortmöglichkeiten genügen.
 *
 * Ausdrücklich NICHT belegt und deshalb nicht als Regel formuliert: eine Rangfolge der
 * Fragewörter (who/what vor why/how). Dazu gibt es in den geprüften Quellen nichts; die
 * belegte Abstufung läuft über den Verarbeitungsgrad (explizit genannt vs. erschlossen).
 */
export function itemWordingRules(meta: WorksheetMeta): string {
  const skill = meta.skillFocus === 'listening' ? 'listening' : meta.skillFocus === 'reading' ? 'reading' : null
  if (!skill) return ''
  return [
    'WORTLAUT DER EINZELNEN FRAGEN (verbindlich):',
    '- Die Frage ist sprachlich EINFACHER als der Text: nur Wortschatz und Strukturen auf dem Niveau des Textes oder darunter. Defizite im Lesen dürfen das Verstehen nicht verdecken.',
    '- Jede Frage ist kurz – höchstens etwa 20 Wörter. Die Leseleistung der Frage darf nicht schwerer wiegen als das Verstehen selbst.',
    '- Weder die Frage noch eine Antwortmöglichkeit wiederholt den Wortlaut des Textes. Paraphrasiere, aber nur mit Wortschatz, den die Lerngruppe kennt.',
    '- Die richtige Möglichkeit wiederholt kein Schlüsselwort aus der Frage.',
    '- Keine Frage ist allein aus Welt-, Fach- oder Kulturwissen lösbar; ohne den Text darf keine Antwort sicher sein.',
    '- Die Fragen sind voneinander unabhängig: Keine Frage verrät die Lösung einer anderen oder setzt sie voraus.',
    '- Positiv formulieren. Keine Verneinung in der Frage und keine doppelte Verneinung aus Frage und Möglichkeit.',
    '- Keine Ausschließlichkeitswörter (immer, nie, nur, alle, ausschließlich, weniger) – weder in der Frage noch in den Möglichkeiten.',
    '- Genau EINE Frage je Item. Keine zweiteiligen Fragen („… und warum?"), keine Kombinationsmöglichkeiten („a und c"), kein „alles davon" / „nichts davon".',
    '- Alle Bezüge stehen in der Frage selbst. Keine Pronomen, deren Bezug erst aus dem Text oder aus einer anderen Frage hervorgeht.',
    '- Die Frage ist ohne die Antwortmöglichkeiten verständlich und löst eine Antworterwartung aus.',
    '- Satzergänzung nur, wenn die Lücke am SATZENDE steht und alle Möglichkeiten grammatisch anschließen; sonst die Frageform.',
    '- Die Antwortmöglichkeiten sind gleich gebaut, ähnlich lang und ähnlich komplex; drei plausible Möglichkeiten genügen.',
    '- Genau eine Möglichkeit ist eindeutig richtig; die falschen sind plausibel. Die Stelle der richtigen Antwort wechselt.',
    '- Bei halboffenen Formaten stehen Antworttyp und Höchstlänge in der Aufgabe („Nenne zwei Beispiele.", „using 1 to 5 words").',
    skill === 'listening'
      ? '- Die Fragen folgen der Reihenfolge des Hörtextes, verteilen sich gleichmäßig über ihn und sind schon beim ERSTEN Hören lesbar und lösbar; je Hörtext wird nur ein Hörstil geprüft.'
      : '- Die Fragen folgen der Reihenfolge des Textes und verteilen sich über den ganzen Text.',
    /*
     * Richtig/Falsch im Leseverstehen NUR mit Textbeleg.
     *
     * Belegt: MSB/QUA-LiS NRW, Unterrichtsvorgaben ZP10 Englisch 2027, Abschnitt 1.5 nennt
     * als Leseverstehensformat „Richtig-/Falsch-Aufgaben MIT BEGRÜNDUNG" – MSA, Gymnasium
     * und EESA gleichermaßen. KMK 2012 setzt in der illustrierenden Prüfungsaufgabe
     * Französisch unter jedes Item „Citez le passage qui justifie votre réponse". DELF
     * verlangt die justification auf allen Niveaus ab A2.
     *
     * Der Beleg ist ein ZITAT, keine Zeilenangabe: QUA-LiS NRW, ZP10-FAQ – „Eine
     * Zeilenangabe als Beleg ist nicht vorgesehen … Zeilenangaben geben keine Punkte."
     *
     * Beim HÖREN gilt das nicht: Dort ist der Text flüchtig, ein Zitat wäre Gedächtnis-
     * leistung – NRW schließt Begründungsformate für die Hörverstehensmessung sogar aus.
     */
    skill === 'reading'
      ? [
          '- Richtig/Falsch-Aufgaben NUR mit Textbeleg: Zu jeder Aussage gehört ein kurzes WÖRTLICHES Zitat aus dem Text, das die Entscheidung stützt. Auslassungen werden mit […] gekennzeichnet.',
          '- Eine bloße Zeilenangabe ist KEIN Beleg – verlange immer den Wortlaut.',
          '- Punkte gibt es nur für die richtige Kombination aus Ankreuzen UND zutreffendem Zitat; für eines von beiden gibt es nichts.',
          '- Ausnahme: Items, deren Lösung „nicht im Text" lautet. Zu ihnen kann es kein Zitat geben; sie bekommen die vollen Punkte allein für das Ankreuzen.'
        ].join('\n')
      : '',
    meta.instructionsInGerman
      ? '- Die Fragen stehen auf Deutsch, weil die Lehrkraft das so gewählt hat.'
      : '- Die Fragen stehen in der Zielsprache. Ein unvermeidbar unbekanntes Wort wird als Fußnote übersetzt, statt die Sprache zu wechseln.'
  ]
    .filter(Boolean)
    .join('\n')
}

/** Sprachmittlung und Schreiben bestehen aus dem Ausgangstext und genau einer Aufgabe. */
export function singleTaskFocus(meta: WorksheetMeta): boolean {
  if (!subjectById(meta.subjectId).foreignLanguage) return false
  return meta.skillFocus === 'mediation' || meta.skillFocus === 'writing'
}

/** Beschreibung des Auftrags (Thema, Art, Umfang) für Gliederung und Ausformulierung. */
export function taskContext(meta: WorksheetMeta, profile: LearnerProfile): string {
  const seiten = seitenBereich(meta)
  const vorgabe = seitenVorgabe(meta)
  const tasksMin = profile.tasks.perPage[0] * seiten.min
  const tasksMax = profile.tasks.perPage[1] * seiten.max
  /*
   * Ohne Seitenvorgabe (Paket 7, Wunsch der Lehrkraft) wählt die KI die Seitenzahl selbst; die
   * geschätzte Zahl steht nur als Anhaltspunkt dabei. Mit Vorgabe bleibt es beim Richtwert.
   */
  // Gezählt werden nur Aufgaben- und Materialseiten – Hilfekarten, Lösungen, Tafelbild usw. nicht (Paket 7)
  const umfang = !vorgabe
    ? `Seitenzahl nicht vorgegeben – wähle sie selbst passend zu Jahrgang, Bearbeitungszeit und Aufgaben (Anhaltspunkt: etwa ${seiten.min} DIN-A4-Seite(n) mit Aufgaben und Material)`
    : vorgabe.max > vorgabe.min
      ? `zwischen ${vorgabe.min} und ${vorgabe.max} DIN-A4-Seiten, nach Bedarf des Materials (gezählt nur ${GEZAEHLTE_SEITEN})`
      : `RICHTWERT ${vorgabe.min} DIN-A4-Seite(n) (gezählt nur ${GEZAEHLTE_SEITEN})`
  // Sprachmittlung und Schreiben füllen das Blatt mit einer einzigen Aufgabe
  const single = singleTaskFocus(meta)
  return [
    `Thema: ${meta.topic}`,
    meta.learningGoals ? `Vorgegebene Lernziele: ${meta.learningGoals}` : '',
    /*
     * Vorwissen nach Wirkung getrennt: voraussetzen, Fehlvorstellungen aufgreifen, nicht
     * voraussetzen (didactics/vorwissen). In einer Lernkontrolle – so baut auch die
     * Klassenarbeit ihr Blatt – steht hier der geprüfte Stoff; dort gibt es keinen
     * Aktivierungseinstieg, also bleibt es bei der schlichten Angabe.
     */
    meta.priorKnowledge ? (meta.sheetType === 'lernkontrolle' ? `Vorwissen der Lerngruppe: ${meta.priorKnowledge}` : vorwissenRegeln(meta.priorKnowledge)) : '',
    `Art des Arbeitsblatts: ${sheetTypePrompt(meta.sheetType)}`,
    single
      ? `Umfang: ${umfang} mit GENAU EINER Aufgabe, Bearbeitungszeit ca. ${meta.minutes} Minuten. Der Platz gehört dem Ausgangstext und den Schreiblinien, nicht weiteren Aufgaben.`
      : `Umfang: ${umfang}, insgesamt ${tasksMin}–${tasksMax} Aufgaben (${tasksMax} ist die Obergrenze der Aufgabenzahl, nicht das Ziel), Bearbeitungszeit ca. ${meta.minutes} Minuten.`,
    meta.socialForms.length ? `Bevorzugte Sozialformen: ${meta.socialForms.join(', ')}.` : '',
    /*
     * Zeichenflächen (26.09.2026): Wo gezeichnet oder eingetragen wird, gehört eine Fläche mit
     * Achsen hin – keine Rechenkästchen, keine Linien. Die Achsen müssen die erwarteten Werte
     * fassen; sonst zeichnen die Lernenden an den Rand.
     */
    'ZEICHENFLÄCHEN: Soll etwas gezeichnet oder eingetragen werden (Graph, Messreihe, Schrägbild, Zeitleiste, Spannungs- oder Verlaufskurve), ist answer.kind = "diagram" mit passendem diagram.kind (koordinaten | mm | klima | schraegbild | spannung | zeitleiste) und vollständigen Achsen: Beschriftung mit Einheit, Bereich und Schrittweite so gewählt, dass alle erwarteten Werte hineinpassen. Zeitleiste: from/to/step in der Einheit (day | month | year); Stufen wie Eskalation in timeline.yLevels von unten nach oben; Ereignisse nur in timeline.events, wenn sie VORGEGEBEN sein sollen; parallele Stränge in timeline.strands; sehr lange Zeiträume als sections mit eigener Skala. Verlaufskurve: Schritte in xCategories, Stufen in yLevels. Nie Rechenkästchen oder Linien für eine Zeichnung.',
    /*
     * Ein Auftrag je Zeichenfläche, keine Dopplung zwischen Aufgaben (03.10.2026, Befund der
     * Lehrkraft: „Ordne … auf der Zeitleiste und erkläre anhand ihrer Abfolge …" – die nächste Aufgabe
     * verlangte fast dasselbe, und auf der Zeitleiste fehlte der Platz für die Erklärung)
     */
    'EIN AUFTRAG JE ANTWORTFORM: Eine Aufgabe mit Zeichenfläche verlangt NUR das Zeichnen, Eintragen, Ordnen oder Beschriften – kein angehängtes „und erkläre/begründe/beschreibe …", denn dafür gibt es dort keinen Platz. Braucht es die Erklärung, ist sie eine EIGENE Aufgabe mit Schreiblinien.',
    'KEINE DOPPLUNG: Jede Aufgabe verlangt einen eigenen Denkschritt (Progression vom Wiedergeben über das Erklären zum Beurteilen). Was eine Aufgabe verlangt, verlangt keine andere noch einmal mit anderen Worten – prüfe die Aufgaben vor der Ausgabe paarweise und streiche oder ändere die Wiederholung.'
  ]
    .filter(Boolean)
    .join('\n')
}
