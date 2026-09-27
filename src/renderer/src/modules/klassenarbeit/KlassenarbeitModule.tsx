import { sichereAlles } from '../../shared/autosave'
import { Box, Button, Group, Stepper } from '@mantine/core'
import { IconFolder, IconPlus } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { defaultExamName, newExamSafely, openSavedExam, useExamAutosave } from './library'
import { notifyError } from '../../shared/util'
import UndoRedoButtons from '../../shared/components/UndoRedoButtons'
import { useUndoKeys } from '../../shared/useUndoKeys'
import ExamLibrary from './steps/ExamLibrary'
import FrameStep from './steps/FrameStep'
import TasksStep from './steps/TasksStep'
import { useKlassenarbeit } from './store'
import { EXAM_FILTER, parseExamFile } from './project'
import { useDokumentOeffner, useNeuAnleger } from '../../shared/navigation'
import { useRueckfrage, useSperrenderAuftrag } from '../../shared/auftraege'
import AuftragsHinweis from '../../shared/components/AuftragsHinweis'
import QuellenAuswahl from '../arbeitsblatt/steps/QuellenAuswahl'
import { QUELLENAUSWAHL, type QuellenFrage } from '../arbeitsblatt/auftraege'

/**
 * Programm „Klassenarbeiten“ – zunächst für Englisch und Geschichte.
 * Beim Öffnen erscheinen die gespeicherten Arbeiten, sofern es welche gibt.
 */
export default function KlassenarbeitModule({ active }: { active: boolean }): React.JSX.Element {
  const { step, setStep, exam, undo, redo, verlauf, docId, docName } = useKlassenarbeit()
  const [library, setLibrary] = useState(false)
  // Läuft für diese Arbeit ein Auftrag, steht statt der Aufgaben ein Hinweis da (shared/auftraege.ts)
  const auftrag = useSperrenderAuftrag(docId)
  // Oberstufe: Der Auftrag wartet auf die Wahl der Quelle
  const quellenFrage = useRueckfrage(docId, QUELLENAUSWAHL)
  useExamAutosave()
  /*
   * Strg+Z / Strg+Y nur, solange dieses Programm vorn liegt. Zurückholen lässt sich damit auch,
   * was Teile ersetzt oder leert (Vorschlag erzeugen, Fach- oder Jahrgangswechsel, Neu erzeugen).
   */
  useUndoKeys(active && !library && !auftrag, undo, redo)
  const startNew = (): void => {
    setLibrary(false)
    newExamSafely().catch(notifyError)
  }
  // .klassenarbeit-Datei öffnen (27.09.2026) – wie „Datei öffnen …" beim Arbeitsblatt
  const openFile = async (): Promise<void> => {
    try {
      const file = await window.api.files.open(EXAM_FILTER)
      if (file) {
        await sichereAlles()
        useKlassenarbeit.getState().loadFromFile(parseExamFile(file.data))
        setLibrary(false)
      }
    } catch (e) {
      notifyError(e)
    }
  }
  /*
   * „Neu in diesem Bereich" (Themenbereiche, Paket 10b): neues Dokument anlegen und seine
   * Kennung liefern – aus der eigenen Bibliothek und von der übergreifenden Seite aus.
   */
  const neuMitKennung = async (): Promise<string> => {
    setLibrary(false)
    await newExamSafely()
    return useKlassenarbeit.getState().docId
  }
  useNeuAnleger('klassenarbeit', neuMitKennung)

  // „Zuletzt bearbeitet" auf der Startseite (und später „Öffnen" nach einem Auftrag) öffnet hierüber
  const vonAussen = useDokumentOeffner('klassenarbeit', async (id) => {
    await openSavedExam(id)
    setLibrary(false)
  })

  useEffect(() => {
    if (useKlassenarbeit.getState().exam?.parts.length) return
    window.api.exams
      .list()
      .then((list) => !vonAussen.current && setLibrary(list.length > 0))
      .catch(() => setLibrary(false))
  }, [])

  if (library) {
    // „Zurück zu …" nur, solange eine Arbeit offen ist
    return (
      <ExamLibrary
        onNew={startNew}
        onNeuImBereich={neuMitKennung}
        onOpenFile={() => void openFile()}
        onOpened={() => setLibrary(false)}
        zurueck={exam ? docName || defaultExamName(exam) : null}
        onZurueck={() => setLibrary(false)}
      />
    )
  }

  return (
    <Box h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      {/*
        `app-toolbar` fehlte hier – damit sah die Leiste nicht nur anders aus als in den
        übrigen Programmen, es griff auch die Anpassung für schmale Bildschirme nicht: Auf
        einem Tablet stapelte sie sich auf mehrere Zeilen und nahm dem Blatt den Platz.
      */}
      <Group px="lg" py="sm" align="flex-start" className="app-toolbar">
        {/*
          Zwei Schritte wie in Lernzielkontrolle und Grammatiktest. Bis 25.09.2026 stand hier
          ein dritter Schritt „Bearbeiten & Export", der fest gesperrt war – erreichbar war er
          nie. Bearbeiten und Ausgeben gehören jetzt zum zweiten Schritt.
        */}
        <Stepper active={step} onStepClick={setStep} size="sm" style={{ flex: 1 }} allowNextStepsSelect={false}>
          <Stepper.Step label="Rahmen" description="Fach, Lerngruppe, Aufbau, Material" />
          <Stepper.Step label="Bearbeiten & Export" description="Aufgaben, Erwartungshorizont, Word, PDF" disabled={!exam?.parts.length} />
        </Stepper>
        <Group gap="xs">
          {/* Ab Schritt 2 stehen Rückgängig, Name und Sicherung in der Editor-Leiste (27.09.2026, wie beim Arbeitsblatt) */}
          {step !== 1 && <UndoRedoButtons canUndo={verlauf.past.length > 0} canRedo={verlauf.future.length > 0} onUndo={undo} onRedo={redo} />}
          {/* Zurueck zur Uebersicht – beschriftet und immer sichtbar, wie in den anderen Programmen */}
          <Button variant="subtle" leftSection={<IconFolder size={16} />} onClick={() => setLibrary(true)}>
            Meine Klassenarbeiten
          </Button>
          {/* Nach dem letzten Schritt: ohne Umweg über die Bibliothek von vorn beginnen */}
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={startNew}>
            Neue Klassenarbeit
          </Button>
        </Group>
      </Group>
      <Box style={{ flex: 1, minHeight: 0 }}>
        {auftrag ? (
          <AuftragsHinweis auftrag={auftrag} neuLabel="Neue Klassenarbeit" onNeu={startNew} />
        ) : (
          <>
            {step === 0 && <FrameStep />}
            {step === 1 && exam && <TasksStep exam={exam} />}
          </>
        )}
      </Box>
      {/* Nur im vorderen Programm – ein Dialog aus einem Programm im Hintergrund käme ungefragt nach vorn */}
      {active && quellenFrage && (
        <QuellenAuswahl
          treffer={(quellenFrage.daten as QuellenFrage).treffer}
          thema={(quellenFrage.daten as QuellenFrage).thema}
          onWaehlen={(url) => quellenFrage.antworte(url)}
        />
      )}
    </Box>
  )
}
