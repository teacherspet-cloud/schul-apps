import { Box, Button, Group, ScrollArea, Stepper, Text, Tooltip } from '@mantine/core'
import { IconFolder, IconPlus } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { newTestSafely, openSavedTest, useTestAutosave } from './library'
import { notifyError } from '../../shared/util'
import UndoRedoButtons from '../../shared/components/UndoRedoButtons'
import { useUndoKeys } from '../../shared/useUndoKeys'
import SetupStep from './steps/SetupStep'
import TestEditorStep from './steps/TestEditorStep'
import TestLibrary from './steps/TestLibrary'
import { useGrammatiktest } from './store'
import { useDokumentOeffner } from '../../shared/navigation'

const timeFormat = new Intl.DateTimeFormat('de-DE', { timeStyle: 'short' })

/**
 * Programm „Grammatiktest".
 *
 * Zwei Schritte: Formen und Umfang wählen, dann den erzeugten Test bearbeiten und ausgeben.
 * Beim Öffnen erscheinen die gespeicherten Tests, sofern es welche gibt – wie in den anderen
 * Programmen. Gespeichert wird von selbst, sobald Aufgaben da sind.
 */
export default function GrammatiktestModule({ active }: { active: boolean }): React.JSX.Element {
  const { step, setStep, test, savedAt, docName, undo, redo, verlauf } = useGrammatiktest()
  const [library, setLibrary] = useState(false)
  const hasTasks = Boolean(test?.blocks.length)
  useTestAutosave()
  // Strg+Z / Strg+Y nur, solange dieses Programm vorn liegt – in beiden Schritten
  useUndoKeys(active && !library, undo, redo)
  const startNew = (): void => {
    setLibrary(false)
    newTestSafely().catch(notifyError)
  }

  // „Zuletzt bearbeitet" auf der Startseite (und später „Öffnen" nach einem Auftrag) öffnet hierüber
  const vonAussen = useDokumentOeffner('grammatiktest', async (id) => {
    await openSavedTest(id)
    setLibrary(false)
  })

  useEffect(() => {
    if (useGrammatiktest.getState().test?.blocks.length) return
    window.api.grammarTests
      .list()
      .then((list) => !vonAussen.current && setLibrary(list.length > 0))
      .catch(() => setLibrary(false))
  }, [])

  if (library) {
    return <TestLibrary onNew={startNew} onOpened={() => setLibrary(false)} />
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
          <Stepper.Step label="Formen & Umfang" description="Lerngruppe, geprüfte Formen" />
          <Stepper.Step label="Bearbeiten & Export" description="Lösungen, Word, PDF" disabled={!hasTasks} />
        </Stepper>
        <Group gap="xs">
          <UndoRedoButtons canUndo={verlauf.past.length > 0} canRedo={verlauf.future.length > 0} onUndo={undo} onRedo={redo} />
          {savedAt && (
            <Tooltip label={`Zuletzt gespeichert um ${timeFormat.format(new Date(savedAt))}`}>
              <Text size="xs" c="dimmed" maw={180} truncate>
                Gespeichert: {docName}
              </Text>
            </Tooltip>
          )}
          <Button variant="subtle" leftSection={<IconFolder size={16} />} onClick={() => setLibrary(true)}>
            Meine Tests
          </Button>
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={startNew}>
            Neuer Test
          </Button>
        </Group>
      </Group>
      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        {step === 0 && <SetupStep />}
        {step === 1 && hasTasks && <TestEditorStep />}
      </ScrollArea>
    </Box>
  )
}
