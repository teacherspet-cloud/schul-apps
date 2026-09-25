import { Alert, Button, Card, Container, Grid, Group, Loader, Modal, NumberInput, Progress, Select, Stack, Switch, Text, TextInput, Title } from '@mantine/core'
import { IconAlertTriangle, IconSparkles } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DesignTemplate } from '@shared/design'
import { CEFR_SCALE, CefrLevel, CefrTable } from '@shared/types'
import GradeScaleModal from '../../../shared/components/GradeScaleModal'
import { gradeScaleLine } from '../../../shared/gradeScale'
import { notifyError } from '../../../shared/util'
import { useAppSettings } from '../../../shared/settingsStore'
import { chosenGrammarTopics, GRAMMAR_FORMATS, grammarFormatLabel, hasGrammar } from '../../arbeitsblatt/didactics/grammar'
import { gradeRange, schoolTypesForState } from '../../arbeitsblatt/didactics/schoolProfiles'
import { STATES } from '../../arbeitsblatt/didactics/states'
import GrammarPicker from '../../arbeitsblatt/steps/GrammarPicker'
import { SUBJECTS, subjectById } from '../../arbeitsblatt/model/subjects'
import type { WorksheetMeta } from '../../arbeitsblatt/model/types'
import { generateTest } from '../generation/generateTest'
import { newTest } from '../model/defaults'
import { suggestedFormats, testingRules } from '../model/testRules'
import type { GrammarTest, GrammarTestMeta } from '../model/types'
import { trackedAiCall, useGrammatiktest } from '../store'
import { AiProgressTracker, neverBackwards, remainingLabel, remainingSeconds } from '../../../shared/aiProgress'
import SchulAngabe from '../../../shared/components/SchulAngabe'

/** Fächer, für die es eine Grammatikliste gibt. */
const TEST_SUBJECTS = SUBJECTS.filter((s) => hasGrammar(s.id))

/**
 * Schritt 1: Lerngruppe, geprüfte Formen, Umfang.
 *
 * Die Themenauswahl ist dieselbe wie im Arbeitsblatt – sie kennt Lernjahr, Niveau, typische
 * Fehler und passende Aufgabenformen. Aus den gewählten Themen werden die Formate vorbelegt;
 * die Lehrkraft kann sie ändern.
 */
/** Verstrichene Zeit als m:ss – ehrlicher als eine erfundene Prozentzahl. */
function elapsedLabel(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')} min`
}

export default function SetupStep(): React.JSX.Element {
  const { test, setTest, setStep, update } = useGrammatiktest()
  const settings = useAppSettings((s) => s.settings)
  const [table, setTable] = useState<CefrTable>({ version: 1, states: [] })
  const [designs, setDesigns] = useState<DesignTemplate[]>([])
  const [busy, setBusy] = useState(false)
  const [scaleOpen, setScaleOpen] = useState(false)
  /*
   * Fortschritt der einen KI-Anfrage.
   *
   * Ein Grammatiktest ist EIN Aufruf, der je nach Anbieter mehrere Minuten braucht. Vorher
   * drehte sich nur der Knopf: Die Lehrkraft sah minutenlang nicht, ob überhaupt etwas
   * geschieht. Der Balken folgt der Länge der eintreffenden Antwort und läuft nie zurück.
   */
  const [step, setStepMessage] = useState<string | null>(null)
  const [chunkRatio, setChunkRatio] = useState(0)
  const shown = useRef(0)
  const startedAt = useRef(0)
  // Sekundentakt, solange erzeugt wird: Ohne ihn stünde die verstrichene Zeit still, wenn
  // der Anbieter keinen Fortschritt meldet – nichts würde dann ein neues Rendern auslösen.
  const [, tick] = useState(0)

  // MUSS vor jedem frühen `return` stehen: Hooks müssen bei jedem Rendern in gleicher Zahl
  // und Reihenfolge laufen. Hinter dem `return (!test)` lief dieser hier nur manchmal – die
  // Oberfläche brach dann beim ersten Rendern ab (React #310), und zwar die ganze App, weil
  // die Programme im Hintergrund mitlaufen.
  useEffect(() => {
    if (step === null) return
    const timer = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [step])

  useEffect(() => {
    Promise.all([window.api.cefr.get(), window.api.designs.list()])
      .then(([cefr, ds]) => {
        setTable(cefr)
        setDesigns(ds)
        if (!useGrammatiktest.getState().test) {
          const stateId = settings.defaults.stateId
          const schoolTypeId = settings.defaults.schoolTypeId
          const name = cefr.states.find((s) => s.id === stateId)?.schoolTypes.find((t) => t.id === schoolTypeId)?.name ?? 'Gymnasium'
          setTest(newTest(ds.find((d) => d.isDefault) ?? ds[0], stateId, schoolTypeId, name))
        }
      })
      .catch(notifyError)
    // Läuft auch nach „Neuer Test": Dort wird der Test verworfen, und dieser Schritt legt sofort einen frischen an
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test === null])

  const topics = useMemo(() => (test ? chosenGrammarTopics({ ...test.meta, grammarTopics: test.meta.topics } as never) : []), [test])
  if (!test) return <Container py="xl">Lade …</Container>

  const meta = test.meta
  // Fortlaufendes Tippen im selben Feld ist EIN Schritt für Strg+Z, nicht einer je Buchstabe
  const patch = (p: Partial<GrammarTestMeta>): void => setTest({ ...test, meta: { ...meta, ...p } }, `angaben:${Object.keys(p).sort().join(',')}`)

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
  const types = schoolTypesForState(table, meta.stateId)
  const range = gradeRange(table, meta.stateId, meta.schoolTypeId)
  const grades = Array.from({ length: range.max - range.min + 1 }, (_, i) => range.min + i)

  const create = async (): Promise<void> => {
    setBusy(true)
    startedAt.current = Date.now()
    shown.current = 0
    setChunkRatio(0)
    setStepMessage('Start …')
    const tracker = new AiProgressTracker(() => setChunkRatio(tracker.ratio()))
    try {
      const blocks = await generateTest(test, trackedAiCall(tracker), setStepMessage)
      update((d) => {
        d.blocks = blocks
      })
      setStep(1)
    } catch (e) {
      notifyError(e, 'Der Test konnte nicht erstellt werden')
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
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Stack>
            <Card withBorder>
              <Title order={4} mb="sm">
                Lerngruppe
              </Title>
              <Stack gap="sm">
                <Group grow>
                  <Select
                    label="Fach"
                    data={TEST_SUBJECTS.map((s) => ({ value: s.id, label: s.label }))}
                    value={meta.subjectId}
                    onChange={(v) => {
                      if (!v) return
                      const s = subjectById(v)
                      // Fachwechsel: Die Themen des alten Fachs gelten nicht weiter
                      patch({ subjectId: v, subjectLabel: s.label, topics: [], formats: [], languageOrder: v === 'englisch' ? 1 : 2 })
                    }}
                    allowDeselect={false}
                  />
                  <Select
                    label="Jahrgang"
                    data={grades.map((g) => ({ value: String(g), label: `Klasse ${g}` }))}
                    value={String(meta.grade)}
                    onChange={(v) => v && patch({ grade: Number(v) })}
                    allowDeselect={false}
                  />
                </Group>
                <SchulAngabe
                  stateId={meta.stateId}
                  stateName={STATES.find((s) => s.id === meta.stateId)?.name ?? meta.stateId}
                  schoolTypeId={meta.schoolTypeId}
                  schoolTypeName={meta.schoolTypeName}
                >
                  <Group grow>
                    <Select
                      label="Bundesland"
                      data={STATES.map((s) => ({ value: s.id, label: s.name }))}
                      value={meta.stateId}
                      onChange={(v) => {
                        if (!v) return
                        const list = schoolTypesForState(table, v)
                        const keep = list.some((t) => t.value === meta.schoolTypeId)
                        patch({
                          stateId: v,
                          schoolTypeId: keep ? meta.schoolTypeId : (list[0]?.value ?? 'gymnasium'),
                          schoolTypeName: keep ? meta.schoolTypeName : (list[0]?.label ?? 'Gymnasium')
                        })
                      }}
                      allowDeselect={false}
                    />
                    <Select
                      label="Schulform"
                      data={types}
                      value={meta.schoolTypeId}
                      onChange={(v) => v && patch({ schoolTypeId: v, schoolTypeName: types.find((t) => t.value === v)?.label ?? '' })}
                      allowDeselect={false}
                    />
                  </Group>
                </SchulAngabe>
                <Group grow>
                  {subjectById(meta.subjectId).foreignLanguage && (
                    <Select
                      label="Fremdsprache"
                      data={[1, 2, 3].map((n) => ({ value: String(n), label: `${n}. Fremdsprache` }))}
                      value={String(meta.languageOrder)}
                      onChange={(v) => v && patch({ languageOrder: Number(v) })}
                      allowDeselect={false}
                    />
                  )}
                  <Select
                    label="Sprachniveau (GER)"
                    data={[...CEFR_SCALE]}
                    value={meta.cefrLevel}
                    onChange={(v) => v && patch({ cefrLevel: v as CefrLevel })}
                    allowDeselect={false}
                  />
                </Group>
              </Stack>
            </Card>

            <Card withBorder>
              <Title order={4} mb="sm">
                Geprüfte Formen
              </Title>
              <GrammarPicker meta={{ ...meta, grammarTopics: meta.topics } as unknown as WorksheetMeta} onChange={patchFromPicker} />
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
                  <NumberInput label="Bearbeitungszeit (Minuten)" min={5} max={90} value={meta.minutes} onChange={(v) => patch({ minutes: Number(v) || 20 })} />
                  <NumberInput label="Punkte" min={4} max={120} value={meta.points} onChange={(v) => patch({ points: Number(v) || 20 })} />
                </Group>

                <Switch
                  label="In einen Zusammenhang einbetten"
                  description="Die Aufgaben hängen an einem durchlaufenden Text statt an unverbundenen Einzelsätzen – näher am Sprachgebrauch und in mehr Ländern als Leistung verwendbar."
                  checked={meta.embedded}
                  onChange={(e) => patch({ embedded: e.currentTarget.checked })}
                />
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
              </Stack>
            </Card>

            <Card withBorder>
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

            {rules.map((rule, i) => (
              <Alert key={i} color={rule.severity === 'wichtig' ? 'orange' : 'gray'} icon={<IconAlertTriangle size={16} />} p="xs">
                <Text size="sm">{rule.text}</Text>
                {rule.suggestion && (
                  <Text size="xs" c="dimmed" mt={4}>
                    {rule.suggestion}
                  </Text>
                )}
              </Alert>
            ))}

            <Group justify="flex-end">
              <Button leftSection={<IconSparkles size={16} />} loading={busy} disabled={!topics.length} onClick={() => void create()}>
                Test erstellen
              </Button>
            </Group>
            {!topics.length && (
              <Text size="xs" c="dimmed" ta="right">
                Wähle zuerst mindestens eine Form, die geprüft werden soll.
              </Text>
            )}
            {topics.length > 0 && (
              <Text size="xs" c="dimmed" ta="right">
                {topics.length === 1 ? 'Geprüft wird' : 'Geprüft werden'}: {topics.map((t) => t.label).join(', ')} ·{' '}
                {meta.formats.map(grammarFormatLabel).join(', ') || 'Formate von der KI gewählt'}
              </Text>
            )}
          </Stack>
        </Grid.Col>
      </Grid>

      <Modal opened={step !== null} onClose={() => {}} withCloseButton={false} centered title="Test wird erstellt">
        {step !== null &&
          (() => {
            const ratio = neverBackwards(shown.current, chunkRatio)
            shown.current = ratio
            const rest = remainingLabel(remainingSeconds(ratio, Date.now() - startedAt.current))
            return (
              <Stack>
                {/* Ein Balken nur, wenn es wirklich etwas zu zeigen gibt. Codex schreibt seine
                    Antwort erst am Ende – ein Balken, der bei 0 % klebt, sähe aus wie ein
                    Absturz. Der Kreisel heißt ehrlich „es läuft, Dauer unbekannt". */}
                {ratio > 0 ? <Progress value={ratio * 100} animated /> : <Loader size="sm" type="dots" />}
                <Group justify="space-between" gap="xs">
                  <Text size="sm">{step}</Text>
                  {/* Solange nichts eingetroffen ist, waere eine Prozentzahl eine Behauptung –
                      dann lieber die verstrichene Zeit, die stimmt immer. */}
                  <Text size="sm" c="dimmed">
                    {ratio > 0 ? `${Math.round(ratio * 100)} %${rest ? ` · ${rest}` : ''}` : `läuft seit ${elapsedLabel(Date.now() - startedAt.current)}`}
                  </Text>
                </Group>
                <Text size="xs" c="dimmed">
                  Ein Grammatiktest entsteht in einer einzigen Anfrage. Je nach Anbieter dauert das einige Minuten.
                </Text>
              </Stack>
            )
          })()}
      </Modal>

      <GradeScaleModal
        opened={scaleOpen}
        onClose={() => setScaleOpen(false)}
        points={meta.points}
        thresholds={meta.gradeScaleThresholds}
        onChange={(gradeScaleThresholds) => patch({ gradeScaleThresholds })}
      />
    </Container>
  )
}

/** Für den Test wiederverwendet: der Test als Arbeitsblatt (Anzeige und Export). */
export type { GrammarTest }
