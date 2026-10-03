/**
 * Schnellzugriff auf der Startseite (03.10.2026, abgestimmt mit der Lehrkraft): statt Programmliste,
 * Themenbereichen und Fachschaftsfreigaben die wichtigsten laufenden Dinge –
 *  - laufende Unterrichtsreihen mit Handlungsbedarf,
 *  - Onlinetests: geplant, laufend, zu prüfen,
 *  - Freigaben & Rückmeldungen mit neuen Abgaben,
 *  - Termine & Vokabeltraining: anstehende Vokabeltests mit Prognose, Haltepunkte in Reihen.
 * Nur mit dem Schul-Apps-Server (die Exe ohne Server hat diese Dinge nicht).
 */
import { Badge, Button, Card, Group, Progress, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { IconAlertCircle, IconCalendarEvent, IconChalkboard, IconDeviceLaptop, IconShare, IconFlag, IconPlayerPlay } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { holen } from '../modules/onlinetest/serverApi'
import { openDocument, openModule } from '../shared/navigation'
import { oeffneReihe, ReiheKarte, useLaufendeReihen } from '../modules/unterrichtsreihe/LaufendeReihenModule'
import { oeffneFreigabe, useFreigaben } from '../modules/freigaben/FreigegebeneBlaetterModule'

interface TestKurz {
  id: string
  titel: string
  status: 'wartend' | 'offen' | 'beendet'
  lerngruppe: string
  teilnehmer: number
  abgegeben: number
  offen: number
  zuEntscheiden: number
  erstellt: string
}
interface RueckmeldungKurz {
  id: string
  titel: string
  status: string
  art?: string
  lerngruppe: string
  abgaben: number
}
interface VokabelKurz {
  id: string
  titel: string
  lerngruppe: string
  lernende: number
  sicherSchnitt: number
  testTermin: number | null
  status: string
}

function Bereich(p: {
  titel: string
  symbol: React.ReactNode
  farbe: string
  alle?: () => void
  children: React.ReactNode
  daten?: string
}): React.JSX.Element {
  return (
    <Card withBorder radius="lg" padding="md" data-schnellzugriff={p.daten}>
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <ThemeIcon variant="light" color={p.farbe} radius="md">
            {p.symbol}
          </ThemeIcon>
          <Text fw={700}>{p.titel}</Text>
        </Group>
        {p.alle && (
          <Button size="compact-xs" variant="subtle" onClick={p.alle}>
            Alle
          </Button>
        )}
      </Group>
      <Stack gap={6}>{p.children}</Stack>
    </Card>
  )
}

const Leer = ({ text }: { text: string }): React.JSX.Element => (
  <Text size="sm" c="dimmed">
    {text}
  </Text>
)

export function Schnellzugriff(): React.JSX.Element {
  const { reihen } = useLaufendeReihen()
  const { liste: blaetter } = useFreigaben()
  const [tests, setTests] = useState<TestKurz[] | null>(null)
  const [rueck, setRueck] = useState<RueckmeldungKurz[] | null>(null)
  const [vok, setVok] = useState<VokabelKurz[] | null>(null)
  useEffect(() => {
    void holen<{ tests: TestKurz[] }>('/server/onlinetest').then(
      (d) => setTests(d.tests),
      () => setTests([])
    )
    void holen<{ freigaben: RueckmeldungKurz[] }>('/server/feedback').then(
      (d) => setRueck(d.freigaben),
      () => setRueck([])
    )
    void holen<{ zuweisungen: VokabelKurz[] }>('/server/vokabeln').then(
      (d) => setVok(d.zuweisungen),
      () => setVok([])
    )
  }, [])

  const bedarf = (reihen ?? []).reduce((s, r) => s + r.bedarf, 0)
  const geplant = (tests ?? []).filter((t) => t.status === 'wartend')
  const laufend = (tests ?? []).filter((t) => t.status === 'offen')
  const zuPruefen = (tests ?? []).filter((t) => t.status === 'beendet' && (t.offen > 0 || t.zuEntscheiden > 0))
  const blattOffen = (blaetter ?? []).filter((b) => b.status === 'offen')
  const rueckOffen = (rueck ?? []).filter((r) => r.status === 'offen' && !r.art)
  const jetzt = Date.now()
  const termine = (vok ?? []).filter((v) => v.status === 'offen' && v.testTermin && v.testTermin >= jetzt - 864e5).sort((a, b) => a.testTermin! - b.testTermin!)
  const halte = (reihen ?? []).flatMap((r) => r.halte.map((h) => ({ r, h })))

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mb={40} data-schnellzugriff-raster>
      <Bereich titel="Laufende Unterrichtsreihen" symbol={<IconChalkboard size={18} />} farbe="violet" alle={() => openModule('laufendereihen')} daten="reihen">
        {bedarf > 0 && (
          <Button
            variant="light"
            color="red"
            size="xs"
            leftSection={<IconAlertCircle size={14} />}
            onClick={() => openModule('laufendereihen')}
            w="fit-content"
          >
            {bedarf} × Handlungsbedarf (Abgaben, Fragen, Hilferufe)
          </Button>
        )}
        {reihen === null ? null : reihen.length ? (
          reihen.slice(0, 2).map((r) => <ReiheKarte key={r.zid} r={r} />)
        ) : (
          <Leer text="Gerade läuft keine Unterrichtsreihe." />
        )}
        {(reihen?.length ?? 0) > 2 && (
          <Text size="xs" c="dimmed">
            und {reihen!.length - 2} weitere
          </Text>
        )}
      </Bereich>

      <Bereich titel="Onlinetests" symbol={<IconDeviceLaptop size={18} />} farbe="teal" alle={() => openModule('onlinetest')} daten="tests">
        {tests === null ? null : !geplant.length && !laufend.length && !zuPruefen.length ? <Leer text="Kein Test geplant oder offen." /> : null}
        {laufend.map((t) => (
          <Zeile
            key={t.id}
            titel={t.titel}
            unter={`${t.lerngruppe || 'Gäste'} · ${t.abgegeben}/${t.teilnehmer} abgegeben`}
            onClick={() => void openDocument('onlinetest', t.id)}
          >
            <Badge color="green" leftSection={<IconPlayerPlay size={10} />}>
              läuft
            </Badge>
          </Zeile>
        ))}
        {geplant.map((t) => (
          <Zeile key={t.id} titel={t.titel} unter={`${t.lerngruppe || 'Gäste'} · noch nicht gestartet`} onClick={() => void openDocument('onlinetest', t.id)}>
            <Badge variant="light">geplant</Badge>
          </Zeile>
        ))}
        {zuPruefen.map((t) => (
          <Zeile
            key={t.id}
            titel={t.titel}
            unter={`${t.lerngruppe || 'Gäste'} · ${t.zuEntscheiden + t.offen} Antworten zu prüfen`}
            onClick={() => void openDocument('onlinetest', t.id)}
          >
            <Badge color="orange" variant="light">
              prüfen
            </Badge>
          </Zeile>
        ))}
      </Bereich>

      <Bereich titel="Freigaben & Rückmeldungen" symbol={<IconShare size={18} />} farbe="blue" alle={() => openModule('freigaben')} daten="freigaben">
        {blaetter === null || rueck === null ? null : !blattOffen.length && !rueckOffen.length ? <Leer text="Nichts freigegeben." /> : null}
        {blattOffen.slice(0, 5).map((b) => (
          <Zeile
            key={b.id}
            titel={b.titel}
            unter={`${b.lerngruppe || 'Gäste'} · ${b.begonnen} begonnen · ${b.abgaben} eingereicht`}
            onClick={() => (oeffneFreigabe(b.id), openModule('freigaben'))}
          >
            {b.zuletzt > jetzt - 2 * 864e5 && b.abgaben > 0 ? <Badge color="green">neu</Badge> : <Badge variant="light">Arbeitsblatt</Badge>}
          </Zeile>
        ))}
        {rueckOffen.slice(0, 4).map((r) => (
          <Zeile key={r.id} titel={r.titel} unter={`${r.lerngruppe || 'Gäste'} · ${r.abgaben} Abgaben`} onClick={() => openModule('rueckmeldung')}>
            <Badge variant="light" color="green">
              Rückmeldung
            </Badge>
          </Zeile>
        ))}
      </Bereich>

      <Bereich
        titel="Termine & Vokabeltraining"
        symbol={<IconCalendarEvent size={18} />}
        farbe="orange"
        alle={() => openModule('vokabeltraining')}
        daten="termine"
      >
        {vok === null || reihen === null ? null : !termine.length && !halte.length ? <Leer text="Keine anstehenden Termine." /> : null}
        {termine.slice(0, 4).map((v) => {
          const tage = Math.round((v.testTermin! - jetzt) / 864e5)
          return (
            <div key={v.id}>
              <Zeile
                titel={v.titel}
                unter={`${v.lerngruppe} · Test ${tage <= 0 ? 'heute' : tage === 1 ? 'morgen' : `in ${tage} Tagen`} (${new Date(v.testTermin!).toLocaleDateString('de-DE')})`}
                onClick={() => openModule('vokabeltraining')}
              >
                <Badge variant="light" color={v.sicherSchnitt >= 0.7 ? 'green' : v.sicherSchnitt >= 0.4 ? 'yellow' : 'red'}>
                  {Math.round(v.sicherSchnitt * 100)} % sicher
                </Badge>
              </Zeile>
              <Progress value={v.sicherSchnitt * 100} size="xs" color={v.sicherSchnitt >= 0.7 ? 'green' : v.sicherSchnitt >= 0.4 ? 'yellow' : 'red'} />
            </div>
          )
        })}
        {halte.slice(0, 4).map(({ r, h }) => (
          <Zeile key={`${r.zid}-${h}`} titel={`Haltepunkt: ${h}`} unter={`${r.titel} · ${r.gruppe}`} onClick={() => oeffneReihe(r.zid)}>
            <IconFlag size={16} color="var(--mantine-color-violet-6)" />
          </Zeile>
        ))}
      </Bereich>
    </SimpleGrid>
  )
}

function Zeile(p: { titel: string; unter: string; onClick: () => void; children?: React.ReactNode }): React.JSX.Element {
  return (
    <Card
      withBorder
      padding={8}
      radius="md"
      component="button"
      type="button"
      onClick={p.onClick}
      style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}
    >
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <div style={{ minWidth: 0 }}>
          <Text size="sm" fw={600} truncate>
            {p.titel}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {p.unter}
          </Text>
        </div>
        {p.children}
      </Group>
    </Card>
  )
}

export const SchnellzugriffTitel = (): React.JSX.Element => (
  <Title order={3} mb="sm">
    Auf einen Blick
  </Title>
)
