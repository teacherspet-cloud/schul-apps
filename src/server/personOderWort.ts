/**
 * Person oder Wort? (08.10.2026, Wunsch der Lehrkraft) – Namen aus der Klassenliste, die zugleich gewöhnliche Wörter
 * sind (Rose, Otto, Martin, Mark, Paris, Mai, Jan; rose, will, may, grace; rosa, mia, ben …), werden vor einer KI-Anfrage
 * nur ersetzt, wenn die Person gemeint ist. Entschieden wird HIER, lokal und ohne KI (es verlässt nichts den Server,
 * bevor entschieden ist), mit festen Regeln je Sprache:
 *
 *  WORT-Signale: das Wort steht auch im Material/in der Aufgabe/Vokabelliste derselben Anfrage; Artikel/Begleiter davor
 *  (de die/eine/…, en the/a/an/my, fr le/la/les/un/une/des/du, es el/la/los/las/un/una, it il/lo/la/i/gli/le/un/una,
 *  nl de/het/een, pt o/a/os/as/um/uma); deutsches Artikel+Adjektiv („die rote Rose"); Plural/Zusammensetzung (Rosen,
 *  Rosenstrauch, Ottomotor, Martinsgans); Kleinschreibung (außer Deutsch am Satzanfang bedeutungslos); Wendungen
 *  (Sankt/St. Martin, „5 Mark", „im Mai", „Will you"); Zahl davor.
 *  PERSON-Signale: Präposition/Anrede davor (mit/von/für/bei/zu, Frau/Herr, Liebe/Hallo; with/Mr/Dear/Hi; avec/Mme/Salut;
 *  con/Sr./Hola; con/Sig./Ciao; cum/Salve; с/у/Привет …); Personenverb danach (sagt, meint, fragt; says, thinks; dit;
 *  dice; dicit/inquit; говорит …); Anrede am Satzanfang mit Komma („Rose, kannst du …"); Genitiv als Name („Roses Heft",
 *  „Rose's", „de Rose"); zusammen mit anderen Namen der Liste („Anna, Rose und Ben"); Unterschrift am Textende; eigener
 *  Name; in Sprachen außer Deutsch: Großschreibung mitten im Satz.
 *  Gleichstand oder keine Signale → PERSON (Datenschutz geht vor).
 *
 * Es wird nichts protokolliert (keine Namen in Protokollen).
 */

export type Sprache = 'de' | 'en' | 'fr' | 'es' | 'it' | 'la' | 'nl' | 'pt' | 'ru' | 'pl' | 'tr' | 'cs' | 'allgemein'

export interface WortKontext {
  /** Sprache des Textes (Fach/Zielsprache), sonst wird sie geschätzt */
  sprache?: string
  /** Aufgaben-, Material- und Lösungstext, Vokabelliste derselben Anfrage */
  material?: string
  /** Alle Namen der Klassenliste (für „zusammen mit anderen Namen") */
  namen?: string[]
  /** Name der Person, deren Text das ist */
  eigenerName?: string
}

export interface Urteil {
  person: boolean
  personPunkte: number
  wortPunkte: number
}

const SPRACH_NAMEN: Record<string, Sprache> = {
  deutsch: 'de',
  englisch: 'en',
  english: 'en',
  franzoesisch: 'fr',
  französisch: 'fr',
  spanisch: 'es',
  italienisch: 'it',
  latein: 'la',
  niederlaendisch: 'nl',
  niederländisch: 'nl',
  portugiesisch: 'pt',
  russisch: 'ru',
  polnisch: 'pl',
  tuerkisch: 'tr',
  türkisch: 'tr',
  tschechisch: 'cs'
}
const CODES = new Set(['de', 'en', 'fr', 'es', 'it', 'la', 'nl', 'pt', 'ru', 'pl', 'tr', 'cs'])

/** Fach-/Sprachangabe („Englisch", „en", „en-GB") → Sprache */
export function spracheAus(angabe: string | undefined): Sprache | null {
  const a = (angabe ?? '').trim().toLowerCase()
  if (!a) return null
  const code = a.slice(0, 2)
  if (CODES.has(code) && (a.length === 2 || /^[a-z]{2}[-_]/.test(a))) return code as Sprache
  return SPRACH_NAMEN[a] ?? null
}

/** Häufige Wörter je Sprache – für die Schätzung */
const STOPP: Record<Exclude<Sprache, 'allgemein' | 'ru'>, string[]> = {
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ich', 'mit', 'ein', 'eine', 'zu', 'auf', 'den', 'sie', 'es', 'hat', 'auch'],
  en: ['the', 'and', 'is', 'not', 'you', 'with', 'are', 'to', 'of', 'he', 'she', 'it', 'was', 'have', 'my', 'this'],
  fr: ['le', 'la', 'les', 'et', 'est', 'pas', 'je', 'avec', 'une', 'un', 'des', 'du', 'il', 'elle', 'que', 'dans'],
  es: ['el', 'la', 'los', 'las', 'y', 'es', 'no', 'yo', 'con', 'una', 'un', 'que', 'en', 'está', 'por', 'muy'],
  it: ['il', 'lo', 'gli', 'e', 'è', 'non', 'io', 'con', 'una', 'un', 'che', 'di', 'sono', 'per', 'della', 'mio'],
  la: ['et', 'est', 'in', 'non', 'cum', 'sed', 'ad', 'ego', 'sunt', 'quod', 'qui', 'quae', 'ex', 'ab', 'erat', 'nunc'],
  nl: ['de', 'het', 'een', 'en', 'is', 'niet', 'ik', 'met', 'van', 'op', 'zijn', 'ze', 'hij', 'dat', 'wat', 'maar'],
  pt: ['o', 'os', 'as', 'e', 'é', 'não', 'eu', 'com', 'uma', 'um', 'que', 'em', 'do', 'da', 'muito', 'está'],
  pl: ['i', 'jest', 'nie', 'ja', 'z', 'się', 'na', 'to', 'że', 'w', 'jak', 'ale', 'mam', 'co', 'do', 'był'],
  tr: ['ve', 'bir', 'bu', 'ben', 'ile', 'değil', 'çok', 'ne', 'var', 'için', 'da', 'de', 'mi', 'gibi', 'ama', 'sen'],
  cs: ['a', 'je', 'ne', 'já', 's', 'se', 'na', 'to', 'že', 'v', 'jak', 'ale', 'mám', 'co', 'do', 'byl']
}

/** Sprache eines Textes schätzen (Schrift, dann häufige Wörter) */
export function schaetzeSprache(text: string): Sprache {
  if (/[Ѐ-ӿ]/.test(text)) return 'ru'
  const woerter = text.toLowerCase().match(/\p{L}+/gu) ?? []
  let beste: Sprache = 'allgemein'
  let punkte = 1
  for (const [sp, liste] of Object.entries(STOPP) as [Sprache, string[]][]) {
    const set = new Set(liste)
    const n = woerter.filter((w) => set.has(w)).length
    if (n > punkte) {
      beste = sp
      punkte = n
    }
  }
  return beste
}

interface Regeln {
  /** Artikel/Begleiter direkt davor → Wort */
  artikel: string[]
  /** Wörter davor, die eine Person einleiten */
  vorPerson: string[]
  /** Wörter danach, die eine Person verlangen (Verben des Sagens/Denkens …) */
  nachPerson: string[]
  /** Anrede/Gruß davor */
  gruss: string[]
  /** Aufzählungswörter („und") */
  und: string[]
  /** Großschreibung trägt Bedeutung (nicht im Deutschen: Nomen werden großgeschrieben) */
  grossZaehlt: boolean
  /** Flektierende Sprache: Endungen bis 3 Buchstaben sind Namensformen (Мартина), keine Zusammensetzung */
  endungen: boolean
}

const R = (r: Partial<Regeln>): Regeln => ({ artikel: [], vorPerson: [], nachPerson: [], gruss: [], und: [], grossZaehlt: true, endungen: false, ...r })

const REGELN: Record<Sprache, Regeln> = {
  de: R({
    artikel: ['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'einen', 'einem', 'eines', 'keine', 'kein', 'keinen', 'jede', 'jeder', 'jedes', 'diese', 'dieser', 'diesen', 'welche'],
    vorPerson: ['mit', 'von', 'für', 'bei', 'zu', 'frau', 'herr', 'herrn', 'liebe', 'lieber', 'hallo', 'hi', 'ich', 'neben', 'ohne', 'gegen'],
    nachPerson: ['sagt', 'sagte', 'meint', 'meinte', 'findet', 'fragt', 'fragte', 'antwortet', 'antwortete', 'schreibt', 'schrieb', 'denkt', 'glaubt', 'hat', 'ist', 'war', 'kommt', 'kam', 'geht', 'ging', 'spielt', 'lacht', 'weint', 'möchte', 'will', 'kann', 'und'],
    gruss: ['liebe', 'lieber', 'hallo', 'hi', 'hey', 'servus', 'moin'],
    und: ['und', 'oder', 'sowie'],
    grossZaehlt: false
  }),
  en: R({
    artikel: ['the', 'a', 'an', 'my', 'your', 'his', 'her', 'our', 'their', 'this', 'that', 'these', 'those', 'some', 'every', 'no', 'red', 'white', 'yellow', 'pink'],
    vorPerson: ['with', 'from', 'for', 'to', 'and', 'mr', 'mrs', 'miss', 'ms', 'dear', 'hi', 'hello', 'by', 'told', 'asked', 'met', 'called'],
    nachPerson: ['says', 'said', 'thinks', 'thought', 'asks', 'asked', 'answers', 'answered', 'writes', 'wrote', 'likes', 'is', 'was', 'has', 'had', 'goes', 'went', 'plays', 'and'],
    gruss: ['dear', 'hi', 'hello', 'hey'],
    und: ['and', 'or']
  }),
  fr: R({
    artikel: ['le', 'la', 'les', 'un', 'une', 'des', 'du', 'ce', 'cette', 'ces', 'mon', 'ma', 'mes', 'sa', 'son', 'ses', 'en', "l'"],
    vorPerson: ['avec', 'pour', 'chez', 'et', 'm', 'mme', 'mlle', 'cher', 'chère', 'salut', 'bonjour', 'à'],
    nachPerson: ['dit', 'pense', 'demande', 'répond', 'écrit', 'est', 'a', 'va', 'aime', 'et'],
    gruss: ['cher', 'chère', 'salut', 'bonjour', 'coucou'],
    und: ['et', 'ou']
  }),
  es: R({
    artikel: ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'mi', 'tu', 'su', 'este', 'esta', 'color'],
    vorPerson: ['con', 'para', 'y', 'sr', 'sra', 'srta', 'querido', 'querida', 'hola', 'a', 'de'],
    nachPerson: ['dice', 'dijo', 'piensa', 'pregunta', 'responde', 'escribe', 'es', 'está', 'tiene', 'va', 'y'],
    gruss: ['querido', 'querida', 'hola'],
    und: ['y', 'o', 'e']
  }),
  it: R({
    artikel: ['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'mio', 'mia', 'tuo', 'tua', 'suo', 'sua', 'questo', 'questa', 'color', "l'"],
    vorPerson: ['con', 'per', 'e', 'sig', 'sig.ra', 'signora', 'signor', 'caro', 'cara', 'ciao', 'a', 'di'],
    nachPerson: ['dice', 'disse', 'pensa', 'chiede', 'risponde', 'scrive', 'è', 'ha', 'va', 'e'],
    gruss: ['caro', 'cara', 'ciao', 'salve'],
    und: ['e', 'o', 'ed']
  }),
  la: R({
    artikel: [],
    vorPerson: ['cum', 'et', 'ad', 'ab', 'a', 'salve', 'ave', 'mi', 'care', 'cara'],
    nachPerson: ['dicit', 'dixit', 'inquit', 'putat', 'rogat', 'respondet', 'scribit', 'est', 'erat', 'et', 'venit', 'amat'],
    gruss: ['salve', 'salvete', 'ave'],
    und: ['et', 'atque', 'ac', 'aut']
  }),
  nl: R({
    artikel: ['de', 'het', 'een', 'mijn', 'jouw', 'zijn', 'haar', 'deze', 'die', 'dit', 'dat'],
    vorPerson: ['met', 'van', 'voor', 'bij', 'en', 'meneer', 'mevrouw', 'beste', 'lieve', 'hallo', 'hoi'],
    nachPerson: ['zegt', 'zei', 'denkt', 'vraagt', 'antwoordt', 'schrijft', 'is', 'heeft', 'gaat', 'en'],
    gruss: ['beste', 'lieve', 'hallo', 'hoi'],
    und: ['en', 'of']
  }),
  pt: R({
    artikel: ['o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'meu', 'minha', 'teu', 'tua', 'seu', 'sua', 'cor'],
    vorPerson: ['com', 'para', 'e', 'sr', 'sra', 'querido', 'querida', 'olá', 'oi', 'de'],
    nachPerson: ['diz', 'disse', 'pensa', 'pergunta', 'responde', 'escreve', 'é', 'está', 'tem', 'vai', 'e'],
    gruss: ['querido', 'querida', 'olá', 'oi'],
    und: ['e', 'ou']
  }),
  ru: R({
    vorPerson: ['с', 'со', 'у', 'к', 'от', 'для', 'про', 'и', 'привет', 'дорогой', 'дорогая', 'здравствуй'],
    nachPerson: ['говорит', 'сказал', 'сказала', 'думает', 'спрашивает', 'отвечает', 'пишет', 'был', 'была', 'идёт', 'и'],
    gruss: ['привет', 'дорогой', 'дорогая', 'здравствуй', 'здравствуйте'],
    und: ['и', 'или', 'а'],
    endungen: true
  }),
  pl: R({
    vorPerson: ['z', 'ze', 'dla', 'od', 'u', 'do', 'i', 'pan', 'pani', 'cześć', 'drogi', 'droga'],
    nachPerson: ['mówi', 'powiedział', 'powiedziała', 'myśli', 'pyta', 'odpowiada', 'pisze', 'jest', 'ma', 'i'],
    gruss: ['cześć', 'drogi', 'droga', 'witaj'],
    und: ['i', 'oraz', 'lub'],
    endungen: true
  }),
  cs: R({
    vorPerson: ['s', 'se', 'pro', 'od', 'u', 'k', 'a', 'pan', 'paní', 'ahoj', 'milý', 'milá'],
    nachPerson: ['říká', 'řekl', 'řekla', 'myslí', 'ptá', 'odpovídá', 'píše', 'je', 'má', 'a'],
    gruss: ['ahoj', 'milý', 'milá'],
    und: ['a', 'nebo'],
    endungen: true
  }),
  tr: R({
    vorPerson: ['ve', 'sevgili', 'merhaba', 'bay', 'bayan'],
    nachPerson: ['diyor', 'dedi', 'düşünüyor', 'soruyor', 'cevap', 'yazıyor', 've'],
    gruss: ['sevgili', 'merhaba', 'selam'],
    und: ['ve', 'veya'],
    endungen: true
  }),
  allgemein: R({ und: ['and', 'und', 'et', 'y', 'e', 'i', 'en'] })
}

/** Deutsche Wendungen und Namen, die Wörter sind (Kleinbuchstaben) */
const WENDUNGEN_VOR_WORT = ['sankt', 'st.', 'st']
const WORT_VERBEN = ['blüht', 'blühen', 'blühte', 'duftet', 'welkt', 'verwelkt', 'wächst', 'blooms', 'bloomed', 'smells', 'fleurit', 'florece', 'fiorisce']
const MONATE = new Set(['mai', 'jan', 'juni', 'juli', 'april', 'august', 'may', 'june', 'july'])
const MODALE_EN = new Set(['will', 'may', 'can', 'bill', 'mark', 'rob', 'grace', 'joy', 'rose', 'sue', 'pat', 'jack'])
const PRONOMEN_EN = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'there'])

const WORT = /[\p{L}\p{M}'’-]/u

/** Verben/Wörter danach, die auch nach einem Ding stehen („die Rose ist rot") – zählen nur schwach */
const SCHWACH = new Set(
  'ist hat war und kommt geht spielt is was has had and goes went plays likes est a et va aime es está tiene y è ha e heeft en gaat é tem vai erat i je má ma jest ve venit amat идёт был была'.split(' ')
)

/** Wörter links von `ab` (nächstes zuerst), höchstens `n`, mit dem Trenntext dazwischen */
function links(text: string, ab: number, n: number): { wort: string; trenner: string }[] {
  const aus: { wort: string; trenner: string }[] = []
  let i = ab
  while (aus.length < n && i > 0) {
    let j = i
    while (j > 0 && !WORT.test(text[j - 1]) && !/\d/.test(text[j - 1])) j--
    const trenner = text.slice(j, i)
    let k = j
    while (k > 0 && (WORT.test(text[k - 1]) || /\d|\./.test(text[k - 1]))) k--
    if (k === j) break
    aus.push({ wort: text.slice(k, j), trenner })
    i = k
  }
  return aus
}

function rechts(text: string, ab: number, n: number): { wort: string; trenner: string }[] {
  const aus: { wort: string; trenner: string }[] = []
  let i = ab
  while (aus.length < n && i < text.length) {
    let j = i
    while (j < text.length && !WORT.test(text[j]) && !/\d/.test(text[j])) j++
    const trenner = text.slice(i, j)
    let k = j
    while (k < text.length && (WORT.test(text[k]) || /\d/.test(text[k]))) k++
    if (k === j) break
    aus.push({ wort: text.slice(j, k), trenner })
    i = k
  }
  return aus
}

const klein = (s: string): string => s.toLocaleLowerCase()
const istGross = (s: string): boolean => s.length > 0 && s[0] !== s[0].toLocaleLowerCase() && s[0] === s[0].toLocaleUpperCase()

/** Steht der Wortanfang am Satzanfang (Textanfang, nach . ! ? : Zeilenumbruch, Anführungszeichen)? */
function amSatzanfang(text: string, index: number): boolean {
  let i = index - 1
  while (i >= 0 && /[\s"„“”'«»‚‘(\-–—]/.test(text[i])) {
    if (text[i] === '\n') return true
    i--
  }
  return i < 0 || /[.!?:;…]/.test(text[i])
}

/** Platzhalter, die schon für Personen stehen ([Person-2]) */
const PLATZHALTER = /^\[?Person-\d+\]?$/

/**
 * Ist das Vorkommen von `name` an Stelle `index` in `text` die Person oder das Wort?
 * `index` zeigt auf den Anfang des Vorkommens; das Vorkommen ist das ganze Wort ab dort (mit Endungen).
 */
export function personOderWort(text: string, index: number, name: string, kontext: WortKontext = {}): Urteil {
  let ende = index
  while (ende < text.length && WORT.test(text[ende]) && text[ende] !== "'" && text[ende] !== '’') ende++
  const token = text.slice(index, ende)
  const satzStart = Math.max(text.lastIndexOf('\n', index - 1), ...['. ', '! ', '? '].map((z) => text.lastIndexOf(z, index - 1))) + 1
  const satzEnde = (() => {
    const kandidaten = ['. ', '! ', '? ', '\n'].map((z) => text.indexOf(z, ende)).filter((x) => x >= 0)
    return kandidaten.length ? Math.min(...kandidaten) : text.length
  })()
  const satz = text.slice(satzStart, satzEnde)
  const sprache = spracheAus(kontext.sprache) ?? schaetzeSprache(satz.length > 20 ? satz : text)
  const r = REGELN[sprache]
  const nameK = klein(name)
  const tokenK = klein(token)
  const vor = links(text, index, 3)
  const nach = rechts(text, ende, 3)
  const vor1 = vor[0] ? klein(vor[0].wort).replace(/\.$/, '') : ''
  const vor1Roh = vor[0]?.wort ?? ''
  const nach1 = nach[0] ? klein(nach[0].wort) : ''
  const anfang = amSatzanfang(text, index)
  let person = 0
  let wort = 0

  // Eigener Name im eigenen Text
  if (kontext.eigenerName && klein(kontext.eigenerName).split(/\s+/).includes(tokenK)) person += 10

  // --- Form des Vorkommens
  // Flektierende Sprachen: Роза → Розой, Rosa → Rosą (der Endvokal fällt weg)
  const stamm = r.endungen && /[аяоеыиaeoy]$/i.test(nameK) ? nameK.slice(0, -1) : nameK
  const rest = tokenK.startsWith(nameK) ? tokenK.slice(nameK.length) : tokenK.slice(stamm.length)
  const apostrophGenitiv = /^['’]s\b/.test(text.slice(ende, ende + 3))
  if (apostrophGenitiv) person += 2
  if (rest) {
    // Genitiv als Name: „Martins Idee", „Roses Heft" (danach ein großgeschriebenes Nomen)
    if (rest === 's' && sprache === 'de' && nach[0] && istGross(nach[0].wort) && nach[0].trenner === ' ') person += 2
    else if (rest === 's' && sprache === 'de') person += 1
    else if (r.endungen && rest.length <= 3) {
      /* Fallendung eines Namens (Мартина, Martinem) – neutral */
    } else if (sprache === 'en' && rest === 's' && !istGross(token)) wort += 3
    else wort += 3 // Plural oder Zusammensetzung: Rosen, Rosenstrauch, Ottomotor, Martinsgans
  }

  // --- Groß-/Kleinschreibung
  if (!istGross(token)) wort += r.grossZaehlt ? 4 : 2
  else if (r.grossZaehlt && !anfang) person += 2

  // --- Material derselben Anfrage (Aufgabe, Erwartung, Vokabelliste)
  if (kontext.material) {
    const im = new RegExp(`(?<![\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'iu')
    if (im.test(kontext.material)) wort += 3
  }

  // --- Davor
  if (vor[0] && /^\s*$/.test(vor[0].trenner)) {
    if (r.artikel.includes(vor1) || r.artikel.includes(vor1Roh.toLowerCase())) wort += 2
    // deutsch: Artikel + Adjektiv („die rote Rose", „eine schöne Rose")
    if (sprache === 'de' && vor[1] && REGELN.de.artikel.includes(klein(vor[1].wort)) && /^[a-zäöüß]+(e|en|er|es|em)$/.test(vor[0].wort)) wort += 3
    // Possessiv + Adjektiv (meine schöne Rose)
    if (sprache === 'de' && vor[1] && /^(mein|dein|sein|ihr|unser|euer)(e|en|er|em|es)?$/i.test(vor[1].wort) && /^[a-zäöüß]+(e|en|er|es|em)$/.test(vor[0].wort)) wort += 3
    if (/^\d/.test(vor[0].wort) || /^(ein|zwei|drei|vier|fünf|zehn|hundert|tausend|one|two|ten|hundred)$/i.test(vor[0].wort)) wort += 3
    if (MONATE.has(nameK) && /^(im|am|anfang|ende|mitte|in|bis|seit|vom|zum|ab)$/i.test(vor[0].wort)) wort += 3
    if (r.vorPerson.includes(vor1)) person += 2
    if (r.gruss.includes(vor1)) person += 2
    if (/^(frau|herr|herrn|mr|mrs|ms|miss|mme|mlle|sr|sra|sig|pan|pani|bay|bayan|meneer|mevrouw)$/i.test(vor1)) person += 2
  }
  // Sankt/St. Martin
  if (vor[0] && /^\.?\s*$/.test(vor[0].trenner) && WENDUNGEN_VOR_WORT.includes(klein(vor[0].wort))) wort += 4
  // „und ich", „ich und" (de), „and I" (en) rund um das Vorkommen
  if (sprache === 'de' && ((vor1 === 'ich' && vor[1] && klein(vor[1].wort) === 'und') || (nach1 === 'und' && nach[1] && klein(nach[1].wort) === 'ich'))) person += 2
  if (sprache === 'en' && nach1 === 'and' && nach[1] && klein(nach[1].wort) === 'i') person += 2
  // Französisch/Spanisch/Italienisch/Portugiesisch: „le cahier de Rose", „de Rosa", „di Rosa"
  if (['fr', 'es', 'it', 'pt'].includes(sprache) && ['de', 'di', 'da', 'del'].includes(vor1) && istGross(token) && !anfang) person += 1

  // --- Danach
  if (nach[0]) {
    const direkt = /^\s*$/.test(nach[0].trenner)
    if (direkt && r.nachPerson.includes(nach1)) person += SCHWACH.has(nach1) ? 1 : 2
    if (direkt && WORT_VERBEN.includes(nach1)) wort += 3
    // Anrede am Satzanfang mit Komma: „Rose, kannst du …"
    if (anfang && /^,\s*$/.test(nach[0].trenner)) person += 3
    // Englisch: „Will you …?", „May I …?" am Satzanfang → Hilfsverb
    if (sprache === 'en' && anfang && MODALE_EN.has(nameK) && direkt && PRONOMEN_EN.has(nach1)) wort += 5
    if (sprache === 'en' && ['the', 'a', 'an'].includes(vor1) && direkt) wort += 1
  }
  // Englisch: Pronomen/Subjekt + „rose" (Vergangenheit von rise)
  if (sprache === 'en' && nameK === 'rose' && vor[0] && (PRONOMEN_EN.has(vor1) || vor1 === 'sun' || vor1 === 'prices')) wort += 3

  // --- Zusammen mit anderen Namen der Liste („Anna, Rose und Ben")
  const andere = new Set((kontext.namen ?? []).flatMap((n) => klein(n).split(/\s+/)).filter((n) => n && n !== nameK))
  const nachbarName = (w: { wort: string; trenner: string } | undefined): boolean =>
    Boolean(w) && (andere.has(klein(w!.wort)) || PLATZHALTER.test(w!.wort)) && /^[\s,]*$/.test(w!.trenner)
  const undWort = new Set([...r.und, ...REGELN.allgemein.und])
  const liste =
    (nachbarName(vor[0]) && /,/.test(vor[0].trenner)) ||
    (vor[0] && undWort.has(vor1) && nachbarName(vor[1])) ||
    (nachbarName(nach[0]) && /,/.test(nach[0].trenner)) ||
    (nach[0] && undWort.has(nach1) && nachbarName(nach[1]))
  if (liste) person += 3
  // Platzhalter direkt daneben ([Person-1] und Rose)
  if (/\]\s*(,|und|and|et|y|e|i|и)\s*$/i.test(text.slice(Math.max(0, index - 12), index))) person += 3

  // --- Unterschrift am Textende („Viele Grüße\nRose")
  const danach = text.slice(ende).trim()
  if (!danach || /^[.!]?$/.test(danach)) {
    const davor = text.slice(Math.max(0, index - 40), index)
    if (/\n\s*$/.test(davor) || /(grüße|gruß|grüßen|regards|wishes|love|bisous|saludos|saluti|groeten|cordiali|vale)[\s,!.]*$/i.test(davor)) person += 3
  }

  return { person: person >= wort, personPunkte: person, wortPunkte: wort }
}
