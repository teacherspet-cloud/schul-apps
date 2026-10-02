/**
 * Gemeinsamer Rahmen der Testprogramme Grammatiktest, Lernzielkontrolle und Klassenarbeit
 * (Großprogramm 0.4, Aufräumen D1).
 *
 * Alle drei haben dieselbe Hülle: zwei Schritte (Einstellen, Bearbeiten & Export), die eigene
 * Bibliothek beim Öffnen, „Meine …" und „Neu …" in der Leiste, Rückgängig per Tastatur nur im
 * vorderen Programm, Datei öffnen, „Neu in diesem Bereich", Öffnen von außen (Startseite) und
 * den Hinweis, solange ein Hintergrund-Auftrag das Dokument sperrt. Bis dahin stand diese Hülle
 * dreimal fast gleich im Code.
 */
import { Box, Button, Group, ScrollArea, Stepper } from '@mantine/core'
import { IconFolder, IconPlus } from '@tabler/icons-react'
import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import type { StoreApi, UseBoundStore } from 'zustand'
import { useLiveAuftrag, useSperrenderAuftrag } from '../auftraege'
import { sichereAlles } from '../autosave'
import AuftragsHinweis from '../components/AuftragsHinweis'
import { useZwischenstaende, type Zwischenstand } from '../zwischenstand'
import UndoRedoButtons from '../components/UndoRedoButtons'
import { useDokumentOeffner, useNeuAnleger, useZielZeiger } from '../navigation'
import { useUndoKeys } from '../useUndoKeys'
import { notifyError } from '../util'
import type { Bibliothek } from './bibliothek'
import type { ProjektDatei } from './projekt'
import { EigenesFensterKnopf } from '../eigenesFenster'

export interface BibliotheksSeiteProps {
  onNew: () => void
  onNeuImBereich: () => Promise<string>
  onOpenFile: () => void
  onOpened: () => void
  zurueck: string | null
  onZurueck: () => void
}

interface Zustand<D> {
  step: number
  setStep: (s: number) => void
  docId: string
  docName: string
  undo: () => void
  redo: () => void
  verlauf: { past: unknown[]; future: unknown[] }
  loadFromFile: (d: D) => void
}

export interface ZweiSchrittModulProps<D, S extends Zustand<D>> {
  active: boolean
  /** Kennung des Programms (navigation.ts, Themenbereiche) */
  modulId: string
  /** Der Store als Hook (für die Anzeige) und mit `getState` (für Rückfragen außerhalb des Renderns) */
  useStore: UseBoundStore<StoreApi<S>>
  // Der Store bestimmt den Typ, nicht die Zugriffsfunktion
  dokument: (s: NoInfer<S>) => D | null
  /** Gibt es Aufgaben? Sonst ist Schritt 2 gesperrt und die Bibliothek erscheint beim Öffnen */
  hatInhalt: (d: D | null) => boolean
  bibliothek: Bibliothek<D>
  projekt: ProjektDatei<D>
  standardName: (d: D) => string
  /** Liste der gespeicherten Dokumente – nur ob es welche gibt, zählt */
  liste: () => Promise<unknown[]>
  BibliotheksSeite: ComponentType<BibliotheksSeiteProps>
  /** Live-Vorschau eines laufenden Auftrags (02.10.2026, siehe AuftragsHinweis) */
  vorschau?: (z: Zwischenstand) => ReactNode
  schritte: [{ label: string; description: string }, { label: string; description: string }]
  einstellen: ReactNode
  bearbeiten: (d: D) => ReactNode
  texte: { meine: string; neu: string }
  /** Weiteres über dem Programm, nur solange es vorn liegt (Dialoge eines Auftrags) */
  zusatz?: ReactNode
}

export default function ZweiSchrittModul<D, S extends Zustand<D>>(p: ZweiSchrittModulProps<D, S>): React.JSX.Element {
  const state = p.useStore()
  const { step, setStep, docId, docName, undo, redo, verlauf } = state
  const dok = p.dokument(state)
  const hatAufgaben = p.hatInhalt(dok)
  const [library, setLibrary] = useState(false)
  // Läuft für dieses Dokument ein Auftrag, steht statt des Formulars ein Hinweis da (shared/auftraege.ts)
  const auftrag = useSperrenderAuftrag(docId)
  /*
   * Nicht sperrende Aufträge (Tafelbild, Rückmeldungen): Mit Zwischenstand steht die Live-Vorschau
   * vorn – das Formular bleibt dahinter offen und kommt mit „Ausblenden" zurück (02.10.2026).
   */
  const live = useLiveAuftrag(p.vorschau ? docId : null)
  const [ausgeblendet, setAusgeblendet] = useState<string | null>(null)
  const zeigeLive = !auftrag && live && ausgeblendet !== live.id ? live : undefined
  p.bibliothek.useAutosave()
  // Strg+Z / Strg+Y nur, solange dieses Programm vorn liegt – in beiden Schritten
  useUndoKeys(p.active && !library && !auftrag, undo, redo)

  const startNew = (): void => {
    setLibrary(false)
    p.bibliothek.neuSicher().catch(notifyError)
  }
  // Datei des Programms öffnen (27.09.2026) – wie „Datei öffnen …" beim Arbeitsblatt
  const openFile = async (): Promise<void> => {
    try {
      const file = await window.api.files.open(p.projekt.filter)
      if (file) {
        await sichereAlles()
        p.useStore.getState().loadFromFile(p.projekt.lies(file.data))
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
    await p.bibliothek.neuSicher()
    return p.useStore.getState().docId
  }
  useNeuAnleger(p.modulId, neuMitKennung)

  // „Zuletzt bearbeitet" auf der Startseite (und später „Öffnen" nach einem Auftrag) öffnet hierüber
  const vonAussen = useDokumentOeffner(p.modulId, async (id) => {
    await p.bibliothek.oeffnen(id)
    setLibrary(false)
  })
  // Aus der Auftragsleiste (navigation.ts: geheZuDokument): das Dokument zeigen, bei einem Baustein im zweiten Schritt
  useZielZeiger(p.modulId, (ziel) => {
    setLibrary(false)
    const s = p.useStore.getState()
    if (ziel.baustein && p.hatInhalt(p.dokument(s))) s.setStep(1)
  })

  useEffect(() => {
    if (p.hatInhalt(p.dokument(p.useStore.getState()))) return
    p.liste()
      .then((list) => !vonAussen.current && setLibrary(list.length > 0))
      .catch(() => setLibrary(false))
  }, [])

  if (library) {
    const { BibliotheksSeite } = p
    // „Zurück zu …" nur, solange ein Dokument offen ist – sonst gibt es nichts, wohin es zurückginge
    return (
      <BibliotheksSeite
        onNew={startNew}
        onNeuImBereich={neuMitKennung}
        onOpenFile={() => void openFile()}
        onOpened={() => setLibrary(false)}
        zurueck={dok ? docName || p.standardName(dok) : null}
        onZurueck={() => setLibrary(false)}
      />
    )
  }

  return (
    <Box h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      {/*
        `app-toolbar`: gleiche Leiste wie in den übrigen Programmen, samt Anpassung für schmale
        Bildschirme (auf dem Tablet sonst mehrere Zeilen hoch).
      */}
      <Group px="lg" py="sm" align="flex-start" className="app-toolbar">
        <Stepper active={step} onStepClick={setStep} size="sm" style={{ flex: 1 }} allowNextStepsSelect={false}>
          <Stepper.Step label={p.schritte[0].label} description={p.schritte[0].description} />
          <Stepper.Step label={p.schritte[1].label} description={p.schritte[1].description} disabled={!hatAufgaben} />
        </Stepper>
        <Group gap="xs">
          {/* Ab Schritt 2 stehen Rückgängig, Name und Sicherung in der Editor-Leiste (27.09.2026, wie beim Arbeitsblatt) */}
          {step !== 1 && <UndoRedoButtons canUndo={verlauf.past.length > 0} canRedo={verlauf.future.length > 0} onUndo={undo} onRedo={redo} />}
          <Button variant="subtle" leftSection={<IconFolder size={16} />} onClick={() => setLibrary(true)}>
            {p.texte.meine}
          </Button>
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={startNew}>
            {p.texte.neu}
          </Button>
        </Group>
        <EigenesFensterKnopf />
      </Group>
      {/*
        Schritt 1 scrollt selbst: Sein Hauptknopf steht in einer festen Fußleiste unter dem
        scrollenden Formular (shared/components/Formularfuss.tsx, Paket 6).
      */}
      <Box style={{ flex: 1, minHeight: 0 }}>
        {auftrag ? (
          <AuftragsHinweisMitVorschau auftrag={auftrag} neuLabel={p.texte.neu} onNeu={startNew} vorschau={p.vorschau} />
        ) : zeigeLive ? (
          <AuftragsHinweis auftrag={zeigeLive} vorschau={p.vorschau} onAusblenden={() => setAusgeblendet(zeigeLive.id)} />
        ) : step === 0 ? (
          p.einstellen
        ) : (
          step === 1 && hatAufgaben && dok && p.bearbeiten(dok)
        )}
      </Box>
      {/* Nur im vorderen Programm – ein Dialog aus einem Programm im Hintergrund käme ungefragt nach vorn */}
      {p.active && p.zusatz}
    </Box>
  )
}

/** Mit Zwischenstand füllt die Vorschau die Fläche und rollt selbst; ohne steht die Karte wie bisher */
function AuftragsHinweisMitVorschau(props: React.ComponentProps<typeof AuftragsHinweis>): React.JSX.Element {
  const mitStand = useZwischenstaende((s) => Boolean(props.vorschau && s.staende[props.auftrag.id]))
  if (mitStand) return <AuftragsHinweis {...props} />
  return (
    <ScrollArea h="100%">
      <AuftragsHinweis {...props} />
    </ScrollArea>
  )
}
