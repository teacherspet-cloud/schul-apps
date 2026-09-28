import { erzeugeProjektDatei } from '../../shared/testmodul/projekt'
import type { GrammarTest } from './model/types'

/**
 * Weitergebbare Datei eines Grammatiktests (27.09.2026) – wie `.arbeitsblatt`: „Als Datei speichern" in der
 * Werkzeugleiste, „Datei öffnen …" in der Bibliothek. Gerüst gemeinsam mit den anderen
 * Testprogrammen (shared/testmodul/projekt.ts, Großprogramm 0.4).
 */
export const projektDatei = erzeugeProjektDatei<GrammarTest>({
  typ: 'grammatiktest',
  feld: 'test',
  bezeichnung: 'Grammatiktest',
  gueltig: (d) => Array.isArray(d.blocks)
})

export const GRAMMATIKTEST_FILTER = projektDatei.filter
export const serializeGrammarTest = projektDatei.serialisiere
export const parseGrammarTestFile = projektDatei.lies
