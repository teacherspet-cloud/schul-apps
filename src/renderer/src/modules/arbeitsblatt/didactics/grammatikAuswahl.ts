/**
 * Hilfsfunktionen der Grammatik-Themenauswahl (abgestimmt 06.10.2026, „Kombination", Recherche
 * recherche/einstellungen-und-themenauswahl-2026-10-06.md Teil B):
 *  - Suche deutsch UND englisch über Name, Fachbegriff, Bereich und Teilformen, dazu einfache Synonyme
 *    („Perfekt" findet „present perfect", „passive" findet „Passiv").
 *  - Filter nach Lernjahr/Jahrgang und GER-Einführungsniveau.
 *  - Lehrwerk-Schnellwahl: Grammatik der Units (shared/lehrwerkThemen.ts) auf Katalogthemen abbilden. Sicher ist nur, was
 *    die feste Zuordnungstabelle kennt; alles andere ist ein Vorschlag, den die Lehrkraft selbst anklickt.
 *  - Zuletzt benutzt und Favoriten je Fach (localStorage, Fehler werden geschluckt).
 *
 * Das Datenformat der Auswahl bleibt unverändert: Themen-Kennungen und Teilformen als „thema/teilform".
 */
import { GRAMMAR_TOPICS, einfuehrungsNiveau, defaultSequence, teilformenFuer, topicStart, type GrammarQuery, type GrammarTopic } from './grammar'
import { LEHRWERK_THEMEN, kapitelFolge } from '../../../shared/lehrwerkThemen'
import { grammatikStationen, LEHRWERK_GRAMMATIK } from '../../../shared/lehrwerkGrammatik'

/** Kleinbuchstaben, Umlaute ausgeschrieben, Akzente weg – damit „Präsens", „praesens" und „présent" zusammenfinden */
export function normalisiere(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'")
}

/**
 * Einfache Synonyme deutsch/englisch (Schulgrammatik). Je Gruppe gleichwertige Suchwörter; mehrteilige Begriffe sind
 * erlaubt. Bewusst knapp – die Daten tragen ohnehin deutschen Namen UND Fachbegriff.
 */
const SYNONYME_ROH: string[][] = [
  ['perfekt', 'present perfect'],
  ['vergangenheit', 'praeteritum', 'imperfekt', 'simple past', 'past'],
  ['vorvergangenheit', 'plusquamperfekt', 'past perfect'],
  ['gegenwart', 'praesens', 'present'],
  ['zukunft', 'futur', 'future', 'will', 'going to'],
  ['verlaufsform', 'progressive', 'continuous'],
  ['passiv', 'passive'],
  ['steigerung', 'vergleich', 'komparativ', 'superlativ', 'comparison', 'comparative', 'superlative'],
  ['bedingungssatz', 'konditionalsatz', 'if-satz', 'conditional', 'if-clause'],
  ['relativsatz', 'relativpronomen', 'relative clause', 'contact clause', 'kontaktsatz'],
  ['indirekte rede', 'reported speech', 'indirect speech'],
  ['gerundium', 'gerund'],
  ['infinitiv', 'infinitive'],
  ['partizip', 'participle'],
  ['modalverb', 'modal'],
  ['hilfsverb', 'auxiliary'],
  ['frage', 'question'],
  ['verneinung', 'verneint', 'negation', 'negative'],
  ['kurzantwort', 'short answer'],
  ['bestaetigungsfrage', 'frageanhaengsel', 'question tag'],
  ['befehlsform', 'imperativ', 'imperative'],
  ['mehrzahl', 'plural'],
  ['einzahl', 'singular'],
  ['artikel', 'begleiter', 'article', 'determiner'],
  ['pronomen', 'fuerwort', 'pronoun'],
  ['adjektiv', 'eigenschaftswort', 'adjective'],
  ['adverb', 'umstandswort'],
  ['praeposition', 'verhaeltniswort', 'preposition'],
  ['bindewort', 'konjunktion', 'konnektor', 'linking', 'conjunction', 'connective'],
  ['nebensatz', 'gliedsatz', 'clause'],
  ['wortstellung', 'satzstellung', 'satzbau', 'word order'],
  ['genitiv', 'besitz', 'possessive'],
  ['mengenangabe', 'mengenwort', 'quantifier'],
  ['konjunktiv', 'subjunctive', 'subjonctif', 'subjuntivo'],
  ['zahl', 'uhrzeit', 'datum', 'number'],
  ['wortbildung', 'word formation'],
  ['reflexiv', 'rueckbezueglich', 'reflexive'],
  ['unregelmaessig', 'irregular'],
  ['regelmaessig', 'regular']
]
const SYNONYME = SYNONYME_ROH.map((g) => g.map(normalisiere))

/** Ein Suchwort und seine Synonyme (Wortanfang genügt: „steig" → Steigerung, comparison …) */
export function alternativen(wort: string): string[] {
  const w = normalisiere(wort)
  const extra = SYNONYME.filter((g) => g.some((s) => s === w || (w.length >= 3 && s.startsWith(w)) || (s.length >= 4 && w.startsWith(s)))).flat()
  return [...new Set([w, ...extra])]
}

const suchCache = new Map<string, string>()
/** Alles, worin gesucht wird: Name, Fachbegriff, Bereich, Teilformen (Name und Fachbegriff) */
export function suchText(t: GrammarTopic): string {
  const vorhanden = suchCache.get(t.id)
  if (vorhanden !== undefined) return vorhanden
  const text = normalisiere([t.label, t.term, t.area, ...(t.teilformen ?? []).flatMap((x) => [x.label, x.term ?? ''])].join(' | '))
  suchCache.set(t.id, text)
  return text
}

/** Passt ein Thema zur Suche? Ganzer Ausdruck, sonst jedes Wort (mit Synonymen) muss vorkommen. */
export function passtZurSuche(t: GrammarTopic, suche: string): boolean {
  const n = normalisiere(suche).trim()
  if (!n) return true
  const text = suchText(t)
  if (text.includes(n)) return true
  const woerter = n.split(/[\s/,;:()]+/).filter((w) => w.length >= 2)
  if (!woerter.length) return false
  return woerter.every((w) => alternativen(w).some((a) => text.includes(a)))
}

/** Rang eines Treffers: 0 Name/Fachbegriff beginnt so, 1 enthält es, 2 Bereich, 3 Teilform oder Synonym */
export function suchRang(t: GrammarTopic, suche: string): number {
  const n = normalisiere(suche).trim()
  const name = normalisiere(t.label)
  const term = normalisiere(t.term)
  if (name.startsWith(n) || term.startsWith(n)) return 0
  if (name.includes(n) || term.includes(n)) return 1
  if (normalisiere(t.area).includes(n)) return 2
  return 3
}

/**
 * Treffer der Suche, die besten zuerst; bei gleichem Rang der kürzere Fachbegriff („present perfect simple" vor
 * „present perfect vs. simple past"), dann die Reihenfolge des Katalogs
 */
export function sucheThemen(themen: GrammarTopic[], suche: string): GrammarTopic[] {
  if (!suche.trim()) return themen
  return themen
    .filter((t) => passtZurSuche(t, suche))
    .map((t, i) => ({ t, i, r: suchRang(t, suche), l: Math.min(t.term.length || 99, t.label.length) }))
    .sort((a, b) => a.r - b.r || (a.r <= 1 ? a.l - b.l : 0) || a.i - b.i)
    .map((x) => x.t)
}

/** Oberbereich für die Kacheln: „Verb/Zeiten" → „Verb" */
export const oberBereich = (area: string): string => area.split('/')[0].trim()

/** Stufenfenster eines Themas auf der Skala der Lerngruppe (Lernjahr nach Fremdsprachenfolge, sonst Jahrgang/Stufe) */
export function stufenFenster(t: GrammarTopic, query: Pick<GrammarQuery, 'sequence' | 'grade'>): [number, number] {
  if (t.scale !== 'lernjahr') return [t.from, t.to]
  const seq = query.sequence ?? defaultSequence(t.subject, query.grade)
  return [topicStart(t, seq), topicStart({ ...t, from: t.to, lateStart: undefined }, seq)]
}

/** Filter „Lernjahr/Jahrgang N": Thema wird in N behandelt */
export function inStufe(t: GrammarTopic, stufe: number, query: Pick<GrammarQuery, 'sequence' | 'grade'>): boolean {
  const [a, b] = stufenFenster(t, query)
  return stufe >= a && stufe <= b
}

/** Filter GER: Thema wird auf diesem Niveau eingeführt (A1 trifft „A1" und „A1/A2", nicht „A1+") */
export const aufNiveau = (t: GrammarTopic, niveau: string): boolean => einfuehrungsNiveau(t.level) === niveau

/** Teilformen eines Themas, die für die Lerngruppe in Frage kommen, und wie viele davon gewählt sind */
export function teilZaehler(
  t: GrammarTopic,
  query: GrammarQuery,
  teilformen: string[]
): { gewaehlt: number; passend: number; gesamt: number; eingeschraenkt: boolean } {
  const liste = teilformenFuer(t, query)
  const passend = liste.filter((x) => x.status !== 'spaeter').length
  const eigene = teilformen.filter((k) => k.startsWith(`${t.id}/`)).length
  return { gewaehlt: eigene || passend, passend, gesamt: liste.length, eingeschraenkt: eigene > 0 }
}

// ---------------------------------------------------------------- Lehrwerk / Unit

/** Feste Zuordnung der Lehrwerks-Grammatik (Green Line) zu Katalogthemen. Erste passende Zeile gewinnt. */
interface Zuordnung {
  muster: RegExp
  ids: string[]
  /** Nur diese Teilformen (Kennung der Teilform) – gilt bei genau einem Thema */
  teile?: string[]
  /** Mehrere Themen kommen in Frage: nur vorschlagen, nicht selbst wählen */
  unsicher?: boolean
  /** Gilt nur in diesen Bänden */
  baende?: string[]
}

const GL_BIS_4 = ['Green Line 1', 'Green Line 2', 'Green Line 3', 'Green Line 4']

const ZUORDNUNG_EN: Zuordnung[] = [
  { muster: /^simple present vs\.? present progressive/, ids: ['en.verb.present_contrast'] },
  { muster: /^present perfect vs\.? simple past/, ids: ['en.verb.pp_vs_past'] },
  { muster: /^present perfect progressive/, ids: ['en.verb.present_perfect_prog'] },
  { muster: /^past perfect progressive/, ids: ['en.verb.past_perfect_prog'] },
  { muster: /^present perfect/, ids: ['en.verb.present_perfect'] },
  { muster: /^past perfect/, ids: ['en.verb.past_perfect'] },
  { muster: /^past progressive/, ids: ['en.verb.past_progressive'] },
  { muster: /^present progressive/, ids: ['en.verb.present_progressive'] },
  { muster: /^simple past von be/, ids: ['en.verb.past_simple'], teile: ['was-were'] },
  { muster: /^simple past/, ids: ['en.verb.past_simple'] },
  { muster: /^simple present: fragen und verneinung/, ids: ['en.verb.present_simple'], teile: ['verneinung', 'fragen'] },
  { muster: /^simple present \(aussagen\)/, ids: ['en.verb.present_simple'], teile: ['bejahung', 'schreibung'] },
  { muster: /^simple present/, ids: ['en.verb.present_simple'] },
  { muster: /^present tenses mit zukunft/, ids: ['en.verb.future_present'] },
  { muster: /^future perfect und future progressive/, ids: ['en.verb.future_perfect', 'en.verb.future_prog'] },
  { muster: /^going to/, ids: ['en.verb.going_to'] },
  { muster: /^will-futur/, ids: ['en.verb.will_future'] },
  { muster: /^if-satz typ 1\s*[–-]\s*3/, ids: ['en.cond.type1', 'en.cond.type2', 'en.cond.type3'] },
  { muster: /^if-satz typ 1 und 2/, ids: ['en.cond.type1', 'en.cond.type2'] },
  { muster: /^if-satz typ 1/, ids: ['en.cond.type1'] },
  { muster: /^steigerung der adjektive/, ids: ['en.adj.comparison'] },
  { muster: /^adverbien der art und weise und ihre steigerung/, ids: ['en.adv.manner', 'en.adv.comparison'] },
  { muster: /^adverbien der art und weise/, ids: ['en.adv.manner'] },
  { muster: /^haeufigkeitsadverbien/, ids: ['en.adv.frequency_order'] },
  { muster: /^satzadverbien/, ids: ['en.adv.sentence'] },
  { muster: /^s-genitiv/, ids: ['en.noun.genitive'] },
  { muster: /^have got/, ids: ['en.verb.have_got'] },
  { muster: /^be$/, ids: ['en.verb.be_have'] },
  { muster: /^there is\s*\/\s*are/, ids: ['en.verb.there_is'] },
  { muster: /^can$/, ids: ['en.verb.modals_basic'], teile: ['can'] },
  { muster: /^imperativ/, ids: ['en.syn.imperative'] },
  { muster: /^personalpronomen/, ids: ['en.pron.personal'] },
  { muster: /^objektpronomen/, ids: ['en.pron.personal'], teile: ['objekt'] },
  { muster: /^artikel$/, ids: ['en.noun.articles'] },
  { muster: /^plural$/, ids: ['en.noun.plural'] },
  { muster: /^some\s*\/\s*any/, ids: ['en.noun.quantifiers'], teile: ['some-any'] },
  { muster: /^much\s*\/\s*many/, ids: ['en.noun.quantifiers'], teile: ['much-many'] },
  { muster: /^somebody\s*\/\s*anything/, ids: ['en.pron.indefinite'] },
  { muster: /^demonstrativpronomen/, ids: ['en.pron.demonstrative'] },
  { muster: /^question tags/, ids: ['en.syn.question_tags'] },
  { muster: /^reflexivpronomen/, ids: ['en.pron.reflexive'] },
  { muster: /^modalverben und ersatzformen/, ids: ['en.verb.modals_subst'] },
  { muster: /^modalverben$/, ids: ['en.verb.modals_ext', 'en.verb.modals_subst'], unsicher: true },
  { muster: /^modalausdruecke/, ids: ['en.verb.modals_adv', 'en.verb.modal_perfect'], unsicher: true },
  { muster: /^notwendige und nicht notwendige relativsaetze/, ids: ['en.clause.relative_def', 'en.clause.relative_nondef'] },
  { muster: /^notwendige relativsaetze/, ids: ['en.clause.relative_def'] },
  { muster: /^contact clauses/, ids: ['en.clause.relative_def'], teile: ['kontaktsatz'] },
  { muster: /^passiv$/, ids: ['en.verb.passive_basic'], baende: GL_BIS_4 },
  { muster: /^passiv$/, ids: ['en.verb.passive_ext', 'en.verb.passive_basic'], unsicher: true },
  { muster: /^adjektive nach bestimmten verben/, ids: ['en.adj.perception'] },
  { muster: /^wiederholung der zeiten/, ids: ['en.verb.tense_aspect_overview'], unsicher: true },
  { muster: /^indirekte rede/, ids: ['en.reported.backshift'] },
  { muster: /^gerundium vs\.? infinitiv/, ids: ['en.verb.ger_vs_inf'] },
  { muster: /^gerundium mit eigenem subjekt/, ids: ['en.verb.gerund'], teile: ['eigenes-subjekt'] },
  { muster: /^gerundium/, ids: ['en.verb.gerund'] },
  { muster: /^infinitiv mit und ohne to/, ids: ['en.verb.infinitive'] },
  { muster: /^adverbialsaetze/, ids: ['en.clause.adverbial_ext', 'en.clause.adverbial_basic'], unsicher: true },
  { muster: /^bindewoerter/, ids: ['en.syn.linking', 'en.clause.adverbial_basic'], unsicher: true },
  { muster: /^betonung/, ids: ['en.focus.emphasis'] },
  { muster: /^phrasal verbs/, ids: ['en.verb.phrasal'] },
  { muster: /^partizipialsaetze/, ids: ['en.verb.participle'] }
]

/** Nur für die Prüfung der Tabelle (tests/grammatikAuswahl.test.ts) */
export const ZUORDNUNG_KENNUNGEN = ZUORDNUNG_EN.map((z) => ({ ids: z.ids, teile: z.teile ?? [] }))

/** Grammatikangabe eines Kapitels in Einzelteile zerlegen – Kommas in Klammern trennen nicht */
export function zerlegeGrammatik(text: string): string[] {
  const teile: string[] = []
  let tiefe = 0
  let aktuell = ''
  for (const z of text) {
    if (z === '(') tiefe++
    if (z === ')') tiefe = Math.max(0, tiefe - 1)
    if (z === ',' && tiefe === 0) {
      teile.push(aktuell)
      aktuell = ''
    } else aktuell += z
  }
  teile.push(aktuell)
  return teile.map((t) => t.trim()).filter(Boolean)
}

export interface UnitEintrag {
  band: string
  kapitel: string
  /** Wortlaut im Lehrwerk („going to-Futur") */
  phrase: string
  /** Katalogthemen; bei unsicher: Vorschläge */
  ids: string[]
  /** Teilformen als „thema/teilform" (nur bei sicherer Zuordnung zu genau einem Thema) */
  teile: string[]
  sicher: boolean
}

/** Eine Grammatikangabe aus dem Lehrwerk einem Katalogthema zuordnen */
export function ordneZu(subjectId: string, phrase: string, band = ''): { ids: string[]; teile: string[]; sicher: boolean } {
  const n = normalisiere(phrase).trim()
  const fach = GRAMMAR_TOPICS.filter((t) => t.subject === subjectId)
  const gibt = new Set(fach.map((t) => t.id))
  if (subjectId === 'englisch') {
    const z = ZUORDNUNG_EN.find((x) => x.muster.test(n) && (!x.baende || x.baende.includes(band)))
    if (z) {
      const ids = z.ids.filter((id) => gibt.has(id))
      const teile = ids.length === 1 && z.teile ? z.teile.map((t) => `${ids[0]}/${t}`) : []
      if (ids.length) return { ids, teile, sicher: !z.unsicher }
    }
  }
  // Ohne Tabelleneintrag: höchstens drei Vorschläge aus der Suche, nie selbst gewählt
  const ohneKlammer = phrase.replace(/\(.*?\)/g, ' ').trim()
  return {
    ids: sucheThemen(fach, ohneKlammer)
      .slice(0, 3)
      .map((t) => t.id),
    teile: [],
    sicher: false
  }
}

/** Bände, für die Unit-Grammatik hinterlegt ist */
export function lehrwerkeMitGrammatik(): string[] {
  return Object.keys(LEHRWERK_THEMEN).filter((b) => Object.values(LEHRWERK_THEMEN[b].kapitel).some((k) => k.grammatik))
}

/** Kapitel eines Bandes mit Grammatikangabe, in Buchreihenfolge */
export const grammatikKapitel = (buch: string): string[] => kapitelFolge(buch).filter((k) => LEHRWERK_THEMEN[buch]?.kapitel[k]?.grammatik)

/** Frühere Bände derselben Reihe („Green Line 3" → Green Line 1, Green Line 2) */
export function fruehereBaende(buch: string): string[] {
  const m = buch.match(/^(.*?)\s+(\d+)$/)
  if (!m) return []
  const nr = Number(m[2])
  return Object.keys(LEHRWERK_THEMEN)
    .map((b) => ({ b, x: b.match(/^(.*?)\s+(\d+)$/) }))
    .filter(({ x }) => x && x[1] === m[1] && Number(x[2]) < nr)
    .sort((a, b) => Number(a.x![2]) - Number(b.x![2]))
    .map(({ b }) => b)
}

function eintraegeAus(subjectId: string, band: string, kapitel: string[]): UnitEintrag[] {
  return kapitel.flatMap((k) => {
    /*
     * Liste der Lehrkraft (Niedersachsen, je Station, 07.10.2026): fest zugeordnet und damit sicher – die Station steht
     * mit am Kapitel („Unit 2 · Station 1"); sonst wie bisher die Angabe aus den Planungsmustern über die Zuordnungstabelle.
     */
    const stationen = LEHRWERK_GRAMMATIK[band]?.[k]
    if (stationen) {
      const gibt = new Set(GRAMMAR_TOPICS.filter((t) => t.subject === subjectId).map((t) => t.id))
      return grammatikStationen(band, k).flatMap((s) =>
        stationen[s].map((p) => {
          const ids = [...new Set(p.t.map((x) => x.split('/')[0]))].filter((id) => gibt.has(id))
          const ganz = new Set(p.t.filter((x) => !x.includes('/')))
          // Teilformen nur, wo das Thema nicht ganz gemeint ist
          const teile = p.t.filter((x) => x.includes('/') && gibt.has(x.split('/')[0]) && !ganz.has(x.split('/')[0]))
          return { band, kapitel: s ? `${k} · ${s}` : k, phrase: p.w ? `${p.text} (Wiederholung)` : p.text, ids, teile, sicher: ids.length > 0 }
        })
      )
    }
    return zerlegeGrammatik(LEHRWERK_THEMEN[band]?.kapitel[k]?.grammatik ?? '').map((phrase) => ({ band, kapitel: k, phrase, ...ordneZu(subjectId, phrase, band) }))
  })
}

/**
 * Grammatik der Units: „bis" = alle Kapitel des Bandes bis einschließlich `unit` (mit `baende` auch die früheren Bände
 * ganz), „nur" = nur diese Unit.
 */
export function unitEintraege(subjectId: string, buch: string, unit: string, modus: 'bis' | 'nur', baende: string[] = []): UnitEintrag[] {
  const kapitel = kapitelFolge(buch)
  const i = kapitel.indexOf(unit)
  if (i < 0) return []
  if (modus === 'nur') return eintraegeAus(subjectId, buch, [unit])
  return [...baende.flatMap((b) => eintraegeAus(subjectId, b, kapitelFolge(b))), ...eintraegeAus(subjectId, buch, kapitel.slice(0, i + 1))]
}

/**
 * Sichere Einträge zur Auswahl hinzufügen (nichts wird abgewählt). Ein Thema, das irgendwo ganz vorkommt, bleibt ohne
 * Teilform-Einschränkung; kommt es nur mit Teilformen vor, werden genau diese gewählt.
 */
export function mitUnitAuswahl(eintraege: UnitEintrag[], themen: string[], teilformen: string[]): { themen: string[]; teilformen: string[] } {
  const ganz = new Set<string>()
  const teile = new Map<string, Set<string>>()
  for (const e of eintraege.filter((x) => x.sicher)) {
    for (const id of e.ids) {
      // Teilformen je Thema (die Liste der Lehrkraft nennt sie auch bei mehreren Themen eines Eintrags, 07.10.2026)
      const eigene = e.teile.filter((k) => k.startsWith(`${id}/`))
      if (eigene.length) {
        const s = teile.get(id) ?? new Set<string>()
        eigene.forEach((k) => s.add(k))
        teile.set(id, s)
      } else ganz.add(id)
    }
  }
  const neueThemen = [...themen]
  let neueTeile = [...teilformen]
  for (const id of [...new Set([...ganz, ...teile.keys()])]) {
    const schon = neueThemen.includes(id)
    const eigene = neueTeile.filter((k) => k.startsWith(`${id}/`))
    if (!schon) neueThemen.push(id)
    if (ganz.has(id)) {
      // Neu und ganz: keine Einschränkung. Schon gewählt: bleibt, wie es ist.
      continue
    }
    const dazu = [...(teile.get(id) ?? [])]
    // Schon gewählt ohne Einschränkung = alle passenden; das bleibt so
    if (schon && !eigene.length) continue
    neueTeile = [...neueTeile, ...dazu.filter((k) => !neueTeile.includes(k))]
  }
  return { themen: neueThemen, teilformen: neueTeile }
}

/** Herkunft je Thema: „Unit 2" im aktuellen Band, sonst „Green Line 1, Unit 3" (nur sichere Zuordnungen) */
export function herkunftKarte(subjectId: string, buch: string, baende: string[] = []): Map<string, string> {
  const karte = new Map<string, string>()
  for (const e of eintraegeAus(subjectId, buch, kapitelFolge(buch)).filter((x) => x.sicher))
    for (const id of e.ids) if (!karte.has(id)) karte.set(id, e.kapitel)
  for (const b of [...baende].reverse())
    for (const e of eintraegeAus(subjectId, b, kapitelFolge(b)).filter((x) => x.sicher))
      for (const id of e.ids) if (!karte.has(id)) karte.set(id, `${b}, ${e.kapitel}`)
  return karte
}

// ---------------------------------------------------------------- Zuletzt / Favoriten

const SPEICHER = 'schulapps.grammatikauswahl.v1'

interface Gemerkt {
  favoriten: Record<string, string[]>
  zuletzt: Record<string, string[]>
  /** Zuletzt gewähltes Lehrwerk, falls die Lerngruppe keins mitbringt */
  lehrwerk?: { buch: string; unit: string }
}

export function liesGemerkt(): Gemerkt {
  try {
    const roh = typeof localStorage === 'undefined' ? null : localStorage.getItem(SPEICHER)
    const d = roh ? (JSON.parse(roh) as Partial<Gemerkt>) : {}
    return { favoriten: d.favoriten ?? {}, zuletzt: d.zuletzt ?? {}, lehrwerk: d.lehrwerk }
  } catch {
    return { favoriten: {}, zuletzt: {} }
  }
}

function schreibe(g: Gemerkt): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SPEICHER, JSON.stringify(g))
  } catch {
    // privates Fenster, gesperrter Speicher: dann eben ohne Gedächtnis
  }
}

/** Thema als zuletzt benutzt merken (höchstens 8 je Fach, neuestes vorn) */
export function merkeZuletzt(fach: string, id: string): string[] {
  const g = liesGemerkt()
  const liste = [id, ...(g.zuletzt[fach] ?? []).filter((x) => x !== id)].slice(0, 8)
  schreibe({ ...g, zuletzt: { ...g.zuletzt, [fach]: liste } })
  return liste
}

/** Stern umschalten */
export function schalteFavorit(fach: string, id: string): string[] {
  const g = liesGemerkt()
  const alt = g.favoriten[fach] ?? []
  const liste = alt.includes(id) ? alt.filter((x) => x !== id) : [...alt, id]
  schreibe({ ...g, favoriten: { ...g.favoriten, [fach]: liste } })
  return liste
}

export function merkeLehrwerk(buch: string, unit: string): void {
  schreibe({ ...liesGemerkt(), lehrwerk: { buch, unit } })
}
