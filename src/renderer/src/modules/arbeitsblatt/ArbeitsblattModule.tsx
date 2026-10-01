import { Box, Button, Group, SegmentedControl, Stepper } from '@mantine/core'
import { IconFolder, IconPlus } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { notifyError } from '../../shared/util'
import DesignManager from './design/DesignManager'
import { parseWorksheetFile, WORKSHEET_FILTER } from './project'
import EditorStep from './steps/EditorStep'
import OutlineStep from './steps/OutlineStep'
import TopicStep from './steps/TopicStep'
import WorksheetLibrary from './steps/WorksheetLibrary'
import {
  cleanWorksheetImages,
  defaultWorksheetName,
  newWorksheetSafely,
  openSavedWorksheet,
  useWorksheetAutosave,
  markiereLoesungsbausteineImOffenen
} from './library'
import { useArbeitsblatt } from './store'
import { sichereAlles } from '../../shared/autosave'
import { useAppSettings } from '../../shared/settingsStore'
import { useUndoKeys } from '../../shared/useUndoKeys'
import { useDokumentOeffner, useNeuAnleger } from '../../shared/navigation'
import { useRueckfrage, useSperrenderAuftrag } from '../../shared/auftraege'
import AuftragsHinweis from '../../shared/components/AuftragsHinweis'
import QuellenAuswahl from './steps/QuellenAuswahl'
import { QUELLENAUSWAHL, type QuellenFrage } from './auftraege'

export default function ArbeitsblattModule({ active }: { active: boolean }): React.JSX.Element {
  const { step, setStep, worksheet, loadWorksheet, undo, redo, docId, docName } = useArbeitsblatt()
  /*
   * Läuft für DIESES Blatt ein Auftrag (planen, ausformulieren), steht statt des Formulars ein
   * Hinweis da. Über „Neues Arbeitsblatt" geht es trotzdem weiter; das Ergebnis landet in
   * diesem Blatt und in der Bibliothek (shared/auftraege.ts).
   */
  const auftrag = useSperrenderAuftrag(docId)
  // Sek II: Der Auftrag wartet auf die Wahl der Quelle
  const quellenFrage = useRueckfrage(docId, QUELLENAUSWAHL)
  const [area, setArea] = useState<'create' | 'designs'>('create')
  // Beim Öffnen die Bibliothek zeigen, wenn schon Arbeitsblätter gespeichert sind
  const [library, setLibrary] = useState(false)
  const logo = useAppSettings((s) => s.logoDataUrl)
  const schoolName = useAppSettings((s) => s.settings.schoolName)
  // Gesichert wird ab Schritt 1 – deshalb hängt das Sichern hier und nicht erst am Editor
  useWorksheetAutosave(logo, schoolName)

  // „Zuletzt bearbeitet" auf der Startseite (und später „Öffnen" nach einem Auftrag) öffnet hierüber
  const vonAussen = useDokumentOeffner('arbeitsblatt', async (id) => {
    await openSavedWorksheet(id)
    setArea('create')
    setLibrary(false)
  })

  useEffect(() => {
    if (worksheet?.sheets.length) return
    window.api.sheets
      .list()
      .then((list) => !vonAussen.current && setLibrary(list.length > 0))
      .catch(() => setLibrary(false))
  }, [])

  const openFile = async (): Promise<void> => {
    try {
      const file = await window.api.files.open(WORKSHEET_FILTER)
      if (file) {
        await sichereAlles()
        loadWorksheet(parseWorksheetFile(file.data))
        setLibrary(false)
        markiereLoesungsbausteineImOffenen()
        void cleanWorksheetImages()
      }
    } catch (e) {
      notifyError(e)
    }
  }

  const showLibrary = area === 'create' && library
  // Strg+Z gilt in allen drei Schritten, aber nur, solange dieses Programm vorn liegt
  useUndoKeys(active && area === 'create' && !showLibrary && !auftrag, undo, redo)

  const startNew = (): void => {
    setLibrary(false)
    newWorksheetSafely().catch(notifyError)
  }
  /*
   * „Neu in diesem Bereich" (Themenbereiche, Paket 10b): neues Dokument anlegen und seine
   * Kennung liefern – aus der eigenen Bibliothek und von der übergreifenden Seite aus.
   */
  const neuMitKennung = async (): Promise<string> => {
    setArea('create')
    setLibrary(false)
    await newWorksheetSafely()
    return useArbeitsblatt.getState().docId
  }
  useNeuAnleger('arbeitsblatt', neuMitKennung)

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Group px="lg" py="sm" className="app-toolbar" wrap="nowrap">
        <SegmentedControl
          value={area}
          onChange={(v) => setArea(v as 'create' | 'designs')}
          data={[
            { value: 'create', label: 'Arbeitsblatt' },
            { value: 'designs', label: 'Designvorlagen' }
          ]}
        />
        {area === 'create' && !showLibrary && (
          <Stepper active={step} onStepClick={setStep} size="sm" style={{ flex: 1 }} allowNextStepsSelect={false}>
            <Stepper.Step label="Thema & Lerngruppe" description="Jahrgang, Schulform, Material" />
            <Stepper.Step label="Gliederung" description="Lernziele und Bausteine" allowStepSelect={Boolean(worksheet?.outline)} />
            <Stepper.Step label="Bearbeiten & Export" description="Word, PDF, Drucken" allowStepSelect={Boolean(worksheet?.sheets.length)} />
          </Stepper>
        )}
        {/*
          Zurueck zur Uebersicht – beschriftet und immer an derselben Stelle.
          Vorher gab es nur ein kleines Ordnersymbol in der Editorleiste; wer es nicht kannte,
          kam aus einem geoeffneten Blatt nicht mehr heraus.
        */}
        {area !== 'designs' && !showLibrary && (
          <Button variant="subtle" leftSection={<IconFolder size={16} />} onClick={() => setLibrary(true)}>
            Meine Arbeitsblätter
          </Button>
        )}
        {area !== 'designs' && !showLibrary && (
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={startNew}>
            Neues Arbeitsblatt
          </Button>
        )}
      </Group>
      <Box style={{ flex: 1, minHeight: 0 }}>
        {area === 'designs' ? (
          <DesignManager />
        ) : showLibrary ? (
          <WorksheetLibrary
            onNew={startNew}
            onNeuImBereich={neuMitKennung}
            onOpenFile={openFile}
            onOpened={() => setLibrary(false)}
            // „Zurück zu …" nur, solange ein Blatt offen ist
            zurueck={worksheet ? docName || defaultWorksheetName(worksheet) : null}
            onZurueck={() => setLibrary(false)}
          />
        ) : auftrag ? (
          <AuftragsHinweis auftrag={auftrag} neuLabel="Neues Arbeitsblatt" onNeu={startNew} />
        ) : (
          <>
            {step === 0 && <TopicStep />}
            {step === 1 && <OutlineStep />}
            {step === 2 && <EditorStep />}
          </>
        )}
      </Box>
      {/* Nur im vorderen Programm – ein Dialog aus einem Programm im Hintergrund käme ungefragt nach vorn */}
      {active && quellenFrage && (
        <QuellenAuswahl
          treffer={(quellenFrage.daten as QuellenFrage).treffer}
          thema={(quellenFrage.daten as QuellenFrage).thema}
          programm="arbeitsblatt"
          onWaehlen={(url) => quellenFrage.antworte(url)}
        />
      )}
    </Box>
  )
}
