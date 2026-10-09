import { Badge, Button, Card, Container, Group, Menu, ScrollArea, SegmentedControl, SimpleGrid, Stack, Text, Title, Tooltip, UnstyledButton } from '@mantine/core'
import {
  IconCalendarEvent,
  IconChevronDown,
  IconChevronRight,
  IconFilePlus,
  IconFolderOpen,
  IconLayoutGrid,
  IconList,
  IconMail,
  IconTag,
  IconTemplate
} from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useOffenGemerkt } from '../../../shared/sitzung'
import type { SavedDokumentMeta } from '@shared/apiShape'
import { BibliothekKopf, BibliothekLeer, EintragMenue, EintragRueckfragen, Oeffnen, useBibliothek, type Bibliothek } from '../../../shared/components/Bibliothek'
import { useAppSettings } from '../../../shared/settingsStore'
import type { BibliotheksSeiteProps } from '../../../shared/testmodul/ZweiSchrittModul'
import { notifyError, notifySuccess } from '../../../shared/util'
import { briefHtml, type Briefkopf } from '../ausgabe'
import {
  alsVorlage,
  ANLASS_ARTEN,
  ANLASS_FARBE,
  briefInfo,
  FRIST_FARBE,
  fristStufe,
  gespeicherteInfo,
  ordneBriefe,
  tagKurz,
  zuletztBearbeitet,
  type AnlassArt,
  type BriefInfo,
  type Eintrag
} from '../bibliothekInfo'
import { DIN5008 } from '../din5008'
import type { Elternbrief } from '../model'
import { bibliothek, briefStats, useElternbrief } from '../store'

/**
 * Bibliothek der Elternbriefe (09.10.2026, Entscheidung der Lehrkraft): Schuljahr → Klasse → Briefe nach Datum,
 * das laufende Schuljahr offen, ältere zugeklappt (mit Zahl). Je Brief Anlass, Termin, Rückmeldefrist mit Ampel und
 * die Sprachen der Übersetzungen; oben die Suche und „Zuletzt bearbeitet"; Karten mit kleiner Vorschau der ersten
 * Seite oder Liste (je Gerät gemerkt). Die Rechnung steht in bibliothekInfo.ts.
 */

type Ansicht = 'karten' | 'liste'
const ANSICHT_SCHLUESSEL = 'schulapps-elternbrief-ansicht'

function gemerkteAnsicht(): Ansicht {
  try {
    return localStorage.getItem(ANSICHT_SCHLUESSEL) === 'liste' ? 'liste' : 'karten'
  } catch {
    return 'karten'
  }
}

// ---------- Gespeicherte Briefe holen (für alte Einträge ohne Kurzinfo und für die Vorschau) ----------

const zwischenspeicher = new Map<string, { stand: string; dok: Promise<Elternbrief | null> }>()

function holeBrief(id: string, stand: string): Promise<Elternbrief | null> {
  const da = zwischenspeicher.get(id)
  if (da && da.stand === stand) return da.dok
  const dok = window.api.elternbriefe
    .get(id)
    .then((s) => s.payload as Elternbrief)
    .catch(() => null)
  zwischenspeicher.set(id, { stand, dok })
  return dok
}

/** Kurzinfo je Eintrag: gespeichert – oder (Briefe von vor dieser Bibliothek) aus dem Brief selbst berechnet */
function useInfos(eintraege: SavedDokumentMeta[] | null): Map<string, BriefInfo> {
  const [nachgeholt, setNachgeholt] = useState<Map<string, BriefInfo>>(new Map())
  useEffect(() => {
    let aus = false
    const fehlt = (eintraege ?? []).filter((m) => !gespeicherteInfo(m) && !nachgeholt.has(`${m.id}@${m.updatedAt}`))
    if (!fehlt.length) return
    void Promise.all(fehlt.map(async (m) => [m, await holeBrief(m.id, m.updatedAt)] as const)).then((liste) => {
      if (aus) return
      setNachgeholt((alt) => {
        const neu = new Map(alt)
        for (const [m, dok] of liste) {
          // Unvollständige Briefe (z. B. aus einem Paket ohne Angaben) behalten die Rückfall-Info
          try {
            if (dok?.meta) neu.set(`${m.id}@${m.updatedAt}`, briefInfo(dok))
          } catch {
            /* Rückfall unten */
          }
        }
        return neu
      })
    })
    return () => {
      aus = true
    }
  }, [eintraege])
  return useMemo(() => {
    const out = new Map<string, BriefInfo>()
    for (const m of eintraege ?? []) {
      const info = gespeicherteInfo(m) ?? nachgeholt.get(`${m.id}@${m.updatedAt}`)
      out.set(
        m.id,
        info ?? { v: 1, betreff: '', anlassArt: 'Sonstiges', termin: '', frist: '', sprachen: [], klassen: [], datum: (m.createdAt ?? m.updatedAt).slice(0, 10) }
      )
    }
    return out
  }, [eintraege, nachgeholt])
}

// ---------- Vorschau der ersten Seite ----------

/** A4 bei 96 dpi */
const A4_BREITE = 794
const A4_HOEHE = 1123

function useKopf(): Briefkopf {
  const settings = useAppSettings((s) => s.settings)
  const logo = useAppSettings((s) => s.logoDataUrl)
  const bk = settings.briefkopf ?? {}
  const schule = settings.showSchool !== false
  return {
    schule: schule ? settings.schoolName : '',
    logo: schule ? logo : null,
    lehrkraft: bk.lehrkraft,
    funktion: bk.funktion,
    strasse: schule ? bk.strasse : '',
    plz: schule ? bk.plz : '',
    ort: bk.ort,
    telefon: schule ? bk.telefon : '',
    email: schule ? bk.email : ''
  }
}

/** Erst zeichnen, wenn die Karte ins Bild kommt – viele Briefe sollen die Bibliothek nicht bremsen */
function useImBild(ref: React.RefObject<HTMLElement | null>): boolean {
  const [da, setDa] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || da) return
    if (typeof IntersectionObserver === 'undefined') return setDa(true)
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setDa(true), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, da])
  return da
}

function Vorschau({ eintrag }: { eintrag: SavedDokumentMeta }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const imBild = useImBild(ref)
  const kopf = useKopf()
  const [dok, setDok] = useState<Elternbrief | null>(null)
  useEffect(() => {
    if (!imBild) return
    let aus = false
    void holeBrief(eintrag.id, eintrag.updatedAt).then((d) => !aus && setDok(d))
    return () => {
      aus = true
    }
  }, [imBild, eintrag.id, eintrag.updatedAt])
  const html = useMemo(() => {
    if (!dok?.text || !dok.meta) return ''
    const r = DIN5008.rand
    // Bildschirm statt Druck: die Seitenränder als Innenabstand, nur die erste Seite (deutsche Fassung)
    return briefHtml(dok, kopf, ['de']).replace(
      '</style>',
      `html,body{overflow:hidden;background:#fff}body{padding:${r.obenMm}mm ${r.rechtsMm}mm 0 ${r.linksMm}mm}</style>`
    )
  }, [dok, kopf])
  const [breite, setBreite] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setBreite(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="eb-vorschau" aria-hidden data-eb-vorschau={html ? 'bild' : 'symbol'}>
      {html && breite > 0 ? (
        <iframe
          title=""
          tabIndex={-1}
          sandbox=""
          srcDoc={html}
          style={{ width: A4_BREITE, height: A4_HOEHE, transform: `scale(${breite / A4_BREITE})` }}
        />
      ) : (
        <IconMail size={36} stroke={1.2} />
      )}
    </div>
  )
}

// ---------- Marken eines Briefes ----------

function Marken({ info, heute }: { info: BriefInfo; heute: Date }): React.JSX.Element {
  const stufe = info.frist ? fristStufe(info.frist, heute) : null
  return (
    <Group gap={6} wrap="wrap" data-eb-marken>
      <Badge size="sm" variant="light" color={ANLASS_FARBE[info.anlassArt]} data-eb-anlass={info.anlassArt}>
        {info.anlassArt}
      </Badge>
      {info.termin && (
        <Tooltip label="Termin aus dem Brief">
          <Group gap={3} wrap="nowrap" data-eb-termin-marke>
            <IconCalendarEvent size={14} />
            <Text size="xs" fw={600}>
              {tagKurz(info.termin)}
            </Text>
          </Group>
        </Tooltip>
      )}
      {info.frist && stufe && (
        <Badge size="sm" variant={stufe === 'vorbei' ? 'outline' : 'light'} color={FRIST_FARBE[stufe]} data-eb-frist-marke={stufe}>
          Rückmeldung bis {tagKurz(info.frist)}
        </Badge>
      )}
      {info.sprachen.map((c) => (
        <Badge key={c} size="xs" variant="default" data-eb-sprache={c}>
          {c.toUpperCase()}
        </Badge>
      ))}
    </Group>
  )
}

// ---------- Ein Brief ----------

interface Aktionen {
  bib: Bibliothek<SavedDokumentMeta>
  oeffnen: (m: SavedDokumentMeta) => void
  vorlage: (m: SavedDokumentMeta) => void
  setzeAnlass: (m: SavedDokumentMeta, art: AnlassArt) => void
  offen: (m: SavedDokumentMeta) => boolean
  heute: Date
}

function Menue({ a, m, info }: { a: Aktionen; m: SavedDokumentMeta; info: BriefInfo }): React.JSX.Element {
  return (
    <EintragMenue
      bib={a.bib}
      eintrag={m}
      vorne={
        <>
          <Menu.Item leftSection={<IconTemplate size={14} />} onClick={() => a.vorlage(m)} data-eb-als-vorlage>
            Als Vorlage für neuen Brief
          </Menu.Item>
          <Menu.Label>
            <Group gap={4}>
              <IconTag size={12} /> Anlass
            </Group>
          </Menu.Label>
          {ANLASS_ARTEN.map((art) => (
            <Menu.Item
              key={art}
              onClick={() => a.setzeAnlass(m, art)}
              data-eb-anlass-wahl={art}
              rightSection={art === info.anlassArt ? '✓' : null}
              fw={art === info.anlassArt ? 600 : undefined}
            >
              {art}
            </Menu.Item>
          ))}
          <Menu.Divider />
        </>
      }
    />
  )
}

function Zeile({ a, m, info }: { a: Aktionen; m: SavedDokumentMeta; info: BriefInfo }): React.JSX.Element {
  const neu = a.bib.neuId === m.id
  return (
    <Card withBorder padding="sm" data-bibliothek-eintrag={m.name} style={neu ? { borderColor: 'var(--mantine-color-teal-5)' } : undefined}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Oeffnen name={m.name} onOeffnen={() => a.oeffnen(m)}>
          <Group gap="xs" wrap="nowrap">
            <Text fw={600} truncate>
              {m.name}
            </Text>
            {a.offen(m) && (
              <Badge size="sm" variant="filled" color="gray">
                geöffnet
              </Badge>
            )}
          </Group>
          <Marken info={info} heute={a.heute} />
        </Oeffnen>
        <Group gap={4} wrap="nowrap">
          <Button size="xs" onClick={() => a.oeffnen(m)} visibleFrom="xs">
            Öffnen
          </Button>
          <Menue a={a} m={m} info={info} />
        </Group>
      </Group>
      <EintragRueckfragen bib={a.bib} eintrag={m} />
    </Card>
  )
}

function Karte({ a, m, info }: { a: Aktionen; m: SavedDokumentMeta; info: BriefInfo }): React.JSX.Element {
  const neu = a.bib.neuId === m.id
  return (
    <Card withBorder padding="xs" data-bibliothek-eintrag={m.name} className="eb-karte" style={neu ? { borderColor: 'var(--mantine-color-teal-5)' } : undefined}>
      <Oeffnen name={m.name} onOeffnen={() => a.oeffnen(m)}>
        <Vorschau eintrag={m} />
      </Oeffnen>
      <Group justify="space-between" wrap="nowrap" align="flex-start" mt={6} gap={4}>
        <Oeffnen name={m.name} onOeffnen={() => a.oeffnen(m)}>
          <Text fw={600} size="sm" lineClamp={2}>
            {m.name}
          </Text>
          {a.offen(m) && (
            <Badge size="xs" variant="filled" color="gray">
              geöffnet
            </Badge>
          )}
        </Oeffnen>
        <Menue a={a} m={m} info={info} />
      </Group>
      <Stack gap={4} mt={4}>
        <Marken info={info} heute={a.heute} />
      </Stack>
      <EintragRueckfragen bib={a.bib} eintrag={m} />
    </Card>
  )
}

function Briefe({ a, ansicht, liste }: { a: Aktionen; ansicht: Ansicht; liste: Eintrag<SavedDokumentMeta>[] }): React.JSX.Element {
  if (ansicht === 'liste')
    return (
      <Stack gap="xs">
        {liste.map((e) => (
          <Zeile key={e.meta.id} a={a} m={e.meta} info={e.info} />
        ))}
      </Stack>
    )
  return (
    <SimpleGrid cols={{ base: 2, xs: 3, sm: 4, lg: 5 }} spacing="sm">
      {liste.map((e) => (
        <Karte key={e.meta.id} a={a} m={e.meta} info={e.info} />
      ))}
    </SimpleGrid>
  )
}

// ---------- Seite ----------

export default function ElternbriefBibliothek({ props }: { props: BibliotheksSeiteProps }): React.JSX.Element {
  const api = window.api.elternbriefe
  const bib = useBibliothek<SavedDokumentMeta>(api, {
    offeneId: () => useElternbrief.getState().docId,
    umbenannt: (m) => useElternbrief.getState().markSaved(m.id, m.updatedAt, m.name),
    geloescht: () => useElternbrief.getState().forgetSaved(),
    moduleId: 'elternbrief'
  })
  const infos = useInfos(bib.eintraege)
  const heute = useMemo(() => new Date(), [])
  const [ansicht, setAnsicht] = useState<Ansicht>(gemerkteAnsicht)
  // Auf- und zugeklappte Schuljahre – bleiben in der Sitzung, auch wenn ein Brief offen war (shared/sitzung.ts, 09.10.2026)
  const [aufgeklappt, setAufgeklappt] = useOffenGemerkt<Record<number, boolean>>('schulapps-elternbrief-schuljahre', {})
  const alle = bib.eintraege ?? []
  const info = (m: SavedDokumentMeta): BriefInfo => infos.get(m.id)!
  const treffer = bib.treffer((m) => {
    const i = infos.get(m.id)
    return [m.thema, m.subjectLabel, i?.betreff, i?.anlassArt, i?.klassen.join(' '), i?.sprachen.join(' ').toUpperCase()]
  })
  const suche = bib.suche.trim() !== ''
  const gruppen = useMemo(() => ordneBriefe(alle.map((m) => ({ meta: m, info: infos.get(m.id)! })), heute), [alle, infos, heute])
  // Offen: das laufende Schuljahr – gibt es dort keinen Brief, das neueste
  const standardOffen = gruppen.find((g) => g.aktuell)?.jahr ?? gruppen[0]?.jahr

  const waehleAnsicht = (v: string): void => {
    const x: Ansicht = v === 'liste' ? 'liste' : 'karten'
    setAnsicht(x)
    try {
      localStorage.setItem(ANSICHT_SCHLUESSEL, x)
    } catch {
      /* ohne Speicher gilt die Wahl bis zum Schließen */
    }
  }

  const a: Aktionen = {
    bib,
    heute,
    offen: (m) => m.id === useElternbrief.getState().docId && props.zurueck !== null,
    oeffnen: (m) =>
      m.id === useElternbrief.getState().docId && props.zurueck !== null
        ? props.onZurueck()
        : void bibliothek.oeffnen(m.id).then(props.onOpened).catch(notifyError),
    vorlage: (m) =>
      void (async () => {
        const s = await api.get(m.id)
        const neu = alsVorlage(s.payload as Elternbrief)
        // Das bisherige Dokument sichern, dann die Vorlage als neuen (noch ungespeicherten) Brief öffnen
        await bibliothek.neuSicher()
        useElternbrief.getState().loadFromFile(neu)
        props.onOpened()
        notifySuccess('Neuer Brief aus der Vorlage – Datum, Frist und Klasse sind frei.')
      })().catch(notifyError),
    setzeAnlass: (m, art) =>
      void (async () => {
        if (bibliothek.istOffen(m.id)) {
          useElternbrief.getState().update((d) => (d.meta.anlassArt = art))
          await bibliothek.speichern()
        } else {
          const s = await api.get(m.id)
          const dok = s.payload as Elternbrief
          dok.meta.anlassArt = art
          await api.save({ id: m.id, name: s.name, stats: briefStats(dok), payload: dok })
        }
        bib.neuLaden()
      })().catch(notifyError)
  }

  const zuletzt = zuletztBearbeitet(alle, 4)

  return (
    <ScrollArea h="100%">
      <Container size="lg" py="lg" px={{ base: 'md', sm: 'lg' }}>
        <BibliothekKopf
          titel="Meine Elternbriefe"
          untertitel={alle.length === 1 ? 'Ein Elternbrief gespeichert' : `${alle.length} Elternbriefe gespeichert`}
          zurueck={props.zurueck}
          onZurueck={props.onZurueck}
          suche={bib.suche}
          onSuche={bib.setSuche}
          suchHinweis="Betreff, Klasse, Anlass, Sprache"
          reihe={bib.reihe}
        >
          <Button variant="default" leftSection={<IconFolderOpen size={16} />} onClick={props.onOpenFile}>
            Datei öffnen …
          </Button>
          <Button leftSection={<IconFilePlus size={16} />} onClick={props.onNew}>
            Neuer Elternbrief
          </Button>
        </BibliothekKopf>

        {alle.length > 0 && (
          <Group justify="space-between" align="flex-end" mb="sm" gap="sm">
            <div style={{ minWidth: 0, flex: 1 }}>
              {!suche && zuletzt.length > 0 && (
                <>
                  <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={4}>
                    Zuletzt bearbeitet
                  </Text>
                  <Group gap={6} data-eb-zuletzt>
                    {zuletzt.map((m) => (
                      <Button
                        key={m.id}
                        size="compact-sm"
                        variant="light"
                        color="gray"
                        leftSection={<IconMail size={14} />}
                        onClick={() => a.oeffnen(m)}
                        maw="100%"
                        styles={{ label: { overflow: 'hidden', textOverflow: 'ellipsis' } }}
                        data-eb-zuletzt-eintrag={m.name}
                      >
                        {m.name}
                      </Button>
                    ))}
                  </Group>
                </>
              )}
            </div>
            <SegmentedControl
              size="xs"
              value={ansicht}
              onChange={waehleAnsicht}
              aria-label="Ansicht"
              data-eb-ansicht
              data={[
                {
                  value: 'karten',
                  label: (
                    <Group gap={4} wrap="nowrap">
                      <IconLayoutGrid size={14} /> Karten
                    </Group>
                  )
                },
                {
                  value: 'liste',
                  label: (
                    <Group gap={4} wrap="nowrap">
                      <IconList size={14} /> Liste
                    </Group>
                  )
                }
              ]}
            />
          </Group>
        )}

        {bib.eintraege && treffer.length === 0 && (
          <BibliothekLeer leer={alle.length === 0} text="Noch nichts gespeichert – es wird automatisch gesichert, sobald etwas eingetragen ist." />
        )}

        {suche ? (
          <Briefe a={a} ansicht={ansicht} liste={treffer.map((m) => ({ meta: m, info: info(m) }))} />
        ) : (
          gruppen.map((g) => {
            const auf = aufgeklappt[g.jahr] ?? g.jahr === standardOffen
            return (
              <section key={g.jahr} data-eb-schuljahr={g.name} data-offen={auf ? 'ja' : 'nein'}>
                <UnstyledButton
                  onClick={() => setAufgeklappt((x) => ({ ...x, [g.jahr]: !auf }))}
                  aria-expanded={auf}
                  className="eb-schuljahr-kopf"
                  mt="md"
                  mb="xs"
                >
                  <Group gap="xs" wrap="nowrap">
                    {auf ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
                    <Title order={3}>Schuljahr {g.name}</Title>
                    {g.aktuell && (
                      <Badge size="sm" variant="light" color="teal">
                        laufend
                      </Badge>
                    )}
                    <Badge size="sm" variant="default">
                      {g.anzahl}
                    </Badge>
                  </Group>
                </UnstyledButton>
                {auf &&
                  g.klassen.map((k) => (
                    <div key={k.klasse} data-eb-klasse={k.klasse} style={{ marginBottom: 'var(--mantine-spacing-md)' }}>
                      <Title order={5} c="dimmed" mb={6}>
                        {k.klasse === 'Ohne Klasse' ? k.klasse : `Klasse ${k.klasse}`}
                      </Title>
                      <Briefe a={a} ansicht={ansicht} liste={k.briefe} />
                    </div>
                  ))}
              </section>
            )
          })
        )}
      </Container>
    </ScrollArea>
  )
}
