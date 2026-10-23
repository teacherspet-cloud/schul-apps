/**
 * Material frisch lesen und setzen wie gedruckt (23.10.2026, fundstellen.ts): Für jeden Entwurf
 * (Erwartungshorizont, Bewertungstabelle, Bögen) holt die Rückmeldung das Material aus seiner
 * Ablage – nicht den beim Anlegen hinterlegten Text – und misst es unsichtbar wie im Editor, damit
 * die Zeilennummern zum Blatt der Lernenden passen (Gruppe A).
 */
import { useAppSettings } from '../../shared/settingsStore'
import type { Worksheet } from '../arbeitsblatt/model/types'
import { messeSeiten } from '../arbeitsblatt/render/seitenMessen'
import { worksheetThumb } from '../arbeitsblatt/library'
import { leseMaterialZeilen } from '../arbeitsblatt/render/zeilenLesen'
import type { GrammarTest } from '../grammatiktest/model/types'
import { testToWorksheet } from '../grammatiktest/render/testWorksheet'
import { normalisiereArbeit } from '../klassenarbeit/model/fassungen'
import type { Exam } from '../klassenarbeit/model/types'
import { examToWorksheet } from '../klassenarbeit/render/examWorksheet'
import type { Kurztest } from '../lernzielkontrolle/model/types'
import { kurztestToWorksheet } from '../lernzielkontrolle/render/kurztestWorksheet'
import { fundstellenText } from './fundstellen'
import type { Grundlage, Rueckmeldung } from './model/types'

/** Das Blatt, wie die Lernenden es bekommen, mit Stand (und beim Arbeitsblatt dessen Vorschaubild) – null bei Vokabeltest und eigenem Material */
async function materialZu(g: Grundlage): Promise<{ ws: Worksheet; stand: string; thumb?: string } | null> {
  if (!g.docId) return null
  if (g.art === 'arbeitsblatt') {
    const s = await window.api.sheets.get(g.docId)
    return { ws: s.payload as Worksheet, stand: s.updatedAt, thumb: s.thumb }
  }
  if (g.art === 'klassenarbeit') {
    const s = await window.api.exams.get(g.docId)
    return { ws: examToWorksheet(normalisiereArbeit(s.payload as Exam), 0), stand: s.updatedAt }
  }
  if (g.art === 'lernzielkontrolle') {
    const s = await window.api.kurztests.get(g.docId)
    return { ws: kurztestToWorksheet(s.payload as Kurztest, 0), stand: s.updatedAt }
  }
  if (g.art === 'grammatiktest') {
    const s = await window.api.grammarTests.get(g.docId)
    return { ws: testToWorksheet(s.payload as GrammarTest), stand: s.updatedAt }
  }
  return null
}

const blattZu = async (g: Grundlage): Promise<Worksheet | null> => (await materialZu(g))?.ws ?? null

/*
 * Miniatur der ersten Materialseite für die Karten der Rückmeldung (23.10.2026, Wahl der Lehrkraft statt
 * des Textanfangs „(1) Kasten (wissen) …"). Je Material und Stand einmal erzeugt; nacheinander, weil
 * jedes Bild über die PDF-Vorschau entsteht.
 */
const miniaturen = new Map<string, Promise<string | undefined>>()
let warteschlange: Promise<unknown> = Promise.resolve()

export async function materialMiniatur(g: Grundlage): Promise<string | undefined> {
  const m = await materialZu(g)
  if (!m) return undefined
  if (m.thumb) return m.thumb
  const schluessel = `${g.art}:${g.docId}:${m.stand}`
  let bild = miniaturen.get(schluessel)
  if (!bild) {
    const { logoDataUrl, settings } = useAppSettings.getState()
    bild = warteschlange.then(() => worksheetThumb(m.ws, new Map(), logoDataUrl ?? null, settings.schoolName ?? ''))
    warteschlange = bild.catch(() => undefined)
    miniaturen.set(schluessel, bild)
  }
  return bild
}

/**
 * Die Rückmeldung mit frisch gelesenem Material für die KI (`grundlage.fundstellen`). Ohne Blatt aus
 * der App bleibt alles, wie es ist (hochgeladene Dateien tragen ihre gedruckte Zählung schon im Text).
 * `hinweis`: Das Material ist nicht mehr da – es gilt der hinterlegte Text.
 */
export async function mitFrischemMaterial(r: Rueckmeldung): Promise<{ r: Rueckmeldung; hinweis?: string }> {
  let ws: Worksheet | null
  try {
    ws = await blattZu(r.grundlage)
  } catch {
    return { r, hinweis: 'Das Material ist nicht mehr in der Ablage – es gilt der beim Anlegen hinterlegte Text.' }
  }
  if (!ws) return { r }
  let zeilen = new Map<string, string[]>()
  if (ws.sheets.some((s) => s.blocks.some((b) => b.type === 'text' && b.lineNumbers))) {
    const { logoDataUrl, settings } = useAppSettings.getState()
    const blaetter = ws.sheets
    await messeSeiten(ws, logoDataUrl ?? null, settings.schoolName ?? '', 20000, (bereich) => {
      zeilen = leseMaterialZeilen(bereich, blaetter)
    })
  }
  return { r: { ...r, grundlage: { ...r.grundlage, fundstellen: fundstellenText(ws, zeilen) } } }
}
