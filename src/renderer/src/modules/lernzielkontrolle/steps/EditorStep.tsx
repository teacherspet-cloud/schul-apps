import { Accordion, ActionIcon, Alert, Badge, Button, Card, Container, Group, Radio, SegmentedControl, Stack, Text, Tooltip } from '@mantine/core'
import { IconAlertTriangle, IconArrowLeft, IconCircleCheck, IconDownload, IconFileTypeDocx, IconInfoCircle, IconPrinter } from '@tabler/icons-react'
import { useMemo, useRef, useState } from 'react'
import FitToWidth from '../../../shared/render/FitToWidth'
import { useAppSettings } from '../../../shared/settingsStore'
import { druckAusgabe, speichereBlatt, type BlattQuelle } from '../../arbeitsblatt/export/blattAusgabe'
import PrintPreview from '../../../shared/components/PrintPreview'
import { AusgabeDialog, type AusgabeModus } from '../../../shared/components/LoesungsWahl'
import { contextFor, pageInfoFor, SheetPages, useSheetLayouts } from '../../arbeitsblatt/render/SheetPages'
import { BausteinRahmen } from '../../arbeitsblatt/render/BausteinRahmen'
import type { PlacedItem } from '../../arbeitsblatt/render/paginate'
import type { WsBlock } from '../../arbeitsblatt/model/types'
import type { Worksheet } from '../../arbeitsblatt/model/types'
import { gesamtpunkte } from '../didactics/bewertung'
import { thresholdsForSubject } from '../../../shared/gradeScale'
import { pruefeKurztest, teilaufgaben, zaehleBefunde, type Befund } from '../didactics/pruefungen'
import { dauerSchaetzung } from '../generation/generateKurztest'
import { kurztestToWorksheet, kurztestToWorksheetAlle, schluesselHerkunft } from '../render/kurztestWorksheet'
import { useLernzielkontrolle } from '../store'
import { useDruck } from '../../../shared/navigation'

/**
 * Schritt 2: ansehen, bearbeiten, ausgeben.
 *
 * Über dem Blatt steht eine Zeile mit dem, was beim Korrigieren zählt: Zahl der
 * Teilaufgaben, Punkte und die geschätzte Dauer im Vergleich zur eingestellten Zeit. Darunter
 * die Befunde der Prüfungen – aufgeklappt nur, wenn es Warnungen gibt.
 *
 * Es gibt KEINE Befunde, die das Ausgeben verhindern. Entscheidung der Lehrkraft
 * (23.09.2026): warnen, nicht blockieren. Die Zeitgrenzen sind nur für fünf Länder belegt,
 * und wer an einer Schule unterrichtet, kennt ihre Gepflogenheiten besser als eine Tabelle.
 */
function BefundListe({ befunde }: { befunde: Befund[] }): React.JSX.Element {
  const bereiche = [...new Set(befunde.map((b) => b.bereich))]
  return (
    <Stack gap="xs">
      {bereiche.map((bereich) => (
        <div key={bereich}>
          <Text size="xs" fw={600} c="dimmed" mb={4}>
            {bereich}
          </Text>
          <Stack gap={6}>
            {befunde
              .filter((b) => b.bereich === bereich)
              .map((b, i) => (
                <Alert
                  key={i}
                  color={b.schwere === 'warnung' ? 'orange' : 'gray'}
                  icon={b.schwere === 'warnung' ? <IconAlertTriangle size={15} /> : <IconInfoCircle size={15} />}
                  p="xs"
                >
                  <Text size="xs">{b.message}</Text>
                </Alert>
              ))}
          </Stack>
        </div>
      ))}
    </Stack>
  )
}

export default function EditorStep(): React.JSX.Element {
  const { test, setStep, update, variante, setVariante, loesung, setLoesung } = useLernzielkontrolle()
  const settings = useAppSettings((s) => s.settings)
  const logo = useAppSettings((s) => s.logoDataUrl)
  /*
   * Ausgabe-Dialog: Lösungen (ohne / anhängen / eigene Datei) und – bei mehreren Fassungen –
   * welche Fassungen, beides gefragt, BEVOR etwas passiert.
   *
   * Ohne die Frage nach den Fassungen bekam man beim Drucken stillschweigend nur die gerade
   * angezeigte Fassung - und merkte es erst, wenn die Klasse vor einem sitzt und die Haelfte
   * das falsche Blatt hat. Umgekehrt waere „immer alle" genauso falsch: Wer nur Gruppe B
   * nachdrucken will, braucht nicht A und C dazu. Die Lösungen hingen bis 25.09.2026
   * stillschweigend am Blatt, sobald sie eingeschaltet waren.
   *
   * Der Zustand steht VOR dem frühen `return` weiter unten: Hooks müssen bei jedem Rendern
   * in gleicher Zahl und Reihenfolge laufen. Dahinter lief er nur, wenn ein Test geladen war
   * – dieselbe Falle, die im Grammatiktest die ganze App abstürzen ließ (React #310).
   */
  const [ausgabeModus, setAusgabeModus] = useState<AusgabeModus | null>(null)
  const [alleFassungen, setAlleFassungen] = useState(true)
  const [druck, setDruck] = useState<ReturnType<typeof druckAusgabe> | null>(null)

  /*
   * Das Blatt NUR neu bauen, wenn sich Test oder Variante ändern.
   *
   * Ohne useMemo entstand bei jedem Rendern ein neues Objekt. `useSheetLayouts` misst daran
   * die Seitenhöhen, setzt den gemessenen Zustand – und löste damit das nächste Rendern aus.
   * Die Folge war eine Endlosschleife („Maximum update depth exceeded"), bei der der fertige
   * Test nie erschien und auch keine Fehlermeldung kam. Derselbe Fehler war schon im
   * Grammatiktest.
   */
  /*
   * Die Schwellen MUESSEN gemerkt werden.
   *
   * `thresholdsForSubject` gibt bei jedem Aufruf ein neues Feld zurueck. Ohne useMemo
   * aenderte sich damit bei jedem Rendern die Abhaengigkeit des Blattes, `useSheetLayouts`
   * mass neu, setzte seinen Zustand – und loeste das naechste Rendern aus. Das Ergebnis war
   * genau die Endlosschleife, vor der der Kommentar unten warnt (React #185): Der Editor
   * erschien gar nicht mehr, und zwar ohne Fehlermeldung im Fenster.
   */
  const schwellen = useMemo(() => thresholdsForSubject(settings.gradeScale, test?.meta.subjectId ?? ''), [settings.gradeScale, test?.meta.subjectId])
  const ws = useMemo(() => (test ? kurztestToWorksheet(test, variante, schwellen) : null), [test, variante, schwellen])
  const befunde = useMemo(() => (test ? pruefeKurztest(test, variante) : []), [test, variante])
  const { layouts, measure } = useSheetLayouts(ws, logo, settings.schoolName)
  // Strg+P druckt wie der Knopf „Drucken" (mit Rückfrage bei mehreren Fassungen); vor dem frühen return, weil es ein Hook ist
  const drucken = useRef<() => void>(() => undefined)
  useDruck('lernzielkontrolle', test && ws ? () => drucken.current() : null)
  if (!test || !ws) return <Container py="xl">Keine Lernzielkontrolle geladen.</Container>

  const sheet = ws.sheets[0]
  const blocks = test.varianten[variante]?.blocks ?? []
  const punkte = gesamtpunkte(blocks)
  const anzahl = teilaufgaben(blocks)
  const dauer = dauerSchaetzung(blocks)
  const { warnungen, hinweise } = zaehleBefunde(befunde)
  const dateiname = `${test.meta.title || test.meta.thema || test.meta.bezeichnung}${test.varianten[variante]?.label ? ` ${test.varianten[variante].label}` : ''}`

  const mehrereFassungen = test.varianten.length > 1

  /** Das Blatt fuer die Ausgabe: eine Fassung oder alle in einem Dokument. */
  const ausgabe = (alle: boolean): { ws: Worksheet; sheetIds: string[]; name: string } => {
    if (!alle) return { ws, sheetIds: [sheet.id], name: dateiname }
    const komplett = kurztestToWorksheetAlle(test, schwellen)
    return {
      ws: komplett,
      sheetIds: komplett.sheets.map((s) => s.id),
      name: `${test.meta.title || test.meta.thema || test.meta.bezeichnung} (alle Fassungen)`
    }
  }

  const quelle = (alle: boolean): BlattQuelle => {
    const a = ausgabe(alle)
    return { ws: a.ws, layouts, sheetIds: a.sheetIds, name: a.name, logo, schoolName: settings.schoolName, begriff: 'Lösungen' }
  }

  /** Word, PDF oder Druckvorschau – mit der Wahl aus dem Ausgabe-Dialog */
  const ausfuehren = async (was: AusgabeModus, loesung: Parameters<typeof druckAusgabe>[1]): Promise<void> => {
    const q = quelle(mehrereFassungen && alleFassungen)
    if (was === 'print') setDruck(druckAusgabe(q, loesung))
    else await speichereBlatt(q, was, loesung)
  }

  const starte = (was: AusgabeModus): void => {
    setAlleFassungen(true)
    setAusgabeModus(was)
  }
  drucken.current = () => starte('print')

  /*
   * Bausteine von Hand ordnen und frei platzieren – derselbe Rahmen wie im Arbeitsblatt.
   *
   * Bis 24.09.2026 gab es hier gar keine Bausteinsteuerung: Das Blatt ließ sich nur im Text
   * bearbeiten. Die Lehrkraft wollte es „überall von Hand" haben.
   */
  const wrapBlock = (block: WsBlock, placed: PlacedItem, content: React.ReactNode): React.ReactNode => (
    <BausteinRahmen
      block={block}
      placed={placed}
      onUpdate={(fn, gruppe) =>
        update((d) => {
          const b = d.varianten[variante]?.blocks.find((x) => x.id === block.id)
          if (b) fn(b)
        }, gruppe)
      }
      onMove={(richtung) =>
        update((d) => {
          const liste = d.varianten[variante]?.blocks
          if (!liste) return
          const i = liste.findIndex((x) => x.id === block.id)
          const j = i + richtung
          if (i < 0 || j < 0 || j >= liste.length) return
          ;[liste[i], liste[j]] = [liste[j], liste[i]]
        })
      }
    >
      {content}
    </BausteinRahmen>
  )

  return (
    <Container size="xl" py="md">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Group gap="xs">
          <Tooltip label="Zurück zu den Einstellungen">
            <ActionIcon variant="default" onClick={() => setStep(0)}>
              <IconArrowLeft size={16} />
            </ActionIcon>
          </Tooltip>
          {test.varianten.length > 1 && (
            <SegmentedControl
              size="xs"
              value={String(variante)}
              onChange={(v) => setVariante(Number(v))}
              data={test.varianten.map((v, i) => ({ value: String(i), label: `Gruppe ${v.label}` }))}
            />
          )}
          <SegmentedControl
            size="xs"
            value={loesung ? 'key' : 'student'}
            onChange={(v) => setLoesung(v === 'key')}
            data={[
              { value: 'student', label: 'Aufgabenblatt' },
              { value: 'key', label: 'Lösungen' }
            ]}
          />
        </Group>
        <Group gap="xs">
          <Button size="compact-sm" variant="light" leftSection={<IconFileTypeDocx size={14} />} onClick={() => starte('docx')}>
            Word
          </Button>
          <Button size="compact-sm" variant="light" leftSection={<IconPrinter size={14} />} onClick={() => starte('print')}>
            Drucken
          </Button>
          <Button size="compact-sm" variant="light" leftSection={<IconDownload size={14} />} onClick={() => starte('pdf')}>
            PDF
          </Button>
        </Group>
      </Group>

      <Card withBorder padding="xs" mb="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs">
            <Badge variant="light" color="gray">
              {anzahl} {anzahl === 1 ? 'Teilaufgabe' : 'Teilaufgaben'}
            </Badge>
            {punkte > 0 && (
              <Badge variant="light" color="gray">
                {punkte} Punkte
              </Badge>
            )}
            <Tooltip label="Geschätzt aus der Zahl der Teilaufgaben, kalibriert an zwei echten bayerischen Stegreifaufgaben. Eine Faustregel, keine Norm.">
              <Badge variant="light" color={dauer > test.meta.minutes ? 'orange' : 'teal'}>
                geschätzt {dauer} von {test.meta.minutes} Minuten
              </Badge>
            </Tooltip>
          </Group>
          <Group gap="xs">
            {warnungen === 0 && hinweise === 0 ? (
              <Badge variant="light" color="teal" leftSection={<IconCircleCheck size={13} />}>
                keine Befunde
              </Badge>
            ) : (
              <>
                {warnungen > 0 && (
                  <Badge variant="light" color="orange">
                    {warnungen} {warnungen === 1 ? 'Warnung' : 'Warnungen'}
                  </Badge>
                )}
                {hinweise > 0 && (
                  <Badge variant="light" color="gray">
                    {hinweise} {hinweise === 1 ? 'Hinweis' : 'Hinweise'}
                  </Badge>
                )}
              </>
            )}
          </Group>
        </Group>
      </Card>

      {/*
       * Die Befunde stehen zugeklappt und schmal.
       *
       * Vorher klappte der Bereich bei jeder Warnung von selbst auf und schob das Blatt
       * fast aus dem Bild – dabei ist das Blatt das, was die Lehrkraft sehen will. Die Zahl
       * der Befunde steht ohnehin oben in der Kennzahlenzeile; wer sie lesen möchte, klickt
       * auf.
       */}
      {befunde.length > 0 && (
        <Accordion variant="contained" mb="sm" chevronSize={14}>
          <Accordion.Item value="befunde">
            <Accordion.Control py={4}>
              <Text size="xs" c="dimmed">
                Was der App aufgefallen ist{warnungen + hinweise > 0 ? ` (${warnungen + hinweise})` : ''}
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <BefundListe befunde={befunde} />
              <Text size="xs" c="dimmed" mt="sm">
                Nichts davon hindert am Ausdrucken. Die Zeitgrenzen sind nur für fünf Bundesländer belegt – die eigene Schule kennt die Lehrkraft besser als
                eine Tabelle.
              </Text>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}

      {loesung && schluesselHerkunft(test, schwellen) && (
        <Alert color="gray" icon={<IconInfoCircle size={15} />} mb="sm" p="xs">
          <Text size="xs">Notenschlüssel: {schluesselHerkunft(test, schwellen)}</Text>
        </Alert>
      )}
      {test.meta.nachteilsausgleich.aktiv && test.meta.nachteilsausgleich.vermerk && (
        <Alert color="blue" icon={<IconInfoCircle size={15} />} mb="sm" p="xs">
          <Text size="xs">Nachteilsausgleich: {test.meta.nachteilsausgleich.vermerk}</Text>
        </Alert>
      )}

      <Stack>
        <FitToWidth className="ws-editor-pages">
          <SheetPages
            ws={ws}
            sheet={sheet}
            plans={layouts.get(`${sheet.id}:${loesung ? 'key' : 'print'}`) ?? []}
            info={pageInfoFor(ws, sheet, logo, settings.schoolName, loesung, settings.citationStyle)}
            context={contextFor(ws, sheet, loesung ? 'keyEdit' : 'edit', {
              update: (blockId, fn) =>
                update((d) => {
                  const block = d.varianten[variante]?.blocks.find((b) => b.id === blockId)
                  if (block) fn(block)
                })
            })}
            wrapBlock={wrapBlock}
          />
        </FitToWidth>
      </Stack>
      {measure}
      <AusgabeDialog
        modus={ausgabeModus}
        onClose={() => setAusgabeModus(null)}
        modul="lernzielkontrolle"
        hatLoesungen={test.meta.answerKey}
        onAusgabe={ausfuehren}
      >
        {mehrereFassungen && (
          <Radio.Group
            label={`${test.varianten.length} Fassungen (${test.varianten.map((v) => v.label).join(', ')}) – nur die angezeigte oder alle?`}
            value={alleFassungen ? 'alle' : 'eine'}
            onChange={(v) => setAlleFassungen(v === 'alle')}
          >
            <Stack gap={6} mt={4}>
              <Radio value="eine" label={`Nur Gruppe ${test.varianten[variante]?.label}`} />
              <Radio value="alle" label="Alle in einer Datei" />
            </Stack>
          </Radio.Group>
        )}
      </AusgabeDialog>
      <PrintPreview html={druck?.html ?? null} loesung={druck?.loesung} title={`Drucken – ${dateiname}`} onClose={() => setDruck(null)} />
    </Container>
  )
}
