import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MeasuredItem, PagePlan, paginate, paginateSpread } from '../../../shared/render/paginate'
import type { PageLimit, TestDocument } from '../model/types'
import { RenderContext } from './RenderContext'
import { BlockView, PageLayout, SPLITTABLE_KINDS, TestHeader } from './TestPage'

const PX_PER_MM = 96 / 25.4
const PAGE_HEIGHT_MM = 297
/** Platz unten für Seitenzahl und Bildnachweis sowie ein kleiner Sicherheitsabstand für Druck/PDF */
const FOOTER_RESERVE_MM = 3
const MIN_FONT_PT = 10

export interface TestLayouts {
  /** Schülerblätter je Variante */
  student: Map<string, PageLayout>
  /** Lösungsblätter je Variante (gleiche Schriftgröße) */
  key: Map<string, PageLayout>
  /** Höchste Seitenzahl eines Schülerblatts */
  pageCount: number
  limit: PageLimit
  /** Vorgabe zur Seitenzahl eingehalten */
  fits: boolean
  /** Schrift oder Abstände wurden für die Vorgabe verkleinert */
  shrunk: boolean
}

interface Candidate {
  fontSize: number
  compact: boolean
}

export const DEFAULT_PAGE_LIMIT: PageLimit = { mode: 'auto', pages: 2 }

export function pageLimitOf(doc: TestDocument): PageLimit {
  return doc.settings.pageLimit ?? DEFAULT_PAGE_LIMIT
}

/** Untergrenze einer Spanne – fehlt sie oder ist sie zu groß, gilt eine Seite weniger als die Obergrenze */
export function pageLimitMin(limit: PageLimit): number {
  if (limit.mode === 'exact') return limit.pages
  if (limit.mode !== 'range') return 1
  const min = Math.round(limit.pagesMin ?? 0)
  return min >= 1 && min <= limit.pages ? min : Math.max(1, limit.pages - 1)
}

/** „höchstens 2 Seiten", „genau 1 Seite", „2–3 Seiten" – für Hinweise und die Zusammenfassung */
export function pageLimitText(limit: PageLimit): string {
  const n = limit.pages
  if (limit.mode === 'range') return `${pageLimitMin(limit)}–${n} Seiten`
  return `${limit.mode === 'exact' ? 'genau' : 'höchstens'} ${n} ${n === 1 ? 'Seite' : 'Seiten'}`
}

/** Hält ein fertiges Layout die Vorgabe ein? */
export function pageLimitFits(limit: PageLimit, pageCounts: number[]): boolean {
  if (limit.mode === 'auto') return true
  if (limit.mode === 'max') return pageCounts.every((n) => n <= limit.pages)
  if (limit.mode === 'exact') return pageCounts.every((n) => n === limit.pages)
  return pageCounts.every((n) => n >= pageLimitMin(limit) && n <= limit.pages)
}

/** Reihenfolge der Versuche: erst normale Darstellung, dann engere Abstände, dann schrittweise kleinere Schrift. */
function candidatesFor(doc: TestDocument): Candidate[] {
  const base = doc.fontSize
  const list: Candidate[] = [{ fontSize: base, compact: false }]
  if (pageLimitOf(doc).mode === 'auto') return list
  list.push({ fontSize: base, compact: true })
  for (let f = base - 0.5; f >= Math.min(MIN_FONT_PT, base); f -= 0.5) list.push({ fontSize: f, compact: true })
  return list
}

/**
 * Misst den Test unsichtbar im Browser und verteilt die Aufgaben auf A4-Seiten.
 * Mit einer Seitenvorgabe werden Abstände und Schrift so weit verkleinert, bis der Test passt;
 * bei „genau N Seiten" wird der Inhalt zusätzlich gleichmäßig auf N Seiten verteilt.
 */
export function useTestLayout(doc: TestDocument | null): { layouts: TestLayouts | null; measure: React.ReactNode } {
  const ref = useRef<HTMLDivElement>(null)
  const [trial, setTrial] = useState<{ doc: TestDocument | null; index: number }>({ doc: null, index: 0 })
  const [layouts, setLayouts] = useState<TestLayouts | null>(null)
  // Neu messen, wenn Bilder geladen sind oder das Programm sichtbar wird (ausgeblendet ist alles 0 px hoch)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    let last = root.getBoundingClientRect().width
    const observer = new ResizeObserver(() => {
      const width = root.getBoundingClientRect().width
      if (width !== last) {
        last = width
        setTick((t) => t + 1)
      }
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [doc])

  const index = trial.doc === doc ? trial.index : 0
  const candidates = doc ? candidatesFor(doc) : []
  const candidate = candidates[Math.min(index, candidates.length - 1)]

  useLayoutEffect(() => {
    const root = ref.current
    if (!root || !doc || !candidate) return
    // Unsichtbar (Programm nicht geöffnet): später messen
    if (root.getBoundingClientRect().width === 0) return
    const limit = pageLimitOf(doc)

    const measureVariant = (variantId: string, key: boolean): { items: MeasuredItem[]; first: number; other: number } | null => {
      const page = root.querySelector<HTMLElement>(`[data-layout="${variantId}-${key ? 'key' : 'student'}"]`)
      if (!page) return null
      const style = getComputedStyle(page)
      const inner = PAGE_HEIGHT_MM * PX_PER_MM - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0) - FOOTER_RESERVE_MM * PX_PER_MM
      const header = page.querySelector<HTMLElement>('[data-measure-header]')?.getBoundingClientRect().height ?? 0
      // Hinweis „Aufgabe N (Fortsetzung)" auf jedem Folgestück (01.10.2026) – mit dem Abstand darunter
      const probe = page.querySelector<HTMLElement>('[data-continued-probe]')
      const fortsetzung = probe ? probe.getBoundingClientRect().height + (parseFloat(getComputedStyle(probe).marginBottom) || 0) : 0
      const variant = doc.variants.find((v) => v.id === variantId)
      const items: MeasuredItem[] = []
      page.querySelectorAll<HTMLElement>('[data-measure-block]').forEach((wrap) => {
        const id = wrap.dataset.measureBlock!
        const height = wrap.getBoundingClientRect().height
        const block = variant?.blocks.find((b) => b.id === id)
        const unitEls = Array.from(wrap.querySelectorAll<HTMLElement>('[data-unit]'))
        if (block && SPLITTABLE_KINDS.has(block.kind) && unitEls.length > 1) {
          const units = unitEls.map((u) => u.getBoundingClientRect().height + (parseFloat(getComputedStyle(u).marginBottom) || 0))
          const unitSum = units.reduce((a, b) => a + b, 0)
          items.push({ id, height, headHeight: Math.max(0, height - unitSum), units, continuedHead: fortsetzung })
        } else {
          items.push({ id, height })
        }
      })
      return { items, first: inner - header, other: inner }
    }

    const student = new Map<string, PageLayout>()
    const keyLayouts = new Map<string, PageLayout>()
    let tooLong = false
    const measured = new Map<string, { items: MeasuredItem[]; first: number; other: number }>()
    for (const v of doc.variants) {
      const m = measureVariant(v.id, false)
      if (!m) return
      measured.set(v.id, m)
      const pages = paginate(m.items, m.first, m.other)
      if (limit.mode !== 'auto' && pages.length > limit.pages) tooLong = true
      student.set(v.id, { ...candidate, pages })
    }
    // Nächsten, kompakteren Versuch messen
    if (tooLong && index < candidates.length - 1) {
      setTrial({ doc, index: index + 1 })
      return
    }
    /*
     * „genau N": auf N Seiten verteilen. „von–bis": Passt der Test auf weniger Seiten als die
     * Untergrenze, auf die Untergrenze verteilen – mehr als nötig wird nie gestreckt.
     */
    if (limit.mode === 'exact' || limit.mode === 'range') {
      const ziel = pageLimitMin(limit)
      for (const v of doc.variants) {
        if (limit.mode === 'range' && student.get(v.id)!.pages.length >= ziel) continue
        const m = measured.get(v.id)!
        const spread: PagePlan[] | null = paginateSpread(m.items, m.first, m.other, ziel)
        if (spread) student.set(v.id, { ...candidate, pages: spread })
      }
    }
    for (const v of doc.variants) {
      const m = measureVariant(v.id, true)
      if (m) keyLayouts.set(v.id, { ...candidate, pages: paginate(m.items, m.first, m.other) })
    }
    const pageCount = Math.max(...[...student.values()].map((l) => l.pages.length), 1)
    const fits = pageLimitFits(
      limit,
      [...student.values()].map((l) => l.pages.length)
    )
    setLayouts({ student, key: keyLayouts, pageCount, limit, fits, shrunk: index > 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, index, tick])

  const measure =
    doc && candidate ? (
      <div className="vt-measure" ref={ref} aria-hidden onLoadCapture={() => setTick((n) => n + 1)}>
        {doc.variants.flatMap((v, vi) =>
          [false, true].map((key) => (
            <RenderContext.Provider key={`${v.id}-${key}`} value={{ mode: key ? 'key' : 'print' }}>
              <div
                data-layout={`${v.id}-${key ? 'key' : 'student'}`}
                className={`vt-page ${key ? 'vt-key' : ''} ${candidate.compact ? 'vt-compact' : ''}`}
                style={{ fontSize: `${candidate.fontSize}pt` }}
              >
                {/* Einmal je Fassung gemessen: der Fortsetzungshinweis – außerhalb des Flusses */}
                <section className="vt-block vt-block-continued" style={{ position: 'absolute', visibility: 'hidden', left: 0, right: 0 }} aria-hidden>
                  <div className="vt-continued" data-continued-probe>
                    Aufgabe 1 (Fortsetzung)
                  </div>
                </section>
                <div data-measure-header style={{ display: 'flow-root' }}>
                  <TestHeader doc={doc} variant={doc.variants[vi]} />
                </div>
                {v.blocks.map((b, bi) => (
                  <div key={b.id} data-measure-block={b.id} style={{ display: 'flow-root' }}>
                    <BlockView block={b} number={bi + 1} lang={doc.settings.targetLanguage} />
                  </div>
                ))}
              </div>
            </RenderContext.Provider>
          ))
        )}
      </div>
    ) : null

  return { layouts, measure }
}
