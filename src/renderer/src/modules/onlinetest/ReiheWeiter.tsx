/**
 * „Weiter: <nächster Schritt>" (08.10.2026, Wunsch der Lehrkraft; Rechnung: shared/reiheWeiter.ts) – nach dem Einreichen
 * eines Blatts der Reihe, auf geschafften Schrittseiten und oben auf dem Weg. Dazu „Zurück zur Reihe".
 */
import { Alert, Button, Card, Group, Stack, Text } from '@mantine/core'
import { IconArrowLeft, IconArrowRight, IconMedal } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { SchrittLage } from '@shared/reihe'
import { naechsterSchritt, schrittErledigt, schrittZiel, schrittZumLink, type WegSchritt } from '@shared/reiheWeiter'
import { holen } from './serverApi'

export interface WegDaten {
  id: string
  titel: string
  schritte: WegSchritt[]
  weg: { schritte: SchrittLage[]; fertig: boolean }
}

/** Knopf zum nächsten offenen Schritt (oder Hinweis, dass alles geschafft ist) */
export function WeiterKnopf({
  d,
  aktuell,
  zurueck = true,
  praefix = 'Weiter'
}: {
  d: WegDaten
  aktuell?: string
  zurueck?: boolean
  /** „Weiter" nach einem Schritt, „Weiter mit" oben auf dem Weg */
  praefix?: string
}): React.JSX.Element | null {
  const naechster = naechsterSchritt(d.schritte, d.weg.schritte, aktuell)
  if (!naechster && !zurueck) return null
  return (
    <Group gap="xs" wrap="wrap">
      {naechster && (
        <Button
          component="a"
          href={schrittZiel(d.id, naechster)}
          size="md"
          rightSection={<IconArrowRight size={18} />}
          style={{ maxWidth: '100%' }}
          styles={{ label: { whiteSpace: 'normal', textAlign: 'left' }, inner: { height: 'auto', paddingBlock: 6 } }}
          h="auto"
          data-reihe-weiter={naechster.id}
        >
          {praefix}: {naechster.titel}
        </Button>
      )}
      {zurueck && (
        <Button component="a" href={`/s/r/${d.id}`} variant="light" leftSection={<IconArrowLeft size={16} />} data-zurueck-zur-reihe>
          Zurück zur Reihe
        </Button>
      )}
    </Group>
  )
}

/**
 * Unter einem Blatt der Reihe nach dem Einreichen: Stand des Schritts und der Weg weiter. `stand` ändert sich mit jeder
 * Einreichung – dann wird neu geladen (der Schritt kann inzwischen geschafft sein).
 */
export function ReiheWeiterNachBlatt({ zid, blattId, stand }: { zid: string; blattId: string; stand: number }): React.JSX.Element | null {
  const [d, setD] = useState<WegDaten | null>(null)
  useEffect(() => {
    let aktiv = true
    void holen<WegDaten>(`/s/api/reihe?id=${encodeURIComponent(zid)}`).then(
      (x) => aktiv && setD(x),
      () => aktiv && setD(null)
    )
    return () => {
      aktiv = false
    }
  }, [zid, stand])
  if (!d) return null
  const s = schrittZumLink(d.schritte, `/s/b/${blattId}`)
  const lage = s ? d.weg.schritte.find((l) => l.id === s.id) : undefined
  const erledigt = schrittErledigt(lage)
  return (
    <Card withBorder padding="md" radius="md" style={{ borderColor: erledigt ? 'var(--mantine-color-green-5)' : undefined }} data-reihe-weiter-karte>
      <Stack gap="xs">
        {lage?.status === 'geschafft' || lage?.status === 'uebersprungen' ? (
          <Text fw={700} c="green.8" data-schritt-geschafft>
            Geschafft! {s?.titel ? `„${s.titel}“ ist erledigt.` : ''}
          </Text>
        ) : lage?.status === 'eingereicht' ? (
          <Text size="sm">Eingereicht{lage.wartet ? ' – deine Lehrkraft sieht es sich an.' : '.'} Du kannst schon weitermachen.</Text>
        ) : lage?.status === 'nicht_geschafft' || lage?.status === 'offen' ? (
          <Text size="sm" c="dimmed">
            {lage.hinweis || 'Sieh dir die Hinweise an deinen Aufgaben an und überarbeite das Blatt – oder mach erst woanders weiter.'}
          </Text>
        ) : null}
        {d.weg.fertig && (
          <Alert color="green" icon={<IconMedal />} p="xs">
            Du hast die ganze Reihe geschafft!
          </Alert>
        )}
        <WeiterKnopf d={d} aktuell={s?.id} />
      </Stack>
    </Card>
  )
}
