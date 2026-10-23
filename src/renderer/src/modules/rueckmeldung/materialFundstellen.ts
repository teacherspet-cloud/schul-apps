/**
 * Material frisch lesen und setzen wie gedruckt (23.10.2026, fundstellen.ts): Für jeden Entwurf
 * (Erwartungshorizont, Bewertungstabelle, Bögen) holt die Rückmeldung das Material aus seiner
 * Ablage – nicht den beim Anlegen hinterlegten Text – und misst es unsichtbar wie im Editor, damit
 * die Zeilennummern zum Blatt der Lernenden passen (Gruppe A).
 */
import { useAppSettings } from '../../shared/settingsStore'
import type { Worksheet } from '../arbeitsblatt/model/types'
import { messeSeiten } from '../arbeitsblatt/render/seitenMessen'
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

/** Das Blatt, wie die Lernenden es bekommen – null bei Vokabeltest und eigenem Material */
async function blattZu(g: Grundlage): Promise<Worksheet | null> {
  if (!g.docId) return null
  if (g.art === 'arbeitsblatt') return (await window.api.sheets.get(g.docId)).payload as Worksheet
  if (g.art === 'klassenarbeit') return examToWorksheet(normalisiereArbeit((await window.api.exams.get(g.docId)).payload as Exam), 0)
  if (g.art === 'lernzielkontrolle') return kurztestToWorksheet((await window.api.kurztests.get(g.docId)).payload as Kurztest, 0)
  if (g.art === 'grammatiktest') return testToWorksheet((await window.api.grammarTests.get(g.docId)).payload as GrammarTest)
  return null
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
