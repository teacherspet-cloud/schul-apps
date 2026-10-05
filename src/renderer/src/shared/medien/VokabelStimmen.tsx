/**
 * Einstellungen › Bilder und Hörtexte › „Aussprache der Vokabeln" (05.10.2026): Standardstimme je Sprache,
 * mit der die Sprach-KI (ElevenLabs bzw. OpenAI-Stimmen) Wörter und Beispielsätze der Medienbank spricht.
 * Am Server gilt die Wahl für alle und nur Admins ändern sie; in der Exe für die eigene Medienbank.
 */
import { ActionIcon, Card, Group, Loader, Select, Stack, Text, Title, Tooltip } from '@mantine/core'
import { IconPlayerPlay } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { TtsVoice } from '@shared/types'
import { passtZurSprache } from '../voiceFilter'
import { notifyError } from '../util'
import { useMedienAdmin } from './MedienUi'

const SPRACHEN: { code: string; name: string }[] = [
  { code: 'en', name: 'Englisch' },
  { code: 'fr', name: 'Französisch' },
  { code: 'es', name: 'Spanisch' },
  { code: 'it', name: 'Italienisch' },
  { code: 'nl', name: 'Niederländisch' },
  { code: 'pl', name: 'Polnisch' },
  { code: 'ru', name: 'Russisch' },
  { code: 'tr', name: 'Türkisch' }
]

export function VokabelStimmenCard(): React.JSX.Element {
  const admin = useMedienAdmin()
  const [stimmen, setStimmen] = useState<TtsVoice[] | null>(null)
  const [wahl, setWahl] = useState<Record<string, string>>({})
  const [fehler, setFehler] = useState('')
  useEffect(() => {
    void window.api.medien.stimmen().then(setWahl, () => setWahl({}))
    void window.api.audio.voices().then(
      (v) => setStimmen(v),
      (e: unknown) => {
        setStimmen([])
        setFehler(e instanceof Error ? e.message : String(e))
      }
    )
  }, [])
  const setzen = (sprache: string, stimme: string): void =>
    void window.api.medien.stimmeSetzen(sprache, stimme).then(setWahl, (e: unknown) => notifyError(e))
  return (
    <Card withBorder padding="lg" data-vokabel-stimmen>
      <Title order={4} mb={4}>
        Aussprache der Vokabeln
      </Title>
      <Text size="xs" c="dimmed" mb="sm">
        Standardstimme je Sprache für die Aussprache von Wörtern und Beispielsätzen in den Vokabellisten (Spalten „Aussprache“ und „Satz-Aussprache“). Die
        Lernenden hören sie im Vokabeltraining statt der Stimme ihres Geräts.{admin ? '' : ' Festlegen dürfen nur Admins.'}
      </Text>
      {stimmen === null ? (
        <Loader size="sm" />
      ) : !stimmen.length ? (
        <Text size="sm" c="orange.8">
          Keine Stimmen verfügbar – zuerst oben einen ElevenLabs- oder OpenAI-Schlüssel hinterlegen.{fehler ? ` (${fehler})` : ''}
        </Text>
      ) : (
        <Stack gap={6}>
          {SPRACHEN.map((s) => {
            const passend = stimmen.filter((v) => passtZurSprache(v, s.code))
            const liste = (passend.length ? passend : stimmen).map((v) => ({ value: v.id, label: `${v.name}${v.language ? ` (${v.language})` : ''}` }))
            const v = stimmen.find((x) => x.id === wahl[s.code])
            return (
              <Group key={s.code} gap="xs" wrap="nowrap">
                <Text size="sm" w={120}>
                  {s.name}
                </Text>
                <Select
                  size="xs"
                  style={{ flex: 1 }}
                  data={liste}
                  value={wahl[s.code] ?? null}
                  onChange={(id) => setzen(s.code, id ?? '')}
                  searchable
                  clearable
                  disabled={!admin}
                  placeholder="keine – Aussprache aus"
                  data-stimme-sprache={s.code}
                />
                <Tooltip label="Hörprobe">
                  <ActionIcon
                    variant="subtle"
                    disabled={!v}
                    onClick={() =>
                      v &&
                      void (v.previewUrl ? Promise.resolve(v.previewUrl) : window.api.audio.preview(v.id)).then(
                        (src) => void new Audio(src).play(),
                        (e: unknown) => notifyError(e)
                      )
                    }
                    aria-label={`Hörprobe ${s.name}`}
                  >
                    <IconPlayerPlay size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            )
          })}
        </Stack>
      )}
    </Card>
  )
}
