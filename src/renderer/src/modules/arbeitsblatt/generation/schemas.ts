import { arr, bool, enumOf, int, obj, str } from '../../../shared/aiSchema'

export const BLOCK_TYPES = [
  'learningGoals',
  'infoBox',
  'text',
  'image',
  'task',
  'scaffold',
  'phrases',
  'table',
  'workspace',
  'grid',
  'audio',
  'video',
  'selfCheck',
  'divider',
  // Versuchsprotokoll (29.09.2026): Die KI plant nur die Stelle, den Inhalt setzt die App ein (didactics/protokoll.ts)
  'protocol'
]
export const VIDEO_KIND_IDS = ['spielfilm', 'kurzfilm', 'dokumentation', 'nachrichten', 'lernvideo', 'experiment', 'reportage']
export const VIEWING_PHASE_IDS = ['vor', 'waehrend', 'nach']
export const ANSWER_KINDS = [
  'lines',
  'grid',
  'space',
  'none',
  'gapText',
  'matching',
  'multipleChoice',
  'trueFalse',
  'ordering',
  'tableFill',
  'labels',
  'diagram'
]
export const DIAGRAM_KIND_IDS = ['koordinaten', 'mm', 'klima', 'schraegbild', 'spannung', 'zeitleiste']
export const TIMELINE_UNIT_IDS = ['day', 'month', 'year']
export const BLOCK_SIDES = ['auto', 'none', 'left', 'right']
export const SOCIAL_FORMS = ['EA', 'PA', 'GA', 'Plenum', 'Rollenspiel']
export const AFBS = ['', 'I', 'II', 'III']
export const GRID_KIND_IDS = ['karo', 'mm', 'koordinaten', 'klima']
export const LANGUAGE_SKILLS = ['mediation', 'writing', 'listening', 'reading', 'grammar']

export const OUTLINE_SCHEMA = obj({
  title: str('Kurzer, motivierender Titel des Arbeitsblatts'),
  learningGoals: arr(str(), '1–3 Lernziele als Ich-kann-Sätze'),
  minutes: int('Geschätzte Bearbeitungszeit in Minuten'),
  teacherNote: str('Hinweis an die Lehrkraft (z. B. wenn Thema und Jahrgang schlecht zusammenpassen), sonst leer'),
  ueberthema: str(
    'Unterrichtseinheit (Überthema), unter der dieses Blatt im Lehrplan steht: GENAU der Wortlaut eines vorhandenen Themenbereichs des Fachs, wenn einer passt; sonst ein kurzer, lehrplannaher Name (2–5 Wörter)'
  ),
  items: arr(
    obj({
      type: enumOf(BLOCK_TYPES),
      purpose: str('Was genau dieser Baustein enthält bzw. verlangt (1–2 Sätze)'),
      afb: enumOf(AFBS),
      operator: str('Operator der Aufgabe, sonst leer'),
      socialForm: enumOf(SOCIAL_FORMS),
      stars: int('0 = für alle; 1–3 = Niveaustufe bei ★-markierten Aufgaben'),
      answerKind: enumOf(ANSWER_KINDS),
      skill: str('Sprachen: mediation | writing | listening | grammar, sonst leer')
    })
  )
})

/*
 * Zeichenfläche mit Achsen als Antwortbereich (26.09.2026). Alle Felder sind Pflicht (strict);
 * nicht benötigte bleiben leer bzw. 0. Die App bereinigt Bereich und Schrittweite
 * (model/diagram.ts), damit kein unbrauchbares Diagramm aufs Papier kommt.
 */
const DIAGRAM = obj({
  kind: enumOf(DIAGRAM_KIND_IDS),
  heightMm: int('Höhe der Zeichenfläche in mm (45–120; Zeitleiste mit Strängen mehr)'),
  axes: obj({
    xLabel: str('Beschriftung der x-Achse mit Einheit, z. B. „Zeit t in s"; schraegbild: Achse nach rechts (x₂)'),
    yLabel: str('Beschriftung der y-Achse mit Einheit; schraegbild: Achse nach oben (x₃)'),
    y2Label: str('klima: rechte Achse, sonst leer'),
    xMin: int(),
    xMax: int(),
    xStep: int('Wert je Kästchen auf der x-Achse (> 0)'),
    yMin: int(),
    yMax: int(),
    yStep: int('Wert je Kästchen auf der y-Achse (> 0)'),
    y2Min: int(),
    y2Max: int(),
    y2Step: int(),
    showNumbers: bool('Zahlen an den Achsen'),
    months: bool('klima: true')
  }),
  z: obj({ label: str('schraegbild: Tiefenachse nach vorn (x₁), sonst leer'), min: int(), max: int(), step: int() }),
  xCategories: arr(str(), 'spannung: Beschriftungen der x-Achse (Handlungsschritte, Kapitel), sonst leer'),
  yLevels: arr(str(), 'spannung: Stufen der y-Achse von unten nach oben, sonst leer'),
  timeline: obj({
    unit: enumOf(TIMELINE_UNIT_IDS),
    from: str('zeitleiste: Anfang, z. B. „1914-07-28", „1914-07", „1914", „-500" (v. Chr.); sonst leer'),
    to: str('zeitleiste: Ende'),
    step: int('zeitleiste: Marke alle … Einheiten'),
    sections: arr(
      obj({ from: str(), to: str(), unit: enumOf(TIMELINE_UNIT_IDS), step: int() }),
      'zeitleiste: Abschnitte mit eigener Skala für lange Zeiträume, sonst leer'
    ),
    yLabel: str('zeitleiste: Beschriftung einer y-Achse (z. B. „Eskalation"), sonst leer'),
    yLevels: arr(str(), 'zeitleiste: Stufen der y-Achse von unten nach oben (z. B. Drohung, Ultimatum, Mobilmachung, Krieg), sonst leer'),
    strands: arr(str(), 'zeitleiste: mehrere Stränge an derselben Zeitachse (z. B. zwei Länder), sonst leer'),
    events: arr(
      obj({ date: str(), text: str(), strand: int('0-basiert'), level: int('Stufe 0-basiert, -1 = keine') }),
      'zeitleiste: VORGEGEBENE Ereignisse auf dem Schülerblatt; leer, wenn die Lernenden selbst eintragen'
    )
  })
})

const ANSWER = obj({
  kind: enumOf(ANSWER_KINDS),
  diagram: DIAGRAM,
  count: int('lines/labels: Anzahl Linien; grid: Kästchenzeilen'),
  heightMm: int('space: Höhe in mm'),
  gapText: str('gapText: Text mit [[Lösung]] je Lücke'),
  left: arr(str(), 'matching: linke Seite'),
  right: arr(str(), 'matching: rechte Seite (mit 1–2 überzähligen Einträgen)'),
  pairs: arr(int(), 'matching: Index in right für jedes Element von left'),
  options: arr(str(), 'multipleChoice: Antwortmöglichkeiten'),
  correct: arr(int(), 'multipleChoice: Indizes der richtigen Antworten'),
  statements: arr(obj({ text: str(), isTrue: bool() }), 'trueFalse'),
  items: arr(str(), 'ordering: Elemente in RICHTIGER Reihenfolge'),
  headers: arr(str(), 'tableFill: Spaltenköpfe'),
  rows: arr(arr(str()), 'tableFill: Zeilen; leere Zelle = von Lernenden auszufüllen'),
  solutionRows: arr(arr(str()), 'tableFill: Lösungen für die leeren Zellen (gleiche Struktur)'),
  labels: arr(str(), 'labels: Lösungen der Beschriftungen')
})

export const IMAGE_ROLES = ['material', 'illustration', 'motivation']
/** Bildfunktion – siehe didactics/imageDesign.ts; nur dazu gibt es gemessene Effektstärken. */
export const IMAGE_FUNCTION_IDS = ['organisation', 'repraesentation', 'schmuck']

export const FLAT_BLOCK = obj({
  outlineIndex: int('Nummer des Gliederungspunkts (ab 0); -1 für zusätzliche Hilfen'),
  type: enumOf(BLOCK_TYPES),
  ref: str(
    'NUR Materialbausteine (text, image, table, grid, audio, video): frei gewählte Kurzkennung aus Kleinbuchstaben, Ziffern und Bindestrich (z. B. "zeitleiste", "karte"). Aufgaben und Hilfen verweisen darauf mit M{zeitleiste}; die Nummer vergibt die App. Andere Bausteine: leer'
  ),
  stars: int('0 = für alle; 1–3 = Niveaustufe'),
  title: str('Überschrift (Text, Kasten, Hilfe, Tabelle, Selbsteinschätzung, Abschnitt)'),
  body: str('Inhalt (text, infoBox); phrases: ein Satz, wie und FÜR WELCHE AUFGABE die Hilfe genutzt wird („Für Aufgabe 2: …")'),
  variant: str(
    'infoBox: merke|definition|beispiel|wissen|regel; scaffold: tipp|satzanfaenge|wortspeicher|hilfekarten; workspace: lines|grid|blank; selfCheck: smileys|ampel|kompetenzraster; grid: karo|mm|koordinaten|klima|zeitleiste'
  ),
  timeline: obj({
    unit: enumOf(TIMELINE_UNIT_IDS),
    from: str('grid mit variant zeitleiste: Anfang der Achse, z. B. „1914-06-28", „1914-07", „1914", „-500"; sonst leer'),
    to: str('Ende der Achse'),
    step: int('Marke alle … Einheiten (6–12 Marken)'),
    sections: arr(
      obj({ from: str(), to: str(), unit: enumOf(TIMELINE_UNIT_IDS), step: int() }),
      'Abschnitte mit eigener Skala nur bei sehr langen Zeiträumen, sonst leer'
    ),
    yLabel: str('Beschriftung der Stufen-Achse (z. B. „Eskalation"), sonst leer'),
    yLevels: arr(str(), 'Stufen von unten nach oben (höchstens 5), sonst leer'),
    strands: arr(str(), 'parallele Stränge (Länder, Akteure), sonst leer'),
    events: arr(
      obj({ date: str('„1914-07-28"'), text: str('höchstens 5 Wörter'), strand: int('0-basiert'), level: int('Stufe 0-basiert, -1 = keine') }),
      'die Ereignisse – die App zeichnet sie an die Achse'
    )
  }),
  items: arr(str(), 'learningGoals: Lernziele; scaffold: Einträge; selfCheck: Ich-kann-Sätze'),
  lineNumbers: bool('text: Zeilennummern anzeigen (die App nummeriert selbst – nie Nummern in body schreiben)'),
  source: str('text: Quellenangabe oder leer'),
  glossary: arr(obj({ term: str(), explanation: str() }), 'text: Worterklärungen'),
  imageDescription: str('image: genaue Beschreibung des benötigten Bildes'),
  sourceImageIndex: int('image: Index eines übernehmbaren Materialbildes oder -1'),
  imageSearch: str(
    'image: 2–5 Suchwörter für Wikimedia Commons – englisch (z. B. „plant cell diagram“); bei Originalquellen Urheber und Kernwörter des Originaltitels'
  ),
  imageItems: arr(
    obj({
      caption: str('Unterschrift unter dem Einzelbild oder leer'),
      description: str('was genau dieses Einzelbild zeigt'),
      search: str('2–5 englische Suchwörter')
    }),
    'image: Bildreihe mit 2–8 Einzelbildern (je genau ein Motiv) statt eines Einzelbilds – sonst leere Liste'
  ),
  phraseGroups: arr(
    obj({
      label: str('Sprachhandlung, z. B. „eine Meinung äußern“, „widersprechen“, „etwas beschreiben“'),
      items: arr(obj({ text: str('Wendung oder Wort in der Zielsprache'), german: str('deutsche Entsprechung oder leer') }))
    }),
    'phrases: Gruppen nützlicher Ausdrücke – sonst leere Liste'
  ),
  imageRole: enumOf(IMAGE_ROLES),
  blockSide: enumOf(BLOCK_SIDES),
  imageFunction: enumOf(IMAGE_FUNCTION_IDS),
  imageLabels: arr(
    obj({
      text: str('Beschriftung dieses Bildteils'),
      x: int('waagerechte Lage des gemeinten Punktes im Bild, 0–100 von links'),
      y: int('senkrechte Lage des gemeinten Punktes im Bild, 0–100 von oben'),
      blank: bool('true = die Lernenden tragen die Beschriftung selbst ein')
    }),
    'image: Beschriftungen direkt an den Bildteilen (2–8) – die App zeichnet Schild und Linie. Sonst leere Liste.'
  ),
  imageIsSource: bool('image: true nur bei einer Originalquelle (historisches Bild, Kunstwerk, Karikatur, Plakat)'),
  instruction: str('task: Arbeitsanweisung, beginnt mit **Operator**'),
  operator: str(),
  afb: enumOf(AFBS),
  afbReason: str('task: kurze Begründung der AFB-Zuordnung'),
  socialForm: enumOf(SOCIAL_FORMS),
  minutes: int(),
  points: int('Immer 0 – auf Arbeitsblättern werden keine Punkte vergeben'),
  solution: str('task: Lösung / Erwartungshorizont'),
  answer: ANSWER,
  parts: arr(
    obj({
      instruction: str(),
      answer: ANSWER,
      solution: str(),
      stufe: int('Verstehensaufgabe: Schwierigkeitsstufe 1–5 dieser Teilaufgabe nach dem Raster, sonst 0'),
      stufeGrund: str('Verstehensaufgabe: kurze Begründung der Stufe, sonst leer')
    }),
    'task: Teilaufgaben a), b) … oder leer'
  ),
  // Schwierigkeitsstufe bei Hör-, Lese- und Hör-Seh-Verstehen (29.09.2026, shared/verstehen) – nur für die Lehrkraft
  stufe: int('task, Verstehensaufgabe (Hören, Lesen, Hör-Seh): Schwierigkeitsstufe 1–5 nach dem Raster; sonst 0'),
  stufeGrund: str('task, Verstehensaufgabe: kurze Begründung der Stufe (z. B. „Option wörtlich im Text"), sonst leer'),
  headers: arr(str(), 'table: Spaltenköpfe'),
  rows: arr(arr(str()), 'table: Zeilen'),
  heightMm: int('workspace/grid: Höhe in mm'),
  cellMm: int('grid: Kästchenweite in mm (Karo 5, Millimeterpapier 1)'),
  axes: obj({
    xLabel: str('grid koordinaten: Beschriftung der x-Achse mit Einheit, z. B. „Zeit t in s“'),
    yLabel: str('grid: Beschriftung der y-Achse mit Einheit'),
    y2Label: str('grid klima: Beschriftung der rechten Achse, sonst leer'),
    xMin: int(),
    xMax: int(),
    xStep: int('Wert je Kästchen auf der x-Achse'),
    yMin: int(),
    yMax: int(),
    yStep: int('Wert je Kästchen auf der y-Achse'),
    y2Min: int(),
    y2Max: int(),
    y2Step: int(),
    showNumbers: bool('Zahlen an die Achsen schreiben'),
    months: bool('x-Achse mit Monaten beschriften (Klimadiagramm)')
  }),
  speakers: arr(obj({ name: str('Name der Sprecherin / des Sprechers im Skript') }), 'audio: 1–4 Sprechende'),
  plays: int('audio: wie oft der Text abgespielt wird (in der Regel 2); video: wie oft gezeigt wird'),
  videoKind: enumOf(VIDEO_KIND_IDS),
  videoTitle: str('video: Titel des Films oder Videos, so wie ihn die Lehrkraft angegeben hat'),
  videoUrl: str('video: Adresse, so wie sie die Lehrkraft angegeben hat, sonst leer'),
  sourceAuthor: str('text: NUR bei einer Quelle – Verfasser (Person, Amt, Zeitung), sonst leer'),
  sourceDate: str('text: NUR bei einer Quelle – Entstehungsdatum, sonst leer'),
  sourceTextType: str('text: NUR bei einer Quelle – Textsorte (Brief, Rede, Verordnung, Flugblatt, Tagebuch, Zeitungsartikel …), sonst leer'),
  videoPlatform: str('video: Plattform oder Herkunft (YouTube, Mediathek, Medienzentrum, DVD), sonst leer'),
  videoSearchTerms: arr(str('Suchbegriff'), 'video: NUR wenn keine gesicherte Fundstelle genannt werden konnte – 2 bis 4 Suchbegriffe fürs Archiv, sonst leer'),
  videoMinutes: int('video: Gesamtlaufzeit in Minuten, 0 wenn unbekannt'),
  videoSection: str('video: gezeigter Abschnitt als Zeitmarken, z. B. „12:40–18:10“, sonst leer'),
  videoTeacherNote: str('video: Hinweise nur für die Lehrkraft (Stolperstellen, Stellen zum Anhalten), sonst leer'),
  viewingPhase: str('task bei Filmbeobachtung: vor | waehrend | nach, sonst leer'),
  observerGroup: str('task bei arbeitsteiliger Beobachtung: „A“, „B“ … – leer, wenn die Aufgabe für alle gilt'),
  timecode: str('task bei Filmbeobachtung: Zeitmarke der gemeinten Stelle, z. B. „03:20“, sonst leer'),
  skill: str('Sprachen: mediation | writing | listening | grammar, sonst leer'),
  brief: obj({
    situation: str('Situation: Wer bist du, was ist der Anlass?'),
    audience: str('Adressat: an wen richtet sich der Text?'),
    textType: str('Textsorte: E-Mail, Blogbeitrag, Artikel, Rede, Brief …'),
    purpose: str('Zweck: informieren, überzeugen, beraten, berichten …'),
    words: int('erwarteter Umfang in Wörtern'),
    points: arr(str(), 'Punkte, die der Text abdecken muss'),
    notes: arr(
      obj({
        title: str('Überschrift der Notizenspalte, z. B. „The Conference"'),
        items: arr(str(), 'Stichpunkte in der Zielsprache, je 2–6 Wörter, KEINE ganzen Sätze'),
        prompts: arr(str(), 'offene Impulse zum Selbstausfüllen, z. B. „Positives: …"')
      }),
      'Notizentabelle: 0 Spalten = keine Tabelle, sonst 2 Spalten mit je 5–8 Stichpunkten'
    ),
    form: arr(str(), 'Formvorgaben, z. B. „Give your report a suitable heading and use subheadings."'),
    criteria: arr(str(), 'Bewertungskriterien für den Erwartungshorizont'),
    expected: arr(
      obj({
        aspect: str('der Inhaltspunkt oder Operator, auf den sich die Zeile bezieht'),
        criterion: str('übergeordnetes Kriterium – was der Text leisten muss, damit der Aspekt erfüllt ist'),
        examples: arr(str(), 'Beispiellösungen, NICHT verbindlich'),
        points: int('Punkte für diesen Aspekt')
      }),
      'Erwartungshorizont: eine Zeile je Inhaltspunkt bzw. Operator'
    ),
    model: str('ausformulierter Mustertext auf dem Zielniveau, etwa so lang wie gefordert')
  })
})

export const SHEET_SCHEMA = obj({ blocks: arr(FLAT_BLOCK) })

export const SEITEN_ARTEN = ['hilfenAufKarten', 'zusammenlegen', 'materialKuerzen', 'vertiefung', 'sicherung', 'transfer', 'sonstiges']

/**
 * Arbeitsblatt: dazu die Angabe zur Seitenzahl (Paket 7). Im SELBEN Lauf wie das Blatt – ein
 * eigener Aufruf nur für Grund und Vorschläge kostete Kontingent. Die Klassenarbeit nutzt
 * weiter SHEET_SCHEMA; sie hat keine Seitenvorgabe.
 */
export const WORKSHEET_SCHEMA = obj({
  blocks: arr(FLAT_BLOCK),
  seiten: obj({
    geplant: int('Voraussichtliche Zahl der Aufgaben- und Materialseiten (ohne Hilfekarten, Lösungen, Tafelbild, Deckblatt, Hörtext-Skripte)'),
    grund: str('Nur wenn das von der Seitenvorgabe abweicht: Grund, bezogen auf Material und Lernziel; sonst leer'),
    vorschlaege: arr(
      obj({
        richtung: enumOf(['weniger', 'mehr']),
        art: enumOf(SEITEN_ARTEN),
        text: str('Konkreter Vorschlag, der dem Lernziel dient (1 Satz)'),
        baustein: int('Index des betroffenen Bausteins in blocks (ab 0), sonst -1')
      }),
      'Nur bei Abweichung: 1–3 Vorschläge, wie sich die Seitenzahl zur Vorgabe hin verändern ließe; sonst leer'
    )
  })
})

export const REVIEW_SCHEMA = obj({
  problems: arr(
    obj({
      blockNumber: int('Nummer des Bausteins (ab 1), 0 = ganzes Blatt'),
      severity: enumOf(['hoch', 'mittel']),
      problem: str()
    })
  )
})
