/**
 * Zauberstab am Blatt (29.09.2026): startet die Überarbeitung EINER Stelle als Hintergrund-Auftrag
 * (shared/auftraege). Das Ergebnis ersetzt nur diese Stelle – im offenen Dokument als
 * Rückgängig-Schritt (Strg+Z), sonst in der Bibliothek. Solange er läuft, zeigt das Blatt an der
 * Stelle einen Lader (Schlüssel aus `stelleAuftragsSchluessel`).
 */
import { starteAuftrag } from '../../shared/auftraege'
import { useAppSettings } from '../../shared/settingsStore'
import { thresholdsForSubject } from '../../shared/gradeScale'
import { bogenKontext, rueckmeldungSystem } from './auftrag'
import { STELLEN_NAME, stelleAnfrage, stelleAuftragsSchluessel, stelleAus, stelleEinsetzen, type Stelle, type StellenModus } from './feedbackUeberarbeiten'
import type { Rueckmeldung } from './model/types'
import { bibliothek } from './store'

export function stelleUeberarbeiten(r: Rueckmeldung, docId: string, abgabeId: string, stelle: Stelle, modus: StellenModus, hinweis = ''): void {
  const a = r.abgaben.find((x) => x.id === abgabeId)
  if (!a?.bogen) return
  const ctx = bogenKontext(r)
  const settings = useAppSettings.getState().settings
  const skala = { meta: r.meta, schwellen: thresholdsForSubject(settings.gradeScale, r.meta.subjectId) }
  const was = modus === 'neu' ? 'neu erzeugen' : modus === 'hinweis' ? 'mit Hinweis überarbeiten' : 'überarbeiten'
  void starteAuftrag({
    moduleId: 'rueckmeldung',
    docId,
    titel: r.meta.title || r.grundlage.titel || 'Rückmeldung',
    art: `${a.kuerzel}: ${STELLEN_NAME[stelle.art]} ${was}`,
    eingabe: r,
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: stelleAuftragsSchluessel(docId, abgabeId, stelle),
    fehlerTitel: 'Die Stelle konnte nicht überarbeitet werden',
    arbeit: async (rm, k) => {
      const ab = rm.abgaben.find((x) => x.id === abgabeId)
      if (!ab?.bogen) throw new Error('Der Bogen ist nicht mehr da.')
      k.melde(`${ab.kuerzel}: ${STELLEN_NAME[stelle.art]} – die KI schreibt …`)
      return stelleAus(await k.ai<unknown>(stelleAnfrage(rm, ab, stelle, modus, hinweis, rueckmeldungSystem(rm), ctx)), rm, ab, stelle, skala, ctx)
    },
    abschluss: () => `${STELLEN_NAME[stelle.art]} ${modus === 'neu' ? 'neu erzeugt' : 'überarbeitet'}.`,
    ablegen: (erg, rm) =>
      bibliothek.legeAb(docId, rm, (aktuell) => ({
        ...aktuell,
        abgaben: aktuell.abgaben.map((x) => (x.id === abgabeId && x.bogen ? { ...x, bogen: stelleEinsetzen(x.bogen, stelle, erg, x) } : x))
      }))
  })
}
