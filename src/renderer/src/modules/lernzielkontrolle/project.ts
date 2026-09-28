import { erzeugeProjektDatei } from '../../shared/testmodul/projekt'
import type { Kurztest } from './model/types'

/**
 * Weitergebbare Datei einer Lernzielkontrolle (27.09.2026) – wie `.arbeitsblatt`: „Als Datei speichern" in der
 * Werkzeugleiste, „Datei öffnen …" in der Bibliothek. Gerüst gemeinsam mit den anderen
 * Testprogrammen (shared/testmodul/projekt.ts, Großprogramm 0.4).
 */
export const projektDatei = erzeugeProjektDatei<Kurztest>({
  typ: 'lernzielkontrolle',
  feld: 'test',
  bezeichnung: 'Lernzielkontrolle',
  gueltig: (d) => Array.isArray(d.varianten)
})

export const KURZTEST_FILTER = projektDatei.filter
export const serializeKurztest = projektDatei.serialisiere
export const parseKurztestFile = projektDatei.lies
