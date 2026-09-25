import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  List,
  Menu,
  Popover,
  Radio,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  Title,
  Tooltip
} from '@mantine/core'
import { IconArrowLeft, IconFileTypeDocx, IconFileTypePdf, IconHeadphones, IconInfoCircle, IconPrinter, IconRefresh, IconSparkles } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { notifyError, notifySuccess } from '../../../shared/util'
import { comprehensionFormatById } from '../../arbeitsblatt/didactics/comprehensionFormats'
import { druckAusgabe, speichereBlatt, type BlattQuelle } from '../../arbeitsblatt/export/blattAusgabe'
import PrintPreview from '../../../shared/components/PrintPreview'
import { AusgabeDialog, type AusgabeModus } from '../../../shared/components/LoesungsWahl'
import { useDruck } from '../../../shared/navigation'
import { contextFor, pageInfoFor, SheetPages, useSheetLayouts } from '../../arbeitsblatt/render/SheetPages'
import { BausteinRahmen } from '../../arbeitsblatt/render/BausteinRahmen'
import { WsContext, type WsContextValue } from '../../arbeitsblatt/render/WsContext'
import type { PlacedItem } from '../../arbeitsblatt/render/paginate'
import type { WsBlock } from '../../arbeitsblatt/model/types'
import FitToWidth from '../../../shared/render/FitToWidth'
import { useAppSettings } from '../../../shared/settingsStore'
import { generateExam, reviseExamPart, upperSecondary } from '../generation/generateExam'
import { CONTENT_SHARE, formatById } from '../model/formats'
import type { Exam, ExamPart } from '../model/types'
import { examGrades } from '../model/types'
import { alleFassungen, bloeckeDerFassung, fassungsLabel, fassungsZahl, materialweg, mitBloecken, uebernimmMaterial } from '../model/fassungen'
import { examHasContent, examToWorksheet, examToWorksheetAlle } from '../render/examWorksheet'
import { AudioPanel } from '../../arbeitsblatt/steps/AudioPanel'
import type { Worksheet } from '../../arbeitsblatt/model/types'
import { useKlassenarbeit } from '../store'
import { starteAuftrag, useLaufendeSchluessel } from '../../../shared/auftraege'
import { arbeitOffen, defaultExamName, legeArbeitAb } from '../library'
import { QUELLENAUSWAHL, type QuellenFrage } from '../../arbeitsblatt/auftraege'
import type { AudioBlock } from '../../arbeitsblatt/model/types'

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
export default function TasksStep({ exam }: { exam: Exam }): React.JSX.Element {
  const { setStep, fassung: gewaehlt, setFassung, loesung, setLoesung } = useKlassenarbeit()
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
  const updateAudio = (fn: (ws: Worksheet) => void, gruppe?: string): void =>
    updateExam((draft) => {
      const view = examToWorksheet(draft, 0)
      fn(view)
      const neu = new Map(view.sheets.flatMap((s) => s.blocks).map((b) => [b.id, b]))
      for (const part of draft.parts) {
        part.blocks = part.blocks.map((b) => neu.get(b.id) ?? b)
        if (part.weitereFassungen)
          part.weitereFassungen = part.weitereFassungen.map((liste) => liste.map((b) => (neu.get(b.id) ? structuredClone(neu.get(b.id)!) : b)))
      }
    }, gruppe)
  const settings = useAppSettings((s) => s.settings)
  const logo = useAppSettings((s) => s.logoDataUrl)
  // Teile, an denen gerade ein Auftrag „überarbeiten" arbeitet (je Teil und Fassung)
  const busy = useLaufendeSchluessel(useKlassenarbeit((s) => s.docId))
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
  const worksheet = useMemo(() => examToWorksheetAlle(exam), [exam])
  const audioSicht = useMemo(() => examToWorksheet(exam, 0), [exam])
  const { layouts, measure } = useSheetLayouts(hasContent ? worksheet : null, logo, settings.schoolName)
  // Strg+P öffnet denselben Druckdialog wie der Knopf „Drucken" – sobald es etwas zu drucken gibt
  useDruck('klassenarbeit', hasContent ? () => starte('print') : null)
  const sheet = worksheet.sheets[fassung] ?? worksheet.sheets[0]
  // Die Sprache der Beschriftungen steht am Blatt (examToWorksheet), damit PDF und Word sie mitnehmen
  const pageInfo = useMemo(
    () => pageInfoFor(worksheet, sheet, logo, settings.schoolName, loesung, settings.citationStyle),
    [worksheet, sheet, logo, settings.schoolName, settings.citationStyle, loesung]
  )
  // Direkt im Blatt bearbeiten – in der Arbeit oder im Erwartungshorizont
  const editContext = useMemo(
    () =>
      contextFor(worksheet, sheet, loesung ? 'keyEdit' : 'edit', {
        update: (blockId, fn) => updateExam((d) => aendereBaustein(d, blockId, fn))
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
          parts: aktuell.parts.map((p) => {
            if (p.id !== part.id) return p
            // Weitere Fassung mit übernommenem Material (Hörtext, Quelle): Das Material bleibt dasselbe
            const neu = f > 0 && materialweg(aktuell, p) === 'gleich' ? uebernimmMaterial(bloeckeDerFassung(p, f), blocks) : blocks
            return mitBloecken(p, f, neu)
          })
        }))
    })
  }

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
          bild: k.bild
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
    begriff: 'Erwartungshorizont'
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
      const info = { title, subtitle: [meta.subjectLabel, meta.grade ? `Klasse ${meta.grade}` : ''].filter(Boolean).join(' · ') }
      const path =
        format === 'docx'
          ? await window.api.files.save(
              mod.transcriptFileName(title),
              [{ name: 'Word-Dokument', extensions: ['docx'] }],
              await mod.buildTranscriptDocx(audioBlocks, info)
            )
          : await window.api.exporter.pdf(mod.buildTranscriptHtml(audioBlocks, info), mod.transcriptPdfName(title))
      if (path) notifySuccess('Transkript gespeichert.')
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
  const wrapBlock = (block: WsBlock, placed: PlacedItem, content: React.ReactNode): React.ReactNode => {
    if (!teilVon(block.id)) return <WsContext.Provider value={nurLesen}>{content}</WsContext.Provider>
    return (
      <BausteinRahmen
        block={block}
        placed={placed}
        onUpdate={(fn, gruppe) => updateExam((d) => aendereBaustein(d, block.id, fn), gruppe)}
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
        {content}
      </BausteinRahmen>
    )
  }

  return (
    <ScrollArea h="100%">
      <Container size="xl" py="lg">
        <Group justify="space-between" mb="md">
          <div>
            <Title order={2}>Bearbeiten &amp; Export</Title>
            <Text c="dimmed" size="sm">
              {meta.subjectLabel} · {meta.schoolTypeName} · Klasse {meta.grade} · {meta.minutes} Minuten
              {meta.variants > 1 ? ` · ${meta.variants} Fassungen` : ''}
            </Text>
          </div>
          <Group gap="xs">
            <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => setStep(0)}>
              Zurück zum Rahmen
            </Button>
            <Button leftSection={hasContent ? <IconRefresh size={16} /> : <IconSparkles size={16} />} onClick={run}>
              {hasContent ? 'Neu erzeugen' : 'Arbeit erzeugen'}
            </Button>
          </Group>
        </Group>

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
                      : `Bewertung: ${part.contentShare ?? CONTENT_SHARE} % Inhalt, ${100 - (part.contentShare ?? CONTENT_SHARE)} % Sprache`}{' '}
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

        {!hasContent && (
          <Alert color="blue" icon={<IconInfoCircle size={18} />} title="Noch keine Aufgaben erzeugt">
            <Text size="sm">
              „Arbeit erzeugen“ schreibt Material, Aufgaben und – wenn eingeschaltet – den Erwartungshorizont für jeden Teil
              {meta.variants > 1 ? `, und zwar in ${meta.variants} gleichwertigen Fassungen` : ''}. Jeder Teil wird einzeln erzeugt, das dauert je nach
              KI-Zugang einen Moment.
            </Text>
          </Alert>
        )}

        {hasContent && meta.variants !== gesamt && (
          <Alert color="gray" icon={<IconInfoCircle size={18} />} mb="md" p="xs">
            <Text size="sm">
              Eingestellt {meta.variants === 1 ? 'ist eine Fassung' : `sind ${meta.variants} Fassungen`}, erzeugt {gesamt === 1 ? 'ist eine' : `sind ${gesamt}`}
              . „Neu erzeugen“ legt die Arbeit passend an.
            </Text>
          </Alert>
        )}

        {hasContent && audioSicht.sheets.some((s) => s.blocks.some((b) => b.type === 'audio')) && (
          <Card withBorder mb="md">
            <AudioPanel ws={audioSicht} onUpdate={updateAudio} />
          </Card>
        )}

        {hasContent && (
          <>
            <Group justify="space-between" mb="sm" gap="xs">
              <Group gap="xs">
                {gesamt > 1 && (
                  <SegmentedControl
                    size="xs"
                    aria-label="Angezeigte Fassung"
                    value={String(fassung)}
                    onChange={(v) => setFassung(Number(v))}
                    data={Array.from({ length: gesamt }, (_, f) => ({ value: String(f), label: gruppe(f) }))}
                  />
                )}
                {/* „Erwartungshorizont" bleibt hier der Name des Lösungsteils – fachlich richtig für eine Klassenarbeit */}
                <SegmentedControl
                  size="xs"
                  aria-label="Ansicht"
                  value={loesung ? 'key' : 'student'}
                  onChange={(v) => setLoesung(v === 'key')}
                  data={[
                    { value: 'student', label: 'Arbeit' },
                    { value: 'key', label: 'Erwartungshorizont' }
                  ]}
                />
              </Group>
              <Group gap="xs">
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
                <Button variant="default" leftSection={<IconFileTypePdf size={16} />} onClick={() => starte('pdf')}>
                  PDF
                </Button>
                <Button variant="default" leftSection={<IconFileTypeDocx size={16} />} onClick={() => starte('docx')}>
                  Word
                </Button>
                <Button variant="default" leftSection={<IconPrinter size={16} />} onClick={() => starte('print')}>
                  Drucken
                </Button>
              </Group>
            </Group>
            <Text size="xs" c="dimmed" mb="xs">
              {loesung
                ? 'Lösungen und Erwartungshorizont lassen sich direkt im Blatt ändern.'
                : 'Texte und Aufgaben lassen sich direkt im Blatt ändern; Strg+Z nimmt Änderungen zurück.'}
            </Text>
            <FitToWidth className={`ws-editor-pages ${loesung ? 'editor-sheet-key' : ''}`}>
              <SheetPages
                ws={worksheet}
                sheet={sheet}
                plans={layouts.get(`${sheet.id}:${loesung ? 'key' : 'print'}`) ?? []}
                info={pageInfo}
                context={editContext}
                wrapBlock={wrapBlock}
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
  )
}
