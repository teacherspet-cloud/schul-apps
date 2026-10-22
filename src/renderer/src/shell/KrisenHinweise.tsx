/**
 * „Vertrauliche Hinweise“ auf der Startseite (22.10.2026, Entscheidung der Lehrkraft nach der KI-Sicherheitsprüfung):
 * Hat ein Kind etwas zu Selbstgefährdung geäußert (Sprechtraining, Lerntagebuch …), sieht die zuständige Lehrkraft hier
 * wer, wo und wann – NIE den Wortlaut. Das ist kein Vorfall und keine Sperre, sondern ein Anlass für ein Gespräch.
 * Nur eigene Hinweise (GET /server/krisen, server/krise.ts); „Gesehen“ blendet einen Hinweis aus. Nur auf dem Server.
 *
 * Meldeweg nach § 4 KKG (23.10.2026, Prüfung des Schulträgers): Vertrauenspersonen der Schule bekommen dieselben
 * Hinweise (Verwaltung › Schule › Krisenhinweise). Die Karte zeigt je Hinweis die weiteren Empfänger und wer ihn zuerst
 * gesehen hat, dann die Meldekette der Schule und danach allgemeine Hinweise „Was tun?“. Roter Zähler im Kopf.
 */
import { Alert, Badge, Button, Card, Group, List, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconHeartHandshake } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { holen, senden } from '../modules/onlinetest/serverApi'
import { krisenGeaendert } from './krisenPush'

type Art = 'lehrkraft' | 'vertrauen'

interface Hinweis {
  id: string
  schuelerId: string
  name: string
  quelle: string
  zeit: number
  gesehen?: number
  art?: Art
  weitere?: { name: string; art: Art }[]
  erstGesehen?: { name: string; zeit: number; selbst: boolean }
  erinnert?: number
}

const wann = (t: number): string =>
  new Date(t).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Wer außerdem informiert ist (Lehrkraft bzw. Vertrauenspersonen) */
function beteiligte(h: Hinweis): string {
  const w = h.weitere ?? []
  const lk = w.filter((x) => x.art === 'lehrkraft').map((x) => x.name)
  const vp = w.filter((x) => x.art === 'vertrauen').map((x) => x.name)
  const teile: string[] = []
  if (h.art === 'vertrauen') teile.push(lk.length ? `Als Vertrauensperson informiert · zuständige Lehrkraft: ${lk.join(', ')}` : 'Als Vertrauensperson informiert')
  if (vp.length) teile.push(`${h.art === 'vertrauen' ? 'Weitere Vertrauenspersonen' : 'Ebenfalls informiert'}: ${vp.join(', ')}`)
  return teile.join(' · ')
}

/** Allgemeine Hinweise (23.10.2026, Prüfung des Schulträgers) – nach der Meldekette der Schule */
function WasTun(): React.JSX.Element {
  return (
    <div data-krisen-was-tun>
      <Text size="sm" fw={700}>
        Was tun?{' '}
        <Text span size="xs" c="dimmed" fw={400}>
          Allgemeine Hinweise – die Meldekette der Schule geht vor.
        </Text>
      </Text>
      <List size="sm" spacing={2} mt={4}>
        <List.Item>Bald und in Ruhe das Gespräch mit dem Kind suchen: zuhören, ernst nehmen, keine Verschwiegenheit versprechen.</List.Item>
        <List.Item>Die Vertrauensperson der Schule (Beratungslehrkraft, Schulsozialarbeit) einbeziehen.</List.Item>
        <List.Item>
          Bei akuter Gefahr: Notruf <b>112</b>.
        </List.Item>
        <List.Item>
          Nummer gegen Kummer für Kinder und Jugendliche: <b>116 111</b> (kostenlos, anonym).
        </List.Item>
        <List.Item>
          § 4 KKG: Bei der Einschätzung einer möglichen Kindeswohlgefährdung besteht Anspruch auf Beratung durch eine insoweit erfahrene Fachkraft
          (vermittelt über das Jugendamt, ohne Namen des Kindes).
        </List.Item>
      </List>
    </div>
  )
}

export default function KrisenHinweise(): React.JSX.Element | null {
  const [hinweise, setHinweise] = useState<Hinweis[]>([])
  const [kette, setKette] = useState('')
  useEffect(() => {
    let aktiv = true
    void holen<{ hinweise: Hinweis[]; kette?: string }>('/server/krisen').then(
      (r) => {
        if (!aktiv) return
        setHinweise(r.hinweise ?? [])
        setKette(r.kette ?? '')
      },
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
      () => {
        setHinweise((l) => l.map((h) => (h.id === id ? { ...h, gesehen: Date.now() } : h)))
        krisenGeaendert()
      },
      () => undefined
    )
  return (
    <Card withBorder radius="lg" padding="md" mb="lg" data-krisen-hinweise style={{ borderColor: 'var(--mantine-color-grape-5)', borderWidth: 2 }}>
      <Group gap="sm" mb="xs" wrap="nowrap" align="flex-start">
        <ThemeIcon color="grape" variant="light" radius="xl" size="lg">
          <IconHeartHandshake size={20} />
        </ThemeIcon>
        <div style={{ flex: 1 }}>
          <Group gap="xs">
            <Text fw={800}>Vertrauliche Hinweise</Text>
            <Badge color="red" variant="filled" size="sm" data-krisen-zahl={offen.length}>
              {offen.length} neu
            </Badge>
          </Group>
          <Text size="xs" c="dimmed">
            Diese Kinder haben etwas geäußert, das auf Not oder Selbstgefährdung hindeuten kann. Die Kinder haben einen Hilfetext gesehen. Der Wortlaut wird nicht
            gespeichert.
          </Text>
        </div>
      </Group>
      <Stack gap={6} mb="sm">
        {offen.map((h) => {
          const wer = beteiligte(h)
          return (
            <Group key={h.id} justify="space-between" gap="xs" wrap="nowrap" align="flex-start" data-krisen-hinweis={h.id}>
              <div>
                <Text size="sm">
                  <b>{h.name}</b> · {h.quelle} · {wann(h.zeit)}
                </Text>
                {wer && (
                  <Text size="xs" c="dimmed" data-krisen-beteiligte>
                    {wer}
                  </Text>
                )}
                {h.erstGesehen && !h.erstGesehen.selbst && (
                  <Text size="xs" c="teal.8" data-krisen-erst-gesehen>
                    Gesehen von {h.erstGesehen.name} ({wann(h.erstGesehen.zeit)})
                  </Text>
                )}
                {!h.erstGesehen && h.erinnert && (
                  <Text size="xs" c="red.8">
                    Seit über 24 Stunden von niemandem als gesehen markiert.
                  </Text>
                )}
              </div>
              <Button size="compact-xs" variant="light" color="grape" onClick={() => gesehen(h.id)} data-krisen-gesehen>
                Gesehen
              </Button>
            </Group>
          )
        })}
      </Stack>
      {kette ? (
        <Alert color="grape" variant="light" title="Meldekette der Schule" mb="sm" data-krisen-kette>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {kette}
          </Text>
        </Alert>
      ) : (
        <Text size="xs" c="dimmed" mb="sm">
          Eine Meldekette der Schule ist noch nicht hinterlegt (Verwaltung › Schule › Krisenhinweise).
        </Text>
      )}
      <WasTun />
    </Card>
  )
}
