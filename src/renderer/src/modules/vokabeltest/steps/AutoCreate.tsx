import { Alert, Button, Checkbox, Group, Loader, Modal, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import ZahlFeld from '../../../shared/components/ZahlFeld'
import { IconSparkles } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { CEFR_SCALE, CefrLevel, CefrTable } from '@shared/types'
import { gradeOptions, suggestLevel } from '../../../shared/cefr'
import { notifyError } from '../../../shared/util'
import { planAutoTasks, suggestLevelFromVocab, VocabLevelSuggestion, vocabCountFor } from '../generation/autoPlan'
import { erstelleVokabeltest } from '../auftraege'
import { TASK_TYPES } from '../generation/taskTypes'
import { formatPoints, variantPoints } from '../model/blocks'
import { randomSeed } from '../model/random'
import { grundEinstellungen } from '../model/grundeinstellungen'
import { LANGUAGES, TestSettings } from '../model/types'
import { includedVocab } from '../model/vocab'
import { aiCall, useVokabeltest } from '../store'
import type { VocabListContext } from '../store'
import { collectKnownVocab } from '../../../shared/knownVocab'
import { textbookEntries } from './TextbookPicker'
import type { BookSelection } from './TextbookPicker'

/**
 * Grundeinstellungen für einen automatisch erstellten Test: die bisherigen Einstellungen, sonst
 * dieselben Vorgaben wie beim Weg über Schritt 2 (model/grundeinstellungen.ts – Paket 7: vorher
 * hier eine Variante statt zwei und ohne die zuletzt gewählte Lerngruppe).
 */
async function baseSettings(previous: TestSettings | null, context: VocabListContext | null, vokabeln: number): Promise<TestSettings> {
  if (previous) return { ...previous }
  const [app, table] = await Promise.all([window.api.settings.get(), window.api.cefr.get()])
  return grundEinstellungen(app, table, context, vokabeln)
}

/**
 * Knopf „Test automatisch erstellen": fragt nur die Punktzahl ab und wählt die Aufgabenformate selbst.
 *
 * Steht schon eine Liste da, zählen deren abgefragte Vokabeln. Ist die Liste leer, genügt
 * eine Auswahl im Reiter „Schulbuch" – sie wird dann beim Klick übernommen. Zusatzwortschatz
 * (im Buch grau) kommt mit, wird aber wie überall nicht abgefragt (Paket 7; vorher setzte
 * dieser Weg ALLES auf „abfragen").
 */
export function AutoCreateButton({ selection }: { selection?: BookSelection | null }): React.JSX.Element {
  const { vocab, setVocab, listName, setListName, setListContext } = useVokabeltest()
  const [opened, setOpened] = useState(false)
  const [loading, setLoading] = useState(false)
  const usable = includedVocab(vocab)
  // Die Liste hat Vorrang; nur wenn sie leer ist, zählt die Auswahl im Schulbuch
  const fromBook = vocab.length === 0 && selection ? selection.count : 0
  const ready = usable.length >= 2 || fromBook >= 2

  const open = async (): Promise<void> => {
    if (usable.length < 2 && selection && vocab.length === 0) {
      setLoading(true)
      try {
        const book = await window.api.textbooks.get(selection.bookId)
        const entries = textbookEntries(book, selection.unit, selection.sections, selection.filter)
        setVocab(entries)
        if (!listName.trim()) setListName(selection.name)
        // Wortschatz der früheren Units und Bände mitnehmen: Die Aufgaben bleiben in dem, was die Klasse kennt
        const books = await window.api.textbooks.list()
        const known = await collectKnownVocab(book, selection.unit, selection.sections, selection.context.grade ?? 99, books, (id) =>
          window.api.textbooks.get(id)
        )
        setListContext({ ...selection.context, known: known ?? undefined })
      } catch (e) {
        notifyError(e)
        setLoading(false)
        return
      }
      setLoading(false)
    }
    setOpened(true)
  }

  return (
    <>
      <Button variant="light" leftSection={<IconSparkles size={16} />} disabled={!ready} loading={loading} onClick={() => void open()}>
        Test automatisch erstellen
      </Button>
      <AutoCreateModal opened={opened} onClose={() => setOpened(false)} />
    </>
  )
}

/** Analyse-Ergebnisse je Vokabelliste merken, damit erneutes Öffnen keine weitere KI-Anfrage kostet */
const analysisCache = new Map<string, VocabLevelSuggestion | null>()

function AutoCreateModal({ opened, onClose }: { opened: boolean; onClose: () => void }): React.JSX.Element {
  const { vocab, settings: stored, listName, listContext } = useVokabeltest()
  const [analysis, setAnalysis] = useState<{ running: boolean; result: VocabLevelSuggestion | null; failed?: boolean }>({ running: false, result: null })
  /** Hat die Lehrkraft Klasse oder Niveau selbst geändert, überschreibt die Analyse das nicht mehr */
  const touched = useRef(false)
  const usable = includedVocab(vocab)
  const [points, setPoints] = useState<number>(20)
  const [base, setBase] = useState<TestSettings | null>(null)
  const [table, setTable] = useState<CefrTable | null>(null)
  const [economy, setEconomy] = useState(true)

  useEffect(() => {
    if (!opened) return
    // Erst neu laden, dann analysieren (sonst überschreiben alte Einstellungen den Vorschlag)
    setBase(null)
    baseSettings(stored, listContext, usable.length).then(setBase).catch(notifyError)
    window.api.cefr.get().then(setTable).catch(notifyError)
    window.api.ai
      .status()
      .then((s) => setEconomy(s.economy))
      .catch(notifyError)
    touched.current = false
    setAnalysis({ running: false, result: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened])

  // Vokabelanalyse: für welche Klassenstufe und welches Niveau ist die Liste vermutlich gedacht?
  const baseReady = Boolean(base && table)
  useEffect(() => {
    if (!opened || !base || !table || usable.length < 2) return
    const key = `${listName}|${base.targetLanguage}|${base.stateId}|${base.schoolTypeId}|${usable.map((v) => v.term).join('|')}`
    const apply = (result: VocabLevelSuggestion | null): void => {
      setAnalysis({ running: false, result, failed: !result })
      if (result && !touched.current) setBase((b) => (b ? { ...b, grade: result.grade, level: result.level } : b))
    }
    if (analysisCache.has(key)) {
      apply(analysisCache.get(key) ?? null)
      return
    }
    let cancelled = false
    setAnalysis({ running: true, result: null })
    const grades = gradeOptions(table, base.stateId, base.schoolTypeId, base.languageOrder)
    suggestLevelFromVocab(usable, listName, base, grades, aiCall)
      .then((result) => {
        analysisCache.set(key, result)
        if (!cancelled) apply(result)
      })
      .catch(() => !cancelled && setAnalysis({ running: false, result: null, failed: true }))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, baseReady])

  const tested = vocabCountFor(points, usable.length)
  const patch = (p: Partial<TestSettings>): void => setBase((b) => (b ? { ...b, ...p } : b))
  const grades = base && table ? gradeOptions(table, base.stateId, base.schoolTypeId, base.languageOrder) : []
  const suggestion = base && table ? suggestLevel(table, base.stateId, base.schoolTypeId, base.languageOrder, base.grade) : null
  /** Neue Klassenstufe übernimmt den Niveau-Vorschlag der Tabelle (danach frei änderbar). */
  const setGrade = (grade: number): void => {
    touched.current = true
    const s = base && table ? suggestLevel(table, base.stateId, base.schoolTypeId, base.languageOrder, grade) : null
    patch(s ? { grade, level: s.level } : { grade })
  }
  const differentPossible = usable.length >= tested * (base?.variantCount ?? 1)
  const language = LANGUAGES.find((l) => l.value === base?.targetLanguage)?.label ?? base?.targetLanguage

  /*
   * Erstellen läuft als Hintergrund-Auftrag (../auftraege.ts): Das Fenster schließt sofort,
   * die Auftragsleiste zeigt den Fortschritt, und der Test landet in DIESEM Vokabeltest (auch
   * in der Bibliothek). Die Wahl der Aufgabenformate gehört mit zum Auftrag.
   */
  const start = (): void => {
    if (!base) return
    const variantMode = base.variantMode === 'differentVocab' && differentPossible ? 'differentVocab' : 'sameVocab'
    erstelleVokabeltest({
      art: 'Test automatisch erstellen',
      usable,
      settings: { ...base, variantMode },
      review: true,
      economy,
      known: listContext?.known,
      vorbereiten: async (settings, k) => {
        k.melde('Passende Aufgabenformate werden ausgewählt …')
        const { tasks, vocabCount } = await planAutoTasks(usable, settings, points, k.ai)
        return { ...settings, tasks, vocabCount, seed: randomSeed() }
      },
      abschluss: (result) => {
        const total = result.variants[0] ? variantPoints(result.variants[0]) : 0
        return `Test erstellt: ${result.settings.tasks.map((t) => `${TASK_TYPES[t.type].label} (${t.count})`).join(', ')} – ${formatPoints(total)} Punkte${total !== points ? ` (Vorgabe ${points})` : ''}.`
      }
    })
    onClose()
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Test automatisch erstellen">
      <Stack>
        <Text size="sm">
          Die KI wählt passende Aufgabenformate für die {usable.length} abgefragten Vokabeln und verteilt die Punkte. Der fertige Test lässt sich anschließend
          bearbeiten.
        </Text>
        <ZahlFeld
          label="Gesamtpunktzahl"
          min={2}
          max={200}
          step={1}
          value={points}
          onChange={(v) => setPoints(Math.max(2, Number(v) || 2))}

          data-autofocus
        />
        <Text size="xs" c="dimmed">
          {tested < usable.length
            ? `Bei ${points} Punkten werden ${tested} der ${usable.length} Vokabeln abgefragt (1 Punkt je Vokabel).`
            : `Alle ${usable.length} Vokabeln werden abgefragt.`}
          {base && ` Sprache: ${language}.`}
        </Text>
        {base && (
          <>
            <SimpleGrid cols={2} spacing="sm">
              {grades.length ? (
                <Select
                  label="Klassenstufe"
                  data={grades.map((g) => ({ value: g.value, label: g.label }))}
                  value={String(base.grade)}
                  onChange={(v) => v && setGrade(Number(v))}
                  allowDeselect={false}
                />
              ) : (
                <ZahlFeld label="Klassenstufe" min={1} max={13} value={base.grade} onChange={(v) => setGrade(Number(v) || 1)} />
              )}
              <Select
                label="Schwierigkeit (GER-Niveau)"
                data={[...CEFR_SCALE]}
                value={base.level}
                onChange={(v) => {
                  touched.current = true
                  if (v) patch({ level: v as CefrLevel })
                }}
                allowDeselect={false}
              />
            </SimpleGrid>
            {analysis.running ? (
              <Group gap={6} mt={-8}>
                <Loader size={12} />
                <Text size="xs" c="dimmed">
                  Vokabeln werden analysiert: Für welche Klasse und welches Niveau ist die Liste gedacht?
                </Text>
              </Group>
            ) : analysis.result ? (
              <Text size="xs" c="dimmed" mt={-8}>
                Vorschlag aus der Vokabelanalyse: Klasse {analysis.result.grade} · {analysis.result.level}
                {analysis.result.reason ? ` – ${analysis.result.reason}` : ''}
                {suggestion && suggestion.level !== base.level ? ` (Lehrplan-Richtwert für Klasse ${base.grade}: ${suggestion.level})` : ''}
              </Text>
            ) : (
              suggestion && (
                <Text size="xs" c="dimmed" mt={-8}>
                  Vorschlag für Klasse {base.grade}: {suggestion.level}
                  {suggestion.level !== base.level ? ' – leichter oder schwerer ist möglich.' : '.'}
                  {analysis.failed ? ' (Vokabelanalyse nicht möglich)' : ''}
                </Text>
              )
            )}
            <TextInput
              label="Themenbereich (optional)"
              description="Die Sätze und Texte der Aufgaben werden nach Möglichkeit in diesem Kontext angesiedelt."
              placeholder={analysis.result?.topic ? `z. B. ${analysis.result.topic}` : 'z. B. Urlaub am Meer, Schule in England'}
              value={base.topic}
              onChange={(e) => patch({ topic: e.currentTarget.value })}

              rightSectionWidth={analysis.result?.topic && !base.topic ? 90 : undefined}
              rightSection={
                analysis.result?.topic && !base.topic ? (
                  <Button size="compact-xs" variant="subtle" onClick={() => patch({ topic: analysis.result!.topic })}>
                    übernehmen
                  </Button>
                ) : undefined
              }
            />
            <div>
              <Text size="sm" fw={500} mb={4}>
                Testvarianten
              </Text>
              <SegmentedControl
                fullWidth
                data={[
                  { value: '1', label: 'nur A' },
                  { value: '2', label: 'A / B' },
                  { value: '3', label: 'A / B / C' },
                  { value: '4', label: 'A / B / C / D' }
                ]}
                value={String(base.variantCount)}
                onChange={(v) => patch({ variantCount: Number(v) })}
              />
              {base.variantCount > 1 && (
                <Checkbox
                  mt="xs"
                  size="xs"
                  label="Unterschiedliche Vokabeln je Variante (sonst gleiche Vokabeln, andere Sätze und Reihenfolge)"
                  checked={base.variantMode === 'differentVocab' && differentPossible}
                  disabled={!differentPossible}
                  description={!differentPossible ? `Dafür werden mindestens ${tested * base.variantCount} abgefragte Vokabeln benötigt.` : undefined}
                  onChange={(e) => patch({ variantMode: e.currentTarget.checked ? 'differentVocab' : 'sameVocab' })}
                />
              )}
            </div>
          </>
        )}
        {usable.length < 2 && (
          <Alert color="orange" p="xs">
            Mindestens zwei Vokabeln auf „abfragen“ stellen.
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          <Button leftSection={<IconSparkles size={16} />} onClick={start} disabled={!base || usable.length < 2}>
            Test erstellen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
