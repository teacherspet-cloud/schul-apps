import VersuchKarte from '../../arbeitsblatt/steps/VersuchKarte'
import { hatProtokolle, versuchAnfrage, versuchAus } from '../../arbeitsblatt/didactics/protokoll'
import { lzkLerngruppe } from '../model/versuch'
import { nimmFachVorgabe } from '../../../shared/fachVorgabe'
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Container,
  Grid,
  Group,
  NumberInput,
  ScrollArea,
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
import { useEffect, useMemo, useState } from 'react'
import { starteAuftrag } from '../../../shared/auftraege'
import { defaultKurztestName, kurztestOffen, legeKurztestAb } from '../library'
import GradeScaleModal from '../../../shared/components/GradeScaleModal'
import { thresholdsForSubject } from '../../../shared/gradeScale'
import { useAppSettings } from '../../../shared/settingsStore'
import type { CefrTable } from '@shared/types'
import { notifyError } from '../../../shared/util'
import StoffQuellen from '../../../shared/components/StoffQuellen'
import { gradeRange } from '../../arbeitsblatt/didactics/schoolProfiles'
import { STATES } from '../../arbeitsblatt/didactics/states'
import SchulortFelder from '../../../shared/components/SchulortFelder'
import { mitLerngruppe } from '../../../shared/lerngruppe'
import { SUBJECTS, subjectById } from '../../arbeitsblatt/model/subjects'
import { AUSGLEICH_HILFEN, type AusgleichHilfe } from '../didactics/bausteine'
import {
  gesamtpunkte,
  grenzenFuer,
  SCHLUESSEL,
  schluesselById,
  STANDARD_BEWERTUNG,
  type Bewertungseinstellung,
  type SchluesselId
} from '../didactics/bewertung'
import { formateFuer, KURZTEST_FORMATE, standardMinuten, zeitWarnung } from '../didactics/formate'
import { istBelegt, namenAus, profilFuer } from '../didactics/operatoren'
import { themenAusZeile, themenFuer, themenHinweis, themenZeile, zweigeFuer } from '../didactics/themen'
import { generateKurztest } from '../generation/generateKurztest'
import { emptyKurztest, stufeFuerJahrgang } from '../model/defaults'
import type { WsBlock } from '../../arbeitsblatt/model/types'
import type { KurztestMeta } from '../model/types'
import { variantenLabel } from '../model/types'
import { aiCall, useLernzielkontrolle } from '../store'
import VorwissenChips from '../../arbeitsblatt/steps/VorwissenChips'
import HaeufigSelect from '../../../shared/components/HaeufigSelect'
import Formularfuss, { ersterGrund, FormularSeite, KeinKiZugang } from '../../../shared/components/Formularfuss'
import MehrText from '../../../shared/components/MehrText'
import WeitereOptionen from '../../../shared/components/WeitereOptionen'
import VorlagenfarbeSchalter from '../../../shared/components/VorlagenfarbeSchalter'
import { useKiZugang } from '../../../shared/useKiZugang'
import { UeberthemaFeldFuer } from '../../../shared/components/UeberthemaFeld'

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
  const { test, setTest, update } = useLernzielkontrolle()
  const settings = useAppSettings((s) => s.settings)
  const [table, setTable] = useState<CefrTable>({ version: 1, states: [] })
  // Reiner Anzeigefilter fuer die Themenvorschlaege – gehoert nicht in den gespeicherten Test
  const [zweigWahl, setZweig] = useState('')
  const [schluesselOffen, setSchluesselOffen] = useState(false)
  const kiDa = useKiZugang()
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
        // „Neu in diesem Bereich" gibt das Fach des Themenbereichs vor (shared/fachVorgabe.ts)
        const vorgabe = nimmFachVorgabe('lernzielkontrolle')
        if (vorgabe && subjectById(vorgabe).id === vorgabe) {
          neu.meta.subjectId = vorgabe
          neu.meta.subjectLabel = subjectById(vorgabe).label
        }
        const design = designs.find((d) => d.isDefault) ?? designs[0]
        if (design) neu.design = design
        setTest(neu)
      })
      .catch(notifyError)
    // Läuft auch nach „Neue Kontrolle": Dort wird verworfen, und dieser Schritt legt sofort eine frische an
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test === null])

  /*
   * Schlüssel aus den Einstellungen (je Fach) – Ausgangspunkt für einen eigenen Schlüssel.
   * Gemerkt, weil das Notenschlüssel-Fenster bei jedem NEUEN Feld seinen Entwurf zurücksetzt:
   * Ein bei jedem Rendern frisch gebautes Feld hätte jede Eingabe dort sofort überschrieben.
   */
  const schwellen = useMemo(() => thresholdsForSubject(settings.gradeScale, test?.meta.subjectId ?? ''), [settings.gradeScale, test?.meta.subjectId])
  const eigeneGrenzen = test?.meta.bewertung.eigeneGrenzen
  const schluesselImFenster = useMemo(() => (eigeneGrenzen ? [...eigeneGrenzen, 0] : schwellen), [eigeneGrenzen, schwellen])

  if (!test) return <Container py="xl">Wird geladen …</Container>
  const current = test
  const m = current.meta

  // Fortlaufendes Tippen im selben Feld ist EIN Schritt für Strg+Z, nicht einer je Buchstabe
  const patch = (next: Partial<KurztestMeta>): void => update((d) => Object.assign(d.meta, next), `angaben:${Object.keys(next).sort().join(',')}`)

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

  /*
   * Erstellen läuft als Hintergrund-Auftrag (shared/auftraege.ts) – mit einer Kopie der
   * Angaben von jetzt, abgelegt in DIESER Kontrolle. Das Programm zeigt bis dahin einen
   * Hinweis; die Auftragsleiste zeigt den Fortschritt über alle Fassungen.
   */
  const create = (): void => {
    const docId = useLernzielkontrolle.getState().docId
    void starteAuftrag({
      moduleId: 'lernzielkontrolle',
      docId,
      titel: defaultKurztestName(current),
      art: m.varianten > 1 ? `${m.varianten} Fassungen erstellen` : 'Lernzielkontrolle erstellen',
      eingabe: current,
      istOffen: () => kurztestOffen(docId),
      fehlerTitel: 'Die Lernzielkontrolle konnte nicht erstellt werden',
      arbeit: async (t, k) => {
        /*
         * Die Varianten werden NACHEINANDER erzeugt, nicht parallel.
         * Parallel wäre schneller, aber jede Anfrage kostet Kontingent, und bei einem Fehler
         * in der dritten wären die ersten beiden schon bezahlt. Nacheinander bricht sauber ab.
         */
        // Versuch (29.09.2026): zuerst ausarbeiten – alle Fassungen protokollieren denselben Versuch
        if (t.meta.versuch?.aktiv && !t.meta.versuch.daten) {
          k.melde('Die KI arbeitet den Versuch aus …', 0, t.meta.varianten)
          const daten = versuchAus(await k.ai<unknown>(versuchAnfrage(lzkLerngruppe(t.meta), t.meta.versuch)))
          t = { ...t, meta: { ...t.meta, versuch: { ...t.meta.versuch, daten } } }
        }
        const varianten: { id: string; label: string; blocks: WsBlock[] }[] = []
        const anzahl = t.meta.varianten
        for (let i = 0; i < anzahl; i++) {
          const label = variantenLabel(i, anzahl)
          // Fortschritt über ALLE Fassungen – sonst spränge der Balken je Fassung auf null zurück
          const blocks = await generateKurztest(t, label, k.ai, (msg) => k.melde(anzahl > 1 ? `${label}: ${msg}` : msg, i, anzahl))
          varianten.push({ id: `v${i + 1}`, label, blocks })
          k.melde(`${i + 1} von ${anzahl} Fassungen fertig`, i + 1, anzahl)
        }
        return { varianten, versuch: t.meta.versuch?.daten }
      },
      // Ein eigener Verlaufsschritt: Strg+Z holt die vorige Fassung zurück (Rückfragen sind abgewählt)
      ablegen: (erg, t) =>
        legeKurztestAb(
          docId,
          t,
          (aktuell) => ({
            ...aktuell,
            varianten: erg.varianten,
            ...(erg.versuch && aktuell.meta.versuch ? { meta: { ...aktuell.meta, versuch: { ...aktuell.meta.versuch, daten: erg.versuch } } } : {})
          }),
          1
        )
    })
  }

  // Der Hauptknopf steht fest unten und sagt, was fehlt (Paket 6)
  const sperrgrund = ersterGrund([!bereit, 'Thema fehlt'], [!kiDa, <KeinKiZugang key="ki" />])
  const fuss = (
    <Formularfuss grund={sperrgrund}>
      <Button size="md" leftSection={<IconSparkles size={18} />} disabled={Boolean(sperrgrund)} onClick={create}>
        {m.varianten > 1 ? `${m.varianten} Fassungen erstellen` : 'Lernzielkontrolle erstellen'}
      </Button>
    </Formularfuss>
  )

  return (
    <FormularSeite fuss={fuss}>
      <ScrollArea h="100%">
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
                      <HaeufigSelect
                        art="fach"
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
                    <SchulortFelder
                      table={table}
                      stateId={m.stateId}
                      schoolTypeId={m.schoolTypeId}
                      schoolTypeName={m.schoolTypeName}
                      searchable
                      onChange={(p) => {
                        // Neues Land: auch das Landesformat neu setzen
                        const neuFormat = p.stateId ? formateFuer(p.stateId)[0] : null
                        patch({
                          ...mitLerngruppe(table, m, p),
                          ...(neuFormat !== null
                            ? { formatId: neuFormat?.id ?? '', bezeichnung: neuFormat?.bezeichnung ?? 'Lernzielkontrolle', minutes: standardMinuten(neuFormat) }
                            : {})
                        })
                      }}
                    />
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
                    {format && (
                      <Card withBorder padding="xs" bg="var(--mantine-color-default-hover)">
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
                          {/* Rechtliche Einzelheiten hinter „Mehr“ – vollständig, nur nicht mehr alle auf einmal (Paket 6) */}
                          <MehrText kurz={format.anzahl}>
                            <Text size="xs" c="dimmed">
                              Quelle: {format.fundstelle}
                            </Text>
                            {format.hinweis && (
                              <Text size="xs" c="orange.8" mt={4}>
                                {format.hinweis}
                              </Text>
                            )}
                          </MehrText>
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
                      {themenText && <MehrText text={themenText} mt={4} />}
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
                    {/* Tafelbild, Buchseite, Hefteintrag – dieselbe Fläche wie in der Klassenarbeit (shared/components/StoffQuellen) */}
                    <StoffQuellen
                      quellen={m.stoffQuellen ?? []}
                      onHinzu={(neu) =>
                        update((d) => {
                          d.meta.stoffQuellen = [...(d.meta.stoffQuellen ?? []), ...neu]
                        })
                      }
                      onAktiv={(id, aktiv) =>
                        update((d) => {
                          const t = d.meta.stoffQuellen.find((x) => x.id === id)
                          if (t) t.aktiv = aktiv
                        })
                      }
                      onEntfernen={(id) =>
                        update((d) => {
                          d.meta.stoffQuellen = d.meta.stoffQuellen.filter((x) => x.id !== id)
                        })
                      }
                      title="Tafelbild, Buchseite oder Hefteintrag hierher ziehen"
                      hint="Foto, PDF, Word – auch handschriftlich"
                      erklaerung="Die KI bleibt innerhalb dessen, was hier steht – Schreibweise, Beispiele und Reihenfolge werden übernommen."
                    />
                    <Group grow align="flex-start">
                      <NumberInput
                        label="Bearbeitungszeit (Minuten)"
                        min={5}
                        max={60}
                        value={m.minutes}
                        onChange={(v) => patch({ minutes: Number(v) || 20 })}
                      />
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
                {/* Versuch mit Protokoll (29.09.2026) – in Fächern mit Versuchen, Messungen, Beobachtungen */}
                {hatProtokolle(m.subjectId) && (
                  <VersuchKarte lerngruppe={lzkLerngruppe(m)} versuch={m.versuch} patchVersuch={(versuch) => patch({ versuch })} pruefung />
                )}
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
                                  bevorzugteOperatoren: gewaehlt
                                    ? (m.bevorzugteOperatoren ?? []).filter((x) => x !== n)
                                    : [...(m.bevorzugteOperatoren ?? []), n]
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
                      {profil.hinweis && <MehrText text={profil.hinweis} />}
                    </Stack>
                  ) : (
                    <Text size="sm" c="dimmed">
                      Keine Grundlage gefunden.
                    </Text>
                  )}
                </Card>

                {/*
                 * Immer sichtbar (Paket 7, Nachtrag der Lehrkraft): Punkte, Lösungsblatt und sprachliche
                 * Hilfen werden fast bei jeder Kontrolle entschieden – eingeklappt suchte man sie jedes Mal.
                 */}
                <Card withBorder>
                  <Title order={4} mb="sm">
                    Blatt und Hilfen
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
                    <Switch label="Lösungsblatt für die Lehrkraft" checked={m.answerKey} onChange={(e) => patch({ answerKey: e.currentTarget.checked })} />
                    <Switch
                      label="Sprachliche Hilfen zulassen"
                      description="Nachteilsausgleich – sonst enthält das Blatt nur Aufgaben und Material, keine Wortspeicher und keine Satzanfänge."
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
                        <MehrText text="Der Ausgleich passt die Bedingungen an, nicht die Anforderungen. Tipp- und Hilfekarten bleiben deshalb auch hier gesperrt – sie nähmen einen Teil der geprüften Leistung vorweg." />
                      </>
                    )}
                  </Stack>
                </Card>
              </Stack>
            </Grid.Col>
          </Grid>

          {/*
           * Selten Geändertes eingeklappt (Paket 6): Stufe und Bezeichnung folgen aus Jahrgang und
           * Land, der Notenschlüssel hat eine feste Vorgabe. Die Überschrift nennt, was davon
           * abweicht. Punkte, Lösungsblatt und Hilfen stehen seit Paket 7 wieder oben.
           */}
          <Box mt="md">
            <WeitereOptionen modul="lernzielkontrolle" geaendert={geaenderteOptionen(m, format?.bezeichnung)}>
              <Grid>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Stack>
                    <Card withBorder>
                      <Stack gap="sm">
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
                            Bestimmt die Operatorengrundlage und die Anrede (Klasse 10 im G8 ist Einführungsphase und wird gesiezt). Die Länderlisten sind fast
                            alle Abiturdokumente – für Klasse 7 gilt eine andere Grundlage als für Klasse 12.
                          </Text>
                        </div>
                        <TextInput
                          label="Bezeichnung auf dem Blatt"
                          value={m.bezeichnung}
                          onChange={(e) => patch({ bezeichnung: e.currentTarget.value })}
                          placeholder="Lernzielkontrolle"
                        />
                        {/* Paket 10a: dezent in der Fachfarbe (Kopf, Überschriften) – hier abschaltbar */}
                        <VorlagenfarbeSchalter fach={m.subjectId} checked={Boolean(m.vorlagenfarbe)} onChange={(an) => patch({ vorlagenfarbe: an })} />
                        {/* Paket 11: Überthema dezent im Kopf – standardmäßig der Themenbereich */}
                        <UeberthemaFeldFuer moduleId="lernzielkontrolle" docId={useLernzielkontrolle.getState().docId} werte={m} onChange={(p) => patch(p)} />
                      </Stack>
                    </Card>
                  </Stack>
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Card withBorder>
                    <Title order={4} mb="sm">
                      Bewertung
                    </Title>
                    <Stack gap="sm">
                      <Select
                        label="Notenschlüssel (nur auf dem Lösungsblatt)"
                        data={[
                          { value: 'keiner', label: 'keiner' },
                          ...SCHLUESSEL.map((s) => ({ value: s.id, label: s.name })),
                          { value: 'eigen', label: 'eigener Schlüssel' }
                        ]}
                        value={m.bewertung.schluessel}
                        onChange={(v) => {
                          if (!v) return
                          const next: Bewertungseinstellung = { ...m.bewertung, schluessel: v as SchluesselId }
                          /*
                           * „Eigener Schlüssel" hatte bis 25.09.2026 keine Wirkung: Die Grenzen wurden
                           * nirgends gesetzt, und auf dem Lösungsblatt stand gar kein Schlüssel. Jetzt
                           * startet er mit dem bisher gewählten und öffnet das Fenster zum Anpassen.
                           */
                          if (v === 'eigen' && !m.bewertung.eigeneGrenzen) {
                            const bisher = grenzenFuer(m.bewertung, schwellen) ?? schwellen
                            next.eigeneGrenzen = [bisher[0], bisher[1], bisher[2], bisher[3], bisher[4]]
                          }
                          patch({ bewertung: next })
                          if (v === 'eigen') setSchluesselOffen(true)
                        }}
                        allowDeselect={false}
                      />
                      {m.bewertung.schluessel === 'eigen' && (
                        <Group gap="xs" wrap="nowrap">
                          <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                            {(m.bewertung.eigeneGrenzen ?? []).map((p, i) => `${i + 1} ab ${p} %`).join(' · ') || 'Noch keine Grenzen festgelegt.'}
                          </Text>
                          <Button size="compact-xs" variant="light" onClick={() => setSchluesselOffen(true)}>
                            Grenzen festlegen …
                          </Button>
                        </Group>
                      )}
                      {schluesselById(m.bewertung.schluessel) && (
                        <MehrText
                          text={schluesselById(m.bewertung.schluessel)!.herkunft}
                          c={schluesselById(m.bewertung.schluessel)!.verbindlich ? 'teal.8' : 'dimmed'}
                        />
                      )}
                      <Switch label="Felder für Name, Klasse und Datum" checked={m.nameFeld} onChange={(e) => patch({ nameFeld: e.currentTarget.checked })} />
                    </Stack>
                  </Card>
                </Grid.Col>
              </Grid>
            </WeitereOptionen>
          </Box>
          <Box h="md" />

          {/* Dasselbe Fenster wie im Grammatiktest und in den Einstellungen; die Sechs gilt immer ab 0 % */}
          <GradeScaleModal
            opened={schluesselOffen}
            onClose={() => setSchluesselOffen(false)}
            points={gesamtpunkte(current.varianten[0]?.blocks ?? [])}
            thresholds={schluesselImFenster}
            onChange={(t) => patch({ bewertung: { ...m.bewertung, schluessel: 'eigen', eigeneGrenzen: [t[0], t[1], t[2], t[3], t[4]] } })}
          />
        </Container>
      </ScrollArea>
    </FormularSeite>
  )
}

/**
 * Was unter „Weitere Optionen“ vom Standard abweicht (model/defaults.ts) – für die
 * Zusammenfassung in der eingeklappten Überschrift. Nur eingeklappte Felder: Punkte,
 * Lösungsblatt und sprachliche Hilfen stehen sichtbar oben und brauchen keine Erwähnung.
 */
export function geaenderteOptionen(m: KurztestMeta, formatBezeichnung?: string): string[] {
  const b = m.bewertung
  return [
    m.stufe !== stufeFuerJahrgang(m.grade) ? (m.stufe === 'sek2' ? 'Sekundarstufe II' : 'Sekundarstufe I') : '',
    formatBezeichnung && m.bezeichnung.trim() !== formatBezeichnung ? `Bezeichnung „${m.bezeichnung.trim() || 'leer'}“` : '',
    b.schluessel !== STANDARD_BEWERTUNG.schluessel
      ? b.schluessel === 'keiner'
        ? 'kein Notenschlüssel'
        : b.schluessel === 'eigen'
          ? 'eigener Notenschlüssel'
          : `Schlüssel ${schluesselById(b.schluessel)?.name ?? b.schluessel}`
      : '',
    m.nameFeld ? '' : 'ohne Namensfelder',
    m.vorlagenfarbe ? 'Farbe der Vorlage' : ''
  ].filter(Boolean)
}
