/**
 * Abkürzungen in Vokabeln (09.10.2026, Wunsch der Lehrkraft): Einträge wie „YA = young adults", „e.g. (= for example)",
 * „sb. = somebody", „UK – United Kingdom", „Mr (= Mister)" oder auf der deutschen Seite „z. B. = zum Beispiel".
 *
 * Erkannt wird nur, was wirklich nach Abkürzung aussieht – sonst würden Gleichungen wie „big = large" (Synonyme) oder
 * Angaben wie „flat (BE)" falsch zerlegt:
 *  - Die kurze Seite ist ein Wort mit Punkt („e.g.", „sb.", „z. B.", „approx."), eine Buchstabenfolge mit mindestens zwei
 *    Großbuchstaben („YA", „BBC", „R&B") – oder, nur mit ausdrücklichem „=", ein kurzes Wort, dessen Buchstaben der Reihe
 *    nach in der langen Seite stehen und mit demselben Buchstaben beginnen („Mr" → „Mister", „km" → „kilometre").
 *  - Bei Klammern ohne „=" und beim Gedankenstrich muss eine Großbuchstaben-Abkürzung zu den Buchstaben der langen
 *    Seite passen („UK (United Kingdom)", „young adults (YA)").
 * Ergebnis: { kurz, lang, rest } – `rest` sind Angaben in eckigen Klammern („[n]"), die zu keiner Seite gehören.
 *
 * Zuerst gilt die geprüfte Tabelle des Lehrwerks bzw. Fachs (shared/abkuerzungen) – genau der Eintrag, wie er im Buch
 * steht; die allgemeinen Regeln greifen nur, wo sie nichts sagt.
 *
 * Reine Funktionen für Lern-App, Server, Vokabeltest und Sprachausgabe.
 */
import { abkEintrag, type AbkUeben } from './abkuerzungen'

export interface Abkuerzung {
  kurz: string
  lang: string
  rest: string
}

/** „e.g.", „sb.", „z. B.", „approx.", „U.S.", „etw." – höchstens vier Teile mit Punkt */
const MIT_PUNKT = /^(?:\p{L}{1,8}\.\s?){1,4}$/u
/** „YA", „BBC", „R&B", „MP3" – mindestens zwei Großbuchstaben, keine Kleinbuchstaben */
const GROSS = /^(?=(?:[^\p{Lu}]*\p{Lu}){2})[\p{Lu}\d&]{2,8}$/u

const buchstaben = (s: string): string =>
  String(s ?? '')
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^\p{L}\d]/gu, '')

/** Stehen die Buchstaben von `kurz` der Reihe nach in `lang` – beginnend mit demselben Buchstaben? */
export function passtZuLangform(kurz: string, lang: string): boolean {
  const k = buchstaben(kurz)
  const l = buchstaben(lang.replace(/^(the|a|an|to|der|die|das|le|la|les|el|los|las)\s+/i, ''))
  if (!k || l.length < k.length + 2 || k[0] !== l[0]) return false
  let j = 0
  for (const c of l) if (c === k[j]) j++
  return j >= k.length
}

export const hatPunkt = (kurz: string): boolean => MIT_PUNKT.test(kurz.trim()) && buchstaben(kurz).length <= 10
export const istGrossAbkuerzung = (kurz: string): boolean => GROSS.test(kurz.trim())
/** Deutlich als Abkürzung erkennbar (mit Punkt oder mehreren Großbuchstaben) */
const deutlich = (kurz: string): boolean => hatPunkt(kurz) || istGrossAbkuerzung(kurz)
/** Kurzes Wort ohne Leerzeichen („Mr", „km", „info") – nur zusammen mit passenden Buchstaben */
const kurzesWort = (kurz: string): boolean => /^[\p{L}\d&]{1,6}$/u.test(kurz.trim())
/** Lange Seite: mehr als die kurze, mit Buchstaben, ohne eigenes „=" */
const taugtAlsLang = (lang: string, kurz: string): boolean =>
  /\p{L}{2}/u.test(lang) && !/=/.test(lang) && buchstaben(lang).length >= buchstaben(kurz).length + 2

type Trenner = 'gleich' | 'klammer' | 'strich'

/** Welche Seite ist die Abkürzung? */
function ordne(a: string, b: string, trenner: Trenner): { kurz: string; lang: string } | null {
  for (const [kurz, lang] of [
    [a, b],
    [b, a]
  ]) {
    if (!kurz || !lang || /\s{2,}/.test(kurz) || !taugtAlsLang(lang, kurz)) continue
    // Mit Leerzeichen nur Punkt-Abkürzungen wie „z. B."
    if (/\s/.test(kurz) && !hatPunkt(kurz)) continue
    if (trenner === 'gleich') {
      if (deutlich(kurz) || (kurzesWort(kurz) && passtZuLangform(kurz, lang))) return { kurz, lang }
    } else if (hatPunkt(kurz)) {
      // „e.g. (for example)" – Punkt-Abkürzungen der Gelehrtensprache passen oft nicht zu den Buchstaben
      if (buchstaben(lang).length >= 4) return { kurz, lang }
    } else if (istGrossAbkuerzung(kurz) && passtZuLangform(kurz, lang)) return { kurz, lang }
    else if (trenner === 'klammer' && /^\p{Lu}\p{Ll}{1,3}$/u.test(kurz) && passtZuLangform(kurz, lang)) return { kurz, lang }
  }
  return null
}

/**
 * Eintrag mit Abkürzung zerlegen; null = keine Abkürzung (normaler Eintrag). Beispielsätze gehören nicht hierher –
 * geprüft wird nur ein Wort-Eintrag (Wort oder Übersetzung).
 */
export function abkuerzungAus(text: string | undefined | null): Abkuerzung | null {
  // Geprüfte Tabelle zuerst: mit Langform ein Paar, ohne Langform ausdrücklich keins („PC", „Mr", „p.m.")
  const tab = abkEintrag(text)
  if (tab) {
    const rest = (String(text ?? '').match(/\[[^\]]*\]/g) ?? []).join(' ')
    return tab.lang ? { kurz: tab.kurz, lang: tab.lang, rest } : null
  }
  return abkuerzungAllgemein(text)
}

/** Nur die allgemeinen Regeln (ohne Tabelle) – für Tests und die Durchsicht neuer Lehrwerke */
export function abkuerzungAllgemein(text: string | undefined | null): Abkuerzung | null {
  let t = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t || t.length > 120) return null
  const rest: string[] = []
  t = t
    .replace(/\s*\[[^\]]*\]/g, (m) => (rest.push(m.trim()), ''))
    .trim()
  const fertig = (o: { kurz: string; lang: string } | null, nachher = ''): Abkuerzung | null =>
    o ? { kurz: o.kurz.trim(), lang: o.lang.trim(), rest: [nachher.trim(), ...rest].filter(Boolean).join(' ') } : null
  // „e.g. (= for example)", „Mr (= Mister)" – auch umgekehrt „for example (= e.g.)"
  let m = /^(.+?)\s*\(\s*=\s*([^()]+?)\s*\)(.*)$/.exec(t)
  if (m) return fertig(ordne(m[1].trim(), m[2].trim(), 'gleich'), m[3])
  // „YA = young adults" – genau ein Gleichheitszeichen
  if ((t.match(/=/g) ?? []).length === 1) {
    m = /^(.+?)\s*=\s*(.+)$/.exec(t)
    if (m) return fertig(ordne(m[1].trim(), m[2].trim(), 'gleich'))
  }
  // „UK (United Kingdom)", „young adults (YA)"
  m = /^([^()]+?)\s*\(([^()]+)\)(.*)$/.exec(t)
  if (m) return fertig(ordne(m[1].trim(), m[2].trim(), 'klammer'), m[3])
  // „UK – United Kingdom" (Strich mit Leerzeichen davor und danach)
  m = /^(.+?)\s+[–—-]\s+(.+)$/.exec(t)
  if (m) return fertig(ordne(m[1].trim(), m[2].trim(), 'strich'))
  return null
}

export const istAbkuerzung = (text: string | undefined | null): boolean => abkuerzungAus(text) !== null

/** Welche Abkürzungs-Übungen zu diesem Eintrag passen (Tabelle; allgemein erkannte Paare: beide) */
export function abkUeben(term: string | undefined | null): AbkUeben {
  const tab = abkEintrag(term)
  if (tab) return tab.lang ? tab.ueben : 'keine'
  return abkuerzungAllgemein(term) ? 'beide' : 'keine'
}

/** Weitere richtige Antworten aus der Tabelle („PC" → „personal computer", „Mr" → „Mr.") */
export const auchRichtigAus = (term: string | undefined | null): string[] => abkEintrag(term)?.auchRichtig ?? []

/**
 * Platzhalter in Wendungen (09.10.2026): „sb"/„sb."/„somebody"/„someone" sind dieselbe Stelle, ebenso „sth"/
 * „something", „jmdn."/„jemanden", „etw."/„etwas" usw. – für den Vergleich von Antworten werden sie vereinheitlicht.
 * Sprachunabhängig: die Wörter kommen in den anderen Sprachen nicht als etwas anderes vor.
 */
const PLATZHALTER: [RegExp, string][] = [
  [/(?<![\p{L}])(?:sb|somebody|someone)(?:'s|’s)(?![\p{L}])/giu, '‹sbs›'],
  [/(?<![\p{L}])(?:sb\.?|somebody|someone)(?![\p{L}])/giu, '‹sb›'],
  [/(?<![\p{L}])(?:sth\.?|something)(?![\p{L}])/giu, '‹sth›'],
  [/(?<![\p{L}])(?:jmdn\.?|jmdn|jemanden)(?![\p{L}])/giu, '‹jmdn›'],
  [/(?<![\p{L}])(?:jmdm\.?|jemandem)(?![\p{L}])/giu, '‹jmdm›'],
  [/(?<![\p{L}])(?:jmds\.?|jemandes)(?![\p{L}])/giu, '‹jmds›'],
  [/(?<![\p{L}])(?:jmd\.?|jemand)(?![\p{L}])/giu, '‹jmd›'],
  [/(?<![\p{L}])(?:etw\.?|etwas)(?![\p{L}])/giu, '‹etw›'],
  [/(?<![\p{L}])(?:qn|quelqu'un|quelqu’un)(?![\p{L}])/giu, '‹qn›'],
  [/(?<![\p{L}])(?:qc|qch|quelque chose)(?![\p{L}])/giu, '‹qc›'],
  [/(?<![\p{L}])(?:algn\.?|alguien)(?![\p{L}])/giu, '‹algn›'],
  [/(?<![\p{L}])(?:algo|a\/c)(?![\p{L}])/giu, '‹algo›']
]
export function platzhalterNormal(s: string): string {
  let t = String(s ?? '')
  if (!/[a-zA-Z]/.test(t)) return t
  for (const [re, ersatz] of PLATZHALTER) t = t.replace(re, ersatz)
  return t
}

/** Vollständiger Eintrag, wie ihn Rückmeldungen und Lösungen zeigen: „YA = young adults" */
export const abkVoll = (e: Abkuerzung): string => `${e.kurz} = ${e.lang}${e.rest ? ` ${e.rest}` : ''}`
/** Einheitliche Anzeige in den Spielen: „YA (young adults)" */
export const abkSpiel = (e: Abkuerzung): string => `${e.kurz} (${e.lang})`

/**
 * Eine Antwort, die Abkürzung UND Langform nennt, in ihre zwei Teile zerlegen – „YA = young adults",
 * „YA (young adults)", „young adults (YA)", „YA – young adults", „YA: young adults". null = nur ein Teil.
 */
export function antwortTeile(antwort: string): [string, string] | null {
  const a = String(antwort ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  const muster = [/^(.+?)\s*\(\s*=?\s*(.+?)\s*\)$/, /^(.+?)\s*=\s*(.+)$/, /^(.+?)\s+[–—-]\s+(.+)$/, /^(.+?)\s*:\s+(.+)$/]
  for (const re of muster) {
    const m = re.exec(a)
    if (m && m[1].trim() && m[2].trim()) return [m[1].trim(), m[2].trim()]
  }
  return null
}

/** Abkürzung vergleichbar: ohne Punkte und Leerzeichen („z. B." = „zB", „U.S." = „US") */
const kurzForm = (s: string): string => String(s ?? '').replace(/[.\s]/g, '')

/**
 * Passt die Antwort zur Abkürzung? 'genau' = so geschrieben, 'schreibweise' = nur Groß-/Kleinschreibung oder Punkte
 * weichen ab („ya", „eg"), null = nein.
 */
export function kurzPasst(antwort: string, kurz: string): 'genau' | 'schreibweise' | null {
  const a = String(antwort ?? '')
    .trim()
    .replace(/[!?;,]+$/, '')
  if (!a) return null
  if (a.replace(/\s+/g, ' ') === kurz.replace(/\s+/g, ' ')) return 'genau'
  const ak = kurzForm(a)
  const kk = kurzForm(kurz)
  if (!ak || !kk) return null
  if (ak === kk) return hatPunkt(kurz) ? 'genau' : 'schreibweise'
  if (ak.toLowerCase() === kk.toLowerCase()) return 'schreibweise'
  return null
}

/**
 * Strenger Vergleich ohne Tippfehler-Toleranz (Onlinetest): Abkürzung allein, Langform allein (ohne Rücksicht auf
 * Groß-/Kleinschreibung) oder beides in einer üblichen Schreibweise. `norm` vereinheitlicht Leerzeichen und Zeichen.
 */
export function abkVergleich(antwort: string, e: Abkuerzung, norm: (s: string) => string = (s) => s): 'genau' | 'schreibweise' | null {
  const lang = (s: string): boolean => norm(s).toLowerCase() === norm(e.lang).toLowerCase()
  const a = norm(antwort)
  if (!a) return null
  const k = kurzPasst(a, e.kurz)
  if (k) return k
  if (lang(a)) return 'genau'
  const teile = antwortTeile(a)
  if (teile)
    for (const [x, y] of [teile, [teile[1], teile[0]]]) {
      const kx = kurzPasst(x, e.kurz)
      if (kx && lang(y)) return kx
    }
  return null
}
