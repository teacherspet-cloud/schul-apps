import { ActionIcon, Alert, Badge, Button, Card, Container, Group, List, Menu, Popover, ScrollArea, Stack, Text, Textarea, Title, Tooltip } from '@mantine/core'
import { IconArrowLeft, IconFileTypeDocx, IconFolder, IconHeadphones, IconInfoCircle, IconPrinter, IconRefresh, IconSparkles } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { notifyError, notifySuccess } from '../../../shared/util'
import { comprehensionFormatById } from '../../arbeitsblatt/didactics/comprehensionFormats'
import { browserDocxDeps } from '../../arbeitsblatt/export/browserDeps'
import { buildWorksheetDocx } from '../../arbeitsblatt/export/docx'
import { buildWorksheetHtml } from '../../arbeitsblatt/render/printHtml'
import { contextFor, pageInfoFor, SheetPages, useSheetLayouts } from '../../arbeitsblatt/render/SheetPages'
import { BausteinRahmen } from '../../arbeitsblatt/render/BausteinRahmen'
import type { PlacedItem } from '../../arbeitsblatt/render/paginate'
import type { WsBlock } from '../../arbeitsblatt/model/types'
import FitToWidth from '../../../shared/render/FitToWidth'
import { useAppSettings } from '../../../shared/settingsStore'
import { generateExam, reviseExamPart, upperSecondary } from '../generation/generateExam'
import type { GepruefterTreffer } from '../../arbeitsblatt/generation/originalmaterial'
import QuellenAuswahl from '../../arbeitsblatt/steps/QuellenAuswahl'
import { CONTENT_SHARE, formatById } from '../model/formats'
import type { Exam, ExamPart } from '../model/types'
import { examGrades } from '../model/types'
import { examHasContent, examToWorksheet } from '../render/examWorksheet'
import { AudioPanel } from '../../arbeitsblatt/steps/AudioPanel'
import type { Worksheet } from '../../arbeitsblatt/model/types'
import { aiCall, useKlassenarbeit } from '../store'
import type { AudioBlock } from '../../arbeitsblatt/model/types'

/**
 * Schritt 2: Die Arbeit erzeugen, ansehen und ausgeben.
 * Für Darstellung und Export wird die Arbeit in die Struktur des Arbeitsblatts übersetzt.
 */
export default function TasksStep({ exam, onLibrary }: { exam: Exam; onLibrary: () => void }): React.JSX.Element {
  const { setStep, setExam } = useKlassenarbeit()
  const updateExam = useKlassenarbeit((s) => s.update)
  /**
   * Der Hörtexte-Reiter arbeitet auf dem Arbeitsblatt-Abbild der Arbeit. Geändert wird
   * aber die Arbeit selbst: Der Baustein wird über seine id im passenden Teil gesucht.
   */
  const updateAudio = (fn: (ws: Worksheet) => void): void =>
    updateExam((draft) => {
      const view = examToWorksheet(draft)
      fn(view)
      for (const part of draft.parts) {
        part.blocks = part.blocks.map((b) => view.sheets.flatMap((s) => s.blocks).find((x) => x.id === b.id) ?? b)
      }
    })
  const settings = useAppSettings((s) => s.settings)
  const logo = useAppSettings((s) => s.logoDataUrl)
  const [busy, setBusy] = useState('')
  const [revise, setRevise] = useState<string | null>(null)
  const [instruction, setInstruction] = useState('')
  const meta = exam.meta
  const grades = examGrades(exam)
  const hasContent = examHasContent(exam)

  // Muss gemerkt werden: Die Seitenaufteilung misst neu, sobald sich das Arbeitsblatt ändert –
  // ein bei jedem Render neu gebautes Objekt löst sonst eine Endlosschleife aus (weiße Seite).
  const worksheet = useMemo(() => examToWorksheet(exam), [exam])
  const { layouts, measure } = useSheetLayouts(hasContent ? worksheet : null, logo, settings.schoolName)
  const sheet = worksheet.sheets[0]
  const printContext = useMemo(() => contextFor(worksheet, sheet, 'print'), [worksheet, sheet])
  // Die Sprache der Beschriftungen steht am Blatt (examToWorksheet), damit PDF und Word sie mitnehmen
  const pageInfo = useMemo(
    () => pageInfoFor(worksheet, sheet, logo, settings.schoolName, false, settings.citationStyle),
    [worksheet, sheet, logo, settings.schoolName, settings.citationStyle]
  )

  /** Einen einzelnen Teil mit einem eigenen Auftrag neu erzeugen. */
  const revisePart = async (part: Exam['parts'][number], index: number): Promise<void> => {
    const wish = instruction.trim()
    if (!wish) return
    setRevise(null)
    setBusy(`Teil ${index + 1} wird überarbeitet …`)
    try {
      const blocks = await reviseExamPart(exam, part, index + 1, wish, aiCall)
      setExam({ ...exam, parts: exam.parts.map((p) => (p.id === part.id ? { ...p, blocks } : p)) })
      setInstruction('')
      notifySuccess(`Teil ${index + 1} wurde überarbeitet.`)
    } catch (e) {
      notifyError(e, 'Der Teil konnte nicht überarbeitet werden')
    } finally {
      setBusy('')
    }
  }

  /** Trefferliste der Materialsuche: wartet auf die Entscheidung der Lehrkraft */
  const [auswahl, setAuswahl] = useState<{ treffer: GepruefterTreffer[]; fertig: (url: string | null) => void } | null>(null)

  const run = async (): Promise<void> => {
    setBusy('Die Arbeit wird erzeugt …')
    try {
      const next = await generateExam(exam, aiCall, (m) => setBusy(m), {
        /*
         * In der Oberstufe waehlt die Lehrkraft die Quelle aus (Entscheidung vom 24.09.2026).
         * Dort ist die Quelle Gegenstand der Pruefung – welcher Text genommen wird, entscheidet
         * darueber, was sich daran ueberhaupt zeigen laesst.
         */
        auswahl: upperSecondary(exam.meta) ? (treffer) => new Promise<string | null>((fertig) => setAuswahl({ treffer, fertig })) : undefined
      })
      setExam(next)
      notifySuccess('Die Klassenarbeit wurde erzeugt.')
    } catch (e) {
      notifyError(e, 'Die Arbeit konnte nicht erzeugt werden')
    } finally {
      setBusy('')
    }
  }

  const exportDocx = async (): Promise<void> => {
    try {
      const data = await buildWorksheetDocx(worksheet, { sheetIds: [sheet.id], includeKey: meta.answerKey }, browserDocxDeps(logo, settings.schoolName))
      const path = await window.api.files.save(`${worksheet.meta.title}.docx`, [{ name: 'Word-Dokument', extensions: ['docx'] }], data)
      if (path) notifySuccess('Word-Dokument gespeichert.')
    } catch (e) {
      notifyError(e, 'Export fehlgeschlagen')
    }
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

  const exportPdf = async (): Promise<void> => {
    try {
      const html = buildWorksheetHtml(worksheet, layouts, { sheetIds: [sheet.id], includeKey: meta.answerKey }, logo, settings.schoolName)
      const path = await window.api.exporter.pdf(html, `${worksheet.meta.title}.pdf`)
      if (path) notifySuccess('PDF gespeichert.')
    } catch (e) {
      notifyError(e, 'Export fehlgeschlagen')
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
        onUpdate={(fn) =>
          updateExam((d) => {
            const b = d.parts.flatMap((p) => p.blocks).find((x) => x.id === block.id)
            if (b) fn(b)
          })
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
            <Button variant="subtle" leftSection={<IconFolder size={16} />} onClick={onLibrary}>
              Meine Klassenarbeiten
            </Button>
            <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => setStep(0)}>
              Zurück zum Rahmen
            </Button>
            <Button leftSection={hasContent ? <IconRefresh size={16} /> : <IconSparkles size={16} />} loading={Boolean(busy)} onClick={() => void run()}>
              {hasContent ? 'Neu erzeugen' : 'Arbeit erzeugen'}
            </Button>
          </Group>
        </Group>

        {busy && (
          <Alert color="blue" mb="md" p="xs">
            <Text size="sm">{busy}</Text>
          </Alert>
        )}

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
                          <ActionIcon
                            variant="subtle"
                            loading={busy.startsWith(`Teil ${i + 1}`)}
                            onClick={() => setRevise(revise === part.id ? null : part.id)}
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
                            placeholder="z. B. kürzerer Text, keine Multiple-Choice-Aufgaben, Thema Sport"
                            autosize
                            minRows={2}
                            value={instruction}
                            onChange={(e) => setInstruction(e.currentTarget.value)}
                          />
                          <Button size="xs" disabled={!instruction.trim()} onClick={() => void revisePart(part, i)}>
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

        {!hasContent && !busy && (
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
              <Button variant="default" leftSection={<IconPrinter size={16} />} onClick={() => void exportPdf()}>
                PDF
              </Button>
              <Button variant="default" leftSection={<IconFileTypeDocx size={16} />} onClick={() => void exportDocx()}>
                Word
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
      </Container>

      <QuellenAuswahl
        treffer={auswahl?.treffer ?? null}
        thema={exam.meta.topic}
        onWaehlen={(url) => {
          auswahl?.fertig(url)
          setAuswahl(null)
        }}
      />
    </ScrollArea>
  )
}
