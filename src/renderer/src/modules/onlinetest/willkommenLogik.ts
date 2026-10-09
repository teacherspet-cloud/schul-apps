/**
 * Willkommens-Assistent der Lernenden (09.10.2026, Entscheidung der Lehrkraft) – wann er erscheint.
 *
 * Einmal je Konto beim ersten Besuch im Schülerbereich (nach dem Pflicht-Passwortwechsel lokaler Konten; auch IServ und
 * Gäste mit QR/Code). Gemerkt wird das am Konto (Darstellung „willkommenErledigt" auf dem Server), nicht je Gerät –
 * deshalb wartet der Assistent, bis die Darstellung vom Server da ist. Nie von selbst:
 *  - in der Musterschüler-Vorschau der Lehrkraft (dort nur über „Willkommens-Tour erneut ansehen"),
 *  - für Lehrkräfte und ohne Sitzung (Gast nur mit Namen in einem Test),
 *  - mitten in einer Aufgabe (Onlinetest, Blatt, Übung, Beitritt per Code) – nur auf ruhigen Seiten,
 *  - in automatisierten Browsern (Playwright), damit die vielen Prüfskripte nicht hängen bleiben; ein Skript, das
 *    ihn prüft, setzt im Browser „schulapps-e2e-willkommen" = „1" (tests/e2e/server-willkommen.mjs).
 */
import { create } from 'zustand'
import type { ServerIch } from '../../shared/plattform'

/** Seiten, auf denen der Assistent stören darf: Start, Regal/Ordner, Listen, Einstellungen */
const RUHIGE_SEITE = /^\/s\/?$|^\/s\/(lernen(\/[^/]+)?|ordner\/[^/]+|tests|ergebnisse|aufgaben|blaetter|reihen|einstellungen)\/?$/

export interface WillkommenLage {
  ich: ServerIch | null | undefined
  /** Darstellung vom Server geladen? (vorher ist unklar, ob das Konto ihn schon gesehen hat) */
  geladen: boolean
  /** Am Konto gemerkt: schon gesehen oder übersprungen */
  erledigt: boolean
  pfad: string
  /** navigator.webdriver */
  automatisiert?: boolean
  /** Prüfskript will ihn sehen */
  e2e?: boolean
}

/** Erscheint der Assistent von selbst? */
export function willkommenZeigen(l: WillkommenLage): boolean {
  const ich = l.ich
  if (!ich?.angemeldet) return false
  if (ich.vorschau || ich.quelle === 'vorschau') return false
  if (ich.rolle === 'lehrkraft' || ich.rolle === 'admin') return false
  if (!l.geladen || l.erledigt) return false
  if (l.automatisiert && !l.e2e) return false
  return RUHIGE_SEITE.test(l.pfad)
}

/**
 * Zustand: `geladen`/`erledigt` setzt SchuelerRahmen nach dem Laden der Darstellung, `offen` der Link in den
 * Einstellungen (ausdrücklich ansehen – auch in der Vorschau und nach dem ersten Mal).
 */
export const useWillkommen = create<{ geladen: boolean; erledigt: boolean; offen: boolean }>(() => ({
  geladen: false,
  erledigt: false,
  offen: false
}))

export const willkommenAnsehen = (): void => useWillkommen.setState({ offen: true })

/** Läuft der Browser unter Playwright & Co., ohne dass das Skript den Assistenten sehen will? */
export function automatisierung(): { automatisiert: boolean; e2e: boolean } {
  let e2e = false
  try {
    e2e = localStorage.getItem('schulapps-e2e-willkommen') === '1'
  } catch {
    /* gesperrt */
  }
  return { automatisiert: typeof navigator !== 'undefined' && navigator.webdriver === true, e2e }
}

// ---------------------------------------------------------------- Stimmprobe weiblich/männlich

const WEIBLICH = /zira|hazel|susan|samantha|karen|moira|tessa|fiona|victoria|aria|jenny|libby|sonia|emma|ava|allison|serena|kate|catherine|michelle|female|frau/i
const MAENNLICH = /david|mark|george|daniel|alex\b|fred|guy|ryan|thomas|christopher|eric|brian|andrew|oliver|arthur|james|male|mann/i

/**
 * Eine englische Gerätestimme passend zu „weiblich"/„männlich" für die Probe im Assistenten. Die Geräte sagen nicht,
 * welche Stimme welche ist – erkannt wird am Namen (Zira, David …). „female" enthält „male", deshalb zuerst weiblich.
 */
export const lageVon = (name: string): 'w' | 'm' | '' => (WEIBLICH.test(name) ? 'w' : MAENNLICH.test(name) ? 'm' : '')

export function stimmeNachLage<V extends { name: string; lang: string }>(stimmen: V[], lage: 'w' | 'm'): V | undefined {
  const en = stimmen.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('en'))
  return en.find((v) => lageVon(v.name) === lage) ?? en[0]
}
