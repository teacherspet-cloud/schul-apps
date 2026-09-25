import { ActionIcon, Alert, Badge, Button, Card, Container, Group, List, Menu, Popover, ScrollArea, Stack, Text, Textarea, Title, Tooltip } from '@mantine/core'
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
import type { PlacedItem } from '../../arbeitsblatt/render/paginate'
import type { WsBlock } from '../../arbeitsblatt/model/types'
import FitToWidth from '../../../shared/render/FitToWidth'
import { useAppSettings } from '../../../shared/settingsStore'
import { generateExam, reviseExamPart, upperSecondary } from '../generation/generateExam'
import { CONTENT_SHARE, formatById } from '../model/formats'
import type { Exam, ExamPart } from '../model/types'
import { examGrades } from '../model/types'
import { examHasContent, examToWorksheet } from '../render/examWorksheet'
import { AudioPanel } from '../../arbeitsblatt/steps/AudioPanel'
import type { Worksheet } from '../../arbeitsblatt/model/types'
import { useKlassenarbeit } from '../store'
import { starteAuftrag, useLaufendeSchluessel } from '../../../shared/auftraege'
import { arbeitOffen, defaultExamName, legeArbeitAb } from '../library'
import { QUELLENAUSWAHL, type QuellenFrage } from '../../arbeitsblatt/auftraege'
import type { AudioBlock } from '../../arbeitsblatt/model/types'

/**
 * Schritt 2: Die Arbeit erzeugen, ansehen und ausgeben.
 * Für Darstellung und Export wird die Arbeit in die Struktur des Arbeitsblatts übersetzt.
 */
export default function TasksStep({ exam }: { exam: Exam }): React.JSX.Element {
  const { setStep } = useKlassenarbeit()
  const updateExam = useKlassenarbeit((s) => s.update)
  /**
   * Der Hörtexte-Reiter arbeitet auf dem Arbeitsblatt-Abbild der Arbeit. Geändert wird
   * aber die Arbeit selbst: Der Baustein wird über seine id im passenden Teil gesucht.
   */
  const updateAudio = (fn: (ws: Worksheet) => void, gruppe?: string): void =>
    updateExam((draft) => {
      const view = examToWorksheet(draft)
      fn(view)
      for (const part of draft.parts) {
        part.blocks = part.blocks.map((b) => view.sheets.flatMap((s) => s.blocks).find((x) => x.id === b.id) ?? b)
      }
    }, gruppe)
  const settings = useAppSettings((s) => s.settings)
  const logo = useAppSettings((s) => s.logoDataUrl)
  // Teile, an denen gerade ein Auftrag „überarbeiten" arbeitet
  const busy = useLaufendeSchluessel(useKlassenarbeit((s) => s.docId))
  const [revise, setRevise] = useState<string | null>(null)
  /*
   * Word, PDF und Drucken fragen nach dem Erwartungshorizont (ohne / anhängen / eigene Datei);
   * bis 25.09.2026 hing er stillschweigend an der Arbeit, und Drucken gab es gar nicht.
   */
  const [ausgabe, setAusgabe] = useState<AusgabeModus | null>(null)
  const [druck, setDruck] = useState<ReturnType<typeof druckAusgabe> | null>(null)
  const [instruction, setInstruction] = useState('')
  const meta = exam.meta
  const grades = examGrades(exam)
  const hasContent = examHasContent(exam)

  // Muss gemerkt werden: Die Seitenaufteilung misst neu, sobald sich das Arbeitsblatt ändert –
  // ein bei jedem Render neu gebautes Objekt löst sonst eine Endlosschleife aus (weiße Seite).
  const worksheet = useMemo(() => examToWorksheet(exam), [exam])
  const { layouts, measure } = useSheetLayouts(hasContent ? worksheet : null, logo, settings.schoolName)
  // Strg+P öffnet denselben Druckdialog wie der Knopf „Drucken" – sobald es etwas zu drucken gibt
  useDruck('klassenarbeit', hasContent ? () => setAusgabe('print') : null)
  const sheet = worksheet.sheets[0]
  const printContext = useMemo(() => contextFor(worksheet, sheet, 'print'), [worksheet, sheet])
  // Die Sprache der Beschriftungen steht am Blatt (examToWorksheet), damit PDF und Word sie mitnehmen
  const pageInfo = useMemo(
    () => pageInfoFor(worksheet, sheet, logo, settings.schoolName, false, settings.citationStyle),
    [worksheet, sheet, logo, settings.schoolName, settings.citationStyle]
  )

  /*
   * Beides läuft als Hintergrund-Auftrag (shared/auftraege.ts) mit einer Kopie der Arbeit von
   * jetzt und landet in DIESER Arbeit – auch wenn inzwischen eine andere offen ist.
   */
  const docId = useKlassenarbeit.getState().docId
  const titel = defaultExamName(exam)

  /**
   * Einen einzelnen Teil mit einem eigenen Auftrag neu erzeugen. Sperrt die Arbeit nicht:
   * Am Ende ändert er nur die Bausteine seines Teils (Strg+Z holt die alten zurück).
   */
  const revisePart = (part: Exam['parts'][number], index: number): void => {
    const wish = instruction.trim()
    if (!wish) return
    setRevise(null)
    setInstruction('')
    void starteAuftrag({
      moduleId: 'klassenarbeit',
      docId,
      titel,
      art: `Teil ${index + 1} überarbeiten`,
      eingabe: exam,
      istOffen: () => arbeitOffen(docId),
      sperrt: false,
      schluessel: part.id,
      fehlerTitel: 'Der Teil konnte nicht überarbeitet werden',
      arbeit: (e, k) => {
        k.melde(`Teil ${index + 1} wird überarbeitet …`)
        return reviseExamPart(e, e.parts.find((p) => p.id === part.id) ?? part, index + 1, wish, k.ai)
      },
      abschluss: () => `Teil ${index + 1} wurde überarbeitet.`,
      ablegen: (blocks, e) => legeArbeitAb(docId, e, (aktuell) => ({ ...aktuell, parts: aktuell.parts.map((p) => (p.id === part.id ? { ...p, blocks } : p)) }))
    })
  }

  /** Die ganze Arbeit erzeugen – sperrt sie bis dahin (Hinweis statt Aufgaben). */
  const run = (): void => {
    void starteAuftrag({
      moduleId: 'klassenarbeit',
      docId,
      titel,
      art: hasContent ? 'Arbeit neu erzeugen' : 'Arbeit erzeugen',
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
      // Die erzeugte Arbeit ersetzt den Stand, aus dem sie entstand (während des Laufs gesperrt)
      ablegen: (next, e) => legeArbeitAb(docId, e, () => next)
    })
  }

  const quelle: BlattQuelle = {
    ws: worksheet,
    layouts,
    sheetIds: [sheet.id],
    name: worksheet.meta.title || 'Klassenarbeit',
    logo,
    schoolName: settings.schoolName,
    begriff: 'Erwartungshorizont'
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
   * Der Inhalt bleibt Sache der Aufgabenkarten daneben – hier geht es allein um die Lage.
   * Kopfzeile und Teil-Überschriften („Teil 1: …") werden aus der Arbeit ERRECHNET und
   * gehören keinem Teil; sie bekommen deshalb keine Griffe, sonst zöge man an etwas, das
   * beim nächsten Aufbau ohnehin neu entsteht.
   */
  const teilVon = (id: string): ExamPart | undefined => exam.parts.find((p) => p.blocks.some((b) => b.id === id))
  const wrapBlock = (block: WsBlock, placed: PlacedItem, content: React.ReactNode): React.ReactNode => {
    if (!teilVon(block.id)) return content
    return (
      <BausteinRahmen
        block={block}
        placed={placed}
        onUpdate={(fn, gruppe) =>
          updateExam((d) => {
            const b = d.parts.flatMap((p) => p.blocks).find((x) => x.id === block.id)
            if (b) fn(b)
          }, gruppe)
        }
        onMove={(richtung) =>
          updateExam((d) => {
            // Nur INNERHALB des Teils: Die Teile sind der Aufbau der Arbeit
            const teil = d.parts.find((p) => p.blocks.some((x) => x.id === block.id))
            if (!teil) return
            const i = teil.blocks.findIndex((x) => x.id === block.id)
            const j = i + richtung
            if (j < 0 || j >= teil.blocks.length) return
            ;[teil.blocks[i], teil.blocks[j]] = [teil.blocks[j], teil.blocks[i]]
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
            <Title order={2}>Aufgaben</Title>
            <Text c="dimmed" size="sm">
              {meta.subjectLabel} · {meta.schoolTypeName} · Klasse {meta.grade} · {meta.minutes} Minuten
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
                    {part.blocks.length > 0 && (
                      <Badge variant="light" color="teal">
                        {part.blocks.length} Bausteine
                      </Badge>
                    )}
                    <Popover width={320} position="bottom-end" withArrow opened={revise === part.id} onChange={(o) => setRevise(o ? part.id : null)}>
                      <Popover.Target>
                        <Tooltip label="Diesen Teil mit einem eigenen Auftrag überarbeiten">
                          <ActionIcon variant="subtle" loading={busy.has(part.id)} onClick={() => setRevise(revise === part.id ? null : part.id)}>
                            <IconSparkles size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Popover.Target>
                      <Popover.Dropdown>
                        <Stack gap="xs">
                          <Textarea
                            size="xs"
                            label="Was soll anders werden?"
                            placeholder="z. B. kürzerer Text, keine Multiple-Choice-Aufgaben, Thema Sport"
                            autosize
                            minRows={2}
                            value={instruction}
                            onChange={(e) => setInstruction(e.currentTarget.value)}
                          />
                          <Button size="xs" disabled={!instruction.trim()} onClick={() => revisePart(part, i)}>
                            Teil überarbeiten
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
              „Arbeit erzeugen“ schreibt Material, Aufgaben und – wenn eingeschaltet – den Erwartungshorizont für jeden Teil. Jeder Teil wird einzeln erzeugt,
              das dauert je nach KI-Zugang einen Moment.
            </Text>
          </Alert>
        )}

        {hasContent && worksheet.sheets.some((s) => s.blocks.some((b) => b.type === 'audio')) && (
          <Card withBorder mb="md">
            <AudioPanel ws={worksheet} onUpdate={updateAudio} />
          </Card>
        )}

        {hasContent && (
          <>
            <Group justify="flex-end" mb="sm" gap="xs">
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
              <Button variant="default" leftSection={<IconFileTypePdf size={16} />} onClick={() => setAusgabe('pdf')}>
                PDF
              </Button>
              <Button variant="default" leftSection={<IconFileTypeDocx size={16} />} onClick={() => setAusgabe('docx')}>
                Word
              </Button>
              <Button variant="default" leftSection={<IconPrinter size={16} />} onClick={() => setAusgabe('print')}>
                Drucken
              </Button>
            </Group>
            <FitToWidth className="ws-editor-pages">
              <SheetPages
                ws={worksheet}
                sheet={sheet}
                plans={layouts.get(`${sheet.id}:print`) ?? []}
                info={pageInfo}
                context={printContext}
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
          onAusgabe={async (modus, loesung) => {
            if (modus === 'print') setDruck(druckAusgabe(quelle, loesung))
            else await speichereBlatt(quelle, modus, loesung)
          }}
        />
        <PrintPreview
          html={druck?.html ?? null}
          loesung={druck?.loesung}
          title={`Drucken – ${worksheet.meta.title || 'Klassenarbeit'}`}
          onClose={() => setDruck(null)}
        />
      </Container>
    </ScrollArea>
  )
}
