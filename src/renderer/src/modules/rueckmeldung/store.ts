import { erzeugeBibliothek } from '../../shared/testmodul/bibliothek'
import { erzeugeDokumentStore } from '../../shared/testmodul/dokumentStore'
import { erzeugeProjektDatei } from '../../shared/testmodul/projekt'
import { hatInhalt, lohntSicherung, standardName, type Rueckmeldung } from './model/types'

/** Store, Bibliothek und Projektdatei des Programms „Rückmeldung" (Großprogramm 0.4, F3) */
export const useRueckmeldung = erzeugeDokumentStore<Rueckmeldung>({ startSchritt: (r) => (hatInhalt(r) ? 1 : 0) })

export const rueckmeldungStats = (r: Rueckmeldung): Record<string, unknown> => ({
  subjectLabel: r.meta.subjectLabel,
  grade: r.meta.grade,
  thema: r.grundlage.titel,
  abgaben: r.abgaben.length,
  fertig: r.abgaben.filter((a) => a.bogen).length
})

export const bibliothek = erzeugeBibliothek({
  store: useRueckmeldung,
  dokument: (s) => s.dok,
  setzeDokument: (s, d) => s.setDok(d),
  api: { save: (i) => window.api.rueckmeldungen.save(i), get: (id) => window.api.rueckmeldungen.get(id) },
  stats: rueckmeldungStats,
  standardName,
  lohntSicherung
})

export const projektDatei = erzeugeProjektDatei<Rueckmeldung>({
  typ: 'rueckmeldung',
  feld: 'rueckmeldung',
  bezeichnung: 'Rückmeldung',
  gueltig: (d) => Array.isArray(d.abgaben)
})
