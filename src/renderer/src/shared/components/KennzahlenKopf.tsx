/**
 * Kopf mit Kennzahlen (09.10.2026, abgestimmt mit der Lehrkraft: „Kopf + Reiter"): eine ruhige Zeile mit den
 * wichtigsten Zahlen – gleich aussehend in der Kursseite (Sprachenlernen) und in der Fachansicht von „Meine Klassen"
 * (für JEDES Fach, mit fachpassenden Zahlen). Titel und Untertitel sind optional; eingebettet zeigt der umgebende Kopf
 * schon Klasse und Fach.
 */
import { Card, Group, Text, Tooltip, UnstyledButton } from '@mantine/core'

export interface Kennzahl {
  /** Kennung für Tests (data-kennzahl) */
  id: string
  label: string
  wert: React.ReactNode
  /** Zusatz unter dem Wert (klein, gedämpft) */
  zusatz?: React.ReactNode
  /** Farbe des Werts (Mantine-Farbname), z. B. orange für Handlungsbedarf */
  farbe?: string
  symbol?: React.ReactNode
  tooltip?: string
  klick?: () => void
}

function Zahl({ k }: { k: Kennzahl }): React.JSX.Element {
  const inhalt = (
    <div style={{ minWidth: 0 }}>
      <Text size="xs" c="dimmed" lh={1.2} truncate>
        {k.label}
      </Text>
      <Group gap={6} wrap="nowrap" mt={2}>
        {k.symbol}
        <Text fw={700} size="lg" lh={1.2} c={k.farbe ? `${k.farbe}.7` : undefined} style={{ whiteSpace: 'nowrap' }}>
          {k.wert}
        </Text>
      </Group>
      {k.zusatz && (
        <Text size="xs" c="dimmed" lh={1.3} mt={2}>
          {k.zusatz}
        </Text>
      )}
    </div>
  )
  const kasten = k.klick ? (
    <UnstyledButton onClick={k.klick} className="kennzahl kennzahl-knopf" data-kennzahl={k.id} aria-label={`${k.label}: ${typeof k.wert === 'string' || typeof k.wert === 'number' ? k.wert : ''}`}>
      {inhalt}
    </UnstyledButton>
  ) : (
    <div className="kennzahl" data-kennzahl={k.id}>
      {inhalt}
    </div>
  )
  return k.tooltip ? <Tooltip label={k.tooltip} multiline maw={300}>{kasten}</Tooltip> : kasten
}

export function KennzahlenKopf({
  titel,
  untertitel,
  links,
  rechts,
  zahlen,
  ...rest
}: {
  titel?: React.ReactNode
  untertitel?: React.ReactNode
  /** Links neben dem Titel (z. B. Lernstand-Ring) */
  links?: React.ReactNode
  /** Aktionen rechts (Menü, Knöpfe) */
  rechts?: React.ReactNode
  zahlen: Kennzahl[]
} & Record<`data-${string}`, string | boolean | undefined>): React.JSX.Element {
  return (
    <Card withBorder radius="md" padding="sm" {...rest}>
      <style>{`
        .kennzahl { padding: 6px 12px; border-radius: var(--mantine-radius-md); border-left: 1px solid var(--mantine-color-default-border); }
        .kennzahl-knopf:hover { background: var(--mantine-color-default-hover); }
        .kennzahl-knopf:focus-visible { outline: 2px solid var(--mantine-primary-color-filled); outline-offset: 1px; }
        .kennzahlen-zeile > :first-child .kennzahl, .kennzahlen-zeile > .kennzahl:first-child { border-left: 0; }
      `}</style>
      {(titel || links || rechts) && (
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm" mb={zahlen.length ? 'xs' : 0}>
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            {links}
            <div style={{ minWidth: 0 }}>
              {titel}
              {untertitel && (
                <Text size="sm" c="dimmed">
                  {untertitel}
                </Text>
              )}
            </div>
          </Group>
          {rechts}
        </Group>
      )}
      {zahlen.length > 0 && (
        <Group gap={4} className="kennzahlen-zeile" data-kennzahlen>
          {zahlen.map((k) => (
            <Zahl key={k.id} k={k} />
          ))}
        </Group>
      )}
    </Card>
  )
}
