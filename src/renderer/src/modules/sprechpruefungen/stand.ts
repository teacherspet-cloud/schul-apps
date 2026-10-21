/**
 * Reihenfolge der Sprechkarten nach ihrem Lehrwerk-Stand (21.10.2026, Wunsch der Lehrkraft: nachvollziehbar, bis zu
 * welchem Abschnitt ein Aufgabenpool reicht – Ansichten und Auswahl danach sortiert). Buchfolge: Band (bandRang), dann
 * Units und Abschnitte in der Reihenfolge des Bandes; eine ganze Unit steht hinter ihren Abschnitten, Karten ohne
 * Stand zuletzt. Rein rechnend, für Tests.
 */
import type { TextbookMeta } from '@shared/types'
import type { SprechStand } from '@shared/sprechen/karten'
import { bandRang } from '@shared/lehrwerkBand'

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
