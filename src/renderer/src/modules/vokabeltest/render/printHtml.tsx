import { renderToStaticMarkup } from 'react-dom/server'
import { kiMetaTag } from '@shared/kiKennzeichnung'
import type { ImageRef, TestDocument } from '../model/types'
import { RenderContext } from './RenderContext'
import testCss from './test.css?raw'
import { TestPage } from './TestPage'
import type { TestLayouts } from './useTestLayout'

export interface PrintSelection {
  variantIds: string[]
  /** Lösungsseiten anhängen */
  includeKey: boolean
  /** Nur Lösungen */
  keyOnly?: boolean
}

export function imageCredits(doc: TestDocument): string[] {
  const credits = new Set<string>()
  for (const v of doc.variants) {
    for (const b of v.blocks) {
      if (b.kind !== 'picture') continue
      for (const it of b.items) {
        const c = creditFor(it.image)
        if (c) credits.add(c)
      }
    }
  }
  return [...credits]
}

function creditFor(img?: ImageRef): string | undefined {
  if (!img) return undefined
  if (img.source === 'openmoji') return 'Piktogramme: OpenMoji (openmoji.org), CC BY-SA 4.0'
  return img.credit
}

/**
 * Erzeugt ein vollständiges HTML-Dokument für Druck und PDF-Export.
 * Mit `layouts` (aus der Editor-Ansicht) entstehen exakt die gleichen A4-Seiten wie im Editor.
 */
export function buildPrintHtml(doc: TestDocument, sel: PrintSelection, layouts?: TestLayouts | null): string {
  const variants = doc.variants.filter((v) => sel.variantIds.includes(v.id))
  const credits = imageCredits(doc)
  const pages: string[] = []
  const footer = credits.length ? <div className="vt-footer-credits">{credits.join(' · ')}</div> : null

  const render = (mode: 'print' | 'key'): void => {
    for (const v of variants) {
      const layout = (mode === 'key' ? layouts?.key : layouts?.student)?.get(v.id)
      pages.push(
        renderToStaticMarkup(
          <RenderContext.Provider value={{ mode, language: doc.settings.targetLanguage }}>
            <TestPage doc={doc} variant={v} layout={layout} footer={footer} />
          </RenderContext.Provider>
        )
      )
    }
  }
  if (!sel.keyOnly) render('print')
  if (sel.includeKey || sel.keyOnly) render('key')
  const withCredits = pages

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(doc.header.title)}</title>${kiMetaTag(doc.ki)}
<style>
html, body { margin: 0; padding: 0; background: #fff; }
.vt-page { page-break-after: always; break-after: page; min-height: auto; }
.vt-page:last-child { page-break-after: auto; break-after: auto; }
${testCss}
</style></head><body>${withCredits.join('\n')}</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
