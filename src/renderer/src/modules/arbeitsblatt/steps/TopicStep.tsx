import { schulbuchAusSeiten } from '../../../shared/schulbuch/SchulbuchDialog'
import InterkulturSchalter from './InterkulturSchalter'
import VideoTranskript, { videoMaterialArt } from './VideoTranskript'
import { sehtextQuelle } from '../didactics/sehtext'
import VersuchKarte from './VersuchKarte'
import { versuchAuftrag } from '../auftraege'
import { hatProtokolle } from '../didactics/protokoll'
import { nimmFachVorgabe, nimmThemaVorgabe } from '../../../shared/fachVorgabe'
import { pruefeHochladen } from '../../../shared/datenschutz'
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
  MultiSelect,
  Radio,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title
} from '@mantine/core'
import ZahlFeld from '../../../shared/components/ZahlFeld'
import { IconDownload, IconAlertTriangle, IconBook2, IconListDetails, IconSparkles, IconTrash } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import UrlQuelleEingabe from '../../../shared/components/UrlQuelleEingabe'
import StufenWahl from './StufenWahl'
import { STANDARD_STUFEN, stufeFuer } from '../didactics/schwierigkeit'
import { istVideoAdresse, normalisiereAdresse } from '../../../shared/files/urlQuelle'
import type { DesignTemplate } from '@shared/design'
import { AiStatus, CEFR_SCALE, CefrLevel, CefrTable } from '@shared/types'
import DropZone from '../../../shared/components/DropZone'
import { suggestLevel, languageTracks } from '../../../shared/cefr'
import { extractContent, MATERIAL_ACCEPT } from '../../../shared/files/extractContent'
import { useAppSettings } from '../../../shared/settingsStore'
import { notifyError, notifySuccess } from '../../../shared/util'
import { newId } from '../../vokabeltest/model/random'
import { comprehensionFormatById, comprehensionFormatsFor, defaultComprehensionFormats } from '../didactics/comprehensionFormats'
import { istDeutschZuhoeren, ZUHOEREN_MODES, type ZuhoerenMode } from '../didactics/zuhoeren'
import { hasGrammar } from '../didactics/grammar'
import GrammarPicker from './GrammarPicker'
import { VerbAufgabeKarte } from './VerbAufgabeKarte'
import { LANGUAGE_MODES, LanguageMode } from '../didactics/language'
import { CourseLevel, courseLevelOptions, gradeRange } from '../didactics/schoolProfiles'
import SchulortFelder from '../../../shared/components/SchulortFelder'
import { mitLerngruppe } from '../../../shared/lerngruppe'
import { appendCompetence, suggestCompetence } from '../generation/competences'
import { planeGliederung } from '../auftraege'
import AbiturCard from './AbiturCard'
import BilingualSchalter from './BilingualSchalter'
import VorwissenChips from './VorwissenChips'
import type { VorwissenAnfrage } from '../didactics/vorwissen/vorwissen'
import { abiturMoeglich, abiturStandard } from '../didactics/abitur'
import { recommendedWordCount, targetWordCount, VOCAB_WORK } from '../didactics/vocabWork'
import {
  LISTENING_SECONDS_RANGE,
  listeningCount,
  listeningFormatById,
  listeningFormatsFor,
  listeningRules,
  listeningSeconds,
  listeningWords
} from '../didactics/listeningFormats'
import { hasStateRules, listeningStateRules } from '../didactics/listeningStates'
import { stageForGrade } from '../didactics/profile'
import { seitenBereich, seitenText } from '../didactics/seiten'
import SeitenWahl from './SeitenWahl'
import VocabWordsPicker from './VocabWordsPicker'
import VocabFocusModal, { splitWords } from './VocabFocusModal'
import {
  MATERIAL_WARN_CHARS,
  MATERIAL_WORDS,
  STUDENT_WORDS,
  originalSourcesHint,
  SHEET_TYPES,
  skillFocusOptions,
  sourceTextWords,
  STUDENT_TEXT_TYPES,
  writingWords
} from '../generation/prompts'
import { istSprechblatt, SPRECH_TEILE, sprechTeile, type SprechTeil } from '../didactics/sprechen'
import { defaultMeta } from '../model/defaults'
import { subjectById, SUBJECTS } from '../model/subjects'
import { loadLastChoice, saveLastChoice } from '../../../shared/lastChoice'
import type {
  LanguageSkill,
  OriginalSourcesMode,
  SheetType,
  VideoSetup,
  VocabWorkMode,
  WorksheetImageSource,
  SocialForm,
  SourceMaterial,
  Worksheet,
  WorksheetMeta
} from '../model/types'
import { profileFromMeta } from '../render/SheetPages'
import { aiCall, useArbeitsblatt } from '../store'
import { ProfileCard } from './ProfileCard'
import { isSensitiveForRolePlay, rolePlayTypeById, rolePlayTypesFor, WITHOUT_ESTABLISHED_PRACTICE } from '../didactics/rolePlay'
import HaeufigSelect from '../../../shared/components/HaeufigSelect'
import EinstellungenLink from '../../../shared/components/EinstellungenLink'
import Formularfuss, { ersterGrund, FormularSeite, KeinKiZugang } from '../../../shared/components/Formularfuss'
import WeitereOptionen from '../../../shared/components/WeitereOptionen'
import {
  duringPolicy,
  observationFoci,
  sectionMinutes,
  SUBTITLE_OPTIONS,
  VIDEO_KINDS,
  videoKindById,
  type SubtitleMode,
  type VideoKind,
  type ViewingDuring
} from '../didactics/videoTasks'

/** Ein noch leerer Videoauftrag – Lernvideo, weil das im Alltag am häufigsten vorkommt. */
const EMPTY_VIDEO: VideoSetup = { title: '', url: '', kind: 'lernvideo', platform: '', minutes: 0, section: '', summary: '', during: 'auto', groups: 0 }

export default function TopicStep(): React.JSX.Element {
  const { worksheet, setWorksheet, setStep } = useArbeitsblatt()
  const appSettings = useAppSettings((s) => s.settings)
  const [table, setTable] = useState<CefrTable>({ version: 1, states: [] })
  const [designs, setDesigns] = useState<DesignTemplate[]>([])
  const [hasKey, setHasKey] = useState(true)
  const [reading, setReading] = useState<string | null>(null)
  const [competenceBusy, setCompetenceBusy] = useState(false)
  // Hörtexte: Die Option erscheint nur, wenn eine Stimme eingerichtet ist (ElevenLabs)
  const [tts, setTts] = useState(false)
  const [textOptions, setTextOptions] = useState<AiStatus['textOptions']>([])

  // Das Programm bleibt im Hintergrund geöffnet: nach Änderungen an der KI-Einstellung Status neu abfragen
  useEffect(() => {
    window.api.ai
      .status()
      .then((s) => {
        setHasKey(s.hasTextKey)
        setTts(s.hasTts)
        setTextOptions(s.textOptions)
      })
      .catch(() => undefined)
  }, [appSettings.ai])

  useEffect(() => {
    Promise.all([window.api.cefr.get(), window.api.designs.list(), window.api.ai.status()])
      .then(([cefr, ds, status]) => {
        setTable(cefr)
        setDesigns(ds)
        setHasKey(status.hasTextKey)
        setTts(status.hasTts)
        setTextOptions(status.textOptions)
        if (!useArbeitsblatt.getState().worksheet) {
          // Zuletzt gewählte Angaben gelten wieder – sonst die Vorgabe aus den Einstellungen
          const last = loadLastChoice('arbeitsblatt')
          const stateId = last.stateId ?? appSettings.defaults.stateId
          const schoolTypeId = last.schoolTypeId ?? appSettings.defaults.schoolTypeId
          const typeName = cefr.states.find((s) => s.id === stateId)?.schoolTypes.find((t) => t.id === schoolTypeId)?.name ?? 'Gymnasium'
          // „Neu in diesem Bereich" gibt das Fach des Themenbereichs vor (shared/fachVorgabe.ts)
          const vorgabe = nimmFachVorgabe('arbeitsblatt')
          // „Übungsblatt dazu erstellen" aus der Rückmeldung gibt zusätzlich Thema und Jahrgang vor
          const thema = nimmThemaVorgabe('arbeitsblatt')
          const fachId = vorgabe && subjectById(vorgabe).id === vorgabe ? vorgabe : last.subjectId
          const subject = fachId ? subjectById(fachId) : null
          const ws: Worksheet = {
            version: 1,
            meta: {
              ...defaultMeta(stateId, schoolTypeId, typeName),
              ...(subject ? { subjectId: subject.id, subjectLabel: subject.label } : {}),
              ...(last.grade ? { grade: last.grade } : {}),
              ...(thema
                ? {
                    topic: thema.topic,
                    ...(thema.learningGoals ? { learningGoals: thema.learningGoals } : {}),
                    ...(thema.priorKnowledge ? { priorKnowledge: thema.priorKnowledge } : {}),
                    ...(thema.grade ? { grade: thema.grade } : {})
                  }
                : {}),
              ...(last.courseLevel ? { courseLevel: last.courseLevel as WorksheetMeta['courseLevel'] } : {}),
              ...(last.languageOrder ? { languageOrder: last.languageOrder } : {}),
              ...(last.cefrLevel ? { cefrLevel: last.cefrLevel as WorksheetMeta['cefrLevel'] } : {})
            },
            design: ds.find((d) => d.isDefault) ?? ds[0],
            outline: null,
            sheets: [],
            sources: [],
            createdAt: new Date().toISOString()
          }
          // Ohne gemerktes Niveau: das zu Jahrgang und Fremdsprachenfolge passende statt fest „A2"
          const niveau =
            !last.cefrLevel && subjectById(ws.meta.subjectId).foreignLanguage
              ? suggestLevel(cefr, ws.meta.stateId, ws.meta.schoolTypeId, ws.meta.languageOrder, ws.meta.grade)
              : null
          if (niveau) ws.meta.cefrLevel = niveau.level
          setWorksheet(ws)
        }
      })
      .catch(notifyError)
    // Läuft auch nach „Neues Arbeitsblatt": Dort wird das Blatt verworfen, und dieser
    // Schritt legt sofort ein frisches an – sonst stünde das Formular leer da.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worksheet === null])

  // Auswahl für das nächste Mal merken
  useEffect(() => {
    const m = useArbeitsblatt.getState().worksheet?.meta
    if (!m) return
    saveLastChoice('arbeitsblatt', {
      subjectId: m.subjectId,
      stateId: m.stateId,
      schoolTypeId: m.schoolTypeId,
      schoolTypeName: m.schoolTypeName,
      grade: m.grade,
      courseLevel: m.courseLevel,
      languageOrder: m.languageOrder,
      cefrLevel: m.cefrLevel
    })
  }, [
    worksheet?.meta.subjectId,
    worksheet?.meta.stateId,
    worksheet?.meta.schoolTypeId,
    worksheet?.meta.grade,
    worksheet?.meta.courseLevel,
    worksheet?.meta.languageOrder,
    worksheet?.meta.cefrLevel
  ])

  // Vokabelauswahl: Der Knopf erscheint nur, wenn es für das Fach überhaupt etwas zu wählen gibt
  const [vocabOpen, setVocabOpen] = useState(false)
  const [vocabAvailable, setVocabAvailable] = useState(false)
  const languageOfSubject = worksheet
    ? (subjectById(worksheet.meta.subjectId).foreignLanguage ?? (worksheet.meta.subjectId === 'daz' ? 'de' : undefined))
    : undefined
  useEffect(() => {
    if (!languageOfSubject) {
      setVocabAvailable(false)
      return
    }
    Promise.all([window.api.library.list(), window.api.textbooks.list()])
      .then(([lists, books]) => {
        const l = lists.filter((x) => !x.language || x.language === languageOfSubject)
        const b = books.filter((x) => x.language === languageOfSubject)
        setVocabAvailable(l.length > 0 || b.length > 0)
      })
      .catch(() => setVocabAvailable(false))
  }, [languageOfSubject])

  const profile = useMemo(() => (worksheet ? profileFromMeta(worksheet.meta) : null), [worksheet])
  if (!worksheet || !profile) return <Container py="xl">Wird geladen …</Container>

  const meta = worksheet.meta
  const subject = subjectById(meta.subjectId)
  // Fortlaufendes Tippen im selben Feld (oder ein Zug am Regler) ist EIN Schritt für Strg+Z
  const patch = (p: Partial<WorksheetMeta>): void => setWorksheet({ ...worksheet, meta: { ...meta, ...p } }, `angaben:${Object.keys(p).sort().join(',')}`)
  const vocabCount = splitWords(meta.vocabWords ?? '').length
  const vorwissenAnfrage: VorwissenAnfrage = {
    subjectId: meta.subjectId,
    topic: meta.topic,
    grade: meta.grade,
    stateId: meta.stateId,
    schoolTypeId: meta.schoolTypeId,
    learningGoals: meta.learningGoals,
    languageOrder: meta.languageOrder,
    lateStartLanguage: meta.lateStartLanguage,
    // Grammatik über dem gewählten Niveau erscheint nicht als Vorwissen (Befund vom 26.09.2026)
    cefrLevel: subject.foreignLanguage ? meta.cefrLevel : undefined,
    lehrwerk: meta.knownVocab?.source,
    lehrwerkStand:
      meta.knownVocab?.buch && meta.knownVocab.unit
        ? { buch: meta.knownVocab.buch, unit: meta.knownVocab.unit, fruehereBaende: meta.knownVocab.fruehereBaende }
        : undefined
  }

  /** Schulform/Land/Jahrgang ändern und abhängige Werte anpassen. */
  const patchGroup = (p: Partial<WorksheetMeta>): void => {
    // Schulform, Jahrgang und Kursniveau folgen nach denselben Regeln wie in den anderen Programmen (shared/lerngruppe.ts)
    const next = { ...meta, ...mitLerngruppe(table, meta, p) } as WorksheetMeta
    const sub = subjectById(next.subjectId)
    if (sub.foreignLanguage) {
      const s = suggestLevel(table, next.stateId, next.schoolTypeId, next.languageOrder, next.grade)
      if (s) next.cefrLevel = s.level
    }
    setWorksheet({ ...worksheet, meta: next })
  }

  const range = gradeRange(table, meta.stateId, meta.schoolTypeId)
  const courseOptions = courseLevelOptions(meta.stateId, meta.schoolTypeId, meta.grade)
  const tracks = languageTracks(table, meta.stateId, meta.schoolTypeId)
  const cefrSuggestion = subject.foreignLanguage ? suggestLevel(table, meta.stateId, meta.schoolTypeId, meta.languageOrder, meta.grade) : null
  const materialChars = worksheet.sources.filter((s) => s.useAsBasis).reduce((n, s) => n + s.text.length, 0)

  const addFiles = async (files: File[]): Promise<void> => {
    const added = [...worksheet.sources]
    try {
      for (const f of files) {
        setReading(`${f.name} wird gelesen …`)
        const c = await extractContent(f, (m) => setReading(`${f.name}: ${m}`))
        added.push({ id: newId(), ...c, useAsBasis: true, embedImage: c.kind === 'image' })
      }
      setReading(null)
      // Datenschutz (Großprogramm 0.4): Hinweis und Namen ersetzen, bevor etwas zur KI geht
      const geprueft = await pruefeHochladen(added.slice(worksheet.sources.length))
      if (!geprueft) return
      // Schulbuchseiten (Phase 6b): erkennen, je Abschnitt verweisen/übernehmen – nie als Bild aufs Blatt
      const neu: SourceMaterial[] = []
      for (const q of geprueft) {
        const sb = q.pageImages.length ? await schulbuchAusSeiten(q.pageImages, '', (t) => setReading(`${q.fileName}: ${t}`)) : null
        neu.push(sb ? { ...q, text: sb.text, format: 'plain', pageImages: [], embedImage: false, schulbuch: sb.schulbuch } : q)
      }
      setReading(null)
      setWorksheet({ ...worksheet, sources: [...worksheet.sources, ...neu] })
    } catch (e) {
      notifyError(e, 'Datei konnte nicht gelesen werden')
    } finally {
      setReading(null)
    }
  }

  /*
   * „Gliederung planen" läuft als Hintergrund-Auftrag (../auftraege.ts): mit einer Kopie der
   * Angaben von jetzt, abgelegt in DIESEM Blatt. Bis dahin zeigt das Programm statt dieses
   * Formulars einen Hinweis mit „Abbrechen" – und über „Neues Arbeitsblatt" geht es weiter.
   */
  const plan = (): void => planeGliederung(worksheet, useArbeitsblatt.getState().docId)

  // Der Hauptknopf steht fest unten und sagt, was fehlt (Paket 6)
  const sperrgrund = ersterGrund(
    [!meta.subjectLabel.trim(), 'Fachbezeichnung fehlt'],
    [!meta.topic.trim(), 'Thema fehlt'],
    [!hasKey, <KeinKiZugang key="ki" />]
  )
  const fuss = (
    <Formularfuss grund={sperrgrund}>
      {worksheet.outline && (
        <Button variant="default" onClick={() => setStep(1)}>
          Zur bestehenden Gliederung
        </Button>
      )}
      <Button size="md" leftSection={<IconListDetails size={18} />} disabled={Boolean(sperrgrund)} onClick={plan}>
        Gliederung planen
      </Button>
    </Formularfuss>
  )

  return (
    <FormularSeite fuss={fuss}>
      <ScrollArea h="100%">
        <Container size="xl" py="lg">
          <Group justify="space-between" mb="md">
            <div>
              <Title order={2}>Thema &amp; Lerngruppe</Title>
              <Text c="dimmed" size="sm">
                Jahrgang, Schulform und Bundesland bestimmen Sprache, Anforderungen, Aufgabenformate und Layout.
              </Text>
            </div>
          </Group>

          {!hasKey && (
            <Alert color="orange" icon={<IconAlertTriangle />} mb="md" title="Die gewählte KI ist noch nicht eingerichtet">
              Zum Erzeugen wird ein API-Schlüssel oder ein freigegebener Abo-Zugang benötigt.{' '}
              <EinstellungenLink tab="ki">KI-Zugang einrichten</EinstellungenLink>
            </Alert>
          )}

          <Grid gap="lg">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack>
                <Card withBorder>
                  <Title order={4} mb="sm">
                    Thema
                  </Title>
                  <Stack gap="sm">
                    <Group grow>
                      <HaeufigSelect
                        art="fach"
                        label="Fach"
                        data={SUBJECTS.map((s) => ({ value: s.id, label: s.label }))}
                        value={meta.subjectId}
                        onChange={(v) => {
                          if (!v) return
                          const s = subjectById(v)
                          patchGroup({ subjectId: v, subjectLabel: s.id === 'anderes' ? '' : s.label, languageOrder: s.id === 'englisch' ? 1 : 2 })
                        }}
                        allowDeselect={false}
                        maxDropdownHeight={380}
                      />
                      {meta.subjectId === 'anderes' && (
                        <TextInput label="Fachbezeichnung" value={meta.subjectLabel} onChange={(e) => patch({ subjectLabel: e.currentTarget.value })} />
                      )}
                    </Group>
                    <TextInput
                      label="Thema"
                      placeholder="z. B. Fotosynthese, Present Perfect, Lineare Funktionen"
                      required
                      value={meta.topic}
                      onChange={(e) => patch({ topic: e.currentTarget.value })}
                    />
                  </Stack>
                </Card>

                <Card withBorder>
                  <Title order={4} mb="sm">
                    Lerngruppe
                  </Title>
                  <Stack gap="sm">
                    <SchulortFelder
                      table={table}
                      stateId={meta.stateId}
                      schoolTypeId={meta.schoolTypeId}
                      schoolTypeName={meta.schoolTypeName}
                      onChange={patchGroup}
                    />
                    <Group grow align="start">
                      <Select
                        label="Jahrgang"
                        description={range.note}
                        data={Array.from({ length: range.max - range.min + 1 }, (_, i) => ({ value: String(range.min + i), label: `Klasse ${range.min + i}` }))}
                        value={String(meta.grade)}
                        onChange={(v) => v && patchGroup({ grade: Number(v) })}
                        allowDeselect={false}
                      />
                      {courseOptions && (
                        <Select
                          label="Kursniveau"
                          data={courseOptions}
                          value={meta.courseLevel}
                          onChange={(v) => v && patchGroup({ courseLevel: v as CourseLevel })}
                          allowDeselect={false}
                        />
                      )}
                    </Group>
                    {/*
                    Abiturbezogene Uebungsaufgaben – gewuenscht am 24.09.2026: „per Knopfdruck
                    unter Kompetenzniveau". Der Schalter erscheint nur dort, wo er etwas
                    bedeutet: ab Jahrgang 12 und in Faechern, fuer die belegte Vorgaben
                    vorliegen. In der Einfuehrungsphase waere eine Abituraufgabe verfrueht.
                  */}
                    {abiturMoeglich(meta) && (
                      <Switch
                        label="An Abituraufgaben angelehnt"
                        description="Stellt Aufgabenart, Anforderungsbereiche, Material und Erwartungshorizont auf die Vorgaben des Faches um."
                        checked={Boolean(meta.abitur?.an)}
                        onChange={(e) => patch({ abitur: abiturStandard(meta, e.currentTarget.checked) })}
                      />
                    )}
                    {subject.foreignLanguage ? (
                      <Group grow align="start">
                        {tracks.length > 0 && (
                          <Select
                            label="Fremdsprache"
                            data={tracks.map((t) => ({ value: String(t.order), label: `${t.order}. Fremdsprache` }))}
                            value={String(meta.languageOrder)}
                            onChange={(v) => v && patchGroup({ languageOrder: Number(v) })}
                            allowDeselect={false}
                          />
                        )}
                        <Select
                          label="Sprachniveau (GER)"
                          description={cefrSuggestion ? `Vorschlag: ${cefrSuggestion.level} (${cefrSuggestion.basis})` : undefined}
                          data={[...CEFR_SCALE]}
                          value={meta.cefrLevel}
                          onChange={(v) => v && patch({ cefrLevel: v as CefrLevel })}
                          allowDeselect={false}
                        />
                      </Group>
                    ) : (
                      <Select
                        label="Sprachniveau"
                        description={LANGUAGE_MODES.find((m) => m.value === meta.languageMode)?.description}
                        data={LANGUAGE_MODES.map((m) => ({ value: m.value, label: m.label }))}
                        value={meta.languageMode}
                        onChange={(v) => v && patch({ languageMode: v as LanguageMode })}
                        allowDeselect={false}
                      />
                    )}
                    {/* Bilingualer Sachfachunterricht – erscheint nur bei Sachfächern (didactics/bilingual.ts) */}
                    <BilingualSchalter meta={meta} onChange={(bilingual) => patch({ bilingual })} />
                    {(subject.foreignLanguage || hasGrammar(meta.subjectId)) && (
                      <Select
                        label="Kompetenzschwerpunkt"
                        description={skillFocusOptions(meta.subjectId).find((f) => f.value === (meta.skillFocus ?? 'mixed'))?.description}
                        data={skillFocusOptions(meta.subjectId).map((f) => ({ value: f.value, label: f.label }))}
                        value={meta.skillFocus ?? 'mixed'}
                        onChange={(v) => v && patch({ skillFocus: v as LanguageSkill | 'mixed' })}
                        allowDeselect={false}
                      />
                    )}
                    {/* Interkulturelle Kompetenz (02.10.2026): eigener Schwerpunkt (nur Teilbereiche) oder Zusatzschalter */}
                    {subject.foreignLanguage && (
                      <InterkulturSchalter
                        meta={meta}
                        nurBereiche={meta.skillFocus === 'interkulturell'}
                        onChange={(interkulturell) => patch({ interkulturell })}
                      />
                    )}
                    {/* Sprechen (01.10.2026): Teile des Vorbereitungsblatts, voreingestellt alle vier (didactics/sprechen.ts) */}
                    {istSprechblatt(meta) && (
                      <MultiSelect
                        label="Teile des Blattes zur Sprechprüfung"
                        description="Musterdialog: Der Hörtext entsteht vorab mit zwei Stimmen und lässt sich im Reiter „Hörtexte“ vertonen."
                        data={SPRECH_TEILE}
                        value={sprechTeile(meta)}
                        onChange={(v) => patch({ sprechTeile: (v.length ? v : ['karten']) as SprechTeil[] })}
                      />
                    )}
                    {/*
                     * Deutsch: Zuhoeren hat zwei Bauformen. Die muendliche ist die einzige, die
                     * in den Bildungsstandards als Aufgabenbeispiel vorkommt; die schriftliche
                     * ist aus der Fremdsprachendidaktik uebertragen und fuer Klassenarbeiten
                     * gedacht. Siehe didactics/zuhoeren.ts.
                     */}
                    {istDeutschZuhoeren(meta) && (
                      <Select
                        label="Bauform des Zuhoeren-Blattes"
                        description={ZUHOEREN_MODES.find((m) => m.value === (meta.listeningMode ?? 'muendlich'))?.description}
                        data={ZUHOEREN_MODES.map((m) => ({ value: m.value, label: m.label }))}
                        value={meta.listeningMode ?? 'muendlich'}
                        onChange={(v) => v && patch({ listeningMode: v as ZuhoerenMode })}
                        allowDeselect={false}
                      />
                    )}
                    {(meta.skillFocus === 'listening' || meta.skillFocus === 'reading') && (
                      <MultiSelect
                        label={meta.skillFocus === 'listening' ? 'Formate für das Hör-/Sehverstehen' : 'Formate für das Leseverstehen'}
                        description="Belegte Prüfungsformate der KMK-Bildungsstandards und der Kerncurricula; leer lassen = Vorschlag nach Jahrgang."
                        data={comprehensionFormatsFor(meta.skillFocus === 'listening' ? 'listening' : 'reading', meta.grade).map((f) => ({
                          value: f.id,
                          label: `${f.label} (${f.openness})`
                        }))}
                        value={meta.comprehensionFormats ?? []}
                        onChange={(v) => patch({ comprehensionFormats: v })}
                        placeholder={defaultComprehensionFormats(meta.skillFocus === 'listening' ? 'listening' : 'reading', meta.grade)
                          .map((id) => comprehensionFormatById(id)?.label)
                          .filter(Boolean)
                          .join(' · ')}
                        clearable
                      />
                    )}
                    {/* Wunsch der Lehrkraft (02.10.2026): nur die gewählten Formate zum vorgegebenen Hör-/Sehtext bzw. Text */}
                    {(meta.skillFocus === 'listening' || meta.skillFocus === 'reading') && (
                      <Checkbox
                        label="Nur die gewählten Formate erstellen"
                        description="Keine Vorentlastung und keine weiterführende Aufgabe – nur Verstehensaufgaben zum vorgegebenen Text bzw. Video."
                        checked={Boolean(meta.nurGewaehlteFormate)}
                        onChange={(e) => patch({ nurGewaehlteFormate: e.currentTarget.checked || undefined })}
                        data-nur-formate
                      />
                    )}
                    {meta.skillFocus === 'listening' && sehtextQuelle(meta, worksheet.sources) && (
                      <Text size="xs" c="dimmed" data-sehtext-hinweis>
                        Hör-/Sehtext ist das Video „{sehtextQuelle(meta, worksheet.sources)!.fileName}“ aus dem Material – es entsteht kein eigener Hörtext;
                        Link und QR-Code kommen auf das Blatt.
                      </Text>
                    )}
                    {meta.skillFocus === 'grammar' && <GrammarPicker meta={meta} onChange={patch} />}
                    {/* Unregelmäßige Verben (30.09.2026): Aufgaben aus der Verbliste, von der App angehängt */}
                    {meta.skillFocus === 'grammar' && <VerbAufgabeKarte meta={meta} onChange={patch} />}
                    {/* Beim Schwerpunkt „Vokabeln" ist der Wortschatz das Thema selbst – dort
                      steht die ausführliche Auswahl weiter unten, nicht dieses Pop-up. */}
                    {subject.foreignLanguage && meta.skillFocus !== 'vocabulary' && vocabAvailable && (
                      <div>
                        <Group justify="space-between" align="center" mb={4}>
                          <Text size="sm" fw={500}>
                            Vokabeln für dieses Blatt
                          </Text>
                          {vocabCount > 0 && (
                            <Badge variant="light" size="sm" color="teal">
                              {vocabCount} gewählt
                            </Badge>
                          )}
                        </Group>
                        <Button variant="light" size="compact-sm" leftSection={<IconBook2 size={14} />} onClick={() => setVocabOpen(true)}>
                          {vocabCount ? 'Auswahl ändern …' : 'Vokabellisten und Wörter wählen …'}
                        </Button>
                        <Text size="xs" c="dimmed" mt={4}>
                          {vocabCount
                            ? `Diese Wörter kommen in Texten, Hörtexten und Aufgaben bevorzugt vor${meta.knownVocab ? `; Wortschatz nach „${meta.knownVocab.source}" wird vorausgesetzt` : ''}.`
                            : 'Aus dem Schulbuch oder den gespeicherten Listen – die KI baut sie dann bevorzugt ein.'}
                        </Text>
                      </div>
                    )}
                    {(subject.foreignLanguage || subject.uebersetzungssprache) && (
                      <Select
                        label={subject.uebersetzungssprache ? 'Hilfsblatt mit Übersetzungshilfen' : 'Hilfsblatt mit nützlichen Ausdrücken'}
                        description={
                          meta.phraseSheet === 'blatt'
                            ? 'Eigenes Blatt am Ende: Die Lernenden behalten es, während die Aufgaben wechseln.'
                            : meta.phraseSheet === 'inline'
                              ? 'Auf dem Aufgabenblatt, vor der ersten Aufgabe, die es braucht – spart Papier.'
                              : subject.uebersetzungssprache
                                ? 'Die Konstruktionen des Textes mit ihren deutschen Wiedergaben, nach Konstruktion geordnet.'
                                : 'Wendungen und Wortschatz für die Aufgaben, nach Sprachhandlung geordnet.'
                        }
                        data={[
                          { value: 'aus', label: 'Kein Hilfsblatt' },
                          { value: 'blatt', label: 'Als eigenes Blatt' },
                          { value: 'inline', label: 'Auf dem Aufgabenblatt' }
                        ]}
                        value={meta.phraseSheet ?? 'aus'}
                        onChange={(v) => v && patch({ phraseSheet: v as WorksheetMeta['phraseSheet'] })}
                        allowDeselect={false}
                      />
                    )}
                    {subject.foreignLanguage && (
                      <>
                        <Switch
                          label="Arbeitsanweisungen auf Deutsch"
                          checked={meta.instructionsInGerman}
                          onChange={(e) => patch({ instructionsInGerman: e.currentTarget.checked })}
                        />
                        {(meta.skillFocus === 'mediation' || meta.skillFocus === 'writing') && (
                          <>
                            <Switch
                              label="Wortvorgabe für die Schüler"
                              description={
                                meta.wordLimit
                                  ? `Die Aufgabe nennt die erwartete Wortzahl (Vorschlag für ${meta.cefrLevel}: ca. ${writingWords(meta)} Wörter).`
                                  : 'Die Aufgabe nennt keine Wortzahl; der Umfang ergibt sich aus den Inhaltspunkten und dem Schreibraum.'
                              }
                              checked={meta.wordLimit ?? false}
                              onChange={(e) => patch({ wordLimit: e.currentTarget.checked })}
                            />
                            <Select
                              label="Textsorte des Schülertextes"
                              description="In welcher Form schreiben die Lernenden ihren eigenen Text?"
                              data={STUDENT_TEXT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                              value={meta.studentTextType ?? ''}
                              onChange={(v) => patch({ studentTextType: v ?? '' })}
                              allowDeselect={false}
                            />
                            {/*
                             * Notizentabelle: Entscheidung der Lehrkraft, nicht der KI.
                             *
                             * Die Abschlussprüfungen geben die Inhaltspunkte als Spiegelstrich-
                             * liste vor; eine Notizentabelle ist dort in keiner eingesehenen
                             * Aufgabe belegt, im Unterricht aber verbreitet. Beides ist
                             * vertretbar – also wird gefragt statt geraten.
                             */}
                            {/* Hilfen für Lernende (01.10.2026): auf dem Arbeitsblatt wie bisher an, abschaltbar fürs Prüfungsformat */}
                            <Switch
                              label="Hilfen für Lernende"
                              description="Kasten „Adressat · Textsorte · Zweck“, inhaltliche Teilpunkte, Notizentabelle und Formhinweise auf dem Blatt. Ohne Hilfen (Prüfungsformat) stehen sie nur im Lösungsblatt."
                              checked={meta.lernhilfen !== false}
                              onChange={(e) => patch({ lernhilfen: e.currentTarget.checked ? undefined : false })}
                            />
                            <Checkbox
                              label="Notizentabelle zur Schreibaufgabe"
                              description="Zwei Spalten mit Stichpunkten und offenen Impulsen („Positives: …“), aus denen die Lernenden auswählen. Ohne Haken stehen die Inhaltspunkte als Liste – so wie in den Abschlussprüfungen."
                              checked={meta.writingNotes ?? false}
                              onChange={(e) => patch({ writingNotes: e.currentTarget.checked })}
                            />
                            <div>
                              <Text size="sm" fw={500}>
                                Umfang des Ausgangstextes: {sourceTextWords(meta)} Wörter
                              </Text>
                              <Text size="xs" c="dimmed" mb={4}>
                                {meta.materialWords ? 'Eigene Vorgabe' : `Automatisch nach Niveau ${meta.cefrLevel}`} – so lang wird der Text, den die Lernenden
                                für die Aufgabe lesen. Richtwert: Lässt sich eine Quelle nicht sinnvoll kürzen, darf sie bis zu ein Viertel länger werden.
                              </Text>
                              <Slider
                                min={MATERIAL_WORDS.min}
                                max={MATERIAL_WORDS.max}
                                step={MATERIAL_WORDS.step}
                                value={sourceTextWords(meta)}
                                onChange={(v) => patch({ materialWords: v })}
                                marks={[
                                  { value: 100, label: '100' },
                                  { value: 250, label: '250' },
                                  { value: 400, label: '400' },
                                  { value: 600, label: '600' }
                                ]}
                              />
                              {Boolean(meta.materialWords) && (
                                <Button size="compact-xs" variant="subtle" mt={18} onClick={() => patch({ materialWords: 0 })}>
                                  Automatisch nach Niveau
                                </Button>
                              )}
                            </div>
                            {/*
                             * Umfang des SCHÜLERTEXTES – eigener Regler.
                             *
                             * Der automatische Wert richtet sich allein nach dem GER-Niveau: B1
                             * ergibt 140 Wörter. Eine Abschlussaufgabe der Klasse 10 verlangt
                             * aber eher 250–300. Der Wert steuert Schreibraum, Inhaltspunkte und
                             * Erwartungshorizont – auf dem Blatt steht er nur mit Wortvorgabe.
                             */}
                            <div>
                              <Text size="sm" fw={500}>
                                Umfang des Schülertextes: {writingWords(meta)} Wörter
                              </Text>
                              <Text size="xs" c="dimmed" mb={4}>
                                {meta.studentWords ? 'Eigene Vorgabe' : `Automatisch nach Niveau ${meta.cefrLevel}`} – so lang soll der Text werden, den die
                                Lernenden schreiben. Bestimmt Schreibraum und Erwartungshorizont. Richtwert: Verlangen die Inhaltspunkte mehr, darf er bis zu
                                ein Viertel länger werden.
                              </Text>
                              <Slider
                                min={STUDENT_WORDS.min}
                                max={STUDENT_WORDS.max}
                                step={STUDENT_WORDS.step}
                                value={writingWords(meta)}
                                onChange={(v) => patch({ studentWords: v })}
                                marks={[
                                  { value: 80, label: '80' },
                                  { value: 150, label: '150' },
                                  { value: 250, label: '250' },
                                  { value: 400, label: '400' }
                                ]}
                              />
                              {Boolean(meta.studentWords) && (
                                <Button size="compact-xs" variant="subtle" mt={18} onClick={() => patch({ studentWords: 0 })}>
                                  Automatisch nach Niveau
                                </Button>
                              )}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </Stack>
                </Card>

                <AbiturCard meta={meta} onChange={(abitur) => patch({ abitur })} />

                {/*
                Lernziele und Vorwissen stehen UNTER der Lerngruppe, nicht unter dem Thema.
                Beide haengen an der Lerngruppe: Wer sie ausfuellt, bevor Jahrgang, Schulform
                und Niveau feststehen, schreibt Ziele, die nachher nicht passen.
              */}
                <Card withBorder>
                  <Title order={4} mb="sm">
                    Lernziele &amp; Vorwissen
                  </Title>
                  <Stack gap="sm">
                    <Textarea
                      label="Lernziele (optional)"
                      description={
                        <Group gap={6} wrap="nowrap">
                          <span>Eine Kompetenz je Zeile.</span>
                          <Button
                            size="compact-xs"
                            variant="light"
                            leftSection={<IconSparkles size={13} />}
                            loading={competenceBusy}
                            disabled={!meta.topic.trim()}
                            title={meta.topic.trim() ? undefined : 'Bitte zuerst ein Thema eintragen'}
                            onClick={async () => {
                              setCompetenceBusy(true)
                              try {
                                const existing = meta.learningGoals
                                  .split('\n')
                                  .map((l) => l.trim())
                                  .filter(Boolean)
                                const res = await suggestCompetence(meta, profile, existing, aiCall)
                                patch({ learningGoals: appendCompetence(meta.learningGoals, res.competence) })
                              } catch (e) {
                                notifyError(e, 'Kompetenz konnte nicht vorgeschlagen werden')
                              } finally {
                                setCompetenceBusy(false)
                              }
                            }}
                          >
                            Kompetenz vorschlagen
                          </Button>
                        </Group>
                      }
                      autosize
                      minRows={2}
                      placeholder="Die Schülerinnen und Schüler können …"
                      value={meta.learningGoals}
                      onChange={(e) => patch({ learningGoals: e.currentTarget.value })}
                    />
                    <Textarea
                      label="Vorwissen der Lerngruppe (optional)"
                      description="Eine Angabe je Zeile. „Fehlvorstellung: …“ greift das Blatt gezielt auf, „Noch nicht behandelt: …“ setzt es nicht voraus."
                      autosize
                      minRows={1}
                      value={meta.priorKnowledge}
                      onChange={(e) => patch({ priorKnowledge: e.currentTarget.value })}
                    />
                    {/* Vorschläge zum Vorwissen (didactics/vorwissen) – Wunsch vom 25.09.2026 */}
                    <VorwissenChips
                      anfrage={vorwissenAnfrage}
                      wert={meta.priorKnowledge}
                      onChange={(priorKnowledge) => patch({ priorKnowledge })}
                      ai={aiCall}
                    />
                  </Stack>
                </Card>
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack>
                <Card withBorder>
                  <Title order={4} mb="sm">
                    Art &amp; Umfang
                  </Title>
                  <Stack gap="sm">
                    <Select
                      label="Art des Arbeitsblatts"
                      data={SHEET_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                      value={meta.sheetType}
                      onChange={(v) => v && patch({ sheetType: v as SheetType })}
                      allowDeselect={false}
                    />
                    {/* Seitenzahl: automatisch, genau oder von–bis (Paket 7, didactics/seiten.ts) */}
                    <SeitenWahl meta={meta} patch={patch} />
                    <ZahlFeld
                      label="Bearbeitungszeit (Min.)"
                      min={5}
                      max={180}
                      step={5}
                      value={meta.minutes}
                      onChange={(v) => patch({ minutes: Number(v) || 45 })}
                    />
                    {/* Leer lassen heißt „Richtwert des Altersbands" – eine eingetragene Zahl gilt genau. */}
                    <ZahlFeld
                      label="Zahl der Aufgaben"
                      description={
                        meta.taskCount
                          ? `Es entstehen genau ${meta.taskCount} Aufgaben. Leeren, um wieder den Richtwert zu nutzen.`
                          : `Leer lassen: Richtwert für Klasse ${meta.grade} sind ${profile.tasks.perPage[0] * seitenBereich(meta).min}–${profile.tasks.perPage[1] * seitenBereich(meta).max} Aufgaben auf ${seitenText(meta)}.`
                      }
                      placeholder={`automatisch (${profile.tasks.perPage[0] * seitenBereich(meta).min}–${profile.tasks.perPage[1] * seitenBereich(meta).max})`}
                      min={1}
                      max={20}
                      value={meta.taskCount || ''}
                      onChange={(v) => patch({ taskCount: Number(v) || 0 })}
                    />
                    {(meta.skillFocus === 'listening' || meta.skillFocus === 'reading') && (
                      <ZahlFeld
                        label={meta.skillFocus === 'listening' ? 'Fragen je Hörtext' : 'Fragen zum Text'}
                        description={
                          meta.itemCount
                            ? `Genau ${meta.itemCount} Fragen${meta.skillFocus === 'listening' && (meta.audioCount ?? 1) > 1 ? ` zu jedem der ${meta.audioCount} Hörtexte` : ''}.`
                            : `Leer lassen: Richtwert für Niveau ${meta.cefrLevel} sind ${listeningRules(meta.cefrLevel).items[0]}–${listeningRules(meta.cefrLevel).items[1]} Fragen je Text.`
                        }
                        placeholder={`automatisch (${listeningRules(meta.cefrLevel).items[0]}–${listeningRules(meta.cefrLevel).items[1]})`}
                        min={1}
                        max={20}
                        value={meta.itemCount || ''}
                        onChange={(v) => patch({ itemCount: Number(v) || 0 })}
                      />
                    )}
                    {subject.foreignLanguage && (
                      <Card withBorder padding="sm" bg="var(--mantine-color-default-hover)">
                        <Checkbox
                          label="Hörtext von der KI schreiben lassen"
                          description={
                            tts
                              ? 'Die KI schreibt vor dem Blatt einen Hörtext; die Aufgaben entstehen dann zu diesem Text. Vertont wird er danach im Reiter „Hörtexte“.'
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
                                listeningFormatById(meta.audioFormat ?? '')?.description ??
                                `Automatisch: Die KI wählt eine Textsorte, die zu Thema und Niveau ${meta.cefrLevel} passt.`
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
                            <Group grow>
                              <Select
                                size="sm"
                                label="Zahl der Hörtexte"
                                description="Die Aufgaben stehen nach Hörtext gruppiert"
                                data={[
                                  { value: '1', label: 'ein Hörtext' },
                                  { value: '2', label: 'zwei Hörtexte' },
                                  { value: '3', label: 'drei Hörtexte' }
                                ]}
                                value={String(listeningCount(meta))}
                                onChange={(v) => v && patch({ audioCount: Number(v) })}
                                allowDeselect={false}
                              />
                              <ZahlFeld
                                size="sm"
                                label="Länge je Hörtext (Sek.)"
                                description={meta.audioSeconds ? 'Eigene Vorgabe' : `Leer: nach Niveau ${meta.cefrLevel}`}
                                placeholder={`${listeningRules(meta.cefrLevel).seconds[0]}–${listeningRules(meta.cefrLevel).seconds[1]}`}
                                min={LISTENING_SECONDS_RANGE.min}
                                max={LISTENING_SECONDS_RANGE.max}
                                step={LISTENING_SECONDS_RANGE.step}
                                value={meta.audioSeconds || ''}
                                onChange={(v) => patch({ audioSeconds: Number(v) || undefined })}
                              />
                            </Group>
                            {textOptions.length > 1 && (
                              <Select
                                size="sm"
                                label="KI für den Hörtext"
                                description="Ein Hörtext ist der anspruchsvollste Teil eines Sprachenblatts – hier lohnt sich ein stärkeres Modell. Nur dieser eine Auftrag geht dorthin."
                                data={[
                                  { value: '', label: 'wie in den Einstellungen' },
                                  ...textOptions.map((o) => ({ value: `${o.provider}|${o.model}`, label: o.label }))
                                ]}
                                value={meta.audioProvider ? `${meta.audioProvider}|${meta.audioModel ?? ''}` : ''}
                                onChange={(v) => {
                                  const [provider, model] = (v ?? '').split('|')
                                  patch({ audioProvider: (provider || undefined) as WorksheetMeta['audioProvider'], audioModel: model || undefined })
                                }}
                                allowDeselect={false}
                              />
                            )}
                            <Text size="xs" c="dimmed">
                              {(() => {
                                const r = listeningRules(meta.cefrLevel)
                                const [minW, maxW] = listeningWords(meta.cefrLevel, subject.foreignLanguage, meta.audioSeconds)
                                const [minS, maxS] = listeningSeconds(meta.cefrLevel, meta.audioSeconds)
                                return `Niveau ${meta.cefrLevel}: ${minS}–${maxS} Sekunden je Hörtext (etwa ${minW}–${maxW} Wörter), ${r.speakers[0]}–${r.speakers[1]} Sprechende, ${r.plays}× hören, ${r.items[0]}–${r.items[1]} Aufgaben je Text.`
                              })()}
                            </Text>
                            {(() => {
                              // Was das Bundesland vorschreibt, steht sichtbar dabei – sonst
                              // erfährt die Lehrkraft erst am fertigen Blatt, warum etwas fehlt.
                              const sr = listeningStateRules(meta.stateId)
                              const sek2 = stageForGrade(meta.grade, meta.schoolTypeId) === 'sek2'
                              const part = sek2 ? sr.sek2 : sr.sek1
                              return (
                                <Text size="xs" c={hasStateRules(meta.stateId) ? 'teal' : 'dimmed'}>
                                  {hasStateRules(meta.stateId)
                                    ? `${sr.curriculum}: „${sr.competenceName}“ · ${part.trueFalse ? 'Richtig/Falsch zugelassen' : 'ohne Richtig/Falsch'} · ${part.plays}× hören`
                                    : 'Für dieses Bundesland ist keine eigene Vorgabe hinterlegt – es gelten die KMK-Bildungsstandards.'}
                                </Text>
                              )
                            })()}
                          </Stack>
                        )}
                      </Card>
                    )}
                    {meta.skillFocus === 'vocabulary' && (
                      // Beim Schwerpunkt Vokabeln ist die Frage nach Quellen unpassend –
                      // stattdessen zählt, wie die Wortschatzarbeit angelegt sein soll.
                      <>
                        <Select
                          label="Wortschatzarbeit"
                          description={VOCAB_WORK.find((v) => v.value === (meta.vocabWork ?? 'introduce'))?.description}
                          data={VOCAB_WORK.map((v) => ({ value: v.value, label: v.label }))}
                          value={meta.vocabWork ?? 'introduce'}
                          onChange={(v) => v && patch({ vocabWork: v as VocabWorkMode })}
                          allowDeselect={false}
                        />
                        <VocabWordsPicker
                          meta={meta}
                          hint={
                            targetWordCount(meta).own
                              ? `Eigene Obergrenze: bis zu ${targetWordCount(meta).max} Wörter.`
                              : `Leer lassen: Die KI wählt zum Thema passende Wörter. Vorgesehen sind ${targetWordCount(meta).min}–${targetWordCount(meta).max} Wörter.`
                          }
                          onChange={(vocabWords) => patch({ vocabWords })}
                          onKnown={(knownVocab) => patch({ knownVocab })}
                        />
                        <Group align="flex-end" gap="sm">
                          <Checkbox
                            label="Mehr Wörter als empfohlen"
                            description={`Empfohlen sind ${recommendedWordCount(meta).min}–${recommendedWordCount(meta).max} Wörter für Klasse ${meta.grade}.`}
                            checked={Boolean(meta.vocabMaxWords)}
                            onChange={(e) => patch({ vocabMaxWords: e.currentTarget.checked ? recommendedWordCount(meta).max * 2 : 0 })}
                          />
                          {Boolean(meta.vocabMaxWords) && (
                            <ZahlFeld
                              label="Höchstzahl"
                              w={120}
                              min={1}
                              max={80}
                              clampBehavior="blur"
                              value={meta.vocabMaxWords ?? 0}
                              onChange={(v) => patch({ vocabMaxWords: Number(v) || 0 })}
                            />
                          )}
                        </Group>
                      </>
                    )}
                  </Stack>
                </Card>

                {/*
                 * Immer sichtbar (Paket 7, Nachtrag der Lehrkraft): Lösungsblatt, Hilfekarten, Tafelbild,
                 * Differenzierung und Bilder entscheidet man bei fast jedem Blatt neu – unter „Weitere
                 * Optionen“ eingeklappt, wurden sie leicht übersehen.
                 */}
                <Card withBorder>
                  <Title order={4} mb="sm">
                    Lösung, Differenzierung &amp; Bilder
                  </Title>
                  <Stack gap="sm">
                    <Stack gap={6}>
                      <Checkbox label="Lösungsblatt erstellen" checked={meta.answerKey} onChange={(e) => patch({ answerKey: e.currentTarget.checked })} />
                      <Checkbox
                        label="Tipp- und Hilfekarten anlegen"
                        description="gestufte Karten auf einer eigenen Schlussseite, nicht zwischen den Aufgaben"
                        checked={meta.helpCards !== false}
                        onChange={(e) => patch({ helpCards: e.currentTarget.checked })}
                      />
                      <Checkbox
                        label="Tafelbild zur Sicherung mit erstellen"
                        description="aus dem Vergleich der Aufgaben, für die Lehrkraft"
                        checked={Boolean(meta.boardPlan)}
                        onChange={(e) => patch({ boardPlan: e.currentTarget.checked })}
                      />
                    </Stack>
                    <div>
                      <Text size="sm" fw={500} mb={4}>
                        Differenzierung{' '}
                        {profile.suggestDifferentiation && (
                          <Text span c="teal" size="xs">
                            (für gemischte Lerngruppen empfohlen)
                          </Text>
                        )}
                      </Text>
                      <SegmentedControl
                        data={[
                          { value: '1', label: 'ein Niveau' },
                          { value: '2', label: '★ / ★★' },
                          { value: '3', label: '★ / ★★ / ★★★' }
                        ]}
                        value={String(meta.differentiation.levels)}
                        onChange={(v) => patch({ differentiation: { ...meta.differentiation, levels: Number(v) as 1 | 2 | 3 } })}
                      />
                    </div>
                    {/*
                     * Schwierigkeit (27.09.2026, didactics/schwierigkeit.ts): Anspruch und Sprache
                     * getrennt, jeweils relativ zum Jahrgang. Bei einem Niveau fürs ganze Blatt,
                     * bei ★/★★ je Fassung – vorher war ★ fest grundlegend und ★★ fest mittel.
                     */}
                    {meta.differentiation.levels === 1 && (
                      <StufenWahl
                        titel="Schwierigkeit"
                        value={stufeFuer(meta, null)}
                        onChange={(s) => patch({ differentiation: { ...meta.differentiation, schwierigkeit: s } })}
                      />
                    )}
                    {meta.differentiation.levels === 2 && meta.differentiation.mode === 'separate' && (
                      <Stack gap={6}>
                        {([1, 2] as const).map((stern) => (
                          <StufenWahl
                            key={stern}
                            titel={stern === 1 ? 'Schwierigkeit ★' : 'Schwierigkeit ★★'}
                            hinweis={stern === 2}
                            value={stufeFuer(meta, stern)}
                            onChange={(s) =>
                              patch({
                                differentiation: {
                                  ...meta.differentiation,
                                  stufen: { ...STANDARD_STUFEN, ...meta.differentiation.stufen, [stern]: s }
                                }
                              })
                            }
                          />
                        ))}
                      </Stack>
                    )}
                    {meta.differentiation.levels > 1 && (
                      <Radio.Group
                        value={meta.differentiation.mode}
                        onChange={(v) => patch({ differentiation: { ...meta.differentiation, mode: v as 'separate' | 'combined' } })}
                      >
                        <Stack gap={6}>
                          <Radio value="separate" label="Getrennte Blätter je Niveau (gleiches Layout, gleiches Lernziel)" />
                          <Radio value="combined" label="Ein Blatt mit ★-markierten Zusatzaufgaben" />
                        </Stack>
                      </Radio.Group>
                    )}
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                      {/*
                       * Wie viele Bilder – getrennt davon, WOHER sie kommen.
                       *
                       * Ohne diese Wahl entschied allein die KI, und sie entschied oft gegen
                       * ein Bild. Bildersuche und KI-Erzeugung liefen dann ins Leere: Es gab
                       * schlicht keinen Bedarf zu füllen.
                       */}
                      <Select
                        label="Bilder auf dem Blatt"
                        description={
                          (meta.imageAmount ?? 'auto') === 'min1'
                            ? 'Die KI plant ein Bild an der Stelle ein, an der es am meisten trägt.'
                            : 'Ohne Wunsch entscheidet die KI – und entscheidet sich oft gegen ein Bild.'
                        }
                        data={[
                          { value: 'auto', label: 'Nur wo die KI eines für nötig hält' },
                          { value: 'min1', label: 'Mindestens ein Bild je Seite' },
                          { value: 'keine', label: 'Keine Bilder' }
                        ]}
                        value={meta.imageAmount ?? 'auto'}
                        onChange={(v) => v && patch({ imageAmount: v as 'auto' | 'min1' | 'keine' })}
                        allowDeselect={false}
                      />
                      <Select
                        label="Woher die Bilder kommen"
                        disabled={meta.imageAmount === 'keine'}
                        data={[
                          { value: 'auto', label: 'Automatisch: freie Bilder aus dem Internet, sonst KI-Bild' },
                          { value: 'web', label: 'Nur freie Bilder aus dem Internet' },
                          { value: 'ai', label: 'Nur KI-Bilder' },
                          { value: 'placeholder', label: 'Platzhalter (selbst wählen)' }
                        ]}
                        value={meta.imageSource}
                        onChange={(v) => v && patch({ imageSource: v as WorksheetImageSource })}
                        allowDeselect={false}
                      />
                    </SimpleGrid>
                    <Switch
                      label="Ein Schmuckbild zulassen"
                      description={
                        meta.decorImage === false
                          ? 'Jedes Bild trägt Information, die eine Aufgabe braucht.'
                          : 'Höchstens eines, thematisch gebunden, freundlich und nie am Blattanfang – nur unter diesen Bedingungen ist es unschädlich.'
                      }
                      checked={meta.decorImage !== false}
                      onChange={(e) => patch({ decorImage: e.currentTarget.checked })}
                    />
                  </Stack>
                </Card>

                <Card withBorder>
                  <Title order={4} mb={4}>
                    Eigenes Material (optional)
                  </Title>
                  <Text size="sm" c="dimmed" mb="sm">
                    Texte, Buchseiten, Arbeitsblätter oder Bilder, auf denen das Arbeitsblatt aufbauen soll.
                  </Text>
                  <DropZone
                    onFiles={addFiles}
                    accept={MATERIAL_ACCEPT}
                    title={reading ?? 'Dateien hierher ziehen oder klicken'}
                    hint="PDF, Word, Bilder, Text"
                    loading={Boolean(reading)}
                    minHeight={80}
                  />
                  {/* Internetadresse als Material – Webseite oder Video (26.09.2026) */}
                  <UrlQuelleEingabe
                    mt="xs"
                    onInhalt={(c) =>
                      setWorksheet({ ...worksheet, sources: [...worksheet.sources, { id: newId(), ...c, useAsBasis: true, embedImage: false }] })
                    }
                  />
                  <Stack gap={6} mt="sm">
                    {worksheet.sources.map((s, i) => (
                      <Group key={s.id} justify="space-between" wrap="nowrap" className="picker-tile" px="sm" py={6}>
                        <div style={{ minWidth: 0 }}>
                          <Text size="sm" fw={500} truncate>
                            {s.fileName}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {s.kind === 'pdf'
                              ? `PDF, ${s.pagesRead.length} von ${s.pageCount} Seiten gelesen`
                              : s.kind === 'image'
                                ? 'Bild'
                                : s.kind === 'docx'
                                  ? 'Word-Dokument'
                                  : s.kind === 'video'
                                    ? videoMaterialArt(s.text)
                                    : s.kind === 'web'
                                      ? 'Webseite'
                                      : 'Text'}
                            {s.text
                              ? ` · ${s.text.length.toLocaleString('de-DE')} Zeichen`
                              : s.pageImages.length
                                ? ` · ${s.pageImages.length} Seitenbild(er)`
                                : ''}
                          </Text>
                        </div>
                        <Group gap="xs" wrap="nowrap">
                          {s.kind === 'video' && (
                            <VideoTranskript
                              text={s.text}
                              onChange={(text) => setWorksheet({ ...worksheet, sources: worksheet.sources.map((x, j) => (j === i ? { ...x, text } : x)) })}
                            />
                          )}
                          <Checkbox
                            size="xs"
                            label="Grundlage"
                            checked={s.useAsBasis}
                            onChange={(e) =>
                              setWorksheet({
                                ...worksheet,
                                sources: worksheet.sources.map((x, j) => (j === i ? { ...x, useAsBasis: e.currentTarget.checked } : x))
                              })
                            }
                          />
                          {s.kind === 'image' && (
                            <Checkbox
                              size="xs"
                              label="Bild übernehmen"
                              checked={s.embedImage}
                              onChange={(e) =>
                                setWorksheet({
                                  ...worksheet,
                                  sources: worksheet.sources.map((x, j) => (j === i ? { ...x, embedImage: e.currentTarget.checked } : x))
                                })
                              }
                            />
                          )}
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            color="red"
                            aria-label={`${s.fileName} entfernen`}
                            onClick={() => setWorksheet({ ...worksheet, sources: worksheet.sources.filter((_, j) => j !== i) })}
                          >
                            <IconTrash size={14} />
                          </Button>
                        </Group>
                      </Group>
                    ))}
                  </Stack>
                  {materialChars > MATERIAL_WARN_CHARS && (
                    <Alert color="orange" mt="sm" p="xs">
                      Das Material ist sehr umfangreich ({materialChars.toLocaleString('de-DE')} Zeichen). Es wird vollständig an die KI geschickt; das kann
                      teuer werden. Nicht benötigte Dateien besser abwählen.
                    </Alert>
                  )}
                </Card>
              </Stack>
            </Grid.Col>
          </Grid>

          {/*
           * Selten Geändertes eingeklappt (Paket 6, Wunsch der Lehrkraft): Oben bleibt, was jedes
           * Blatt braucht. Die Überschrift nennt, was hier vom Standard abweicht.
           */}
          {/* Versuch mit Protokoll (29.09.2026) – nur in Fächern mit Versuchen, Messungen, Beobachtungen */}
          {hatProtokolle(meta.subjectId) && (
            <Box mt="lg">
              <VersuchKarte
                lerngruppe={meta}
                versuch={meta.versuch}
                patchVersuch={(versuch) => patch({ versuch })}
                ausarbeiten={() => versuchAuftrag(useArbeitsblatt.getState().worksheet ?? worksheet, useArbeitsblatt.getState().docId)}
              />
            </Box>
          )}
          <Box mt="lg">
            <WeitereOptionen modul="arbeitsblatt" geaendert={geaenderteOptionen(meta, worksheet.design, designs)}>
              <Grid gap="lg">
                <Grid.Col span={12}>
                  <ProfileCard profile={profile} meta={meta} onOverrides={(overrides) => patch({ overrides })} />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Stack gap="sm">
                    <MultiSelect
                      label="Bevorzugte Sozialformen (optional)"
                      data={[
                        { value: 'EA', label: 'Einzelarbeit' },
                        { value: 'PA', label: 'Partnerarbeit' },
                        { value: 'GA', label: 'Gruppenarbeit' },
                        { value: 'Plenum', label: 'Klassengespräch' },
                        { value: 'Rollenspiel', label: 'Rollenspiel' }
                      ]}
                      value={meta.socialForms}
                      onChange={(v) => patch({ socialForms: v as SocialForm[] })}
                    />
                    {meta.socialForms.includes('Rollenspiel') && (
                      <Card withBorder padding="sm" bg="var(--mantine-color-default-hover)">
                        <Select
                          size="sm"
                          label="Form des Rollenspiels"
                          description={
                            rolePlayTypeById(meta.rolePlayType ?? '')
                              ? `${rolePlayTypeById(meta.rolePlayType!)!.purpose}. Fallstrick: ${rolePlayTypeById(meta.rolePlayType!)!.pitfall}`
                              : 'Automatisch: Die KI wählt eine Form, die zum Thema und zum Fach passt.'
                          }
                          data={[
                            { value: '', label: 'automatisch (passend zum Thema)' },
                            ...rolePlayTypesFor(meta.subjectId).map((t) => ({
                              value: t.id,
                              label: `${t.label} · ${t.roles[0]}${t.roles[1] !== t.roles[0] ? `–${t.roles[1]}` : ''} Rollen`
                            }))
                          ]}
                          value={meta.rolePlayType ?? ''}
                          onChange={(v) => patch({ rolePlayType: v || undefined })}
                          allowDeselect={false}
                        />
                        <Text size="xs" c="dimmed" mt="xs">
                          Das Blatt bekommt Rollenkarten mit Interessen, Zielen, Machtmitteln und Grenzen des Verhandelbaren, einen Beobachtungsbogen, einen
                          Schritt zur Entrollung und Reflexionsfragen – auch eines ohne Rolle.
                        </Text>
                        {isSensitiveForRolePlay(meta.topic) && (
                          <Text size="xs" c="orange" mt="xs">
                            Zu diesem Thema dürfen keine Opfer- oder Täterrollen gespielt werden. Die App erzeugt stattdessen ein Format darüber – etwa eine
                            Redaktionssitzung oder eine Debatte über das Gedenken.
                          </Text>
                        )}
                        {WITHOUT_ESTABLISHED_PRACTICE.includes(meta.subjectId) && (
                          <Text size="xs" c="dimmed" mt="xs">
                            Für {meta.subjectLabel} gibt es keine etablierte Rollenspiel-Didaktik. Die App weist im Lehrerteil darauf hin.
                          </Text>
                        )}
                      </Card>
                    )}
                    <Stack gap="sm">
                      <TextInput
                        label="Nummer des Arbeitsblatts (optional)"
                        placeholder="z. B. 3"
                        value={meta.sheetNumber}
                        onChange={(e) => patch({ sheetNumber: e.currentTarget.value })}
                      />
                    </Stack>
                  </Stack>
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Stack gap="sm">
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                      <Select
                        label="Designvorlage"
                        data={designs.map((d) => ({ value: d.id, label: d.name + (d.isDefault ? ' (Standard)' : '') }))}
                        value={worksheet.design?.id}
                        onChange={(v) => {
                          const d = designs.find((x) => x.id === v)
                          if (d) setWorksheet({ ...worksheet, design: d })
                        }}
                        allowDeselect={false}
                      />
                    </SimpleGrid>
                    <Stack gap="sm">
                      <Switch
                        label="Piktogramme an den Arbeitsanweisungen"
                        description="Symbole für schreiben, lesen, markieren, vergleichen … Bewusst nicht automatisch nach Jahrgang: Ob sie der Lerngruppe helfen, entscheidet die Lehrkraft."
                        checked={Boolean(meta.pictograms)}
                        onChange={(e) => patch({ pictograms: e.currentTarget.checked })}
                      />
                    </Stack>
                    {meta.skillFocus !== 'vocabulary' && (
                      <Select
                        label="Originalquellen"
                        description={`Authentische Text- und Bildquellen aus frei zugänglichen Archiven (z. B. Wikisource, Wikimedia Commons). ${originalSourcesHint(meta)}`}
                        data={[
                          { value: 'auto', label: 'Automatisch nach Fach und Jahrgang' },
                          { value: 'on', label: 'Ja, Originalquellen einbauen' },
                          { value: 'off', label: 'Nein, nur Autorentexte' }
                        ]}
                        value={meta.originalSources ?? 'auto'}
                        onChange={(v) => v && patch({ originalSources: v as OriginalSourcesMode })}
                        allowDeselect={false}
                      />
                    )}
                  </Stack>
                </Grid.Col>
                <Grid.Col span={12}>
                  <VideoCard meta={meta} patch={patch} foreignLanguage={Boolean(subject.foreignLanguage)} />
                </Grid.Col>
              </Grid>
            </WeitereOptionen>
          </Box>

          <Box h="lg" />
        </Container>

        <VocabFocusModal
          opened={vocabOpen}
          meta={meta}
          onClose={() => setVocabOpen(false)}
          onTake={(vocabWords, vocabWork, knownVocab) => {
            // Die Obergrenze nur setzen, wenn eine Quelle sie liefert – eine vorhandene nicht löschen
            patch({ vocabWords, vocabWork, ...(knownVocab ? { knownVocab } : {}) })
            setVocabOpen(false)
          }}
        />
      </ScrollArea>
    </FormularSeite>
  )
}

/**
 * Film oder Video, zu dem beobachtet werden soll.
 *
 * Die Angaben werden VOR der Erstellung gemacht, weil sie die Aufgaben selbst formen: Bei
 * einem Spielfilm entsteht etwas anderes als bei einem Erklärvideo, und ob arbeitsteilig
 * beobachtet wird, entscheidet über die Zahl der Aufträge.
 */
function VideoCard({
  meta,
  patch,
  foreignLanguage
}: {
  meta: WorksheetMeta
  patch: (p: Partial<WorksheetMeta>) => void
  foreignLanguage: boolean
}): React.JSX.Element {
  const v = meta.video
  const on = Boolean(v)
  const set = (p: Partial<VideoSetup>): void => patch({ video: { ...(v ?? EMPTY_VIDEO), ...p } })
  const kind = v ? videoKindById(v.kind) : undefined
  const during = v ? duringPolicy(v.kind, v.during) : 'ankreuzen'
  const isUrl = /^https?:\/\//i.test(v?.url.trim() ?? '')
  const { sourced } = observationFoci(meta.subjectId)
  const section = sectionMinutes(meta.grade)
  const [videoLaeuft, setVideoLaeuft] = useState(false)

  /**
   * Titel, Laufzeit und Inhalt aus dem Video übernehmen (26.09.2026).
   *
   * Die KI kann das Video nicht ansehen – bisher musste die Lehrkraft den Inhalt selbst
   * beschreiben. Bei einem YouTube-Video liest die App Titel, Beschreibung und Transkript
   * aus den Untertiteln und trägt sie hier ein; Vorhandenes wird nicht überschrieben.
   */
  const videoLaden = async (): Promise<void> => {
    if (!v) return
    setVideoLaeuft(true)
    try {
      const q = await window.api.sources.video(normalisiereAdresse(v.url))
      if (!q.titel && !q.transkript && !q.beschreibung) throw new Error(q.fehler ?? 'Das Video ließ sich nicht laden.')
      const inhalt = [q.beschreibung, q.transkript ? `Transkript${q.automatisch ? ' (automatisch erzeugte Untertitel)' : ''}:\n${q.transkript}` : '']
        .filter(Boolean)
        .join('\n\n')
      set({
        title: v.title.trim() || q.titel,
        platform: v.platform.trim() || 'YouTube',
        minutes: v.minutes || Math.round(q.dauerSekunden / 60),
        summary: v.summary.trim() ? v.summary : inhalt
      })
      if (q.fehler) notifyError(new Error(q.fehler), 'Video nur teilweise gelesen')
      else notifySuccess(q.transkript ? 'Titel, Laufzeit und Transkript übernommen.' : 'Titel und Laufzeit übernommen.')
    } catch (e) {
      notifyError(e, 'Das Video ließ sich nicht laden')
    } finally {
      setVideoLaeuft(false)
    }
  }

  return (
    <Card withBorder>
      <Checkbox
        label="Beobachtungsauftrag zu einem Film oder Video"
        description="Film, Lernvideo, Mediathek- oder YouTube-Beitrag – mit Aufgaben vor, während und nach dem Sehen"
        checked={on}
        onChange={(e) => patch({ video: e.currentTarget.checked ? EMPTY_VIDEO : undefined })}
      />
      {v && (
        <Stack gap="sm" mt="sm">
          <TextInput
            label="Titel des Films oder Videos"
            description="So genau wie möglich – danach schreibt die KI die Aufgaben"
            placeholder="z. B. „Die Welle (2008)“ oder „Fotosynthese einfach erklärt“"
            value={v.title}
            onChange={(e) => set({ title: e.currentTarget.value })}
          />
          <TextInput
            label="Adresse (optional)"
            description={
              isUrl ? 'Daraus entstehen QR-Code und Klartextlink auf dem Blatt.' : 'Ohne Adresse kein QR-Code – der Titel allein genügt für die Aufgaben.'
            }
            placeholder="https://…"
            value={v.url}
            onChange={(e) => set({ url: e.currentTarget.value })}
          />
          {isUrl && istVideoAdresse(v.url) && (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconDownload size={14} />}
              loading={videoLaeuft}
              style={{ alignSelf: 'flex-start' }}
              onClick={() => void videoLaden()}
            >
              Titel, Laufzeit und Inhalt aus dem Video übernehmen
            </Button>
          )}
          <Group grow>
            <Select
              label="Art des Videos"
              description={kind?.description}
              data={VIDEO_KINDS.map((k) => ({ value: k.id, label: k.label }))}
              value={v.kind}
              onChange={(value) => value && set({ kind: value as VideoKind })}
              allowDeselect={false}
            />
            <TextInput
              label="Herkunft (optional)"
              placeholder="YouTube, Mediathek, Medienzentrum, DVD"
              value={v.platform}
              onChange={(e) => set({ platform: e.currentTarget.value })}
            />
          </Group>
          <Group grow>
            <ZahlFeld label="Laufzeit (Min.)" min={0} max={300} value={v.minutes} onChange={(value) => set({ minutes: Number(value) || 0 })} />
            <TextInput
              label="Gezeigter Abschnitt (optional)"
              placeholder="12:40–18:10"
              value={v.section}
              onChange={(e) => set({ section: e.currentTarget.value })}
            />
          </Group>
          <Textarea
            label="Worum es geht (optional, aber empfohlen)"
            description="Die KI kann das Video nicht ansehen. Ohne Angabe schreibt sie aus ihrem Wissen über den Titel – bei einem bekannten Film trägt das, bei einem beliebigen Netzvideo nicht."
            placeholder="Kurze Inhaltsangabe oder ein Transkript"
            autosize
            minRows={2}
            maxRows={6}
            value={v.summary}
            onChange={(e) => set({ summary: e.currentTarget.value })}
          />
          <Select
            label="Aufgaben während des Sehens"
            description={
              v.during === 'auto' || !v.during
                ? kind?.reason
                : during === 'keine'
                  ? 'Es entstehen nur Aufgaben vor und nach dem Sehen.'
                  : during === 'ankreuzen'
                    ? 'Höchstens zwei Aufgaben, nur zum Ankreuzen, Abhaken oder Eintragen.'
                    : 'Kurze, prüfbare Fragen in der Reihenfolge des Videos; das Video darf angehalten werden.'
            }
            data={[
              {
                value: 'auto',
                label: `nach Art des Videos (${VIDEO_KINDS.find((k) => k.id === v.kind)?.during === 'keine' ? 'keine' : VIDEO_KINDS.find((k) => k.id === v.kind)?.during === 'leitfragen' ? 'Leitfragen' : 'Ankreuzaufgaben'})`
              },
              { value: 'keine', label: 'keine – erst danach notieren' },
              { value: 'ankreuzen', label: 'wenige Ankreuzaufgaben' },
              { value: 'leitfragen', label: 'Leitfragen zum Mitarbeiten' }
            ]}
            value={v.during ?? 'auto'}
            onChange={(value) => value && set({ during: value as ViewingDuring })}
            allowDeselect={false}
          />
          <Select
            label="Beobachtung aufteilen"
            description="Verschiedene Gruppen achten auf Verschiedenes und tragen es danach zusammen. Jede Gruppe bekommt ein eigenes Blatt – gleiches Layout, nur der Beobachtungsauftrag unterscheidet sich."
            data={[
              { value: '0', label: 'alle beobachten dasselbe' },
              { value: '2', label: 'zwei Gruppen' },
              { value: '3', label: 'drei Gruppen' },
              { value: '4', label: 'vier Gruppen' }
            ]}
            value={String(v.groups || 0)}
            onChange={(value) => value && set({ groups: Number(value) })}
            allowDeselect={false}
          />
          {/* Getrennte Niveaublätter und Beobachtergruppen vervielfachen sich miteinander –
              das merkt man sonst erst am Kopierer. */}
          {v.groups > 1 && meta.differentiation.levels > 1 && meta.differentiation.mode === 'separate' && (
            <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
              Getrennte Niveaublätter und {v.groups} Beobachtergruppen ergeben {meta.differentiation.levels * v.groups} verschiedene Blätter. Wenn das zu viel
              wird: ein Blatt mit ★-Aufgaben wählen oder die Beobachtung nicht aufteilen.
            </Alert>
          )}
          {foreignLanguage && (
            <Select
              label="Untertitel"
              description={SUBTITLE_OPTIONS.find((o) => o.value === (v.subtitles ?? 'keine'))?.note}
              data={SUBTITLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={v.subtitles ?? 'keine'}
              onChange={(value) => value && set({ subtitles: value as SubtitleMode })}
              allowDeselect={false}
            />
          )}
          <Checkbox
            label="Zeitangaben auch auf dem Schülerblatt"
            description="Vorgabe: aus. Zeitmarken hängen an einer Fassung – nach einem neuen Hochladen oder bei anderer Schnittfassung stimmen sie nicht mehr. Auf der Lehrerseite stehen sie immer."
            checked={Boolean(v.timecodesOnSheet)}
            onChange={(e) => set({ timecodesOnSheet: e.currentTarget.checked })}
          />
          <Text size="xs" c="dimmed">
            Abschnitt am Stück in Klasse {meta.grade}: etwa {section.range[0]}–{section.range[1]} Minuten (Faustregel).
            {!sourced && ' Die Beobachtungsschwerpunkte für dieses Fach sind abgeleitet, nicht aus der Fachdidaktik belegt.'}
          </Text>
        </Stack>
      )}
    </Card>
  )
}

const SOZIALFORM_KURZ: Record<string, string> = { EA: 'EA', PA: 'PA', GA: 'GA', Plenum: 'Plenum', Rollenspiel: 'Rollenspiel' }

/**
 * Was unter „Weitere Optionen" vom Standard abweicht – für die Zusammenfassung in der
 * eingeklappten Überschrift. Standard ist, was ein neues Blatt mitbringt (model/defaults.ts)
 * und die Designvorlage, die als Standard markiert ist.
 *
 * Nur eingeklappte Felder zählen: Lösungsblatt, Hilfekarten, Tafelbild, Differenzierung und
 * Bilder stehen seit Paket 7 sichtbar oben – dort sieht man ihren Stand ohnehin.
 */
export function geaenderteOptionen(meta: WorksheetMeta, design: DesignTemplate | undefined, designs: DesignTemplate[]): string[] {
  const standardDesign = designs.find((d) => d.isDefault) ?? designs[0]
  const o = meta.overrides
  return [
    o.afbMix || o.fontPt || o.scaffolding ? 'Lerngruppen-Anpassung' : '',
    meta.socialForms.length ? `Sozialformen ${meta.socialForms.map((f) => SOZIALFORM_KURZ[f] ?? f).join('/')}` : '',
    design && standardDesign && design.id !== standardDesign.id ? `Design „${design.name}“` : '',
    meta.pictograms ? 'Piktogramme' : '',
    meta.skillFocus !== 'vocabulary' && meta.originalSources && meta.originalSources !== 'auto'
      ? `Originalquellen ${meta.originalSources === 'on' ? 'ja' : 'nein'}`
      : '',
    meta.sheetNumber.trim() ? `Nummer ${meta.sheetNumber.trim()}` : '',
    meta.video ? 'Video' : ''
  ].filter(Boolean)
}
