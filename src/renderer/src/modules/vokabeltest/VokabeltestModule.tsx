import { AppKopf } from '../../shared/components/AppKopf'
import { Box, Stepper } from '@mantine/core'
import { cleanTestImages } from './library'
import { useEffect, useState } from 'react'
import { notifyError } from '../../shared/util'
import EditorStep from './steps/EditorStep'
import SettingsStep from './steps/SettingsStep'
import VocabStep from './steps/VocabStep'
import TestLibrary, { neuerTestMitSicherung } from './steps/TestLibrary'
import { hasContent, LISTE_PRAEFIX, newTestSafely, oeffneListeAlsTest, openSavedTest, useAutosave } from './library'
import { sichereAlles } from '../../shared/autosave'
import { useUndoKeys } from '../../shared/useUndoKeys'
import { parseProjectFile } from './project'
import { includedVocab } from './model/vocab'
import { useVokabeltest } from './store'
import { useDokumentOeffner, useNeuAnleger } from '../../shared/navigation'
import RueckwegKnopf from '../../shared/components/RueckwegKnopf'
import { useSperrenderAuftrag } from '../../shared/auftraege'
import AuftragsHinweis from '../../shared/components/AuftragsHinweis'
import { TestVorschau } from './render/TestVorschau'

export default function VokabeltestModule({ active }: { active: boolean }): React.JSX.Element {
  const { step, setStep, doc, vocab, settings, loadDocument, newTest, undo, redo, undoVocab, redoVocab, testId, listName, lastSavedAt } = useVokabeltest()
  const [libraryOpen, setLibraryOpen] = useState(false)
  // Läuft für diesen Test ein Auftrag, steht statt des Formulars ein Hinweis da (shared/auftraege.ts)
  const auftrag = useSperrenderAuftrag(testId)
  useAutosave()
  // Strg+Z / Strg+Y nur, solange dieses Programm vorn liegt (vorher hing es am Editor, auch im Hintergrund)
  // In Schritt 1 gilt die Taste der Vokabelliste (Zeile gelöscht, Liste geleert – Paket 7), danach dem Test
  useUndoKeys(active && !libraryOpen && !auftrag, step === 0 ? undoVocab : undo, step === 0 ? redoVocab : redo)

  // „Zuletzt bearbeitet" auf der Startseite (und später „Öffnen" nach einem Auftrag) öffnet hierüber
  const vonAussen = useDokumentOeffner('vokabeltest', async (id) => {
    // „Test aus dieser Liste“ (Vokabellisten) kommt mit Präfix – sonst ein gespeicherter Test
    if (id.startsWith(LISTE_PRAEFIX)) await oeffneListeAlsTest(id.slice(LISTE_PRAEFIX.length))
    else await openSavedTest(id)
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

  /*
   * „Neu in diesem Bereich" (Themenbereiche, Paket 10b): neues Dokument anlegen und seine
   * Kennung liefern – aus der eigenen Bibliothek und von der übergreifenden Seite aus.
   */
  const neuMitKennung = async (): Promise<string> => {
    setLibraryOpen(false)
    await neuerTestMitSicherung()
    return useVokabeltest.getState().testId
  }
  useNeuAnleger('vokabeltest', neuMitKennung)

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Gemeinsamer Kopf (Phase 6a); in der Bibliothek trägt deren Kopf Titel und Knöpfe */}
      <Box px="lg" pt="sm" pb={step === 2 ? 'xs' : 0} display={libraryOpen ? 'none' : undefined}>
        <AppKopf
          kompakt={step === 2}
          // Rückweg, z. B. „Zurück zur Reihe" nach „Test hier erstellen" (06.10.2026)
          zusaetze={<RueckwegKnopf modul="vokabeltest" />}
          // Zurück zur Übersicht – vorher ließ sich die Bibliothek nur in Schritt 1 öffnen
          meine={{ label: 'Meine Vokabeltests', onClick: () => setLibraryOpen(true), kennung: 'vokabeltest' }}
          // Von vorn beginnen; der bisherige Test wird vorher gesichert
          neu={{ label: 'Neuer Vokabeltest', onClick: () => void newTestSafely().catch(notifyError), kennung: 'vokabeltest' }}
          links={
            <Stepper active={step} onStepClick={setStep} size="sm" allowNextStepsSelect={false}>
              <Stepper.Step
                label="Vokabelliste"
                description={
                  vocab.some((v) => v.term.trim())
                    ? `${includedVocab(vocab).length} von ${vocab.filter((v) => v.term.trim()).length} werden abgefragt`
                    : 'eingeben oder importieren'
                }
              />
              <Stepper.Step label="Test einstellen" description="Niveau, Aufgaben, Varianten" allowStepSelect={includedVocab(vocab).length > 1} />
              <Stepper.Step label="Bearbeiten & Export" description="Word, PDF, Drucken" allowStepSelect={Boolean(doc && settings)} />
            </Stepper>
          }
        />
      </Box>
      <Box style={{ flex: 1, minHeight: 0 }}>
        {libraryOpen ? (
          <TestLibrary
            onClose={() => setLibraryOpen(false)}
            onNeuImBereich={neuMitKennung}
            // „Zurück zu …" nur, solange ein Test offen ist (Vokabeln, Test oder schon gesichert)
            zurueck={geladen ? listName.trim() || 'Unbenannter Vokabeltest' : null}
          />
        ) : auftrag ? (
          <AuftragsHinweis
            auftrag={auftrag}
            neuLabel="Neuer Vokabeltest"
            onNeu={() => newTestSafely().catch(notifyError)}
            // Live-Vorschau (02.10.2026): jede Aufgabe, sobald sie fertig ist
            vorschau={(z) => <TestVorschau z={z} />}
          />
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
