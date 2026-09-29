/**
 * Rückmeldungen erzeugen (Großprogramm 0.4, F3): ein Hintergrund-Auftrag für alle Abgaben ohne
 * Bogen. Fotos und Scans werden zuerst übertragen (erkannte Namen durch das Kürzel ersetzt),
 * dann entsteht je Abgabe ein Bogen – nacheinander, damit der Fortschritt stimmt und ein
 * Fehler nur eine Abgabe betrifft.
 */
import { starteAuftrag } from '../../shared/auftraege'
import { subjectById } from '../arbeitsblatt/model/subjects'
import {
  aufgabeAnfrage,
  aufgabeAus,
  ENTWURF_VERMERK,
  erwartungAus,
  erwartungAusDateiAnfrage,
  erwartungsEntwurfAnfrage,
  type GeleseneDatei
} from './aufgabeAusMaterial'
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

/**
 * „Eigene Aufgabe" aus hineingezogenen Dateien (29.09.2026): Aufgabe wörtlich samt nötigem
 * Material, Erwartungshorizont aus dem Material oder als gekennzeichneter KI-Entwurf, Fach und
 * Jahrgang erkannt (änderbar, mit Hinweis).
 */
export function aufgabeAusDateien(r: Rueckmeldung, docId: string, dateien: GeleseneDatei[]): void {
  void starteAuftrag({
    moduleId: 'rueckmeldung',
    docId,
    titel: r.meta.title || r.grundlage.titel || 'Rückmeldung',
    art: 'Aufgabe aus dem Material übernehmen',
    eingabe: r,
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: `rueckmeldung-aufgabe-${docId}`,
    fehlerTitel: 'Die Aufgabe konnte nicht übernommen werden',
    arbeit: async (rm, k) => {
      k.melde('Die KI liest die Aufgabe aus dem Material …')
      const erkannt = aufgabeAus(await k.ai<unknown>(aufgabeAnfrage(dateien)))
      let erwartung = erkannt.erwartung
      let entwurf = false
      // Kein Erwartungshorizont im Material und keiner eingetragen: Entwurf der KI
      if (!erwartung && !rm.grundlage.erwartung?.trim()) {
        k.melde('Kein Erwartungshorizont im Material – die KI entwirft einen …')
        const fach = erkannt.fach ? subjectById(erkannt.fach).label : rm.meta.subjectLabel
        erwartung = erwartungAus(await k.ai<unknown>(erwartungsEntwurfAnfrage(erkannt.aufgaben, fach, erkannt.jahrgang || rm.meta.grade)))
        entwurf = true
      }
      return { erkannt, erwartung, entwurf }
    },
    abschluss: ({ erkannt, entwurf }) =>
      `Aufgabe übernommen${entwurf ? ' – Erwartungshorizont als Entwurf der KI' : ''}${erkannt.fach || erkannt.jahrgang ? ' – Lerngruppe erkannt' : ''}.`,
    ablegen: ({ erkannt, erwartung, entwurf }, rm) =>
      bibliothek.legeAb(docId, rm, (aktuell) => {
        const meta = { ...aktuell.meta }
        const teile: string[] = []
        if (erkannt.fach) {
          meta.subjectId = erkannt.fach
          meta.subjectLabel = subjectById(erkannt.fach).label
          teile.push('Fach')
        }
        if (erkannt.jahrgang) {
          meta.grade = erkannt.jahrgang
          teile.push('Jahrgang')
        }
        if (teile.length)
          meta.erkannt = `${teile.join(' und ')} aus dem Material erkannt${erkannt.erkennbar.length ? ` (${erkannt.erkennbar.join('; ')})` : ''} – bitte prüfen.`
        return {
          ...aktuell,
          meta,
          grundlage: {
            art: 'frei',
            titel: aktuell.grundlage.titel.trim() || erkannt.titel,
            aufgaben: erkannt.aufgaben,
            erwartung: erwartung ? (entwurf ? `${ENTWURF_VERMERK}\n${erwartung}` : erwartung) : aktuell.grundlage.erwartung
          }
        }
      })
  })
}

/** Erwartungshorizont aus einer eigenen Datei (Lösungsblatt) übertragen */
export function erwartungAusDateien(r: Rueckmeldung, docId: string, dateien: GeleseneDatei[]): void {
  void starteAuftrag({
    moduleId: 'rueckmeldung',
    docId,
    titel: r.meta.title || r.grundlage.titel || 'Rückmeldung',
    art: 'Erwartungshorizont übernehmen',
    eingabe: r,
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: `rueckmeldung-erwartung-${docId}`,
    fehlerTitel: 'Der Erwartungshorizont konnte nicht übernommen werden',
    arbeit: async (rm, k) => {
      k.melde('Die KI überträgt den Erwartungshorizont …')
      return erwartungAus(await k.ai<unknown>(erwartungAusDateiAnfrage(dateien, rm.grundlage.aufgaben)))
    },
    abschluss: () => 'Erwartungshorizont übernommen.',
    ablegen: (erwartung, rm) => bibliothek.legeAb(docId, rm, (aktuell) => ({ ...aktuell, grundlage: { ...aktuell.grundlage, erwartung } }))
  })
}
