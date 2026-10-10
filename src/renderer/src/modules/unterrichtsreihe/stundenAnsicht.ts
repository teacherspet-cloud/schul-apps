/**
 * Stundenansicht der Reihe (08.10.2026, Plan „Übersicht" B3): Zeitstrahl je Stunde („Stunde 3 · Doppelstunde ·
 * 90 min") mit den Schritten darin, Teile als dünne Zwischenüberschriften. Schritte ohne (gültige) Stunde stehen unter
 * „Ohne Stunde". Reine Hilfsfunktionen – die Oberfläche steht in ReiheEditor.tsx.
 *
 * Minuten-Summe je Stunde: nur Pflichtschritte – Wahl-, Förder-, Forder- und optionale Schritte laufen neben dem
 * gemeinsamen Weg und würden die Stunde sonst rechnerisch überfüllen.
 */
import { STUNDEN_MINUTEN, teileVon, type Reihe, type Schritt, type StundenArt } from '@shared/reihe'
import { unterrichtsTage, wochentag } from '@shared/schulkalender'

export interface StundenZeile {
  schritt: Schritt
  /** Teil der Reihe (nur angelegte bzw. an Schritten genannte) */
  teil?: string
  /** Hier beginnt ein (anderer) Teil – Zwischenüberschrift zeigen */
  teilWechsel: boolean
}

export interface StundenGruppe {
  /** Index in `Reihe.stunden`; null = ohne Stunde */
  stunde: number | null
  art?: StundenArt
  /** Länge der Stunde in Minuten (ohne Stunde: 0) */
  laenge: number
  /** Geplante Minuten der Pflichtschritte */
  summe: number
  ueberlang: boolean
  zeilen: StundenZeile[]
}

/** Schritte je Stunde in der Reihenfolge der Reihe – alle Stunden (auch leere), dazu „ohne Stunde", wenn nötig */
export function stundenGruppen(r: Pick<Reihe, 'stunden' | 'schritte' | 'teile'>): StundenGruppe[] {
  const stunden = r.stunden ?? []
  const teile = teileVon(r)
  const gruppen: StundenGruppe[] = stunden.map((art, i) => ({ stunde: i, art, laenge: STUNDEN_MINUTEN[art], summe: 0, ueberlang: false, zeilen: [] }))
  const ohne: StundenGruppe = { stunde: null, laenge: 0, summe: 0, ueberlang: false, zeilen: [] }
  for (const s of r.schritte) {
    const g = s.stunde !== undefined && s.stunde >= 0 && s.stunde < stunden.length ? gruppen[s.stunde] : ohne
    const teil = s.abschnitt && teile.includes(s.abschnitt) ? s.abschnitt : undefined
    const vorher = g.zeilen[g.zeilen.length - 1]
    g.zeilen.push({ schritt: s, ...(teil ? { teil } : {}), teilWechsel: Boolean(teil) && (!vorher || vorher.teil !== teil) })
    if (s.rolle === 'pflicht') g.summe += s.minuten ?? 0
  }
  for (const g of gruppen) g.ueberlang = g.summe > g.laenge
  return ohne.zeilen.length ? [...gruppen, ohne] : gruppen
}

/** „Stunde 3 · Mo., 12.10. · Doppelstunde · 90 min" bzw. „Ohne Stunde" (Datum nur mit Stundenterminen) */
export const stundenTitel = (g: Pick<StundenGruppe, 'stunde' | 'art' | 'laenge'>, datum?: string | null): string =>
  g.stunde === null
    ? 'Ohne Stunde'
    : `Stunde ${g.stunde + 1}${datum ? ` · ${datumKurz(datum)}` : ''} · ${g.art === 'doppel' ? 'Doppelstunde' : 'Einzelstunde'} · ${g.laenge} min`

const WOCHENTAGE = ['Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.', 'So.']
/** „Mo., 12.10." */
export const datumKurz = (tag: string): string => `${WOCHENTAGE[wochentag(tag) - 1]}, ${Number(tag.slice(8, 10))}.${Number(tag.slice(5, 7))}.`

/**
 * Datum je Stunde (10.10.2026): aus dem Beginn und den Wochentagen der Reihe, Ferien und Feiertage übersprungen
 * (Schulkalender). Ohne Termine: lauter null.
 */
export function stundenDaten(r: Pick<Reihe, 'stunden' | 'stundenTermine'>): (string | null)[] {
  const n = r.stunden?.length ?? 0
  const t = r.stundenTermine
  const tage = t ? unterrichtsTage(t.beginn, t.tage, n) : []
  return Array.from({ length: n }, (_, i) => tage[i] ?? null)
}

/** Ansicht, die der Editor zeigt: Stunden nur, wenn es ein Stundenraster gibt (Expertenmodus: gewählt) */
export function ansichtFuer(r: Pick<Reihe, 'stunden'>, experte: boolean, gewaehlt: 'stunden' | 'teile' | null): 'stunden' | 'teile' {
  if (!(r.stunden?.length ?? 0)) return 'teile'
  return experte && gewaehlt ? gewaehlt : 'stunden'
}
