import { renderToStaticMarkup } from 'react-dom/server'
import { kiMetaTag } from '@shared/kiKennzeichnung'
import type { Worksheet } from '../model/types'
import type { PagePlan } from './paginate'
import { BoardPage } from './BoardView'
import { contextFor, layoutKey, pageInfoFor, SheetPages, zusatzSeiten } from './SheetPages'
import { markiereSeiten } from '../../../shared/export/seitenAuswahl'
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

/** Zählgruppe der Seiten eines Blattes in der Seitenauswahl – Schüler- und Lösungsteil zählen getrennt */
export const seitenGruppe = (sheetId: string, key: boolean): string => `${sheetId}:${key ? 'loesung' : 'blatt'}`

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
      const html = renderToStaticMarkup(
        <SheetPages
          ws={ws}
          sheet={sheet}
          plans={layouts.get(layoutKey(sheet.id, key))}
          info={pageInfoFor(ws, sheet, logo, schoolName, key)}
          context={{ ...contextFor(ws, sheet, key ? 'key' : 'print'), audioAttached: sel.audioAttached }}
        />
      )
      // Seitenmarken für die Seitenauswahl (shared/export/seitenAuswahl.ts): je Blatt und Teil eine Zählung
      const zusatz = zusatzSeiten(ws, sheet, key)
      parts.push(
        markiereSeiten(html, (i, n) => {
          const art = i >= n - zusatz.length ? zusatz[i - (n - zusatz.length)] : undefined
          const teil = key ? 'loesung' : art === 'hilfsblatt' || art === 'hilfekarten' ? 'material' : 'blatt'
          return { teil, gruppe: seitenGruppe(sheet.id, key), index: i + 1, ...(art ? { art } : {}) }
        })
      )
    }
  }
  // Das Deckblatt ist Seite 0 und steht vor allem anderen – aber nicht vor einem reinen Lösungsdruck
  if (ws.meta.coverPage && !sel.keyOnly) {
    /*
      EINZELNE Seiten, nicht ganze Blätter (gemeldet am 24.09.2026). Seit Paket 11 dieselben
      Seiten in derselben Lage wie im Editor – auch Lösungen, Hilfekarten und Tafelbild.
    */
    parts.push(
      markiereSeiten(renderToStaticMarkup(<CoverPage ws={ws} vorschau={deckblattVorschau(ws, layouts, logo, schoolName)} />), () => ({
        teil: 'deckblatt',
        gruppe: 'deckblatt'
      }))
    )
  }
  if (!sel.keyOnly) render(false)
  if (sel.includeKey || sel.keyOnly) render(true)
  if (sel.includeBoard) {
    // Je gewähltem Tafelformat eine eigene Seite
    boardList(ws).forEach((board, b) => {
      const html = renderToStaticMarkup(<BoardPage board={board} meta={ws.meta} accent={druckAkzent(ws)} fontFamily={ws.design.page.fontFamily} />)
      parts.push(markiereSeiten(html, () => ({ teil: 'tafel', gruppe: 'tafel', index: b + 1 })))
    })
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
