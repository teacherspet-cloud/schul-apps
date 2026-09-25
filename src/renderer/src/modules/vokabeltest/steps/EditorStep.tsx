import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Menu,
  Modal,
  NumberInput,
  Popover,
  Radio,
  ScrollArea,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip
} from '@mantine/core'
import {
  IconAdjustments,
  IconArrowDown,
  IconArrowUp,
  IconDeviceFloppy,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconHeading,
  IconPlus,
  IconPrinter,
  IconRefresh,
  IconSettings,
  IconTrash
} from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import ImagePicker from '../../../shared/components/ImagePicker'
import PrintPreview from '../../../shared/components/PrintPreview'
import { imageSize } from '../../../shared/images'
import { notifyError, notifySuccess, safeFileName } from '../../../shared/util'
import { buildDocx } from '../export/docx'
import { canRegenerateItem, createAdditionalBlock, regenerateBlock, regenerateItem } from '../generation/edit'
import { pictureOptions } from '../generation/pictureOptions'
import { TASK_TYPE_LIST, TASK_TYPES } from '../generation/taskTypes'
import { blockPoints, formatPoints, variantPoints } from '../model/blocks'
import type { Block, TaskTypeId, TestDocument } from '../model/types'
import { buildPrintHtml, imageCredits } from '../render/printHtml'
import FitToWidth from '../../../shared/render/FitToWidth'
import WarningButton from '../../../shared/components/WarningButton'
import { RenderContext, RenderContextValue } from '../render/RenderContext'
import '../render/test.css'
import { TestPage } from '../render/TestPage'
import { TestLayouts, useTestLayout } from '../render/useTestLayout'
import { PROJECT_FILTER, serializeProject } from '../project'
import { aiCall, useVokabeltest } from '../store'
import { SaveTestButton } from './TestLibrary'
import UndoRedoButtons from '../../../shared/components/UndoRedoButtons'
import { useDruck } from '../../../shared/navigation'
import './editor.css'

export default function EditorStep(): React.JSX.Element {
  const { doc, updateDoc, updateBlock, undo, redo, verlauf, activeVariantId, setActiveVariant, setStep, listName } = useVokabeltest()
  const [view, setView] = useState<'test' | 'key'>('test')
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [picker, setPicker] = useState<{ blockId: string; itemId: string; keywords: string[] } | null>(null)
  const [exportOpen, setExportOpen] = useState<null | 'docx' | 'pdf' | 'print'>(null)
  // Strg+P öffnet denselben Druckdialog wie der Knopf „Drucken“
  useDruck('vokabeltest', () => setExportOpen('print'))
  const [adding, setAdding] = useState(false)

  const variant = doc?.variants.find((v) => v.id === activeVariantId) ?? doc?.variants[0]
  // Echte A4-Seiten: Aufteilung wird unsichtbar gemessen (auch für Druck, PDF und Word)
  const { layouts, measure } = useTestLayout(doc)

  // Strg+Z / Strg+Y hängen am Programm (VokabeltestModule), damit sie nur gelten, solange es vorn liegt

  const withBusy = useCallback(async (id: string, fn: () => Promise<void>) => {
    setBusy((b) => new Set(b).add(id))
    try {
      await fn()
    } catch (e) {
      notifyError(e)
    } finally {
      setBusy((b) => {
        const n = new Set(b)
        n.delete(id)
        return n
      })
    }
  }, [])

  const renderValue: RenderContextValue = useMemo(
    () => ({
      // Schülerblatt ohne eingetragene Lösungen; Lösungen werden in der Lösungsansicht bearbeitet
      mode: view === 'key' ? 'editKey' : 'edit',
      language: doc?.settings.targetLanguage,
      updateBlock: !variant ? undefined : (blockId, fn) => updateBlock(variant.id, blockId, fn),
      actions:
        view === 'key' || !variant || !doc
          ? undefined
          : {
              busyItems: busy,
              regenerateItem: (blockId, itemId) =>
                withBusy(itemId, async () => {
                  const block = variant.blocks.find((b) => b.id === blockId)!
                  if (!canRegenerateItem(block)) return
                  const next = await regenerateItem(doc, variant, block, itemId, aiCall)
                  updateBlock(variant.id, blockId, (d) => Object.assign(d, next))
                }),
              deleteItem: (blockId, itemId) =>
                updateBlock(variant.id, blockId, (d) => {
                  if ('items' in d) (d as { items: { id: string }[] }).items = (d as { items: { id: string }[] }).items.filter((i) => i.id !== itemId)
                  if (d.kind === 'match') d.left = d.left.filter((l) => l.id !== itemId)
                  // Lücke im Fließtext: Lösung wird wieder normaler Text
                  if (d.kind === 'gapText') d.parts = d.parts.map((p) => (p.type === 'gap' && p.id === itemId ? { type: 'text', text: p.answer } : p))
                }),
              pickImage: (blockId, itemId) => {
                const block = variant.blocks.find((b) => b.id === blockId)
                const item = block?.kind === 'picture' ? block.items.find((i) => i.id === itemId) : undefined
                setPicker({ blockId, itemId, keywords: item ? [...new Set([...item.imageKeywords, item.answer])] : [] })
              }
            }
    }),
    [view, variant, doc, busy, updateBlock, withBusy]
  )

  if (!doc || !variant) return <></>

  const moveBlock = (index: number, delta: number): void =>
    updateDoc((d) => {
      const blocks = d.variants.find((v) => v.id === variant.id)!.blocks
      const [b] = blocks.splice(index, 1)
      blocks.splice(index + delta, 0, b)
    })

  const baseName = safeFileName(`${doc.header.title}${listName ? ` - ${listName}` : doc.settings.topic ? ` - ${doc.settings.topic}` : ''}`)

  const wrapBlock = (block: Block, index: number, content: React.JSX.Element): React.ReactNode => (
    <div className={`editor-block ${busy.has(block.id) ? 'editor-block-busy' : ''}`}>
      <div className="editor-block-toolbar">
        {block.warnings && block.warnings.length > 0 && view !== 'key' && (
          <WarningButton warnings={block.warnings} onDismiss={() => updateBlock(variant.id, block.id, (d) => (d.warnings = []))} />
        )}
        <Tooltip label="Nach oben">
          <ActionIcon size="sm" variant="default" disabled={index === 0} onClick={() => moveBlock(index, -1)}>
            <IconArrowUp size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Nach unten">
          <ActionIcon size="sm" variant="default" disabled={index === variant.blocks.length - 1} onClick={() => moveBlock(index, 1)}>
            <IconArrowDown size={14} />
          </ActionIcon>
        </Tooltip>
        <BlockSettings block={block} doc={doc} variantId={variant.id} />
        {TASK_TYPES[block.taskType].schema && (
          <Tooltip label="Ganze Aufgabe neu generieren">
            <ActionIcon
              size="sm"
              variant="default"
              loading={busy.has(block.id)}
              onClick={() =>
                withBusy(block.id, async () => {
                  const next = await regenerateBlock(
                    doc,
                    variant,
                    block,
                    aiCall,
                    block.kind === 'picture' ? await pictureOptions(doc.settings.pictureSource) : {}
                  )
                  updateBlock(variant.id, block.id, (d) => {
                    for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k]
                    Object.assign(d, next)
                  })
                })
              }
            >
              <IconRefresh size={14} />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip label="Aufgabe löschen">
          <ActionIcon
            size="sm"
            variant="default"
            color="red"
            onClick={() =>
              updateDoc(
                (d) =>
                  (d.variants.find((v) => v.id === variant.id)!.blocks = d.variants.find((v) => v.id === variant.id)!.blocks.filter((b) => b.id !== block.id))
              )
            }
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>
      </div>
      {content}
    </div>
  )

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Group px="md" py={8} gap="xs" className="app-toolbar">
        <Button variant="default" size="xs" leftSection={<IconSettings size={14} />} onClick={() => setStep(1)}>
          Einstellungen
        </Button>
        <UndoRedoButtons canUndo={verlauf.past.length > 0} canRedo={verlauf.future.length > 0} onUndo={undo} onRedo={redo} />
        <Divider orientation="vertical" />
        {doc.variants.length > 1 && (
          <SegmentedControl
            size="xs"
            value={variant.id}
            onChange={setActiveVariant}
            data={doc.variants.map((v) => ({ value: v.id, label: `Test ${v.label}` }))}
          />
        )}
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(v) => setView(v as 'test' | 'key')}
          data={[
            { value: 'test', label: 'Schülerblatt' },
            { value: 'key', label: 'Lösungen' }
          ]}
        />
        <HeaderSettings doc={doc} onChange={(fn) => updateDoc(fn)} />
        <Box style={{ flex: 1 }} />
        <Text size="xs" c="dimmed">
          {formatPoints(variantPoints(variant))} Punkte · Niveau {doc.settings.level}
          {layouts
            ? ` · ${layouts.student.get(variant.id)?.pages.length ?? 1} ${layouts.student.get(variant.id)?.pages.length === 1 ? 'Seite' : 'Seiten'}`
            : ''}
        </Text>
        <SaveTestButton size="xs" />
        <Tooltip label="Als .vokabeltest-Datei speichern (z. B. zum Weitergeben)">
          <ActionIcon
            variant="default"
            size="md"
            aria-label="Als Datei speichern"
            onClick={async () => {
              try {
                const path = await window.api.files.save(`${baseName}.vokabeltest`, PROJECT_FILTER, serializeProject(doc))
                if (path) notifySuccess('Datei gespeichert.')
              } catch (e) {
                notifyError(e)
              }
            }}
          >
            <IconDeviceFloppy size={16} />
          </ActionIcon>
        </Tooltip>
        <Button size="xs" leftSection={<IconFileTypeDocx size={14} />} onClick={() => setExportOpen('docx')}>
          Word
        </Button>
        <Button size="xs" leftSection={<IconFileTypePdf size={14} />} onClick={() => setExportOpen('pdf')}>
          PDF
        </Button>
        <Button size="xs" variant="light" leftSection={<IconPrinter size={14} />} onClick={() => setExportOpen('print')}>
          Drucken
        </Button>
      </Group>

      {measure}
      <ScrollArea style={{ flex: 1 }} className="editor-canvas">
        {layouts && <PageLimitNotice layouts={layouts} />}
        <FitToWidth>
          <Box py="xl" style={{ display: 'flex', justifyContent: 'center' }}>
            <Box className={`editor-sheet ${view === 'key' ? 'editor-sheet-key' : ''}`}>
              <RenderContext.Provider value={renderValue}>
                <TestPage
                  doc={doc}
                  variant={variant}
                  layout={(view === 'key' ? layouts?.key : layouts?.student)?.get(variant.id)}
                  wrapBlock={view === 'key' ? undefined : wrapBlock}
                  footer={
                    view === 'key' ? null : (
                      <Group justify="center" mt="xl" className="editor-add">
                        <Menu shadow="md" width={300} position="top">
                          <Menu.Target>
                            <Button variant="light" leftSection={<IconPlus size={16} />} loading={adding}>
                              Aufgabe hinzufügen
                            </Button>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <ScrollArea.Autosize mah={400}>
                              {TASK_TYPE_LIST.map((def) => (
                                <Menu.Item
                                  key={def.id}
                                  onClick={async () => {
                                    setAdding(true)
                                    try {
                                      const { block, vocab } = await createAdditionalBlock(
                                        doc,
                                        variant,
                                        def.id as TaskTypeId,
                                        5,
                                        aiCall,
                                        await pictureOptions(doc.settings.pictureSource)
                                      )
                                      updateDoc((d) => {
                                        d.vocab = vocab
                                        d.variants.find((v) => v.id === variant.id)!.blocks.push(block)
                                      })
                                    } catch (e) {
                                      notifyError(e)
                                    } finally {
                                      setAdding(false)
                                    }
                                  }}
                                >
                                  <Text size="sm">{def.label}</Text>
                                  <Text size="xs" c="dimmed">
                                    {def.usesVocab ? 'mit bis zu 5 noch nicht abgefragten Vokabeln' : 'ohne KI'}
                                  </Text>
                                </Menu.Item>
                              ))}
                            </ScrollArea.Autosize>
                          </Menu.Dropdown>
                        </Menu>
                      </Group>
                    )
                  }
                />
              </RenderContext.Provider>
            </Box>
          </Box>
        </FitToWidth>
        <Text ta="center" size="xs" c="dimmed" pb="xl">
          Texte direkt anklicken und bearbeiten · Lösungen in der Ansicht „Lösungen“ bearbeiten (Doppelklick auf eine Antwortoption markiert sie als richtig) ·
          Druck, PDF und Word übernehmen diese Seitenaufteilung
        </Text>
      </ScrollArea>

      {picker && (
        <ImagePicker
          opened
          keywords={picker.keywords}
          onClose={() => setPicker(null)}
          onPick={(img) =>
            updateBlock(variant.id, picker.blockId, (d) => {
              if (d.kind !== 'picture') return
              const item = d.items.find((i) => i.id === picker.itemId)
              if (!item) return
              item.image = img
              // Hinweise zu genau diesem Wort sind mit dem neuen Bild erledigt
              d.warnings = d.warnings?.filter((w) => !w.includes(item.answer))
            })
          }
        />
      )}

      <ExportModal mode={exportOpen} doc={doc} baseName={baseName} layouts={layouts} onClose={() => setExportOpen(null)} />
    </Box>
  )
}

function BlockSettings({ block, doc, variantId }: { block: Block; doc: TestDocument; variantId: string }): React.JSX.Element {
  const { updateDoc } = useVokabeltest()
  const [allVariants, setAllVariants] = useState(doc.variants.length > 1)

  /** Ändert eine Einstellung in dieser Aufgabe und optional in der gleichen Aufgabe aller Varianten. */
  const apply = (fn: (b: Block) => void): void =>
    updateDoc((d) => {
      const index = d.variants.find((v) => v.id === variantId)!.blocks.findIndex((b) => b.id === block.id)
      for (const v of d.variants) {
        if (!allVariants && v.id !== variantId) continue
        const target = v.id === variantId ? v.blocks[index] : v.blocks[index]
        if (target && target.taskType === block.taskType) fn(target)
      }
    })

  return (
    <Popover width={300} position="left-start" shadow="md" withArrow>
      <Popover.Target>
        <Tooltip label="Aufgabe einstellen">
          <ActionIcon size="sm" variant="default">
            <IconAdjustments size={14} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            {TASK_TYPES[block.taskType].label}
          </Text>
          <NumberInput
            size="xs"
            label={block.kind === 'freeText' ? 'Punkte' : 'Punkte je Item'}
            min={0}
            step={0.5}
            decimalScale={1}
            value={block.pointsPerItem}
            onChange={(v) => apply((b) => (b.pointsPerItem = Number(v) || 0))}
            description={`Summe: ${formatPoints(blockPoints(block))}`}
          />
          {'wordBank' in block && (
            <Switch
              size="xs"
              label="Wortkasten anzeigen"
              checked={block.wordBank}
              onChange={(e) => apply((b) => 'wordBank' in b && (b.wordBank = e.currentTarget.checked))}
            />
          )}
          {'firstLetterHint' in block && (
            <Switch
              size="xs"
              label="Anfangsbuchstaben vorgeben"
              checked={block.firstLetterHint}
              onChange={(e) => apply((b) => 'firstLetterHint' in b && (b.firstLetterHint = e.currentTarget.checked))}
            />
          )}
          {'extraBankWords' in block && block.wordBank && (
            <TextInput
              size="xs"
              label="Zusätzliche Wörter im Kasten (Ablenker)"
              placeholder="durch Komma trennen"
              defaultValue={(block.extraBankWords ?? []).join(', ')}
              onBlur={(e) => {
                const words = e.currentTarget.value
                  .split(',')
                  .map((w) => w.trim())
                  .filter(Boolean)
                apply((b) => 'extraBankWords' in b && (b.extraBankWords = words))
              }}
            />
          )}
          <Switch
            size="xs"
            label="Hinweiszeile für Schüler anzeigen"
            checked={block.showHelp !== false}
            onChange={(e) => apply((b) => (b.showHelp = e.currentTarget.checked))}
          />
          {block.kind === 'open' && (
            <NumberInput
              size="xs"
              label="Schreiblinien je Item"
              min={0}
              max={10}
              value={block.items[0]?.lines ?? 2}
              onChange={(v) => apply((b) => b.kind === 'open' && b.items.forEach((i) => (i.lines = Number(v) || 0)))}
            />
          )}
          {block.kind === 'freeText' && (
            <NumberInput
              size="xs"
              label="Schreiblinien"
              min={0}
              max={30}
              value={block.lines}
              onChange={(v) => apply((b) => b.kind === 'freeText' && (b.lines = Number(v) || 0))}
            />
          )}
          {block.kind === 'picture' && (
            <NumberInput
              size="xs"
              label="Bilder pro Zeile"
              min={2}
              max={6}
              value={block.columns}
              onChange={(v) => apply((b) => b.kind === 'picture' && (b.columns = Number(v) || 4))}
            />
          )}
          {block.kind === 'trueFalse' && (
            <Switch
              size="xs"
              label="Korrektur verlangen"
              checked={block.askCorrection}
              onChange={(e) => apply((b) => b.kind === 'trueFalse' && (b.askCorrection = e.currentTarget.checked))}
            />
          )}
          {block.kind === 'oddOneOut' && (
            <Switch
              size="xs"
              label="Begründung verlangen"
              checked={block.askReason}
              onChange={(e) => apply((b) => b.kind === 'oddOneOut' && (b.askReason = e.currentTarget.checked))}
            />
          )}
          {doc.variants.length > 1 && (
            <>
              <Divider />
              <Checkbox
                size="xs"
                label="Einstellungen für alle Varianten übernehmen"
                checked={allVariants}
                onChange={(e) => setAllVariants(e.currentTarget.checked)}
              />
            </>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

function HeaderSettings({ doc, onChange }: { doc: TestDocument; onChange: (fn: (d: TestDocument) => void) => void }): React.JSX.Element {
  const h = doc.header
  const toggle = (key: keyof typeof h, label: string): React.JSX.Element => (
    <Checkbox size="xs" label={label} checked={Boolean(h[key])} onChange={(e) => onChange((d) => ((d.header[key] as boolean) = e.currentTarget.checked))} />
  )
  return (
    <Popover width={320} shadow="md" withArrow>
      <Popover.Target>
        <Button size="xs" variant="default" leftSection={<IconHeading size={14} />}>
          Kopf & Format
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <TextInput size="xs" label="Überschrift" defaultValue={h.title} onBlur={(e) => onChange((d) => (d.header.title = e.currentTarget.value))} />
          <TextInput
            size="xs"
            label="Untertitel (optional)"
            defaultValue={h.subtitle}
            onBlur={(e) => onChange((d) => (d.header.subtitle = e.currentTarget.value))}
          />
          <TextInput size="xs" label="Schulname" defaultValue={h.schoolName} onBlur={(e) => onChange((d) => (d.header.schoolName = e.currentTarget.value))} />
          <Group gap="md">
            {toggle('showName', 'Name')}
            {toggle('showClass', 'Klasse')}
            {toggle('showDate', 'Datum')}
          </Group>
          <Group gap="md">
            {toggle('showSchool', 'Schule')}
            {toggle('showVariant', 'Variante')}
            {toggle('showPoints', 'Punkte')}
            {toggle('showGrade', 'Note')}
          </Group>
          <NumberInput
            size="xs"
            label="Schriftgröße (pt)"
            min={9}
            max={16}
            value={doc.fontSize}
            onChange={(v) => onChange((d) => (d.fontSize = Number(v) || 12))}
          />
          <Text size="xs" fw={500}>
            Seitenumfang je Test
          </Text>
          <Group gap={6} wrap="nowrap">
            <SegmentedControl
              size="xs"
              data={[
                { value: 'auto', label: 'automatisch' },
                { value: 'max', label: 'höchstens' },
                { value: 'exact', label: 'genau' }
              ]}
              value={doc.settings.pageLimit?.mode ?? 'auto'}
              onChange={(v) => onChange((d) => (d.settings.pageLimit = { pages: d.settings.pageLimit?.pages ?? 2, mode: v as 'auto' | 'max' | 'exact' }))}
            />
            {(doc.settings.pageLimit?.mode ?? 'auto') !== 'auto' && (
              <NumberInput
                size="xs"
                w={60}
                min={1}
                max={10}
                aria-label="Seiten"
                value={doc.settings.pageLimit?.pages ?? 2}
                onChange={(v) =>
                  onChange((d) => (d.settings.pageLimit = { mode: d.settings.pageLimit?.mode ?? 'max', pages: Math.max(1, Math.min(10, Number(v) || 1)) }))
                }
              />
            )}
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

/** Hinweis, wenn die Seitenvorgabe nur mit kleinerer Schrift oder gar nicht eingehalten werden kann. */
function PageLimitNotice({ layouts }: { layouts: TestLayouts }): React.JSX.Element | null {
  const { limit, fits, shrunk, pageCount } = layouts
  if (limit.mode === 'auto') return null
  const target = `${limit.mode === 'exact' ? 'genau' : 'höchstens'} ${limit.pages} ${limit.pages === 1 ? 'Seite' : 'Seiten'}`
  const font = layouts.student.values().next().value?.fontSize
  if (!fits) {
    return (
      <Alert color="orange" mx="xl" mt="md" title={`Vorgabe „${target}“ nicht erreicht`}>
        {pageCount > limit.pages
          ? `Der Test braucht auch mit kleinerer Schrift (${font} pt) und engeren Abständen ${pageCount} Seiten. Bitte Aufgaben entfernen, Schreiblinien verringern oder weniger Vokabeln abfragen.`
          : `Der Test hat zu wenige Aufgaben, um ${limit.pages} Seiten zu füllen (${pageCount} ${pageCount === 1 ? 'Seite' : 'Seiten'}). Bitte Aufgaben hinzufügen.`}
      </Alert>
    )
  }
  if (!shrunk) return null
  return (
    <Text ta="center" size="xs" c="dimmed" mt="md">
      Damit der Test auf {target} passt, wurden die Abstände verringert{font !== undefined ? ` und die Schrift auf ${font} pt gesetzt` : ''}.
    </Text>
  )
}

function ExportModal({
  mode,
  doc,
  baseName,
  layouts,
  onClose
}: {
  mode: null | 'docx' | 'pdf' | 'print'
  doc: TestDocument
  baseName: string
  layouts: TestLayouts | null
  onClose: () => void
}): React.JSX.Element {
  const [variantIds, setVariantIds] = useState<string[]>(doc.variants.map((v) => v.id))
  const [key, setKey] = useState<'none' | 'append' | 'separate'>(doc.settings.answerKey ? 'separate' : 'none')
  const [running, setRunning] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)

  useEffect(() => setVariantIds(doc.variants.map((v) => v.id)), [doc.variants])
  // Beim Drucken gibt es keine eigene Lösungsdatei: nicht versehentlich Lösungen mitdrucken
  const effectiveKey = mode === 'print' && key === 'separate' ? 'none' : key

  const missingImages = doc.variants.some((v) => v.blocks.some((b) => b.kind === 'picture' && b.items.some((i) => !i.image)))
  const labels = doc.variants
    .filter((v) => variantIds.includes(v.id))
    .map((v) => v.label)
    .join('')
  const suffix = doc.variants.length > 1 ? ` - Test ${labels}` : ''

  const run = async (): Promise<void> => {
    if (!mode) return
    setRunning(true)
    try {
      const credits = imageCredits(doc)
      if (mode === 'print') {
        // Druckvorschau mit Seitenansicht statt direkt den Windows-Dialog
        setPreviewHtml(buildPrintHtml(doc, { variantIds, includeKey: effectiveKey === 'append' }, layouts))
      } else if (mode === 'pdf') {
        const path = await window.api.exporter.pdf(buildPrintHtml(doc, { variantIds, includeKey: key === 'append' }, layouts), `${baseName}${suffix}.pdf`)
        if (path && key === 'separate') {
          await window.api.exporter.pdf(buildPrintHtml(doc, { variantIds, includeKey: false, keyOnly: true }, layouts), `${baseName}${suffix} - Lösungen.pdf`)
        }
        if (path) notifySuccess('PDF gespeichert.')
      } else {
        const filters = [{ name: 'Word-Dokument', extensions: ['docx'] }]
        const data = await buildDocx(doc, { variantIds, includeKey: key === 'append', credits, layouts }, imageSize)
        const path = await window.api.files.save(`${baseName}${suffix}.docx`, filters, data)
        if (path && key === 'separate') {
          const keyData = await buildDocx(doc, { variantIds, includeKey: false, keyOnly: true, credits, layouts }, imageSize)
          await window.api.files.save(`${baseName}${suffix} - Lösungen.docx`, filters, keyData)
        }
        if (path) notifySuccess('Word-Dokument gespeichert.')
      }
      onClose()
    } catch (e) {
      notifyError(e, 'Export fehlgeschlagen')
    } finally {
      setRunning(false)
    }
  }

  const title = mode === 'docx' ? 'Als Word-Dokument speichern' : mode === 'pdf' ? 'Als PDF speichern' : 'Drucken'
  return (
    <>
      <PrintPreview html={previewHtml} title={`Drucken – ${doc.header.title}`} onClose={() => setPreviewHtml(null)} />
      <Modal opened={mode !== null} onClose={onClose} title={title}>
        <Stack>
          {missingImages && (
            <Alert color="orange" p="xs">
              Bei einigen Bildaufgaben fehlen noch Bilder.
            </Alert>
          )}
          {doc.variants.length > 1 && (
            <Checkbox.Group label="Varianten" value={variantIds} onChange={setVariantIds}>
              <Group mt={4}>
                {doc.variants.map((v) => (
                  <Checkbox key={v.id} value={v.id} label={`Test ${v.label}`} />
                ))}
              </Group>
            </Checkbox.Group>
          )}
          <Radio.Group label="Lösungen" value={effectiveKey} onChange={(v) => setKey(v as typeof key)}>
            <Stack gap={6} mt={4}>
              <Radio value="none" label="ohne Lösungen" />
              <Radio value="append" label="Lösungsseiten anhängen" />
              {mode !== 'print' && <Radio value="separate" label="Lösungen als eigene Datei" />}
            </Stack>
          </Radio.Group>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Abbrechen
            </Button>
            <Button onClick={run} loading={running} disabled={variantIds.length === 0}>
              {mode === 'print' ? 'Weiter zur Druckvorschau' : 'Speichern …'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
