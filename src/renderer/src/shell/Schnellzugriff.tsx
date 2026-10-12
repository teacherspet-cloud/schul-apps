/**
 * Schnellzugriff auf der Startseite (03.10.2026, abgestimmt mit der Lehrkraft): statt Programmliste,
 * Themenbereichen und Fachschaftsfreigaben die wichtigsten laufenden Dinge –
 *  - laufende Unterrichtsreihen mit Handlungsbedarf,
 *  - Onlinetests: geplant, laufend, zu prüfen,
 *  - Freigaben & Rückmeldungen mit neuen Abgaben,
 *  - Termine & Vokabeltraining (10.10.2026, zweite Fassung): EINE Zeile je laufendem Kurs mit Balken und höchstens einem
 *    Abzeichen (Test bald > nicht geübt > Problemwörter > ✓), darunter „Demnächst" mit Vokabeltests und Haltepunkten.
 * Am Smartphone (10.10.2026) je Karte zunächst 5 Einträge, Anzahl wählbar (StartAnzahl.tsx) – seit 12.10.2026 auf allen
 * Geräten; jeder Kasten ist auf-/zuklappbar (zunächst zu, dauerhaft gemerkt) und nennt zugeklappt eine Kurzfassung.
 * Fachrelevanz (10.10.2026): Eine Karte steht nur da, wenn ihre App sichtbar ist (`startKarten`); ohne Sprachfach heißt
 * die letzte Karte nur „Termine" und zeigt nur „Demnächst".
 * Nur mit dem Schul-Apps-Server (die Exe ohne Server hat diese Dinge nicht).
 */
import { Badge, Button, Card, Group, Progress, SimpleGrid, Stack, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core'
import {
  IconAlertCircle,
  IconCalendarEvent,
  IconChalkboard,
  IconChevronRight,
  IconDeviceLaptop,
  IconShare,
  IconFlag,
  IconPlayerPlay
} from '@tabler/icons-react'
import { useEffect } from 'react'
import { oeffneProgramm, openDocument, openModule } from '../shared/navigation'
import { oeffneReihe, ReiheKarte } from '../modules/unterrichtsreihe/LaufendeReihenModule'
import { oeffneFreigabe } from '../modules/freigaben/FreigegebeneBlaetterModule'
import { abgabeTeile, FortschrittsBalken } from '../shared/components/FortschrittsBalken'
import { begrenzt, demnaechst, kursKopf, kurzfassung, tagKurz, type DemnaechstEintrag, type StartAbzeichen, type StartKurs } from '@shared/startseiteKurse'
import { kursReiterDocId } from '../modules/lernen/kurs/auftragsZiel'
import { zumHinweis } from '../modules/lernen/kurs/kursFokus'
import type { KursReiter } from '../modules/lernen/kurs/kursDaten'
import { AnzahlWahl, startKastenId, useStartAnzahl, useStartOffen } from './StartAnzahl'
import { useSichtbareProgramme } from './programme'
import { startKarten } from '../shared/programmSichtbarkeit'
import { useKopfDaten, type RueckmeldungKurz } from './kopfDaten'

/** Anzahl je Kasten wählbar (StartAnzahl.tsx) – seit 12.10.2026 auf allen Geräten */
export interface Begrenzung {
  karte: string
  wert: number
  setzen: (n: number) => void
}

/**
 * Ein Kasten der Startseite (12.10.2026, Wunsch der Lehrkraft): auf-/zuklappbar, zunächst zugeklappt, Stand dauerhaft je
 * Gerät (StartAnzahl.tsx › useStartOffen). Zugeklappt nennt der Kopf eine Kurzfassung („3 Termine"), aufgeklappt stehen
 * dort die Anzahl-Wahl und „Alle". Auch „Zuletzt bearbeitet" (Home.tsx) nutzt ihn.
 * Für die Oberflächentests: `data-klappkarte="start-<Kasten>"`, `data-offen`, `data-klappkopf` wie bei KlappKarte
 * (tests/e2e/warten.mjs › kartenAuf), dazu weiter `data-schnellzugriff`.
 */
export function StartKasten(p: {
  /** Kennung des Kastens (Auf/Zu, Anzahl) */
  id: string
  titel: string
  symbol: React.ReactNode
  farbe: string
  alle?: () => void
  children?: React.ReactNode
  daten?: string
  /** Kurzfassung im zugeklappten Kopf; undefined, solange nichts geladen ist */
  kurz?: string
  /** Zeilen des Kastens – werden auf die gewählte Anzahl gekürzt (0 = alle), dahinter „und N weitere" */
  zeilen?: React.ReactNode[]
  anzahl?: Begrenzung
  /** Zeilen nebeneinander (z. B. „Zuletzt bearbeitet": zwei Spalten ab sm) */
  spalten?: boolean
  /** Weitere Attribute am Rahmen (data-… der Tests) */
  rahmen?: Record<string, string | boolean | undefined>
}): React.JSX.Element {
  const [offen, umschalten] = useStartOffen(p.id)
  const zeilen = p.zeilen ?? []
  const max = p.anzahl?.wert ?? 0
  const rest = max ? Math.max(0, zeilen.length - max) : 0
  const sichtbar = begrenzt(zeilen, max)
  return (
    <Card
      withBorder
      radius="lg"
      padding="md"
      // Zugeklappt nicht auf die Höhe des Nachbarn gezogen
      style={{ alignSelf: 'start' }}
      data-schnellzugriff={p.daten}
      data-klappkarte={startKastenId(p.id)}
      data-offen={offen ? 'true' : 'false'}
      {...p.rahmen}
    >
      {/* Telefon (09.10.2026): „Alle" rutschte bei langen Titeln in eine eigene Zeile – der Titel bricht jetzt selbst um */}
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <UnstyledButton onClick={umschalten} aria-expanded={offen} data-klappkopf={startKastenId(p.id)} style={{ flex: 1, minWidth: 0, display: 'block' }}>
          <Group gap="xs" wrap="nowrap">
            <IconChevronRight
              size={18}
              aria-hidden
              style={{ flex: 'none', transition: 'transform 150ms ease', transform: offen ? 'rotate(90deg)' : 'none', color: 'var(--mantine-color-dimmed)' }}
            />
            <ThemeIcon variant="light" color={p.farbe} radius="md" style={{ flex: 'none' }}>
              {p.symbol}
            </ThemeIcon>
            <Text fw={700} style={{ minWidth: 0 }}>
              {p.titel}
            </Text>
            {!offen && p.kurz && (
              <Text size="xs" c="dimmed" truncate ml="auto" pl="xs" style={{ flex: '0 1 auto', minWidth: 0 }} data-start-kurz={p.id}>
                {p.kurz}
              </Text>
            )}
          </Group>
        </UnstyledButton>
        {offen && p.anzahl && <AnzahlWahl karte={p.anzahl.karte} wert={p.anzahl.wert} setzen={p.anzahl.setzen} />}
        {p.alle && (
          <Button size="compact-xs" variant="subtle" onClick={p.alle} miw={44} style={{ flex: 'none' }}>
            Alle
          </Button>
        )}
      </Group>
      {offen && (
        <Stack gap={6} mt="sm">
          {p.children}
          {p.spalten
            ? sichtbar.length > 0 && (
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                  {sichtbar}
                </SimpleGrid>
              )
            : sichtbar}
          {rest > 0 && (
            <Text size="xs" c="dimmed" data-schnellzugriff-weitere={rest}>
              und {rest} weitere
            </Text>
          )}
        </Stack>
      )}
    </Card>
  )
}

const Leer = ({ text }: { text: string }): React.JSX.Element => (
  <Text size="sm" c="dimmed">
    {text}
  </Text>
)

const ampelFarbe = (x: number): string => (x >= 0.7 ? 'green' : x >= 0.4 ? 'yellow' : 'red')

/**
 * Daten seit 10.10.2026 aus dem gemeinsamen Speicher (shell/kopfDaten.ts) – derselbe, aus dem der Rahmen-Kopf seine
 * Info-Chips zählt; beim Öffnen der Startseite frisch geladen, danach höchstens jede Minute.
 */
export function Schnellzugriff(): React.JSX.Element {
  const { reihen, blaetter, tests, rueck, start } = useKopfDaten()
  // Anzahl je Kasten wählbar, dauerhaft je Gerät (10.10.2026 am Smartphone, seit 12.10.2026 überall; Vorgabe 5)
  const [nReihen, setNReihen] = useStartAnzahl('reihen')
  const [nTests, setNTests] = useStartAnzahl('tests')
  const [nFreigaben, setNFreigaben] = useStartAnzahl('freigaben')
  const [nTermine, setNTermine] = useStartAnzahl('termine')
  const wahl = (karte: string, wert: number, setzen: (n: number) => void): Begrenzung => ({ karte, wert, setzen })
  // Nur Karten sichtbarer Apps – dieselbe Regel wie die Leiste (10.10.2026)
  const sichtbar = useSichtbareProgramme()
  const ids = sichtbar.map((m) => m.id)
  const karten = startKarten(ids)
  const vokabeln = karten.termine === 'voll'
  useEffect(() => {
    void useKopfDaten.getState().laden(true)
  }, [])

  const bedarf = (reihen ?? []).reduce((s, r) => s + r.bedarf, 0)
  const geplant = (tests ?? []).filter((t) => t.status === 'wartend')
  const laufend = (tests ?? []).filter((t) => t.status === 'offen')
  const zuPruefen = (tests ?? []).filter((t) => t.status === 'beendet' && (t.offen > 0 || t.zuEntscheiden > 0))
  const blattOffen = ids.includes('freigaben') ? (blaetter ?? []).filter((b) => b.status === 'offen') : []
  const rueckOffen = ids.includes('rueckmeldung') ? (rueck ?? []).filter((r) => r.status === 'offen' && !r.art) : []
  const jetzt = Date.now()
  const kurse = vokabeln ? start?.kurse ?? [] : []

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
      <Zeile
        key={t.id}
        titel={t.titel}
        unter={`${t.lerngruppe || 'Gäste'} · ${
          t.termin ? `Termin ${tagKurz(t.termin)}${t.terminVerborgen ? ' (für Lernende ausgeblendet)' : ''} · ` : ''
        }noch nicht gestartet`}
        onClick={() => void openDocument('onlinetest', t.id)}
      >
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
  // Die gewählte Anzahl zählt über Blätter und Rückmeldungen zusammen (12.10.2026 auf allen Geräten; vorher am PC 5 + 4)
  const freigabeZeilen = [...blattOffen.map(blattZeile), ...rueckOffen.map(rueckZeile)]

  /*
   * Termine & Vokabeltraining (10.10.2026, zweite Fassung – Befund „zu unübersichtlich"): EINE Zeile je laufendem Kurs
   * mit Balken und höchstens einem Abzeichen, darunter „Demnächst" (Vokabeltests und Haltepunkte mit Datum). Hinweise
   * und Grammatik stehen im Kurs. Die Anzahl-Wahl gilt für die Kurszeilen und „Demnächst" (12.10.2026: die nächsten 5,
   * erhöhbar; vorher fest 5 bzw. am PC 10 Kurse).
   */
  const kursZeilen = kurse.map((k) => <KursZeile key={k.id} k={k} />)
  const maxKurse = nTermine
  const kursRest = maxKurse ? Math.max(0, kursZeilen.length - maxKurse) : 0
  const bald = demnaechst(kurse, reihen ?? [], jetzt, karten.tests ? tests ?? [] : [])
  const geladen = (vokabeln ? start !== null : true) && reihen !== null
  const baldListe = (
    <Stack gap={4} data-start-demnaechst-liste>
      {vokabeln && (
        <Text size="xs" fw={700} c="dimmed" tt="uppercase">
          Demnächst
        </Text>
      )}
      {begrenzt(bald, nTermine).map((e) => (
        <DemnaechstZeile key={`${e.art}-${e.ziel}-${e.text}`} e={e} />
      ))}
      {nTermine > 0 && bald.length > nTermine && (
        <Text size="xs" c="dimmed" data-start-demnaechst-weitere={bald.length - nTermine}>
          und {bald.length - nTermine} weitere
        </Text>
      )}
      {geladen && !bald.length && (kurse.length || !vokabeln) && <Leer text={vokabeln ? 'Nichts geplant.' : 'Keine anstehenden Termine.'} />}
    </Stack>
  )

  // Kurzfassungen für die zugeklappten Köpfe (12.10.2026) – erst, wenn die Daten da sind
  const kurzReihen =
    reihen === null
      ? undefined
      : kurzfassung(
          [
            [reihen.length, 'Reihe', 'Reihen'],
            [bedarf, '× Handlungsbedarf', '× Handlungsbedarf']
          ],
          'keine laufend'
        )
  const kurzTests =
    tests === null
      ? undefined
      : kurzfassung(
          [
            [laufend.length, 'läuft', 'laufen'],
            [geplant.length, 'geplant', 'geplant'],
            [zuPruefen.length, 'zu prüfen', 'zu prüfen']
          ],
          'nichts offen'
        )
  const kurzFreigaben =
    blaetter === null || rueck === null
      ? undefined
      : kurzfassung(
          [
            [blattOffen.length, 'Blatt', 'Blätter'],
            [rueckOffen.length, 'Rückmeldung', 'Rückmeldungen']
          ],
          'nichts offen'
        )
  const kurzTermine = !geladen
    ? undefined
    : kurzfassung(
        [
          [bald.length, 'Termin', 'Termine'],
          [kurse.length, 'Kurs', 'Kurse']
        ],
        'nichts geplant'
      )

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mb={40} data-schnellzugriff-raster>
      {karten.reihen && (
        <StartKasten
          id="reihen"
          titel="Laufende Unterrichtsreihen"
          symbol={<IconChalkboard size={18} />}
          farbe="violet"
          alle={() => oeffneProgramm('laufendereihen')}
          daten="reihen"
          kurz={kurzReihen}
          zeilen={reihenZeilen}
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
        </StartKasten>
      )}

      {karten.tests && (
        <StartKasten
          id="tests"
          titel="Onlinetests"
          symbol={<IconDeviceLaptop size={18} />}
          farbe="teal"
          alle={() => oeffneProgramm('onlinetest')}
          daten="tests"
          kurz={kurzTests}
          zeilen={testZeilen}
          anzahl={wahl('tests', nTests, setNTests)}
        >
          {tests !== null && !testZeilen.length && <Leer text="Kein Test geplant oder offen." />}
        </StartKasten>
      )}

      {karten.freigaben && (
        <StartKasten
          id="freigaben"
          titel={
            ids.includes('freigaben') && ids.includes('rueckmeldung') ? 'Freigaben & Rückmeldungen' : ids.includes('freigaben') ? 'Freigaben' : 'Rückmeldungen'
          }
          symbol={<IconShare size={18} />}
          farbe="blue"
          alle={() => oeffneProgramm(ids.includes('freigaben') ? 'freigaben' : 'rueckmeldung')}
          daten="freigaben"
          kurz={kurzFreigaben}
          zeilen={freigabeZeilen}
          anzahl={wahl('freigaben', nFreigaben, setNFreigaben)}
        >
          {blaetter !== null && rueck !== null && !blattOffen.length && !rueckOffen.length && <Leer text="Nichts freigegeben." />}
        </StartKasten>
      )}

      {karten.termine && (
        <StartKasten
          id="termine"
          titel={vokabeln ? 'Termine & Vokabeltraining' : 'Termine'}
          symbol={<IconCalendarEvent size={18} />}
          farbe="orange"
          alle={vokabeln ? () => oeffneProgramm('sprachenlernen') : ids.includes('laufendereihen') ? () => oeffneProgramm('laufendereihen') : undefined}
          daten="termine"
          kurz={kurzTermine}
          // Ohne `zeilen`: die Anzahl gilt hier für Kurse und „Demnächst" (oben gekürzt)
          anzahl={wahl('termine', nTermine, setNTermine)}
        >
          {!vokabeln ? (
            baldListe
          ) : geladen && !kurse.length && !bald.length ? (
            <Leer text="Keine anstehenden Termine und kein laufender Kurs." />
          ) : (
            // Am PC zwei Spalten, wenn die Karte breit genug ist (Containerabfrage), sonst untereinander
            <SimpleGrid type="container" cols={{ base: 1, '680px': 2 }} spacing="md" verticalSpacing="sm">
              {kurse.length > 0 && (
                <Stack gap={6} data-start-kurse>
                  {begrenzt(kursZeilen, maxKurse)}
                  {kursRest > 0 && (
                    <Text size="xs" c="dimmed" data-schnellzugriff-weitere={kursRest}>
                      und {kursRest} weitere
                    </Text>
                  )}
                </Stack>
              )}
              {baldListe}
            </SimpleGrid>
          )}
        </StartKasten>
      )}
    </SimpleGrid>
  )
}

const ABZEICHEN_FARBE: Record<StartAbzeichen['art'], string> = { test: 'orange', inaktiv: 'red', problem: 'yellow', leer: 'gray', ok: 'green' }

/** Eine Kurszeile (10.10.2026): „7b · Englisch", Balken mit „64 %", EIN Abzeichen – das Abzeichen führt in den passenden Reiter */
/** Ein Teil der Kurszeile, der mit „…" kürzen darf (wie stark: flexShrink) */
const KUERZEN = { flexGrow: 0, flexBasis: 'auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } as const

function KursZeile({ k }: { k: StartKurs }): React.JSX.Element {
  const a = k.abzeichen
  const oeffnen = (): void => void openDocument('sprachenlernen', k.id)
  const zumAbzeichen = (): void => {
    if (!a.reiter) return oeffnen()
    void openDocument('sprachenlernen', kursReiterDocId(k.id, a.reiter)).then(() =>
      zumHinweis({ kurs: k.id, hinweis: a.hinweis ?? a.art, reiter: a.reiter as KursReiter, ids: a.ids })
    )
  }
  return (
    <Card withBorder padding={8} radius="md" data-start-kurs={k.id} data-start-abzeichen={a.art}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <UnstyledButton onClick={oeffnen} style={{ minWidth: 0, flex: 1 }} title={k.abschnitt}>
          {k.band !== undefined && k.einheit ? (
            // Weitester Abschnitt (10.10.2026): eine Zeile; wird es eng, kürzt zuerst der Band, dann der Fortschritt – die
            // Unit bleibt sichtbar
            <Text size="sm" fw={600} style={{ display: 'flex', alignItems: 'baseline', whiteSpace: 'nowrap', minWidth: 0 }}>
              <span style={{ ...KUERZEN, flexShrink: 0.001 }}>{kursKopf(k.gruppe, k.fach)}</span>
              {k.band && (
                <Text span size="xs" c="dimmed" fw={400} style={{ ...KUERZEN, flexShrink: 1000 }}>
                  &nbsp;· {k.band}
                </Text>
              )}
              <Text span size="xs" c="dimmed" fw={400} style={{ ...KUERZEN, flexShrink: 0.0001 }} data-start-unit>
                &nbsp;· {k.einheit}
              </Text>
              {k.fortschritt && (
                <Text span size="xs" c="dimmed" fw={400} style={{ ...KUERZEN, flexShrink: 1 }}>
                  &nbsp;{k.fortschritt}
                </Text>
              )}
            </Text>
          ) : (
            <Text size="sm" fw={600} truncate>
              {kursKopf(k.gruppe, k.fach)}
              {k.abschnitt && (
                <Text span size="xs" c="dimmed" fw={400}>
                  {' '}
                  · {k.abschnitt}
                </Text>
              )}
            </Text>
          )}
          {k.sicher !== null ? (
            <Group gap={6} wrap="nowrap" mt={4}>
              <Progress value={k.sicher * 100} size="xs" color={ampelFarbe(k.sicher)} style={{ flex: 1 }} aria-label="sicher" />
              <Text size="xs" c="dimmed" w={36} ta="right" style={{ flex: 'none' }} data-start-sicher>
                {Math.round(k.sicher * 100)} %
              </Text>
            </Group>
          ) : (
            <Text size="xs" c="dimmed" mt={2}>
              Grammatik
            </Text>
          )}
        </UnstyledButton>
        {a.art === 'ok' ? (
          <Text c="green.6" fw={700} px={6} style={{ flex: 'none' }} aria-label="alles in Ordnung" data-start-badge="ok">
            ✓
          </Text>
        ) : (
          <UnstyledButton onClick={zumAbzeichen} style={{ flex: 'none' }} data-start-badge={a.art}>
            <Badge variant={a.art === 'test' ? 'filled' : 'light'} color={ABZEICHEN_FARBE[a.art]} tt="none">
              {a.text}
            </Badge>
          </UnstyledButton>
        )}
      </Group>
    </Card>
  )
}

/** „Fr 17.10.  Vokabeltest 7b – Unit 2" – ein Eintrag unter „Demnächst" */
function DemnaechstZeile({ e }: { e: DemnaechstEintrag }): React.JSX.Element {
  return (
    <UnstyledButton
      onClick={() =>
        e.art === 'test'
          ? void openDocument('sprachenlernen', kursReiterDocId(e.ziel, 'vokabeln'))
          : e.art === 'onlinetest'
          ? void openDocument('onlinetest', e.ziel)
          : oeffneReihe(e.ziel)
      }
      style={{ display: 'block', width: '100%', textAlign: 'left' }}
      data-start-demnaechst={e.art}
    >
      <Group gap={8} wrap="nowrap">
        {e.art === 'test' ? (
          <IconCalendarEvent size={14} color="var(--mantine-color-orange-6)" style={{ flex: 'none' }} />
        ) : e.art === 'onlinetest' ? (
          <IconDeviceLaptop size={14} color="var(--mantine-color-teal-6)" style={{ flex: 'none' }} />
        ) : (
          <IconFlag size={14} color="var(--mantine-color-violet-6)" style={{ flex: 'none' }} />
        )}
        <Text size="sm" fw={600} w={72} style={{ flex: 'none', fontVariantNumeric: 'tabular-nums' }} c={e.tag ? undefined : 'dimmed'}>
          {e.tag ? tagKurz(e.tag) : 'offen'}
        </Text>
        <Text size="sm" truncate>
          {e.text}
        </Text>
      </Group>
    </UnstyledButton>
  )
}

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
