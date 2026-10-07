import { Accordion, Alert, Badge, Card, Container, Group, Menu, Radio, Stack, Text, Tooltip, Box, ScrollArea } from '@mantine/core'
import { NurExperte, OptionenBereich, useAlleOptionen } from '../../../shared/components/NurExperte'
import { querBausteine } from '../../arbeitsblatt/model/seitenformat'
import { blattBreitePx, seitenFormatWerkzeug } from '../../arbeitsblatt/render/SeitenFormatKnopf'
import { fragenAusBlatt } from '../../../shared/export/lms/fragen'
import LmsExport from '../../../shared/export/lms/LmsExport'
import RueckmeldungKnopf from '../../rueckmeldung/RueckmeldungKnopf'
import { BlattOnlinetestKnopf } from '../../onlinetest/OnlinetestKnopf'
import { fassungenAusBlatt } from '../../onlinetest/blattOnline'
import { IconAlertTriangle, IconCircleCheck, IconCopy, IconInfoCircle, IconTable, IconTrash } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import FitToWidth from '../../../shared/render/FitToWidth'
import { useAppSettings } from '../../../shared/settingsStore'
import { druckAusgabe, speichereBlatt, type BlattQuelle } from '../../arbeitsblatt/export/blattAusgabe'
import { ablageZiel } from '../../../shared/export/ablageZiel'
import { meldeAblage } from '../../../shared/export/ausgabe'
import PrintPreview from '../../../shared/components/PrintPreview'
import { AusgabeDialog, type AusgabeModus } from '../../../shared/components/LoesungsWahl'
import { contextFor, pageInfoFor, SheetPages, useSheetLayouts } from '../../arbeitsblatt/render/SheetPages'
import { buildWorksheetHtml } from '../../arbeitsblatt/render/printHtml'
import { useDruckFuerWachen } from '../../../shared/render/druckFuerWachen'
import { BausteinRahmen } from '../../arbeitsblatt/render/BausteinRahmen'
import type { PlacedItem } from '../../arbeitsblatt/render/paginate'
import type { WsBlock } from '../../arbeitsblatt/model/types'
import type { Worksheet } from '../../arbeitsblatt/model/types'
import { gesamtpunkte } from '../didactics/bewertung'
import { thresholdsForSubject } from '../../../shared/gradeScale'
import { pruefeKurztest, teilaufgaben, zaehleBefunde, type Befund } from '../didactics/pruefungen'
import { dauerSchaetzung } from '../generation/generateKurztest'
import { kurztestToWorksheet, kurztestToWorksheetAlle, schluesselHerkunft } from '../render/kurztestWorksheet'
import { aiCall, useLernzielkontrolle } from '../store'
import { KURZTEST_FILTER, serializeKurztest } from '../project'
import { defaultKurztestName } from '../library'
import EditorLeiste from '../../../shared/components/EditorLeiste'
import BlattoptionenFelder from '../../../shared/components/BlattoptionenFelder'
import { anmerkungsArt, hatAnmerkungen } from '../../arbeitsblatt/didactics/anmerkungen'
import CanaryDialog from '../../../shared/components/CanaryDialog'
import { canaryWordFor } from '../../../shared/aiCanary'
import { notifyError } from '../../../shared/util'
import type { DesignTemplate } from '@shared/design'
import { useDruck } from '../../../shared/navigation'
import { useThemenbereich } from '../../../shared/themenbereiche'
import { mitThemenbereich } from '../../../shared/ueberthema'
import { useLaufendeSchluessel } from '../../../shared/auftraege'
import { AlleBehebenKnopf, KiBehebenKnopf } from '../../../shared/components/KiBeheben'
import { befundBehebbar, befundeBeheben, bausteinNachWunschAuftrag, rasterAuftragLzk } from '../beheben'
import OperatorformHinweis from '../../../shared/components/OperatorformHinweis'
import McBlindHinweis from '../../../shared/components/McBlindHinweis'
import { uebernimmBlindprobe } from '../../../shared/verstehen/blindprobe'
import { operatorformBefunde, operatorformenUmsetzen } from '../../../shared/operatorformen'
import { anweisungenDeutsch } from '../../arbeitsblatt/didactics/anrede'
import { KiMenue, VersionSwitcher } from '../../arbeitsblatt/steps/BlockRevision'
import { BlockSettings } from '../../arbeitsblatt/steps/BlockSettings'
import { EinfuegenUntermenue } from '../../arbeitsblatt/steps/EinfuegenMenue'
import LevelnMenue from '../../arbeitsblatt/steps/LevelnMenue'
import { dupliziereBaustein, newBlock } from '../../arbeitsblatt/model/factory'
import { switchVersion } from '../../arbeitsblatt/model/versions'
import { wunschKontextFuer } from '../../arbeitsblatt/generation/wunsch'

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
function BefundListe({ befunde, onBeheben, laeuft }: { befunde: Befund[]; onBeheben?: (b: Befund[]) => void; laeuft?: boolean }): React.JSX.Element {
  const bereiche = [...new Set(befunde.map((b) => b.bereich))]
  const behebbar = befunde.filter(befundBehebbar)
  return (
    <Stack gap="xs">
      {onBeheben && (
        <Group justify="flex-end">
          <AlleBehebenKnopf anzahl={behebbar.length} laeuft={laeuft} onClick={() => onBeheben(behebbar)} />
        </Group>
      )}
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
                  <Group justify="space-between" gap="xs" wrap="nowrap" align="flex-start" data-hinweis>
                    <Text size="xs">{b.message}</Text>
                    {/* Paket 12: behebbare Befunde bekommen einen Knopf, reine Hinweise nicht */}
                    {onBeheben && befundBehebbar(b) && <KiBehebenKnopf laeuft={laeuft} onClick={() => onBeheben([b])} />}
                  </Group>
                </Alert>
              ))}
          </Stack>
        </div>
      ))}
    </Stack>
  )
}

/** Standardmodus (07.10.2026): wie im Arbeitsblatt – Leveln, Raster, Baustein-Einstellungen, Lernplattform und feinere Blattoptionen über „Alle Werkzeuge" */
export default function EditorStep(): React.JSX.Element {
  return (
    <OptionenBereich>
      <EditorInhalt />
    </OptionenBereich>
  )
}

function EditorInhalt(): React.JSX.Element {
  const voll = useAlleOptionen()
  const { test, setStep, update, variante, setVariante, loesung, setLoesung, undo, redo, verlauf, docName, savedAt, setDocName } = useLernzielkontrolle()
  // Blattoptionen, KI-Test-Dialog – die Leiste ist dieselbe wie beim Arbeitsblatt (27.09.2026)
  const [designs, setDesigns] = useState<DesignTemplate[]>([])
  useEffect(() => {
    window.api.designs.list().then(setDesigns).catch(notifyError)
  }, [])
  const [canaryOffen, setCanaryOffen] = useState(false)
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
  // Überthema (Paket 11): der Themenbereich der Kontrolle steht dezent im Kopf – nur zum Anzeigen eingesetzt
  const bereich = useThemenbereich(
    'lernzielkontrolle',
    useLernzielkontrolle((s) => s.docId)
  )?.name
  const ws = useMemo(() => (test ? mitThemenbereich(kurztestToWorksheet(test, variante, schwellen), bereich) : null), [test, variante, schwellen, bereich])
  const befunde = useMemo(() => (test ? pruefeKurztest(test, variante) : []), [test, variante])
  // Operatoren in falscher Satzstellung („Zusammenfassen Sie …“), 01.10.2026
  const formen = useMemo(() => (ws && !loesung ? operatorformBefunde(ws.sheets, anweisungenDeutsch(ws.meta)) : []), [ws, loesung])
  // „Mit KI beheben" (Paket 12): laufende Reparaturen dieser Kontrolle
  const docId = useLernzielkontrolle((s) => s.docId)
  const laufend = useLaufendeSchluessel(docId)
  const { layouts, measure } = useSheetLayouts(ws, logo, settings.schoolName)
  // Seitenrand-Wache: Druck-HTML der gezeigten Fassung mit Lösungen, so wie der Export es baut
  useDruckFuerWachen(ws ? () => buildWorksheetHtml(ws, layouts, { sheetIds: ws.sheets.map((s) => s.id), includeKey: true }, logo, settings.schoolName) : null, [
    ws,
    layouts,
    logo,
    settings.schoolName
  ])
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
  const dateiname = `${test.meta.title || test.meta.thema || test.meta.bezeichnung}${
    test.varianten[variante]?.label ? ` ${test.varianten[variante].label}` : ''
  }`

  const mehrereFassungen = test.varianten.length > 1

  /** Das Blatt fuer die Ausgabe: eine Fassung oder alle in einem Dokument. */
  const ausgabe = (alle: boolean): { ws: Worksheet; sheetIds: string[]; name: string } => {
    if (!alle) return { ws, sheetIds: [sheet.id], name: dateiname }
    const komplett = mitThemenbereich(kurztestToWorksheetAlle(test, schwellen), bereich)
    return {
      ws: komplett,
      sheetIds: komplett.sheets.map((s) => s.id),
      name: `${test.meta.title || test.meta.thema || test.meta.bezeichnung} (alle Fassungen)`
    }
  }

  const quelle = (alle: boolean): BlattQuelle => {
    const a = ausgabe(alle)
    return {
      ws: a.ws,
      layouts,
      sheetIds: a.sheetIds,
      name: a.name,
      logo,
      schoolName: settings.schoolName,
      begriff: 'Lösungen',
      ziel: ablageZiel('lernzielkontrolle', docId, a.ws.meta.subjectLabel || a.ws.meta.subjectId, { jahrgang: a.ws.meta.grade, thema: a.ws.meta.topic })
    }
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
  /** Eine Änderung an der Liste der angezeigten Fassung, an der Stelle des Bausteins */
  const anDerStelle = (id: string, fn: (liste: WsBlock[], i: number) => void): void =>
    update((d) => {
      const liste = d.varianten[variante]?.blocks
      const i = liste?.findIndex((b) => b.id === id) ?? -1
      if (liste && i >= 0) fn(liste, i)
    })

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
      busy={laufend.has(block.id)}
      extras={
        /*
         * Dieselben Werkzeuge wie in Klassenarbeit und Grammatiktest (06.10.2026): KI-Menü (Überarbeiten,
         * Neu erzeugen, Leveln, Bewertungsraster) und Einstellungen – nicht am errechneten Schlüssel.
         * Hinweise stehen hier gesammelt in der Prüfliste über dem Blatt.
         */
        blocks.some((b) => b.id === block.id) ? (
          <>
            <KiMenue
              block={block}
              busy={laufend.has(block.id) || laufend.has(`raster-${block.id}`)}
              kontext={() => wunschKontextFuer(block, ws.meta, 'Lernzielkontrolle')}
              onWunsch={(art, wunsch) => bausteinNachWunschAuftrag(test, docId, variante, block.id, art, wunsch)}
            >
              <NurExperte>
                <LevelnMenue
                  block={block}
                  meta={ws.meta}
                  onRevise={(anweisung) => bausteinNachWunschAuftrag(test, docId, variante, block.id, 'ueberarbeiten', anweisung)}
                />
              </NurExperte>
              <NurExperte>
                {block.type === 'task' && (
                  <Menu.Item leftSection={<IconTable size={14} />} onClick={() => rasterAuftragLzk(test, docId, variante, block.id)} data-raster-erstellen>
                    Bewertungsraster erstellen
                  </Menu.Item>
                )}
              </NurExperte>
            </KiMenue>
            <NurExperte>
              <BlockSettings
                block={block}
                combined={false}
                update={(fn, gruppe) =>
                  update((d) => {
                    const b = d.varianten[variante]?.blocks.find((x) => x.id === block.id)
                    if (b) fn(b)
                  }, gruppe)
                }
              />
            </NurExperte>
          </>
        ) : undefined
      }
      menue={
        blocks.some((b) => b.id === block.id) ? (
          <>
            <Menu.Label>Baustein</Menu.Label>
            <Menu.Item
              leftSection={<IconCopy size={14} />}
              onClick={() => anDerStelle(block.id, (liste, i) => void liste.splice(i + 1, 0, dupliziereBaustein(liste[i])))}
            >
              Duplizieren
            </Menu.Item>
            <EinfuegenUntermenue titel="Darüber einfügen" onWaehlen={(typ) => anDerStelle(block.id, (liste, i) => void liste.splice(i, 0, newBlock(typ)))} />
            <EinfuegenUntermenue
              titel="Darunter einfügen"
              onWaehlen={(typ) => anDerStelle(block.id, (liste, i) => void liste.splice(i + 1, 0, newBlock(typ)))}
            />
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => anDerStelle(block.id, (liste, i) => void liste.splice(i, 1))}>
              Baustein löschen
            </Menu.Item>
          </>
        ) : undefined
      }
    >
      {!placed.continued && !loesung && blocks.some((b) => b.id === block.id) && (
        <VersionSwitcher block={block} onSwitch={(v) => anDerStelle(block.id, (liste, i) => (liste[i] = switchVersion(liste[i], v)))} />
      )}
      {content}
    </BausteinRahmen>
  )

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <EditorLeiste
        zurueck={{ label: 'Einstellungen', onClick: () => setStep(0) }}
        undo={{ canUndo: verlauf.past.length > 0, canRedo: verlauf.future.length > 0, onUndo: undo, onRedo: redo }}
        fassungen={
          test.varianten.length > 1
            ? {
                value: String(variante),
                onChange: (v) => setVariante(Number(v)),
                data: test.varianten.map((v, i) => ({ value: String(i), label: `Gruppe ${v.label}` })),
                ariaLabel: 'Gruppe'
              }
            : null
        }
        ansichten={{
          value: loesung ? 'key' : 'student',
          onChange: (v) => setLoesung(v === 'key'),
          data: [
            { value: 'student', label: 'Aufgabenblatt' },
            { value: 'key', label: 'Lösungen' }
          ]
        }}
        optionen={
          <BlattoptionenFelder
            designs={designs}
            designId={test.design.id}
            onDesign={(d) => update((x) => (x.design = structuredClone(d)))}
            kiVermerk={{ wert: test.meta.kiVermerk, ki: test.meta.ki, onChange: (v) => update((d) => (d.meta.kiVermerk = v)) }}
            schulangaben={{ checked: test.meta.showSchool !== false, onChange: (an) => update((d) => (d.meta.showSchool = an)) }}
            korrekturrand={{ checked: Boolean(test.meta.correctionMargin), onChange: (an) => update((d) => (d.meta.correctionMargin = an)) }}
            notizrand={voll ? { checked: Boolean(test.meta.notesMargin), onChange: (an) => update((d) => (d.meta.notesMargin = an)) } : undefined}
            anmerkungen={
              voll
                ? hatAnmerkungen(test.varianten.flatMap((v) => v.blocks))
                  ? { wert: anmerkungsArt(test.meta), onChange: (art) => update((d) => (d.meta.anmerkungen = art)) }
                  : undefined
                : undefined
            }
            blocksatz={
              voll ? { checked: test.design.page.justifyText !== false, onChange: (an) => update((d) => (d.design.page.justifyText = an)) } : undefined
            }
            fach={test.meta.subjectId}
            vorlagenfarbe={voll ? { checked: Boolean(test.meta.vorlagenfarbe), onChange: (an) => update((d) => (d.meta.vorlagenfarbe = an)) } : undefined}
            ueberthema={
              voll ? { werte: test.meta, bereich: bereich ?? '', onChange: (patch) => update((d) => Object.assign(d.meta, patch), 'ueberthema') } : undefined
            }
            kiTest={
              voll
                ? {
                    an: Boolean(test.meta.aiCanary),
                    woerter: test.meta.aiCanaryWords,
                    vorschlagFuer: `${test.meta.title}|${test.meta.thema}`,
                    onEin: () => setCanaryOffen(true),
                    onAus: () => update((d) => (d.meta.aiCanary = false))
                  }
                : undefined
            }
          />
        }
        info={undefined}
        name={{ value: docName, placeholder: defaultKurztestName(test), onChange: setDocName }}
        gesichertAm={savedAt}
        dateiSpeichern={{
          tooltip: 'Als Datei speichern … (.lernzielkontrolle, z. B. zum Weitergeben)',
          onClick: async () => {
            try {
              const path = await window.api.files.save(`${quelle(false).name}.lernzielkontrolle`, KURZTEST_FILTER, serializeKurztest(test), quelle(false).ziel)
              if (path) meldeAblage(path, 'Datei gespeichert.')
            } catch (e) {
              notifyError(e)
            }
          }
        }}
        ausgabe={{ onWord: () => starte('docx'), onPdf: () => starte('pdf'), onDrucken: () => starte('print') }}
        extras={
          <>
            <RueckmeldungKnopf art="lernzielkontrolle" docId={docId} />
            {/* Als Onlinetest (05.10.2026): alle Fassungen, dieselbe Durchführung wie beim Vokabeltest */}
            <BlattOnlinetestKnopf
              quelle={() => {
                const alle = kurztestToWorksheetAlle(test, schwellen)
                return {
                  art: 'Lernzielkontrolle',
                  fach: test.meta.subjectLabel,
                  titel: test.meta.title || test.meta.thema || 'Lernzielkontrolle',
                  thema: test.meta.thema || '',
                  varianten: alle.sheets.map((s, i) => s.label || String.fromCharCode(65 + i)),
                  fassungen: () => fassungenAusBlatt(alle, logo, settings.schoolName)
                }
              }}
            />
            <NurExperte>
              <LmsExport
                titel={test.meta.title || test.meta.thema}
                bericht={() => fragenAusBlatt(kurztestToWorksheet(test, variante))}
                ziel={quelle(false).ziel}
              />
            </NurExperte>
          </>
        }
      />
      <CanaryDialog
        offen={canaryOffen}
        vorschlag={canaryWordFor(`${test.meta.title}|${test.meta.thema}`)}
        wert={test.meta.aiCanaryWords ?? ''}
        onAbbruch={() => setCanaryOffen(false)}
        onFertig={(woerter) => {
          update((d) => {
            d.meta.aiCanary = true
            d.meta.aiCanaryWords = woerter
          })
          setCanaryOffen(false)
        }}
      />
      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        <Container size="xl" py="md">
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
                  <BefundListe
                    befunde={befunde}
                    onBeheben={(liste) => befundeBeheben(test, docId, variante, liste)}
                    laeuft={[...laufend].some((k) => k.startsWith('beheben-') || befunde.some((b) => b.blockId === k))}
                  />
                  <Text size="xs" c="dimmed" mt="sm">
                    Nichts davon hindert am Ausdrucken. Die Zeitgrenzen sind nur für fünf Bundesländer belegt – die eigene Schule kennt die Lehrkraft besser als
                    eine Tabelle.
                  </Text>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          )}

          <OperatorformHinweis
            befunde={formen}
            onUmsetzen={() =>
              update((d) => {
                for (const v of d.varianten) operatorformenUmsetzen(v.blocks)
              })
            }
          />
          {/* Ankreuzfragen zu Materialtexten ohne Blindprobe (01.10.2026): auf Abruf prüfen – je Variante */}
          <McBlindHinweis
            listen={test.varianten.map((v) => v.blocks)}
            ai={aiCall}
            uebernehmen={(ergebnisse) =>
              update((d) => {
                const vorher = ergebnisse.flatMap((e) => e.vorher)
                const nachher = ergebnisse.flatMap((e) => e.nachher)
                for (const v of d.varianten) v.blocks = uebernimmBlindprobe(v.blocks, vorher, nachher)
              })
            }
          />
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
            <FitToWidth className="ws-editor-pages" widthPx={blattBreitePx(layouts.get(`${sheet.id}:${loesung ? 'key' : 'print'}`))}>
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
                    }),
                  // Textauswahl-Menü (01.10.2026): neuer Baustein hinter dem Material
                  einfuegenNach: (anker, neu) =>
                    update((d) => {
                      const liste = d.varianten[variante]?.blocks
                      const i = liste?.findIndex((b) => b.id === anker) ?? -1
                      if (liste && i >= 0) liste.splice(i + 1, 0, structuredClone(neu))
                    })
                })}
                wrapBlock={wrapBlock}
                seitenWerkzeug={
                  loesung
                    ? undefined
                    : seitenFormatWerkzeug(
                        sheet,
                        (blockId, fn) =>
                          update((d) => {
                            const block = d.varianten[variante]?.blocks.find((b) => b.id === blockId)
                            if (block) fn(block)
                          }),
                        querBausteine(sheet.blocks)
                      )
                }
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
      </ScrollArea>
    </Box>
  )
}
