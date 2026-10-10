/**
 * Suche in „Meine Klassen" (10.10.2026, Entscheidung der Lehrkraft): findet Klassen/Kurse UND Lernende – überall.
 *  - Lernende über Vor- und Nachnamen (Teilstück, ohne Rücksicht auf Groß-/Kleinschreibung und Akzente: „jil" findet
 *    „Jil v.", „zoe" findet „Zoë") – NICHT über Benutzernamen oder Codes.
 *  - Stichwörter zum Handlungsbedarf („nicht geübt", „wackelig", „Problemwörter", „Handlungsbedarf", „inaktiv", „fördern" …)
 *    finden Lernende mit passendem Eintrag (shared/kursHinweise.ts: inaktiv, schwach, foerdern – über die Kennungen `ids`).
 *  - In einer Klasse stehen zuerst ihre Lernenden („In dieser Klasse"), dann die anderer Klassen, dann Klassen.
 * Rein rechnend – der Server (server/klassen.ts, GET /server/klassen/suche) und die Oberfläche nutzen es gemeinsam.
 */

/** Vergleichsform: ohne Akzente, klein, einfache Leerzeichen */
export const suchForm = (s: string): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** Mindestlänge einer Suche */
export const SUCHE_MIN = 2
/** Höchstzahl der Lernenden-Treffer */
export const SUCHE_MAX = 30

/** Art eines Handlungsbedarfs je Person (Hinweis-Arten der Kursseite) */
export type ProblemArt = 'inaktiv' | 'schwach' | 'foerdern'

export const PROBLEM_TEXT: Record<ProblemArt, string> = {
  inaktiv: 'nicht geübt (7 Tage)',
  schwach: 'Vokabeln unter 30 % sicher',
  foerdern: 'Grammatik-Schwäche'
}

/** Stichwörter je Art (in Vergleichsform); „handlungsbedarf" u. ä. passt zu allen */
const STICHWORTE: Record<ProblemArt, string[]> = {
  inaktiv: ['nicht geubt', 'nicht geuebt', 'nicht geubt 7 tage', 'ubt nicht', 'inaktiv', 'nicht aktiv', 'kein uben'],
  schwach: ['wackelig', 'wackelige worter', 'problemworter', 'problemwort', 'probleme', 'schwach', 'schwache vokabeln', 'unter 30', 'vokabeln schwach', 'schwierigkeiten'],
  foerdern: ['fordern', 'foerdern', 'forderbedarf', 'grammatik schwach', 'grammatikschwache', 'grammatik-schwache', 'grammatik']
}
const ALLE = ['handlungsbedarf', 'bedarf', 'auffallig', 'probleme', 'sorgen']

/**
 * Welche Problem-Arten meint die Suche? null = kein Stichwort. Ein Stichwort passt, wenn die Suche mit ihm beginnt bzw.
 * es enthält oder (ab 4 Zeichen) der Anfang eines Stichworts ist („wack", „nicht ge").
 */
export function stichwortArten(q: string): Set<ProblemArt> | null {
  const s = suchForm(q)
  if (s.length < 3) return null
  const passt = (w: string): boolean => s === w || s.includes(w) || (s.length >= 4 && w.startsWith(s))
  const arten = new Set<ProblemArt>()
  if (ALLE.some(passt)) for (const a of Object.keys(STICHWORTE) as ProblemArt[]) arten.add(a)
  for (const [a, worte] of Object.entries(STICHWORTE) as [ProblemArt, string[]][]) if (worte.some(passt)) arten.add(a)
  return arten.size ? arten : null
}

/** Trifft die Suche den Namen? Jedes Wort der Suche als Teilstück des Namens („mia k" → „Mia K.") */
export function nameTrifft(name: string, q: string): boolean {
  const n = suchForm(name).replace(/[.,]/g, ' ')
  const woerter = suchForm(q).replace(/[.,]/g, ' ').split(' ').filter(Boolean)
  return woerter.length > 0 && woerter.every((w) => n.includes(w))
}

export interface SuchPerson {
  id: string
  /** Anzeigename, wie „Meine Klassen" ihn zeigt („Mia K.") */
  name: string
  /** Durchsuchter Name, falls anders als `name` (ohne Anzeigenamen: '' – der Benutzername wird nie durchsucht) */
  suchName?: string
  /** Klasse der Person (die Lerngruppe mit Klassennamen, sonst die erste) */
  klasse: string
  /** Fächer bei dieser Lehrkraft */
  faecher: string[]
  /** Lerngruppen der Lehrkraft, in denen die Person ist – Ziel der Details (mehrere: erst Kurswahl) */
  gruppen: { id: string; name: string; fach: string }[]
  /** Handlungsbedarf der Person */
  probleme: ProblemArt[]
}

/**
 * Lernende zur Suche: Name oder Stichwort; in einer Klasse (`klasse`) ihre Lernenden zuerst, sonst nach Namen.
 * Höchstens `max` Treffer.
 */
export function lernendeSuchen(personen: SuchPerson[], q: string, klasse = '', max = SUCHE_MAX): (Omit<SuchPerson, 'suchName'> & { grund: 'name' | 'stichwort' })[] {
  if (suchForm(q).length < SUCHE_MIN) return []
  const arten = stichwortArten(q)
  const k = suchForm(klasse)
  const hier = (p: Pick<SuchPerson, 'gruppen'>): boolean => Boolean(k) && p.gruppen.some((g) => suchForm(g.name) === k)
  return personen
    .flatMap(({ suchName, ...p }): (Omit<SuchPerson, 'suchName'> & { grund: 'name' | 'stichwort' })[] => {
      if (nameTrifft(suchName ?? p.name, q)) return [{ ...p, grund: 'name' }]
      if (arten && p.probleme.some((a) => arten.has(a))) return [{ ...p, grund: 'stichwort' }]
      return []
    })
    .sort((a, b) => Number(hier(b)) - Number(hier(a)) || a.name.localeCompare(b.name, 'de'))
    .slice(0, max)
}

/** Klasse bzw. Kurs zur Suche: Name oder Fach („7b", „englisch", „7b eng") */
export function klasseTrifft(k: { name: string; faecher: string[] }, q: string): boolean {
  const n = suchForm(`${k.name} ${k.faecher.join(' ')}`)
  const woerter = suchForm(q).split(' ').filter(Boolean)
  return woerter.length > 0 && woerter.every((w) => n.includes(w))
}

/** Klasse einer Person aus ihren Lerngruppen: die mit Klassennamen („7b"), sonst die erste */
export const klasseAusGruppen = (gruppen: { name: string }[]): string =>
  (gruppen.find((g) => /^\d{1,2}\s*[a-z]?$/i.test(g.name.trim())) ?? gruppen[0])?.name.trim() ?? ''
