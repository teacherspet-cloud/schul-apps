/**
 * Reihenfolge der Sprechkarten nach ihrem Lehrwerk-Stand (21.10.2026, Wunsch der Lehrkraft: nachvollziehbar, bis zu
 * welchem Abschnitt ein Aufgabenpool reicht – Ansichten und Auswahl danach sortiert). Buchfolge: Band (bandRang), dann
 * Units und Abschnitte in der Reihenfolge des Bandes; eine ganze Unit steht hinter ihren Abschnitten, Karten ohne
 * Stand zuletzt. Rein rechnend, für Tests.
 */
import type { TextbookMeta } from '@shared/types'
import type { SprechStand } from '@shared/sprechen/karten'
import { bandRang } from '@shared/lehrwerkBand'
import type { KartenTeil } from '@shared/sprechen/erstellen'
import { ABSCHNITT_FOLGE } from '../../shared/lehrwerkGrammatik'

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' })

type Baende = Pick<TextbookMeta, 'name' | 'units'>[]

/** Stelle im Buch: [Band, Unit, Abschnitt] – unbekannte Namen hinter den bekannten */
export function standRang(s: SprechStand | undefined, baende: Baende): number[] {
  if (!s) return [Infinity, 0, 0]
  const b = baende.find((x) => x.name === s.band)
  const u = b ? b.units.findIndex((x) => x.name === s.unit) : -1
  const a = s.abschnitt && b && u >= 0 ? b.units[u].sections.findIndex((x) => x.name === s.abschnitt) : -1
  return [bandRang(s.band), u < 0 ? 999 : u, !s.abschnitt ? 1000 : a < 0 ? 999 : a]
}

/** Vergleich zweier Stände in Buchfolge (bei Gleichstand nach Namen) */
export function nachStand(x: SprechStand | undefined, y: SprechStand | undefined, baende: Baende): number {
  const rx = standRang(x, baende)
  const ry = standRang(y, baende)
  for (let i = 0; i < rx.length; i++) if (rx[i] !== ry[i]) return rx[i] < ry[i] ? -1 : 1
  if (!x || !y) return 0
  return collator.compare(x.band, y.band) || collator.compare(x.unit, y.unit) || collator.compare(x.abschnitt ?? '', y.abschnitt ?? '')
}

/**
 * Liegt eine Karte bis zum gewählten Stand (21.10.2026, Filter „Bis Lehrwerk-Stand")? Frühere Bände zählen mit, eine
 * ganze Unit gilt als ihr Ende. Ohne gewählten Stand und für Karten ohne Stand: ja (diese stehen in eigener Gruppe).
 */
export function standBis(karte: SprechStand | undefined, ziel: SprechStand | undefined, baende: Baende): boolean {
  if (!karte || !ziel) return true
  return nachStand(karte, ziel, baende) <= 0
}

/** Gruppe einer Karte: Band › Unit, ohne Stand eine eigene */
export const OHNE_STAND = 'ohne'
export const gruppeVon = (s: SprechStand | undefined): string => (s ? `${s.band} › ${s.unit}` : OHNE_STAND)

export interface StandGruppe<T> {
  schluessel: string
  titel: string
  eintraege: T[]
}

/** In Gruppen Band › Unit, in Buchfolge (innen nach Abschnitt), „Ohne Lehrwerk-Stand" zuletzt */
export function gruppiere<T>(l: T[], stand: (x: T) => SprechStand | undefined, baende: Baende): StandGruppe<T>[] {
  const aus: StandGruppe<T>[] = []
  for (const x of [...l].sort((a, b) => nachStand(stand(a), stand(b), baende))) {
    const s = gruppeVon(stand(x))
    const g = aus.find((y) => y.schluessel === s)
    if (g) g.eintraege.push(x)
    else aus.push({ schluessel: s, titel: s === OHNE_STAND ? 'Ohne Lehrwerk-Stand' : s, eintraege: [x] })
  }
  return aus
}

/** Bester Treffer bis zum Stand: der späteste Stand ≤ Ziel (Karten ohne Stand nur ohne andere), sonst keiner */
export function spaetesteBis<T>(l: T[], stand: (x: T) => SprechStand | undefined, ziel: SprechStand | undefined, baende: Baende): T[] {
  const passend = l.filter((x) => standBis(stand(x), ziel, baende))
  const mit = passend.filter((x) => stand(x)).sort((a, b) => nachStand(stand(b), stand(a), baende))
  return [...mit, ...passend.filter((x) => !stand(x))]
}

/**
 * Abschnitte des Buchs für „Ganzes Lehrwerk füllen" (21.10.2026): die Lehrbuch-Abschnitte (Check-in … Check-out, bei
 * Transition die Topic-Abschnitte) – keine Wortlisten, Übungslisten oder Wortfelder
 */
const TOPIC_ABSCHNITTE = ['Introduction', 'Spot on facts', 'Spot on skills', 'Spot on language', 'Texts A', 'Texts B', 'Texts C', 'Topic task']
const istBuchAbschnitt = (name: string): boolean => ABSCHNITT_FOLGE.includes(name) || TOPIC_ABSCHNITTE.includes(name)
export function buchAbschnitte(band: Pick<TextbookMeta, 'units'>): { unit: string; abschnitt: string }[] {
  return band.units.flatMap((u) => u.sections.filter((s) => istBuchAbschnitt(s.name)).map((s) => ({ unit: u.name, abschnitt: s.name })))
}

/** Soll je Abschnitt und Teil */
export const SOLL_JE_ABSCHNITT: Record<KartenTeil, number> = { interview: 3, monolog: 4, dialog: 4 }
const TEIL_FOLGE: KartenTeil[] = ['interview', 'monolog', 'dialog']

export interface FuellSchritt {
  unit: string
  abschnitt: string
  teil: KartenTeil
  anzahl: number
}

/**
 * Was zum Füllen fehlt: je Buchabschnitt und Teil die Zahl der Karten mit genau diesem Stand, bis zum Soll – volle
 * Abschnitte entfallen, erneutes Drücken legt nichts doppelt an
 */
export function fuellPlan(band: Pick<TextbookMeta, 'name' | 'units'>, pool: { teil: string; stand?: SprechStand }[]): FuellSchritt[] {
  return buchAbschnitte(band).flatMap(({ unit, abschnitt }) =>
    TEIL_FOLGE.map((teil) => {
      const da = pool.filter((p) => p.teil === teil && p.stand?.band === band.name && p.stand.unit === unit && p.stand.abschnitt === abschnitt).length
      return { unit, abschnitt, teil, anzahl: Math.max(0, SOLL_JE_ABSCHNITT[teil] - da) }
    }).filter((s) => s.anzahl > 0)
  )
}

/**
 * Zufällige Kombination für das Prüfungsset (21.10.2026): ein Interview-Set, zwei verschiedene Bildkarten, eine
 * Dialogkarte bis zum Stand – Karten ohne Stand nur, wenn es sonst keine gibt. `zufall` liefert Zahlen in [0, 1).
 */
export function zufallsSet<T extends { id: string; teil: string; stand?: SprechStand }>(
  pool: T[],
  ziel: SprechStand | undefined,
  baende: Baende,
  zufall: () => number = Math.random
): { interview: string | null; monologA: string | null; monologB: string | null; dialog: string | null } {
  const kandidaten = (teil: string): T[] => {
    const bis = pool.filter((p) => p.teil === teil && standBis(p.stand, ziel, baende))
    const mit = bis.filter((p) => p.stand)
    return mit.length ? mit : bis
  }
  const ziehe = (l: T[]): T | undefined => l[Math.min(l.length - 1, Math.floor(zufall() * l.length))]
  const bilder = kandidaten('monolog')
  const a = ziehe(bilder)
  const b = ziehe(bilder.filter((x) => x !== a))
  return {
    interview: ziehe(kandidaten('interview'))?.id ?? null,
    monologA: a?.id ?? null,
    monologB: b?.id ?? null,
    dialog: ziehe(kandidaten('dialog'))?.id ?? null
  }
}

/** Auswahl des Prüfungssets auf den Bereich beschränken (21.10.2026): außerhalb gewählte Karten fallen weg */
export function nurImBereich<K extends string>(wahl: Record<K, string | null>, imBereich: (id: string) => boolean): Record<K, string | null> {
  return Object.fromEntries(Object.entries(wahl).map(([k, id]) => [k, typeof id === 'string' && imBereich(id) ? id : null])) as Record<K, string | null>
}

/** Untergruppe ohne Abschnitt (die ganze Unit) */
export const GANZE_UNIT = 'ganze Unit'

/**
 * Untergruppen je Abschnitt innerhalb einer Gruppe Band › Unit (21.10.2026): in Buchfolge des Bands, „ganze Unit" zuletzt
 * (wie in nachStand – eine ganze Unit gilt als ihr Ende)
 */
export function abschnittGruppen<T>(l: T[], stand: (x: T) => SprechStand | undefined, baende: Baende): StandGruppe<T>[] {
  const aus: StandGruppe<T>[] = []
  for (const x of [...l].sort((a, b) => nachStand(stand(a), stand(b), baende))) {
    const s = stand(x)?.abschnitt ?? GANZE_UNIT
    const g = aus.find((y) => y.schluessel === s)
    if (g) g.eintraege.push(x)
    else aus.push({ schluessel: s, titel: s, eintraege: [x] })
  }
  return aus
}

/**
 * Blättern im Kartenfenster (21.10.2026): Nachbar in der sichtbaren Reihenfolge der Spalte und „3 von 12" – am Anfang
 * und Ende kein Nachbar (kein Umlauf)
 */
export function blaettern(ids: string[], id: string): { nr: number; von: number; zurueck: string | null; weiter: string | null } {
  const i = ids.indexOf(id)
  if (i < 0) return { nr: 0, von: ids.length, zurueck: null, weiter: null }
  return { nr: i + 1, von: ids.length, zurueck: ids[i - 1] ?? null, weiter: ids[i + 1] ?? null }
}

/** Wischgeste auswerten: waagerecht ab `schwelle` px und deutlich mehr als senkrecht – sonst Blättern/Scrollen nicht */
export function wischRichtung(dx: number, dy: number, schwelle = 60): 'zurueck' | 'weiter' | null {
  if (Math.abs(dx) < schwelle || Math.abs(dx) < 2 * Math.abs(dy)) return null
  return dx < 0 ? 'weiter' : 'zurueck'
}
