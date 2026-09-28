/**
 * Rückmeldungen erzeugen (Großprogramm 0.4, F3): ein Hintergrund-Auftrag für alle Abgaben ohne
 * Bogen. Fotos und Scans werden zuerst übertragen (erkannte Namen durch das Kürzel ersetzt),
 * dann entsteht je Abgabe ein Bogen – nacheinander, damit der Fortschritt stimmt und ein
 * Fehler nur eine Abgabe betrifft.
 */
import { starteAuftrag } from '../../shared/auftraege'
import { bogenAnfrage, bogenAus, ohneNamen, transkriptAnfrage, transkriptUebernehmen } from './generation'
import type { Abgabe, Rueckmeldung } from './model/types'
import { bibliothek } from './store'

/** Lerngruppe und Haltung für jede Anfrage */
export function rueckmeldungSystem(r: Rueckmeldung): string {
  return [
    `Du bist eine erfahrene Lehrkraft für ${r.meta.subjectLabel} (Klasse ${r.meta.grade}, ${r.meta.schoolTypeName}) und schreibst lernförderliche Rückmeldungen zu Schülerarbeiten.`,
    'Grundlage ist das Modell von Hattie und Timperley: Wo steht die Arbeit (Feed Back), was ist das Ziel (Feed Up), was ist der nächste Schritt (Feed Forward).',
    'Du schreibst auf Deutsch, in der Sprache der Lerngruppe, konkret und ermutigend – ohne Noten, ohne Punkte.'
  ].join('\n')
}

export function rueckmeldungenErzeugen(r: Rueckmeldung, docId: string): void {
  const offen = r.abgaben.filter((a) => !a.bogen && (a.text.trim() || a.bilder.length))
  if (!offen.length) return
  void starteAuftrag({
    moduleId: 'rueckmeldung',
    docId,
    titel: r.meta.title || r.grundlage.titel || 'Rückmeldung',
    art: offen.length === 1 ? 'Rückmeldung schreiben' : `${offen.length} Rückmeldungen schreiben`,
    eingabe: r,
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: `rueckmeldung-${docId}`,
    fehlerTitel: 'Die Rückmeldungen konnten nicht erstellt werden',
    arbeit: async (rm, k) => {
      const fertig = new Map<string, Abgabe>()
      const fehler: string[] = []
      for (const [i, roh] of offen.entries()) {
        k.melde(`${roh.kuerzel}: ${roh.text.trim() ? 'Rückmeldung wird geschrieben' : 'Text wird übertragen'} (${i + 1} von ${offen.length}) …`)
        try {
          let a = roh
          if (!a.text.trim() && a.bilder.length) a = transkriptUebernehmen(a, await k.ai<unknown>(transkriptAnfrage(a)))
          // Namen verlassen den Rechner nicht: an die KI geht der bereinigte Text
          const { text, pseudonyme } = ohneNamen(a)
          const bogen = bogenAus(await k.ai<unknown>(bogenAnfrage(rm, { ...a, text }, rueckmeldungSystem(rm))))
          fertig.set(a.id, { ...a, pseudonyme, bogen })
        } catch (e) {
          if ((e as { name?: string })?.name === 'AbortError') throw e
          fehler.push(`${roh.kuerzel}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      if (!fertig.size) throw new Error(fehler.join(' · ') || 'Keine Rückmeldung entstanden.')
      return { fertig, fehler }
    },
    abschluss: ({ fertig, fehler }) =>
      `${fertig.size} Rückmeldung${fertig.size === 1 ? '' : 'en'} fertig${fehler.length ? ` – nicht gelungen: ${fehler.join(' · ')}` : ''}`,
    ablegen: ({ fertig }, rm) => bibliothek.legeAb(docId, rm, (aktuell) => ({ ...aktuell, abgaben: aktuell.abgaben.map((a) => fertig.get(a.id) ?? a) }), 1)
  })
}
