/**
 * Wortschatz- und Grammatikstand einer Grammatikform für die Aufgabenbank (29.10.2026, shared/lehrwerkWortschatz.ts):
 * früheste Einführung der Form in einem Lehrwerk mit Wortschatz (Reihe, Band, Unit, Abschnitt) und was dort bekannt ist.
 * Die Bände kommen über window.api.textbooks (PC, Server und Handbetrieb gleich).
 */
import { bekannteGrammatik, bekannterWortschatz, fruehesteEinfuehrung, type Einfuehrung, type GrammatikBand } from '@shared/lehrwerkWortschatz'
import type { Textbook, TextbookMeta } from '@shared/types'
import { LEHRWERK_GRAMMATIK, reiheDesBands } from '../../shared/lehrwerkGrammatik'

export interface WortschatzStand {
  stelle: Einfuehrung
  bekannt: Set<string>
  grammatik: string[]
  /** Jahrgang des Bands der Einführung (Satzbau-Regel für die ersten Lernjahre) */
  jahrgang?: number
}

const cache = new Map<string, Promise<WortschatzStand | null>>()

export function wortschatzStand(schluessel: string, sprache: string): Promise<WortschatzStand | null> {
  const k = `${sprache}|${schluessel}`
  if (!cache.has(k)) cache.set(k, laden(schluessel, sprache).catch(() => null))
  return cache.get(k)!
}

async function laden(schluessel: string, sprache: string): Promise<WortschatzStand | null> {
  const api = (globalThis as unknown as { window?: { api?: { textbooks?: { list: () => Promise<TextbookMeta[]>; get: (id: string) => Promise<Textbook> } } } }).window
    ?.api?.textbooks
  if (!api) return null
  const metas = (await api.list()).filter((m) => m.language === sprache && LEHRWERK_GRAMMATIK[m.name] && !m.platzhalter)
  // Je Reihe die Bände nach Klasse; gewählt wird die Einführung im niedrigsten Jahrgang
  const reihen = new Map<string, TextbookMeta[]>()
  for (const m of metas) reihen.set(m.reihe || reiheDesBands(m.name), [...(reihen.get(m.reihe || reiheDesBands(m.name)) ?? []), m])
  let best: { stelle: Einfuehrung; baende: TextbookMeta[]; grade: number } | null = null
  for (const baende0 of reihen.values()) {
    const baende = [...baende0].sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99))
    const stelle = fruehesteEinfuehrung(
      schluessel,
      baende.map((b) => ({ name: b.name, grammatik: LEHRWERK_GRAMMATIK[b.name] as unknown as GrammatikBand }))
    )
    if (!stelle) continue
    const grade = baende.find((b) => b.name === stelle.buch)?.grade ?? 99
    if (!best || grade < best.grade) best = { stelle, baende, grade }
  }
  if (!best) return null
  const bis = best.baende.findIndex((b) => b.name === best!.stelle.buch)
  const voll = await Promise.all(best.baende.slice(0, bis + 1).map((b) => api.get(b.id)))
  const g = best.baende.slice(0, bis + 1).map((b) => ({ name: b.name, grammatik: LEHRWERK_GRAMMATIK[b.name] as unknown as GrammatikBand }))
  return {
    stelle: best.stelle,
    bekannt: bekannterWortschatz(
      voll.map((b) => ({ name: b.name, grade: b.grade, units: b.units.map((u) => ({ name: u.name, sections: u.sections.map((s) => ({ name: s.name, entries: s.entries })) })) })),
      best.stelle
    ),
    grammatik: bekannteGrammatik(g, best.stelle),
    ...(best.grade < 99 ? { jahrgang: best.grade } : {})
  }
}
