/**
 * Kursseite im Sprachenlernen (08.10.2026, abgestimmt mit der Lehrkraft): reine Helfer für die zugeklappten Kästen –
 * Kurzinfo im Kopf des Kastens „Vokabeln" und die Grammatik nach Schuljahren (wie im Ordner der Lernenden: das neueste
 * Jahr oben, nur Jahre mit Inhalt, ohne bekannten Jahrgang ganz unten; die Reihenfolge der Tabelle bleibt im Jahr).
 */
import type { JahrgangsGruppe } from '../regal/grammatikJahrgaenge'
import { bandRang } from '@shared/lehrwerkBand'

/** „20.12." – Tag und Monat, zweistellig */
export const tagMonat = (ms: number): string => {
  const d = new Date(ms)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`
}

/** Kurzinfo im Kopf des Kastens „Vokabeln", etwa „120 Wörter · 10 pro Tag · bis 20.12. · Test 14.11." */
export function vokabelKurzinfo(k: { anzahl: number; tagesziel?: number; bis: number | null; testTermin: number | null }): string {
  if (!k.anzahl) return 'noch keine Vokabeln'
  return [
    `${k.anzahl} ${k.anzahl === 1 ? 'Wort' : 'Wörter'}`,
    `${k.tagesziel ?? 10} pro Tag`,
    k.bis ? `bis ${tagMonat(k.bis)}` : '',
    k.testTermin ? `Test ${tagMonat(k.testTermin)}` : ''
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Zeilen nach Schuljahr gruppieren: Jahre absteigend, null (ohne Jahrgang) zuletzt; die Reihenfolge innerhalb eines
 * Jahres bleibt wie übergeben (die Tabelle sortiert vorher).
 */
export function nachJahrGruppiert<T>(zeilen: T[], jahrVon: (t: T) => number | null | undefined): JahrgangsGruppe<T>[] {
  const gruppen = new Map<number | null, T[]>()
  for (const z of zeilen) {
    const j = jahrVon(z)
    const k = typeof j === 'number' && Number.isFinite(j) ? j : null
    gruppen.set(k, [...(gruppen.get(k) ?? []), z])
  }
  return [...gruppen.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : b - a))
    .map(([jahrgang, eintraege]) => ({ jahrgang, eintraege }))
}

/** Suche über mehrere Texte (Titel, Thema, Regeln): alle Wörter der Suche müssen vorkommen, ohne Groß/klein */
export function passtSuche(texte: (string | undefined)[], suche: string): boolean {
  const woerter = suche.toLowerCase().split(/\s+/).filter(Boolean)
  if (!woerter.length) return true
  const alles = texte.filter(Boolean).join(' ').toLowerCase()
  return woerter.every((w) => alles.includes(w))
}

/** Gruppe der Kurs-Grammatik: Band und Unit (Lehrwerk bekannt) oder Schuljahr */
export interface KursGruppe<T> {
  /** Schlüssel für „offen/zu" („b:Green Line 6|Unit 2", „j:7", „j:ohne") */
  schluessel: string
  buch?: string
  unit?: string
  jahrgang: number | null
  eintraege: T[]
}

/**
 * Grammatik nach Lehrwerk gliedern (09.10.2026, Wunsch der Lehrkraft): wo Band und Unit bekannt sind, je Band und Unit –
 * neuester Band oben, im Band die spätere Unit oben (Reihenfolge `unitFolge`, sonst nach Nummer), Band ohne Unit unter
 * seinen Units. Ohne Lehrwerk wie bisher nach Schuljahr (neuestes oben, ohne Jahrgang ganz unten), unter den Bänden.
 * Die Reihenfolge innerhalb einer Gruppe bleibt wie übergeben (die Tabelle sortiert vorher).
 */
export function nachLehrwerkGruppiert<T>(
  zeilen: T[],
  stelleVon: (t: T) => { buch?: string; unit?: string } | null | undefined,
  jahrVon: (t: T) => number | null | undefined,
  unitFolge: (buch: string) => string[] = () => []
): KursGruppe<T>[] {
  const gruppen = new Map<string, KursGruppe<T>>()
  for (const z of zeilen) {
    const s = stelleVon(z)
    const j = jahrVon(z)
    const jahrgang = typeof j === 'number' && Number.isFinite(j) ? j : null
    const schluessel = s?.buch ? `b:${s.buch}|${s.unit ?? ''}` : `j:${jahrgang ?? 'ohne'}`
    const g = gruppen.get(schluessel) ?? { schluessel, ...(s?.buch ? { buch: s.buch, ...(s.unit ? { unit: s.unit } : {}) } : {}), jahrgang, eintraege: [] }
    g.eintraege.push(z)
    gruppen.set(schluessel, g)
  }
  const unitRang = (g: KursGruppe<T>): number => {
    if (!g.unit) return -1
    const i = unitFolge(g.buch ?? '').indexOf(g.unit)
    if (i >= 0) return 1000 + i
    const n = /(\d+)\s*$/.exec(g.unit)
    return n ? 500 + Number(n[1]) : 0
  }
  return [...gruppen.values()].sort((a, b) => {
    if (a.buch && b.buch)
      return bandRang(b.buch) - bandRang(a.buch) || (a.buch === b.buch ? unitRang(b) - unitRang(a) : a.buch.localeCompare(b.buch, 'de'))
    if (a.buch || b.buch) return a.buch ? -1 : 1
    return a.jahrgang === null ? 1 : b.jahrgang === null ? -1 : b.jahrgang - a.jahrgang
  })
}
