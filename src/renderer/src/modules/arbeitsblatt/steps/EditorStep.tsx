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
  Radio,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowLeft,
  IconDeviceFloppy,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconFolder,
  IconPhoto,
  IconPlus,
  IconPrinter,
  IconCircleNumber0,
  IconHeadphones,
  IconNumber0Small,
  IconRefresh,
  IconTrash,
  IconWand
} from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DesignTemplate } from '@shared/design'
import ImagePicker from '../../../shared/components/ImagePicker'
import PrintPreview from '../../../shared/components/PrintPreview'
import FitToWidth from '../../../shared/render/FitToWidth'
import { useAppSettings } from '../../../shared/settingsStore'
import { notifyError, notifySuccess, safeFileName } from '../../../shared/util'
import { checkTasksPerPage } from '../didactics/checks'
import { browserDocxDeps } from '../export/browserDeps'
import { buildWorksheetDocx } from '../export/docx'
import { fuelleBaustein, regenerateBlock } from '../generation/generate'
import { generateExample } from '../generation/example'
import { hoerenIstPruefgegenstand } from '../didactics/audioRules'
import { plainText } from '../../../shared/richtext/parse'
import { estimateSeconds } from '../generation/convert'
import { BLOCK_LABELS, istLeer, newBlock } from '../model/factory'
import type { TaskBlock, Worksheet, WsBlock, WsBlockType } from '../model/types'
import { serializeWorksheet, WORKSHEET_FILTER } from '../project'
import { BausteinRahmen } from '../render/BausteinRahmen'
import type { PlacedItem } from '../render/paginate'
import { buildWorksheetHtml } from '../render/printHtml'
import { tafelbildHinweis, tafelbildZiel } from '../export/tafelbildZiel'
import { contextFor, layoutKey, pageInfoFor, profileFromMeta, SheetPages, useSheetLayouts, vorschauSeiten } from '../render/SheetPages'
import '../render/ws.css'
import { aiCall, useArbeitsblatt } from '../store'
import { defaultWorksheetName, useWorksheetAutosave } from '../library'
import '../../vokabeltest/steps/editor.css'
import { BlockSettings } from './BlockSettings'
import WarningButton from '../../../shared/components/WarningButton'
import { AiReviseButton, VersionSwitcher } from './BlockRevision'
import { AudioPanel } from './AudioPanel'
import { BoardPanel } from './BoardPanel'
import { addVersion, switchVersion } from '../model/versions'
import { browserSourceServices, completeOriginalSources } from '../generation/originalSources'
import { browserWorksheetImageDeps } from '../generation/browserImages'
import { completeWorksheetImages } from '../generation/worksheetImages'
import { CANARY_MAX, CANARY_WORDS, canaryNote, canaryText, canaryWordFor, canaryWords } from '../../../shared/aiCanary'
import { CoverPage } from '../render/CoverPage'
import { COVER_DESIGNS, foxPrompt } from '../render/coverDesigns'

export default function EditorStep({ onLibrary }: { onLibrary?: () => void }): React.JSX.Element {
  const { worksheet: ws, update, updateBlock, undo, redo, past, future, activeSheetId, setActiveSheet, setStep } = useArbeitsblatt()
  const logo = useAppSettings((s) => s.logoDataUrl)
  const schoolName = useAppSettings((s) => s.settings.schoolName)

  /**
   * Zeichnet ein neues Maskottchen für das Deckblatt.
   * Nur auf Knopfdruck: Ein KI-Bild kostet spürbar Kontingent, und das Deckblatt steht auch
   * mit der mitgelieferten Zeichnung.
   */
  const makeFox = async (): Promise<void> => {
    try {
      const dataUrl = await window.api.ai.image(foxPrompt(ws?.meta.subjectLabel ?? '', ws?.meta.topic ?? ''))
      update((w) => (w.meta.coverImage = dataUrl))
      notifySuccess('Neues Deckblatt-Bild erzeugt.')
    } catch (e) {
      notifyError(e, 'Das Bild konnte nicht erzeugt werden')
    }
  }
  const citationStyle = useAppSettings((s) => s.settings.citationStyle)
  const [view, setView] = useState<'student' | 'key' | 'board' | 'audio'>('student')
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [picker, setPicker] = useState<string | null>(null)
  const [exportMode, setExportMode] = useState<null | 'docx' | 'pdf' | 'print'>(null)
  const [printHtml, setPrintHtml] = useState<string | null>(null)
  const [designs, setDesigns] = useState<DesignTemplate[]>([])
  // Beim Einschalten des KI-Tests fragt die App nach den Wörtern (siehe CanaryDialog)
  const [canaryOffen, setCanaryOffen] = useState(false)
  const { layouts, measure } = useSheetLayouts(ws, logo, schoolName)
  const docName = useArbeitsblatt((s) => s.docName)
  const savedAt = useArbeitsblatt((s) => s.savedAt)
  const setDocName = useArbeitsblatt((s) => s.setDocName)
  // Arbeitsblätter werden wie Vokabeltests automatisch in der App gesichert
  useWorksheetAutosave(logo, schoolName, layouts)

  /*
   * Die berechnete Seitenaufteilung fuer die Pruefwerkzeuge sichtbar machen.
   *
   * Der Export nimmt genau diese Karte. Ohne sie musste eine Wache das Druck-HTML mit einer
   * LEEREN Karte bauen – dann landet alles auf einer Seite, und ein falscher Umbruch faellt
   * nicht auf. Genau dieser Fehler wurde am 25.09.2026 gemeldet.
   */
  useEffect(() => {
    const w = window as unknown as { __selftest?: Record<string, unknown> }
    if (w.__selftest) w.__selftest.layouts = layouts
  }, [layouts])

  useEffect(() => {
    window.api.designs.list().then(setDesigns).catch(notifyError)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (t.isContentEditable || ['INPUT', 'TEXTAREA'].includes(t.tagName)) return
      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const sheet = ws?.sheets.find((s) => s.id === activeSheetId) ?? ws?.sheets[0]
  const profile = useMemo(() => (ws ? profileFromMeta(ws.meta) : null), [ws])
  const key = view === 'key'
  const hasAudio = Boolean(ws?.sheets.some((s) => s.blocks.some((b) => b.type === 'audio')))

  /** Hörtexte beim Export als MP3 neben das Dokument legen. */
  const saveAudioFiles = async (worksheet: Worksheet, name: string): Promise<void> => {
    const audios = worksheet.sheets.flatMap((s) => s.blocks.filter((b) => b.type === 'audio' && b.audio?.dataUrl))
    for (const block of audios) {
      if (block.type !== 'audio' || !block.audio?.dataUrl) continue
      const bytes = Uint8Array.from(atob(block.audio.dataUrl.split(',')[1]), (c) => c.charCodeAt(0))
      const saved = await window.api.files.save(`${name} - ${block.title || 'Hörtext'}.mp3`, [{ name: 'MP3-Datei', extensions: ['mp3'] }], bytes)
      if (saved) notifySuccess('Hörtext als MP3 gespeichert.')
    }
  }

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

  if (!ws || !sheet || !profile) return <Box p="xl">Noch kein Arbeitsblatt.</Box>

  const plans = layouts.get(layoutKey(sheet.id, key))
  const tasksPerPage = (layouts.get(layoutKey(sheet.id, false)) ?? []).map(
    (p) => p.items.filter((i) => !i.continued && sheet.blocks.find((b) => b.id === i.id)?.type === 'task').length
  )
  const pageWarnings = [
    ...checkTasksPerPage(tasksPerPage, profile),
    ...(plans ?? []).flatMap((p, i) =>
      p.overflow
        ? [
            {
              message: `Seite ${i + 1}: Ein Baustein ist größer als die Seite.`
            }
          ]
        : []
    )
  ]
  const combined = ws.meta.differentiation.levels > 1 && ws.meta.differentiation.mode === 'combined'
  const baseName = safeFileName(`${ws.meta.subjectLabel} - ${ws.meta.title || ws.meta.topic}`)

  const moveBlock = (id: string, delta: number): void =>
    update((d) => {
      const blocks = d.sheets.find((s) => s.id === sheet.id)!.blocks
      const i = blocks.findIndex((b) => b.id === id)
      const j = i + delta
      if (i < 0 || j < 0 || j >= blocks.length) return
      const [b] = blocks.splice(i, 1)
      blocks.splice(j, 0, b)
    })

  /** Ersetzt den Baustein durch einen neuen Entwurf; der bisherige Stand bleibt abrufbar. */
  const reviseBlock = (block: WsBlock, instruction = ''): void => {
    void withBusy(block.id, async () => {
      const fresh = await regenerateBlock(ws, sheet, block.id, profile, aiCall, '', instruction)
      await completeOriginalSources([fresh], browserSourceServices())
      // Neuer Bild-Entwurf: passendes Bild suchen (auch bei „selbst wählen“, weil die Lehrkraft den Entwurf ausdrücklich anfordert)
      if (fresh.type === 'image')
        await completeWorksheetImages(
          [fresh],
          {
            ...ws.meta,
            imageSource: ws.meta.imageSource === 'placeholder' ? 'auto' : ws.meta.imageSource
          },
          await browserWorksheetImageDeps()
        )
      replaceBlock(block.id, (current) => addVersion(current, fresh))
    })
  }
  /**
   * Füllt einen noch leeren Baustein mit KI-Inhalt.
   *
   * Wunsch der Lehrkraft (25.09.2026): „füge einen zauberstab in ‚bearbeiten & export' bei
   * einem noch leeren baustein hinzu, wodurch der inhalt hier von einer KI gefüllt wird."
   *
   * Ohne Rückfrage: Wer einen leeren Kasten an eine bestimmte Stelle setzt, hat die Absicht
   * schon gefasst – der Zusammenhang steht ringsum. Passt das Ergebnis nicht, führt der
   * Überarbeiten-Knopf daneben mit einem eigenen Auftrag weiter.
   */
  const fillBlock = (block: WsBlock): void => {
    void withBusy(block.id, async () => {
      const fresh = await fuelleBaustein(ws, sheet, block.id, profile, aiCall)
      await completeOriginalSources([fresh], browserSourceServices())
      if (fresh.type === 'image')
        await completeWorksheetImages(
          [fresh],
          { ...ws.meta, imageSource: ws.meta.imageSource === 'placeholder' ? 'auto' : ws.meta.imageSource },
          await browserWorksheetImageDeps()
        )
      replaceBlock(block.id, (current) => addVersion(current, fresh))
      notifySuccess('Der Baustein wurde gefüllt.')
    })
  }

  /**
   * Lässt die KI ein gelöstes Beispiel (Punkt 0) zur Aufgabe schreiben.
   *
   * Eigener Busy-Schlüssel, damit der Knopf lädt und nicht der ganze Baustein ausgraut –
   * die Aufgabe selbst bleibt dabei unverändert.
   */
  const addExample = (block: WsBlock): void => {
    if (block.type !== 'task') return
    void withBusy(`beispiel-${block.id}`, async () => {
      const example = await generateExample(block, ws.meta, aiCall)
      updateBlock(sheet.id, block.id, (d) => {
        if (d.type === 'task') d.example = example
      })
    })
  }

  /**
   * Legt zu einem Textbaustein eine HOERFASSUNG an.
   *
   * Entscheidung der Lehrkraft (22.09.2026): Ausserhalb der Fremdsprachen ist Hoeren KEIN
   * eigener Kompetenzschwerpunkt, sondern eine Darbietungsform am Material. Die Aufgabe
   * bleibt eine Fachaufgabe; nur der Weg zum Text aendert sich. Das entspricht der
   * Rechtslage: Nur Deutsch und Musik haben ausserhalb der Sprachen einen eigenen
   * Hoer-Kompetenzbereich.
   *
   * Der Text wird NICHT umgeschrieben – die Hoerfassung ist derselbe Text, nur vorgelesen.
   * Vertont wird erst auf Knopfdruck im Reiter „Hoertexte"; hier entsteht nur der Baustein.
   */
  const addReadAloud = (block: WsBlock): void => {
    if (block.type !== 'text' || !block.body.trim()) return
    const neuerBlock: WsBlock = {
      id: `${block.id}-hoerfassung`,
      type: 'audio',
      title: `${block.title || 'Material'} – Hörfassung`,
      textType: 'Vorgelesener Text',
      transcript: plainText(block.body),
      speakers: [{ id: `${block.id}-sp0`, name: 'Sprecher', voiceId: '', voiceName: '' }],
      // Im Sachfach ist die Aufnahme Material: so oft abrufbar wie nötig (didactics/audioRules.ts)
      plays: 0,
      beforeListening: '',
      seconds: estimateSeconds(plainText(block.body))
    }
    update((d) => {
      const blocks = d.sheets.find((s) => s.id === sheet.id)?.blocks
      if (!blocks) return
      const i = blocks.findIndex((b) => b.id === block.id)
      blocks.splice(i + 1, 0, neuerBlock)
    })
    notifySuccess('Hörfassung angelegt. Im Reiter „Hörtexte" lässt sie sich vertonen.')
  }

  const replaceBlock = (blockId: string, fn: (current: WsBlock) => WsBlock): void =>
    updateBlock(sheet.id, blockId, (d) => {
      const next = fn(structuredClone(d))
      for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k]
      Object.assign(d, next)
    })

  const wrapBlock = (block: WsBlock, placed: PlacedItem, content: React.ReactNode): React.ReactNode => (
    <BausteinRahmen
      block={block}
      placed={placed}
      busy={busy.has(block.id)}
      onUpdate={(fn) => updateBlock(sheet.id, block.id, fn)}
      onMove={(richtung) => moveBlock(block.id, richtung)}
      extras={
        <>
          {!key && block.warnings && block.warnings.length > 0 && (
            <WarningButton warnings={block.warnings} onDismiss={() => updateBlock(sheet.id, block.id, (d) => (d.warnings = []))} />
          )}
          {!key && istLeer(block) && (
            <Tooltip label="Von der KI füllen lassen – passend zu dieser Stelle im Blatt" position="left" multiline w={260}>
              <ActionIcon
                className="editor-ai-fill"
                size="sm"
                variant="filled"
                color="grape"
                loading={busy.has(block.id)}
                aria-label="Baustein von der KI füllen lassen"
                onClick={() => fillBlock(block)}
              >
                <IconWand size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          {!key && <AiReviseButton block={block} busy={busy.has(block.id)} onRevise={(instruction) => reviseBlock(block, instruction)} />}
          <BlockSettings block={block} combined={combined} update={(fn) => updateBlock(sheet.id, block.id, fn)} />
          {block.type === 'image' && (
            <Tooltip label="Bild wählen" position="right">
              <ActionIcon size="sm" variant="default" onClick={() => setPicker(block.id)}>
                <IconPhoto size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          {/*
           * Gelöstes Beispiel (Punkt 0) – auf Knopfdruck von der KI, und einzeln wieder weg.
           * ÖSZ 2024 empfiehlt es für jede Aufgabenstellung; ob es hier trägt, entscheidet
           * die Lehrkraft an der fertigen Aufgabe. Deshalb nachträglich und je Aufgabe.
           */}
          {!key && block.type === 'task' && (
            <Tooltip label={block.example ? 'Gelöstes Beispiel entfernen' : 'Gelöstes Beispiel (0) von der KI hinzufügen'} position="right">
              <ActionIcon
                size="sm"
                variant="default"
                color={block.example ? 'red' : undefined}
                loading={busy.has(`beispiel-${block.id}`)}
                onClick={() => (block.example ? updateBlock(sheet.id, block.id, (d) => delete (d as TaskBlock).example) : addExample(block))}
              >
                {block.example ? <IconNumber0Small size={16} /> : <IconCircleNumber0 size={14} />}
              </ActionIcon>
            </Tooltip>
          )}
          {/*
           * Hoerfassung: nur bei Textbausteinen und nur, wo Hoeren NICHT selbst geprueft wird.
           * In den Sprachen waere ein vorgelesener Lesetext widersinnig – dort ist der Text
           * der Pruefgegenstand.
           */}
          {!key && block.type === 'text' && !hoerenIstPruefgegenstand(ws.meta.subjectId) && (
            <Tooltip label="Hörfassung anlegen (Text zum Anhören)" position="right">
              <ActionIcon size="sm" variant="default" onClick={() => addReadAloud(block)}>
                <IconHeadphones size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          {/* Der Tooltip erscheint nur unter der Maus – der Name gehört an den Knopf selbst */}
          <Tooltip label="Mit KI neu erzeugen (neuer Entwurf)" position="right">
            <ActionIcon size="sm" variant="default" aria-label="Mit KI neu erzeugen" loading={busy.has(block.id)} onClick={() => reviseBlock(block)}>
              <IconRefresh size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Löschen" position="right">
            <ActionIcon
              size="sm"
              variant="default"
              aria-label="Baustein löschen"
              color="red"
              onClick={() =>
                update(
                  (d) => (d.sheets.find((s) => s.id === sheet.id)!.blocks = d.sheets.find((s) => s.id === sheet.id)!.blocks.filter((b) => b.id !== block.id))
                )
              }
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </>
      }
    >
      {!placed.continued && !key && <VersionSwitcher block={block} onSwitch={(i) => replaceBlock(block.id, (current) => switchVersion(current, i))} />}
      {content}
    </BausteinRahmen>
  )

  // picker = Baustein-ID oder „Baustein-ID::Einzelbild-ID“ (Bildreihe)
  const [pickerBlockId, pickerItemId] = picker ? picker.split('::') : []
  const imageBlock = pickerBlockId ? sheet.blocks.find((b) => b.id === pickerBlockId) : undefined
  const pickerItem = imageBlock?.type === 'image' && pickerItemId ? imageBlock.items?.find((it) => it.id === pickerItemId) : undefined

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {measure}
      <Group px="md" py={8} gap="xs" className="app-toolbar">
        <Button size="xs" variant="default" leftSection={<IconArrowLeft size={14} />} onClick={() => setStep(1)}>
          Gliederung
        </Button>
        <Tooltip label="Rückgängig (Strg+Z)">
          <ActionIcon variant="default" onClick={undo} disabled={!past.length}>
            <IconArrowBackUp size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Wiederholen (Strg+Y)">
          <ActionIcon variant="default" onClick={redo} disabled={!future.length}>
            <IconArrowForwardUp size={16} />
          </ActionIcon>
        </Tooltip>
        <Divider orientation="vertical" />
        {ws.sheets.length > 1 && view !== 'board' && view !== 'audio' && (
          <SegmentedControl size="xs" value={sheet.id} onChange={setActiveSheet} data={ws.sheets.map((s) => ({ value: s.id, label: s.label }))} />
        )}
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(v) => setView(v as typeof view)}
          data={[
            { value: 'student', label: 'Arbeitsblatt' },
            { value: 'key', label: 'Lösungen' },
            { value: 'board', label: ws.board ? 'Tafelbild' : 'Tafelbild +' },
            ...(hasAudio ? [{ value: 'audio', label: 'Hörtexte' }] : [])
          ]}
        />
        {ws.meta.differentiation.levels > 1 && (
          <Checkbox
            size="xs"
            label="Sternchen zeigen"
            title="Niveaustufe (★/★★/★★★) auf den Blättern anzeigen"
            checked={ws.meta.showLevelMarks !== false}
            onChange={(e) => update((w) => (w.meta.showLevelMarks = e.currentTarget.checked))}
          />
        )}
        <Checkbox
          size="xs"
          label="Schulangaben"
          title="Schulname und Logo auf diesem Arbeitsblatt abdrucken – unabhängig von der Designvorlage"
          checked={ws.meta.showSchool !== false}
          onChange={(e) => update((w) => (w.meta.showSchool = e.currentTarget.checked))}
        />
        {/*
         * Blocksatz war bisher nur über die Designvorlage erreichbar. Die Belege sprechen
         * mehrheitlich für Flattersatz – Ofqual 2021, Cambridge International 2026,
         * leserlich.info (DIN 1450), Netzwerk Leichte Sprache; dagegen steht die
         * Handreichung des ISB Bayern 2012, die Blocksatz bei längeren Texten empfiehlt.
         * Weil die Quellen sich widersprechen, entscheidet die Lehrkraft – sichtbar und je
         * Arbeitsblatt. Bei Einfacher und Leichter Sprache bleibt es unabhängig davon aus.
         */}
        {/*
         * Korrekturrand: Erst am fertigen Blatt zeigt sich, ob der Platz gebraucht wird –
         * deshalb steht der Schalter hier und nicht in den Vorgaben vor dem Erzeugen.
         */}
        <Checkbox
          size="xs"
          label="Korrekturrand"
          title="Neben den Schreiblinien 45 mm für Korrekturzeichen freihalten; eine senkrechte Linie trennt den Streifen ab."
          checked={Boolean(ws.meta.correctionMargin)}
          onChange={(e) => {
            const an = e.currentTarget.checked
            update((w) => (w.meta.correctionMargin = an))
          }}
        />
        {/*
         * Notizrand neben den Materialtexten – gewuenscht am 24.09.2026, „wie beim
         * korrekturrand". Auch dieser Schalter steht am fertigen Blatt: Ob der Platz
         * gebraucht wird, zeigt sich erst, wenn man den Text vor sich hat.
         */}
        <Checkbox
          size="xs"
          label="Notizrand"
          title="Neben den Materialtexten 42 mm zum Mitschreiben freihalten; eine senkrechte Linie trennt den Streifen ab. Der Seitenumbruch verschiebt sich entsprechend."
          checked={Boolean(ws.meta.notesMargin)}
          onChange={(e) => {
            const an = e.currentTarget.checked
            update((w) => (w.meta.notesMargin = an))
          }}
        />
        <Checkbox
          size="xs"
          label="Blocksatz"
          title="Längere Texte im Blocksatz setzen. Flattersatz gilt als besser lesbar (Ofqual 2021, DIN 1450); bei Einfacher und Leichter Sprache ist Blocksatz immer aus."
          checked={ws.design.page.justifyText !== false}
          onChange={(e) => {
            const an = e.currentTarget.checked
            update((w) => (w.design.page.justifyText = an))
          }}
        />
        <Checkbox
          size="xs"
          label="Deckblatt"
          title="Ein Deckblatt als Seite 0 vor die Arbeitsblätter stellen – für Lehrkräfte, nicht für Lernende"
          checked={Boolean(ws.meta.coverPage)}
          onChange={(e) => update((w) => (w.meta.coverPage = e.currentTarget.checked))}
        />
        {ws.meta.coverPage && (
          <Select
            size="xs"
            w={150}
            data={COVER_DESIGNS.map((d) => ({
              value: d.id,
              label: `Deckblatt: ${d.label}`
            }))}
            value={ws.meta.coverDesign ?? COVER_DESIGNS[0].id}
            allowDeselect={false}
            onChange={(v) => v && update((w) => (w.meta.coverDesign = v))}
          />
        )}
        <Tooltip
          multiline
          w={320}
          label={
            ws.meta.aiCanary
              ? canaryNote(canaryWords(ws.meta.aiCanaryWords, canaryWordFor(`${ws.meta.title}|${ws.meta.topic}`)))
              : 'Setzt einen für Lernende unsichtbaren Satz auf das Schülerblatt, der ein Sprachmodell zu einem verräterischen Wort verleitet.'
          }
        >
          <Checkbox
            size="xs"
            label="KI-Test"
            checked={Boolean(ws.meta.aiCanary)}
            /*
             * Beim EINSCHALTEN wird nach den Wörtern gefragt, statt eines zu würfeln: Die
             * Lehrkraft sucht hinterher in den Abgaben danach, und nur sie weiß, welches Wort
             * im eigenen Unterricht ohnehin gerade vorkommt.
             */
            onChange={(e) => {
              if (e.currentTarget.checked) setCanaryOffen(true)
              else update((w) => (w.meta.aiCanary = false))
            }}
          />
        </Tooltip>
        <Select
          size="xs"
          w={170}
          data={designs.map((d) => ({
            value: d.id,
            label: `Design: ${d.name}`
          }))}
          value={designs.some((d) => d.id === ws.design.id) ? ws.design.id : null}
          placeholder="Design"
          onChange={(v) => {
            const d = designs.find((x) => x.id === v)
            if (d) update((w) => (w.design = structuredClone(d)))
          }}
        />
        <Box style={{ flex: 1 }} />
        {onLibrary && (
          <Tooltip label="Meine Arbeitsblätter">
            <ActionIcon variant="default" onClick={onLibrary} aria-label="Meine Arbeitsblätter">
              <IconFolder size={16} />
            </ActionIcon>
          </Tooltip>
        )}
        <TextInput
          size="xs"
          w={220}
          aria-label="Name in der App"
          placeholder={defaultWorksheetName(ws)}
          value={docName}
          onChange={(e) => setDocName(e.currentTarget.value)}
        />
        <Text size="xs" c="dimmed" w={104}>
          {savedAt ? `gesichert ${new Date(savedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'wird gesichert …'}
        </Text>
        <Button
          size="xs"
          variant="default"
          leftSection={<IconDeviceFloppy size={14} />}
          onClick={async () => {
            try {
              const path = await window.api.files.save(`${baseName}.arbeitsblatt`, WORKSHEET_FILTER, serializeWorksheet(ws))
              if (path) notifySuccess('Arbeitsblatt gespeichert.')
            } catch (e) {
              notifyError(e)
            }
          }}
        >
          Als Datei speichern
        </Button>
        <Button size="xs" leftSection={<IconFileTypeDocx size={14} />} onClick={() => setExportMode('docx')}>
          Word
        </Button>
        <Button size="xs" leftSection={<IconFileTypePdf size={14} />} onClick={() => setExportMode('pdf')}>
          PDF
        </Button>
        <Button size="xs" variant="light" leftSection={<IconPrinter size={14} />} onClick={() => setExportMode('print')}>
          Drucken
        </Button>
        {/*
         * Hinweise der KI und der Prüfungen: als Symbol, nicht als Kasten.
         *
         * Wunsch der Lehrkraft (25.09.2026): „nach erstellung von material sind die
         * rot/orangenen kästen mit warnhinweisen für die nutzer inzwischen sehr lang. Mach es
         * aufrufbar über ein rotes Ausrufezeichen Symbol … Zeige die Warnhinweise nicht mehr
         * nach Erstellung der materialien, nur über das symbol."
         *
         * Der Kasten stand über dem Blatt und wuchs mit jedem Hinweis – bei einem vollen
         * Arbeitsblatt schob er die erste Seite aus dem Bild.
         */}
        <BlattHinweise note={ws.meta.teacherNote} warnings={pageWarnings.map((w) => w.message)} />
      </Group>

      <ScrollArea style={{ flex: 1 }} className="editor-canvas">
        <Stack align="center" py="lg" gap="md">
          {view === 'board' && <BoardPanel ws={ws} profile={profile} />}
          {view === 'audio' && <AudioPanel ws={ws} />}
          {view === 'student' && ws.meta.coverPage && (
            <FitToWidth className="ws-editor-pages">
              <CoverPage
                ws={ws}
                onChange={(fn) => update(fn)}
                onRegenerateFox={() => void makeFox()}
                // Einzelne Seiten statt ganzer Blaetter – siehe `vorschauSeiten`
                previews={vorschauSeiten((layouts.get(`${ws.sheets[0].id}:print`) ?? []).length).map((i) => (
                  <SheetPages
                    key={i}
                    ws={ws}
                    sheet={ws.sheets[0]}
                    plans={[(layouts.get(`${ws.sheets[0].id}:print`) ?? [])[i]]}
                    info={pageInfoFor(ws, ws.sheets[0], logo, schoolName, false, citationStyle)}
                    context={contextFor(ws, ws.sheets[0], 'print')}
                  />
                ))}
              />
            </FitToWidth>
          )}
          {view !== 'board' && view !== 'audio' && (
            <FitToWidth className={`ws-editor-pages ${key ? 'editor-sheet-key' : ''}`}>
              <SheetPages
                ws={ws}
                sheet={sheet}
                plans={plans}
                info={pageInfoFor(ws, sheet, logo, schoolName, key, citationStyle)}
                context={contextFor(ws, sheet, key ? 'keyEdit' : 'edit', {
                  update: (id, fn) => updateBlock(sheet.id, id, fn),
                  actions: {
                    pickImage: (blockId, itemId) => setPicker(itemId ? `${blockId}::${itemId}` : blockId)
                  }
                })}
                wrapBlock={wrapBlock}
              />
            </FitToWidth>
          )}
          {view === 'student' && (
            <Menu shadow="md" position="top">
              <Menu.Target>
                <Button variant="light" leftSection={<IconPlus size={16} />}>
                  Baustein hinzufügen
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {Object.entries(BLOCK_LABELS).map(([type, label]) => (
                  <Menu.Item key={type} onClick={() => update((d) => d.sheets.find((s) => s.id === sheet.id)!.blocks.push(newBlock(type as WsBlockType)))}>
                    {label}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          )}
          {view !== 'board' && (
            <Text size="xs" c="dimmed" pb="lg">
              Texte anklicken zum Bearbeiten · Formatierung: **fett**, $Formel$ · In der Lösungsansicht richtige Antworten per Klick markieren
            </Text>
          )}
        </Stack>
      </ScrollArea>

      {imageBlock?.type === 'image' && (
        <ImagePicker
          opened
          keywords={(pickerItem ? [pickerItem.search ?? '', pickerItem.description] : [imageBlock.search ?? '', imageBlock.description, ws.meta.topic]).filter(
            Boolean
          )}
          sourceSearch={imageBlock.original && !pickerItem ? imageBlock.search : undefined}
          materialImages={ws.sources.filter((s) => s.kind === 'image' && s.pageImages[0]).map((s) => ({ name: s.fileName, dataUrl: s.pageImages[0] }))}
          onClose={() => setPicker(null)}
          onPick={(img) =>
            updateBlock(sheet.id, imageBlock.id, (d) => {
              if (d.type !== 'image') return
              const item = pickerItemId ? d.items?.find((it) => it.id === pickerItemId) : undefined
              if (item) item.image = img
              else d.image = img
            })
          }
        />
      )}

      <CanaryDialog
        offen={canaryOffen}
        vorschlag={canaryWordFor(`${ws.meta.title}|${ws.meta.topic}`)}
        wert={ws.meta.aiCanaryWords ?? ''}
        onAbbruch={() => setCanaryOffen(false)}
        onFertig={(woerter) => {
          update((w) => {
            w.meta.aiCanary = true
            w.meta.aiCanaryWords = woerter
          })
          setCanaryOffen(false)
        }}
      />
      <PrintPreview html={printHtml} title={`Drucken – ${ws.meta.title || 'Arbeitsblatt'}`} onClose={() => setPrintHtml(null)} />
      <ExportModal
        mode={exportMode}
        onClose={() => setExportMode(null)}
        run={async (sheetIds, keyMode, includeBoard, fillable) => {
          const deps = browserDocxDeps(logo, schoolName)
          const nurTafelbild = !sheetIds.length
          const suffix = nurTafelbild
            ? ' - Tafelbild'
            : ws.sheets.length > 1
              ? ` - ${ws.sheets
                  .filter((s) => sheetIds.includes(s.id))
                  .map((s) => '★'.repeat(s.stars ?? 1))
                  .join(' ')}`
              : ''
          // Wohin das Tafelbild gehört, entscheidet `tafelbildZiel` – dieselbe Funktion beschriftet den Dialog
          const tafel = tafelbildZiel({
            tafelbild: includeBoard,
            blaetter: sheetIds.length,
            loesungen: keyMode,
            ausgabe: exportMode ?? 'pdf'
          })
          if (exportMode === 'print') {
            // Druckvorschau mit Seitenansicht; eigene Lösungsdatei gibt es beim Drucken nicht
            setPrintHtml(
              buildWorksheetHtml(
                ws,
                layouts,
                {
                  sheetIds,
                  includeKey: keyMode === 'append',
                  includeBoard: tafel.hauptdokument
                },
                logo,
                schoolName
              )
            )
          } else if (exportMode === 'pdf') {
            /*
             * Hörtexte wandern als Dateianlage ins PDF und bekommen dort einen Abspieler.
             * Die Anlage sehen Acrobat, Chrome, Edge, Firefox und Okular; der Abspieler
             * erscheint in Acrobat, Firefox, Foxit und Okular. Deshalb steht der Hinweis
             * auch im Seiteninhalt – siehe `main/services/export/audioInPdf.ts`.
             */
            const hoertexte = ws.sheets
              .flatMap((s) => s.blocks)
              .filter((b) => b.type === 'audio' && b.audio?.dataUrl)
              .map((b) => {
                const block = b as Extract<typeof b, { type: 'audio' }>
                const url = block.audio!.dataUrl!
                return {
                  id: block.id,
                  fileName: block.audio!.fileName || `${safeFileName(block.title || 'Hoertext')}.mp3`,
                  title: block.title || 'Hörtext',
                  base64: url.slice(url.indexOf(',') + 1)
                }
              })
            const path = await window.api.exporter.pdf(
              buildWorksheetHtml(
                ws,
                layouts,
                {
                  sheetIds,
                  includeKey: keyMode === 'append',
                  includeBoard: tafel.hauptdokument,
                  audioAttached: hoertexte.length > 0
                },
                logo,
                schoolName
              ),
              `${baseName}${suffix}${fillable ? ' - ausfuellbar' : ''}.pdf`,
              { fillable, audio: hoertexte }
            )
            // Das Lösungsblatt bleibt immer ein Abbild – dort ist nichts auszufüllen
            if (path && keyMode === 'separate')
              await window.api.exporter.pdf(
                buildWorksheetHtml(
                  ws,
                  layouts,
                  {
                    sheetIds,
                    includeKey: false,
                    keyOnly: true,
                    includeBoard: tafel.loesungsdatei
                  },
                  logo,
                  schoolName
                ),
                `${baseName}${suffix} - Lösungen.pdf`
              )
            if (path && tafel.eigeneDatei)
              await window.api.exporter.pdf(
                buildWorksheetHtml(ws, layouts, { sheetIds: [], includeKey: false, includeBoard: true }, logo, schoolName),
                `${baseName} - Tafelbild.pdf`
              )
            if (path)
              notifySuccess(
                [fillable ? 'Ausfüllbares PDF gespeichert.' : 'PDF gespeichert.', hoertexte.length ? `${hoertexte.length} Hörtext(e) im PDF enthalten.` : '']
                  .filter(Boolean)
                  .join(' ')
              )
          } else {
            const filters = [{ name: 'Word-Dokument', extensions: ['docx'] }]
            const data = await buildWorksheetDocx(
              ws,
              {
                sheetIds,
                includeKey: keyMode === 'append',
                includeBoard: tafel.hauptdokument
              },
              deps
            )
            const path = await window.api.files.save(`${baseName}${suffix}.docx`, filters, data)
            if (path && keyMode === 'separate') {
              await window.api.files.save(
                `${baseName}${suffix} - Lösungen.docx`,
                filters,
                await buildWorksheetDocx(
                  ws,
                  {
                    sheetIds,
                    includeKey: false,
                    keyOnly: true,
                    includeBoard: tafel.loesungsdatei
                  },
                  deps
                )
              )
            }
            if (path && tafel.eigeneDatei) {
              await window.api.files.save(
                `${baseName} - Tafelbild.docx`,
                filters,
                await buildWorksheetDocx(ws, { sheetIds: [], includeKey: false, includeBoard: true }, deps)
              )
            }
            if (path) notifySuccess('Word-Dokument gespeichert.')
          }
          if (exportMode !== 'print') await saveAudioFiles(ws, baseName)
        }}
        sheets={ws.sheets.map((s) => ({ id: s.id, label: s.label }))}
        defaultKey={ws.meta.answerKey ? 'separate' : 'none'}
        hasBoard={Boolean(ws.board)}
        boardFirst={view === 'board'}
      />
    </Box>
  )
}

/**
 * Fragt nach den Wörtern des KI-Tests.
 *
 * Wunsch der Lehrkraft (25.09.2026): „wenn man den ki test oben aktiviert, frage den nutzer
 * welche wörter als test benutzt werden sollen."
 *
 * Vorher würfelte das Programm ein Wort aus Titel und Thema. Das ist bequem, aber die
 * Lehrkraft sucht hinterher in den Abgaben danach – und nur sie weiß, ob ein Wort im eigenen
 * Unterricht gerade ohnehin vorkommt und als Test damit wertlos wäre.
 *
 * Der Satz, der auf dem Blatt landet, steht im Dialog. Ein unsichtbarer Text auf dem
 * Schülermaterial sollte nichts sein, das man erst im fertigen PDF entdeckt.
 */
/**
 * Die Hinweise zum ganzen Blatt hinter einem roten Ausrufezeichen.
 *
 * Getrennt gehalten: Was die KI der Lehrkraft mitteilt (`teacherNote`), steht oben; darunter
 * die Befunde der Prüfungen. Beides zusammen wurde als Kasten zu lang, verschwinden soll es
 * aber nicht – ein übersehener Hinweis ist genau das, was später auf dem Blatt auffällt.
 */
function BlattHinweise({ note, warnings }: { note?: string; warnings: string[] }): React.JSX.Element | null {
  const [offen, setOffen] = useState(false)
  const anzahl = warnings.length + (note?.trim() ? 1 : 0)
  if (!anzahl) return null
  return (
    <>
      <Tooltip label={`${anzahl} Hinweis${anzahl === 1 ? '' : 'e'} für die Lehrkraft`}>
        <ActionIcon size="lg" variant="light" color="red" aria-label="Hinweise für die Lehrkraft anzeigen" onClick={() => setOffen(true)}>
          <IconAlertTriangle size={18} />
        </ActionIcon>
      </Tooltip>
      <Modal opened={offen} onClose={() => setOffen(false)} title="Hinweise für die Lehrkraft" size="lg">
        <Stack gap="sm">
          {note?.trim() && (
            <Alert variant="light" color="blue" title="Hinweis der KI">
              <Text size="sm">{note}</Text>
            </Alert>
          )}
          {warnings.length > 0 && (
            <Stack gap={6}>
              <Text size="sm" fw={600}>
                {warnings.length === 1 ? 'Ein Befund der Prüfung' : `${warnings.length} Befunde der Prüfung`}
              </Text>
              {warnings.map((w, i) => (
                <Text key={i} size="sm">
                  · {w}
                </Text>
              ))}
            </Stack>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOffen(false)}>
              Schließen
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

function CanaryDialog({
  offen,
  vorschlag,
  wert,
  onAbbruch,
  onFertig
}: {
  offen: boolean
  vorschlag: string
  wert: string
  onAbbruch: () => void
  onFertig: (woerter: string) => void
}): React.ReactElement {
  const [text, setText] = useState(wert)
  // Beim Öffnen mit dem Vorschlag beginnen, wenn noch nichts gewählt wurde
  useEffect(() => {
    if (offen) setText(wert || vorschlag)
  }, [offen, wert, vorschlag])

  const woerter = canaryWords(text, vorschlag)
  return (
    <Modal opened={offen} onClose={onAbbruch} title="Wörter für den KI-Test" size="lg">
      <Stack gap="sm">
        <Text size="sm">
          Auf dem Schülerblatt steht ein für Lernende unsichtbarer Satz, der ein Sprachmodell dazu bringt, diese Wörter einzubauen. Tauchen sie in einer Abgabe
          auf, ist der Blatttext durch eine KI gelaufen.
        </Text>
        <TextInput
          label={`Wort oder Wörter (durch Komma getrennt, höchstens ${CANARY_MAX})`}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          data-autofocus
        />
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            Vorschläge:
          </Text>
          {CANARY_WORDS.map((w) => (
            <Button key={w} size="compact-xs" variant="light" onClick={() => setText(w)}>
              {w}
            </Button>
          ))}
        </Group>
        <Alert variant="light" color="gray">
          <Text size="xs">Auf dem Blatt steht dann unsichtbar: „{canaryText(woerter)}"</Text>
        </Alert>
        {/*
         * Was der Test leistet und was nicht – vor dem Einschalten, nicht erst hinterher.
         *
         * Die Angaben stammen aus der Recherche vom 25.09.2026: Die Model Spec von OpenAI
         * entzieht Anweisungen aus Dateianhängen ausdrücklich die Verbindlichkeit, und
         * Reasoning-Modelle erkennen versteckte Fremdanweisungen. Eine Lehrkraft, die das
         * nicht weiß, hält einen fehlenden Treffer für einen Freispruch.
         */}
        <Alert variant="light" color="yellow" title="Was der Test leisten kann">
          <Text size="xs">
            Ein Treffer ist ein <b>Indiz für das Gespräch</b>, kein Nachweis. Am ehesten wirkt der Test, wenn der Aufgabentext kopiert und eingefügt wird. Beim
            Hochladen der PDF-Datei behandeln ChatGPT und Claude Anweisungen aus Anhängen regelgemäß als bloße Information; beim Abfotografieren geht der Satz
            gar nicht mit. Wer eine Vorlesefunktion nutzt, bekommt ihn vorgelesen – die Vorgabe ist deshalb bewusst harmlos und ändert nichts an der Lösung.
          </Text>
        </Alert>
        <Group justify="flex-end">
          <Button variant="default" onClick={onAbbruch}>
            Abbrechen
          </Button>
          <Button onClick={() => onFertig(woerter.join(', '))} disabled={!woerter.length}>
            KI-Test einschalten
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function ExportModal({
  mode,
  onClose,
  run,
  sheets,
  defaultKey,
  hasBoard,
  boardFirst
}: {
  mode: null | 'docx' | 'pdf' | 'print'
  onClose: () => void
  run: (sheetIds: string[], key: 'none' | 'append' | 'separate', includeBoard: boolean, fillable: boolean) => Promise<void>
  sheets: { id: string; label: string }[]
  defaultKey: 'none' | 'separate'
  hasBoard: boolean
  /** Aus dem Reiter „Tafelbild“ geöffnet: nur das Tafelbild vorauswählen */
  boardFirst: boolean
}): React.JSX.Element {
  const [sheetIds, setSheetIds] = useState(sheets.map((s) => s.id))
  const [key, setKey] = useState<'none' | 'append' | 'separate'>(defaultKey)
  const [board, setBoard] = useState(false)
  /** PDF mit Formularfeldern statt reinem Abbild */
  const [fillable, setFillable] = useState(false)
  const [running, setRunning] = useState(false)
  useEffect(() => setSheetIds(sheets.map((s) => s.id)), [sheets.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mode === null) return
    setBoard(hasBoard && boardFirst)
    setSheetIds(boardFirst && hasBoard ? [] : sheets.map((s) => s.id))
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal opened={mode !== null} onClose={onClose} title={mode === 'docx' ? 'Als Word-Dokument speichern' : mode === 'pdf' ? 'Als PDF speichern' : 'Drucken'}>
      <Stack>
        {sheets.length > 1 && (
          <Checkbox.Group label="Niveaustufen" value={sheetIds} onChange={setSheetIds}>
            <Group mt={4}>
              {sheets.map((s) => (
                <Checkbox key={s.id} value={s.id} label={s.label} />
              ))}
            </Group>
          </Checkbox.Group>
        )}
        {sheets.length === 1 && hasBoard && (
          <Checkbox label="Arbeitsblatt" checked={sheetIds.length > 0} onChange={(e) => setSheetIds(e.currentTarget.checked ? sheets.map((s) => s.id) : [])} />
        )}
        {hasBoard && (
          <Checkbox
            label="Tafelbild (Seite für die Lehrkraft)"
            /*
             * Wohin das Tafelbild wandert, hängt von der Lösungswahl ab. Das gehört in den
             * Dialog: Sonst sucht die Lehrkraft es später in der Datei, die sie austeilt.
             */
            description={tafelbildHinweis({
              blaetter: sheetIds.length,
              loesungen: key,
              ausgabe: mode ?? 'pdf'
            })}
            checked={board}
            onChange={(e) => setBoard(e.currentTarget.checked)}
          />
        )}
        {/*
         * Ausfüllbares PDF: Auf den Schreiblinien lässt sich tippen, Kästchen lassen sich
         * ankreuzen. Nur beim PDF sinnvoll – gedruckt wird ohnehin mit dem Stift ausgefüllt,
         * und Word ist von Haus aus beschreibbar.
         */}
        {mode === 'pdf' && (
          <Checkbox
            label="Zum Ausfüllen am Gerät"
            description="Schreiblinien werden zu Textfeldern, Kästchen zum Ankreuzen. Das Blatt lässt sich dann digital bearbeiten und zurückschicken."
            checked={fillable}
            onChange={(e) => {
              const an = e.currentTarget.checked
              setFillable(an)
            }}
          />
        )}
        {sheetIds.length > 0 && (
          <Radio.Group label="Lösungen" value={key} onChange={(v) => setKey(v as typeof key)}>
            <Stack gap={6} mt={4}>
              <Radio value="none" label="ohne Lösungen" />
              <Radio value="append" label="Lösungsseiten anhängen" />
              {mode !== 'print' && <Radio value="separate" label="Lösungen als eigene Datei" />}
              {mode === 'print' && key === 'separate' && (
                <Text size="xs" c="dimmed">
                  Beim Drucken werden Lösungen nur mit „Lösungsseiten anhängen“ ausgegeben.
                </Text>
              )}
            </Stack>
          </Radio.Group>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            loading={running}
            disabled={!sheetIds.length && !board}
            onClick={async () => {
              setRunning(true)
              try {
                await run(sheetIds, sheetIds.length ? key : 'none', board, fillable)
                onClose()
              } catch (e) {
                notifyError(e, 'Export fehlgeschlagen')
              } finally {
                setRunning(false)
              }
            }}
          >
            {mode === 'print' ? 'Weiter zur Druckvorschau' : 'Speichern …'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
