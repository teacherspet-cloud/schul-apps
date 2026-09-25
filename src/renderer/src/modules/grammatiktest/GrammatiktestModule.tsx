import { Box, Button, Group, ScrollArea, Stepper, Text, Tooltip } from '@mantine/core'
import { IconFolder, IconPlus } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { useTestAutosave } from './library'
import SetupStep from './steps/SetupStep'
import TestEditorStep from './steps/TestEditorStep'
import TestLibrary from './steps/TestLibrary'
import { useGrammatiktest } from './store'

const timeFormat = new Intl.DateTimeFormat('de-DE', { timeStyle: 'short' })

/**
 * Programm „Grammatiktest".
 *
 * Zwei Schritte: Formen und Umfang wählen, dann den erzeugten Test bearbeiten und ausgeben.
 * Beim Öffnen erscheinen die gespeicherten Tests, sofern es welche gibt – wie in den anderen
 * Programmen. Gespeichert wird von selbst, sobald Aufgaben da sind.
 */
export default function GrammatiktestModule(): React.JSX.Element {
  const { step, setStep, test, reset, savedAt, docName } = useGrammatiktest()
  const [library, setLibrary] = useState(false)
  const hasTasks = Boolean(test?.blocks.length)
  useTestAutosave()

  useEffect(() => {
    if (useGrammatiktest.getState().test?.blocks.length) return
    window.api.grammarTests
      .list()
      .then((list) => setLibrary(list.length > 0))
      .catch(() => setLibrary(false))
  }, [])

  if (library) {
    return (
      <TestLibrary
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
          <Stepper.Step label="Formen & Umfang" description="Lerngruppe, geprüfte Formen" />
          <Stepper.Step label="Bearbeiten & Export" description="Lösungen, Word, PDF" disabled={!hasTasks} />
        </Stepper>
        <Group gap="xs">
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
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={reset}>
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
