/**
 * Bausteine, die nur in den Lösungsteil gehören (27.09.2026).
 *
 * Gemeldet von der Lehrkraft: Ein Arbeitsblatt trug einen „Erwartungshorizont für die
 * Lehrkraft" als eigenen Baustein – auf dem SCHÜLERBLATT. Die KI hatte ihn trotz der
 * Trennung von Lösung (solution, brief.expected) und Blatt als Kasten angelegt. Solche
 * Bausteine sollen nur auf den Lösungen erscheinen.
 *
 * Zwei Wege: `nurLoesung` am Baustein (model/types.ts) – gesetzt von der KI-Umwandlung und
 * beim Öffnen älterer Blätter, wenn der Titel eindeutig an die Lehrkraft gerichtet ist, und
 * von Hand in den Bausteineinstellungen. Ein so gekennzeichneter Baustein fehlt auf dem
 * Schülerblatt (Anzeige, Druck, Word) und zählt nicht als Material; im Editor steht er mit
 * dem Vermerk „nur im Lösungsteil".
 */
import type { WsBlock } from '../model/types'

/** Titel, die eindeutig der Lehrkraft gelten – dann ist der Baustein kein Schülermaterial */
export const LEHRER_TITEL =
  /erwartungshorizont|musterl[öo]sung|beispiell[öo]sung|l[öo]sungs?(hinweis|vorschlag|skizze|erwartung|blatt)|bewertungs(raster|hinweis|kriterien|bogen)|punkteverteilung|f[üu]r (die )?lehrkr[äa]fte?|f[üu]r (den |die )?lehrer(in)?\b|lehrer(hinweis|info|kommentar)|hinweise? f[üu]r (die )?lehr/i

const KANDIDATEN: WsBlock['type'][] = ['infoBox', 'text', 'table', 'scaffold', 'phrases', 'workspace']

/** Gehört dieser Baustein nach seinem Titel zur Lehrkraft? */
export function istLehrerbaustein(b: WsBlock): boolean {
  if (!KANDIDATEN.includes(b.type)) return false
  const titel = 'title' in b ? String(b.title ?? '') : 'label' in b ? String((b as { label?: string }).label ?? '') : ''
  if (LEHRER_TITEL.test(titel)) return true
  // Ein Kasten, dessen Text so beginnt, ist ebenso gemeint
  const anfang = b.type === 'infoBox' || b.type === 'text' ? String(b.body ?? '').slice(0, 60) : ''
  return /^\s*\**\s*(erwartungshorizont|l[öo]sungshinweis|f[üu]r die lehrkraft)/i.test(anfang)
}

/**
 * Kennzeichnet Lehrerbausteine als „nur im Lösungsteil" – nur, wo die Lehrkraft noch nichts
 * entschieden hat (`nurLoesung` undefined). Unveränderte Bausteine bleiben dasselbe Objekt.
 */
export function markiereLoesungsbausteine<T extends WsBlock>(blocks: T[]): T[] {
  let geaendert = false
  const neu = blocks.map((b) => {
    if (b.nurLoesung !== undefined || !istLehrerbaustein(b)) return b
    geaendert = true
    const hinweis =
      'Nur im Lösungsteil: Dieser Baustein richtet sich an die Lehrkraft und steht nicht auf dem Schülerblatt (in den Bausteineinstellungen umschaltbar).'
    return { ...b, nurLoesung: true, warnings: [...(b.warnings ?? []).filter((w) => !w.startsWith('Nur im Lösungsteil')), hinweis] }
  })
  return geaendert ? neu : blocks
}
