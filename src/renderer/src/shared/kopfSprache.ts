/**
 * Feste Beschriftungen im Kopf und am Material in der Sprache des Faches (30.09.2026):
 * „Name/Klasse/Datum", „Seite" und die Wortzahl unter einem Text.
 *
 * Bis dahin kannten PageFrame und blockview nur de/en/fr/es/it/ru. Mit den neuen
 * Schulfremdsprachen (@shared/faecher: Niederländisch, Polnisch, Tschechisch, Portugiesisch,
 * Türkisch, Chinesisch; Japanisch, Arabisch, Dänisch, Neugriechisch) stehen die Tabellen hier
 * an EINER Stelle – Arbeitsblatt, Klassenarbeit und Grammatiktest lesen sie.
 *
 * Wortlaute: Kopfzeilen nach üblichen Schulvorlagen des jeweiligen Landes (pl „Imię i nazwisko",
 * cs „Jméno a příjmení", tr „Adı Soyadı / Sınıfı", el „Ονοματεπώνυμο", zh „姓名/班级/日期").
 * Nicht muttersprachlich geprüft – siehe recherche/sprachtexte-2026-09-30.md.
 *
 * Numerus nach Zahlen: Russisch, Polnisch und Tschechisch beugen das Substantiv nach der Zahl
 * (russischPlural als Vorbild), Arabisch hat Dual und Zählregeln bis 10 bzw. ab 11 – dort steht
 * die Wortzahl deshalb als „عدد الكلمات: 341" (Anzahl der Wörter: …) und braucht keine Beugung.
 * Chinesisch und Japanisch zählen Schriftzeichen (字), nicht Wörter.
 */
import { RU_SLOVO, russischPlural } from './russischPlural'

export type KopfSprache = 'de' | 'en' | 'fr' | 'es' | 'it' | 'ru' | 'nl' | 'pl' | 'cs' | 'pt' | 'tr' | 'zh' | 'ja' | 'ar' | 'da' | 'el'

export const KOPF_SPRACHEN: readonly KopfSprache[] = ['de', 'en', 'fr', 'es', 'it', 'ru', 'nl', 'pl', 'cs', 'pt', 'tr', 'zh', 'ja', 'ar', 'da', 'el']

/** Sprachcode (auch „grc", „la" …) → Kopfsprache; unbekannt → Deutsch */
export const kopfSpracheVon = (code: string | undefined): KopfSprache =>
  (KOPF_SPRACHEN as readonly string[]).includes(code ?? '') ? (code as KopfSprache) : 'de'

export interface KopfLabels {
  name: string
  class: string
  date: string
  grade: (g: number) => string
}

export const KOPF_LABELS: Record<KopfSprache, KopfLabels> = {
  de: { name: 'Name:', class: 'Klasse:', date: 'Datum:', grade: (g) => `Klasse ${g}` },
  en: { name: 'Name:', class: 'Class:', date: 'Date:', grade: (g) => `Class ${g}` },
  // Französisch- und Spanischarbeiten (Großprogramm 0.4, Phase G): Kopf einsprachig in der Zielsprache
  fr: { name: 'Nom :', class: 'Classe :', date: 'Date :', grade: (g) => `Classe ${g}` },
  es: { name: 'Nombre:', class: 'Clase:', date: 'Fecha:', grade: (g) => `Clase ${g}` },
  // Italienisch- und Russischarbeiten (29.09.2026)
  it: { name: 'Nome:', class: 'Classe:', date: 'Data:', grade: (g) => `Classe ${g}` },
  ru: { name: 'Фамилия, имя:', class: 'Класс:', date: 'Дата:', grade: (g) => `${g} класс` },
  // Neue Schulfremdsprachen (30.09.2026)
  nl: { name: 'Naam:', class: 'Klas:', date: 'Datum:', grade: (g) => `Klas ${g}` },
  pl: { name: 'Imię i nazwisko:', class: 'Klasa:', date: 'Data:', grade: (g) => `Klasa ${g}` },
  cs: { name: 'Jméno a příjmení:', class: 'Třída:', date: 'Datum:', grade: (g) => `${g}. třída` },
  pt: { name: 'Nome:', class: 'Turma:', date: 'Data:', grade: (g) => `${g}.º ano` },
  tr: { name: 'Adı Soyadı:', class: 'Sınıfı:', date: 'Tarih:', grade: (g) => `${g}. sınıf` },
  zh: { name: '姓名：', class: '班级：', date: '日期：', grade: (g) => `${g}年级` },
  ja: { name: '氏名：', class: 'クラス：', date: '日付：', grade: (g) => `${g}年生` },
  ar: { name: 'الاسم:', class: 'الصف:', date: 'التاريخ:', grade: (g) => `الصف ${g}` },
  da: { name: 'Navn:', class: 'Klasse:', date: 'Dato:', grade: (g) => `${g}. klasse` },
  el: { name: 'Ονοματεπώνυμο:', class: 'Τάξη:', date: 'Ημερομηνία:', grade: (g) => `Τάξη ${g}` }
}

/** „Seite" vor „1 / 2" */
export const SEITE: Record<KopfSprache, string> = {
  de: 'Seite',
  en: 'Page',
  fr: 'Page',
  es: 'Página',
  it: 'Pagina',
  ru: 'Страница',
  nl: 'Pagina',
  pl: 'Strona',
  cs: 'Strana',
  pt: 'Página',
  tr: 'Sayfa',
  zh: '页码',
  ja: 'ページ',
  ar: 'صفحة',
  da: 'Side',
  el: 'Σελίδα'
}

/** Rechtsläufige Schrift (Arabisch) – Felder und Texte brauchen dir="rtl" */
export const istRtl = (code: string | undefined): boolean => code === 'ar'

/** Polnisch: 1 słowo, 2–4 słowa (außer 12–14), sonst słów – auch 22 słowa, 25 słów */
export function polnischPlural(n: number, formen: [eins: string, wenige: string, viele: string]): string {
  const ganz = Math.abs(Math.trunc(n))
  if (ganz !== Math.abs(n)) return formen[1]
  if (ganz === 1) return formen[0]
  const mod10 = ganz % 10
  const mod100 = ganz % 100
  return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? formen[1] : formen[2]
}

/**
 * Tschechisch: 1 slovo, 2–4 slova, sonst (0, 5 …, auch 21, 22 als „dvaadvacet") slov.
 * Bei 21–24 sind beide Muster üblich (dvacet dva slova / dvaadvacet slov); der Genitiv Plural ist
 * nach Ziffern die sichere Wahl (Internetová jazyková příručka, Ústav pro jazyk český: „Číslovky").
 */
export function tschechischPlural(n: number, formen: [eins: string, wenige: string, viele: string]): string {
  const ganz = Math.abs(n)
  if (ganz !== Math.trunc(ganz)) return formen[1]
  if (ganz === 1) return formen[0]
  if (ganz >= 2 && ganz <= 4) return formen[1]
  return formen[2]
}

/** „(341 Wörter)" – ohne Klammern; Numerus je Sprache */
export function wortzahlText(n: number, code: string | undefined): string {
  const s = kopfSpracheVon(code)
  switch (s) {
    case 'ru':
      return `${n} ${russischPlural(n, RU_SLOVO)}`
    case 'pl':
      return `${n} ${polnischPlural(n, ['słowo', 'słowa', 'słów'])}`
    case 'cs':
      return `${n} ${tschechischPlural(n, ['slovo', 'slova', 'slov'])}`
    case 'ar':
      return `عدد الكلمات: ${n}`
    case 'zh':
    case 'ja':
      return `${n}字`
    case 'el':
      return `${n} ${n === 1 ? 'λέξη' : 'λέξεις'}`
    case 'de':
      return `${n} ${n === 1 ? 'Wort' : 'Wörter'}`
    default: {
      const [eins, viele] = WORT_EN_US[s]
      return `${n} ${n === 1 ? eins : viele}`
    }
  }
}

const WORT_EN_US: Record<Exclude<KopfSprache, 'de' | 'ru' | 'pl' | 'cs' | 'ar' | 'zh' | 'ja' | 'el'>, [string, string]> = {
  en: ['word', 'words'],
  fr: ['mot', 'mots'],
  es: ['palabra', 'palabras'],
  it: ['parola', 'parole'],
  nl: ['woord', 'woorden'],
  pt: ['palavra', 'palavras'],
  // Türkisch: nach Zahlen steht der Singular (341 kelime)
  tr: ['kelime', 'kelime'],
  // Dänisch: ord ist im Plural unverändert
  da: ['ord', 'ord']
}

/**
 * Wortzahl zählen – in Chinesisch und Japanisch die Schriftzeichen (ohne Satzzeichen und
 * Leerraum), sonst die Buchstaben-/Ziffernfolgen (wie bisher in blockview).
 */
export function zaehleWoerter(text: string, code: string | undefined): number {
  if (code === 'zh' || code === 'ja') return (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length
}
