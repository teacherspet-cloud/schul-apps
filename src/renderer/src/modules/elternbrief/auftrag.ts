/**
 * Elternbrief schreiben und übersetzen (Großprogramm 0.4, F7) – als Hintergrund-Aufträge wie
 * in den übrigen Programmen: sperren nichts, lassen sich abbrechen, landen als Rückgängig-Schritt.
 */
import { starteAuftrag } from '../../shared/auftraege'
import { spracheNach } from '../../shared/familiensprachen'
import { useAppSettings } from '../../shared/settingsStore'
import { briefAnfrage, briefAus, uebersetzungAus, uebersetzungsAnfrage, type Elternbrief, type Uebersetzung } from './model'
import { bibliothek } from './store'

export function briefSchreiben(b: Elternbrief, docId: string): void {
  void starteAuftrag({
    moduleId: 'elternbrief',
    docId,
    titel: b.meta.title || b.meta.anlass,
    art: 'Elternbrief schreiben',
    eingabe: b,
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: `brief-${docId}`,
    fehlerTitel: 'Der Elternbrief konnte nicht geschrieben werden',
    arbeit: async (eb, k) => {
      k.melde('Die KI formuliert den Brief …')
      return briefAus(await k.ai<unknown>(briefAnfrage(eb, useAppSettings.getState().settings.schoolName)), eb.meta.ruecklauf)
    },
    abschluss: () => 'Der Brief ist fertig.',
    // Ein neuer deutscher Text macht die Übersetzungen ungültig – sie werden verworfen
    ablegen: (text, eb) => bibliothek.legeAb(docId, eb, (aktuell) => ({ ...aktuell, text, uebersetzungen: [] }), 1)
  })
}

export function briefUebersetzen(b: Elternbrief, docId: string, codes: string[]): void {
  const text = b.text
  if (!text || !codes.length) return
  void starteAuftrag({
    moduleId: 'elternbrief',
    docId,
    titel: b.meta.title || b.meta.anlass,
    art: codes.length === 1 ? `Übersetzen: ${spracheNach(codes[0])?.name ?? codes[0]}` : `In ${codes.length} Sprachen übersetzen`,
    eingabe: b,
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: `uebersetzung-${docId}`,
    fehlerTitel: 'Die Übersetzung ist fehlgeschlagen',
    arbeit: async (_eb, k) => {
      const fertig: Uebersetzung[] = []
      const fehler: string[] = []
      for (const [i, code] of codes.entries()) {
        const sprache = spracheNach(code)
        if (!sprache) continue
        k.melde(`${sprache.name} (${i + 1} von ${codes.length}) …`)
        try {
          fertig.push({ code, text: uebersetzungAus(await k.ai<unknown>(uebersetzungsAnfrage(text, sprache)), text) })
        } catch (e) {
          if ((e as { name?: string })?.name === 'AbortError') throw e
          fehler.push(`${sprache.name}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      if (!fertig.length) throw new Error(fehler.join(' · ') || 'Keine Übersetzung entstanden.')
      return { fertig, fehler }
    },
    abschluss: ({ fertig, fehler }) =>
      `${fertig.length} Übersetzung${fertig.length === 1 ? '' : 'en'} fertig${fehler.length ? ` – nicht gelungen: ${fehler.join(' · ')}` : ''}`,
    ablegen: ({ fertig }, eb) =>
      bibliothek.legeAb(docId, eb, (aktuell) => ({
        ...aktuell,
        uebersetzungen: [...aktuell.uebersetzungen.filter((u) => !fertig.some((f) => f.code === u.code)), ...fertig]
      }))
  })
}
