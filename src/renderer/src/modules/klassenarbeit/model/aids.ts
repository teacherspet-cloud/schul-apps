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
export function translateAids(aids: string, language: 'de' | 'en'): string {
  const text = (aids ?? '').trim()
  if (language === 'de' || !text) return text
  return text
    .split(',')
    .map((part) => {
      const item = part.trim()
      return ENGLISH[item.toLowerCase()] ?? item
    })
    .filter(Boolean)
    .join(', ')
}
