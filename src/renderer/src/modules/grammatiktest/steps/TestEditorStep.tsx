import { ActionIcon, Button, Container, Group, SegmentedControl, Stack, Text, Tooltip } from '@mantine/core'
import { IconArrowLeft, IconDownload, IconFileTypeDocx, IconPrinter } from '@tabler/icons-react'
import { useMemo, useRef, useState } from 'react'
import FitToWidth from '../../../shared/render/FitToWidth'
import { useAppSettings } from '../../../shared/settingsStore'
import { druckAusgabe, speichereBlatt, type BlattQuelle } from '../../arbeitsblatt/export/blattAusgabe'
import PrintPreview from '../../../shared/components/PrintPreview'
import { AusgabeDialog, type AusgabeModus } from '../../../shared/components/LoesungsWahl'
import { contextFor, pageInfoFor, SheetPages, useSheetLayouts } from '../../arbeitsblatt/render/SheetPages'
import { BausteinRahmen } from '../../arbeitsblatt/render/BausteinRahmen'
import type { PlacedItem } from '../../arbeitsblatt/render/paginate'
import type { WsBlock } from '../../arbeitsblatt/model/types'
import { testToWorksheet } from '../render/testWorksheet'
import { testPoints, testTaskCount } from '../model/types'
import { useGrammatiktest } from '../store'
import { useDruck } from '../../../shared/navigation'

/**
 * Schritt 2: Test ansehen, bearbeiten und ausgeben.
 *
 * Bearbeitet wird unmittelbar auf der Seite – dieselbe Darstellung wie im Arbeitsblatt. Der
 * Lösungsteil trägt den Notenschlüssel und das Fehlerprofil; beides erscheint nur dort.
 */
export default function TestEditorStep(): React.JSX.Element {
  const { test, setStep, update } = useGrammatiktest()
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
  const ws = useMemo(() => (test ? testToWorksheet(test) : null), [test])
  const { layouts, measure } = useSheetLayouts(ws, logo, settings.schoolName)
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
    <Container size="xl" py="md">
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <Tooltip label="Zurück zu den Einstellungen">
            <ActionIcon variant="default" onClick={() => setStep(0)}>
              <IconArrowLeft size={16} />
            </ActionIcon>
          </Tooltip>
          <SegmentedControl
            size="xs"
            value={view}
            onChange={(v) => setView(v as 'student' | 'key')}
            data={[
              { value: 'student', label: 'Test' },
              { value: 'key', label: 'Lösungen' }
            ]}
          />
          <Text size="xs" c="dimmed">
            {testTaskCount(test)} Aufgaben · {points} Punkte
          </Text>
        </Group>
        <Group gap="xs">
          <Button size="compact-sm" variant="light" leftSection={<IconFileTypeDocx size={14} />} onClick={() => setAusgabe('docx')}>
            Word
          </Button>
          <Button size="compact-sm" variant="light" leftSection={<IconPrinter size={14} />} onClick={() => setAusgabe('print')}>
            Drucken
          </Button>
          <Button size="compact-sm" variant="light" leftSection={<IconDownload size={14} />} onClick={() => setAusgabe('pdf')}>
            PDF
          </Button>
        </Group>
      </Group>

      <Stack>
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
  )
}
