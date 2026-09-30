import { nimmFachVorgabe } from '../../../shared/fachVorgabe'
import { Alert, Box, Button, Card, Container, Grid, Group, NumberInput, ScrollArea, SegmentedControl, Select, Stack, Switch, Text, TextInput, Title } from '@mantine/core'
import { IconAlertTriangle, IconSparkles } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import type { DesignTemplate } from '@shared/design'
import { CEFR_SCALE, CefrLevel, CefrTable } from '@shared/types'
import GradeScaleModal from '../../../shared/components/GradeScaleModal'
import { gradeScaleLine } from '../../../shared/gradeScale'
import { notifyError } from '../../../shared/util'
import { useAppSettings } from '../../../shared/settingsStore'
import { chosenGrammarTopics, GRAMMAR_FORMATS, grammarFormatLabel, hasGrammar, learningYear, sequenceOf } from '../../arbeitsblatt/didactics/grammar'
import { gradeRange } from '../../arbeitsblatt/didactics/schoolProfiles'
import { suggestLevel } from '../../../shared/cefr'
import SchulortFelder from '../../../shared/components/SchulortFelder'
import { mitLerngruppe } from '../../../shared/lerngruppe'
import GrammarPicker from '../../arbeitsblatt/steps/GrammarPicker'
import { SUBJECTS, subjectById } from '../../arbeitsblatt/model/subjects'
import type { WorksheetMeta } from '../../arbeitsblatt/model/types'
import { generateTest, generateVerbTest } from '../generation/generateTest'
import { newTest } from '../model/defaults'
import { suggestedFormats, testingRules } from '../model/testRules'
import type { GrammarTest, GrammarTestMeta } from '../model/types'
import { useGrammatiktest } from '../store'
import { starteAuftrag } from '../../../shared/auftraege'
import { defaultTestName, legeTestAb, testOffen } from '../library'
import HaeufigSelect from '../../../shared/components/HaeufigSelect'
import Formularfuss, { ersterGrund, FormularSeite, KeinKiZugang } from '../../../shared/components/Formularfuss'
import MehrText from '../../../shared/components/MehrText'
import KreismenueKnopf from '../../../shared/components/Kreismenue'
import WeitereOptionen from '../../../shared/components/WeitereOptionen'
import VorlagenfarbeSchalter from '../../../shared/components/VorlagenfarbeSchalter'
import { useKiZugang } from '../../../shared/useKiZugang'
import { UeberthemaFeldFuer } from '../../../shared/components/UeberthemaFeld'
import { SPRACHE_DES_FACHS } from '@shared/verben'
import VerbAufgabeWahl from '../../../shared/verben/VerbAufgabeWahl'
import { neueVerbAufgabe } from '../../../shared/verben/quellen'
import { brauchtKi } from '../../../shared/verben/aufgaben'
import { anredeFuer } from '../../arbeitsblatt/didactics/anrede'
import { alsWsBlock, erzeugeOhneKi } from '../../../shared/verben/erzeugen'
import { formatVon } from '../../../shared/verben/formate'

/**
 * Das GER-Niveau folgt der Lerngruppe (Befund der Lehrkraft vom 26.09.2026): Bis dahin blieb es
 * beim Wechsel des Jahrgangs stehen – ein neuer Test begann immer mit A2, auch in Klasse 5.
 * Wie im Arbeitsblatt und im Vokabeltest setzt jeder Wechsel von Fach, Jahrgang, Land, Schulform
 * oder Fremdsprachenfolge den Vorschlag der Niveautabelle; von Hand bleibt es danach änderbar.
 * Ohne Eintrag in der Tabelle (Latein, Deutsch, fehlende Folge) bleibt es, wie es ist.
 */
function mitNiveau(table: CefrTable, m: GrammarTestMeta): GrammarTestMeta {
  if (!subjectById(m.subjectId).foreignLanguage) return m
  const s = suggestLevel(table, m.stateId, m.schoolTypeId, m.languageOrder, m.grade)
  return s ? { ...m, cefrLevel: s.level } : m
}

/** Übliche Stellung in der Fremdsprachenfolge beim Fachwechsel: Englisch 1., Griechisch 3., sonst 2. Fremdsprache */
const folgeFuer = (fach: string): number => (fach === 'englisch' ? 1 : fach === 'griechisch' ? 3 : 2)

/** Fächer, für die es eine Grammatikliste gibt. */
const TEST_SUBJECTS = SUBJECTS.filter((s) => hasGrammar(s.id))

/**
 * Schritt 1: Lerngruppe, geprüfte Formen, Umfang.
 *
 * Die Themenauswahl ist dieselbe wie im Arbeitsblatt – sie kennt Lernjahr, Niveau, typische
 * Fehler und passende Aufgabenformen. Aus den gewählten Themen werden die Formate vorbelegt;
 * die Lehrkraft kann sie ändern.
 */
export default function SetupStep(): React.JSX.Element {
  const { test, setTest } = useGrammatiktest()
  const settings = useAppSettings((s) => s.settings)
  const [table, setTable] = useState<CefrTable>({ version: 1, states: [] })
  const [designs, setDesigns] = useState<DesignTemplate[]>([])
  const [scaleOpen, setScaleOpen] = useState(false)
  const kiDa = useKiZugang()

  useEffect(() => {
    Promise.all([window.api.cefr.get(), window.api.designs.list()])
      .then(([cefr, ds]) => {
        setTable(cefr)
        setDesigns(ds)
        if (!useGrammatiktest.getState().test) {
          const stateId = settings.defaults.stateId
          const schoolTypeId = settings.defaults.schoolTypeId
          const name = cefr.states.find((s) => s.id === stateId)?.schoolTypes.find((t) => t.id === schoolTypeId)?.name ?? 'Gymnasium'
          const neu = newTest(ds.find((d) => d.isDefault) ?? ds[0], stateId, schoolTypeId, name)
          // „Neu in diesem Bereich" gibt das Fach des Themenbereichs vor – sofern es Grammatiktests hat
          const vorgabe = TEST_SUBJECTS.find((s) => s.id === nimmFachVorgabe('grammatiktest'))
          if (vorgabe) neu.meta = { ...neu.meta, subjectId: vorgabe.id, subjectLabel: vorgabe.label, languageOrder: folgeFuer(vorgabe.id) }
          // Auch der neue Test startet mit dem Niveau, das zu Jahrgang und Fremdsprachenfolge passt
          neu.meta = mitNiveau(cefr, neu.meta)
          setTest(neu)
        }
      })
      .catch(notifyError)
    // Läuft auch nach „Neuer Test": Dort wird der Test verworfen, und dieser Schritt legt sofort einen frischen an
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test === null])

  const topics = useMemo(() => (test ? chosenGrammarTopics({ ...test.meta, grammarTopics: test.meta.topics } as never) : []), [test])
  if (!test) return <Container py="xl">Wird geladen …</Container>

  const meta = test.meta
  // Fortlaufendes Tippen im selben Feld ist EIN Schritt für Strg+Z, nicht einer je Buchstabe
  const patch = (p: Partial<GrammarTestMeta>): void => setTest({ ...test, meta: { ...meta, ...p } }, `angaben:${Object.keys(p).sort().join(',')}`)
  /** Lerngruppe ändern (Fach, Jahrgang, Land, Schulform, Fremdsprachenfolge): das Niveau zieht mit */
  const patchGruppe = (p: Partial<GrammarTestMeta>): void =>
    setTest({ ...test, meta: mitVerbLernjahr(mitNiveau(table, { ...meta, ...mitLerngruppe(table, meta, p) })) }, `angaben:${Object.keys(p).sort().join(',')}`)
  const verbSprache = SPRACHE_DES_FACHS[meta.subjectId]
  const verbModus = meta.modus === 'verben' && Boolean(verbSprache)
  const niveauVorschlag = subjectById(meta.subjectId).foreignLanguage
    ? suggestLevel(table, meta.stateId, meta.schoolTypeId, meta.languageOrder, meta.grade)
    : null

  /** Themen ändern: Formate mitziehen, solange die Lehrkraft sie nicht selbst angefasst hat. */
  const patchFromPicker = (p: Partial<WorksheetMeta>): void => {
    const next: Partial<GrammarTestMeta> = {}
    if (p.grammarTopics) next.topics = p.grammarTopics
    if (p.lateStartLanguage !== undefined) next.lateStartLanguage = p.lateStartLanguage
    if (p.acquisitionStage !== undefined) next.acquisitionStage = p.acquisitionStage
    const merged = { ...meta, ...next }
    if (next.topics) {
      const picked = chosenGrammarTopics({ ...merged, grammarTopics: merged.topics } as never)
      next.formats = suggestedFormats(picked)
    }
    patch(next)
  }

  const rules = testingRules(meta)
  const range = gradeRange(table, meta.stateId, meta.schoolTypeId)
  const grades = Array.from({ length: range.max - range.min + 1 }, (_, i) => range.min + i)

  /*
   * „Test erstellen" läuft als Hintergrund-Auftrag (shared/auftraege.ts): Ein Grammatiktest ist
   * EINE lange Anfrage, die je nach Anbieter Minuten dauert. Bis 25.09.2026 lag solange ein
   * Fenster ohne Schließen-Knopf über dem Programm. Jetzt zeigt das Programm einen Hinweis,
   * die Auftragsleiste den Fortschritt – und das Ergebnis landet in DIESEM Test.
   */
  const create = (): void => {
    const docId = useGrammatiktest.getState().docId
    if (verbModus) {
      void starteAuftrag({
        moduleId: 'grammatiktest',
        docId,
        titel: defaultTestName(test),
        art: 'Test erstellen',
        eingabe: test,
        istOffen: () => testOffen(docId),
        fehlerTitel: 'Der Test konnte nicht erstellt werden',
        arbeit: (t, k) => generateVerbTest(t, brauchtKi(t.meta.verben!) ? k.ai : null, (m) => k.melde(m)),
        // Punkte je Form: Die Summe steht danach auch in den Angaben
        ablegen: (r, t) =>
          legeTestAb(
            docId,
            t,
            (aktuell) => ({
              ...aktuell,
              blocks: r.blocks,
              blocksB: r.blocksB,
              meta: { ...aktuell.meta, points: r.blocks.reduce((n, b) => n + (b.type === 'task' ? b.points : 0), 0) || aktuell.meta.points }
            }),
            1
          )
      })
      return
    }
    void starteAuftrag({
      moduleId: 'grammatiktest',
      docId,
      titel: defaultTestName(test),
      art: 'Test erstellen',
      eingabe: test,
      istOffen: () => testOffen(docId),
      fehlerTitel: 'Der Test konnte nicht erstellt werden',
      arbeit: (t, k) => generateTest(t, k.ai, (m) => k.melde(m)),
      // Ein eigener Verlaufsschritt: Strg+Z holt die vorigen Aufgaben zurück
      ablegen: (blocks, t) => legeTestAb(docId, t, (aktuell) => ({ ...aktuell, blocks }), 1)
    })
  }

  // Der Hauptknopf steht fest unten und sagt, was fehlt (Paket 6)
  const sperrgrund = verbModus
    ? ersterGrund(
        [!meta.verben?.verben.length, 'Zuerst Verben wählen'],
        [!meta.verben?.formate.length, 'Zuerst eine Aufgabenform wählen'],
        [Boolean(meta.verben && brauchtKi(meta.verben)) && !kiDa, <KeinKiZugang key="ki" />]
      )
    : ersterGrund([!topics.length, 'Zuerst eine Form wählen, die geprüft werden soll'], [!kiDa, <KeinKiZugang key="ki" />])
  const fuss = (
    <Formularfuss grund={sperrgrund}>
      <Button size="md" leftSection={<IconSparkles size={18} />} disabled={Boolean(sperrgrund)} onClick={create}>
        Test erstellen
      </Button>
    </Formularfuss>
  )

  return (
    <FormularSeite fuss={fuss}>
      <ScrollArea h="100%">
        <Container size="xl" py="md">
          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
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
                        data={TEST_SUBJECTS.map((s) => ({ value: s.id, label: s.label }))}
                        value={meta.subjectId}
                        onChange={(v) => {
                          if (!v) return
                          const s = subjectById(v)
                          // Fachwechsel: Die Themen des alten Fachs gelten nicht weiter
                          patchGruppe({
                            subjectId: v,
                            subjectLabel: s.label,
                            topics: [],
                            formats: [],
                            languageOrder: folgeFuer(v),
                            // Die Verbliste gehört zur Sprache – beim Fachwechsel neu anlegen (bzw. zurück zu den Formen)
                            verben: SPRACHE_DES_FACHS[v] && meta.modus === 'verben' ? neueVerbAufgabe(SPRACHE_DES_FACHS[v], verbLernjahr({ ...meta, subjectId: v, languageOrder: folgeFuer(v) })) : undefined,
                            ...(SPRACHE_DES_FACHS[v] ? {} : { modus: 'formen' as const })
                          })
                        }}
                        allowDeselect={false}
                      />
                      <Select
                        label="Jahrgang"
                        data={grades.map((g) => ({ value: String(g), label: `Klasse ${g}` }))}
                        value={String(meta.grade)}
                        onChange={(v) => v && patchGruppe({ grade: Number(v) })}
                        allowDeselect={false}
                      />
                    </Group>
                    <SchulortFelder table={table} stateId={meta.stateId} schoolTypeId={meta.schoolTypeId} schoolTypeName={meta.schoolTypeName} onChange={patchGruppe} />
                    <Group grow>
                      {subjectById(meta.subjectId).foreignLanguage && (
                        <Select
                          label="Fremdsprache"
                          data={[1, 2, 3].map((n) => ({ value: String(n), label: `${n}. Fremdsprache` }))}
                          value={String(meta.languageOrder)}
                          onChange={(v) => v && patchGruppe({ languageOrder: Number(v) })}
                          allowDeselect={false}
                        />
                      )}
                      <Select
                        label="Sprachniveau (GER)"
                        description={niveauVorschlag ? `Vorschlag: ${niveauVorschlag.level} (${niveauVorschlag.basis})` : undefined}
                        data={[...CEFR_SCALE]}
                        value={meta.cefrLevel}
                        onChange={(v) => v && patch({ cefrLevel: v as CefrLevel })}
                        allowDeselect={false}
                      />
                    </Group>
                  </Stack>
                </Card>

                <Card withBorder>
                  <Group justify="space-between" mb="sm">
                    <Title order={4}>{verbModus ? 'Unregelmäßige Verben' : 'Geprüfte Formen'}</Title>
                    {/* Art des Tests (30.09.2026): Grammatikformen oder unregelmäßige Verben – nur in den Sprachen mit Verbliste */}
                    {verbSprache && (
                      <SegmentedControl
                        size="xs"
                        value={verbModus ? 'verben' : 'formen'}
                        onChange={(v) => patch(v === 'verben' ? { modus: 'verben', verben: meta.verben ?? neueVerbAufgabe(verbSprache, verbLernjahr(meta)) } : { modus: 'formen' })}
                        data={[
                          { value: 'formen', label: 'Grammatikformen' },
                          { value: 'verben', label: 'Unregelmäßige Verben' }
                        ]}
                        data-testart
                      />
                    )}
                  </Group>
                  {verbModus && meta.verben ? (
                    <Stack gap="sm">
                      <VerbAufgabeWahl wert={meta.verben} onChange={(verben) => patch({ verben })} />
                      <Group gap="sm" align="center">
                        <Text size="sm">Fassungen:</Text>
                        <SegmentedControl
                          size="xs"
                          value={String(meta.fassungen ?? 1)}
                          onChange={(v) => patch({ fassungen: v === '2' ? 2 : 1 })}
                          data={[
                            { value: '1', label: 'eine' },
                            { value: '2', label: 'Gruppe A und B' }
                          ]}
                          data-fassungen
                        />
                        <Text size="xs" c="dimmed">
                          {vorschauPunkte(test)}
                        </Text>
                      </Group>
                    </Stack>
                  ) : (
                    <GrammarPicker meta={{ ...meta, grammarTopics: meta.topics } as unknown as WorksheetMeta} onChange={patchFromPicker} />
                  )}
                </Card>
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack>
                <Card withBorder>
                  <Title order={4} mb="sm">
                    Anlage des Tests
                  </Title>
                  <Stack gap="sm">
                    <TextInput
                      label="Titel (optional)"
                      placeholder={meta.subjectId === 'englisch' ? 'Grammar test' : 'Grammatiktest'}
                      value={meta.title}
                      onChange={(e) => patch({ title: e.currentTarget.value })}
                    />
                    <Group grow>
                      <NumberInput
                        label="Bearbeitungszeit (Minuten)"
                        min={5}
                        max={90}
                        value={meta.minutes}
                        onChange={(v) => patch({ minutes: Number(v) || 20 })}
                      />
                      <NumberInput label="Punkte" min={4} max={120} value={meta.points} onChange={(v) => patch({ points: Number(v) || 20 })} />
                    </Group>
                    {/* Immer sichtbar (Paket 7, Nachtrag der Lehrkraft) – samt Notenschlüssel, der an der Benotung hängt */}
                    <Switch
                      label="Test wird benotet"
                      description={meta.graded ? 'Der Notenschlüssel steht im Lösungsteil.' : 'Ohne Note – als Übung oder zur Diagnose.'}
                      checked={meta.graded}
                      onChange={(e) => patch({ graded: e.currentTarget.checked })}
                    />
                    {meta.graded && (
                      <Group gap="xs" align="center">
                        <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                          Notenschlüssel: {gradeScaleLine(meta.points, meta.gradeScaleThresholds)}
                        </Text>
                        <Button size="compact-xs" variant="light" onClick={() => setScaleOpen(true)}>
                          Bearbeiten
                        </Button>
                      </Group>
                    )}
                    {meta.graded && (
                      <Switch
                        label="Notenschlüssel auch auf dem Testblatt"
                        description="Er steht ohnehin im Lösungsteil – hier zusätzlich auf dem Material der Lernenden."
                        checked={meta.gradeScaleOnSheet}
                        onChange={(e) => patch({ gradeScaleOnSheet: e.currentTarget.checked })}
                      />
                    )}

                    {!verbModus && (
                      <Switch
                        label="In einen Zusammenhang einbetten"
                      description="Die Aufgaben hängen an einem durchlaufenden Text statt an unverbundenen Einzelsätzen – näher am Sprachgebrauch und in mehr Ländern als Leistung verwendbar."
                        checked={meta.embedded}
                        onChange={(e) => patch({ embedded: e.currentTarget.checked })}
                      />
                    )}
                  </Stack>
                </Card>

                {/*
                 * Landesvorgaben: Was „wichtig“ ist, bleibt als Hinweis sichtbar; der Vorschlag dazu
                 * und reine Hinweise stehen hinter „Mehr“ (Paket 6 – Inhalt unverändert).
                 */}
                {rules.map((rule, i) =>
                  rule.severity === 'wichtig' ? (
                    <Alert key={i} color="orange" icon={<IconAlertTriangle size={16} />} p="xs">
                      <Text size="sm">{rule.text}</Text>
                      {rule.suggestion && <MehrText text={rule.suggestion} mt={4} />}
                      {rule.aktion && <RegelUmsetzen onUmsetzen={() => patch({ embedded: true })} />}
                    </Alert>
                  ) : (
                    <Box key={i}>
                      <MehrText text={[rule.text, rule.suggestion].filter(Boolean).join(' ')} size="sm" />
                      {rule.aktion && <RegelUmsetzen onUmsetzen={() => patch({ embedded: true })} />}
                    </Box>
                  )
                )}

                {!verbModus && topics.length > 0 && (
                  <Text size="xs" c="dimmed" ta="right">
                    {topics.length === 1 ? 'Geprüft wird' : 'Geprüft werden'}: {topics.map((t) => t.label).join(', ')} ·{' '}
                    {meta.formats.map(grammarFormatLabel).join(', ') || 'Formate von der KI gewählt'}
                  </Text>
                )}
              </Stack>
            </Grid.Col>
          </Grid>

          {/* Selten Geändertes eingeklappt (Paket 6); die Überschrift nennt, was vom Standard abweicht */}
          <Box mt="md">
            <WeitereOptionen modul="grammatiktest" geaendert={geaenderteOptionen(test, designs, topics)}>
              <Grid>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Stack gap="sm">
                    <Switch
                      label="Fehlerprofil im Lösungsteil"
                      description="Zeigt, welche Aufgabe auf welche bekannte Stolperstelle zielt – mit einer Spalte zum Eintragen beim Durchsehen."
                      checked={meta.errorProfile}
                      onChange={(e) => patch({ errorProfile: e.currentTarget.checked })}
                    />
                    <Group>
                      <Switch label="Lösungsblatt" checked={meta.answerKey} onChange={(e) => patch({ answerKey: e.currentTarget.checked })} />
                      <Switch label="Kopfkasten" checked={meta.infoBox} onChange={(e) => patch({ infoBox: e.currentTarget.checked })} />
                      {subjectById(meta.subjectId).foreignLanguage && (
                        <Switch
                          label="Anweisungen auf Deutsch"
                          checked={meta.instructionsInGerman}
                          onChange={(e) => patch({ instructionsInGerman: e.currentTarget.checked })}
                        />
                      )}
                    </Group>

                    <Select
                      label="Designvorlage"
                      data={designs.map((d) => ({ value: d.id, label: d.name + (d.isDefault ? ' (Standard)' : '') }))}
                      value={test.design?.id}
                      onChange={(v) => {
                        const d = designs.find((x) => x.id === v)
                        if (d) setTest({ ...test, design: d })
                      }}
                      allowDeselect={false}
                    />
                    {/* Paket 10a: dezent in der Fachfarbe (Kopf, Überschriften) – hier abschaltbar */}
                    <VorlagenfarbeSchalter fach={meta.subjectId} checked={Boolean(meta.vorlagenfarbe)} onChange={(an) => patch({ vorlagenfarbe: an })} />
                    {/* Paket 11: Überthema dezent im Kopf – standardmäßig der Themenbereich */}
                    <UeberthemaFeldFuer moduleId="grammatiktest" docId={useGrammatiktest.getState().docId} werte={meta} onChange={(p) => patch(p)} />
                  </Stack>
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Card withBorder display={verbModus ? 'none' : undefined}>
                    <Title order={4} mb="sm">
                      Aufgabenformen
                    </Title>
                    <Text size="xs" c="dimmed" mb="xs">
                      Vorbelegt aus den gewählten Formen – hier änderbar. Rein rezeptive Themen bekommen keine offenen Formate.
                    </Text>
                    <Group gap="xs">
                      {GRAMMAR_FORMATS.map((f) => (
                        <Switch
                          key={f.id}
                          size="xs"
                          label={f.label}
                          checked={meta.formats.includes(f.id)}
                          onChange={(e) => patch({ formats: e.currentTarget.checked ? [...meta.formats, f.id] : meta.formats.filter((x) => x !== f.id) })}
                        />
                      ))}
                    </Group>
                    {!meta.formats.length && (
                      <Text size="xs" c="orange" mt="xs">
                        Ohne gewählte Form entscheidet die KI selbst – die belegten Zuordnungen bleiben dann ungenutzt.
                      </Text>
                    )}
                  </Card>
                </Grid.Col>
              </Grid>
            </WeitereOptionen>
          </Box>
          <Box h="md" />

          <GradeScaleModal
            opened={scaleOpen}
            onClose={() => setScaleOpen(false)}
            points={meta.points}
            thresholds={meta.gradeScaleThresholds}
            onChange={(gradeScaleThresholds) => patch({ gradeScaleThresholds })}
          />
        </Container>
      </ScrollArea>
    </FormularSeite>
  )
}

/**
 * Was unter „Weitere Optionen“ vom Standard abweicht (model/defaults.ts) – für die
 * Zusammenfassung in der eingeklappten Überschrift. Bei den Aufgabenformen ist der Standard
 * der Vorschlag aus den gewählten Formen. Benotung und Notenschlüssel stehen seit Paket 7
 * sichtbar oben und zählen hier nicht mehr.
 */
export function geaenderteOptionen(test: GrammarTest, designs: DesignTemplate[], topics: ReturnType<typeof chosenGrammarTopics>): string[] {
  const m = test.meta
  const standardDesign = designs.find((x) => x.isDefault) ?? designs[0]
  const vorschlag = suggestedFormats(topics)
  // Bei den unregelmäßigen Verben gelten die Formate der Verbkarte, nicht die der Grammatikthemen
  const formenAnders = m.modus !== 'verben' && (m.formats.length !== vorschlag.length || m.formats.some((f) => !vorschlag.includes(f)))
  return [
    m.errorProfile ? '' : 'ohne Fehlerprofil',
    m.answerKey ? '' : 'ohne Lösungsblatt',
    m.infoBox ? '' : 'ohne Kopfkasten',
    m.instructionsInGerman ? 'Anweisungen auf Deutsch' : '',
    test.design && standardDesign && test.design.id !== standardDesign.id ? `Design „${test.design.name}“` : '',
    formenAnders ? 'Aufgabenformen angepasst' : '',
    m.vorlagenfarbe ? 'Farbe der Vorlage' : ''
  ].filter(Boolean)
}

/** Für den Test wiederverwendet: der Test als Arbeitsblatt (Anzeige und Export). */
export type { GrammarTest }

/**
 * „Vorschlag der App umsetzen" an einem Regelhinweis (30.09.2026): Ein Klick setzt den Schalter
 * „In einen Zusammenhang einbetten" – Strg+Z nimmt es zurück, der Hinweis verschwindet danach.
 */
function RegelUmsetzen({ onUmsetzen }: { onUmsetzen: () => void }): React.JSX.Element {
  return (
    <Box mt={6}>
      <KreismenueKnopf
        knopf={{ size: 'compact-xs', leftSection: <IconSparkles size={12} /> }}
        eintraege={[{ id: 'einbetten', label: 'In einen Zusammenhang einbetten' }]}
        onUmsetzen={onUmsetzen}
        testId="regel-umsetzen"
      >
        Vorschlag der App umsetzen
      </KreismenueKnopf>
    </Box>
  )
}

/** Lernjahr der Lerngruppe – bestimmt Standardliste und Voreinstellung der Verbformate */
const verbLernjahr = (m: GrammarTestMeta): number => learningYear(m.grade, sequenceOf(m), m.stateId)

/** Wechselt die Lerngruppe, zieht das Lernjahr der Verbaufgabe mit (Standardliste bis zu diesem Lernjahr) */
function mitVerbLernjahr(m: GrammarTestMeta): GrammarTestMeta {
  if (!m.verben) return m
  const lj = verbLernjahr(m)
  return lj === m.verben.lernjahr ? m : { ...m, verben: { ...m.verben, lernjahr: lj } }
}

/** Punkte vorab – dieselbe Rechnung wie beim Erstellen, ohne die Sätze der KI */
function vorschauPunkte(test: GrammarTest): string {
  const a = test.meta.verben
  if (!a?.verben.length) return ''
  const bloecke = erzeugeOhneKi(a, anredeFuer(test.meta.grade, test.meta.schoolTypeId, test.meta.stateId)).map(alsWsBlock)
  const punkte = bloecke.reduce((n, b) => n + b.points, 0)
  const ki = a.formate.filter((f) => formatVon(f).ki).reduce((n, f) => n + (a.anzahl[f] ?? formatVon(f).standardAnzahl), 0)
  return `etwa ${punkte + ki} Punkte (je Form ein Punkt)`
}
