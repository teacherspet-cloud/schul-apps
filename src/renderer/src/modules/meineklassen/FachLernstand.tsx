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
import { ActionIcon, Badge, Button, Card, Group, Menu, SimpleGrid, Stack, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core'
import { IconChalkboard, IconChecklist, IconChevronDown, IconChevronRight, IconDots, IconFileText, IconMessage, IconPencil, IconPlus, IconRoute } from '@tabler/icons-react'
import { FortschrittsRing } from '../../shared/components/diagramme'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError } from '../../shared/util'
import { useFachFarbe } from '../../shared/components/FachFarbe'
import { MitlehrkraefteKnopf } from './MitlehrkraefteKnopf'

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
  /** Arbeitsblatt: eingeholte Rückmeldungen (Feedback außerhalb der App) */
  rueckmeldungen?: number
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
const ART_SYMBOL: Record<Art, typeof IconFileText> = { blatt: IconFileText, reihe: IconRoute, test: IconChecklist, rueckmeldung: IconMessage, tafel: IconChalkboard }
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
        .fz-thema { padding: 6px 4px 6px 2px; border-radius: 10px; }
        .fz-thema[data-offen] { background: var(--mantine-color-default-hover); }
        .fz-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 0 2px 42px; }
        .fz-chip { display: inline-flex; align-items: center; gap: 2px; max-width: 100%; border: 1px solid var(--mantine-color-default-border);
          border-radius: 999px; background: var(--mantine-color-body); padding-right: 2px; }
        .fz-chip[data-fremd] { border-style: dashed; }
        .fz-chip-knopf { display: inline-flex; align-items: center; gap: 5px; min-width: 0; padding: 3px 4px 3px 9px; font-size: 12px; border-radius: 999px; }
        .fz-chip-knopf:hover { text-decoration: underline; }
        .fz-chip-titel { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px; }
        .fz-chip-stand { font-size: 11px; opacity: .75; white-space: nowrap; font-variant-numeric: tabular-nums; }
      `}</style>
      {kopf}
      <Card withBorder radius="md" padding="md" h="100%" data-fach-lernstand-kasten>
        <Group justify="space-between" mb="xs">
          <Text fw={700}>Lernstand in Reihen & Blättern</Text>
          <Group gap={6}>
            <Text size="xs" c="dimmed">
              nach Überthemen
            </Text>
            {/* Mitlehrkräfte nur per Einladung (23.10.2026) */}
            <MitlehrkraefteKnopf gruppeId={gruppeId} />
          </Group>
        </Group>
        {themen.length ? (
          <Stack gap={10} data-ueberthemen>
            {themen.map((t, i) => {
              const offen = auf[t.schluessel] ?? i === 0
              const staende = t.materialien
                .map((m) => standVon(m, standDaten) ?? daten?.fremdStand?.[m.schluessel] ?? null)
                .filter((s): s is NonNullable<typeof s> => Boolean(s))
              const von = staende.reduce((a, s) => a + s.von, 0)
              const fertig = staende.reduce((a, s) => a + s.fertig, 0)
              const anteil = von ? fertig / von : null
              const bearbeitet = bearbeiten?.schluessel === t.schluessel
              const umschalten = (): void => setAuf((a) => ({ ...a, [t.schluessel]: !offen }))
              return (
                <div key={t.schluessel} className="fz-thema" data-ueberthema={t.original} data-offen={offen || undefined}>
                  <Group gap={8} wrap="nowrap" align="center">
                    {/* Ring (19.10.2026, gewählte Darstellung): Anteil erledigt über alle Materialien des Themas */}
                    <div style={{ flexShrink: 0, opacity: anteil === null ? 0.35 : 1 }} title={anteil === null ? 'noch kein Stand' : `${fertig} von ${von} erledigt`}>
                      <FortschrittsRing anteil={anteil ?? 0} titel={t.name} groesse={34} farbe={farbe} ampel={false} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      {bearbeitet ? (
                        <TextInput
                          size="xs"
                          autoFocus
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
                        <UnstyledButton onClick={umschalten} style={{ display: 'block', width: '100%', minWidth: 0 }}>
                          <Group gap={6} wrap="nowrap">
                            {t.semester && (
                              <Badge size="xs" variant="light" style={{ flexShrink: 0 }} data-semester={t.semester}>
                                {t.semester}
                              </Badge>
                            )}
                            <Text size="sm" fw={700} truncate title={t.umbenannt ? `${t.name} (im Lehrplan: ${t.original})` : t.name} data-ueberthema-name>
                              {t.name}
                            </Text>
                          </Group>
                          <Text size="xs" c="dimmed">
                            {t.materialien.length} {t.materialien.length === 1 ? 'Material' : 'Materialien'}
                            {anteil !== null ? ` · ${Math.round(anteil * 100)} % erledigt` : ''}
                          </Text>
                        </UnstyledButton>
                      )}
                    </div>
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
                    <ActionIcon variant="subtle" color="gray" size="sm" onClick={umschalten} aria-label={offen ? 'Zuklappen' : 'Aufklappen'}>
                      {offen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                    </ActionIcon>
                  </Group>
                  {offen && (
                    <div className="fz-chips" data-ueberthema-materialien>
                      {t.materialien.map((m) => {
                        const s = standVon(m, standDaten) ?? daten?.fremdStand?.[m.schluessel] ?? null
                        const klickbar = Boolean(oeffnen) && (m.von === undefined ? m.art !== 'tafel' : m.art === 'blatt')
                        const Symbol = ART_SYMBOL[m.art]
                        const hinweis = [
                          `${ART_NAME[m.art]}: ${m.titel}`,
                          m.modul ? `Modul: ${m.modul}` : '',
                          s ? s.text : '',
                          m.rueckmeldungen ? `${m.rueckmeldungen} Rückmeldung${m.rueckmeldungen === 1 ? '' : 'en'} eingeholt` : '',
                          m.von !== undefined ? `von ${m.von || 'Kollegin/Kollege'} (nur ansehen)` : ''
                        ]
                          .filter(Boolean)
                          .join('\n')
                        return (
                          <span key={m.schluessel} className="fz-chip" data-thema-material={m.schluessel} data-fremd={m.von !== undefined || undefined}>
                            <UnstyledButton
                              className="fz-chip-knopf"
                              onClick={klickbar ? () => oeffnen?.(m.art, m.id) : undefined}
                              title={hinweis}
                              style={{ cursor: klickbar ? 'pointer' : 'default' }}
                              data-thema-material-oeffnen={klickbar ? '' : undefined}
                            >
                              <Symbol size={13} color={`var(--mantine-color-${ART_FARBE[m.art]}-6)`} style={{ flexShrink: 0 }} />
                              <span className="fz-chip-titel">{m.titel}</span>
                              {s && (
                                <span className="fz-chip-stand" style={{ color: s.fertig >= s.von && s.von ? 'var(--mantine-color-teal-6)' : undefined }}>
                                  {s.fertig}/{s.von}
                                </span>
                              )}
                              {m.rueckmeldungen ? (
                                <span className="fz-chip-stand">
                                  · {m.rueckmeldungen} <IconMessage size={11} style={{ verticalAlign: '-1px' }} />
                                </span>
                              ) : null}
                              {m.von !== undefined && <span className="fz-chip-stand">· {m.von ? m.von.split(' ')[0] : 'Koll.'}</span>}
                            </UnstyledButton>
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
                          </span>
                        )
                      })}
                    </div>
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
                <UnstyledButton
                  key={`${e.art}-${e.id}`}
                  className="fz-eintrag"
                  // Öffnet das Blatt bzw. die Reihe selbst (19.10.2026, Befund: der Klick führte nur zum Reiter darunter)
                  onClick={() => (oeffnen && (!e.von || e.art === 'blatt') ? oeffnen(e.art, e.id) : zuReihen())}
                  data-fach-eintrag={e.art}
                  {...(istGeplant ? { 'data-geplant': true } : {})}
                >
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
