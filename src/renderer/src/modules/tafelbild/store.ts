import { erzeugeBibliothek } from '../../shared/testmodul/bibliothek'
import { erzeugeDokumentStore } from '../../shared/testmodul/dokumentStore'
import { erzeugeProjektDatei } from '../../shared/testmodul/projekt'
import { formatInfo } from './formate'
import { hatTafel, lohntSicherung, normalisiere, standardName, type Tafelbild } from './model'

/** Store, Bibliothek und Projektdatei des Programms „Tafelbilder" (30.09.2026) */
export const useTafelbild = erzeugeDokumentStore<Tafelbild>({ startSchritt: (t) => (hatTafel(t) ? 1 : 0), normalisiere })

export const bibliothek = erzeugeBibliothek({
  store: useTafelbild,
  dokument: (s) => s.dok,
  setzeDokument: (s, d) => s.setDok(d),
  api: { save: (i) => window.api.tafelbilder.save(i), get: (id) => window.api.tafelbilder.get(id) },
  stats: (t: Tafelbild) => ({
    subjectLabel: t.meta.subjectLabel,
    subjectId: t.meta.subjectId,
    grade: t.meta.grade,
    thema: t.meta.thema || t.inhalt?.titel || '',
    stateId: t.meta.stateId,
    schoolTypeId: t.meta.schoolTypeId,
    hatTafel: hatTafel(t),
    formate: t.meta.formate.map((f) => formatInfo(f).kurz).join(', '),
    // Themen-Bibliothek (09.10.2026): Überthema und von Hand gewählter Themenbereich
    ueberthema: t.meta.ueberthema ?? '',
    ...(t.meta.themenbereich ? { themenbereich: t.meta.themenbereich } : {})
  }),
  standardName,
  lohntSicherung,
  normalisiere
})

export const projektDatei = erzeugeProjektDatei<Tafelbild>({
  typ: 'tafelbild',
  feld: 'tafelbild',
  bezeichnung: 'Tafelbild',
  gueltig: (d) => Array.isArray(d.tafeln) && typeof d.meta === 'object'
})
