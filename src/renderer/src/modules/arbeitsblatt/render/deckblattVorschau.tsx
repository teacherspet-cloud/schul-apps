import type { CitationStyle } from '@shared/types'
import { druckAkzent } from '../../../shared/fachfarben'
import { boardList } from '../didactics/boardDesign'
import type { Worksheet } from '../model/types'
import { BoardPage } from './BoardView'
import type { DeckblattVorschau } from './CoverPage'
import { zerlegeSchluessel } from './deckblatt'
import type { PagePlan } from './paginate'
import { contextFor, deckblattKandidaten, layoutKey, pageInfoFor, SheetPages } from './SheetPages'

/**
 * Die Seiten des Materials für das Deckblatt (Paket 11): Kandidaten und je Schlüssel die echte,
 * verkleinerte Seite – Schülerblatt, Schlussseiten, Lösungen oder Tafelbild.
 *
 * Editor, Druck und Word-Export holen die Vorschauen hier ab. Vorher stand derselbe Aufruf von
 * `SheetPages` zweimal da (EditorStep und printHtml) und rendert jeweils nur Seiten des ersten
 * Blattes.
 */
export function deckblattVorschau(
  ws: Worksheet,
  layouts: Map<string, PagePlan[]>,
  logo: string | null,
  schoolName: string,
  citationStyle?: CitationStyle
): DeckblattVorschau {
  const boards = boardList(ws)
  return {
    kandidaten: deckblattKandidaten(ws, layouts),
    seite: (schluessel) => {
      const z = zerlegeSchluessel(schluessel)
      if (!z) return null
      if ('tafel' in z) {
        const board = boards[z.tafel]
        return board ? <BoardPage board={board} meta={ws.meta} accent={druckAkzent(ws)} fontFamily={ws.design.page.fontFamily} /> : null
      }
      const sheet = ws.sheets.find((s) => s.id === z.sheetId)
      if (!sheet) return null
      return (
        <SheetPages
          ws={ws}
          sheet={sheet}
          plans={layouts.get(layoutKey(sheet.id, z.key))}
          info={pageInfoFor(ws, sheet, logo, schoolName, z.key, citationStyle)}
          context={contextFor(ws, sheet, z.key ? 'key' : 'print')}
          nurSeite={z.index}
        />
      )
    }
  }
}
