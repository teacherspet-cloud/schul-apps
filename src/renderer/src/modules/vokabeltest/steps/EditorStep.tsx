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
  ScrollArea,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip
} from '@mantine/core'
import { LANGUAGES } from '../model/types'
import { fragenAusVokabeln } from '../../../shared/export/lms/fragen'
import LmsExport from '../../../shared/export/lms/LmsExport'
import RueckmeldungKnopf from '../../rueckmeldung/RueckmeldungKnopf'
import { IconAdjustments, IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react'
import KiWunschKnoepfe from '../../../shared/components/KiWunschKnoepfe'
import { vokabelWunschHinweis, vokabelWunschKontext } from '../wunsch'
import { useCallback, useEffect, useMemo, useState } from 'react'
import ImagePicker from '../../../shared/components/ImagePicker'
import PrintPreview from '../../../shared/components/PrintPreview'
import { LoesungsWahl, loesungsVorgabe, merkeLoesungsWahl, type LoesungsModus } from '../../../shared/components/LoesungsWahl'
import { meldeAblage, speichereAusgabe, WORD_FILTER, type AusgabeDatei } from '../../../shared/export/ausgabe'
import { ablageZiel } from '../../../shared/export/ablageZiel'
import { imageSize } from '../../../shared/images'
import { notifyError, safeFileName } from '../../../shared/util'
import { buildDocx, vtWordAuswahl } from '../export/docx'
import { SeitenWahlSchalter } from '../../../shared/components/SeitenAuswahl'
import { standardMaskottchen, useMaskottchen } from '../../../shared/maskottchenStore'
import { vokabeltestFigurVorschlag } from '../render/maskottchen'
import { canRegenerateItem, createAdditionalBlock, regenerateBlock, regenerateItem } from '../generation/edit'
import { pictureOptions } from '../generation/pictureOptions'
import { TASK_TYPE_LIST, TASK_TYPES } from '../generation/taskTypes'
import { blockPoints, formatPoints, variantPoints } from '../model/blocks'
import type { Block, TaskTypeId, TestDocument } from '../model/types'
import { buildPrintHtml, imageCredits } from '../render/printHtml'
import FitToWidth from '../../../shared/render/FitToWidth'
import { useDruckFuerWachen } from '../../../shared/render/druckFuerWachen'
import WarningButton from '../../../shared/components/WarningButton'
import { RenderContext, RenderContextValue } from '../render/RenderContext'
import '../render/test.css'
import { TestPage } from '../render/TestPage'
import { DEFAULT_PAGE_LIMIT, pageLimitMin, pageLimitText, TestLayouts, useTestLayout } from '../render/useTestLayout'
import SeitenVorgabe from './SeitenVorgabe'
import { PROJECT_FILTER, serializeProject } from '../project'
import EditorLeiste from '../../../shared/components/EditorLeiste'
import { aiCall, useVokabeltest } from '../store'
import { useDruck } from '../../../shared/navigation'
import VorlagenfarbeSchalter from '../../../shared/components/VorlagenfarbeSchalter'
import { useAppSettings } from '../../../shared/settingsStore'
import UeberthemaFeld from '../../../shared/components/UeberthemaFeld'
import { useThemenbereich } from '../../../shared/themenbereiche'
import { unitAusName } from '../../../shared/ueberthema'
import './editor.css'
import { useLaufendeSchluessel } from '../../../shared/auftraege'
import { aufgabeBeheben } from '../auftraege'

export default function EditorStep(): React.JSX.Element {
  const {
    doc: gespeichert,
    updateDoc,
    updateBlock,
    undo,
    redo,
    verlauf,
    activeVariantId,
    setActiveVariant,
    setStep,
    listName,
    setListName,
    lastSavedAt
  } = useVokabeltest()
  /*
   * Überthema (Paket 11): der Themenbereich des Tests – ohne Bereich die Unit aus dem Namen der
   * Liste („Green Line 5 – Unit 3" → „Unit 3"). Nur zum Anzeigen eingesetzt; Vorschau, Druck,
   * PDF und Word nehmen dieses `doc`.
   */
  const bereich =
    useThemenbereich(
      'vokabeltest',
      useVokabeltest((s) => s.testId)
    )?.name ?? ''
  const unit = unitAusName(listName)
  const doc = useMemo(
    () => (gespeichert && (bereich || unit) ? { ...gespeichert, header: { ...gespeichert.header, themenbereich: bereich || unit } } : gespeichert),
    [gespeichert, bereich, unit]
  )
  // Nur zum Neuzeichnen: TestPage liest die Fachfarbe außerhalb von React (shared/fachfarben.ts)
  useAppSettings((s) => s.settings.fachfarben)
  const [view, setView] = useState<'test' | 'key'>('test')
  const [busy, setBusy] = useState<Set<string>>(new Set())
  // Aufgaben, an denen gerade „Mit KI beheben" arbeitet (Paket 12)
  const laufend = useLaufendeSchluessel(useVokabeltest((s) => s.testId))
  const [picker, setPicker] = useState<{ blockId: string; itemId: string; keywords: string[] } | null>(null)
  const [exportOpen, setExportOpen] = useState<null | 'docx' | 'pdf' | 'print'>(null)
  // Strg+P öffnet denselben Druckdialog wie der Knopf „Drucken“
  useDruck('vokabeltest', () => setExportOpen('print'))
  const [adding, setAdding] = useState(false)

  const variant = doc?.variants.find((v) => v.id === activeVariantId) ?? doc?.variants[0]
  // Echte A4-Seiten: Aufteilung wird unsichtbar gemessen (auch für Druck, PDF und Word)
  const { layouts, measure } = useTestLayout(doc)
  // Seitenrand-Wache: Druck-HTML aller Fassungen mit Lösungen, so wie der Export es baut
  useDruckFuerWachen(doc ? () => buildPrintHtml(doc, { variantIds: doc.variants.map((v) => v.id), includeKey: true }, layouts) : null, [doc, layouts])

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
          <WarningButton
            warnings={block.warnings}
            onDismiss={() => updateBlock(variant.id, block.id, (d) => (d.warnings = []))}
            // Paket 12: „Mit KI beheben" – die Aufgabe wird ohne die gemeldeten Probleme neu erzeugt (ein Rückgängig-Schritt)
            onBeheben={
              TASK_TYPES[block.taskType].schema ? (liste) => aufgabeBeheben(useVokabeltest.getState().testId, doc, variant.id, block.id, liste) : undefined
            }
            laeuft={laufend.has(block.id)}
          />
        )}
        <Tooltip label="Nach oben">
          <ActionIcon size="sm" variant="default" aria-label={`Aufgabe ${index + 1} nach oben`} disabled={index === 0} onClick={() => moveBlock(index, -1)}>
            <IconArrowUp size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Nach unten">
          <ActionIcon
            size="sm"
            variant="default"
            aria-label={`Aufgabe ${index + 1} nach unten`}
            disabled={index === variant.blocks.length - 1}
            onClick={() => moveBlock(index, 1)}
          >
            <IconArrowDown size={14} />
          </ActionIcon>
        </Tooltip>
        <BlockSettings block={block} doc={doc} variantId={variant.id} />
        {/*
         * Zauberstab „Überarbeiten" und Kreis „Neu erzeugen" mit Änderungswunsch (30.09.2026) –
         * vorher nur der Kreis „Ganze Aufgabe neu generieren" ohne Wunsch. Ein Rückgängig-Schritt.
         */}
        {TASK_TYPES[block.taskType].schema && (
          <KiWunschKnoepfe
            blockId={block.id}
            kontext={() => vokabelWunschKontext(block, doc)}
            busy={busy.has(block.id)}
            name={`Aufgabe ${index + 1}`}
            onAusfuehren={(art, wunsch) =>
              withBusy(block.id, async () => {
                const next = await regenerateBlock(
                  doc,
                  variant,
                  block,
                  aiCall,
                  block.kind === 'picture' ? await pictureOptions(doc.settings.pictureSource) : {},
                  vokabelWunschHinweis(block, art, wunsch)
                )
                updateBlock(variant.id, block.id, (d) => {
                  for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k]
                  Object.assign(d, next)
                })
              })
            }
          />
        )}
        <Tooltip label="Aufgabe löschen">
          <ActionIcon
            size="sm"
            variant="default"
            color="red"
            aria-label={`Aufgabe ${index + 1} löschen`}
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
      <EditorLeiste
        zurueck={{ label: 'Einstellungen', onClick: () => setStep(1) }}
        undo={{ canUndo: verlauf.past.length > 0, canRedo: verlauf.future.length > 0, onUndo: undo, onRedo: redo }}
        fassungen={
          doc.variants.length > 1
            ? {
                value: variant.id,
                onChange: setActiveVariant,
                data: doc.variants.map((v) => ({ value: v.id, label: `Test ${v.label}` })),
                ariaLabel: 'Variante'
              }
            : null
        }
        ansichten={{
          value: view,
          onChange: (v) => setView(v as 'test' | 'key'),
          data: [
            { value: 'test', label: 'Schülerblatt' },
            { value: 'key', label: 'Lösungen' }
          ]
        }}
        optionen={<HeaderSettingsInhalt doc={doc} bereich={bereich} unit={unit} onChange={(fn) => updateDoc(fn)} />}
        info={`${formatPoints(variantPoints(variant))} Punkte · Niveau ${doc.settings.level}${
          layouts ? ` · ${layouts.student.get(variant.id)?.pages.length ?? 1} ${layouts.student.get(variant.id)?.pages.length === 1 ? 'Seite' : 'Seiten'}` : ''
        }`}
        name={{ value: listName, placeholder: 'Name des Vokabeltests', onChange: setListName }}
        gesichertAm={lastSavedAt}
        dateiSpeichern={{
          tooltip: 'Als Datei speichern … (.vokabeltest, z. B. zum Weitergeben)',
          onClick: async () => {
            try {
              const path = await window.api.files.save(
                `${baseName}.vokabeltest`,
                PROJECT_FILTER,
                serializeProject(doc),
                ablageZiel('vokabeltest', useVokabeltest.getState().testId, doc.settings.targetLanguage)
              )
              if (path) meldeAblage(path, 'Datei gespeichert.')
            } catch (e) {
              notifyError(e)
            }
          }
        }}
        ausgabe={{ onWord: () => setExportOpen('docx'), onPdf: () => setExportOpen('pdf'), onDrucken: () => setExportOpen('print') }}
        extras={
          <>
            <LmsExport
              titel={doc.header.title}
              bericht={() => fragenAusVokabeln(doc.vocab, LANGUAGES.find((l) => l.value === doc.settings.targetLanguage)?.label ?? 'Zielsprache')}
              ziel={ablageZiel('vokabeltest', useVokabeltest.getState().testId, doc.settings.targetLanguage)}
            />
            <RueckmeldungKnopf art="vokabeltest" docId={useVokabeltest.getState().testId} />
          </>
        }
      />

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
          <ActionIcon size="sm" variant="default" aria-label="Aufgabe einstellen">
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

/** Kopf- und Schlussfigur ein/aus und – bei mehreren Figuren – welche. Ohne angelegte Figur nichts. */
function MaskottchenSchalter({ doc, onChange }: { doc: TestDocument; onChange: (fn: (d: TestDocument) => void) => void }): React.JSX.Element | null {
  const figuren = useMaskottchen((s) => s.liste)
  if (!figuren.length) return null
  const an = doc.header.illustrationen?.an ?? vokabeltestFigurVorschlag(doc.settings.grade)
  return (
    <Group gap="md" align="center">
      <Checkbox
        size="xs"
        label="Maskottchen (Kopf und Schluss)"
        checked={an}
        onChange={(e) => {
          const wert = e.currentTarget.checked
          onChange((d) => (d.header.illustrationen = { ...d.header.illustrationen, an: wert }))
        }}
      />
      {an && figuren.length > 1 && (
        <Select
          size="xs"
          aria-label="Figur"
          data={figuren.map((m) => ({ value: m.id, label: m.name }))}
          value={doc.header.illustrationen?.maskottchenId ?? standardMaskottchen()?.id ?? null}
          onChange={(v) => v && onChange((d) => (d.header.illustrationen = { ...d.header.illustrationen, maskottchenId: v }))}
          w={150}
        />
      )}
    </Group>
  )
}

/**
 * Inhalt der Blattoptionen des Vokabeltests (bis 27.09.2026 ein eigener Knopf „Kopf & Format";
 * jetzt steht er wie in allen Programmen hinter „Blattoptionen", shared/components/EditorLeiste.tsx).
 */
function HeaderSettingsInhalt({
  doc,
  bereich,
  unit,
  onChange
}: {
  doc: TestDocument
  bereich: string
  unit: string
  onChange: (fn: (d: TestDocument) => void) => void
}): React.JSX.Element {
  const h = doc.header
  const toggle = (key: keyof typeof h, label: string): React.JSX.Element => (
    <Checkbox size="xs" label={label} checked={Boolean(h[key])} onChange={(e) => onChange((d) => ((d.header[key] as boolean) = e.currentTarget.checked))} />
  )
  return (
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
      {/* Maskottchen (27.09.2026): winkend am Kopf, jubelnd am Schluss – wie bei Arbeiten; Vorschlag nach Jahrgang */}
      <MaskottchenSchalter doc={doc} onChange={onChange} />
      {/* KI-Vermerk (Großprogramm 0.4) – nur, wenn eine KI mitgewirkt hat */}
      {doc.ki && (
        <Select
          size="xs"
          label="KI-Vermerk"
          data={[
            { value: 'loesung', label: 'Nur im Lösungsblatt' },
            { value: 'ueberall', label: 'Auch auf dem Testblatt' },
            { value: 'aus', label: 'Nicht anzeigen' }
          ]}
          value={doc.kiVermerk ?? 'loesung'}
          onChange={(v) => v && onChange((d) => (d.kiVermerk = v as TestDocument['kiVermerk']))}
          allowDeselect={false}
        />
      )}
      {/* Paket 10a: Kopflinie und Nummern in der Fachfarbe der Sprache – hier abschaltbar */}
      <VorlagenfarbeSchalter
        size="xs"
        fach={doc.settings.targetLanguage}
        vorlagenname="Schwarz"
        checked={Boolean(h.vorlagenfarbe)}
        onChange={(an) => onChange((d) => (d.header.vorlagenfarbe = an))}
      />
      {/* Paket 11: „Englisch › Unit 3" im Kopf – Themenbereich oder Unit der Liste, überschreibbar */}
      <UeberthemaFeld size="xs" werte={doc.header} bereich={bereich} rueckfall={unit} onChange={(p) => onChange((d) => Object.assign(d.header, p))} />
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
      <SeitenVorgabe size="xs" limit={doc.settings.pageLimit ?? DEFAULT_PAGE_LIMIT} onChange={(next) => onChange((d) => (d.settings.pageLimit = next))} />
    </Stack>
  )
}

/** Hinweis, wenn die Seitenvorgabe nur mit kleinerer Schrift oder gar nicht eingehalten werden kann. */
function PageLimitNotice({ layouts }: { layouts: TestLayouts }): React.JSX.Element | null {
  const { limit, fits, shrunk, pageCount } = layouts
  if (limit.mode === 'auto') return null
  const target = pageLimitText(limit)
  const font = layouts.student.values().next().value?.fontSize
  if (!fits) {
    return (
      <Alert color="orange" mx="xl" mt="md" title={`Vorgabe „${target}“ nicht erreicht`}>
        {pageCount > limit.pages
          ? `Der Test braucht auch mit kleinerer Schrift (${font} pt) und engeren Abständen ${pageCount} Seiten. Bitte Aufgaben entfernen, Schreiblinien verringern oder weniger Vokabeln abfragen.`
          : `Der Test hat zu wenige Aufgaben, um ${pageLimitMin(limit)} Seiten zu füllen (${pageCount} ${pageCount === 1 ? 'Seite' : 'Seiten'}). Bitte Aufgaben hinzufügen.`}
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
  // Vorwahl: zuletzt im Vokabeltest gewählt, sonst „als eigene Datei" (shared/components/LoesungsWahl)
  const [key, setKey] = useState<LoesungsModus>(() => loesungsVorgabe('vokabeltest', doc.settings.answerKey))
  const [running, setRunning] = useState(false)
  const [druck, setDruck] = useState<{ html: string; loesung: { html: string; titel: string } | null } | null>(null)

  useEffect(() => setVariantIds(doc.variants.map((v) => v.id)), [doc.variants])
  useEffect(() => {
    if (mode) setKey(loesungsVorgabe('vokabeltest', doc.settings.answerKey))
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

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
      merkeLoesungsWahl('vokabeltest', key)
      const credits = imageCredits(doc)
      if (mode === 'print') {
        /*
         * Druckvorschau mit Seitenansicht statt direkt den Windows-Dialog. „Lösungen separat
         * drucken" ist ein eigener Druckauftrag – vorher wurde diese Wahl beim Drucken still zu
         * „ohne Lösungen".
         */
        setDruck({
          html: buildPrintHtml(doc, { variantIds, includeKey: key === 'append' }, layouts),
          loesung: key === 'separate' ? { html: buildPrintHtml(doc, { variantIds, includeKey: false, keyOnly: true }, layouts), titel: 'Lösungen' } : null
        })
      } else if (mode === 'pdf') {
        // Mit „als eigene Datei" zwei Dateien – dafür wird einmal ein Ordner gewählt (shared/export/ausgabe.tsx)
        const dateien: AusgabeDatei[] = [{ name: `${baseName}${suffix}.pdf`, html: buildPrintHtml(doc, { variantIds, includeKey: key === 'append' }, layouts) }]
        if (key === 'separate')
          dateien.push({ name: `${baseName}${suffix} - Lösungen.pdf`, html: buildPrintHtml(doc, { variantIds, includeKey: false, keyOnly: true }, layouts) })
        await speichereAusgabe(dateien, 'PDF gespeichert.', ablageZiel('vokabeltest', useVokabeltest.getState().testId, doc.settings.targetLanguage))
      } else {
        const dateien: AusgabeDatei[] = [
          {
            name: `${baseName}${suffix}.docx`,
            filter: WORD_FILTER,
            daten: () => buildDocx(doc, { variantIds, includeKey: key === 'append', credits, layouts }, imageSize),
            // Seitenauswahl (01.10.2026): an den Seiten des Druck-HTML wählen, Word bekommt deren Aufgaben
            seiten: {
              html: () => buildPrintHtml(doc, { variantIds, includeKey: key === 'append' }, layouts),
              mitAuswahl: (_s, marken) =>
                buildDocx(doc, { variantIds, includeKey: key === 'append', credits, layouts, auswahl: vtWordAuswahl(doc, layouts, marken) }, imageSize)
            }
          }
        ]
        if (key === 'separate')
          dateien.push({
            name: `${baseName}${suffix} - Lösungen.docx`,
            filter: WORD_FILTER,
            daten: () => buildDocx(doc, { variantIds, includeKey: false, keyOnly: true, credits, layouts }, imageSize),
            seiten: {
              html: () => buildPrintHtml(doc, { variantIds, includeKey: false, keyOnly: true }, layouts),
              mitAuswahl: (_s, marken) =>
                buildDocx(doc, { variantIds, includeKey: false, keyOnly: true, credits, layouts, auswahl: vtWordAuswahl(doc, layouts, marken) }, imageSize)
            }
          })
        await speichereAusgabe(dateien, 'Word-Dokument gespeichert.', ablageZiel('vokabeltest', useVokabeltest.getState().testId, doc.settings.targetLanguage))
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
      <PrintPreview html={druck?.html ?? null} loesung={druck?.loesung} title={`Drucken – ${doc.header.title}`} onClose={() => setDruck(null)} />
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
          <LoesungsWahl value={key} onChange={setKey} modus={mode} />
          {/* Seitenauswahl (01.10.2026): beim Drucken steckt sie in der Druckvorschau */}
          {mode !== null && mode !== 'print' && <SeitenWahlSchalter />}
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
