import type { Operatorenliste, OperatorDefinition } from './operatorenliste'

/**
 * Amtliche Operatorenlisten je Land und Fach für die Sekundarstufe II – Wortlaut der
 * Veröffentlichungen der Kultusministerien (Fundstelle je Liste). Nur was hier steht, kommt auf
 * die Klausur; die App formuliert keine Definitionen selbst (Entscheidung der Lehrkraft,
 * 27.09.2026). Seit 28.09.2026 mit ALLEM, was die Liste angibt: Erläuterung, illustrierende
 * Aufgabenbeispiele, Kompetenzbereich, Einschränkung auf einzelne Fächer, Vorbemerkungen.
 *
 * BELEGT (Recherche 27.09.2026): In Niedersachsen sind „Operatorenlisten der einzelnen Fächer"
 * seit dem Abitur 2024 zugelassenes Hilfsmittel in allen Prüfungsfächern (Erlass v. 25.01.2024;
 * jetzt „Die schriftliche Abiturprüfung in Niedersachsen 2026", Erlass v. 04.02.2026, Abschn.
 * 5.3). Das KC Geschichte (2017, Kap. 5) verlangt, dass Abitur-Hilfsmittel „im Unterricht und in
 * den Klausuren mehrfach verwendet worden sein" müssen. NICHT belegt: eine Formvorgabe.
 *
 * Einträge ohne `definition` sind Arbeitsanweisungen (Hör-/Hörsehverstehen: tick, match …); die
 * Liste gibt für sie nur ein Aufgabenbeispiel an.
 */

// ---------- Niedersachsen, Englisch (EN_2024Abi_Operatoren, Stand 1. Februar 2024) ----------

const SCHREIBEN = 'Schreiben'
const SPRACHMITTLUNG = 'Sprachmittlung'
const SPRECHEN = 'Sprechen'
const HOEREN = 'Hör-/Hörsehverstehen'

const s = (operator: string, afb: OperatorDefinition['afb'], definition: string, beispiele: string[], formen: string[] = []): OperatorDefinition => ({
  operator,
  afb,
  definition,
  beispiele,
  kompetenzbereich: SCHREIBEN,
  ...(formen.length ? { formen } : {})
})

const NI_ENGLISCH: Operatorenliste = {
  sprache: 'en',
  quelle: 'Operatoren für das Fach Englisch, Niedersächsisches Kultusministerium, Stand 1. Februar 2024 (gültig ab Abitur 2024)',
  hinweise: {
    [SPRACHMITTLUNG]:
      'Es ist erforderlich, die hier dargestellten Operatoren in einen situativen Rahmen, der die zu erstellende Textsorte, einen Adressaten und eine authentische Handlungssituation angibt, einzubetten.'
  },
  operatoren: [
    // Kompetenzbereich Schreiben (schwerpunktmäßiger Anforderungsbereich)
    s(
      'analyse, examine',
      'II',
      'describe and explain in detail',
      [
        'Analyse the way(s) in which the atmosphere is created in ...',
        'Examine the opposing views on social class held by the two protagonists.',
        'Examine how the author characterises ...'
      ],
      ['analyse', 'analyze', 'examine']
    ),
    s(
      'assess, evaluate',
      'III',
      'express a well-founded opinion on the nature or quality of sb./sth.',
      ['Assess the appropriateness of the central image of the story.', 'Evaluate the effectiveness of the measures proposed by the author.'],
      ['assess', 'evaluate']
    ),
    s(
      'comment (on)',
      'III',
      'give your opinion and support your view with evidence or reasons',
      ["Comment on the writer's view on gender roles."],
      ['comment', 'comment on']
    ),
    s('compare', 'II', 'show similarities and differences', ['Compare the opinions on education held by the experts presented in the text.']),
    s('contrast', 'II', 'emphasise the differences between two or more things', ["Contrast the authors' ideas of globalisation."]),
    s('describe', 'I', 'give a detailed account of (no line references, no quotes)', ['Describe the situation presented in the excerpt.']),
    s('discuss', 'III', 'give arguments or reasons for and against, especially to come to a well-founded conclusion', [
      "Discuss whether social status determines somebody's future options.",
      "Discuss the author's assumption that modern media shape an individual's identity."
    ]),
    s('explain', 'II', 'make something clear; show causes and effects in a given context', ["Explain the protagonist's obsession with money."]),
    s('illustrate', 'II', 'use examples to explain or make sth. clear', ['Illustrate the way in which school life in Britain differs from that in Germany.']),
    s('justify', 'III', 'present reasons for decisions, positions or conclusions', ['Justify whether the excerpt should be included in the text collection.']),
    s('outline', 'I', 'give the main features, structure or general principles of sth. (no line references, no quotes)', [
      "Outline the writer's views on love and marriage."
    ]),
    s('state', 'I', 'present the main aspects of sth. briefly and clearly (no line references, no quotes)', [
      'State the main developments in the family presented in the text.'
    ]),
    s(
      'summarise, sum up',
      'I',
      'give a concise account of the main points or ideas of a text, issue or topic (no line references, no quotes)',
      ['Summarise the text.', 'Sum up the information given about green energy.'],
      ['summarise', 'summarize', 'sum up']
    ),
    s(
      'write (+ text type)',
      'III',
      'produce a text with specific features',
      [
        'Write the ending of the story.',
        "Write an interior monologue which reflects the character's view of the situation and his/her feelings.",
        'Write your letter to the editor in which you discuss Packer\'s statement that "the American dream quietly dies".'
      ],
      ['write']
    ),

    // Kompetenzbereich Sprachmittlung (die Liste nennt hier keinen Anforderungsbereich)
    {
      operator: 'explain',
      definition: 'make something clear (taking into account culture-related differences if necessary)',
      beispiele: ['Explain the principle of waste separation in Germany.'],
      kompetenzbereich: SPRACHMITTLUNG
    },
    {
      operator: 'outline, present, summarise, sum up',
      formen: ['outline', 'present', 'summarise', 'summarize', 'sum up'],
      definition: 'give a concise account of the main points or ideas of a text (clarifying culture-related aspects if necessary)',
      beispiele: [
        'For an international school project in the EU, present the relevant information on the image of migrants in German media in a formal email.'
      ],
      kompetenzbereich: SPRACHMITTLUNG
    },
    {
      operator: 'write (+ text type)',
      formen: ['write'],
      definition: 'produce a text with specific features',
      beispiele: [
        'Using the information in the input article write an article in English for your project website in which you inform your Polish partners how to get a sports scholarship at a German university.'
      ],
      kompetenzbereich: SPRACHMITTLUNG
    },

    // Kompetenzbereich Sprechen – zusammenhängendes monologisches Sprechen
    {
      operator: 'comment (on)',
      formen: ['comment', 'comment on'],
      definition: "give one's opinion and support one's view with evidence or reasons",
      beispiele: [
        "As a member of your school's student council you are expected to organise a panel discussion on the refugee crisis. Explain what the statement at hand means and comment on it.",
        'Talk about your picture(s) and its (their) message. Comment on whether such a picture is an effective means to make people aware of certain problems.'
      ],
      kompetenzbereich: SPRECHEN,
      zusatz: { Teilbereich: 'Zusammenhängendes monologisches Sprechen' }
    },
    {
      operator: 'compare',
      definition: 'show similarities and differences',
      beispiele: ['Compare the ... pictures and talk about the lives of the people you can see.'],
      kompetenzbereich: SPRECHEN,
      zusatz: { Teilbereich: 'Zusammenhängendes monologisches Sprechen' }
    },
    {
      operator: 'explain',
      definition: 'make something clear',
      beispiele: ['Explain the message of the cartoon/quote/statement/... and the means used to convey it.'],
      kompetenzbereich: SPRECHEN,
      zusatz: { Teilbereich: 'Zusammenhängendes monologisches Sprechen' }
    },
    {
      operator: 'give reasons/justify',
      formen: ['give reasons', 'justify'],
      definition: 'present reasons for decisions, positions or conclusions',
      beispiele: [
        'Talk about your pictures/photos/ images ... and their message. Which picture would you choose to make people aware of certain problems? Give reasons for/Justify your choice.'
      ],
      kompetenzbereich: SPRECHEN,
      zusatz: { Teilbereich: 'Zusammenhängendes monologisches Sprechen' }
    },
    {
      operator: 'talk about (the ....)',
      formen: ['talk about'],
      definition: 'produce a text referring to certain aspects',
      beispiele: ['Talk about the pictures.', 'What do the pictures suggest about our attitude towards the environment?'],
      kompetenzbereich: SPRECHEN,
      zusatz: { Teilbereich: 'Zusammenhängendes monologisches Sprechen' }
    },
    // Kompetenzbereich Sprechen – an Gesprächen teilnehmen
    {
      operator: '(try to) agree on, (try to) come to an agreement',
      formen: ['agree on', 'try to agree on', 'come to an agreement', 'try to come to an agreement'],
      definition: 'come to one opinion or an understanding; (try to) reach a compromise',
      beispiele: ['Talk about the images. Discuss which images best illustrate ...', 'Try to agree on two images that best fit the ...'],
      kompetenzbereich: SPRECHEN,
      zusatz: { Teilbereich: 'An Gesprächen teilnehmen' }
    },
    {
      operator: 'discuss',
      definition: 'give arguments or reasons for or against and (try to) come to a conclusion',
      beispiele: [
        'Your school is about to organise a project "Protect the environment". It is your task to plan the event with your partner. Discuss the aspects given.',
        'Agree on two things which you think should be organised.',
        'Discuss the advantages and disadvantages of these methods. Decide which two methods you would choose for your campaign.'
      ],
      kompetenzbereich: SPRECHEN,
      zusatz: { Teilbereich: 'An Gesprächen teilnehmen' }
    },

    // Kompetenzbereich Hör-/Hörsehverstehen – Arbeitsanweisungen (ohne Erläuterung in der Liste)
    { operator: 'answer', definition: '', beispiele: ['Answer the questions in 1 to 5 words.'], kompetenzbereich: HOEREN },
    {
      operator: 'complete',
      definition: '',
      beispiele: ['Complete the sentences below using 1 to 5 words.', 'Complete the notes on the points listed below.', 'Complete the table below.'],
      kompetenzbereich: HOEREN
    },
    { operator: 'fill in', definition: '', beispiele: ['Fill in the missing information using 1 to 5 words.'], kompetenzbereich: HOEREN },
    {
      operator: 'list/name',
      formen: ['list', 'name'],
      definition: '',
      beispiele: ['List/Name the most important aspects mentioned in the discussion.'],
      kompetenzbereich: HOEREN
    },
    { operator: 'match', definition: '', beispiele: ['Match each speaker with one of the statements.'], kompetenzbereich: HOEREN },
    { operator: 'state', definition: '', beispiele: ['State the ideas supported by speaker A.'], kompetenzbereich: HOEREN },
    { operator: 'tick', definition: '', beispiele: ['Tick the correct answer.'], kompetenzbereich: HOEREN }
  ]
}

// ---------- Niedersachsen, Erdkunde/Geschichte/Politik-Wirtschaft/Wirtschaftslehre (Stand 1. Februar 2024) ----------

const NUR_EK_PW = ['erdkunde', 'politik']
const NUR_GE_PW = ['geschichte', 'politik']
const NUR_GE = ['geschichte']

const NI_GESELLSCHAFT: Operatorenliste = {
  sprache: 'de',
  quelle:
    'Operatoren für die Fächer Erdkunde, Geschichte, Politik-Wirtschaft und Wirtschaftslehre, Niedersächsisches Kultusministerium, Stand 1. Februar 2024 (gültig ab Abitur 2024)',
  hinweise: {
    '': 'Operatoren werden durch den Kontext der Prüfungsaufgabe erst konkretisiert bzw. präzisiert: durch die Formulierung bzw. Gestaltung der Aufgabenstellung, durch den Bezug zu Textmaterialien, Abbildungen, Problemstellungen, durch die Zuordnung zu Anforderungsbereichen im Erwartungshorizont.'
  },
  operatoren: [
    // Anforderungsbereich I
    { operator: 'beschreiben', definition: 'strukturiert und fachsprachlich angemessen Materialien vorstellen und/oder Sachverhalte darlegen', afb: 'I' },
    {
      operator: 'darstellen',
      definition: 'Sachverhalte detailliert und fachsprachlich angemessen aufzeigen',
      afb: 'I',
      nurFaecher: NUR_EK_PW,
      formen: ['Stelle dar', 'Stellen Sie dar']
    },
    {
      operator: 'gliedern',
      definition: 'einen Raum, eine Zeit oder einen Sachverhalt nach selbst gewählten oder vorgegebenen Kriterien systematisierend ordnen',
      afb: 'I'
    },
    {
      operator: 'wiedergeben',
      formen: ['Gib wieder', 'Geben Sie wieder'],
      definition:
        'Kenntnisse (Sachverhalte, Fachbegriffe, Daten, Fakten, Modelle) und/oder (Teil-)Aussagen mit eigenen Worten sprachlich distanziert, unkommentiert und strukturiert darstellen',
      afb: 'I'
    },
    {
      operator: 'zusammenfassen',
      formen: ['Fasse zusammen', 'Fassen Sie zusammen'],
      definition: 'Sachverhalte auf wesentliche Aspekte reduzieren und sprachlich distanziert, unkommentiert und strukturiert wiedergeben',
      afb: 'I'
    },
    // Anforderungsbereich II
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
      formen: ['Ordne ein', 'Ordnen Sie ein'],
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
      formen: ['Stelle gegenüber', 'Stellen Sie gegenüber'],
      definition: 'Sachverhalte, Aussagen oder Materialien kontrastierend darstellen und gewichten',
      afb: 'II',
      nurFaecher: NUR_GE
    },
    {
      operator: 'herausarbeiten',
      formen: ['Arbeite heraus', 'Arbeiten Sie heraus'],
      definition:
        'Materialien auf bestimmte, explizit nicht unbedingt genannte Sachverhalte hin untersuchen und Zusammenhänge zwischen den Sachverhalten herstellen',
      afb: 'II',
      nurFaecher: NUR_GE_PW
    },
    {
      operator: 'in Beziehung setzen',
      formen: ['Setze in Beziehung', 'Setzen Sie in Beziehung'],
      definition: 'Zusammenhänge zwischen Materialien, Sachverhalten aspektgeleitet und kriterienorientiert herstellen und erläutern',
      afb: 'II',
      nurFaecher: NUR_GE
    },
    {
      operator: 'nachweisen',
      formen: ['Weise nach', 'Weisen Sie nach'],
      definition: 'Materialien auf Bekanntes hin untersuchen und belegen',
      afb: 'II',
      nurFaecher: NUR_GE
    },
    { operator: 'vergleichen', definition: 'Gemeinsamkeiten, Ähnlichkeiten und Unterschiede von Sachverhalten kriterienorientiert darlegen', afb: 'II' },
    // Anforderungsbereich III
    {
      operator: 'begründen',
      definition: 'komplexe Grundgedanken durch Argumente stützen und nachvollziehbare Zusammenhänge herstellen',
      afb: 'III',
      nurFaecher: NUR_EK_PW
    },
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
      afb: 'III',
      nurFaecher: NUR_GE_PW
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
      formen: ['Prüfe', 'Überprüfe', 'Prüfen Sie', 'Überprüfen Sie'],
      definition:
        'Inhalte, Sachverhalte, Vermutungen oder Hypothesen auf der Grundlage eigener Kenntnisse oder mithilfe zusätzlicher Materialien auf ihre sachliche Richtigkeit bzw. auf ihre innere Logik hin untersuchen',
      afb: 'III'
    },
    {
      operator: 'interpretieren',
      definition: 'Sinnzusammenhänge aus Quellen erschließen und ein begründetes Sachurteil oder eine Stellungnahme abgeben, die auf einer Analyse beruhen',
      afb: 'I–III',
      nurFaecher: NUR_GE,
      zusatz: { Hinweis: 'Operator, der Leistungen in allen drei Anforderungsbereichen verlangt' }
    }
    /*
     * Nicht übernommen: Anhang A 3 der Liste (englische und französische Entsprechungen für den
     * bilingualen Erdkundeunterricht). Die Spalten sind im PDF so gesetzt, dass sich die
     * Zuordnung einzelner Wörter aus dem Text nicht sicher ablesen lässt – geraten wird nicht.
     */
  ]
}

export const OPERATORENLISTEN: Record<string, Record<string, Operatorenliste>> = {
  NI: {
    englisch: NI_ENGLISCH,
    // Eine gemeinsame Liste; Operatoren, die nur für einzelne Fächer gelten, tragen `nurFaecher`
    geschichte: NI_GESELLSCHAFT,
    erdkunde: NI_GESELLSCHAFT,
    politik: NI_GESELLSCHAFT
  }
}
