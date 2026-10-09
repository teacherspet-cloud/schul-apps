/**
 * Grammatik der Green-Line-Bände je Unit und Station – Ausgabe Niedersachsen, zusammengestellt von der Lehrkraft
 * (Liste „Grammatikthemen", 07.10.2026) und hier fest den Katalogthemen zugeordnet. Unklare Angaben mit der Lehrkraft
 * abgestimmt (07.10.2026): Artikel = a vs. an; Präpositionen in GL1 nur Ort; Linking words, Modalverben (GL2 U5),
 * Infinitive constructions (GL4), Emphatic forms (GL5), Modal expressions (GL6) wie im jeweiligen Text genannt;
 * Adverbs of manner in GL3 ohne Steigerung; Passiv in GL6 = Passiv für formellere Texte. Trailer sind optional:
 * Ihre Grammatik wird vorgeschlagen, gilt aber nicht als bekannt.
 *
 * Wozu: Die Grammatikauswahl schlägt je Unit bzw. Station die passenden Katalogthemen vor (sicher, nicht geraten),
 * und die Erzeugung weiß, welche Grammatik eine Lerngruppe an ihrer Stelle im Lehrwerk schon kennt
 * (`bekannteGrammatik`) – alles aus früheren Bänden, Units und Stationen.
 *
 * Je Eintrag: `text` wie in der Liste (Tippfehler berichtigt), `t` die Katalogthemen bzw. Teilformen („thema/teilform"),
 * `w` = Wiederholung (schon früher eingeführt). Ein leeres `t` ist keine Grammatik im Katalogsinn (z. B. australisches
 * Englisch) und wird nur genannt. Station '' = das ganze Kapitel (Welcome back, Trailer).
 * Green Line 5 Trailer 1–2 und Unit 3 Station 3 haben laut Liste keine Grammatik.
 */

export interface LehrwerkGrammatikPunkt {
  text: string
  /** Katalogthemen („en.verb.past_simple") oder Teilformen („en.verb.past_simple/fragen") */
  t: string[]
  /** Wiederholung eines früher eingeführten Themas */
  w?: true
}

type Band = Record<string, Record<string, LehrwerkGrammatikPunkt[]>>

const P = (text: string, t: string[], w?: true): LehrwerkGrammatikPunkt => (w ? { text, t, w } : { text, t })

export const QUELLE_NDS = 'Grammatikthemen Green Line Niedersachsen (Liste der Lehrkraft, 07.10.2026)'

export const LEHRWERK_GRAMMATIK: Record<string, Band> = {
  'Green Line 1': {
    'Unit 1': {
      'Station 1': [
        P('Nomen und Artikel (a vs. an)', ['en.noun.articles/a-an']),
        P('to be: Kurzformen, Verneinung, Fragen und Kurzantworten', [
          'en.verb.be_have/be-praesens',
          'en.verb.be_have/be-kurzformen',
          'en.verb.be_have/be-fragen',
          'en.syn.short_answers/be'
        ])
      ],
      'Station 2': [
        P('Präpositionen (in, on, in front of, between …)', ['en.prep.basic/ort']),
        P('there is / there are: Aussagesätze, Fragen', ['en.verb.there_is/praesens', 'en.verb.there_is/fragen'])
      ],
      'Station 3': [
        P('Modalverb can / can’t', ['en.verb.modals_basic/can']),
        P('Imperativ', ['en.syn.imperative/bejaht', 'en.syn.imperative/verneint']),
        P('Personalpronomen', ['en.pron.personal/subjekt']),
        P('Possessivbegleiter', ['en.pron.possessive_det'])
      ]
    },
    'Unit 2': {
      'Station 1': [P('Besitzangaben mit ’s und s’', ['en.noun.genitive/s-genitiv', 'en.noun.genitive/plural-genitiv'])],
      'Station 2': [P('simple present: Aussagesätze', ['en.verb.present_simple/bejahung', 'en.verb.present_simple/schreibung'])],
      'Station 3': [
        P('simple present: Bildung, Satzstellung', ['en.verb.present_simple/bejahung', 'en.syn.word_order/svo']),
        P('Objektformen der Personalpronomen', ['en.pron.personal/objekt'])
      ]
    },
    'Unit 3': {
      'Station 1': [
        P('simple present: Fragen und Kurzantworten mit do/does, Verneinung', [
          'en.verb.present_simple/fragen',
          'en.verb.present_simple/kurzantworten',
          'en.verb.present_simple/verneinung',
          'en.syn.short_answers/do-does-did',
          'en.syn.negation/do-praesens'
        ])
      ],
      'Station 2': [P('simple present: Fragen mit Fragewörtern', ['en.syn.questions/w-fragen', 'en.pron.interrogative'])]
    },
    'Unit 4': {
      'Station 1': [
        P('some, any', ['en.noun.quantifiers/some-any']),
        P('much, many', ['en.noun.quantifiers/much-many']),
        P('a lot of / lots of', ['en.noun.quantifiers/a-lot-of']),
        P('a few, a little, a couple of', ['en.noun.quantifiers/few-little']),
        P('Mengenangaben mit of', ['en.noun.count_uncount/partitive'])
      ],
      'Station 2': [
        P('present progressive: Aussagesätze, Fragen und Kurzantworten', [
          'en.verb.present_progressive/bildung',
          'en.verb.present_progressive/schreibung',
          'en.verb.present_progressive/fragen',
          'en.syn.short_answers/be'
        ]),
        P('Vergleich: simple present und present progressive', ['en.verb.present_contrast'])
      ]
    },
    Trailer: { '': [P('going to-future', ['en.verb.going_to/bildung', 'en.verb.going_to/absicht'])] }
  },
  'Green Line 2': {
    'Welcome back': { '': [P('simple past: Formen von be', ['en.verb.past_simple/was-were', 'en.verb.be_have/be-vergangenheit'])] },
    'Unit 1': {
      'Station 1': [
        P('simple past: regelmäßige und unregelmäßige Verben', [
          'en.verb.past_simple/regelmaessig',
          'en.verb.past_simple/schreibung',
          'en.verb.past_simple/aussprache',
          'en.verb.past_simple/unregelmaessig',
          'en.verb.past_simple/signalwoerter'
        ])
      ],
      'Station 3': [
        P('simple past: Verneinung, Fragen', [
          'en.verb.past_simple/verneinung',
          'en.verb.past_simple/fragen',
          'en.verb.past_simple/kurzantworten',
          'en.syn.negation/did'
        ])
      ]
    },
    'Unit 2': {
      'Station 1': [P('going to-future: Aussagen, Fragen', ['en.verb.going_to'])],
      'Station 2': [P('Steigerung von Adjektiven', ['en.adj.comparison'])]
    },
    'Unit 3': {
      'Station 1': [
        P('present perfect: Aussagen', [
          'en.verb.present_perfect/bildung',
          'en.verb.present_perfect/partizip',
          'en.verb.present_perfect/resultativ',
          'en.verb.present_perfect/erfahrung'
        ])
      ],
      'Station 2': [P('present perfect: Fragen', ['en.verb.present_perfect/verneinung-fragen'])],
      'Station 3': [P('Vergleich: present perfect und simple past', ['en.verb.pp_vs_past']), P('Zusammensetzungen mit some und any', ['en.pron.indefinite'])]
    },
    'Unit 4': {
      'Station 1': [P('will-future: Aussagen, Fragen', ['en.verb.will_future'])],
      'Station 2': [P('Bedingungssätze Typ 1', ['en.cond.type1']), P('Vergleich present perfect und simple past', ['en.verb.pp_vs_past'], true)],
      'Station 3': [
        P('Linking words (and, but, so, when, whenever, because, so that, although / though / even though)', [
          'en.clause.adverbial_basic/und-aber-oder',
          'en.clause.adverbial_basic/zeit',
          'en.clause.adverbial_basic/grund',
          'en.clause.adverbial_basic/folge',
          'en.clause.adverbial_ext/zweck',
          'en.clause.adverbial_ext/einraeumung'
        ])
      ]
    },
    'Unit 5': {
      'Station 1': [
        P('Stützwörter one / ones', ['en.pron.prop_one']),
        P('Wortbildung: Präfixe, Suffixe', ['en.wf.affixes1']),
        P('Demonstrativpronomen', ['en.pron.demonstrative']),
        P('Question tags', ['en.syn.question_tags'])
      ],
      'Station 2': [
        P('Adverbs of manner', ['en.adv.manner', 'en.adv.formation']),
        P('Vergleich: Adjektive und Adverbien', ['en.adv.formation/adjektiv-adverb']),
        P('Steigerung von Adverbien', ['en.adv.comparison'])
      ],
      'Station 3': [
        P("Modalverben (can, can't, must, mustn't, should, could, would)", [
          'en.verb.modals_basic/can',
          'en.verb.modals_basic/must',
          'en.verb.modals_basic/mustnt',
          'en.verb.modals_ext/could',
          'en.verb.modals_ext/should',
          'en.verb.modals_ext/would-like'
        ])
      ]
    },
    'Trailer 1': { '': [P('Defining relative clauses', ['en.clause.relative_def']), P('Contact clauses', ['en.clause.relative_def/kontaktsatz'])] },
    'Trailer 2': { '': [P('past progressive', ['en.verb.past_progressive'])] },
    'Trailer 3': { '': [P('Bedingungssätze Typ 2', ['en.cond.type2'])] },
    'Trailer 4': { '': [P('Ersatzformen der Modalverben', ['en.verb.modals_subst'])] },
    'Trailer 5': { '': [P('Indirekte Rede ohne tense shift', ['en.reported.no_backshift'])] }
  },
  'Green Line 3': {
    'Unit 1': {
      'Station 1': [P('Modalverben und ihre Ersatzformen', ['en.verb.modals_subst'])],
      'Station 2': [P('Kontrastierung present perfect und simple past', ['en.verb.pp_vs_past'], true)],
      'Station 3': [P('Notwendige Relativsätze', ['en.clause.relative_def']), P('Contact clauses', ['en.clause.relative_def/kontaktsatz'])]
    },
    'Unit 2': {
      'Station 1': [P('Bedingungssätze Typ 1', ['en.cond.type1'], true)],
      'Station 2': [P('Bedingungssätze Typ 2', ['en.cond.type2'])],
      'Station 3': [
        P('Reflexivpronomen', ['en.pron.reflexive/formen', 'en.pron.reflexive/dt-reflexiv', 'en.pron.reflexive/engl-reflexiv', 'en.pron.reflexive/by-myself']),
        P('each other', ['en.pron.reflexive/each-other'])
      ]
    },
    'Unit 3': {
      'Station 1': [P('Passivformen', ['en.verb.passive_basic'])],
      'Station 2': [P('past progressive', ['en.verb.past_progressive'])],
      'Station 3': [P('Adjectives after certain verbs', ['en.adj.perception'])]
    },
    'Unit 4': {
      'Station 1': [P('Adverbs of manner', ['en.adv.manner', 'en.adv.formation'])],
      'Station 2': [P('past perfect', ['en.verb.past_perfect']), P('Adverbs of degree', ['en.adv.degree'])]
    },
    Trailer: { '': [P('Indirekte Rede ohne tense shift', ['en.reported.no_backshift'])] }
  },
  'Green Line 4': {
    'Unit 1': {
      'Station 1': [
        P(
          'simple present, present progressive, present perfect, simple past, past perfect',
          ['en.verb.present_simple', 'en.verb.present_progressive', 'en.verb.present_perfect', 'en.verb.past_simple', 'en.verb.past_perfect'],
          true
        )
      ],
      'Station 2': [
        P('Indirect speech: statements', [
          'en.reported.backshift/backshift-zeiten',
          'en.reported.backshift/modalverben',
          'en.reported.backshift/orts-zeitangaben',
          'en.reported.backshift/say-tell'
        ]),
        P('Question tags', ['en.syn.question_tags'])
      ],
      'Station 3': [
        P('Amerikanisches vs. britisches Englisch', ['en.var.ame']),
        P('Indirect speech: questions, commands and requests', [
          'en.reported.backshift/ja-nein-fragen',
          'en.reported.backshift/w-fragen',
          'en.reported.backshift/aufforderungen'
        ])
      ]
    },
    'Unit 2': {
      'Station 1': [P('present perfect progressive', ['en.verb.present_perfect_prog'])],
      'Station 2': [
        P('defining relative clauses, contact clauses', ['en.clause.relative_def'], true),
        P('Non-defining relative clauses', ['en.clause.relative_nondef'])
      ]
    },
    'Unit 3': {
      'Station 1': [P('Conditional sentences type 1 and 2', ['en.cond.type1', 'en.cond.type2'], true)],
      'Station 2': [P('past perfect', ['en.verb.past_perfect'], true)],
      'Station 3': [P('Conditional sentences type 3', ['en.cond.type3/bildung', 'en.cond.type3/could-might-have', 'en.cond.type3/bedauern'])]
    },
    'Unit 4': {
      'Station 1': [
        P('Gerunds', ['en.verb.gerund']),
        P(
          'Infinitive constructions (indirect questions with infinitives / after whether, with and without to, after certain verbs, after verb + question word, after superlatives, after verb + object, without to after modal verbs and after let / make + object)',
          [
            'en.verb.infinitive/fragewort',
            'en.verb.infinitive/ohne-to',
            'en.verb.infinitive/first-to',
            'en.verb.infinitive/verb-objekt-inf',
            'en.verb.ger_vs_inf/nur-infinitiv',
            'en.verb.make_let/make',
            'en.verb.make_let/let'
          ]
        )
      ],
      'Station 2': [P('Gerund or infinitive?', ['en.verb.ger_vs_inf'])],
      'Station 3': [
        P('Adverbial clauses of time, purpose, result', ['en.clause.adverbial_basic/zeit', 'en.clause.adverbial_basic/folge', 'en.clause.adverbial_ext/zweck'])
      ]
    },
    'Trailer 1': { '': [P('simple present and present progressive with future meaning', ['en.verb.future_present'])] },
    'Trailer 2': { '': [P('past perfect progressive', ['en.verb.past_perfect_prog'])] },
    'Trailer 3': { '': [P('future perfect', ['en.verb.future_perfect'])] }
  },
  'Green Line 5': {
    'Unit 1': {
      'Station 1': [
        P('Australisches Englisch', []),
        P('Emphatic forms (Inversion, betontes do, cleft sentences, -self zur Betonung)', [
          'en.focus.emphasis',
          'en.focus.emphatic_do',
          'en.focus.cleft',
          'en.focus.inversion',
          'en.pron.emphatic'
        ])
      ],
      'Station 2': [P('Passive forms', ['en.verb.passive_basic', 'en.verb.passive_ext'], true), P('Two-part conjunctions', ['en.syn.linking/either-or'])],
      'Station 3': [P('Indirect speech with tense shift', ['en.reported.backshift'], true)]
    },
    'Unit 2': {
      'Station 1': [P('Conditional sentences type 1, 2 and 3', ['en.cond.type1', 'en.cond.type2', 'en.cond.type3'], true)],
      'Station 2': [P('Present participle or infinitive after verbs of perception', ['en.verb.perception_object']), P('Phrasal verbs', ['en.verb.phrasal'])],
      'Station 3': [
        P('Dynamic and stative verbs', ['en.verb.stative_dynamic']),
        P('Future progressive', ['en.verb.future_prog']),
        P('Future perfect', ['en.verb.future_perfect'])
      ]
    },
    'Unit 3': {
      'Station 1': [P('Sentence adverbs', ['en.adv.sentence'])],
      'Station 2': [P('past perfect progressive', ['en.verb.past_perfect_prog']), P('Participle clauses', ['en.verb.participle'])]
    },
    'Trailer 3': {
      '': [P('Defining relative clauses', ['en.clause.relative_def'], true), P('Non-defining relative clauses', ['en.clause.relative_nondef'], true)]
    },
    'Trailer 4': { '': [P('Gerund constructions', ['en.verb.gerund'])] }
  },
  'Green Line 6': {
    'Unit 1': {
      'Station 1': [P('Tense revision', ['en.verb.tense_aspect_overview'], true)],
      'Station 2': [
        P('Passive forms (Passiv für formellere Texte)', ['en.verb.passive_reporting', 'en.verb.passive_ext', 'en.syn.nominal_style/unpersoenlich'])
      ],
      'Station 3': [P('simple present and present progressive with future meaning', ['en.verb.future_present'])]
    },
    'Unit 2': {
      'Station 1': [
        P('Modal expressions (be said to, be supposed to, be certain to, happen to, be likely to, ought to, shall, should, might, used to, would)', [
          'en.verb.passive_reporting/persoenlich',
          'en.verb.passive_reporting/supposed-likely',
          'en.verb.modals_adv/ought-to',
          'en.verb.modals_adv/be-supposed-to',
          'en.verb.modals_adv/shall-should',
          'en.verb.modals_adv/might-could-moeglichkeit',
          'en.verb.used_to/used-to-bejahung',
          'en.verb.used_to/used-to-verneinung',
          'en.verb.used_to/used-to-fragen',
          'en.verb.used_to/would-gewohnheit'
        ])
      ],
      'Station 2': [P('Conditional sentences type 1, 2 and 3', ['en.cond.type1', 'en.cond.type2', 'en.cond.type3'], true)],
      'Station 3': [
        P('Phrasal verbs', ['en.verb.phrasal']),
        P('Infinitives with and without to', ['en.verb.infinitive']),
        P('Gerund with its own subject', ['en.verb.gerund/eigenes-subjekt'])
      ]
    }
  }
}

/** Reihenfolge der Abschnitte innerhalb einer Unit (wie in den Lehrwerksdateien) */
export const ABSCHNITT_FOLGE = ['Check-in', 'Introduction', 'Station 1', 'Station 2', 'Station 3', 'Story', 'Unit task', 'Check-out']

/** Kurztext eines Kapitels aus der Liste („Artikel, to be …") – für Vorwissen und Planung */
export function grammatikText(buch: string, kapitel: string): string | undefined {
  const k = LEHRWERK_GRAMMATIK[buch]?.[kapitel]
  if (!k) return undefined
  return Object.values(k)
    .flat()
    .map((p) => (p.w ? `${p.text} (Wiederholung)` : p.text))
    .join(', ')
}

/** Stationen eines Kapitels mit Grammatik, in Buchreihenfolge ('' = ganzes Kapitel) */
export function grammatikStationen(buch: string, kapitel: string): string[] {
  const k = LEHRWERK_GRAMMATIK[buch]?.[kapitel]
  if (!k) return []
  return Object.keys(k).sort((a, b) => ABSCHNITT_FOLGE.indexOf(a) - ABSCHNITT_FOLGE.indexOf(b))
}

/** Trailer sind optional (abgestimmt 07.10.2026): vorgeschlagen ja, als bekannt vorausgesetzt nein */
export const istOptional = (kapitel: string): boolean => /^trailer\b/i.test(kapitel)

/** Liegt die Station vor dem Abschnitt? (unbekannter Abschnitt: nichts aus dieser Unit gilt als bekannt) */
function stationVor(station: string, abschnitt: string | undefined): boolean {
  const a = abschnitt ? ABSCHNITT_FOLGE.indexOf(abschnitt) : -1
  const s = ABSCHNITT_FOLGE.indexOf(station)
  return a >= 0 && s >= 0 && s < a
}

/**
 * Was eine Lerngruppe an dieser Stelle im Lehrwerk an Grammatik kennt: alles aus früheren Bänden, früheren Kapiteln
 * und früheren Stationen der Unit. `neu` = die Grammatik der gewählten Unit ab dem Abschnitt (wird gerade gelernt),
 * `spaeter` = was im Band danach kommt (soll noch nicht vorausgesetzt werden).
 */
export function bekannteGrammatik(
  kapitelFolge: string[],
  buch: string,
  unit: string,
  abschnitt?: string,
  fruehereBaende: { buch: string; kapitel: string[] }[] = []
): { bekannt: LehrwerkGrammatikPunkt[]; neu: LehrwerkGrammatikPunkt[]; spaeter: LehrwerkGrammatikPunkt[] } {
  const alle = (b: string, k: string): LehrwerkGrammatikPunkt[] => Object.values(LEHRWERK_GRAMMATIK[b]?.[k] ?? {}).flat()
  const bekannt: LehrwerkGrammatikPunkt[] = fruehereBaende.flatMap((f) => f.kapitel.filter((k) => !istOptional(k)).flatMap((k) => alle(f.buch, k)))
  const neu: LehrwerkGrammatikPunkt[] = []
  const spaeter: LehrwerkGrammatikPunkt[] = []
  const i = kapitelFolge.indexOf(unit)
  kapitelFolge.forEach((k, j) => {
    if (i < 0 || j > i) return spaeter.push(...alle(buch, k))
    if (j < i) return istOptional(k) ? undefined : bekannt.push(...alle(buch, k))
    for (const s of grammatikStationen(buch, k)) (stationVor(s, abschnitt) ? bekannt : neu).push(...(LEHRWERK_GRAMMATIK[buch][k][s] ?? []))
  })
  return { bekannt, neu, spaeter }
}

/** Alle Katalogkennungen (Themen und Teilformen) der Liste – für die Prüfung in tests/lehrwerkGrammatik.test.ts */
export const ALLE_KENNUNGEN = Object.values(LEHRWERK_GRAMMATIK).flatMap((b) =>
  Object.values(b).flatMap((k) => Object.values(k).flatMap((l) => l.flatMap((p) => p.t)))
)
