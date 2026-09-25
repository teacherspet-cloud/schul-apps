import type { Worksheet } from '../model/types'
import type { PagePlan } from '../render/paginate'
import { buildWorksheetHtml } from '../render/printHtml'
import { buildWorksheetDocx } from './docx'
import { browserDocxDeps } from './browserDeps'
import { speichereAusgabe, WORD_FILTER, type AusgabeDatei } from '../../../shared/export/ausgabe'
import type { LoesungsModus } from '../../../shared/components/LoesungsWahl'

/**
 * Word, PDF und Druck für die Programme, die ihr Blatt als Arbeitsblatt darstellen
 * (Lernzielkontrolle, Grammatiktest, Klassenarbeit).
 *
 * Anlass (25.09.2026): Die drei riefen je eigene Export-Zeilen auf und hängten Lösungen immer
 * an, sobald sie eingeschaltet waren. Jetzt ein Weg für alle drei mit der Lösungswahl aus
 * shared/components/LoesungsWahl – eine Korrektur hier gilt für alle drei zugleich.
 */
export interface BlattQuelle {
  ws: Worksheet
  layouts: Map<string, PagePlan[]>
  sheetIds: string[]
  /** Dateiname ohne Endung */
  name: string
  logo: string | null
  schoolName: string
  /** „Lösungen" oder – bei der Klassenarbeit – „Erwartungshorizont" */
  begriff: string
}

const html = (q: BlattQuelle, teil: 'blatt' | 'loesung', anhaengen: boolean): string =>
  buildWorksheetHtml(
    q.ws,
    q.layouts,
    teil === 'loesung' ? { sheetIds: q.sheetIds, includeKey: false, keyOnly: true } : { sheetIds: q.sheetIds, includeKey: anhaengen },
    q.logo,
    q.schoolName
  )

/** Für die Druckvorschau: das Blatt und – bei „separat drucken" – die Lösungen als eigener Auftrag */
export function druckAusgabe(q: BlattQuelle, loesung: LoesungsModus): { html: string; loesung: { html: string; titel: string } | null } {
  return {
    html: html(q, 'blatt', loesung === 'append'),
    loesung: loesung === 'separate' ? { html: html(q, 'loesung', false), titel: q.begriff } : null
  }
}

/** Word oder PDF speichern; bei „als eigene Datei" zwei Dateien (einmal Ordner wählen). */
export function speichereBlatt(q: BlattQuelle, art: 'docx' | 'pdf', loesung: LoesungsModus): Promise<number> {
  const dateien: AusgabeDatei[] = []
  const teile: ('blatt' | 'loesung')[] = loesung === 'separate' ? ['blatt', 'loesung'] : ['blatt']
  for (const teil of teile) {
    const name = teil === 'loesung' ? `${q.name} - ${q.begriff}` : q.name
    if (art === 'pdf') dateien.push({ name: `${name}.pdf`, html: html(q, teil, loesung === 'append') })
    else
      dateien.push({
        name: `${name}.docx`,
        filter: WORD_FILTER,
        daten: () =>
          buildWorksheetDocx(
            q.ws,
            teil === 'loesung' ? { sheetIds: q.sheetIds, includeKey: false, keyOnly: true } : { sheetIds: q.sheetIds, includeKey: loesung === 'append' },
            browserDocxDeps(q.logo, q.schoolName)
          )
      })
  }
  return speichereAusgabe(dateien, art === 'pdf' ? 'PDF gespeichert.' : 'Word-Dokument gespeichert.')
}
