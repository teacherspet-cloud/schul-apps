import { Box, Button, Group, Stepper } from '@mantine/core'
import { IconFolder, IconPlus } from '@tabler/icons-react'
import { cleanTestImages } from './library'
import { useEffect, useState } from 'react'
import { notifyError } from '../../shared/util'
import EditorStep from './steps/EditorStep'
import SettingsStep from './steps/SettingsStep'
import VocabStep from './steps/VocabStep'
import { TestLibraryModal } from './steps/TestLibrary'
import { useAutosave } from './library'
import { parseProjectFile } from './project'
import { includedVocab } from './model/vocab'
import { useVokabeltest } from './store'

export default function VokabeltestModule(): React.JSX.Element {
  const { step, setStep, doc, vocab, settings, loadDocument, newTest } = useVokabeltest()
  const [libraryOpen, setLibraryOpen] = useState(false)
  useAutosave()

  // Beim Öffnen einer .vokabeltest-Datei per Doppelklick direkt laden
  useEffect(() => {
    window.api.files
      .launchFile()
      .then((file) => {
        if (!file) return
        newTest()
        loadDocument(parseProjectFile(file.data))
        void cleanTestImages()
      })
      .catch(notifyError)
  }, [loadDocument, newTest])

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Group px="lg" py="sm" className="app-toolbar">
        <Stepper active={step} onStepClick={setStep} size="sm" style={{ flex: 1 }} allowNextStepsSelect={false}>
          <Stepper.Step
            label="Vokabelliste"
            description={vocab.length ? `${includedVocab(vocab).length} von ${vocab.length} markiert` : 'eingeben oder importieren'}
          />
          <Stepper.Step label="Test einstellen" description="Niveau, Aufgaben, Varianten" allowStepSelect={includedVocab(vocab).length > 1} />
          <Stepper.Step label="Bearbeiten & Export" description="Word, PDF, Drucken" allowStepSelect={Boolean(doc && settings)} />
        </Stepper>
        {/*
          Zurueck zur Uebersicht. Diesen Weg gab es im Vokabeltest bisher GAR NICHT: Die
          Bibliothek liess sich nur in Schritt 1 oeffnen – aus einem fertigen Test kam man
          nicht mehr an die gespeicherten heran.
        */}
        <Button variant="subtle" leftSection={<IconFolder size={16} />} onClick={() => setLibraryOpen(true)}>
          Meine Vokabeltests
        </Button>
        {/* Nach dem letzten Schritt: ohne Umweg über die Bibliothek von vorn beginnen */}
        <Button variant="light" leftSection={<IconPlus size={16} />} onClick={newTest}>
          Neuer Vokabeltest
        </Button>
      </Group>
      <TestLibraryModal opened={libraryOpen} onClose={() => setLibraryOpen(false)} />
      <Box style={{ flex: 1, minHeight: 0 }}>
        {step === 0 && <VocabStep />}
        {step === 1 && <SettingsStep />}
        {step === 2 && doc && <EditorStep />}
      </Box>
    </Box>
  )
}
