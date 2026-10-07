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

import { SUBJECTS } from '../modules/arbeitsblatt/model/subjects'

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
 *
 * `eigene`: Werte der unterrichteten Fächer (nur bei Fachauswahlen) – sie stehen als Gruppe
 * „Eigene Fächer" ganz oben.
 */
export function gruppiereHaeufig(eintraege: Eintrag[], zaehler: Record<string, number>, ansEnde: string[] = ['anderes'], eigene: string[] = []): Gruppiert {
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

  /*
   * Eigene Fächer (Paket 12, Einstellungen › Schule): ganz oben als eigene Gruppe, in der
   * Reihenfolge des Alphabets. „Häufig gewählt" zeigt dann nur noch, was darüber hinaus oft
   * vorkommt (ohne Dubletten), der Rest heißt „Andere Fächer".
   */
  const eigen = alphabetisch.filter((e) => eigene.includes(e.value))
  if (eigen.length) {
    const schonOben = new Set(eigen.map((e) => e.value))
    const oft = haeufig.filter((e) => !schonOben.has(e.value))
    for (const e of oft) schonOben.add(e.value)
    const andere = alphabetisch.filter((e) => !schonOben.has(e.value))
    return [
      { group: 'Eigene Fächer', items: eigen },
      ...(oft.length ? [{ group: 'Häufig gewählt', items: oft }] : []),
      ...(andere.length ? [{ group: 'Andere Fächer', items: andere }] : [])
    ]
  }

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

/**
 * Welche Werte einer Fachauswahl gehören zu den unterrichteten Fächern?
 *
 * Die meisten Auswahlen führen Fachkennungen („englisch"); die Vokabellisten dagegen
 * Sprachkürzel („en", „la"). Beide sollen die eigenen Fächer oben zeigen – deshalb wird hier
 * übersetzt statt in jedem Formular.
 */
export function eigeneWerte(eigeneFaecher: string[], data: { value: string; label?: string }[]): string[] {
  if (!eigeneFaecher.length) return []
  const passend = new Set<string>()
  for (const id of eigeneFaecher) {
    passend.add(id)
    const fach = SUBJECTS.find((s) => s.id === id)
    if (fach?.foreignLanguage) passend.add(fach.foreignLanguage)
    if (fach?.uebersetzungssprache) passend.add(fach.uebersetzungssprache)
    // Manche Auswahlen führen die Beschriftung als Wert (Onlinetest, Meine Klassen)
    if (fach) passend.add(fach.label)
  }
  return data.filter((d) => passend.has(d.value) || (d.label !== undefined && passend.has(d.label))).map((d) => d.value)
}

/** Platzhalter-Eintrag am Ende der verkürzten Fachliste (nicht wählbar) */
export const WEITERE_FAECHER_HINWEIS = '__weitere-faecher'

type Option = { value: string; label: string; disabled?: boolean }
type OptionOderGruppe = Option | { group: unknown; items: Option[] }

/**
 * Fachauswahl im Standardmodus (07.10.2026, Wunsch der Lehrkraft): Ohne Suchtext stehen nur die eigenen
 * Fächer (und das gerade gewählte) in der Liste, darunter der Hinweis, dass weitere Fächer per
 * Eintippen erreichbar sind. Mit Suchtext übernimmt `mitSuche` – dann sind alle Fächer wählbar.
 */
export function nurEigeneFaecher<T extends OptionOderGruppe>(
  optionen: T[],
  suche: string,
  eigene: Set<string>,
  gewaehlt: string | null | undefined,
  mitSuche: (optionen: T[], suche: string) => T[]
): OptionOderGruppe[] {
  if (suche.trim()) return mitSuche(optionen, suche)
  const flach = optionen.flatMap((o) => ('group' in o ? o.items : [o as Option]))
  const oben = flach.filter((o) => eigene.has(o.value) || o.value === gewaehlt)
  if (!oben.length) return optionen
  const gibtWeitere = flach.some((o) => !eigene.has(o.value) && o.value !== gewaehlt)
  return gibtWeitere ? [...oben, { value: WEITERE_FAECHER_HINWEIS, label: 'Weitere Fächer: Namen eintippen …', disabled: true }] : oben
}
