/**
 * Auswahllisten mit „Häufig gewählt" oben.
 *
 * Wunsch der Lehrkraft (25.09.2026): Bundesland, Schulform und Fach alphabetisch – aber die
 * eigenen Fächer nicht jedes Mal zwischen Biologie und Sport suchen müssen. Eine Englisch-
 * und Geschichtslehrkraft soll Englisch und Geschichte oben finden.
 *
 * Deshalb wird je Feldart gezählt, was gewählt wurde. Oben steht die Gruppe „Häufig gewählt"
 * mit höchstens drei Einträgen, und zwar erst ab zwei Wahlen – eine einzelne Wahl kann ein
 * Versehen sein. Darunter „Alle" alphabetisch, OHNE die schon oben stehenden: Mantines Select
 * verträgt keine doppelten Werte in einer Liste.
 *
 * Diese Datei kennt weder React noch Mantine, damit sich die Sortierung ohne Oberfläche prüfen
 * lässt (tests/haeufig.test.ts).
 */

export type HaeufigArt = 'bundesland' | 'schulform' | 'fach'

export interface Eintrag {
  value: string
  label: string
}

export type Gruppiert = Eintrag[] | { group: string; items: Eintrag[] }[]

/** Höchstens so viele Einträge in „Häufig gewählt" */
export const HAEUFIG_MAX = 3
/** Erst ab so vielen Wahlen gilt ein Eintrag als häufig */
export const HAEUFIG_AB = 2

/**
 * Sortiert die Einträge alphabetisch (deutsche Regeln: Ä bei A, Ü bei U) und stellt die
 * häufig gewählten als eigene Gruppe davor. Ohne häufige Einträge bleibt die Liste flach –
 * eine einzelne Überschrift „Alle" wäre nur Rauschen.
 *
 * `ansEnde`: Werte, die nicht ins Alphabet gehören, sondern immer unten stehen
 * („Anderes Fach …").
 */
export function gruppiereHaeufig(eintraege: Eintrag[], zaehler: Record<string, number>, ansEnde: string[] = ['anderes']): Gruppiert {
  // Doppelte Werte entfernen – sie würden das Auswahlfeld zum Absturz bringen
  const gesehen = new Set<string>()
  const eindeutig = eintraege.filter((e) => (gesehen.has(e.value) ? false : (gesehen.add(e.value), true)))

  const alphabetisch = [...eindeutig].sort((a, b) => {
    const endeA = ansEnde.includes(a.value)
    const endeB = ansEnde.includes(b.value)
    if (endeA !== endeB) return endeA ? 1 : -1
    return a.label.localeCompare(b.label, 'de', { sensitivity: 'base' })
  })

  const haeufig = eindeutig
    .filter((e) => (zaehler[e.value] ?? 0) >= HAEUFIG_AB)
    .sort((a, b) => (zaehler[b.value] ?? 0) - (zaehler[a.value] ?? 0) || a.label.localeCompare(b.label, 'de', { sensitivity: 'base' }))
    .slice(0, HAEUFIG_MAX)

  if (!haeufig.length) return alphabetisch
  const oben = new Set(haeufig.map((e) => e.value))
  const rest = alphabetisch.filter((e) => !oben.has(e.value))
  return rest.length
    ? [
        { group: 'Häufig gewählt', items: haeufig },
        { group: 'Alle', items: rest }
      ]
    : [{ group: 'Häufig gewählt', items: haeufig }]
}

const schluessel = (art: HaeufigArt): string => `schul-apps-haeufig-${art}`

export function ladeZaehler(art: HaeufigArt): Record<string, number> {
  try {
    const gespeichert = JSON.parse(localStorage.getItem(schluessel(art)) ?? 'null')
    return gespeichert && typeof gespeichert === 'object' ? (gespeichert as Record<string, number>) : {}
  } catch {
    return {}
  }
}

/** Zählt eine Wahl. Ohne lokalen Speicher bleibt die Liste einfach alphabetisch. */
export function zaehleWahl(art: HaeufigArt, value: string): void {
  try {
    const z = ladeZaehler(art)
    z[value] = (z[value] ?? 0) + 1
    localStorage.setItem(schluessel(art), JSON.stringify(z))
  } catch {
    // ohne lokalen Speicher keine Zählung – unkritisch
  }
}
