// Arbeitsblätter in der App speichern (wie die Vokabeltests) – mit Vorschaubild der ersten Seite.
import { cleanImageBackground } from '../../shared/imageCleanup'
import * as pdfjs from 'pdfjs-dist'
import { useRef } from 'react'
import type { SavedWorksheetStats } from '@shared/types'
import { dokumentName, sichereAlles } from '../../shared/autosave'
import { legeAb } from '../../shared/auftraege'
import { useStoreAutosave } from '../../shared/useAutosave'
import { buildWorksheetHtml } from './render/printHtml'
import type { PagePlan } from './render/paginate'
import type { Worksheet } from './model/types'
import { useArbeitsblatt } from './store'
import { boardList } from './didactics/boardDesign'

export function worksheetStats(ws: Worksheet): SavedWorksheetStats {
  return {
    subjectId: ws.meta.subjectId,
    subjectLabel: ws.meta.subjectLabel,
    topic: ws.meta.topic.trim() || ws.meta.title.trim() || 'Ohne Thema',
    grade: ws.meta.grade,
    schoolTypeName: ws.meta.schoolTypeName,
    stateId: ws.meta.stateId,
    schoolTypeId: ws.meta.schoolTypeId,
    sheetCount: ws.sheets.length,
    hasBoard: boardList(ws).length > 0
  }
}

export function defaultWorksheetName(ws: Worksheet): string {
  return (ws.meta.title.trim() || ws.meta.topic.trim() || 'Arbeitsblatt').slice(0, 120)
}

/** Kleines Bild der ersten Seite (für die Kacheln in der Bibliothek). */
export async function worksheetThumb(ws: Worksheet, layouts: Map<string, PagePlan[]>, logo: string | null, schoolName: string): Promise<string | undefined> {
  try {
    const sheet = ws.sheets[0]
    if (!sheet) return undefined
    const html = buildWorksheetHtml(ws, layouts, { sheetIds: [sheet.id], includeKey: false }, logo, schoolName)
    const pdf = await pdfjs.getDocument({ data: await window.api.exporter.preview(html) }).promise
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 0.35 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvas, viewport }).promise
    const thumb = canvas.toDataURL('image/jpeg', 0.7)
    pdf.cleanup()
    return thumb
  } catch {
    // Ohne Vorschaubild ist die Kachel schlichter, mehr nicht
    return undefined
  }
}

/**
 * Lohnt sich das Sichern? Ab dem ersten Schritt, sobald ein Thema dasteht – nicht erst mit
 * ausformulierten Bausteinen. Vorher war alles, was in Schritt 1 und 2 entstand (Angaben,
 * Material, Gliederung), bis zum Ausformulieren nur im Arbeitsspeicher.
 */
export const lohntSicherung = (ws: Worksheet | null): boolean => Boolean(ws && (ws.sheets.length || ws.meta.topic.trim() || ws.outline))

/** Speichert das aktuelle Arbeitsblatt in der App (unter der Kennung des offenen Blattes). */
export async function saveCurrentWorksheet(
  opts: { name?: string; logo?: string | null; schoolName?: string; withThumb?: boolean; layouts?: Map<string, PagePlan[]> } = {}
): Promise<void> {
  const state = useArbeitsblatt.getState()
  const ws = state.worksheet
  if (!ws || !lohntSicherung(ws)) return
  const id = state.docId
  const name = opts.name?.trim() || dokumentName(id, state.docName, defaultWorksheetName(ws))
  const thumb =
    opts.withThumb === false || !opts.layouts || !ws.sheets.length
      ? undefined
      : await worksheetThumb(ws, opts.layouts, opts.logo ?? null, opts.schoolName ?? '')
  const meta = await window.api.sheets.save({ id, name, stats: worksheetStats(ws), thumb, payload: withoutAudioData(ws) })
  useArbeitsblatt.getState().markSaved(meta.id, meta.updatedAt, meta.name)
}

export async function openSavedWorksheet(id: string): Promise<void> {
  // Was am bisherigen Blatt noch ansteht, zuerst sichern – sonst ginge es beim Wechsel verloren
  await sichereAlles()
  const saved = await window.api.sheets.get(id)
  useArbeitsblatt.getState().openSaved(saved.id, saved.name, saved.payload as Worksheet, saved.updatedAt)
  void cleanWorksheetImages()
  void loadAudioFiles()
}

/** Ist genau dieses Blatt gerade im Programm offen? */
export const blattOffen = (docId: string): boolean => {
  const s = useArbeitsblatt.getState()
  return s.docId === docId && s.worksheet !== null
}

/**
 * Ergebnis eines Hintergrund-Auftrags im Blatt `docId` ablegen (siehe shared/auftraege.ts).
 *
 * Ist das Blatt offen, wird es als ein Rückgängig-Schritt übernommen und der passende
 * Schritt gezeigt – gesprungen wird nur INNERHALB dieses Blattes, nie zu einem anderen
 * Programm oder Dokument. Sonst geht es direkt in die Bibliothek.
 */
export function legeArbeitsblattAb(docId: string, schnappschuss: Worksheet, einarbeiten: (ws: Worksheet) => Worksheet, schritt?: number): Promise<void> {
  return legeAb<Worksheet>(
    {
      istOffen: blattOffen,
      imOffenen: (f) => {
        const s = useArbeitsblatt.getState()
        if (!s.worksheet) return
        // Ohne Schritt (ein einzelner Baustein): bleiben, wo die Lehrkraft gerade ist
        if (schritt === undefined) s.setWorksheet(f(s.worksheet))
        else s.applyGenerated(f(s.worksheet), schritt)
      },
      laden: async (id) => {
        const w = await window.api.sheets.get(id)
        return { name: w.name, dok: w.payload as Worksheet }
      },
      speichern: async (id, name, ws) => {
        await window.api.sheets.save({ id, name: name ?? defaultWorksheetName(ws), stats: worksheetStats(ws), payload: withoutAudioData(ws) })
      }
    },
    docId,
    schnappschuss,
    einarbeiten
  )
}

/** Neues Arbeitsblatt beginnen – das bisherige vorher sichern. */
export async function newWorksheetSafely(): Promise<void> {
  await sichereAlles()
  useArbeitsblatt.getState().newWorksheet()
}

/**
 * Hörtexte werden als MP3 im Ordner „hoertexte“ abgelegt, nicht im Arbeitsblatt selbst –
 * sonst würde jede gespeicherte Fassung um mehrere Megabyte wachsen.
 */
function withoutAudioData(ws: Worksheet): Worksheet {
  if (!ws.sheets.some((s) => s.blocks.some((b) => b.type === 'audio' && b.audio?.dataUrl))) return ws
  return {
    ...ws,
    sheets: ws.sheets.map((s) => ({
      ...s,
      blocks: s.blocks.map((b) => (b.type === 'audio' && b.audio?.dataUrl ? { ...b, audio: { fileName: b.audio.fileName } } : b))
    }))
  }
}

/** Beim Öffnen die gespeicherten Audiodateien wieder an die Hörtext-Bausteine hängen. */
export async function loadAudioFiles(): Promise<void> {
  const ws = useArbeitsblatt.getState().worksheet
  if (!ws) return
  const found = new Map<string, string>()
  for (const sheet of ws.sheets) {
    for (const block of sheet.blocks) {
      if (block.type !== 'audio' || !block.audio?.fileName || block.audio.dataUrl) continue
      const dataUrl = await window.api.audio.read(block.audio.fileName).catch(() => null)
      if (dataUrl) found.set(block.id, dataUrl)
    }
  }
  if (!found.size) return
  useArbeitsblatt.getState().update((draft) => {
    for (const sheet of draft.sheets) {
      for (const block of sheet.blocks) {
        const dataUrl = found.get(block.id)
        if (block.type === 'audio' && dataUrl && block.audio) block.audio.dataUrl = dataUrl
      }
    }
  })
}

/**
 * Die Seitenaufteilung, die der Editor gerade berechnet hat – für das Vorschaubild.
 * Das Sichern selbst hängt am Programm, nicht am Editor: Es läuft schon in Schritt 1.
 */
let vorschauLayouts: Map<string, PagePlan[]> | null = null
export const setPreviewLayouts = (layouts: Map<string, PagePlan[]> | null): void => {
  vorschauLayouts = layouts
}

/**
 * Automatisches Speichern – als Entwurf ab Schritt 1, danach nach jeder Änderung.
 * Das Vorschaubild entsteht mit dem ersten ausformulierten Blatt und danach höchstens alle
 * zwei Minuten neu.
 */
export function useWorksheetAutosave(logo: string | null, schoolName: string): void {
  const vorschau = useRef({ docId: '', zuletzt: 0 }).current
  useStoreAutosave({
    store: useArbeitsblatt,
    dokument: (s) => s.docId,
    gesichert: (s) => Boolean(s.savedAt),
    bereit: (s) => lohntSicherung(s.worksheet),
    // Ein geänderter Name zählt nur, wenn ihn die Lehrkraft geändert hat – nicht die Bestätigung des Speicherns
    geaendert: (s, prev) => s.worksheet !== prev.worksheet || (s.docName !== prev.docName && s.savedAt === prev.savedAt),
    speichern: () => {
      const { docId, worksheet } = useArbeitsblatt.getState()
      if (vorschau.docId !== docId) Object.assign(vorschau, { docId, zuletzt: 0 })
      const now = Date.now()
      const withThumb = Boolean(worksheet?.sheets.length && vorschauLayouts) && now - vorschau.zuletzt > 120_000
      if (withThumb) vorschau.zuletzt = now
      return saveCurrentWorksheet({ logo, schoolName, withThumb, layouts: vorschauLayouts ?? undefined })
    }
  })
}

/**
 * Nach dem Öffnen: Bilder mit Schachbrett- oder Greenscreen-Hintergrund still freistellen
 * (ältere Blätter profitieren so von der neuen Bildbereinigung).
 */
export async function cleanWorksheetImages(): Promise<number> {
  const ws = useArbeitsblatt.getState().worksheet
  if (!ws) return 0
  const cleaned = new Map<string, string>()
  for (const sheet of ws.sheets) {
    for (const block of sheet.blocks) {
      if (block.type !== 'image') continue
      const refs: [string, string][] = [
        ...(block.image ? ([[block.id, block.image.dataUrl]] as [string, string][]) : []),
        ...(block.items ?? []).filter((it) => it.image).map((it) => [`${block.id}:${it.id}`, it.image!.dataUrl] as [string, string])
      ]
      for (const [key, dataUrl] of refs) {
        const res = await cleanImageBackground(dataUrl)
        if (res.kind !== 'none') cleaned.set(key, res.dataUrl)
      }
    }
  }
  if (!cleaned.size) return 0
  useArbeitsblatt.getState().update((draft) => {
    for (const sheet of draft.sheets) {
      for (const block of sheet.blocks) {
        if (block.type !== 'image') continue
        const own = cleaned.get(block.id)
        if (own && block.image) block.image.dataUrl = own
        for (const item of block.items ?? []) {
          const url = cleaned.get(`${block.id}:${item.id}`)
          if (url && item.image) item.image.dataUrl = url
        }
      }
    }
  })
  return cleaned.size
}
