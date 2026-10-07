import { genugFuerVarianten } from '../generation/distribute'
import { NurExperte, OptionenBereich } from '../../../shared/components/NurExperte'
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Grid,
  Group,
  Loader,
  Radio,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core'
import ZahlFeld from '../../../shared/components/ZahlFeld'
import { IconAlertTriangle, IconArrowLeft, IconRefresh, IconSparkles } from '@tabler/icons-react'
import Formularfuss, { ersterGrund, FormularSeite, KeinKiZugang } from '../../../shared/components/Formularfuss'
import MehrText from '../../../shared/components/MehrText'
import WeitereOptionen from '../../../shared/components/WeitereOptionen'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppSettings } from '../../../shared/settingsStore'
import { CEFR_SCALE, CefrLevel, CefrTable } from '@shared/types'
import { notifyError } from '../../../shared/util'
import { distributeEvenly, requestedCount } from '../generation/distribute'
import { erstelleVokabeltest } from '../auftraege'
import { TASK_TYPE_LIST, TASK_TYPES } from '../generation/taskTypes'
import { aufgabenLabel, istAlteSprache, passtZurSprache } from '../didactics/latein'
import { aufgabenFuer } from '../model/grundeinstellungen'
import { formHinweis, formVorwissen, formZuSchwer, lernjahrVon } from '../didactics/formVorwissen'
import VerbAufgabeWahl from '../../../shared/verben/VerbAufgabeWahl'
import { istVerbSprache } from '@shared/verben'
import { neueVerbAufgabe } from '../../../shared/verben/quellen'
import { verbAufgabeFuer, vorwissenHinweis } from '../generation/verbAufgabe'
import { planeZusammensetzung, suggestLevelFromVocab, STANDARD_UMFANG } from '../generation/autoPlan'
import { gradeOptions, languageTracks, levelAtLeast, suggestLevel } from '../model/cefr'
import { randomSeed } from '../model/random'
import { LANGUAGES, PageLimit, TaskTypeId, TestSettings } from '../model/types'
import { includedVocab } from '../model/vocab'
import { aiCall, useVokabeltest } from '../store'
import { saveLastChoice } from '../../../shared/lastChoice'
import { grundEinstellungen } from '../model/grundeinstellungen'
import SchulAngabe from '../../../shared/components/SchulAngabe'
import HaeufigSelect from '../../../shared/components/HaeufigSelect'
import EinstellungenLink from '../../../shared/components/EinstellungenLink'
import { pageLimitText } from '../render/useTestLayout'
import SeitenVorgabe from './SeitenVorgabe'

export default function SettingsStep(): React.JSX.Element {
  const { vocab, settings: stored, setSettings, setStep, doc, updateDoc, listContext, listName } = useVokabeltest()
  const [table, setTable] = useState<CefrTable>({ version: 1, states: [] })
  const [settings, setLocal] = useState<TestSettings | null>(stored)
  const [review, setReview] = useState(true)
  // Sparmodus: alle Aufgaben einer Variante in einer Anfrage, ohne zusätzliche KI-Prüfung
  const [economy, setEconomy] = useState(false)
  // Nach Änderungen an der KI-Einstellung (Programm bleibt im Hintergrund geöffnet) Status neu abfragen
  const aiSettings = useAppSettings((s) => s.settings.ai)
  useEffect(() => {
    window.api.ai
      .status()
      .then((s) => {
        setHasKey(s.hasTextKey)
        setEconomy(s.economy)
      })
      .catch(() => undefined)
  }, [aiSettings])
  const [hasKey, setHasKey] = useState(true)
  // Nur die Vokabeln, die in der Liste auf „abfragen“ stehen
  const usable = includedVocab(vocab)
  // Vorwissen bei Wortformen (30.09.2026): Hinweis an Aufgaben, die Formänderungen verlangen
  const formStand = useMemo(
    () => (settings ? formVorwissen(settings, listContext?.known) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings?.targetLanguage, settings?.grade, settings?.languageOrder, settings?.stateId, settings?.level, listContext?.known]
  )
  /*
   * KI-Vorschlag der Zusammensetzung (29.09.2026, Wunsch der Lehrkraft): beim ersten Öffnen
   * stellt die KI aus den gewählten Vokabeln die Aufgabentypen zusammen (14–18 Vokabeln). Die
   * Klasse kommt aus dem Lehrwerk; ohne Lehrwerk schätzt die KI sie aus der Liste. Sie bestimmt
   * die Schwierigkeit der Formate mit. Hat die Lehrkraft inzwischen selbst etwas geändert,
   * überschreibt der Vorschlag das nicht.
   */
  const [vorschlag, setVorschlag] = useState<{ laeuft: boolean; gruende: string[]; klasse?: string }>({ laeuft: false, gruende: [] })
  const angefasst = useRef(false)
  const schlageVor = async (basis: TestSettings, mitKlasse: boolean, table: CefrTable, kiDa: boolean): Promise<void> => {
    if (istAlteSprache(basis.targetLanguage) || usable.length < 2) return
    angefasst.current = false
    setVorschlag({ laeuft: true, gruende: [] })
    let s = basis
    let klasse: string | undefined
    try {
      if (listContext?.grade) klasse = `Klasse ${listContext.grade} laut Lehrwerk${listContext.bookName ? ` (${listContext.bookName})` : ''}`
      else if (mitKlasse && kiDa) {
        const grades = gradeOptions(table, s.stateId, s.schoolTypeId, s.languageOrder)
        const est = await suggestLevelFromVocab(usable, listName, s, grades, aiCall).catch(() => null)
        if (est) {
          s = { ...s, grade: est.grade, level: est.level, topic: s.topic || est.topic }
          klasse = `Klasse ${est.grade} geschätzt${est.reason ? `: ${est.reason}` : ''}`
        }
      }
      const plan = await planeZusammensetzung(usable, s, kiDa ? aiCall : null)
      if (angefasst.current) return setVorschlag({ laeuft: false, gruende: [], klasse })
      setLocal((cur) => (cur ? { ...cur, grade: s.grade, level: s.level, topic: s.topic, tasks: plan.tasks, vocabCount: plan.vocabCount } : cur))
      setVorschlag({ laeuft: false, gruende: plan.reasons, klasse })
    } catch (e) {
      setVorschlag({ laeuft: false, gruende: [] })
      notifyError(e)
    }
  }

  useEffect(() => {
    Promise.all([window.api.cefr.get(), window.api.settings.get(), window.api.ai.status()])
      .then(([cefr, app, status]) => {
        setTable(cefr)
        setHasKey(status.hasTextKey)
        setEconomy(status.economy)
        if (!stored) {
          // Dieselben Vorgaben wie „Test automatisch erstellen" (model/grundeinstellungen.ts)
          const initial = grundEinstellungen(app, cefr, listContext, usable.length)
          setLocal(initial)
          void schlageVor(initial, true, cefr, status.hasTextKey)
        }
      })
      .catch(notifyError)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const patch = (p: Partial<TestSettings>): void => {
    angefasst.current = true
    setLocal((s) => (s ? { ...s, ...p } : s))
  }

  useEffect(() => {
    if (settings) setSettings(settings)
  }, [settings, setSettings])

  // Auswahl für das nächste Mal merken
  useEffect(() => {
    if (!settings) return
    saveLastChoice('vokabeltest', {
      targetLanguage: settings.targetLanguage,
      stateId: settings.stateId,
      schoolTypeId: settings.schoolTypeId,
      grade: settings.grade,
      languageOrder: settings.languageOrder,
      cefrLevel: settings.level
    })
  }, [settings?.targetLanguage, settings?.stateId, settings?.schoolTypeId, settings?.grade, settings?.languageOrder, settings?.level])

  const state = table.states.find((s) => s.id === settings?.stateId)
  const tracks = settings ? languageTracks(table, settings.stateId, settings.schoolTypeId) : []
  const grades = settings ? gradeOptions(table, settings.stateId, settings.schoolTypeId, settings.languageOrder) : []
  const suggestion = settings ? suggestLevel(table, settings.stateId, settings.schoolTypeId, settings.languageOrder, settings.grade) : null

  const applyGradeContext = (p: Partial<TestSettings>): void => {
    angefasst.current = true
    if (!settings) return
    const next = { ...settings, ...p }
    const opts = gradeOptions(table, next.stateId, next.schoolTypeId, next.languageOrder)
    if (opts.length && !opts.some((o) => Number(o.value) === next.grade)) next.grade = Number(opts[0].value)
    const s = suggestLevel(table, next.stateId, next.schoolTypeId, next.languageOrder, next.grade)
    if (s) next.level = s.level
    setLocal(next)
  }

  const requested = settings ? requestedCount(settings) : 0
  const aiCalls = useMemo(() => {
    if (!settings) return 0
    const perVariant = settings.tasks.filter((t) => TASK_TYPES[t.type].schema).length
    const pictures = settings.tasks.some((t) => t.type === 'pictureLabel') ? 1 : 0
    if (economy) return settings.variantCount * (perVariant > 0 ? 1 : 0) * (review ? 2 : 1) + pictures
    return settings.variantCount * perVariant * (review ? 2 : 1) + pictures
  }, [settings, review, economy])

  if (!settings) return <Container py="xl">Wird geladen …</Container>

  const toggleTask = (type: TaskTypeId, on: boolean): void => {
    const tasks = on
      ? [
          ...settings.tasks,
          { type, count: TASK_TYPES[type].usesVocab ? Math.max(TASK_TYPES[type].minItems ?? 1, 4) : 0, pointsPerItem: TASK_TYPES[type].defaultPoints }
        ]
      : settings.tasks.filter((t) => t.type !== type)
    patch({ tasks })
  }

  const pageLimit: PageLimit = settings.pageLimit ?? { mode: 'auto', pages: 2 }
  /** Seitenvorgabe betrifft nur das Layout: ein vorhandener Test übernimmt sie sofort, ohne neu zu generieren. */
  const setPageLimit = (next: PageLimit): void => {
    patch({ pageLimit: next })
    if (doc) updateDoc((d) => (d.settings.pageLimit = next))
  }

  /*
   * Erstellen läuft als Hintergrund-Auftrag (../auftraege.ts): Das Programm zeigt bis dahin
   * einen Hinweis, das Ergebnis landet in DIESEM Test (Strg+Z holt einen vorigen zurück).
   */
  const start = (): void => {
    // Neuer Seed: jeder Durchlauf ergibt eine neue Auswahl und Reihenfolge
    const runSettings: TestSettings = { ...settings, vocabCount: requested, seed: randomSeed() }
    setLocal(runSettings)
    erstelleVokabeltest({ art: doc ? 'Test neu erstellen' : 'Test erstellen', usable, settings: runSettings, review, economy, known: listContext?.known })
  }

  // Der Hauptknopf steht fest unten und sagt, was fehlt (Paket 6)
  const sperrgrund = ersterGrund(
    [settings.tasks.length === 0, 'Keine Aufgabe gewählt'],
    [requested === 0, 'Keine Vokabeln zum Abfragen'],
    [!hasKey, <KeinKiZugang key="ki" />]
  )
  const fuss = (
    <Formularfuss
      grund={sperrgrund}
      links={
        <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => setStep(0)}>
          Zurück zur Vokabelliste
        </Button>
      }
    >
      {doc && (
        <Button variant="default" onClick={() => setStep(2)}>
          Zum bestehenden Test
        </Button>
      )}
      <Button size="md" leftSection={<IconSparkles size={18} />} disabled={Boolean(sperrgrund)} onClick={start}>
        {doc ? 'Test neu erstellen' : 'Test erstellen'}
      </Button>
    </Formularfuss>
  )

  return (
    <OptionenBereich>
      <FormularSeite fuss={fuss}>
        <ScrollArea h="100%">
          <Container size="xl" py="lg">
            <Title order={2} mb="md">
              Test einstellen
            </Title>

            {!hasKey && (
              <Alert color="orange" icon={<IconAlertTriangle />} mb="md" title="Die gewählte KI ist noch nicht eingerichtet">
                Zum Erstellen der Aufgaben wird ein API-Schlüssel oder ein freigegebener Abo-Zugang benötigt.{' '}
                <EinstellungenLink tab="ki">KI-Zugang einrichten</EinstellungenLink>
              </Alert>
            )}

            {/* Die Zusammenfassung steht oben; der Knopf dazu fest in der Fußleiste (Paket 6) */}
            <Card withBorder mb="lg">
              <Text size="sm">
                <b>{requested}</b> Vokabeln in <b>{settings.tasks.length}</b> Aufgaben, <b>{settings.variantCount}</b>{' '}
                {settings.variantCount === 1 ? 'Variante' : 'Varianten'}, Niveau <b>{settings.level}</b> · ca. {aiCalls} KI-Anfragen
              </Text>
            </Card>

            <Grid gap="lg">
              <Grid.Col span={{ base: 12, md: 5 }}>
                <Stack>
                  <Card withBorder>
                    <Title order={4} mb="sm">
                      Lerngruppe & Sprachniveau
                    </Title>
                    <Stack gap="sm">
                      <Select
                        label="Zielsprache"
                        data={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
                        value={settings.targetLanguage}
                        onChange={(v) => {
                          if (!v) return
                          // Aufgaben, die es in der neuen Sprache nicht gibt, fallen weg (30.09.2026); bleibt keine, gelten die Standardaufgaben
                          const bleiben = settings.tasks.filter((t) => passtZurSprache(t.type, v))
                          patch({ targetLanguage: v, tasks: bleiben.length ? bleiben : aufgabenFuer(v, settings.vocabCount) })
                        }}
                        allowDeselect={false}
                      />
                      <NurExperte>
                        {settings.targetLanguage === 'grc' && (
                          <Switch
                            label="Umschrift hinter den griechischen Wörtern"
                            description="z. B. λόγος [logos] – Hilfe für den Anfangsunterricht; Nennformen und Bedeutungen bleiben griechisch bzw. deutsch."
                            checked={Boolean(settings.umschrift)}
                            onChange={(e) => patch({ umschrift: e.currentTarget.checked })}
                            data-umschrift
                          />
                        )}
                      </NurExperte>
                      {table.states.length > 0 ? (
                        <>
                          <SchulAngabe
                            stateId={settings.stateId}
                            stateName={table.states.find((s) => s.id === settings.stateId)?.name ?? settings.stateId}
                            schoolTypeId={settings.schoolTypeId}
                            schoolTypeName={state?.schoolTypes.find((t) => t.id === settings.schoolTypeId)?.name ?? ''}
                          >
                            <Group grow>
                              <HaeufigSelect
                                art="bundesland"
                                label="Bundesland"
                                maxDropdownHeight={400}
                                data={table.states.map((s) => ({ value: s.id, label: s.name }))}
                                value={settings.stateId}
                                onChange={(v) =>
                                  v && applyGradeContext({ stateId: v, schoolTypeId: table.states.find((s) => s.id === v)?.schoolTypes[0]?.id ?? '' })
                                }
                                allowDeselect={false}
                              />
                              <HaeufigSelect
                                art="schulform"
                                label="Schulform"
                                data={(state?.schoolTypes ?? []).map((s) => ({ value: s.id, label: s.name }))}
                                value={settings.schoolTypeId}
                                onChange={(v) => v && applyGradeContext({ schoolTypeId: v })}
                                allowDeselect={false}
                              />
                            </Group>
                          </SchulAngabe>
                          <Group grow>
                            <NurExperte>
                              <Select
                                label="Fremdsprache"
                                data={tracks.map((t) => ({ value: String(t.order), label: `${t.order}. Fremdsprache (ab Kl. ${t.startGrade})` }))}
                                value={String(settings.languageOrder)}
                                onChange={(v) => v && applyGradeContext({ languageOrder: Number(v) })}
                                allowDeselect={false}
                              />
                            </NurExperte>
                            <Select
                              label="Klasse"
                              data={grades.map((g) => ({ value: g.value, label: g.label }))}
                              value={String(settings.grade)}
                              onChange={(v) => v && applyGradeContext({ grade: Number(v) })}
                              allowDeselect={false}
                            />
                          </Group>
                        </>
                      ) : (
                        <ZahlFeld label="Klasse" min={1} max={13} value={settings.grade} onChange={(v) => patch({ grade: Number(v) || 1 })} />
                      )}
                      <NurExperte>
                        <Select
                          label="GER-Niveau für die Aufgaben"
                          description={
                            suggestion
                              ? `Vorschlag laut Tabelle: ${suggestion.level} (Grundlage: ${suggestion.basis}). Ziel am Ende des Schuljahres.`
                              : 'Niveau manuell wählen'
                          }
                          data={[...CEFR_SCALE]}
                          value={settings.level}
                          onChange={(v) => v && patch({ level: v as CefrLevel })}
                          allowDeselect={false}
                        />
                      </NurExperte>
                    </Stack>
                  </Card>

                  <Card withBorder>
                    <Title order={4} mb="sm">
                      Umfang & Varianten
                    </Title>
                    <Stack gap="sm">
                      <Group align="end">
                        <ZahlFeld
                          label="Anzahl abzufragender Vokabeln"
                          description={`${usable.length} Vokabeln stehen in der Liste auf „abfragen“`}
                          min={1}
                          max={usable.length}
                          value={settings.vocabCount}
                          onChange={(v) => patch({ vocabCount: Number(v) || 1 })}
                          style={{ flex: 1 }}
                        />
                        <NurExperte>
                          <Button variant="light" onClick={() => patch({ tasks: distributeEvenly(settings.tasks, settings.vocabCount) })}>
                            Auf Aufgaben verteilen
                          </Button>
                        </NurExperte>
                      </Group>
                      {requested !== settings.vocabCount && (
                        <Text size="xs" c="orange">
                          Die Aufgaben fragen zusammen {requested} Vokabeln ab.
                        </Text>
                      )}
                      <div>
                        <Text size="sm" fw={500} mb={4}>
                          Anzahl Varianten
                        </Text>
                        <SegmentedControl
                          data={['1', '2', '3', '4']}
                          value={String(settings.variantCount)}
                          onChange={(v) => patch({ variantCount: Number(v) })}
                        />
                      </div>
                      <NurExperte geaendert={settings.variantCount > 1 && settings.variantMode === 'differentVocab' && 'andere Vokabeln je Variante'}>
                        {settings.variantCount > 1 && (
                          <Radio.Group value={settings.variantMode} onChange={(v) => patch({ variantMode: v as TestSettings['variantMode'] })}>
                            <Stack gap={6}>
                              <Radio value="sameVocab" label="Gleiche Vokabeln, andere Sätze und Reihenfolge (gleich schwer)" />
                              <Radio
                                value="differentVocab"
                                label="Unterschiedliche Vokabeln je Variante"
                                // Seit 02.10.2026 überschneiden sich die Varianten (etwa ein Drittel gemeinsam) – es genügt ein Drittel neue Wörter
                                disabled={!genugFuerVarianten(usable.length, requested)}
                                description={
                                  genugFuerVarianten(usable.length, requested)
                                    ? 'Etwa ein Drittel der Vokabeln kommt auch in anderen Varianten vor, der Rest ist neu.'
                                    : 'Dafür ist die Liste zu kurz.'
                                }
                              />
                            </Stack>
                          </Radio.Group>
                        )}
                      </NurExperte>
                      <TextInput
                        label="Thema / Kontext (optional)"
                        placeholder="z. B. Unit 3: A trip to London"
                        value={settings.topic}
                        onChange={(e) => patch({ topic: e.currentTarget.value })}
                      />
                    </Stack>
                  </Card>

                  {/* Selten Geändertes eingeklappt (Paket 6); die Überschrift nennt, was vom Standard abweicht */}
                  <WeitereOptionen modul="vokabeltest" geaendert={geaenderteOptionen(settings, review)}>
                    <Stack gap="sm">
                      <div>
                        <Text size="sm" fw={500} mb={4}>
                          Seitenumfang je Test
                        </Text>
                        <SeitenVorgabe limit={pageLimit} onChange={setPageLimit} />
                        <MehrText
                          mt={4}
                          text="Gilt für das Schülerblatt jeder Variante. Passt der Test nicht, werden Abstände und Schrift verkleinert; bei „genau“ wird der Inhalt gleichmäßig auf die Seiten verteilt, bei „von–bis“ nur dann, wenn er die Untergrenze nicht erreicht. Die Vorgabe lässt sich auch später im Editor ändern."
                        />
                      </div>
                      <Checkbox label="Lösungsblatt erstellen" checked={settings.answerKey} onChange={(e) => patch({ answerKey: e.currentTarget.checked })} />
                      <Checkbox
                        label="Aufgaben zusätzlich von der KI prüfen lassen (empfohlen)"
                        description={
                          economy
                            ? 'Sparmodus ist an: alle Aufgaben einer Variante in einer KI-Anfrage. Die Prüfung läuft trotzdem – sie kostet je Variante eine weitere Anfrage.'
                            : 'Jede Aufgabe wird nach dem Erstellen noch einmal geprüft; das verdoppelt die Zahl der Anfragen.'
                        }
                        checked={review}
                        onChange={(e) => setReview(e.currentTarget.checked)}
                      />
                      {economy && (
                        <Text size="xs" c="dimmed">
                          Sparmodus ist eingeschaltet (<EinstellungenLink tab="ki">Einstellungen → KI-Zugang</EinstellungenLink>): Die Aufgaben einer Variante
                          entstehen in einer einzigen Anfrage.
                        </Text>
                      )}
                    </Stack>
                  </WeitereOptionen>
                </Stack>
              </Grid.Col>

              <Grid.Col span={{ base: 12, md: 7 }}>
                <Card withBorder>
                  <Group justify="space-between" align="center" mb={4}>
                    <Title order={4}>Aufgabentypen</Title>
                    {!istAlteSprache(settings.targetLanguage) && (
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={<IconRefresh size={14} />}
                        loading={vorschlag.laeuft}
                        disabled={usable.length < 2}
                        onClick={() => void schlageVor(settings, false, table, hasKey)}
                        data-zusammensetzung
                      >
                        {hasKey ? 'KI-Vorschlag neu' : 'Vorschlag neu'}
                      </Button>
                    )}
                  </Group>
                  {vorschlag.laeuft ? (
                    <Group gap="xs" mb="sm">
                      <Loader size="xs" />
                      <Text size="sm" c="dimmed">
                        Die KI stellt die Aufgaben für die gewählten Vokabeln zusammen ({STANDARD_UMFANG.min}–{STANDARD_UMFANG.max} Vokabeln) …
                      </Text>
                    </Group>
                  ) : (
                    (vorschlag.klasse || vorschlag.gruende.length > 0) && (
                      <Alert variant="light" color="blue" p="xs" mb="sm" icon={<IconSparkles size={16} />} data-vorschlag>
                        {vorschlag.klasse && <Text size="xs">{vorschlag.klasse}. Die Klasse bestimmt die Schwierigkeit der vorgeschlagenen Formate mit.</Text>}
                        {vorschlag.gruende.map((g, i) => (
                          <Text key={i} size="xs" c="dimmed">
                            {g}
                          </Text>
                        ))}
                        <Text size="xs" c="dimmed" mt={4}>
                          Vorschlag – Aufgaben, Anzahl und Punkte bleiben frei änderbar.
                        </Text>
                      </Alert>
                    )
                  )}
                  <Text size="sm" c="dimmed" mb="md">
                    Alle Aufgaben prüfen die Vokabeln im Kontext der Zielsprache. Die Zahl gibt an, wie viele Vokabeln in der Aufgabe vorkommen.
                  </Text>
                  <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="sm">
                    {/*
                  Latein bekommt andere Aufgabenarten als die modernen Fremdsprachen: keine
                  Sprech- und Schreibformate, dafür Nennformen, Wortbildung und Lehnwörter.
                  Begründung und Belege in `didactics/latein.ts`.
                */}
                    {TASK_TYPE_LIST.filter((d) => d.id !== 'freeText' && passtZurSprache(d.id, settings.targetLanguage)).map((def) => {
                      const sel = settings.tasks.find((t) => t.type === def.id)
                      const tooEasyLevel = !levelAtLeast(settings.level, def.minLevel)
                      const formText = formStand ? formHinweis(def.id, formStand) : undefined
                      return (
                        <Card key={def.id} withBorder padding="sm" className={sel ? 'task-card-selected' : undefined}>
                          <Group justify="space-between" wrap="nowrap" align="start">
                            <Checkbox
                              checked={Boolean(sel)}
                              onChange={(e) => toggleTask(def.id, e.currentTarget.checked)}
                              label={
                                <Text fw={600} size="sm">
                                  {aufgabenLabel(def, settings.targetLanguage)}
                                </Text>
                              }
                              description={def.description}
                            />
                            <Tooltip label={tooEasyLevel ? `Empfohlen ab ${def.minLevel}` : `Geeignet ab ${def.minLevel}`}>
                              <Badge variant="light" color={tooEasyLevel ? 'orange' : 'gray'} style={{ flexShrink: 0 }}>
                                ab {def.minLevel}
                              </Badge>
                            </Tooltip>
                          </Group>
                          {formText && (
                            <Text size="xs" mt={4} c={formStand && formZuSchwer(def.id, formStand) ? 'orange' : 'dimmed'} data-formhinweis>
                              {formText}
                            </Text>
                          )}
                          {/*
                          Unregelmäßige Verben (30.09.2026): statt der Vokabelzahl die Auswahl aus der
                          Verbliste des Lehrwerks – nur Formate ohne KI, je Form ein Punkt.
                        */}
                          <NurExperte>
                            {sel && def.id === 'irregularVerbs' && istVerbSprache(settings.targetLanguage) && (
                              <Stack mt="xs" gap="xs">
                                {((h) =>
                                  h ? (
                                    <Text size="xs" c="orange" data-verb-vorwissen>
                                      {h}
                                    </Text>
                                  ) : null)(
                                  vorwissenHinweis(
                                    settings.verbAufgabe ?? neueVerbAufgabe(settings.targetLanguage, lernjahrVon(settings)),
                                    settings,
                                    listContext?.known
                                  )
                                )}
                                <VerbAufgabeWahl
                                  wert={
                                    settings.verbAufgabe?.sprache === settings.targetLanguage
                                      ? settings.verbAufgabe
                                      : verbAufgabeFuer(settings, usable, 1) ?? neueVerbAufgabe(settings.targetLanguage, lernjahrVon(settings))
                                  }
                                  onChange={(verbAufgabe) => patch({ verbAufgabe })}
                                  nurOhneKi
                                  vokabeln={usable}
                                  lehrwerkName={listContext?.bookName}
                                />
                                <ZahlFeld
                                  size="xs"
                                  label="Punkte je Form"
                                  min={0}
                                  step={0.5}
                                  decimalScale={1}
                                  value={sel.pointsPerItem}
                                  onChange={(v) =>
                                    patch({ tasks: settings.tasks.map((t) => (t.type === def.id ? { ...t, pointsPerItem: Number(v) || 0 } : t)) })
                                  }
                                />
                              </Stack>
                            )}
                          </NurExperte>
                          <NurExperte>
                            {sel && def.id !== 'irregularVerbs' && (
                              <Group mt="xs" grow>
                                <ZahlFeld
                                  size="xs"
                                  label="Vokabeln"
                                  min={def.minItems ?? 1}
                                  max={usable.length}
                                  value={sel.count}
                                  onChange={(v) => patch({ tasks: settings.tasks.map((t) => (t.type === def.id ? { ...t, count: Number(v) || 1 } : t)) })}
                                />
                                <ZahlFeld
                                  size="xs"
                                  label="Punkte je Vokabel"
                                  min={0}
                                  step={0.5}
                                  decimalScale={1}
                                  value={sel.pointsPerItem}
                                  onChange={(v) =>
                                    patch({ tasks: settings.tasks.map((t) => (t.type === def.id ? { ...t, pointsPerItem: Number(v) || 0 } : t)) })
                                  }
                                />
                              </Group>
                            )}
                          </NurExperte>
                          <NurExperte>
                            {sel && def.id === 'mindmap' && (
                              <Stack gap={4} mt="xs">
                                {/* Mindmap (02.10.2026): Wahl der Lehrkraft – „beides wählbar" */}
                                <SegmentedControl
                                  size="xs"
                                  fullWidth
                                  data={[
                                    { value: 'oberbegriffe', label: 'Mit Oberbegriffen' },
                                    { value: 'offen', label: 'Ganz offen' }
                                  ]}
                                  value={settings.mindmapVariante ?? 'oberbegriffe'}
                                  onChange={(v) => patch({ mindmapVariante: v as TestSettings['mindmapVariante'] })}
                                />
                                <Text size="xs" c="dimmed">
                                  {(settings.mindmapVariante ?? 'oberbegriffe') === 'oberbegriffe'
                                    ? 'Die KI schlägt 3–5 Oberbegriffe für die Äste vor; an jedem Ast so viele Linien wie Wörter.'
                                    : 'Äste und Linien bleiben leer – die Lernenden ordnen und beschriften selbst.'}
                                </Text>
                                {(settings.mindmapVariante ?? 'oberbegriffe') === 'oberbegriffe' && (
                                  <Checkbox
                                    size="xs"
                                    label="Zusätzlich ein freier Ast für eigene Wörter"
                                    checked={Boolean(settings.mindmapFreierAst)}
                                    onChange={(e) => patch({ mindmapFreierAst: e.currentTarget.checked })}
                                  />
                                )}
                              </Stack>
                            )}
                          </NurExperte>
                          <NurExperte>
                            {sel && def.id === 'pictureLabel' && (
                              <Select
                                mt="xs"
                                size="xs"
                                label="Bilder automatisch aus"
                                description="In dieser Reihenfolge: Piktogramm, Clipart aus dem Internet, sonst KI-Bild – jedes Bild wird von der KI auf Eindeutigkeit geprüft."
                                data={[
                                  { value: 'auto', label: 'Piktogramme, Cliparts und KI-Bilder (empfohlen)' },
                                  { value: 'ai', label: 'nur KI-erzeugte Cliparts' },
                                  { value: 'none', label: 'Keine – selbst im Editor wählen' }
                                ]}
                                value={settings.pictureSource === 'openmoji' ? 'auto' : settings.pictureSource}
                                onChange={(v) => v && patch({ pictureSource: v as TestSettings['pictureSource'] })}
                                allowDeselect={false}
                              />
                            )}
                          </NurExperte>
                          <NurExperte>
                            {sel && def.id === 'pictureLabel' && (
                              <Checkbox
                                mt="xs"
                                size="xs"
                                label="Wortkasten als Hilfe"
                                description="Die gesuchten Wörter stehen mit überzähligen Wörtern im Kasten. Ohne Kasten müssen die Lernenden die Wörter selbst abrufen."
                                checked={Boolean(settings.pictureWordBank)}
                                onChange={(e) => patch({ pictureWordBank: e.currentTarget.checked })}
                              />
                            )}
                          </NurExperte>
                        </Card>
                      )
                    })}
                  </SimpleGrid>
                </Card>
              </Grid.Col>
            </Grid>
          </Container>
        </ScrollArea>
      </FormularSeite>
    </OptionenBereich>
  )
}

/** Was unter „Weitere Optionen“ vom Standard abweicht – für die Zusammenfassung in der eingeklappten Überschrift. */
export function geaenderteOptionen(s: TestSettings, review: boolean): string[] {
  const seiten: PageLimit = s.pageLimit ?? { mode: 'auto', pages: 2 }
  return [seiten.mode === 'auto' ? '' : pageLimitText(seiten), s.answerKey ? '' : 'ohne Lösungsblatt', review ? '' : 'ohne KI-Prüfung'].filter(Boolean)
}
