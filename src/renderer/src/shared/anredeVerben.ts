/**
 * Imperativformen für die Anrede-Prüfung (shared/anrede.ts).
 *
 * ANLASS: Die Prüfung kannte nur eine feste Liste üblicher du-Imperative („Kreuze", „Erkläre" …).
 * Seltene Operatoren rutschten durch – „Erörtere", „Skizziere", „Nimm Stellung", „Entwirf" –,
 * gerade die, die in der Oberstufe häufig sind. Statt die Liste von Hand zu pflegen, werden die
 * Formen hier REGELHAFT aus allen Verben gebildet, die die App ohnehin kennt:
 *
 * - allen Operatoren der Landeslisten (Lernzielkontrolle), der Stufenlisten und der Fachlisten
 *   (Arbeitsblatt), den Grundschul-Handlungsverben,
 * - einem Grundwortschatz der Verben, mit denen Arbeitsanweisungen sonst beginnen.
 *
 * Bildung des du-Imperativs: Infinitiv ohne „-n"/„-en" plus „-e" („erklären" → „erkläre"),
 * „-eln" → „-le" („sammeln" → „sammle"), e→i-Wechsel der starken Verben („lesen" → „lies",
 * „nehmen" → „nimm", auch mit Vorsilbe: „entwerfen" → „entwirf"). Trennbare Verben liefern
 * zusätzlich die Form des Grundverbs, weil die Vorsilbe ans Satzende wandert („ankreuzen" →
 * „Kreuze … an", „einsetzen" → „Setze … ein"). Unsinnige Nebenprodukte („alysiere" aus
 * „an|alysieren") schaden nicht – sie kommen in keinem Text vor.
 *
 * Die Sie-Form braucht keine Liste: „Infinitiv + Sie" am Satzanfang ist eindeutig genug und wird
 * in shared/anrede.ts über das Muster erkannt.
 */
import { ALLE_OPERATOREN, PRAXIS_OPERATOREN } from '../modules/lernzielkontrolle/didactics/operatoren'
import { PRIMARY_VERBS, SEK1_OPERATORS, SEK2_EXTRA } from '../modules/arbeitsblatt/didactics/operators'
import { SUBJECT_OPERATORS } from '../modules/arbeitsblatt/didactics/subjectOperators'

/** Verben, mit denen Arbeitsanweisungen, Hilfen und Tipps beginnen – über die Operatoren hinaus */
const GRUNDWORTSCHATZ = [
  'abschreiben',
  'achten',
  'addieren',
  'ändern',
  'ankreuzen',
  'anmalen',
  'anordnen',
  'anschauen',
  'ansehen',
  'antworten',
  'arbeiten',
  'aufschreiben',
  'ausfüllen',
  'ausmalen',
  'ausprobieren',
  'ausrechnen',
  'ausschneiden',
  'austauschen',
  'auswählen',
  'basteln',
  'beachten',
  'bearbeiten',
  'beantworten',
  'befragen',
  'beobachten',
  'berichten',
  'beschriften',
  'besprechen',
  'betrachten',
  'bilden',
  'bringen',
  'denken',
  'dividieren',
  'durchlesen',
  'einkreisen',
  'einschätzen',
  'eintragen',
  'einzeichnen',
  'entnehmen',
  'erfinden',
  'ergänzen',
  'erinnern',
  'erkennen',
  'erraten',
  'erstellen',
  'erzählen',
  'fassen',
  'festhalten',
  'finden',
  'formulieren',
  'fortsetzen',
  'fragen',
  'führen',
  'füllen',
  'geben',
  'gehen',
  'gucken',
  'halten',
  'helfen',
  'herausfinden',
  'hören',
  'informieren',
  'kennzeichnen',
  'klären',
  'kleben',
  'kommen',
  'korrigieren',
  'kreuzen',
  'lassen',
  'legen',
  'leiten',
  'lernen',
  'lesen',
  'lösen',
  'machen',
  'malen',
  'markieren',
  'merken',
  'messen',
  'mitsprechen',
  'multiplizieren',
  'nachschlagen',
  'nachsprechen',
  'nehmen',
  'nennen',
  'notieren',
  'nummerieren',
  'nutzen',
  'probieren',
  'prüfen',
  'rechnen',
  'recherchieren',
  'sammeln',
  'schauen',
  'schildern',
  'schneiden',
  'schreiben',
  'sehen',
  'setzen',
  'singen',
  'sortieren',
  'spielen',
  'sprechen',
  'stellen',
  'streichen',
  'strukturieren',
  'subtrahieren',
  'suchen',
  'tauschen',
  'teilen',
  'testen',
  'tragen',
  'überlegen',
  'übersetzen',
  'übertragen',
  'üben',
  'umformen',
  'umformulieren',
  'umkreisen',
  'unterstreichen',
  'verbessern',
  'verbinden',
  'vereinfachen',
  'vervollständigen',
  'verwenden',
  'vorlesen',
  'vortragen',
  'wählen',
  'wiederholen',
  'würfeln',
  'zählen',
  'zerlegen',
  'zitieren',
  'zuhören'
]

/** Kurz- und Sonderformen, die sich nicht regelhaft bilden lassen oder umgangssprachlich sind */
const SONDERFORMEN = [
  'Schreib',
  'Hör',
  'Denk',
  'Mach',
  'Setz',
  'Schau',
  'Sag',
  'Guck',
  'Such',
  'Lern',
  'Frag',
  'Nimm',
  'Lies',
  'Sieh',
  'Tu',
  'Tue',
  'Hab',
  'Komm',
  'Geh',
  'Lass'
]

/**
 * Starke Verben mit e→i-Wechsel im Imperativ. Geprüft wird das WORTENDE, damit Vorsilben
 * mitgehen („angeben", „entnehmen", „entwerfen", „vorlesen"). Längere Endungen zuerst,
 * sonst träfe „essen" auch „messen".
 */
const STARK: [string, string][] = [
  ['vergessen', 'vergiss'],
  ['fressen', 'friss'],
  ['messen', 'miss'],
  ['essen', 'iss'],
  ['empfehlen', 'empfiehl'],
  ['befehlen', 'befiehl'],
  ['stehlen', 'stiehl'],
  ['sprechen', 'sprich'],
  ['brechen', 'brich'],
  ['stechen', 'stich'],
  ['nehmen', 'nimm'],
  ['geben', 'gib'],
  ['lesen', 'lies'],
  ['sehen', 'sieh'],
  ['helfen', 'hilf'],
  ['treffen', 'triff'],
  ['werfen', 'wirf'],
  ['werben', 'wirb'],
  ['sterben', 'stirb'],
  ['verderben', 'verdirb'],
  ['treten', 'tritt'],
  ['gelten', 'gilt']
]

/** Vorsilben trennbarer Verben, längste zuerst („auseinander|setzen", „zusammen|fassen") */
const TRENNBAR = [
  'auseinander',
  'gegenüber',
  'zusammen',
  'herbei',
  'heraus',
  'herein',
  'hinweg',
  'zurück',
  'vorbei',
  'voran',
  'weiter',
  'wieder',
  'hinzu',
  'durch',
  'nach',
  'fest',
  'frei',
  'wahr',
  'dar',
  'ein',
  'auf',
  'aus',
  'mit',
  'vor',
  'her',
  'hin',
  'los',
  'an',
  'ab',
  'bei',
  'zu',
  'um'
]

/**
 * Formen, die auch etwas ANDERES sind: 3. Person („Gilt die Gleichung …?", „Tritt ein Fehler
 * auf …"), Konjunktiv der Mathematik („Sei f eine Funktion"), Höflichkeitswort („Bitte …"),
 * Pronomen („Einige Historiker …"). Sie zählen nie.
 */
const NIE = new Set(['Sei', 'Gilt', 'Tritt', 'Bitte', 'Einige'])

/**
 * Formen, die zugleich ein Nomen sind („Frage 3:", „Teile der Bevölkerung …", „Werte der
 * Tabelle"). Sie zählen nur, wenn ein kleingeschriebenes Wort folgt, das nicht zu einem
 * Nomen gehört („Teile den Text …", „Werte die Umfrage aus").
 */
export const DOPPELDEUTIG = new Set([
  'Achte',
  'Belege',
  'Beweise',
  'Breite',
  'Decke',
  'Ende',
  'Falte',
  'Folge',
  'Frage',
  'Fülle',
  'Grenze',
  'Klage',
  'Kreise',
  'Kreuze',
  'Kürze',
  'Lehre',
  'Leiste',
  'Gewinne',
  'Liste',
  'Male',
  'Messe',
  'Pflege',
  'Plane',
  'Probe',
  'Rate',
  'Rede',
  'Reihe',
  'Reise',
  'Runde',
  'Sage',
  'Schätze',
  'Sorge',
  'Spiele',
  'Stelle',
  'Stimme',
  'Strecke',
  'Suche',
  'Teile',
  'Wende',
  'Weise',
  'Werte'
])

/** Kleine Wörter, die nach einem Nomen stehen, aber kaum nach einem Imperativ */
export const NACH_NOMEN = new Set([
  'der',
  'des',
  'von',
  'vom',
  'und',
  'oder',
  'ist',
  'sind',
  'war',
  'waren',
  'wird',
  'werden',
  'hat',
  'haben',
  'zeigt',
  'zeigen',
  'liegt',
  'liegen',
  'steht',
  'stehen',
  'im',
  'am',
  'zum',
  'zur',
  'an',
  'für',
  'mit'
])

const gross = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1)

/** du-Imperativ eines (untrennbaren) Verbs – oder null, wenn es kein deutscher Infinitiv ist */
function imperativ(verb: string): string[] {
  for (const [endung, form] of STARK) {
    // Beide Formen: „lies" ist richtig, „lese" steht trotzdem oft da – beides ist duzen
    if (verb.endsWith(endung)) return [verb.slice(0, -endung.length) + form, verb.slice(0, -2) + 'e']
  }
  if (verb.endsWith('eln')) return [verb.slice(0, -3) + 'le', verb.slice(0, -1) + 'e']
  if (verb.endsWith('ern')) return [verb.slice(0, -1) + 'e']
  if (verb.endsWith('en') && verb.length > 3) return [verb.slice(0, -2) + 'e']
  return []
}

/** Alle du-Imperative eines Infinitivs, bei trennbaren Verben auch die des Grundverbs */
export function duImperative(infinitiv: string): string[] {
  const verb = infinitiv.toLowerCase()
  const out = new Set(imperativ(verb))
  const vorsilbe = TRENNBAR.find((v) => verb.startsWith(v) && verb.length - v.length >= 4)
  if (vorsilbe) for (const f of imperativ(verb.slice(vorsilbe.length))) out.add(f)
  return [...out]
}

/** Der Infinitiv eines Operators: das letzte kleingeschriebene Wort auf -en/-ern/-eln */
function infinitivAus(operator: string): string | null {
  const woerter = operator.split(/\s+/).filter((w) => /^[a-zäöüß]+(?:en|ern|eln)$/.test(w))
  return woerter.at(-1) ?? null
}

let formen: Set<string> | null = null

/**
 * Alle bekannten du-Imperative, großgeschrieben („Erörtere", „Nimm", „Kreuze").
 * Einmal gebildet und dann behalten – die Listen ändern sich zur Laufzeit nicht.
 */
export function duImperativFormen(): Set<string> {
  if (formen) return formen
  const infinitive = new Set<string>(GRUNDWORTSCHATZ)
  const operatoren = [
    // Die Landeslisten enthalten auch englische, französische und spanische Operatoren; sie
    // fallen heraus, weil nur kleingeschriebene deutsche Infinitive auf -en/-ern/-eln zählen
    ...ALLE_OPERATOREN,
    ...PRAXIS_OPERATOREN,
    ...Object.values(SEK1_OPERATORS).flat(),
    ...Object.values(SEK2_EXTRA).flat(),
    ...Object.values(SUBJECT_OPERATORS).flatMap((f) => Object.keys(f.afb))
  ]
  for (const op of operatoren) {
    const inf = infinitivAus(op)
    if (inf) infinitive.add(inf)
  }
  const out = new Set<string>(SONDERFORMEN)
  for (const inf of infinitive) for (const f of duImperative(inf)) out.add(gross(f))
  // Die Grundschulverben stehen schon im Imperativ („kreuze an", „trage ein")
  for (const op of Object.values(PRIMARY_VERBS).flat()) out.add(gross(op.split(/\s+/)[0]))
  for (const n of NIE) out.delete(n)
  formen = out
  return out
}
