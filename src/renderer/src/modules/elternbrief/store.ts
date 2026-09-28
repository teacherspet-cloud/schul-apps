import { erzeugeBibliothek } from '../../shared/testmodul/bibliothek'
import { erzeugeDokumentStore } from '../../shared/testmodul/dokumentStore'
import { erzeugeProjektDatei } from '../../shared/testmodul/projekt'
import { hatText, lohntSicherung, standardName, type Elternbrief } from './model'

/** Store, Bibliothek und Projektdatei des Programms „Elternbrief" (Großprogramm 0.4, F7) */
export const useElternbrief = erzeugeDokumentStore<Elternbrief>({ startSchritt: (b) => (hatText(b) ? 1 : 0) })

export const bibliothek = erzeugeBibliothek({
  store: useElternbrief,
  dokument: (s) => s.dok,
  setzeDokument: (s, d) => s.setDok(d),
  api: { save: (i) => window.api.elternbriefe.save(i), get: (id) => window.api.elternbriefe.get(id) },
  stats: (b: Elternbrief) => ({
    subjectLabel: b.meta.klasse ? `Klasse ${b.meta.klasse}` : 'Elternbriefe',
    thema: b.meta.anlass,
    sprachen: b.uebersetzungen.length
  }),
  standardName,
  lohntSicherung
})

export const projektDatei = erzeugeProjektDatei<Elternbrief>({
  typ: 'elternbrief',
  feld: 'elternbrief',
  bezeichnung: 'Elternbrief',
  gueltig: (d) => Array.isArray(d.uebersetzungen)
})
