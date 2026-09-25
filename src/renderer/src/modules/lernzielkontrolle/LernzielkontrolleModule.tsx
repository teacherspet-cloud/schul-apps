import { Box, Button, Group, ScrollArea, Stepper, Text, Tooltip } from '@mantine/core'
import { IconFolder, IconPlus } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { hatInhalt, newKurztestSafely, useKurztestAutosave } from './library'
import { notifyError } from '../../shared/util'
import UndoRedoButtons from '../../shared/components/UndoRedoButtons'
import { useUndoKeys } from '../../shared/useUndoKeys'
import EditorStep from './steps/EditorStep'
import KurztestLibrary from './steps/KurztestLibrary'
import SetupStep from './steps/SetupStep'
import { useLernzielkontrolle } from './store'

const timeFormat = new Intl.DateTimeFormat('de-DE', { timeStyle: 'short' })

/**
 * Programm „Lernzielkontrolle".
 *
 * Zwei Schritte: Lerngruppe und Landesformat wählen, dann die erzeugte Kontrolle ansehen,
 * bearbeiten und ausgeben. Beim Öffnen erscheinen die gespeicherten Kontrollen, sofern es
 * welche gibt – wie in den anderen Programmen. Gespeichert wird von selbst, sobald Aufgaben
 * da sind.
 *
 * Warum es ein eigenes Programm ist und keine Einstellung der Klassenarbeit: Das Format hat
 * eine eigene Rechtsgrundlage je Bundesland (Bezeichnung, Höchstdauer, Ankündigungspflicht,
 * Stoffgrenze), eine engere Operatorenauswahl und eine andere Bauregel – auf das Blatt
 * gehören nur Aufgaben und Material, keine Lernhilfen. Als Schalter in der Klassenarbeit
 * wäre das alles unsichtbar gewesen.
 */
export default function LernzielkontrolleModule({ active }: { active: boolean }): React.JSX.Element {
  const { step, setStep, test, savedAt, docName, undo, redo, verlauf } = useLernzielkontrolle()
  const [library, setLibrary] = useState(false)
  const hatAufgaben = hatInhalt(test)
  useKurztestAutosave()
  // Strg+Z / Strg+Y nur, solange dieses Programm vorn liegt – in beiden Schritten
  useUndoKeys(active && !library, undo, redo)
  const startNew = (): void => {
    setLibrary(false)
    newKurztestSafely().catch(notifyError)
  }

  useEffect(() => {
    if (hatInhalt(useLernzielkontrolle.getState().test)) return
    window.api.kurztests
      .list()
      .then((list) => setLibrary(list.length > 0))
      .catch(() => setLibrary(false))
  }, [])

  if (library) {
    return <KurztestLibrary onNew={startNew} onOpened={() => setLibrary(false)} />
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
          <Stepper.Step label="Lerngruppe & Format" description="Bundesland, Zeit, Stoff" />
          <Stepper.Step label="Bearbeiten & Export" description="Prüfung, Word, PDF" disabled={!hatAufgaben} />
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
            Meine Kontrollen
          </Button>
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={startNew}>
            Neue Kontrolle
          </Button>
        </Group>
      </Group>
      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        {step === 0 && <SetupStep />}
        {step === 1 && hatAufgaben && <EditorStep />}
      </ScrollArea>
    </Box>
  )
}
