/**
 * Neues von der Fachschaft (09.10.2026, Entscheidung des Admins: Menü „Daten und Material" entfällt).
 *
 * Die Freigaben der Fachschaft stehen seitdem nur noch in der Bibliothek der jeweiligen App
 * („Von der Fachschaft"). Damit niemand etwas übersieht, zeigen Leiste und Bibliothek, wie viele
 * Einträge noch nicht angesehen sind. „Angesehen" heißt: die Liste in der Bibliothek einmal
 * aufgeklappt. Gemerkt wird das je Konto im Browser (nur eine Bequemlichkeit – fehlt der
 * Speicher, gilt eben alles als neu).
 */

export interface FachschaftsEintrag {
  /** Kennung der Freigabe; Kopien aus der ersten Fassung (Fachordner) mit Vorsilbe „alt:" */
  id: string
  /** Programm (arbeitsblatt, tafelbild …) */
  art: string
  /** Eigenes Material zählt nie als neu */
  eigen?: boolean
}

/** Zahl der noch nicht angesehenen Einträge je Programm */
export function neueJeProgramm(eintraege: readonly FachschaftsEintrag[], gesehen: Iterable<string>): Record<string, number> {
  const schon = new Set(gesehen)
  const zahl: Record<string, number> = {}
  for (const e of eintraege) {
    if (e.eigen || schon.has(e.id)) continue
    zahl[e.art] = (zahl[e.art] ?? 0) + 1
  }
  return zahl
}

/** Höchstens so viele Kennungen merken – die ältesten fallen heraus */
export const GESEHEN_MAX = 2000

/** Gesehene Kennungen ergänzen (ohne Doppelte, neueste hinten, gedeckelt) */
export function gesehenErgaenzen(bisher: readonly string[], neu: readonly string[]): string[] {
  const zusatz = neu.filter((id, i) => !bisher.includes(id) && neu.indexOf(id) === i)
  if (!zusatz.length) return [...bisher]
  return [...bisher, ...zusatz].slice(-GESEHEN_MAX)
}

const schluessel = (konto: string): string => `schulapps-fachschaft-gesehen:${konto}`

export function gesehenLesen(konto: string): string[] {
  try {
    const roh = localStorage.getItem(schluessel(konto))
    const liste = roh ? (JSON.parse(roh) as unknown) : []
    return Array.isArray(liste) ? liste.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function gesehenSchreiben(konto: string, liste: readonly string[]): void {
  try {
    localStorage.setItem(schluessel(konto), JSON.stringify(liste))
  } catch {
    // ohne Speicher gilt beim nächsten Mal wieder alles als neu
  }
}
