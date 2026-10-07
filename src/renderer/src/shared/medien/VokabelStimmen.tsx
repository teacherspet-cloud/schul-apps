/**
 * Einstellungen › Bilder und Hörtexte › „Aussprache der Vokabeln" (05.10.2026): Standardstimme je Sprache,
 * mit der die Sprach-KI (ElevenLabs bzw. OpenAI-Stimmen) Wörter und Beispielsätze der Medienbank spricht.
 * Am Server gilt die Wahl für alle und nur Admins ändern sie; in der Exe für die eigene Medienbank.
 *
 * Nachtrag 06.10.2026 (Wunsch der Lehrkraft):
 * - Deutsch als Sprache (DaZ/DaF-Listen).
 * - Angeboten werden nur Stimmen, die mit dem hinterlegten Schlüssel und Tarif WIRKLICH sprechen dürfen: Die Liste
 *   kommt aus dem Konto (/v2/voices, main/services/audio/elevenlabs.ts), gesperrte Bibliotheksstimmen (im kostenlosen
 *   Tarif ist jede Bibliotheksstimme über die Schnittstelle gesperrt – „paid_plan_required") fallen heraus. Ist eine
 *   schon gewählte Stimme nicht mehr nutzbar, steht der Grund darunter.
 * - „Hörprobe" ging nicht: Die mitgelieferte Adresse der Probe (storage.googleapis.com) wurde direkt abgespielt –
 *   die Sicherheitsrichtlinie des Fensters erlaubt für Ton aber nur eigene Quellen und data:. Die Probe kommt jetzt
 *   immer über den Hauptprozess bzw. Server (audio:preview) als data:-Adresse, mit Ladeanzeige und klarer Meldung.
 */
import { ActionIcon, Card, Group, Loader, Select, Stack, Text, Title, Tooltip } from '@mantine/core'
import { IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import type { TtsVoice } from '@shared/types'
import { passtZurSprache } from '../voiceFilter'
import { notifyError } from '../util'
import { useMedienAdmin } from './MedienUi'

const SPRACHEN: { code: string; name: string }[] = [
  { code: 'de', name: 'Deutsch' },
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
  const setzen = (sprache: string, stimme: string): void => void window.api.medien.stimmeSetzen(sprache, stimme).then(setWahl, (e: unknown) => notifyError(e))
  // Hörprobe: welche Sprache gerade lädt bzw. spielt
  const [probe, setProbe] = useState<{ sprache: string; laedt: boolean } | null>(null)
  const ton = useRef<HTMLAudioElement | null>(null)
  const hoerprobe = async (sprache: string, voiceId: string): Promise<void> => {
    ton.current?.pause()
    if (probe?.sprache === sprache && !probe.laedt) return setProbe(null)
    setProbe({ sprache, laedt: true })
    try {
      // Immer über den Hauptprozess/Server: eine fremde Adresse im Audio-Element blockiert die Sicherheitsrichtlinie
      const src = await window.api.audio.preview(voiceId)
      const a = new Audio(src)
      ton.current = a
      a.onended = () => setProbe((p) => (p?.sprache === sprache ? null : p))
      await a.play()
      setProbe({ sprache, laedt: false })
    } catch (e) {
      setProbe(null)
      notifyError(e, 'Die Hörprobe konnte nicht abgespielt werden')
    }
  }
  // Nur Stimmen, die mit diesem Schlüssel und Tarif sprechen dürfen
  const nutzbar = (stimmen ?? []).filter((v) => v.usable !== false)
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
      ) : !nutzbar.length ? (
        <Text size="sm" c="orange.8">
          {stimmen.length
            ? 'Keine der Stimmen des Kontos ist im aktuellen Tarif über die Schnittstelle nutzbar.'
            : 'Keine Stimmen verfügbar – zuerst oben einen ElevenLabs- oder OpenAI-Schlüssel hinterlegen.'}
          {fehler ? ` (${fehler})` : ''}
        </Text>
      ) : (
        <Stack gap={6}>
          {SPRACHEN.map((s) => {
            const passend = nutzbar.filter((v) => passtZurSprache(v, s.code))
            const liste = (passend.length ? passend : nutzbar).map((v) => ({ value: v.id, label: `${v.name}${v.language ? ` (${v.language})` : ''}` }))
            const gewaehlt = wahl[s.code]
            const v = nutzbar.find((x) => x.id === gewaehlt)
            // Gewählt, aber (nicht mehr) nutzbar – oder nicht mehr im Konto: sagen, statt still zu scheitern
            const gesperrt = gewaehlt ? stimmen.find((x) => x.id === gewaehlt && x.usable === false) : undefined
            const fehlt = gewaehlt && !v && !gesperrt
            const spielt = probe?.sprache === s.code
            return (
              <Stack key={s.code} gap={2}>
                <Group gap="xs" wrap="nowrap">
                  <Text size="sm" w={120}>
                    {s.name}
                  </Text>
                  <Select
                    size="xs"
                    style={{ flex: 1 }}
                    data={v || !gewaehlt ? liste : [{ value: gewaehlt, label: gesperrt ? `${gesperrt.name} (nicht nutzbar)` : 'unbekannte Stimme' }, ...liste]}
                    value={gewaehlt ?? null}
                    onChange={(id) => setzen(s.code, id ?? '')}
                    searchable
                    clearable
                    disabled={!admin}
                    placeholder="keine – Aussprache aus"
                    data-stimme-sprache={s.code}
                  />
                  <Tooltip label={spielt && !probe?.laedt ? 'Hörprobe anhalten' : 'Hörprobe'}>
                    <ActionIcon
                      variant="subtle"
                      disabled={!v}
                      loading={spielt && probe?.laedt}
                      onClick={() => v && void hoerprobe(s.code, v.id)}
                      aria-label={`Hörprobe ${s.name}`}
                      data-hoerprobe={s.code}
                    >
                      {spielt ? <IconPlayerStop size={14} /> : <IconPlayerPlay size={14} />}
                    </ActionIcon>
                  </Tooltip>
                </Group>
                {(gesperrt || fehlt) && (
                  <Text size="xs" c="orange.8" pl={128}>
                    {gesperrt
                      ? `Die gewählte Stimme ist mit diesem Schlüssel nicht nutzbar: ${gesperrt.unusableReason ?? 'Tarif'} Bitte eine andere wählen.`
                      : 'Die gewählte Stimme gibt es im Konto nicht mehr. Bitte eine andere wählen.'}
                  </Text>
                )}
              </Stack>
            )
          })}
        </Stack>
      )}
    </Card>
  )
}
