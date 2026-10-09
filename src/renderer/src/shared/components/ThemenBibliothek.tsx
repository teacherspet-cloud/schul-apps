/**
 * Themen-Bibliothek (09.10.2026, Entscheidungen der Lehrkraft für Tafelbilder, Rückmeldungen und
 * freigegebene Blätter – gebaut für alle Bibliotheken, die später dazukommen):
 *  - Ordnung Fach → Themenbereich → Einträge (Klasse, dann Titel); Anzahl und Klassenspanne
 *    („Kl. 9–10") in jeder Überschrift; Gruppen klappen auf und zu – gemerkt je Sitzung (shared/sitzung.ts).
 *  - Themenbereich ohne KI aus dem Lehrplankatalog (shared/themenBibliothek.ts), von Hand
 *    änderbar: ⋯ › „Themenbereich ändern …" oder Ziehen auf einen Bereich (am PC).
 *  - Karten mit kleiner Vorschau (lädt erst, wenn die Karte sichtbar wird) oder kompakte Liste –
 *    gemerkt je Gerät. Oben „Zuletzt bearbeitet" mit den letzten vier.
 * Was ein Eintrag ist, wie er geöffnet, umbenannt oder gespeichert wird, bestimmt das Programm.
 */
import { ActionIcon, Badge, Button, Group, Menu, Modal, SegmentedControl, Stack, Text, TextInput, Title, Tooltip, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronRight, IconDots, IconFolder, IconFolderShare, IconLayoutGrid, IconList, IconPlus, IconSearch, IconSparkles } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAppSettings } from '../settingsStore'
import { katalogFuer, ladeLehrplan } from '../themenKatalog'
import type { KatalogThema } from '../themenVorschlag'
import {
  gruppiereNachThema,
  OHNE_THEMENBEREICH,
  passtZuSuche,
  themenAuswahl,
  themenbereichFuer,
  zuletztBearbeitet,
  type ThemenEintrag,
  type Zuordnung
} from '../themenBibliothek'
import { notifyError } from '../util'
import { offenLesen, offenMerken } from '../sitzung'
import { FachPunkt } from './FachFarbe'
import './themenBibliothek.css'

// ---------- je Gerät merken (localStorage kann fehlen oder gesperrt sein)

const lies = <T,>(k: string, rueckfall: T): T => {
  try {
    const v = localStorage.getItem(k)
    return v === null ? rueckfall : (JSON.parse(v) as T)
  } catch {
    return rueckfall
  }
}
const schreib = (k: string, v: unknown): void => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    // ohne Speicher gilt die Wahl nur bis zum Neuladen
  }
}

export type Ansicht = 'karten' | 'liste'

// ---------- Lehrplankatalog je Fach, Land und Schulform

const kataloge = new Map<string, KatalogThema[]>()

/** Katalog für Einträge laden (Lehrplandateien der vorkommenden Länder); liefert eine Abfrage, die bei jedem neuen Stand neu entsteht */
export function useThemenKatalog(eintraege: ThemenEintrag[] | null): (e: Pick<ThemenEintrag, 'fachId' | 'land' | 'schulform'>) => KatalogThema[] {
  const { stateId, schoolTypeId } = useAppSettings((s) => s.settings.defaults)
  const laender = useMemo(() => [...new Set((eintraege ?? []).map((e) => e.land || stateId).filter(Boolean))].sort().join(','), [eintraege, stateId])
  const [stand, setStand] = useState(0)
  const lehrplaene = useRef(new Map<string, Awaited<ReturnType<typeof ladeLehrplan>>>())
  useEffect(() => {
    let weg = false
    const fehlt = laender.split(',').filter((l) => l && !lehrplaene.current.has(l))
    if (!fehlt.length) return
    void Promise.all(fehlt.map(async (l) => [l, await ladeLehrplan(l)] as const)).then((liste) => {
      if (weg) return
      for (const [l, p] of liste) lehrplaene.current.set(l, p)
      setStand((n) => n + 1)
    })
    return () => {
      weg = true
    }
  }, [laender])
  return useMemo(() => {
    const geladen = new Map(lehrplaene.current)
    return (e) => {
      if (!e.fachId || e.fachId === 'ohne-fach') return []
      const land = e.land || stateId
      const form = e.schulform || schoolTypeId
      const lp = geladen.get(land) ?? null
      const k = `${e.fachId}|${land}|${form}|${lp ? 'lp' : '-'}`
      let liste = kataloge.get(k)
      if (!liste) {
        liste = katalogFuer(e.fachId, lp, form, land)
        kataloge.set(k, liste)
      }
      return liste
    }
  }, [stand, stateId, schoolTypeId])
}

// ---------- Vorschaubild

/** Fertige Vorschaubilder der Sitzung: Schlüssel (Kennung + Stand) → Bild-URL bzw. Text; null = keins */
const bilder = new Map<string, { url?: string; text?: string } | null>()

export type VorschauInhalt = { svg: string } | { bild: string } | { text: string } | null

/**
 * Kleine Vorschau, die erst lädt, wenn sie ins Bild kommt (IntersectionObserver). `laden` liefert
 * SVG-Quelltext, eine Bildadresse oder einen kurzen Text; ohne Ergebnis bleibt das Programmsymbol.
 * Das SVG wird als Bild (<img>) gezeigt – Skripte darin laufen nicht, Kennungen stören die Seite nicht.
 */
export function VorschauBild({
  schluessel,
  laden,
  symbol,
  klein
}: {
  schluessel: string
  laden?: () => Promise<VorschauInhalt>
  symbol: ReactNode
  klein?: boolean
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [inhalt, setInhalt] = useState(() => bilder.get(schluessel))
  useEffect(() => {
    setInhalt(bilder.get(schluessel))
    if (!laden || bilder.has(schluessel) || !ref.current) return
    let weg = false
    const los = (): void => {
      laden()
        .then((v) => {
          const x = !v ? null : 'svg' in v ? { url: URL.createObjectURL(new Blob([v.svg], { type: 'image/svg+xml' })) } : 'bild' in v ? { url: v.bild } : { text: v.text }
          bilder.set(schluessel, x)
          if (!weg) setInhalt(x)
        })
        .catch(() => {
          bilder.set(schluessel, null)
          if (!weg) setInhalt(null)
        })
    }
    if (typeof IntersectionObserver === 'undefined') {
      los()
      return () => {
        weg = true
      }
    }
    const b = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          b.disconnect()
          los()
        }
      },
      { rootMargin: '200px' }
    )
    b.observe(ref.current)
    return () => {
      weg = true
      b.disconnect()
    }
  }, [schluessel, laden])
  return (
    <div ref={ref} className={klein ? 'tbib-bild tbib-zeile-bild' : 'tbib-bild'} data-vorschau={inhalt?.url ? 'bild' : inhalt?.text ? 'text' : 'symbol'}>
      {inhalt?.url ? <img src={inhalt.url} alt="" loading="lazy" draggable={false} /> : inhalt?.text && !klein ? <div className="tbib-bild-text">{inhalt.text}</div> : symbol}
    </div>
  )
}

// ---------- Themenbereich wählen

function ThemenWahl({
  eintrag,
  aktuell,
  automatisch,
  vorschlaege,
  schliessen,
  waehlen
}: {
  eintrag: ThemenEintrag
  aktuell: Zuordnung
  /** Was die Automatik ohne Handwahl nähme */
  automatisch: Zuordnung
  vorschlaege: string[]
  schliessen: () => void
  waehlen: (name: string | null) => void
}): React.JSX.Element {
  const [q, setQ] = useState('')
  const gefiltert = vorschlaege.filter((v) => !q.trim() || v.toLocaleLowerCase('de').includes(q.trim().toLocaleLowerCase('de')))
  const neu = q.trim() && !vorschlaege.some((v) => v.toLocaleLowerCase('de') === q.trim().toLocaleLowerCase('de')) ? q.trim() : ''
  return (
    <Modal opened onClose={schliessen} title={`Themenbereich für „${eintrag.titel}“`} size="lg" data-themen-wahl>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Jetzt: <b>{aktuell.name}</b>
          {aktuell.herkunft === 'hand' ? ' (von Hand gewählt)' : ' (automatisch)'}
          {eintrag.fach ? ` · ${eintrag.fach}` : ''}
        </Text>
        <TextInput
          leftSection={<IconSearch size={14} />}
          placeholder="Themenbereich suchen oder neu benennen …"
          aria-label="Themenbereich suchen"
          value={q}
          autoFocus
          onChange={(e) => setQ(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (neu || gefiltert[0])) waehlen(neu || gefiltert[0])
          }}
          data-themen-suche
        />
        <Stack gap={4} className="tbib-auswahl">
          {neu && (
            <Button variant="light" justify="flex-start" leftSection={<IconPlus size={14} />} onClick={() => waehlen(neu)} data-themen-neu>
              Neuer Themenbereich „{neu}“
            </Button>
          )}
          {gefiltert.map((v) => (
            <Button
              key={v}
              variant={v === aktuell.name ? 'filled' : 'default'}
              justify="flex-start"
              leftSection={<IconFolder size={14} />}
              onClick={() => waehlen(v)}
              data-themen-option={v}
              styles={{ label: { whiteSpace: 'normal', textAlign: 'left' } }}
            >
              {v}
            </Button>
          ))}
          {!gefiltert.length && !neu && (
            <Text size="sm" c="dimmed">
              Keine Themen im Katalog für dieses Fach – einen eigenen Namen eintippen.
            </Text>
          )}
        </Stack>
        <Group justify="space-between">
          <Group gap="xs">
            <Tooltip label={`Ohne Handwahl: „${automatisch.name}“`}>
              <Button variant="subtle" leftSection={<IconSparkles size={14} />} onClick={() => waehlen(null)} disabled={aktuell.herkunft !== 'hand'} data-themen-auto>
                Automatisch zuordnen
              </Button>
            </Tooltip>
            <Button variant="subtle" color="gray" onClick={() => waehlen(OHNE_THEMENBEREICH)} data-themen-ohne>
              Ohne Themenbereich
            </Button>
          </Group>
          <Button variant="default" onClick={schliessen}>
            Abbrechen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

// ---------- die Bibliothek

export interface ThemenBibliothekProps<E extends ThemenEintrag> {
  /** Schlüssel für die gemerkten Einstellungen je Gerät (z. B. „tafelbild") */
  speicherSchluessel: string
  /** null, solange die Liste lädt */
  eintraege: E[] | null
  suche: string
  oeffnen: (e: E) => void
  /** Themenbereich speichern: Name = von Hand gewählt, null = wieder automatisch */
  themenbereichSetzen: (e: E, name: string | null) => Promise<void>
  /** Programmsymbol, solange bzw. wenn es keine Vorschau gibt */
  symbol: ReactNode
  /** Vorschau laden (optional) – nur für sichtbare Karten aufgerufen */
  vorschau?: (e: E) => (() => Promise<VorschauInhalt>) | undefined
  /** Kennzeichen hinter dem Titel (Klasse steht schon da) */
  kennzeichen?: (e: E) => ReactNode
  /** Zusätzliche Angaben in der Infozeile (das Datum steht schon da) */
  info?: (e: E) => string[]
  /** Knöpfe rechts (Liste) bzw. unten (Karte); ohne: „Öffnen" */
  aktionen?: (e: E) => ReactNode
  /** Das ⋯-Menü; `themenPunkt` ist „Themenbereich ändern …" und gehört hinein. Ohne: nur dieser Punkt. */
  menue?: (e: E, themenPunkt: ReactNode) => ReactNode
  /** Unter dem Eintrag (Umbenennen-Feld, Löschen-Rückfrage) */
  unten?: (e: E) => ReactNode
  /** Hülle um jeden Eintrag (Wischen am Tablet) */
  huelle?: (e: E, inhalt: ReactNode) => ReactNode
  /** Datenattribute am Eintrag (für Wachen) */
  attribute?: (e: E) => Record<string, string | undefined>
  /** Hervorgehoben (eben angelegte Kopie) */
  neu?: (e: E) => boolean
  /** Ausblenden (z. B. Material aus Unterrichtsreihen); ausgeblendete zählen nirgends mit */
  filter?: (e: E) => boolean
  /** Über der Liste neben der Ansichtswahl (Filter, Schalter) */
  leiste?: ReactNode
  /** Text, wenn es gar nichts gibt */
  leerText: string
  /** Datum einer Karte – Standard: zuletzt geändert */
  datum?: (e: E) => string
}

const datumFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' })
const feinZeiger = (): boolean => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: fine)').matches)
const ZIEH_TYP = 'text/x-themen-eintrag'

export function ThemenBibliothek<E extends ThemenEintrag>(p: ThemenBibliothekProps<E>): React.JSX.Element {
  const zuKey = `themenBibliothek:${p.speicherSchluessel}:zu`
  const ansichtKey = `themenBibliothek:${p.speicherSchluessel}:ansicht`
  // Zugeklappte Gruppen gelten je Sitzung (09.10.2026): in einer neuen Sitzung wieder alle offen wie vorgegeben
  const [zu, setZu] = useState<string[]>(() => offenLesen<string[]>(zuKey) ?? [])
  const [ansicht, setAnsicht] = useState<Ansicht>(() => (lies<string>(ansichtKey, 'karten') === 'liste' ? 'liste' : 'karten'))
  const [wahl, setWahl] = useState<E | null>(null)
  const [ziel, setZiel] = useState<string | null>(null)
  const katalog = useThemenKatalog(p.eintraege)
  const ziehbar = useMemo(feinZeiger, [])

  const sichtbar = useMemo(() => (p.eintraege ?? []).filter((e) => !p.filter || p.filter(e)), [p.eintraege, p.filter])
  const zuordnung = useMemo(() => {
    const m = new Map<string, Zuordnung>()
    for (const e of sichtbar) m.set(e.id, themenbereichFuer(e, katalog(e)))
    return m
  }, [sichtbar, katalog])
  const bereichVon = (e: E): Zuordnung => zuordnung.get(e.id) ?? { name: OHNE_THEMENBEREICH, herkunft: 'ohne' }
  const suche = p.suche.trim()
  const treffer = useMemo(() => sichtbar.filter((e) => passtZuSuche(e, bereichVon(e).name, suche)), [sichtbar, suche, zuordnung])
  const gruppen = useMemo(() => gruppiereNachThema(treffer, bereichVon), [treffer, zuordnung])
  const zuletzt = useMemo(() => (suche || sichtbar.length <= 4 ? [] : zuletztBearbeitet(sichtbar, 4)), [sichtbar, suche])

  const istZu = (k: string): boolean => !suche && zu.includes(k)
  const umschalten = (k: string): void => {
    const neu = zu.includes(k) ? zu.filter((x) => x !== k) : [...zu, k]
    setZu(neu)
    offenMerken(zuKey, neu)
  }
  const ansichtSetzen = (a: Ansicht): void => {
    setAnsicht(a)
    schreib(ansichtKey, a)
  }
  const setzen = (e: E, name: string | null): void => {
    const jetzt = bereichVon(e)
    if (name !== null && jetzt.herkunft === 'hand' && jetzt.name === name) return
    p.themenbereichSetzen(e, name).catch((x: unknown) => notifyError(x, 'Der Themenbereich ließ sich nicht speichern'))
  }

  const themenPunkt = (e: E): ReactNode => (
    <Menu.Item leftSection={<IconFolderShare size={14} />} onClick={() => setWahl(e)} data-themen-aendern>
      Themenbereich ändern …
    </Menu.Item>
  )
  const menue = (e: E): ReactNode =>
    p.menue ? (
      p.menue(e, themenPunkt(e))
    ) : (
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon variant="subtle" aria-label={`Weitere Aktionen für „${e.titel}“`}>
            <IconDots size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>{themenPunkt(e)}</Menu.Dropdown>
      </Menu>
    )
  const infoZeile = (e: E): string => [...(p.info?.(e) ?? []), datumFormat.format(new Date(p.datum?.(e) ?? e.updatedAt))].filter(Boolean).join(' · ')
  const ziehen = (e: E) =>
    ziehbar
      ? {
          draggable: true,
          onDragStart: (ev: React.DragEvent) => {
            ev.dataTransfer.setData(ZIEH_TYP, e.id)
            ev.dataTransfer.effectAllowed = 'move'
          }
        }
      : {}

  const karte = (e: E, zuletztReihe = false): ReactNode => {
    const z = bereichVon(e)
    const attr = zuletztReihe ? { 'data-zuletzt-eintrag': e.titel } : (p.attribute?.(e) ?? {})
    const inhalt = (
      <div className="tbib-karte" data-neu={p.neu?.(e) ? 'ja' : undefined} data-themenbereich-von={z.name} {...attr} {...ziehen(e)}>
        <div onClick={() => p.oeffnen(e)} role="presentation">
          <VorschauBild schluessel={`${p.speicherSchluessel}:${e.id}:${e.updatedAt}`} laden={p.vorschau?.(e)} symbol={p.symbol} />
        </div>
        <Stack gap={4} p="xs" style={{ flex: 1 }}>
          <UnstyledButton onClick={() => p.oeffnen(e)} aria-label={`„${e.titel}“ öffnen`}>
            <Text fw={600} size="sm" className="tbib-titel">
              {e.titel}
            </Text>
          </UnstyledButton>
          <Group gap={4}>
            {e.grade ? (
              <Badge size="xs" variant="light">
                Kl. {e.grade}
              </Badge>
            ) : null}
            {zuletztReihe && e.fach ? (
              <Badge size="xs" variant="outline" color="gray">
                {e.fach}
              </Badge>
            ) : null}
            {p.kennzeichen?.(e)}
          </Group>
          <Text size="xs" c="dimmed" lineClamp={2}>
            {zuletztReihe && z.herkunft !== 'ohne' ? `${z.name} · ` : ''}
            {infoZeile(e)}
          </Text>
          {!zuletztReihe && (
            <Group gap={4} mt="auto" pt={4} wrap="wrap">
              {p.aktionen ? (
                p.aktionen(e)
              ) : (
                <Button size="xs" onClick={() => p.oeffnen(e)}>
                  Öffnen
                </Button>
              )}
            </Group>
          )}
          {!zuletztReihe && p.unten?.(e)}
        </Stack>
        {!zuletztReihe && <div className="tbib-menue">{menue(e)}</div>}
      </div>
    )
    return <div key={`${zuletztReihe ? 'z' : 'k'}-${e.id}`}>{!zuletztReihe && p.huelle ? p.huelle(e, inhalt) : inhalt}</div>
  }

  const zeile = (e: E): ReactNode => {
    const inhalt = (
      <div>
        <div className="tbib-zeile" data-neu={p.neu?.(e) ? 'ja' : undefined} data-themenbereich-von={bereichVon(e).name} {...(p.attribute?.(e) ?? {})} {...ziehen(e)}>
          <div onClick={() => p.oeffnen(e)} role="presentation" style={{ cursor: 'pointer' }}>
            <VorschauBild schluessel={`${p.speicherSchluessel}:${e.id}:${e.updatedAt}`} laden={p.vorschau?.(e)} symbol={p.symbol} klein />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Group gap={6} wrap="nowrap">
              <UnstyledButton onClick={() => p.oeffnen(e)} aria-label={`„${e.titel}“ öffnen`} style={{ minWidth: 0 }}>
                <Text fw={600} size="sm" truncate>
                  {e.titel}
                </Text>
              </UnstyledButton>
              {e.grade ? (
                <Badge size="xs" variant="light" style={{ flexShrink: 0 }}>
                  Kl. {e.grade}
                </Badge>
              ) : null}
              {p.kennzeichen?.(e)}
            </Group>
            <Text size="xs" c="dimmed" truncate>
              {infoZeile(e)}
            </Text>
          </div>
          <Group gap={4} wrap="nowrap" visibleFrom="xs">
            {p.aktionen ? (
              p.aktionen(e)
            ) : (
              <Button size="xs" onClick={() => p.oeffnen(e)}>
                Öffnen
              </Button>
            )}
          </Group>
          {menue(e)}
        </div>
        {p.unten?.(e)}
      </div>
    )
    return <div key={`l-${e.id}`}>{p.huelle ? p.huelle(e, inhalt) : inhalt}</div>
  }

  const ablegen = (fach: string, name: string) => ({
    onDragOver: (ev: React.DragEvent) => {
      if (!ev.dataTransfer.types.includes(ZIEH_TYP)) return
      ev.preventDefault()
      ev.dataTransfer.dropEffect = 'move'
      if (ziel !== `${fach}|${name}`) setZiel(`${fach}|${name}`)
    },
    onDragLeave: (ev: React.DragEvent) => {
      if (!(ev.currentTarget as HTMLElement).contains(ev.relatedTarget as Node | null)) setZiel(null)
    },
    onDrop: (ev: React.DragEvent) => {
      const id = ev.dataTransfer.getData(ZIEH_TYP)
      setZiel(null)
      const e = sichtbar.find((x) => x.id === id)
      if (!e) return
      ev.preventDefault()
      // Ein Themenbereich gehört zu seinem Fach – über Fachgrenzen wird nicht verschoben
      if ((e.fach.trim() || 'Ohne Fach') !== fach) return
      setzen(e, name)
    }
  })

  const liste = (l: E[]): ReactNode =>
    ansicht === 'karten' ? (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: 10 }}>{l.map((e) => karte(e))}</div>
    ) : (
      <Stack gap={6}>{l.map(zeile)}</Stack>
    )

  const wahlZuordnung = wahl ? bereichVon(wahl) : null
  const vorschlaege = useMemo(() => {
    if (!wahl) return []
    const benutzt = gruppiereNachThema(
      sichtbar.filter((x) => x.fach === wahl.fach),
      bereichVon
    ).flatMap((f) => f.themen.map((t) => t.name))
    return themenAuswahl(katalog(wahl), benutzt, wahl.grade)
  }, [wahl, sichtbar, katalog, zuordnung])

  return (
    <Stack gap="md" data-themen-bibliothek={p.speicherSchluessel}>
      <Group justify="space-between" gap="xs">
        <Group gap="xs">{p.leiste}</Group>
        <SegmentedControl
          size="xs"
          value={ansicht}
          onChange={(v) => ansichtSetzen(v as Ansicht)}
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
          aria-label="Ansicht"
          data-ansicht={ansicht}
        />
      </Group>

      {zuletzt.length > 0 && (
        <div data-zuletzt-bearbeitet>
          <Text fw={700} size="sm" mb={6}>
            Zuletzt bearbeitet
          </Text>
          <div className="tbib-zuletzt">{zuletzt.map((e) => karte(e, true))}</div>
        </div>
      )}

      {p.eintraege && !treffer.length && (
        <Text c="dimmed" size="sm" ta="center" py="xl" data-bibliothek-leer>
          {sichtbar.length ? 'Nichts gefunden. Anderen Suchbegriff versuchen.' : p.leerText}
        </Text>
      )}

      {gruppen.map((f) => {
        const fk = `f:${f.fach}`
        const fachZu = istZu(fk)
        return (
          <div key={fk} data-themen-fach={f.fach}>
            <button type="button" className="tbib-kopf" onClick={() => umschalten(fk)} aria-expanded={!fachZu} aria-label={`${f.fach} ${fachZu ? 'aufklappen' : 'zuklappen'}`}>
              {fachZu ? <IconChevronRight size={18} /> : <IconChevronDown size={18} />}
              <FachPunkt fach={f.fach} groesse={12} />
              <Title order={4}>{f.fach}</Title>
              <Badge variant="light" color="gray" size="sm">
                {f.anzahl}
              </Badge>
              {f.klassen && (
                <Text size="sm" c="dimmed">
                  {f.klassen}
                </Text>
              )}
            </button>
            {!fachZu && (
              <Stack gap="xs" pl={{ base: 4, sm: 22 }}>
                {f.themen.map((t) => {
                  const tk = `t:${f.fach}|${t.name}`
                  const themaZu = istZu(tk)
                  return (
                    <div
                      key={tk}
                      className="tbib-bereich"
                      data-themenbereich={t.name}
                      data-ziel={ziel === `${f.fach}|${t.name}` ? 'ja' : undefined}
                      {...ablegen(f.fach, t.name)}
                    >
                      <button
                        type="button"
                        className="tbib-kopf"
                        onClick={() => umschalten(tk)}
                        aria-expanded={!themaZu}
                        aria-label={`${t.name} ${themaZu ? 'aufklappen' : 'zuklappen'}`}
                      >
                        {themaZu ? <IconChevronRight size={16} /> : <IconChevronDown size={16} />}
                        <IconFolder size={16} color="var(--mantine-color-dimmed)" />
                        <Text fw={600} size="sm" c={t.name === OHNE_THEMENBEREICH ? 'dimmed' : undefined}>
                          {t.name}
                        </Text>
                        <Badge variant="light" color="gray" size="xs">
                          {t.eintraege.length}
                        </Badge>
                        {t.klassen && (
                          <Text size="xs" c="dimmed">
                            {t.klassen}
                          </Text>
                        )}
                      </button>
                      {!themaZu && liste(t.eintraege)}
                    </div>
                  )
                })}
              </Stack>
            )}
          </div>
        )
      })}

      {wahl && wahlZuordnung && (
        <ThemenWahl
          eintrag={wahl}
          aktuell={wahlZuordnung}
          automatisch={themenbereichFuer({ ...wahl, themenbereich: undefined }, katalog(wahl))}
          vorschlaege={vorschlaege}
          schliessen={() => setWahl(null)}
          waehlen={(name) => {
            setzen(wahl, name)
            setWahl(null)
          }}
        />
      )}
    </Stack>
  )
}
