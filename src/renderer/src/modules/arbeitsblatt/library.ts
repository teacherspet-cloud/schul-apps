// Arbeitsblätter in der App speichern (wie die Vokabeltests) – mit Vorschaubild der ersten Seite.
import { useAppSettings } from '../../shared/settingsStore'
import { newId } from '../vokabeltest/model/random'
import { cleanImageBackground } from '../../shared/imageCleanup'
import * as pdfjs from 'pdfjs-dist'
import { useRef } from 'react'
import type { SavedWorksheetStats } from '@shared/types'
import { dokumentName, istGeloescht, sichereAlles } from '../../shared/autosave'
import { legeAb } from '../../shared/auftraege'
import { useStoreAutosave } from '../../shared/useAutosave'
import { buildWorksheetHtml } from './render/printHtml'
import type { PagePlan } from './render/paginate'
import type { Worksheet } from './model/types'
import { useArbeitsblatt } from './store'
import { boardList } from './didactics/boardDesign'
import { markiereLoesungsbausteine } from './didactics/loesungsteil'
import { ueberthemaVon } from '../../shared/ueberthema'
import { einsortierenNachSpeichern } from '../../shared/themenbereiche'

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
    hasBoard: boardList(ws).length > 0,
    // Überthema für die Themenbereiche (27.09.2026): So findet die Automatik den Bereich, den das Blatt selbst nennt
    ...(ueberthemaVon(ws.meta) ? { ueberthema: ueberthemaVon(ws.meta) } : {})
  }
}

/**
 * Nach dem Öffnen: Lehrerbausteine älterer Blätter als „nur im Lösungsteil" kennzeichnen
 * (didactics/loesungsteil.ts) – nur, wo noch nichts entschieden ist; ohne Verlaufsschritt.
 */
export function markiereLoesungsbausteineImOffenen(): void {
  const ws = useArbeitsblatt.getState().worksheet
  if (!ws) return
  const sheets = ws.sheets.map((s) => {
    const blocks = markiereLoesungsbausteine(s.blocks)
    return blocks === s.blocks ? s : { ...s, blocks }
  })
  if (sheets.every((s, i) => s === ws.sheets[i])) return
  useArbeitsblatt.getState().update((d) => {
    d.sheets = sheets
  })
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
  } catch (e) {
    // Ohne Vorschaubild ist die Kachel schlichter, mehr nicht – der Grund steht in der Konsole
    console.warn('Vorschaubild nicht erzeugt:', e instanceof Error ? e.message : e)
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
  // Ein gelöschtes Dokument wird nicht wieder angelegt (shared/bibliothek.ts, `loescheDokument`)
  if (istGeloescht(id)) return
  const name = opts.name?.trim() || dokumentName(id, state.docName, defaultWorksheetName(ws))
  // Ohne gemessene Seiten (Editor nicht offen): Ersatz-Aufteilung – für das kleine Bild reicht sie
  const thumb =
    opts.withThumb === false || !ws.sheets.length ? undefined : await worksheetThumb(ws, opts.layouts ?? new Map(), opts.logo ?? null, opts.schoolName ?? '')
  const meta = await window.api.sheets.save({ id, name, stats: worksheetStats(ws), thumb, payload: withoutAudioData(ws) })
  useArbeitsblatt.getState().markSaved(meta.id, meta.updatedAt, meta.name)
  // Sofort in die Themenbereiche einsortieren – nicht erst beim nächsten Besuch der Startseite (27.09.2026)
  void einsortierenNachSpeichern()
}

export async function openSavedWorksheet(id: string): Promise<void> {
  // Was am bisherigen Blatt noch ansteht, zuerst sichern – sonst ginge es beim Wechsel verloren
  await sichereAlles()
  const saved = await window.api.sheets.get(id)
  useArbeitsblatt.getState().openSaved(saved.id, saved.name, saved.payload as Worksheet, saved.updatedAt)
  markiereLoesungsbausteineImOffenen()
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
        // Fertig im Hintergrund, ohne offenen Editor: das Vorschaubild gleich mit (sonst „Keine Vorschau")
        const { logoDataUrl, settings } = useAppSettings.getState()
        const thumb = ws.sheets.length ? await worksheetThumb(ws, new Map(), logoDataUrl ?? null, settings.schoolName ?? '') : undefined
        await window.api.sheets.save({ id, name: name ?? defaultWorksheetName(ws), stats: worksheetStats(ws), thumb, payload: withoutAudioData(ws) })
        void einsortierenNachSpeichern()
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
      const withThumb = Boolean(worksheet?.sheets.length) && now - vorschau.zuletzt > 120_000
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

/**
 * Fehlende Vorschaubilder nachtragen (02.10.2026) – für Blätter, die ohne offenen Editor fertig
 * wurden. Höchstens `anzahl` je Aufruf, nacheinander; das Bearbeitungsdatum bleibt.
 */
export async function vorschauenNachtragen(eintraege: { id: string; thumb?: string; sheetCount?: number }[], anzahl = 4): Promise<boolean> {
  const fehlend = eintraege.filter((e) => !e.thumb && (e.sheetCount ?? 0) > 0).slice(0, anzahl)
  if (!fehlend.length) return false
  const { logoDataUrl, settings } = useAppSettings.getState()
  let etwas = false
  for (const e of fehlend) {
    try {
      const w = await window.api.sheets.get(e.id)
      const thumb = await worksheetThumb(w.payload as Worksheet, new Map(), logoDataUrl ?? null, settings.schoolName ?? '')
      if (thumb && (await window.api.sheets.thumb(e.id, thumb))) etwas = true
    } catch {
      // Ein Blatt ohne Bild bleibt eben ohne Bild
    }
  }
  return etwas
}

/**
 * Ein außerhalb des Editors erzeugtes Blatt als NEUES Dokument ablegen (05.10.2026, Platzhalter der
 * Unterrichtsreihe) – das offene Blatt bleibt unberührt. Liefert die Kennung.
 */
export async function speichereNeuesArbeitsblatt(ws: Worksheet, logo: string | null, schoolName: string): Promise<string> {
  const thumb = ws.sheets.length ? await worksheetThumb(ws, new Map(), logo, schoolName).catch(() => undefined) : undefined
  const meta = await window.api.sheets.save({ id: newId(), name: defaultWorksheetName(ws), stats: worksheetStats(ws), thumb, payload: withoutAudioData(ws) })
  return meta.id
}
