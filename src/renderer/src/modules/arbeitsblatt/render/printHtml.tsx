import { renderToStaticMarkup } from 'react-dom/server'
import type { Worksheet } from '../model/types'
import type { PagePlan } from './paginate'
import { BoardPage } from './BoardView'
import { contextFor, layoutKey, pageInfoFor, SheetPages, vorschauSeiten } from './SheetPages'
import wsCss from './ws.css?raw'
import { boardList } from '../didactics/boardDesign'
import { CoverPage } from './CoverPage'

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
    parts.push(
      renderToStaticMarkup(
        <CoverPage
          ws={ws}
          /*
            EINZELNE Seiten, nicht ganze Blätter. Vorher rendert jede Vorschau ein komplettes
            Blatt – auf dem Deckblatt standen dadurch alle Seiten untereinander in einem
            einzigen Daumennagel (gemeldet am 24.09.2026).
          */
          previews={vorschauSeiten((layouts.get(layoutKey(sheets[0].id, false)) ?? []).length).map((i) => (
            <SheetPages
              key={i}
              ws={ws}
              sheet={sheets[0]}
              plans={[(layouts.get(layoutKey(sheets[0].id, false)) ?? [])[i]]}
              info={pageInfoFor(ws, sheets[0], logo, schoolName, false)}
              context={contextFor(ws, sheets[0], 'print')}
            />
          ))}
        />
      )
    )
  }
  if (!sel.keyOnly) render(false)
  if (sel.includeKey || sel.keyOnly) render(true)
  if (sel.includeBoard) {
    // Je gewähltem Tafelformat eine eigene Seite
    for (const board of boardList(ws)) {
      parts.push(renderToStaticMarkup(<BoardPage board={board} meta={ws.meta} accent={ws.design.page.accentColor} fontFamily={ws.design.page.fontFamily} />))
    }
  }

  const title = (ws.meta.title || ws.meta.topic).replace(/[&<>"]/g, '')
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>${title}</title>
<style>
html, body { margin: 0; padding: 0; background: #fff; }
.ws-page { page-break-after: always; break-after: page; }
.ws-page:last-child { page-break-after: auto; break-after: auto; }
${wsCss}
</style></head><body>${parts.join('\n')}</body></html>`
}
