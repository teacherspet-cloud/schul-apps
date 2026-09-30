import type { TaskTypeId, VocabEntry } from '../model/types'

/**
 * Sprachbesondere Aufgaben und Schriftregeln der Schulsprachen im Vokabeltest (30.09.2026).
 *
 * Auftrag: „sinnvolle Aufgabentypen je Sprache (z. B. Chinesisch: Zeichen–Pinyin–Bedeutung
 * zuordnen; Russisch: Aspektpaare, Kasus)". Begründung je Aufgabe:
 *
 * - Zeichen – Lesung – Bedeutung (Chinesisch, Japanisch): Die Lehrwerke führen jedes Wort in drei
 *   Spalten (汉字 | Pinyin | Deutsch; Kanji | Hiragana | Deutsch), und die Lehrpläne verlangen
 *   Laut-, Schrift- und Bedeutungsseite getrennt (Kernlehrplan Chinesisch NRW Sek II 2014,
 *   „Schriftzeichen – Aussprache – Bedeutung"; Fachverband Chinesisch e. V., Curriculare
 *   Rahmenrichtlinien 2008). Zwei Formen: Lesung und Bedeutung ergänzen (Tabelle) und zuordnen.
 * - Aspektpaare (Russisch, Polnisch, Tschechisch): Verben werden als Paar gelernt
 *   (делать – сделать, robić – zrobić, dělat – udělat) – so stehen sie in den Wörterverzeichnissen
 *   der Lehrwerke (Konechno!, Klett; Witaj Polsko; Tschechisch: Čeština expres).
 * - Kasus im Satz (Russisch, Polnisch, Tschechisch, Türkisch, Neugriechisch): Das Substantiv in
 *   Klammern in den verlangten Fall setzen – Wortschatz in der Form, in der er im Satz vorkommt.
 *   Im Türkischen mit Vokalharmonie (ev → evde, okul → okula).
 * - Wurzel (Arabisch): Arabische Wörter werden nach der dreiradikaligen Wurzel gelernt und im
 *   Wörterbuch gesucht (كتب → كِتاب، مَكتَب، كاتِب) – Wurzel und Bedeutung angeben.
 *
 * Aufgaben mit einzelnen Buchstaben (Buchstabensalat, Kreuzworträtsel) passen nicht zu
 * Schriftzeichen (Chinesisch, Japanisch) und nicht zur verbundenen arabischen Schrift, deren
 * Buchstaben ihre Gestalt je nach Stellung im Wort ändern.
 */

/** Aufgabe → Sprachen, in denen es sie gibt */
export const SPRACH_AUFGABEN: Partial<Record<TaskTypeId, readonly string[]>> = {
  readingForms: ['zh', 'ja'],
  readingMatch: ['zh', 'ja'],
  aspectPairs: ['ru', 'pl', 'cs'],
  caseForms: ['ru', 'pl', 'cs', 'tr', 'el'],
  arabicRoots: ['ar']
}

/** Aufgaben mit einzelnen Buchstaben – nicht in Schriftzeichen und nicht in arabischer Schrift */
export const NICHT_IN_SCHRIFT: Partial<Record<TaskTypeId, readonly string[]>> = {
  scrambled: ['zh', 'ja', 'ar'],
  crossword: ['zh', 'ja', 'ar']
}

/** Gibt es diese sprachbesondere Aufgabe in der Sprache? undefined = keine sprachbesondere Aufgabe */
export function sprachAufgabePasst(id: TaskTypeId, sprache: string): boolean | undefined {
  const nur = SPRACH_AUFGABEN[id]
  if (nur) return nur.includes(sprache)
  const nicht = NICHT_IN_SCHRIFT[id]
  if (nicht?.includes(sprache)) return false
  return undefined
}

/** Voreingestellte Aufgaben je Sprache (sonst die allgemeinen) */
export const STANDARD_AUFGABEN: Record<string, TaskTypeId[]> = {
  zh: ['readingForms', 'gapSentences', 'readingMatch'],
  ja: ['readingForms', 'gapSentences', 'readingMatch'],
  ar: ['gapSentences', 'arabicRoots', 'multipleChoice']
}

/** Beschriftung der Lesungsspalte */
export const LESUNG_LABEL: Record<string, string> = { zh: 'Pinyin:', ja: 'よみ:' }

/** Beschriftung der Formspalte der übrigen Tabellenaufgaben */
export const ASPEKT_LABEL: Record<string, string> = { ru: 'Видовая пара:', pl: 'Para aspektowa:', cs: 'Vidový protějšek:' }
export const WURZEL_LABEL = 'الجذر:'

/** Pinyin: lateinische Buchstaben mit Tonzeichen oder Tonzahlen, ohne Schriftzeichen */
const PINYIN = /^[a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ1-5' ·-]+$/u
const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー・ ]+$/u

/** Sieht der Text wie eine Lesung aus (Pinyin bzw. Kana)? */
export function istLesung(text: string, sprache: string): boolean {
  const t = text.trim()
  if (!t) return false
  return sprache === 'zh' ? PINYIN.test(t) && /[a-zA-Zü]/.test(t) : sprache === 'ja' ? KANA.test(t) : false
}

/**
 * Lesung an einer eingelesenen Vokabel ergänzen: dritte Spalte (`pos`) oder Klammer hinter dem
 * Wort („你好 (nǐ hǎo)", „学校（がっこう）"). Die Wortart bleibt, wenn `pos` keine Lesung ist.
 */
export function mitLesung(v: VocabEntry, sprache: string): VocabEntry {
  if (v.lesung || (sprache !== 'zh' && sprache !== 'ja')) return v
  if (v.pos && istLesung(v.pos, sprache)) return { ...v, lesung: v.pos.trim(), pos: undefined }
  const m = v.term.match(/^(.*?)\s*[（(]([^)）]+)[)）]\s*$/u)
  if (m && istLesung(m[2], sprache)) return { ...v, term: m[1].trim(), lesung: m[2].trim() }
  return v
}

/**
 * Schriftregeln für die KI je Sprache – stehen im Systemprompt jedes Vokabeltests der Sprache.
 * Englisch formuliert wie die übrigen Regeln des Vokabeltest-Prompts.
 */
export const SCHRIFT_REGELN: Record<string, string> = {
  zh: '- Chinese: use simplified characters (Mainland standard). Where pinyin is shown, write it with tone marks (nǐ hǎo), never with tone numbers; apply the tone sandhi of 一 and 不 as in textbooks. Words in the list are tested in characters.',
  ja: '- Japanese: use the kanji/kana spelling of the word list; kanji that are not in the list get furigana in brackets (学校（がっこう）). Readings are written in hiragana.',
  ar: '- Arabic: Modern Standard Arabic in Arabic script, right to left. Fully vocalise the tested words (harakat) as in the word list; other words only where a beginner needs it. Use Arabic punctuation (، ؟).',
  ru: '- Russian: Cyrillic script; mark stress with an acute accent (´) only where the word list does.',
  pl: '- Polish: always write all diacritics (ą ć ę ł ń ó ś ź ż), also in answers and word boxes.',
  cs: '- Czech: always write all diacritics (á č ď é ě í ň ó ř š ť ú ů ý ž), also in answers and word boxes.',
  tr: '- Turkish: always write the Turkish letters (ç ğ ı İ ö ş ü); dotted i and dotless ı are different letters; respect vowel harmony in all suffixes; the question particle mi is written separately.',
  pt: '- Portuguese: European Portuguese (Acordo Ortográfico 1990) unless the word list is clearly Brazilian.',
  da: '- Danish: write æ ø å; nouns with their article form as in the list (en/et).',
  el: '- Modern Greek: monotonic orthography with tonos and dialytika as in standard Greek; no polytonic accents.',
  nl: '- Dutch: standard Dutch spelling (Groene Boekje); nouns with de/het as in the list.'
}
