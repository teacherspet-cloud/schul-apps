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
  Popover,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip
} from '@mantine/core'
import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconArrowLeft,
  IconDeviceFloppy,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconPhoto,
  IconPlus,
  IconPrinter,
  IconCircleNumber0,
  IconCopy,
  IconHeadphones,
  IconNumber0Small,
  IconTrash,
  IconWand
} from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import type { DesignTemplate } from '@shared/design'
import ImagePicker from '../../../shared/components/ImagePicker'
import PrintPreview from '../../../shared/components/PrintPreview'
import { LoesungsWahl, loesungsVorgabe, merkeLoesungsWahl, type LoesungsModus } from '../../../shared/components/LoesungsWahl'
import { speichereAusgabe, WORD_FILTER, type AusgabeDatei } from '../../../shared/export/ausgabe'
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
import { BLOCK_LABELS, dupliziereBaustein, istLeer, newBlock } from '../model/factory'
import { anredeFuerMeta } from '../didactics/anrede'
import type { SeitenVorschlag, TaskBlock, Worksheet, WsBlock, WsBlockType } from '../model/types'
import { serializeWorksheet, WORKSHEET_FILTER } from '../project'
import { BausteinRahmen } from '../render/BausteinRahmen'
import type { PlacedItem } from '../render/paginate'
import { buildWorksheetHtml } from '../render/printHtml'
import { tafelbildHinweis, tafelbildZiel } from '../export/tafelbildZiel'
import { contextFor, layoutKey, pageInfoFor, profileFromMeta, SheetPages, useSheetLayouts } from '../render/SheetPages'
import { deckblattVorschau } from '../render/deckblattVorschau'
import { deckblattBilder } from '../render/deckblattBilder'
import { DeckblattSeitenwahl, DeckblattWerkzeuge } from './DeckblattWerkzeuge'
import UeberthemaFeld from '../../../shared/components/UeberthemaFeld'
import { useThemenbereich } from '../../../shared/themenbereiche'
import { mitThemenbereich } from '../../../shared/ueberthema'
import '../render/ws.css'
import { useArbeitsblatt } from '../store'
import { bausteinAuftrag, hinweiseBeheben, maskottchenZeichnen } from '../auftraege'
import { useLaufendeSchluessel } from '../../../shared/auftraege'
import { defaultWorksheetName, setPreviewLayouts } from '../library'
import UndoRedoButtons from '../../../shared/components/UndoRedoButtons'
import '../../vokabeltest/steps/editor.css'
import { BlockSettings } from './BlockSettings'
import WarningButton from '../../../shared/components/WarningButton'
import { AlleBehebenKnopf, KiBehebenKnopf } from '../../../shared/components/KiBeheben'
import { istBehebbar } from '../../../shared/kiBeheben'
import { KiMenue, VersionSwitcher } from './BlockRevision'
import { EinfuegenUntermenue } from './EinfuegenMenue'
import { AudioPanel } from './AudioPanel'
import { BoardPanel } from './BoardPanel'
import { addVersion, switchVersion } from '../model/versions'
import { seitenAbweichung } from '../didactics/seiten'
import SeitenHinweis from './SeitenHinweis'
import { browserSourceServices, completeOriginalSources } from '../generation/originalSources'
import { browserWorksheetImageDeps } from '../generation/browserImages'
import { completeWorksheetImages } from '../generation/worksheetImages'
import { CANARY_MAX, CANARY_WORDS, canaryNote, canaryText, canaryWordFor, canaryWords } from '../../../shared/aiCanary'
import { CoverPage } from '../render/CoverPage'
import VorlagenfarbeSchalter from '../../../shared/components/VorlagenfarbeSchalter'
import { useDruck } from '../../../shared/navigation'

export default function EditorStep(): React.JSX.Element {
  const { worksheet: gespeichert, update, updateBlock, undo, redo, verlauf, activeSheetId, setActiveSheet, setStep } = useArbeitsblatt()
  const logo = useAppSettings((s) => s.logoDataUrl)
  const schoolName = useAppSettings((s) => s.settings.schoolName)
  /*
   * Überthema (Paket 11): Der Themenbereich, in dem das Blatt liegt, steht im Kopf. Er wird nur
   * zum Anzeigen eingesetzt – Vorschau, Druck, PDF und Word nehmen dieses `ws` – und folgt so
   * sofort einem Umbenennen oder Verschieben in der Bibliothek.
   */
  const bereich = useThemenbereich(
    'arbeitsblatt',
    useArbeitsblatt((s) => s.docId)
  )
  const ws = useMemo(() => (gespeichert ? mitThemenbereich(gespeichert, bereich?.name) : gespeichert), [gespeichert, bereich?.name])
  // Seitenwahl des Deckblatts: offen, und ggf. welche Seite ausgetauscht wird
  const [seitenwahl, setSeitenwahl] = useState<{ tausch: string | null } | null>(null)
  const citationStyle = useAppSettings((s) => s.settings.citationStyle)
  // Nur zum Neuzeichnen: pageInfoFor liest die Fachfarbe außerhalb von React (shared/fachfarben.ts)
  useAppSettings((s) => s.settings.fachfarben)
  const [view, setView] = useState<'student' | 'key' | 'board' | 'audio'>('student')
  // Ausgeblendete Hinweise zur Seitenzahl („Blatt:Seitenzahl“) – eine neue Abweichung erscheint wieder
  const [seitenAus, setSeitenAus] = useState<string[]>([])
  // Bausteine, an denen gerade ein kleiner Auftrag arbeitet (überarbeiten, füllen, Beispiel)
  const busy = useLaufendeSchluessel(useArbeitsblatt((s) => s.docId))
  const [picker, setPicker] = useState<string | null>(null)
  const [exportMode, setExportMode] = useState<null | 'docx' | 'pdf' | 'print'>(null)
  // Strg+P öffnet denselben Druckdialog wie der Knopf „Drucken“
  useDruck('arbeitsblatt', () => setExportMode('print'))
  const [druck, setDruck] = useState<{ html: string; loesung: { html: string; titel: string } | null } | null>(null)
  const [designs, setDesigns] = useState<DesignTemplate[]>([])
  // Beim Einschalten des KI-Tests fragt die App nach den Wörtern (siehe CanaryDialog)
  const [canaryOffen, setCanaryOffen] = useState(false)
  const [optionenOffen, setOptionenOffen] = useState(false)
  const { layouts, measure } = useSheetLayouts(ws, logo, schoolName)
  const docName = useArbeitsblatt((s) => s.docName)
  const savedAt = useArbeitsblatt((s) => s.savedAt)
  const setDocName = useArbeitsblatt((s) => s.setDocName)
  // Gesichert wird im Programm (ab Schritt 1); der Editor liefert nur die Seiten fürs Vorschaubild
  useEffect(() => {
    setPreviewLayouts(layouts)
    return () => setPreviewLayouts(null)
  }, [layouts])

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

  const sheet = ws?.sheets.find((s) => s.id === activeSheetId) ?? ws?.sheets[0]
  const profile = useMemo(() => (ws ? profileFromMeta(ws.meta) : null), [ws])
  const key = view === 'key'
  const hasAudio = Boolean(ws?.sheets.some((s) => s.blocks.some((b) => b.type === 'audio')))

  /** Hörtexte beim Export als MP3 neben das Dokument legen – als Teil derselben Ausgabe (ein Ordner). */
  const audioDateien = (worksheet: Worksheet, name: string): AusgabeDatei[] =>
    worksheet.sheets
      .flatMap((s) => s.blocks)
      .flatMap((block) =>
        block.type === 'audio' && block.audio?.dataUrl
          ? [
              {
                name: `${name} - ${safeFileName(block.title || 'Hörtext')}.mp3`,
                filter: [{ name: 'MP3-Datei', extensions: ['mp3'] }],
                daten: Uint8Array.from(atob(block.audio.dataUrl.split(',')[1]), (c) => c.charCodeAt(0))
              }
            ]
          : []
      )

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
  /*
   * Seitenvorgabe eingehalten? Gezählt werden die gesetzten Aufgaben- und Materialseiten des
   * Schülerblatts – die Schlussseiten (Hilfekarten usw.) plant `paginate` nicht mit (Paket 7).
   */
  const gezaehlteSeiten = (layouts.get(layoutKey(sheet.id, false)) ?? []).length
  const abweichung = seitenAbweichung(ws.meta, sheet, gezaehlteSeiten)
  const abweichungsSchluessel = `${sheet.id}:${gezaehlteSeiten}`
  const baseName = safeFileName(`${ws.meta.subjectLabel} - ${ws.meta.title || ws.meta.topic}`)
  // Seiten für das Deckblatt – dieselben, die Druck und Word nehmen (render/deckblattVorschau.tsx)
  const deckblatt = ws.meta.coverPage ? deckblattVorschau(ws, layouts, logo, schoolName, citationStyle) : null

  const moveBlock = (id: string, delta: number): void =>
    update((d) => {
      const blocks = d.sheets.find((s) => s.id === sheet.id)!.blocks
      const i = blocks.findIndex((b) => b.id === id)
      const j = i + delta
      if (i < 0 || j < 0 || j >= blocks.length) return
      const [b] = blocks.splice(i, 1)
      blocks.splice(j, 0, b)
    })

  /*
   * Die KI-Aktionen an einem Baustein laufen als kleine Aufträge (../auftraege.ts): Sie
   * erscheinen in der Auftragsleiste, blockieren nichts und ändern am Ende nur ihren Baustein
   * – auch wenn inzwischen ein anderes Blatt offen ist.
   */
  const docId = useArbeitsblatt.getState().docId

  /** Ersetzt den Baustein durch einen neuen Entwurf; der bisherige Stand bleibt abrufbar. */
  const reviseBlock = (block: WsBlock, instruction = ''): void =>
    bausteinAuftrag(ws, docId, 'Baustein neu erzeugen', block.id, block.id, async (w, k) => {
      const blatt = w.sheets.find((s) => s.id === sheet.id) ?? sheet
      const fresh = await regenerateBlock(w, blatt, block.id, profile, k.ai, '', instruction)
      await completeOriginalSources([fresh], browserSourceServices())
      // Neuer Bild-Entwurf: passendes Bild suchen (auch bei „selbst wählen“, weil die Lehrkraft den Entwurf ausdrücklich anfordert)
      if (fresh.type === 'image')
        await completeWorksheetImages(
          [fresh],
          {
            ...w.meta,
            imageSource: w.meta.imageSource === 'placeholder' ? 'auto' : w.meta.imageSource
          },
          await browserWorksheetImageDeps({ ai: k.ai, bild: k.bild })
        )
      return (current) => addVersion(current, fresh)
    })
  /**
   * Vorschlag aus dem Hinweis zur Seitenzahl umsetzen (Paket 7) – nur über vorhandene Wege:
   * Hilfen auf die Hilfekarten legen (lokal, Strg+Z), einen Baustein überarbeiten lassen oder
   * eine Aufgabe anfügen, die die KI nach dem Vorschlag schreibt (beides Hintergrund-Aufträge,
   * der vorige Stand bleibt als Entwurf abrufbar).
   */
  const seitenUmsetzbar = (v: SeitenVorschlag): boolean =>
    v.art === 'hilfenAufKarten'
      ? sheet.blocks.some((b) => b.type === 'scaffold' && b.variant !== 'hilfekarten')
      : v.art === 'vertiefung' || v.art === 'sicherung' || v.art === 'transfer'
        ? true
        : Boolean(v.blockId && sheet.blocks.some((b) => b.id === v.blockId))
  const seitenUebernehmen = (v: SeitenVorschlag): void => {
    if (v.art === 'hilfenAufKarten') {
      update((d) => {
        for (const b of d.sheets.find((x) => x.id === sheet.id)!.blocks) if (b.type === 'scaffold' && b.variant !== 'hilfekarten') b.variant = 'hilfekarten'
      })
      notifySuccess('Die Hilfen stehen jetzt auf den Hilfekarten. Strg+Z nimmt es zurück.')
      return
    }
    const ziel = v.blockId ? sheet.blocks.find((b) => b.id === v.blockId) : undefined
    if (ziel) {
      reviseBlock(ziel, v.text)
      return
    }
    // Ergänzen: eine leere Aufgabe ans Ende, dann schreibt die KI sie nach dem Vorschlag
    const neu = newBlock('task')
    update((d) => {
      d.sheets.find((x) => x.id === sheet.id)!.blocks.push(neu)
    })
    const mitNeu = useArbeitsblatt.getState().worksheet
    if (!mitNeu) return
    bausteinAuftrag(mitNeu, docId, 'Aufgabe ergänzen', neu.id, neu.id, async (w, k) => {
      const blatt = w.sheets.find((x) => x.id === sheet.id) ?? sheet
      const fresh = await regenerateBlock(w, blatt, neu.id, profile, k.ai, '', v.text)
      return (current) => addVersion(current, fresh)
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
  const fillBlock = (block: WsBlock): void =>
    bausteinAuftrag(ws, docId, 'Baustein füllen', block.id, block.id, async (w, k) => {
      const blatt = w.sheets.find((s) => s.id === sheet.id) ?? sheet
      const fresh = await fuelleBaustein(w, blatt, block.id, profile, k.ai)
      await completeOriginalSources([fresh], browserSourceServices())
      if (fresh.type === 'image')
        await completeWorksheetImages(
          [fresh],
          { ...w.meta, imageSource: w.meta.imageSource === 'placeholder' ? 'auto' : w.meta.imageSource },
          await browserWorksheetImageDeps({ ai: k.ai, bild: k.bild })
        )
      return (current) => addVersion(current, fresh)
    })

  /**
   * Lässt die KI ein gelöstes Beispiel (Punkt 0) zur Aufgabe schreiben.
   *
   * Eigener Schlüssel, damit der Knopf lädt und nicht der ganze Baustein ausgraut –
   * die Aufgabe selbst bleibt dabei unverändert.
   */
  const addExample = (block: WsBlock): void => {
    if (block.type !== 'task') return
    bausteinAuftrag(ws, docId, 'Beispiel schreiben', `beispiel-${block.id}`, block.id, async (w, k) => {
      const example = await generateExample(block, w.meta, k.ai)
      return (current) => (current.type === 'task' ? { ...current, example } : current)
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

  /*
   * Baustein an beliebiger Stelle einfügen und duplizieren (Paket 6, Wunsch der Lehrkraft) –
   * vorher ging beides nur am Blattende („Baustein hinzufügen“). Beides ist ein Verlaufsschritt,
   * Strg+Z nimmt es zurück.
   */
  const einfuegen = (nebenId: string, versatz: 0 | 1, typ: WsBlockType): void =>
    update((d) => {
      const blocks = d.sheets.find((s) => s.id === sheet.id)?.blocks
      if (!blocks) return
      const i = blocks.findIndex((b) => b.id === nebenId)
      blocks.splice(i < 0 ? blocks.length : i + versatz, 0, newBlock(typ, anredeFuerMeta(d.meta)))
    })
  const duplizieren = (id: string): void =>
    update((d) => {
      const blocks = d.sheets.find((s) => s.id === sheet.id)?.blocks
      const i = blocks?.findIndex((b) => b.id === id) ?? -1
      if (!blocks || i < 0) return
      blocks.splice(i + 1, 0, dupliziereBaustein(blocks[i]))
    })

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
      onUpdate={(fn, gruppe) => updateBlock(sheet.id, block.id, fn, gruppe)}
      onMove={(richtung) => moveBlock(block.id, richtung)}
      extras={
        <>
          {!key && block.warnings && block.warnings.length > 0 && (
            <WarningButton
              warnings={block.warnings}
              onDismiss={() => updateBlock(sheet.id, block.id, (d) => (d.warnings = []))}
              // Paket 12: „Mit KI beheben" – ein kleiner Auftrag, Ergebnis als ein Rückgängig-Schritt, danach neue Prüfung
              onBeheben={(liste) =>
                hinweiseBeheben(
                  ws,
                  docId,
                  sheet.id,
                  liste.map((text) => ({ text, blockId: block.id }))
                )
              }
              laeuft={busy.has(block.id) || busy.has(`beheben-${sheet.id}`)}
            />
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
          {/*
           * KI-Aktionen in EINEM beschrifteten Menü, seltene Aktionen im „⋯“-Menü (Paket 6).
           * Vorher standen bis zu zehn Symbole übereinander am Rand; „überarbeiten“ (Funken)
           * und „neu erzeugen“ (Kreispfeil) waren nur am Tooltip zu unterscheiden.
           */}
          <KiMenue
            block={block}
            busy={busy.has(block.id) || busy.has(`beispiel-${block.id}`)}
            onRevise={(instruction) => reviseBlock(block, instruction)}
            onRegenerate={() => reviseBlock(block)}
          >
            {/*
             * Gelöstes Beispiel (Punkt 0) – auf Knopfdruck von der KI. ÖSZ 2024 empfiehlt es für
             * jede Aufgabenstellung; ob es hier trägt, entscheidet die Lehrkraft an der fertigen
             * Aufgabe. Deshalb nachträglich und je Aufgabe; entfernen steht im „⋯“-Menü.
             */}
            {block.type === 'task' && !block.example && (
              <Menu.Item leftSection={<IconCircleNumber0 size={14} />} onClick={() => addExample(block)}>
                Gelöstes Beispiel (0) hinzufügen
              </Menu.Item>
            )}
          </KiMenue>
          <BlockSettings block={block} combined={combined} update={(fn, gruppe) => updateBlock(sheet.id, block.id, fn, gruppe)} />
          {block.type === 'image' && (
            <Tooltip label="Bild wählen" position="right">
              <ActionIcon size="sm" variant="default" aria-label="Bild wählen" onClick={() => setPicker(block.id)}>
                <IconPhoto size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </>
      }
      menue={
        <>
          <Menu.Label>Baustein</Menu.Label>
          <Menu.Item leftSection={<IconCopy size={14} />} onClick={() => duplizieren(block.id)}>
            Duplizieren
          </Menu.Item>
          <EinfuegenUntermenue titel="Darüber einfügen" onWaehlen={(typ) => einfuegen(block.id, 0, typ)} />
          <EinfuegenUntermenue titel="Darunter einfügen" onWaehlen={(typ) => einfuegen(block.id, 1, typ)} />
          {block.type === 'task' && block.example && (
            <Menu.Item leftSection={<IconNumber0Small size={16} />} onClick={() => updateBlock(sheet.id, block.id, (d) => delete (d as TaskBlock).example)}>
              Gelöstes Beispiel entfernen
            </Menu.Item>
          )}
          {/*
           * Hörfassung: nur bei Textbausteinen und nur, wo Hören NICHT selbst geprüft wird.
           * In den Sprachen wäre ein vorgelesener Lesetext widersinnig – dort ist der Text
           * der Prüfgegenstand.
           */}
          {block.type === 'text' && !hoerenIstPruefgegenstand(ws.meta.subjectId) && (
            <Menu.Item leftSection={<IconHeadphones size={14} />} onClick={() => addReadAloud(block)}>
              Hörfassung anlegen
            </Menu.Item>
          )}
          <Menu.Divider />
          <Menu.Item
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={() =>
              update(
                (d) => (d.sheets.find((s) => s.id === sheet.id)!.blocks = d.sheets.find((s) => s.id === sheet.id)!.blocks.filter((b) => b.id !== block.id))
              )
            }
          >
            Baustein löschen
          </Menu.Item>
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
        {/* Strg+Z / Strg+Y hängen am Programm (ArbeitsblattModule), damit sie in allen Schritten gelten */}
        <UndoRedoButtons canUndo={verlauf.past.length > 0} canRedo={verlauf.future.length > 0} onUndo={undo} onRedo={redo} />
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
        {/*
         * Blattoptionen gebündelt (Paket 6): Bis dahin standen Sternchen, Schulangaben,
         * Korrekturrand, Notizrand, Blocksatz, Deckblatt, KI-Test und Design einzeln in der
         * Leiste – rund zwanzig Elemente, die am Tablet seitlich weggewischt werden mussten.
         * Jetzt stehen sie in einem Fenster, mit ihren Erklärungen als Beschreibung.
         */}
        <Popover opened={optionenOffen} onChange={setOptionenOffen} width={360} position="bottom-start" shadow="md" withArrow trapFocus={false} keepMounted>
          <Popover.Target>
            <Button size="xs" variant="default" leftSection={<IconAdjustmentsHorizontal size={14} />} onClick={() => setOptionenOffen((o) => !o)}>
              Blattoptionen
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="sm" mah="70vh" style={{ overflowY: 'auto' }} className="blattoptionen">
              {/*
               * Die Designvorlage steht OBEN (Wunsch der Lehrkraft vom 26.09.2026): Unten, unter
               * rund zehn Schaltern, war sie erst nach Scrollen zu sehen und wurde nicht gefunden.
               */}
              <Select
                size="sm"
                label="Designvorlage"
                data={designs.map((d) => ({
                  value: d.id,
                  label: d.name
                }))}
                value={designs.some((d) => d.id === ws.design.id) ? ws.design.id : null}
                placeholder="Design wählen"
                onChange={(v) => {
                  const d = designs.find((x) => x.id === v)
                  if (d) update((w) => (w.design = structuredClone(d)))
                }}
              />
              {ws.meta.differentiation.levels > 1 && (
                <Checkbox
                  size="sm"
                  label="Sternchen zeigen"
                  description="Niveaustufe (★/★★/★★★) auf den Blättern anzeigen"
                  checked={ws.meta.showLevelMarks !== false}
                  onChange={(e) => update((w) => (w.meta.showLevelMarks = e.currentTarget.checked))}
                />
              )}
              <Checkbox
                size="sm"
                label="Schulangaben"
                description="Schulname und Logo auf diesem Arbeitsblatt abdrucken – unabhängig von der Designvorlage"
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
                size="sm"
                label="Korrekturrand"
                description="Neben den Schreiblinien 45 mm für Korrekturzeichen freihalten; eine senkrechte Linie trennt den Streifen ab."
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
                size="sm"
                label="Notizrand"
                description="Neben den Materialtexten 42 mm zum Mitschreiben freihalten; eine senkrechte Linie trennt den Streifen ab. Der Seitenumbruch verschiebt sich entsprechend."
                checked={Boolean(ws.meta.notesMargin)}
                onChange={(e) => {
                  const an = e.currentTarget.checked
                  update((w) => (w.meta.notesMargin = an))
                }}
              />
              <Checkbox
                size="sm"
                label="Blocksatz"
                description="Längere Texte im Blocksatz setzen. Flattersatz gilt als besser lesbar (Ofqual 2021, DIN 1450); bei Einfacher und Leichter Sprache ist Blocksatz immer aus."
                checked={ws.design.page.justifyText !== false}
                onChange={(e) => {
                  const an = e.currentTarget.checked
                  update((w) => (w.design.page.justifyText = an))
                }}
              />
              {/* Paket 10a: Fachfarbe statt Vorlagenfarbe – hier für dieses eine Blatt abschaltbar */}
              <VorlagenfarbeSchalter
                fach={ws.meta.subjectId}
                checked={Boolean(ws.meta.vorlagenfarbe)}
                onChange={(an) => update((w) => (w.meta.vorlagenfarbe = an))}
              />
              <UeberthemaFeld werte={ws.meta} bereich={bereich?.name ?? ''} onChange={(patch) => update((w) => Object.assign(w.meta, patch), 'ueberthema')} />
              <Checkbox
                size="sm"
                label="Deckblatt"
                description="Ein Deckblatt als Seite 0 vor die Arbeitsblätter stellen – für Lehrkräfte, nicht für Lernende"
                checked={Boolean(ws.meta.coverPage)}
                onChange={(e) => update((w) => (w.meta.coverPage = e.currentTarget.checked))}
              />
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
                  size="sm"
                  label="KI-Test"
                  checked={Boolean(ws.meta.aiCanary)}
                  /*
                   * Beim EINSCHALTEN wird nach den Wörtern gefragt, statt eines zu würfeln: Die
                   * Lehrkraft sucht hinterher in den Abgaben danach, und nur sie weiß, welches Wort
                   * im eigenen Unterricht ohnehin gerade vorkommt.
                   */
                  onChange={(e) => {
                    // Das Fenster mit den Wörtern kommt nach vorn – die Blattoptionen gehen dafür zu
                    if (e.currentTarget.checked) {
                      setOptionenOffen(false)
                      setCanaryOffen(true)
                    } else update((w) => (w.meta.aiCanary = false))
                  }}
                />
              </Tooltip>
            </Stack>
          </Popover.Dropdown>
        </Popover>
        <Box style={{ flex: 1 }} />
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
        <Tooltip label="Als Datei speichern …">
          <ActionIcon
            size="md"
            variant="default"
            aria-label="Als Datei speichern"
            onClick={async () => {
              try {
                const path = await window.api.files.save(`${baseName}.arbeitsblatt`, WORKSHEET_FILTER, serializeWorksheet(ws))
                if (path) notifySuccess('Arbeitsblatt gespeichert.')
              } catch (e) {
                notifyError(e)
              }
            }}
          >
            <IconDeviceFloppy size={16} />
          </ActionIcon>
        </Tooltip>
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
        <BlattHinweise
          note={ws.meta.teacherNote}
          warnings={pageWarnings.map((w) => w.message)}
          onBeheben={(liste) =>
            hinweiseBeheben(
              ws,
              docId,
              sheet.id,
              liste.map((text) => ({ text }))
            )
          }
          laeuft={busy.has(`beheben-${sheet.id}`)}
        />
      </Group>

      <ScrollArea style={{ flex: 1 }} className="editor-canvas">
        <Stack align="center" py="lg" gap="md">
          {view === 'board' && <BoardPanel ws={ws} profile={profile} />}
          {view === 'audio' && <AudioPanel ws={ws} />}
          {view === 'student' && ws.meta.coverPage && deckblatt && (
            <>
              {/* Werkzeuge ÜBER der Seite, nicht darauf – nichts davon gerät in den Druck (Paket 11) */}
              <DeckblattWerkzeuge
                ws={ws}
                vorschau={deckblatt}
                update={(fn) => update(fn)}
                onZeichnen={() => maskottchenZeichnen(ws, docId)}
                onSeitenwahl={() => setSeitenwahl({ tausch: null })}
              />
              <FitToWidth className="ws-editor-pages">
                <CoverPage
                  ws={ws}
                  vorschau={deckblatt}
                  onChange={(fn, gruppe) => update(fn, gruppe)}
                  onAustauschen={(seite) => setSeitenwahl({ tausch: seite })}
                />
              </FitToWidth>
            </>
          )}
          {view === 'student' && abweichung && !seitenAus.includes(abweichungsSchluessel) && (
            <SeitenHinweis
              abweichung={abweichung}
              umsetzbar={seitenUmsetzbar}
              onUebernehmen={seitenUebernehmen}
              onAusblenden={() => setSeitenAus((a) => [...a, abweichungsSchluessel])}
            />
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
                  <Menu.Item
                    key={type}
                    onClick={() => update((d) => d.sheets.find((s) => s.id === sheet.id)!.blocks.push(newBlock(type as WsBlockType, anredeFuerMeta(d.meta))))}
                  >
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
      {deckblatt && (
        <DeckblattSeitenwahl
          ws={ws}
          vorschau={deckblatt}
          tausch={seitenwahl?.tausch ?? null}
          offen={seitenwahl !== null}
          onClose={() => setSeitenwahl(null)}
          update={(fn) => update(fn)}
        />
      )}
      <PrintPreview html={druck?.html ?? null} loesung={druck?.loesung} title={`Drucken – ${ws.meta.title || 'Arbeitsblatt'}`} onClose={() => setDruck(null)} />
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
            /*
             * Druckvorschau mit Seitenansicht. „Lösungen separat drucken" ist ein eigener
             * Druckauftrag (mit eigener Exemplarzahl) – vorher war diese Wahl beim Drucken
             * ungültig und es kamen gar keine Lösungen.
             */
            const loesung =
              keyMode === 'separate'
                ? {
                    html: buildWorksheetHtml(ws, layouts, { sheetIds, includeKey: false, keyOnly: true, includeBoard: tafel.loesungsdatei }, logo, schoolName),
                    titel: 'Lösungen'
                  }
                : null
            setDruck({
              html: buildWorksheetHtml(ws, layouts, { sheetIds, includeKey: keyMode === 'append', includeBoard: tafel.hauptdokument }, logo, schoolName),
              loesung
            })
            return
          }
          /*
           * Alle Dateien dieser Ausgabe in EINEM Zug: Blatt, ggf. Lösungen, ggf. Tafelbild und die
           * Hörtexte als MP3. Bei mehr als einer Datei wird einmal ein Ordner gewählt
           * (shared/export/ausgabe.tsx) – vorher kam für jede Datei ein eigener Speichern-Dialog.
           */
          const dateien: AusgabeDatei[] = []
          if (exportMode === 'pdf') {
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
            dateien.push({
              name: `${baseName}${suffix}${fillable ? ' - ausfuellbar' : ''}.pdf`,
              html: buildWorksheetHtml(
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
              pdf: { fillable, audio: hoertexte }
            })
            // Das Lösungsblatt bleibt immer ein Abbild – dort ist nichts auszufüllen
            if (keyMode === 'separate')
              dateien.push({
                name: `${baseName}${suffix} - Lösungen.pdf`,
                html: buildWorksheetHtml(ws, layouts, { sheetIds, includeKey: false, keyOnly: true, includeBoard: tafel.loesungsdatei }, logo, schoolName)
              })
            if (tafel.eigeneDatei)
              dateien.push({
                name: `${baseName} - Tafelbild.pdf`,
                html: buildWorksheetHtml(ws, layouts, { sheetIds: [], includeKey: false, includeBoard: true }, logo, schoolName)
              })
          } else {
            dateien.push({
              name: `${baseName}${suffix}.docx`,
              filter: WORD_FILTER,
              // Mit Deckblatt: seine Seite und die Vorschauen als Bilder in derselben Lage (Paket 11)
              daten: async () =>
                buildWorksheetDocx(
                  ws,
                  { sheetIds, includeKey: keyMode === 'append', includeBoard: tafel.hauptdokument },
                  { ...deps, deckblatt: ws.meta.coverPage ? await deckblattBilder(ws, layouts, logo, schoolName, citationStyle) : undefined }
                )
            })
            if (keyMode === 'separate')
              dateien.push({
                name: `${baseName}${suffix} - Lösungen.docx`,
                filter: WORD_FILTER,
                daten: () => buildWorksheetDocx(ws, { sheetIds, includeKey: false, keyOnly: true, includeBoard: tafel.loesungsdatei }, deps)
              })
            if (tafel.eigeneDatei)
              dateien.push({
                name: `${baseName} - Tafelbild.docx`,
                filter: WORD_FILTER,
                daten: () => buildWorksheetDocx(ws, { sheetIds: [], includeKey: false, includeBoard: true }, deps)
              })
          }
          dateien.push(...audioDateien(ws, baseName))
          const hoertextImPdf = exportMode === 'pdf' && ws.sheets.some((s) => s.blocks.some((b) => b.type === 'audio' && b.audio?.dataUrl))
          await speichereAusgabe(
            dateien,
            exportMode === 'pdf'
              ? [fillable ? 'Ausfüllbares PDF gespeichert.' : 'PDF gespeichert.', hoertextImPdf ? 'Hörtexte sind im PDF enthalten.' : '']
                  .filter(Boolean)
                  .join(' ')
              : 'Word-Dokument gespeichert.'
          )
        }}
        sheets={ws.sheets.map((s) => ({ id: s.id, label: s.label }))}
        defaultKey={loesungsVorgabe('arbeitsblatt', ws.meta.answerKey)}
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
function BlattHinweise({
  note,
  warnings,
  onBeheben,
  laeuft
}: {
  note?: string
  warnings: string[]
  onBeheben?: (hinweise: string[]) => void
  laeuft?: boolean
}): React.JSX.Element | null {
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
                <Group key={i} justify="space-between" gap="xs" wrap="nowrap" align="flex-start" data-hinweis>
                  <Text size="sm">· {w}</Text>
                  {onBeheben && istBehebbar(w) && (
                    <KiBehebenKnopf
                      laeuft={laeuft}
                      onClick={() => {
                        onBeheben([w])
                        setOffen(false)
                      }}
                    />
                  )}
                </Group>
              ))}
              {onBeheben && (
                <Group justify="flex-end">
                  <AlleBehebenKnopf
                    anzahl={warnings.filter(istBehebbar).length}
                    laeuft={laeuft}
                    onClick={() => {
                      onBeheben(warnings.filter(istBehebbar))
                      setOffen(false)
                    }}
                  />
                </Group>
              )}
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
  run: (sheetIds: string[], key: LoesungsModus, includeBoard: boolean, fillable: boolean) => Promise<void>
  sheets: { id: string; label: string }[]
  /** Vorwahl: zuletzt in diesem Programm gewählt bzw. „als eigene Datei" (LoesungsWahl.tsx) */
  defaultKey: LoesungsModus
  hasBoard: boolean
  /** Aus dem Reiter „Tafelbild“ geöffnet: nur das Tafelbild vorauswählen */
  boardFirst: boolean
}): React.JSX.Element {
  const [sheetIds, setSheetIds] = useState(sheets.map((s) => s.id))
  const [key, setKey] = useState<LoesungsModus>(defaultKey)
  const [board, setBoard] = useState(false)
  /** PDF mit Formularfeldern statt reinem Abbild */
  const [fillable, setFillable] = useState(false)
  const [running, setRunning] = useState(false)
  useEffect(() => setSheetIds(sheets.map((s) => s.id)), [sheets.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mode === null) return
    setBoard(hasBoard && boardFirst)
    setKey(defaultKey)
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
          /*
           * Dieselbe Wahl wie in allen Programmen. „separate" ist beim Drucken jetzt gültig
           * („Lösungen separat drucken"): Vorher war es bei eingeschalteten Lösungen vorgewählt,
           * beim Drucken aber gar nicht angeboten – nichts war gewählt, und es kamen keine Lösungen.
           */
          <LoesungsWahl value={key} onChange={setKey} modus={mode} />
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
                if (sheetIds.length) merkeLoesungsWahl('arbeitsblatt', key)
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
