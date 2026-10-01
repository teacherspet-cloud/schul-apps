import type { SeitenMarke } from '../../../shared/export/seitenAuswahl'
import type { Worksheet } from '../model/types'
import type { PagePlan } from '../render/paginate'
import { layoutKey } from '../render/SheetPages'
import { buildWorksheetHtml, type WorksheetPrintSelection } from '../render/printHtml'
import type { SeitenQuelle } from '../../../shared/export/ausgabe'

/**
 * Seitenauswahl im Word-Export (01.10.2026).
 *
 * Word bricht selbst um – „Seite 6" der Vorschau gibt es in Word so nicht. Ausgegeben wird deshalb,
 * was auf den gewählten Seiten STEHT: die Bausteine dieser Seiten (aus der Seitenaufteilung des
 * Editors), die gewählten Schlussseiten (Hilfekarten, Bildnachweise, Notenschlüssel), Deckblatt und
 * Tafelbild. Seitenzahlen setzt Word als Feld – sie zählen damit von selbst nur die Auswahl.
 *
 * Grenzen: Ein Baustein, der über zwei Seiten läuft, kommt ganz mit, sobald eine seiner Seiten
 * gewählt ist. Wo Word umbricht, bestimmt Word.
 */
export interface WordSeitenAuswahl {
  deckblatt: boolean
  /** Tafelbild-Seiten (1-basiert, in der Reihenfolge von boardList) */
  tafeln: Set<number>
  /** Je Zählgruppe (printHtml.tsx, `seitenGruppe`): Bausteine und Schlussseiten */
  blaetter: Map<string, { bausteine: Set<string>; zusatz: Set<string> }>
}

/** Aus den Marken der gewählten Seiten (Druck-HTML derselben Auswahl) die Inhalte für Word */
export function wordAuswahl(ws: Worksheet, layouts: Map<string, PagePlan[]>, marken: SeitenMarke[]): WordSeitenAuswahl {
  const aus: WordSeitenAuswahl = { deckblatt: false, tafeln: new Set(), blaetter: new Map() }
  for (const m of marken) {
    if (m.teil === 'deckblatt') {
      aus.deckblatt = true
      continue
    }
    if (m.teil === 'tafel') {
      aus.tafeln.add(m.index ?? 1)
      continue
    }
    const gruppe = m.gruppe ?? ''
    const trenn = gruppe.lastIndexOf(':')
    if (trenn < 0) continue
    const sheetId = gruppe.slice(0, trenn)
    const key = gruppe.slice(trenn + 1) === 'loesung'
    const sheet = ws.sheets.find((s) => s.id === sheetId)
    if (!sheet) continue
    const eintrag = aus.blaetter.get(gruppe) ?? { bausteine: new Set<string>(), zusatz: new Set<string>() }
    aus.blaetter.set(gruppe, eintrag)
    if (m.art) {
      eintrag.zusatz.add(m.art)
      continue
    }
    const plans = layouts.get(layoutKey(sheetId, key))
    const seite = m.index ?? 1
    if (!plans?.length) {
      // Ohne gemessene Aufteilung: das ganze Blatt
      for (const b of sheet.blocks) eintrag.bausteine.add(b.id)
      continue
    }
    for (const item of plans[seite - 1]?.items ?? []) eintrag.bausteine.add(item.id)
    // Frei platzierte Bausteine stehen auf ihrer Seite (gibt es sie nicht mehr, auf der letzten)
    for (const b of sheet.blocks) if (b.free && Math.min(b.free.page, plans.length) === seite) eintrag.bausteine.add(b.id)
  }
  return aus
}

/**
 * Seitenquelle für eine Word-Datei (shared/export/ausgabe.tsx): Gewählt wird an den Seiten des
 * Druck-HTML mit DERSELBEN Auswahl (Blätter, Lösungen, Tafelbild); `bauen` erzeugt die Datei
 * dann nur aus den Inhalten dieser Seiten.
 */
export function wordSeitenQuelle(
  ws: Worksheet,
  layouts: Map<string, PagePlan[]>,
  sel: WorksheetPrintSelection,
  logo: string | null,
  schoolName: string,
  bauen: (seiten: WordSeitenAuswahl) => Promise<Uint8Array>
): SeitenQuelle {
  return {
    html: () => buildWorksheetHtml(ws, layouts, sel, logo, schoolName),
    mitAuswahl: (_seiten, marken) => bauen(wordAuswahl(ws, layouts, marken))
  }
}
