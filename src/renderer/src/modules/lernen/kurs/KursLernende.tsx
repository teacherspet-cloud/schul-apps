/**
 * Lernende eines Kurses (aus VokabelTraining.tsx herausgelöst am 09.10.2026 für die gemeinsame Kursseite): Tabelle je
 * Lernende/r (Karteikasten bzw. Grammatik mit Fördern/Fordern), Details-Fenster mit Kompetenzprofil.
 */
import { ActionIcon, Badge, Button, Card, Group, Modal, Progress, SegmentedControl, Stack, Switch, Table, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconUser, IconUserMinus } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { AktiveFilter, SortKopf, useSortierTabelle, type Spalte } from '../../../shared/components/SortierTabelle'
import { useExperte } from '../../../shared/settingsStore'
import { holen } from '../../onlinetest/serverApi'
import { extraStarten, type ProfilPunkt } from './KursGrammatik'
import { KastenKopf, useGemerkt, useGemerktText } from './Kasten'
import { Faecherbalken } from './LernstandVerlauf'
import type { Lernende } from './kursDaten'
import { LEHRWERK_GRAMMATIK } from '../../../shared/lehrwerkGrammatik'
import {
  AMPEL_NAME,
  ampelVon,
  bandVon,
  BEREICHE,
  bereichName,
  bereichVonRegel,
  empfehlung,
  langeNichtGeuebt,
  lehrwerkStelle,
  MIN_VERSUCHE,
  stellenRang,
  type Ampel
} from '@shared/grammatikBereiche'

/** Schwellen wie im Server (grammatik.ts): Schwäche unter 60 %, Stärke ab 85 %, Befund erst ab 5 Versuchen */
type Stufe = 'rot' | 'gelb' | 'gruen' | 'grau'
const stufeVon = (r: { versuche: number; quote: number } | undefined): Stufe | null =>
  !r ? null : r.versuche < 5 ? 'grau' : r.quote < 0.6 ? 'rot' : r.quote < 0.85 ? 'gelb' : 'gruen'
const prozent = (p: { quote: number }): string => `${Math.round(p.quote * 100)} %`
/** Alle geübten Regeln einer Person (ältere Server ohne `regeln`: nur Stärken und Schwächen) */
export const regelnVon = (l: Lernende): ProfilPunkt[] => l.grammatik?.regeln ?? [...(l.grammatik?.schwaechen ?? []), ...(l.grammatik?.staerken ?? [])]
const regelVon = (l: Lernende, titel: string): ProfilPunkt | undefined => regelnVon(l).find((p) => p.titel === titel)

const AMPEL_FARBE: Record<Ampel, string> = { sicher: 'teal', aufbau: 'yellow', schwaeche: 'red', wenig: 'gray' }
const datum = (ms?: number): string => (ms ? new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '–')

/** Laufende Extra-Aufgaben einer Person als kleine Plaketten (08.10.2026) */
function ExtraPlaketten({ l }: { l: Lernende }): React.JSX.Element | null {
  const extra = l.grammatik?.extra ?? []
  if (!extra.length) return null
  return (
    <Group gap={4}>
      {extra.map((x) => (
        <Tooltip key={x.id} label={x.titel}>
          <Badge size="sm" variant="outline" color={x.bearbeitet >= x.gesamt ? 'teal' : 'gray'} tt="none" data-extra-stand={x.id}>
            {x.art === 'foerder' ? 'Förderung' : 'Forderung'} {x.bearbeitet >= x.gesamt ? 'geschafft' : `${x.bearbeitet}/${x.gesamt}`}
          </Badge>
        </Tooltip>
      ))}
    </Group>
  )
}

/** Wo im Lehrwerk eine Regel eingeführt wurde: Band/Unit der Freigabe, sonst aus den Kennungen und dem Band des Kurses */
function stelleVon(p: ProfilPunkt, band: string | undefined): { text: string; rang: number } | null {
  if (p.lehrwerk && LEHRWERK_GRAMMATIK[p.lehrwerk.buch]?.[p.lehrwerk.unit]) {
    const rang = stellenRang(p.lehrwerk.buch, p.lehrwerk.unit, LEHRWERK_GRAMMATIK)
    if (rang !== null) return { text: `${p.lehrwerk.buch} · ${p.lehrwerk.unit}`, rang }
  }
  const s = lehrwerkStelle(p.kennungen ?? [], band ?? (p.lehrwerk ? bandVon(p.lehrwerk.buch, LEHRWERK_GRAMMATIK) : undefined), LEHRWERK_GRAMMATIK)
  return s ? { text: `${s.buch} · ${s.unit}`, rang: s.rang } : null
}

type DetailFilter = Ampel | 'alt' | null

/** „Kommt nicht voran": im Aufbau trotz vieler Versuche */
const STOCKT_AB = 12
const stockt = (p: ProfilPunkt, a: Ampel): boolean => a === 'aufbau' && p.versuche >= STOCKT_AB

/**
 * Details je Lernende/r (08.10.2026, abgestimmt; überarbeitet 08.10.2026 für VIELE Grammatikformen über die Jahre – ohne
 * breite Tabellen, die frühere „Übersicht" Lernende × Regeln ist hier aufgegangen):
 *  1. Kompetenzprofil: je Bereich eine Zeile kleiner Kacheln, eine je Form (Farbe = Ampel, gestrichelt = lange nicht
 *     geübt); Tooltip mit Form, Anteil richtig, Versuche, zuletzt geübt und Kursschnitt; Klick öffnet die Zeile der Form.
 *  2. „Braucht Aufmerksamkeit": Schwächen, Formen, die trotz vieler Versuche nicht vorankommen, und lange nicht Geübtes –
 *     mit typischen Fehlern und Fördern/Fordern je Form.
 *  3. „Alle Formen (n)" zugeklappt, nach Bereichen oder Lehrwerk-Units; die Zahlen oben filtern.
 */
function GrammatikDetails({
  l,
  name,
  band,
  alle,
  starten,
  schliessen
}: {
  l: Lernende
  name: string
  band: string | undefined
  /** Alle Lernenden des Kurses – für den Kursschnitt je Form */
  alle: Lernende[]
  starten: (art: 'foerder' | 'forder', regel: string) => void
  schliessen: () => void
}): React.JSX.Element {
  const [filter, setFilter] = useState<DetailFilter>(null)
  const [ansicht, setAnsicht] = useGemerktText('vok-details-ansicht', 'bereiche')
  const [umgeschaltet, setUmgeschaltet] = useState<Record<string, boolean>>({})
  const [alleOffen, setAlleOffen] = useState(false)
  const [fokus, setFokus] = useState<string | null>(null)
  const jetzt = Date.now()
  const regeln = regelnVon(l).map((p) => ({ p, a: ampelVon(p), b: bereichVonRegel(p.titel, p.kennungen ?? []), s: stelleVon(p, band) }))
  type R = (typeof regeln)[number]
  const zahl = (f: Exclude<DetailFilter, null>): number => regeln.filter((r) => (f === 'alt' ? langeNichtGeuebt(r.p.zuletzt, jetzt) : r.a === f)).length
  const passt = (r: R): boolean => !filter || (filter === 'alt' ? langeNichtGeuebt(r.p.zuletzt, jetzt) : r.a === filter)
  const chips: { f: Exclude<DetailFilter, null>; text: string; farbe: string }[] = [
    { f: 'sicher', text: 'Sicher', farbe: 'teal' },
    { f: 'aufbau', text: 'im Aufbau', farbe: 'yellow' },
    { f: 'schwaeche', text: 'Schwäche', farbe: 'red' },
    { f: 'alt', text: 'seit 3 Wochen nicht geübt', farbe: 'gray' },
    ...(zahl('wenig') ? [{ f: 'wenig' as const, text: 'zu wenig geübt', farbe: 'gray' }] : [])
  ]
  // Kursschnitt je Form (die Information der früheren „Übersicht")
  const kursSchnitt = (titel: string): { quote: number; n: number } | null => {
    const q = alle.map((x) => regelVon(x, titel)).filter((p): p is ProfilPunkt => Boolean(p && p.versuche >= MIN_VERSUCHE))
    return q.length ? { quote: q.reduce((s, p) => s + p.quote, 0) / q.length, n: q.length } : null
  }
  // Gruppen: Bereiche (Schwächen zuerst, sonst feste Reihenfolge) oder Lehrwerk-Units (chronologisch, ohne Stelle zuletzt)
  const gruppieren = (art: string): { k: string; titel: string; rang: number; zeilen: R[]; schwach: boolean; alleSicher: boolean }[] => {
    const gruppen = new Map<string, { titel: string; rang: number; zeilen: R[] }>()
    for (const r of regeln) {
      const schluessel = art === 'units' ? (r.s?.text ?? '') : r.b
      const g = gruppen.get(schluessel) ?? {
        titel: art === 'units' ? (r.s?.text ?? 'ohne Lehrwerk-Stelle') : bereichName(r.b),
        rang: art === 'units' ? (r.s?.rang ?? Number.MAX_SAFE_INTEGER) : BEREICHE.findIndex((x) => x.id === r.b),
        zeilen: []
      }
      g.zeilen.push(r)
      gruppen.set(schluessel, g)
    }
    return [...gruppen.entries()]
      .map(([k, g]) => ({ k, ...g, schwach: g.zeilen.some((r) => r.a === 'schwaeche'), alleSicher: g.zeilen.every((r) => r.a === 'sicher') }))
      .sort((x, y) => (art === 'units' ? 0 : Number(y.schwach) - Number(x.schwach)) || x.rang - y.rang)
  }
  const bereiche = gruppieren('bereiche').sort((x, y) => x.rang - y.rang)
  const liste = gruppieren(ansicht)
  const istOffen = (g: (typeof liste)[number]): boolean => (filter ? true : (umgeschaltet[g.k] ?? !g.alleSicher))
  const aufmerksam = regeln
    .filter((r) => r.a === 'schwaeche' || stockt(r.p, r.a) || langeNichtGeuebt(r.p.zuletzt, jetzt))
    .sort((x, y) => Number(y.a === 'schwaeche') - Number(x.a === 'schwaeche') || x.p.quote - y.p.quote)
  // Kachel angeklickt: „Alle Formen" auf, Gruppe der Form auf, Zeile in die Mitte
  const zeigeForm = (r: R): void => {
    setFilter(null)
    setAlleOffen(true)
    setFokus(r.p.titel)
    const k = ansicht === 'units' ? (r.s?.text ?? '') : r.b
    setUmgeschaltet((u) => ({ ...u, [k]: true }))
  }
  useEffect(() => {
    if (!fokus) return
    const t = setTimeout(() => {
      const el = [...document.querySelectorAll<HTMLElement>('[data-alle-formen] [data-regel-zeile]')].find((x) => x.dataset.regelZeile === fokus)
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 60)
    return () => clearTimeout(t)
  }, [fokus, ansicht])
  const gruende = (r: R): string[] => [
    ...(r.a === 'schwaeche' ? ['Schwäche'] : []),
    ...(stockt(r.p, r.a) ? [`kommt nicht voran (${r.p.versuche} Versuche)`] : []),
    ...(langeNichtGeuebt(r.p.zuletzt, jetzt) ? ['lange nicht geübt'] : [])
  ]
  const formZeile = (r: R, mitGrund: boolean): React.JSX.Element => {
    const { p, a } = r
    const k = kursSchnitt(p.titel)
    return (
      <div
        key={p.titel}
        data-regel-zeile={p.titel}
        data-ampel={a}
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          padding: '6px 8px',
          borderRadius: 6,
          background: fokus === p.titel ? 'var(--mantine-primary-color-light)' : undefined,
          borderTop: '1px solid var(--mantine-color-default-border)'
        }}
      >
        <Tooltip label={AMPEL_NAME[a]}>
          <div style={{ flex: '0 0 12px', width: 12, height: 12, marginTop: 4, borderRadius: 6, background: `var(--mantine-color-${AMPEL_FARBE[a]}-6)` }} />
        </Tooltip>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Group gap={6} wrap="wrap">
            <Text size="sm" fw={600}>
              {p.titel}
            </Text>
            {mitGrund &&
              gruende(r).map((g) => (
                <Badge key={g} size="xs" variant="light" color={g === 'Schwäche' ? 'red' : 'orange'} tt="none">
                  {g}
                </Badge>
              ))}
          </Group>
          <Text size="xs" c="dimmed" data-regel-werte>
            {prozent(p)} richtig · {p.versuche} Versuche ·{' '}
            <Text span size="xs" c={langeNichtGeuebt(p.zuletzt, jetzt) ? 'orange' : undefined}>
              zuletzt {datum(p.zuletzt)}
            </Text>
            {k ? ` · Kurs Ø ${Math.round(k.quote * 100)} %` : ''}
            {r.s ? ` · ${r.s.text}` : ''}
          </Text>
          {p.fehler.length > 0 && (
            <Text size="xs" c="dimmed" data-regel-fehler>
              {p.fehler.slice(-3).map((f, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  <Text span size="xs" c="red" td="line-through">
                    {f.antwort || '(leer)'}
                  </Text>{' '}
                  →{' '}
                  <Text span size="xs" c="teal" fw={600}>
                    {f.richtig}
                  </Text>
                </span>
              ))}
            </Text>
          )}
        </div>
        <Group gap={4} wrap="nowrap" style={{ flex: '0 0 auto' }}>
          <Button
            size="compact-xs"
            variant={a === 'schwaeche' ? 'filled' : 'light'}
            color="orange"
            disabled={a !== 'schwaeche' && a !== 'aufbau'}
            onClick={() => (starten('foerder', p.titel), schliessen())}
            data-regel-extra={`foerder:${p.titel}`}
          >
            Fördern
          </Button>
          <Button
            size="compact-xs"
            variant={a === 'sicher' ? 'filled' : 'light'}
            color="teal"
            disabled={a !== 'sicher'}
            onClick={() => (starten('forder', p.titel), schliessen())}
            data-regel-extra={`forder:${p.titel}`}
          >
            Fordern
          </Button>
        </Group>
      </div>
    )
  }
  const kachel = (r: R): React.JSX.Element => {
    const { p, a } = r
    const alt = langeNichtGeuebt(p.zuletzt, jetzt)
    const k = kursSchnitt(p.titel)
    return (
      <Tooltip
        key={p.titel}
        multiline
        maw={280}
        label={
          <>
            <Text size="xs" fw={700}>
              {p.titel}
            </Text>
            <Text size="xs">
              {AMPEL_NAME[a]} · {prozent(p)} richtig · {p.versuche} Versuche
            </Text>
            <Text size="xs">
              zuletzt geübt {datum(p.zuletzt)}
              {alt ? ' (lange her)' : ''}
            </Text>
            {k && <Text size="xs">Kurs Ø {Math.round(k.quote * 100)} % ({k.n} Lernende)</Text>}
          </>
        }
      >
        <UnstyledButton
          onClick={() => zeigeForm(r)}
          aria-label={`${p.titel}: ${AMPEL_NAME[a]}, ${prozent(p)}`}
          data-profil-kachel={p.titel}
          data-kachel-ampel={a}
          data-kachel-alt={alt || undefined}
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            background: `var(--mantine-color-${AMPEL_FARBE[a]}-${a === 'wenig' ? 3 : 6})`,
            outline: alt ? '2px dashed var(--mantine-color-orange-6)' : fokus === p.titel ? '2px solid var(--mantine-color-text)' : undefined,
            outlineOffset: 1,
            opacity: filter && !passt(r) ? 0.25 : 1
          }}
        />
      </Tooltip>
    )
  }
  return (
    <Stack gap="sm" data-lernende-details={l.name}>
      {!regeln.length ? (
        <Text size="sm" c="dimmed">
          Noch keine Grammatik geübt – ein Befund erscheint ab 5 Versuchen je Regel.
        </Text>
      ) : (
        <>
          {/* 1. Kompetenzprofil */}
          <Card withBorder padding="sm" data-kompetenzprofil>
            <Group justify="space-between" gap="xs" mb="xs">
              <Text fw={700}>Kompetenzprofil · {regeln.length} Formen</Text>
              <Group gap={6} data-details-zahlen>
                {chips.map((c) => (
                  <Button
                    key={c.f}
                    size="compact-xs"
                    radius="xl"
                    variant={filter === c.f ? 'filled' : 'light'}
                    color={c.farbe}
                    onClick={() => {
                      const neu = filter === c.f ? null : c.f
                      setFilter(neu)
                      if (neu) setAlleOffen(true)
                    }}
                    aria-pressed={filter === c.f}
                    data-details-filter={c.f}
                  >
                    {c.text} {zahl(c.f)}
                  </Button>
                ))}
              </Group>
            </Group>
            <Stack gap={6}>
              {bereiche.map((g) => (
                <div key={g.k} style={{ display: 'flex', gap: 10, alignItems: 'center' }} data-profil-bereich={g.titel}>
                  <Text size="xs" fw={600} w={150} style={{ flex: '0 0 150px' }} truncate>
                    {g.titel}
                  </Text>
                  <Group gap={5} style={{ flex: 1 }}>
                    {g.zeilen.map(kachel)}
                  </Group>
                  <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }} data-gruppe-sicher={`${g.zeilen.filter((r) => r.a === 'sicher').length}/${g.zeilen.length}`}>
                    {g.zeilen.filter((r) => r.a === 'sicher').length}/{g.zeilen.length} sicher
                  </Text>
                </div>
              ))}
            </Stack>
            <Group gap="md" mt="xs">
              {(['sicher', 'aufbau', 'schwaeche', 'wenig'] as const).map((a) => (
                <Group key={a} gap={4} wrap="nowrap">
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: `var(--mantine-color-${AMPEL_FARBE[a]}-${a === 'wenig' ? 3 : 6})` }} />
                  <Text size="xs" c="dimmed">
                    {AMPEL_NAME[a]}
                  </Text>
                </Group>
              ))}
              <Group gap={4} wrap="nowrap">
                <div style={{ width: 10, height: 10, borderRadius: 3, outline: '2px dashed var(--mantine-color-orange-6)' }} />
                <Text size="xs" c="dimmed">
                  lange nicht geübt
                </Text>
              </Group>
            </Group>
          </Card>

          {/* 2. Braucht Aufmerksamkeit */}
          <Card withBorder padding="sm" data-aufmerksamkeit>
            <Text fw={700} mb={4}>
              Braucht Aufmerksamkeit{aufmerksam.length ? ` (${aufmerksam.length})` : ''}
            </Text>
            {aufmerksam.length ? (
              <div>{aufmerksam.map((r) => formZeile(r, true))}</div>
            ) : (
              <Text size="sm" c="dimmed">
                Nichts Auffälliges – keine Schwäche, nichts stockt, alles in den letzten 3 Wochen geübt.
              </Text>
            )}
          </Card>

          {/* 3. Alle Formen, zugeklappt */}
          <Card withBorder padding="sm" data-alle-formen>
            <Group justify="space-between" gap="xs">
              <UnstyledButton onClick={() => setAlleOffen(!alleOffen)} aria-expanded={alleOffen} data-alle-formen-kopf>
                <Group gap="xs" wrap="nowrap">
                  <IconChevronDown size={16} style={{ transform: alleOffen ? undefined : 'rotate(-90deg)', transition: 'transform .2s' }} />
                  <Text fw={700}>
                    Alle Formen ({filter ? `${regeln.filter(passt).length} von ${regeln.length}` : regeln.length})
                  </Text>
                </Group>
              </UnstyledButton>
              {alleOffen && (
                <SegmentedControl
                  size="xs"
                  value={ansicht}
                  onChange={setAnsicht}
                  data={[
                    { value: 'bereiche', label: 'nach Bereichen' },
                    { value: 'units', label: 'nach Lehrwerk-Units' }
                  ]}
                  data-details-ansicht
                />
              )}
            </Group>
            {alleOffen && (
              <Stack gap="xs" mt="xs">
                {ansicht === 'units' && !band && (
                  <Text size="xs" c="dimmed">
                    Kein Lehrwerk mit Grammatikliste am Kurs – nur Freigaben mit Band und Unit haben eine Stelle.
                  </Text>
                )}
                {liste.map((g) => {
                  const zeilen = g.zeilen.filter(passt)
                  if (filter && !zeilen.length) return null
                  const n = (a: Ampel): number => g.zeilen.filter((r) => r.a === a).length
                  const offen = istOffen(g)
                  return (
                    <div key={g.k} data-details-gruppe={g.titel}>
                      <UnstyledButton
                        onClick={() => setUmgeschaltet({ ...umgeschaltet, [g.k]: !offen })}
                        aria-expanded={offen}
                        disabled={Boolean(filter)}
                        w="100%"
                        data-details-gruppe-kopf={g.titel}
                      >
                        <Group justify="space-between" wrap="nowrap" gap="sm">
                          <Group gap="xs" wrap="nowrap">
                            <IconChevronDown size={14} style={{ transform: offen ? undefined : 'rotate(-90deg)', transition: 'transform .2s' }} />
                            <Text size="sm" fw={700}>
                              {g.titel}
                            </Text>
                          </Group>
                          <Group gap="sm" wrap="nowrap">
                            <Progress.Root size={8} w={110} radius="xl">
                              {(['sicher', 'aufbau', 'schwaeche', 'wenig'] as const).map((a) => (
                                <Progress.Section key={a} value={(n(a) / g.zeilen.length) * 100} color={AMPEL_FARBE[a]} />
                              ))}
                            </Progress.Root>
                            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                              {n('sicher')} von {g.zeilen.length} sicher
                            </Text>
                          </Group>
                        </Group>
                      </UnstyledButton>
                      {offen && <div style={{ marginTop: 4 }}>{zeilen.map((r) => formZeile(r, false))}</div>}
                    </div>
                  )
                })}
              </Stack>
            )}
          </Card>
        </>
      )}
      {(l.grammatik?.extra.length ?? 0) > 0 && (
        <div>
          <Text size="xs" fw={700} mb={4}>
            Extra-Aufgaben von {name}
          </Text>
          <ExtraPlaketten l={l} />
        </div>
      )}
    </Stack>
  )
}

/** Befund einer Person für Filter und Hinweis */
const befundVon = (l: Lernende): string => {
  const e = empfehlung(regelnVon(l))
  return e.art === 'foerder' ? 'braucht Förderung' : e.art === 'forder' ? 'braucht Forderung' : regelnVon(l).length ? 'im Aufbau' : 'zu wenig geübt'
}

/**
 * Reiter „Grammatik" (08.10.2026, abgestimmt): Name | Details | Fördern | Fordern. Empfohlen wird mit Grund – mindestens
 * eine Schwäche: Fördern hervorgehoben („2 Schwächen", Vorrang auch bei Stärken), sonst mindestens eine Stärke: Fordern
 * („3 Stärken, keine Schwäche"), sonst beide gedämpft („erst mehr üben").
 */
function GrammatikTabelle({
  lernende,
  anzeige,
  extra,
  details
}: {
  lernende: Lernende[]
  anzeige: (l: Lernende) => string
  extra: (l: Lernende, art: 'foerder' | 'forder') => void
  details: (l: Lernende) => void
}): React.JSX.Element {
  const spalten: Spalte<Lernende>[] = [
    { id: 'name', label: 'Name', wert: (l) => anzeige(l).toLowerCase(), filterWert: anzeige, filter: 'text', namen: true },
    { id: 'details', label: 'Details', wert: (l) => regelnVon(l).length, filter: 'auswahl', filterWert: befundVon, absteigend: true },
    { id: 'foerdern', label: 'Fördern', wert: (l) => empfehlung(regelnVon(l)).schwaechen, absteigend: true },
    { id: 'fordern', label: 'Fordern', wert: (l) => empfehlung(regelnVon(l)).staerken, absteigend: true }
  ]
  const t = useSortierTabelle(lernende, spalten, { spalte: 'name', ab: false })
  const knopf = (l: Lernende, art: 'foerder' | 'forder'): React.JSX.Element => {
    const e = empfehlung(regelnVon(l))
    const punkte = (art === 'foerder' ? l.grammatik?.schwaechen : l.grammatik?.staerken) ?? []
    const empfohlen = e.art === art
    const titel = regelnVon(l)
      .filter((p) => ampelVon(p) === (art === 'foerder' ? 'schwaeche' : 'sicher'))
      .map((p) => p.titel)
    const b = (
      <Button
        size="compact-sm"
        variant={empfohlen ? 'filled' : 'light'}
        color={art === 'foerder' ? 'orange' : 'teal'}
        disabled={!punkte.length}
        onClick={() => extra(l, art)}
        data-foerdern={art === 'foerder' ? l.name : undefined}
        data-fordern={art === 'forder' ? l.name : undefined}
        data-empfohlen={empfohlen || undefined}
      >
        {art === 'foerder' ? 'Fördern' : 'Fordern'}
      </Button>
    )
    return (
      <Stack gap={2} align="flex-start">
        {punkte.length ? (
          b
        ) : (
          <Tooltip
            label={
              e.art === null
                ? 'Noch kein Befund – ab 5 Versuchen je Regel'
                : art === 'foerder'
                  ? 'Keine Schwäche (unter 60 % richtig)'
                  : 'Keine Stärke (ab 85 % richtig und gefestigt)'
            }
          >
            <span>{b}</span>
          </Tooltip>
        )}
        {empfohlen && (
          <Text
            size="xs"
            c={art === 'foerder' ? 'orange' : 'teal'}
            fw={600}
            data-schwaechen={art === 'foerder' ? titel.join(' · ') : undefined}
            data-staerken={art === 'forder' ? titel.join(' · ') : undefined}
          >
            {e.text}
          </Text>
        )}
        {e.art === null && art === 'foerder' && (
          <Text size="xs" c="dimmed" data-befund-offen>
            {e.text}
          </Text>
        )}
      </Stack>
    )
  }
  return (
    <>
      <AktiveFilter spalten={spalten} tabelle={t} />
      <Table mt="xs" verticalSpacing="xs" data-grammatik-tabelle>
        <Table.Thead>
          <Table.Tr>
            {spalten.map((sp) => (
              <SortKopf key={sp.id} spalte={sp} tabelle={t} />
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {t.sichtbar.map((l) => (
            <Table.Tr key={l.id} data-grammatik-profil={anzeige(l)}>
              <Table.Td>{anzeige(l)}</Table.Td>
              <Table.Td>
                <Group gap="xs">
                  <Button size="compact-sm" variant="default" onClick={() => details(l)} data-grammatik-details={l.name}>
                    Details
                  </Button>
                  <ExtraPlaketten l={l} />
                </Group>
              </Table.Td>
              <Table.Td>{knopf(l, 'foerder')}</Table.Td>
              <Table.Td>{knopf(l, 'forder')}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  )
}

/**
 * Je Lernende/r (08.10.2026, Wunsch der Lehrkraft): auf- und zuklappbar, Namen ausblendbar (etwa am Beamer),
 * sortier- und filterbar; statt der Übungstage die in 7 Tagen neu gelernten und wiederholten Vokabeln. Reiter
 * „Vokabeln" (bis 08.10.2026 „Lernende"); „Grammatik" mit Details je Person und Fördern/Fordern (abgestimmt 08.10.2026).
 * Die frühere „Übersicht" (Lernende × Regeln) ist in den Details aufgegangen (08.10.2026, Wunsch der Lehrkraft).
 */
export function LernendeTabelle({
  lernende,
  gastZeigen,
  entfernen,
  kurs,
  nurAnsicht,
  immerOffen = false
}: {
  lernende: Lernende[]
  gastZeigen: (l: Lernende) => void
  entfernen: (l: Lernende) => void
  /** Nur eine Ansicht ohne Umschalter (eingebettet in „Meine Klassen": Vokabeln bzw. Grammatik) */
  nurAnsicht?: 'liste' | 'grammatik'
  /** Im Reiter „Lernende" der Kursseite: kein Auf- und Zuklappen */
  immerOffen?: boolean
  kurs: {
    id: string
    fach: string
    sprache: string
    lerngruppe: string
    woerter: { term: string; translation: string }[]
    quelle?: { lehrwerk?: string; unit?: string } | null
    lerngruppeId?: string
  }
}): React.JSX.Element {
  /*
   * Förder-/Forderaufgaben (08.10.2026, abgestimmt): für das eine Kind; wer dieselbe Schwäche bzw. Stärke hat, wird im
   * Prüf-Fenster angeboten. Bekannte Grammatik = die Grammatik dieses Kurses und die Regeln aus den Profilen. Mit `regel`
   * nur diese eine Regel (aus den Details).
   */
  const extra = async (l: Lernende, art: 'foerder' | 'forder', regel?: string): Promise<void> => {
    const einzeln = regel ? regelVon(l, regel) : undefined
    const punkte = regel ? (einzeln ? [einzeln] : []) : ((art === 'foerder' ? l.grammatik?.schwaechen : l.grammatik?.staerken) ?? [])
    if (!punkte.length) return
    const titel = new Set(punkte.map((p) => p.titel))
    const passt = (x: Lernende): boolean => {
      if (regel) {
        const s = stufeVon(regelVon(x, regel))
        return art === 'foerder' ? s === 'rot' || s === 'gelb' : s === 'gruen'
      }
      return ((art === 'foerder' ? x.grammatik?.schwaechen : x.grammatik?.staerken) ?? []).some((p) => titel.has(p.titel))
    }
    const gleiche = lernende.filter((x) => x.id !== l.id && passt(x)).map((x) => ({ id: x.id, name: x.name }))
    const kursGrammatik = await holen<{ zuweisungen: { vokId?: string; thema: string; art?: string; status?: string }[] }>('/server/grammatik')
      .then((r) => r.zuweisungen.filter((g) => g.vokId === kurs.id && !g.art && g.status !== 'entfernt').map((g) => g.thema))
      .catch(() => [] as string[])
    const bekannt = [...new Set([...kursGrammatik, ...lernende.flatMap((x) => regelnVon(x).map((p) => p.titel))])]
    extraStarten({
      art,
      vokId: kurs.id,
      fach: kurs.fach,
      sprache: kurs.sprache,
      jahrgang: Number(/\d{1,2}/.exec(kurs.lerngruppe)?.[0] ?? 6) || 6,
      fuer: { id: l.id, name: l.name },
      punkte,
      gleiche,
      bekannt,
      woerter: kurs.woerter.map((w) => `${w.term} – ${w.translation}`)
    })
  }
  const [offenGemerkt, setOffen] = useGemerkt('vok-lernende-offen', true)
  const offen = immerOffen || offenGemerkt
  const experte = useExperte()
  const [ohneNamen, setOhneNamen] = useGemerkt('vok-lernende-ohne-namen', false)
  const [ansichtGemerkt, setAnsicht] = useGemerktText('vok-lernende-ansicht', 'liste')
  const ansicht = nurAnsicht ?? ansichtGemerkt
  const [detailsFuer, setDetailsFuer] = useState<string | null>(null)
  // Band des Kurses für die Units-Ansicht: aus der Vokabelquelle, sonst der Lehrwerk-Stand der Lerngruppe („Meine Klassen")
  const bandQuelle = kurs.quelle?.lehrwerk ? bandVon(kurs.quelle.lehrwerk, LEHRWERK_GRAMMATIK) : undefined
  const [bandStand, setBandStand] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (bandQuelle || !kurs.lerngruppeId || detailsFuer === null) return
    let aus = false
    void holen<{ stand: { buch: string } | null; automatisch: { buch: string } | null }>(
      `/server/grammatik/lehrwerkstand?gruppe=${encodeURIComponent(kurs.lerngruppeId)}`
    )
      .then((r) => !aus && setBandStand(r.stand?.buch ?? r.automatisch?.buch))
      .catch(() => undefined)
    return () => {
      aus = true
    }
  }, [bandQuelle, kurs.lerngruppeId, detailsFuer])
  // Ersatzname je Person bleibt beim Sortieren gleich (Reihenfolge nach Namen)
  const nummer = new Map([...lernende].sort((a, b) => a.name.localeCompare(b.name, 'de')).map((l, i) => [l.id, i + 1]))
  const anzeige = (l: Lernende): string => (ohneNamen ? `Lernende/r ${nummer.get(l.id)}` : l.name)
  const spalten: Spalte<Lernende>[] = [
    { id: 'name', label: 'Name', wert: (l) => anzeige(l).toLowerCase(), filterWert: anzeige, filter: 'text', namen: true },
    {
      id: 'kasten',
      label: 'Karteikasten',
      wert: (l) => (l.uebersicht.gesamt ? (l.uebersicht.gesamt - l.uebersicht.neu) / l.uebersicht.gesamt : 0),
      absteigend: true,
      breite: '32%'
    },
    { id: 'sicher', label: 'sicher', wert: (l) => l.uebersicht.sicher, absteigend: true },
    // „fällig" ist eine Feinheit des Karteikastens – nur im Expertenmodus (09.10.2026)
    ...(experte ? [{ id: 'faellig', label: 'fällig', wert: (l: Lernende) => l.uebersicht.faellig, absteigend: true } as Spalte<Lernende>] : []),
    {
      id: 'woche',
      label: 'geübt (7 Tage)',
      wert: (l) => (l.neu7 ?? 0) + (l.wiederholt7 ?? 0),
      filter: 'auswahl',
      filterWert: (l) => ((l.neu7 ?? 0) + (l.wiederholt7 ?? 0) > 0 ? 'hat geübt' : 'noch nicht geübt'),
      absteigend: true
    }
  ]
  const t = useSortierTabelle(lernende, spalten, { spalte: 'name', ab: false })
  const halt = (e: React.MouseEvent): void => e.stopPropagation()
  const detailsPerson = lernende.find((l) => l.id === detailsFuer)
  return (
    <Card withBorder data-lernende-kasten>
      {immerOffen ? (
        <Group justify="space-between" gap="xs">
          {nurAnsicht ? (
            <Text fw={700}>{nurAnsicht === 'grammatik' ? 'Grammatik je Lernende/r' : 'Karteikasten je Lernende/r'}</Text>
          ) : (
            <SegmentedControl
              size="xs"
              value={ansicht === 'grammatik' ? ansicht : 'liste'}
              onChange={setAnsicht}
              data={[
                { value: 'liste', label: 'Vokabeln' },
                { value: 'grammatik', label: 'Grammatik' }
              ]}
              data-lernende-ansicht
            />
          )}
          <Switch size="xs" label="Namen ausblenden" checked={ohneNamen} onChange={(e) => setOhneNamen(e.currentTarget.checked)} data-namen-ausblenden />
        </Group>
      ) : (
        <KastenKopf
          titel={`Je Lernende/r (${lernende.length})`}
          offen={offen}
          umschalten={() => setOffen(!offen)}
          data-lernende-kopf
          rechts={
            offen && (
              <Switch size="xs" label="Namen ausblenden" checked={ohneNamen} onChange={(e) => setOhneNamen(e.currentTarget.checked)} data-namen-ausblenden />
            )
          }
        />
      )}
      {offen && (
        <>
          {!immerOffen && !nurAnsicht && (
            <SegmentedControl
              mt="xs"
              size="xs"
              value={ansicht === 'grammatik' ? ansicht : 'liste'}
              onChange={setAnsicht}
              data={[
                { value: 'liste', label: 'Vokabeln' },
                { value: 'grammatik', label: 'Grammatik' }
              ]}
              data-lernende-ansicht
            />
          )}
          {ansicht === 'grammatik' ? (
            <GrammatikTabelle lernende={lernende} anzeige={anzeige} extra={(l, art) => void extra(l, art)} details={(l) => setDetailsFuer(l.id)} />
          ) : (
            <>
              <AktiveFilter spalten={spalten} tabelle={t} />
              <Table data-karten mt="xs" data-lernende-tabelle>
                <Table.Thead>
                  <Table.Tr>
                    {spalten.map((sp) => (
                      <SortKopf key={sp.id} spalte={sp} tabelle={t} />
                    ))}
                    <Table.Th style={{ width: 40 }} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {t.sichtbar.map((l) => (
                    <Table.Tr key={l.id} data-lernende-zeile={l.name}>
                      <Table.Td data-lernende-name>
                        {l.gast && !ohneNamen ? (
                          <Text
                            component="button"
                            type="button"
                            size="sm"
                            td="underline"
                            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }}
                            onClick={(e: React.MouseEvent) => (halt(e), gastZeigen(l))}
                            data-gast-name={l.name}
                          >
                            {l.name}
                          </Text>
                        ) : (
                          anzeige(l)
                        )}
                        {l.gast && (
                          <Tooltip label="Gast (per Code oder QR-Code)">
                            <IconUser size={12} style={{ marginLeft: 4, verticalAlign: 'middle', opacity: 0.6 }} />
                          </Tooltip>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Faecherbalken u={l.uebersicht} />
                      </Table.Td>
                      <Table.Td>
                        {l.uebersicht.sicher}/{l.uebersicht.gesamt}
                      </Table.Td>
                      {experte && <Table.Td>{l.uebersicht.faellig}</Table.Td>}
                      <Table.Td data-woche={`${l.neu7 ?? 0}/${l.wiederholt7 ?? 0}`}>
                        {(l.neu7 ?? 0) + (l.wiederholt7 ?? 0) ? (
                          <Text size="sm">
                            <b>{l.neu7 ?? 0}</b> neu · <b>{l.wiederholt7 ?? 0}</b> wiederholt
                          </Text>
                        ) : (
                          <Text size="sm" c="dimmed">
                            noch nicht
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {l.perCode && (
                          <Tooltip label="Aus dieser Freigabe entfernen">
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() => entfernen(l)}
                              aria-label={`${anzeige(l)} entfernen`}
                              data-gast-entfernen={l.name}
                            >
                              <IconUserMinus size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </>
          )}
          <Text size="xs" c="dimmed" mt="xs" display={experte ? undefined : 'none'}>
            {ansicht === 'grammatik'
              ? 'Empfohlen ist Fördern, sobald es eine Schwäche gibt (unter 60 % richtig ab 5 Versuchen), sonst Fordern bei Stärken (ab 85 % richtig und gefestigt). „Details" zeigt das Kompetenzprofil (eine Kachel je Form, mit Kursschnitt), was Aufmerksamkeit braucht, und alle Formen – mit Fördern/Fordern je Form.'
              : 'Stufen: Neu (grau) → Angefangen → Wiedererkannt → Geübt → Gefestigt → Gekonnt → Im Langzeitgedächtnis (türkis). „Sicher“ = zweimal frei richtig geschrieben im Abstand von mindestens einer Woche. „geübt (7 Tage)“: Vokabeln, die in den letzten 7 Tagen zum ersten Mal geübt bzw. wiederholt wurden.'}
          </Text>
        </>
      )}
      <Modal
        opened={Boolean(detailsPerson)}
        onClose={() => setDetailsFuer(null)}
        title={detailsPerson ? `Grammatik – ${anzeige(detailsPerson)}` : ''}
        size="80rem"
        fullScreen={typeof window !== 'undefined' && window.innerWidth < 700}
      >
        {detailsPerson && (
          <GrammatikDetails
            l={detailsPerson}
            name={anzeige(detailsPerson)}
            band={bandQuelle ?? bandStand}
            alle={lernende}
            starten={(art, regel) => void extra(detailsPerson, art, regel)}
            schliessen={() => setDetailsFuer(null)}
          />
        )}
      </Modal>
    </Card>
  )
}
