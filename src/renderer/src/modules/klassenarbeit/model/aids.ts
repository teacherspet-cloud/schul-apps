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
  'Operatorenliste'
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
  operatorenliste: 'the list of operators'
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

const WOERTERBUECHER: Record<'en' | 'fr' | 'es', Record<string, string>> = { en: ENGLISH, fr: FRANZOESISCH, es: SPANISCH }

export function translateAids(aids: string, language: 'de' | 'en' | 'fr' | 'es'): string {
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
