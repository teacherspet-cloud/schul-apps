/**
 * Die Liste der Rückmeldungen im Schritt „Bögen & Export" (29.09.2026, Wunsch der Lehrkraft: „jede
 * Rückmeldung auf- und zuklappbar, standardmäßig zu – dazu ein Suchfeld für die Schülernamen").
 * Hier nur, was ohne Oberfläche prüfbar ist: Suche, Status einer Abgabe und der gemerkte
 * Aufklappzustand (sitzungsweise).
 */
import { offeneBestaetigungen } from '../art'
import type { Abgabe, RueckmeldungMeta } from '../model/types'

/** Schreibweise für die Suche: klein, ohne Akzente, ß → ss */
const flach = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Umschriebene Umlaute zusammenfalten („oe" = „ö" = „o") */
const gefaltet = (s: string): string => flach(s).replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')

/**
 * Passt eine Abgabe zur Suche? Gesucht wird in Name und Kürzel – groß/klein egal, Umlaute
 * tolerant: „ozturk", „oeztuerk" und „Öztürk" finden dasselbe.
 */
export function passtZurSuche(a: Pick<Abgabe, 'name' | 'kuerzel'>, suche: string): boolean {
  const q = flach(suche)
  if (!q) return true
  const heu = `${a.name} ${a.kuerzel}`
  return flach(heu).includes(q) || gefaltet(heu).includes(gefaltet(suche))
}

export type BogenStatus = 'ohne' | 'offen' | 'fertig'

/** Status einer Abgabe: noch ohne Bogen, Einstufung offen, fertig */
export function bogenStatus(m: Pick<RueckmeldungMeta, 'einstufung' | 'ebene'>, a: Abgabe): BogenStatus {
  if (!a.bogen) return 'ohne'
  return offeneBestaetigungen(m, a.bogen).length ? 'offen' : 'fertig'
}

export const STATUS_TEXT: Record<BogenStatus, string> = { ohne: 'noch ohne Bogen', offen: 'Einstufung offen', fertig: 'fertig' }
export const STATUS_FARBE: Record<BogenStatus, string> = { ohne: 'gray', offen: 'orange', fertig: 'teal' }

// ---------- Aufklappzustand (nur für diese Sitzung) ----------

const schluessel = (docId: string): string => `rm-boegen-offen:${docId}`

export function ladeOffen(docId: string): string[] {
  try {
    const roh = sessionStorage.getItem(schluessel(docId))
    const x: unknown = roh ? JSON.parse(roh) : []
    return Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function merkeOffen(docId: string, ids: string[]): void {
  try {
    sessionStorage.setItem(schluessel(docId), JSON.stringify(ids))
  } catch {
    // Kein Speicher (privates Fenster o. ä.): dann eben ohne Gedächtnis
  }
}
