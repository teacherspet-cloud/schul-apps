/**
 * Operatoren im SATZ – korrekte Imperative bilden und falsche Formen finden (01.10.2026).
 *
 * Anlass (Fehlerbericht der Lehrkraft): Ein Arbeitsblatt der Sek II formulierte „Zusammenfassen
 * Sie anhand von M1 …" statt „Fassen Sie anhand von M1 … zusammen". Ursache war ein Zusammenspiel:
 *   - Die Prüfung erkannte bis 30.09.2026 nur das erste Wort („Fassen" → „fassen") und meldete
 *     „‚fassen' steht nicht in der Operatorenliste"; „Mit KI beheben" setzte daraufhin den
 *     Listeneintrag „zusammenfassen" an den Satzanfang.
 *   - Die Erzeugungsaufträge verlangten „Beginne jede Aufgabe mit einem Operator in Fettschrift"
 *     und nannten die Operatoren im Infinitiv – bei trennbaren Verben verleitet das zur
 *     Infinitivstellung.
 *   - Keine Prüfung bemerkte die falsche Form: Die Operatorerkennung zählte den Infinitiv als
 *     Treffer, die Anrede-Prüfung „Infinitiv + Sie" als korrekte Sie-Form.
 *
 * Diese Datei ist die EINE Stelle für die Satzbildung mit Operatoren:
 *   - `operatorImperativ(operator, anrede, sprache)` bildet den Imperativ in du-, ihr- und
 *     Sie-Form (Deutsch: starke Verben, trennbare Verben mit Partikel am Satzende, reflexive
 *     Verben, Wendungen aus mehreren Wörtern) und in den Zielsprachen en/fr/es/it/ru.
 *   - `operatorSatz` setzt Ergänzungen an die richtige Stelle (Satzklammer).
 *   - `operatorFormfehler` / `korrigiereOperatorformen` finden falsch gebildete Formen
 *     („Zusammenfassen Sie", „Herausarbeiten Sie", „Erläutere Sie", „Zusammenfasse …") und
 *     liefern die Korrektur – ohne den übrigen Satz anzufassen.
 */
import { BESTAND } from './zugriff'
import type { Listensprache } from './typen'

export type OperatorAnrede = 'du' | 'ihr' | 'sie'

/* ---------- Deutsch: Verben zerlegen ---------- */

/** Trennbare Vorsilben, die längsten zuerst */
const TRENNBAR = [
  'auseinander',
  'gegenüber',
  'zusammen',
  'heraus',
  'hervor',
  'herbei',
  'vorher',
  'zurück',
  'wieder',
  'heran',
  'fest',
  'nach',
  'dar',
  'ein',
  'auf',
  'aus',
  'vor',
  'mit',
  'her',
  'hin',
  'ab',
  'an',
  'um',
  'zu'
]

/**
 * Grundverben, die mit einer Vorsilbe trennbar werden. Nur über diese Liste wird getrennt –
 * sonst würde „analysieren" zu „an|alysieren" oder „umkreisen" zu „Kreise … um".
 */
const GRUNDVERBEN = new Set(
  (
    'arbeiten bauen beziehen bilden binden bringen decken denken deuten drücken fassen fertigen finden formen formulieren führen füllen fügen geben gehen ' +
    'gleichen halten heben holen hören kommen kreuzen lassen laufen legen leiten lesen listen lösen machen malen merken messen nehmen ordnen passen probieren ' +
    'rechnen richten rufen sagen schätzen schauen schlagen schließen schneiden schreiben sehen setzen spielen sprechen stellen stimmen streichen suchen tauschen ' +
    'teilen tragen vollziehen wägen wählen wandeln weisen wenden werten zählen zeichnen zeigen ziehen'
  ).split(' ')
)

/** Mit trennbar wirkender Vorsilbe, aber untrennbar (oder mehrdeutig) – nie trennen */
const UNTRENNBAR = new Set(['umkreisen', 'umschreiben', 'umfassen', 'umgeben', 'wiederholen', 'umrahmen', 'umranden', 'umgehen', 'übersetzen', 'umstellen'])

/** Starke Verben mit e→i-Wechsel im du-Imperativ (auch mit Vorsilbe: „entwerfen" → „entwirf") */
const STARK: [string, string][] = [
  ['vergessen', 'vergiss'],
  ['empfehlen', 'empfiehl'],
  ['befehlen', 'befiehl'],
  ['sprechen', 'sprich'],
  ['brechen', 'brich'],
  ['stechen', 'stich'],
  ['treffen', 'triff'],
  ['werfen', 'wirf'],
  ['werben', 'wirb'],
  ['helfen', 'hilf'],
  ['nehmen', 'nimm'],
  ['messen', 'miss'],
  ['treten', 'tritt'],
  ['geben', 'gib'],
  ['lesen', 'lies'],
  ['sehen', 'sieh'],
  ['essen', 'iss']
]

/** Zerlegt ein trennbares Verb: „zusammenfassen" → { partikel: 'zusammen', grund: 'fassen' } */
export function trennbaresVerb(verb: string): { partikel: string; grund: string } | null {
  const v = verb.toLocaleLowerCase('de')
  if (UNTRENNBAR.has(v)) return null
  for (const p of TRENNBAR) {
    if (!v.startsWith(p)) continue
    const rest = v.slice(p.length)
    if (GRUNDVERBEN.has(rest)) return { partikel: p, grund: rest }
  }
  return null
}

/** du-Imperativ: „erklären" → „erkläre", „sammeln" → „sammle", „lesen" → „lies" */
export function duImperativ(verb: string): string {
  const v = verb.toLocaleLowerCase('de')
  for (const [inf, imp] of STARK) if (v.endsWith(inf)) return v.slice(0, -inf.length) + imp
  if (v === 'tun') return 'tu'
  if (v === 'sein') return 'sei'
  if (v.endsWith('eln')) return `${v.slice(0, -3)}le`
  if (v.endsWith('ern')) return `${v.slice(0, -1)}e`
  if (v.endsWith('en')) return `${v.slice(0, -2)}e`
  if (v.endsWith('n')) return v.slice(0, -1)
  return v
}

/** ihr-Imperativ: „erklären" → „erklärt", „arbeiten" → „arbeitet", „zeichnen" → „zeichnet" */
export function ihrImperativ(verb: string): string {
  const v = verb.toLocaleLowerCase('de')
  if (v === 'sein') return 'seid'
  if (v === 'tun') return 'tut'
  if (v.endsWith('eln') || v.endsWith('ern')) return `${v.slice(0, -1)}t`
  if (!v.endsWith('en')) return `${v}t`
  const stamm = v.slice(0, -2)
  // -et nach d/t und nach Konsonant + m/n („zeichnet", „ordnet", „atmet"), nicht nach l/r/m/n/h-Dehnung („lernt", „nennt", „wohnt")
  const vorletzter = stamm.slice(-2, -1)
  const braucht = /[dt]$/.test(stamm) || (/[mn]$/.test(stamm) && (/ch$/.test(stamm.slice(0, -1)) || /[^aeiouäöülrmnh]/.test(vorletzter)))
  return `${stamm}${braucht ? 'et' : 't'}`
}

const gross = (w: string): string => (w ? w.charAt(0).toLocaleUpperCase('de') + w.slice(1) : w)

/** Wörter einer Listenangabe, die nicht zum Satz gehören */
const LISTEN_FUELLE = new Set(['etwas', 'jmd', 'jmdm', 'jmdn', 'jemandem', 'jemanden', 'sth', 'sb'])

interface DeutscheWendung {
  /** Das finite Verb (bei trennbaren Verben das Grundverb) */
  verb: string
  /** Was ans Satzende wandert: Partikel und Teile der Wendung („zusammen", „Stellung", „in Beziehung") */
  ende: string[]
  reflexiv: boolean
}

/** „sich auseinandersetzen (mit)", „Stellung nehmen", „in Beziehung setzen", „(be)nennen" → Teile */
function deutscheWendung(operator: string): DeutscheWendung {
  const roh = operator
    .replace(/\(([^)]*)\)\s*(?=\p{L})/u, '') // „(be)nennen" → „nennen"
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s*[/,;]\s*/)[0]
    .replace(/…|\.\.\./g, ' ')
    .trim()
  const woerter = roh.split(/\s+/).filter((w) => w && !LISTEN_FUELLE.has(w.toLocaleLowerCase('de')))
  const reflexiv = woerter.some((w) => w.toLocaleLowerCase('de') === 'sich')
  const ohneSich = woerter.filter((w) => w.toLocaleLowerCase('de') !== 'sich')
  // Das Verb: das letzte Wort auf -en/-ern/-eln, das kleingeschrieben ist
  let vi = -1
  for (let i = ohneSich.length - 1; i >= 0; i--)
    if (/(?:en|ern|eln|tun|sein)$/.test(ohneSich[i]) && ohneSich[i] === ohneSich[i].toLocaleLowerCase('de')) {
      vi = i
      break
    }
  if (vi < 0) vi = 0
  const verb = (ohneSich[vi] ?? '').toLocaleLowerCase('de')
  const vorher = ohneSich.slice(0, vi)
  const t = trennbaresVerb(verb)
  return { verb: t ? t.grund : verb, ende: [...vorher, ...(t ? [t.partikel] : [])], reflexiv }
}

/* ---------- Zielsprachen ---------- */

type Formen3 = [string, string, string]

/** Französisch: [tu, vous, vous] */
const FR_UNREGEL: Record<string, [string, string]> = {
  décrire: ['décris', 'décrivez'],
  écrire: ['écris', 'écrivez'],
  rédiger: ['rédige', 'rédigez'],
  lire: ['lis', 'lisez'],
  relire: ['relis', 'relisez'],
  dire: ['dis', 'dites'],
  faire: ['fais', 'faites'],
  traduire: ['traduis', 'traduisez'],
  produire: ['produis', 'produisez'],
  mettre: ['mets', 'mettez'],
  prendre: ['prends', 'prenez'],
  comprendre: ['comprends', 'comprenez'],
  reprendre: ['reprends', 'reprenez'],
  construire: ['construis', 'construisez'],
  conclure: ['conclus', 'concluez'],
  réagir: ['réagis', 'réagissez'],
  choisir: ['choisis', 'choisissez'],
  définir: ['définis', 'définissez'],
  réfléchir: ['réfléchis', 'réfléchissez'],
  remplir: ['remplis', 'remplissez'],
  établir: ['établis', 'établissez'],
  saisir: ['saisis', 'saisissez'],
  aller: ['va', 'allez'],
  voir: ['vois', 'voyez'],
  dégager: ['dégage', 'dégagez']
}

function franzoesisch(verb: string, anrede: OperatorAnrede): string {
  const v = verb.toLowerCase()
  const paar = FR_UNREGEL[v]
  if (paar) return anrede === 'du' ? paar[0] : paar[1]
  if (v.endsWith('er')) {
    const stamm = v.slice(0, -2)
    if (anrede !== 'du') return `${stamm}ez`
    // compléter → complète, répéter → répète, interpréter → interprète
    return `${stamm.replace(/é([^aeiouyé]+)$/, 'è$1')}e`
  }
  if (v.endsWith('ir')) return anrede === 'du' ? `${v.slice(0, -2)}is` : `${v.slice(0, -2)}issez`
  if (v.endsWith('re')) return anrede === 'du' ? `${v.slice(0, -2)}s` : `${v.slice(0, -2)}ez`
  return v
}

/** Spanisch: [tú, vosotros, usted] */
const ES_UNREGEL: Record<string, Formen3> = {
  hacer: ['haz', 'haced', 'haga'],
  decir: ['di', 'decid', 'diga'],
  poner: ['pon', 'poned', 'ponga'],
  exponer: ['expón', 'exponed', 'exponga'],
  proponer: ['propón', 'proponed', 'proponga'],
  componer: ['compón', 'componed', 'componga'],
  elegir: ['elige', 'elegid', 'elija'],
  corregir: ['corrige', 'corregid', 'corrija'],
  traducir: ['traduce', 'traducid', 'traduzca'],
  deducir: ['deduce', 'deducid', 'deduzca'],
  escoger: ['escoge', 'escoged', 'escoja'],
  sustituir: ['sustituye', 'sustituid', 'sustituya'],
  concluir: ['concluye', 'concluid', 'concluya'],
  construir: ['construye', 'construid', 'construya'],
  contar: ['cuenta', 'contad', 'cuente'],
  mostrar: ['muestra', 'mostrad', 'muestre'],
  demostrar: ['demuestra', 'demostrad', 'demuestre'],
  resolver: ['resuelve', 'resolved', 'resuelva'],
  seguir: ['sigue', 'seguid', 'siga'],
  pensar: ['piensa', 'pensad', 'piense'],
  oír: ['oye', 'oíd', 'oiga'],
  ver: ['mira', 'mirad', 'mire'],
  ir: ['ve', 'id', 'vaya'],
  ponerse: ['ponte', 'poneos', 'póngase'],
  imaginarse: ['imagínate', 'imaginaos', 'imagínese'],
  imaginar: ['imagina', 'imaginad', 'imagine']
}

function spanisch(verb: string, anrede: OperatorAnrede): string {
  const v = verb.toLowerCase()
  const i = anrede === 'du' ? 0 : anrede === 'ihr' ? 1 : 2
  const f = ES_UNREGEL[v]
  if (f) return f[i]
  const stamm = v.slice(0, -2)
  const endung = v.slice(-2)
  if (i === 0) return endung === 'ar' ? `${stamm}a` : `${stamm}e`
  if (i === 1) return `${v.slice(0, -1)}d`
  // usted: -ar → -e (mit Schreibanpassung c→qu, g→gu, z→c), -er/-ir → -a
  if (endung === 'ar') return `${stamm.replace(/c$/, 'qu').replace(/g$/, 'gu').replace(/z$/, 'c')}e`
  return `${stamm}a`
}

/** Italienisch: [tu, voi, Lei] */
const IT_UNREGEL: Record<string, Formen3> = {
  fare: ["fa'", 'fate', 'faccia'],
  dire: ["di'", 'dite', 'dica'],
  dare: ["da'", 'date', 'dia'],
  tradurre: ['traduci', 'traducete', 'traduca'],
  proporre: ['proponi', 'proponete', 'proponga'],
  esporre: ['esponi', 'esponete', 'esponga'],
  porre: ['poni', 'ponete', 'ponga'],
  scegliere: ['scegli', 'scegliete', 'scelga'],
  riassumere: ['riassumi', 'riassumete', 'riassuma'],
  mettersi: ['mettiti', 'mettetevi', 'si metta'],
  immaginarsi: ['immaginati', 'immaginatevi', 'si immagini']
}

/** Verben auf -ire mit -isc- („definisci", „completa" nicht) */
const IT_ISC = new Set(['definire', 'chiarire', 'costruire', 'inserire', 'sostituire', 'suggerire', 'capire', 'finire', 'distribuire', 'attribuire', 'preferire'])

function italienisch(verb: string, anrede: OperatorAnrede): string {
  const v = verb.toLowerCase()
  // Anrede: Sek I „tu", sonst die Mehrzahl „voi" – so stehen Aufgaben in italienischen Prüfungen
  const i = anrede === 'du' ? 0 : 1
  const f = IT_UNREGEL[v]
  if (f) return f[i]
  const stamm = v.slice(0, -3)
  const endung = v.slice(-3)
  if (i === 1) return endung === 'are' ? `${stamm}ate` : endung === 'ere' ? `${stamm}ete` : `${stamm}ite`
  if (endung === 'are') return `${stamm}a`
  if (endung === 'ire' && IT_ISC.has(v)) return `${stamm}isci`
  return `${stamm}i`
}

/** Russisch: [ты, вы] – häufige Operatoren ausdrücklich, sonst die regelmäßigen Muster */
const RU_UNREGEL: Record<string, string> = {
  описать: 'опиши',
  написать: 'напиши',
  рассказать: 'расскажи',
  пересказать: 'перескажи',
  доказать: 'докажи',
  указать: 'укажи',
  высказать: 'выскажи',
  назвать: 'назови',
  дать: 'дай',
  перевести: 'переведи',
  составить: 'составь',
  представить: 'представь',
  ответить: 'ответь',
  отметить: 'отметь',
  вставить: 'вставь',
  выразить: 'вырази',
  найти: 'найди',
  взять: 'возьми',
  выбрать: 'выбери',
  посмотреть: 'посмотри',
  подчеркнуть: 'подчеркни',
  обосновать: 'обоснуй',
  сделать: 'сделай',
  прочитать: 'прочитай',
  прослушать: 'прослушай'
}

function russisch(verb: string, anrede: OperatorAnrede): string {
  const v = verb.toLowerCase()
  let ty = RU_UNREGEL[v]
  if (!ty) {
    if (/овать$/.test(v)) ty = v.replace(/овать$/, 'уй')
    else if (/евать$/.test(v)) ty = v.replace(/евать$/, 'юй')
    else if (/ить$/.test(v)) ty = v.replace(/ить$/, 'и')
    else if (/[ая]ть$/.test(v)) ty = v.replace(/ть$/, 'й')
    else if (/еть$/.test(v)) ty = v.replace(/еть$/, 'и')
    else ty = v.replace(/ть$/, '')
  }
  return anrede === 'du' ? ty : `${ty}те`
}

/** Erstes Wort konjugieren, den Rest der Wendung behalten („comment on", „dar una opinión", „дать оценку") */
function fremdImperativ(operator: string, anrede: OperatorAnrede, sprache: Listensprache): string {
  const roh = operator
    .replace(/\(([^)]*)\)/g, '$1')
    .split(/\s*[/,;]\s*/)[0]
    .replace(/…|\.\.\.|\bsth\b|\bsb\b|\bqc\b|\bqn\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!roh) return ''
  if (sprache === 'en') return gross(roh)
  const woerter = roh.split(' ')
  // Französisch reflexiv: „se mettre à la place" → „Mets-toi …", „Mettez-vous …"
  if (sprache === 'fr' && /^(se|s')$/i.test(woerter[0]) && woerter[1]) {
    return gross(`${franzoesisch(woerter[1], anrede)}-${anrede === 'du' ? 'toi' : 'vous'} ${woerter.slice(2).join(' ')}`.trim())
  }
  if (sprache === 'fr' && /^s'/i.test(woerter[0])) {
    return gross(`${franzoesisch(woerter[0].slice(2), anrede)}-${anrede === 'du' ? 'toi' : 'vous'} ${woerter.slice(1).join(' ')}`.trim())
  }
  const [verb, ...rest] = woerter
  const form =
    sprache === 'fr'
      ? franzoesisch(verb, anrede)
      : sprache === 'es'
        ? spanisch(verb, anrede)
        : sprache === 'it'
          ? italienisch(verb, anrede)
          : sprache === 'ru'
            ? russisch(verb, anrede)
            : verb
  return gross([form, ...rest].join(' '))
}

/* ---------- Öffentliche Satzbildung ---------- */

export interface ImperativTeile {
  /** Satzanfang: „Fassen Sie", „Setze dich", „Describe", „Résumez" */
  vorn: string
  /** Satzende (Satzklammer): „zusammen", „auseinander", „Stellung", „in Beziehung" – sonst leer */
  hinten: string
  /** Kurzform ohne Ergänzung: „Fassen Sie zusammen", „Nehmen Sie Stellung", „Erläutere" */
  kurz: string
  /** Muster mit Auslassung: „Fassen Sie … zusammen", „Erläutern Sie …" */
  muster: string
}

/**
 * Der Operator als Imperativ in der Anrede der Lerngruppe.
 *
 * Deutsch: du („Fasse … zusammen", „Lies", „Nimm Stellung"), ihr („Fasst … zusammen", „Lest",
 * „Arbeitet … heraus"), Sie („Fassen Sie … zusammen", „Setzen Sie sich mit … auseinander").
 * Zielsprachen: en Grundform; fr tu/vous; es tú/vosotros/usted; it tu/voi; ru ты/вы.
 */
export function operatorImperativ(operator: string, anrede: OperatorAnrede, sprache: Listensprache = 'de'): ImperativTeile {
  if (sprache !== 'de') {
    const vorn = fremdImperativ(operator, anrede, sprache)
    return { vorn, hinten: '', kurz: vorn, muster: vorn ? `${vorn} …` : '' }
  }
  const w = deutscheWendung(operator)
  const pronomen = w.reflexiv ? (anrede === 'du' ? ' dich' : anrede === 'ihr' ? ' euch' : ' sich') : ''
  const verbform = anrede === 'du' ? duImperativ(w.verb) : anrede === 'ihr' ? ihrImperativ(w.verb) : w.verb
  const vorn = `${gross(verbform)}${anrede === 'sie' ? ' Sie' : ''}${pronomen}`
  const hinten = w.ende.join(' ')
  return {
    vorn,
    hinten,
    kurz: hinten ? `${vorn} ${hinten}` : vorn,
    muster: hinten ? `${vorn} … ${hinten}` : `${vorn} …`
  }
}

/**
 * Ein ganzer Arbeitsauftrag: Operator + Ergänzung in korrekter Stellung.
 * „zusammenfassen", „anhand von M1 die Position Bismarcks", sie → „Fassen Sie anhand von M1 die Position Bismarcks zusammen."
 * Ein Nebensatz in der Ergänzung („…, was M1 aussagt") bleibt hinter der Satzklammer.
 */
export function operatorSatz(operator: string, ergaenzung: string, anrede: OperatorAnrede, sprache: Listensprache = 'de'): string {
  const teile = operatorImperativ(operator, anrede, sprache)
  const rest = ergaenzung.trim().replace(/[.!]+$/, '')
  if (!teile.hinten) return `${[teile.vorn, rest].filter(Boolean).join(' ')}.`
  const ende = rest ? hauptsatzEnde(rest, 0) : 0
  const vor = rest.slice(0, ende).trimEnd()
  const nach = rest.slice(ende)
  return `${[teile.vorn, vor, teile.hinten].filter(Boolean).join(' ')}${nach}.`
}

/* ---------- Falsche Formen finden ---------- */

export interface Formfehler {
  /** Die falsche Stelle, wie sie im Text steht („Zusammenfassen Sie", „Erläutere Sie") */
  falsch: string
  /** Die richtige Form als Muster („Fassen Sie … zusammen", „Erläutern Sie") */
  richtig: string
  /** Zeichenposition im übergebenen Text */
  position: number
  /** Der ganze Text mit dieser einen Korrektur */
  korrigiert: string
}

/** Abkürzungen, nach denen ein Punkt keinen Satz beendet */
const ABKUERZUNGEN = new Set(
  'z b d h u a v n o ä e i s m chr bzw ca vgl usw etc nr jh jhd bspw ggf evtl inkl sog dt engl frz lat abb tab kap zit hrsg mio mrd st str bzgl ebd f ff'.split(
    ' '
  )
)

/** Wörter, mit denen nach einem Komma ein Nebensatz beginnt – dort endet der Hauptsatz */
const NEBENSATZ = new Set(
  (
    'dass wie was ob warum weshalb wieso weswegen inwiefern inwieweit welche welcher welches welchen welchem indem wobei weil da wenn als nachdem bevor ' +
    'sodass damit um ohne statt anstatt wo wodurch womit worin worauf wofür wozu woran wann wer wen wem wessen inwiefern sofern soweit'
  ).split(' ')
)
/** Relativpronomen nach Komma: Nebensatz nur, wenn der Abschnitt mit einem kleingeschriebenen Wort (Verb) endet */
const RELATIV = new Set(['der', 'die', 'das', 'den', 'dem', 'deren', 'dessen', 'denen'])

interface Verbbestand {
  /** Alle bekannten Infinitive (auch jede trennbare Bildung der Grundverben) */
  inf: Set<string>
  /** Verben, die wirklich in Arbeitsanweisungen stehen (Operatoren der Listen und Ergänzungen) */
  anweisung: Set<string>
  du: Map<string, string>
  ihr: Map<string, string>
}

let verbCache: Verbbestand | null = null

/** Deutsche Verben, die als Arbeitsanweisung vorkommen: Grundverben, trennbare Bildungen und alle Operatoren der deutschen Listen */
function bekannteVerben(): Verbbestand {
  if (verbCache) return verbCache
  const inf = new Set<string>(GRUNDVERBEN)
  const anweisung = new Set<string>([...ERGAENZENDE_VERBEN, ...ANWEISUNGSVERBEN])
  for (const g of GRUNDVERBEN) for (const p of TRENNBAR) if (trennbaresVerb(p + g)) inf.add(p + g)
  for (const land of Object.values(BESTAND))
    for (const l of land.listen)
      if (l.sprache === 'de')
        for (const o of l.operatoren)
          for (const roh of [o.operator, ...(o.formen ?? [])]) {
            for (const teil of roh.split(/\s*[/,;]\s*/)) {
              const w = deutscheWendung(teil)
              if (!w.verb || !/(?:en|ern|eln)$/.test(w.verb) || w.verb.length < 4) continue
              inf.add(w.verb)
              const t = w.ende.length ? w.ende[w.ende.length - 1] : ''
              if (t && TRENNBAR.includes(t)) {
                inf.add(t + w.verb)
                anweisung.add(t + w.verb)
              } else anweisung.add(w.verb)
            }
          }
  for (const v of anweisung) inf.add(v)
  const du = new Map<string, string>()
  const ihr = new Map<string, string>()
  for (const v of inf) {
    const d = duImperativ(v)
    if (d !== v && d.length >= 3) du.set(d, v)
    const i = ihrImperativ(v)
    if (i !== v && i.length >= 4) ihr.set(i, v)
  }
  verbCache = { inf, anweisung, du, ihr }
  return verbCache
}

/** Trennbare Verben üblicher Arbeitsanweisungen (ohne Operatorenliste) */
const ANWEISUNGSVERBEN = (
  'ankreuzen einsetzen ausfüllen aufschreiben abschreiben zuordnen einordnen herausarbeiten herausfinden zusammenfassen zusammenstellen darstellen darlegen ' +
  'einkreisen einzeichnen eintragen nachschlagen vorlesen vorstellen aufstellen ableiten herleiten aufzeigen auswerten angeben anwenden einschätzen abschätzen ' +
  'gegenüberstellen nachvollziehen wiedergeben ausführen zurückführen festhalten feststellen'
).split(' ')

/** Substantive, die wie eine ungetrennte du-Form aussehen („Hinweise", „Nachweise", „Anstelle") */
const NOMEN_FALLE = new Set(['hinweise', 'nachweise', 'anstelle', 'aussage', 'ansage', 'absage', 'zusage', 'vorteile', 'nachteile', 'anteile', 'ausweise'])

/** Häufige Verben in Arbeitsanweisungen über die Listen hinaus */
const ERGAENZENDE_VERBEN = (
  'erläutern erklären beschreiben begründen beurteilen bewerten vergleichen analysieren interpretieren erörtern diskutieren untersuchen nennen benennen ' +
  'bestimmen berechnen skizzieren entwerfen entwickeln gestalten prüfen überprüfen charakterisieren belegen verfassen notieren markieren unterstreichen ' +
  'ergänzen formulieren übersetzen recherchieren präsentieren deuten schildern wiedergeben'
).split(' ')

const istGross = (w: string): boolean => /^\p{Lu}/u.test(w)

/** Bereiche in Anführungen („…", "…", »…«, ‚…') – dort wird nichts geändert (Zitate, Beispielsätze) */
function zitatBereiche(t: string): [number, number][] {
  const out: [number, number][] = []
  for (const m of t.matchAll(/„[^“”"]*[“”"]|»[^«]*«|‚[^‘’']*[‘’']|"[^"\n]*"/g)) out.push([m.index!, m.index! + m[0].length])
  return out
}

/** Ist das Wort an dieser Stelle ein Imperativ eines bekannten Verbs (Beginn eines neuen Hauptsatzes)? */
function beginntImperativ(t: string, ab: number): boolean {
  const m = /^\s*(?:\*\*)?(\p{L}+)(?:\*\*)?(\s+Sie\b)?/u.exec(t.slice(ab))
  if (!m) return false
  const w = m[1].toLocaleLowerCase('de')
  const v = bekannteVerben()
  if (m[2]) return v.inf.has(w)
  return v.du.has(w) || (v.ihr.has(w) && w.length >= 5)
}

/**
 * Ende des Hauptsatzes ab `von`: Satzzeichen, ein Komma vor einem Nebensatz oder einem neuen
 * Imperativ („…, und erläutern Sie"), „und/oder/sowie" vor einem neuen Imperativ, Gedankenstrich.
 * Liefert die Stelle, VOR der die Partikel steht.
 */
export function hauptsatzEnde(t: string, von: number): number {
  let i = von
  while (i < t.length) {
    const c = t[i]
    if (c === '\n' || c === '!' || c === '?' || c === ';' || c === ':') return i
    if (c === '.') {
      const vorher = /(\p{L}+|\d+)\s*$/u.exec(t.slice(von, i))?.[1] ?? ''
      const danach = t.slice(i + 1)
      const abk = ABKUERZUNGEN.has(vorher.toLocaleLowerCase('de')) || (/^\d+$/.test(vorher) && /^\s+\p{Ll}/u.test(danach))
      if (!abk && !/^\.\./.test(danach)) return i
    }
    if (c === ',') {
      const naechstes = /^\s*(?:\*\*)?(\p{L}+)/u.exec(t.slice(i + 1))?.[1] ?? ''
      const n = naechstes.toLocaleLowerCase('de')
      if (NEBENSATZ.has(n)) return i
      const bind = /^\s*(?:und|oder|sowie)\s+/.exec(t.slice(i + 1))
      if (bind && beginntImperativ(t, i + 1 + bind[0].length)) return i
      if (beginntImperativ(t, i + 1)) return i
      if (RELATIV.has(n)) {
        // Relativsatz, wenn der Abschnitt bis zum nächsten Satzzeichen mit einem kleingeschriebenen Wort endet („…, die in M1 vertreten werden")
        const abschnitt = /^[^,.;:!?\n]*/.exec(t.slice(i + 1))![0]
        const letztes = /(\p{L}+)\W*$/u.exec(abschnitt)?.[1] ?? ''
        if (letztes && !istGross(letztes)) return i
      }
    }
    if (c === ' ' && /^\s(?:–|—)\s/.test(t.slice(i, i + 3))) return i
    if (c === ' ') {
      const w = /^\s+(und|oder|sowie|dann|anschließend)\s+/.exec(t.slice(i))
      if (w && beginntImperativ(t, i + w[0].length)) return i
    }
    i++
  }
  return t.length
}

/** Stellen, an denen ein Satz oder Teilsatz beginnt (Textanfang, Satzzeichen, Klammer, „a)“, Aufzählungszeichen, Komma, „und“) – als Lookbehind */
const ANFANG = String.raw`(?<=^|[.!?;:\n]\s*|\(\s*|(?:^|\s)[a-z0-9]\)\s+|[-–•]\s+|,\s+|\s(?:und|oder|sowie|dann|anschließend)\s+)()`

interface Kandidat {
  start: number
  ende: number
  falsch: string
  /** Ersatz für [start, ende) */
  ersatz: string
  /** Wort, das ans Hauptsatzende kommt (leer = keins) */
  partikel: string
  /** Muster für die Meldung */
  richtig: string
  /** Der Operator war fett gesetzt – die Partikel am Satzende wird es auch */
  fett: boolean
}

/** Wendungen, deren Nomen/Präpositionalteil ans Satzende gehört */
const WENDUNGEN: { muster: RegExp; verb: string; hinten: string }[] = [
  { muster: /^stellung\s*nehmen$/i, verb: 'nehmen', hinten: 'Stellung' },
  { muster: /^stellung\s*beziehen$/i, verb: 'beziehen', hinten: 'Stellung' },
  { muster: /^bezug\s*nehmen$/i, verb: 'nehmen', hinten: 'Bezug' },
  { muster: /^in\s+beziehung\s+setzen$/i, verb: 'setzen', hinten: 'in Beziehung' }
]

function kandidaten(t: string): Kandidat[] {
  const out: Kandidat[] = []
  const v = bekannteVerben()
  const zitate = zitatBereiche(t)
  const imZitat = (p: number): boolean => zitate.some(([a, b]) => p > a && p < b)

  // 1. Wendungen in Infinitivstellung: „Stellung nehmen Sie", „Stellungnehmen Sie", „In Beziehung setzen Sie"
  const wendung = new RegExp(`${ANFANG}(\\*\\*)?((?:[Ii]n\\s+)?\\p{L}+\\s*\\p{L}*?(?:nehmen|beziehen|setzen))(\\*\\*)?(\\s+)(Sie)(?![\\p{L}])`, 'gu')
  for (const m of t.matchAll(wendung)) {
    const start = m.index! + m[1].length
    if (imZitat(start)) continue
    const phrase = m[3]
    const w = WENDUNGEN.find((x) => x.muster.test(phrase.replace(/\s+/g, ' ').trim()))
    if (!w) continue
    const fett = Boolean(m[2] && m[4])
    out.push({
      start,
      ende: start + m[0].length - m[1].length,
      falsch: `${phrase} Sie`,
      ersatz: `${fett ? '**' : ''}${istGross(phrase) ? gross(w.verb) : w.verb}${fett ? '**' : ''} Sie`,
      partikel: w.hinten,
      richtig: `${gross(w.verb)} Sie … ${w.hinten}`,
      fett
    })
  }

  // 2. Einzelwort am Satzanfang mit „Sie" danach oder als unzulässige du-/ihr-Form
  const wort = new RegExp(`${ANFANG}(\\*\\*)?(\\p{L}+)(\\*\\*)?(?=(\\s+(?:Sie|sie|dich|euch|sich)(?![\\p{L}]))?)`, 'gu')
  for (const m of t.matchAll(wort)) {
    const start = m.index! + m[1].length
    if (imZitat(start) || out.some((k) => start >= k.start && start < k.ende)) continue
    const roh = m[3]
    const w = roh.toLocaleLowerCase('de')
    const folgt = (m[5] ?? '').trim()
    const fett = Boolean(m[2] && m[4])
    const wortEnde = start + (m[2]?.length ?? 0) + roh.length + (m[4]?.length ?? 0)
    // Groß- und Kleinschreibung wie im Text („… und erläutere Sie" → „… und erläutern Sie")
    const wie = (x: string): string => (istGross(roh) ? gross(x) : x)
    // Mitten im Satz großgeschrieben ist es ein Substantiv – nur am Satzanfang oder nach „und" klein
    if (!istGross(roh) && !/(?:und|oder|sowie|dann|anschließend)\s+$|,\s+$/.test(t.slice(0, start))) continue
    if (folgt === 'Sie') {
      // a) Infinitiv eines trennbaren Verbs + Sie: „Zusammenfassen Sie" → „Fassen Sie … zusammen"
      const tr = trennbaresVerb(w)
      if (tr && (v.inf.has(w) || GRUNDVERBEN.has(tr.grund))) {
        out.push({
          start,
          ende: wortEnde,
          falsch: `${roh} Sie`,
          ersatz: `${fett ? '**' : ''}${wie(tr.grund)}${fett ? '**' : ''}`,
          partikel: tr.partikel,
          richtig: `${gross(tr.grund)} Sie … ${tr.partikel}`,
          fett
        })
        continue
      }
      // b) du- oder ihr-Imperativ + Sie: „Erläutere Sie" → „Erläutern Sie", „Lies Sie" → „Lesen Sie"
      const inf = v.inf.has(w) ? null : (v.du.get(w) ?? v.ihr.get(w) ?? null)
      if (inf) {
        const tr2 = trennbaresVerb(inf)
        // „Fasse Sie" gehört zu „fassen", nicht zu „zusammenfassen": das Grundverb nehmen
        const grund = tr2 ? tr2.grund : inf
        out.push({
          start,
          ende: wortEnde,
          falsch: `${roh} Sie`,
          ersatz: `${fett ? '**' : ''}${wie(grund)}${fett ? '**' : ''}`,
          partikel: tr2 ? tr2.partikel : '',
          richtig: `${gross(grund)} Sie${tr2 ? ` … ${tr2.partikel}` : ''}`,
          fett
        })
      }
      continue
    }
    // c) Trennbares Verb ungetrennt in du-/ihr-Form: „Zusammenfasse den Text" → „Fasse den Text zusammen"
    if (!istGross(roh)) continue
    for (const p of TRENNBAR) {
      if (!w.startsWith(p) || w.length - p.length < 3) continue
      const rest = w.slice(p.length)
      const inf = v.du.get(rest) ?? v.ihr.get(rest)
      if (!inf || !trennbaresVerb(p + inf) || !v.anweisung.has(p + inf) || NOMEN_FALLE.has(w)) continue
      out.push({
        start,
        ende: wortEnde,
        falsch: roh,
        ersatz: `${fett ? '**' : ''}${gross(rest)}${fett ? '**' : ''}`,
        partikel: p,
        richtig: `${gross(rest)} … ${p}`,
        fett
      })
      break
    }
  }

  // 3. Partikel direkt hinter dem Verb, obwohl der Satz weitergeht: „Fassen Sie zusammen die Ergebnisse"
  const frueh = new RegExp(`${ANFANG}(\\*\\*)?(\\p{L}+)(\\*\\*)?(\\s+Sie)?(\\s+(?:sich|dich|euch))?\\s+(\\*\\*)?(\\p{L}+)(\\*\\*)?(?=\\s+\\p{L})`, 'gu')
  for (const m of t.matchAll(frueh)) {
    const start = m.index! + m[1].length
    if (imZitat(start) || out.some((k) => start >= k.start && start < k.ende)) continue
    const verb = m[3].toLocaleLowerCase('de')
    const partikel = m[8].toLocaleLowerCase('de')
    // Nur eindeutige Partikeln – „ein", „an", „auf", „mit" sind dort meist Artikel oder Präposition („Setzen Sie ein Wort ein")
    if (!FRUEHE_PARTIKEL.has(partikel) || !istGross(m[3])) continue
    const inf = m[5] ? verb : (v.du.get(verb) ?? v.ihr.get(verb))
    if (!inf || !trennbaresVerb(partikel + inf)) continue
    const partStart = m.index! + m[0].length - (m[7]?.length ?? 0) - m[8].length - (m[9]?.length ?? 0)
    const partEnde = m.index! + m[0].length
    // Steht direkt dahinter das Satzende oder ein Nebensatz, ist alles richtig („Fassen Sie zusammen, was …")
    if (hauptsatzEnde(t, partEnde) === partEnde) continue
    const kopf = t.slice(start, partStart).trimEnd()
    out.push({
      start,
      ende: partEnde,
      falsch: t.slice(start, partEnde),
      ersatz: kopf,
      partikel: m[8],
      richtig: `${plain(kopf)} … ${m[8]}`,
      fett: Boolean(m[7] && m[9])
    })
  }
  return out.sort((a, b) => a.start - b.start)
}

/** Partikeln, die direkt hinter dem Verb sicher falsch stehen, wenn der Satz weitergeht */
const FRUEHE_PARTIKEL = new Set(['zusammen', 'heraus', 'hervor', 'auseinander', 'gegenüber', 'dar', 'zurück', 'herbei', 'heran'])

const plain = (s: string): string => s.replace(/\*\*/g, '')

/** Wendet einen Kandidaten an: Ersatz einsetzen, Partikel ans Hauptsatzende (nicht doppelt) */
function anwenden(t: string, k: Kandidat): string {
  const vor = t.slice(0, k.start) + k.ersatz
  let rest = t.slice(k.ende)
  if (!k.partikel) return vor + rest
  const ende = hauptsatzEnde(rest, 0)
  const satz = rest.slice(0, ende)
  // Schon am Ende vorhanden („Zusammenfassen Sie … zusammen")?
  const schonDa = new RegExp(`(?:^|\\s)(?:\\*\\*)?${k.partikel.replace(/\s+/g, '\\s+')}(?:\\*\\*)?\\s*$`, 'iu').test(satz)
  if (schonDa) return vor + rest
  const kern = satz.trimEnd()
  const luecke = satz.slice(kern.length)
  const teil = k.fett ? `**${k.partikel}**` : k.partikel
  return `${vor}${kern} ${teil}${luecke}${rest.slice(ende)}`
}

/**
 * Falsch gebildete Operatorformen in einem deutschen Arbeitsauftrag – mit Korrekturvorschlag.
 * Erkannt: Infinitiv eines trennbaren Verbs + Sie („Zusammenfassen Sie", „Herausarbeiten Sie",
 * „Auseinandersetzen Sie sich"), Wendungen in Infinitivstellung („Stellung nehmen Sie"),
 * du-/ihr-Form + Sie („Erläutere Sie", „Erläutert Sie", „Lies Sie"), ungetrennte du-Formen
 * („Zusammenfasse den Text") und die Partikel mitten im Satz („Fassen Sie zusammen die …").
 * Zitate in Anführungszeichen bleiben außen vor. Fremdsprachige Texte liefern nichts – dort ist
 * der Infinitiv als Arbeitsanweisung üblich („Résumer le texte"), also kein Fehler.
 */
export function operatorFormfehler(text: string, sprache: Listensprache = 'de'): Formfehler[] {
  if (sprache !== 'de' || !text) return []
  return kandidaten(text).map((k) => ({
    falsch: plain(k.falsch),
    richtig: k.richtig,
    position: k.start,
    korrigiert: anwenden(text, k)
  }))
}

/**
 * Alle falschen Formen korrigieren. Wiederholt, bis nichts mehr gefunden wird (jede Korrektur
 * verschiebt die Stellen dahinter); höchstens zehn Durchläufe.
 */
export function korrigiereOperatorformen(text: string, sprache: Listensprache = 'de'): { text: string; fehler: Formfehler[] } {
  if (sprache !== 'de' || !text) return { text, fehler: [] }
  let t = text
  const fehler: Formfehler[] = []
  for (let i = 0; i < 10; i++) {
    const k = kandidaten(t)[0]
    if (!k) break
    fehler.push({ falsch: plain(k.falsch), richtig: k.richtig, position: k.start, korrigiert: '' })
    const neu = anwenden(t, k)
    if (neu === t) break
    t = neu
  }
  for (const f of fehler) f.korrigiert = t
  return { text: t, fehler }
}

/** Die Meldung für die Lehrkraft – gleich formuliert in allen Programmen */
export function formfehlerMeldung(ort: string, f: Pick<Formfehler, 'falsch' | 'richtig'>): string {
  return `${ort}: „${f.falsch}" ist keine korrekte Imperativform – richtig: „${f.richtig}". Ein Klick auf „Vorschlag der App umsetzen" korrigiert die Stellung.`
}

/**
 * Regel für die KI-Aufträge: korrekte Satzstellung der Operatoren. Mit Beispielen trennbarer
 * Verben, weil die Operatoren in den Listen im Infinitiv stehen.
 */
export function operatorSatzbauRegel(anrede: 'du' | 'sie', sprache: Listensprache = 'de'): string {
  if (sprache !== 'de') {
    const bsp =
      sprache === 'en'
        ? '„Summarise …", „Comment on …"'
        : sprache === 'fr'
          ? anrede === 'du'
            ? '„Résume …", „Décris …"'
            : '„Résumez …", „Décrivez …"'
          : sprache === 'es'
            ? anrede === 'du'
              ? '„Resume …", „Describe …"'
              : '„Resuma …", „Describa …"'
            : sprache === 'it'
              ? anrede === 'du'
                ? '„Riassumi …", „Descrivi …"'
                : '„Riassumete …", „Descrivete …"'
              : anrede === 'du'
                ? '„Обобщи …", „Опиши …"'
                : '„Обобщите …", „Опишите …"'
    return `SATZBAU DER OPERATOREN: Die Operatoren der Liste stehen im Infinitiv; in der Aufgabe stehen sie als korrekt gebildeter Imperativ der Zielsprache (${bsp}).`
  }
  const bsp =
    anrede === 'sie'
      ? '„Fassen Sie anhand von M1 die Position zusammen.", „Arbeiten Sie … heraus", „Setzen Sie sich mit … auseinander", „Nehmen Sie … Stellung"'
      : '„Fasse anhand von M1 die Position zusammen.", „Arbeite … heraus", „Setze dich mit … auseinander", „Nimm … Stellung", „Lies …"'
  return `SATZBAU DER OPERATOREN: Die Listen nennen den Infinitiv; in der Aufgabe steht der konjugierte Imperativ, trennbare Verben mit der Vorsilbe am Satzende (${bsp}). FALSCH: „Zusammenfassen Sie …", „Erläutere Sie …".`
}
