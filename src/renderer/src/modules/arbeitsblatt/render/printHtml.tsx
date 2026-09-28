import { renderToStaticMarkup } from 'react-dom/server'
import { kiMetaTag } from '@shared/kiKennzeichnung'
import type { Worksheet } from '../model/types'
import type { PagePlan } from './paginate'
import { BoardPage } from './BoardView'
import { contextFor, layoutKey, pageInfoFor, SheetPages } from './SheetPages'
import { deckblattVorschau } from './deckblattVorschau'
import wsCss from './ws.css?raw'
import { boardList } from '../didactics/boardDesign'
import { CoverPage } from './CoverPage'
import { druckAkzent } from '../../../shared/fachfarben'

export interface WorksheetPrintSelection {
  sheetIds: string[]
  includeKey: boolean
  keyOnly?: boolean
  /** Tafelbild-Seite für die Lehrkraft anhängen */
  includeBoard?: boolean
  /**
   * Die Hörtexte liegen als Dateianlage im PDF.
   *
   * Nur dann erscheint der Hinweis am Hörtext. Auf einem AUSDRUCK wäre der Satz „als Anhang
   * in diesem PDF enthalten" schlicht falsch – deshalb hängt er an dieser Angabe und nicht
   * am Vorhandensein einer Audiodatei.
   */
  audioAttached?: boolean
}

/** Vollständiges HTML aller gewählten Seiten für Druck und PDF (identisch mit der Editor-Ansicht). */
export function buildWorksheetHtml(
  ws: Worksheet,
  layouts: Map<string, PagePlan[]>,
  sel: WorksheetPrintSelection,
  logo: string | null,
  schoolName: string
): string {
  const sheets = ws.sheets.filter((s) => sel.sheetIds.includes(s.id))
  const parts: string[] = []
  const render = (key: boolean): void => {
    for (const sheet of sheets) {
      parts.push(
        renderToStaticMarkup(
          <SheetPages
            ws={ws}
            sheet={sheet}
            plans={layouts.get(layoutKey(sheet.id, key))}
            info={pageInfoFor(ws, sheet, logo, schoolName, key)}
            context={{ ...contextFor(ws, sheet, key ? 'key' : 'print'), audioAttached: sel.audioAttached }}
          />
        )
      )
    }
  }
  // Das Deckblatt ist Seite 0 und steht vor allem anderen – aber nicht vor einem reinen Lösungsdruck
  if (ws.meta.coverPage && !sel.keyOnly) {
    /*
      EINZELNE Seiten, nicht ganze Blätter (gemeldet am 24.09.2026). Seit Paket 11 dieselben
      Seiten in derselben Lage wie im Editor – auch Lösungen, Hilfekarten und Tafelbild.
    */
    parts.push(renderToStaticMarkup(<CoverPage ws={ws} vorschau={deckblattVorschau(ws, layouts, logo, schoolName)} />))
  }
  if (!sel.keyOnly) render(false)
  if (sel.includeKey || sel.keyOnly) render(true)
  if (sel.includeBoard) {
    // Je gewähltem Tafelformat eine eigene Seite
    for (const board of boardList(ws)) {
      parts.push(renderToStaticMarkup(<BoardPage board={board} meta={ws.meta} accent={druckAkzent(ws)} fontFamily={ws.design.page.fontFamily} />))
    }
  }

  const title = (ws.meta.title || ws.meta.topic).replace(/[&<>"]/g, '')
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>${title}</title>${kiMetaTag(ws.meta.ki)}
<style>
html, body { margin: 0; padding: 0; background: #fff; }
.ws-page { page-break-after: always; break-after: page; }
.ws-page:last-child { page-break-after: auto; break-after: auto; }
${wsCss}
</style></head><body>${parts.join('\n')}</body></html>`
}
