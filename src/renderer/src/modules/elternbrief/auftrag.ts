/**
 * Elternbrief schreiben, überarbeiten und übersetzen (Großprogramm 0.4, F7; Nacharbeit 29.09.2026)
 * – als Hintergrund-Aufträge wie in den übrigen Programmen: sperren nichts, lassen sich abbrechen,
 * landen als Rückgängig-Schritt. Jede Änderung am deutschen Text zieht die Übersetzungen der
 * geänderten Teile nach; die vorige deutsche Fassung bleibt in `fassungen`.
 */
import type { StructuredRequest } from '@shared/types'
import { registriereFortsetzung, starteAuftrag } from '../../shared/auftraege'
import { spracheNach } from '../../shared/familiensprachen'
import { useAppSettings } from '../../shared/settingsStore'
import {
  AKTIONEN,
  festeWerte,
  geaenderteTeile,
  gleicherAufbau,
  neuAnfrage,
  pruefeBrief,
  teilAnfrage,
  teilAus,
  teileUebersetzungAus,
  teileUebersetzungsAnfrage,
  teileVon,
  teilLesen,
  teilSetzen,
  verloreneAngaben,
  type Aktion,
  type Neuformulierung
} from './bearbeiten'
import { briefAnfrage, briefAus, uebersetzungAus, uebersetzungsAnfrage, type BriefText, type Elternbrief, type Uebersetzung } from './model'
import { bibliothek } from './store'

/** Die bisherige deutsche Fassung vorn in die Liste (höchstens 10) */
function mitFassung(b: Elternbrief, anlass: string): Elternbrief['fassungen'] {
  return b.text ? [{ am: new Date().toISOString(), anlass, text: structuredClone(b.text) }, ...(b.fassungen ?? [])].slice(0, 10) : b.fassungen
}

export function briefSchreiben(b: Elternbrief, docId: string): void {
  void starteAuftrag({
    moduleId: 'elternbrief',
    docId,
    titel: b.meta.title || b.meta.anlass,
    art: 'Elternbrief schreiben',
    eingabe: b,
    fortsetzen: { art: 'elternbrief.schreiben', args: [b, docId] },
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: `brief-${docId}`,
    fehlerTitel: 'Der Elternbrief konnte nicht geschrieben werden',
    arbeit: async (eb, k) => {
      k.melde('Die KI formuliert den Brief …')
      return briefAus(await k.ai<unknown>(briefAnfrage(eb, useAppSettings.getState().settings.schoolName)), eb.meta.ruecklauf)
    },
    abschluss: () => 'Der Brief ist fertig.',
    // Ein neuer deutscher Text macht die Übersetzungen ungültig – sie werden verworfen; der alte bleibt als Fassung
    ablegen: (text, eb) =>
      bibliothek.legeAb(
        docId,
        eb,
        (aktuell) => ({ ...aktuell, text, uebersetzungen: [], fassungen: mitFassung(aktuell, 'Neu geschrieben'), pruefung: pruefeBrief(aktuell, text) }),
        1
      )
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
    fortsetzen: { art: 'elternbrief.uebersetzen', args: [b, docId, codes] },
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

interface Melder {
  melde: (t: string) => void
  ai: <T>(r: StructuredRequest) => Promise<T>
}

/** Geänderte Teile in allen vorhandenen Sprachen neu übersetzen; Fehler je Sprache sammeln */
async function teileNachziehen(
  k: Melder,
  uebersetzungen: Uebersetzung[],
  neu: BriefText,
  schluessel: string[]
): Promise<{ fertig: Uebersetzung[]; fehler: string[] }> {
  const fertig: Uebersetzung[] = []
  const fehler: string[] = []
  const teile = teileVon(neu).filter((t) => schluessel.includes(t.schluessel))
  for (const [i, u] of uebersetzungen.entries()) {
    const sprache = spracheNach(u.code)
    if (!sprache) continue
    k.melde(`Übersetzung ${sprache.name} anpassen (${i + 1} von ${uebersetzungen.length}) …`)
    try {
      // Gleicher Aufbau: nur die geänderten Teile; sonst die ganze Übersetzung neu
      if (gleicherAufbau(u.text, neu) && teile.length) {
        const text = structuredClone(u.text)
        for (const t of teileUebersetzungAus(await k.ai<unknown>(teileUebersetzungsAnfrage(teile, sprache)), teile)) teilSetzen(text, t.schluessel, t.text)
        fertig.push({ code: u.code, text })
      } else if (teile.length) fertig.push({ code: u.code, text: uebersetzungAus(await k.ai<unknown>(uebersetzungsAnfrage(neu, sprache)), neu) })
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') throw e
      fehler.push(`${sprache.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { fertig, fehler }
}

const bericht = (anfang: string, fertig: Uebersetzung[], fehler: string[]): string =>
  `${anfang}${fertig.length ? ` – ${fertig.length} Übersetzung${fertig.length === 1 ? '' : 'en'} angepasst` : ''}${fehler.length ? ` – nicht gelungen: ${fehler.join(' · ')}` : ''}`

/** Nur ein Teil eines Briefes als eigener Brieftext – für die Prüfung der festen Angaben */
const nurTeil = (t: BriefText, schluessel: string): BriefText => ({ betreff: '', anrede: '', gruss: '', absaetze: [teilLesen(t, schluessel)] })

/** Zauberstab an einem Teil: neu formulieren lassen, Übersetzungen dieses Teils nachziehen */
export function teilUeberarbeiten(b: Elternbrief, docId: string, schluessel: string, aktion: Aktion | null, hinweis: string): void {
  if (!b.text) return
  const name = aktion ? (AKTIONEN.find((a) => a.value === aktion)?.label ?? 'Überarbeitet') : 'Nach Hinweis überarbeitet'
  void starteAuftrag({
    moduleId: 'elternbrief',
    docId,
    titel: b.meta.title || b.meta.anlass,
    art: `Brief: ${name}`,
    eingabe: b,
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: `brief-teil-${docId}-${schluessel}`,
    fehlerTitel: 'Der Teil konnte nicht überarbeitet werden',
    arbeit: async (eb, k) => {
      const t = eb.text!
      const vorher = festeWerte(nurTeil(t, schluessel))
      k.melde('Die KI überarbeitet den Teil …')
      const neu = structuredClone(t)
      teilSetzen(neu, schluessel, teilAus(await k.ai<unknown>(teilAnfrage(eb, schluessel, aktion, hinweis))))
      const verloren = verloreneAngaben(vorher, nurTeil(neu, schluessel))
      const { fertig, fehler } = await teileNachziehen(k, eb.uebersetzungen, neu, [schluessel])
      return { neu, verloren, fertig, fehler }
    },
    abschluss: ({ fertig, fehler }) => bericht('Überarbeitet', fertig, fehler),
    ablegen: ({ neu, verloren, fertig }, eb) =>
      bibliothek.legeAb(docId, eb, (aktuell) => {
        if (!aktuell.text) return aktuell
        const text = structuredClone(aktuell.text)
        teilSetzen(text, schluessel, teilLesen(neu, schluessel))
        const uebersetzungen = aktuell.uebersetzungen.map((u) => {
          const f = fertig.find((x) => x.code === u.code)
          if (!f) return u
          const ut = structuredClone(u.text)
          teilSetzen(ut, schluessel, teilLesen(f.text, schluessel))
          return { ...u, text: ut }
        })
        return { ...aktuell, text, fassungen: mitFassung(aktuell, name), uebersetzungen, pruefung: pruefeBrief(aktuell, text, verloren) }
      })
  })
}

/** Kopfleiste: den ganzen Brief neu formulieren (Ton, Hinweis, einfache Sprache, kürzer) */
export function briefNeuFormulieren(b: Elternbrief, docId: string, o: Neuformulierung): void {
  if (!b.text) return
  void starteAuftrag({
    moduleId: 'elternbrief',
    docId,
    titel: b.meta.title || b.meta.anlass,
    art: 'Brief neu formulieren',
    eingabe: b,
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: `brief-${docId}`,
    fehlerTitel: 'Der Brief konnte nicht neu formuliert werden',
    arbeit: async (eb, k) => {
      const alt = eb.text!
      const vorher = festeWerte(alt)
      k.melde('Die KI formuliert den Brief neu …')
      let neu = briefAus(await k.ai<unknown>(neuAnfrage(eb, o)), eb.meta.ruecklauf)
      let verloren = verloreneAngaben(vorher, neu)
      // Fehlt eine feste Angabe, einmal mit ausdrücklicher Liste nachfragen
      if (verloren.length) {
        k.melde('Feste Angaben fehlten – die KI formuliert noch einmal …')
        const nachdruck = `Diese Angaben MÜSSEN unverändert vorkommen: ${verloren.join(', ')}`
        neu = briefAus(await k.ai<unknown>(neuAnfrage(eb, { ...o, hinweis: [o.hinweis, nachdruck].filter(Boolean).join(' – ') })), eb.meta.ruecklauf)
        verloren = verloreneAngaben(vorher, neu)
      }
      const geaendert = gleicherAufbau(alt, neu) ? geaenderteTeile(alt, neu) : teileVon(neu).map((t) => t.schluessel)
      const { fertig, fehler } = await teileNachziehen(k, eb.uebersetzungen, neu, geaendert)
      return { neu, verloren, fertig, fehler }
    },
    abschluss: ({ fertig, fehler }) => bericht('Neu formuliert', fertig, fehler),
    ablegen: ({ neu, verloren, fertig }, eb) =>
      bibliothek.legeAb(docId, eb, (aktuell) => ({
        ...aktuell,
        meta: { ...aktuell.meta, ton: o.ton },
        text: neu,
        fassungen: mitFassung(aktuell, 'Neu formuliert'),
        // Übersetzungen, die nicht nachgezogen werden konnten, passen nicht mehr zum Text – sie fallen weg
        uebersetzungen: aktuell.uebersetzungen
          .map((u) => fertig.find((f) => f.code === u.code) ?? (gleicherAufbau(u.text, neu) ? u : null))
          .filter((u): u is Uebersetzung => Boolean(u)),
        pruefung: pruefeBrief(aktuell, neu, verloren)
      }))
  })
}

/** Nach eigenem Tippen im deutschen Text: die geänderten Teile in allen Sprachen neu übersetzen */
export function teileNachuebersetzen(b: Elternbrief, docId: string, schluessel: string[]): void {
  if (!b.text || !b.uebersetzungen.length || !schluessel.length) return
  void starteAuftrag({
    moduleId: 'elternbrief',
    docId,
    titel: b.meta.title || b.meta.anlass,
    art: 'Übersetzungen anpassen',
    eingabe: b,
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: `uebersetzung-${docId}-${schluessel.join('-')}`,
    fehlerTitel: 'Die Übersetzungen konnten nicht angepasst werden',
    arbeit: async (eb, k) => teileNachziehen(k, eb.uebersetzungen, eb.text!, schluessel),
    abschluss: ({ fertig, fehler }) => bericht('Übersetzungen', fertig, fehler),
    ablegen: ({ fertig }, eb) =>
      bibliothek.legeAb(docId, eb, (aktuell) => ({
        ...aktuell,
        uebersetzungen: aktuell.uebersetzungen.map((u) => {
          const f = fertig.find((x) => x.code === u.code)
          if (!f) return u
          const text = structuredClone(u.text)
          for (const s of schluessel) teilSetzen(text, s, teilLesen(f.text, s))
          return { ...u, text }
        }),
        ...(aktuell.text ? { pruefung: pruefeBrief(aktuell, aktuell.text) } : {})
      }))
  })
}

// Nach einem Neustart der iPad-App fortsetzen (30.09.2026, shared/auftraege.ts)
registriereFortsetzung('elternbrief.schreiben', briefSchreiben)
registriereFortsetzung('elternbrief.uebersetzen', briefUebersetzen)
