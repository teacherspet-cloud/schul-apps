/**
 * „Vertrauliche Hinweise“ auf der Startseite (22.10.2026, Entscheidung der Lehrkraft nach der KI-Sicherheitsprüfung):
 * Hat ein Kind etwas zu Selbstgefährdung geäußert (Sprechtraining, Lerntagebuch …), sieht die zuständige Lehrkraft hier
 * wer, wo und wann – NIE den Wortlaut. Das ist kein Vorfall und keine Sperre, sondern ein Anlass für ein Gespräch.
 * Nur eigene Hinweise (GET /server/krisen, server/krise.ts); „Gesehen“ blendet einen Hinweis aus. Nur auf dem Server.
 */
import { Button, Card, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconHeartHandshake } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { holen, senden } from '../modules/onlinetest/serverApi'

interface Hinweis {
  id: string
  schuelerId: string
  name: string
  quelle: string
  zeit: number
  gesehen?: number
}

const wann = (t: number): string =>
  new Date(t).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function KrisenHinweise(): React.JSX.Element | null {
  const [hinweise, setHinweise] = useState<Hinweis[]>([])
  useEffect(() => {
    let aktiv = true
    void holen<{ hinweise: Hinweis[] }>('/server/krisen').then(
      (r) => aktiv && setHinweise(r.hinweise ?? []),
      () => undefined
    )
    return () => {
      aktiv = false
    }
  }, [])
  const offen = hinweise.filter((h) => !h.gesehen)
  if (!offen.length) return null
  const gesehen = (id: string): void =>
    void senden('/server/krisen/gesehen', { id }).then(
      () => setHinweise((l) => l.map((h) => (h.id === id ? { ...h, gesehen: Date.now() } : h))),
      () => undefined
    )
  return (
    <Card withBorder radius="lg" padding="md" mb="lg" data-krisen-hinweise style={{ borderColor: 'var(--mantine-color-grape-5)', borderWidth: 2 }}>
      <Group gap="sm" mb="xs" wrap="nowrap" align="flex-start">
        <ThemeIcon color="grape" variant="light" radius="xl" size="lg">
          <IconHeartHandshake size={20} />
        </ThemeIcon>
        <div>
          <Text fw={800}>Vertrauliche Hinweise</Text>
          <Text size="xs" c="dimmed">
            Diese Kinder haben etwas geäußert, das auf Not oder Selbstgefährdung hindeuten kann. Die Kinder haben einen Hilfetext gesehen. Der Wortlaut wird nicht
            gespeichert. Empfehlung: behutsam das Gespräch suchen und bei Bedarf Beratungslehrkraft oder Schulsozialarbeit hinzuziehen.
          </Text>
        </div>
      </Group>
      <Stack gap={6}>
        {offen.map((h) => (
          <Group key={h.id} justify="space-between" gap="xs" wrap="nowrap" data-krisen-hinweis={h.id}>
            <Text size="sm">
              <b>{h.name}</b> · {h.quelle} · {wann(h.zeit)}
            </Text>
            <Button size="compact-xs" variant="light" color="grape" onClick={() => gesehen(h.id)} data-krisen-gesehen>
              Gesehen
            </Button>
          </Group>
        ))}
      </Stack>
    </Card>
  )
}
