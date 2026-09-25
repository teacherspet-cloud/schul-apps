import { Anchor, Group, Text } from '@mantine/core'
import { useState } from 'react'
import { useAppSettings } from '../settingsStore'

/**
 * Bundesland und Schulform in den Programmen – eingeklappt, solange sie stimmen.
 *
 * WARUM: Beides steht in den Einstellungen. Wer an einer Schule unterrichtet, hat es einmal
 * gewählt und beantwortet seitdem in jedem Programm dieselben zwei Fragen erneut. Deshalb
 * steht hier normalerweise nur eine Zeile: „Niedersachsen · Integrierte Gesamtschule".
 *
 * WARUM TROTZDEM ÄNDERBAR: Die Angaben steuern mehr als die Kopfzeile – Operatorenlisten,
 * Landesformate, Themenvorschläge und Jahrgangsbereiche hängen daran. Wer für eine
 * Kollegin an einer anderen Schulform etwas erstellt oder ein altes Material öffnet, das
 * für ein anderes Land gemacht wurde, muss herankommen. „ändern" klappt die beiden
 * Auswahlfelder auf; sie sind unverändert die der Programme, mit ihren eigenen Folgen
 * (das Landesformat der Lernzielkontrolle etwa wird beim Wechsel neu gesetzt).
 *
 * WEICHT DAS MATERIAL AB, bleibt die Auswahl offen. Sonst verstecken wir genau den
 * Unterschied, der erklärt, warum die App hier andere Vorschläge macht als sonst.
 */
export default function SchulAngabe({
  stateId,
  stateName,
  schoolTypeId,
  schoolTypeName,
  children
}: {
  stateId: string
  stateName: string
  schoolTypeId: string
  schoolTypeName: string
  children: React.ReactNode
}): React.JSX.Element {
  const defaults = useAppSettings((s) => s.settings.defaults)
  const [offen, setOffen] = useState(false)

  const eingestellt = Boolean(defaults?.stateId && defaults?.schoolTypeId)
  const wieEingestellt = defaults?.stateId === stateId && defaults?.schoolTypeId === schoolTypeId
  if (offen || !eingestellt || !wieEingestellt) return <>{children}</>

  return (
    <Group gap="xs" justify="space-between" wrap="nowrap">
      <Text size="sm" c="dimmed">
        {[stateName, schoolTypeName].filter(Boolean).join(' · ')}
      </Text>
      <Anchor component="button" type="button" size="xs" onClick={() => setOffen(true)}>
        ändern
      </Anchor>
    </Group>
  )
}
