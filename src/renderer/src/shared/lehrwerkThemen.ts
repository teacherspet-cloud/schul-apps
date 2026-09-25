/**
 * Themen, Schauplätze und Grammatik der mitgelieferten Lehrwerke – je Kapitel.
 *
 * Die Lehrwerksdateien nennen ihre Kapitel nur „Unit 1“, „Unit 2“ … Wunsch der Lehrkraft
 * (25.09.2026): die Themen je Unit hinterlegen, damit die Vorschläge zum Vorwissen konkret
 * werden („Aus Unit 2 bekannt: London, going to-Futur“ statt „Wortschatz aus Green Line 2“).
 *
 * Recherche vom 25.09.2026. Niedersachsen benutzt die Green Line Bundesausgabe ab 2021
 * (Klett-Synopsen für Niedersachsen, ISBN 978-3-12-864010-5 / -864020-4 …); ab Klasse 9 die
 * G9-Bände (GL 5 G9 978-3-12-874050-8, GL 6 G9 978-3-12-874060-7). Titel und Aufbau stammen
 * von den Klett-Produktseiten, Grammatik und Themen aus den Klett-Planungsmustern zu Green Line
 * 2021 (klett.de/lehrwerk/green-line-bundesausgabe-ab-2021/stoffverteilungsplaene). Transition:
 * Stoffverteilungsplan Niedersachsen 2024. Nichts ist ergänzt, was die Quellen nicht nennen –
 * fehlende Angaben bleiben leer.
 */

export interface KapitelThema {
  titel: string
  thema?: string
  ort?: string
  grammatik?: string
}

const KLETT = 'Klett, Green Line Bundesausgabe ab 2021 (Produktseite und Planungsmuster)'

export const LEHRWERK_THEMEN: Record<string, { quelle: string; kapitel: Record<string, KapitelThema> }> = {
  'Green Line 1': {
    quelle: KLETT,
    kapitel: {
      Hello: { titel: 'Hello!', thema: 'Namen, Zahlen, Farben, Alphabet', ort: 'London' },
      'Unit 1': {
        titel: 'A new school',
        thema: 'Schule, Schuluniformen, Klassenregeln',
        ort: 'London',
        grammatik: 'Artikel, Plural, be, there is/are, can, Imperativ, Personalpronomen'
      },
      'Media smart': { titel: 'Writing texts on computers', thema: 'Medienregeln' },
      'Unit 2': {
        titel: 'At home',
        thema: 'Zuhause, Familie, Uhrzeit, Tagesablauf',
        grammatik: 's-Genitiv, have got, simple present (Aussagen), Häufigkeitsadverbien, Objektpronomen'
      },
      'Across cultures 1': { titel: 'Greenwich: A special corner of London', ort: 'Greenwich' },
      'Unit 3': { titel: 'Our Greenwich', thema: 'Orte, Freizeit', ort: 'Greenwich, London', grammatik: 'simple present: Fragen und Verneinung mit do/does' },
      'Across cultures 2': { titel: 'How does it taste?', thema: 'britisches Essen' },
      'Unit 4': {
        titel: 'Happy birthday!',
        thema: 'Geburtstag, Kleidung, Einkaufen',
        grammatik: 'some/any, much/many, present progressive, simple present vs. present progressive'
      }
    }
  },
  'Green Line 2': {
    quelle: KLETT,
    kapitel: {
      'Welcome back': { titel: 'Welcome back!', thema: 'Ferien, Freizeit', grammatik: 'simple past von be' },
      'Unit 1': {
        titel: 'The new boy',
        thema: 'Schulalltag, Umzug, britisches und amerikanisches Englisch',
        grammatik: 'simple past (Aussagen, Verneinung, Fragen)'
      },
      'Media smart': { titel: 'Searching for information online', thema: 'Online-Recherche' },
      'Across cultures 1': { titel: 'London: A world city', ort: 'London' },
      'Unit 2': {
        titel: 'London: Wow!',
        thema: 'Sehenswürdigkeiten, Tube, Wegbeschreibung',
        ort: 'London',
        grammatik: 'going to-Futur, Steigerung der Adjektive'
      },
      'Unit 3': {
        titel: 'Star of the internet',
        thema: 'Internet, Videospiele, Sicherheit im Netz',
        grammatik: 'present perfect, present perfect vs. simple past, somebody/anything …'
      },
      'Across cultures 2': { titel: 'Special days in the British Isles', thema: 'Feiertage und Feste' },
      'Unit 4': { titel: "What's your sport?", thema: 'Sport, Wetter, Gesundheit', grammatik: 'will-Futur, if-Satz Typ 1, Bindewörter' },
      'Unit 5': {
        titel: 'Scotland, here we come!',
        thema: 'Reisen, Sehenswürdigkeiten',
        ort: 'Schottland',
        grammatik: 'Demonstrativpronomen, question tags, Adverbien der Art und Weise, Modalverben'
      }
    }
  },
  'Green Line 3': {
    quelle: KLETT,
    kapitel: {
      'Across cultures': { titel: 'The British Isles' },
      'Across cultures 1': { titel: 'The British Isles' },
      'Unit 1': {
        titel: 'The weekend workshop',
        thema: 'Lebensstile, Einkommensunterschiede, Gesellschaft in Großbritannien',
        grammatik: 'Modalverben und Ersatzformen, present perfect vs. simple past, notwendige Relativsätze, contact clauses'
      },
      'Text smart 1': { titel: 'Lyrical texts', thema: 'Gedichte und Songs' },
      'Unit 2': {
        titel: 'Welcome to Wales',
        thema: 'Stadt und Land, Kohlebergbau, Kelten, Legenden',
        ort: 'Wales',
        grammatik: 'if-Satz Typ 1 und 2, Reflexivpronomen'
      },
      'Across cultures 2': { titel: 'Staying with a host family' },
      'Media smart': { titel: 'The power of pictures' },
      'Unit 3': {
        titel: 'The Emerald Isle',
        thema: 'irische Kultur und Geschichte, St Patrick’s Day',
        ort: 'Irland, Dublin',
        grammatik: 'Passiv, past progressive, Adjektive nach bestimmten Verben'
      },
      'Text smart 2': { titel: 'Factual texts', thema: 'Sachtexte' },
      'Unit 4': {
        titel: 'Faces of Britain',
        thema: 'Britisches Empire, Migration, Rassismus, Vorbilder',
        ort: 'Großbritannien',
        grammatik: 'Adverbien der Art und Weise und ihre Steigerung, past perfect'
      },
      Trailer: { titel: 'A trip to Dublin', ort: 'Dublin' }
    }
  },
  'Green Line 4': {
    quelle: KLETT,
    kapitel: {
      'Across cultures 1': { titel: 'A first look at the USA', ort: 'USA' },
      'Unit 1': {
        titel: 'New York City: The Big Apple',
        thema: 'Einwanderung, „from rags to riches“, 9/11',
        ort: 'New York',
        grammatik: 'Wiederholung der Zeiten, indirekte Rede mit Zeitverschiebung, question tags'
      },
      'Across cultures 2': { titel: 'Schools in the US', ort: 'USA' },
      'Unit 2': {
        titel: 'A new life in New England',
        thema: 'Pilgrims, Thanksgiving, Boston Tea Party',
        ort: 'Neuengland (Plymouth, Boston)',
        grammatik: 'present perfect progressive, notwendige und nicht notwendige Relativsätze'
      },
      'Text smart 1': { titel: 'Visual texts', thema: 'Memes, Cartoons' },
      'Media smart': { titel: 'The framing effect' },
      'Unit 3': {
        titel: 'The Desert Southwest',
        thema: 'Old West, Westward expansion, Navajo',
        ort: 'Südwesten der USA',
        grammatik: 'if-Satz Typ 1–3, past perfect'
      },
      'Across cultures 3': { titel: 'Indigenous Americans' },
      'Text smart 2': { titel: 'Fictional texts' },
      'Unit 4': {
        titel: 'California – Pacific „paradise“?',
        thema: 'Silicon Valley, Einwanderung, Umwelt',
        ort: 'Kalifornien',
        grammatik: 'Gerundium, Infinitiv mit und ohne to, Gerundium vs. Infinitiv, Adverbialsätze'
      }
    }
  },
  'Green Line 5': {
    quelle: `${KLETT}; Green Line 5 G9`,
    kapitel: {
      'Across cultures 1': { titel: 'English around the world' },
      'Unit 1': {
        titel: 'Challenges down under',
        thema: 'First Nations, Stolen Generations, Buschfeuer, Einwanderung',
        ort: 'Australien',
        grammatik: 'Betonung (Inversion, betontes do, cleft sentences), Passiv, indirekte Rede'
      },
      'Revision A': { titel: 'The latest from Australia', ort: 'Australien' },
      'Across cultures 2': { titel: 'The same rights for everyone?', thema: 'Menschenrechte' },
      'Unit 2': {
        titel: 'Media in your life',
        thema: 'soziale Medien, KI, digital divide',
        grammatik: 'if-Satz Typ 1–3, phrasal verbs, future perfect und future progressive'
      },
      'Media smart': { titel: 'Artificial intelligence (AI)' },
      'Media Smart': { titel: 'Artificial intelligence (AI)' },
      'Revision B': { titel: 'The digital world' },
      'Unit 3': {
        titel: "That's my London!",
        thema: 'Gentrifizierung, Great Fire, Königsfamilie, Obdachlosigkeit',
        ort: 'London',
        grammatik: 'Satzadverbien, past perfect progressive, Partizipialsätze'
      },
      'Revision C': { titel: 'London: Then and now', ort: 'London' },
      'Trailer 1': { titel: 'Brexit: A forever decision?' },
      'Trailer 2': { titel: 'America: Politics and dreams' },
      'Trailer 3': { titel: 'The Voice' },
      'Trailer 4': { titel: 'The Fourth Plinth' }
    }
  },
  'Green Line 6': {
    quelle: `${KLETT}; Green Line 6 G9`,
    kapitel: {
      'Across cultures 1': { titel: 'British influence in Southeast Asia', thema: 'Kolonisierung' },
      'Unit 1': {
        titel: 'Singapore – The Lion City',
        thema: 'Leben im Stadtstaat',
        ort: 'Singapur',
        grammatik: 'Wiederholung der Zeiten, Passiv, present tenses mit Zukunftsbedeutung'
      },
      'Across cultures 2': { titel: 'Civil society starts with you' },
      'Unit 2': {
        titel: 'A shared world of difference',
        thema: 'Minderheiten, Regierungsformen, respektvolle Sprache',
        grammatik: 'Modalausdrücke, if-Satz Typ 1–3, Gerundium mit eigenem Subjekt'
      },
      'Media smart': { titel: 'Consumer awareness' },
      'Unit 3': { titel: 'A good read!', thema: 'Literatur, Gattungen, Analyse fiktionaler Texte' },
      'Trailer 1': { titel: 'What next for Britain and the EU?' },
      'Trailer 2': { titel: 'The USA and the world' }
    }
  },
  'Green Line Transition': {
    quelle: 'Klett, Stoffverteilungsplan Green Line Transition Niedersachsen (2024)',
    kapitel: {
      'Topic 1': { titel: 'Finding your identity' },
      'Topic 2': { titel: 'Living in a diverse society' },
      'Topic 3': { titel: 'Growing up with media and stories' },
      'Topic 4': { titel: 'Taking on responsibility' },
      'Topic 5': { titel: 'Living and working abroad', thema: 'Auslandsaufenthalt, Bewerbung, Lebenslauf' }
    }
  }
}

/** Themen eines Kapitels, falls hinterlegt */
export function kapitelThema(buch: string, kapitel: string): KapitelThema | undefined {
  return LEHRWERK_THEMEN[buch]?.kapitel[kapitel]
}

/** Kurze Beschreibung: „London: Wow! (London; Sehenswürdigkeiten, Tube …)“ */
export function kapitelKurz(k: KapitelThema): string {
  const zusatz = [k.ort, k.thema].filter(Boolean).join('; ')
  return zusatz ? `„${k.titel}“ (${zusatz})` : `„${k.titel}“`
}

/**
 * Die Kapitelreihenfolge eines Bandes – aus DIESER Tabelle, nicht aus der Lehrwerksdatei: Dort
 * stehen einzelne Kapitel (die „Revision“-Teile in Green Line 5) nach dem Import am Ende.
 */
export function kapitelFolge(buch: string): string[] {
  return Object.keys(LEHRWERK_THEMEN[buch]?.kapitel ?? {})
}

/**
 * Was eine Gruppe nach dieser Auswahl kennt und was als Nächstes kommt.
 *
 * Bekannt ist alles VOR der gewählten Unit – dieselbe Grenze wie beim bekannten Wortschatz
 * (knownVocab.ts). Ist die Unit nicht hinterlegt, weiß die App nichts und sagt nichts.
 */
export function lehrwerkStand(
  buch: string,
  unit: string
): { vorher: { name: string; k: KapitelThema }[]; aktuell?: KapitelThema; danach: { name: string; k: KapitelThema }[] } {
  const kapitel = kapitelFolge(buch)
  const i = kapitel.indexOf(unit)
  const mit = (namen: string[]) => namen.map((name) => ({ name, k: LEHRWERK_THEMEN[buch].kapitel[name] }))
  if (i < 0) return { vorher: [], danach: [] }
  return { vorher: mit(kapitel.slice(0, i)), aktuell: kapitelThema(buch, unit), danach: mit(kapitel.slice(i + 1)) }
}
