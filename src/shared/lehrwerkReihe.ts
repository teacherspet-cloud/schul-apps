/**
 * Schulbuchreihen (Paket 15, Wunsch der Lehrkraft vom 26.09.2026).
 *
 * Anlass: Die Vokabellisten-Übersicht zeigte jeden Band als eigene Zeile – „Green Line 1" bis
 * „Green Line Transition" untereinander, dazwischen importierte Bücher anderer Reihen. Mit
 * mehreren Reihen, Verlagen und Ausgaben (G8/G9, „ab 2021") wird das unübersichtlich. Ein
 * Lehrwerk trägt deshalb jetzt:
 * - `reihe`: die Schulbuchreihe („Green Line"),
 * - `band`: der Band darin („1" … „6", „Transition"),
 * - `ausgabe`: Generation bzw. Erscheinungsjahr („ab 2021") – NICHT das Bundesland,
 * - `edition` (wie bisher): die Landesausgabe („Niedersachsen"),
 * - `publisher` (wie bisher): der Verlag.
 * Zusammengefasst wird je Reihe + Landesausgabe + Ausgabe + Verlag: eine Karte mit ihren Bänden.
 *
 * MIGRATION: Ältere, importierte oder eigene Lehrwerke kennen `reihe` und `band` nicht. Sie
 * werden beim Einlesen aus dem Namen abgeleitet („Green Line 3" → Green Line, Band 3), ohne die
 * Datei umzuschreiben – beim nächsten Speichern stehen sie dann darin (`mitReihe`).
 *
 * REIHENFOLGE in Beschriftungen (Vorgabe der Lehrkraft): Die Landesausgabe steht IMMER vor der
 * Ausgabe – „Green Line · Niedersachsen · Ausgabe ab 2021 · Klett".
 *
 * Ohne Electron und ohne React: Hauptprozess (storage/textbooks.ts) und Oberfläche (Vokabellisten,
 * Vokabeltest, Klassenarbeit) nutzen dieselben Regeln; geprüft in tests/lehrwerkReihe.test.ts.
 */

/** Was die Reihen-Regeln an einem Lehrwerk lesen (Textbook und TextbookMeta erfüllen es) */
export interface ReihenBuch {
  id: string
  name: string
  language: string
  grade?: number
  publisher?: string
  /** Landesausgabe, z. B. „Niedersachsen" */
  edition?: string
  reihe?: string
  ausgabe?: string
  band?: string
}

/** Bandbezeichnungen ohne Zahl, die am Ende eines Namens stehen können */
const BAND_WOERTER = /^(transition|oberstufe|einführungsphase|qualifikationsphase|starter|basis|intensiv)$/i

/**
 * Reihe und Band aus einem Namen: „Green Line 3" → Green Line / 3, „Green Line Transition" →
 * Green Line / Transition, „Découvertes Band 2" → Découvertes / 2. Ohne erkennbaren Band ist der
 * ganze Name die Reihe.
 */
export function reiheAusName(name: string): { reihe: string; band?: string } {
  const n = name.trim().replace(/\s+/g, ' ')
  const mitWort = /^(.*?\S)[\s,–-]+(?:Band|Bd\.?|Vol\.?|Volume|Teil)\s*(\S+)$/i.exec(n)
  if (mitWort) return { reihe: mitWort[1], band: mitWort[2] }
  const nummer = /^(.*\S)\s+(\d{1,2}|[IVX]{1,4})$/.exec(n)
  if (nummer) return { reihe: nummer[1], band: nummer[2] }
  const wort = /^(.*\S)\s+(\S+)$/.exec(n)
  if (wort && BAND_WOERTER.test(wort[2])) return { reihe: wort[1], band: wort[2] }
  return { reihe: n }
}

/** Reihe und Band ergänzen, wo sie fehlen (Migration, siehe oben). Gesetzte Angaben bleiben. */
export function mitReihe<T extends Pick<ReihenBuch, 'name' | 'reihe' | 'band'>>(b: T): T {
  const reihe = b.reihe?.trim()
  const band = b.band?.trim()
  if (reihe && band) return b
  if (reihe) {
    // Reihe von Hand gesetzt: der Band ist, was im Namen danach kommt („Green Line 3" → „3")
    const rest = b.name.trim().startsWith(reihe) ? b.name.trim().slice(reihe.length).trim() : ''
    const aus = rest ? reiheAusName(`${reihe} ${rest}`).band : undefined
    return aus ? { ...b, band: aus } : b
  }
  const geraten = reiheAusName(b.name)
  return { ...b, reihe: geraten.reihe, ...(band ? {} : geraten.band ? { band: geraten.band } : {}) }
}

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' })

const reiheVon = (b: ReihenBuch): string => b.reihe?.trim() || reiheAusName(b.name).reihe

/** „ab 2021" → „Ausgabe ab 2021"; schon mit „Ausgabe" beginnend bleibt es, wie es ist */
export const ausgabeText = (ausgabe?: string): string => {
  const a = ausgabe?.trim()
  if (!a) return ''
  return /^ausgabe\b/i.test(a) ? a : `Ausgabe ${a}`
}

/** Beschriftung einer Reihe: „Green Line · Niedersachsen · Ausgabe ab 2021 · Klett" (Landesausgabe vor Ausgabe) */
export function reiheTitel(b: ReihenBuch): string {
  return [reiheVon(b), b.edition?.trim(), ausgabeText(b.ausgabe), b.publisher?.trim()].filter(Boolean).join(' · ')
}

/** Kennung einer Reihe: dieselbe Reihe in einer anderen Landesausgabe, Ausgabe oder bei einem anderen Verlag ist eine andere Karte */
export const reiheSchluessel = (b: ReihenBuch): string =>
  [reiheVon(b), b.edition ?? '', b.ausgabe ?? '', b.publisher ?? ''].map((x) => x.trim().toLocaleLowerCase('de')).join('|')

/** Das Jahr einer Ausgabe („ab 2021" → 2021) – zum Sortieren „neueste zuerst"; ohne Jahr ganz hinten */
export const ausgabeJahr = (ausgabe?: string): number => {
  const m = /(\d{4})/.exec(ausgabe ?? '')
  return m ? Number(m[1]) : -Infinity
}

/** Bände einer Reihe: Zahlen der Größe nach, danach Wörter („Transition") nach Klasse, dann nach Name */
export function bandVergleich(a: ReihenBuch, b: ReihenBuch): number {
  const za = Number.parseInt(a.band ?? '', 10)
  const zb = Number.parseInt(b.band ?? '', 10)
  const na = Number.isFinite(za)
  const nb = Number.isFinite(zb)
  if (na && nb && za !== zb) return za - zb
  if (na !== nb) return na ? -1 : 1
  return (a.grade ?? 99) - (b.grade ?? 99) || collator.compare(a.name, b.name)
}

// ---------- Filter der Übersicht ----------

/** Filter der Vokabellisten-Übersicht, in der Reihenfolge der Filterzeile (nach dem Fach) */
export type FilterFeld = 'verlag' | 'reihe' | 'land' | 'ausgabe'
export const FILTER_FELDER: { feld: FilterFeld; label: string }[] = [
  { feld: 'verlag', label: 'Verlag' },
  { feld: 'reihe', label: 'Reihe' },
  { feld: 'land', label: 'Landesausgabe' },
  { feld: 'ausgabe', label: 'Ausgabe' }
]
export type FilterWahl = Record<FilterFeld, string[]>
export const keinFilter = (): FilterWahl => ({ verlag: [], reihe: [], land: [], ausgabe: [] })

const wertVon = (b: ReihenBuch, f: FilterFeld): string =>
  (f === 'verlag' ? b.publisher : f === 'reihe' ? reiheVon(b) : f === 'land' ? b.edition : b.ausgabe)?.trim() ?? ''

/**
 * Auswahlmöglichkeiten je Filter aus den vorhandenen Büchern (des gewählten Fachs).
 *
 * Ein Filter erscheint nur, wenn er etwas UNTERSCHEIDET (Zusatz der Lehrkraft): mindestens zwei
 * verschiedene Werte. Heute gibt es nur Green Line bei Klett für Niedersachsen – dann steht in der
 * Filterzeile nur das Fach. Fehlt die Angabe bei manchen Büchern, zählt „ohne Angabe" nicht als
 * eigener Wert; wählbar sind nur die genannten.
 */
export function filterOptionen(buecher: ReihenBuch[]): Record<FilterFeld, string[]> {
  const out = {} as Record<FilterFeld, string[]>
  for (const { feld } of FILTER_FELDER) {
    const werte = [...new Set(buecher.map((b) => wertVon(b, feld)).filter(Boolean))]
    werte.sort(feld === 'ausgabe' ? (a, b) => ausgabeJahr(b) - ausgabeJahr(a) || collator.compare(a, b) : collator.compare)
    out[feld] = werte.length >= 2 ? werte : []
  }
  return out
}

/**
 * Die Wahl, die tatsächlich gilt: Ist ein Filter ausgeblendet (weniger als zwei Werte) oder ein
 * gemerkter Wert nicht mehr vorhanden, darf er nicht still weiterfiltern – er gilt als „alle".
 */
export function wirksamerFilter(wahl: Partial<FilterWahl> | undefined, optionen: Record<FilterFeld, string[]>): FilterWahl {
  const out = keinFilter()
  for (const { feld } of FILTER_FELDER) out[feld] = (wahl?.[feld] ?? []).filter((w) => optionen[feld].includes(w))
  return out
}

/** Bücher, die zur (wirksamen) Wahl passen; ein leerer Filter lässt alles durch */
export function filtere<T extends ReihenBuch>(buecher: T[], wahl: FilterWahl): T[] {
  return buecher.filter((b) => FILTER_FELDER.every(({ feld }) => !wahl[feld].length || wahl[feld].includes(wertVon(b, feld))))
}

// ---------- Sortierung und Gruppen ----------

export type ReihenSortierung = 'reihe' | 'verlag' | 'ausgabe' | 'klasse'
export const REIHEN_SORTIERUNGEN: { value: ReihenSortierung; label: string }[] = [
  { value: 'reihe', label: 'Reihe A–Z' },
  { value: 'verlag', label: 'Verlag' },
  { value: 'ausgabe', label: 'Ausgabe, neueste zuerst' },
  { value: 'klasse', label: 'Klassenstufe' }
]

/**
 * Sortierungen, die etwas BEWIRKEN (gleiches Prinzip wie bei den Filtern): „Verlag" nur bei
 * mindestens zwei Verlagen, „Ausgabe" nur bei mindestens zwei Ausgaben. „Reihe A–Z" gibt es
 * immer, „Klassenstufe" ab zwei Bänden. Ohne mindestens zwei Bände gibt es nichts zu sortieren
 * (leere Liste = Auswahl ausblenden).
 */
export function sinnvolleSortierungen(buecher: ReihenBuch[]): ReihenSortierung[] {
  if (buecher.length < 2) return []
  const verschieden = (f: FilterFeld): boolean => new Set(buecher.map((b) => wertVon(b, f))).size >= 2
  return REIHEN_SORTIERUNGEN.map((s) => s.value).filter(
    (s) => s === 'reihe' || s === 'klasse' || (s === 'verlag' ? verschieden('verlag') : verschieden('ausgabe'))
  )
}

/** Gemerkte Sortierung, die nichts (mehr) bewirkt, gilt als Standard „Reihe A–Z" */
export const wirksameSortierung = (s: ReihenSortierung | undefined, moeglich: ReihenSortierung[]): ReihenSortierung => (s && moeglich.includes(s) ? s : 'reihe')

export interface ReihenGruppe<T extends ReihenBuch> {
  schluessel: string
  titel: string
  reihe: string
  baende: T[]
}

/** Bücher je Reihe (+ Landesausgabe, Ausgabe, Verlag), Bände in ihrer Reihenfolge, Gruppen nach der Sortierung */
export function gruppiereReihen<T extends ReihenBuch>(buecher: T[], sortierung: Exclude<ReihenSortierung, 'klasse'>): ReihenGruppe<T>[] {
  const map = new Map<string, T[]>()
  for (const b of buecher) map.set(reiheSchluessel(b), [...(map.get(reiheSchluessel(b)) ?? []), b])
  const gruppen = [...map.entries()].map(([schluessel, baende]) => {
    const sortiert = [...baende].sort(bandVergleich)
    return { schluessel, titel: reiheTitel(sortiert[0]), reihe: reiheVon(sortiert[0]), baende: sortiert }
  })
  const erster = (g: ReihenGruppe<T>): T => g.baende[0]
  const nachReihe = (a: ReihenGruppe<T>, b: ReihenGruppe<T>): number =>
    collator.compare(a.reihe, b.reihe) ||
    collator.compare(erster(a).edition ?? '', erster(b).edition ?? '') ||
    ausgabeJahr(erster(b).ausgabe) - ausgabeJahr(erster(a).ausgabe) ||
    collator.compare(a.titel, b.titel)
  const ohneLeer = (x?: string): string => x?.trim() || '￿'
  return gruppen.sort((a, b) =>
    sortierung === 'verlag'
      ? collator.compare(ohneLeer(erster(a).publisher), ohneLeer(erster(b).publisher)) || nachReihe(a, b)
      : sortierung === 'ausgabe'
        ? ausgabeJahr(erster(b).ausgabe) - ausgabeJahr(erster(a).ausgabe) || nachReihe(a, b)
        : nachReihe(a, b)
  )
}

/** Flache Liste nach Klassenstufe (über alle Reihen); gleiche Klasse nach Reihe, dann Band */
export function nachKlasse<T extends ReihenBuch>(buecher: T[]): T[] {
  return [...buecher].sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99) || collator.compare(reiheVon(a), reiheVon(b)) || bandVergleich(a, b))
}

/**
 * Auswahlliste für Lehrwerke (Vokabeltest, Vokabelauswahl der Klassenarbeit und des Arbeitsblatts):
 * gruppiert nach Reihe, Gruppenname wie auf der Karte der Vokabellisten, Bände in ihrer
 * Reihenfolge. Die Einträge heißen weiter wie der Band („Green Line 4"). Stehen Bücher mehrerer
 * Sprachen darin, steht die Sprache vor der Reihe.
 */
export function lehrwerkOptionen(buecher: ReihenBuch[], sprache: (code: string) => string): { group: string; items: { value: string; label: string }[] }[] {
  const mehrereSprachen = new Set(buecher.map((b) => b.language)).size > 1
  const nachSprache = mehrereSprachen ? [...new Set(buecher.map((b) => b.language))].sort((a, b) => collator.compare(sprache(a), sprache(b))) : [null]
  return nachSprache.flatMap((l) =>
    gruppiereReihen(
      buecher.filter((b) => l === null || b.language === l),
      'reihe'
    ).map((g) => ({
      group: l === null ? g.titel : `${sprache(l)} – ${g.titel}`,
      items: g.baende.map((b) => ({ value: b.id, label: b.name }))
    }))
  )
}
