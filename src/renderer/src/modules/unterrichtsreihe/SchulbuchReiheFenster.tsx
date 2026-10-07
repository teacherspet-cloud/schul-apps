/**
 * Fenster „Reihe aus Schulbuch" (06.10.2026, reiheAusSchulbuch.ts): Seiten hochladen (mehrere auf einmal, Erkennung je
 * Seite) → Umfang (Wochen × Wochenstunden × 0,85 oder Stunden direkt, KI-Schätzung als Spanne) → Planung durch die KI
 * → Vorschau mit Begründungen, Übernahme je Abschnitt (Standard: verweisen), Seitenzähler und Hinweis zum Gesamtvertrag.
 */
import { extractContent, MATERIAL_ACCEPT } from '../../shared/files/extractContent'
import DropZone from '../../shared/components/DropZone'
import { pruefeHochladen } from '../../shared/datenschutz'
import { erkenneSchulbuch } from '../../shared/schulbuch/schulbuch'
import {
  Alert,
  Autocomplete,
  Badge,
  Button,
  Card,
  Checkbox,
  CloseButton,
  Collapse,
  Group,
  Image,
  Modal,
  NumberInput,
  ScrollArea,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Tooltip
} from '@mantine/core'
import { IconAlertTriangle, IconBook, IconSparkles } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { SCHRITT_ARTEN, type Lernziel, type Reihe, type Schritt, type StundenArt } from '@shared/reihe'
import { notifyError } from '../../shared/util'
import { holen } from '../onlinetest/serverApi'
import {
  buchVerweis,
  dauerAnfrage,
  dauerAuswerten,
  dauerFaustwert,
  erkenneBuchSeiten,
  GESAMTVERTRAG_KURZ,
  ladeZaehler,
  merkeZaehler,
  phasenBudget,
  planeAusBuch,
  schritteMitUebernahme,
  schulformVorgaben,
  schuljahrVon,
  SEITEN_GRENZE,
  stundenAusUmfang,
  stundenRaster,
  vervielfaeltigteSeiten,
  zaehlerSchluessel,
  zaehlerStand,
  type BuchErkennung,
  type BuchPlan,
  type Dauer,
  type Kuerzung,
  type Uebernahme
} from './reiheAusSchulbuch'

const ki = <T,>(req: Parameters<typeof window.api.ai.structured>[0]): Promise<T> => window.api.ai.structured<T>(req)

/** Ergebnis für den Editor */
export interface BuchReihe {
  schritte: Schritt[]
  teile: string[]
  stunden: StundenArt[]
  lernziele: Lernziel[]
  hinweis: string
}

/** Ausschnitt eines Seitenbilds (Prozentangaben) als JPEG, höchstens 1200 px breit */
export async function schneideAus(bild: string, b: { x: number; y: number; b: number; h: number }): Promise<string> {
  const img = new window.Image()
  img.src = bild
  await img.decode()
  const sx = (img.naturalWidth * b.x) / 100
  const sy = (img.naturalHeight * b.y) / 100
  const sw = Math.max(1, Math.min(img.naturalWidth - sx, (img.naturalWidth * b.b) / 100))
  const sh = Math.max(1, Math.min(img.naturalHeight - sy, (img.naturalHeight * b.h) / 100))
  const faktor = Math.min(1, 1200 / sw)
  const c = document.createElement('canvas')
  c.width = Math.round(sw * faktor)
  c.height = Math.round(sh * faktor)
  c.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85)
}

const WAHLEN: { value: Uebernahme; label: string }[] = [
  { value: 'verweis', label: 'Verweisen' },
  { value: 'text', label: 'Abschreiben' },
  { value: 'bild', label: 'Bildausschnitt' }
]

export function ReiheAusSchulbuch({
  reihe,
  kc,
  schliessen,
  uebernehmen
}: {
  reihe: Reihe
  kc: { auszug: string[]; quelle: string }
  schliessen: () => void
  uebernehmen: (r: BuchReihe, ersetzen: boolean) => void
}): React.JSX.Element {
  // Seiten
  const [bilder, setBilder] = useState<string[]>([])
  const [buch, setBuch] = useState<BuchErkennung | null>(null)
  const [liest, setLiest] = useState<string | null>(null)
  // Umfang
  const [umfangArt, setUmfangArt] = useState<'wochen' | 'stunden'>('wochen')
  const [wochen, setWochen] = useState(6)
  const [wochenstunden, setWochenstunden] = useState(4)
  const [direkt, setDirekt] = useState(12)
  const [form, setForm] = useState<StundenArt>('doppel')
  const [mitKa, setMitKa] = useState(false)
  const [kuerzung, setKuerzung] = useState<Kuerzung>('standard')
  const [wunsch, setWunsch] = useState('')
  const [dauer, setDauer] = useState<Dauer | null>(null)
  const [schaetzt, setSchaetzt] = useState(false)
  // Planung
  const [plant, setPlant] = useState(false)
  const [plan, setPlan] = useState<BuchPlan | null>(null)
  const [wahl, setWahl] = useState<Record<number, Uebernahme>>({})
  const [gestrichenOffen, setGestrichenOffen] = useState(false)
  const [modus, setModus] = useState<'ersetzen' | 'anhaengen'>(reihe.schritte.length ? 'anhaengen' : 'ersetzen')
  const [fertigt, setFertigt] = useState(false)
  // Seitenzähler je Lerngruppe + Buch + Schuljahr
  const [lerngruppen, setLerngruppen] = useState<string[]>([])
  const [lerngruppe, setLerngruppe] = useState('')
  const schuljahr = schuljahrVon()
  useEffect(() => {
    void holen<{ gruppen: { id: string; name: string }[] }>('/server/lerngruppen').then(
      (d) => setLerngruppen([...new Set(d.gruppen.map((g) => g.name))]),
      () => setLerngruppen([])
    )
  }, [])

  const n = umfangArt === 'wochen' ? stundenAusUmfang({ art: 'wochen', wochen, wochenstunden }) : stundenAusUmfang({ art: 'stunden', stunden: direkt })
  const raster = stundenRaster(n, form)
  const vorgaben = schulformVorgaben(reihe.stateId, reihe.schoolTypeId)
  const budget = phasenBudget(n, vorgaben, mitKa)
  const faustwert = dauerFaustwert(reihe.fachId)

  const seitenNeu = buch ? vervielfaeltigteSeiten(buch, wahl) : []
  const schluessel = zaehlerSchluessel(lerngruppe || 'ohne Lerngruppe', buch?.titel || 'Schulbuch', schuljahr)
  const zaehler = useMemo(() => zaehlerStand(ladeZaehler()[schluessel] ?? [], seitenNeu), [schluessel, seitenNeu.join('|')])
  const benutzt = plan ? [...new Set(Object.values(plan.bezuege).flat())].sort((a, b) => a - b) : []

  const seitenLesen = async (dateien: File[]): Promise<void> => {
    try {
      const gelesen = []
      for (const f of dateien) {
        setLiest(`${f.name} wird gelesen …`)
        gelesen.push(await extractContent(f, (m) => setLiest(`${f.name}: ${m}`), { maxRenderedPages: 12 }))
      }
      // Datenschutz: Namensprüfung vor jeder KI-Anfrage
      const geprueft = await pruefeHochladen(gelesen)
      if (!geprueft) return
      const neu = geprueft.flatMap((g) => g.pageImages).filter((b) => b.startsWith('data:image/'))
      if (!neu.length) throw new Error('Keine Seitenbilder gefunden – bitte Fotos oder ein PDF der Schulbuchseiten wählen.')
      const alle = [...bilder, ...neu].slice(0, 30)
      // Erkennung je Seite (eine KI-Anfrage je Seite) – vorhandene Seiten werden nicht noch einmal erkannt
      const dazu = await erkenneBuchSeiten(alle.slice(bilder.length), (b) => erkenneSchulbuch([b], ki, { mitBereich: true }), setLiest)
      const versatz = bilder.length
      const zusammen: BuchErkennung = {
        titel: buch?.titel || dazu.titel,
        verlag: buch?.verlag || dazu.verlag,
        bilder: alle,
        abschnitte: [...(buch?.abschnitte ?? []), ...dazu.abschnitte.map((a) => ({ ...a, seitenIndex: a.seitenIndex + versatz }))]
      }
      if (!zusammen.abschnitte.length) throw new Error('Auf den Seiten wurde kein Schulbuch erkannt.')
      setBilder(alle)
      setBuch(zusammen)
      setPlan(null)
    } catch (e) {
      notifyError(e, 'Schulbuchseiten nicht gelesen')
    } finally {
      setLiest(null)
    }
  }

  const schaetzen = async (): Promise<void> => {
    if (!buch) return
    setSchaetzt(true)
    try {
      setDauer(dauerAuswerten(await ki<Partial<Dauer>>(dauerAnfrage(reihe, buch)), faustwert))
    } catch (e) {
      notifyError(e, 'Keine Schätzung')
    } finally {
      setSchaetzt(false)
    }
  }

  const planen = async (): Promise<void> => {
    if (!buch) return
    setPlant(true)
    try {
      const p = await planeAusBuch({ reihe, kc, buch, stunden: raster, budget, vorgaben, kuerzung, mitKlassenarbeit: mitKa, wunsch }, ki)
      setPlan(p)
      setWahl({})
    } catch (e) {
      notifyError(e, 'Keine Planung')
    } finally {
      setPlant(false)
    }
  }

  const fertig = async (): Promise<void> => {
    if (!plan || !buch) return
    setFertigt(true)
    try {
      // Bildausschnitte nur für die ausdrücklich angeklickten Abschnitte
      const ausschnitte: Record<number, string> = {}
      for (const [i, w] of Object.entries(wahl)) {
        const a = buch.abschnitte[Number(i)]
        if (w === 'bild' && a?.bereich) ausschnitte[Number(i)] = await schneideAus(buch.bilder[a.seitenIndex], a.bereich)
      }
      const schritte = schritteMitUebernahme(plan, buch, wahl, ausschnitte, reihe.fachLabel)
      if (seitenNeu.length) merkeZaehler(schluessel, zaehler.seiten)
      uebernehmen({ schritte, teile: plan.teile, stunden: raster, lernziele: plan.lernziele, hinweis: plan.hinweis }, modus === 'ersetzen')
      schliessen()
    } catch (e) {
      notifyError(e, 'Nicht übernommen')
    } finally {
      setFertigt(false)
    }
  }

  return (
    <Modal opened onClose={schliessen} title="Reihe aus Schulbuchseiten" size="xl" data-reihe-aus-buch>
      <Stack>
        {!plan && (
          <>
            <Text size="sm">
              Lade die Seiten der Einheit hoch – die KI erkennt Texte, Materialien und Aufgaben je Seite und plant daraus eine Reihe mit den für die Lernziele
              wichtigsten Aufgaben. Standard ist der <b>Verweis</b> aufs Buch („Buch S. 39, Nr. 4“); ganze Seiten kommen nie aufs Blatt.
            </Text>
            <DropZone
              onFiles={(f) => void seitenLesen(f)}
              accept={MATERIAL_ACCEPT}
              multiple
              title={liest ?? (bilder.length ? 'Weitere Seiten hierher ziehen' : 'Schulbuchseiten hierher ziehen (mehrere auf einmal)')}
              hint="Fotos oder PDF – je Seite eine Erkennung durch die KI"
              loading={Boolean(liest)}
              minHeight={70}
            />
            {buch && (
              <Card withBorder p="sm" data-buch-erkannt>
                <Group grow>
                  <TextInput label="Buch" value={buch.titel} onChange={(e) => setBuch({ ...buch, titel: e.currentTarget.value })} data-buch-titel />
                  <TextInput label="Verlag" value={buch.verlag} onChange={(e) => setBuch({ ...buch, verlag: e.currentTarget.value })} />
                </Group>
                <Group gap={6} mt="xs">
                  {buch.bilder.map((b, i) => (
                    <Group key={i} gap={2} wrap="nowrap">
                      <Image src={b} h={48} w="auto" radius="sm" alt={`Seite ${i + 1}`} />
                      <CloseButton
                        size="xs"
                        aria-label="Seite entfernen"
                        onClick={() => {
                          const rest = buch.abschnitte
                            .filter((a) => a.seitenIndex !== i)
                            .map((a) => ({ ...a, seitenIndex: a.seitenIndex > i ? a.seitenIndex - 1 : a.seitenIndex }))
                          setBilder(bilder.filter((_, k) => k !== i))
                          setBuch(rest.length ? { ...buch, bilder: buch.bilder.filter((_, k) => k !== i), abschnitte: rest } : null)
                        }}
                      />
                    </Group>
                  ))}
                </Group>
                <Text size="xs" c="dimmed" mt={4}>
                  {buch.bilder.length} Seiten · {buch.abschnitte.length} Abschnitte erkannt (
                  {[...new Set(buch.abschnitte.map((a) => a.seite).filter(Boolean))].join(', ') || 'Seitenzahlen unbekannt'})
                </Text>
              </Card>
            )}

            <Card withBorder p="sm">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={600} size="sm">
                    Umfang
                  </Text>
                  <SegmentedControl
                    size="xs"
                    value={umfangArt}
                    onChange={(v) => setUmfangArt(v as typeof umfangArt)}
                    data={[
                      { value: 'wochen', label: 'Wochen × Wochenstunden' },
                      { value: 'stunden', label: 'Stunden direkt' }
                    ]}
                    data-umfang-art
                  />
                </Group>
                <Group align="end">
                  {umfangArt === 'wochen' ? (
                    <>
                      <NumberInput label="Wochen" min={1} max={30} value={wochen} onChange={(v) => setWochen(Number(v) || 1)} w={110} data-umfang-wochen />
                      <NumberInput label="Wochenstunden" min={1} max={8} value={wochenstunden} onChange={(v) => setWochenstunden(Number(v) || 1)} w={140} />
                    </>
                  ) : (
                    <NumberInput
                      label="Unterrichtsstunden"
                      min={1}
                      max={120}
                      value={direkt}
                      onChange={(v) => setDirekt(Number(v) || 1)}
                      w={160}
                      data-umfang-stunden
                    />
                  )}
                  <SegmentedControl
                    value={form}
                    onChange={(v) => setForm(v as StundenArt)}
                    data={[
                      { value: 'doppel', label: 'Doppelstunden' },
                      { value: 'einzel', label: 'Einzelstunden' }
                    ]}
                  />
                </Group>
                <Text size="sm" data-umfang-ergebnis>
                  = <b>{n} Unterrichtsstunden</b>
                  {umfangArt === 'wochen' ? ` (${wochen} × ${wochenstunden} × 0,85 für Ausfälle, Feiertage, Klassenarbeiten)` : ''} →{' '}
                  {raster.filter((a) => a === 'doppel').length ? `${raster.filter((a) => a === 'doppel').length} Doppelstunden` : ''}
                  {raster.filter((a) => a === 'doppel').length && raster.filter((a) => a === 'einzel').length ? ' + ' : ''}
                  {raster.filter((a) => a === 'einzel').length ? `${raster.filter((a) => a === 'einzel').length} Einzelstunden` : ''}
                </Text>
                <Group gap="xs" align="center">
                  <Text size="xs" c="dimmed">
                    Vorschlag:{' '}
                    {dauer
                      ? `${dauer.min}–${dauer.max} Stunden – ${dauer.begruendung}`
                      : `${faustwert.min}–${faustwert.max} Stunden (${faustwert.begruendung})`}
                  </Text>
                  <Button
                    size="compact-xs"
                    variant="light"
                    color="grape"
                    loading={schaetzt}
                    disabled={!buch}
                    onClick={() => void schaetzen()}
                    data-dauer-schaetzen
                  >
                    Von der KI schätzen lassen
                  </Button>
                  {dauer && (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      onClick={() => {
                        setUmfangArt('stunden')
                        setDirekt(Math.round((dauer.min + dauer.max) / 2))
                      }}
                    >
                      Mitte übernehmen ({Math.round((dauer.min + dauer.max) / 2)})
                    </Button>
                  )}
                </Group>
                <Checkbox
                  label="Klassenarbeit einplanen (Reserve für Arbeit, Rückgabe/Berichtigung und Puffer)"
                  checked={mitKa}
                  onChange={(e) => setMitKa(e.currentTarget.checked)}
                />
                <Group gap="xs">
                  <Text size="sm">Umfang der Auswahl:</Text>
                  <SegmentedControl
                    size="xs"
                    value={kuerzung}
                    onChange={(v) => setKuerzung(v as Kuerzung)}
                    data={[
                      { value: 'minimal', label: 'Minimal' },
                      { value: 'standard', label: 'Standard' },
                      { value: 'voll', label: 'Voll' }
                    ]}
                  />
                </Group>
                <Text size="xs" c="dimmed">
                  Budget: {budget.phasen.map((p) => `${p.name} ${p.stunden}`).join(' · ')}
                  {budget.reserve ? ` · Reserve ${budget.reserve}` : ''} · {vorgaben.text}
                </Text>
              </Stack>
            </Card>
            <Textarea
              label="Besondere Wünsche (optional)"
              placeholder="z. B. Schwerpunkt Hörverstehen, Abschluss mit Unit task als Plakat …"
              autosize
              minRows={2}
              value={wunsch}
              onChange={(e) => setWunsch(e.currentTarget.value)}
            />
            <Group justify="flex-end">
              <Button
                leftSection={<IconSparkles size={16} />}
                loading={plant}
                disabled={!buch || Boolean(liest)}
                onClick={() => void planen()}
                data-buch-planen
              >
                Reihe planen
              </Button>
            </Group>
          </>
        )}

        {plan && buch && (
          <>
            {plan.hinweis && (
              <Alert variant="light" color="grape">
                {plan.hinweis}
              </Alert>
            )}
            <Text size="sm" c="dimmed">
              {plan.schritte.length} Schritte in {plan.teile.length} Teilen ({plan.schritte.filter((x) => x.rolle === 'optional').length} optional) · {n}{' '}
              Unterrichtsstunden · {benutzt.length} von {buch.abschnitte.length} Abschnitten genutzt
            </Text>
            {plan.lernziele.length > 0 && (
              <Card withBorder p="sm">
                <Text size="sm" fw={600}>
                  Lernziele der Reihe (neu)
                </Text>
                {plan.lernziele.map((l, i) => (
                  <Text key={i} size="sm">
                    • {l.text}
                  </Text>
                ))}
              </Card>
            )}
            <ScrollArea.Autosize mah="38vh">
              <Stack gap="xs">
                {plan.teile.map((t) => (
                  <Card key={t} withBorder p="sm">
                    <Text fw={700} mb={4}>
                      {t}
                    </Text>
                    <Stack gap={6}>
                      {plan.schritte
                        .filter((x) => x.abschnitt === t)
                        .map((x) => (
                          <div key={x.id} data-buch-schritt>
                            <Group gap={6}>
                              <Badge size="xs" variant="outline">
                                Std. {(x.stunde ?? 0) + 1}
                              </Badge>
                              <Text size="sm" fw={600}>
                                {x.titel}
                              </Text>
                              <Badge size="xs" variant="light">
                                {SCHRITT_ARTEN.find((a) => a.id === x.inhalt.art)?.label}
                              </Badge>
                              <Badge size="xs" variant="light" color={x.rolle === 'optional' ? 'teal' : x.rolle === 'foerder' ? 'orange' : 'blue'}>
                                {x.rolle === 'optional' ? 'Optional' : x.rolle === 'foerder' ? 'Förderung' : 'Pflicht'}
                              </Badge>
                              {plan.einordnung[x.id]?.phase && (
                                <Text size="xs" c="dimmed">
                                  {plan.einordnung[x.id].phase}
                                </Text>
                              )}
                              {x.minuten ? (
                                <Text size="xs" c="dimmed">
                                  {x.minuten} min
                                </Text>
                              ) : null}
                              {(plan.bezuege[x.id] ?? []).map((i) => (
                                <Badge key={i} size="xs" color="gray" variant="dot">
                                  {buchVerweis(buch.abschnitte[i])}
                                </Badge>
                              ))}
                            </Group>
                            <Text size="xs">{x.platzhalter?.beschreibung}</Text>
                            {x.platzhalter?.begruendung && (
                              <Text size="xs" c="dimmed" fs="italic">
                                Warum: {x.platzhalter.begruendung}
                              </Text>
                            )}
                          </div>
                        ))}
                    </Stack>
                  </Card>
                ))}
              </Stack>
            </ScrollArea.Autosize>

            <Card withBorder p="sm" data-uebernahme>
              <Text fw={600} size="sm" mb={4}>
                Buchabschnitte in den Schritten – je Abschnitt: verweisen (Standard), abschreiben oder Bildausschnitt
              </Text>
              <ScrollArea.Autosize mah="24vh">
                <Table verticalSpacing={4}>
                  <Table.Tbody>
                    {benutzt.map((i) => {
                      const a = buch.abschnitte[i]
                      return (
                        <Table.Tr key={i} data-abschnitt-wahl={i}>
                          <Table.Td>
                            <Badge variant="light" size="sm">
                              {a.kennung}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Tooltip label={a.text.slice(0, 500)} multiline w={420} openDelay={400}>
                              <Text size="xs" lineClamp={1}>
                                S. {a.seite || '?'} · {a.titel || a.art}
                              </Text>
                            </Tooltip>
                          </Table.Td>
                          <Table.Td>
                            <SegmentedControl
                              size="xs"
                              value={wahl[i] ?? 'verweis'}
                              onChange={(v) => setWahl({ ...wahl, [i]: v as Uebernahme })}
                              data={WAHLEN.map((w) => ({ ...w, disabled: w.value === 'bild' && !a.bereich }))}
                            />
                          </Table.Td>
                        </Table.Tr>
                      )
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
              <Group gap="xs" mt="xs" align="end">
                <Autocomplete
                  label="Lerngruppe (für den Seitenzähler)"
                  data={lerngruppen}
                  value={lerngruppe}
                  onChange={setLerngruppe}
                  placeholder="z. B. 7a"
                  w={220}
                  size="xs"
                  data-zaehler-lerngruppe
                />
                <Text size="xs" c={zaehler.warnung ? 'red' : 'dimmed'} data-seitenzaehler>
                  Vervielfältigt aus „{buch.titel || 'Schulbuch'}“ für {lerngruppe || 'diese Lerngruppe'} im Schuljahr {schuljahr}: {zaehler.anzahl} von
                  höchstens {SEITEN_GRENZE} Seiten
                  {seitenNeu.length ? ` (davon jetzt ${seitenNeu.length})` : ''}
                </Text>
              </Group>
              {zaehler.warnung && (
                <Alert color="red" variant="light" mt="xs" icon={<IconAlertTriangle size={16} />} p="xs">
                  <Text size="xs">
                    {zaehler.ueber
                      ? `Mehr als ${SEITEN_GRENZE} Seiten dieses Buchs für diese Lerngruppe in diesem Schuljahr – bitte auf Verweise umstellen.`
                      : `Die Grenze von ${SEITEN_GRENZE} Seiten ist erreicht – weitere Abschriften oder Ausschnitte bitte nur noch als Verweis.`}
                  </Text>
                </Alert>
              )}
              <Alert variant="light" color="gray" mt="xs" icon={<IconBook size={16} />} p="xs">
                <Text size="xs">{GESAMTVERTRAG_KURZ}</Text>
              </Alert>
            </Card>

            {plan.gestrichen.length > 0 && (
              <div>
                <Button size="compact-xs" variant="subtle" onClick={() => setGestrichenOffen((x) => !x)} data-gestrichen>
                  {gestrichenOffen ? '▾' : '▸'} {plan.gestrichen.length} Abschnitte nicht genutzt – mit Begründung
                </Button>
                <Collapse expanded={gestrichenOffen}>
                  <Stack gap={2} mt={4}>
                    {plan.gestrichen.map((g) => (
                      <Text key={g.abschnitt} size="xs" c="dimmed">
                        {buchVerweis(buch.abschnitte[g.abschnitt])}: {g.begruendung}
                      </Text>
                    ))}
                  </Stack>
                </Collapse>
              </div>
            )}

            <Group justify="space-between">
              {reihe.schritte.length > 0 ? (
                <SegmentedControl
                  value={modus}
                  onChange={(v) => setModus(v as typeof modus)}
                  data={[
                    { value: 'anhaengen', label: 'An vorhandene Schritte anhängen' },
                    { value: 'ersetzen', label: 'Vorhandene Schritte ersetzen' }
                  ]}
                />
              ) : (
                <span />
              )}
              <Group gap="xs">
                <Button variant="default" onClick={() => setPlan(null)}>
                  Zurück
                </Button>
                <Button loading={fertigt} onClick={() => void fertig()} data-buch-uebernehmen>
                  Übernehmen
                </Button>
              </Group>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  )
}
