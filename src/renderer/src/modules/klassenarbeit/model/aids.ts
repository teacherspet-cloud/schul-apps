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

const ITALIENISCH: Record<string, string> = {
  'keine hilfsmittel': 'nessuno (né dizionario né altro materiale)',
  keine: 'nessuno',
  'einsprachiges wörterbuch': 'il dizionario monolingue',
  'zweisprachiges wörterbuch': 'il dizionario bilingue',
  'ein- und zweisprachiges wörterbuch': 'il dizionario monolingue e il dizionario bilingue',
  wörterbuch: 'il dizionario',
  'wörterbuch nur für den schreibteil': 'il dizionario (solo per la produzione scritta)',
  vokabelheft: 'il quaderno dei vocaboli',
  'eigene notizen (eine seite)': 'i propri appunti (una pagina)',
  'eigene notizen': 'i propri appunti'
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

const WOERTERBUECHER: Record<'en' | 'fr' | 'es' | 'it' | 'ru', Record<string, string>> = { en: ENGLISH, fr: FRANZOESISCH, es: SPANISCH, it: ITALIENISCH, ru: RUSSISCH }

export function translateAids(aids: string, language: 'de' | 'en' | 'fr' | 'es' | 'it' | 'ru'): string {
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
    .join(', ')
}
