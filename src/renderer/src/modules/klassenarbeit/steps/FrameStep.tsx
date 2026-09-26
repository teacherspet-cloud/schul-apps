import { nimmFachVorgabe } from '../../../shared/fachVorgabe'
import {
  ActionIcon,
  Alert,
  Anchor,
  Autocomplete,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Container,
  Grid,
  Group,
  MultiSelect,
  NumberInput,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core'
import { IconAlertTriangle, IconArrowRight, IconTrash } from '@tabler/icons-react'
import Formularfuss, { ersterGrund, FormularSeite } from '../../../shared/components/Formularfuss'
import MehrText from '../../../shared/components/MehrText'
import WeitereOptionen from '../../../shared/components/WeitereOptionen'
import VorlagenfarbeSchalter from '../../../shared/components/VorlagenfarbeSchalter'
import { useEffect, useMemo, useState } from 'react'
import type { DesignTemplate } from '@shared/design'
import { AiStatus, CEFR_SCALE, CefrLevel, CefrTable } from '@shared/types'
import { suggestLevel } from '../../../shared/cefr'
import { useAppSettings } from '../../../shared/settingsStore'
import { notifyError } from '../../../shared/util'
import { newId } from '../../vokabeltest/model/random'
import { comprehensionFormatById, comprehensionFormatsFor, defaultComprehensionFormats } from '../../arbeitsblatt/didactics/comprehensionFormats'
import { grammarTopicsFor } from '../../arbeitsblatt/didactics/grammar'
import { AIDS_SUGGESTIONS } from '../model/aids'
import { listeningFormatById, listeningFormatsFor, listeningRules } from '../../arbeitsblatt/didactics/listeningFormats'
import { defaultExamMeta, defaultMinutes } from '../model/defaults'
import { courseLevelOptions, gradeRange, schoolTypesForState } from '../../arbeitsblatt/didactics/schoolProfiles'
import { STATES } from '../../arbeitsblatt/didactics/states'
import { curriculumSource, curriculumTopics } from '../model/curriculumGeschichte'
import { examWarnings, gradeScaleGroups, gradeScaleLine, stateRules, WORTZAHL_GRUND, wortzahlErlaubt } from '../model/examRules'
import { STUDENT_TEXT_TYPES } from '../../arbeitsblatt/generation/prompts'
import { CONTENT_SHARE, defaultWeights, formatById, formatsFor, suggestParts, writingWeightFor } from '../model/formats'
import { ANSWER_KEY_DETAILS } from '../model/types'
import type { Exam, ExamMeta, ExamPart, ExamSubjectId } from '../model/types'
import { distribute, examGrades, examMinutes, examPoints, examWeight, pointsFromWeight } from '../model/types'
import { suggestAll } from '../../../shared/components/optionsFilter'
import ExamVocabPicker from './ExamVocabPicker'
import { aiCall, useKlassenarbeit } from '../store'
import VorwissenChips from '../../arbeitsblatt/steps/VorwissenChips'
import BilingualSchalter from '../../arbeitsblatt/steps/BilingualSchalter'
import { GLOSSAR_HILFSMITTEL } from '../generation/glossar'
import { loadLastChoice, saveLastChoice } from '../../../shared/lastChoice'
import GradeScaleModal from '../../../shared/components/GradeScaleModal'
import SchulAngabe from '../../../shared/components/SchulAngabe'
import HaeufigSelect from '../../../shared/components/HaeufigSelect'
import StoffQuellen from '../../../shared/components/StoffQuellen'
import { UeberthemaFeldFuer } from '../../../shared/components/UeberthemaFeld'

const SUBJECTS: { value: ExamSubjectId; label: string }[] = [
  { value: 'englisch', label: 'Englisch' },
  { value: 'geschichte', label: 'Geschichte' }
]

function emptyExam(stateId: string, schoolTypeId: string, schoolTypeName: string, design: DesignTemplate): Exam {
  // Zuletzt gewählte Angaben gelten wieder (Fach, Jahrgang, Kursniveau)
  const last = loadLastChoice('klassenarbeit')
  // „Neu in diesem Bereich" gibt das Fach des Themenbereichs vor (shared/fachVorgabe.ts)
  const vorgabe = nimmFachVorgabe('klassenarbeit')
  const subject = SUBJECTS.find((s) => s.value === vorgabe) ?? SUBJECTS.find((s) => s.value === last.subjectId)
  return {
    version: 1,
    meta: {
      ...defaultExamMeta(stateId, schoolTypeId, schoolTypeName, last.grade),
      ...(subject ? { subjectId: subject.value, subjectLabel: subject.label } : {}),
      ...(last.courseLevel ? { courseLevel: last.courseLevel as ExamMeta['courseLevel'] } : {}),
      ...(last.cefrLevel ? { cefrLevel: last.cefrLevel as ExamMeta['cefrLevel'] } : {})
    },
    design,
    parts: [],
    createdAt: new Date().toISOString()
  }
}

/** Schritt 1: Rahmen der Arbeit und Aufbau aus den Aufgabenformaten des Fachs. */
export default function FrameStep(): React.JSX.Element {
  const { exam, setExam, update, setStep } = useKlassenarbeit()
  const appSettings = useAppSettings((s) => s.settings)
  const [table, setTable] = useState<CefrTable>({ version: 1, states: [] })
  const [designs, setDesigns] = useState<DesignTemplate[]>([])
  // Hörtexte: nur anbieten, wenn eine Stimme eingerichtet ist (ElevenLabs)
  const [tts, setTts] = useState(false)
  const [textOptions, setTextOptions] = useState<AiStatus['textOptions']>([])
  const [scaleOpen, setScaleOpen] = useState(false)

  useEffect(() => {
    Promise.all([window.api.cefr.get(), window.api.designs.list(), window.api.ai.status()])
      .then(([cefr, ds, status]) => {
        setTable(cefr)
        setDesigns(ds)
        setTts(status.hasTts)
        setTextOptions(status.textOptions)
        if (!useKlassenarbeit.getState().exam) {
          const last = loadLastChoice('klassenarbeit')
          const stateId = last.stateId ?? appSettings.defaults.stateId
          const schoolTypeId = last.schoolTypeId ?? appSettings.defaults.schoolTypeId
          const typeName = cefr.states.find((s) => s.id === stateId)?.schoolTypes.find((t) => t.id === schoolTypeId)?.name ?? 'Gymnasium'
          setExam(emptyExam(stateId, schoolTypeId, typeName, ds.find((d) => d.isDefault) ?? ds[0]))
        }
      })
      .catch(notifyError)
    // Läuft auch nach „Neue Klassenarbeit": Dort wird die Arbeit verworfen, und dieser Schritt
    // legt sofort eine frische an – sonst stünde das Formular leer da. Genau das war der Fall:
    // Nach dem Klick blieb der Bildschirm bis auf die Schrittleiste leer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam === null])

  // Auswahl für das nächste Mal merken
  useEffect(() => {
    const m = useKlassenarbeit.getState().exam?.meta
    if (!m) return
    saveLastChoice('klassenarbeit', {
      subjectId: m.subjectId,
      stateId: m.stateId,
      schoolTypeId: m.schoolTypeId,
      schoolTypeName: m.schoolTypeName,
      grade: m.grade,
      courseLevel: m.courseLevel,
      cefrLevel: m.cefrLevel
    })
  }, [exam?.meta.subjectId, exam?.meta.stateId, exam?.meta.schoolTypeId, exam?.meta.grade, exam?.meta.courseLevel, exam?.meta.cefrLevel])

  const available = useMemo(() => (exam ? formatsFor(exam.meta.subjectId, exam.meta.grade) : []), [exam])
  if (!exam) return <Container py="xl">Wird geladen …</Container>

  const meta = exam.meta
  // Fortlaufendes Tippen im selben Feld ist EIN Schritt für Strg+Z, nicht einer je Buchstabe
  const patch = (p: Partial<ExamMeta>): void => update((d) => Object.assign(d.meta, p), `angaben:${Object.keys(p).sort().join(',')}`)
  const range = gradeRange(table, meta.stateId, meta.schoolTypeId)
  const courseOptions = courseLevelOptions(meta.stateId, meta.schoolTypeId, meta.grade)
  const pointsPlanned = examPoints(exam)
  const minutesPlanned = examMinutes(exam)
  const curriculum = curriculumTopics(meta.stateId, meta.schoolTypeId, meta.grade)
  const source = curriculumSource(curriculum)
  const rules = stateRules(meta.stateId)
  const grades = examGrades(exam)
  const warnings = examWarnings(
    meta.stateId,
    meta.subjectId,
    meta.grade,
    exam.parts.map((p) => p.formatId)
  )

  /** Nach dem Hinzufügen oder Löschen die Anteile nach der Regel des Faches setzen */
  const applyWeights = (d: Exam): void => {
    const weights = defaultWeights(d.meta.subjectId, d.meta.grade, d.parts)
    d.parts.forEach((part, i) => {
      part.weight = weights[i] ?? part.weight
    })
    // Minuten und Punkte genau aufteilen, damit die Summen zur Vorgabe passen
    const shares = d.parts.map((p) => p.weight)
    const minutes = distribute(shares, d.meta.minutes)
    const points = distribute(shares, d.meta.points)
    d.parts.forEach((part, i) => {
      part.minutes = Math.max(1, minutes[i])
      if (d.meta.subjectId !== 'englisch') part.points = points[i]
    })
  }

  /** Die Anteile proportional auf 100 Prozent bringen – Summen bleiben genau */
  const normalizeWeights = (): void =>
    update((d) => {
      const sum = d.parts.reduce((n, p) => n + p.weight, 0)
      if (!sum) return
      const shares = d.parts.map((p) => p.weight)
      const weights = distribute(shares, 100)
      const minutes = distribute(shares, d.meta.minutes)
      const points = distribute(shares, d.meta.points)
      d.parts.forEach((p, i) => {
        p.weight = weights[i]
        p.minutes = Math.max(1, minutes[i])
        if (d.meta.subjectId !== 'englisch') p.points = points[i]
      })
    })

  const fillParts = (): void =>
    update((d) => {
      d.parts = suggestParts(d.meta.subjectId, d.meta.grade, d.meta.points, d.meta.minutes).map((p): ExamPart => ({
        id: newId(),
        formatId: p.formatId,
        label: formatById(p.formatId)?.label ?? '',
        competence: formatById(p.formatId)?.competence ?? '',
        weight: p.weight,
        points: p.points,
        minutes: p.minutes,
        gradeGroup: p.gradeGroup,
        ...(p.contentShare ? { contentShare: p.contentShare } : {}),
        afbMix: { I: 30, II: 45, III: 25 },
        blocks: []
      }))
    })

  // Der Hauptknopf steht fest unten und sagt, was fehlt (Paket 6)
  const sperrgrund = ersterGrund(
    [!meta.topic.trim(), 'Thema fehlt'],
    [exam.parts.length === 0, 'Aufbau fehlt – „Vorschlag erzeugen“ oder einen Teil hinzufügen']
  )
  const fuss = (
    <Formularfuss grund={sperrgrund}>
      <Button size="md" rightSection={<IconArrowRight size={18} />} disabled={Boolean(sperrgrund)} onClick={() => setStep(1)}>
        Weiter zu den Aufgaben
      </Button>
    </Formularfuss>
  )

  return (
    <FormularSeite fuss={fuss}>
      <ScrollArea h="100%">
        <Container size="xl" py="lg">
          <Group justify="space-between" align="flex-start" mb="md">
            <div>
              <Title order={2}>Rahmen der Arbeit</Title>
              <Text c="dimmed" size="sm">
                Fach, Jahrgang und Dauer bestimmen die Aufgabenformate, die Punkteverteilung und die Anforderungsbereiche.
              </Text>
            </div>
          </Group>

          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack>
                <Card withBorder>
                  <Title order={4} mb="sm">
                    Fach &amp; Inhalt
                  </Title>
                  <Stack gap="sm">
                    <Group grow>
                      <HaeufigSelect
                        art="fach"
                        label="Fach"
                        data={SUBJECTS}
                        value={meta.subjectId}
                        onChange={(v) =>
                          v &&
                          update((d) => {
                            d.meta.subjectId = v as ExamSubjectId
                            d.meta.subjectLabel = SUBJECTS.find((s) => s.value === v)?.label ?? ''
                            d.parts = []
                          })
                        }
                        allowDeselect={false}
                      />
                      <Select
                        label="Jahrgang"
                        data={Array.from({ length: range.max - range.min + 1 }, (_, i) => ({
                          value: String(range.min + i),
                          label: `Klasse ${range.min + i}`
                        }))}
                        value={String(meta.grade)}
                        onChange={(v) => {
                          if (!v) return
                          const grade = Number(v)
                          const level = suggestLevel(table, meta.stateId, meta.schoolTypeId, 1, grade)
                          update((d) => {
                            d.meta.grade = grade
                            d.meta.minutes = defaultMinutes(grade)
                            if (level && d.meta.subjectId === 'englisch') d.meta.cefrLevel = level.level
                            d.parts = []
                          })
                        }}
                        allowDeselect={false}
                      />
                    </Group>
                    {/* Paket 12: Titel rechts neben dem Thema, Jahrgang neben dem Fach – was zusammen gelesen wird, steht zusammen */}
                    <Group align="flex-start" gap="sm" wrap="wrap">
                      <Autocomplete
                        style={{ flex: 2, minWidth: 220 }}
                        label="Thema"
                        required
                        description={
                          meta.subjectId === 'geschichte' && curriculum.length
                            ? `Themen aus dem Lehrplan für ${meta.schoolTypeName} in Klasse ${meta.grade} – oder frei eintippen.`
                            : undefined
                        }
                        placeholder={meta.subjectId === 'englisch' ? 'z. B. Going abroad' : 'z. B. Industrialisierung'}
                        data={meta.subjectId === 'geschichte' ? curriculum.map((t) => (t.code ? `${t.code}: ${t.label}` : t.label)) : []}
                        value={meta.topic}
                        onChange={(v) => patch({ topic: v })}
                        limit={40}
                        filter={suggestAll}
                      />
                      <TextInput
                        style={{ flex: 1, minWidth: 180 }}
                        label="Titel der Arbeit (optional)"
                        placeholder="z. B. 2. Klassenarbeit"
                        value={meta.title}
                        onChange={(e) => patch({ title: e.currentTarget.value })}
                      />
                    </Group>
                    {meta.subjectId === 'geschichte' && (
                      <Text size="xs" c="dimmed">
                        {source ? (
                          <>
                            Quelle der Themenliste: {source.title}.{' '}
                            <Anchor href={source.url} target="_blank" size="xs">
                              Lehrplan öffnen
                            </Anchor>
                            {curriculum[0]?.gradeLabel ? ` · ${curriculum[0].gradeLabel}` : ''}
                          </>
                        ) : (
                          'Für dieses Bundesland und diese Schulform sind noch keine Lehrplanthemen hinterlegt – Thema bitte frei eintragen.'
                        )}
                      </Text>
                    )}
                    {meta.subjectId === 'englisch' && exam.parts.some((p) => p.formatId === 'en-grammar') && (
                      <Autocomplete
                        label="Grammatikthema der Arbeit"
                        description="Aus der Liste wählen oder frei eintippen"
                        data={grammarTopicsFor({ subjectId: 'englisch', grade: meta.grade, schoolTypeId: meta.schoolTypeId, stateId: meta.stateId }).map(
                          (t) => t.label
                        )}
                        value={meta.grammarTopic}
                        onChange={(v) => patch({ grammarTopic: v })}
                        limit={40}
                        filter={suggestAll}
                      />
                    )}
                    <Textarea
                      label="Inhalte der Unterrichtseinheit"
                      description="Worauf sich die Arbeit bezieht – Themen, Texte, Grammatik, Begriffe. Nur Geübtes wird geprüft."
                      autosize
                      minRows={3}
                      value={meta.content}
                      onChange={(e) => patch({ content: e.currentTarget.value })}
                    />
                    {/* Hier meint das Feld den geprüften Stoff: typische Inhalte der Einheit statt Vorwissen */}
                    <VorwissenChips
                      modus="stoff"
                      anfrage={{
                        subjectId: meta.subjectId,
                        topic: meta.topic,
                        grade: meta.grade,
                        stateId: meta.stateId,
                        schoolTypeId: meta.schoolTypeId,
                        // Englisch mit Lehrwerk: Thema und Grammatik der gewählten Unit
                        lehrwerkStand: lehrwerkStandAus(meta.vocab),
                        // GER-Kennzeichen an den Chips (Paket 12): Richtwert ist das Niveau der Arbeit
                        gerRichtwert: meta.subjectId === 'englisch' ? meta.cefrLevel : undefined
                      }}
                      wert={meta.content}
                      onChange={(content) => patch({ content })}
                      ai={aiCall}
                    />
                    {/*
                    Unterlagen aus dem Unterricht hineinziehen – wie in der Lernzielkontrolle
                    (Wunsch der Lehrkraft, 25.09.2026). Text und Seitenbilder gehen in jede
                    Anfrage der Erzeugung mit (generation/generateExam.ts, unterlagenTeil).
                  */}
                    <StoffQuellen
                      quellen={meta.materialQuellen ?? []}
                      onHinzu={(neu) =>
                        update((d) => {
                          d.meta.materialQuellen = [...(d.meta.materialQuellen ?? []), ...neu]
                        })
                      }
                      onAktiv={(id, aktiv) =>
                        update((d) => {
                          const q = d.meta.materialQuellen?.find((x) => x.id === id)
                          if (q) q.aktiv = aktiv
                        })
                      }
                      onEntfernen={(id) =>
                        update((d) => {
                          d.meta.materialQuellen = (d.meta.materialQuellen ?? []).filter((x) => x.id !== id)
                        })
                      }
                      title="Material aus dem Unterricht hierher ziehen"
                      hint="Arbeitsblatt, Buchseite, Tafelbild, Text – PDF, Word, Foto oder Textdatei"
                      erklaerung="Die KI prüft nur, was im Unterricht dran war – Begriffe und Beispiele aus diesen Unterlagen werden übernommen, Texte daraus aber nicht wörtlich abgedruckt."
                    />
                    {/*
                    Bilingual (nur Sachfächer, hier also Geschichte). Das Glossar liegt der Arbeit als
                    Hilfsmittel bei und steht deshalb von selbst bei den erlaubten Hilfsmitteln.
                  */}
                    <BilingualSchalter
                      pruefung
                      meta={meta}
                      onChange={(bilingual) => patch({ bilingual, aids: mitGlossar(meta.aids, Boolean(bilingual?.an)) })}
                    />
                    {meta.subjectId === 'englisch' && (
                      <div>
                        <Text size="sm" fw={500}>
                          Vokabeln für die Arbeit
                        </Text>
                        <Text size="xs" c="dimmed" mb="xs">
                          Nur diese Vokabeln dürfen in der Arbeit vorkommen – geprüft wird, was geübt wurde.
                        </Text>
                        <ExamVocabPicker language="en" vocab={meta.vocab} onChange={(vocab) => patch({ vocab })} />
                      </div>
                    )}
                  </Stack>
                </Card>

                <Card withBorder>
                  <Title order={4} mb="sm">
                    Lerngruppe
                  </Title>
                  <Stack gap="sm">
                    <SchulAngabe
                      stateId={meta.stateId}
                      stateName={STATES.find((s) => s.id === meta.stateId)?.name ?? meta.stateId}
                      schoolTypeId={meta.schoolTypeId}
                      schoolTypeName={meta.schoolTypeName}
                    >
                      <Group grow>
                        <HaeufigSelect
                          art="bundesland"
                          label="Bundesland"
                          data={STATES.map((s) => ({ value: s.id, label: s.name }))}
                          value={meta.stateId}
                          onChange={(v) => {
                            if (!v) return
                            /*
                             * Die Schulform mitziehen, wie in Lernzielkontrolle und Grammatiktest: Bis
                             * 25.09.2026 blieb sie stehen, auch wenn es sie im neuen Land nicht gibt –
                             * die Auswahl zeigte dann nichts an, gerechnet wurde mit der alten.
                             */
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
                        <HaeufigSelect
                          art="schulform"
                          label="Schulform"
                          data={schoolTypesForState(table, meta.stateId)}
                          value={meta.schoolTypeId}
                          onChange={(v) => {
                            const name = schoolTypesForState(table, meta.stateId).find((t) => t.value === v)?.label ?? meta.schoolTypeName
                            if (v) patch({ schoolTypeId: v, schoolTypeName: name })
                          }}
                          allowDeselect={false}
                        />
                      </Group>
                    </SchulAngabe>
                    {(courseOptions || meta.subjectId === 'englisch') && (
                      <Group grow>
                        {courseOptions && (
                          <Select
                            label="Kursniveau"
                            data={courseOptions}
                            value={meta.courseLevel}
                            onChange={(v) => v && patch({ courseLevel: v as ExamMeta['courseLevel'] })}
                            allowDeselect={false}
                          />
                        )}
                        {meta.subjectId === 'englisch' && (
                          <Select
                            label="Sprachniveau (GER)"
                            data={[...CEFR_SCALE]}
                            value={meta.cefrLevel}
                            onChange={(v) => v && patch({ cefrLevel: v as CefrLevel })}
                            allowDeselect={false}
                          />
                        )}
                      </Group>
                    )}
                  </Stack>
                </Card>
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack>
                <Card withBorder>
                  <Title order={4} mb="sm">
                    Rahmen
                  </Title>
                  <Stack gap="sm">
                    <Group grow>
                      <NumberInput
                        label="Dauer (Minuten)"
                        min={20}
                        max={300}
                        step={5}
                        value={meta.minutes}
                        onChange={(v) => patch({ minutes: Number(v) || 45 })}
                      />
                      {meta.subjectId !== 'englisch' && (
                        <NumberInput
                          label="Gesamtpunkte"
                          min={10}
                          max={200}
                          step={5}
                          value={meta.points}
                          onChange={(v) => patch({ points: Number(v) || 60 })}
                        />
                      )}
                    </Group>
                    {/*
                    Fassungen wie in der Lernzielkontrolle. Bis 25.09.2026 stand hier ein Feld
                    „Varianten (A/B)", das nichts bewirkte. Was „gleichwertig" heißt, steht in
                    model/fassungen.ts.
                  */}
                    <div>
                      <Text size="sm" fw={500} mb={4}>
                        Fassungen
                      </Text>
                      <SegmentedControl
                        fullWidth
                        size="sm"
                        aria-label="Fassungen"
                        value={String(Math.min(3, Math.max(1, meta.variants)))}
                        onChange={(v) => patch({ variants: Number(v) })}
                        data={[
                          { value: '1', label: 'eine' },
                          { value: '2', label: 'A / B' },
                          { value: '3', label: 'A / B / C' }
                        ]}
                      />
                      {meta.variants > 1 && (
                        <MehrText
                          mt={4}
                          text="Gleichwertige Parallelaufgaben: gleiche Operatoren, Anforderungsbereiche und Punkte. Hörtexte und Quellen bleiben für alle gleich, Lese- und Sprachmittlungstexte werden als Paralleltexte gleicher Länge geschrieben. Jede Fassung hat ihren eigenen Erwartungshorizont."
                        />
                      )}
                    </div>
                    <Autocomplete
                      label="Erlaubte Hilfsmittel"
                      description="Vorschlag wählen oder frei eintragen"
                      data={AIDS_SUGGESTIONS}
                      value={meta.aids}
                      onChange={(v) => patch({ aids: v })}
                      limit={12}
                      filter={suggestAll}
                    />
                    {exam.parts.some((p) => p.formatId === 'en-listening') && (
                      <Card withBorder padding="sm" bg="var(--mantine-color-default-hover)">
                        <Checkbox
                          label="Hörtext von der KI schreiben lassen"
                          description={
                            tts
                              ? 'Der Hörtext entsteht vor der Arbeit in einer eigenen Anfrage; die Aufgaben werden dann zu ihm gebaut. Vertont wird er danach im Reiter „Hörtexte“.'
                              : 'Die KI schreibt den Hörtext, die Aufgaben entstehen dazu. Vertonen geht erst mit einem ElevenLabs-Schlüssel – ohne ihn bleibt das Skript als Lesetext für die Lehrkraft.'
                          }
                          checked={Boolean(meta.audioAi)}
                          onChange={(e) => patch({ audioAi: e.currentTarget.checked })}
                        />
                        {meta.audioAi && (
                          <Stack gap="sm" mt="sm">
                            <Select
                              size="sm"
                              label="Hörtextsorte"
                              description={
                                listeningFormatById(meta.audioFormat ?? '')?.description ?? `Automatisch: passend zu Thema und Niveau ${meta.cefrLevel}.`
                              }
                              data={[
                                { value: 'auto', label: 'automatisch (passend zum Niveau)' },
                                ...listeningFormatsFor(meta.cefrLevel).map((f) => ({
                                  value: f.id,
                                  label: `${f.label} · ${f.mode === 'dialog' ? 'dialogisch' : 'monologisch'}, ${f.seconds[0]}–${f.seconds[1]} s`
                                }))
                              ]}
                              value={meta.audioFormat ?? 'auto'}
                              onChange={(v) => v && patch({ audioFormat: v })}
                              allowDeselect={false}
                            />
                            {textOptions.length > 1 && (
                              <Select
                                size="sm"
                                label="KI für den Hörtext"
                                description="Nur dieser eine Auftrag geht an das gewählte Modell."
                                data={[
                                  { value: '', label: 'wie in den Einstellungen' },
                                  ...textOptions.map((o) => ({ value: `${o.provider}|${o.model}`, label: o.label }))
                                ]}
                                value={meta.audioProvider ? `${meta.audioProvider}|${meta.audioModel ?? ''}` : ''}
                                onChange={(v) => {
                                  const [provider, model] = (v ?? '').split('|')
                                  patch({ audioProvider: (provider || undefined) as ExamMeta['audioProvider'], audioModel: model || undefined })
                                }}
                                allowDeselect={false}
                              />
                            )}
                          </Stack>
                        )}
                      </Card>
                    )}
                  </Stack>
                </Card>

                <Card withBorder>
                  <Group justify="space-between" mb="sm">
                    <Title order={4}>Aufbau der Arbeit</Title>
                    <Group gap="xs">
                      {exam.parts.length > 0 && examWeight(exam) !== 100 && (
                        <Button size="compact-sm" variant="subtle" onClick={normalizeWeights}>
                          Anteile auf 100 %
                        </Button>
                      )}
                      <Button size="compact-sm" variant="light" onClick={fillParts}>
                        Vorschlag erzeugen
                      </Button>
                    </Group>
                  </Group>
                  {exam.parts.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      Noch keine Teile geplant. „Vorschlag erzeugen“ verteilt die üblichen Formate des Fachs auf {meta.points} Punkte und {meta.minutes}{' '}
                      Minuten.
                    </Text>
                  ) : (
                    <Stack gap="xs">
                      {exam.parts.map((part, i) => {
                        const format = formatById(part.formatId)
                        return (
                          <Card key={part.id} withBorder padding="sm">
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                              <div style={{ minWidth: 0 }}>
                                <Group gap="xs">
                                  <Badge variant="light">Teil {i + 1}</Badge>
                                  <Text fw={600}>{format?.label ?? part.label}</Text>
                                  <Badge variant="outline" color="gray">
                                    {part.competence}
                                  </Badge>
                                  <Badge variant="outline" color="gray">
                                    AFB {format?.afb.join('/') ?? '–'}
                                  </Badge>
                                  {meta.subjectId === 'englisch' && meta.separateWritingGrade && (
                                    <Badge variant="light" color={part.gradeGroup === 'writing' ? 'grape' : 'blue'}>
                                      {part.gradeGroup === 'writing' ? 'Note Schreiben' : 'Note weitere Kompetenzen'}
                                    </Badge>
                                  )}
                                </Group>
                                <Text size="xs" c="dimmed" mt={4}>
                                  {format?.description}
                                </Text>
                                {format?.note && (
                                  <Text size="xs" c="dimmed" mt={2}>
                                    Hinweis: {format.note}
                                  </Text>
                                )}
                                {typeof part.contentShare === 'number' && (
                                  <Group gap={6} align="flex-end" mt="xs">
                                    <NumberInput
                                      size="xs"
                                      w={110}
                                      label="Inhalt %"
                                      min={10}
                                      max={90}
                                      step={5}
                                      value={part.contentShare}
                                      onChange={(v) => update((d) => (d.parts[i].contentShare = Math.max(10, Math.min(90, Number(v) || CONTENT_SHARE))))}
                                    />
                                    <Text size="xs" c="dimmed" pb={6}>
                                      Sprache {100 - (part.contentShare ?? CONTENT_SHARE)} %
                                      {part.points > 0
                                        ? ` · ${Math.round((part.points * (part.contentShare ?? CONTENT_SHARE)) / 100)} von ${part.points} Punkten auf den Inhalt`
                                        : ' · Bewertung über Inhalt und Sprache, nicht über Punkte'}
                                    </Text>
                                  </Group>
                                )}
                                {typeof part.contentShare === 'number' && (
                                  <Select
                                    mt="xs"
                                    size="xs"
                                    label="Textsorte des Schülertextes"
                                    data={STUDENT_TEXT_TYPES.map((t) => ({
                                      value: t.value,
                                      label: t.label
                                    }))}
                                    value={part.studentTextType ?? ''}
                                    onChange={(v) => update((d) => (d.parts[i].studentTextType = v ?? ''))}
                                    allowDeselect={false}
                                  />
                                )}
                                <Textarea
                                  mt="xs"
                                  size="xs"
                                  label="Nähere Vorgaben (optional)"
                                  description="Was dieser Teil genau enthalten soll – Thema des Materials, Schwerpunkt, Textsorte, zu prüfende Struktur."
                                  placeholder={
                                    typeof part.contentShare === 'number'
                                      ? 'z. B. Die Schüler schreiben an ihren Austauschpartner über einen Schulausflug.'
                                      : 'z. B. Sachtext über ein Musikfestival, Aufgaben auch zu impliziten Aussagen.'
                                  }
                                  autosize
                                  minRows={2}
                                  defaultValue={part.notes ?? ''}
                                  onBlur={(e) => update((d) => (d.parts[i].notes = e.currentTarget.value))}
                                />
                                {(part.formatId === 'en-listening' || part.formatId === 'en-reading') && (
                                  <MultiSelect
                                    mt="xs"
                                    size="xs"
                                    label="Aufgabenformate"
                                    data={comprehensionFormatsFor(part.formatId === 'en-listening' ? 'listening' : 'reading', meta.grade).map((f) => ({
                                      value: f.id,
                                      label: `${f.label} (${f.openness})`
                                    }))}
                                    value={part.formats ?? []}
                                    onChange={(v) => update((d) => (d.parts[i].formats = v))}
                                    placeholder={defaultComprehensionFormats(part.formatId === 'en-listening' ? 'listening' : 'reading', meta.grade)
                                      .map((id) => comprehensionFormatById(id)?.label)
                                      .filter(Boolean)
                                      .join(' · ')}
                                    clearable
                                  />
                                )}
                                {(part.formatId === 'en-listening' || part.formatId === 'en-reading') && (
                                  <NumberInput
                                    mt="xs"
                                    size="xs"
                                    w={220}
                                    label="Zahl der Items"
                                    description={
                                      part.items
                                        ? `Genau ${part.items} Items, ein Punkt je Item – der Teil hat damit ${part.items} Punkte.`
                                        : 'Leer lassen: Zahl nach Niveau. Eingetragen gilt sie genau und setzt die Punkte des Teils (ein Punkt je Item).'
                                    }
                                    placeholder={`automatisch (${listeningRules(meta.cefrLevel).items[0]}–${listeningRules(meta.cefrLevel).items[1]})`}
                                    min={1}
                                    max={30}
                                    value={part.items || ''}
                                    onChange={(v) =>
                                      update((d) => {
                                        const n = Number(v) || 0
                                        d.parts[i].items = n
                                        // Ein Item = ein Punkt: Sonst stünde im Erwartungshorizont
                                        // eine Punktzahl, die zur Zahl der Items nicht passt.
                                        if (n > 0) d.parts[i].points = n
                                      })
                                    }
                                  />
                                )}
                              </div>
                              <Group gap={6} wrap="nowrap">
                                <NumberInput
                                  size="xs"
                                  w={78}
                                  label="Anteil %"
                                  min={5}
                                  max={100}
                                  step={5}
                                  suffix=" %"
                                  clampBehavior="blur"
                                  value={part.weight}
                                  onChange={(v) => {
                                    const weight = typeof v === 'number' ? v : Number(v)
                                    if (!Number.isFinite(weight)) return
                                    update((d) => {
                                      d.parts[i].weight = weight
                                      d.parts[i].minutes = Math.max(1, Math.round((d.meta.minutes * weight) / 100))
                                      // In Geschichte ergibt sich die eine Note aus den Punkten, dort folgen sie dem Anteil
                                      if (d.meta.subjectId !== 'englisch') d.parts[i].points = pointsFromWeight(weight, d.meta.points)
                                    })
                                  }}
                                />
                                {(meta.subjectId !== 'englisch' || part.points > 0) && (
                                  <NumberInput
                                    size="xs"
                                    w={78}
                                    label="Punkte"
                                    min={0}
                                    max={200}
                                    clampBehavior="blur"
                                    value={part.points}
                                    onChange={(v) => update((d) => (d.parts[i].points = Number(v) || 0))}
                                  />
                                )}
                                <NumberInput
                                  size="xs"
                                  w={70}
                                  label="Minuten"
                                  min={1}
                                  max={meta.minutes}
                                  value={part.minutes}
                                  onChange={(v) => update((d) => (d.parts[i].minutes = Number(v) || 1))}
                                />
                                <Tooltip label="Teil entfernen">
                                  <ActionIcon
                                    mt={22}
                                    variant="subtle"
                                    color="red"
                                    onClick={() =>
                                      update((d) => {
                                        d.parts.splice(i, 1)
                                        applyWeights(d)
                                      })
                                    }
                                  >
                                    <IconTrash size={16} />
                                  </ActionIcon>
                                </Tooltip>
                              </Group>
                            </Group>
                          </Card>
                        )
                      })}
                    </Stack>
                  )}

                  <Select
                    mt="sm"
                    size="xs"
                    label="Weiteren Teil hinzufügen"
                    placeholder="Aufgabenformat wählen"
                    data={available.map((f) => ({
                      value: f.id,
                      label: `${f.label} – ${f.competence}`
                    }))}
                    value={null}
                    onChange={(v) => {
                      const f = formatById(v ?? '')
                      if (!f) return
                      update((d) => {
                        const weight = Math.max(5, Math.min(100, f.share))
                        d.parts.push({
                          id: newId(),
                          formatId: f.id,
                          label: f.label,
                          competence: f.competence,
                          weight,
                          points: d.meta.subjectId === 'englisch' ? (f.defaultPoints ?? 0) : pointsFromWeight(weight, d.meta.points),
                          minutes: Math.max(1, Math.round((d.meta.minutes * weight) / 100)),
                          gradeGroup: f.id === 'en-writing' ? 'writing' : 'other',
                          ...(f.productive ? { contentShare: CONTENT_SHARE } : {}),
                          afbMix: { I: 30, II: 45, III: 25 },
                          blocks: []
                        })
                        // Der Schreibteil bekommt 70 % (Klasse 5: 60 %), die weitere Kompetenz den Rest
                        applyWeights(d)
                      })
                    }}
                  />

                  {exam.parts.length > 0 && (minutesPlanned !== meta.minutes || (meta.subjectId !== 'englisch' && pointsPlanned !== meta.points)) && (
                    <Alert color="orange" mt="sm" icon={<IconAlertTriangle size={16} />} p="xs">
                      <Text size="sm">
                        Geplant sind {minutesPlanned} von {meta.minutes} Minuten
                        {meta.subjectId !== 'englisch' ? ` und ${pointsPlanned} von ${meta.points} Punkten` : ''}.
                      </Text>
                    </Alert>
                  )}
                </Card>

                {meta.subjectId === 'englisch' && exam.parts.length > 0 && (
                  <Card withBorder>
                    <Group justify="space-between" mb="sm">
                      <Title order={4}>Noten</Title>
                      <Switch
                        size="xs"
                        label="Schreibteil mit eigener Note"
                        checked={meta.separateWritingGrade}
                        onChange={(e) => patch({ separateWritingGrade: e.currentTarget.checked })}
                      />
                    </Group>
                    <Stack gap="xs">
                      {meta.separateWritingGrade ? (
                        grades.map((g) => (
                          <div key={g.group}>
                            <Group justify="space-between">
                              <Text size="sm" fw={600}>
                                {g.label}
                              </Text>
                              <Text size="sm" c="dimmed">
                                {g.points > 0 ? `Teilnote aus ${g.points} Punkten` : 'Teilnote aus Inhalt und Sprache'} · zählt {g.weight} %
                                {g.content !== undefined ? ` · Inhalt ${g.content} / Sprache ${g.language} Punkte` : ''}
                              </Text>
                            </Group>
                            {g.points > 0 && (
                              <Text size="xs" c="dimmed">
                                Notenschlüssel: {gradeScaleLine(g.points, meta.gradeScaleThresholds)}
                              </Text>
                            )}
                          </div>
                        ))
                      ) : (
                        <>
                          <Text size="sm" c="dimmed">
                            Eine Gesamtnote über alle Teile ({examWeight(exam)} % · {pointsPlanned} Punkte).
                          </Text>
                          {pointsPlanned > 0 && (
                            <Text size="xs" c="dimmed">
                              Notenschlüssel: {gradeScaleLine(pointsPlanned, meta.gradeScaleThresholds)}
                            </Text>
                          )}
                        </>
                      )}
                      {examWeight(exam) !== 100 && (
                        <Alert color="orange" icon={<IconAlertTriangle size={16} />} p="xs">
                          <Text size="sm">Die Anteile ergeben {examWeight(exam)} % statt 100 %.</Text>
                        </Alert>
                      )}
                      <MehrText
                        text={`In Niedersachsen erhält der Schreibteil eine eigenständige Note; die übrigen geprüften Kompetenzen ergeben zusammen die zweite Note. Jeder Teil hat eigene Punkte – daraus entsteht seine Teilnote, und erst die Teilnoten werden nach ihrem Anteil verrechnet: ${writingWeightFor(meta.grade)} % Schreiben und ${100 - writingWeightFor(meta.grade)} % weitere Kompetenz in Klasse ${meta.grade}. Leseverstehen und Hörverstehen sind mit 21 Punkten vorbelegt. Schreiben und Sprachmittlung werden im Verhältnis ${CONTENT_SHARE} % Inhalt zu ${100 - CONTENT_SHARE} % Sprache bewertet.`}
                      />
                    </Stack>
                  </Card>
                )}

                {/*
                 * Immer sichtbar (Paket 7, Nachtrag der Lehrkraft): Ob und wie ausführlich ein
                 * Erwartungshorizont entsteht und ob die Schreibaufgabe Formulierungshilfen bekommt,
                 * wird bei jeder Arbeit entschieden – eingeklappt ging das unter.
                 */}
                <Card withBorder>
                  <Title order={4} mb="sm">
                    Erwartungshorizont und Hilfen
                  </Title>
                  <Stack gap="sm">
                    <Switch label="Erwartungshorizont erstellen" checked={meta.answerKey} onChange={(e) => patch({ answerKey: e.currentTarget.checked })} />
                    {meta.answerKey && (
                      <Select
                        label="Ausführlichkeit des Erwartungshorizonts"
                        description={ANSWER_KEY_DETAILS.find((d) => d.value === meta.answerKeyDetail)?.description}
                        data={ANSWER_KEY_DETAILS.map((d) => ({
                          value: d.value,
                          label: d.label
                        }))}
                        value={meta.answerKeyDetail}
                        onChange={(v) =>
                          v &&
                          patch({
                            answerKeyDetail: v as ExamMeta['answerKeyDetail']
                          })
                        }
                        allowDeselect={false}
                      />
                    )}
                    {exam.parts.some((p) => p.formatId?.startsWith('en-writing') || p.formatId === 'en-mediation') && (
                      <Checkbox
                        label="Formulierungshilfen zur Schreibaufgabe mit abdrucken"
                        description="In den Abschlussprüfungen gibt es sie nicht; in Bayern zählen übernommene Wendungen ausdrücklich nicht für die sprachliche Bandbreite. Für eine Übungsarbeit kann es trotzdem sinnvoll sein."
                        checked={Boolean(meta.writingScaffold)}
                        onChange={(e) => patch({ writingScaffold: e.currentTarget.checked })}
                      />
                    )}
                  </Stack>
                </Card>

                {(warnings.length > 0 || rules) && (
                  <Card withBorder>
                    <Title order={4} mb="sm">
                      Vorgaben in {STATES.find((x) => x.id === meta.stateId)?.name ?? meta.stateId}
                    </Title>
                    <Stack gap="xs">
                      {warnings.map((w, i) => (
                        <Alert key={i} color="orange" icon={<IconAlertTriangle size={16} />} p="xs">
                          <Text size="sm">{w}</Text>
                        </Alert>
                      ))}
                      {rules && (
                        <Text size="sm" c="dimmed">
                          Zahl: {meta.subjectId === 'geschichte' ? rules.otherSubject : rules.mainSubject} · Dauer: {rules.duration} · Ankündigung:{' '}
                          {rules.announce} · höchstens {rules.perDay} pro Tag und {rules.perWeek} pro Woche · Korrektur: {rules.correction}
                          <br />
                          Gewichtung: {rules.weighting}
                        </Text>
                      )}
                      {rules && rules.notes.length > 0 && (
                        <MehrText
                          kurz={
                            rules.notes.length === 1 ? 'Ein weiterer Hinweis zur Landesvorgabe.' : `${rules.notes.length} weitere Hinweise zur Landesvorgabe.`
                          }
                        >
                          {rules.notes.map((n, i) => (
                            <Text key={i} size="xs" c="dimmed">
                              · {n}
                            </Text>
                          ))}
                        </MehrText>
                      )}
                    </Stack>
                  </Card>
                )}
              </Stack>
            </Grid.Col>
          </Grid>

          {/*
           * Selten Geändertes eingeklappt (Paket 6): Darstellung, Notenschlüssel, Design und
           * Wortzahl. Die Überschrift nennt, was vom Standard abweicht. Erwartungshorizont und
           * Formulierungshilfen stehen seit Paket 7 wieder oben.
           */}
          <Box mt="md">
            <WeitereOptionen modul="klassenarbeit" geaendert={geaenderteOptionen(exam, designs)}>
              <Grid>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Stack gap="sm">
                    <Group>
                      <Switch label="Kopfkasten auf der Arbeit" checked={meta.infoBox} onChange={(e) => patch({ infoBox: e.currentTarget.checked })} />
                      <Switch
                        label="Notenschlüssel auch auf der Arbeit"
                        description="Er steht ohnehin im Erwartungshorizont – hier zusätzlich auf dem Schülermaterial."
                        checked={meta.gradeScale}
                        onChange={(e) => patch({ gradeScale: e.currentTarget.checked })}
                      />
                      <Button size="compact-sm" variant="light" onClick={() => setScaleOpen(true)}>
                        Notenschlüssel bearbeiten
                      </Button>
                    </Group>
                  </Stack>
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Stack gap="sm">
                    <Select
                      label="Designvorlage"
                      data={designs.map((d) => ({ value: d.id, label: d.name }))}
                      value={exam.design?.id}
                      onChange={(v) => {
                        const d = designs.find((x) => x.id === v)
                        if (d) update((draft) => (draft.design = d))
                      }}
                      allowDeselect={false}
                    />
                    {/* Paket 10a: dezent in der Fachfarbe, auch im Erwartungshorizont – hier abschaltbar */}
                    <VorlagenfarbeSchalter fach={meta.subjectId} checked={Boolean(meta.vorlagenfarbe)} onChange={(an) => patch({ vorlagenfarbe: an })} />
                    {/* Paket 11: Überthema im Kopf der Arbeit – standardmäßig der Themenbereich */}
                    <UeberthemaFeldFuer moduleId="klassenarbeit" docId={useKlassenarbeit.getState().docId} werte={meta} onChange={(p) => patch(p)} />
                    {/*
                     * Formulierungshilfen in einer ARBEIT – bewusst abschaltbar und aus.
                     *
                     * In keiner der eingesehenen amtlichen Abschlussprüfungen bekommen die
                     * Prüflinge ein sprachliches Gerüst. Bayern nimmt aus der Angabe
                     * übernommene Wendungen sogar von der Bewertung der Bandbreite aus. Die
                     * Beschreibung sagt das, damit die Entscheidung nicht blind fällt.
                     */}
                    {exam.parts.some((p) => p.formatId?.startsWith('en-writing') || p.formatId === 'en-mediation') && (
                      <Checkbox
                        label="Wortzahl auf der Arbeit nennen"
                        description={
                          wortzahlErlaubt(meta.stateId, meta.subjectId)
                            ? 'Der geplante Umfang steuert immer Schreibraum und Erwartungshorizont. Ob er den Lernenden auch genannt wird, wird hier entschieden.'
                            : WORTZAHL_GRUND
                        }
                        checked={wortzahlErlaubt(meta.stateId, meta.subjectId) && Boolean(meta.wordLimit)}
                        disabled={!wortzahlErlaubt(meta.stateId, meta.subjectId)}
                        onChange={(e) => patch({ wordLimit: e.currentTarget.checked })}
                      />
                    )}
                  </Stack>
                </Grid.Col>
              </Grid>
            </WeitereOptionen>
          </Box>
          <Box h="md" />
          <GradeScaleModal
            opened={scaleOpen}
            onClose={() => setScaleOpen(false)}
            points={gradeScaleGroups(exam)[0]?.points ?? pointsPlanned}
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
 * Zusammenfassung in der eingeklappten Überschrift. Nur eingeklappte Felder zählen.
 */
export function geaenderteOptionen(exam: Exam, designs: DesignTemplate[]): string[] {
  const m = exam.meta
  const standardDesign = designs.find((x) => x.isDefault) ?? designs[0]
  const schreiben = exam.parts.some((p) => p.formatId?.startsWith('en-writing') || p.formatId === 'en-mediation')
  return [
    m.infoBox ? '' : 'ohne Kopfkasten',
    m.gradeScale ? 'Notenschlüssel auf der Arbeit' : '',
    m.gradeScaleThresholds ? 'eigener Notenschlüssel' : '',
    exam.design && standardDesign && exam.design.id !== standardDesign.id ? `Design „${exam.design.name}“` : '',
    schreiben && m.wordLimit ? 'Wortzahl genannt' : '',
    m.vorlagenfarbe ? 'Farbe der Vorlage' : ''
  ].filter(Boolean)
}

/** Das Glossar bei den Hilfsmitteln nennen – oder wieder herausnehmen, wenn bilingual aus ist. */
function mitGlossar(aids: string, an: boolean): string {
  const teile = aids
    .split(/\s*[,;]\s*/)
    .map((t) => t.trim())
    .filter((t) => t && t !== GLOSSAR_HILFSMITTEL)
  return (an ? [...teile, GLOSSAR_HILFSMITTEL] : teile).join(', ')
}

/** Band und Unit aus der ersten zugeordneten Vokabelliste, die sie kennt */
function lehrwerkStandAus(vocab: ExamMeta['vocab']): { buch: string; unit: string; fruehereBaende?: string[] } | undefined {
  const k = vocab.map((v) => v.known).find((k) => k?.buch && k.unit)
  return k ? { buch: k.buch!, unit: k.unit!, fruehereBaende: k.fruehereBaende } : undefined
}
