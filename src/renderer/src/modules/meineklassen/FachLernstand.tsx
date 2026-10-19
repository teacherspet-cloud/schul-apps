/**
 * Lernstand einer Klasse ohne Sprachfach in „Meine Klassen" (19.10.2026, abgestimmt mit der Lehrkraft): dieselbe Reihe
 * aus Kästen wie in Sprachklassen (SprachLernstand.tsx), immer sichtbar – auch ohne Material, dann mit Platzhalter:
 *  - vorn „Auf einen Blick" (FachKopf kompakt: Ring „Lernziele erreicht", Punkte „Blatt abgegeben"),
 *  - „Lernstand in Reihen & Blättern": Material nach ÜBERTHEMEN des Lehrplans (Server: ueberthemen.ts) – je Überthema
 *    eine aufklappbare Zeile mit Sammelbalken und Stift (Umbenennen nur für diese Lerngruppe), darunter je Material
 *    ein Balken und „Umhängen". Neuestes Überthema oben und offen; Oberstufe mit Halbjahr (Q1.1 …).
 *  - „Reihen & Blätter" als Zeitleiste (Neuestes oben, Geplantes gestrichelt), auch mit Material der Mitlehrkräfte.
 * Breite Schirme drei Karten nebeneinander, mit „Passendes Material" zwei Spalten, auf dem Handy eine.
 */
import { ActionIcon, Badge, Button, Card, Group, Menu, Progress, SimpleGrid, Stack, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronRight, IconDots, IconPencil, IconPlus } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError } from '../../shared/util'
import { useFachFarbe } from '../../shared/components/FachFarbe'

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

interface TestKurz {
  id: string
  titel: string
  teilnehmer: number
  offen: number
  status: string
}

type Art = 'blatt' | 'reihe' | 'test' | 'rueckmeldung' | 'tafel'

interface ThemaMaterial {
  schluessel: string
  art: Art
  id: string
  titel: string
  erstellt: string
  status: string
  von?: string
  modul?: string
  vonHand?: boolean
}

export interface ThemaGruppe {
  schluessel: string
  name: string
  original: string
  umbenannt: boolean
  schuljahr: number
  jahrgang: number | null
  semester?: string
  rang: number
  materialien: ThemaMaterial[]
}

type Stand = { fertig: number; begonnen: number; offen: number; von: number; text: string }

interface ThemenAntwort {
  themen: ThemaGruppe[]
  kandidaten: { schluessel: string; name: string; semester?: string }[]
  schuljahr: number
  /** Lernstand der Blätter und Reihen der Mitlehrkräfte */
  fremdStand?: Record<string, Stand>
}

const ART_NAME: Record<Art, string> = { blatt: 'Arbeitsblatt', reihe: 'Reihe', test: 'Onlinetest', rueckmeldung: 'Rückmeldung', tafel: 'Tafelbild' }
const ART_FARBE: Record<Art, string> = { blatt: 'blue', reihe: 'grape', test: 'orange', rueckmeldung: 'teal', tafel: 'gray' }
const tag = (x: number): string => new Date(x).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
const ms = (iso: string): number => Date.parse(iso) || 0
const geplant = (x: { geplantAb?: number | null }, jetzt: number): boolean => Boolean(x.geplantAb && x.geplantAb > jetzt)

/** Stand eines Materials: fertig/eingereicht · begonnen · offen (null = ohne Stand, z. B. Tafelbild) */
export function standVon(
  m: Pick<ThemaMaterial, 'art' | 'id'>,
  d: { reihen: ReiheKurz[]; blaetter: BlattKurz[]; tests: TestKurz[]; lernende: number }
): { fertig: number; begonnen: number; offen: number; von: number; text: string } | null {
  if (m.art === 'reihe') {
    const r = d.reihen.find((x) => x.zid === m.id)
    if (!r) return null
    const von = Math.max(0, r.lernende)
    const fertig = Math.min(r.fertig, von)
    const offen = Math.min(r.nichtBegonnen.length, von - fertig)
    return { fertig, begonnen: von - fertig - offen, offen, von, text: `${fertig} von ${von} fertig` }
  }
  if (m.art === 'blatt') {
    const b = d.blaetter.find((x) => x.id === m.id)
    if (!b) return null
    const von = Math.max(0, b.gesamt)
    const fertig = Math.min(b.eingereicht, von)
    const begonnen = Math.max(0, Math.min(b.begonnen, von) - fertig)
    return { fertig, begonnen, offen: von - fertig - begonnen, von, text: `${fertig} von ${von} eingereicht` }
  }
  if (m.art === 'test') {
    const t = d.tests.find((x) => x.id === m.id)
    if (!t) return null
    const von = Math.max(d.lernende, t.teilnehmer)
    return { fertig: t.teilnehmer, begonnen: 0, offen: Math.max(0, von - t.teilnehmer), von, text: `${t.teilnehmer} von ${von} teilgenommen` }
  }
  return null
}

function Balken({ s }: { s: { fertig: number; begonnen: number; offen: number } }): React.JSX.Element {
  const summe = Math.max(1, s.fertig + s.begonnen + s.offen)
  return (
    <Tooltip label={`fertig ${s.fertig} · begonnen ${s.begonnen} · offen ${s.offen}`}>
      <Progress.Root size="md" radius="xl" style={{ flex: 1, gap: 2, minWidth: 32 }}>
        <Progress.Section value={(s.fertig / summe) * 100} color="teal" />
        <Progress.Section value={(s.begonnen / summe) * 100} color="yellow" />
        <Progress.Section value={(s.offen / summe) * 100} color="gray.4" />
      </Progress.Root>
    </Tooltip>
  )
}

/** Überthemen des laufenden Schuljahres: Neuestes oben (Oberstufe: späteres Halbjahr oben), „Weitere" zuletzt */
export function themenDiesesJahr(themen: ThemaGruppe[], schuljahr: number): ThemaGruppe[] {
  const neu = (t: ThemaGruppe): number => Math.max(0, ...t.materialien.map((m) => ms(m.erstellt)))
  const weitere = (t: ThemaGruppe): number => (t.schluessel === 'weitere' ? 1 : 0)
  return themen
    .filter((t) => t.schuljahr === schuljahr)
    .sort((a, b) => weitere(a) - weitere(b) || (b.semester ?? '').localeCompare(a.semester ?? '') || neu(b) - neu(a))
}

export function FachLernstand({
  gruppeId,
  fach,
  reihen,
  blaetter,
  tests,
  lernende,
  kopf,
  material,
  zuReihen,
  reiheErstellen,
  blattErstellen,
  oeffnen
}: {
  /** Material öffnen (eigenes: alles; Mitlehrkraft: Arbeitsblätter nur ansehen) */
  oeffnen?: (art: Art, id: string) => void
  gruppeId: string
  fach: string
  reihen: ReiheKurz[]
  blaetter: BlattKurz[]
  tests: TestKurz[]
  lernende: number
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
  const [daten, setDaten] = useState<ThemenAntwort | null>(null)
  const laden = useCallback(() => {
    void holen<ThemenAntwort>(`/server/themen/${encodeURIComponent(gruppeId)}`).then(setDaten, () => setDaten({ themen: [], kandidaten: [], schuljahr: 0 }))
  }, [gruppeId])
  // Neu laden, wenn sich das Material ändert (Freigabe, Beenden …)
  const merkmal = `${reihen.length}|${blaetter.length}|${tests.length}`
  useEffect(laden, [laden, merkmal])
  const themen = useMemo(() => (daten ? themenDiesesJahr(daten.themen, daten.schuljahr) : []), [daten])
  const [auf, setAuf] = useState<Record<string, boolean>>({})
  const [bearbeiten, setBearbeiten] = useState<{ schluessel: string; name: string } | null>(null)
  const standDaten = { reihen, blaetter, tests, lernende }
  const umbenennen = (schluessel: string, name: string): void => {
    setBearbeiten(null)
    void senden(`/server/themen/${encodeURIComponent(gruppeId)}/umbenennen`, { schluessel, name }).then(laden, (e: unknown) => notifyError(e))
  }
  const umhaengen = (material: string, schluessel: string): void =>
    void senden(`/server/themen/${encodeURIComponent(gruppeId)}/zuordnen`, { material, schluessel }).then(laden, (e: unknown) => notifyError(e))
  const farbe = useFachFarbe(fach) ?? 'var(--mantine-color-blue-6)'

  // Zeitleiste: Reihen und Blätter (eigene und die der Mitlehrkräfte), Geplantes zuerst, dann Neuestes oben
  const thema = new Map<string, string>()
  for (const t of daten?.themen ?? []) for (const m of t.materialien) thema.set(m.schluessel, t.name)
  const zeitleiste = [
    ...reihen.filter((r) => r.status === 'offen').map((r) => ({ art: 'reihe' as Art, id: r.zid, titel: r.titel, zeit: ms(r.erstellt), geplantAb: r.geplantAb ?? null, info: `${r.schritte} Schritte`, von: '' })),
    ...blaetter
      .filter((b) => b.status === 'offen')
      .map((b) => ({
        art: 'blatt' as Art,
        id: b.id,
        titel: b.titel,
        zeit: ms(b.erstellt),
        geplantAb: b.geplantAb ?? null,
        info: b.bis ? (b.bis < jetzt ? `Frist vorbei (${tag(b.bis)})` : `bis ${tag(b.bis)}`) : '',
        von: ''
      })),
    ...(daten?.themen ?? []).flatMap((t) =>
      t.materialien
        .filter((m) => m.von !== undefined && (m.art === 'blatt' || m.art === 'reihe') && m.status === 'offen')
        .map((m) => ({ art: m.art, id: m.id, titel: m.titel, zeit: ms(m.erstellt), geplantAb: null as number | null, info: '', von: m.von || 'Kollegin/Kollege' }))
    )
  ].sort((a, b) => Number(geplant(b, jetzt)) - Number(geplant(a, jetzt)) || b.zeit - a.zeit)

  return (
    <SimpleGrid cols={material ? { base: 1, sm: 2 } : { base: 1, sm: 2, lg: 3 }} spacing="md" data-fach-lernstand>
      <style>{`
        @media (max-width: 700px) {
          [data-fach-lernstand] > .mantine-Card-root { --card-padding: 10px !important; padding: 10px; }
        }
        .fz-leiste { position: relative; padding-left: 18px; }
        .fz-leiste::before { content: ''; position: absolute; left: 5px; top: 6px; bottom: 6px; width: 2px; background: var(--mantine-color-default-border); border-radius: 1px; }
        .fz-punkt { position: absolute; left: -18px; top: 6px; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--mantine-color-body); }
        .fz-eintrag { position: relative; display: block; width: 100%; text-align: left; padding: 2px 6px 6px; border-radius: 8px; }
        .fz-eintrag:hover { background: var(--mantine-color-default-hover); }
        .fz-eintrag[data-geplant] .fz-punkt { background: transparent !important; border: 2px dashed var(--fz-farbe); }
      `}</style>
      {kopf}
      <Card withBorder radius="md" padding="md" h="100%" data-fach-lernstand-kasten>
        <Group justify="space-between" mb="xs">
          <Text fw={700}>Lernstand in Reihen & Blättern</Text>
          <Text size="xs" c="dimmed">
            nach Überthemen
          </Text>
        </Group>
        {themen.length ? (
          <Stack gap={6} data-ueberthemen>
            {themen.map((t, i) => {
              const offen = auf[t.schluessel] ?? i === 0
              const staende = t.materialien
                .map((m) => standVon(m, standDaten) ?? daten?.fremdStand?.[m.schluessel] ?? null)
                .filter((s): s is NonNullable<typeof s> => Boolean(s))
              const summe = staende.reduce((a, s) => ({ fertig: a.fertig + s.fertig, begonnen: a.begonnen + s.begonnen, offen: a.offen + s.offen }), {
                fertig: 0,
                begonnen: 0,
                offen: 0
              })
              const bearbeitet = bearbeiten?.schluessel === t.schluessel
              return (
                <div key={t.schluessel} data-ueberthema={t.original}>
                  <Group gap={4} wrap="nowrap">
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      onClick={() => setAuf((a) => ({ ...a, [t.schluessel]: !offen }))}
                      aria-label={offen ? 'Zuklappen' : 'Aufklappen'}
                    >
                      {offen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                    </ActionIcon>
                    {t.semester && (
                      <Badge size="xs" variant="light" style={{ flexShrink: 0 }} data-semester={t.semester}>
                        {t.semester}
                      </Badge>
                    )}
                    {bearbeitet ? (
                      <TextInput
                        size="xs"
                        autoFocus
                        style={{ flex: 1 }}
                        value={bearbeiten.name}
                        placeholder={t.original}
                        onChange={(e) => setBearbeiten({ schluessel: t.schluessel, name: e.currentTarget.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') umbenennen(t.schluessel, bearbeiten.name)
                          if (e.key === 'Escape') setBearbeiten(null)
                        }}
                        onBlur={() => umbenennen(t.schluessel, bearbeiten.name)}
                        data-ueberthema-name-feld
                      />
                    ) : (
                      <UnstyledButton onClick={() => setAuf((a) => ({ ...a, [t.schluessel]: !offen }))} style={{ minWidth: 0, flex: 1 }}>
                        <Text size="sm" fw={600} truncate title={t.umbenannt ? `${t.name} (im Lehrplan: ${t.original})` : t.name} data-ueberthema-name>
                          {t.name}
                        </Text>
                      </UnstyledButton>
                    )}
                    {!bearbeitet && t.schluessel !== 'weitere' && (
                      <Tooltip label="Umbenennen (nur für diese Lerngruppe; leer = Name aus dem Lehrplan)">
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="sm"
                          onClick={() => setBearbeiten({ schluessel: t.schluessel, name: t.name })}
                          data-ueberthema-stift
                          aria-label="Überthema umbenennen"
                        >
                          <IconPencil size={14} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                  {staende.length > 0 && (
                    <Group gap={6} wrap="nowrap" pl={28} mt={2}>
                      <Balken s={summe} />
                      <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                        {t.materialien.length} {t.materialien.length === 1 ? 'Material' : 'Materialien'}
                      </Text>
                    </Group>
                  )}
                  {offen && (
                    <Stack gap={6} pl={28} mt={6} data-ueberthema-materialien>
                      {t.materialien.map((m) => {
                        const s = standVon(m, standDaten) ?? daten?.fremdStand?.[m.schluessel] ?? null
                        const klickbar = oeffnen && (m.von === undefined ? m.art !== 'tafel' : m.art === 'blatt')
                        return (
                          <div key={m.schluessel} data-thema-material={m.schluessel}>
                            <Group justify="space-between" wrap="nowrap" gap={4}>
                              <Text
                                size="xs"
                                truncate
                                title={m.titel}
                                style={{ minWidth: 0, cursor: klickbar ? 'pointer' : undefined }}
                                onClick={klickbar ? () => oeffnen(m.art, m.id) : undefined}
                                data-thema-material-oeffnen={klickbar ? '' : undefined}
                              >
                                <Text span c={ART_FARBE[m.art]} fw={700}>
                                  {ART_NAME[m.art]}
                                </Text>{' '}
                                {m.titel}
                                {m.modul ? <Text span c="dimmed"> · {m.modul}</Text> : null}
                                {m.von !== undefined ? <Text span c="dimmed"> · von {m.von || 'Kollegin/Kollege'}</Text> : null}
                              </Text>
                              <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
                                {s && (
                                  <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                                    {s.text}
                                  </Text>
                                )}
                                {m.von === undefined && daten && (
                                  <Menu position="bottom-end" withinPortal>
                                    <Menu.Target>
                                      <ActionIcon variant="subtle" color="gray" size="xs" aria-label="Anderem Überthema zuordnen" data-umhaengen>
                                        <IconDots size={12} />
                                      </ActionIcon>
                                    </Menu.Target>
                                    <Menu.Dropdown mah={320} style={{ overflowY: 'auto' }}>
                                      <Menu.Label>Zuordnen zu …</Menu.Label>
                                      {daten.kandidaten.map((k) => (
                                        <Menu.Item key={k.schluessel} onClick={() => umhaengen(m.schluessel, k.schluessel)} data-umhaengen-ziel={k.name}>
                                          {k.semester ? `${k.semester} · ` : ''}
                                          {k.name}
                                        </Menu.Item>
                                      ))}
                                      <Menu.Item onClick={() => umhaengen(m.schluessel, 'weitere')}>Weitere Materialien</Menu.Item>
                                      {m.vonHand && (
                                        <>
                                          <Menu.Divider />
                                          <Menu.Item onClick={() => umhaengen(m.schluessel, '')}>Automatisch zuordnen</Menu.Item>
                                        </>
                                      )}
                                    </Menu.Dropdown>
                                  </Menu>
                                )}
                              </Group>
                            </Group>
                            {s && (
                              <Group mt={2}>
                                <Balken s={s} />
                              </Group>
                            )}
                          </div>
                        )
                      })}
                    </Stack>
                  )}
                </div>
              )
            })}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed" data-lernstand-leer>
            {daten ? 'Noch kein Material in diesem Schuljahr – der Lernstand erscheint, sobald etwas freigeschaltet ist.' : 'Lädt …'}
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
        {zeitleiste.length ? (
          <div className="fz-leiste" data-zeitleiste style={{ ['--fz-farbe' as string]: farbe }}>
            {zeitleiste.slice(0, 8).map((e) => {
              const istGeplant = geplant(e, jetzt)
              const themaName = thema.get(`${e.art}:${e.id}`)
              return (
                <UnstyledButton key={`${e.art}-${e.id}`} className="fz-eintrag" onClick={zuReihen} data-fach-eintrag={e.art} {...(istGeplant ? { 'data-geplant': true } : {})}>
                  <span className="fz-punkt" style={{ background: e.art === 'reihe' ? 'var(--mantine-color-grape-6)' : farbe }} />
                  <Group justify="space-between" wrap="nowrap" gap="xs">
                    <Text size="sm" fw={700} truncate>
                      {e.titel}
                    </Text>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                      {tag(e.zeit)}
                    </Text>
                  </Group>
                  <Group gap={6} wrap="nowrap">
                    <Badge size="xs" variant="light" color={ART_FARBE[e.art]} style={{ flexShrink: 0 }}>
                      {ART_NAME[e.art]}
                    </Badge>
                    {istGeplant ? (
                      <Badge size="xs" variant="outline" color="gray" style={{ flexShrink: 0 }}>
                        geplant ab {tag(e.geplantAb!)}
                      </Badge>
                    ) : e.info ? (
                      <Text size="xs" c={e.info.startsWith('Frist vorbei') ? 'orange' : 'dimmed'} style={{ whiteSpace: 'nowrap' }}>
                        {e.info}
                      </Text>
                    ) : null}
                    <Text size="xs" c="dimmed" truncate>
                      {[themaName, e.von ? `von ${e.von}` : ''].filter(Boolean).join(' · ')}
                    </Text>
                  </Group>
                </UnstyledButton>
              )
            })}
            {zeitleiste.length > 8 && (
              <Text size="xs" c="dimmed" pl={6}>
                und {zeitleiste.length - 8} weitere
              </Text>
            )}
          </div>
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
