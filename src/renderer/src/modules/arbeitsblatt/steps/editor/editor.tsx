import { ActionIcon, Box, Button, Checkbox, Menu, ScrollArea, Stack, Text, Tooltip } from '@mantine/core'
import {
  IconMoodSmile,
  IconPhoto,
  IconTimeline,
  IconPlus,
  IconCircleNumber0,
  IconClipboardCheck,
  IconCopy,
  IconHeadphones,
  IconNumber0Small,
  IconTrash,
  IconWand
} from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import type { DesignTemplate } from '@shared/design'
import ImagePicker from '../../../../shared/components/ImagePicker'
import PrintPreview from '../../../../shared/components/PrintPreview'
import { loesungsVorgabe } from '../../../../shared/components/LoesungsWahl'
import { speichereAusgabe, WORD_FILTER, type AusgabeDatei } from '../../../../shared/export/ausgabe'
import FitToWidth from '../../../../shared/render/FitToWidth'
import { useAppSettings } from '../../../../shared/settingsStore'
import { notifyError, notifySuccess, safeFileName } from '../../../../shared/util'
import { checkTasksPerPage } from '../../didactics/checks'
import { browserDocxDeps } from '../../export/browserDeps'
import { buildWorksheetDocx } from '../../export/docx'
import { fuelleBaustein, regenerateBlock } from '../../generation/generate'
import { generateExample } from '../../generation/example'
import { generateSolution } from '../../generation/solution'
import { IllustrationDialog } from '../IllustrationDialog'
import { hoerenIstPruefgegenstand } from '../../didactics/audioRules'
import { plainText } from '../../../../shared/richtext/parse'
import { estimateSeconds } from '../../generation/convert'
import { BLOCK_LABELS, dupliziereBaustein, istLeer, newBlock } from '../../model/factory'
import { anredeFuerMeta } from '../../didactics/anrede'
import type { SeitenVorschlag, TaskBlock, Worksheet, WsBlock, WsBlockType } from '../../model/types'
import { serializeWorksheet, WORKSHEET_FILTER } from '../../project'
import { BausteinRahmen } from '../../render/BausteinRahmen'
import type { PlacedItem } from '../../render/paginate'
import { buildWorksheetHtml } from '../../render/printHtml'
import { tafelbildZiel } from '../../export/tafelbildZiel'
import { contextFor, layoutKey, pageInfoFor, profileFromMeta, SheetPages, useSheetLayouts } from '../../render/SheetPages'
import { deckblattVorschau } from '../../render/deckblattVorschau'
import { deckblattBilder } from '../../render/deckblattBilder'
import { DeckblattSeitenwahl, DeckblattWerkzeuge } from '../DeckblattWerkzeuge'
import EditorLeiste from '../../../../shared/components/EditorLeiste'
import BlattoptionenFelder from '../../../../shared/components/BlattoptionenFelder'
import CanaryDialog from '../../../../shared/components/CanaryDialog'
import IllustrationenOption from '../IllustrationenOption'
import { useThemenbereich } from '../../../../shared/themenbereiche'
import { mitThemenbereich } from '../../../../shared/ueberthema'
import '../../render/ws.css'
import { useArbeitsblatt } from '../../store'
import { bausteinAuftrag, hinweiseBeheben, maskottchenZeichnen } from '../../auftraege'
import { useLaufendeSchluessel } from '../../../../shared/auftraege'
import { defaultWorksheetName, setPreviewLayouts } from '../../library'
import '../../../vokabeltest/steps/editor.css'
import { BlockSettings } from '../BlockSettings'
import WarningButton from '../../../../shared/components/WarningButton'
import { KiMenue, VersionSwitcher } from '../BlockRevision'
import { EinfuegenUntermenue } from '../EinfuegenMenue'
import { AudioPanel } from '../AudioPanel'
import { BoardPanel } from '../BoardPanel'
import { addVersion, switchVersion } from '../../model/versions'
import { seitenAbweichung } from '../../didactics/seiten'
import SeitenHinweis from '../SeitenHinweis'
import { browserSourceServices, completeOriginalSources } from '../../generation/originalSources'
import { browserWorksheetImageDeps } from '../../generation/browserImages'
import { completeWorksheetImages } from '../../generation/worksheetImages'
import { istZeitleiste, zeitleisteAusBeschreibung } from '../../generation/zeitleiste'
import { canaryWordFor } from '../../../../shared/aiCanary'
import { CoverPage } from '../../render/CoverPage'
import { useDruck } from '../../../../shared/navigation'
import { BlattHinweise } from './hinweise'
import { ExportModal } from './exportDialog'

export function EditorStep(): React.JSX.Element {
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
  // Maskottchen an einen Baustein heften (26.09.2026)
  const [illuBlockId, setIlluBlockId] = useState<string | null>(null)

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

  /**
   * Eine als Bild beschriebene Zeitleiste von der App zeichnen lassen (27.09.2026) – für
   * Platzhalter auf vorhandenen Blättern; neue Blätter bekommen die Zeichnung beim Fertigstellen.
   */
  const zeitleisteZeichnen = (block: WsBlock): void => {
    if (block.type !== 'image') return
    bausteinAuftrag(ws, docId, 'Zeitleiste zeichnen', block.id, block.id, async (w, k) => {
      const grid = await zeitleisteAusBeschreibung(block, w.meta, k.ai)
      if (!grid) throw new Error('Aus der Beschreibung ließ sich keine Zeitleiste mit mindestens zwei Ereignissen ableiten.')
      return (current) => addVersion(current, grid)
    })
  }

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
    bausteinAuftrag(ws, docId, 'Beispiellösung schreiben', `beispiel-${block.id}`, block.id, async (w, k) => {
      const example = await generateExample(block, w.meta, k.ai)
      return (current) => (current.type === 'task' ? { ...current, example } : current)
    })
  }

  /**
   * „Lösung im Erwartungshorizont generieren" (Lösungsansicht, 26.09.2026).
   *
   * Schreibt Erwartungshorizont und – bei Linien, Rechenkästchen und freier Fläche – die
   * Musterlösung in Schülerform, ggf. mit Skizze (generation/solution.ts). Die Aufgabe bleibt
   * unverändert; der vorige Lösungsstand bleibt als Fassung abrufbar.
   */
  const addSolution = (block: WsBlock): void => {
    if (block.type !== 'task') return
    bausteinAuftrag(ws, docId, 'Lösung schreiben', `loesung-${block.id}`, block.id, async (w, k) => {
      const blatt = w.sheets.find((s) => s.id === sheet.id) ?? sheet
      const aktuell = blatt.blocks.find((b) => b.id === block.id)
      const fresh = await generateSolution(aktuell?.type === 'task' ? aktuell : block, blatt, w, k.ai)
      return (current) => (current.type === 'task' ? addVersion(current, fresh) : current)
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
            busy={busy.has(block.id) || busy.has(`beispiel-${block.id}`) || busy.has(`loesung-${block.id}`)}
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
                Beispiellösung in Aufgabe hinzufügen
              </Menu.Item>
            )}
            {/* Platzhalter einer Zeitleiste: die App zeichnet sie aus der Beschreibung (generation/zeitleiste.ts) */}
            {block.type === 'image' && !block.image && istZeitleiste(block) && (
              <Menu.Item leftSection={<IconTimeline size={14} />} onClick={() => zeitleisteZeichnen(block)}>
                Als Zeitleiste zeichnen lassen
              </Menu.Item>
            )}
            {/*
             * Nur in der Lösungsansicht (26.09.2026): Dort fehlte im KI-Menü jeder Weg, eine
             * Lösung erzeugen zu lassen. Erwartungshorizont + Musterlösung in Schülerform.
             */}
            {block.type === 'task' && key && (
              <Menu.Item leftSection={<IconClipboardCheck size={14} />} onClick={() => addSolution(block)}>
                Lösung im Erwartungshorizont generieren
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
          {block.type !== 'illustration' && (
            <Menu.Item leftSection={<IconMoodSmile size={14} />} onClick={() => setIlluBlockId(block.id)}>
              {block.illustration ? 'Maskottchen ändern …' : 'Maskottchen anheften …'}
            </Menu.Item>
          )}
          <EinfuegenUntermenue titel="Darüber einfügen" onWaehlen={(typ) => einfuegen(block.id, 0, typ)} />
          <EinfuegenUntermenue titel="Darunter einfügen" onWaehlen={(typ) => einfuegen(block.id, 1, typ)} />
          {block.type === 'task' && block.example && (
            <Menu.Item leftSection={<IconNumber0Small size={16} />} onClick={() => updateBlock(sheet.id, block.id, (d) => delete (d as TaskBlock).example)}>
              Beispiellösung aus Aufgabe entfernen
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

  const illuBlock = illuBlockId ? sheet.blocks.find((b) => b.id === illuBlockId) : undefined
  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {measure}
      <IllustrationDialog
        opened={Boolean(illuBlock)}
        onClose={() => setIlluBlockId(null)}
        wert={illuBlock?.illustration}
        onChange={(neu) => illuBlock && updateBlock(sheet.id, illuBlock.id, (d) => (neu ? (d.illustration = neu) : delete d.illustration))}
      />
      <EditorLeiste
        zurueck={{ label: 'Gliederung', onClick: () => setStep(1) }}
        undo={{ canUndo: verlauf.past.length > 0, canRedo: verlauf.future.length > 0, onUndo: undo, onRedo: redo }}
        fassungen={
          ws.sheets.length > 1 && view !== 'board' && view !== 'audio'
            ? { value: sheet.id, onChange: setActiveSheet, data: ws.sheets.map((s) => ({ value: s.id, label: s.label })), ariaLabel: 'Niveaustufe' }
            : null
        }
        ansichten={{
          value: view,
          onChange: (v) => setView(v as typeof view),
          data: [
            { value: 'student', label: 'Arbeitsblatt' },
            { value: 'key', label: 'Lösungen' },
            { value: 'board', label: ws.board ? 'Tafelbild' : 'Tafelbild +' },
            ...(hasAudio ? [{ value: 'audio', label: 'Hörtexte' }] : [])
          ]
        }}
        optionen={
          /*
           * Blattoptionen gebündelt (Paket 6): Bis dahin standen Sternchen, Schulangaben,
           * Korrekturrand, Notizrand, Blocksatz, Deckblatt, KI-Test und Design einzeln in der
           * Leiste – rund zwanzig Elemente, die am Tablet seitlich weggewischt werden mussten.
           * Seit 27.09.2026 sind die Felder für alle Programme dieselben (BlattoptionenFelder).
           */
          <BlattoptionenFelder
            designs={designs}
            designId={ws.design.id}
            onDesign={(d) => update((w) => (w.design = structuredClone(d)))}
            nachDesign={
              ws.meta.differentiation.levels > 1 && (
                <Checkbox
                  size="sm"
                  label="Sternchen zeigen"
                  description="Niveaustufe (★/★★/★★★) auf den Blättern anzeigen"
                  checked={ws.meta.showLevelMarks !== false}
                  onChange={(e) => update((w) => (w.meta.showLevelMarks = e.currentTarget.checked))}
                />
              )
            }
            schulangaben={{ checked: ws.meta.showSchool !== false, onChange: (an) => update((w) => (w.meta.showSchool = an)) }}
            nachSchule={<IllustrationenOption ws={ws} update={update} />}
            korrekturrand={{ checked: Boolean(ws.meta.correctionMargin), onChange: (an) => update((w) => (w.meta.correctionMargin = an)) }}
            notizrand={{ checked: Boolean(ws.meta.notesMargin), onChange: (an) => update((w) => (w.meta.notesMargin = an)) }}
            blocksatz={{ checked: ws.design.page.justifyText !== false, onChange: (an) => update((w) => (w.design.page.justifyText = an)) }}
            fach={ws.meta.subjectId}
            vorlagenfarbe={{ checked: Boolean(ws.meta.vorlagenfarbe), onChange: (an) => update((w) => (w.meta.vorlagenfarbe = an)) }}
            ueberthema={{ werte: ws.meta, bereich: bereich?.name ?? '', onChange: (patch) => update((w) => Object.assign(w.meta, patch), 'ueberthema') }}
            vorKiTest={
              <Checkbox
                size="sm"
                label="Deckblatt"
                description="Ein Deckblatt als Seite 0 vor die Arbeitsblätter stellen – für Lehrkräfte, nicht für Lernende"
                checked={Boolean(ws.meta.coverPage)}
                onChange={(e) => update((w) => (w.meta.coverPage = e.currentTarget.checked))}
              />
            }
            kiTest={{
              an: Boolean(ws.meta.aiCanary),
              woerter: ws.meta.aiCanaryWords,
              vorschlagFuer: `${ws.meta.title}|${ws.meta.topic}`,
              onEin: () => setCanaryOffen(true),
              onAus: () => update((w) => (w.meta.aiCanary = false))
            }}
          />
        }
        name={{ value: docName, placeholder: defaultWorksheetName(ws), onChange: setDocName }}
        gesichertAm={savedAt}
        dateiSpeichern={{
          tooltip: 'Als Datei speichern …',
          onClick: async () => {
            try {
              const path = await window.api.files.save(`${baseName}.arbeitsblatt`, WORKSHEET_FILTER, serializeWorksheet(ws))
              if (path) notifySuccess('Arbeitsblatt gespeichert.')
            } catch (e) {
              notifyError(e)
            }
          }
        }}
        ausgabe={{ onWord: () => setExportMode('docx'), onPdf: () => setExportMode('pdf'), onDrucken: () => setExportMode('print') }}
        rechts={
          /*
           * Hinweise der KI und der Prüfungen: als Symbol, nicht als Kasten.
           *
           * Wunsch der Lehrkraft (25.09.2026): „nach erstellung von material sind die
           * rot/orangenen kästen mit warnhinweisen für die nutzer inzwischen sehr lang. Mach es
           * aufrufbar über ein rotes Ausrufezeichen Symbol … Zeige die Warnhinweise nicht mehr
           * nach Erstellung der materialien, nur über das symbol."
           */
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
        }
      />

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
                info={{
                  ...pageInfoFor(ws, sheet, logo, schoolName, key, citationStyle),
                  onTitle: (title) => update((w) => (w.meta.title = title.trim()), 'titel')
                }}
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
