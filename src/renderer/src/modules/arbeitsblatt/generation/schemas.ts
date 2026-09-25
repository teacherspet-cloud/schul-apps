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
  'divider'
]
export const VIDEO_KIND_IDS = ['spielfilm', 'kurzfilm', 'dokumentation', 'nachrichten', 'lernvideo', 'experiment', 'reportage']
export const VIEWING_PHASE_IDS = ['vor', 'waehrend', 'nach']
export const ANSWER_KINDS = ['lines', 'grid', 'space', 'none', 'gapText', 'matching', 'multipleChoice', 'trueFalse', 'ordering', 'tableFill', 'labels']
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

const ANSWER = obj({
  kind: enumOf(ANSWER_KINDS),
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
  stars: int('0 = für alle; 1–3 = Niveaustufe'),
  title: str('Überschrift (Text, Kasten, Hilfe, Tabelle, Selbsteinschätzung, Abschnitt)'),
  body: str('Inhalt (text, infoBox)'),
  variant: str(
    'infoBox: merke|definition|beispiel|wissen|regel; scaffold: tipp|satzanfaenge|wortspeicher|hilfekarten; workspace: lines|grid|blank; selfCheck: smileys|ampel|kompetenzraster'
  ),
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
  parts: arr(obj({ instruction: str(), answer: ANSWER, solution: str() }), 'task: Teilaufgaben a), b) … oder leer'),
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

export const REVIEW_SCHEMA = obj({
  problems: arr(
    obj({
      blockNumber: int('Nummer des Bausteins (ab 1), 0 = ganzes Blatt'),
      severity: enumOf(['hoch', 'mittel']),
      problem: str()
    })
  )
})
