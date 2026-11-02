/**
 * „Test planen" (02.11.2026, Wunsch der Lehrkraft): Knopf rechts neben „Als Schüler ansehen" auf der Kursseite
 * (Sprachenlernen) und in „Meine Klassen". Er ersetzt den Kasten „Zeitraum und Test" der Kurseinstellungen.
 *
 *  - Sprachfach mit Kurs (`KursTestFenster`): Testtermin und Inhalt – Vokabelabschnitte und Grammatik, gegliedert nach
 *    Band › Unit (testPlanGliederung.ts), damit „Station 1" aus Green Line 5 und 6 auseinanderzuhalten ist. Gespeichert
 *    wie bisher am Kurs (POST /server/vokabeln/<id>/termin): Die gewählten Abschnitte haben beim Üben Vorrang
 *    (shared/uebungsVorrang.ts) und bilden in den 3 Tagen vor dem Test die Runde der Lernenden.
 *  - Andere Fächer (`FachTestFenster`, server/testplaene.ts): Thema, Buchseiten (optional mit Abschnitten der Seiten) und
 *    Material der Lerngruppe – ganzes Blatt/ganze Reihe oder einzelne Aufgaben/Schritte. Mehrere Tests je Lerngruppe.
 */
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Checkbox,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import { IconCalendarEvent, IconChevronDown, IconChevronRight, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { testPlanKurz, type TestPlan, type TestPlanMaterial, type TestPlanMaterialQuelle, type TestPlanSeite } from '@shared/testPlan'
import { useProgrammFarbe } from '../../../shared/components/AppKopf'
import { BandGruppe } from '../../../shared/components/BandCover'
import KalenderHinweis from '../../../shared/components/KalenderHinweis'
import { notifyError, notifySuccess } from '../../../shared/util'
import { holen, senden } from '../../onlinetest/serverApi'
import { alsFeld, ausFeld } from './kursDaten'
import type { TestAbschnitteDaten } from './TestAbschnitte'
import {
  anfangsAuswahl,
  auswahlZahlen,
  bandSchluessel,
  testAuswahlGliedern,
  unitSchluessel,
  vorschlagKeys,
  type TestEintragDaten,
  type TestUnitGruppe
} from './testPlanGliederung'

const TAG = 86_400_000
const tagKurz = (ms: number): string => new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
const tagMonat = (ms: number): string => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
const kommend = (t: number | null | undefined): t is number => typeof t === 'number' && t >= Date.now() - TAG
const klein = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Ereignis nach dem Speichern – Kursseite und „Meine Klassen" laden neu */
export const TESTPLAN_GEAENDERT = 'schulapps:testplan-geaendert'
const gemeldet = (): void => void window.dispatchEvent(new Event(TESTPLAN_GEAENDERT))

// ============================================================================ Knopf

/**
 * Knopf „Test planen". Mit `kursId` (Kursseite) gleich das Fenster des Kurses; mit `gruppeId` („Meine Klassen") fragt er
 * den Server, ob die Lerngruppe einen Sprachkurs hat – dann dessen Fenster, sonst das Fenster für Thema/Seiten/Material.
 */
export function TestPlanenKnopf({
  kursId,
  termin,
  gruppeId,
  klasse,
  geaendert
}: {
  kursId?: string
  /** Bekannter Testtermin des Kurses (Kursseite) */
  termin?: number | null
  gruppeId?: string
  klasse?: string
  geaendert?: () => void
}): React.JSX.Element {
  const farbe = useProgrammFarbe()
  const [offen, setOffen] = useState(false)
  const [kopf, setKopf] = useState<{ kurs: { id: string; termin: number | null } | null; naechster: number | null } | null>(null)
  const laden = useCallback(() => {
    if (!gruppeId || kursId) return
    void holen<NonNullable<typeof kopf>>(`/server/testplaene/${encodeURIComponent(gruppeId)}/kopf`).then(setKopf, () => setKopf(null))
  }, [gruppeId, kursId])
  useEffect(laden, [laden])
  const kurs = kursId ?? kopf?.kurs?.id
  const datum = kursId ? termin : kopf?.kurs ? kopf.kurs.termin : kopf?.naechster
  const fertig = (): void => {
    laden()
    geaendert?.()
    gemeldet()
  }
  return (
    <>
      <Button
        variant="light"
        color={farbe}
        radius="xl"
        leftSection={<IconCalendarEvent size={16} />}
        rightSection={
          kommend(datum) ? (
            <Badge size="sm" variant="filled" color={farbe} radius="sm" data-test-planen-datum>
              {tagMonat(datum)}
            </Badge>
          ) : undefined
        }
        onClick={() => setOffen(true)}
        disabled={!kurs && !gruppeId}
        data-test-planen
      >
        Test planen
      </Button>
      {offen && kurs && <KursTestFenster kursId={kurs} titel={klasse} schliessen={() => setOffen(false)} fertig={fertig} />}
      {offen && !kurs && gruppeId && <FachTestFenster gruppeId={gruppeId} klasse={klasse} schliessen={() => setOffen(false)} fertig={fertig} />}
    </>
  )
}

// ============================================================================ Sprachfach: Kurstermin

interface KursTestDaten {
  id: string
  titel: string
  testTermin: number | null
  testAbschnitte: TestAbschnitteDaten
}

export function KursTestFenster({
  kursId,
  titel,
  schliessen,
  fertig
}: {
  kursId: string
  /** Klasse bzw. Kursname für den Fenstertitel – sonst der Titel des Kurses */
  titel?: string
  schliessen: () => void
  fertig: () => void
}): React.JSX.Element {
  const farbe = useProgrammFarbe()
  const [d, setD] = useState<KursTestDaten | null>(null)
  const [datum, setDatum] = useState('')
  const [keys, setKeys] = useState<Set<string>>(new Set())
  // Unverändert gelassener Vorschlag bleibt Vorschlag (der Server rechnet ihn bei neuen Freigaben weiter)
  const [vorschlag, setVorschlag] = useState(true)
  const [suche, setSuche] = useState('')
  const [zu, setZu] = useState<Record<string, boolean>>({})
  const [laeuft, setLaeuft] = useState(false)
  useEffect(() => {
    let aus = false
    void holen<KursTestDaten>(`/server/vokabeln/${encodeURIComponent(kursId)}/testplan`).then(
      (r) => {
        if (aus) return
        setD(r)
        setDatum(r.testTermin && r.testTermin >= Date.now() - TAG ? alsFeld(r.testTermin) : '')
        const a = anfangsAuswahl(r.testAbschnitte, r.testTermin)
        setKeys(new Set(a.keys))
        setVorschlag(a.vorschlag)
      },
      (e: unknown) => {
        notifyError(e)
        schliessen()
      }
    )
    return () => {
      aus = true
    }
  }, [kursId, schliessen])
  const eintraege = d?.testAbschnitte.eintraege ?? []
  const baende = useMemo(() => testAuswahlGliedern(eintraege), [eintraege])
  const s = klein(suche.trim())
  const passt = (e: TestEintragDaten, u: TestUnitGruppe, buch: string): boolean =>
    !s || [e.titel, e.name, e.station, u.unit, buch].some((x) => x && klein(x).includes(s))
  const zahlen = auswahlZahlen(eintraege, keys)
  const setze = (neu: Set<string>): void => {
    setKeys(neu)
    setVorschlag(false)
  }
  const umschalten = (liste: string[], an: boolean): void => {
    const neu = new Set(keys)
    for (const k of liste) {
      if (an) neu.add(k)
      else neu.delete(k)
    }
    setze(neu)
  }
  const altTermin = d?.testTermin ?? null
  const terminMs = ausFeld(datum, '08:00:00')
  const speichern = async (): Promise<void> => {
    if (!d) return
    setLaeuft(true)
    try {
      await senden(`/server/vokabeln/${encodeURIComponent(d.id)}/termin`, {
        testTermin: terminMs,
        // Vorschlag unverändert: null = Vorbelegung (bei vorbeigegangenem Termin rechnet der Server „seit dem letzten Test")
        testAbschnitte: vorschlag ? null : eintraege.map((e) => e.key).filter((k) => keys.has(k))
      })
      notifySuccess(terminMs ? `Test am ${tagKurz(terminMs)} geplant.` : 'Test gespeichert.')
      fertig()
      schliessen()
    } catch (e) {
      notifyError(e)
    } finally {
      setLaeuft(false)
    }
  }
  const entfernen = async (): Promise<void> => {
    if (!d) return
    setLaeuft(true)
    try {
      await senden(`/server/vokabeln/${encodeURIComponent(d.id)}/termin`, { testTermin: null })
      notifySuccess('Testtermin entfernt.')
      fertig()
      schliessen()
    } catch (e) {
      notifyError(e)
    } finally {
      setLaeuft(false)
    }
  }
  const unitOffen = (u: TestUnitGruppe, i: number): boolean => Boolean(s) || (zu[u.schluessel] ?? (i < 2 || unitSchluessel(u).some((k) => keys.has(k))))

  return (
    <Modal opened onClose={schliessen} title={<Text fw={700}>Test planen{titel || d ? ` – ${titel || d?.titel}` : ''}</Text>} size="xl" data-test-planen-fenster="kurs">
      {!d ? (
        <Center h={200}>
          <Loader />
        </Center>
      ) : (
        <Stack gap="md">
          <Group align="flex-start" gap="md" wrap="wrap">
            <div style={{ width: 230 }}>
              <TextInput
                type="date"
                label="Testtermin"
                description="Der Karteikasten plant bis dahin."
                leftSection={<IconCalendarEvent size={14} />}
                value={datum}
                onChange={(e) => setDatum(e.currentTarget.value)}
                data-vokabel-termin
              />
              <KalenderHinweis wert={datum} verschieben={(t) => setDatum(t)} />
            </div>
            <Text size="xs" c="dimmed" style={{ flex: 1, minWidth: 240 }} mt={26}>
              Was im Test drankommt, üben die Lernenden ab jetzt zuerst – mit so vielen neuen Wörtern je Tag, dass bis 3 Tage vor dem Test alles einmal dran
              war. In den 3 Tagen davor üben sie nur das.
              {vorschlag &&
                (d.testAbschnitte.letzter || (altTermin && altTermin < Date.now())
                  ? ` Vorgeschlagen: alles seit dem letzten Test (${tagMonat((altTermin && altTermin < Date.now() ? altTermin : d.testAbschnitte.letzter) ?? 0)}).`
                  : ' Vorgeschlagen: die zuletzt freigegebenen Abschnitte.')}
            </Text>
          </Group>

          {eintraege.length === 0 ? (
            <Text c="dimmed" size="sm">
              In diesem Kurs ist noch nichts freigegeben – der Termin lässt sich trotzdem setzen.
            </Text>
          ) : (
            <Stack gap="xs">
              <Group justify="space-between" gap="xs">
                <Text fw={700}>Was kommt dran?</Text>
                <Group gap="xs">
                  <TextInput
                    size="xs"
                    placeholder="Unit, Station oder Grammatik suchen"
                    leftSection={<IconSearch size={14} />}
                    value={suche}
                    onChange={(e) => setSuche(e.currentTarget.value)}
                    w={250}
                    data-test-planen-suche
                  />
                  {!vorschlag && (
                    <Anchor
                      component="button"
                      type="button"
                      size="xs"
                      onClick={() => {
                        setKeys(new Set(vorschlagKeys(d.testAbschnitte, altTermin)))
                        setVorschlag(true)
                      }}
                      data-test-planen-vorschlag
                    >
                      Vorschlag übernehmen
                    </Anchor>
                  )}
                  {keys.size > 0 && (
                    <Anchor component="button" type="button" size="xs" c="dimmed" onClick={() => setze(new Set())} data-test-planen-leeren>
                      Auswahl leeren
                    </Anchor>
                  )}
                </Group>
              </Group>
              <ScrollArea.Autosize mah="52vh" offsetScrollbars type="auto">
                <Stack gap="md" pr={4}>
                  {baende.map((b) => {
                    const alle = bandSchluessel(b)
                    const gewaehlt = alle.filter((k) => keys.has(k)).length
                    const units = b.units
                      .map((u) => ({ u, vok: u.vok.filter((e) => passt(e, u, b.buch)), gram: u.gram.filter((e) => passt(e, u, b.buch)) }))
                      .filter((x) => x.vok.length || x.gram.length)
                    if (!units.length) return null
                    return (
                      <BandGruppe
                        key={b.buch || '-'}
                        buch={b.buch}
                        ohneBand="Ohne Lehrwerk"
                        zusatz={gewaehlt ? `${gewaehlt} von ${alle.length} gewählt` : `${b.units.length} ${b.units.length === 1 ? 'Unit' : 'Units'}`}
                        data-test-band={b.buch || 'ohne'}
                      >
                        <Stack gap={6} mt={4}>
                          {units.map(({ u, vok, gram }, i) => {
                            const uk = unitSchluessel(u)
                            const n = uk.filter((k) => keys.has(k)).length
                            const offen = unitOffen(u, i)
                            const Pfeil = offen ? IconChevronDown : IconChevronRight
                            return (
                              <Paper key={u.schluessel} withBorder radius="md" p="xs" data-test-unit={u.unit || 'ohne'}>
                                <Group gap="xs" wrap="nowrap">
                                  <Checkbox
                                    color={farbe}
                                    checked={n > 0 && n === uk.length}
                                    indeterminate={n > 0 && n < uk.length}
                                    onChange={() => umschalten(uk, n < uk.length)}
                                    aria-label={`${u.unit || 'Ohne Unit'} ganz wählen`}
                                    data-test-unit-alle
                                  />
                                  <UnstyledButton onClick={() => setZu((z) => ({ ...z, [u.schluessel]: !offen }))} style={{ flex: 1 }}>
                                    <Group gap={6} wrap="nowrap">
                                      <Pfeil size={14} />
                                      <Text fw={600} size="sm">
                                        {u.unit || 'Ohne Unit'}
                                      </Text>
                                      <Text size="xs" c="dimmed">
                                        {[
                                          u.vok.length ? `${u.vok.length} ${u.vok.length === 1 ? 'Abschnitt' : 'Abschnitte'}` : '',
                                          u.gram.length ? `${u.gram.length} Grammatik` : '',
                                          n ? `${n} gewählt` : ''
                                        ]
                                          .filter(Boolean)
                                          .join(' · ')}
                                      </Text>
                                    </Group>
                                  </UnstyledButton>
                                </Group>
                                {offen && (
                                  <Group align="flex-start" gap="lg" mt={6} pl={28} wrap="wrap">
                                    {vok.length > 0 && (
                                      <Stack gap={4} style={{ flex: 1, minWidth: 200 }}>
                                        <Text size="xs" c="dimmed" fw={600}>
                                          Vokabeln
                                        </Text>
                                        {vok.map((e) => (
                                          <Checkbox
                                            key={e.key}
                                            size="xs"
                                            color={farbe}
                                            checked={keys.has(e.key)}
                                            onChange={() => umschalten([e.key], !keys.has(e.key))}
                                            label={
                                              <span>
                                                {e.name || e.titel}
                                                <Text span size="xs" c="dimmed">
                                                  {[e.anzahl ? ` · ${e.anzahl} Wörter` : '', e.zeit > Date.now() ? ' · geplant' : e.zeit ? ` · frei seit ${tagMonat(e.zeit)}` : ''].join('')}
                                                </Text>
                                              </span>
                                            }
                                            data-test-abschnitt={e.key}
                                          />
                                        ))}
                                      </Stack>
                                    )}
                                    {gram.length > 0 && (
                                      <Stack gap={4} style={{ flex: 1, minWidth: 200 }}>
                                        <Text size="xs" c="dimmed" fw={600}>
                                          Grammatik
                                        </Text>
                                        {gram.map((e) => (
                                          <Checkbox
                                            key={e.key}
                                            size="xs"
                                            color={farbe}
                                            checked={keys.has(e.key)}
                                            onChange={() => umschalten([e.key], !keys.has(e.key))}
                                            label={
                                              <span>
                                                {e.titel}
                                                {e.station && (
                                                  <Text span size="xs" c="dimmed">
                                                    {` · ${e.station}`}
                                                  </Text>
                                                )}
                                              </span>
                                            }
                                            data-test-abschnitt={e.key}
                                          />
                                        ))}
                                      </Stack>
                                    )}
                                  </Group>
                                )}
                              </Paper>
                            )
                          })}
                        </Stack>
                      </BandGruppe>
                    )
                  })}
                </Stack>
              </ScrollArea.Autosize>
            </Stack>
          )}

          <Group justify="space-between" gap="xs" pt="xs" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
            <Text size="sm" data-test-planen-zahlen>
              {zahlen.abschnitte || zahlen.grammatik
                ? [
                    zahlen.abschnitte ? `${zahlen.abschnitte} ${zahlen.abschnitte === 1 ? 'Abschnitt' : 'Abschnitte'} (${zahlen.woerter} Wörter)` : '',
                    zahlen.grammatik ? `${zahlen.grammatik} Grammatik${zahlen.grammatik === 1 ? 'thema' : 'themen'}` : ''
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : eintraege.length
                  ? 'Noch nichts gewählt'
                  : ''}
            </Text>
            <Group gap="xs">
              {kommend(altTermin) && (
                <Button variant="subtle" color="red" leftSection={<IconTrash size={14} />} onClick={() => void entfernen()} loading={laeuft} data-test-planen-entfernen>
                  Termin entfernen
                </Button>
              )}
              <Button variant="default" onClick={schliessen}>
                Abbrechen
              </Button>
              <Tooltip label="Erst ein Datum wählen" disabled={Boolean(terminMs)}>
                <Button color={farbe} onClick={() => void speichern()} loading={laeuft} disabled={!terminMs} data-test-planen-speichern>
                  Speichern
                </Button>
              </Tooltip>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}

// ============================================================================ Andere Fächer: Thema, Seiten, Material

interface Entwurf {
  id: string
  datum: string
  thema: string
  seiten: TestPlanSeite[]
  material: TestPlanMaterial[]
  notiz: string
}
const leer = (): Entwurf => ({ id: '', datum: '', thema: '', seiten: [{ seiten: '' }], material: [], notiz: '' })
const ausPlan = (p: TestPlan): Entwurf => ({
  id: p.id,
  datum: p.termin ? alsFeld(p.termin) : '',
  thema: p.thema,
  seiten: p.seiten.length ? p.seiten : [{ seiten: '' }],
  material: p.material,
  notiz: p.notiz ?? ''
})

export function FachTestFenster({
  gruppeId,
  klasse,
  schliessen,
  fertig
}: {
  gruppeId: string
  klasse?: string
  schliessen: () => void
  fertig: () => void
}): React.JSX.Element {
  const farbe = useProgrammFarbe()
  const [d, setD] = useState<{ plaene: TestPlan[]; material: TestPlanMaterialQuelle[] } | null>(null)
  const [e, setE] = useState<Entwurf>(leer())
  const [laeuft, setLaeuft] = useState(false)
  const laden = useCallback(
    (waehle?: string) =>
      void holen<{ plaene: TestPlan[]; material: TestPlanMaterialQuelle[] }>(`/server/testplaene/${encodeURIComponent(gruppeId)}`).then(
        (r) => {
          setD(r)
          const p = waehle ? r.plaene.find((x) => x.id === waehle) : r.plaene.find((x) => kommend(x.termin))
          setE(p ? ausPlan(p) : leer())
        },
        (err: unknown) => {
          notifyError(err)
          schliessen()
        }
      ),
    [gruppeId, schliessen]
  )
  useEffect(() => laden(), [laden])
  const terminMs = ausFeld(e.datum, '08:00:00')
  const aendern = (p: Partial<Entwurf>): void => setE((x) => ({ ...x, ...p }))
  const speichern = async (): Promise<void> => {
    setLaeuft(true)
    try {
      const r = await senden<{ plan: TestPlan }>(`/server/testplaene/${encodeURIComponent(gruppeId)}`, {
        ...(e.id ? { id: e.id } : {}),
        termin: terminMs,
        thema: e.thema,
        seiten: e.seiten,
        material: e.material,
        notiz: e.notiz
      })
      notifySuccess(terminMs ? `Test am ${tagKurz(terminMs)} geplant.` : 'Test gespeichert.')
      fertig()
      laden(r.plan.id)
    } catch (err) {
      notifyError(err)
    } finally {
      setLaeuft(false)
    }
  }
  const loeschen = async (): Promise<void> => {
    if (!e.id) return
    setLaeuft(true)
    try {
      await senden(`/server/testplaene/${encodeURIComponent(gruppeId)}/loeschen`, { id: e.id })
      notifySuccess('Geplanter Test gelöscht.')
      fertig()
      laden()
    } catch (err) {
      notifyError(err)
    } finally {
      setLaeuft(false)
    }
  }
  const inhaltDa = Boolean(e.thema.trim() || e.seiten.some((x) => x.seiten.trim()) || e.material.length)

  return (
    <Modal opened onClose={schliessen} title={<Text fw={700}>Test planen{klasse ? ` – ${klasse}` : ''}</Text>} size="xl" data-test-planen-fenster="fach">
      {!d ? (
        <Center h={200}>
          <Loader />
        </Center>
      ) : (
        <Stack gap="md">
          {/* Geplante Tests der Lerngruppe – Klick bearbeitet, „Neuer Test" legt einen weiteren an */}
          {d.plaene.length > 0 && (
            <Group gap="xs" data-test-plaene>
              {d.plaene.map((p) => (
                <Button
                  key={p.id}
                  size="compact-sm"
                  radius="xl"
                  variant={p.id === e.id ? 'filled' : 'light'}
                  color={kommend(p.termin) ? farbe : 'gray'}
                  onClick={() => setE(ausPlan(p))}
                  data-test-plan={p.id}
                >
                  {[p.termin ? tagKurz(p.termin) : 'ohne Datum', testPlanKurz(p)].filter(Boolean).join(' · ').slice(0, 60)}
                </Button>
              ))}
              <Button size="compact-sm" radius="xl" variant={e.id ? 'subtle' : 'outline'} leftSection={<IconPlus size={14} />} onClick={() => setE(leer())} data-test-plan-neu>
                Neuer Test
              </Button>
            </Group>
          )}

          <Group align="flex-start" gap="md" wrap="wrap">
            <div style={{ width: 230 }}>
              <TextInput
                type="date"
                label="Datum"
                leftSection={<IconCalendarEvent size={14} />}
                value={e.datum}
                onChange={(x) => aendern({ datum: x.currentTarget.value })}
                data-test-plan-datum
              />
              <KalenderHinweis wert={e.datum} verschieben={(t) => aendern({ datum: t })} />
            </div>
            <TextInput
              label="Thema"
              placeholder="z. B. Bruchrechnung – Addieren und Subtrahieren"
              value={e.thema}
              onChange={(x) => aendern({ thema: x.currentTarget.value })}
              style={{ flex: 1, minWidth: 260 }}
              data-test-plan-thema
            />
          </Group>

          <Card withBorder radius="md" padding="sm">
            <Text fw={700} size="sm" mb={4}>
              Buchseiten
            </Text>
            <Stack gap={6}>
              {e.seiten.map((s, i) => (
                <Group key={i} gap="xs" wrap="nowrap" data-test-plan-seite={i}>
                  <TextInput
                    size="xs"
                    placeholder="S. 34–36"
                    aria-label="Seiten"
                    value={s.seiten}
                    onChange={(x) => aendern({ seiten: e.seiten.map((y, j) => (j === i ? { ...y, seiten: x.currentTarget.value } : y)) })}
                    w={120}
                    data-test-plan-seiten
                  />
                  <TextInput
                    size="xs"
                    placeholder="optional: Abschnitte, z. B. Aufgabe 2–4, Merkkasten, Text „Die Römer“"
                    aria-label="Abschnitte der Seiten"
                    value={s.abschnitte ?? ''}
                    onChange={(x) => aendern({ seiten: e.seiten.map((y, j) => (j === i ? { ...y, abschnitte: x.currentTarget.value } : y)) })}
                    style={{ flex: 1 }}
                    data-test-plan-abschnitte
                  />
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label="Zeile entfernen"
                    onClick={() => aendern({ seiten: e.seiten.length > 1 ? e.seiten.filter((_, j) => j !== i) : [{ seiten: '' }] })}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              ))}
              <Anchor component="button" type="button" size="xs" onClick={() => aendern({ seiten: [...e.seiten, { seiten: '' }] })} w="fit-content" data-test-plan-seite-neu>
                + weitere Seiten
              </Anchor>
            </Stack>
          </Card>

          <MaterialWahl quellen={d.material} wahl={e.material} setze={(material) => aendern({ material })} />

          <Textarea
            label="Hinweise (optional)"
            placeholder="z. B. Taschenrechner erlaubt, Formelsammlung mitbringen"
            autosize
            minRows={1}
            maxRows={4}
            value={e.notiz}
            onChange={(x) => aendern({ notiz: x.currentTarget.value })}
            data-test-plan-notiz
          />

          <Group justify="space-between" gap="xs" pt="xs" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
            <Text size="sm" c="dimmed" data-test-plan-kurz>
              {testPlanKurz({ thema: e.thema, seiten: e.seiten, material: e.material }) || 'Thema, Seiten oder Material eintragen'}
            </Text>
            <Group gap="xs">
              {e.id && (
                <Button variant="subtle" color="red" leftSection={<IconTrash size={14} />} onClick={() => void loeschen()} loading={laeuft} data-test-plan-loeschen>
                  Löschen
                </Button>
              )}
              <Button variant="default" onClick={schliessen}>
                Schließen
              </Button>
              <Tooltip label={!terminMs ? 'Erst ein Datum wählen' : 'Thema, Seiten oder Material eintragen'} disabled={Boolean(terminMs && inhaltDa)}>
                <Button color={farbe} onClick={() => void speichern()} loading={laeuft} disabled={!terminMs || !inhaltDa} data-test-plan-speichern>
                  Speichern
                </Button>
              </Tooltip>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}

/**
 * Material der Lerngruppe (Arbeitsblätter, Reihen): Haken am Material = ganz; aufgeklappt einzelne Aufgaben/Schritte –
 * sind alle gewählt, gilt wieder das Ganze.
 */
function MaterialWahl({
  quellen,
  wahl,
  setze
}: {
  quellen: TestPlanMaterialQuelle[]
  wahl: TestPlanMaterial[]
  setze: (m: TestPlanMaterial[]) => void
}): React.JSX.Element {
  const [art, setArt] = useState<'alle' | 'blatt' | 'reihe'>('alle')
  const [suche, setSuche] = useState('')
  const [auf, setAuf] = useState<Record<string, boolean>>({})
  const s = klein(suche.trim())
  const sichtbar = quellen.filter(
    (q) => (art === 'alle' || q.art === art) && (!s || klein(q.titel).includes(s) || q.teile.some((t) => klein(`${t.titel} ${t.text}`).includes(s)))
  )
  const schl = (q: Pick<TestPlanMaterialQuelle, 'art' | 'id'>): string => `${q.art}:${q.id}`
  const gewaehlt = new Map(wahl.map((m) => [schl(m), m]))
  const setzeFuer = (q: TestPlanMaterialQuelle, teile: string[] | 'ganz' | null): void => {
    const rest = wahl.filter((m) => schl(m) !== schl(q))
    if (teile === null || (Array.isArray(teile) && !teile.length)) return setze(rest)
    const ganz = teile === 'ganz' || (q.teile.length > 0 && teile.length === q.teile.length)
    setze([
      ...rest,
      {
        art: q.art,
        id: q.id,
        titel: q.titel,
        ...(ganz ? {} : { teile: q.teile.filter((t) => (teile as string[]).includes(t.key)).map((t) => ({ key: t.key, titel: t.text ? `${t.titel}: ${t.text}` : t.titel })) })
      }
    ])
  }
  const gewaehltIn = wahl.filter((m) => quellen.some((q) => schl(q) === schl(m)))
  return (
    <Card withBorder radius="md" padding="sm" data-test-plan-material>
      <Group justify="space-between" gap="xs" mb={6}>
        <Text fw={700} size="sm">
          Aus Arbeitsblättern und Reihen der Klasse
          {gewaehltIn.length > 0 && (
            <Text span size="xs" c="dimmed" fw={400}>
              {` · ${gewaehltIn.length} gewählt`}
            </Text>
          )}
        </Text>
        {quellen.length > 0 && (
          <Group gap="xs">
            <SegmentedControl
              size="xs"
              value={art}
              onChange={(v) => setArt(v as typeof art)}
              data={[
                { value: 'alle', label: 'Alle' },
                { value: 'blatt', label: 'Arbeitsblätter' },
                { value: 'reihe', label: 'Reihen' }
              ]}
            />
            <TextInput size="xs" placeholder="Suchen" leftSection={<IconSearch size={14} />} value={suche} onChange={(x) => setSuche(x.currentTarget.value)} w={170} />
          </Group>
        )}
      </Group>
      {quellen.length === 0 ? (
        <Text size="sm" c="dimmed">
          Für diese Klasse ist noch kein Arbeitsblatt und keine Reihe freigegeben.
        </Text>
      ) : (
        <ScrollArea.Autosize mah="34vh" offsetScrollbars type="auto">
          <Stack gap={4}>
            {sichtbar.length === 0 && (
              <Text size="sm" c="dimmed">
                Nichts gefunden.
              </Text>
            )}
            {sichtbar.map((q) => {
              const m = gewaehlt.get(schl(q))
              const teilWahl = new Set(m?.teile?.map((t) => t.key) ?? [])
              const ganz = Boolean(m && !m.teile)
              const offen = auf[schl(q)] ?? Boolean(m?.teile)
              const Pfeil = offen ? IconChevronDown : IconChevronRight
              return (
                <Paper key={schl(q)} withBorder={Boolean(m)} radius="sm" px="xs" py={4} bg={m ? 'var(--mantine-color-default-hover)' : undefined} data-test-plan-quelle={schl(q)}>
                  <Group gap="xs" wrap="nowrap">
                    <Checkbox
                      checked={ganz}
                      indeterminate={Boolean(m?.teile)}
                      onChange={() => setzeFuer(q, ganz || m?.teile ? null : 'ganz')}
                      aria-label={`${q.titel} wählen`}
                      data-test-plan-ganz
                    />
                    <UnstyledButton onClick={() => q.teile.length && setAuf((a) => ({ ...a, [schl(q)]: !offen }))} style={{ flex: 1, minWidth: 0 }}>
                      <Group gap={6} wrap="nowrap">
                        {q.teile.length > 0 && <Pfeil size={14} style={{ flexShrink: 0 }} />}
                        <Badge size="xs" variant="light" color={q.art === 'reihe' ? 'grape' : 'blue'} style={{ flexShrink: 0 }}>
                          {q.art === 'reihe' ? 'Reihe' : 'Blatt'}
                        </Badge>
                        <Text size="sm" truncate>
                          {q.titel}
                        </Text>
                        <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                          {m?.teile ? `${m.teile.length} von ${q.teile.length} ${q.art === 'reihe' ? 'Schritten' : 'Aufgaben'}` : q.zeit ? tagMonat(q.zeit) : ''}
                        </Text>
                      </Group>
                    </UnstyledButton>
                  </Group>
                  {offen && q.teile.length > 0 && (
                    <Stack gap={2} pl={36} py={4}>
                      {q.teile.map((t, i) => {
                        const an = ganz || teilWahl.has(t.key)
                        const gruppeNeu = t.gruppe && t.gruppe !== q.teile[i - 1]?.gruppe
                        return (
                          <div key={t.key}>
                            {gruppeNeu && (
                              <Text size="xs" c="dimmed" fw={600} mt={i ? 4 : 0}>
                                {t.gruppe}
                              </Text>
                            )}
                            <Checkbox
                              size="xs"
                              checked={an}
                              onChange={() => {
                                const basis = ganz ? q.teile.map((x) => x.key) : [...teilWahl]
                                setzeFuer(q, an ? basis.filter((k) => k !== t.key) : [...basis, t.key])
                              }}
                              label={
                                <span>
                                  <b>{t.titel}</b>
                                  {t.text ? ` – ${t.text}` : ''}
                                </span>
                              }
                              data-test-plan-teil={t.key}
                            />
                          </div>
                        )
                      })}
                    </Stack>
                  )}
                </Paper>
              )
            })}
          </Stack>
        </ScrollArea.Autosize>
      )}
    </Card>
  )
}
