import { Box, Button, Group, Stepper } from '@mantine/core'
import { IconFolder, IconPlus } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { useExamAutosave } from './library'
import ExamLibrary from './steps/ExamLibrary'
import FrameStep from './steps/FrameStep'
import TasksStep from './steps/TasksStep'
import { useKlassenarbeit } from './store'

/**
 * Programm „Klassenarbeiten“ – zunächst für Englisch und Geschichte.
 * Beim Öffnen erscheinen die gespeicherten Arbeiten, sofern es welche gibt.
 */
export default function KlassenarbeitModule(): React.JSX.Element {
  const { step, setStep, exam, reset } = useKlassenarbeit()
  const [library, setLibrary] = useState(false)
  useExamAutosave()

  useEffect(() => {
    if (useKlassenarbeit.getState().exam?.parts.length) return
    window.api.exams
      .list()
      .then((list) => setLibrary(list.length > 0))
      .catch(() => setLibrary(false))
  }, [])

  if (library) {
    return (
      <ExamLibrary
        onNew={() => {
          reset()
          setLibrary(false)
        }}
        onOpened={() => setLibrary(false)}
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
        <Stepper active={step} onStepClick={setStep} size="sm" style={{ flex: 1 }} allowNextStepsSelect={false}>
          <Stepper.Step label="Rahmen" description="Fach, Lerngruppe, Aufbau" />
          <Stepper.Step label="Aufgaben" description="Material und Aufgaben" disabled={!exam?.parts.length} />
          <Stepper.Step label="Bearbeiten & Export" description="Erwartungshorizont, Word, PDF" disabled />
        </Stepper>
        {/* Zurueck zur Uebersicht – beschriftet und immer sichtbar, wie in den anderen Programmen */}
        <Button variant="subtle" leftSection={<IconFolder size={16} />} onClick={() => setLibrary(true)}>
          Meine Arbeiten
        </Button>
        {/* Nach dem letzten Schritt: ohne Umweg über die Bibliothek von vorn beginnen */}
        <Button variant="light" leftSection={<IconPlus size={16} />} onClick={reset}>
          Neue Klassenarbeit
        </Button>
      </Group>
      <Box style={{ flex: 1, minHeight: 0 }}>
        {step === 0 && <FrameStep onLibrary={() => setLibrary(true)} />}
        {step === 1 && exam && <TasksStep exam={exam} onLibrary={() => setLibrary(true)} />}
      </Box>
    </Box>
  )
}
