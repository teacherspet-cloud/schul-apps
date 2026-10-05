/**
 * Ein gespeichertes Arbeitsblatt als Inhalt eines Reihen-Schritts (05.10.2026 aus SchrittBearbeiten
 * herausgelöst): dieselbe Übernahme für die Auswahl von Hand, die KI-Planung (vorhandenes Material)
 * und die Platzhalter, deren Arbeitsblatt die KI im Hintergrund erzeugt.
 *
 * Die Schülerfassung entsteht aus dem Original mit der Auswahl des Schritts (auswahl.ts) und – als
 * Vorgabe – mit Korrekturrand, an dem das KI-Feedback steht. Ihre Seiten werden GEMESSEN
 * (`messeSeiten`) wie im Editor: keine abgeschnittenen Texte, Fortsetzungen und Linien wie gewohnt.
 */
import type { Lernziel, SchrittInhalt } from '@shared/reihe'
import { useAppSettings } from '../../shared/settingsStore'
import type { Worksheet } from '../arbeitsblatt/model/types'
import type { PagePlan } from '../arbeitsblatt/render/paginate'
import { buildWorksheetHtml } from '../arbeitsblatt/render/printHtml'
import { messeSeiten } from '../arbeitsblatt/render/seitenMessen'
import { mitAuswahl, type Auswahl } from './auswahl'
import { blattAufgaben, blattMerkkaesten, blattRueckmeldung, loesungFuerLernende } from '../arbeitsblatt/BlattFreigabeKnopf'

type BlattInhalt = Extract<SchrittInhalt, { art: 'arbeitsblatt' }>
export type BlattUebernahme = {
  inhalt: Pick<BlattInhalt, 'quelle' | 'titel' | 'html' | 'aufgaben' | 'vorlage' | 'merk' | 'loesung' | 'varianten'>
  titel: string
  lernziele: Lernziel[]
}

/** Lernziele eines Arbeitsblatts (Baustein „Lernziele") */
export function blattLernziele(ws: Worksheet, sheetId: string): Lernziel[] {
  const sheet = ws.sheets.find((s) => s.id === sheetId)
  const block = sheet?.blocks.find((b) => b.type === 'learningGoals') as { goals?: string[] } | undefined
  return (block?.goals ?? []).map((g) => ({ text: g, ichKann: g }))
}

/** Die Fassung für die Lernenden: Auswahl angewandt, Korrekturrand nach Wahl (Vorgabe: an) – Original unverändert */
export function blattFassung(original: Worksheet, auswahl?: Auswahl, korrekturrand = true): Worksheet {
  const ws = mitAuswahl(original, auswahl)
  return { ...ws, meta: { ...ws.meta, correctionMargin: korrekturrand } }
}

/** Inhalt (ohne Einstellungen wie Runden/Stift), Titel und Lernziele aus einem Arbeitsblatt */
export function blattAlsSchritt(
  id: string,
  original: Worksheet,
  name = '',
  /** Auswahl des Schritts (auswahl.ts): Ausgeblendetes fehlt, Freiwilliges ist markiert */
  auswahl?: Auswahl,
  /** Gemessene Seitenaufteilung der Fassung (`messeSeiten`) – leer: der Druckweg teilt selbst auf */
  layouts: Map<string, PagePlan[]> = new Map(),
  korrekturrand = true
): BlattUebernahme {
  const { logoDataUrl, settings } = useAppSettings.getState()
  const logo = logoDataUrl ?? null
  const schule = settings.schoolName ?? ''
  const ws = blattFassung(original, auswahl, korrekturrand)
  const sheet = ws.sheets[0]
  if (!sheet) throw new Error('Das Arbeitsblatt ist leer.')
  const titel = ws.meta.title || ws.meta.topic || name
  // Schülerfassung ohne Lösungen; Lösungen und Erwartungen nur für den Server
  const html = buildWorksheetHtml(ws, layouts, { sheetIds: [sheet.id], includeKey: false }, logo, schule)
  // Lösungsblatt (sehen die Lernenden nach dem ersten Einreichen) und Niveaustufen aus den Blättern
  const loesung = (sid: string): string =>
    loesungFuerLernende(buildWorksheetHtml(ws, layouts, { sheetIds: [sid], includeKey: false, keyOnly: true }, logo, schule))
  const varianten =
    ws.sheets.length > 1
      ? ws.sheets.map((sh, k) => ({
          label: sh.label || ['Basis', 'Standard', 'Plus'][k] || `Stufe ${k + 1}`,
          html: buildWorksheetHtml(ws, layouts, { sheetIds: [sh.id], includeKey: false }, logo, schule),
          aufgaben: blattAufgaben(sh),
          vorlage: blattRueckmeldung(ws, sh, titel),
          loesung: loesung(sh.id),
          merk: blattMerkkaesten(sh)
        }))
      : undefined
  return {
    inhalt: {
      quelle: id,
      titel,
      html,
      aufgaben: blattAufgaben(sheet),
      vorlage: blattRueckmeldung(ws, sheet, titel),
      merk: blattMerkkaesten(sheet),
      loesung: loesung(sheet.id),
      varianten
    },
    titel,
    lernziele: blattLernziele(original, sheet.id)
  }
}

/** Wie `blattAlsSchritt`, mit gemessenen Seiten (der geprüfte Weg) */
export async function blattAlsSchrittGemessen(id: string, original: Worksheet, name = '', auswahl?: Auswahl, korrekturrand = true): Promise<BlattUebernahme> {
  const { logoDataUrl, settings } = useAppSettings.getState()
  const layouts = await messeSeiten(blattFassung(original, auswahl, korrekturrand), logoDataUrl ?? null, settings.schoolName ?? '')
  return blattAlsSchritt(id, original, name, auswahl, layouts, korrekturrand)
}

/** Gespeichertes Arbeitsblatt laden und übernehmen (gemessen) */
export async function ladeBlattAlsSchritt(id: string, auswahl?: Auswahl, korrekturrand = true): Promise<BlattUebernahme> {
  const w = await window.api.sheets.get(id)
  return blattAlsSchrittGemessen(id, w.payload as Worksheet, w.name, auswahl, korrekturrand)
}
