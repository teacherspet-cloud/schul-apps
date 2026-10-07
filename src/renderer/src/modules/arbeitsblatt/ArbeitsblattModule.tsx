import { AppKopf } from '../../shared/components/AppKopf'
import { Box, Group, SegmentedControl, Stepper } from '@mantine/core'
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
import { useAppSettings, useExperte } from '../../shared/settingsStore'
import { useUndoKeys } from '../../shared/useUndoKeys'
import { useDokumentOeffner, useNeuAnleger, useZielZeiger } from '../../shared/navigation'
import { useRueckfrage, useSperrenderAuftrag } from '../../shared/auftraege'
import AuftragsHinweis from '../../shared/components/AuftragsHinweis'
import { MaterialVorschau, ZwischenstandsBlatt } from './render/BlattVorschau'
import type { OriginalMaterialAblage, Worksheet } from './model/types'
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
  /*
   * Standardmodus (07.10.2026): zwei Schritte – „Arbeitsblatt erstellen" überspringt die Gliederung. Wer sie doch
   * plant („Erst Gliederung planen"), sieht wieder alle drei.
   */
  const experte = useExperte()
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
  // Aus der Auftragsleiste (navigation.ts: geheZuDokument): das Blatt zeigen, bei einem Baustein im Editor
  useZielZeiger('arbeitsblatt', (ziel) => {
    setArea('create')
    setLibrary(false)
    if (ziel.baustein && useArbeitsblatt.getState().worksheet?.sheets.length) setStep(2)
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
      {/*
        Gemeinsamer Kopf (Phase 6a). Reiter „Arbeitsblatt / Designvorlagen" und die Schritte darunter links;
        „Meine Arbeitsblätter" (zurück zur Übersicht, immer an derselben Stelle) und „Neues Arbeitsblatt" rechts.
        In der Bibliothek trägt deren Kopf Titel und Knöpfe – hier dann nur die Reiter.
      */}
      {(() => {
        const reiter = (
          <SegmentedControl
            value={area}
            onChange={(v) => setArea(v as 'create' | 'designs')}
            data={[
              { value: 'create', label: 'Arbeitsblatt' },
              { value: 'designs', label: 'Designvorlagen' }
            ]}
          />
        )
        if (area === 'create' && showLibrary)
          return (
            <Box px="lg" pt="sm">
              {reiter}
            </Box>
          )
        return (
          <Box px="lg" pt="sm" pb={area === 'create' && step === 2 ? 'xs' : 0}>
            <AppKopf
              kompakt={area === 'create' && step === 2}
              meine={area === 'create' ? { label: 'Meine Arbeitsblätter', onClick: () => setLibrary(true), kennung: 'arbeitsblatt' } : undefined}
              neu={area === 'create' ? { label: 'Neues Arbeitsblatt', onClick: startNew, kennung: 'arbeitsblatt' } : undefined}
              links={
                <Group gap="lg" wrap="nowrap" align="center">
                  {reiter}
                  {area === 'create' && !experte && step !== 1 && (
                    <Stepper
                      active={step === 2 ? 1 : 0}
                      onStepClick={(i) => setStep(i === 1 ? 2 : 0)}
                      size="sm"
                      style={{ flex: 1 }}
                      allowNextStepsSelect={false}
                    >
                      <Stepper.Step label="Thema & Lerngruppe" description="Jahrgang, Schulform, Material" />
                      <Stepper.Step label="Bearbeiten & Export" description="Word, PDF, Drucken" allowStepSelect={Boolean(worksheet?.sheets.length)} />
                    </Stepper>
                  )}
                  {area === 'create' && (experte || step === 1) && (
                    <Stepper active={step} onStepClick={setStep} size="sm" style={{ flex: 1 }} allowNextStepsSelect={false}>
                      <Stepper.Step label="Thema & Lerngruppe" description="Jahrgang, Schulform, Material" />
                      <Stepper.Step label="Gliederung" description="Lernziele und Bausteine" allowStepSelect={Boolean(worksheet?.outline)} />
                      <Stepper.Step label="Bearbeiten & Export" description="Word, PDF, Drucken" allowStepSelect={Boolean(worksheet?.sheets.length)} />
                    </Stepper>
                  )}
                </Group>
              }
            />
          </Box>
        )
      })()}
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
          <AuftragsHinweis
            auftrag={auftrag}
            neuLabel="Neues Arbeitsblatt"
            onNeu={startNew}
            // Live-Vorschau (02.10.2026): beim Planen das gefundene Material, beim Ausformulieren das Blatt
            vorschau={(z) => {
              const stand = z.stand as { sheets?: unknown; material?: OriginalMaterialAblage }
              if (stand.sheets) return <ZwischenstandsBlatt<Worksheet> z={z} alsBlatt={(ws) => ws} />
              return stand.material ? <MaterialVorschau material={stand.material} /> : null
            }}
          />
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
