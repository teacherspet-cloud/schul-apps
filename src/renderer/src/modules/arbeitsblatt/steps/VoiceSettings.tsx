/**
 * Klangregler eines Hörtextes.
 *
 * Voreingestellt wird NICHTS von Hand: Das Tempo folgt dem GER-Niveau, weil das Sprechtempo
 * zum Hörverstehen gehört und die App die Zielwerte ohnehin führt. Die Regler stehen
 * trotzdem da – die Lehrkraft kennt ihre Lerngruppe besser als eine Tabelle.
 *
 * Wichtig ist die Zeile unter dem Tempo: Sie nennt die Wörter je Minute, die tatsächlich
 * herauskommen. Die Stimmen sprechen von Haus aus rund 205 Wörter je Minute, und langsamer
 * als 0.7 lässt ElevenLabs nicht zu – unter etwa 144 kommt man also nicht. Für A1 bis B1
 * ist der Zielwert damit unerreichbar. Das steht dort ausdrücklich, statt einen
 * niveaugerechten Hörtext vorzutäuschen.
 */
import { Alert, Button, Collapse, Group, Slider, Stack, Switch, Text } from '@mantine/core'
import { IconAdjustmentsHorizontal, IconAlertTriangle } from '@tabler/icons-react'
import { useState } from 'react'
import type { TtsSettings } from '@shared/types'
import { clampTtsSettings, settingsFuerNiveau, SPEED_RANGE, tempoFuerNiveau, wpmBeiTempo, NATURAL_WPM_DIALOG, NATURAL_WPM_SOLO } from '@shared/voiceSettings'

/** Ein Regler mit Beschriftung und Erklärung in Alltagssprache. */
function Regler({
  label,
  hilfe,
  wert,
  min,
  max,
  onChange,
  anzeige
}: {
  label: string
  hilfe: string
  wert: number
  min: number
  max: number
  onChange: (v: number) => void
  anzeige: string
}): React.JSX.Element {
  return (
    <Stack gap={2}>
      <Group justify="space-between" gap="xs">
        <Text size="xs" fw={500}>
          {label}
        </Text>
        <Text size="xs" c="dimmed">
          {anzeige}
        </Text>
      </Group>
      <Slider size="sm" min={min} max={max} step={0.01} value={wert} onChange={onChange} label={null} />
      <Text size="xs" c="dimmed">
        {hilfe}
      </Text>
    </Stack>
  )
}

export function VoiceSettings({
  wpm,
  dialog,
  eigene,
  onChange
}: {
  /** Zielspanne des Niveaus in Wörtern je Minute (aus `listeningRules`) */
  wpm: [number, number]
  /** true = mehrere Sprecher, also die ruhigere Dialog-Schnittstelle */
  dialog: boolean
  /** eigene Wahl der Lehrkraft; fehlt sie, gilt das Niveau */
  eigene?: TtsSettings
  onChange: (s: TtsSettings | undefined) => void
}): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const tempo = tempoFuerNiveau(wpm, dialog)
  const werte = eigene ? clampTtsSettings(eigene) : settingsFuerNiveau(wpm, dialog)
  const natur = dialog ? NATURAL_WPM_DIALOG : NATURAL_WPM_SOLO
  const jetztWpm = wpmBeiTempo(werte.speed, natur)
  const setze = (patch: Partial<TtsSettings>): void => onChange(clampTtsSettings({ ...werte, ...patch }))

  return (
    <Stack gap={6}>
      <Group gap="xs">
        <Button
          size="compact-xs"
          variant="subtle"
          leftSection={<IconAdjustmentsHorizontal size={14} />}
          onClick={() => setOffen((o) => !o)}
          aria-expanded={offen}
        >
          Klang und Tempo
        </Button>
        <Text size="xs" c="dimmed">
          {eigene ? 'eigene Einstellung' : 'automatisch nach Niveau'} · ≈ {jetztWpm} Wörter/Minute
        </Text>
        {eigene && (
          <Button size="compact-xs" variant="subtle" onClick={() => onChange(undefined)}>
            zurück zum Niveau
          </Button>
        )}
      </Group>

      {/* Mantine nutzt hier `expanded`, nicht `in`/`opened` */}
      <Collapse expanded={offen}>
        <Stack gap="sm" pt={6}>
          {tempo.zuSchnell && !eigene && (
            <Alert icon={<IconAlertTriangle size={16} />} color="yellow" variant="light" p="xs">
              <Text size="xs">
                Dieses Niveau sieht {wpm[0]}–{wpm[1]} Wörter je Minute vor. Langsamer als ≈ {wpmBeiTempo(SPEED_RANGE.min, natur)} spricht ElevenLabs nicht – der
                Hörtext bleibt also schneller als vorgesehen. Gegenmittel: kürzere Sätze, mehr Pausen im Skript und den Text zweimal abspielen.
              </Text>
            </Alert>
          )}
          <Regler
            label="Tempo"
            hilfe={`Zielspanne des Niveaus: ${wpm[0]}–${wpm[1]} Wörter je Minute.`}
            wert={werte.speed}
            min={SPEED_RANGE.min}
            max={SPEED_RANGE.max}
            onChange={(v) => setze({ speed: v })}
            anzeige={`≈ ${jetztWpm} Wörter/Minute`}
          />
          <Regler
            label="Ruhe"
            hilfe="Hoch = gleichmäßig und verlässlich. Niedrig = lebendiger, aber die Stimme kann entgleiten."
            wert={werte.stability}
            min={0}
            max={1}
            onChange={(v) => setze({ stability: v })}
            anzeige={werte.stability.toFixed(2)}
          />
          <Regler
            label="Ähnlichkeit zur Stimme"
            hilfe="Wie genau die Aufnahme der gewählten Stimme nachgebildet wird."
            wert={werte.similarity}
            min={0}
            max={1}
            onChange={(v) => setze({ similarity: v })}
            anzeige={werte.similarity.toFixed(2)}
          />
          <Regler
            label="Ausdruck"
            hilfe="Betont den Sprechstil stärker. Über 0.5 klingt es schnell theatralisch."
            wert={werte.style}
            min={0}
            max={1}
            onChange={(v) => setze({ style: v })}
            anzeige={werte.style.toFixed(2)}
          />
          <Switch
            size="xs"
            label="Stimme klanglich hervorheben"
            checked={werte.speakerBoost}
            onChange={(e) => {
              const an = e.currentTarget.checked
              setze({ speakerBoost: an })
            }}
          />
        </Stack>
      </Collapse>
    </Stack>
  )
}
