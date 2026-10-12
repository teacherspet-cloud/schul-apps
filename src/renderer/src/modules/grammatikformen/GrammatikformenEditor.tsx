import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  Drawer,
  Group,
  Menu,
  Modal,
  Paper,
  Progress,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Table,
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
  IconDeviceFloppy,
  IconDots,
  IconGripVertical,
  IconPencil,
  IconPlus,
  IconRepeat,
  IconSparkles,
  IconTrash
} from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import type { TextbookMeta } from '@shared/types'
import { fachDerSprache } from '@shared/fachobleute'
import { fachVon } from '@shared/faecher'
import { notifyError, notifySuccess } from '../../shared/util'
import DropZone from '../../shared/components/DropZone'
import { BandCover } from '../../shared/components/BandCover'
import { useProgrammFarbe } from '../../shared/components/AppKopf'
import { extractContent, MATERIAL_ACCEPT } from '../../shared/files/extractContent'
import { pruefeHochladen } from '../../shared/datenschutz'
import { darfLehrwerkBearbeiten } from '../../shared/fachobleute'
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
  type Vorschlag
} from './grammatikformen'

const kopie = (b: LehrwerkGrammatikBand): LehrwerkGrammatikBand => JSON.parse(JSON.stringify(b ?? {})) as LehrwerkGrammatikBand
const abschnittName = (s: string): string => s || 'Ganzes Kapitel'
const wahlVon = (t: string[]): GrammatikWahl => ({ themen: t.filter((k) => !k.includes('/')), teilformen: t.filter((k) => k.includes('/')) })

/** Was der Auswahl-Dialog gerade bearbeitet: neuer Punkt in einem Abschnitt oder die Formen eines Punkts */
type Auswahl = { unit: string; abschnitt: string; index?: number; wahl: GrammatikWahl }
/** Ort eines Punkts (Seitenfenster, Ziehen) */
type Ort = { unit: string; abschnitt: string; index: number }

/**
 * Grammatik eines Lehrwerk-Bands bearbeiten (12.10.2026, App „Grammatikformen"; Neugestaltung „Navigator links" am selben Tag).
 *
 * Links die Units als schmale Leiste (Handy: Chips oben), rechts die Abschnitte der gewählten Unit als Zeitstrahl, je
 * Abschnitt die Grammatikpunkte als Pillen (Bezeichnung + ✓/⚠/↻ – keine Textfelder in der Liste). Ein Klick auf eine Pille
 * öffnet das Seitenfenster (Bezeichnung, Formen, Wiederholung, Abschnitt, Reihenfolge, Entfernen). Umsortieren per Ziehen
 * innerhalb eines Abschnitts. „Form hinzufügen" nutzt dieselbe Themen-/Teilformen-Auswahl wie Arbeitsblatt und
 * Grammatiktraining (GrammatikAuswahl). KI-Vorschläge aus Schulbuchseiten (Fenster „Aus Buchseiten ergänzen") erscheinen
 * als Liste zum Abhaken – übernommen wird nur Angehaktes, und nur DAZU. Gespeichert wird erst mit „Speichern" in der
 * Leiste unten (gemeinsame Daten der Schule – kein stilles Sichern nebenbei).
 */
export default function GrammatikformenEditor({
  buch,
  alle,
  eintrag,
  onBack,
  onGespeichert
}: {
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
  const farbe = useProgrammFarbe()
  const schmal = useMediaQuery('(max-width: 700px)') ?? false
  const ausgangsBand = (): LehrwerkGrammatikBand => kopie(eintrag?.kapitel ?? LEHRWERK_GRAMMATIK[buch.name] ?? {})
  const [band, setBand] = useState<LehrwerkGrammatikBand>(ausgangsBand)
  const [dirty, setDirty] = useState(false)
  const [speichert, setSpeichert] = useState(false)
  const [zurueckFrage, setZurueckFrage] = useState(false)
  const [verwerfenFrage, setVerwerfenFrage] = useState(false)
  const unitNamen = useMemo(() => [...buch.units.map((u) => u.name), ...Object.keys(band).filter((k) => !buch.units.some((u) => u.name === k))], [buch, band])
  const [unit, setUnit] = useState<string>(() => unitNamen.find((u) => band[u]) ?? unitNamen[0] ?? '')
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null)
  const [offen, setOffen] = useState<Ort | null>(null)
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

  const unitAbschnitte = abschnitteDer(buch, unit, band[unit])
  const zahlIn = (u: string): number => Object.values(band[u] ?? {}).reduce((m, l) => m + l.length, 0)
  /** Anteil der Abschnitte einer Unit mit Grammatik (Füllbalken in der Unit-Leiste) */
  const anteilIn = (u: string): number => {
    const ab = abschnitteDer(buch, u, band[u])
    return ab.length ? (ab.filter((a) => band[u]?.[a]?.length).length / ab.length) * 100 : 0
  }
  const offenPunkt = offen ? punkteVon(offen.unit, offen.abschnitt)[offen.index] : undefined
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
        {darf && (
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
        {darf && (
          <ActionIcon variant="light" color={farbe} size="lg" hiddenFrom="xs" aria-label="Aus Buchseiten ergänzen" onClick={() => setKiOffen(true)}>
            <IconSparkles size={18} />
          </ActionIcon>
        )}
        <Button
          variant="default"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => (dirty ? setZurueckFrage(true) : onBack())}
          data-grammatikformen-zurueck
        >
          Zurück
        </Button>
        {darf && eintrag && (
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

  const unitLeiste = schmal ? (
    <ScrollArea type="never" offsetScrollbars={false}>
      <Chip.Group value={unit} onChange={(v) => typeof v === 'string' && setUnit(v)}>
        <Group gap={6} wrap="nowrap" pb={4}>
          {unitNamen.map((u) => {
            const n = zahlIn(u)
            return (
              <Chip key={u} value={u} size="sm" color={farbe} variant="light" data-grammatikformen-unit={u}>
                {u}
                {n ? ` · ${n}` : ''}
              </Chip>
            )
          })}
        </Group>
      </Chip.Group>
    </ScrollArea>
  ) : (
    <Stack gap={2} w={210} style={{ flexShrink: 0, position: 'sticky', top: 8, alignSelf: 'flex-start' }} data-grammatikformen-unitleiste>
      <Text size="xs" c="dimmed" fw={600} tt="uppercase" px="xs" mb={4} style={{ letterSpacing: 0.4 }}>
        Units
      </Text>
      {unitNamen.map((u) => {
        const n = zahlIn(u)
        const aktiv = u === unit
        return (
          <UnstyledButton
            key={u}
            onClick={() => setUnit(u)}
            aria-current={aktiv || undefined}
            data-grammatikformen-unit={u}
            style={{
              padding: '7px 10px',
              borderRadius: 'var(--mantine-radius-md)',
              borderLeft: `3px solid ${aktiv ? `var(--mantine-color-${farbe}-filled)` : 'transparent'}`,
              background: aktiv ? `var(--mantine-color-${farbe}-light)` : undefined,
              color: aktiv ? `var(--mantine-color-${farbe}-light-color)` : undefined
            }}
          >
            <Group justify="space-between" wrap="nowrap" gap={6}>
              <Text size="sm" fw={aktiv ? 600 : 500} truncate>
                {u}
              </Text>
              <Text size="xs" c={aktiv ? undefined : 'dimmed'}>
                {n || '–'}
              </Text>
            </Group>
            <Progress value={anteilIn(u)} size={3} mt={5} color={farbe} radius="xl" aria-label="Abschnitte mit Grammatik" />
          </UnstyledButton>
        )
      })}
    </Stack>
  )

  const zeitstrahl = (
    <Stack gap={0} style={{ flex: 1, minWidth: 0 }} data-grammatikformen-zeitstrahl>
      <Title order={4} mb="sm">
        {unit}
      </Title>
      {unitAbschnitte.map((a, ai) => {
        const punkte = punkteVon(unit, a)
        if (!punkte.length && !darf) return null
        const letzter = ai === unitAbschnitte.length - 1
        return (
          <div
            key={a || '(ganz)'}
            style={{ position: 'relative', paddingLeft: 26, paddingBottom: letzter ? 4 : 22 }}
            data-grammatikformen-abschnitt={a || 'ganz'}
          >
            {!letzter && (
              <span aria-hidden style={{ position: 'absolute', left: 6, top: 18, bottom: 0, width: 2, background: 'var(--mantine-color-default-border)' }} />
            )}
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: 0,
                top: 4,
                width: 14,
                height: 14,
                borderRadius: '50%',
                border: `2px solid ${punkte.length ? `var(--mantine-color-${farbe}-filled)` : 'var(--mantine-color-default-border)'}`,
                background: punkte.length ? `var(--mantine-color-${farbe}-filled)` : 'var(--mantine-color-body)'
              }}
            />
            <Text fw={600} size="sm" c={punkte.length ? undefined : 'dimmed'} mb={6}>
              {abschnittName(a)}
            </Text>
            <Group gap={6} wrap="wrap">
              {punkte.map((p, i) => (
                <Pille
                  key={i}
                  punkt={p}
                  fach={fach}
                  farbe={farbe}
                  ziehbar={darf && punkte.length > 1}
                  markiert={Boolean(ziehen && ziehen.unit === unit && ziehen.abschnitt === a && ueber === i && ziehen.index !== i)}
                  gezogen={Boolean(ziehen && ziehen.unit === unit && ziehen.abschnitt === a && ziehen.index === i)}
                  onClick={() => {
                    setEntfernenFrage(false)
                    setOffen({ unit, abschnitt: a, index: i })
                  }}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', String(i))
                    setZiehen({ unit, abschnitt: a, index: i })
                  }}
                  onDragOver={(e) => {
                    if (!ziehen || ziehen.unit !== unit || ziehen.abschnitt !== a) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (ueber !== i) setUeber(i)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (ziehen && ziehen.unit === unit && ziehen.abschnitt === a) setzePunkte(unit, a, verschiebeNach(punkte, ziehen.index, i))
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
                <Text size="xs" c="dimmed">
                  keine Grammatik
                </Text>
              )}
            </Group>
            {darf && (
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                mt={6}
                leftSection={<IconPlus size={12} />}
                onClick={() => setAuswahl({ unit, abschnitt: a, wahl: { themen: [], teilformen: [] } })}
                data-grammatikformen-hinzufuegen
              >
                Grammatik hinzufügen
              </Button>
            )}
          </div>
        )
      })}
      {!darf && !unitAbschnitte.some((a) => punkteVon(unit, a).length) && (
        <Text size="sm" c="dimmed">
          Für diese Unit ist keine Grammatik hinterlegt.
        </Text>
      )}
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

      {schmal ? (
        <Stack gap="md">
          {unitLeiste}
          {zeitstrahl}
        </Stack>
      ) : (
        <Group align="flex-start" gap="xl" wrap="nowrap">
          {unitLeiste}
          {zeitstrahl}
        </Group>
      )}

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

      <Drawer
        opened={Boolean(offen && offenPunkt)}
        onClose={() => setOffen(null)}
        position="right"
        size={schmal ? '100%' : 'md'}
        title={offen ? `${offen.unit} · ${abschnittName(offen.abschnitt)}` : ''}
        data-grammatikformen-drawer
      >
        {offen && offenPunkt && (
          <PunktFenster
            punkt={offenPunkt}
            ort={offen}
            anzahl={offenListe.length}
            darf={darf}
            fach={fach}
            farbe={farbe}
            abschnitte={unitAbschnitte}
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
      </Drawer>

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
    info.abweichend ? `Katalog: ${info.katalog}` : '',
    info.status === 'fehlt' ? 'Keine Katalogform verknüpft' : '',
    info.status === 'ungueltig' ? `Unbekannte Katalogform: ${info.ungueltig.join(', ')}` : '',
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
        border: `1px solid ${markiert ? `var(--mantine-color-${farbe}-filled)` : 'var(--mantine-color-default-border)'}`,
        boxShadow: markiert ? `-3px 0 0 var(--mantine-color-${farbe}-filled)` : undefined,
        background: 'var(--mantine-color-default)',
        opacity: gezogen ? 0.45 : 1,
        cursor: ziehbar ? 'grab' : 'pointer',
        fontSize: 'var(--mantine-font-size-sm)',
        lineHeight: 1.3
      }}
    >
      {info.status === 'ok' ? (
        <IconCheck size={13} style={{ flexShrink: 0, color: `var(--mantine-color-${farbe}-filled)` }} aria-label="mit Katalogform verknüpft" />
      ) : (
        <IconAlertTriangle size={13} style={{ flexShrink: 0, color: 'var(--mantine-color-orange-filled)' }} aria-label="ohne gültige Katalogform" />
      )}
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

/** Inhalt des Seitenfensters zu einem Punkt (ohne Bearbeitungsrecht nur Ansicht) */
function PunktFenster({
  punkt,
  ort,
  anzahl,
  darf,
  fach,
  farbe,
  abschnitte,
  entfernenFrage,
  setEntfernenFrage,
  onText,
  onWiederholung,
  onFormen,
  onAbschnitt,
  onVerschieben,
  onEntfernen
}: {
  punkt: LehrwerkGrammatikPunkt
  ort: Ort
  anzahl: number
  darf: boolean
  fach: string
  farbe: string
  abschnitte: string[]
  entfernenFrage: boolean
  setEntfernenFrage: (b: boolean) => void
  onText: (t: string) => void
  onWiederholung: (w: boolean) => void
  onFormen: () => void
  onAbschnitt: (a: string) => void
  onVerschieben: (r: -1 | 1) => void
  onEntfernen: () => void
}): React.JSX.Element {
  const info = pillenInfo(punkt, fach)
  return (
    <Stack gap="lg">
      {darf ? (
        <TextInput
          label="Bezeichnung"
          description="Nur ändern, wenn das Buch die Form anders nennt."
          value={punkt.text}
          placeholder={info.katalog || 'Bezeichnung'}
          onChange={(e) => onText(e.currentTarget.value)}
          data-grammatikformen-bezeichnung
        />
      ) : (
        <div>
          <Text size="xs" c="dimmed">
            Bezeichnung
          </Text>
          <Text fw={600}>{info.name}</Text>
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
        <Stack gap={4}>
          {punkt.t.map((k) => {
            const ok = kennungGueltig(k, fach)
            return (
              <Group key={k} gap={6} wrap="nowrap" title={k}>
                {ok ? (
                  <IconCheck size={14} style={{ flexShrink: 0, color: `var(--mantine-color-${farbe}-filled)` }} />
                ) : (
                  <IconAlertTriangle size={14} style={{ flexShrink: 0, color: 'var(--mantine-color-orange-filled)' }} />
                )}
                <Text size="sm">{ok ? kennungLabel(k) : `${k} (nicht im Katalog)`}</Text>
              </Group>
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
        </Stack>
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
        comboboxProps={{ withinPortal: true, zIndex: 400 }}
        onChange={(v) => v !== null && onAbschnitt(v === '(ganz)' ? '' : v)}
        data-grammatikformen-abschnitt-wahl
      />

      {darf && anzahl > 1 && (
        <div>
          <Group gap={6} mb={6}>
            <IconGripVertical size={14} style={{ color: 'var(--mantine-color-dimmed)' }} />
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

      {darf &&
        (entfernenFrage ? (
          <Alert color="red" p="xs">
            <Text size="sm" mb="xs">
              Diesen Grammatikpunkt entfernen?
            </Text>
            <Group gap="xs">
              <Button size="xs" variant="default" onClick={() => setEntfernenFrage(false)}>
                Abbrechen
              </Button>
              <Button size="xs" color="red" autoFocus onClick={onEntfernen} data-grammatikformen-entfernen-ok>
                Entfernen
              </Button>
            </Group>
          </Alert>
        ) : (
          <Button
            variant="subtle"
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={() => setEntfernenFrage(true)}
            style={{ alignSelf: 'flex-start' }}
            data-grammatikformen-entfernen
          >
            Entfernen
          </Button>
        ))}
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
