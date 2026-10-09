import { erzeugeBibliothek } from '../../shared/testmodul/bibliothek'
import { erzeugeDokumentStore } from '../../shared/testmodul/dokumentStore'
import { erzeugeProjektDatei } from '../../shared/testmodul/projekt'
import { briefInfo } from './bibliothekInfo'
import { hatText, lohntSicherung, standardName, type Elternbrief } from './model'

/** Store, Bibliothek und Projektdatei des Programms „Elternbrief" (Großprogramm 0.4, F7) */
export const useElternbrief = erzeugeDokumentStore<Elternbrief>({ startSchritt: (b) => (hatText(b) ? 1 : 0) })

/** Angaben für die Bibliothek – auch beim Ändern des Anlasses aus der Bibliothek (steps/Bibliothek.tsx) */
export const briefStats = (b: Elternbrief): Record<string, unknown> => ({
  subjectLabel: b.meta.klasse ? `Klasse ${b.meta.klasse}` : 'Elternbriefe',
  thema: b.meta.anlass,
  sprachen: b.uebersetzungen.length,
  // Kurzinfo für die Bibliothek (09.10.2026): Anlass, Termin, Frist, Sprachen, Klassen, Briefdatum
  eb: briefInfo(b)
})

export const bibliothek = erzeugeBibliothek({
  store: useElternbrief,
  dokument: (s) => s.dok,
  setzeDokument: (s, d) => s.setDok(d),
  api: { save: (i) => window.api.elternbriefe.save(i), get: (id) => window.api.elternbriefe.get(id) },
  stats: briefStats,
  standardName,
  lohntSicherung
})

export const projektDatei = erzeugeProjektDatei<Elternbrief>({
  typ: 'elternbrief',
  feld: 'elternbrief',
  bezeichnung: 'Elternbrief',
  gueltig: (d) => Array.isArray(d.uebersetzungen)
})
