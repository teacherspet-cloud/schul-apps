/**
 * Wann Lernende unregelmäßige Verben üben (08.10.2026, Befund der Lehrkraft: Eine 5. Klasse sah die Verbspiele, weil
 * „go" schon in Unit 1 steht). Abgestimmt: erst, wenn die Vergangenheit eingeführt ist – erkannt am Lehrwerk-Stand bzw.
 * an freigegebener Grammatik. Ohne erfasstes Lehrwerk (Latein, andere Bücher) nur nach Freigabe oder Schalter im Kurs.
 */

/** Katalogthemen, ab denen die Stammformen gebraucht werden (je Sprache; Latein und Russisch: keine – nur Schalter) */
export const VERGANGENHEIT: Record<string, string[]> = {
  en: ['en.verb.past_simple'],
  fr: ['fr.verb.passe_compose'],
  es: ['es.verb.indefinido_reg', 'es.verb.indefinido_irr', 'es.verb.perfecto'],
  it: ['it.verb.passato_prossimo']
}

/** Schalter der Lehrkraft im Kurs: '' = automatisch, 'an' = immer, 'aus' = nie */
export type VerbspielSchalter = '' | 'an' | 'aus'

export function verbenFrei(sprache: string, bekannt: readonly string[], schalter: VerbspielSchalter | string = ''): boolean {
  if (schalter === 'an') return true
  if (schalter === 'aus') return false
  const themen = VERGANGENHEIT[sprache] ?? []
  return themen.some((t) => bekannt.some((b) => b === t || b.startsWith(t + '/')))
}
