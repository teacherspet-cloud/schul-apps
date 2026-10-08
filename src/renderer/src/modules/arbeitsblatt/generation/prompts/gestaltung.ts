import type { WorksheetMeta } from '../../model/types'
import { bilingualAktiv, operatorenFuer } from '../../didactics/bilingual'
import { subjectOperators } from '../../didactics/subjectOperators'
import { operatorenAuswahl } from '@shared/operatoren/zugriff'
import { imageDesignRules } from '../../didactics/imageDesign'
import { wantedTasks } from './grundregeln'
import { schreibRegelFuerMeta, schreibraumRichtwerte } from '../../didactics/schreibraum'
import { wortspeicherRegel } from '../../didactics/language'

// ---------- Bilder, Lernpsychologie, Fachmethoden ----------

/**
 * Wie viele Bilder ein Blatt bekommt und wofür sie da sind.
 *
 * Die inhaltlichen Regeln stehen in didactics/imageDesign.ts, zusammen mit den Belegen.
 * Hier bleibt nur, was die Platzierung im Blatt betrifft (imageRole).
 */
export function imageRules(meta: WorksheetMeta): string {
  return [
    imageDesignRules(meta),
    '',
    /*
     * Seitliche Anordnung. Sie spart echten Platz: Neben einem Bild oder einer Tabelle
     * stehen Aufgabe und Schreiblinien, darunter laufen sie in voller Breite weiter.
     */
    'ANORDNUNG – setze sie in blockSide (gilt für Bilder UND Tabellen):',
    '- "left" oder "right": Der Baustein steht seitlich, der FOLGENDE Baustein (Aufgabe, Text, Merkkasten) steht daneben und läuft darunter in voller Breite weiter. Sinnvoll bei einem Bild oder einer Tabelle, auf die sich die Aufgabe bezieht – besonders neben Schreiblinien.',
    '- "none": untereinander. Richtig für breite Tabellen (ab vier Spalten), Bildreihen und alles, was ausgewertet wird und Fläche braucht.',
    '- "auto": Die App entscheidet. Im Zweifel "auto".',
    '',
    'PLATZ AUF DEM BLATT – setze ihn in imageRole:',
    '- "material": Bild, mit dem gearbeitet wird. Steht als eigener Baustein VOR den zugehörigen Aufgaben.',
    '- "illustration": Verständnisbild zu einem Text oder einer Aufgabe. Steht direkt VOR dem Baustein, zu dem es gehört; die App setzt es daneben, der Text fließt darum.',
    '- "motivation": kleines Bild am Einstieg.',
    '- Bildreihen (imageItems) für mehrere Motive zum Zuordnen, Benennen oder Ordnen.',
    '',
    'SEITENFORMAT – setze es in pageFormat (Hoch- und Querformat je Seite):',
    '- "landscape" am ersten Baustein eines Abschnitts, der quer besser lesbar ist: Zeitleiste mit vielen Daten, Abschnitten oder Strängen; sehr breites Bild, Gemälde, Panorama; Karte im Querformat; Tabelle ab sechs Spalten; Diagramm mit langer x-Achse. Die zugehörige Aufgabe steht im selben Abschnitt (auf derselben Querseite).',
    '- "portrait" am ersten Baustein danach, der wieder hoch stehen soll: längere Texte, hohe Bilder, Schreibaufgaben mit vielen Linien.',
    '- Sonst "same". Jeder Wechsel beginnt eine neue Seite – Querabschnitte sparsam und nur, wo der Inhalt sie braucht; nie für reinen Fließtext. Auf einer Querseite stehen kurzes Material und Aufgabe gut nebeneinander (blockSide "left"/"right").',
    '',
    'DRUCK UND LESBARKEIT:',
    '- Das Blatt wird in Graustufen vervielfältigt: Farbe darf nie der einzige Träger einer Unterscheidung sein. Wo Farbe unterscheidet, kommt ein zweites Merkmal dazu (Form, Schraffur, Beschriftung, Linienart).',
    '- Stelle nie Rot gegen Grün.',
    '- Schreibe keinen Text über ein Bild oder einen Farbverlauf.'
  ].join('\n')
}

/**
 * Lernwirksame Gestaltung (Cognitive Load, gelöste Beispiele, Üben).
 * Die Regeln richten sich nach der Art des Arbeitsblatts.
 */
export function learningDesignRules(meta: WorksheetMeta): string {
  const practice = meta.sheetType === 'uebung' || meta.sheetType === 'wiederholung' || meta.sheetType === 'hausaufgabe'
  return [
    'LERNWIRKSAME GESTALTUNG:',
    '- Kurze Sinnabschnitte mit Zwischenüberschriften; je Abschnitt höchstens zwei fett hervorgehobene Begriffe.',
    '- Bild und zugehörige Erklärung stehen beieinander; derselbe Inhalt wird nicht doppelt in Text und Bild ausformuliert.',
    meta.sheetType === 'erarbeitung' || meta.sheetType === 'lesetext'
      ? '- Neues Verfahren: genau ein vollständig gelöstes Beispiel mit nummerierten Schritten voranstellen; danach die Hilfen verblassen lassen (erst Lückenlösung, dann Schrittgerüst, dann frei).'
      : '',
    practice
      ? '- Übung: Aufgabentypen mischen statt blockweise zu sortieren, etwa ein Drittel der Aufgaben wiederholt frühere Inhalte, und eine Aufgabe wird aus dem Gedächtnis ohne Hilfsmittel gelöst.'
      : '',
    '- Zu jeder Aufgabe eine realistische Minutenangabe; die Summe passt zur angegebenen Bearbeitungszeit.',
    '- Einstieg mit einer echten Frage, einem Widerspruch oder einem Alltagsphänomen, das zum Lernziel führt – keine Anekdote ohne Bezug.',
    '- Höchstens eine Wahlmöglichkeit je Blatt, dann mit drei bis fünf Optionen.',
    meta.grade <= 4
      ? '- Grundschule: konkrete Dinge und Handlungen, kurze Textmengen, viel Platz zum Schreiben und Malen.'
      : meta.grade <= 10
        ? '- Sekundarstufe I: Alltag und Lebenswelt der Jugendlichen aufgreifen; die erste Aufgabe schaffen alle.'
        : '- Oberstufe: gesellschaftliche Relevanz, Kontroversen, Studien- und Berufsbezug; fachliche Tiefe statt Verpackung.',
    // Schreibraum (02.10.2026): Befund der Lehrkraft „Antwortfelder viel zu klein" – count der Linien danach wählen
    `- Antwortflächen großzügig bemessen (answer.count der Schreiblinien, leere Zellen der Ausfülltabellen). ${schreibraumRichtwerte(schreibRegelFuerMeta(meta))}`
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Sprachliche Hilfen (sprachsensibler Fachunterricht nach Leisen, Wortspeicher – in Sprachfächern mit Artikel,
 * Satzanfänge zum Operator, Textsortengerüste, gestufter Abbau der Hilfen).
 */
export function scaffoldRules(meta: WorksheetMeta): string {
  return [
    'SPRACHLICHE HILFEN:',
    '- Fachwörter bei der ersten Nennung in einem kurzen Satz erklären und für denselben Sachverhalt durchgehend dasselbe Wort verwenden (keine Synonyme).',
    // Artikel und Plural nur in Sprachfächern und im sprachsensiblen/DaZ-Modus (08.10.2026, didactics/language.ts)
    wortspeicherRegel(meta),
    '- Zu Schreib- und Sprechaufgaben drei bis fünf Satzanfänge anbieten, die zum Operator passen (erklären: „Das liegt daran, dass …"; begründen: „Dafür spricht, dass …"; vergleichen: „Beide … haben gemeinsam, dass …").',
    '- Jeder Wortspeicher und jede Satzanfang-Hilfe (scaffold oder phrases) gehört zu EINER Aufgabe: Der Baustein steht DIREKT hinter dieser Aufgabe (oder direkt davor), der Titel oder der Hinweistext (phrases: body) nennt sie („Wortspeicher zu Aufgabe 2", „Für Aufgabe 2: …"). Eine Hilfe ohne erkennbaren Aufgabenbezug gehört nicht aufs Blatt.',
    '- Für Textsorten ein Gerüst vorgeben: Versuchsprotokoll (Frage, Vermutung, Material, Durchführung, Beobachtung, Ergebnis), Quelleninterpretation (Einordnung, Inhalt, Deutung, Bewertung), Erörterung (These, Argument, Beleg, Beispiel, Schluss).',
    '- Aktiv statt Passiv, Verben statt Nominalisierungen, keine doppelten Verneinungen, keine Redewendungen.',
    meta.differentiation.levels > 1
      ? '- Hilfen stufenweise abbauen: ★ vollständiges Satzmuster, ★★ nur Satzanfänge, ★★★ nur Wortspeicher oder freie Formulierung.'
      : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/** Fachtypische Arbeitsweisen mit Material (Quellenarbeit, Experiment, Textanalyse …). */
/** Operatorenliste des Fachs als Vorgabe (mit Anforderungsbereich, wo das Fach ihn festlegt). */
export function operatorRules(meta: WorksheetMeta, foreignLanguage?: string): string {
  const ops = subjectOperators(meta.subjectId, foreignLanguage)
  if (!ops) return ''
  const byAfb: Record<string, string[]> = { I: [], II: [], III: [], offen: [] }
  for (const [op, afb] of Object.entries(ops.afb)) if (!ops.zeigen || ops.zeigen.includes(op)) byAfb[afb ?? 'offen'].push(op)
  /*
   * Bilingual: Die Aufgaben stehen in der Arbeitssprache. Stünde hier die deutsche Liste mit
   * „genau einem Operator aus dieser Liste", widerspräche sie der bilingualen Regel – und die
   * KI entschiede selbst, welche von beiden gilt. Die belegte zielsprachliche Liste ersetzt
   * deshalb die deutsche; die AFB-Zuordnung bleibt dieselbe.
   */
  const bilingual = bilingualAktiv(meta) && meta.bilingual!.pruefsprache !== 'deutsch' ? operatorenFuer(meta.bilingual!.sprache) : null
  const lines = bilingual
    ? (['I', 'II', 'III'] as const).map(
        (a) =>
          `- Anforderungsbereich ${a}: ${bilingual
            .filter((o) => o.afb === a)
            .map((o) => `${o.ziel} (${o.de})`)
            .join(', ')}.`
      )
    : ops.targetLanguage || byAfb.offen.length
      ? [`- Zulässige Operatoren: ${byAfb.offen.join(', ')}.`]
      : (['I', 'II', 'III'] as const).map((a) => `- Anforderungsbereich ${a}: ${byAfb[a].join(', ')}.`)
  /*
   * Amtliche Liste des Landes (30.09.2026) – über dieselbe Auswahlfunktion wie Lernzielkontrolle
   * und Klassenarbeit. Nur eine Liste des Landes für genau diese Stufe; bilingual gilt die
   * zielsprachliche Liste oben.
   */
  const land = bilingual
    ? null
    : operatorenAuswahl({ stateId: meta.stateId, fach: meta.subjectId, stufe: meta.grade >= 11 ? 'sek2' : 'sek1', schulform: meta.schoolTypeId, nurLand: true })
  const landNamen = land && !land.stufeAbweichend ? [...new Set(land.operatoren.map((o) => o.operator))] : []
  return [
    `OPERATOREN (${meta.subjectLabel}):`,
    ...lines,
    landNamen.length ? `- Amtliche Operatorenliste des Landes (${land!.quelle}): ${landNamen.join(', ')}. Operatoren aus dieser Liste haben Vorrang.` : '',
    ops.note ? `- ${ops.note}` : '',
    bilingual && meta.bilingual!.pruefsprache === 'gemischt' ? '- Aufgaben auf Deutsch verwenden die deutsche Entsprechung in Klammern.' : '',
    `- Jede Aufgabe beginnt mit genau einem Operator aus ${landNamen.length ? 'diesen Listen' : 'dieser Liste'}; keine Umschreibungen wie „Beschäftige dich mit".`,
    '- Die Listen nennen die Operatoren im Infinitiv. In der Aufgabe steht der korrekt konjugierte Imperativ in der Satzstellung der Sprache: trennbare Verben mit der Vorsilbe am Satzende („Fassen Sie … zusammen", „Ordne … ein"), nie „Zusammenfassen Sie …"; in Fremdsprachen der Imperativ der Zielsprache („Summarise …", „Résumez …", „Resuma …", „Riassumete …", „Обобщите …").',
    '- Jede Aufgabe nennt das Material ausdrücklich (z. B. „anhand von M1", „mithilfe der Tabelle").',
    // Abstand Aufgabe–Material (08.10.2026, didactics/integrity.ts `aufgabenNaheAmMaterial`)
    '- NÄHE ZUM MATERIAL: Eine Aufgabe steht auf derselben Seite bzw. Doppelseite wie das Material, auf das sie sich bezieht – direkt hinter dem Material und den Aufgaben dazu. Eine (Schluss-)Aufgabe, die sich NUR auf ein frühes Material bezieht, steht direkt hinter diesem Material, nicht am Blattende hinter späterem Material. Ans Ende gehören nur Aufgaben, die mehrere Materialien oder die bisherigen Ergebnisse zusammenführen.',
    '- MATERIALNUMMERN VERGIBT DIE APP: Sie nummeriert Texte, Bilder, Tabellen und Raster in der Reihenfolge der Bausteine als M1, M2, M3 … Schreibe selbst KEINE Nummer in den Titel.',
    '- VERWEISE NUR ÜBER KENNUNGEN: Jeder Materialbaustein bekommt in „ref" eine Kurzkennung (z. B. "zeitleiste", "karte", "tabelle"); Aufgaben, Hilfen und Tabellenköpfe verweisen mit M{zeitleiste}, M{karte} – NIE mit einer selbst gezählten Nummer wie „M2". Die App ersetzt M{…} durch die richtige Nummer. Ein von der App eingesetzter Ausgangstext heißt M{quelle}.',
    '- Ein Einstiegsimpuls („Erinnere dich: …", eine Leitfrage) ist KEIN Material: nicht als Baustein „text", sondern als infoBox (variant „wissen") oder als erste Aufgabe.',
    '- Erwartungshorizont, Musterlösungen und Bewertungshinweise für die Lehrkraft stehen NIE als Baustein auf dem Blatt (kein infoBox, text oder table „Erwartungshorizont"): Lösungen gehören in solution bzw. brief.expected, Hinweise an die Lehrkraft in teacherNote. Das Schülerblatt zeigt sie nicht.',
    '- Vergleichsmaterial: Zählt das Material zwei Dinge/Personen auf, stehen die Merkmale NICHT in derselben Reihenfolge – sonst lässt sich der Vergleich durch Abgleichen der Position lösen, statt durch Vergleichen. Zahl und Auswahl der Merkmale dürfen sich ebenfalls unterscheiden.',
    '- Schwerpunkt im Anforderungsbereich II; Bereich I stärker gewichtet als Bereich III; alle drei Bereiche kommen vor.',
    // Beide Regeln setzen mehrere Aufgaben voraus – bei genau einer widersprächen sie der Vorgabe
    wantedTasks(meta) === 1
      ? ''
      : '- Die letzte oder vorletzte Aufgabe sichert das Ergebnis (zusammenfassen, Tabelle ausfüllen, Merksatz formulieren) und beantwortet die Leitfrage des Einstiegs.',
    wantedTasks(meta) === 1 ? '' : '- Mindestens zwei verschiedene Aufgabenformate; mindestens eine offene Aufgabe.',
    '- Arbeitsanweisungen mit höchstens 25 Wörtern und nur einem Arbeitsauftrag je Nummer.'
  ]
    .filter(Boolean)
    .join('\n')
}

export function subjectMethodRules(meta: WorksheetMeta): string {
  const id = meta.subjectId
  const rules: Record<string, string[]> = {
    geschichte: [
      'Jede Quelle bekommt eine vollständige Angabe (Urheber, Jahr, Quellenart, Adressat, Fundort); Quelle und Darstellung sind klar unterschieden.',
      'Reihenfolge der Quellenaufgaben: W-Fragen (Wer? Wann? Für wen? Warum?) – Inhalt – Einordnung – Beurteilung der Absicht.',
      'Bildquellen und Karikaturen: erst genau beschreiben, dann Symbole deuten, zuletzt Wirkung und Absicht beurteilen.'
    ],
    politik: ['Kontroverse Positionen gegenüberstellen (Beutelsbacher Konsens): mindestens zwei Sichtweisen mit Belegen, eigene Urteilsbildung am Schluss.'],
    biologie: ['Erkenntnisweg: Frage – Hypothese („Wenn …, dann …") – Beobachtung – Deutung; Beobachtung und Deutung stehen in getrennten Feldern.'],
    chemie: [
      'Erkenntnisweg: Frage – Hypothese („Wenn …, dann …") – Beobachtung – Deutung; Beobachtung und Deutung stehen in getrennten Feldern; Sicherheitshinweise beachten.'
    ],
    physik: [
      'Erkenntnisweg: Frage – Hypothese („Wenn …, dann …") – Beobachtung – Deutung; bei Diagrammen: Achsen benennen, Verlauf beschreiben, Auffälligkeiten mit Zahlen belegen, dann erklären.'
    ],
    mathematik: [
      'Sachaufgaben in Schritten: Annahmen benennen – Modell aufstellen – rechnen – Ergebnis im Sachzusammenhang deuten und auf Plausibilität prüfen.',
      'Mindestens eine Aufgabe verlangt einen Darstellungswechsel (Text, Term, Tabelle, Graph, Skizze).'
    ],
    deutsch: [
      'Textanalyse beginnt mit einem Einleitungssatz (Autor, Titel, Textsorte, Jahr, Thema); Inhalt im Präsens.',
      'Zu sprachlichen Mitteln immer Beleg mit Zeilenangabe und Funktion verlangen – eine bloße Aufzählung gilt nicht als Lösung.'
    ],
    erdkunde: [
      'Kartenarbeit in der Folge: Titel, Legende und Maßstab auswerten – Verteilung beschreiben – Ursachen erklären – bewerten; Kartenquelle angeben.'
    ],
    kunst: ['Dreischritt einhalten: erst sachlich beschreiben, dann analysieren, dann deuten; jede Deutung wird am Werk belegt.'],
    musik: ['Gestufte Höraufträge mit je einem Fokus; erst Wirkung beschreiben, dann die musikalischen Mittel benennen, die sie erzeugen.'],
    latein: ['Übersetzungs- und Interpretationsaufgaben trennen; Wortschatz- und Formenhilfen direkt am Text anbieten.'],
    sport: ['Bewegungsabläufe in Phasen gliedern und mit Beobachtungskriterien versehen (was ist woran zu erkennen).'],
    religion: ['Positionen und Perspektiven gegenüberstellen; die eigene Urteilsfrage steht am Ende, nicht am Anfang.']
  }
  const list = rules[id]
  return list ? `FACHLICHE ARBEITSWEISE:\n${list.map((r) => `- ${r}`).join('\n')}` : ''
}

// ---------- Gitternetze ----------

/** Fächer, in denen vorgegebene Zeichenflächen zum Handwerk gehören */
export const GRID_SUBJECTS: Record<string, string> = {
  mathematik: 'Graphen, Wertepaare, geometrische Zeichnungen',
  physik: 'Messreihen auftragen, Diagramme auswerten',
  chemie: 'Messreihen und Titrationskurven auftragen',
  biologie: 'Messreihen und Wachstumskurven auftragen',
  erdkunde: 'Klimadiagramme, Bevölkerungs- und Wirtschaftsdiagramme',
  informatik: 'Laufzeiten und Wertetabellen als Graph',
  sachunterricht: 'einfache Säulendiagramme, Wetterbeobachtungen'
}

/**
 * Vorgegebene Zeichenflächen (Baustein „grid"). Ohne Raster zeichnen Lernende Achsen
 * ohne Maßstab; ein vorbereitetes Gitternetz macht Ergebnisse vergleichbar und korrigierbar.
 */
export function gridRules(meta: WorksheetMeta): string {
  const use = GRID_SUBJECTS[meta.subjectId]
  if (!use) return ''
  return [
    `GITTERNETZE (Baustein „grid") – in ${meta.subjectLabel} für: ${use}.`,
    '- Setze das Gitternetz IMMER direkt hinter die Aufgabe, für die gezeichnet wird; die Aufgabe selbst bekommt dann answer.kind = "none".',
    '- variant wählen: "koordinaten" (Graph oder Wertepaare eintragen), "mm" (Messwerte genau auftragen), "klima" (Klimadiagramm), "karo" (Skizze, Rechnung, einfaches Säulendiagramm).',
    '- Bei "koordinaten" und "klima" die Achsen vollständig angeben: xLabel und yLabel mit Einheit (z. B. „Zeit t in s", „Weg s in m"), xMin/xMax/xStep und yMin/yMax/yStep.',
    '- xStep und yStep sind der Wert je Kästchen. Wähle sie so, dass alle Werte der Aufgabe hineinpassen und glatt abzulesen sind (1, 2, 5, 10 … je Kästchen), und dass höchstens 30 Kästchen je Achse nötig sind.',
    '- Klimadiagramm: yMin/yMax/yStep für die Temperatur angeben (üblich −10 bis 40 °C in 10er-Schritten). Die Niederschlagsachse setzt die App im Verhältnis 1 : 2 dazu (10 °C entsprechen 20 mm), die zwölf Monate stehen automatisch an der x-Achse.',
    '- heightMm: 60–90 mm, bei Millimeterpapier bis 100 mm.',
    '- caption nutzen, wenn der Maßstab erklärt werden muss („1 Kästchen = 2 Jahre").',
    '- Kein Gitternetz, wenn geschrieben und nicht gezeichnet wird – dafür gibt es Schreiblinien.'
  ].join('\n')
}
