import { Container, Stack, Box, ScrollArea } from '@mantine/core'
import { fragenAusBlatt } from '../../../shared/export/lms/fragen'
import LmsExport from '../../../shared/export/lms/LmsExport'
import RueckmeldungKnopf from '../../rueckmeldung/RueckmeldungKnopf'
import { useEffect, useMemo, useRef, useState } from 'react'
import FitToWidth from '../../../shared/render/FitToWidth'
import { useAppSettings } from '../../../shared/settingsStore'
import { druckAusgabe, speichereBlatt, type BlattQuelle } from '../../arbeitsblatt/export/blattAusgabe'
import PrintPreview from '../../../shared/components/PrintPreview'
import AnredeHinweise, { anredeBefunde } from '../../../shared/components/AnredeHinweise'
import { AusgabeDialog, type AusgabeModus } from '../../../shared/components/LoesungsWahl'
import { contextFor, pageInfoFor, SheetPages, useSheetLayouts } from '../../arbeitsblatt/render/SheetPages'
import { BausteinRahmen } from '../../arbeitsblatt/render/BausteinRahmen'
import type { PlacedItem } from '../../arbeitsblatt/render/paginate'
import type { WsBlock } from '../../arbeitsblatt/model/types'
import { testToWorksheet } from '../render/testWorksheet'
import { testPoints, testTaskCount } from '../model/types'
import { useGrammatiktest } from '../store'
import { GRAMMATIKTEST_FILTER, serializeGrammarTest } from '../project'
import { defaultTestName } from '../library'
import EditorLeiste from '../../../shared/components/EditorLeiste'
import BlattoptionenFelder from '../../../shared/components/BlattoptionenFelder'
import CanaryDialog from '../../../shared/components/CanaryDialog'
import { canaryWordFor } from '../../../shared/aiCanary'
import { notifyError, notifySuccess } from '../../../shared/util'
import type { DesignTemplate } from '@shared/design'
import { useDruck } from '../../../shared/navigation'
import { useThemenbereich } from '../../../shared/themenbereiche'
import { mitThemenbereich } from '../../../shared/ueberthema'
import { useLaufendeSchluessel } from '../../../shared/auftraege'
import { testHinweiseBeheben } from '../beheben'

/**
 * Schritt 2: Test ansehen, bearbeiten und ausgeben.
 *
 * Bearbeitet wird unmittelbar auf der Seite – dieselbe Darstellung wie im Arbeitsblatt. Der
 * Lösungsteil trägt den Notenschlüssel und das Fehlerprofil; beides erscheint nur dort.
 */
export default function TestEditorStep(): React.JSX.Element {
  const { test, setStep, update, undo, redo, verlauf, docName, savedAt, setDocName } = useGrammatiktest()
  // Blattoptionen, KI-Test-Dialog – die Leiste ist dieselbe wie beim Arbeitsblatt (27.09.2026)
  const [designs, setDesigns] = useState<DesignTemplate[]>([])
  useEffect(() => {
    window.api.designs.list().then(setDesigns).catch(notifyError)
  }, [])
  const [canaryOffen, setCanaryOffen] = useState(false)
  const settings = useAppSettings((s) => s.settings)
  const logo = useAppSettings((s) => s.logoDataUrl)
  const [view, setView] = useState<'student' | 'key'>('student')
  /*
   * Word, PDF und Drucken fragen jetzt nach den Lösungen (ohne / anhängen / eigene Datei) –
   * vorher wurden sie stillschweigend angehängt, sobald sie eingeschaltet waren. Gedruckt wird
   * über die Druckvorschau wie im Arbeitsblatt statt direkt über den Dialog von Windows.
   */
  const [ausgabe, setAusgabe] = useState<AusgabeModus | null>(null)
  const [druck, setDruck] = useState<ReturnType<typeof druckAusgabe> | null>(null)

  /*
   * Das Blatt NUR neu bauen, wenn sich der Test ändert.
   *
   * Ohne useMemo entstand bei jedem Rendern ein neues Objekt. `useSheetLayouts` misst daran
   * die Seitenhöhen, setzt den gemessenen Zustand – und löste damit das nächste Rendern aus.
   * Die Folge war eine Endlosschleife („Maximum update depth exceeded"): Der Test wurde
   * fertig erzeugt, aber der Editor kam nie zum Vorschein, und es erschien auch keine
   * Fehlermeldung. Die Klassenarbeit macht es seit jeher so.
   */
  // Überthema (Paket 11): der Themenbereich des Tests steht dezent im Kopf – nur zum Anzeigen eingesetzt
  const bereich = useThemenbereich(
    'grammatiktest',
    useGrammatiktest((s) => s.docId)
  )?.name
  const ws = useMemo(() => (test ? mitThemenbereich(testToWorksheet(test), bereich) : null), [test, bereich])
  const { layouts, measure } = useSheetLayouts(ws, logo, settings.schoolName)
  // Anrede der Lernenden am angezeigten Test prüfen – auch nach Änderungen von Hand (Paket 8b)
  const anrede = useMemo(() => (ws ? anredeBefunde(ws.meta, ws.sheets) : []), [ws])
  const docId = useGrammatiktest((s) => s.docId)
  const laufend = useLaufendeSchluessel(docId)
  // Strg+P druckt wie der Knopf „Drucken"; vor dem frühen return, weil es ein Hook ist
  const drucken = useRef<() => void>(() => undefined)
  useDruck('grammatiktest', test && ws ? () => drucken.current() : null)
  drucken.current = () => setAusgabe('print')
  if (!test || !ws) return <Container py="xl">Kein Test geladen.</Container>

  const sheet = ws.sheets[0]
  const key = view === 'key'
  const points = testPoints(test)

  const quelle: BlattQuelle = {
    ws,
    layouts,
    sheetIds: [sheet.id],
    name: ws.meta.title || 'Grammatiktest',
    logo,
    schoolName: settings.schoolName,
    begriff: 'Lösungen'
  }

  /*
   * Bausteine von Hand ordnen und frei platzieren – derselbe Rahmen wie im Arbeitsblatt.
   * Bis 24.09.2026 ließ sich hier nur der Text bearbeiten, nichts verschieben.
   */
  const wrapBlock = (block: WsBlock, placed: PlacedItem, content: React.ReactNode): React.ReactNode => (
    <BausteinRahmen
      block={block}
      placed={placed}
      onUpdate={(fn, gruppe) =>
        update((d) => {
          const b = d.blocks.find((x) => x.id === block.id)
          if (b) fn(b)
        }, gruppe)
      }
      onMove={(richtung) =>
        update((d) => {
          const i = d.blocks.findIndex((x) => x.id === block.id)
          const j = i + richtung
          if (i < 0 || j < 0 || j >= d.blocks.length) return
          ;[d.blocks[i], d.blocks[j]] = [d.blocks[j], d.blocks[i]]
        })
      }
    >
      {content}
    </BausteinRahmen>
  )

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <EditorLeiste
        zurueck={{ label: 'Einstellungen', onClick: () => setStep(0) }}
        undo={{ canUndo: verlauf.past.length > 0, canRedo: verlauf.future.length > 0, onUndo: undo, onRedo: redo }}
        fassungen={null}
        ansichten={{
          value: view,
          onChange: (v) => setView(v as 'student' | 'key'),
          data: [
            { value: 'student', label: 'Test' },
            { value: 'key', label: 'Lösungen' }
          ]
        }}
        optionen={
          <BlattoptionenFelder
            designs={designs}
            designId={test.design.id}
            onDesign={(d) => update((x) => (x.design = structuredClone(d)))}
            kiVermerk={{ wert: test.meta.kiVermerk, ki: test.meta.ki, onChange: (v) => update((d) => (d.meta.kiVermerk = v)) }}
            schulangaben={{ checked: test.meta.showSchool !== false, onChange: (an) => update((d) => (d.meta.showSchool = an)) }}
            korrekturrand={{ checked: Boolean(test.meta.correctionMargin), onChange: (an) => update((d) => (d.meta.correctionMargin = an)) }}
            notizrand={{ checked: Boolean(test.meta.notesMargin), onChange: (an) => update((d) => (d.meta.notesMargin = an)) }}
            blocksatz={{ checked: test.design.page.justifyText !== false, onChange: (an) => update((d) => (d.design.page.justifyText = an)) }}
            fach={test.meta.subjectId}
            vorlagenfarbe={{ checked: Boolean(test.meta.vorlagenfarbe), onChange: (an) => update((d) => (d.meta.vorlagenfarbe = an)) }}
            ueberthema={{ werte: test.meta, bereich: bereich ?? '', onChange: (patch) => update((d) => Object.assign(d.meta, patch), 'ueberthema') }}
            kiTest={{
              an: Boolean(test.meta.aiCanary),
              woerter: test.meta.aiCanaryWords,
              vorschlagFuer: `${test.meta.title}|${test.meta.topics.join(', ')}`,
              onEin: () => setCanaryOffen(true),
              onAus: () => update((d) => (d.meta.aiCanary = false))
            }}
          />
        }
        info={`${testTaskCount(test)} Aufgaben · ${points} Punkte`}
        name={{ value: docName, placeholder: defaultTestName(test), onChange: setDocName }}
        gesichertAm={savedAt}
        dateiSpeichern={{
          tooltip: 'Als Datei speichern … (.grammatiktest, z. B. zum Weitergeben)',
          onClick: async () => {
            try {
              const path = await window.api.files.save(`${quelle.name}.grammatiktest`, GRAMMATIKTEST_FILTER, serializeGrammarTest(test))
              if (path) notifySuccess('Datei gespeichert.')
            } catch (e) {
              notifyError(e)
            }
          }
        }}
        ausgabe={{ onWord: () => setAusgabe('docx'), onPdf: () => setAusgabe('pdf'), onDrucken: () => setAusgabe('print') }}
        extras={
          <>
            <RueckmeldungKnopf art="grammatiktest" docId={docId} />
            <LmsExport titel={test.meta.title || 'Grammatiktest'} bericht={() => fragenAusBlatt(testToWorksheet(test))} />
          </>
        }
      />
      <CanaryDialog
        offen={canaryOffen}
        vorschlag={canaryWordFor(`${test.meta.title}|${test.meta.topics.join(', ')}`)}
        wert={test.meta.aiCanaryWords ?? ''}
        onAbbruch={() => setCanaryOffen(false)}
        onFertig={(woerter) => {
          update((d) => {
            d.meta.aiCanary = true
            d.meta.aiCanaryWords = woerter
          })
          setCanaryOffen(false)
        }}
      />
      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        <Container size="xl" py="md">
          <Stack>
            {!key && (
              <AnredeHinweise
                befunde={anrede}
                // Paket 12: „Mit KI beheben" – ein kleiner Auftrag, Ergebnis als ein Rückgängig-Schritt
                onBeheben={(liste) => testHinweiseBeheben(test, docId, liste)}
                laeuft={laufend.has('beheben')}
              />
            )}
            <FitToWidth className="ws-editor-pages">
              <SheetPages
                ws={ws}
                sheet={sheet}
                plans={layouts.get(`${sheet.id}:${key ? 'key' : 'print'}`) ?? []}
                info={pageInfoFor(ws, sheet, logo, settings.schoolName, key, settings.citationStyle)}
                context={contextFor(ws, sheet, key ? 'keyEdit' : 'edit', {
                  update: (blockId, fn) =>
                    update((d) => {
                      const block = d.blocks.find((b) => b.id === blockId)
                      if (block) fn(block)
                    })
                })}
                wrapBlock={wrapBlock}
              />
            </FitToWidth>
          </Stack>
          {measure}
          <AusgabeDialog
            modus={ausgabe}
            onClose={() => setAusgabe(null)}
            modul="grammatiktest"
            hatLoesungen={test.meta.answerKey}
            onAusgabe={async (modus, loesung) => {
              if (modus === 'print') setDruck(druckAusgabe(quelle, loesung))
              else await speichereBlatt(quelle, modus, loesung)
            }}
          />
          <PrintPreview
            html={druck?.html ?? null}
            loesung={druck?.loesung}
            title={`Drucken – ${ws.meta.title || 'Grammatiktest'}`}
            onClose={() => setDruck(null)}
          />
        </Container>
      </ScrollArea>
    </Box>
  )
}
