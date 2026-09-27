import { Button, Group, Modal, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useState } from 'react'
import { MASKOTTCHEN_POSEN } from '@shared/maskottchen'
import { useMaskottchen } from '../../../shared/maskottchenStore'
import type { WsBlock } from '../model/types'

type Illustration = NonNullable<WsBlock['illustration']>

/**
 * Figur an einen Baustein heften oder ändern (26.09.2026): Maskottchen, Pose, Seite und
 * Sprechblase. „Entfernen" nimmt die Figur wieder ab.
 */
export function IllustrationDialog({
  opened,
  onClose,
  wert,
  onChange
}: {
  opened: boolean
  onClose: () => void
  wert: Illustration | undefined
  onChange: (neu: Illustration | undefined) => void
}): React.JSX.Element {
  const liste = useMaskottchen((s) => s.liste)
  const [entwurf, setEntwurf] = useState<Illustration>(wert ?? { pose: 'zeigend' })
  useEffect(() => {
    if (opened) setEntwurf(wert ?? { pose: 'zeigend' })
  }, [opened, wert])
  const figur = liste.find((m) => m.id === entwurf.maskottchenId) ?? liste[0]
  const bild = figur?.posen[entwurf.pose] || figur?.vorlage

  return (
    <Modal opened={opened} onClose={onClose} title="Maskottchen an diesem Baustein" size="md">
      <Stack gap="sm">
        {!liste.length && (
          <Text size="sm" c="dimmed">
            Noch kein Maskottchen angelegt – in den Einstellungen unter „Maskottchen und Illustrationen".
          </Text>
        )}
        <Group align="flex-start" wrap="nowrap">
          {bild && <img src={bild} alt="" style={{ width: 90, height: 120, objectFit: 'contain' }} />}
          <Stack gap="xs" style={{ flex: 1 }}>
            {liste.length > 1 && (
              <Select
                label="Figur"
                data={liste.map((m) => ({ value: m.id, label: m.name }))}
                value={figur?.id ?? null}
                onChange={(v) => v && setEntwurf({ ...entwurf, maskottchenId: v })}
                allowDeselect={false}
              />
            )}
            <Select
              label="Pose"
              data={MASKOTTCHEN_POSEN.map((p) => ({ value: p.id, label: `${p.label} – ${p.zweck}${figur && !figur.posen[p.id] ? ' (noch nicht gezeichnet)' : ''}` }))}
              value={entwurf.pose}
              onChange={(v) => v && setEntwurf({ ...entwurf, pose: v })}
              allowDeselect={false}
            />
            <SegmentedControl
              size="xs"
              data={[
                { value: 'right', label: 'rechts' },
                { value: 'left', label: 'links' }
              ]}
              value={entwurf.side ?? 'right'}
              onChange={(v) => setEntwurf({ ...entwurf, side: v as 'left' | 'right' })}
            />
            <TextInput
              label="Sprechblase (optional)"
              placeholder="Kurzer Satz für die Kinder"
              value={entwurf.bubble ?? ''}
              onChange={(e) => setEntwurf({ ...entwurf, bubble: e.currentTarget.value })}
            />
          </Stack>
        </Group>
        <Group justify="space-between">
          <Button variant="subtle" color="red" onClick={() => (onChange(undefined), onClose())} disabled={!wert}>
            Entfernen
          </Button>
          <Group>
            <Button variant="default" onClick={onClose}>
              Abbrechen
            </Button>
            <Button onClick={() => (onChange({ ...entwurf, bubble: entwurf.bubble?.trim() || undefined }), onClose())} disabled={!liste.length}>
              Übernehmen
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
