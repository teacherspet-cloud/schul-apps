/**
 * Erlaubte Hilfsmittel: Vorschläge für die Lehrkraft und ihre Entsprechung in der
 * Sprache des Faches. Der Kopf einer Englischarbeit ist englisch – dort darf auch
 * „einsprachiges Wörterbuch" nicht auf Deutsch stehen.
 */

/** Übliche Hilfsmittel; die Liste ist ein Vorschlag, eigener Text ist möglich. */
export const AIDS_SUGGESTIONS = [
  'keine Hilfsmittel',
  'einsprachiges Wörterbuch',
  'zweisprachiges Wörterbuch',
  'ein- und zweisprachiges Wörterbuch',
  'Wörterbuch nur für den Schreibteil',
  'Duden / Rechtschreibwörterbuch',
  'Vokabelheft',
  'eigene Notizen (eine Seite)',
  'Taschenrechner',
  'Atlas',
  'Formelsammlung',
  'Operatorenliste',
  // 29.09.2026 für die neuen Fächer (recherche/klassenarbeiten-faecher-neu-2026-09-29.md)
  'ohne Hilfsmittel (Teil A)',
  'Taschenrechner (nicht grafikfähig)',
  'grafikfähiger Taschenrechner / CAS',
  'Zirkel und Geodreieck',
  'Periodensystem',
  'Tafelwerk',
  'Wortangaben',
  'Sprachreferenz (Informatik)'
]

const ENGLISH: Record<string, string> = {
  'keine hilfsmittel': 'no dictionaries or other aids',
  keine: 'none',
  'einsprachiges wörterbuch': 'a monolingual dictionary',
  'zweisprachiges wörterbuch': 'a bilingual dictionary',
  'ein- und zweisprachiges wörterbuch': 'a monolingual and a bilingual dictionary',
  wörterbuch: 'a dictionary',
  'wörterbuch nur für den schreibteil': 'a dictionary for the writing part only',
  'duden / rechtschreibwörterbuch': 'a spelling dictionary',
  rechtschreibwörterbuch: 'a spelling dictionary',
  vokabelheft: 'your vocabulary notebook',
  'eigene notizen (eine seite)': 'your own notes (one page)',
  'eigene notizen': 'your own notes',
  taschenrechner: 'a calculator',
  atlas: 'an atlas',
  formelsammlung: 'a formula sheet',
  operatorenliste: 'the list of operators',
  'ohne hilfsmittel (teil a)': 'no aids (part A)',
  'taschenrechner (nicht grafikfähig)': 'a (non-graphing) calculator',
  'grafikfähiger taschenrechner / cas': 'a graphing calculator / CAS',
  'zirkel und geodreieck': 'compasses and a set square',
  periodensystem: 'the periodic table',
  tafelwerk: 'a data book',
  wortangaben: 'the vocabulary notes',
  'sprachreferenz (informatik)': 'the language reference'
}

/**
 * Übersetzt die Angabe der Hilfsmittel in die Sprache des Faches.
 * Mehrere Angaben dürfen durch Komma getrennt sein; Unbekanntes bleibt unverändert
 * stehen, damit frei eingetippter Text nicht verloren geht.
 */
const FRANZOESISCH: Record<string, string> = {
  'keine hilfsmittel': 'aucun document ni dictionnaire',
  keine: 'aucun',
  'einsprachiges wörterbuch': 'un dictionnaire unilingue',
  'zweisprachiges wörterbuch': 'un dictionnaire bilingue',
  'ein- und zweisprachiges wörterbuch': 'un dictionnaire unilingue et un dictionnaire bilingue',
  wörterbuch: 'un dictionnaire',
  'wörterbuch nur für den schreibteil': 'un dictionnaire pour la production écrite seulement',
  'duden / rechtschreibwörterbuch': 'un dictionnaire orthographique',
  rechtschreibwörterbuch: 'un dictionnaire orthographique',
  vokabelheft: 'ton cahier de vocabulaire',
  'eigene notizen (eine seite)': 'tes notes personnelles (une page)',
  'eigene notizen': 'tes notes personnelles',
  taschenrechner: 'une calculatrice',
  atlas: 'un atlas',
  formelsammlung: 'un formulaire',
  operatorenliste: 'la liste des consignes'
}

const SPANISCH: Record<string, string> = {
  'keine hilfsmittel': 'ningún diccionario ni otro material',
  keine: 'ninguno',
  'einsprachiges wörterbuch': 'un diccionario monolingüe',
  'zweisprachiges wörterbuch': 'un diccionario bilingüe',
  'ein- und zweisprachiges wörterbuch': 'un diccionario monolingüe y uno bilingüe',
  wörterbuch: 'un diccionario',
  'wörterbuch nur für den schreibteil': 'un diccionario solo para la expresión escrita',
  'duden / rechtschreibwörterbuch': 'un diccionario ortográfico',
  rechtschreibwörterbuch: 'un diccionario ortográfico',
  vokabelheft: 'tu cuaderno de vocabulario',
  'eigene notizen (eine seite)': 'tus propios apuntes (una página)',
  'eigene notizen': 'tus propios apuntes',
  taschenrechner: 'una calculadora',
  atlas: 'un atlas',
  formelsammlung: 'un formulario',
  operatorenliste: 'la lista de operadores'
}

// Aufzählung ohne Artikel wie im Kopf der slowenischen Maturità (RIC 2015): „Materiali e sussidi consentiti: …
// dizionario monolingue e dizionario bilingue"
const ITALIENISCH: Record<string, string> = {
  'keine hilfsmittel': 'nessuno (né dizionario né altro materiale)',
  keine: 'nessuno',
  'einsprachiges wörterbuch': 'dizionario monolingue',
  'zweisprachiges wörterbuch': 'dizionario bilingue',
  'ein- und zweisprachiges wörterbuch': 'dizionario monolingue e dizionario bilingue',
  wörterbuch: 'dizionario',
  'wörterbuch nur für den schreibteil': 'dizionario (solo per la produzione scritta)',
  vokabelheft: 'quaderno dei vocaboli',
  'eigene notizen (eine seite)': 'appunti personali (una pagina)',
  'eigene notizen': 'appunti personali'
}

const RUSSISCH: Record<string, string> = {
  'keine hilfsmittel': 'не разрешены',
  keine: 'нет',
  'einsprachiges wörterbuch': 'толковый словарь',
  'zweisprachiges wörterbuch': 'двуязычный словарь',
  'ein- und zweisprachiges wörterbuch': 'толковый и двуязычный словари',
  wörterbuch: 'словарь',
  'wörterbuch nur für den schreibteil': 'словарь (только для раздела «Письменная речь»)',
  vokabelheft: 'личный словарик',
  'eigene notizen (eine seite)': 'собственные записи (одна страница)',
  'eigene notizen': 'собственные записи'
}

/*
 * Neue Schulfremdsprachen (30.09.2026). Fachbegriffe für Wörterbücher: nl „eentalig/tweetalig
 * woordenboek", pl „słownik jednojęzyczny/dwujęzyczny", cs „výkladový/překladový slovník",
 * pt „dicionário monolingue/bilingue", tr „tek dilli/iki dilli sözlük", zh „单语/双语词典".
 * Aufzählung ohne Artikel wie in den Kopfzeilen der Herkunftsländer; nicht muttersprachlich
 * geprüft (recherche/sprachtexte-2026-09-30.md).
 */
const NIEDERLAENDISCH: Record<string, string> = {
  'keine hilfsmittel': 'geen (geen woordenboek of andere hulpmiddelen)',
  keine: 'geen',
  'einsprachiges wörterbuch': 'eentalig woordenboek',
  'zweisprachiges wörterbuch': 'tweetalig woordenboek',
  'ein- und zweisprachiges wörterbuch': 'eentalig en tweetalig woordenboek',
  wörterbuch: 'woordenboek',
  'wörterbuch nur für den schreibteil': 'woordenboek (alleen bij schrijfvaardigheid)',
  vokabelheft: 'eigen woordenlijst',
  'eigene notizen (eine seite)': 'eigen aantekeningen (één pagina)',
  'eigene notizen': 'eigen aantekeningen'
}

const POLNISCH: Record<string, string> = {
  'keine hilfsmittel': 'brak (bez słownika i innych pomocy)',
  keine: 'brak',
  'einsprachiges wörterbuch': 'słownik jednojęzyczny',
  'zweisprachiges wörterbuch': 'słownik dwujęzyczny',
  'ein- und zweisprachiges wörterbuch': 'słownik jednojęzyczny i dwujęzyczny',
  wörterbuch: 'słownik',
  'wörterbuch nur für den schreibteil': 'słownik (tylko do wypowiedzi pisemnej)',
  vokabelheft: 'własny zeszyt ze słówkami',
  'eigene notizen (eine seite)': 'własne notatki (jedna strona)',
  'eigene notizen': 'własne notatki'
}

const TSCHECHISCH: Record<string, string> = {
  'keine hilfsmittel': 'žádné (bez slovníku a jiných pomůcek)',
  keine: 'žádné',
  'einsprachiges wörterbuch': 'výkladový slovník',
  'zweisprachiges wörterbuch': 'překladový slovník',
  'ein- und zweisprachiges wörterbuch': 'výkladový a překladový slovník',
  wörterbuch: 'slovník',
  'wörterbuch nur für den schreibteil': 'slovník (jen pro písemný projev)',
  vokabelheft: 'vlastní slovníček',
  'eigene notizen (eine seite)': 'vlastní poznámky (jedna strana)',
  'eigene notizen': 'vlastní poznámky'
}

const PORTUGIESISCH: Record<string, string> = {
  'keine hilfsmittel': 'nenhum (nem dicionário nem outro material)',
  keine: 'nenhum',
  'einsprachiges wörterbuch': 'dicionário monolingue',
  'zweisprachiges wörterbuch': 'dicionário bilingue',
  'ein- und zweisprachiges wörterbuch': 'dicionário monolingue e dicionário bilingue',
  wörterbuch: 'dicionário',
  'wörterbuch nur für den schreibteil': 'dicionário (só na produção escrita)',
  vokabelheft: 'caderno de vocabulário',
  'eigene notizen (eine seite)': 'apontamentos pessoais (uma página)',
  'eigene notizen': 'apontamentos pessoais'
}

const TUERKISCH: Record<string, string> = {
  'keine hilfsmittel': 'yok (sözlük ve başka araç gereç kullanılamaz)',
  keine: 'yok',
  'einsprachiges wörterbuch': 'tek dilli sözlük',
  'zweisprachiges wörterbuch': 'iki dilli sözlük',
  'ein- und zweisprachiges wörterbuch': 'tek dilli ve iki dilli sözlük',
  wörterbuch: 'sözlük',
  'wörterbuch nur für den schreibteil': 'sözlük (yalnızca yazma bölümünde)',
  vokabelheft: 'kelime defteri',
  'eigene notizen (eine seite)': 'kendi notların (bir sayfa)',
  'eigene notizen': 'kendi notların'
}

const CHINESISCH: Record<string, string> = {
  'keine hilfsmittel': '无（不得使用词典或其他工具）',
  keine: '无',
  'einsprachiges wörterbuch': '单语词典',
  'zweisprachiges wörterbuch': '双语词典',
  'ein- und zweisprachiges wörterbuch': '单语词典和双语词典',
  wörterbuch: '词典',
  'wörterbuch nur für den schreibteil': '词典（仅限写作部分）',
  vokabelheft: '生词本',
  'eigene notizen (eine seite)': '个人笔记（一页）',
  'eigene notizen': '个人笔记'
}

type AidsSprache = 'en' | 'fr' | 'es' | 'it' | 'ru' | 'nl' | 'pl' | 'cs' | 'pt' | 'tr' | 'zh'

const WOERTERBUECHER: Record<AidsSprache, Record<string, string>> = {
  en: ENGLISH,
  fr: FRANZOESISCH,
  es: SPANISCH,
  it: ITALIENISCH,
  ru: RUSSISCH,
  nl: NIEDERLAENDISCH,
  pl: POLNISCH,
  cs: TSCHECHISCH,
  pt: PORTUGIESISCH,
  tr: TUERKISCH,
  zh: CHINESISCH
}

export function translateAids(aids: string, language: 'de' | AidsSprache): string {
  const text = (aids ?? '').trim()
  if (language === 'de' || !text) return text
  const woerter = WOERTERBUECHER[language]
  return text
    .split(',')
    .map((part) => {
      const item = part.trim()
      return woerter[item.toLowerCase()] ?? item
    })
    .filter(Boolean)
    // Chinesisch: Aufzählungskomma „、"
    .join(language === 'zh' ? '、' : ', ')
}
