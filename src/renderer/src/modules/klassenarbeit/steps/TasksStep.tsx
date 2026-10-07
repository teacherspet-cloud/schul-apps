import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Collapse,
  Container,
  Group,
  List,
  Menu,
  Popover,
  Radio,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  Title,
  Tooltip
} from '@mantine/core'
import { NurExperte, OptionenBereich, useAlleOptionen } from '../../../shared/components/NurExperte'
import { querBausteine } from '../../arbeitsblatt/model/seitenformat'
import { blattBreitePx, seitenFormatWerkzeug } from '../../arbeitsblatt/render/SeitenFormatKnopf'
import { fragenAusBlatt } from '../../../shared/export/lms/fragen'
import LmsExport from '../../../shared/export/lms/LmsExport'
import RueckmeldungKnopf from '../../rueckmeldung/RueckmeldungKnopf'
import { rasterAlsTabelle, rasterAnfrage, rasterAus } from '../../../shared/bewertung/raster'
import { describeBlock } from '../../arbeitsblatt/generation/describe'
import { systemPrompt } from '../../arbeitsblatt/generation/prompts'
import LevelnMenue from '../../arbeitsblatt/steps/LevelnMenue'
import { formatArt, inhaltsanteil, zweiterTeil } from '../model/faecher'
import {
  IconCopy,
  IconFileTypeDocx,
  IconHeadphones,
  IconInfoCircle,
  IconPrinter,
  IconRefresh,
  IconSparkles,
  IconTrash,
  IconChevronDown,
  IconChevronUp,
  IconFileImport,
  IconPlaylistAdd,
  IconArrowLeft,
  IconArrowBackUp
} from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { notifyError, notifyInfo } from '../../../shared/util'
import { gemesseneHoerzeiten, hoertextWunschKlassenarbeit, hoerteilZeitenAnpassen } from '../hoertext'
import { comprehensionFormatById } from '../../arbeitsblatt/didactics/comprehensionFormats'
import { druckAusgabe, speichereBlatt, type BlattQuelle } from '../../arbeitsblatt/export/blattAusgabe'
import { ablageZiel } from '../../../shared/export/ablageZiel'
import { meldeAblage } from '../../../shared/export/ausgabe'
import PrintPreview from '../../../shared/components/PrintPreview'
import { AusgabeDialog, type AusgabeModus } from '../../../shared/components/LoesungsWahl'
import { useDruck } from '../../../shared/navigation'
import { contextFor, pageInfoFor, SheetPages, useSheetLayouts } from '../../arbeitsblatt/render/SheetPages'
import { buildWorksheetHtml } from '../../arbeitsblatt/render/printHtml'
import { useDruckFuerWachen } from '../../../shared/render/druckFuerWachen'
import { BausteinRahmen } from '../../arbeitsblatt/render/BausteinRahmen'
import { KiMenue, VersionSwitcher } from '../../arbeitsblatt/steps/BlockRevision'
import { wunschKontextFuer } from '../../arbeitsblatt/generation/wunsch'
import type { WunschArt } from '../../../shared/kiWunsch'
import { BlockSettings } from '../../arbeitsblatt/steps/BlockSettings'
import { EinfuegenUntermenue } from '../../arbeitsblatt/steps/EinfuegenMenue'
import WarningButton from '../../../shared/components/WarningButton'
import { regenerateBlock } from '../../arbeitsblatt/generation/generate'
import { profileFromMeta } from '../../arbeitsblatt/render/SheetPages'
import { addVersion, switchVersion } from '../../arbeitsblatt/model/versions'
import { newBlock } from '../../arbeitsblatt/model/factory'
import { newId } from '../../vokabeltest/model/random'
import { examHeadBlock } from '../render/examWorksheet'
import {
  nurMitBeispiel,
  ohneSchuelerErlaeuterung,
  OPERATOREN_BLOCK_ID,
  operatorenBefund,
  operatorenlisteAktiv,
  operatorenVorbemerkungen
} from '../didactics/operatorenliste'
import type { WsBlockType } from '../../arbeitsblatt/model/types'
import { WsContext, type WsContextValue } from '../../arbeitsblatt/render/WsContext'
import type { PlacedItem } from '../../arbeitsblatt/render/paginate'
import type { WsBlock } from '../../arbeitsblatt/model/types'
import FitToWidth from '../../../shared/render/FitToWidth'
import { useAppSettings } from '../../../shared/settingsStore'
import { generateExam, reviseExamPart, upperSecondary } from '../generation/generateExam'
import { formatById } from '../model/formats'
import type { Exam, ExamPart } from '../model/types'
import { examGrades } from '../model/types'
import { alleFassungen, bloeckeDerFassung, fassungsLabel, fassungsZahl, mitBloecken, teilNachUeberarbeitung } from '../model/fassungen'
import { examHasContent, examToWorksheet, examToWorksheetAlle } from '../render/examWorksheet'
import AnredeHinweise, { anredeBefunde } from '../../../shared/components/AnredeHinweise'
import OperatorformHinweis from '../../../shared/components/OperatorformHinweis'
import LernhilfenHinweis from './LernhilfenHinweis'
import { hilfenBefunde, hilfenInsLehrermaterial } from '../model/lernhilfen'
import { operatorformBefunde, operatorformenUmsetzen } from '../../../shared/operatorformen'
import { anweisungenDeutsch } from '../../arbeitsblatt/didactics/anrede'
import { arbeitHinweiseBeheben } from '../beheben'
import { AudioPanel } from '../../arbeitsblatt/steps/AudioPanel'
import type { Worksheet } from '../../arbeitsblatt/model/types'
import { aiCall, useKlassenarbeit } from '../store'
import { EXAM_FILTER, serializeExam } from '../project'
import EditorLeiste from '../../../shared/components/EditorLeiste'
import BlattoptionenFelder from '../../../shared/components/BlattoptionenFelder'
import { anmerkungsArt, hatAnmerkungen } from '../../arbeitsblatt/didactics/anmerkungen'
import CanaryDialog from '../../../shared/components/CanaryDialog'
import { canaryWordFor } from '../../../shared/aiCanary'
import type { DesignTemplate } from '@shared/design'
import { starteAuftrag, useLaufendeSchluessel, useSperrenderAuftrag } from '../../../shared/auftraege'
import ErzeugenStart from '../../../shared/components/ErzeugenStart'
import Formularfuss from '../../../shared/components/Formularfuss'
import { arbeitOffen, defaultExamName, legeArbeitAb } from '../library'
import { QUELLENAUSWAHL, type QuellenFrage } from '../../arbeitsblatt/auftraege'
import type { AudioBlock } from '../../arbeitsblatt/model/types'
import { useThemenbereich } from '../../../shared/themenbereiche'
import VerlagsImportDialog from '../import/VerlagsImportDialog'
import ZusatzfragenDialog from '../import/ZusatzfragenDialog'
import { mitThemenbereich } from '../../../shared/ueberthema'
import McBlindHinweis from '../../../shared/components/McBlindHinweis'
import { uebernimmBlindprobe } from '../../../shared/verstehen/blindprobe'

/** Einen Baustein in ALLEN Fassungen ändern – übernommenes Material steht dort mit derselben id. */
function aendereBaustein(d: Exam, id: string, fn: (b: WsBlock) => void): void {
  for (const part of d.parts) for (const liste of alleFassungen(part)) for (const b of liste) if (b.id === id) fn(b)
}

/**
 * Schritt 2: Die Arbeit erzeugen, im Blatt bearbeiten und ausgeben.
 *
 * Bis 25.09.2026 stand das Blatt hier nur zum Ansehen da (Modus `print`); ändern ließ sich
 * nur die Lage der Bausteine. Jetzt ist es wie in Lernzielkontrolle und Grammatiktest direkt
 * bearbeitbar – als Arbeit oder als Erwartungshorizont (Umschalter), bei A/B-Arbeiten je
 * Fassung. Der frühere dritte Schritt „Bearbeiten & Export" war nie erreichbar; er ist in
 * diesem aufgegangen.
 *
 * Für Darstellung und Export wird die Arbeit in die Struktur des Arbeitsblatts übersetzt.
 */
/**
 * Standardmodus (07.10.2026): Bearbeiten, KI-Überarbeiten, Neu erzeugen, Einfügen, Löschen, Ausgabe, Rückmeldung und
 * Transkript bleiben. Leveln, Bewertungsraster, Zusatzfragen, Baustein-Einstellungen, Aufgaben aus Material, Lernplattform
 * und die feineren Blattoptionen gibt es im Expertenmodus oder über „Alle Werkzeuge".
 */
export default function TasksStep({ exam }: { exam: Exam }): React.JSX.Element {
  return (
    <OptionenBereich>
      <TasksInhalt exam={exam} />
    </OptionenBereich>
  )
}

function TasksInhalt({ exam }: { exam: Exam }): React.JSX.Element {
  const voll = useAlleOptionen()
  const { setStep, fassung: gewaehlt, setFassung, loesung, setLoesung, undo, redo, verlauf, docName, savedAt, setDocName } = useKlassenarbeit()
  // Blattoptionen, KI-Test-Dialog und Hörtext-Ansicht – die Leiste ist dieselbe wie beim Arbeitsblatt (27.09.2026)
  const [designs, setDesigns] = useState<DesignTemplate[]>([])
  useEffect(() => {
    window.api.designs.list().then(setDesigns).catch(notifyError)
  }, [])
  const [canaryOffen, setCanaryOffen] = useState(false)
  const [hoertexte, setHoertexte] = useState(false)
  // Verlagsmaterial übernehmen und „weitere Fragen im gleichen Format" (29.09.2026)
  const [importOffen, setImportOffen] = useState(false)
  const [zusatzFuer, setZusatzFuer] = useState<string | null>(null)
  const [aufbauOffen, setAufbauOffen] = useState(() => !examHasContent(exam))
  const updateExam = useKlassenarbeit((s) => s.update)
  const gesamt = fassungsZahl(exam)
  const fassung = Math.min(gewaehlt, gesamt - 1)
  const label = fassungsLabel(fassung, gesamt)
  const gruppe = (f: number): string => `Gruppe ${fassungsLabel(f, gesamt)}`
  /**
   * Der Hörtexte-Reiter arbeitet auf dem Arbeitsblatt-Abbild der Fassung A (die Hörtexte sind
   * in allen Fassungen dieselben). Geändert wird die Arbeit selbst: Der Baustein wird über
   * seine id in jedem Teil und jeder Fassung gesucht.
   */
  const updateAudio = (fn: (ws: Worksheet) => void, gruppe?: string): void => {
    let zeiten: string[] = []
    updateExam((draft) => {
      const vorher = gemesseneHoerzeiten(draft)
      const view = examToWorksheet(draft, 0)
      fn(view)
      const neu = new Map(view.sheets.flatMap((s) => s.blocks).map((b) => [b.id, b]))
      for (const part of draft.parts) {
        part.blocks = part.blocks.map((b) => neu.get(b.id) ?? b)
        if (part.weitereFassungen)
          part.weitereFassungen = part.weitereFassungen.map((liste) => liste.map((b) => (neu.get(b.id) ? structuredClone(neu.get(b.id)!) : b)))
      }
      // Neu gemessene Aufnahme (01.10.2026): Bearbeitungszeit des Hörteils folgt ihr – im selben Schritt
      zeiten = hoerteilZeitenAnpassen(draft, vorher)
    }, gruppe)
    if (zeiten.length) notifyInfo(zeiten.join(' · '))
  }
  const settings = useAppSettings((s) => s.settings)
  const logo = useAppSettings((s) => s.logoDataUrl)
  // Teile, an denen gerade ein Auftrag „überarbeiten" arbeitet (je Teil und Fassung)
  const busy = useLaufendeSchluessel(useKlassenarbeit((s) => s.docId))
  // Läuft „Arbeit erzeugen“ schon, dreht der Hauptknopf der Startkarte
  const erzeugtGerade = Boolean(useSperrenderAuftrag(useKlassenarbeit((s) => s.docId)))
  const [revise, setRevise] = useState<string | null>(null)
  /*
   * Word, PDF und Drucken fragen nach dem Erwartungshorizont (ohne / anhängen / eigene Datei)
   * und – bei mehreren Fassungen – ob nur die angezeigte oder alle ausgegeben werden.
   */
  const [ausgabe, setAusgabe] = useState<AusgabeModus | null>(null)
  const [alleAusgeben, setAlleAusgeben] = useState(true)
  const [druck, setDruck] = useState<ReturnType<typeof druckAusgabe> | null>(null)
  /*
   * Der Änderungswunsch JE TEIL (und Fassung). Bis 25.09.2026 gab es ein einziges Feld für
   * alle Teile: Wer den Wunsch für Teil 1 anfing und Teil 2 öffnete, fand ihn dort wieder –
   * und schickte ihn womöglich an den falschen Teil.
   */
  const [wuensche, setWuensche] = useState<Record<string, string>>({})
  const meta = exam.meta
  const grades = examGrades(exam)
  const hasContent = examHasContent(exam)

  /*
   * Muss gemerkt werden: Die Seitenaufteilung misst neu, sobald sich das Arbeitsblatt ändert –
   * ein bei jedem Render neu gebautes Objekt löst sonst eine Endlosschleife aus (weiße Seite).
   *
   * Gemessen wird das Blatt ALLER Fassungen: Angezeigt wird die gewählte, ausgegeben auf Wunsch
   * alle – und für jede muss die Seitenaufteilung vorliegen.
   */
  // Überthema (Paket 11): der Themenbereich der Arbeit steht im Kopf – nur zum Anzeigen eingesetzt
  const bereich = useThemenbereich(
    'klassenarbeit',
    useKlassenarbeit((s) => s.docId)
  )?.name
  const worksheet = useMemo(() => mitThemenbereich(examToWorksheetAlle(exam), bereich), [exam, bereich])
  const audioSicht = useMemo(() => examToWorksheet(exam, 0), [exam])
  const hatHoertexte = audioSicht.sheets.some((sh) => sh.blocks.some((b) => b.type === 'audio'))
  // Operatorenliste (27.09.2026): nur amtliche Definitionen – was fehlt, erfährt die Lehrkraft hier
  const operatorenHinweis = useMemo(() => {
    const b = operatorenBefund(exam)
    if (!b.liste) return `Für ${meta.stateId} und ${meta.subjectLabel} ist keine amtliche Operatorenliste hinterlegt – sie entfällt.`
    // Vorbemerkungen der Liste und Operatoren ohne Erläuterung in der Sprache der Liste: nur für die Lehrkraft, nie auf dem Blatt (01.10.2026)
    const ohne = ohneSchuelerErlaeuterung(b)
    const nurBeispiel = nurMitBeispiel(b)
    return [
      b.fehlend.length ? `Ohne amtliche Definition in der Operatorenliste (${b.liste.quelle}): ${b.fehlend.join(', ')}.` : '',
      ohne.length ? `Ohne Erläuterung und Beispiel in der Sprache der Liste, daher nicht in der Liste auf dem Blatt: ${ohne.join(', ')}.` : '',
      nurBeispiel.length
        ? `In der Liste auf dem Blatt nur mit dem Aufgabenbeispiel der Liste (keine Erläuterung in ihrer Sprache): ${nurBeispiel.join(', ')}.`
        : '',
      ...operatorenVorbemerkungen(b).map((v) => `Vorbemerkung der Liste${v.bereich ? ` (${v.bereich})` : ''}, nur für die Lehrkraft: ${v.text}`)
    ]
      .filter(Boolean)
      .join('\n')
  }, [exam, meta.stateId, meta.subjectLabel])
  // Anrede der Lernenden in allen Fassungen prüfen – auch nach Überarbeitung und Änderungen von Hand (Paket 8b)
  const anrede = useMemo(() => (hasContent ? anredeBefunde(worksheet.meta, worksheet.sheets) : []), [hasContent, worksheet])
  // Operatoren in falscher Satzstellung („Zusammenfassen Sie …“) in allen Fassungen, 01.10.2026
  const formen = useMemo(() => (hasContent ? operatorformBefunde(worksheet.sheets, anweisungenDeutsch(worksheet.meta)) : []), [hasContent, worksheet])
  // Teilpunkte auf dem Schülerblatt, obwohl die Hilfen für Lernende aus sind (01.10.2026)
  const hilfen = useMemo(() => (hasContent ? hilfenBefunde(exam) : []), [hasContent, exam])
  const { layouts, measure } = useSheetLayouts(hasContent ? worksheet : null, logo, settings.schoolName)
  // Selbsttest (wie beim Arbeitsblatt): die echte Seitenaufteilung für Wachen und Sichtprüfungen
  useEffect(() => {
    const w = window as unknown as { __selftest?: Record<string, unknown> }
    if (w.__selftest) w.__selftest.layouts = layouts
  }, [layouts])
  // Seitenrand-Wache: Druck-HTML mit Erwartungshorizont, so wie der Export es baut
  useDruckFuerWachen(
    hasContent
      ? () => buildWorksheetHtml(worksheet, layouts, { sheetIds: worksheet.sheets.map((s) => s.id), includeKey: true }, logo, settings.schoolName)
      : null,
    [hasContent, worksheet, layouts, logo, settings.schoolName]
  )
  // Strg+P öffnet denselben Druckdialog wie der Knopf „Drucken" – sobald es etwas zu drucken gibt
  useDruck('klassenarbeit', hasContent ? () => starte('print') : null)
  const sheet = worksheet.sheets[fassung] ?? worksheet.sheets[0]
  // Die Sprache der Beschriftungen steht am Blatt (examToWorksheet), damit PDF und Word sie mitnehmen
  const pageInfo = useMemo(
    () => ({
      ...pageInfoFor(worksheet, sheet, logo, settings.schoolName, loesung, settings.citationStyle),
      // Der Titel in der Kopfzeile ist der Titel der Arbeit – direkt im Blatt änderbar (27.09.2026)
      onTitle: (title: string) => updateExam((d) => (d.meta.title = title.trim()), 'titel')
    }),
    [worksheet, sheet, logo, settings.schoolName, settings.citationStyle, loesung, updateExam]
  )
  // Direkt im Blatt bearbeiten – in der Arbeit oder im Erwartungshorizont
  const editContext = useMemo(
    () =>
      contextFor(worksheet, sheet, loesung ? 'keyEdit' : 'edit', {
        update: (blockId, fn) => updateExam((d) => aendereBaustein(d, blockId, fn)),
        // Textauswahl-Menü (01.10.2026): neuer Baustein hinter dem Material – in jeder Fassung, die es enthält
        einfuegenNach: (anker, neu) =>
          updateExam((d) => {
            for (const part of d.parts)
              for (const liste of alleFassungen(part)) {
                const i = liste.findIndex((b) => b.id === anker)
                if (i >= 0) liste.splice(i + 1, 0, structuredClone(neu))
              }
          })
      }),
    [worksheet, sheet, loesung, updateExam]
  )
  /*
   * Kopfkasten und Teil-Überschriften werden aus der Arbeit ERRECHNET und gehören keinem Teil.
   * Im Bearbeitungsmodus sähen sie bearbeitbar aus, eine Eingabe verpuffte aber beim nächsten
   * Aufbau. Sie stehen deshalb schreibgeschützt da (Titel und Zeiten ändert der Rahmen).
   */
  const nurLesen: WsContextValue = useMemo(() => ({ ...editContext, mode: loesung ? 'key' : 'print', update: undefined }), [editContext, loesung])
  /*
   * Der Kopfkasten wird aus der Arbeit berechnet – bis 27.09.2026 war er deshalb nicht
   * bearbeitbar (Vorbild Arbeitsblatt). Jetzt schreibt eine Änderung im Blatt Titel und
   * Wortlaut in die Arbeit zurück (meta.title, meta.kopfText); „wieder berechnen" leert den Wortlaut.
   */
  const kopfBearbeiten: WsContextValue = useMemo(
    () => ({
      ...editContext,
      update: (_id, fn) =>
        updateExam((d) => {
          const kopf = examHeadBlock(d)
          if (!kopf || kopf.type !== 'infoBox') return
          const entwurf = structuredClone(kopf)
          fn(entwurf)
          if (entwurf.type !== 'infoBox') return
          d.meta.title = entwurf.title.replace(/ – (Gruppe|Group) [A-Z]$/, '').trim()
          d.meta.kopfText = entwurf.body
        })
    }),
    [editContext, updateExam]
  )

  /*
   * Beides läuft als Hintergrund-Auftrag (shared/auftraege.ts) mit einer Kopie der Arbeit von
   * jetzt und landet in DIESER Arbeit – auch wenn inzwischen eine andere offen ist.
   */
  const docId = useKlassenarbeit.getState().docId
  const titel = defaultExamName(exam)
  const schluessel = (part: ExamPart): string => `${part.id}:${fassung}`

  /**
   * Einen einzelnen Teil der ANGEZEIGTEN Fassung mit einem eigenen Auftrag neu erzeugen. Sperrt
   * die Arbeit nicht: Am Ende ändert er nur die Bausteine dieses Teils in dieser Fassung (Strg+Z
   * holt die alten zurück).
   */
  const revisePart = (part: ExamPart, index: number): void => {
    const key = schluessel(part)
    const wish = (wuensche[key] ?? '').trim()
    if (!wish) return
    const f = fassung
    setRevise(null)
    setWuensche((w) => ({ ...w, [key]: '' }))
    void starteAuftrag({
      moduleId: 'klassenarbeit',
      docId,
      titel,
      art: `Teil ${index + 1}${gesamt > 1 ? ` (Fassung ${label})` : ''} überarbeiten`,
      eingabe: exam,
      istOffen: () => arbeitOffen(docId),
      sperrt: false,
      schluessel: key,
      fehlerTitel: 'Der Teil konnte nicht überarbeitet werden',
      arbeit: (e, k) => {
        k.melde(`Teil ${index + 1} wird überarbeitet …`)
        const teil = e.parts.find((p) => p.id === part.id) ?? part
        return reviseExamPart(e, { ...teil, blocks: bloeckeDerFassung(teil, f) }, index + 1, wish, k.ai)
      },
      abschluss: () => `Teil ${index + 1} wurde überarbeitet.`,
      ablegen: (blocks, e) =>
        legeArbeitAb(docId, e, (aktuell) => ({
          ...aktuell,
          // Punkte auf den Teil bringen, gemeinsames Material in allen Fassungen gleich halten (model/fassungen.ts)
          parts: aktuell.parts.map((p) => (p.id === part.id ? teilNachUeberarbeitung(aktuell, p, f, blocks) : p))
        }))
    })
  }

  const erzeugenLabel = meta.variants > 1 ? `Klassenarbeit erzeugen (${meta.variants} Fassungen)` : 'Klassenarbeit erzeugen'
  /** Die ganze Arbeit erzeugen – alle eingestellten Fassungen; sperrt sie bis dahin. */
  const run = (): void => {
    const n = Math.max(1, meta.variants)
    void starteAuftrag({
      moduleId: 'klassenarbeit',
      docId,
      titel,
      art: n > 1 ? `Arbeit in ${n} Fassungen ${hasContent ? 'neu erzeugen' : 'erzeugen'}` : hasContent ? 'Arbeit neu erzeugen' : 'Arbeit erzeugen',
      eingabe: exam,
      istOffen: () => arbeitOffen(docId),
      fehlerTitel: 'Die Arbeit konnte nicht erzeugt werden',
      arbeit: (e, k) =>
        generateExam(e, k.ai, (m) => k.melde(m), {
          /*
           * In der Oberstufe waehlt die Lehrkraft die Quelle aus (Entscheidung vom 24.09.2026).
           * Dort ist die Quelle Gegenstand der Pruefung – welcher Text genommen wird, entscheidet
           * darueber, was sich daran ueberhaupt zeigen laesst. Die Frage wartet im Auftrag, bis
           * die Arbeit offen ist (KlassenarbeitModule zeigt dann die Trefferliste).
           */
          auswahl: upperSecondary(e.meta)
            ? (treffer) => k.frage<string | null>(QUELLENAUSWAHL, { treffer, thema: e.meta.topic } satisfies QuellenFrage)
            : undefined,
          websuche: k.websuche,
          bild: k.bild,
          zwischenstand: (stand, was) => k.zeige(stand, { was })
        }),
      // Die erzeugte Arbeit ersetzt den Stand, aus dem sie entstand – ein Schritt für Strg+Z
      ablegen: (next, e) => legeArbeitAb(docId, e, () => next)
    })
  }

  const name = worksheet.meta.title || 'Klassenarbeit'
  /** Das Blatt für die Ausgabe: die angezeigte Fassung oder alle in einem Dokument */
  const quelle = (alle: boolean): BlattQuelle => ({
    ws: worksheet,
    layouts,
    sheetIds: alle ? worksheet.sheets.map((s) => s.id) : [sheet.id],
    name: gesamt > 1 ? (alle ? `${name} (alle Fassungen)` : `${name} ${label}`) : name,
    logo,
    schoolName: settings.schoolName,
    begriff: 'Erwartungshorizont',
    ziel: ablageZiel('klassenarbeit', useKlassenarbeit.getState().docId, meta.subjectLabel || meta.subjectId, { jahrgang: meta.grade, thema: meta.topic })
  })
  const starte = (was: AusgabeModus): void => {
    setAlleAusgeben(true)
    setAusgabe(was)
  }

  /** Die Hörtexte der Arbeit als eigenes Dokument – zum Vorlesen und Nachschlagen. */
  const audioBlocks = exam.parts.flatMap((p) => (p.blocks ?? []).filter((b): b is AudioBlock => b.type === 'audio'))

  const exportTranscript = async (format: 'docx' | 'pdf'): Promise<void> => {
    try {
      const mod = await import('../../arbeitsblatt/export/transcriptDocx')
      const title = meta.title || meta.topic || 'Klassenarbeit'
      const info = { title, subtitle: [meta.subjectLabel, meta.grade ? `Klasse ${meta.grade}` : ''].filter(Boolean).join(' · '), ki: meta.ki }
      const path =
        format === 'docx'
          ? await window.api.files.save(
              mod.transcriptFileName(title),
              [{ name: 'Word-Dokument', extensions: ['docx'] }],
              await mod.buildTranscriptDocx(audioBlocks, info),
              quelle(false).ziel
            )
          : await window.api.exporter.pdf(mod.buildTranscriptHtml(audioBlocks, info), mod.transcriptPdfName(title), undefined, quelle(false).ziel)
      if (path) meldeAblage(path, 'Transkript gespeichert.')
    } catch (e) {
      notifyError(e, 'Das Transkript konnte nicht gespeichert werden')
    }
  }

  /*
   * Bausteine im Blatt ordnen und frei platzieren (Wunsch der Lehrkraft, 24.09.2026).
   *
   * Kopfzeile und Teil-Überschriften („Teil 1: …") werden aus der Arbeit ERRECHNET und
   * gehören keinem Teil; sie bekommen deshalb keine Griffe und sind schreibgeschützt.
   */
  const teilVon = (id: string): ExamPart | undefined => exam.parts.find((p) => bloeckeDerFassung(p, fassung).some((b) => b.id === id))

  /** Bausteinliste der ANGEZEIGTEN Fassung des Teils, in dem der Baustein steht – Änderung als ein Verlaufsschritt */
  const aendereListe = (blockId: string, fn: (liste: WsBlock[], i: number) => void): void =>
    updateExam((d) => {
      const teil = d.parts.find((p) => bloeckeDerFassung(p, fassung).some((x) => x.id === blockId))
      if (!teil) return
      const liste = bloeckeDerFassung(teil, fassung)
      fn(
        liste,
        liste.findIndex((x) => x.id === blockId)
      )
    })
  const bausteinLoeschen = (id: string): void => aendereListe(id, (liste, i) => void liste.splice(i, 1))
  const duplizieren = (id: string): void =>
    aendereListe(
      id,
      (liste, i) => void liste.splice(i + 1, 0, { ...structuredClone(liste[i]), id: newId(), ref: undefined, versions: undefined, versionIndex: undefined })
    )
  const einfuegen = (id: string, versatz: 0 | 1, typ: WsBlockType): void => aendereListe(id, (liste, i) => void liste.splice(i + versatz, 0, newBlock(typ)))

  /**
   * Einen Baustein mit der KI überarbeiten oder neu erzeugen (27.09.2026, Vorbild Arbeitsblatt):
   * ein kleiner Auftrag mit der Arbeit von jetzt; das Ergebnis ersetzt nur diesen Baustein in
   * dieser Fassung, der bisherige Stand bleibt als Fassung abrufbar.
   */
  const bausteinUeberarbeiten = (block: WsBlock, instruction = '', wie: WunschArt = 'ueberarbeiten'): void => {
    // Hörtext (01.10.2026): neues Skript, die Aufgaben dazu in allen Fassungen angepasst – ein Rückgängig-Schritt
    if (block.type === 'audio') return hoertextWunschKlassenarbeit(exam, docId, titel, block.id, wie, instruction)
    const f = fassung
    const neu = wie === 'neu'
    void starteAuftrag({
      moduleId: 'klassenarbeit',
      docId,
      titel,
      art: neu ? 'Baustein neu erzeugen' : 'Baustein überarbeiten',
      eingabe: exam,
      istOffen: () => arbeitOffen(docId),
      sperrt: false,
      schluessel: `block-${block.id}`,
      fehlerTitel: 'Der Baustein konnte nicht überarbeitet werden',
      arbeit: async (e, k) => {
        k.melde(neu ? 'Die KI erzeugt den Baustein neu …' : 'Die KI überarbeitet den Baustein …')
        const ws = examToWorksheet(e, f)
        return regenerateBlock(ws, ws.sheets[0], block.id, profileFromMeta(ws.meta), k.ai, '', instruction, wie)
      },
      abschluss: () => (neu ? 'Der Baustein wurde neu erzeugt.' : 'Der Baustein wurde überarbeitet.'),
      ablegen: (fresh, e) =>
        legeArbeitAb(docId, e, (aktuell) => ({
          ...aktuell,
          parts: aktuell.parts.map((p) =>
            mitBloecken(
              p,
              f,
              bloeckeDerFassung(p, f).map((b) => (b.id === block.id ? addVersion(b, fresh) : b))
            )
          )
        }))
    })
  }

  /**
   * Bewertungsraster zu einer Aufgabe (Großprogramm 0.4, F2): als Tabelle hinter der Aufgabe,
   * nur im Erwartungshorizont. Schreibteile: Inhalt/Sprache bzw. Inhalt/Darstellung nach Fach.
   */
  const rasterErstellen = (block: WsBlock): void => {
    if (block.type !== 'task') return
    const f = fassung
    const teil = exam.parts.find((p) => bloeckeDerFassung(p, f).some((b) => b.id === block.id))
    const schreibteil = typeof teil?.contentShare === 'number'
    void starteAuftrag({
      moduleId: 'klassenarbeit',
      docId,
      titel,
      art: 'Bewertungsraster erstellen',
      eingabe: exam,
      istOffen: () => arbeitOffen(docId),
      sperrt: false,
      schluessel: `raster-${block.id}`,
      fehlerTitel: 'Das Bewertungsraster konnte nicht erstellt werden',
      arbeit: async (e, k) => {
        k.melde('Die KI entwirft das Bewertungsraster …')
        const ws = examToWorksheet(e, f)
        const punkte = block.points > 0 ? block.points : teil?.points ?? 0
        const antwort = await k.ai<unknown>(
          rasterAnfrage({
            system: systemPrompt(ws.meta, profileFromMeta(ws.meta)),
            aufgabe: describeBlock(block),
            loesung: block.solution,
            punkte,
            ...(schreibteil
              ? {
                  aufteilung: {
                    inhalt: teil?.contentShare ?? inhaltsanteil(e.meta.subjectId),
                    zweiter: zweiterTeil(e.meta.subjectId) as 'Sprache' | 'Darstellung'
                  }
                }
              : {})
          })
        )
        return rasterAus(antwort, `Bewertungsraster: ${teil?.label ?? 'Aufgabe'}`, punkte)
      },
      abschluss: () => 'Das Raster steht hinter der Aufgabe im Erwartungshorizont.',
      ablegen: (raster, e) =>
        legeArbeitAb(docId, e, (aktuell) => ({
          ...aktuell,
          parts: aktuell.parts.map((p) => {
            const bloecke = bloeckeDerFassung(p, f)
            if (!bloecke.some((b) => b.id === block.id)) return p
            const id = `raster-${block.id}`
            const tabelle = { ...(newBlock('table') as Extract<WsBlock, { type: 'table' }>), id, ...rasterAlsTabelle(raster), nurLoesung: true }
            const neu = bloecke.filter((b) => b.id !== id)
            neu.splice(neu.findIndex((b) => b.id === block.id) + 1, 0, tabelle)
            return mitBloecken(p, f, neu)
          })
        }))
    })
  }

  const wrapBlock = (block: WsBlock, placed: PlacedItem, content: React.ReactNode): React.ReactNode => {
    // Kopfkasten: bearbeitbar (Titel und Wortlaut landen in der Arbeit); Teil-Überschriften bleiben berechnet
    if (block.id === 'exam-head') return <WsContext.Provider value={loesung ? nurLesen : kopfBearbeiten}>{content}</WsContext.Provider>
    /*
     * Operatorenliste (01.10.2026): berechnet, also nicht zu bearbeiten – aber im Blatt nach oben
     * oder unten zu ziehen. Die übrigen Bausteine rücken nach; gespeichert wird der Baustein davor.
     */
    if (block.id === OPERATOREN_BLOCK_ID)
      return (
        <WsContext.Provider value={nurLesen}>
          <BausteinRahmen
            block={block}
            placed={placed}
            onUpdate={() => undefined}
            imFluss={(nach) => updateExam((d) => void (d.meta.operatorenNach = nach))}
            menue={
              exam.meta.operatorenNach ? (
                <Menu.Item leftSection={<IconArrowBackUp size={14} />} onClick={() => updateExam((d) => void delete d.meta.operatorenNach)}>
                  An die vorgesehene Stelle zurück
                </Menu.Item>
              ) : undefined
            }
          >
            {content}
          </BausteinRahmen>
        </WsContext.Provider>
      )
    if (!teilVon(block.id)) return <WsContext.Provider value={nurLesen}>{content}</WsContext.Provider>
    const laeuft = busy.has(`block-${block.id}`)
    return (
      <BausteinRahmen
        block={block}
        placed={placed}
        busy={laeuft}
        onUpdate={(fn, gruppe) => updateExam((d) => aendereBaustein(d, block.id, fn), gruppe)}
        extras={
          <>
            {!loesung && block.warnings && block.warnings.length > 0 && (
              <WarningButton
                warnings={block.warnings}
                onDismiss={() => updateExam((d) => aendereBaustein(d, block.id, (b) => (b.warnings = [])))}
                onBeheben={(liste) => arbeitHinweiseBeheben(exam, docId, fassung, liste)}
                laeuft={[...busy].some((k) => k.startsWith('beheben-'))}
              />
            )}
            <KiMenue
              block={block}
              busy={laeuft}
              kontext={() => wunschKontextFuer(block, worksheet.meta, 'Klassenarbeit')}
              onWunsch={(wie, wunsch) => bausteinUeberarbeiten(block, wunsch, wie)}
            >
              <NurExperte>
                {block.type === 'task' && (
                  <Menu.Item onClick={() => rasterErstellen(block)} data-raster-erstellen>
                    Bewertungsraster erstellen
                  </Menu.Item>
                )}
              </NurExperte>
              <NurExperte>
                {/* Hör-/Leseverstehen: weitere Items im gleichen Format mit Stufenmix (29.09.2026) */}
                {block.type === 'task' && (block.skill === 'listening' || block.skill === 'reading' || block.audioId) && (
                  <Menu.Item leftSection={<IconPlaylistAdd size={14} />} onClick={() => setZusatzFuer(block.id)}>
                    Weitere Fragen im gleichen Format …
                  </Menu.Item>
                )}
              </NurExperte>
              {/* Leveln (Großprogramm 0.4, F1) – etwa für eine Fassung mit Nachteilsausgleich */}
              <NurExperte>
                <LevelnMenue block={block} meta={exam.meta} onRevise={(instruction) => bausteinUeberarbeiten(block, instruction)} />
              </NurExperte>
            </KiMenue>
            <NurExperte>
              <BlockSettings block={block} combined={false} update={(fn, gruppe) => updateExam((d) => aendereBaustein(d, block.id, fn), gruppe)} />
            </NurExperte>
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
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => bausteinLoeschen(block.id)}>
              Baustein löschen
            </Menu.Item>
          </>
        }
        onMove={(richtung) =>
          updateExam((d) => {
            // Nur INNERHALB des Teils und der Fassung: Die Teile sind der Aufbau der Arbeit
            const teil = d.parts.find((p) => bloeckeDerFassung(p, fassung).some((x) => x.id === block.id))
            if (!teil) return
            const liste = bloeckeDerFassung(teil, fassung)
            const i = liste.findIndex((x) => x.id === block.id)
            const j = i + richtung
            if (j < 0 || j >= liste.length) return
            ;[liste[i], liste[j]] = [liste[j], liste[i]]
          })
        }
      >
        {!placed.continued && !loesung && (
          <VersionSwitcher block={block} onSwitch={(i) => aendereListe(block.id, (liste, k) => void (liste[k] = switchVersion(liste[k], i)))} />
        )}
        {content}
      </BausteinRahmen>
    )
  }

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <EditorLeiste
        zurueck={{ label: 'Rahmen', onClick: () => setStep(0) }}
        undo={{ canUndo: verlauf.past.length > 0, canRedo: verlauf.future.length > 0, onUndo: undo, onRedo: redo }}
        fassungen={
          gesamt > 1
            ? {
                value: String(fassung),
                onChange: (v) => setFassung(Number(v)),
                data: Array.from({ length: gesamt }, (_, f) => ({ value: String(f), label: gruppe(f) })),
                ariaLabel: 'Angezeigte Fassung'
              }
            : null
        }
        ansichten={{
          value: hoertexte ? 'audio' : loesung ? 'key' : 'student',
          onChange: (v) => {
            setHoertexte(v === 'audio')
            if (v !== 'audio') setLoesung(v === 'key')
          },
          // „Erwartungshorizont" bleibt der Name des Lösungsteils – fachlich richtig für eine Klassenarbeit
          data: [
            { value: 'student', label: 'Arbeit' },
            { value: 'key', label: 'Erwartungshorizont' },
            ...(hatHoertexte ? [{ value: 'audio', label: 'Hörtexte' }] : [])
          ]
        }}
        optionen={
          <BlattoptionenFelder
            designs={designs}
            designId={exam.design.id}
            onDesign={(d) => updateExam((x) => (x.design = structuredClone(d)))}
            kiVermerk={{ wert: meta.kiVermerk, ki: meta.ki, onChange: (v) => updateExam((d) => (d.meta.kiVermerk = v)) }}
            schulangaben={{ checked: meta.showSchool !== false, onChange: (an) => updateExam((d) => (d.meta.showSchool = an)) }}
            korrekturrand={{ checked: Boolean(meta.correctionMargin), onChange: (an) => updateExam((d) => (d.meta.correctionMargin = an)) }}
            notizrand={voll ? { checked: Boolean(meta.notesMargin), onChange: (an) => updateExam((d) => (d.meta.notesMargin = an)) } : undefined}
            anmerkungen={
              voll
                ? hatAnmerkungen(exam.parts.flatMap((p) => alleFassungen(p).flat()))
                  ? { wert: anmerkungsArt(meta), onChange: (art) => updateExam((d) => (d.meta.anmerkungen = art)) }
                  : undefined
                : undefined
            }
            blocksatz={
              voll ? { checked: exam.design.page.justifyText !== false, onChange: (an) => updateExam((d) => (d.design.page.justifyText = an)) } : undefined
            }
            fach={meta.subjectId}
            vorlagenfarbe={voll ? { checked: Boolean(meta.vorlagenfarbe), onChange: (an) => updateExam((d) => (d.meta.vorlagenfarbe = an)) } : undefined}
            ueberthema={
              voll ? { werte: meta, bereich: bereich ?? '', onChange: (patch) => updateExam((d) => Object.assign(d.meta, patch), 'ueberthema') } : undefined
            }
            vorKiTest={
              voll ? (
                meta.kopfText?.trim() ? (
                  <Button size="compact-xs" variant="subtle" onClick={() => updateExam((d) => (d.meta.kopfText = undefined))}>
                    Kopfkasten wieder berechnen
                  </Button>
                ) : null
              ) : undefined
            }
            kiTest={
              voll
                ? {
                    an: Boolean(meta.aiCanary),
                    woerter: meta.aiCanaryWords,
                    vorschlagFuer: `${meta.title}|${meta.topic}`,
                    onEin: () => setCanaryOffen(true),
                    onAus: () => updateExam((d) => (d.meta.aiCanary = false))
                  }
                : undefined
            }
          />
        }
        extras={
          <>
            {/* Vor dem ersten Entwurf stehen beide Wege groß in der Startkarte (01.10.2026); hier bleibt „Neu erzeugen“ für später */}
            {hasContent && (
              <Button size="xs" variant="light" leftSection={<IconRefresh size={14} />} onClick={run}>
                Neu erzeugen
              </Button>
            )}
            <NurExperte>
              {/* Verlagsmaterial zerlegen und Aufgaben auswählen (29.09.2026) */}
              {hasContent && (
                <Tooltip label="Klassenarbeitsvorschlag, Testheft oder Lehrerband einlesen, in Aufgaben zerlegen und auswählen">
                  <Button size="xs" variant="light" leftSection={<IconFileImport size={14} />} onClick={() => setImportOffen(true)} data-testid="verlagsimport">
                    Aufgaben aus Material
                  </Button>
                </Tooltip>
              )}
            </NurExperte>
            {hasContent && <RueckmeldungKnopf art="klassenarbeit" docId={docId} />}
            <NurExperte>
              {hasContent && (
                <LmsExport
                  titel={exam.meta.title || exam.meta.topic}
                  bericht={() => fragenAusBlatt(examToWorksheet(exam, gewaehlt))}
                  ziel={quelle(false).ziel}
                />
              )}
            </NurExperte>
            {audioBlocks.length > 0 && (
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <Button variant="light" leftSection={<IconHeadphones size={16} />}>
                    Transkript
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconFileTypeDocx size={14} />} onClick={() => void exportTranscript('docx')}>
                    Als Word-Datei
                  </Menu.Item>
                  <Menu.Item leftSection={<IconPrinter size={14} />} onClick={() => void exportTranscript('pdf')}>
                    Als PDF
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </>
        }
        name={{ value: docName, placeholder: defaultExamName(exam), onChange: setDocName }}
        gesichertAm={savedAt}
        dateiSpeichern={{
          tooltip: 'Als Datei speichern … (.klassenarbeit, z. B. zum Weitergeben)',
          onClick: async () => {
            try {
              const path = await window.api.files.save(`${quelle(false).name}.klassenarbeit`, EXAM_FILTER, serializeExam(exam), quelle(false).ziel)
              if (path) meldeAblage(path, 'Klassenarbeit gespeichert.')
            } catch (e) {
              notifyError(e)
            }
          }
        }}
        ausgabe={{ onWord: () => starte('docx'), onPdf: () => starte('pdf'), onDrucken: () => starte('print') }}
      />
      <CanaryDialog
        offen={canaryOffen}
        vorschlag={canaryWordFor(`${meta.title}|${meta.topic}`)}
        wert={meta.aiCanaryWords ?? ''}
        onAbbruch={() => setCanaryOffen(false)}
        onFertig={(woerter) => {
          updateExam((d) => {
            d.meta.aiCanary = true
            d.meta.aiCanaryWords = woerter
          })
          setCanaryOffen(false)
        }}
      />
      <VerlagsImportDialog opened={importOffen} onClose={() => setImportOffen(false)} exam={exam} docId={docId} />
      <ZusatzfragenDialog aufgabeId={zusatzFuer} onClose={() => setZusatzFuer(null)} exam={exam} fassung={fassung} docId={docId} />
      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        <Container size="xl" py="lg">
          {/*
           * Startkarte, solange nichts erzeugt ist (Befund der Lehrkraft 01.10.2026): Vorher stand
           * nur „Arbeit erzeugen“ klein in der Leiste und ein Hinweis unter dem Aufbau – der nächste
           * Schritt war nicht zu erkennen. Jetzt oben, groß, ohne Scrollen sichtbar.
           */}
          {!hasContent && (
            <ErzeugenStart
              titel="Rahmen steht – jetzt die Aufgaben erzeugen"
              knopf={{ label: erzeugenLabel, onClick: run, laedt: erzeugtGerade }}
              alternativen={
                <>
                  <Tooltip label="Klassenarbeitsvorschlag, Testheft oder Lehrerband einlesen, in Aufgaben zerlegen und auswählen">
                    <Button variant="default" leftSection={<IconFileImport size={16} />} onClick={() => setImportOffen(true)} data-testid="verlagsimport">
                      Aufgaben aus Material
                    </Button>
                  </Tooltip>
                  <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => setStep(0)}>
                    Rahmen ändern
                  </Button>
                </>
              }
            >
              Die KI schreibt für {exam.parts.length === 1 ? 'den geplanten Teil' : `alle ${exam.parts.length} geplanten Teile`} Material und Aufgaben
              {meta.answerKey ? ' samt Erwartungshorizont' : ''}
              {meta.variants > 1 ? `, und zwar in ${meta.variants} gleichwertigen Fassungen` : ''}. Jeder Teil wird einzeln erzeugt, das dauert je nach
              KI-Zugang einen Moment. Danach lässt sich alles direkt im Blatt ändern, einzelne Teile lassen sich mit ✨ gezielt überarbeiten.
            </ErzeugenStart>
          )}
          {/*
           * Aufbau der Arbeit (Teile mit ✨, Noten) – seit 27.09.2026 EINKLAPPBAR unter der Leiste,
           * damit das Blatt oben steht wie beim Arbeitsblatt. Entscheidung der Lehrkraft: standardmäßig
           * zu, offen nur, solange noch nichts erzeugt ist.
           */}
          <Group gap="xs" mb="xs">
            <Button
              size="compact-sm"
              variant="subtle"
              leftSection={aufbauOffen ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              onClick={() => setAufbauOffen((o) => !o)}
              aria-expanded={aufbauOffen}
              data-testid="aufbau-kopf"
            >
              Aufbau der Arbeit
              {aufbauOffen
                ? ''
                : ` – ${exam.parts.length} ${exam.parts.length === 1 ? 'Teil' : 'Teile'} · ${grades.map((g) => `${g.label} ${g.weight} %`).join(' · ')}`}
            </Button>
          </Group>
          <Collapse expanded={aufbauOffen}>
            <div>
              <Card withBorder mb="md">
                <Title order={4} mb="sm">
                  {meta.title || 'Klassenarbeit'}: {meta.topic}
                </Title>
                <Stack gap="sm">
                  {exam.parts.map((part, i) => {
                    const format = formatById(part.formatId)
                    const formats = (part.formats ?? []).map((id) => comprehensionFormatById(id)?.label).filter(Boolean)
                    const key = schluessel(part)
                    const bloecke = bloeckeDerFassung(part, fassung)
                    return (
                      <Card key={part.id} withBorder padding="sm">
                        <Group gap="xs" mb={4}>
                          <Badge variant="light">Teil {i + 1}</Badge>
                          <Text fw={600}>{format?.label ?? part.label}</Text>
                          <Badge variant="outline" color="gray">
                            {part.competence}
                          </Badge>
                          <Badge variant="light" color={part.gradeGroup === 'writing' ? 'grape' : 'blue'}>
                            {part.weight} %
                          </Badge>
                          {bloecke.length > 0 && (
                            <Badge variant="light" color="teal">
                              {bloecke.length} Bausteine
                            </Badge>
                          )}
                          <Popover width={320} position="bottom-end" withArrow opened={revise === key} onChange={(o) => setRevise(o ? key : null)}>
                            <Popover.Target>
                              <Tooltip
                                label={
                                  gesamt > 1
                                    ? `Diesen Teil in Fassung ${label} mit einem eigenen Auftrag überarbeiten`
                                    : 'Diesen Teil mit einem eigenen Auftrag überarbeiten'
                                }
                              >
                                <ActionIcon
                                  variant="subtle"
                                  aria-label={`Teil ${i + 1} überarbeiten`}
                                  loading={busy.has(key)}
                                  onClick={() => setRevise(revise === key ? null : key)}
                                >
                                  <IconSparkles size={16} />
                                </ActionIcon>
                              </Tooltip>
                            </Popover.Target>
                            <Popover.Dropdown>
                              <Stack gap="xs">
                                <Textarea
                                  size="xs"
                                  label="Was soll anders werden?"
                                  description="Strg+Enter startet den Auftrag"
                                  placeholder="z. B. kürzerer Text, keine Multiple-Choice-Aufgaben, Thema Sport"
                                  autosize
                                  minRows={2}
                                  data-autofocus
                                  value={wuensche[key] ?? ''}
                                  onChange={(e) => {
                                    const v = e.currentTarget.value
                                    setWuensche((w) => ({ ...w, [key]: v }))
                                  }}
                                  onKeyDown={(e) => {
                                    // Wie in den übrigen Überarbeiten-Feldern der App: Strg+Enter schickt ab
                                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                      e.preventDefault()
                                      revisePart(part, i)
                                    }
                                  }}
                                />
                                <Button size="xs" disabled={!(wuensche[key] ?? '').trim()} onClick={() => revisePart(part, i)}>
                                  {gesamt > 1 ? `Teil überarbeiten (Fassung ${label})` : 'Teil überarbeiten'}
                                </Button>
                              </Stack>
                            </Popover.Dropdown>
                          </Popover>
                        </Group>
                        <Text size="sm" c="dimmed">
                          {part.points > 0
                            ? `${part.points} Punkte`
                            : `Bewertung: ${part.contentShare ?? inhaltsanteil(exam.meta.subjectId)} % Inhalt, ${
                                100 - (part.contentShare ?? inhaltsanteil(exam.meta.subjectId))
                              } % ${zweiterTeil(exam.meta.subjectId)}`}{' '}
                          · {part.minutes} Minuten
                          {formats.length ? ` · Formate: ${formats.join(', ')}` : ''}
                        </Text>
                      </Card>
                    )
                  })}
                </Stack>
              </Card>

              <Card withBorder mb="md">
                <Title order={4} mb="sm">
                  Noten
                </Title>
                <List spacing={4} size="sm">
                  {grades.map((g) => (
                    <List.Item key={g.group}>
                      <b>{g.label}</b>: {g.points > 0 ? `${g.points} Punkte` : 'Inhalt und Sprache'} · zählt {g.weight} %
                    </List.Item>
                  ))}
                </List>
                <Text size="xs" c="dimmed" mt="xs">
                  {meta.gradeScale ? 'Der Notenschlüssel steht auf der ersten Seite der Arbeit.' : 'Ohne Notenschlüssel auf der Arbeit.'} Die Arbeit hat kein
                  Deckblatt – sie beginnt sofort mit dem Kopf und der ersten Aufgabe.
                </Text>
              </Card>
            </div>
          </Collapse>

          <AnredeHinweise
            befunde={anrede}
            // Paket 12: „Mit KI beheben" – je Fassung ein Auftrag (bei mehreren steht „Fassung B, …" vor dem Hinweis)
            onBeheben={(liste) => {
              worksheet.sheets.forEach((s, f) => {
                const eigene = gesamt > 1 ? liste.filter((b) => b.startsWith(`${s.label}, `)) : liste
                if (eigene.length) arbeitHinweiseBeheben(exam, docId, f, eigene)
              })
            }}
            laeuft={[...busy].some((k) => k.startsWith('beheben-'))}
          />
          <LernhilfenHinweis
            befunde={hilfen}
            onUmsetzen={() =>
              updateExam((d) => {
                for (const t of d.parts) {
                  t.blocks = hilfenInsLehrermaterial(t.blocks)
                  if (t.weitereFassungen) t.weitereFassungen = t.weitereFassungen.map(hilfenInsLehrermaterial)
                }
              })
            }
          />
          {/* Ankreuzfragen zu Texten ohne Blindprobe (01.10.2026): auf Abruf prüfen und Lösbares neu fassen – je Teil und Fassung */}
          {hasContent && (
            <McBlindHinweis
              listen={exam.parts.filter((p) => formatArt(p.formatId) !== 'speaking').flatMap((p) => alleFassungen(p))}
              ai={aiCall}
              uebernehmen={(ergebnisse) => {
                const vorher = ergebnisse.flatMap((e) => e.vorher)
                const nachher = ergebnisse.flatMap((e) => e.nachher)
                updateExam((d) => {
                  for (const t of d.parts) {
                    t.blocks = uebernimmBlindprobe(t.blocks, vorher, nachher)
                    if (t.weitereFassungen) t.weitereFassungen = t.weitereFassungen.map((f) => uebernimmBlindprobe(f, vorher, nachher))
                  }
                })
              }}
            />
          )}
          <OperatorformHinweis
            befunde={formen}
            onUmsetzen={() =>
              updateExam((d) => {
                for (const t of d.parts) {
                  operatorformenUmsetzen(t.blocks)
                  for (const f of t.weitereFassungen ?? []) operatorformenUmsetzen(f)
                }
              })
            }
          />

          {hasContent && meta.variants !== gesamt && (
            <Alert color="gray" icon={<IconInfoCircle size={18} />} mb="md" p="xs">
              <Text size="sm">
                Eingestellt {meta.variants === 1 ? 'ist eine Fassung' : `sind ${meta.variants} Fassungen`}, erzeugt{' '}
                {gesamt === 1 ? 'ist eine' : `sind ${gesamt}`}. „Neu erzeugen“ legt die Arbeit passend an.
              </Text>
            </Alert>
          )}

          {hasContent && hoertexte && (
            <Card withBorder mb="md">
              <AudioPanel
                ws={audioSicht}
                onUpdate={updateAudio}
                ablage={quelle(false).ziel}
                // Änderungswunsch am Skript (01.10.2026): wie am Baustein, die Aufgaben ziehen mit
                onWunsch={(audioId, art, wunsch) => hoertextWunschKlassenarbeit(exam, docId, titel, audioId, art, wunsch)}
                wunschKontext={(b) => wunschKontextFuer(b, audioSicht.meta, 'Klassenarbeit')}
                wunschLaeuft={(audioId) => busy.has(`block-${audioId}`)}
                // Die erste Aufgabe zum Hörtext (verknüpft oder direkt dahinter) bekommt die neuen Fragen
                onZusatzfragen={(audioId) => {
                  for (const p of exam.parts) {
                    const liste = bloeckeDerFassung(p, fassung)
                    const i = liste.findIndex((b) => b.id === audioId)
                    const ziel =
                      liste.find((b) => b.type === 'task' && b.audioId === audioId) ?? (i >= 0 ? liste.slice(i + 1).find((b) => b.type === 'task') : undefined)
                    if (ziel) return setZusatzFuer(ziel.id)
                  }
                  notifyError(new Error('Zu diesem Hörtext gibt es noch keine Aufgabe, die ergänzt werden könnte.'))
                }}
              />
            </Card>
          )}

          {hasContent && !hoertexte && (
            <>
              {operatorenlisteAktiv(exam) && operatorenHinweis && (
                <Alert color="yellow" variant="light" mb="xs" p="xs" data-testid="operatoren-hinweis">
                  <Text size="xs" style={{ whiteSpace: 'pre-line' }}>
                    {operatorenHinweis}
                  </Text>
                </Alert>
              )}
              <Text size="xs" c="dimmed" mb="xs">
                {loesung
                  ? 'Lösungen und Erwartungshorizont lassen sich direkt im Blatt ändern.'
                  : 'Texte, Aufgaben und der Kopfkasten lassen sich direkt im Blatt ändern; Strg+Z nimmt Änderungen zurück.'}
              </Text>
              <FitToWidth
                className={`ws-editor-pages ${loesung ? 'editor-sheet-key' : ''}`}
                widthPx={blattBreitePx(layouts.get(`${sheet.id}:${loesung ? 'key' : 'print'}`))}
              >
                <SheetPages
                  ws={worksheet}
                  sheet={sheet}
                  plans={layouts.get(`${sheet.id}:${loesung ? 'key' : 'print'}`) ?? []}
                  info={pageInfo}
                  context={editContext}
                  wrapBlock={wrapBlock}
                  seitenWerkzeug={!loesung && editContext.update ? seitenFormatWerkzeug(sheet, editContext.update, querBausteine(sheet.blocks)) : undefined}
                />
              </FitToWidth>
            </>
          )}
          {measure}
          <AusgabeDialog
            modus={ausgabe}
            onClose={() => setAusgabe(null)}
            modul="klassenarbeit"
            hatLoesungen={meta.answerKey}
            erwartungshorizont
            onAusgabe={async (modus, loesungWahl) => {
              const q = quelle(gesamt > 1 && alleAusgeben)
              if (modus === 'print') setDruck(druckAusgabe(q, loesungWahl))
              else await speichereBlatt(q, modus, loesungWahl)
            }}
          >
            {/*
             * Wie in der Lernzielkontrolle: VORHER fragen. Stillschweigend nur die angezeigte
             * Fassung zu drucken fiele erst auf, wenn die Hälfte der Klasse das falsche Blatt hat.
             */}
            {gesamt > 1 && (
              <Radio.Group
                label={`${gesamt} Fassungen – nur die angezeigte oder alle?`}
                value={alleAusgeben ? 'alle' : 'eine'}
                onChange={(v) => setAlleAusgeben(v === 'alle')}
              >
                <Stack gap={6} mt={4}>
                  <Radio value="eine" label={`Nur ${gruppe(fassung)}`} />
                  <Radio value="alle" label="Alle in einer Datei" />
                </Stack>
              </Radio.Group>
            )}
          </AusgabeDialog>
          <PrintPreview html={druck?.html ?? null} loesung={druck?.loesung} title={`Drucken – ${quelle(false).name}`} onClose={() => setDruck(null)} />
        </Container>
      </ScrollArea>
      {/* Wie in den Formularen: Der Hauptknopf steht vor dem ersten Entwurf auch fest unten */}
      {!hasContent && (
        <Formularfuss
          links={
            <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => setStep(0)}>
              Zurück zum Rahmen
            </Button>
          }
        >
          <Button size="md" leftSection={<IconSparkles size={18} />} onClick={run} loading={erzeugtGerade} data-testid="erzeugen-fuss">
            {erzeugenLabel}
          </Button>
        </Formularfuss>
      )}
    </Box>
  )
}
