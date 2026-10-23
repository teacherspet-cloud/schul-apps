/**
 * Ein gespeichertes Material als Blatt, wie die Lernenden es bekommen (Gruppe A) – ohne seinen Editor zu öffnen
 * (23.10.2026). Für die Fundstellen und Miniaturen der Rückmeldung und für den PDF-Export eines Materials, dessen App
 * nicht freigegeben ist (App-Freigaben). Vokabeltest und eigene Aufgaben sind kein Blatt: null.
 */
import type { Worksheet } from '../modules/arbeitsblatt/model/types'
import type { GrammarTest } from '../modules/grammatiktest/model/types'
import { testToWorksheet } from '../modules/grammatiktest/render/testWorksheet'
import { normalisiereArbeit } from '../modules/klassenarbeit/model/fassungen'
import type { Exam } from '../modules/klassenarbeit/model/types'
import { examToWorksheet } from '../modules/klassenarbeit/render/examWorksheet'
import type { Kurztest } from '../modules/lernzielkontrolle/model/types'
import { kurztestToWorksheet } from '../modules/lernzielkontrolle/render/kurztestWorksheet'

export const BLATT_ARTEN = ['arbeitsblatt', 'klassenarbeit', 'lernzielkontrolle', 'grammatiktest'] as const

export interface MaterialAlsBlatt {
  ws: Worksheet
  name: string
  stand: string
  /** Vorschaubild der ersten Seite, wenn die Ablage eins hat (Arbeitsblatt) */
  thumb?: string
}

export async function materialAlsBlatt(art: string, docId: string | undefined): Promise<MaterialAlsBlatt | null> {
  if (!docId) return null
  if (art === 'arbeitsblatt') {
    const s = await window.api.sheets.get(docId)
    return { ws: s.payload as Worksheet, name: s.name, stand: s.updatedAt, thumb: s.thumb }
  }
  if (art === 'klassenarbeit') {
    const s = await window.api.exams.get(docId)
    return { ws: examToWorksheet(normalisiereArbeit(s.payload as Exam), 0), name: s.name, stand: s.updatedAt }
  }
  if (art === 'lernzielkontrolle') {
    const s = await window.api.kurztests.get(docId)
    return { ws: kurztestToWorksheet(s.payload as Kurztest, 0), name: s.name, stand: s.updatedAt }
  }
  if (art === 'grammatiktest') {
    const s = await window.api.grammarTests.get(docId)
    return { ws: testToWorksheet(s.payload as GrammarTest), name: s.name, stand: s.updatedAt }
  }
  return null
}
