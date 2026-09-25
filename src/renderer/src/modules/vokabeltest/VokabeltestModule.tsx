import { Box, Button, Group, Stepper } from '@mantine/core'
import { IconFolder, IconPlus } from '@tabler/icons-react'
import { cleanTestImages } from './library'
import { useEffect, useState } from 'react'
import { notifyError } from '../../shared/util'
import EditorStep from './steps/EditorStep'
import SettingsStep from './steps/SettingsStep'
import VocabStep from './steps/VocabStep'
import TestLibrary from './steps/TestLibrary'
import { hasContent, newTestSafely, openSavedTest, useAutosave } from './library'
import { sichereAlles } from '../../shared/autosave'
import { useUndoKeys } from '../../shared/useUndoKeys'
import { parseProjectFile } from './project'
import { includedVocab } from './model/vocab'
import { useVokabeltest } from './store'
import { useDokumentOeffner } from '../../shared/navigation'
import { useSperrenderAuftrag } from '../../shared/auftraege'
import AuftragsHinweis from '../../shared/components/AuftragsHinweis'

export default function VokabeltestModule({ active }: { active: boolean }): React.JSX.Element {
  const { step, setStep, doc, vocab, settings, loadDocument, newTest, undo, redo, testId, listName, lastSavedAt } = useVokabeltest()
  const [libraryOpen, setLibraryOpen] = useState(false)
  // Läuft für diesen Test ein Auftrag, steht statt des Formulars ein Hinweis da (shared/auftraege.ts)
  const auftrag = useSperrenderAuftrag(testId)
  useAutosave()
  // Strg+Z / Strg+Y nur, solange dieses Programm vorn liegt (vorher hing es am Editor, auch im Hintergrund)
  useUndoKeys(active && !libraryOpen && !auftrag, undo, redo)

  // „Zuletzt bearbeitet" auf der Startseite (und später „Öffnen" nach einem Auftrag) öffnet hierüber
  const vonAussen = useDokumentOeffner('vokabeltest', async (id) => {
    await openSavedTest(id)
    setLibraryOpen(false)
  })

  /*
   * Beim Start die Bibliothek zeigen, wenn es gespeicherte Tests gibt und noch nichts offen ist –
   * wie in den anderen Programmen. Sie ersetzt die frühere Liste „Gespeicherten Vokabeltest
   * weiterbearbeiten" in Schritt 1 (neueste zuerst).
   */
  useEffect(() => {
    if (hasContent()) return
    window.api.tests
      .list()
      .then((list) => !vonAussen.current && !hasContent() && setLibraryOpen(list.length > 0))
      .catch(() => setLibraryOpen(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Beim Öffnen einer .vokabeltest-Datei per Doppelklick direkt laden
  useEffect(() => {
    window.api.files
      .launchFile()
      .then(async (file) => {
        if (!file) return
        await sichereAlles()
        newTest()
        loadDocument(parseProjectFile(file.data))
        setLibraryOpen(false)
        void cleanTestImages()
      })
      .catch(notifyError)
  }, [loadDocument, newTest])

  const geladen = Boolean(doc || lastSavedAt || vocab.some((v) => v.term.trim()))

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Group px="lg" py="sm" className="app-toolbar" display={libraryOpen ? 'none' : undefined}>
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
        {/*
          Nach dem letzten Schritt: ohne Umweg über die Bibliothek von vorn beginnen. Der
          bisherige Test wird vorher gesichert – vorher ging hier ungespeicherte Arbeit verloren,
          anders als beim gleichnamigen Knopf in der Bibliothek.
        */}
        <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => newTestSafely().catch(notifyError)}>
          Neuer Vokabeltest
        </Button>
      </Group>
      <Box style={{ flex: 1, minHeight: 0 }}>
        {libraryOpen ? (
          <TestLibrary
            onClose={() => setLibraryOpen(false)}
            // „Zurück zu …" nur, solange ein Test offen ist (Vokabeln, Test oder schon gesichert)
            zurueck={geladen ? listName.trim() || 'Unbenannter Vokabeltest' : null}
          />
        ) : auftrag ? (
          <AuftragsHinweis auftrag={auftrag} neuLabel="Neuer Vokabeltest" onNeu={() => newTestSafely().catch(notifyError)} />
        ) : (
          <>
            {step === 0 && <VocabStep />}
            {step === 1 && <SettingsStep />}
            {step === 2 && doc && <EditorStep />}
          </>
        )}
      </Box>
    </Box>
  )
}
