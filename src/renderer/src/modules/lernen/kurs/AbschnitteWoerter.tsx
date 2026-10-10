/**
 * Kasten „Abschnitte & Wörter" im Reiter „Vokabeln" der Kursseite (10.10.2026, Entscheidung der Lehrkraft) – in
 * Sprachenlernen und „Meine Klassen" gleich. Er ersetzt „Abschnitte und Stand der Lernenden" und die Wortliste
 * „X Wörter", die doppelt dasselbe zeigten:
 *  - Band (aufklappbar, Cover, neuester oben) › Unit (aufklappbar, absteigend wie im Buch) › Abschnitt mit Wörterzahl,
 *    Balken „% sicher" der Klasse, „x/y fertig" und ⋯ (Entfernen, Endgültig löschen).
 *  - Klick auf einen Abschnitt zeigt darunter seine Wörter: Wort – Übersetzung, „% sicher" der Klasse, ⚠ bei
 *    Problemwörtern (Klick: wer Schwierigkeiten hat), Aussprache (w/m) und Bild, Bearbeiten (Wort, Übersetzung,
 *    „auch richtig", „Aussprache als").
 *  - Oben: Suche über alle Wörter (klappt Passendes auf) und „Nur Problemwörter".
 * Auf/Zu gilt für die Sitzung (shared/sitzung.ts).
 */
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Image,
  Menu,
  Modal,
  Popover,
  Progress,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import { IconAlertTriangle, IconChevronDown, IconChevronRight, IconDots, IconPencil, IconPhoto, IconSearch, IconVolume } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { nachBaenden, REIF_TAGE, SCHWACH_UNTER, type AbschnittStatistik } from '@shared/kursAbschnitte'
import { abschnittsZeilen, auchRichtigAusText, zeilenFiltern, type AbschnittsZeile, type ProblemPerson } from '@shared/kursWoerter'
import { sprachKurz, tonVon, type Stimmlage } from '@shared/medienbank'
import { sprechTextFuerWort } from '@shared/sprechtext'
import { BandGruppe, useBaendeOffen } from '../../../shared/components/BandCover'
import { GeplantMarke } from '../../../shared/components/FreigabePlanen'
import { BildDialog, TonZelle, useMedienAdmin, useMedienbank, useMedienZiel, useStandardstimmen } from '../../../shared/medien/MedienUi'
import { gesprochenFuer, lagenVon, starteMedienAuftrag } from '../../../shared/medien/medienAuftrag'
import { useOffenGemerkt } from '../../../shared/sitzung'
import { useExperte } from '../../../shared/settingsStore'
import { notifyError, notifySuccess } from '../../../shared/util'
import { senden } from '../../onlinetest/serverApi'
import { ampel } from '../../meineklassen/MaterialListe'
import { sprich } from '../VokabelTrainer'
import { KastenKopf, useGemerkt } from './Kasten'
import type { Lernstanddaten } from './kursDaten'

export type AbschnittFrage = { was: 'entfernen' | 'loeschen'; titel: string; index?: number; entfernt?: number }

type Wort = Lernstanddaten['woerter'][number]
type Zeile = AbschnittsZeile<Wort, AbschnittStatistik>

const prozent = (x: number): string => `${Math.round(x * 100)} %`
const tag = (x: number): string => (x ? new Date(x).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '')
const OHNE_UNIT = 'Weitere Vokabeln'
const NEU_TAGE = 14 * 864e5

/** Abschnitts-Statistik: Anteil sicher / im Aufbau / neu als Balken */
function StandBalken({ a, breite, schmal }: { a: Pick<AbschnittStatistik, 'sicher' | 'aufbau' | 'neu'>; breite?: number; schmal?: boolean }): React.JSX.Element {
  return (
    <Tooltip label={`sicher ${prozent(a.sicher)} · im Aufbau ${prozent(a.aufbau)} · neu ${prozent(a.neu)}`}>
      {/* Schmal (Telefon): ohne Balken – die Prozentzahl daneben reicht, der Name bleibt lesbar */}
      <Progress.Root size="md" radius="xl" style={{ flex: breite ? `0 1 ${breite}px` : 1, minWidth: 24 }} visibleFrom={schmal ? 'xs' : undefined} data-abschnitt-stand>
        <Progress.Section value={a.sicher * 100} color="green" />
        <Progress.Section value={a.aufbau * 100} color="yellow" />
        <Progress.Section value={a.neu * 100} color="gray.4" />
      </Progress.Root>
    </Tooltip>
  )
}

/** Kleine Ampel je Person: nach 14 Tagen der Anteil sicher, vorher der Anteil kennengelernt */
function PersonenAmpeln({ a, namen }: { a: AbschnittStatistik; namen: string[] }): React.JSX.Element {
  const reif = a.schwach !== null
  return (
    <Group gap={4} data-abschnitt-personen>
      {namen.map((name, i) => {
        const [s, au] = a.jeLernende[i] ?? [0, 0]
        const wert = reif ? s : s + au
        return (
          <Tooltip key={`${name}-${i}`} label={`${name}: sicher ${prozent(s)} · im Aufbau ${prozent(au)} · neu ${prozent(Math.max(0, 1 - s - au))}`}>
            <Badge size="sm" variant="light" color={ampel(wert)} tt="none" leftSection="●" data-person-ampel={ampel(wert)}>
              {name}
            </Badge>
          </Tooltip>
        )
      })}
    </Group>
  )
}

/** Wer mit einem Problemwort kämpft (Klick auf ⚠) */
function ProblemMarke({ wort, wer, experte }: { wort: Wort; wer: ProblemPerson[] | undefined; experte: boolean }): React.JSX.Element {
  return (
    <Popover position="bottom-end" withinPortal shadow="md" width={240}>
      <Popover.Target>
        <ActionIcon size="sm" variant="subtle" color="orange" aria-label={`${wort.term}: Problemwort – wer hat Schwierigkeiten?`} data-wort-problem={wort.id}>
          <IconAlertTriangle size={15} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown data-wort-problem-wer={wort.id}>
        <Text size="xs" fw={700} mb={4}>
          Schwierigkeiten mit „{wort.term}“
        </Text>
        {wer?.length ? (
          <Stack gap={2}>
            {wer.map((p) => (
              <Text key={p.name} size="xs">
                {p.name}
                <Text span size="xs" c="dimmed">
                  {' '}
                  · {p.falsch} Fehler
                  {experte ? ` bei ${p.versuche} Versuchen` : ''}
                </Text>
              </Text>
            ))}
          </Stack>
        ) : (
          <Text size="xs" c="dimmed">
            Keine Angaben je Person.
          </Text>
        )}
      </Popover.Dropdown>
    </Popover>
  )
}

/** Eine Wortzeile: Wort – Übersetzung, % sicher, ⚠, Medien, Bearbeiten */
function WortZeile({
  v,
  kursId,
  sprache,
  sicher,
  problem,
  wer,
  medien,
  geaendert
}: {
  v: Wort
  kursId: string
  sprache: string
  sicher: number | undefined
  problem: boolean
  wer: ProblemPerson[] | undefined
  medien: {
    sicht: ReturnType<typeof useMedienbank>['daten'][string] | undefined
    admin: boolean
    lagen: Stimmlage[]
    tonErzeugen: (v: Wort, lage: Stimmlage) => Promise<void>
    bildOeffnen: (v: Wort) => void
  }
  geaendert: () => void
}): React.JSX.Element {
  const experte = useExperte()
  const [bearbeiten, setBearbeiten] = useState(false)
  const [form, setForm] = useState({ term: v.term, translation: v.translation, auch: (v.auchRichtig ?? []).join('; '), aussprache: v.aussprache ?? '' })
  const [laeuft, setLaeuft] = useState(false)
  const sicht = medien.sicht
  const bild = sicht?.bild?.dataUrl ?? sicht?.bild?.url ?? v.bild
  // Aussprache: je Fassung (w/m) die Aufnahme – sonst die Gerätestimme
  const lagen = [...new Set<Stimmlage>([...medien.lagen, ...(['w', 'm'] as Stimmlage[]).filter((l) => tonVon(sicht, l))])]
  const tonKnoepfe = lagen.filter((l) => tonVon(sicht, l) || medien.admin)
  const zwei = tonKnoepfe.length > 1
  const speichern = async (): Promise<void> => {
    setLaeuft(true)
    try {
      await senden(`/server/vokabeln/${kursId}/wort`, {
        wortId: v.id,
        term: form.term,
        translation: form.translation,
        auchRichtig: auchRichtigAusText(form.auch),
        aussprache: form.aussprache
      })
      notifySuccess(`„${form.term.trim()}“ gespeichert.`)
      setBearbeiten(false)
      geaendert()
    } catch (e) {
      notifyError(e)
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <div data-kurs-wort={v.id} style={{ padding: '3px 0', borderTop: '1px solid var(--mantine-color-default-border)' }}>
      <Group gap={6} wrap="nowrap" align="center">
        <Text size="sm" style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
          <b>{v.term}</b> – {v.translation}
          {v.auchRichtig?.length ? (
            <Text span size="xs" c="dimmed">
              {' '}
              (auch: {v.auchRichtig.join('; ')})
            </Text>
          ) : null}
        </Text>
        {sicher !== undefined && (
          <Tooltip label="Anteil der Lernenden, für die das Wort sicher ist">
            <Text size="xs" c={ampel(sicher)} fw={600} w={38} ta="right" style={{ flexShrink: 0 }} data-wort-sicher={Math.round(sicher * 100)}>
              {prozent(sicher)}
            </Text>
          </Tooltip>
        )}
        {problem && <ProblemMarke wort={v} wer={wer} experte={experte} />}
        <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }} data-wort-medien>
          {tonKnoepfe.length ? (
            tonKnoepfe.map((l) => (
              <TonZelle
                key={l}
                ton={tonVon(sicht, l)}
                text={v.term}
                art="wort"
                lage={zwei ? l : undefined}
                admin={medien.admin}
                gesprochen={gesprochenFuer('wort', v.term, v, sprache)}
                erzeugen={() => medien.tonErzeugen(v, l)}
              />
            ))
          ) : (
            <Tooltip label="Anhören (Gerätestimme)">
              <ActionIcon variant="subtle" color="gray" onClick={() => sprich(v.term, sprachKurz(sprache), sprechTextFuerWort(v, sprachKurz(sprache)))} aria-label={`„${v.term}“ anhören`} data-wort-sprechen>
                <IconVolume size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          {bild ? (
            <UnstyledButton onClick={() => medien.bildOeffnen(v)} aria-label={`Beispielbild zu „${v.term}“`} data-beispielbild={v.term}>
              <Image src={bild} w={28} h={28} fit="cover" radius={4} alt="" />
            </UnstyledButton>
          ) : medien.admin ? (
            <Tooltip label="Beispielbild suchen">
              <ActionIcon variant="subtle" color="gray" onClick={() => medien.bildOeffnen(v)} aria-label={`Beispielbild zu „${v.term}“`} data-beispielbild={v.term}>
                <IconPhoto size={16} />
              </ActionIcon>
            </Tooltip>
          ) : null}
          <Tooltip label="Bearbeiten">
            <ActionIcon variant="subtle" color="gray" onClick={() => setBearbeiten((b) => !b)} aria-label={`„${v.term}“ bearbeiten`} aria-expanded={bearbeiten} data-wort-bearbeiten={v.id}>
              <IconPencil size={15} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      {bearbeiten && (
        <Stack gap={6} py={6} pl={4} data-wort-form={v.id}>
          <Group gap={6} grow wrap="wrap">
            <TextInput size="xs" label="Wort" value={form.term} onChange={(e) => setForm({ ...form, term: e.currentTarget.value })} data-wort-feld="term" miw={140} />
            <TextInput
              size="xs"
              label="Übersetzung"
              value={form.translation}
              onChange={(e) => setForm({ ...form, translation: e.currentTarget.value })}
              data-wort-feld="translation"
              miw={140}
            />
          </Group>
          <Group gap={6} grow wrap="wrap">
            <TextInput
              size="xs"
              label="Auch richtig"
              description="Mehrere mit Semikolon trennen"
              value={form.auch}
              onChange={(e) => setForm({ ...form, auch: e.currentTarget.value })}
              data-wort-feld="auchRichtig"
              miw={140}
            />
            <TextInput
              size="xs"
              label="Aussprache als"
              description="Sprechtext statt des Wortes (nur für den Ton)"
              value={form.aussprache}
              onChange={(e) => setForm({ ...form, aussprache: e.currentTarget.value })}
              data-wort-feld="aussprache"
              miw={140}
            />
          </Group>
          <Group gap={6} justify="flex-end">
            <Button size="compact-xs" variant="default" onClick={() => setBearbeiten(false)}>
              Abbrechen
            </Button>
            <Button size="compact-xs" loading={laeuft} disabled={!form.term.trim() || !form.translation.trim()} onClick={() => void speichern()} data-wort-speichern>
              Speichern
            </Button>
          </Group>
        </Stack>
      )}
    </div>
  )
}

export function AbschnitteWoerter({
  d,
  kursId,
  statistik,
  eingebettet,
  ausfuehren,
  geaendert,
  kurzzeile
}: {
  d: Lernstanddaten
  kursId: string
  statistik?: { abschnitte: AbschnittStatistik[]; namen: string[] }
  /** In „Meine Klassen": zu Beginn zugeklappt */
  eingebettet: boolean
  ausfuehren: (f: AbschnittFrage) => Promise<void>
  geaendert: () => void
  /** Kurzzeile im zugeklappten Kopf */
  kurzzeile?: string
}): React.JSX.Element {
  const experte = useExperte()
  const [offen, setOffen] = useGemerkt(eingebettet ? 'mk-abschnitte-offen' : 'kurs-abschnitte-offen', !eingebettet)
  const [suche, setSuche] = useState('')
  const [nurProbleme, setNurProbleme] = useState(false)
  /** Abweichungen vom Standard (oberste Unit offen, Abschnitte zu) – für die Sitzung */
  const [unitsAuf, setUnitsAuf] = useOffenGemerkt<Record<string, boolean>>(`schulapps-kurs-units-${kursId}`, {})
  const [abschnitteAuf, setAbschnitteAuf] = useOffenGemerkt<Record<string, boolean>>(`schulapps-kurs-abschnitt-${kursId}`, {})
  const [entferntOffen, setEntferntOffen] = useOffenGemerkt<boolean>(`schulapps-kurs-entfernt-${kursId}`, false)
  const [frage, setFrage] = useState<AbschnittFrage | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const namen = statistik?.namen ?? []
  const teile = d.teile ?? []
  const entfernt = d.entfernt ?? []
  const alle = useMemo(() => abschnittsZeilen(teile, d.woerter, d.quelle, statistik?.abschnitte), [teile, d.woerter, d.quelle, statistik])
  const probleme = useMemo(() => new Set(d.problem.map((p) => p.id)), [d.problem])
  const filter = Boolean(suche.trim()) || nurProbleme
  const zeilen = useMemo(() => zeilenFiltern(alle, suche, nurProbleme ? probleme : null), [alle, suche, nurProbleme, probleme])
  const baende = useMemo(() => nachBaenden(zeilen), [zeilen])
  const alleBaende = useMemo(() => nachBaenden(alle).map((b) => b.buch), [alle])
  const bandAuf = useBaendeOffen(`woerter-${kursId}`, alleBaende)
  // Medien nur für die Wörter aufgeklappter Abschnitte (bzw. der Treffer)
  const k = (b: string, u: string): string => `${b}|${u}`
  const ersteUnit = (() => {
    const b0 = nachBaenden(alle)[0]
    return b0 ? k(b0.buch, b0.units[0]?.unit ?? '') : ''
  })()
  const unitOffen = (schluessel: string): boolean => filter || (unitsAuf[schluessel] ?? schluessel === ersteUnit)
  const abschnittSchluessel = (z: Zeile): string => `${z.index}|${z.titel}`
  const abschnittOffen = (z: Zeile): boolean => filter || Boolean(abschnitteAuf[abschnittSchluessel(z)])
  const sichtbar = offen ? zeilen.filter((z) => unitOffen(k(z.buch, z.unit)) && abschnittOffen(z)).flatMap((z) => z.woerter) : []
  const sprache = d.sprache || 'en'
  const ziel = useMedienZiel({ docId: `kurs:${kursId}`, titel: d.ueberschrift || d.titel })
  const medienbank = useMedienbank(sprache, sichtbar.map((v) => v.term), ziel.stufe)
  const admin = useMedienAdmin()
  const stimmen = useStandardstimmen(sprache)
  const [bildFuer, setBildFuer] = useState<Wort | null>(null)
  const tonErzeugen = async (v: Wort, lage: Stimmlage): Promise<void> => {
    if (!stimmen?.[lage]) throw new Error('Für diese Sprache ist keine Standardstimme eingestellt (Einstellungen › Bilder und Hörtexte).')
    await starteMedienAuftrag({
      art: 'aussprache',
      sprache: sprachKurz(sprache),
      vokabeln: [{ term: v.term, translation: v.translation, aussprache: v.aussprache }],
      ziel,
      lagen: [lage],
      einzeln: true
    })
    medienbank.laden()
  }
  const medienLagen = admin ? lagenVon(stimmen ?? undefined) : []
  // Neu in den letzten 2 Wochen (geplante zählen erst ab ihrem Zeitpunkt; der erste Abschnitt ist der Anfang des Kurses)
  const jetzt = Date.now()
  const neu = teile.filter((t, i) => i > 0 && t.zeit > jetzt - NEU_TAGE && t.zeit <= jetzt).reduce((a, t) => a + t.anzahl, 0)
  const los = async (): Promise<void> => {
    if (!frage) return
    setLaeuft(true)
    try {
      await ausfuehren(frage)
      setFrage(null)
    } finally {
      setLaeuft(false)
    }
  }
  const umschalten = (set: typeof setUnitsAuf, schluessel: string, jetztOffen: boolean): void => set((a) => ({ ...a, [schluessel]: !jetztOffen }))

  const abschnittZeile = (z: Zeile): React.JSX.Element => {
    const auf = abschnittOffen(z)
    const st = z.stat
    const fertig = st ? st.jeLernende.filter(([s]) => s >= 1).length : 0
    const geplant = z.zeit > jetzt
    return (
      <div key={abschnittSchluessel(z)} data-abschnitt={z.name} data-vokabel-abschnitt={z.titel} data-abschnitt-offen={auf || undefined}>
        <Group gap={4} wrap="nowrap" align="center">
          <UnstyledButton
            onClick={() => !filter && umschalten(setAbschnitteAuf, abschnittSchluessel(z), auf)}
            aria-expanded={auf}
            style={{ flex: 1, minWidth: 0 }}
            data-abschnitt-knopf
          >
            <Group gap={6} wrap="nowrap">
              {auf ? <IconChevronDown size={13} style={{ flexShrink: 0 }} /> : <IconChevronRight size={13} style={{ flexShrink: 0 }} />}
              <Text size="sm" fw={500} truncate style={{ flex: '1 1 90px', minWidth: 48 }}>
                {z.name}
              </Text>
              <GeplantMarke ab={z.zeit} />
              <Tooltip label={`${z.anzahl} Wörter${z.zeit && !geplant ? ` · freigegeben am ${tag(z.zeit)}` : ''}`}>
                <Text size="xs" c={!geplant && z.zeit > jetzt - NEU_TAGE && z.index > 0 ? 'green' : 'dimmed'} style={{ whiteSpace: 'nowrap', flexShrink: 0 }} data-abschnitt-woerter={z.anzahl}>
                  {z.anzahl} W.
                </Text>
              </Tooltip>
              {st && (
                <>
                  <StandBalken a={st} breite={64} schmal />
                  <Text size="xs" c="dimmed" w={34} ta="right" style={{ flexShrink: 0 }}>
                    {prozent(st.sicher)}
                  </Text>
                  {namen.length > 0 && (
                    <Tooltip label="Lernende, die alle Wörter des Abschnitts sicher können">
                      <Text size="xs" c="dimmed" visibleFrom="sm" style={{ whiteSpace: 'nowrap', flexShrink: 0 }} data-abschnitt-fertig={fertig}>
                        {fertig}/{namen.length} fertig
                      </Text>
                    </Tooltip>
                  )}
                </>
              )}
            </Group>
          </UnstyledButton>
          {teile.length > 0 && (
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <ActionIcon size="sm" variant="subtle" color="gray" aria-label={`${z.titel}: Aktionen`} data-vokabel-abschnitt-aktionen={z.index}>
                  <IconDots size={15} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => setFrage({ was: 'entfernen', titel: z.titel, index: z.index })} data-vokabel-abschnitt-entfernen>
                  Entfernen
                </Menu.Item>
                <Menu.Item color="red" onClick={() => setFrage({ was: 'loeschen', titel: z.titel, index: z.index })} data-vokabel-abschnitt-loeschen>
                  Endgültig löschen …
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
        {auf && (
          <div style={{ paddingLeft: 'clamp(0px, 3vw, 19px)', paddingTop: 2, paddingBottom: 4 }} data-abschnitt-woerter-liste>
            {st && !filter && (
              <Stack gap={4} pb={4} data-abschnitt-detail>
                <Text size="xs" c="dimmed">
                  {st.schwach === null ? (
                    `Schwierigkeiten: noch zu früh (gezählt ab ${REIF_TAGE} Tagen nach der Freigabe)`
                  ) : (
                    <>
                      Schwierigkeiten: <b>{st.schwach ? `${st.schwach} von ${namen.length}` : 'keine'}</b> (unter {prozent(SCHWACH_UNTER)} sicher)
                    </>
                  )}
                </Text>
                <Text size="xs">
                  <b>Schwierigste Wörter:</b>{' '}
                  {st.probleme.length
                    ? st.probleme.map((p) => `${p.term} – ${p.translation}${experte ? ` (${prozent(p.quote)} falsch)` : ''}`).join('; ')
                    : experte
                      ? 'noch keine (erst ab drei Versuchen gezählt)'
                      : 'noch keine'}
                </Text>
                {namen.length > 0 && <PersonenAmpeln a={st} namen={namen} />}
              </Stack>
            )}
            {z.woerter.map((v) => (
              <WortZeile
                key={v.id}
                v={v}
                kursId={kursId}
                sprache={sprache}
                sicher={d.wortSicher?.[v.id]}
                problem={probleme.has(v.id)}
                wer={d.problemWer?.[v.id]}
                medien={{ sicht: medienbank.daten[v.term], admin, lagen: medienLagen, tonErzeugen, bildOeffnen: setBildFuer }}
                geaendert={geaendert}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  const inhalt = (
    <Stack gap={8} mt="xs" data-vok-abschnitte>
      <Group gap="xs" wrap="wrap">
        <TextInput
          size="xs"
          placeholder="Wort suchen"
          leftSection={<IconSearch size={13} />}
          value={suche}
          onChange={(e) => setSuche(e.currentTarget.value)}
          style={{ flex: '1 1 200px', maxWidth: 340 }}
          aria-label="Wort suchen"
          data-woerter-suche
          data-abschnitt-suche
        />
        <Switch
          size="xs"
          label={`Nur Problemwörter${probleme.size ? ` (${probleme.size})` : ''}`}
          checked={nurProbleme}
          disabled={!probleme.size}
          onChange={(e) => setNurProbleme(e.currentTarget.checked)}
          data-nur-problemwoerter
        />
      </Group>
      {filter && !zeilen.length && (
        <Text size="xs" c="dimmed" data-woerter-keine>
          {nurProbleme && !suche.trim() ? 'Keine Problemwörter.' : 'Kein Wort passt zur Suche.'}
        </Text>
      )}
      {baende.map((b) => (
        <BandGruppe
          key={b.buch || 'ohne'}
          buch={b.buch}
          ohneBand="Ohne Lehrwerk"
          zusatz={((l) => {
            const w = l.reduce((n, z) => n + z.anzahl, 0)
            const mitStat = l.filter((z) => z.stat)
            const ws = mitStat.reduce((n, z) => n + z.anzahl, 0)
            const sicher = ws ? mitStat.reduce((n, z) => n + z.stat!.sicher * z.anzahl, 0) / ws : null
            return `${b.units.length} ${b.units.length === 1 ? 'Unit' : 'Units'} · ${l.length} ${l.length === 1 ? 'Abschnitt' : 'Abschnitte'} · ${w} Wörter${sicher === null ? '' : ` · ${prozent(sicher)} sicher`}`
          })(b.units.flatMap((u) => u.zeilen))}
          data-vokabel-band={b.buch || 'ohne'}
          {...(alleBaende.length > 1 ? { offen: filter || bandAuf.offen(b.buch), umschalten: () => bandAuf.umschalten(b.buch) } : {})}
        >
          <Stack gap={10}>
            {b.units.map((g) => {
              const schluessel = k(b.buch, g.unit)
              const auf = unitOffen(schluessel)
              const woerter = g.zeilen.reduce((s, z) => s + z.anzahl, 0)
              const mitStat = g.zeilen.filter((z) => z.stat)
              const ws = mitStat.reduce((n, z) => n + z.anzahl, 0)
              const sicher = ws ? mitStat.reduce((n, z) => n + z.stat!.sicher * z.anzahl, 0) / ws : null
              return (
                <div key={schluessel} data-abschnitt-gruppe={g.unit || OHNE_UNIT} data-offen={auf || undefined}>
                  <UnstyledButton onClick={() => !filter && umschalten(setUnitsAuf, schluessel, auf)} aria-expanded={auf} data-abschnitt-gruppe-knopf>
                    <Group gap={6} wrap="nowrap">
                      {auf ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                      <Text size="sm" fw={700} style={{ whiteSpace: 'nowrap' }}>
                        {g.unit || OHNE_UNIT}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {g.zeilen.length} {g.zeilen.length === 1 ? 'Abschnitt' : 'Abschnitte'} · {woerter} W.{sicher === null ? '' : ` · ${prozent(sicher)} sicher`}
                      </Text>
                    </Group>
                  </UnstyledButton>
                  {auf && (
                    <Stack gap={4} mt={4} pl={{ base: 6, sm: 20 }}>
                      {g.zeilen.map(abschnittZeile)}
                    </Stack>
                  )}
                </div>
              )
            })}
          </Stack>
        </BandGruppe>
      ))}
      {entfernt.length > 0 && (
        <div data-vokabel-entfernt>
          <UnstyledButton onClick={() => setEntferntOffen(!entferntOffen)} aria-expanded={entferntOffen} data-vokabel-entfernt-kopf>
            <Group gap={4}>
              <IconChevronDown size={14} style={{ transform: entferntOffen ? undefined : 'rotate(-90deg)', transition: 'transform .2s' }} />
              <Text size="sm" c="dimmed">
                Entfernt ({entfernt.length})
              </Text>
            </Group>
          </UnstyledButton>
          {entferntOffen && (
            <Stack gap={4} mt={4} pl="md">
              <Text size="xs" c="dimmed">
                Wieder aufnehmen über „Vokabeln hinzufügen“ – der Lernstand gilt dann weiter.
              </Text>
              {entfernt.map((e, i) => (
                <Group key={i} justify="space-between" wrap="nowrap" gap="xs" data-vokabel-entfernt-zeile={e.teil}>
                  <Text size="sm" c="dimmed">
                    {e.teil} · {e.anzahl} Wörter · entfernt am {new Date(e.zeit).toLocaleDateString('de-DE')}
                  </Text>
                  <Button size="compact-xs" variant="subtle" color="red" onClick={() => setFrage({ was: 'loeschen', titel: e.teil, entfernt: i })} data-vokabel-entfernt-loeschen={i}>
                    Endgültig löschen
                  </Button>
                </Group>
              ))}
            </Stack>
          )}
        </div>
      )}
    </Stack>
  )

  return (
    <Card withBorder radius="md" padding="sm" data-kurs-abschnitte data-vokabel-abschnitte>
      <KastenKopf
        titel={
          <Group gap="xs" component="span" wrap="wrap">
            <span>Abschnitte & Wörter</span>
            <Text span size="sm" c="dimmed" fw={500}>
              {d.woerter.length} Wörter
            </Text>
            {neu > 0 && (
              <Badge component="span" color="green" variant="light" tt="none" data-vokabel-neu14>
                +{neu} in den letzten 2 Wochen
              </Badge>
            )}
            {entfernt.length > 0 && (
              <Badge component="span" color="gray" variant="light" tt="none">
                {entfernt.length} entfernt
              </Badge>
            )}
          </Group>
        }
        offen={offen}
        umschalten={() => setOffen(!offen)}
        data-kurs-abschnitte-kopf
        data-vokabel-abschnitte-kopf
      />
      {offen ? (
        inhalt
      ) : kurzzeile ? (
        <Text size="xs" c="dimmed" ml={26} data-kurs-abschnitte-kurz>
          {kurzzeile}
        </Text>
      ) : null}
      {bildFuer && (
        <BildDialog
          sprache={sprachKurz(sprache)}
          v={{ term: bildFuer.term, translation: bildFuer.translation }}
          sicht={medienbank.daten[bildFuer.term]}
          admin={admin}
          ziel={ziel}
          schliessen={() => setBildFuer(null)}
          geaendert={() => medienbank.laden()}
        />
      )}
      <Modal opened={Boolean(frage)} onClose={() => setFrage(null)} title={frage?.was === 'loeschen' ? 'Abschnitt endgültig löschen?' : 'Abschnitt entfernen?'}>
        {frage && (
          <Stack gap="sm">
            <Text size="sm" fw={600}>
              {frage.titel}
            </Text>
            <Text size="sm">
              {frage.was === 'loeschen'
                ? 'Die Wörter und der Lernstand aller Lernenden zu diesen Wörtern werden endgültig gelöscht. Das lässt sich nicht rückgängig machen.'
                : 'Abschnitt entfernen? Der Lernstand bleibt gespeichert und gilt wieder, wenn der Abschnitt erneut hinzugefügt wird.'}
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setFrage(null)}>
                Abbrechen
              </Button>
              <Button color="red" loading={laeuft} onClick={() => void los()} data-vokabel-abschnitt-bestaetigen={frage.was}>
                {frage.was === 'loeschen' ? 'Endgültig löschen' : 'Entfernen'}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Card>
  )
}
