// Arbeitsblätter in der App speichern (wie die Vokabeltests) – mit Vorschaubild der ersten Seite.
import { cleanImageBackground } from '../../shared/imageCleanup'
import * as pdfjs from 'pdfjs-dist'
import { useEffect, useRef } from 'react'
import type { SavedWorksheetStats } from '@shared/types'
import { notifyError } from '../../shared/util'
import { newId } from '../vokabeltest/model/random'
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

/** Speichert das aktuelle Arbeitsblatt in der App (neu oder unter der bisherigen ID). */
export async function saveCurrentWorksheet(
  opts: { name?: string; logo?: string | null; schoolName?: string; withThumb?: boolean; layouts?: Map<string, PagePlan[]> } = {}
): Promise<void> {
  const state = useArbeitsblatt.getState()
  const ws = state.worksheet
  if (!ws || !ws.sheets.length) return
  const name = (opts.name ?? state.docName).trim() || defaultWorksheetName(ws)
  const id = state.docId ?? newId()
  const thumb = opts.withThumb === false || !opts.layouts ? undefined : await worksheetThumb(ws, opts.layouts, opts.logo ?? null, opts.schoolName ?? '')
  const meta = await window.api.sheets.save({ id, name, stats: worksheetStats(ws), thumb, payload: withoutAudioData(ws) })
  useArbeitsblatt.getState().markSaved(meta.id, meta.updatedAt, meta.name)
}

export async function openSavedWorksheet(id: string): Promise<void> {
  const saved = await window.api.sheets.get(id)
  useArbeitsblatt.getState().openSaved(saved.id, saved.name, saved.payload as Worksheet, saved.updatedAt)
  void cleanWorksheetImages()
  void loadAudioFiles()
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
 * Automatisches Speichern: Das erste Mal, sobald ein Blatt ausformuliert ist; danach nach jeder Änderung.
 * Das Vorschaubild wird nur beim ersten Mal und danach höchstens alle zwei Minuten neu erzeugt.
 */
export function useWorksheetAutosave(logo: string | null, schoolName: string, layouts: Map<string, PagePlan[]>): void {
  const current = useRef(layouts)
  current.current = layouts
  const timer = useRef<number | null>(null)
  const lastThumb = useRef(0)
  useEffect(() => {
    const save = (): void => {
      const now = Date.now()
      const withThumb = now - lastThumb.current > 120_000
      if (withThumb) lastThumb.current = now
      saveCurrentWorksheet({ logo, schoolName, withThumb, layouts: current.current }).catch((e) => notifyError(e, 'Automatisches Speichern fehlgeschlagen'))
    }
    // Schon vorhandene Blätter (gerade erzeugt oder aus einer Datei geöffnet) gleich sichern
    const state = useArbeitsblatt.getState()
    if (state.worksheet?.sheets.length && !state.docId) {
      timer.current = window.setTimeout(save, 2500)
    }
    return useArbeitsblatt.subscribe((state, prev) => {
      if (!state.worksheet?.sheets.length) return
      const changed = state.worksheet !== prev.worksheet || state.docName !== prev.docName
      const isNew = !state.docId && Boolean(prev.worksheet !== state.worksheet)
      if (!changed && !isNew) return
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(save, isNew ? 200 : 1500)
    })
  }, [logo, schoolName])
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
