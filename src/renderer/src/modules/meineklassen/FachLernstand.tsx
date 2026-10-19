/**
 * Lernstand einer Klasse ohne Sprachfach in „Meine Klassen" (19.10.2026, abgestimmt mit der Lehrkraft): dieselbe Reihe
 * aus Kästen wie in Sprachklassen (SprachLernstand.tsx), immer sichtbar – auch ohne Material, dann mit Platzhalter:
 *  - vorn „Auf einen Blick" (FachKopf kompakt: Ring „Lernziele erreicht", Punkte „Blatt abgegeben"),
 *  - „Lernstand in Reihen & Blättern" statt „Lernstand im Karteikasten": je laufende Reihe ein Balken (fertig /
 *    begonnen / noch nicht begonnen), darunter je offenes Blatt einer (eingereicht / begonnen / offen), Neuestes oben,
 *  - „Reihen & Blätter" statt „Units": laufende und geplante Reihen/Blätter mit „+ Reihe" und „+ Arbeitsblatt".
 * Breite Schirme drei Karten nebeneinander, mit „Passendes Material" zwei Spalten, auf dem Handy eine.
 */
import { Badge, Button, Card, Group, Progress, SimpleGrid, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconFileText, IconPlus, IconRoute } from '@tabler/icons-react'

interface ReiheKurz {
  zid: string
  titel: string
  fertig: number
  lernende: number
  status: 'offen' | 'beendet'
  erstellt: string
  schritte: number
  nichtBegonnen: string[]
  geplantAb?: number | null
}

interface BlattKurz {
  id: string
  titel: string
  status: 'offen' | 'beendet'
  erstellt: string
  bis: number | null
  gesamt: number
  begonnen: number
  eingereicht: number
  geplantAb?: number | null
}

const tag = (x: number): string => new Date(x).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
const ms = (iso: string): number => Date.parse(iso) || 0
const geplant = (x: { geplantAb?: number | null }, jetzt: number): boolean => Boolean(x.geplantAb && x.geplantAb > jetzt)

/** Anteile je Reihe/Blatt – rein rechnend (auch für Tests) */
export function fachLernstand(
  reihen: ReiheKurz[],
  blaetter: BlattKurz[],
  jetzt = Date.now()
): {
  reihen: { id: string; titel: string; fertig: number; begonnen: number; offen: number; von: number }[]
  blaetter: { id: string; titel: string; eingereicht: number; begonnen: number; offen: number; von: number; bis: number | null }[]
} {
  return {
    reihen: reihen
      .filter((r) => r.status === 'offen' && !geplant(r, jetzt))
      .sort((a, b) => ms(b.erstellt) - ms(a.erstellt))
      .map((r) => {
        const von = Math.max(r.lernende, 0)
        const fertig = Math.min(r.fertig, von)
        const offen = Math.min(r.nichtBegonnen.length, von - fertig)
        return { id: r.zid, titel: r.titel, fertig, begonnen: von - fertig - offen, offen, von }
      }),
    blaetter: blaetter
      .filter((b) => b.status === 'offen' && !geplant(b, jetzt))
      .sort((a, b) => ms(b.erstellt) - ms(a.erstellt))
      .map((b) => {
        const von = Math.max(b.gesamt, 0)
        const eingereicht = Math.min(b.eingereicht, von)
        // „begonnen" zählt auch die Eingereichten mit
        const begonnen = Math.max(0, Math.min(b.begonnen, von) - eingereicht)
        return { id: b.id, titel: b.titel, eingereicht, begonnen, offen: von - eingereicht - begonnen, von, bis: b.bis }
      })
  }
}

function Balken({ teile, label }: { teile: { wert: number; farbe: string }[]; label: string }): React.JSX.Element {
  const summe = Math.max(1, teile.reduce((a, t) => a + t.wert, 0))
  return (
    <Tooltip label={label}>
      <Progress.Root size="md" radius="xl" style={{ flex: 1, gap: 2, minWidth: 32 }}>
        {teile.map((t, i) => (
          <Progress.Section key={i} value={(t.wert / summe) * 100} color={t.farbe} />
        ))}
      </Progress.Root>
    </Tooltip>
  )
}

const ZEILEN = 5

export function FachLernstand({
  reihen,
  blaetter,
  kopf,
  material,
  zuReihen,
  reiheErstellen,
  blattErstellen
}: {
  reihen: ReiheKurz[]
  blaetter: BlattKurz[]
  /** „Auf einen Blick" (FachKopf kompakt) – vorn in der Reihe */
  kopf: React.ReactNode
  /** „Passendes Material" – in derselben Reihe */
  material?: React.ReactNode
  /** Zum Reiter „Unterrichtsreihen & Blätter" */
  zuReihen: () => void
  reiheErstellen: () => void
  blattErstellen: () => void
}): React.JSX.Element {
  const jetzt = Date.now()
  const stand = fachLernstand(reihen, blaetter, jetzt)
  const zeile = (titel: string, rechts: string, balken: React.ReactNode, key: string): React.JSX.Element => (
    <div key={key}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text size="sm" truncate>
          {titel}
        </Text>
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          {rechts}
        </Text>
      </Group>
      <Group mt={2}>{balken}</Group>
    </div>
  )
  // „Reihen & Blätter": laufende und geplante, Neuestes oben
  const liste = [
    ...reihen.filter((r) => r.status === 'offen').map((r) => ({ art: 'reihe' as const, id: r.zid, titel: r.titel, erstellt: ms(r.erstellt), geplantAb: r.geplantAb, info: `${r.schritte} Schritte` })),
    ...blaetter
      .filter((b) => b.status === 'offen')
      .map((b) => ({ art: 'blatt' as const, id: b.id, titel: b.titel, erstellt: ms(b.erstellt), geplantAb: b.geplantAb, info: b.bis ? `bis ${tag(b.bis)}` : '' }))
  ].sort((a, b) => b.erstellt - a.erstellt)
  const mehr = stand.reihen.length + stand.blaetter.length > ZEILEN
  return (
    <SimpleGrid cols={material ? { base: 1, sm: 2 } : { base: 1, sm: 2, lg: 3 }} spacing="md" data-fach-lernstand>
      <style>{`
        @media (max-width: 700px) {
          [data-fach-lernstand] > .mantine-Card-root { --card-padding: 10px !important; padding: 10px; }
        }
      `}</style>
      {kopf}
      <Card withBorder radius="md" padding="md" h="100%" data-fach-lernstand-kasten>
        <Group justify="space-between" mb="xs">
          <Text fw={700}>Lernstand in Reihen & Blättern</Text>
          <Text size="xs" c="dimmed">
            alle Lernenden
          </Text>
        </Group>
        {stand.reihen.length + stand.blaetter.length ? (
          <Stack gap={8}>
            {stand.reihen.slice(0, ZEILEN).map((r) =>
              zeile(
                r.titel,
                `${r.fertig} von ${r.von} fertig`,
                <Balken
                  label={`fertig ${r.fertig} · begonnen ${r.begonnen} · noch nicht begonnen ${r.offen}`}
                  teile={[
                    { wert: r.fertig, farbe: 'teal' },
                    { wert: r.begonnen, farbe: 'yellow' },
                    { wert: r.offen, farbe: 'gray.4' }
                  ]}
                />,
                `r-${r.id}`
              )
            )}
            {stand.blaetter.slice(0, Math.max(0, ZEILEN - stand.reihen.length)).map((b) =>
              zeile(
                b.titel,
                `${b.eingereicht} von ${b.von} eingereicht`,
                <Balken
                  label={`eingereicht ${b.eingereicht} · begonnen ${b.begonnen} · offen ${b.offen}`}
                  teile={[
                    { wert: b.eingereicht, farbe: 'teal' },
                    { wert: b.begonnen, farbe: 'yellow' },
                    { wert: b.offen, farbe: 'gray.4' }
                  ]}
                />,
                `b-${b.id}`
              )
            )}
            {mehr && (
              <Button size="compact-xs" variant="subtle" onClick={zuReihen} style={{ alignSelf: 'flex-start' }}>
                Alle anzeigen
              </Button>
            )}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed" data-lernstand-leer>
            Noch keine laufende Reihe und kein offenes Blatt – der Lernstand erscheint, sobald etwas freigeschaltet ist.
          </Text>
        )}
      </Card>
      <Card withBorder radius="md" padding="md" h="100%" data-fach-reihen-blaetter>
        <Group justify="space-between" mb="xs" gap="xs">
          <Text fw={700}>Reihen & Blätter</Text>
          <Group gap={4} justify="flex-end">
            <Button size="compact-xs" variant="light" leftSection={<IconPlus size={12} />} onClick={reiheErstellen} data-fach-reihe-erstellen>
              Reihe erstellen
            </Button>
            <Button size="compact-xs" variant="light" leftSection={<IconPlus size={12} />} onClick={blattErstellen} data-fach-blatt-erstellen>
              Arbeitsblatt erstellen
            </Button>
            <Button size="compact-xs" variant="subtle" onClick={zuReihen}>
              Alle anzeigen
            </Button>
          </Group>
        </Group>
        {liste.length ? (
          <Stack gap={4}>
            {liste.slice(0, 6).map((e) => (
              <UnstyledButton key={`${e.art}-${e.id}`} onClick={zuReihen} data-fach-eintrag={e.art}>
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                    {e.art === 'reihe' ? <IconRoute size={14} style={{ flexShrink: 0 }} /> : <IconFileText size={14} style={{ flexShrink: 0 }} />}
                    <Text size="sm" truncate>
                      {e.titel}
                    </Text>
                  </Group>
                  {geplant(e, jetzt) ? (
                    <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
                      ab {tag(e.geplantAb!)}
                    </Badge>
                  ) : (
                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                      {e.info}
                    </Text>
                  )}
                </Group>
              </UnstyledButton>
            ))}
            {liste.length > 6 && (
              <Text size="xs" c="dimmed">
                und {liste.length - 6} weitere
              </Text>
            )}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed" data-reihen-leer>
            Noch keine Unterrichtsreihen oder Blätter in dieser Lerngruppe.
          </Text>
        )}
      </Card>
      {material}
    </SimpleGrid>
  )
}

