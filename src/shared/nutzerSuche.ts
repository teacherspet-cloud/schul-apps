/**
 * Suche in der Nutzerverwaltung (09.10.2026, Wunsch des Admins): statt der langen Liste aller Konten ein Suchfeld.
 * Gefunden wird nach Name, Benutzername, Rolle, Anmeldeart (Quelle) und Klasse; ab 2 Zeichen, höchstens `max` Treffer.
 * Alle Wörter der Suche müssen vorkommen (Groß-/Kleinschreibung und Umlaute egal).
 */

export interface SuchbaresKonto {
  benutzer: string
  name: string
  rolle: string
  quelle: string
  klasse?: string
}

export const ROLLEN_TEXT: Record<string, string> = { admin: 'Admin', lehrkraft: 'Lehrkraft', schueler: 'Schüler/in' }
export const QUELLEN_TEXT: Record<string, string> = { iserv: 'IServ', test: 'Testkonto', lokal: 'Passwort', notzugang: 'Notzugang', gast: 'Gast' }

/** Klein, ohne Akzente, Umlaute ausgeschrieben (ü = ue) */
const falte = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

function suchtext(k: SuchbaresKonto): string {
  const rolle = `${k.rolle} ${ROLLEN_TEXT[k.rolle] ?? ''} ${k.rolle === 'schueler' ? 'schülerin schüler' : ''}`
  const quelle = `${k.quelle} ${QUELLEN_TEXT[k.quelle] ?? ''}`
  return falte(`${k.name} ${k.benutzer} ${rolle} ${quelle} ${k.klasse ?? ''}`)
}

export const SUCHE_MIN = 2
export const SUCHE_MAX = 50

export function nutzerSuchen<T extends SuchbaresKonto>(konten: T[], frage: string, max = SUCHE_MAX): { treffer: T[]; gesamt: number } {
  const woerter = falte(frage).split(/\s+/).filter(Boolean)
  if (falte(frage).trim().length < SUCHE_MIN || !woerter.length) return { treffer: [], gesamt: 0 }
  const alle = konten.filter((k) => {
    const t = suchtext(k)
    return woerter.every((w) => t.includes(w))
  })
  return { treffer: alle.slice(0, max), gesamt: alle.length }
}
