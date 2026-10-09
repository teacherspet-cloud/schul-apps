/**
 * Geplante Freischaltungen aus Sicht der Lernenden (09.10.2026, abgestimmt mit der Lehrkraft; Server: server/planen.ts):
 *  - „Demnächst": grauer Hinweis im Fachordner („Ab Mo., 13.10.: Unit 2 · Station 1") – nur Titel und Datum, kein Inhalt.
 *  - „Neu freigeschaltet": beim nächsten Öffnen einmal ein Hinweis auf das, was seitdem frei wurde; „Alles klar" merkt
 *    es sich auf dem Server (je Person, nur ein Zeitpunkt).
 */
import { Button, Card, Group, List, Modal, Stack, Text, Title } from '@mantine/core'
import { IconClock, IconSparkles } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { demnaechstText, kurzDatum, PLAN_NAME, type PlanEintrag, type PlanTyp } from '@shared/freigabePlan'
import { holen, senden } from '../../onlinetest/serverApi'
import { fachName, type Register } from './beschriftung'

interface Daten {
  demnaechst: PlanEintrag[]
  neu: PlanEintrag[]
}

/** Einmal je Seitenaufruf laden – Regal und Ordner teilen sich die Antwort */
let anfrage: Promise<Daten> | null = null
let gesehen = false
function laden(): Promise<Daten> {
  if (!window.__schulappsServer?.angemeldet) return Promise.resolve({ demnaechst: [], neu: [] })
  anfrage ??= holen<Daten>('/s/api/geplant').catch(() => ({ demnaechst: [], neu: [] }))
  return anfrage
}

function useGeplant(): Daten | null {
  const [d, setD] = useState<Daten | null>(null)
  useEffect(() => {
    let aktiv = true
    void laden().then((x) => aktiv && setD(x))
    return () => {
      aktiv = false
    }
  }, [])
  return d
}

/** Register des Fachordners, in dem das Material erscheinen wird */
const REGISTER: Record<PlanTyp, Register> = { vok: 'vok', gram: 'gram', blatt: 'mat', tafel: 'mat', feedback: 'mat', reihe: 'mat' }

/**
 * Grauer Hinweis „Demnächst" im Fachordner (ohne Register: alles des Fachs). Im Regal (`ausser` = vorhandene Ordner): was
 * in Fächern kommt, für die es noch keinen Ordner gibt.
 */
export function Demnaechst({
  fach,
  register,
  vorhanden,
  ausser
}: {
  fach?: string
  register?: Register
  /** Register des Ordners – was in ein (noch) fehlendes Register gehört, steht im ersten */
  vorhanden?: Register[]
  ausser?: string[]
}): React.JSX.Element | null {
  const d = useGeplant()
  const passt = (r: Register): boolean => !register || r === register || (!(vorhanden ?? []).includes(r) && register === (vorhanden ?? [])[0])
  const liste = (d?.demnaechst ?? []).filter((e) =>
    fach !== undefined ? fachName(e.fach) === fach && passt(REGISTER[e.typ]) : !(ausser ?? []).includes(fachName(e.fach))
  )
  if (!liste.length) return null
  return (
    <Stack gap={2} mb="sm" data-demnaechst style={{ opacity: 0.75 }}>
      <Group gap={4}>
        <IconClock size={14} />
        <Text size="sm" fw={700} c="dimmed">
          Demnächst
        </Text>
      </Group>
      {liste.map((e) => (
        <Text key={`${e.typ}:${e.id}:${e.teil ?? ''}`} size="sm" c="dimmed" data-demnaechst-eintrag={e.titel}>
          {demnaechstText(e)}
        </Text>
      ))}
    </Stack>
  )
}

/** Einmaliger Hinweis „Neu freigeschaltet" */
export function NeuFreigeschaltet(): React.JSX.Element | null {
  const d = useGeplant()
  const [zu, setZu] = useState(gesehen)
  const neu = d?.neu ?? []
  if (zu || !neu.length) return null
  const ok = (): void => {
    gesehen = true
    setZu(true)
    void senden('/s/api/geplant/gesehen', {}).catch(() => undefined)
  }
  return (
    <Modal opened onClose={ok} title="Neu freigeschaltet" centered>
      <Stack gap="sm" data-neu-freigeschaltet>
        <Group gap={6}>
          <IconSparkles size={18} color="var(--mantine-color-yellow-6)" />
          <Text size="sm">Seit deinem letzten Besuch ist für dich neu dazugekommen:</Text>
        </Group>
        <List size="sm" spacing={4}>
          {neu.map((e) => (
            <List.Item key={`${e.typ}:${e.id}:${e.teil ?? ''}`} data-neu-eintrag={e.titel}>
              <b>{e.titel}</b>{' '}
              <Text span size="xs" c="dimmed">
                ({PLAN_NAME[e.typ]}
                {e.fach ? ` · ${fachName(e.fach)}` : ''})
              </Text>
            </List.Item>
          ))}
        </List>
        <Group justify="flex-end">
          <Button onClick={ok} data-neu-ok>
            Alles klar
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/** „am Di., 13.10., 07:30 Uhr" */
export const freischaltZeit = (ab: number): string =>
  `${kurzDatum(ab)}, ${new Date(ab).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`

/**
 * Code-Seite vor einer geplanten Freischaltung (09.10.2026): Die Person ist schon eingetragen – das Material erscheint
 * zum Zeitpunkt von selbst in ihren Materialien.
 */
export function FreischaltungHinweis({ ab, titel, art }: { ab: number; titel?: string; art?: string }): React.JSX.Element {
  return (
    <Card withBorder padding="lg" data-freischaltung-hinweis={ab}>
      {art && (
        <Text c="dimmed" size="sm">
          {art}
        </Text>
      )}
      {titel && (
        <Title order={3} mb="sm">
          {titel}
        </Title>
      )}
      <Group gap={6} wrap="nowrap" mb="xs">
        <IconClock size={18} />
        <Text fw={600}>Dieses Material wird am {freischaltZeit(ab)} freigeschaltet.</Text>
      </Group>
      <Text size="sm" c="dimmed">
        Du bist schon dabei – ab dann findest du es in deinen Materialien.
      </Text>
      <Button component="a" href="/s/" variant="light" mt="md" w="fit-content">
        Zu meinen Materialien
      </Button>
    </Card>
  )
}
