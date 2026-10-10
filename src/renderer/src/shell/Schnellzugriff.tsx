/**
 * Schnellzugriff auf der Startseite (03.10.2026, abgestimmt mit der Lehrkraft): statt Programmliste,
 * Themenbereichen und Fachschaftsfreigaben die wichtigsten laufenden Dinge –
 *  - laufende Unterrichtsreihen mit Handlungsbedarf,
 *  - Onlinetests: geplant, laufend, zu prüfen,
 *  - Freigaben & Rückmeldungen mit neuen Abgaben,
 *  - Termine & Vokabeltraining: anstehende Vokabeltests mit Prognose, laufende Kurse mit Lernstand und Handlungsbedarf,
 *    freigegebene Grammatik und Haltepunkte in Reihen (10.10.2026: auch Kurse ohne Testtermin).
 * Am Smartphone (10.10.2026) je Karte zunächst 5 Einträge, Anzahl wählbar (StartAnzahl.tsx).
 * Fachrelevanz (10.10.2026): Eine Karte steht nur da, wenn ihre App sichtbar ist (`startKarten`); ohne Sprachfach heißt
 * die letzte Karte nur „Termine" und zeigt nur Haltepunkte.
 * Nur mit dem Schul-Apps-Server (die Exe ohne Server hat diese Dinge nicht).
 */
import { Badge, Button, Card, Group, Progress, SimpleGrid, Stack, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconAlertCircle, IconCalendarEvent, IconChalkboard, IconDeviceLaptop, IconShare, IconFlag, IconPlayerPlay } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { holen } from '../modules/onlinetest/serverApi'
import { oeffneProgramm, openDocument, openModule } from '../shared/navigation'
import { oeffneReihe, ReiheKarte, useLaufendeReihen } from '../modules/unterrichtsreihe/LaufendeReihenModule'
import { oeffneFreigabe, useFreigaben } from '../modules/freigaben/FreigegebeneBlaetterModule'
import { abgabeTeile, FortschrittsBalken } from '../shared/components/FortschrittsBalken'
import { begrenzt, type StartseiteDaten } from '@shared/startseiteKurse'
import { kursReiterDocId } from '../modules/lernen/kurs/auftragsZiel'
import { zumHinweis } from '../modules/lernen/kurs/kursFokus'
import type { KursReiter } from '../modules/lernen/kurs/kursDaten'
import { AnzahlWahl, useStartAnzahl } from './StartAnzahl'
import { useSichtbareProgramme } from './programme'
import { startKarten } from '../shared/programmSichtbarkeit'

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
  /** Für wie viele Personen (Fortschrittsbalken) */
  gesamt?: number
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

/** Am Smartphone: Anzahl je Karte wählbar (StartAnzahl.tsx); am PC feste Höchstzahl wie bisher */
interface Begrenzung {
  karte: string
  wert: number
  setzen: (n: number) => void
}

function Bereich(p: {
  titel: string
  symbol: React.ReactNode
  farbe: string
  alle?: () => void
  children?: React.ReactNode
  daten?: string
  /** Zeilen der Karte – werden auf `max` gekürzt (0 = alle), dahinter „und N weitere" */
  zeilen?: React.ReactNode[]
  max?: number
  anzahl?: Begrenzung
}): React.JSX.Element {
  const zeilen = p.zeilen ?? []
  const max = p.anzahl ? p.anzahl.wert : (p.max ?? 0)
  const rest = max ? Math.max(0, zeilen.length - max) : 0
  return (
    <Card withBorder radius="lg" padding="md" data-schnellzugriff={p.daten}>
      {/* Telefon (09.10.2026): „Alle" rutschte bei langen Titeln in eine eigene Zeile – der Titel bricht jetzt selbst um */}
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon variant="light" color={p.farbe} radius="md">
            {p.symbol}
          </ThemeIcon>
          <Text fw={700}>{p.titel}</Text>
          {p.anzahl && <AnzahlWahl karte={p.anzahl.karte} wert={p.anzahl.wert} setzen={p.anzahl.setzen} />}
        </Group>
        {p.alle && (
          <Button size="compact-xs" variant="subtle" onClick={p.alle} miw={44} style={{ flex: 'none' }}>
            Alle
          </Button>
        )}
      </Group>
      <Stack gap={6}>
        {p.children}
        {begrenzt(zeilen, max)}
        {rest > 0 && (
          <Text size="xs" c="dimmed" data-schnellzugriff-weitere={rest}>
            und {rest} weitere
          </Text>
        )}
      </Stack>
    </Card>
  )
}

const Leer = ({ text }: { text: string }): React.JSX.Element => (
  <Text size="sm" c="dimmed">
    {text}
  </Text>
)

const ampelFarbe = (x: number): string => (x >= 0.7 ? 'green' : x >= 0.4 ? 'yellow' : 'red')

export function Schnellzugriff(): React.JSX.Element {
  const { reihen } = useLaufendeReihen()
  const { liste: blaetter } = useFreigaben()
  const [tests, setTests] = useState<TestKurz[] | null>(null)
  const [rueck, setRueck] = useState<RueckmeldungKurz[] | null>(null)
  const [vok, setVok] = useState<VokabelKurz[] | null>(null)
  const [start, setStart] = useState<StartseiteDaten | null>(null)
  // Smartphone (10.10.2026): Anzahl je Karte wählbar, dauerhaft je Gerät
  const handy = useMediaQuery('(max-width: 700px)') ?? false
  const [nReihen, setNReihen] = useStartAnzahl('reihen')
  const [nTests, setNTests] = useStartAnzahl('tests')
  const [nFreigaben, setNFreigaben] = useStartAnzahl('freigaben')
  const [nTermine, setNTermine] = useStartAnzahl('termine')
  const wahl = (karte: string, wert: number, setzen: (n: number) => void): Begrenzung | undefined => (handy ? { karte, wert, setzen } : undefined)
  // Nur Karten sichtbarer Apps – dieselbe Regel wie die Leiste (10.10.2026)
  const sichtbar = useSichtbareProgramme()
  const ids = sichtbar.map((m) => m.id)
  const karten = startKarten(ids)
  const vokabeln = karten.termine === 'voll'
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
    // Laufende Kurse, ihr Handlungsbedarf und ihre Grammatik (10.10.2026) – eine Anfrage für alle Kurse
    void holen<StartseiteDaten>('/server/startseite').then(
      (d) => setStart(d),
      () => setStart({ kurse: [], klassen: [] })
    )
  }, [])

  const bedarf = (reihen ?? []).reduce((s, r) => s + r.bedarf, 0)
  const geplant = (tests ?? []).filter((t) => t.status === 'wartend')
  const laufend = (tests ?? []).filter((t) => t.status === 'offen')
  const zuPruefen = (tests ?? []).filter((t) => t.status === 'beendet' && (t.offen > 0 || t.zuEntscheiden > 0))
  const blattOffen = ids.includes('freigaben') ? (blaetter ?? []).filter((b) => b.status === 'offen') : []
  const rueckOffen = ids.includes('rueckmeldung') ? (rueck ?? []).filter((r) => r.status === 'offen' && !r.art) : []
  const jetzt = Date.now()
  const termine = (vokabeln ? (vok ?? []) : []).filter((v) => v.status === 'offen' && v.testTermin && v.testTermin >= jetzt - 864e5).sort((a, b) => a.testTermin! - b.testTermin!)
  const halte = (reihen ?? []).flatMap((r) => r.halte.map((h) => ({ r, h })))
  const kurse = vokabeln ? (start?.kurse ?? []) : []

  const reihenZeilen = (reihen ?? []).map((r) => <ReiheKarte key={r.zid} r={r} />)
  const testZeilen = [
    ...laufend.map((t) => (
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
    )),
    ...geplant.map((t) => (
      <Zeile key={t.id} titel={t.titel} unter={`${t.lerngruppe || 'Gäste'} · noch nicht gestartet`} onClick={() => void openDocument('onlinetest', t.id)}>
        <Badge variant="light">geplant</Badge>
      </Zeile>
    )),
    ...zuPruefen.map((t) => (
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
    ))
  ]
  const blattZeile = (b: (typeof blattOffen)[number]): React.ReactNode => (
    <Zeile
      key={b.id}
      titel={b.titel}
      unter={`${b.lerngruppe || 'Gäste'}${b.gesamt ? ` · ${b.gesamt} Lernende` : ''}`}
      onClick={() => (oeffneFreigabe(b.id), openModule('freigaben'))}
      unten={b.gesamt ? <FortschrittsBalken gesamt={b.gesamt} teile={abgabeTeile(b.gesamt, b.begonnen, b.abgaben)} /> : undefined}
    >
      {b.zuletzt > jetzt - 2 * 864e5 && b.abgaben > 0 ? <Badge color="green">neu</Badge> : <Badge variant="light">Arbeitsblatt</Badge>}
    </Zeile>
  )
  const rueckZeile = (r: RueckmeldungKurz): React.ReactNode => (
    <Zeile
      key={r.id}
      titel={r.titel}
      unter={`${r.lerngruppe || 'Gäste'} · ${r.abgaben} Abgaben`}
      onClick={() => openModule('rueckmeldung')}
      unten={
        r.gesamt ? (
          <FortschrittsBalken
            gesamt={r.gesamt}
            teile={[
              { wert: Math.min(r.abgaben, r.gesamt), farbe: 'green', wort: 'eingereicht' },
              { wert: Math.max(0, r.gesamt - r.abgaben), farbe: 'red', wort: 'noch offen' }
            ]}
          />
        ) : undefined
      }
    >
      <Badge variant="light" color="green">
        Rückmeldung
      </Badge>
    </Zeile>
  )
  // Am PC wie bisher höchstens 5 Blätter und 4 Rückmeldungen; am Smartphone zählt die gewählte Anzahl über beide
  const freigabeZeilen = handy
    ? [...blattOffen.map(blattZeile), ...rueckOffen.map(rueckZeile)]
    : [...blattOffen.slice(0, 5).map(blattZeile), ...rueckOffen.slice(0, 4).map(rueckZeile)]

  // Termine & Vokabeltraining (10.10.2026): a) Testtermine, b) laufende Kurse, c) Handlungsbedarf, d) Grammatik und Haltepunkte
  const terminZeilen: React.ReactNode[] = [
    ...termine.map((v) => {
      const tage = Math.round((v.testTermin! - jetzt) / 864e5)
      return (
        <div key={`t-${v.id}`}>
          <Zeile
            titel={v.titel}
            unter={`${v.lerngruppe} · Test ${tage <= 0 ? 'heute' : tage === 1 ? 'morgen' : `in ${tage} Tagen`} (${new Date(v.testTermin!).toLocaleDateString('de-DE')})`}
            onClick={() => void openDocument('sprachenlernen', v.id)}
          >
            <Badge variant="light" color={ampelFarbe(v.sicherSchnitt)}>
              {Math.round(v.sicherSchnitt * 100)} % sicher
            </Badge>
          </Zeile>
          <Progress value={v.sicherSchnitt * 100} size="xs" color={ampelFarbe(v.sicherSchnitt)} />
        </div>
      )
    }),
    ...kurse.map((k) => (
      <Zeile
        key={`k-${k.id}`}
        titel={k.titel}
        unter={k.lernende ? `heute geübt: ${k.heute} von ${k.lernende}` : 'noch niemand im Kurs'}
        onClick={() => void openDocument('sprachenlernen', k.id)}
        daten={{ 'data-start-kurs': k.id }}
        unten={k.sicher !== null ? <Progress value={k.sicher * 100} size="xs" color={ampelFarbe(k.sicher)} /> : undefined}
      >
        {k.sicher !== null ? (
          <Badge variant="light" color={ampelFarbe(k.sicher)}>
            {Math.round(k.sicher * 100)} % sicher
          </Badge>
        ) : (
          <Badge variant="light" color="gray">
            Grammatik
          </Badge>
        )}
      </Zeile>
    )),
    ...kurse.flatMap((k) =>
      k.hinweise.map((h) => (
        <UnstyledButton
          key={`h-${k.id}-${h.hinweis}`}
          data-start-hinweis={h.hinweis}
          onClick={() =>
            void openDocument('sprachenlernen', kursReiterDocId(k.id, h.reiter)).then(() =>
              zumHinweis({ kurs: k.id, hinweis: h.hinweis, reiter: h.reiter as KursReiter, ids: h.ids })
            )
          }
          style={{ display: 'block', width: '100%', textAlign: 'left' }}
        >
          <Group gap={6} wrap="nowrap">
            <IconAlertCircle size={14} color={`var(--mantine-color-${h.farbe}-6)`} style={{ flex: 'none' }} />
            <Text size="xs" truncate>
              <b>{gruppeVon(k.titel)}:</b> {h.text}
            </Text>
          </Group>
        </UnstyledButton>
      ))
    ),
    ...kurse.flatMap((k) =>
      k.grammatik.map((g) => (
        <Zeile
          key={`g-${g.id}`}
          titel={`Grammatik: ${g.titel}`}
          unter={`${gruppeVon(k.titel)} · ${
            g.status === 'geplant' && g.geplantAb ? `frei ab ${new Date(g.geplantAb).toLocaleDateString('de-DE')}` : `${Math.round(g.sicher * 100)} % sicher`
          }`}
          onClick={() => void openDocument('sprachenlernen', `g:${g.id}`)}
          daten={{ 'data-start-grammatik': g.id }}
        >
          <Badge variant="light" color={g.status === 'geplant' ? 'gray' : 'teal'}>
            {g.status === 'geplant' ? 'geplant' : 'läuft'}
          </Badge>
        </Zeile>
      ))
    ),
    ...halte.map(({ r, h }) => (
      <Zeile key={`${r.zid}-${h}`} titel={`Haltepunkt: ${h}`} unter={`${r.titel} · ${r.gruppe}`} onClick={() => oeffneReihe(r.zid)}>
        <IconFlag size={16} color="var(--mantine-color-violet-6)" />
      </Zeile>
    ))
  ]

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mb={40} data-schnellzugriff-raster>
      {karten.reihen && (
        <Bereich
          titel="Laufende Unterrichtsreihen"
          symbol={<IconChalkboard size={18} />}
          farbe="violet"
          alle={() => oeffneProgramm('laufendereihen')}
          daten="reihen"
          zeilen={reihenZeilen}
          max={2}
          anzahl={wahl('reihen', nReihen, setNReihen)}
        >
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
          {reihen !== null && !reihen.length && <Leer text="Gerade läuft keine Unterrichtsreihe." />}
        </Bereich>
      )}

      {karten.tests && (
        <Bereich
          titel="Onlinetests"
          symbol={<IconDeviceLaptop size={18} />}
          farbe="teal"
          alle={() => oeffneProgramm('onlinetest')}
          daten="tests"
          zeilen={testZeilen}
          anzahl={wahl('tests', nTests, setNTests)}
        >
          {tests !== null && !testZeilen.length && <Leer text="Kein Test geplant oder offen." />}
        </Bereich>
      )}

      {karten.freigaben && (
        <Bereich
          titel={ids.includes('freigaben') && ids.includes('rueckmeldung') ? 'Freigaben & Rückmeldungen' : ids.includes('freigaben') ? 'Freigaben' : 'Rückmeldungen'}
          symbol={<IconShare size={18} />}
          farbe="blue"
          alle={() => oeffneProgramm(ids.includes('freigaben') ? 'freigaben' : 'rueckmeldung')}
          daten="freigaben"
          zeilen={freigabeZeilen}
          anzahl={wahl('freigaben', nFreigaben, setNFreigaben)}
        >
          {blaetter !== null && rueck !== null && !blattOffen.length && !rueckOffen.length && <Leer text="Nichts freigegeben." />}
        </Bereich>
      )}

      {karten.termine && (
        <Bereich
          titel={vokabeln ? 'Termine & Vokabeltraining' : 'Termine'}
          symbol={<IconCalendarEvent size={18} />}
          farbe="orange"
          alle={vokabeln ? () => oeffneProgramm('sprachenlernen') : ids.includes('laufendereihen') ? () => oeffneProgramm('laufendereihen') : undefined}
          daten="termine"
          zeilen={terminZeilen}
          max={10}
          anzahl={wahl('termine', nTermine, setNTermine)}
        >
          {(vokabeln ? vok !== null && start !== null : true) && reihen !== null && !terminZeilen.length && (
            <Leer text={vokabeln ? 'Keine anstehenden Termine und kein laufender Kurs.' : 'Keine anstehenden Termine.'} />
          )}
        </Bereich>
      )}
    </SimpleGrid>
  )
}

/** „7b – Englisch · Green Line 3 Unit 2" → „7b – Englisch" (Bezug in Hinweis- und Grammatikzeilen) */
const gruppeVon = (titel: string): string => titel.split(' · ')[0]

function Zeile(p: {
  titel: string
  unter: string
  onClick: () => void
  children?: React.ReactNode
  unten?: React.ReactNode
  daten?: Record<string, string>
}): React.JSX.Element {
  return (
    <Card
      withBorder
      padding={8}
      radius="md"
      component="button"
      type="button"
      onClick={p.onClick}
      style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}
      {...p.daten}
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
        {/* Abzeichen („Arbeitsblatt") nicht kürzen – der Titel daneben wird gekürzt (09.10.2026, „ARBEITS…" am Telefon) */}
        {p.children && <div style={{ flex: 'none' }}>{p.children}</div>}
      </Group>
      {p.unten && <div style={{ marginTop: 6 }}>{p.unten}</div>}
    </Card>
  )
}

export const SchnellzugriffTitel = (): React.JSX.Element => (
  <Title order={3} mb="sm">
    Auf einen Blick
  </Title>
)
