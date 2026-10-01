import { ActionIcon, Box, Button, Divider, FileButton, Group, Menu, SegmentedControl, Select, Text, TextInput, Tooltip } from '@mantine/core'
import {
  IconArrowLeft,
  IconArrowNarrowRight,
  IconBox,
  IconBrush,
  IconChartDots,
  IconDeviceFloppy,
  IconDownload,
  IconExclamationMark,
  IconFileText,
  IconGrid4x4,
  IconHandFinger,
  IconLine,
  IconMathFunction,
  IconPhoto,
  IconPointer,
  IconPresentation,
  IconShape,
  IconSparkles,
  IconTypography
} from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { useTouch } from '../../../shared/touch/touchModus'
import { starteAuftrag } from '../../../shared/auftraege'
import KiWunschKnoepfe from '../../../shared/components/KiWunschKnoepfe'
import UndoRedoButtons from '../../../shared/components/UndoRedoButtons'
import { ablageZiel } from '../../../shared/export/ablageZiel'
import { useKiZugang } from '../../../shared/useKiZugang'
import { normalizeImage, notifyError, notifySuccess, readFileAsDataUrl, safeFileName } from '../../../shared/util'
import { elementBearbeiten, ganzesTafelbild, knotenVon, neuSetzen, passeEin, textKuerzen } from '../auftrag'
import Eigenschaften, { kopie } from '../editor/Eigenschaften'
import Praesentation from '../editor/Praesentation'
import TafelPanel from '../editor/TafelPanel'
import Zeichenflaeche, { type Werkzeug } from '../editor/Zeichenflaeche'
import { formatInfo, type FormatId } from '../formate'
import { neueId, schrittZahl, standardName, type Befund, type Diagramm, type ElementTyp, type TbElement, type TbTafel, type TbVorschlag } from '../model'
import { bildStil } from '../prompt'
import { pruefeAlle } from '../pruefung'
import { bibliothek, projektDatei, useTafelbild } from '../store'
import type { SvgOptionen } from '../svg'
import '../tafelbild.css'
import { satzbauKorrigieren, zusammenfassen } from '../vorschlaege'
import ArbeitsblattDialog from './ArbeitsblattDialog'
import AusgabeDialog from './AusgabeDialog'

type AnsichtArt = 'voll' | 'luecke' | 'n1' | 'n2'

const ANSICHTEN: Record<AnsichtArt, SvgOptionen> = {
  voll: {},
  luecke: { luecke: true, wortspeicher: true },
  n1: { niveau: 1 },
  n2: { niveau: 2 }
}

/** Neues Element mittig auf der Fläche */
function neuesElement(typ: ElementTyp, format: FormatId, extra: Partial<TbElement> = {}): TbElement {
  const f = formatInfo(format)
  const quadrat = (s: number): { w: number; h: number } => ({ w: (s * f.hoehe) / f.breite, h: s })
  const masse: Partial<Record<ElementTyp, { w: number; h: number }>> = {
    text: { w: 0.24, h: 0.1 },
    kasten: { w: 0.22, h: 0.22 },
    merksatz: { w: 0.26, h: 0.2 },
    symbol: quadrat(0.14),
    skizze: quadrat(0.28),
    bild: quadrat(0.3),
    formel: { w: 0.26, h: 0.12 },
    diagramm: { w: 0.34, h: 0.3 }
  }
  const m = masse[typ] ?? { w: 0.2, h: 0.15 }
  const w = Math.min(0.9, f.breite > f.hoehe ? m.w : m.w * 1.8)
  const h = Math.min(0.9, m.h)
  return {
    id: neueId(typ[0]),
    typ,
    x: 0.5 - w / 2,
    y: 0.45 - h / 2,
    w,
    h,
    text: '',
    farbe: 'grund',
    schrift: f.schrift.text,
    schritt: 1,
    niveau: 1,
    ...extra
  }
}

const DIAGRAMM_VORLAGEN: { label: string; d: Diagramm }[] = [
  { label: 'Zeitstrahl', d: { art: 'zeitstrahl', eintraege: [{ label: 'Beginn', wert: '1900', x: 0 }, { label: 'Ende', wert: '1950', x: 1 }] } },
  { label: 'Koordinatensystem', d: { art: 'koordinatensystem', eintraege: [], funktionen: ['x^2'], bereich: { xMin: -4, xMax: 4, yMin: -2, yMax: 8 } } },
  { label: 'Tabelle', d: { art: 'tabelle', eintraege: [], spalten: ['', 'A', 'B'], zeilen: [['Aspekt 1', '', ''], ['Aspekt 2', '', '']] } },
  { label: 'Kreislauf', d: { art: 'kreislauf', eintraege: [{ label: 'Station 1' }, { label: 'Station 2' }, { label: 'Station 3' }, { label: 'Station 4' }] } },
  { label: 'Kartenskizze', d: { art: 'kartenskizze', eintraege: [{ label: 'Ort A', x: 0.35, y: 0.4 }, { label: 'Ort B', x: 0.65, y: 0.6 }] } },
  {
    label: 'Schaltplan',
    d: {
      art: 'schaltplan',
      eintraege: [],
      schaltplan: {
        version: 2,
        kreise: [
          {
            bauteile: [
              { id: 'B1', art: 'batterie', von: 'a', nach: 'b' },
              { id: 'S1', art: 'schalter_offen', von: 'b', nach: 'c' },
              { id: 'L1', art: 'lampe', von: 'c', nach: 'a' }
            ]
          }
        ]
      }
    }
  }
]

/** „Mit dem Finger zeichnen" gilt je Gerät (Tablet mit oder ohne Stift) */
const FINGER_SPEICHER = 'schul-apps-tafelbild-finger'
function fingerGemerkt(): boolean {
  try {
    return localStorage.getItem(FINGER_SPEICHER) === '1'
  } catch {
    return false
  }
}
function fingerMerken(an: boolean): void {
  try {
    localStorage.setItem(FINGER_SPEICHER, an ? '1' : '0')
  } catch {
    // ohne lokalen Speicher gilt die Wahl nur bis zum Schließen
  }
}

/** Schritt 2: Zeichenfläche, Eigenschaften, Ausgabe, Präsentation */
export default function Bearbeiten(): React.JSX.Element | null {
  const { dok: t, update, docId, docName, setDocName, savedAt, undo, redo, verlauf, setStep, endGroup, setDok } = useTafelbild()
  const [formatWahl, setFormatWahl] = useState<FormatId | null>(null)
  const [ansicht, setAnsicht] = useState<AnsichtArt>('voll')
  const [auswahl, setAuswahl] = useState<string | null>(null)
  const [werkzeug, setWerkzeug] = useState<Werkzeug>('auswahl')
  const [praesentation, setPraesentation] = useState(false)
  const [ausgabe, setAusgabe] = useState(false)
  const [insBlatt, setInsBlatt] = useState(false)
  const [fingerZeichnet, setFingerZeichnet] = useState(fingerGemerkt)
  const kiDa = useKiZugang()
  // Den Umschalter braucht nur, wer mit dem Finger bedient (Tablet, Touchscreen)
  const touch = useTouch()
  const mitFinger = touch || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)

  const tafel: TbTafel | undefined = t?.tafeln.find((x) => x.format === formatWahl) ?? t?.tafeln[0]
  const befunde = useMemo(
    () => (t ? pruefeAlle(t.tafeln, { grade: t.meta.grade, regler: t.meta.regler, inhalt: t.inhalt, lernziel: t.meta.lernziel }, (t.pruefung ?? []).filter((b) => b.art === 'bild')) : []),
    [t]
  )
  const markiert = useMemo(() => befunde.filter((b) => b.format === tafel?.format && b.schwer && b.element).map((b) => b.element!), [befunde, tafel?.format])
  if (!t || !tafel) return null
  const format = tafel.format
  const gewaehlt = auswahl ? tafel.elemente.find((e) => e.id === auswahl) : undefined

  /**
   * Vorschläge der App zum Befund (Schrift kleiner als empfohlen): erst zusammenfassen (ohne KI,
   * sofort, ein Schritt mit Strg+Z), dann auf Wunsch kürzen lassen – als Hintergrund-Auftrag auf
   * dem zusammengefassten Stand.
   */
  const vorschlagUmsetzen = (v: TbVorschlag[], b: Befund): void => {
    // Satzstellung der Operatoren (01.10.2026): ohne KI, ein Schritt mit Strg+Z
    if (v.includes('satzbau')) {
      let n = 0
      update((d) => {
        n = satzbauKorrigieren(d)
      })
      if (n) notifySuccess(`Satzstellung in ${n === 1 ? 'einem Text' : `${n} Texten`} korrigiert – Strg+Z nimmt es zurück.`)
      return
    }
    const knoten = knotenVon(t, b.elemente ?? (b.element ? [b.element] : []))
    const kuerzen = (stand: typeof t): void => {
      if (v.includes('kiKuerzen')) textKuerzen(stand, docId, knoten)
    }
    const neu = v.includes('zusammenfassen') && t.inhalt ? zusammenfassen(t.inhalt) : null
    if (!neu) return kuerzen(t)
    void neuSetzen({ ...t, inhalt: neu })
      .then((n) => {
        setDok(n)
        setAuswahl(null)
        notifySuccess('Zwei Kästen zusammengefasst – Strg+Z nimmt es zurück.')
        kuerzen(n)
      })
      .catch(notifyError)
  }

  const aendernTafel = (fn: (x: TbTafel) => void, gruppe?: string): void =>
    update((d) => {
      const x = d.tafeln.find((y) => y.format === format)
      if (x) fn(x)
    }, gruppe)
  const aendernElement = (id: string, fn: (e: TbElement) => void, gruppe?: string): void =>
    aendernTafel((x) => {
      const e = x.elemente.find((y) => y.id === id)
      if (e) fn(e)
    }, gruppe)
  const nachGeste = (id: string): void =>
    aendernTafel((x) => {
      const i = x.elemente.findIndex((y) => y.id === id)
      if (i >= 0) x.elemente[i] = passeEin(x.elemente[i], x.format, x.schrift)
    })
  const hinzu = (e: TbElement): void => {
    aendernTafel((x) => void x.elemente.push(e))
    setAuswahl(e.id)
    setWerkzeug('auswahl')
  }

  const bildHinzu = async (datei: File | null): Promise<void> => {
    if (!datei) return
    try {
      const url = await normalizeImage(await readFileAsDataUrl(datei), 1400)
      hinzu(neuesElement('bild', format, { bild: url, bildQuelle: 'eigen' }))
    } catch (e) {
      notifyError(e, 'Das Bild konnte nicht gelesen werden')
    }
  }
  const kiBild = (): void => {
    // Motiv: das gewählte Element, sonst das Thema
    const beschreibung = (gewaehlt && (gewaehlt.titel || gewaehlt.text)) || t.meta.thema || t.inhalt?.titel || 'Schule'
    const e = neuesElement('bild', format, { text: '', bildQuelle: 'ki', bildPrompt: beschreibung })
    void starteAuftrag({
      moduleId: 'tafelbild',
      docId,
      titel: standardName(t),
      art: 'KI-Bild im Tafelstil',
      eingabe: e,
      istOffen: () => bibliothek.istOffen(docId),
      sperrt: false,
      fehlerTitel: 'Das Bild konnte nicht erzeugt werden',
      arbeit: async (el, k) => {
        k.melde('Die Bild-KI zeichnet …')
        return k.bild(bildStil(el.bildPrompt ?? beschreibung, formatInfo(format).medium === 'kreide'))
      },
      ablegen: (bild, el) =>
        bibliothek.legeAb(docId, t, (aktuell) => {
          const neu = structuredClone(aktuell)
          neu.tafeln.find((x) => x.format === format)?.elemente.push({ ...el, bild })
          return neu
        })
    })
  }

  const dateiSpeichern = async (): Promise<void> => {
    try {
      const pfad = await window.api.files.save(`${safeFileName(standardName(t))}.tafelbild`, projektDatei.filter, projektDatei.serialisiere(t), ablageZiel('tafelbild', docId, t.meta.subjectId))
      if (pfad) notifySuccess('Als Datei gespeichert.')
    } catch (e) {
      notifyError(e)
    }
  }

  const werkzeugKnopf = (w: Werkzeug, label: string, icon: React.ReactNode): React.JSX.Element => (
    <Tooltip label={label}>
      <ActionIcon variant={werkzeug === w ? 'filled' : 'default'} size="lg" aria-label={label} onClick={() => setWerkzeug(werkzeug === w ? 'auswahl' : w)} data-tb-werkzeug={w}>
        {icon}
      </ActionIcon>
    </Tooltip>
  )
  const neuKnopf = (typ: ElementTyp, label: string, icon: React.ReactNode, extra: Partial<TbElement> = {}): React.JSX.Element => (
    <Tooltip label={`${label} einfügen`}>
      <ActionIcon variant="default" size="lg" aria-label={`${label} einfügen`} onClick={() => hinzu(neuesElement(typ, format, extra))} data-tb-neu={typ}>
        {icon}
      </ActionIcon>
    </Tooltip>
  )

  const hatNiveaus = tafel.elemente.some((e) => (e.niveau ?? 1) > 1)
  const hatLuecken = tafel.elemente.some((e) => e.lueckenWoerter?.length || e.luecke)

  return (
    <Box h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      <Group px="md" py={8} gap="xs" className="app-toolbar editor-leiste tb-leiste" data-testid="editor-leiste">
        <Button size="xs" variant="default" leftSection={<IconArrowLeft size={14} />} onClick={() => setStep(0)}>
          Einstellungen
        </Button>
        <UndoRedoButtons canUndo={verlauf.past.length > 0} canRedo={verlauf.future.length > 0} onUndo={undo} onRedo={redo} />
        <Divider orientation="vertical" />
        {t.tafeln.length > 1 && (
          <SegmentedControl
            size="xs"
            aria-label="Format"
            value={format}
            onChange={(v) => {
              setFormatWahl(v as FormatId)
              setAuswahl(null)
            }}
            data={t.tafeln.map((x) => ({ value: x.format, label: formatInfo(x.format).kurz }))}
            data-tb-formate
          />
        )}
        <Select
          size="xs"
          w={170}
          aria-label="Ansicht"
          value={ansicht}
          onChange={(v) => v && setAnsicht(v as AnsichtArt)}
          allowDeselect={false}
          data={[
            { value: 'voll', label: 'Tafelbild' },
            ...(hatLuecken ? [{ value: 'luecke', label: 'Lückenfassung' }] : []),
            ...(hatNiveaus
              ? [
                  { value: 'n1', label: 'Nur ★ (grundlegend)' },
                  { value: 'n2', label: 'Bis ★★ (mittel)' }
                ]
              : [])
          ]}
          data-tb-ansicht
        />
        <Button size="xs" variant="light" leftSection={<IconPresentation size={14} />} onClick={() => setPraesentation(true)} data-tb-praesentieren>
          Präsentieren
        </Button>
        {t.inhalt && kiDa && (
          <Group gap={4} wrap="nowrap" className="tb-ganz">
            <Text size="xs" c="dimmed">
              Ganzes Tafelbild:
            </Text>
            <KiWunschKnoepfe
              blockId={`tb-ganz-${docId}`}
              busy={false}
              name="Tafelbild"
              kontext={() => ({
                typ: 'tafelbild',
                typLabel: 'Tafelbild',
                material: 'Tafelbild',
                fachId: t.meta.subjectId,
                fachLabel: t.meta.subjectLabel,
                klasse: t.meta.grade,
                schulform: t.meta.schoolTypeName,
                thema: t.meta.thema,
                lernziel: t.meta.lernziel,
                inhalt: [t.inhalt!.titel, ...t.inhalt!.knoten.map((k) => `${k.titel}: ${k.punkte.join(', ')}`), t.inhalt!.merksatz?.text ?? ''].join('\n')
              })}
              onAusfuehren={(art, wunsch) => ganzesTafelbild(t, docId, art, wunsch)}
            />
          </Group>
        )}
        <Box style={{ flex: 1 }} />
        <Text size="xs" c="dimmed">
          {schrittZahl(tafel)} Schritte
        </Text>
        <TextInput size="xs" w={200} aria-label="Name in der App" placeholder={standardName(t)} value={docName} onChange={(e) => setDocName(e.currentTarget.value)} />
        <Text size="xs" c="dimmed" w={104} data-testid="gesichert">
          {savedAt ? `gesichert ${new Date(savedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'wird gesichert …'}
        </Text>
        <Tooltip label="Als Datei speichern (.tafelbild) – zum Weitergeben">
          <ActionIcon size="md" variant="default" aria-label="Als Datei speichern" onClick={() => void dateiSpeichern()}>
            <IconDeviceFloppy size={16} />
          </ActionIcon>
        </Tooltip>
        <Button size="xs" variant="default" leftSection={<IconFileText size={14} />} onClick={() => setInsBlatt(true)} disabled={!t.inhalt} data-tb-ins-blatt>
          Ins Arbeitsblatt
        </Button>
        <Button size="xs" leftSection={<IconDownload size={14} />} onClick={() => setAusgabe(true)} data-tb-ausgabe>
          Ausgeben
        </Button>
      </Group>
      <div className="tb-arbeitsflaeche">
        <div className="tb-mitte">
          <div className="tb-werkzeuge" data-tb-werkzeuge>
            {werkzeugKnopf('auswahl', 'Auswählen und verschieben', <IconPointer size={18} />)}
            {werkzeugKnopf('zeichnen', 'Frei zeichnen (Skizze)', <IconBrush size={18} />)}
            {werkzeugKnopf('pfeil', 'Pfeil ziehen', <IconArrowNarrowRight size={18} />)}
            {werkzeugKnopf('verbinder', 'Verbinder: erst ein, dann ein zweites Element antippen', <IconLine size={18} />)}
            <Divider orientation="vertical" />
            {neuKnopf('text', 'Text', <IconTypography size={18} />, { text: 'Text', farbe: 'grund' })}
            {neuKnopf('kasten', 'Kasten', <IconBox size={18} />, { titel: 'Überschrift', text: '• Stichpunkt', rahmen: 'linie' })}
            {neuKnopf('merksatz', 'Merksatz', <IconExclamationMark size={18} />, { titel: 'Merke!', text: 'Merksatz', farbe: 'orange', rahmen: 'doppelt' })}
            {neuKnopf('symbol', 'Symbol', <IconShape size={18} />, { symbol: 'idee', farbe: 'gelb' })}
            {neuKnopf('formel', 'Formel', <IconMathFunction size={18} />, { tex: 'a^2 + b^2 = c^2' })}
            <Menu position="bottom-start" withinPortal>
              <Menu.Target>
                <Tooltip label="Diagramm oder Skizzenvorlage einfügen">
                  <ActionIcon variant="default" size="lg" aria-label="Diagramm einfügen" data-tb-diagramm-menue>
                    <IconChartDots size={18} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>
                {DIAGRAMM_VORLAGEN.map((v) => (
                  <Menu.Item key={v.label} onClick={() => hinzu(neuesElement('diagramm', format, { diagramm: structuredClone(v.d) }))}>
                    {v.label}
                  </Menu.Item>
                ))}
                <Menu.Divider />
                <Menu.Item onClick={() => hinzu(neuesElement('skizze', format, { vorlage: 'becherglas' }))}>Skizzenvorlage</Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <FileButton onChange={(f) => void bildHinzu(f)} accept="image/*">
              {(props) => (
                <Tooltip label="Bild oder Foto einfügen">
                  <ActionIcon {...props} variant="default" size="lg" aria-label="Bild einfügen">
                    <IconPhoto size={18} />
                  </ActionIcon>
                </Tooltip>
              )}
            </FileButton>
            {kiDa && (
              <Tooltip label="KI-Bild im Tafelstil zum Thema">
                <ActionIcon variant="default" size="lg" aria-label="KI-Bild einfügen" onClick={kiBild}>
                  <IconSparkles size={18} />
                </ActionIcon>
              </Tooltip>
            )}
            <Divider orientation="vertical" />
            <Tooltip label="Raster ein/aus">
              <ActionIcon variant={tafel.raster ? 'filled' : 'default'} size="lg" aria-label="Raster" onClick={() => aendernTafel((x) => (x.raster = !x.raster))} data-tb-raster>
                <IconGrid4x4 size={18} />
              </ActionIcon>
            </Tooltip>
            {mitFinger && (
              <Tooltip label={fingerZeichnet ? 'Der Finger zeichnet und verschiebt – Rollen und Zoomen mit zwei Fingern' : 'Stift zeichnet, der Finger rollt und zoomt'}>
                <ActionIcon
                  variant={fingerZeichnet ? 'filled' : 'default'}
                  size="lg"
                  aria-label="Mit dem Finger zeichnen"
                  aria-pressed={fingerZeichnet}
                  onClick={() => {
                    fingerMerken(!fingerZeichnet)
                    setFingerZeichnet(!fingerZeichnet)
                  }}
                  data-tb-finger
                >
                  <IconHandFinger size={18} />
                </ActionIcon>
              </Tooltip>
            )}
            {werkzeug === 'verbinder' && (
              <Text size="xs" c="dimmed" ml="xs" style={{ alignSelf: 'center' }}>
                Erstes, dann zweites Element antippen
              </Text>
            )}
            {werkzeug === 'zeichnen' && (
              <Text size="xs" c="dimmed" ml="xs" style={{ alignSelf: 'center' }}>
                Mit Maus, Stift oder Finger zeichnen – mehrere Striche ergeben eine Skizze
              </Text>
            )}
          </div>
          <Zeichenflaeche
            tafel={tafel}
            ansicht={ANSICHTEN[ansicht]}
            auswahl={auswahl}
            setAuswahl={setAuswahl}
            aendern={aendernTafel}
            gruppeEnde={endGroup}
            werkzeug={werkzeug}
            setWerkzeug={setWerkzeug}
            markiert={markiert}
            nachGeste={nachGeste}
            tastatur={!praesentation && !ausgabe && !insBlatt}
            fingerZeichnet={fingerZeichnet}
          />
        </div>
        <div className="tb-seite">
          {gewaehlt ? (
            <Eigenschaften
              key={gewaehlt.id}
              e={gewaehlt}
              format={format}
              meta={t.meta}
              inhalt={t.inhalt}
              aendern={(fn, gruppe) => aendernElement(gewaehlt.id, fn, gruppe)}
              loeschen={() => {
                const id = gewaehlt.id
                aendernTafel((x) => (x.elemente = x.elemente.filter((e) => e.id !== id && e.von !== id && e.nach !== id)))
                setAuswahl(null)
              }}
              duplizieren={() => hinzu(kopie(gewaehlt))}
              ebene={(r) =>
                aendernTafel((x) => {
                  const i = x.elemente.findIndex((e) => e.id === gewaehlt.id)
                  const [e] = x.elemente.splice(i, 1)
                  if (r === 'vorn') x.elemente.push(e)
                  else x.elemente.unshift(e)
                })
              }
              ki={(art, wunsch) => elementBearbeiten(t, docId, format, gewaehlt.id, art, wunsch)}
              kiBusy={false}
            />
          ) : (
            <TafelPanel
              t={t}
              tafel={tafel}
              befunde={befunde}
              waehle={(id) => setAuswahl(id)}
              setzeLegende={(farbe, bedeutung) =>
                update((d) => {
                  if (!d.inhalt) return
                  const l = d.inhalt.farbLegende.find((x) => x.farbe === farbe)
                  if (l) l.bedeutung = bedeutung
                  else d.inhalt.farbLegende.push({ farbe, bedeutung })
                }, `tb-legende-${farbe}`)
              }
              setzeTafel={(fn) => aendernTafel(fn)}
              neuSetzen={() =>
                void neuSetzen(t)
                  .then((n) => setDok(n))
                  .catch(notifyError)
              }
              kiDa={kiDa}
              vorschlag={(v, b) => vorschlagUmsetzen(v, b)}
              zeitachse={(wahl) =>
                void neuSetzen({ ...t, meta: { ...t.meta, zeitachse: wahl } })
                  .then((n) => setDok(n))
                  .catch(notifyError)
              }
            />
          )}
        </div>
      </div>
      {praesentation && <Praesentation tafel={tafel} inhalt={t.inhalt} mitLuecke={hatLuecken} schliessen={() => setPraesentation(false)} />}
      <AusgabeDialog t={t} docId={docId} offen={ausgabe} schliessen={() => setAusgabe(false)} />
      {insBlatt && <ArbeitsblattDialog t={t} offen={insBlatt} schliessen={() => setInsBlatt(false)} />}
    </Box>
  )
}

