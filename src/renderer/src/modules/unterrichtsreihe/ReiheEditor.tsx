/**
 * Eine Unterrichtsreihe bauen: Titel, Fach, Oberthema (Kerncurriculum des Landes), übergeordnete
 * Lernziele, Schritte (hinzufügen, ordnen, bearbeiten) und zuweisen.
 */
import { useAlleLernenden } from '../lernen/LernendeWahl'
import HaeufigSelect from '../../shared/components/HaeufigSelect'
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip
} from '@mantine/core'
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowUp,
  IconCopy,
  IconDeviceFloppy,
  IconEye,
  IconFolderPlus,
  IconGripVertical,
  IconMedal,
  IconPencil,
  IconPlus,
  IconSend,
  IconTrash
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import {
  berechneWeg,
  leererInhalt,
  neueSchrittId,
  ordneNachTeilen,
  SCHRITT_ARTEN,
  standardErfolg,
  teileVon,
  type Extern,
  type Reihe,
  type Schritt,
  type SchrittArt,
  type Stand
} from '@shared/reihe'
import { FAECHER } from '@shared/faecher'
import { lehrplanSchulform } from '@shared/lehrplan'
import { katalogBaum, ladeLehrplan, type KatalogKnoten } from '../../shared/themenKatalog'
import { notifyError, notifySuccess } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'
import { LernzieleFeld, type KcAuszug } from './Lernziele'
import { ichKannFormulieren, reihenLernziele } from './lernzieleKi'
import { SchrittBearbeiten } from './SchrittBearbeiten'

const ki = <T,>(req: Parameters<typeof window.api.ai.structured>[0]): Promise<T> => window.api.ai.structured<T>(req)

const ROLLE: Record<Schritt['rolle'], { label: string; farbe: string }> = {
  pflicht: { label: 'Pflicht', farbe: 'blue' },
  wahl: { label: 'Wahl', farbe: 'grape' },
  foerder: { label: 'Förderung', farbe: 'orange' },
  forder: { label: '★ Forder', farbe: 'yellow' }
}

/** Alle Zeilen unter einem Knoten (Unterthemen, auch tiefer) */
const zeilenVon = (k: KatalogKnoten): string[] => k.kinder.flatMap((c) => [c.wortlaut ?? c.name, ...zeilenVon(c).map((z) => `${c.name}: ${z}`)])

export function ReiheEditor({ start, zurueck }: { start: Reihe; zurueck: () => void }): React.JSX.Element {
  const [r, setR] = useState<Reihe>(start)
  const [geaendert, setGeaendert] = useState(false)
  const [bearbeiten, setBearbeiten] = useState<Schritt | null>(null)
  const [zuweisen, setZuweisen] = useState(false)
  const [vorschau, setVorschau] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const [kc, setKc] = useState<KatalogKnoten[]>([])
  const setze = (teil: Partial<Reihe>): void => {
    setR((x) => ({ ...x, ...teil }))
    setGeaendert(true)
  }
  useEffect(() => {
    let aktiv = true
    void ladeLehrplan(r.stateId).then((lp) => {
      if (!aktiv) return
      const baum = katalogBaum(r.fachId, lp, lehrplanSchulform(r.schoolTypeId), r.stateId).filter(
        (k) => k.quelle === 'lehrplan' && (!k.jahrgaenge?.length || k.jahrgaenge.includes(r.grade))
      )
      setKc(baum)
    })
    return () => {
      aktiv = false
    }
  }, [r.stateId, r.fachId, r.schoolTypeId, r.grade])
  const gewaehlt = kc.find((k) => k.name === r.oberthema)
  const auszug: KcAuszug | null = gewaehlt
    ? { zeilen: [gewaehlt.wortlaut ?? gewaehlt.name, ...zeilenVon(gewaehlt)].slice(0, 60), quelle: `Kerncurriculum ${r.stateId} ${r.fachLabel}` }
    : null

  const speichern = async (): Promise<Reihe | null> => {
    setLaeuft(true)
    try {
      const a = await senden<{ id: string; geaendert: string }>('/server/reihen/speichern', { reihe: r })
      const neu = { ...r, id: a.id, geaendert: a.geaendert }
      setR(neu)
      setGeaendert(false)
      notifySuccess('Gespeichert.')
      return neu
    } catch (e) {
      notifyError(e, 'Nicht gespeichert')
      return null
    } finally {
      setLaeuft(false)
    }
  }
  // Teile (03.10.2026): angelegte Teile + an Schritten genannte; Schritte stehen immer in der Reihenfolge der Teile
  const teile = teileVon(r)
  const setzeSchritte = (schritte: Schritt[], neueTeile = teile): void => setze({ schritte: ordneNachTeilen(schritte, neueTeile), teile: neueTeile })
  /** Schritt `id` in den Teil `teil` verschieben – vor `vor` (Schritt-Id) bzw. ans Ende */
  const verschiebeNach = (id: string, teil: string | undefined, vor: string | null): void => {
    const s0 = r.schritte.find((x) => x.id === id)
    if (!s0 || id === vor) return
    const ohne = r.schritte.filter((x) => x.id !== id)
    const neu = { ...s0, abschnitt: teil || undefined }
    const idx = vor ? ohne.findIndex((x) => x.id === vor) : -1
    if (idx >= 0) ohne.splice(idx, 0, neu)
    else {
      // ans Ende des Teils
      const letzter = ohne
        .map((x, k) => ((x.abschnitt || undefined) === (teil || undefined) ? k : -1))
        .filter((k) => k >= 0)
        .pop()
      ohne.splice(letzter === undefined ? ohne.length : letzter + 1, 0, neu)
    }
    setzeSchritte(ohne)
  }
  const verschiebe = (id: string, d: number): void => {
    const s0 = r.schritte.find((x) => x.id === id)!
    const imTeil = r.schritte.filter((x) => (x.abschnitt || undefined) === (s0.abschnitt || undefined))
    const k = imTeil.findIndex((x) => x.id === id)
    const ziel = imTeil[k + d]
    if (!ziel) return
    const liste = [...r.schritte]
    const i = liste.findIndex((x) => x.id === id)
    const j = liste.findIndex((x) => x.id === ziel.id)
    ;[liste[i], liste[j]] = [liste[j], liste[i]]
    setzeSchritte(liste)
  }
  const teilVerschieben = (t: string, d: number): void => {
    const i = teile.indexOf(t)
    const j = i + d
    if (j < 0 || j >= teile.length) return
    const neu = [...teile]
    ;[neu[i], neu[j]] = [neu[j], neu[i]]
    setzeSchritte(r.schritte, neu)
  }
  const teilUmbenennen = (alt: string, neuName: string): void => {
    const n = neuName.trim()
    if (!n || n === alt || teile.includes(n)) return
    setzeSchritte(
      r.schritte.map((x) => (x.abschnitt === alt ? { ...x, abschnitt: n } : x)),
      teile.map((t) => (t === alt ? n : t))
    )
  }
  const teilLoeschen = (t: string): void =>
    setzeSchritte(
      r.schritte.map((x) => (x.abschnitt === t ? { ...x, abschnitt: undefined } : x)),
      teile.filter((x) => x !== t)
    )
  const teilAnlegen = (): void => {
    let n = 1
    while (teile.includes(`Teil ${n}`)) n++
    setzeSchritte(r.schritte, [...teile, `Teil ${n}`])
  }
  const [neuIn, setNeuIn] = useState<string | undefined>(undefined)
  const neuerSchritt = (art: SchrittArt, teil?: string): void => {
    setNeuIn(teil)
    setBearbeiten({
      id: neueSchrittId(),
      titel: '',
      lernziele: [],
      rolle: 'pflicht',
      erfolg: standardErfolg(art),
      inhalt: leererInhalt(art),
      ...(teil ? { abschnitt: teil } : {})
    })
  }
  const [gezogen, setGezogen] = useState<string | null>(null)
  const [ueber, setUeber] = useState<string | null>(null)
  const nummer = new Map(r.schritte.map((x, k) => [x.id, k + 1]))

  return (
    <Stack data-reihe-editor>
      <Group justify="space-between">
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={zurueck}>
          Alle Reihen
        </Button>
        <Group gap="xs">
          <Button
            variant="light"
            leftSection={<IconDeviceFloppy size={16} />}
            loading={laeuft}
            disabled={!r.titel.trim()}
            onClick={() => void speichern()}
            data-reihe-speichern
          >
            Speichern{geaendert ? ' *' : ''}
          </Button>
          <Button variant="default" leftSection={<IconEye size={16} />} disabled={!r.schritte.length} onClick={() => setVorschau(true)} data-schuelervorschau>
            Als Schüler ansehen
          </Button>
          <Button
            leftSection={<IconSend size={16} />}
            disabled={!r.titel.trim() || !r.schritte.length}
            onClick={async () => {
              const neu = geaendert || !r.id ? await speichern() : r
              if (neu) setZuweisen(true)
            }}
            data-reihe-zuweisen
          >
            Zuweisen
          </Button>
        </Group>
      </Group>
      <Card withBorder>
        <Stack gap="sm">
          <Group grow align="start">
            <TextInput label="Titel der Reihe" value={r.titel} onChange={(e) => setze({ titel: e.currentTarget.value })} data-reihe-titel />
            <HaeufigSelect
              art="fach"
              label="Fach"
              searchable
              data={FAECHER.map((f) => ({ value: f.id, label: f.label }))}
              value={r.fachId}
              onChange={(v) => v && setze({ fachId: v, fachLabel: FAECHER.find((f) => f.id === v)?.label ?? v })}
              allowDeselect={false}
            />
            <NumberInput label="Jahrgang" min={1} max={13} value={r.grade} onChange={(v) => setze({ grade: Number(v) || r.grade })} w={110} />
          </Group>
          <Select
            label="Oberthema"
            description={
              kc.length
                ? `Themenfelder des Kerncurriculums (${r.stateId}, Jahrgang ${r.grade}) – oder eigenes eintippen`
                : 'Kein Kerncurriculum für diese Auswahl gefunden – eigenes Oberthema eintippen'
            }
            searchable
            data={[...new Set([...kc.map((k) => k.name), ...(r.oberthema ? [r.oberthema] : [])])]}
            value={r.oberthema || null}
            onChange={(v) => setze({ oberthema: v ?? '' })}
            onSearchChange={(t) => {
              if (t && !kc.some((k) => k.name === t)) setR((x) => ({ ...x, oberthema: t }))
            }}
            clearable
            data-reihe-oberthema
          />
          <LernzieleFeld
            titel="Lernziele der Reihe (sehen die Lernenden oben in der Reihe)"
            ziele={r.lernziele}
            setze={(l) => setze({ lernziele: l })}
            kc={auszug}
            vorschlagen={() => reihenLernziele(r, { auszug: auszug?.zeilen ?? [], quelle: auszug?.quelle ?? '' }, ki)}
            ichKann={(z) => ichKannFormulieren(r, z, ki)}
          />
        </Stack>
      </Card>

      <Group justify="space-between">
        <Text fw={700}>Schritte</Text>
        <Group gap="xs">
          <Button variant="light" leftSection={<IconFolderPlus size={16} />} onClick={teilAnlegen} data-teil-neu>
            Teil hinzufügen
          </Button>
          <SchrittMenue neu={(art) => neuerSchritt(art)} />
        </Group>
      </Group>
      {r.schritte.length === 0 && teile.length === 0 && (
        <Text c="dimmed" size="sm">
          Noch keine Schritte. Zum Beispiel: Teil 1 „Grundlagen“ mit Eingangsdiagnose → Arbeitsblatt → Lernkarten, Teil 2 „Anwenden“ mit Zwischenaufgabe → Test
          → Selbsteinschätzung. Schritte lassen sich mit der Maus in einen anderen Teil ziehen.
        </Text>
      )}
      {[undefined, ...teile].map((teil) => {
        const schritte = r.schritte.filter((x) => (teil ? x.abschnitt === teil : !x.abschnitt || !teile.includes(x.abschnitt)))
        if (!teil && !schritte.length) return null
        const zielKennung = `teil:${teil ?? ''}`
        return (
          <Paper
            key={teil ?? '__ohne'}
            withBorder={Boolean(teil)}
            p={teil ? 'sm' : 0}
            radius="md"
            bg={teil ? 'var(--mantine-color-default-hover)' : undefined}
            data-teil={teil ?? ''}
            onDragOver={(e) => {
              if (!gezogen) return
              e.preventDefault()
              setUeber(zielKennung)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (gezogen && ueber === zielKennung) verschiebeNach(gezogen, teil, null)
              setGezogen(null)
              setUeber(null)
            }}
            style={{ outline: ueber === zielKennung ? '2px dashed var(--mantine-color-blue-5)' : undefined }}
          >
            {teil && (
              <TeilKopf
                name={teil}
                abzeichen
                erster={teile[0] === teil}
                letzter={teile[teile.length - 1] === teil}
                umbenennen={(n) => teilUmbenennen(teil, n)}
                hoch={() => teilVerschieben(teil, -1)}
                runter={() => teilVerschieben(teil, 1)}
                loeschen={() => teilLoeschen(teil)}
                neu={(art) => neuerSchritt(art, teil)}
              />
            )}
            <Stack gap={6} mt={teil ? 'xs' : 0}>
              {teil && schritte.length === 0 && (
                <Text size="xs" c="dimmed" ta="center" py="xs">
                  Noch leer – Schritt hinzufügen oder hierher ziehen.
                </Text>
              )}
              {schritte.map((s) => {
                const art = SCHRITT_ARTEN.find((a) => a.id === s.inhalt.art)
                const imTeil = schritte.indexOf(s)
                return (
                  <Stack key={s.id} gap={4}>
                    {s.halt && (
                      <Text size="xs" c="orange.7">
                        ⏸ Haltepunkt: {s.halt.art === 'freigabe' ? 'nach gemeinsamer Besprechung' : `ab ${new Date(s.halt.ab).toLocaleDateString('de-DE')}`}
                      </Text>
                    )}
                    <Paper
                      withBorder
                      p="sm"
                      radius="md"
                      data-schritt={s.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', s.id)
                        setGezogen(s.id)
                      }}
                      onDragEnd={() => {
                        setGezogen(null)
                        setUeber(null)
                      }}
                      onDragOver={(e) => {
                        if (!gezogen || gezogen === s.id) return
                        e.preventDefault()
                        e.stopPropagation()
                        setUeber(s.id)
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (gezogen) verschiebeNach(gezogen, s.abschnitt && teile.includes(s.abschnitt) ? s.abschnitt : undefined, s.id)
                        setGezogen(null)
                        setUeber(null)
                      }}
                      style={{
                        cursor: 'grab',
                        opacity: gezogen === s.id ? 0.4 : 1,
                        borderTop: ueber === s.id ? '3px solid var(--mantine-color-blue-5)' : undefined
                      }}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                          <IconGripVertical size={16} color="var(--mantine-color-dimmed)" />
                          <Badge variant="filled" color="gray" circle>
                            {nummer.get(s.id)}
                          </Badge>
                          <div style={{ minWidth: 0 }}>
                            <Group gap={6}>
                              <Text fw={600} truncate>
                                {s.titel || '(ohne Titel)'}
                              </Text>
                              <Badge size="xs" variant="light">
                                {art?.label}
                              </Badge>
                              <Badge size="xs" variant="light" color={ROLLE[s.rolle].farbe}>
                                {ROLLE[s.rolle].label}
                                {s.rolle === 'wahl' && s.wahlGruppe ? ` ${s.wahlGruppe} (${s.wahlMindestens ?? 1})` : ''}
                              </Badge>
                            </Group>
                            <Text size="xs" c="dimmed" truncate>
                              {s.lernziele.length ? s.lernziele.map((l) => l.ichKann || l.text).join(' · ') : 'ohne Lernziele'}
                            </Text>
                          </div>
                        </Group>
                        <Group gap={2} wrap="nowrap">
                          <ActionIcon variant="subtle" onClick={() => verschiebe(s.id, -1)} disabled={imTeil === 0} aria-label="nach oben">
                            <IconArrowUp size={16} />
                          </ActionIcon>
                          <ActionIcon variant="subtle" onClick={() => verschiebe(s.id, 1)} disabled={imTeil === schritte.length - 1} aria-label="nach unten">
                            <IconArrowDown size={16} />
                          </ActionIcon>
                          <Tooltip label="Bearbeiten">
                            <ActionIcon variant="subtle" onClick={() => setBearbeiten(s)} aria-label="bearbeiten" data-schritt-bearbeiten>
                              <IconPencil size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Verdoppeln">
                            <ActionIcon
                              variant="subtle"
                              onClick={() => {
                                const i = r.schritte.findIndex((x) => x.id === s.id)
                                setzeSchritte([
                                  ...r.schritte.slice(0, i + 1),
                                  { ...structuredClone(s), id: neueSchrittId(), titel: `${s.titel} (Kopie)` },
                                  ...r.schritte.slice(i + 1)
                                ])
                              }}
                              aria-label="verdoppeln"
                            >
                              <IconCopy size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Entfernen">
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() => setzeSchritte(r.schritte.filter((x) => x.id !== s.id))}
                              aria-label="entfernen"
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Group>
                    </Paper>
                  </Stack>
                )
              })}
            </Stack>
          </Paper>
        )
      })}
      {teile.length > 0 && (
        <Text size="xs" c="dimmed">
          Abzeichen gibt es für jeden geschafften Teil: {teile.join(', ')}.
        </Text>
      )}
      {bearbeiten && (
        <SchrittBearbeiten
          reihe={r}
          schritt={bearbeiten}
          schliessen={() => setBearbeiten(null)}
          teile={teile}
          speichern={(s) => {
            const da = r.schritte.some((x) => x.id === s.id)
            setzeSchritte(
              da ? r.schritte.map((x) => (x.id === s.id ? s : x)) : [...r.schritte, { ...s, ...(neuIn && !s.abschnitt ? { abschnitt: neuIn } : {}) }]
            )
            setBearbeiten(null)
          }}
        />
      )}
      {zuweisen && r.id && <Zuweisen reiheId={r.id} schliessen={() => setZuweisen(false)} />}
      {vorschau && <Vorschau reihe={r} schliessen={() => setVorschau(false)} />}
    </Stack>
  )
}

function Zuweisen({ reiheId, schliessen }: { reiheId: string; schliessen: () => void }): React.JSX.Element {
  const [art, setArt] = useState<'gruppe' | 'einzeln'>('gruppe')
  const [gruppen, setGruppen] = useState<{ id: string; name: string }[]>([])
  const [gruppe, setGruppe] = useState<string | null>(null)
  // Mitglieder aller eigenen Lerngruppen (für „einzelne Lernende" – auch aus verschiedenen Gruppen)
  const [alle, setAlle] = useState<{ gruppe: string; gruppeId: string; benutzer: string; name: string }[]>([])
  const [einzelne, setEinzelne] = useState<string[]>([])
  const [laeuft, setLaeuft] = useState(false)
  useEffect(() => {
    void holen<{ gruppen: { id: string; name: string }[] }>('/server/lerngruppen').then(
      async (d) => {
        setGruppen(d.gruppen)
        const listen = await Promise.all(
          d.gruppen.map((g) =>
            holen<{ mitglieder: { benutzer: string; name: string }[] }>(`/server/feedback/mitglieder?gruppe=${encodeURIComponent(g.id)}`).then(
              (m) => m.mitglieder.map((x) => ({ ...x, gruppe: g.name, gruppeId: g.id })),
              () => []
            )
          )
        )
        setAlle(listen.flat())
      },
      () => setGruppen([])
    )
  }, [])
  const inGruppe = alle.filter((m) => m.gruppeId === gruppe)
  // Einzelne Lernende: alle Schülerkonten der Schule, nach Klasse (03.10.2026)
  const alleLernenden = useAlleLernenden()
  return (
    <Modal opened onClose={schliessen} title="Reihe zuweisen" size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          Die Lernenden finden die Reihe auf ihrer Startseite unter „Unterrichtsreihen“. Arbeitsblätter, Tests und Aufgaben der Reihe werden dabei für sie
          freigegeben.
        </Text>
        <SegmentedControl
          value={art}
          onChange={(v) => {
            setArt(v as 'gruppe' | 'einzeln')
            setEinzelne([])
          }}
          data={[
            { value: 'gruppe', label: 'Lerngruppe' },
            { value: 'einzeln', label: 'Einzelne Lernende' }
          ]}
          data-zuweisen-art
        />
        {art === 'gruppe' ? (
          <>
            <Select
              label="Lerngruppe"
              data={gruppen.map((g) => ({ value: g.id, label: g.name }))}
              value={gruppe}
              onChange={(v) => (setGruppe(v), setEinzelne([]))}
              placeholder="wählen …"
              data-zuweisen-gruppe
            />
            {gruppe && (
              <MultiSelect
                label="Nur für einzelne aus der Lerngruppe"
                description="Leer = die ganze Lerngruppe (auch wer später dazukommt)."
                data={inGruppe.map((m) => ({ value: m.benutzer, label: m.name }))}
                value={einzelne}
                onChange={setEinzelne}
                searchable
                clearable
                placeholder="alle"
              />
            )}
          </>
        ) : (
          <MultiSelect
            label="Lernende"
            description="Alle Schülerkonten der Schule, nach Klasse – zum Beispiel für eine Förder- oder Fordergruppe."
            data={alleLernenden.daten}
            value={einzelne}
            onChange={setEinzelne}
            searchable
            clearable
            nothingFoundMessage="Kein Schülerkonto mit diesem Namen"
            placeholder={alleLernenden.geladen && !alleLernenden.anzahl ? 'Noch keine Schülerkonten angelegt' : 'Namen suchen …'}
            data-zuweisen-einzelne
          />
        )}
        <Group justify="flex-end">
          <Button
            loading={laeuft}
            disabled={art === 'gruppe' ? !gruppe : !einzelne.length}
            onClick={() => {
              setLaeuft(true)
              void senden(`/server/reihen/${reiheId}/zuweisen`, { lerngruppeId: art === 'gruppe' ? gruppe : '', schueler: einzelne })
                .then(() => {
                  notifySuccess('Zugewiesen.')
                  schliessen()
                })
                .catch((e: unknown) => notifyError(e))
                .finally(() => setLaeuft(false))
            }}
            data-zuweisen-los
          >
            Zuweisen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/** Menü „Schritt hinzufügen" (oben und in jedem Teil) */
function SchrittMenue({ neu, klein }: { neu: (art: SchrittArt) => void; klein?: boolean }): React.JSX.Element {
  return (
    <Menu position="bottom-end" width={360}>
      <Menu.Target>
        <Button size={klein ? 'xs' : 'sm'} variant={klein ? 'subtle' : 'filled'} leftSection={<IconPlus size={klein ? 14 : 16} />} data-schritt-neu>
          Schritt hinzufügen
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {SCHRITT_ARTEN.map((a) => (
          <Menu.Item key={a.id} onClick={() => neu(a.id)} data-schritt-art={a.id}>
            <Text size="sm" fw={600}>
              {a.label}
            </Text>
            <Text size="xs" c="dimmed">
              {a.text}
            </Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}

/** Kopf eines Teils: Name (bearbeitbar), verschieben, löschen, Schritt hinzufügen */
function TeilKopf(p: {
  name: string
  abzeichen?: boolean
  erster: boolean
  letzter: boolean
  umbenennen: (n: string) => void
  hoch: () => void
  runter: () => void
  loeschen: () => void
  neu: (art: SchrittArt) => void
}): React.JSX.Element {
  const [text, setText] = useState(p.name)
  useEffect(() => setText(p.name), [p.name])
  return (
    <Group justify="space-between" wrap="nowrap">
      <Group gap={6} wrap="nowrap" style={{ flex: 1 }}>
        {p.abzeichen && <IconMedal size={18} color="var(--mantine-color-yellow-6)" />}
        <TextInput
          variant="unstyled"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onBlur={() => (text.trim() ? p.umbenennen(text) : setText(p.name))}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          styles={{ input: { fontWeight: 700, fontSize: 'var(--mantine-font-size-md)' } }}
          style={{ flex: 1 }}
          aria-label="Name des Teils"
          data-teil-name
        />
      </Group>
      <Group gap={2} wrap="nowrap">
        <SchrittMenue neu={p.neu} klein />
        <ActionIcon variant="subtle" onClick={p.hoch} disabled={p.erster} aria-label="Teil nach oben">
          <IconArrowUp size={16} />
        </ActionIcon>
        <ActionIcon variant="subtle" onClick={p.runter} disabled={p.letzter} aria-label="Teil nach unten">
          <IconArrowDown size={16} />
        </ActionIcon>
        <Tooltip label="Teil löschen (die Schritte bleiben, ohne Teil)">
          <ActionIcon variant="subtle" color="red" onClick={p.loeschen} aria-label="Teil löschen">
            <IconTrash size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  )
}

/**
 * „Als Schüler ansehen" (03.10.2026, Idee aus LearningView): der Weg, wie ihn Lernende sehen – mit
 * simulierten Ergebnissen, um Freischaltung, Haltepunkte, Wahl- und Förderschritte zu prüfen.
 * Nichts wird gespeichert.
 */
function Vorschau({ reihe, schliessen }: { reihe: Reihe; schliessen: () => void }): React.JSX.Element {
  const [stand, setStand] = useState<Stand>({ schritte: {} })
  const [extern, setExtern] = useState<Record<string, Extern>>({})
  const [frei, setFrei] = useState<string[]>([])
  const weg = berechneWeg(reihe, stand, extern, frei)
  const simuliere = (s: Schritt, ok: boolean): void => {
    const verknuepft = ['arbeitsblatt', 'rueckmeldung', 'onlinetest', 'vokabeln'].includes(s.inhalt.art)
    if (verknuepft) setExtern({ ...extern, [s.id]: { eingereicht: 9, runden: 9, kriterien: [ok ? 'sicher' : 'noch nicht'], prozent: ok ? 100 : 0 } })
    else
      setStand({
        ...stand,
        schritte: { ...stand.schritte, [s.id]: ok ? { hand: 'geschafft' } : { eingereicht: 9, bewertung: { text: '', geschafft: false, zeit: 0 } } }
      })
  }
  return (
    <Modal opened onClose={schliessen} title={`Vorschau: ${reihe.titel}`} size="lg">
      <Stack gap="xs" data-vorschau>
        <Text size="sm" c="dimmed">
          So sieht der Weg für Lernende aus. Mit den Knöpfen simulierst du Ergebnisse – gespeichert wird nichts.
        </Text>
        <Progress value={weg.fortschritt * 100} size="lg" radius="xl" />
        {reihe.lernziele.length > 0 && (
          <Text size="sm">
            <b>Am Ende der Reihe:</b> {reihe.lernziele.map((l) => l.ichKann || l.text).join(' · ')}
          </Text>
        )}
        {reihe.schritte.map((s, i) => {
          const l = weg.schritte[i]
          if (s.rolle === 'foerder' && l.status === 'gesperrt') return null
          return (
            <Paper key={s.id} withBorder p="xs" radius="md" style={{ opacity: l.status === 'gesperrt' ? 0.6 : 1 }} data-vorschau-station={l.status}>
              <Group justify="space-between" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text fw={600} size="sm">
                    {l.status === 'geschafft' ? '✓ ' : l.status === 'gesperrt' ? '🔒 ' : l.status === 'uebersprungen' ? '» ' : `${i + 1}. `}
                    {s.titel}
                    {s.rolle === 'foerder' ? ' (Übung)' : s.rolle === 'forder' ? ' ★' : s.rolle === 'wahl' ? ' (Wahl)' : ''}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {l.status}
                    {l.hinweis ? ` – ${l.hinweis}` : ''}
                  </Text>
                </div>
                <Group gap={4} wrap="nowrap">
                  {s.halt?.art === 'freigabe' && !frei.includes(s.id) && (
                    <Button size="compact-xs" variant="light" onClick={() => setFrei([...frei, s.id])}>
                      Haltepunkt frei
                    </Button>
                  )}
                  {l.status !== 'gesperrt' && l.status !== 'geschafft' && (
                    <>
                      <Button size="compact-xs" color="green" onClick={() => simuliere(s, true)} data-vorschau-geschafft>
                        geschafft
                      </Button>
                      <Button size="compact-xs" color="orange" variant="light" onClick={() => simuliere(s, false)}>
                        nicht geschafft
                      </Button>
                    </>
                  )}
                </Group>
              </Group>
            </Paper>
          )
        })}
        <Group justify="space-between">
          <Text size="sm">{weg.abzeichen.length ? `Abzeichen: ${weg.abzeichen.join(', ')}` : ''}</Text>
          <Button variant="subtle" onClick={() => (setStand({ schritte: {} }), setExtern({}), setFrei([]))}>
            Zurücksetzen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
