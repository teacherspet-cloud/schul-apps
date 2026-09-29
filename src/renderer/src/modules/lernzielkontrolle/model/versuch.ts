import type { VersuchLerngruppe } from '../../arbeitsblatt/didactics/protokoll'
import type { KurztestMeta } from './types'

/** Die Lerngruppe einer Lernzielkontrolle für den Versuchsauftrag (29.09.2026) */
export const lzkLerngruppe = (m: KurztestMeta): VersuchLerngruppe => ({
  subjectId: m.subjectId,
  subjectLabel: m.subjectLabel,
  grade: m.grade,
  schoolTypeName: m.schoolTypeName,
  topic: m.thema
})
