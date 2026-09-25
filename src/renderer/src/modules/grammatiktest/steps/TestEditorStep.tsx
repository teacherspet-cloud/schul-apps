import { ActionIcon, Button, Container, Group, SegmentedControl, Stack, Text, Tooltip } from '@mantine/core'
import { IconArrowLeft, IconDownload, IconFileTypeDocx, IconPrinter } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import FitToWidth from '../../../shared/render/FitToWidth'
import { useAppSettings } from '../../../shared/settingsStore'
import { notifyError, notifySuccess } from '../../../shared/util'
import { browserDocxDeps } from '../../arbeitsblatt/export/browserDeps'
import { buildWorksheetDocx } from '../../arbeitsblatt/export/docx'
import { buildWorksheetHtml } from '../../arbeitsblatt/render/printHtml'
import { contextFor, pageInfoFor, SheetPages, useSheetLayouts } from '../../arbeitsblatt/render/SheetPages'
import { BausteinRahmen } from '../../arbeitsblatt/render/BausteinRahmen'
import type { PlacedItem } from '../../arbeitsblatt/render/paginate'
import type { WsBlock } from '../../arbeitsblatt/model/types'
import { testToWorksheet } from '../render/testWorksheet'
import { testPoints, testTaskCount } from '../model/types'
import { useGrammatiktest } from '../store'

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
  const [busy, setBusy] = useState(false)

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
  if (!test || !ws) return <Container py="xl">Kein Test geladen.</Container>

  const sheet = ws.sheets[0]
  const key = view === 'key'
  const points = testPoints(test)

  const exportDocx = async (): Promise<void> => {
    setBusy(true)
    try {
      const data = await buildWorksheetDocx(ws, { sheetIds: [sheet.id], includeKey: test.meta.answerKey }, browserDocxDeps(logo, settings.schoolName))
      const path = await window.api.files.save(`${ws.meta.title || 'Grammatiktest'}.docx`, [{ name: 'Word-Dokument', extensions: ['docx'] }], data)
      if (path) notifySuccess('Word-Dokument gespeichert.')
    } catch (e) {
      notifyError(e, 'Der Export ist fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  const html = (): string => buildWorksheetHtml(ws, layouts, { sheetIds: [sheet.id], includeKey: test.meta.answerKey }, logo, settings.schoolName)

  const print = (): void => {
    window.api.exporter.print(html()).catch((e: unknown) => notifyError(e, 'Das Drucken ist fehlgeschlagen'))
  }

  const exportPdf = async (): Promise<void> => {
    try {
      const path = await window.api.exporter.pdf(html(), `${ws.meta.title || 'Grammatiktest'}.pdf`)
      if (path) notifySuccess('PDF gespeichert.')
    } catch (e) {
      notifyError(e, 'Export fehlgeschlagen')
    }
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
          <Button size="compact-sm" variant="light" leftSection={<IconFileTypeDocx size={14} />} loading={busy} onClick={() => void exportDocx()}>
            Word
          </Button>
          <Button size="compact-sm" variant="light" leftSection={<IconPrinter size={14} />} onClick={print}>
            Drucken
          </Button>
          <Button size="compact-sm" variant="light" leftSection={<IconDownload size={14} />} onClick={() => void exportPdf()}>
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
    </Container>
  )
}
