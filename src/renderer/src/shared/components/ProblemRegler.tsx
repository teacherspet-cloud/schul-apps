/**
 * Regler „Empfindlichkeit" der Problemwörter (12.10.2026, Wunsch der Lehrkraft): links „nur deutliche Probleme"
 * (wenige Wörter), rechts „schon kleine Unsicherheiten" (mehr Wörter), Mitte = Standard. Genutzt in den Einstellungen
 * (Standard der Lehrkraft) und im Pop-up „Problemwörter" (je Kurs, mit Trefferzahl je Stufe beim Schieben).
 */
import { Group, Slider, Stack, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { PROBLEM_SCHWELLEN, PROBLEM_STUFE_NAME, problemStufe, problemWoerterText, type ProblemStufe } from '@shared/problemWoerter'

/** Kurzbeschreibung der Regel einer Stufe */
export function problemRegelText(st: ProblemStufe): string {
  const sw = PROBLEM_SCHWELLEN[st]
  if (st === 5) return 'Ein Wort zählt, sobald es bei einem Kind gerade wackelt.'
  return `Ein Wort zählt, wenn es bei mindestens ${sw.minKinder} Kindern (in kleinen Kursen ${Math.round(sw.anteil * 100)} % der Übenden) gerade wackelt und im Kurs mindestens ${Math.round(sw.minQuote * 100)} % der Abfragen falsch waren (ab ${sw.minVersuche} Abfragen).`
}

export function ProblemRegler({
  wert,
  onAendern,
  zahlen,
  deaktiviert
}: {
  wert: ProblemStufe
  /** Erst beim Loslassen (kein Speichern bei jedem Zwischenschritt) */
  onAendern: (st: ProblemStufe) => void
  /** Trefferzahl je Stufe 1–5 (Pop-up) – fehlt = keine Zahl (Einstellungen) */
  zahlen?: number[]
  deaktiviert?: boolean
}): React.JSX.Element {
  const [zeige, setZeige] = useState<ProblemStufe>(wert)
  useEffect(() => setZeige(wert), [wert])
  return (
    <Stack gap={4} data-problem-regler>
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Text size="xs" c="dimmed">
          nur deutliche Probleme
        </Text>
        <Text size="xs" c="dimmed" ta="right">
          schon kleine Unsicherheiten
        </Text>
      </Group>
      <Slider
        min={1}
        max={5}
        step={1}
        value={zeige}
        disabled={deaktiviert}
        onChange={(v) => setZeige(problemStufe(v))}
        onChangeEnd={(v) => onAendern(problemStufe(v))}
        marks={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: zahlen ? String(zahlen[v - 1] ?? '') : '' }))}
        label={(v) => PROBLEM_STUFE_NAME[problemStufe(v)]}
        mb={zahlen ? 'md' : 4}
        aria-label="Empfindlichkeit der Problemwörter"
      />
      <Text size="xs" c="dimmed" data-problem-regel>
        {PROBLEM_STUFE_NAME[zeige]}
        {zahlen ? ` – ${problemWoerterText(zahlen[zeige - 1] ?? 0)}` : ''}. {problemRegelText(zeige)}
      </Text>
    </Stack>
  )
}
