import { schulformVon } from '@shared/schulformen'
import { useAppSettings } from '../../shared/settingsStore'
import { subjectById } from '../arbeitsblatt/model/subjects'
import type { Rueckmeldung } from './model/types'
import { STANDARD_ANREDE } from './render/texte'

/** Eine leere Rückmeldung mit den Voreinstellungen der Schule */
export function leereRueckmeldung(): Rueckmeldung {
  const { defaults } = useAppSettings.getState().settings
  return {
    version: 1,
    meta: {
      title: '',
      subjectId: 'deutsch',
      subjectLabel: subjectById('deutsch').label,
      grade: 7,
      stateId: defaults.stateId,
      schoolTypeId: defaults.schoolTypeId,
      schoolTypeName: schulformVon(defaults.stateId, defaults.schoolTypeId)?.name ?? '',
      anrede: STANDARD_ANREDE,
      schwerpunkt: ''
    },
    grundlage: { art: 'frei', titel: '', aufgaben: '' },
    abgaben: [],
    createdAt: new Date().toISOString()
  }
}
