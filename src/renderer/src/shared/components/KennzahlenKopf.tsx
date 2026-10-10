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
  kacheln = false,
  oben,
  ...rest
}: {
  titel?: React.ReactNode
  untertitel?: React.ReactNode
  /** Links neben dem Titel (z. B. Lernstand-Ring) */
  links?: React.ReactNode
  /** Aktionen rechts (Menü, Knöpfe) */
  rechts?: React.ReactNode
  zahlen: Kennzahl[]
  /**
   * Kompakt als Kacheln zu zweit nebeneinander statt einer Zeile (10.10.2026, Sprachklasse in „Meine Klassen": der
   * Kasten steht neben „Lernstand im Karteikasten" und „Units"); füllt die Höhe der Nachbarkarten
   */
  kacheln?: boolean
  /** Zwischen Titel und Zahlen, z. B. kleine Diagramme (10.10.2026) */
  oben?: React.ReactNode
} & Record<`data-${string}`, string | boolean | undefined>): React.JSX.Element {
  return (
    <Card withBorder radius="md" padding="sm" h={kacheln ? '100%' : undefined} {...rest}>
      <style>{`
        .kennzahl { padding: 6px 12px; border-radius: var(--mantine-radius-md); border-left: 1px solid var(--mantine-color-default-border); }
        .kennzahl-knopf:hover { background: var(--mantine-color-default-hover); }
        .kennzahl-knopf:focus-visible { outline: 2px solid var(--mantine-primary-color-filled); outline-offset: 1px; }
        .kennzahlen-zeile > :first-child .kennzahl, .kennzahlen-zeile > .kennzahl:first-child { border-left: 0; }
        .kennzahlen-kacheln { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
        .kennzahl-bild { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; padding: 6px 8px; border: 1px solid var(--mantine-color-default-border); }
        .kennzahlen-kacheln .kennzahl { display: block; width: 100%; height: 100%; padding: 6px 10px; border: 1px solid var(--mantine-color-default-border); }
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
      {oben}
      {zahlen.length > 0 && kacheln && (
        <div className="kennzahlen-kacheln" data-kennzahlen style={oben ? { marginTop: 6 } : undefined}>
          {zahlen.map((k) => (
            <Zahl key={k.id} k={k} />
          ))}
        </div>
      )}
      {zahlen.length > 0 && !kacheln && (
        <Group gap={4} className="kennzahlen-zeile" data-kennzahlen>
          {zahlen.map((k) => (
            <Zahl key={k.id} k={k} />
          ))}
        </Group>
      )}
    </Card>
  )
}
