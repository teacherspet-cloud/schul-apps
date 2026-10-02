/**
 * Eine Unterrichtsreihe bauen: Titel, Fach, Oberthema (Kerncurriculum des Landes), übergeordnete
 * Lernziele, Schritte (hinzufügen, ordnen, bearbeiten) und zuweisen.
 */
import { ActionIcon, Badge, Button, Card, Group, Menu, Modal, MultiSelect, NumberInput, Paper, Select, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { IconArrowDown, IconArrowLeft, IconArrowUp, IconCopy, IconDeviceFloppy, IconPencil, IconPlus, IconSend, IconTrash } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { leererInhalt, neueSchrittId, SCHRITT_ARTEN, standardErfolg, type Reihe, type Schritt, type SchrittArt } from '@shared/reihe'
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
  const verschiebe = (i: number, d: number): void => {
    const s = [...r.schritte]
    const j = i + d
    if (j < 0 || j >= s.length) return
    ;[s[i], s[j]] = [s[j], s[i]]
    setze({ schritte: s })
  }
  const neuerSchritt = (art: SchrittArt): void =>
    setBearbeiten({ id: neueSchrittId(), titel: '', lernziele: [], rolle: 'pflicht', erfolg: standardErfolg(art), inhalt: leererInhalt(art) })
  const abschnitte = useMemo(() => [...new Set(r.schritte.map((s) => s.abschnitt).filter(Boolean))], [r.schritte])

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
            <Select
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
        <Menu position="bottom-end" width={360}>
          <Menu.Target>
            <Button leftSection={<IconPlus size={16} />} data-schritt-neu>
              Schritt hinzufügen
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {SCHRITT_ARTEN.map((a) => (
              <Menu.Item key={a.id} onClick={() => neuerSchritt(a.id)} data-schritt-art={a.id}>
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
      </Group>
      {r.schritte.length === 0 && (
        <Text c="dimmed" size="sm">
          Noch keine Schritte. Zum Beispiel: Eingangsdiagnose → Arbeitsblatt → Zwischenaufgabe → Lernkarten → Test → Selbsteinschätzung.
        </Text>
      )}
      {r.schritte.map((s, i) => {
        const art = SCHRITT_ARTEN.find((a) => a.id === s.inhalt.art)
        const neuerAbschnitt = s.abschnitt && s.abschnitt !== r.schritte[i - 1]?.abschnitt
        return (
          <Stack key={s.id} gap={4}>
            {neuerAbschnitt && (
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" mt="xs">
                {s.abschnitt}
              </Text>
            )}
            {s.halt && (
              <Text size="xs" c="orange.7">
                ⏸ Haltepunkt: {s.halt.art === 'freigabe' ? 'nach gemeinsamer Besprechung' : `ab ${new Date(s.halt.ab).toLocaleDateString('de-DE')}`}
              </Text>
            )}
            <Paper withBorder p="sm" radius="md" data-schritt={s.id}>
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                  <Badge variant="filled" color="gray" circle>
                    {i + 1}
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
                  <ActionIcon variant="subtle" onClick={() => verschiebe(i, -1)} disabled={i === 0} aria-label="nach oben">
                    <IconArrowUp size={16} />
                  </ActionIcon>
                  <ActionIcon variant="subtle" onClick={() => verschiebe(i, 1)} disabled={i === r.schritte.length - 1} aria-label="nach unten">
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
                      onClick={() =>
                        setze({
                          schritte: [
                            ...r.schritte.slice(0, i + 1),
                            { ...structuredClone(s), id: neueSchrittId(), titel: `${s.titel} (Kopie)` },
                            ...r.schritte.slice(i + 1)
                          ]
                        })
                      }
                      aria-label="verdoppeln"
                    >
                      <IconCopy size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Entfernen">
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => setze({ schritte: r.schritte.filter((x) => x.id !== s.id) })}
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
      {abschnitte.length > 0 && (
        <Text size="xs" c="dimmed">
          Abzeichen für die Abschnitte: {abschnitte.join(', ')}
        </Text>
      )}
      {bearbeiten && (
        <SchrittBearbeiten
          reihe={r}
          schritt={bearbeiten}
          schliessen={() => setBearbeiten(null)}
          speichern={(s) => {
            const da = r.schritte.some((x) => x.id === s.id)
            setze({ schritte: da ? r.schritte.map((x) => (x.id === s.id ? s : x)) : [...r.schritte, s] })
            setBearbeiten(null)
          }}
        />
      )}
      {zuweisen && r.id && <Zuweisen reiheId={r.id} schliessen={() => setZuweisen(false)} />}
    </Stack>
  )
}

function Zuweisen({ reiheId, schliessen }: { reiheId: string; schliessen: () => void }): React.JSX.Element {
  const [gruppen, setGruppen] = useState<{ id: string; name: string }[]>([])
  const [gruppe, setGruppe] = useState<string | null>(null)
  const [mitglieder, setMitglieder] = useState<{ benutzer: string; name: string }[]>([])
  const [einzelne, setEinzelne] = useState<string[]>([])
  const [laeuft, setLaeuft] = useState(false)
  useEffect(() => {
    void holen<{ gruppen: { id: string; name: string }[] }>('/server/lerngruppen').then(
      (d) => setGruppen(d.gruppen),
      () => setGruppen([])
    )
  }, [])
  useEffect(() => {
    setEinzelne([])
    if (!gruppe) return setMitglieder([])
    void holen<{ mitglieder: { benutzer: string; name: string }[] }>(`/server/feedback/mitglieder?gruppe=${encodeURIComponent(gruppe)}`).then(
      (d) => setMitglieder(d.mitglieder),
      () => setMitglieder([])
    )
  }, [gruppe])
  return (
    <Modal opened onClose={schliessen} title="Reihe zuweisen">
      <Stack>
        <Text size="sm" c="dimmed">
          Die Lernenden finden die Reihe auf ihrer Startseite unter „Unterrichtsreihen“. Arbeitsblätter, Tests und Aufgaben der Reihe werden dabei für sie
          freigegeben.
        </Text>
        <Select
          label="Lerngruppe"
          data={gruppen.map((g) => ({ value: g.id, label: g.name }))}
          value={gruppe}
          onChange={setGruppe}
          placeholder="wählen …"
          data-zuweisen-gruppe
        />
        {gruppe && (
          <MultiSelect
            label="Nur für einzelne Lernende"
            data={mitglieder.map((m) => ({ value: m.benutzer, label: m.name }))}
            value={einzelne}
            onChange={setEinzelne}
            searchable
            clearable
            placeholder="alle"
          />
        )}
        <Group justify="flex-end">
          <Button
            loading={laeuft}
            disabled={!gruppe}
            onClick={() => {
              setLaeuft(true)
              void senden(`/server/reihen/${reiheId}/zuweisen`, { lerngruppeId: gruppe, schueler: einzelne })
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
