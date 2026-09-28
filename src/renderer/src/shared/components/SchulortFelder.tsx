import { Group } from '@mantine/core'
import type { CefrTable } from '@shared/types'
import { schoolTypesForState } from '../../modules/arbeitsblatt/didactics/schoolProfiles'
import { STATES } from '../../modules/arbeitsblatt/didactics/states'
import HaeufigSelect from './HaeufigSelect'
import SchulAngabe from './SchulAngabe'

/**
 * Bundesland und Schulform – eingeklappt hinter „Niedersachsen · Gymnasium", aufklappbar über
 * „ändern" (SchulAngabe). Gemeinsam für Arbeitsblatt, Klassenarbeit, Lernzielkontrolle und
 * Grammatiktest (Großprogramm 0.4, Aufräumen D2). Beim Wechsel des Landes zieht die Schulform
 * mit, wenn es sie dort nicht gibt; die übrigen Folgen (Jahrgang, Kursniveau, Landesformat)
 * regelt das Programm in `onChange`, am einfachsten mit `mitLerngruppe` aus shared/lerngruppe.ts.
 */
export default function SchulortFelder({
  table,
  stateId,
  schoolTypeId,
  schoolTypeName,
  onChange,
  searchable
}: {
  table: CefrTable
  stateId: string
  schoolTypeId: string
  schoolTypeName: string
  onChange: (p: { stateId?: string; schoolTypeId?: string; schoolTypeName?: string }) => void
  searchable?: boolean
}): React.JSX.Element {
  const types = schoolTypesForState(table, stateId)
  return (
    <SchulAngabe
      stateId={stateId}
      stateName={STATES.find((s) => s.id === stateId)?.name ?? stateId}
      schoolTypeId={schoolTypeId}
      schoolTypeName={types.find((t) => t.value === schoolTypeId)?.label ?? schoolTypeName}
    >
      <Group grow>
        <HaeufigSelect
          art="bundesland"
          label="Bundesland"
          data={STATES.map((s) => ({ value: s.id, label: s.name }))}
          value={stateId}
          onChange={(v) => {
            if (!v) return
            const list = schoolTypesForState(table, v)
            const keep = list.some((t) => t.value === schoolTypeId)
            onChange({
              stateId: v,
              schoolTypeId: keep ? schoolTypeId : (list[0]?.value ?? 'gymnasium'),
              schoolTypeName: keep ? schoolTypeName : (list[0]?.label ?? 'Gymnasium')
            })
          }}
          allowDeselect={false}
          maxDropdownHeight={400}
          searchable={searchable}
        />
        <HaeufigSelect
          art="schulform"
          label="Schulform"
          data={types}
          value={schoolTypeId}
          onChange={(v) => v && onChange({ schoolTypeId: v, schoolTypeName: types.find((t) => t.value === v)?.label ?? schoolTypeName })}
          allowDeselect={false}
        />
      </Group>
    </SchulAngabe>
  )
}
