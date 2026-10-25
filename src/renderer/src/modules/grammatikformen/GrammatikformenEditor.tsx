import { mixSchluessel } from '@shared/grammatikBank'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Collapse,
  Group,
  Menu,
  Modal,
  Paper,
  Progress,
  Select,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconChevronRight,
  IconDeviceFloppy,
  IconDots,
  IconPencil,
  IconPlus,
  IconRepeat,
  IconSparkles,
  IconTrash,
  IconListCheck
} from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import type { TextbookMeta } from '@shared/types'
import { fachDerSprache } from '@shared/fachobleute'
import { fachVon } from '@shared/faecher'
import { notifyError, notifySuccess } from '../../shared/util'
import DropZone from '../../shared/components/DropZone'
import { BandCover } from '../../shared/components/BandCover'
import { extractContent, MATERIAL_ACCEPT } from '../../shared/files/extractContent'
import { pruefeHochladen } from '../../shared/datenschutz'
import { darfLehrwerkBearbeiten } from '../../shared/fachobleute'
import { useExperte } from '../../shared/settingsStore'
import { BankKarte, useBankZahlen } from './GrammatikBank'
import { AMPEL_FARBE, AMPEL_TEXT, tonHell, tonText, tonVoll, tonZart, useGrammatikFarbe, type AufgabenAmpel } from './farbton'
import { aufgabenAmpel, kurseFreigegeben, useSchulStufen, alternativenAnfragen, alternativenKandidaten, bankAlternativenStarten } from './bank'
import { SchuelerAnsichtKnopf } from './SchuelerAnsicht'
import type { BankZahlen } from '@shared/grammatikBank'
import {
  LEHRWERK_GRAMMATIK,
  LEHRWERK_GRAMMATIK_EINGEBAUT,
  wendeGrammatikAn,
  type LehrwerkGrammatikBand,
  type LehrwerkGrammatikEintrag,
  type LehrwerkGrammatikPunkt
} from '../../shared/lehrwerkGrammatik'
import GrammatikAuswahl, { type GrammatikWahl } from '../arbeitsblatt/steps/GrammatikAuswahl'
import {
  abschnitteDer,
  kennungGueltig,
  kennungLabel,
  ordneBand,
  pillenInfo,
  pruefeVorschlaege,
  textZu,
  uebernehmbar,
  uebernimmVorschlaege,
  verschiebe,
  verschiebeNach,
  VORSCHLAG_SCHEMA,
  vorschlagAuftrag,
  type Vorschlag,
  teilbereicheVon,
  zielIndex,
  stichwoerterJeLektion,
  stichwortZuordnung,
  type GrammatikformenZiel
} from './grammatikformen'

const kopie = (b: LehrwerkGrammatikBand): LehrwerkGrammatikBand => JSON.parse(JSON.stringify(b ?? {})) as LehrwerkGrammatikBand
const abschnittName = (s: string): string => s || 'Ganzes Kapitel'
const wahlVon = (t: string[]): GrammatikWahl => ({ themen: t.filter((k) => !k.includes('/')), teilformen: t.filter((k) => k.includes('/')) })

/** Was der Auswahl-Dialog gerade bearbeitet: neuer Punkt in einem Abschnitt oder die Formen eines Punkts */
type Auswahl = { unit: string; abschnitt: string; index?: number; wahl: GrammatikWahl }
/** Ort eines Punkts (Pop-up, Ziehen) */
type Ort = { unit: string; abschnitt: string; index: number }

/**
 * Grammatik eines Lehrwerk-Bands bearbeiten (12.10.2026, App „Grammatikformen"; Neugestaltung „Navigator links" am selben Tag).
 *
 * Links die Units als schmale Leiste (Handy: Chips oben), rechts die Abschnitte der gewählten Unit als Zeitstrahl, je
 * Abschnitt die Grammatikpunkte als Pillen (Bezeichnung + ✓/⚠/↻ – keine Textfelder in der Liste). Ein Klick auf eine Pille
 * öffnet ein Pop-up (seit 13.10.2026; Standardmodus: Formen + Übungsaufgaben, Expertenmodus: Reiter mit Einordnung). Umsortieren per Ziehen
 * innerhalb eines Abschnitts. „Form hinzufügen" nutzt dieselbe Themen-/Teilformen-Auswahl wie Arbeitsblatt und
 * Grammatiktraining (GrammatikAuswahl). KI-Vorschläge aus Schulbuchseiten (Fenster „Aus Buchseiten ergänzen") erscheinen
 * als Liste zum Abhaken – übernommen wird nur Angehaktes, und nur DAZU. Gespeichert wird erst mit „Speichern" in der
 * Leiste unten (gemeinsame Daten der Schule – kein stilles Sichern nebenbei).
 */
export default function GrammatikformenEditor({
  buch,
  alle,
  eintrag,
  ziel,
  onBack,
  onGespeichert
}: {
  /** „Öffnen" aus der Auftragsleiste (13.10.2026): diesen Grammatikpunkt gleich im Pop-up zeigen */
  ziel?: GrammatikformenZiel | null
  buch: TextbookMeta
  alle: TextbookMeta[]
  /** Gespeicherte Bearbeitung dieses Bands (sonst gilt die eingebaute Liste bzw. noch keine) */
  eintrag?: LehrwerkGrammatikEintrag
  onBack: () => void
  onGespeichert: (liste: LehrwerkGrammatikEintrag[]) => void
}): React.JSX.Element {
  const darf = darfLehrwerkBearbeiten(buch.language)
  const fach = fachDerSprache(buch.language)
  const fachName = fachVon(fach)?.label ?? fach
  // Fachfarbe (13.10.2026, abgestimmt) – wie Meine Klassen und Sprachenlernen
  const farbe = useGrammatikFarbe(buch.language)
  const schmal = useMediaQuery('(max-width: 700px)') ?? false
  const experte = useExperte()
  // Aufgabenbank (13.10.2026): Zahlen je Teilbereich und Übungsart für das Pop-up
  const bank = useBankZahlen(buch.language)
  const schulStufen = useSchulStufen()
  const ausgangsBand = (): LehrwerkGrammatikBand => kopie(eintrag?.kapitel ?? LEHRWERK_GRAMMATIK[buch.name] ?? {})
  const [band, setBand] = useState<LehrwerkGrammatikBand>(ausgangsBand)
  const [dirty, setDirty] = useState(false)
  const [speichert, setSpeichert] = useState(false)
  const [zurueckFrage, setZurueckFrage] = useState(false)
  const [verwerfenFrage, setVerwerfenFrage] = useState(false)
  const unitNamen = useMemo(() => [...buch.units.map((u) => u.name), ...Object.keys(band).filter((k) => !buch.units.some((u) => u.name === k))], [buch, band])
  const [aufUnits, setAufUnits] = useState<string[]>(() => [unitNamen.find((u) => band[u]) ?? unitNamen[0] ?? ''])
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null)
  const [offen, setOffen] = useState<Ort | null>(null)
  // „Öffnen" aus der Auftragsleiste: Unit wählen und den Punkt im Pop-up zeigen (ist er weg: nur die Unit)
  useEffect(() => {
    if (!ziel) return
    if (unitNamen.includes(ziel.unit)) setAufUnits((l) => (l.includes(ziel.unit) ? l : [...l, ziel.unit]))
    const i = zielIndex(band[ziel.unit]?.[ziel.abschnitt] ?? [], ziel)
    if (i >= 0) setOffen({ unit: ziel.unit, abschnitt: ziel.abschnitt, index: i })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ziel])
  const [entfernenFrage, setEntfernenFrage] = useState(false)
  const [ziehen, setZiehen] = useState<Ort | null>(null)
  const [ueber, setUeber] = useState<number | null>(null)
  const [kiOffen, setKiOffen] = useState(false)
  const [liest, setLiest] = useState<string | null>(null)
  const [vorschlaege, setVorschlaege] = useState<Vorschlag[] | null>(null)
  // Gleichnamiger Band (z. B. zwei Ausgaben „¡Apúntate! 1"): Die Grammatik gilt nach dem Namen – Hinweis statt still
  const gleichnamig = alle.filter((b) => b.id !== buch.id && b.name === buch.name)
  const eingebaut = Boolean(LEHRWERK_GRAMMATIK_EINGEBAUT[buch.name])

  const aendere = (fn: (b: LehrwerkGrammatikBand) => void): void => {
    if (!darf) return
    setBand((alt) => {
      const neu = kopie(alt)
      fn(neu)
      return neu
    })
    setDirty(true)
  }
  const punkteVon = (u: string, a: string): LehrwerkGrammatikPunkt[] => band[u]?.[a] ?? []
  const setzePunkte = (u: string, a: string, liste: LehrwerkGrammatikPunkt[]): void =>
    aendere((b) => {
      b[u] ??= {}
      if (liste.length) b[u][a] = liste
      else delete b[u][a]
      if (!Object.keys(b[u]).length) delete b[u]
    })
  const aenderePunkt = (o: Ort, fn: (p: LehrwerkGrammatikPunkt) => LehrwerkGrammatikPunkt): void =>
    setzePunkte(
      o.unit,
      o.abschnitt,
      punkteVon(o.unit, o.abschnitt).map((x, j) => (j === o.index ? fn(x) : x))
    )

  const speichern = async (): Promise<void> => {
    setSpeichert(true)
    try {
      const liste = await window.api.lehrwerkGrammatik.save({ lehrwerkId: buch.id, buch: buch.name, sprache: buch.language, kapitel: ordneBand(band, buch) })
      wendeGrammatikAn(liste)
      onGespeichert(liste)
      setDirty(false)
      notifySuccess(`Grammatikformen von „${buch.name}" gespeichert.`)
    } catch (e) {
      notifyError(e)
    } finally {
      setSpeichert(false)
    }
  }

  /** Nicht gespeicherte Änderungen verwerfen (zurück zum zuletzt gespeicherten bzw. eingebauten Stand) */
  const ungespeichertVerwerfen = (): void => {
    setBand(ausgangsBand())
    setDirty(false)
    setOffen(null)
  }

  /** Gespeicherte Bearbeitung des Bands löschen (zurück zur eingebauten Fassung – für alle) */
  const verwerfen = async (): Promise<void> => {
    try {
      const liste = await window.api.lehrwerkGrammatik.delete(buch.id)
      wendeGrammatikAn(liste)
      onGespeichert(liste)
      setBand(kopie(LEHRWERK_GRAMMATIK[buch.name] ?? {}))
      setDirty(false)
      setOffen(null)
      notifySuccess(eingebaut ? 'Die eingebaute Grammatik gilt wieder.' : 'Die Grammatik dieses Bands wurde entfernt.')
    } catch (e) {
      notifyError(e)
    }
  }

  /** Schulbuchseiten → KI-Vorschläge (nur Vorschläge; nichts wird ohne Abhaken übernommen) */
  /*
   * Latein-Lehrwerke (13.10.2026, abgestimmt): Grammatik aus der Lektionsübersicht des Verlags (lehrwerkeLatein.ts) –
   * eindeutige Stichwörter gleich zugeordnet, die übrigen ordnet die KI zu. Alles erscheint als Vorschlag zum Durchsehen.
   */
  const stichwoerter = stichwoerterJeLektion(buch.name)
  const ausStichwoertern = async (): Promise<void> => {
    setKiOffen(true)
    try {
      const { sicher, rest } = stichwortZuordnung(stichwoerter, fach)
      let ki: unknown[] = []
      if (rest.length) {
        setLiest(`Die KI ordnet ${rest.length} Stichwörter zu …`)
        const auftrag = vorschlagAuftrag(buch.name, buch, fach, fachName)
        const roh = await window.api.ai.structured<{ vorschlaege?: unknown[] }>({
          system: auftrag.system.replace('Grundlage sind die hochgeladenen Seiten', 'Grundlage ist die Lektionsübersicht des Verlags'),
          user: `${
            auftrag.user
          }\n\nSTICHWÖRTER JE LEKTION (Lektionsübersicht des Verlags; je Stichwort höchstens ein Vorschlag, abschnitt ""; fundstelle „Lektionsübersicht des Verlags"):\n${rest
            .map((r) => `${r.unit}: ${r.stichwort}`)
            .join('\n')}`,
          schemaName: 'grammatikformen_vorschlaege',
          schema: VORSCHLAG_SCHEMA
        })
        ki = roh?.vorschlaege ?? []
      }
      const v = pruefeVorschlaege({ vorschlaege: [...sicher, ...ki] }, buch, band, fach)
      if (!v.length) throw new Error('Keine Grammatik zuordenbar.')
      setVorschlaege(v)
    } catch (e) {
      notifyError(e)
      setKiOffen(false)
    } finally {
      setLiest(null)
    }
  }

  const seitenLesen = async (dateien: File[]): Promise<void> => {
    try {
      const gelesen = []
      for (const f of dateien) {
        setLiest(`${f.name} wird gelesen …`)
        gelesen.push(await extractContent(f, (m) => setLiest(`${f.name}: ${m}`), { maxRenderedPages: 8 }))
      }
      // Datenschutz: Namensprüfung vor jeder KI-Anfrage
      const geprueft = await pruefeHochladen(gelesen)
      if (!geprueft) return
      const bilder = geprueft
        .flatMap((g) => g.pageImages)
        .filter((b) => b.startsWith('data:image/'))
        .slice(0, 8)
      const text = geprueft
        .filter((g) => !g.pageImages.length && g.text.trim())
        .map((g) => g.text)
        .join('\n\n')
        .slice(0, 20000)
      if (!bilder.length && !text) throw new Error('Keine Seiten gefunden – bitte Fotos oder ein PDF der Schulbuchseiten wählen.')
      setLiest('Die KI ordnet die Grammatik zu …')
      const auftrag = vorschlagAuftrag(buch.name, buch, fach, fachName)
      const roh = await window.api.ai.structured<unknown>({
        system: auftrag.system,
        user: text ? `${auftrag.user}\n\nTEXT DER SEITEN:\n${text}` : auftrag.user,
        ...(bilder.length ? { images: bilder } : {}),
        schemaName: 'grammatikformen_vorschlaege',
        schema: VORSCHLAG_SCHEMA
      })
      const v = pruefeVorschlaege(roh, buch, band, fach)
      if (!v.length) throw new Error('Auf den Seiten wurde keine zuordenbare Grammatik gefunden.')
      setVorschlaege(v)
    } catch (e) {
      notifyError(e)
    } finally {
      setLiest(null)
    }
  }

  const offenPunkt = offen ? punkteVon(offen.unit, offen.abschnitt)[offen.index] : undefined
  // Alternativlösungen für den ganzen Band (25.10.2026): alle Teilbereiche und gemischten Übungen seiner Punkte mit Aufgaben
  const [altOffen, setAltOffen] = useState(false)
  const bandPunkte = Object.values(band).flatMap((k) => Object.values(k).flat())
  const altKandidaten = alternativenKandidaten(
    bandPunkte.flatMap((p) => {
      const teile = teilbereicheVon(p.t)
      return teile.length >= 2 ? [...teile, mixSchluessel(p.t)] : teile
    }),
    bank.zahlen
  )
  const altAufgaben = altKandidaten.reduce((n, x) => n + x.aufgaben, 0)
  const alternativenBand = (): void => {
    setAltOffen(false)
    bankAlternativenStarten(
      altKandidaten.map((x) => ({ schluessel: x.schluessel, titel: kennungLabel(x.schluessel) })),
      { sprache: buch.language, fach: fachVon(fach)?.label ?? fach, jahrgang: buch.grade ?? 7 },
      `Alternativlösungen: ${buch.name}`
    )
  }
  const offenListe = offen ? punkteVon(offen.unit, offen.abschnitt) : []

  const kopf = (
    <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
        <BandCover band={buch} land={buch.stateId ?? ''} breite={schmal ? 34 : 42} />
        <div style={{ minWidth: 0 }}>
          <Group gap={6} wrap="wrap">
            <Title order={3} style={{ lineHeight: 1.2 }}>
              {buch.name}
            </Title>
            {eintrag ? (
              <Badge variant="light" color="gray" size="sm" tt="none" data-grammatikformen-kennzeichen="bearbeitet">
                bearbeitet
              </Badge>
            ) : eingebaut ? (
              <Badge variant="light" color="gray" size="sm" tt="none" data-grammatikformen-kennzeichen="eingebaut">
                eingebaut
              </Badge>
            ) : null}
          </Group>
          <Text c="dimmed" size="xs">
            {darf
              ? 'Grammatik je Unit und Abschnitt – Änderungen gelten nach „Speichern" für alle Lehrkräfte der Schule.'
              : 'Nur ansehen – bearbeiten dürfen Admins und die Fachobleute dieses Fachs.'}
          </Text>
        </div>
      </Group>
      <Group gap="xs" wrap="nowrap">
        {bank.darf && altKandidaten.length > 0 && (
          <>
            <Tooltip label="Weitere richtige Lösungen zu allen Aufgaben dieses Bands von der KI nachtragen lassen">
              <Button variant="subtle" color="teal" leftSection={<IconListCheck size={16} />} onClick={() => setAltOffen(true)} data-grammatikformen-alternativen visibleFrom="sm">
                Weitere Lösungen (KI)
              </Button>
            </Tooltip>
            <ActionIcon variant="subtle" color="teal" size="lg" hiddenFrom="sm" aria-label="Weitere richtige Lösungen nachtragen" onClick={() => setAltOffen(true)}>
              <IconListCheck size={18} />
            </ActionIcon>
            <Modal opened={altOffen} onClose={() => setAltOffen(false)} title="Weitere richtige Lösungen nachtragen" centered data-grammatikformen-alternativen-frage>
              <Stack gap="sm">
                <Text size="sm">
                  Die KI geht alle hinterlegten Aufgaben dieses Bands durch und trägt weitere gleichwertig richtige Antworten nach – Kurzformen, gleichwertige
                  Umformungen wie „It is said that …“ neben „He is said to …“, weitere Formen des vorgegebenen Worts. Die Aufgaben selbst bleiben unverändert,
                  die zusätzlichen Lösungen gelten sofort in allen Kursen.
                </Text>
                <Text size="sm">
                  {altKandidaten.length} Bereiche mit {altAufgaben} Aufgaben, etwa {alternativenAnfragen(altKandidaten)} KI-Anfragen. Das läuft im Hintergrund,
                  einzelne Punkte gehen auch über „Übungsaufgaben“ am Grammatikpunkt.
                </Text>
                <Group justify="flex-end">
                  <Button variant="default" onClick={() => setAltOffen(false)}>
                    Abbrechen
                  </Button>
                  <Button color="teal" onClick={alternativenBand} data-grammatikformen-alternativen-start>
                    Starten
                  </Button>
                </Group>
              </Stack>
            </Modal>
          </>
        )}
        {darf && experte && (
          <Button
            variant="light"
            color={farbe}
            leftSection={<IconSparkles size={16} />}
            onClick={() => setKiOffen(true)}
            data-grammatikformen-ki
            visibleFrom="xs"
          >
            Aus Buchseiten ergänzen
          </Button>
        )}
        {darf && experte && (
          <ActionIcon variant="light" color={farbe} size="lg" hiddenFrom="xs" aria-label="Aus Buchseiten ergänzen" onClick={() => setKiOffen(true)}>
            <IconSparkles size={18} />
          </ActionIcon>
        )}
        {darf && stichwoerter.length > 0 && (
          <Button
            variant="light"
            color={farbe}
            leftSection={<IconSparkles size={16} />}
            onClick={() => void ausStichwoertern()}
            data-grammatikformen-stichwoerter
          >
            Aus Lektionsübersicht zuordnen
          </Button>
        )}
        <SchuelerAnsichtKnopf
          buch={buch}
          titel={buch.name}
          farbe={farbe}
          punkte={unitNamen.flatMap((u) =>
            Object.entries(band[u] ?? {}).flatMap(([abschnitt, liste]) => liste.map((punkt) => ({ unit: u, abschnitt, punkt })))
          )}
        />
        <Button
          variant="default"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => (dirty ? setZurueckFrage(true) : onBack())}
          data-grammatikformen-zurueck
        >
          Zurück
        </Button>
        {darf && eintrag && experte && (
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Weitere Aktionen" data-grammatikformen-menue>
                <IconDots size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => setVerwerfenFrage(true)} data-grammatikformen-verwerfen>
                {eingebaut ? 'Änderungen dieses Bands verwerfen (zurück zur eingebauten Fassung)' : 'Grammatik dieses Bands entfernen'}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
    </Group>
  )

  /*
   * Unit-Karten (13.10.2026, abgestimmt; wie die Karten in Meine Klassen): je Unit eine aufklappbare Karte in der
   * Fachfarbe, darin je Abschnitt eine Zeile mit den Grammatikformen als Pillen samt Ampel der Übungsaufgaben. Ziehen
   * zum Umsortieren nur im Expertenmodus.
   */
  const ziehbar = darf && experte
  const ampelVon = (p: LehrwerkGrammatikPunkt): AufgabenAmpel => aufgabenAmpel(teilbereicheVon(p.t), bank.zahlen, schulStufen)
  const mitAmpel = kurseFreigegeben()
  const unitKarten = (
    <Stack gap="sm" data-grammatikformen-units>
      {unitNamen.map((u) => {
        const abschnitte = abschnitteDer(buch, u, band[u])
        const punkteU = abschnitte.flatMap((a) => punkteVon(u, a))
        const n = punkteU.length
        const mitAufgaben = punkteU.filter((p) => ampelVon(p) !== 'keine').length
        const auf = aufUnits.includes(u)
        return (
          <Paper
            key={u}
            withBorder
            radius="lg"
            style={{ overflow: 'hidden', borderLeft: `4px solid ${n ? tonVoll(farbe) : 'var(--mantine-color-default-border)'}` }}
            data-grammatikformen-unit={u}
          >
            <UnstyledButton
              onClick={() => setAufUnits((l) => (auf ? l.filter((x) => x !== u) : [...l, u]))}
              w="100%"
              px="md"
              py="sm"
              style={{ background: auf ? tonZart(farbe) : undefined }}
              aria-expanded={auf}
              data-grammatikformen-unit-kopf={u}
            >
              <Group justify="space-between" wrap="nowrap" gap="sm">
                <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                  <IconChevronRight size={16} style={{ transform: auf ? 'rotate(90deg)' : undefined, transition: 'transform 150ms', flexShrink: 0 }} />
                  <Text fw={700} truncate>
                    {u}
                  </Text>
                </Group>
                <Group gap="md" wrap="nowrap">
                  <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                    {n ? `${n} ${n === 1 ? 'Form' : 'Formen'}` : 'keine Grammatik'}
                  </Text>
                  {n > 0 && mitAmpel && (
                    <Tooltip label={`Übungsaufgaben: ${mitAufgaben} von ${n} Formen`}>
                      <Progress
                        value={(mitAufgaben / n) * 100}
                        w={80}
                        size="sm"
                        color="teal"
                        radius="xl"
                        visibleFrom="xs"
                        aria-label="Formen mit Übungsaufgaben"
                      />
                    </Tooltip>
                  )}
                </Group>
              </Group>
            </UnstyledButton>
            <Collapse expanded={auf}>
              <Stack gap={0} px="md" pb="xs">
                {abschnitte.map((a) => {
                  const punkte = punkteVon(u, a)
                  if (!punkte.length && !darf) return null
                  return (
                    <Group
                      key={a || '(ganz)'}
                      align="flex-start"
                      wrap={schmal ? 'wrap' : 'nowrap'}
                      gap="sm"
                      py={10}
                      style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
                      data-grammatikformen-abschnitt={a || 'ganz'}
                    >
                      <Text size="sm" fw={600} w={schmal ? '100%' : 150} c={punkte.length ? undefined : 'dimmed'} style={{ flexShrink: 0, paddingTop: 5 }}>
                        {abschnittName(a)}
                      </Text>
                      <Group gap={6} wrap="wrap" style={{ flex: 1, minWidth: 0 }}>
                        {punkte.map((p, i) => (
                          <Pille
                            key={i}
                            punkt={p}
                            fach={fach}
                            farbe={farbe}
                            experte={experte}
                            ampel={mitAmpel ? ampelVon(p) : undefined}
                            ziehbar={ziehbar && punkte.length > 1}
                            markiert={Boolean(ziehen && ziehen.unit === u && ziehen.abschnitt === a && ueber === i && ziehen.index !== i)}
                            gezogen={Boolean(ziehen && ziehen.unit === u && ziehen.abschnitt === a && ziehen.index === i)}
                            onClick={() => {
                              setEntfernenFrage(false)
                              setOffen({ unit: u, abschnitt: a, index: i })
                            }}
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = 'move'
                              e.dataTransfer.setData('text/plain', String(i))
                              setZiehen({ unit: u, abschnitt: a, index: i })
                            }}
                            onDragOver={(e) => {
                              if (!ziehen || ziehen.unit !== u || ziehen.abschnitt !== a) return
                              e.preventDefault()
                              e.dataTransfer.dropEffect = 'move'
                              if (ueber !== i) setUeber(i)
                            }}
                            onDrop={(e) => {
                              e.preventDefault()
                              if (ziehen && ziehen.unit === u && ziehen.abschnitt === a) setzePunkte(u, a, verschiebeNach(punkte, ziehen.index, i))
                              setZiehen(null)
                              setUeber(null)
                            }}
                            onDragEnd={() => {
                              setZiehen(null)
                              setUeber(null)
                            }}
                          />
                        ))}
                        {!punkte.length && (
                          <Text size="xs" c="dimmed" pt={6}>
                            keine Grammatik
                          </Text>
                        )}
                        {darf && (
                          <Button
                            size="compact-sm"
                            variant="subtle"
                            color={farbe}
                            leftSection={<IconPlus size={14} />}
                            onClick={() => setAuswahl({ unit: u, abschnitt: a, wahl: { themen: [], teilformen: [] } })}
                            data-grammatikformen-hinzufuegen
                          >
                            Form hinzufügen
                          </Button>
                        )}
                      </Group>
                    </Group>
                  )
                })}
                {!darf && !n && (
                  <Text size="sm" c="dimmed" py="xs">
                    Für diese Unit ist keine Grammatik hinterlegt.
                  </Text>
                )}
              </Stack>
            </Collapse>
          </Paper>
        )
      })}
    </Stack>
  )

  return (
    <Stack gap="lg" pb={dirty ? 72 : 0}>
      {kopf}

      {zurueckFrage && (
        <Alert color="orange" p="xs">
          <Group justify="space-between">
            <Text size="sm">Ungespeicherte Änderungen verwerfen und zurück zur Übersicht?</Text>
            <Group gap="xs">
              <Button size="xs" variant="default" onClick={() => setZurueckFrage(false)}>
                Abbrechen
              </Button>
              <Button size="xs" color="orange" onClick={onBack}>
                Ohne Speichern zurück
              </Button>
            </Group>
          </Group>
        </Alert>
      )}
      {verwerfenFrage && (
        <Alert color="red" p="xs">
          <Group justify="space-between">
            <Text size="sm">
              {eingebaut
                ? 'Alle Bearbeitungen dieses Bands verwerfen – für alle Lehrkräfte? Danach gilt wieder die eingebaute Grammatik.'
                : 'Die Grammatik dieses Bands entfernen – für alle Lehrkräfte?'}
            </Text>
            <Group gap="xs">
              <Button size="xs" variant="default" onClick={() => setVerwerfenFrage(false)}>
                Abbrechen
              </Button>
              <Button
                size="xs"
                color="red"
                autoFocus
                onClick={() => {
                  setVerwerfenFrage(false)
                  void verwerfen()
                }}
              >
                Verwerfen
              </Button>
            </Group>
          </Group>
        </Alert>
      )}
      {gleichnamig.length > 0 && (
        <Alert color="yellow" variant="light" p="xs">
          <Text size="xs">
            Es gibt einen gleichnamigen Band ({gleichnamig.map((b) => [b.ausgabe, b.edition].filter(Boolean).join(', ') || b.id).join('; ')}). Die Grammatik
            gilt nach dem Namen „{buch.name}" – für beide.
          </Text>
        </Alert>
      )}

      {unitKarten}

      {darf && dirty && (
        <Paper withBorder shadow="md" radius="md" p="xs" px="md" style={{ position: 'sticky', bottom: 12, zIndex: 5 }} data-grammatikformen-speicherleiste>
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <Text size="sm" fw={500}>
              Ungespeicherte Änderungen
            </Text>
            <Group gap="xs" wrap="nowrap">
              <Button variant="default" size="xs" onClick={ungespeichertVerwerfen} data-grammatikformen-ungespeichert-verwerfen>
                Verwerfen
              </Button>
              <Button
                size="xs"
                color={farbe}
                leftSection={<IconDeviceFloppy size={14} />}
                loading={speichert}
                onClick={() => void speichern()}
                data-grammatikformen-speichern
              >
                Speichern
              </Button>
            </Group>
          </Group>
        </Paper>
      )}

      <Modal
        opened={Boolean(offen && offenPunkt)}
        onClose={() => (setOffen(null), setEntfernenFrage(false))}
        size={experte ? 'xl' : 'lg'}
        fullScreen={schmal}
        radius="lg"
        title={
          offen && offenPunkt ? (
            <div style={{ minWidth: 0 }}>
              <Text size="xs" fw={600} tt="uppercase" style={{ letterSpacing: 0.4, color: tonText(farbe) }}>
                {offen.unit} · {abschnittName(offen.abschnitt)}
              </Text>
              <Text fw={700} size="lg" lh={1.25} lineClamp={2}>
                {pillenInfo(offenPunkt, fach).name}
              </Text>
            </div>
          ) : (
            ''
          )
        }
        styles={{
          header: {
            background: `linear-gradient(135deg, ${tonHell(farbe)} 0%, var(--mantine-color-body) 85%)`,
            borderBottom: '1px solid var(--mantine-color-default-border)',
            marginBottom: 16
          }
        }}
        data-grammatikformen-popup-fenster
      >
        {offen && offenPunkt && (
          <PunktFenster
            punkt={offenPunkt}
            ort={offen}
            buch={buch}
            unitPunkte={Object.values(band[offen.unit] ?? {}).flat()}
            bank={bank}
            schliessen={() => (setOffen(null), setEntfernenFrage(false))}
            anzahl={offenListe.length}
            darf={darf}
            fach={fach}
            farbe={farbe}
            abschnitte={abschnitteDer(buch, offen.unit, band[offen.unit])}
            entfernenFrage={entfernenFrage}
            setEntfernenFrage={setEntfernenFrage}
            onText={(text) => aenderePunkt(offen, (x) => ({ ...x, text }))}
            onWiederholung={(w) => aenderePunkt(offen, (x) => (w ? { ...x, w: true as const } : { text: x.text, t: x.t }))}
            onFormen={() => setAuswahl({ ...offen, wahl: wahlVon(offenPunkt.t) })}
            onAbschnitt={(ziel) => {
              if (ziel === offen.abschnitt) return
              const ohne = offenListe.filter((_, j) => j !== offen.index)
              const dort = [...punkteVon(offen.unit, ziel), offenPunkt]
              aendere((b) => {
                b[offen.unit] ??= {}
                if (ohne.length) b[offen.unit][offen.abschnitt] = ohne
                else delete b[offen.unit][offen.abschnitt]
                b[offen.unit][ziel] = dort
              })
              setOffen({ unit: offen.unit, abschnitt: ziel, index: dort.length - 1 })
            }}
            onVerschieben={(richtung) => {
              setzePunkte(offen.unit, offen.abschnitt, verschiebe(offenListe, offen.index, richtung))
              setOffen({ ...offen, index: offen.index + richtung })
            }}
            onEntfernen={() => {
              setzePunkte(
                offen.unit,
                offen.abschnitt,
                offenListe.filter((_, j) => j !== offen.index)
              )
              setEntfernenFrage(false)
              setOffen(null)
            }}
          />
        )}
      </Modal>

      <Modal
        opened={kiOffen}
        onClose={() => !liest && setKiOffen(false)}
        size={vorschlaege ? 'xl' : 'lg'}
        title={
          <Group gap="xs">
            <IconSparkles size={18} />
            <Text fw={600}>Aus Buchseiten ergänzen</Text>
          </Group>
        }
        data-grammatikformen-ki-fenster
      >
        <Stack>
          {!vorschlaege && (
            <DropZone
              onFiles={(f) => void seitenLesen(f)}
              accept={MATERIAL_ACCEPT}
              multiple
              title={liest ?? 'Inhaltsverzeichnis oder Grammatikseiten hierher ziehen'}
              hint="PDF oder Fotos (PNG, JPG) – die KI schlägt je Abschnitt Grammatikformen mit Fundstelle vor; übernommen wird nur Angehaktes."
              loading={Boolean(liest)}
              minHeight={110}
            />
          )}
          {vorschlaege && (
            <VorschlagListe
              vorschlaege={vorschlaege}
              buch={buch}
              onChange={setVorschlaege}
              onVerwerfen={() => setVorschlaege(null)}
              onUebernehmen={() => {
                const r = uebernimmVorschlaege(band, vorschlaege, buch)
                if (!r.zahl) return notifyError('Nichts Neues zum Übernehmen angehakt.')
                setBand(r.band)
                setDirty(true)
                setVorschlaege(null)
                setKiOffen(false)
                notifySuccess(`${r.zahl} ${r.zahl === 1 ? 'Grammatikpunkt' : 'Grammatikpunkte'} übernommen – jetzt prüfen und speichern.`)
              }}
            />
          )}
        </Stack>
      </Modal>

      <Modal
        opened={Boolean(auswahl)}
        onClose={() => setAuswahl(null)}
        size="xl"
        zIndex={400}
        title={
          auswahl ? `${auswahl.index === undefined ? 'Grammatik hinzufügen' : 'Formen ändern'} – ${auswahl.unit}, ${abschnittName(auswahl.abschnitt)}` : ''
        }
      >
        {auswahl && (
          <Stack>
            <GrammatikAuswahl
              query={{ subjectId: fach, grade: buch.grade ?? 13, stateId: buch.stateId, schoolTypeId: buch.schoolTypeId }}
              wahl={auswahl.wahl}
              onChange={(w) => setAuswahl({ ...auswahl, wahl: w })}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setAuswahl(null)}>
                Abbrechen
              </Button>
              <Button
                color={farbe}
                disabled={!auswahl.wahl.themen.length && !auswahl.wahl.teilformen.length}
                onClick={() => {
                  // Teilformen ersetzen ihr Thema (genauer); Themen ohne gewählte Teilform bleiben als Thema
                  const t = [...auswahl.wahl.themen.filter((id) => !auswahl.wahl.teilformen.some((k) => k.startsWith(`${id}/`))), ...auswahl.wahl.teilformen]
                  const liste = punkteVon(auswahl.unit, auswahl.abschnitt)
                  setzePunkte(
                    auswahl.unit,
                    auswahl.abschnitt,
                    auswahl.index === undefined ? [...liste, { text: textZu(t), t }] : liste.map((x, j) => (j === auswahl.index ? { ...x, t } : x))
                  )
                  setAuswahl(null)
                }}
              >
                Übernehmen
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  )
}

/** Ein Grammatikpunkt als Pille: Bezeichnung + ✓ (verknüpft) / ⚠ (keine oder ungültige Katalogform) / ↻ (Wiederholung) */
function Pille({
  punkt,
  fach,
  farbe,
  experte,
  ampel,
  ziehbar,
  markiert,
  gezogen,
  onClick,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: {
  punkt: LehrwerkGrammatikPunkt
  fach: string
  farbe: string
  /** Kennungen und Katalog-Warnungen nur im Expertenmodus (13.10.2026) */
  experte: boolean
  /** Stand der Übungsaufgaben (nur am Server) */
  ampel?: AufgabenAmpel
  ziehbar: boolean
  markiert: boolean
  gezogen: boolean
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
}): React.JSX.Element {
  const info = pillenInfo(punkt, fach)
  const hinweise = [
    ampel ? AMPEL_TEXT[ampel] : '',
    experte && info.abweichend ? `Katalog: ${info.katalog}` : '',
    experte && info.status === 'fehlt' ? 'Keine Katalogform verknüpft' : '',
    experte && info.status === 'ungueltig' ? `Unbekannte Katalogform: ${info.ungueltig.join(', ')}` : '',
    punkt.w ? 'Wiederholung eines früher eingeführten Themas' : ''
  ].filter(Boolean)
  const knopf = (
    <UnstyledButton
      onClick={onClick}
      draggable={ziehbar}
      onDragStart={ziehbar ? onDragStart : undefined}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      data-grammatikformen-punkt
      data-grammatikformen-pille={info.status}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        maxWidth: '100%',
        padding: '5px 12px',
        borderRadius: 999,
        border: `1px solid ${markiert ? tonVoll(farbe) : `color-mix(in srgb, ${tonVoll(farbe)} 35%, var(--mantine-color-default-border))`}`,
        boxShadow: markiert ? `-3px 0 0 ${tonVoll(farbe)}` : undefined,
        background: tonZart(farbe),
        opacity: gezogen ? 0.45 : 1,
        cursor: ziehbar ? 'grab' : 'pointer',
        fontSize: 'var(--mantine-font-size-sm)',
        lineHeight: 1.3
      }}
    >
      {ampel && (
        <span
          aria-label={AMPEL_TEXT[ampel]}
          data-grammatikformen-ampel={ampel}
          style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: `var(--mantine-color-${AMPEL_FARBE[ampel]}-filled)` }}
        />
      )}
      {experte &&
        (info.status === 'ok' ? (
          <IconCheck size={13} style={{ flexShrink: 0, color: tonVoll(farbe) }} aria-label="mit Katalogform verknüpft" />
        ) : (
          <IconAlertTriangle size={13} style={{ flexShrink: 0, color: 'var(--mantine-color-orange-filled)' }} aria-label="ohne gültige Katalogform" />
        ))}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.name}</span>
      {punkt.w && (
        <IconRepeat size={13} style={{ flexShrink: 0, color: 'var(--mantine-color-dimmed)' }} aria-label="Wiederholung" data-grammatikformen-wiederholung />
      )}
    </UnstyledButton>
  )
  return hinweise.length ? (
    <Tooltip label={hinweise.join(' · ')} multiline maw={320} openDelay={300}>
      {knopf}
    </Tooltip>
  ) : (
    knopf
  )
}

/** Abschnitt im Pop-up: Überschrift mit Symbol, Inhalt in einer Karte */
function FensterKarte({
  titel,
  icon,
  rechts,
  children
}: {
  titel: string
  icon: React.ReactNode
  rechts?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Card withBorder radius="lg" padding="md">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Group gap={8} wrap="nowrap">
          {icon}
          <Text fw={700} size="sm">
            {titel}
          </Text>
        </Group>
        {rechts}
      </Group>
      {children}
    </Card>
  )
}

/** Kleines rundes Symbol in der Fachfarbe */
function SymbolRund({ farbe, children }: { farbe: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        borderRadius: 999,
        background: tonHell(farbe),
        color: tonVoll(farbe),
        flexShrink: 0
      }}
    >
      {children}
    </span>
  )
}

/** Verknüpfte Formen als Pillen (✓ im Katalog, ⚠ unbekannt) */
function FormPillen({ punkt, fach, farbe }: { punkt: LehrwerkGrammatikPunkt; fach: string; farbe: string }): React.JSX.Element {
  return (
    <Group gap={6}>
      {punkt.t.map((k) => {
        const ok = kennungGueltig(k, fach)
        return (
          <Badge
            key={k}
            title={k}
            size="lg"
            radius="xl"
            tt="none"
            fw={500}
            variant="light"
            color={ok ? farbe : 'orange'}
            leftSection={ok ? <IconCheck size={12} /> : <IconAlertTriangle size={12} />}
            styles={{ root: { height: 'auto', minHeight: 26, paddingBlock: 3 }, label: { whiteSpace: 'normal' } }}
          >
            {ok ? kennungLabel(k) : `${k} (nicht im Katalog)`}
          </Badge>
        )
      })}
      {!punkt.t.length && (
        <Group gap={6} wrap="nowrap">
          <IconAlertTriangle size={14} style={{ flexShrink: 0, color: 'var(--mantine-color-orange-filled)' }} />
          <Text size="sm" c="dimmed">
            Keine Katalogform – der Punkt wird nur genannt.
          </Text>
        </Group>
      )}
    </Group>
  )
}

/**
 * Inhalt des Pop-ups zu einem Grammatikpunkt (13.10.2026, Wunsch der Lehrkraft: Pop-up wie überall statt Leiste rechts,
 * „intuitiv und leicht verständlich"; abgestimmt):
 *  - Standardmodus: Formen als Pillen, darunter die Übungsaufgaben mit Ampel je Bereich (Ansehen/Anlegen, „Fehlende
 *    Aufgaben mit KI ergänzen"). Unten „Entfernen", „Alle Optionen" und „Schließen".
 *  - Expertenmodus (oder „Alle Optionen"): Reiter Überblick | Übungsaufgaben (je Teilbereich und Übungsart) | Einordnung
 *    (Bezeichnung, Formen ändern, Wiederholung, Abschnitt, Reihenfolge).
 * Ohne Bearbeitungsrecht nur Ansicht.
 */
export function PunktFenster({
  punkt,
  ort,
  buch,
  unitPunkte,
  bank,
  anzahl,
  darf,
  fach,
  farbe,
  abschnitte,
  entfernenFrage,
  setEntfernenFrage,
  schliessen,
  onText,
  onWiederholung,
  onFormen,
  onAbschnitt,
  onVerschieben,
  onEntfernen
}: {
  punkt: LehrwerkGrammatikPunkt
  ort: Ort
  buch: TextbookMeta
  unitPunkte: LehrwerkGrammatikPunkt[]
  bank: { zahlen: BankZahlen; darf: boolean }
  anzahl: number
  darf: boolean
  fach: string
  farbe: string
  abschnitte: string[]
  entfernenFrage: boolean
  setEntfernenFrage: (b: boolean) => void
  schliessen: () => void
  onText: (t: string) => void
  onWiederholung: (w: boolean) => void
  onFormen: () => void
  onAbschnitt: (a: string) => void
  onVerschieben: (r: -1 | 1) => void
  onEntfernen: () => void
}): React.JSX.Element {
  const experte = useExperte()
  // „Alle Optionen" im Standardmodus: nur für dieses Pop-up, ohne den Modus umzuschalten
  const [alle, setAlle] = useState(false)
  const voll = experte || alle
  const [reiter, setReiter] = useState<string | null>('ueberblick')
  const bankKarte = (einfach: boolean): React.JSX.Element => (
    <BankKarte
      punkt={punkt}
      unit={ort.unit}
      abschnitt={ort.abschnitt}
      unitPunkte={unitPunkte}
      buch={buch}
      fach={fach}
      farbe={farbe}
      zahlen={bank.zahlen}
      darf={bank.darf}
      einfach={einfach}
    />
  )
  const ueberblick = (
    <Stack gap="md">
      <div>
        <Text size="xs" c="dimmed" mb={6}>
          Verknüpfte Formen
        </Text>
        <FormPillen punkt={punkt} fach={fach} farbe={farbe} />
        <Group mt={10}>
          <SchuelerAnsichtKnopf buch={buch} punkte={[{ unit: ort.unit, abschnitt: ort.abschnitt, punkt }]} titel={punkt.text} farbe={farbe} klein />
        </Group>
        {punkt.w && (
          <Badge mt={8} variant="outline" color="gray" tt="none" leftSection={<IconRepeat size={12} />}>
            Wiederholung eines früher eingeführten Themas
          </Badge>
        )}
      </div>
      {kurseFreigegeben() && (
      <FensterKarte
        titel="Übungsaufgaben"
        icon={
          <SymbolRund farbe={farbe}>
            <IconSparkles size={14} />
          </SymbolRund>
        }
      >
        {bankKarte(true)}
      </FensterKarte>
      )}
    </Stack>
  )
  const einordnung = (
    <Stack gap="md">
      {darf ? (
        <TextInput
          label="Bezeichnung"
          description="Nur ändern, wenn das Buch die Form anders nennt."
          value={punkt.text}
          placeholder={pillenInfo(punkt, fach).katalog || 'Bezeichnung'}
          onChange={(e) => onText(e.currentTarget.value)}
          data-grammatikformen-bezeichnung
        />
      ) : (
        <div>
          <Text size="xs" c="dimmed">
            Bezeichnung
          </Text>
          <Text fw={600}>{pillenInfo(punkt, fach).name}</Text>
        </div>
      )}
      <div>
        <Group justify="space-between" mb={6}>
          <Text size="sm" fw={500}>
            Verknüpfte Formen
          </Text>
          {darf && (
            <Button size="compact-xs" variant="light" color={farbe} leftSection={<IconPencil size={12} />} onClick={onFormen} data-grammatikformen-formen>
              Formen ändern
            </Button>
          )}
        </Group>
        <FormPillen punkt={punkt} fach={fach} farbe={farbe} />
      </div>
      <Switch
        label="Wiederholung eines früher eingeführten Themas"
        checked={Boolean(punkt.w)}
        disabled={!darf}
        color={farbe}
        onChange={(e) => onWiederholung(e.currentTarget.checked)}
        data-grammatikformen-wdh
      />
      <Select
        label="Abschnitt"
        data={abschnitte.map((a) => ({ value: a || '(ganz)', label: abschnittName(a) }))}
        value={ort.abschnitt || '(ganz)'}
        disabled={!darf}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true, zIndex: 500 }}
        onChange={(v) => v !== null && onAbschnitt(v === '(ganz)' ? '' : v)}
        data-grammatikformen-abschnitt-wahl
      />
      {darf && anzahl > 1 && (
        <div>
          <Group gap={6} mb={6}>
            <Text size="sm" fw={500}>
              Reihenfolge
            </Text>
            <Text size="xs" c="dimmed">
              Platz {ort.index + 1} von {anzahl} – auch per Ziehen
            </Text>
          </Group>
          <Group gap="xs">
            <Button size="xs" variant="default" leftSection={<IconArrowLeft size={14} />} disabled={ort.index === 0} onClick={() => onVerschieben(-1)}>
              Nach vorn
            </Button>
            <Button
              size="xs"
              variant="default"
              rightSection={<IconArrowRight size={14} />}
              disabled={ort.index === anzahl - 1}
              onClick={() => onVerschieben(1)}
            >
              Nach hinten
            </Button>
          </Group>
        </div>
      )}
    </Stack>
  )
  return (
    <Stack gap="md" data-grammatikformen-popup={voll ? 'experte' : 'standard'}>
      {voll ? (
        <Tabs value={reiter} onChange={setReiter} color={farbe}>
          <Tabs.List mb="md">
            <Tabs.Tab value="ueberblick">Überblick</Tabs.Tab>
            {kurseFreigegeben() && (
              <Tabs.Tab value="aufgaben" data-reiter-aufgaben>
                Übungsaufgaben
              </Tabs.Tab>
            )}
            <Tabs.Tab value="einordnung" data-reiter-einordnung>
              Einordnung
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="ueberblick">{ueberblick}</Tabs.Panel>
          <Tabs.Panel value="aufgaben">{bankKarte(false)}</Tabs.Panel>
          <Tabs.Panel value="einordnung">{einordnung}</Tabs.Panel>
        </Tabs>
      ) : (
        ueberblick
      )}

      {entfernenFrage ? (
        <Alert color="red" p="sm" data-grammatikformen-entfernen-frage>
          <Group justify="space-between" gap="xs">
            <Text size="sm">Diesen Grammatikpunkt aus dem Lehrwerk entfernen?</Text>
            <Group gap="xs">
              <Button size="xs" variant="default" onClick={() => setEntfernenFrage(false)}>
                Abbrechen
              </Button>
              <Button size="xs" color="red" autoFocus onClick={onEntfernen} data-grammatikformen-entfernen-ok>
                Entfernen
              </Button>
            </Group>
          </Group>
        </Alert>
      ) : (
        <Group justify="space-between" className="dialog-fuss">
          {darf ? (
            <Button variant="subtle" color="red" leftSection={<IconTrash size={14} />} onClick={() => setEntfernenFrage(true)} data-grammatikformen-entfernen>
              Entfernen
            </Button>
          ) : (
            <span />
          )}
          <Group gap="xs">
            {!experte && (
              <Button variant="subtle" color="gray" onClick={() => setAlle(!alle)} data-grammatikformen-alle-optionen>
                {alle ? 'Weniger Optionen' : 'Alle Optionen'}
              </Button>
            )}
            <Button onClick={schliessen} color={farbe}>
              Fertig
            </Button>
          </Group>
        </Group>
      )}
    </Stack>
  )
}

/** KI-Vorschläge zum Abhaken, Ändern (Unit, Abschnitt, Bezeichnung) oder Verwerfen */
function VorschlagListe({
  vorschlaege,
  buch,
  onChange,
  onUebernehmen,
  onVerwerfen
}: {
  vorschlaege: Vorschlag[]
  buch: TextbookMeta
  onChange: (v: Vorschlag[]) => void
  onUebernehmen: () => void
  onVerwerfen: () => void
}): React.JSX.Element {
  const setze = (nr: number, patch: Partial<Vorschlag>): void => onChange(vorschlaege.map((v) => (v.nr === nr ? { ...v, ...patch } : v)))
  const zahl = vorschlaege.filter((v) => v.gewaehlt && uebernehmbar(v, buch)).length
  return (
    <Card withBorder data-grammatikformen-vorschlaege>
      <Group justify="space-between" mb="xs">
        <Text fw={600}>Vorschläge der KI – bitte prüfen</Text>
        <Group gap="xs">
          <Button size="xs" variant="default" onClick={onVerwerfen}>
            Alle verwerfen
          </Button>
          <Button size="xs" disabled={!zahl} onClick={onUebernehmen} data-grammatikformen-uebernehmen>
            {zahl} übernehmen
          </Button>
        </Group>
      </Group>
      <Text size="xs" c="dimmed" mb="xs">
        Angehakte Vorschläge kommen zu den vorhandenen dazu – nichts wird ersetzt. Danach noch „Speichern“.
      </Text>
      <Table striped fz="xs" verticalSpacing={4}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th />
            <Table.Th>Unit</Table.Th>
            <Table.Th>Abschnitt</Table.Th>
            <Table.Th>Grammatik</Table.Th>
            <Table.Th>Fundstelle</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {vorschlaege.map((v) => {
            const unitDa = buch.units.find((u) => u.name === v.unit)
            const ok = uebernehmbar(v, buch)
            return (
              <Table.Tr key={v.nr} data-vorschlag-status={v.status}>
                <Table.Td>
                  <Checkbox
                    size="xs"
                    checked={v.gewaehlt && ok}
                    disabled={!ok}
                    aria-label="Übernehmen"
                    onChange={(e) => setze(v.nr, { gewaehlt: e.currentTarget.checked })}
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    size="xs"
                    w={130}
                    data={buch.units.map((u) => u.name)}
                    value={unitDa ? v.unit : null}
                    placeholder={v.unit || 'Unit wählen'}
                    error={!unitDa}
                    onChange={(u) => u && setze(v.nr, { unit: u, abschnitt: '' })}
                    allowDeselect={false}
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    size="xs"
                    w={140}
                    data={[{ value: '(ganz)', label: 'Ganzes Kapitel' }, ...(unitDa?.sections.map((s) => ({ value: s.name, label: s.name })) ?? [])]}
                    value={unitDa && (v.abschnitt === '' || unitDa.sections.some((s) => s.name === v.abschnitt)) ? v.abschnitt || '(ganz)' : null}
                    placeholder={v.abschnitt || 'Abschnitt'}
                    onChange={(a) => a && setze(v.nr, { abschnitt: a === '(ganz)' ? '' : a })}
                    allowDeselect={false}
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput size="xs" value={v.text} onChange={(e) => setze(v.nr, { text: e.currentTarget.value })} aria-label="Bezeichnung" />
                  <Group gap={4} mt={4}>
                    {v.t.map((k) => (
                      <Badge key={k} size="xs" variant="light" tt="none" title={k}>
                        {kennungLabel(k)}
                      </Badge>
                    ))}
                    {v.status === 'vorhanden' && (
                      <Badge size="xs" color="gray">
                        schon vorhanden
                      </Badge>
                    )}
                    {!v.t.length && (
                      <Badge size="xs" color="orange" tt="none">
                        keine Katalogform erkannt
                      </Badge>
                    )}
                    {v.verworfen.length > 0 && (
                      <Text size="xs" c="dimmed">
                        unbekannt: {v.verworfen.join(', ')}
                      </Text>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>{v.fundstelle}</Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
    </Card>
  )
}
