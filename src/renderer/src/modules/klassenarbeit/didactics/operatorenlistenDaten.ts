import type { Operatorenliste } from './operatorenliste'

/**
 * Amtliche Operatorenlisten je Land und Fach für die Sekundarstufe II – Wortlaut der
 * Veröffentlichungen der Kultusministerien (Fundstelle je Liste). Nur was hier steht, kommt auf
 * die Klausur; die App formuliert keine Definitionen selbst (Entscheidung der Lehrkraft,
 * 27.09.2026).
 *
 * BELEGT (Recherche 27.09.2026): In Niedersachsen sind „Operatorenlisten der einzelnen Fächer"
 * seit dem Abitur 2024 zugelassenes Hilfsmittel in allen Prüfungsfächern (Erlass v. 25.01.2024;
 * jetzt „Die schriftliche Abiturprüfung in Niedersachsen 2026", Erlass v. 04.02.2026, Abschn.
 * 5.3). Das KC Geschichte (2017, Kap. 5) verlangt, dass Abitur-Hilfsmittel „im Unterricht und in
 * den Klausuren mehrfach verwendet worden sein" müssen – daraus folgt die Verwendung in
 * Klausuren. NICHT belegt: eine Formvorgabe (Anhang, ganze Liste oder nur die verwendeten
 * Operatoren). Der Baustein listet deshalb die verwendeten Operatoren mit amtlichem Wortlaut.
 *
 * Einträge ohne `definition` sind bloße Arbeitsanweisungen (Hör-/Leseverstehen: tick, match …):
 * Sie gelten als bekannt, erscheinen nicht in der Anlage und lösen keinen Hinweis aus.
 */
const NI_ENGLISCH: Operatorenliste = {
  sprache: 'en',
  quelle: 'Operatoren für das Fach Englisch, Niedersächsisches Kultusministerium, Stand 1. Februar 2024 (gültig ab Abitur 2024)',
  operatoren: [
    // Kompetenzbereich Schreiben (schwerpunktmäßiger Anforderungsbereich)
    { operator: 'analyse', definition: 'describe and explain in detail', afb: 'II' },
    { operator: 'examine', definition: 'describe and explain in detail', afb: 'II' },
    { operator: 'assess', definition: 'express a well-founded opinion on the nature or quality of sb./sth.', afb: 'III' },
    { operator: 'evaluate', definition: 'express a well-founded opinion on the nature or quality of sb./sth.', afb: 'III' },
    { operator: 'comment', definition: 'give your opinion and support your view with evidence or reasons', afb: 'III' },
    { operator: 'comment on', definition: 'give your opinion and support your view with evidence or reasons', afb: 'III' },
    { operator: 'compare', definition: 'show similarities and differences', afb: 'II' },
    { operator: 'contrast', definition: 'emphasise the differences between two or more things', afb: 'II' },
    { operator: 'describe', definition: 'give a detailed account of (no line references, no quotes)', afb: 'I' },
    { operator: 'discuss', definition: 'give arguments or reasons for and against, especially to come to a well-founded conclusion', afb: 'III' },
    { operator: 'explain', definition: 'make something clear; show causes and effects in a given context', afb: 'II' },
    { operator: 'illustrate', definition: 'use examples to explain or make sth. clear', afb: 'II' },
    { operator: 'justify', definition: 'present reasons for decisions, positions or conclusions', afb: 'III' },
    { operator: 'outline', definition: 'give the main features, structure or general principles of sth. (no line references, no quotes)', afb: 'I' },
    { operator: 'state', definition: 'present the main aspects of sth. briefly and clearly (no line references, no quotes)', afb: 'I' },
    {
      operator: 'summarise',
      definition: 'give a concise account of the main points or ideas of a text, issue or topic (no line references, no quotes)',
      afb: 'I'
    },
    {
      operator: 'summarize',
      definition: 'give a concise account of the main points or ideas of a text, issue or topic (no line references, no quotes)',
      afb: 'I'
    },
    {
      operator: 'sum up',
      definition: 'give a concise account of the main points or ideas of a text, issue or topic (no line references, no quotes)',
      afb: 'I'
    },
    { operator: 'write', definition: 'produce a text with specific features', afb: 'III' },
    // Sprachmittlung (ohne AFB in der Liste)
    { operator: 'present', definition: 'give a concise account of the main points or ideas of a text (clarifying culture-related aspects if necessary)' },
    // Arbeitsanweisungen Hör-/Hörsehverstehen und Leseverstehen – ohne Definition in der Liste
    { operator: 'answer', definition: '' },
    { operator: 'complete', definition: '' },
    { operator: 'fill in', definition: '' },
    { operator: 'list', definition: '' },
    { operator: 'name', definition: '' },
    { operator: 'match', definition: '' },
    { operator: 'tick', definition: '' }
  ]
}

const NI_GESELLSCHAFT: Operatorenliste = {
  sprache: 'de',
  quelle:
    'Operatoren für die Fächer Erdkunde, Geschichte, Politik-Wirtschaft und Wirtschaftslehre, Niedersächsisches Kultusministerium, Stand 1. Februar 2024 (gültig ab Abitur 2024)',
  operatoren: [
    { operator: 'beschreiben', definition: 'strukturiert und fachsprachlich angemessen Materialien vorstellen und/oder Sachverhalte darlegen', afb: 'I' },
    {
      operator: 'gliedern',
      definition: 'einen Raum, eine Zeit oder einen Sachverhalt nach selbst gewählten oder vorgegebenen Kriterien systematisierend ordnen',
      afb: 'I'
    },
    {
      operator: 'wiedergeben',
      formen: ['Gib wieder'],
      definition:
        'Kenntnisse (Sachverhalte, Fachbegriffe, Daten, Fakten, Modelle) und/oder (Teil-)Aussagen mit eigenen Worten sprachlich distanziert, unkommentiert und strukturiert darstellen',
      afb: 'I'
    },
    {
      operator: 'zusammenfassen',
      formen: ['Fasse zusammen'],
      definition: 'Sachverhalte auf wesentliche Aspekte reduzieren und sprachlich distanziert, unkommentiert und strukturiert wiedergeben',
      afb: 'I'
    },
    {
      operator: 'analysieren',
      definition: 'Materialien, Sachverhalte oder Räume beschreiben, kriterienorientiert oder aspektgeleitet erschließen und strukturiert darstellen',
      afb: 'II'
    },
    {
      operator: 'charakterisieren',
      definition:
        'Sachverhalte in ihren Eigenarten beschreiben, typische Merkmale kennzeichnen und diese dann gegebenenfalls unter einem oder mehreren bestimmten Gesichtspunkten zusammenführen',
      afb: 'II'
    },
    {
      operator: 'einordnen',
      formen: ['Ordne ein'],
      definition: 'begründet eine Position/Material zuordnen oder einen Sachverhalt begründet in einen Zusammenhang stellen',
      afb: 'II'
    },
    {
      operator: 'erklären',
      definition:
        'Sachverhalte so darstellen – gegebenenfalls mit Theorien und Modellen –, dass Bedingungen, Ursachen, Gesetzmäßigkeiten und/oder Funktionszusammenhänge verständlich werden',
      afb: 'II'
    },
    {
      operator: 'erläutern',
      definition:
        'Sachverhalte erklären und in ihren komplexen Beziehungen an Beispielen und/oder Theorien verdeutlichen (auf Grundlage von Kenntnissen bzw. Materialanalyse)',
      afb: 'II'
    },
    {
      operator: 'gegenüberstellen',
      formen: ['Stelle gegenüber'],
      definition: 'Sachverhalte, Aussagen oder Materialien kontrastierend darstellen und gewichten',
      afb: 'II'
    },
    {
      operator: 'herausarbeiten',
      formen: ['Arbeite heraus'],
      definition:
        'Materialien auf bestimmte, explizit nicht unbedingt genannte Sachverhalte hin untersuchen und Zusammenhänge zwischen den Sachverhalten herstellen',
      afb: 'II'
    },
    {
      operator: 'in Beziehung setzen',
      formen: ['Setze in Beziehung'],
      definition: 'Zusammenhänge zwischen Materialien, Sachverhalten aspektgeleitet und kriterienorientiert herstellen und erläutern',
      afb: 'II'
    },
    { operator: 'nachweisen', formen: ['Weise nach'], definition: 'Materialien auf Bekanntes hin untersuchen und belegen', afb: 'II' },
    { operator: 'vergleichen', definition: 'Gemeinsamkeiten, Ähnlichkeiten und Unterschiede von Sachverhalten kriterienorientiert darlegen', afb: 'II' },
    {
      operator: 'beurteilen',
      definition:
        'den Stellenwert von Sachverhalten oder Prozessen in einem Zusammenhang bestimmen, um kriterienorientiert zu einem begründeten Sachurteil zu gelangen',
      afb: 'III'
    },
    {
      operator: 'entwickeln',
      definition:
        'zu einem Sachverhalt oder zu einer Problemstellung eine Einschätzung, ein Lösungsmodell, eine Gegenposition oder ein begründetes Lösungskonzept darlegen',
      afb: 'III'
    },
    {
      operator: 'erörtern',
      definition:
        'zu einer vorgegebenen Problemstellung eine reflektierte, abwägende Auseinandersetzung führen und zu einem begründeten Sach- und/oder Werturteil kommen',
      afb: 'III'
    },
    {
      operator: 'sich auseinandersetzen',
      formen: ['Setze dich auseinander', 'Setzen Sie sich auseinander'],
      definition:
        'zu einem Sachverhalt, einem Konzept, einer Problemstellung oder einer These usw. eine Argumentation entwickeln, die zu einem begründeten Sach- und/oder Werturteil führt',
      afb: 'III'
    },
    {
      operator: 'Stellung nehmen',
      formen: ['Nimm Stellung', 'Nehmen Sie Stellung'],
      definition:
        'Beurteilung mit zusätzlicher Reflexion individueller, sachbezogener und/oder politischer Wertmaßstäbe, die Pluralität gewährleisten und zu einem begründeten eigenen Werturteil führt',
      afb: 'III'
    },
    {
      operator: 'überprüfen',
      formen: ['Prüfe', 'Überprüfe'],
      definition:
        'Inhalte, Sachverhalte, Vermutungen oder Hypothesen auf der Grundlage eigener Kenntnisse oder mithilfe zusätzlicher Materialien auf ihre sachliche Richtigkeit bzw. auf ihre innere Logik hin untersuchen',
      afb: 'III'
    },
    {
      operator: 'interpretieren',
      definition: 'Sinnzusammenhänge aus Quellen erschließen und ein begründetes Sachurteil oder eine Stellungnahme abgeben, die auf einer Analyse beruhen',
      afb: 'I–III'
    }
  ]
}

export const OPERATORENLISTEN: Record<string, Record<string, Operatorenliste>> = {
  NI: {
    englisch: NI_ENGLISCH,
    geschichte: NI_GESELLSCHAFT,
    // Dieselbe amtliche Liste gilt für Erdkunde und Politik-Wirtschaft (ohne die nur für Geschichte ausgewiesenen Operatoren – hier vereinfacht die ganze Liste)
    erdkunde: NI_GESELLSCHAFT,
    politik: NI_GESELLSCHAFT
  }
}
