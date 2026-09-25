import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Grid,
  Group,
  NumberInput,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core'
import { IconAlertTriangle, IconInfoCircle, IconSparkles } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { AiProgressTracker, remainingLabel, remainingSeconds } from '../../../shared/aiProgress'
import { useAppSettings } from '../../../shared/settingsStore'
import type { CefrTable } from '@shared/types'
import { notifyError } from '../../../shared/util'
import DropZone from '../../../shared/components/DropZone'
import SchulAngabe from '../../../shared/components/SchulAngabe'
import { extractContent, MATERIAL_ACCEPT } from '../../../shared/files/extractContent'
import { IconFileText, IconPhoto, IconX } from '@tabler/icons-react'
import { gradeRange, schoolTypesForState } from '../../arbeitsblatt/didactics/schoolProfiles'
import { STATES } from '../../arbeitsblatt/didactics/states'
import { SUBJECTS, subjectById } from '../../arbeitsblatt/model/subjects'
import { AUSGLEICH_HILFEN, type AusgleichHilfe } from '../didactics/bausteine'
import { SCHLUESSEL, schluesselById, type SchluesselId } from '../didactics/bewertung'
import { formateFuer, KURZTEST_FORMATE, standardMinuten, zeitWarnung } from '../didactics/formate'
import { istBelegt, namenAus, profilFuer } from '../didactics/operatoren'
import { themenAusZeile, themenFuer, themenHinweis, themenZeile, zweigeFuer } from '../didactics/themen'
import { generateKurztest } from '../generation/generateKurztest'
import { emptyKurztest, stufeFuerJahrgang } from '../model/defaults'
import type { WsBlock } from '../../arbeitsblatt/model/types'
import type { KurztestMeta, StoffQuelle } from '../model/types'
import { variantenLabel } from '../model/types'
import { aiCall, trackedAiCall, useLernzielkontrolle } from '../store'
import VorwissenChips from '../../arbeitsblatt/steps/VorwissenChips'

/**
 * Schritt 1: Lerngruppe, Landesformat, Umfang.
 *
 * Der Aufbau folgt dem, was die Recherche als entscheidend ergeben hat, und nicht der
 * Gewohnheit aus den anderen Programmen:
 *
 *   LINKS steht, was den Test bestimmt – Lerngruppe, Landesformat, Zeit und Stoff.
 *   RECHTS steht, worauf sich die App dabei stützt – die Operatorengrundlage mit ihrer
 *   Fundstelle, die Bewertung und der Nachteilsausgleich.
 *
 * Die rechte Spalte ist kein Beiwerk: Ob für das gewählte Land und die gewählte Stufe eine
 * amtliche Operatorenliste vorliegt, ändert, was die App der KI mitgibt – und das soll man
 * sehen, bevor man auf „Erstellen" drückt, nicht erst hinterher.
 */
export default function SetupStep(): React.JSX.Element {
  const { test, setTest, setStep, update } = useLernzielkontrolle()
  const settings = useAppSettings((s) => s.settings)
  const [table, setTable] = useState<CefrTable>({ version: 1, states: [] })
  const [busy, setBusy] = useState(false)
  const [stepMessage, setStepMessage] = useState<string | null>(null)
  const [chunkRatio, setChunkRatio] = useState(0)
  const [lese, setLese] = useState<string | null>(null)
  // Reiner Anzeigefilter fuer die Themenvorschlaege – gehoert nicht in den gespeicherten Test
  const [zweigWahl, setZweig] = useState('')
  const startedAt = useRef(0)

  /*
   * MUSS vor jedem frühen `return` stehen: Hooks müssen bei jedem Rendern in gleicher Zahl
   * und Reihenfolge laufen. Im Grammatiktest lief ein Hook hinter dem frühen Return nur
   * manchmal – die Oberfläche brach dann beim ersten Rendern ab (React #310), und zwar die
   * ganze App, weil die Programme im Hintergrund weiterlaufen.
   */
  useEffect(() => {
    Promise.all([window.api.cefr.get(), window.api.designs.list()])
      .then(([cefr, designs]) => {
        setTable(cefr)
        if (useLernzielkontrolle.getState().test) return
        const stateId = settings.defaults.stateId
        const schoolTypeId = settings.defaults.schoolTypeId
        const name = cefr.states.find((s) => s.id === stateId)?.schoolTypes.find((t) => t.id === schoolTypeId)?.name ?? 'Gymnasium'
        const neu = emptyKurztest(stateId, schoolTypeId, name)
        const design = designs.find((d) => d.isDefault) ?? designs[0]
        if (design) neu.design = design
        setTest(neu)
      })
      .catch(notifyError)
    // Läuft auch nach „Neue Kontrolle": Dort wird verworfen, und dieser Schritt legt sofort eine frische an
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test === null])

  if (!test) return <Container py="xl">Lade …</Container>
  const current = test
  const m = current.meta

  const patch = (next: Partial<KurztestMeta>): void => update((d) => Object.assign(d.meta, next))

  /**
   * Tafelbilder, Buchseiten und Hefteinträge einlesen.
   *
   * Bei einem Foto bleibt der Text leer – dort trägt allein das Bild die Information, und
   * die KI bekommt es als Bild. Bei einem PDF mit Textebene wird beides mitgegeben.
   */
  const dateienLesen = async (files: File[]): Promise<void> => {
    setLese('wird gelesen …')
    try {
      const neu: StoffQuelle[] = []
      for (const f of files) {
        setLese(`${f.name} wird gelesen …`)
        const c = await extractContent(f, (msg) => setLese(`${f.name}: ${msg}`))
        neu.push({ id: `q${Date.now()}-${neu.length}`, fileName: c.fileName, kind: c.kind, text: c.text, bilder: c.pageImages, aktiv: true })
      }
      update((d) => {
        d.meta.stoffQuellen = [...(d.meta.stoffQuellen ?? []), ...neu]
      })
    } catch (e) {
      notifyError(e, 'Die Datei konnte nicht gelesen werden')
    } finally {
      setLese(null)
    }
  }

  const types = schoolTypesForState(table, m.stateId)
  const range = gradeRange(table, m.stateId, m.schoolTypeId)
  const grades = Array.from({ length: range.max - range.min + 1 }, (_, i) => range.min + i)
  const formate = formateFuer(m.stateId)
  const format = KURZTEST_FORMATE.find((f) => f.id === m.formatId)
  const profil = profilFuer(m.stateId, m.subjectId, m.stufe, m.schoolTypeId)
  const zeit = zeitWarnung(m.minutes, format)
  const zweige = zweigeFuer(m.stateId, m.subjectId, m.grade, m.schoolTypeId)
  // Fällt der gewählte Zweig weg (anderes Fach, anderer Jahrgang), gilt wieder „alle"
  const zweig = zweige.includes(zweigWahl) ? zweigWahl : ''
  const vorschlaege = themenFuer(m.stateId, m.subjectId, m.grade, m.schoolTypeId, zweig)
  const themenText = themenHinweis(m.stateId, m.subjectId, m.grade, m.schoolTypeId, zweig)
  const bereit = Boolean(m.thema.trim())

  const create = async (): Promise<void> => {
    setBusy(true)
    startedAt.current = Date.now()
    setChunkRatio(0)
    const tracker = new AiProgressTracker(() => setChunkRatio(tracker.ratio()))
    try {
      /*
       * Die Varianten werden NACHEINANDER erzeugt, nicht parallel.
       * Parallel wäre schneller, aber jede Anfrage kostet Kontingent, und bei einem Fehler
       * in der dritten wären die ersten beiden schon bezahlt. Nacheinander bricht sauber ab.
       */
      const varianten: { id: string; label: string; blocks: WsBlock[] }[] = []
      for (let i = 0; i < m.varianten; i++) {
        const label = variantenLabel(i, m.varianten)
        const blocks = await generateKurztest(current, label, trackedAiCall(tracker), setStepMessage)
        varianten.push({ id: `v${i + 1}`, label, blocks })
      }
      update((d) => {
        d.varianten = varianten
      })
      setStep(1)
    } catch (e) {
      notifyError(e, 'Die Lernzielkontrolle konnte nicht erstellt werden')
    } finally {
      tracker.dispose()
      setBusy(false)
      setStepMessage(null)
      setChunkRatio(0)
    }
  }

  return (
    <Container size="xl" py="md">
      <Grid>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Stack>
            <Card withBorder>
              <Title order={4} mb="sm">
                Lerngruppe
              </Title>
              <Stack gap="sm">
                <Group grow>
                  <Select
                    label="Fach"
                    data={SUBJECTS.map((s) => ({ value: s.id, label: s.label }))}
                    value={m.subjectId}
                    onChange={(v) => v && patch({ subjectId: v, subjectLabel: subjectById(v).label })}
                    allowDeselect={false}
                    searchable
                  />
                  <Select
                    label="Jahrgang"
                    data={grades.map((g) => ({ value: String(g), label: `Klasse ${g}` }))}
                    value={String(m.grade)}
                    onChange={(v) => v && patch({ grade: Number(v), stufe: stufeFuerJahrgang(Number(v)) })}
                    allowDeselect={false}
                  />
                </Group>
                <SchulAngabe
                  stateId={m.stateId}
                  stateName={STATES.find((s) => s.id === m.stateId)?.name ?? m.stateId}
                  schoolTypeId={m.schoolTypeId}
                  schoolTypeName={m.schoolTypeName}
                >
                  <Group grow>
                    <Select
                      label="Bundesland"
                      data={STATES.map((s) => ({ value: s.id, label: s.name }))}
                      value={m.stateId}
                      onChange={(v) => {
                        if (!v) return
                        const list = schoolTypesForState(table, v)
                        const keep = list.some((t) => t.value === m.schoolTypeId)
                        const neuFormat = formateFuer(v)[0]
                        patch({
                          stateId: v,
                          schoolTypeId: keep ? m.schoolTypeId : (list[0]?.value ?? 'gymnasium'),
                          schoolTypeName: keep ? m.schoolTypeName : (list[0]?.label ?? 'Gymnasium'),
                          formatId: neuFormat?.id ?? '',
                          bezeichnung: neuFormat?.bezeichnung ?? 'Lernzielkontrolle',
                          minutes: standardMinuten(neuFormat)
                        })
                      }}
                      allowDeselect={false}
                      searchable
                    />
                    <Select
                      label="Schulform"
                      data={types}
                      value={m.schoolTypeId}
                      onChange={(v) => v && patch({ schoolTypeId: v, schoolTypeName: types.find((t) => t.value === v)?.label ?? '' })}
                      allowDeselect={false}
                    />
                  </Group>
                </SchulAngabe>
                <div>
                  <Text size="sm" fw={500} mb={4}>
                    Stufe
                  </Text>
                  <SegmentedControl
                    fullWidth
                    size="sm"
                    value={m.stufe}
                    onChange={(v) => patch({ stufe: v as 'sek1' | 'sek2' })}
                    data={[
                      { value: 'sek1', label: 'Sekundarstufe I' },
                      { value: 'sek2', label: 'Sekundarstufe II' }
                    ]}
                  />
                  <Text size="xs" c="dimmed" mt={4}>
                    Bestimmt die Operatorengrundlage und die Anrede. Die Länderlisten sind fast alle Abiturdokumente – für Klasse 7 gilt eine andere Grundlage
                    als für Klasse 12.
                  </Text>
                </div>
              </Stack>
            </Card>

            <Card withBorder>
              <Title order={4} mb="sm">
                Format
              </Title>
              <Stack gap="sm">
                {formate.length > 0 ? (
                  <Select
                    label={`So heißt das Format in ${STATES.find((s) => s.id === m.stateId)?.name}`}
                    data={formate.map((f) => ({ value: f.id, label: f.bezeichnung }))}
                    value={m.formatId}
                    onChange={(v) => {
                      const f = KURZTEST_FORMATE.find((x) => x.id === v)
                      if (f) patch({ formatId: f.id, bezeichnung: f.bezeichnung, minutes: standardMinuten(f) })
                    }}
                    allowDeselect={false}
                  />
                ) : (
                  <Alert color="gray" icon={<IconInfoCircle size={16} />}>
                    Für dieses Bundesland wurde kein eigenes Kurztestformat ermittelt. Die Bezeichnung auf dem Blatt lässt sich frei wählen.
                  </Alert>
                )}
                <TextInput
                  label="Bezeichnung auf dem Blatt"
                  value={m.bezeichnung}
                  onChange={(e) => patch({ bezeichnung: e.currentTarget.value })}
                  placeholder="Lernzielkontrolle"
                />
                {format && (
                  <Card withBorder padding="xs" bg="var(--mantine-color-gray-0)">
                    <Stack gap={4}>
                      <Group gap="xs">
                        <Badge
                          size="sm"
                          variant="light"
                          color={format.ankuendigung === 'unangekuendigt' ? 'orange' : format.ankuendigung === 'pflicht' ? 'blue' : 'gray'}
                        >
                          {format.ankuendigung === 'unangekuendigt'
                            ? 'darf unangekündigt sein'
                            : format.ankuendigung === 'pflicht'
                              ? `${format.fristTage} Tage vorher ankündigen`
                              : 'Ankündigung nicht geregelt'}
                        </Badge>
                        <Badge size="sm" variant="light" color="gray">
                          {format.maxMinuten ? `höchstens ${format.maxMinuten} Minuten` : 'Dauer nicht normiert'}
                        </Badge>
                        {format.stoffStunden && (
                          <Badge size="sm" variant="light" color="gray">
                            Stoff aus höchstens {format.stoffStunden} Stunden
                          </Badge>
                        )}
                        {!format.amtlich && (
                          <Tooltip label="Die Fundstelle stammt von einem privaten Spiegel, nicht aus einer amtlichen Verkündung.">
                            <Badge size="sm" variant="light" color="yellow">
                              nicht amtlich abgerufen
                            </Badge>
                          </Tooltip>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed">
                        {format.anzahl}
                      </Text>
                      <Text size="xs" c="dimmed">
                        Quelle: {format.fundstelle}
                      </Text>
                      {format.hinweis && (
                        <Text size="xs" c="orange.8" mt={4}>
                          {format.hinweis}
                        </Text>
                      )}
                    </Stack>
                  </Card>
                )}
              </Stack>
            </Card>

            <Card withBorder>
              <Title order={4} mb="sm">
                Inhalt und Umfang
              </Title>
              <Stack gap="sm">
                {/*
                 * Themenfeld mit Vorschlaegen – aber FREI beschreibbar.
                 *
                 * `TagsInput` erlaubt beides: aus der Liste waehlen und eigenes eintippen.
                 * Gibt es fuer Land, Fach und Jahrgang keine erhobenen Themen, bleibt es
                 * ein gewoehnliches Eingabefeld ohne Liste – eine leere Auswahlliste waere
                 * schlimmer als keine.
                 */}
                <div>
                  {/*
                   * Zweig-Auswahl – nur dort, wo der Lehrplan wirklich trennt.
                   *
                   * Sachsen teilt die Oberschule ab Klasse 7 in Haupt- und
                   * Realschulbildungsgang, Bayern die Realschule in
                   * Wahlpflichtfaechergruppen und die Mittelschule in Regel- und M-Klasse –
                   * jeweils mit ANDEREN Themen. Ohne diese Auswahl stuenden beide Listen
                   * vermischt da. Standard bleibt „alle Zweige": Wer den Unterschied nicht
                   * kennt, bekommt lieber zu viel als das Falsche.
                   */}
                  {zweige.length > 1 && (
                    <Select
                      size="xs"
                      label="Zweig laut Lehrplan"
                      description="Bestimmt nur, welche Themen vorgeschlagen werden."
                      data={[{ value: '', label: 'Alle Zweige' }, ...zweige.map((z) => ({ value: z, label: z }))]}
                      value={zweig}
                      onChange={(v) => setZweig(v ?? '')}
                      allowDeselect={false}
                      mb="xs"
                      style={{ maxWidth: 360 }}
                    />
                  )}
                  <TagsInput
                    label="Thema"
                    placeholder={m.thema ? '' : 'z. B. Potenzgesetze'}
                    data={vorschlaege.map((v) => v.thema)}
                    value={themenAusZeile(m.thema)}
                    onChange={(werte) => patch({ thema: themenZeile(werte) })}
                    maxDropdownHeight={280}
                    clearable
                    acceptValueOnBlur
                    required
                  />
                  {themenText && (
                    <Text size="xs" c="dimmed" mt={4}>
                      {themenText}
                    </Text>
                  )}
                </div>
                <Textarea
                  label="Was wurde unmittelbar vorher behandelt?"
                  description="Die Stoffgrenze des Formats – in Bayern höchstens zwei, in Rheinland-Pfalz höchstens zehn vorangegangene Unterrichtsstunden."
                  placeholder="z. B. Produkt- und Quotientenregel bei gleicher Basis, Potenzieren einer Potenz"
                  autosize
                  minRows={2}
                  value={m.stoff}
                  onChange={(e) => patch({ stoff: e.currentTarget.value })}
                />
                {/* Hier meint das Feld den geprüften Stoff: typische Inhalte der Einheit statt Vorwissen */}
                <VorwissenChips
                  modus="stoff"
                  anfrage={{ subjectId: m.subjectId, topic: m.thema, grade: m.grade, stateId: m.stateId, schoolTypeId: m.schoolTypeId }}
                  wert={m.stoff}
                  onChange={(stoff) => patch({ stoff })}
                  ai={aiCall}
                />
                <DropZone
                  onFiles={(f) => void dateienLesen(f)}
                  accept={MATERIAL_ACCEPT}
                  title={lese ?? 'Tafelbild, Buchseite oder Hefteintrag hierher ziehen'}
                  hint="Foto, PDF, Word – auch handschriftlich"
                  loading={Boolean(lese)}
                  minHeight={70}
                />
                {(m.stoffQuellen ?? []).length > 0 && (
                  <Stack gap={4}>
                    {(m.stoffQuellen ?? []).map((q) => (
                      <Group key={q.id} gap="xs" wrap="nowrap">
                        <Checkbox
                          size="xs"
                          checked={q.aktiv}
                          onChange={(e) =>
                            update((d) => {
                              const t = d.meta.stoffQuellen.find((x) => x.id === q.id)
                              if (t) t.aktiv = e.currentTarget.checked
                            })
                          }
                        />
                        {q.kind === 'image' ? <IconPhoto size={15} /> : <IconFileText size={15} />}
                        <Text size="xs" style={{ flex: 1 }} truncate>
                          {q.fileName}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {q.text.trim() ? `${Math.round(q.text.length / 100) / 10}k Zeichen` : 'nur Bild'}
                          {q.bilder.length ? ` · ${q.bilder.length} Seite${q.bilder.length > 1 ? 'n' : ''}` : ''}
                        </Text>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="gray"
                          aria-label="Entfernen"
                          onClick={() =>
                            update((d) => {
                              d.meta.stoffQuellen = d.meta.stoffQuellen.filter((x) => x.id !== q.id)
                            })
                          }
                        >
                          <IconX size={14} />
                        </ActionIcon>
                      </Group>
                    ))}
                    <Text size="xs" c="dimmed">
                      Die KI bleibt innerhalb dessen, was hier steht – Schreibweise, Beispiele und Reihenfolge werden übernommen.
                    </Text>
                  </Stack>
                )}
                <Group grow align="flex-start">
                  <NumberInput label="Bearbeitungszeit (Minuten)" min={5} max={60} value={m.minutes} onChange={(v) => patch({ minutes: Number(v) || 20 })} />
                  <div>
                    <Text size="sm" fw={500} mb={4}>
                      Fassungen
                    </Text>
                    <SegmentedControl
                      fullWidth
                      size="sm"
                      value={String(m.varianten)}
                      onChange={(v) => patch({ varianten: Number(v) })}
                      data={[
                        { value: '1', label: 'eine' },
                        { value: '2', label: 'A / B' },
                        { value: '3', label: 'A / B / C' }
                      ]}
                    />
                  </div>
                </Group>
                {zeit && (
                  <Alert
                    color={zeit.ueberschritten ? 'orange' : 'gray'}
                    icon={zeit.ueberschritten ? <IconAlertTriangle size={16} /> : <IconInfoCircle size={16} />}
                  >
                    {zeit.message}
                  </Alert>
                )}
              </Stack>
            </Card>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack>
            <Card withBorder>
              <Group justify="space-between" mb="sm">
                <Title order={4}>Operatoren</Title>
                {profil && (
                  <Group gap={6}>
                    {/* Eine Anhoerfassung ist ein Entwurf und kann sich noch aendern – das gehoert sichtbar hierher */}
                    {/anhörfassung|entwurf|arbeitsfassung/i.test(profil.stand) && (
                      <Badge size="sm" variant="filled" color="yellow">
                        Entwurf
                      </Badge>
                    )}
                    <Badge size="sm" variant="light" color={istBelegt(profil) ? 'teal' : 'yellow'}>
                      {istBelegt(profil) ? 'amtliche Liste' : 'ohne Landesliste'}
                    </Badge>
                  </Group>
                )}
              </Group>
              {profil ? (
                <Stack gap={6}>
                  <Text size="xs" c="dimmed">
                    {profil.quelle}
                    {profil.stand ? ` · Stand ${profil.stand}` : ''}
                  </Text>
                  {/*
                   * Anklickbar: Die Lehrkraft wählt die Operatoren aus, die sie in diesem Test
                   * sehen möchte. Die Auswahl ist ein VORSCHLAG an die KI, kein Zwang – manche
                   * Antwortformen verlangen einen bestimmten Operator, und ein erzwungener
                   * erzeugte genau den Fehler, den die App sonst meldet.
                   */}
                  <Group gap={4}>
                    {namenAus(profil).map((n) => {
                      const gewaehlt = (m.bevorzugteOperatoren ?? []).includes(n)
                      return (
                        <Badge
                          key={n}
                          size="xs"
                          variant={gewaehlt ? 'filled' : 'outline'}
                          color={gewaehlt ? 'grape' : 'gray'}
                          tt="none"
                          style={{ cursor: 'pointer' }}
                          role="checkbox"
                          aria-checked={gewaehlt}
                          onClick={() =>
                            patch({
                              bevorzugteOperatoren: gewaehlt ? (m.bevorzugteOperatoren ?? []).filter((x) => x !== n) : [...(m.bevorzugteOperatoren ?? []), n]
                            })
                          }
                        >
                          {n}
                        </Badge>
                      )
                    })}
                  </Group>
                  <Group gap="xs" justify="space-between">
                    <Text size="xs" c="dimmed">
                      {(m.bevorzugteOperatoren ?? []).length
                        ? `${(m.bevorzugteOperatoren ?? []).length} bevorzugt – als Vorschlag, nicht als Zwang`
                        : 'Anklicken, um Operatoren für diesen Test vorzuschlagen'}
                    </Text>
                    {(m.bevorzugteOperatoren ?? []).length > 0 && (
                      <Button size="compact-xs" variant="subtle" color="gray" onClick={() => patch({ bevorzugteOperatoren: [] })}>
                        Auswahl aufheben
                      </Button>
                    )}
                  </Group>
                  {!profil.oeffnungsklausel && (
                    <Text size="xs" c="orange.8">
                      Diese Liste hat keine Öffnungsklausel – nur die genannten Operatoren sind zulässig.
                    </Text>
                  )}
                  {profil.hinweis && (
                    <Text size="xs" c="dimmed">
                      {profil.hinweis}
                    </Text>
                  )}
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">
                  Keine Grundlage gefunden.
                </Text>
              )}
            </Card>

            <Card withBorder>
              <Title order={4} mb="sm">
                Bewertung
              </Title>
              <Stack gap="sm">
                <Switch
                  label="Punkte je Aufgabe auf dem Blatt"
                  checked={m.bewertung.punkteAufBlatt}
                  onChange={(e) => patch({ bewertung: { ...m.bewertung, punkteAufBlatt: e.currentTarget.checked } })}
                />
                {m.bewertung.punkteAufBlatt && (
                  <>
                    <Switch
                      label="Punktzahl vorgeben"
                      description="Ohne Vorgabe richtet sich die Bepunktung allein nach dem Aufwand der Aufgaben."
                      checked={Boolean(m.bewertung.bereich)}
                      onChange={(e) => patch({ bewertung: { ...m.bewertung, bereich: e.currentTarget.checked ? { min: 8, max: 12 } : undefined } })}
                    />
                    {m.bewertung.bereich && (
                      <Group grow>
                        <NumberInput
                          label="von"
                          min={1}
                          max={100}
                          value={m.bewertung.bereich.min}
                          onChange={(v) => patch({ bewertung: { ...m.bewertung, bereich: { ...m.bewertung.bereich!, min: Number(v) || 1 } } })}
                        />
                        <NumberInput
                          label="bis"
                          min={1}
                          max={100}
                          value={m.bewertung.bereich.max}
                          onChange={(v) => patch({ bewertung: { ...m.bewertung, bereich: { ...m.bewertung.bereich!, max: Number(v) || 1 } } })}
                        />
                      </Group>
                    )}
                  </>
                )}
                <Select
                  label="Notenschlüssel (nur auf dem Lösungsblatt)"
                  data={[
                    { value: 'keiner', label: 'keiner' },
                    ...SCHLUESSEL.map((s) => ({ value: s.id, label: s.name })),
                    { value: 'eigen', label: 'eigener Schlüssel' }
                  ]}
                  value={m.bewertung.schluessel}
                  onChange={(v) => v && patch({ bewertung: { ...m.bewertung, schluessel: v as SchluesselId } })}
                  allowDeselect={false}
                />
                {schluesselById(m.bewertung.schluessel) && (
                  <Text size="xs" c={schluesselById(m.bewertung.schluessel)!.verbindlich ? 'teal.8' : 'dimmed'}>
                    {schluesselById(m.bewertung.schluessel)!.herkunft}
                  </Text>
                )}
                <Switch label="Lösungsblatt für die Lehrkraft" checked={m.answerKey} onChange={(e) => patch({ answerKey: e.currentTarget.checked })} />
                <Switch label="Felder für Name, Klasse und Datum" checked={m.nameFeld} onChange={(e) => patch({ nameFeld: e.currentTarget.checked })} />
              </Stack>
            </Card>

            <Card withBorder>
              <Title order={4} mb="sm">
                Nachteilsausgleich
              </Title>
              <Stack gap="sm">
                <Switch
                  label="Sprachliche Hilfen zulassen"
                  description="Sonst enthält das Blatt nur Aufgaben und Material – keine Wortspeicher, keine Satzanfänge."
                  checked={m.nachteilsausgleich.aktiv}
                  onChange={(e) => patch({ nachteilsausgleich: { ...m.nachteilsausgleich, aktiv: e.currentTarget.checked } })}
                />
                {m.nachteilsausgleich.aktiv && (
                  <>
                    <Checkbox.Group
                      value={m.nachteilsausgleich.hilfen}
                      onChange={(v) => patch({ nachteilsausgleich: { ...m.nachteilsausgleich, hilfen: v as AusgleichHilfe[] } })}
                    >
                      <Stack gap={6}>
                        {AUSGLEICH_HILFEN.map((h) => (
                          <Checkbox key={h} value={h} label={h === 'wortspeicher' ? 'Wortspeicher' : 'Satzanfänge'} />
                        ))}
                      </Stack>
                    </Checkbox.Group>
                    <TextInput
                      label="Vermerk für die Lehrkraft"
                      placeholder="z. B. für zwei Lernende mit DaZ-Förderung"
                      value={m.nachteilsausgleich.vermerk ?? ''}
                      onChange={(e) => patch({ nachteilsausgleich: { ...m.nachteilsausgleich, vermerk: e.currentTarget.value } })}
                    />
                    <Text size="xs" c="dimmed">
                      Der Ausgleich passt die Bedingungen an, nicht die Anforderungen. Tipp- und Hilfekarten bleiben deshalb auch hier gesperrt – sie nähmen
                      einen Teil der geprüften Leistung vorweg.
                    </Text>
                  </>
                )}
              </Stack>
            </Card>

            <Card withBorder>
              <Stack gap="sm">
                <Button size="md" leftSection={<IconSparkles size={18} />} loading={busy} disabled={!bereit} onClick={() => void create()}>
                  {m.varianten > 1 ? `${m.varianten} Fassungen erstellen` : 'Lernzielkontrolle erstellen'}
                </Button>
                {!bereit && (
                  <Text size="xs" c="dimmed">
                    Bitte zuerst ein Thema angeben.
                  </Text>
                )}
                {busy && (
                  <Stack gap={4}>
                    <Progress value={chunkRatio * 100} animated size="sm" />
                    <Text size="xs" c="dimmed">
                      {stepMessage} {remainingLabel(remainingSeconds(chunkRatio, Date.now() - startedAt.current))}
                    </Text>
                  </Stack>
                )}
              </Stack>
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>
    </Container>
  )
}
