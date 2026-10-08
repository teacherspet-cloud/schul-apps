/**
 * Kursseite im Sprachenlernen (08.10.2026, abgestimmt mit der Lehrkraft): reine Helfer für die zugeklappten Kästen –
 * Kurzinfo im Kopf des Kastens „Vokabeln" und die Grammatik nach Schuljahren (wie im Ordner der Lernenden: das neueste
 * Jahr oben, nur Jahre mit Inhalt, ohne bekannten Jahrgang ganz unten; die Reihenfolge der Tabelle bleibt im Jahr).
 */
import type { JahrgangsGruppe } from '../regal/grammatikJahrgaenge'

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
