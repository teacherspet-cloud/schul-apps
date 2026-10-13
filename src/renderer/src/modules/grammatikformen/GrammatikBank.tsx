/**
 * Übungsaufgaben im Pop-up der App „Grammatikformen" (13.10.2026, mit der Lehrkraft abgestimmt; Regeln in
 * shared/grammatikBank.ts, Server server/grammatikBank.ts).
 *
 * Reiter je Teilbereich des Grammatikpunkts, dazu „Gemischt" (Formen des Punkts) und „Unit gemischt" (Wiederholung der
 * Unit). Je Reiter die fünf Übungsarten mit Anzahl (Ziel rund 8): Erkennen, Bilden, Anwenden (Kern) und Unterscheiden,
 * Fehler finden (Zusatz). „Mit KI erzeugen" füllt fehlende Übungsarten im Hintergrund; das Ergebnis erscheint als Entwurf
 * und wird erst nach dem Durchsehen gespeichert. „Bearbeiten" öffnet alle Aufgaben des Reiters.
 */
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Paper,
  Progress,
  ScrollArea,
  SegmentedControl,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Tooltip
} from '@mantine/core'
import { IconCheck, IconCircleDashed, IconCircleHalf2, IconPencil, IconSparkles, IconTrash } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import type { TextbookMeta } from '@shared/types'
import {
  AUFGABEN_JE_FELD,
  istKern,
  istMix,
  mixSchluessel,
  regelIdVon,
  STUFE_NAME,
  STUFEN,
  stufeVon,
  UEBUNG_NAME,
  UEBUNG_TEXT,
  UEBUNGEN,
  unitSchluessel,
  type BankAufgabe,
  type BankRegel,
  type BankZahlen,
  type Stufe,
  type Uebung
} from '@shared/grammatikBank'
import type { GrammatikPaket } from '@shared/grammatiktrainer'
import type { LehrwerkGrammatikPunkt } from '../../shared/lehrwerkGrammatik'
import { notifyError, notifySuccess } from '../../shared/util'
import { AufgabenEditor } from '../lernen/kurs/AufgabenEditor'
import { kennungLabel, teilbereicheVon, teilHinweise, teilKurzname, themaZu, zielDocId } from './grammatikformen'
import {
  BANK_EREIGNIS,
  bankEntwurfWeg,
  bankErzeugenStarten,
  bankLesen,
  bankSpeichern,
  bankZahlenLaden,
  fehlendeFelder,
  feldZahl,
  useSchulStufen,
  useBankEntwuerfe,
  type BankEntwurf
} from './bank'
import { aufServer } from '../../shared/plattform'
import { fachVon } from '@shared/faecher'

/** Ein Reiter: Schlüssel, Name, Formen (für die KI), Katalog-Hinweise */
interface Reiter {
  schluessel: string
  name: string
  titel: string
  themen: string[]
  formen?: string[]
  hinweise?: string
}

/** Zahlen der Bank je Sprache – einmal laden, nach dem Speichern neu */
export function useBankZahlen(sprache: string): { zahlen: BankZahlen; darf: boolean; geladen: boolean; neu: () => void } {
  const [d, setD] = useState<{ zahlen: BankZahlen; darf: boolean; geladen: boolean }>({ zahlen: {}, darf: false, geladen: false })
  const laden = (): void => {
    if (!aufServer()) return
    bankZahlenLaden(sprache).then(
      (r) => setD({ ...r, geladen: true }),
      () => setD((x) => ({ ...x, geladen: true }))
    )
  }
  useEffect(() => {
    laden()
    window.addEventListener(BANK_EREIGNIS, laden)
    return () => window.removeEventListener(BANK_EREIGNIS, laden)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprache])
  return { ...d, neu: laden }
}

export function BankKarte({
  punkt,
  unit,
  unitPunkte,
  buch,
  fach,
  farbe,
  zahlen,
  darf,
  einfach,
  abschnitt
}: {
  /** Abschnitt des Punkts (Ziel für „Öffnen") */
  abschnitt?: string
  /** Standardmodus: eine Zeile je Bereich mit Ampel, ohne Übungsarten */
  einfach?: boolean
  punkt: LehrwerkGrammatikPunkt
  unit: string
  /** Alle Punkte der Unit (für „Unit gemischt") */
  unitPunkte: LehrwerkGrammatikPunkt[]
  buch: TextbookMeta
  fach: string
  farbe: string
  zahlen: BankZahlen
  /** Admin bzw. Fachobfrau/-mann – darf Hinterlegtes ändern */
  darf: boolean
}): React.JSX.Element {
  const entwuerfe = useBankEntwuerfe()
  // Stufen der Schule (Schulform in den Einstellungen) – danach Zähler, Ampel und KI-Knopf
  const schulStufen = useSchulStufen()
  const [bearbeiten, setBearbeiten] = useState<Reiter | null>(null)
  const reiter = useMemo<Reiter[]>(() => {
    const teile = teilbereicheVon(punkt.t)
    // Teilbereiche aus mehreren Themen (z. B. „be" und „Kurzantworten"): voller Name, sonst stünde nur „mit be" da (13.10.2026)
    const mehrereThemen = new Set(teile.map((k) => k.split('/')[0])).size > 1
    const aus: Reiter[] = teile.map((k) => ({
      schluessel: k,
      name: teilKurzname(k, mehrereThemen),
      titel: kennungLabel(k),
      themen: [k.split('/')[0]],
      hinweise: teilHinweise(k)
    }))
    if (teile.length >= 2)
      aus.push({
        schluessel: mixSchluessel(punkt.t),
        name: 'Gemischt',
        titel: `Gemischt: ${punkt.text}`,
        themen: [...new Set(punkt.t.map((k) => k.split('/')[0]))],
        formen: teile.map(kennungLabel)
      })
    const unitKennungen = [...new Set(unitPunkte.flatMap((p) => p.t))]
    if (unitPunkte.length >= 2 && unitKennungen.length >= 2)
      aus.push({
        schluessel: unitSchluessel(buch.name, unit),
        name: `${unit} gemischt`,
        titel: `Wiederholung ${unit}`,
        themen: [...new Set(unitKennungen.map((k) => k.split('/')[0]))],
        formen: unitPunkte.map((p) => p.text)
      })
    return aus
  }, [punkt, unitPunkte, buch.name, unit])
  const [aktiv, setAktiv] = useState<string | null>(reiter[0]?.schluessel ?? null)
  useEffect(() => {
    if (!reiter.some((r) => r.schluessel === aktiv)) setAktiv(reiter[0]?.schluessel ?? null)
  }, [reiter, aktiv])

  if (!aufServer())
    return (
      <Text size="sm" c="dimmed">
        Übungsaufgaben werden am Server der Schule hinterlegt – in der Online-Fassung verfügbar.
      </Text>
    )
  if (!reiter.length)
    return (
      <Text size="sm" c="dimmed">
        Ohne Katalogform gibt es keine Übungsaufgaben.
      </Text>
    )

  const darfReiter = (r: Reiter): boolean => darf || !Object.keys(zahlen[r.schluessel] ?? {}).length
  const auftrag = (r: Reiter, uebungen: Uebung[], niveau: Stufe): Parameters<typeof bankErzeugenStarten>[0][number] => ({
    niveau,
    schluessel: r.schluessel,
    titel: r.titel,
    fach: fachVon(fach)?.label ?? fach,
    sprache: buch.language,
    jahrgang: buch.grade ?? themaZu(r.themen[0])?.from ?? 7,
    land: buch.stateId,
    schulform: buch.schoolTypeId,
    uebungen,
    anzahl: AUFGABEN_JE_FELD,
    themenIds: r.themen,
    hinweise: r.hinweise,
    formen: r.formen,
    lehrwerk: { buch: buch.name, unit }
  })
  const entwurfVon = (s: string): BankEntwurf | undefined => entwuerfe.find((e) => e.schluessel === s)
  // „Öffnen" in der Auftragsleiste führt zu diesem Grammatikpunkt
  const ziel = zielDocId({ buchId: buch.id, unit, abschnitt: abschnitt ?? '', kennungen: punkt.t, text: punkt.text })
  const felderVon = (r: Reiter): ReturnType<typeof fehlendeFelder> => fehlendeFelder(zahlen[r.schluessel], schulStufen, entwurfVon(r.schluessel))
  // Je Stufe der Schule eine Anfrage je Bereich (13.10.2026)
  const auftraegeVon = (r: Reiter): ReturnType<typeof auftrag>[] => felderVon(r).map((f) => auftrag(r, f.uebungen, f.stufe))
  /*
   * „Alle fehlenden" (13.10.2026, Befund am VPS: „Unit 1 gemischt" mehrfach erzeugt): Gemischtes (je Punkt, je Unit) nur in
   * Stufen, in denen es noch gar keine Aufgaben hat – sonst holte jeder Punkt der Unit die gemischte Wiederholung erneut,
   * solange die Prüfung ein Feld unter dem Ziel ließ. Auffüllen: „Mit KI erzeugen" im eigenen Reiter.
   */
  const felderFuerAlle = (r: Reiter): ReturnType<typeof fehlendeFelder> =>
    istMix(r.schluessel)
      ? felderVon(r).filter(
          (f) =>
            !UEBUNGEN.some((u) => feldZahl(zahlen[r.schluessel], u, f.stufe) > 0) && !entwurfVon(r.schluessel)?.aufgaben.some((a) => stufeVon(a) === f.stufe)
        )
      : felderVon(r)
  const offeneReiter = reiter.filter((r) => darfReiter(r) && felderFuerAlle(r).length)
  const alleFehlenden = (): void =>
    bankErzeugenStarten(
      offeneReiter.flatMap((r) =>
        felderFuerAlle(r).map((f) => ({ ...auftrag(r, f.uebungen, f.stufe), ...(istMix(r.schluessel) ? { nurWennLeer: true } : {}) }))
      ),
      `Übungsaufgaben: ${punkt.text}`,
      ziel
    )

  const editor = bearbeiten && (
    <BankEditor
      reiter={bearbeiten}
      sprache={buch.language}
      darf={darfReiter(bearbeiten)}
      entwurf={entwurfVon(bearbeiten.schluessel)}
      schliessen={() => setBearbeiten(null)}
    />
  )

  /*
   * Standardmodus (13.10.2026, abgestimmt): je Teilbereich bzw. gemischter Übung eine Zeile mit Ampel und EINEM Knopf –
   * ohne die einzelnen Übungsarten. Darunter „Fehlende Aufgaben mit KI ergänzen".
   */
  if (einfach)
    return (
      <Stack gap="xs" data-grammatik-bank data-bank-einfach>
        {reiter.map((r) => {
          const z = zahlen[r.schluessel]
          const n = UEBUNGEN.reduce((m, u) => m + (z?.[u] ?? 0), 0)
          const e = entwurfVon(r.schluessel)
          const voll = n > 0 && !fehlendeFelder(z, schulStufen).length
          const ampel = !n
            ? { farbe: 'gray', icon: <IconCircleDashed size={14} /> }
            : voll
            ? { farbe: 'teal', icon: <IconCheck size={14} /> }
            : { farbe: 'orange', icon: <IconCircleHalf2 size={14} /> }
          return (
            <Paper key={r.schluessel} withBorder radius="md" px="sm" py={8} data-bank-zeile={r.schluessel}>
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                  <ThemeIcon size={26} radius="xl" variant="light" color={ampel.farbe}>
                    {ampel.icon}
                  </ThemeIcon>
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate title={r.name}>
                      {r.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {!n ? 'noch keine Aufgaben' : voll ? `${n} Aufgaben – vollständig` : `${n} Aufgaben – teilweise`}
                      {e ? ` · ${e.aufgaben.length} neue zum Durchsehen` : ''}
                    </Text>
                  </div>
                </Group>
                <Button
                  size="compact-sm"
                  variant={e ? 'filled' : 'light'}
                  color={e ? 'violet' : farbe}
                  onClick={() => setBearbeiten(r)}
                  style={{ flexShrink: 0 }}
                  data-bank-bearbeiten
                >
                  {e ? 'Durchsehen' : n || !darfReiter(r) ? 'Ansehen' : 'Anlegen'}
                </Button>
              </Group>
            </Paper>
          )
        })}
        {offeneReiter.length > 0 && (
          <Button variant="light" color="violet" leftSection={<IconSparkles size={16} />} onClick={alleFehlenden} data-bank-ki-alle>
            Fehlende Aufgaben mit KI ergänzen
          </Button>
        )}
        <Text size="xs" c="dimmed">
          Lernende bekommen diese Aufgaben, sobald die Form einem Kurs hinzugefügt wird.
        </Text>
        {editor}
      </Stack>
    )

  return (
    <Stack gap="sm" data-grammatik-bank>
      <Tabs value={aktiv} onChange={setAktiv} color={farbe} variant="pills" radius="xl">
        <ScrollArea type="auto" scrollbarSize={4} offsetScrollbars>
          <Tabs.List style={{ flexWrap: 'nowrap' }}>
            {reiter.map((r) => {
              const z = zahlen[r.schluessel]
              const n = UEBUNGEN.reduce((m, u) => m + (z?.[u] ?? 0), 0)
              return (
                <Tabs.Tab
                  key={r.schluessel}
                  value={r.schluessel}
                  data-bank-reiter={r.schluessel}
                  rightSection={
                    n ? (
                      <Badge size="xs" variant="white" color={farbe}>
                        {n}
                      </Badge>
                    ) : undefined
                  }
                  title={r.name}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      maxWidth: 260,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      verticalAlign: 'bottom'
                    }}
                  >
                    {r.name}
                  </span>
                </Tabs.Tab>
              )
            })}
          </Tabs.List>
        </ScrollArea>
        {reiter.map((r) => {
          const z = zahlen[r.schluessel]
          const e = entwurfVon(r.schluessel)
          const fehlend = felderVon(r)
          return (
            <Tabs.Panel key={r.schluessel} value={r.schluessel} pt="sm">
              <Stack gap={6}>
                {r.formen && (
                  <Text size="xs" c="dimmed">
                    {r.formen.join(' · ')}
                  </Text>
                )}
                <Group gap="xs" wrap="nowrap">
                  <Text size="xs" c="dimmed" w={110} style={{ flexShrink: 0 }}>
                    Übungsart
                  </Text>
                  {schulStufen.map((st) => (
                    <Text key={st} size="xs" c="dimmed" style={{ flex: 1 }} ta="center">
                      {STUFE_NAME[st]}
                    </Text>
                  ))}
                </Group>
                {UEBUNGEN.map((u) => (
                  <Group key={u} gap="xs" wrap="nowrap" title={UEBUNG_TEXT[u]} data-bank-uebung={u}>
                    <Text size="sm" w={110} fw={istKern(u) ? 600 : 400} c={istKern(u) ? undefined : 'dimmed'} style={{ flexShrink: 0 }}>
                      {UEBUNG_NAME[u]}
                    </Text>
                    {schulStufen.map((st) => {
                      const n = feldZahl(z, u, st)
                      const dazu = e?.aufgaben.filter((a) => a.uebung === u && stufeVon(a) === st).length ?? 0
                      return (
                        <Tooltip
                          key={st}
                          label={`${UEBUNG_NAME[u]}, ${STUFE_NAME[st]}: ${n} von ${AUFGABEN_JE_FELD}${dazu ? ` (+${dazu} zum Durchsehen)` : ''}`}
                        >
                          <div style={{ flex: 1 }} data-bank-feld={`${u}-${st}`}>
                            <Progress value={Math.min(100, (n / AUFGABEN_JE_FELD) * 100)} color={istKern(u) ? farbe : 'orange'} size="sm" />
                            <Text size="10px" c="dimmed" ta="center">
                              {n}
                              {dazu ? ` +${dazu}` : ''}
                            </Text>
                          </div>
                        </Tooltip>
                      )
                    })}
                  </Group>
                ))}
                <Text size="xs" c="dimmed">
                  Erkennen, Bilden und Anwenden zählen für „sicher“; Unterscheiden und Fehler finden sind Zusatzaufgaben.
                </Text>
                {e && (
                  <Alert color="violet" p="xs" data-bank-entwurf>
                    <Group justify="space-between" gap="xs">
                      <Text size="sm">{e.aufgaben.length} Aufgaben der KI warten aufs Durchsehen.</Text>
                      <Button size="compact-sm" color="violet" onClick={() => setBearbeiten(r)} data-bank-entwurf-ansehen>
                        Durchsehen
                      </Button>
                    </Group>
                  </Alert>
                )}
                <Group gap="xs" mt={4}>
                  <Button size="xs" variant="light" color={farbe} leftSection={<IconPencil size={14} />} onClick={() => setBearbeiten(r)} data-bank-bearbeiten>
                    {darfReiter(r) ? 'Bearbeiten' : 'Ansehen'}
                  </Button>
                  {darfReiter(r) && (
                    <Tooltip
                      label={
                        fehlend.length
                          ? `Füllt fehlende Felder auf je ${AUFGABEN_JE_FELD} Aufgaben auf (${fehlend.map((f) => STUFE_NAME[f.stufe]).join(', ')})`
                          : 'Alle Übungsarten haben genug Aufgaben'
                      }
                    >
                      <Button
                        size="xs"
                        variant="light"
                        color="violet"
                        leftSection={<IconSparkles size={14} />}
                        disabled={!fehlend.length}
                        onClick={() => bankErzeugenStarten(auftraegeVon(r), `Übungsaufgaben: ${r.titel}`, ziel)}
                        data-bank-ki
                      >
                        Mit KI erzeugen
                      </Button>
                    </Tooltip>
                  )}
                </Group>
              </Stack>
            </Tabs.Panel>
          )
        })}
      </Tabs>
      {offeneReiter.length > 1 && (
        <Button
          size="xs"
          variant="subtle"
          color="violet"
          leftSection={<IconSparkles size={14} />}
          onClick={alleFehlenden}
          style={{ alignSelf: 'flex-start' }}
          data-bank-ki-alle
        >
          Alle fehlenden mit KI erzeugen ({offeneReiter.length} Bereiche)
        </Button>
      )}
      {editor}
    </Stack>
  )
}

/** Alle Aufgaben eines Schlüssels: Regelkarte, Filter nach Übungsart, Entwurf der KI hervorgehoben */
function BankEditor({
  reiter,
  sprache,
  darf,
  entwurf,
  schliessen
}: {
  reiter: Reiter
  sprache: string
  darf: boolean
  entwurf?: BankEntwurf
  schliessen: () => void
}): React.JSX.Element {
  const [regel, setRegel] = useState<BankRegel | null>(null)
  const [aufgaben, setAufgaben] = useState<BankAufgabe[]>([])
  const [neu, setNeu] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'alle' | Uebung>('alle')
  // Stufe (13.10.2026): grundlegend, mittel, anspruchsvoll
  const [stufe, setStufe] = useState<'alle' | Stufe>('alle')
  const passt = (a: BankAufgabe): boolean => (filter === 'alle' || a.uebung === filter) && (stufe === 'alle' || stufeVon(a) === stufe)
  const [laeuft, setLaeuft] = useState(false)
  const [geladen, setGeladen] = useState(false)
  useEffect(() => {
    let aktiv = true
    bankLesen([reiter.schluessel]).then(
      (l) => {
        if (!aktiv) return
        const da = l[0]
        setRegel(da?.regel ?? entwurf?.regel ?? { titel: reiter.titel, erklaerung: '', beispiele: [] })
        setAufgaben([...(da?.aufgaben ?? []), ...(entwurf?.aufgaben ?? [])])
        setNeu(new Set(entwurf?.aufgaben.map((a) => a.id) ?? []))
        setGeladen(true)
      },
      (e: unknown) => (notifyError(e), setGeladen(true))
    )
    return () => {
      aktiv = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reiter.schluessel])
  const regelId = regelIdVon(reiter.schluessel)
  const sichtbar = aufgaben.filter(passt)
  const paket: GrammatikPaket = {
    thema: reiter.titel,
    regeln: [{ id: regelId, titel: regel?.titel ?? reiter.titel, erklaerung: regel?.erklaerung ?? '', beispiele: regel?.beispiele ?? [] }],
    aufgaben: sichtbar.map((a) => ({ ...a, regelId }))
  }
  // Gefilterte Liste zurück in die ganze: Reihenfolge der übrigen bleibt
  const aendern = (p: GrammatikPaket): void => {
    const geaendert = p.aufgaben as BankAufgabe[]
    if (filter === 'alle' && stufe === 'alle') return setAufgaben(geaendert)
    const rest = aufgaben.filter((a) => !passt(a))
    setAufgaben([...rest, ...geaendert])
  }
  const speichern = async (): Promise<void> => {
    if (!regel) return
    setLaeuft(true)
    try {
      const r = await bankSpeichern(sprache, reiter.schluessel, regel, aufgaben)
      bankEntwurfWeg(reiter.schluessel)
      window.dispatchEvent(new Event(BANK_EREIGNIS))
      notifySuccess(`${r.aufgaben} Aufgaben gespeichert${r.kurse ? ` – ${r.kurse} Kurs-Trainings aktualisiert` : ''}.`)
      schliessen()
    } catch (e) {
      notifyError(e, 'Nicht gespeichert')
    } finally {
      setLaeuft(false)
    }
  }
  const zahl = (u: Uebung): number => aufgaben.filter((a) => a.uebung === u).length
  return (
    <Modal
      opened
      onClose={schliessen}
      title={reiter.titel}
      size="xl"
      fullScreen={window.matchMedia?.('(max-width: 700px)').matches}
      zIndex={400}
      data-bank-editor
    >
      {!geladen || !regel ? (
        <Text c="dimmed">Lädt …</Text>
      ) : (
        <Stack>
          {!darf && (
            <Alert color="gray" p="xs">
              Hinterlegte Aufgaben ändern nur Admins und die Fachobleute des Fachs.
            </Alert>
          )}
          <Card withBorder radius="md" padding="sm">
            <Text fw={600} size="sm" mb={6}>
              Regelkarte
            </Text>
            <Stack gap="xs">
              <TextInput label="Titel" value={regel.titel} disabled={!darf} onChange={(e) => setRegel({ ...regel, titel: e.currentTarget.value })} />
              <Textarea
                label="Erklärung"
                autosize
                minRows={2}
                value={regel.erklaerung}
                disabled={!darf}
                onChange={(e) => setRegel({ ...regel, erklaerung: e.currentTarget.value })}
              />
              <Textarea
                label="Beispiele (eines je Zeile)"
                autosize
                minRows={2}
                value={regel.beispiele.join('\n')}
                disabled={!darf}
                onChange={(e) =>
                  setRegel({
                    ...regel,
                    beispiele: e.currentTarget.value
                      .split('\n')
                      .map((x) => x.trim())
                      .filter(Boolean)
                  })
                }
              />
            </Stack>
          </Card>
          <SegmentedControl
            size="xs"
            value={filter}
            onChange={(v) => setFilter(v as 'alle' | Uebung)}
            data={[{ value: 'alle', label: `Alle (${aufgaben.length})` }, ...UEBUNGEN.map((u) => ({ value: u, label: `${UEBUNG_NAME[u]} (${zahl(u)})` }))]}
            data-bank-filter
          />
          <SegmentedControl
            size="xs"
            value={stufe}
            onChange={(v) => setStufe(v as 'alle' | Stufe)}
            data={[
              { value: 'alle', label: 'Alle Stufen' },
              ...STUFEN.map((st) => ({ value: st, label: `${STUFE_NAME[st]} (${aufgaben.filter((a) => stufeVon(a) === st).length})` }))
            ]}
            data-bank-stufe
          />
          {sichtbar.length ? (
            <AufgabenEditor paket={paket} aendern={aendern} neu={neu} ohneRegeln />
          ) : (
            <Text size="sm" c="dimmed">
              Noch keine Aufgaben{filter !== 'alle' ? ` zu „${UEBUNG_NAME[filter]}“` : ''}.
            </Text>
          )}
          <Group justify="space-between" className="dialog-fuss">
            {entwurf && darf ? (
              <Tooltip label="Die Aufgaben der KI verwerfen, die noch nicht gespeichert sind">
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="lg"
                  onClick={() => {
                    bankEntwurfWeg(reiter.schluessel)
                    schliessen()
                  }}
                  aria-label="Entwurf verwerfen"
                  data-bank-entwurf-verwerfen
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </Tooltip>
            ) : (
              <span />
            )}
            <Group>
              <Button variant="default" onClick={schliessen}>
                {darf ? 'Abbrechen' : 'Schließen'}
              </Button>
              {darf && (
                <Button loading={laeuft} onClick={() => void speichern()} data-bank-speichern>
                  Speichern ({aufgaben.length} Aufgaben)
                </Button>
              )}
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
