/**
 * Die Kursseite (09.10.2026, abgestimmt mit der Lehrkraft: „Kopf + Reiter") – EINE Seite für Sprachenlernen und
 * „Meine Klassen":
 *
 *  - Kopf: Kursname (Klasse + Sprache), „x % sicher", „aktiv diese Woche n/m", nächster Test, Handlungsbedarf (Klick →
 *    Überblick). Eingebettet in „Meine Klassen" entfällt der Kopf – dort zeigt die Fachansicht Klasse, Fach und Zahlen.
 *  - Reiter: Überblick · Vokabeln · Grammatik · Lernende · Einstellungen (⚙).
 *      Überblick: Lernstand als Säulen je Stufe, Units mit Balken (neueste offen), Handlungsbedarf des Kurses, Demnächst.
 *      Vokabeln: Abschnitte (Übersicht wie in „Meine Klassen"), hinzufügen/entfernen/wiederherstellen, Problemwörter.
 *      Grammatik: die Grammatik-Tabelle (KursGrammatik) mit „+ Aufgaben" / „Bearbeiten".
 *      Lernende: Tabelle, Details, Codes und Codezettel, Lernende eintragen.
 *      Einstellungen: Lernzeitraum, Testtermin, Wörter pro Tag, Spiele; Feineinstellungen im Expertenmodus.
 *  - Standardmodus: ohne Lehrwerk-Pfade, Fehlerquoten und Zählfeinheiten; der Expertenmodus zeigt alles.
 *  - Eingebettet (`nurReiter`): nur der Inhalt dieses Reiters – plus die Lernenden-Tabelle des Bereichs (Vokabeln bzw.
 *    Grammatik), damit „Meine Klassen" ohne Wechsel in Sprachenlernen auskommt.
 */
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Collapse,
  Group,
  Loader,
  Modal,
  NumberInput,
  Progress,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBook2,
  IconBooks,
  IconCalendarEvent,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconEye,
  IconEyeOff,
  IconLayoutDashboard,
  IconPlus,
  IconPrinter,
  IconQrcode,
  IconSchool,
  IconSettings,
  IconTrash,
  IconUserPlus,
  IconUsers,
  IconX
} from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { nachBaenden, type AbschnittStatistik } from '@shared/kursAbschnitte'
import { BandGruppe } from '../../../shared/components/BandCover'
import { empfehlung } from '@shared/grammatikBereiche'
import { useRueckweg } from '../../../shared/navigation'
import { useExperte } from '../../../shared/settingsStore'
import { notifyError, notifySuccess } from '../../../shared/util'
import { AlleOptionen, NurExperte, OptionenBereich } from '../../../shared/components/NurExperte'
import { KennzahlenKopf, type Kennzahl } from '../../../shared/components/KennzahlenKopf'
import { GeplantMarke } from '../../../shared/components/FreigabePlanen'
import { holen, senden } from '../../onlinetest/serverApi'
import { Zugang } from '../../onlinetest/OnlinetestModule'
import { Freigeben as GrammatikFreigeben, useEntwuerfe } from '../GrammatikTraining'
import { LernendeEintragen, ZettelDruck, type Zettel } from '../LernendeEintragen'
import { KlasseZuordnen } from '../KlasseZuordnen'
import { VokabelAbschnitte as AbschnittUebersicht } from '../../meineklassen/VokabelAbschnitte'
import { AlsSchuelerAnsehen } from '../../meineklassen/SchuelerVorschau'
import { KursGrammatik } from './KursGrammatik'
import { KastenKopf, useGemerkt } from './Kasten'
import { AbschnitteVerwalten, type AbschnittFrage } from './AbschnitteVerwalten'
import { grammatikVorgabe, Hinzufuegen } from './KursHinzufuegen'
import { LernendeTabelle, regelnVon } from './KursLernende'
import { LernstandSymbol, StufenDiagramm } from './LernstandVerlauf'
import KalenderHinweis from '../../../shared/components/KalenderHinweis'
import { alsFeld, ausFeld, type KursReiter, type Lernende, type Lernstanddaten } from './kursDaten'
import { entwurfHinweis, geplanteAbschnitte, HINWEIS_FARBE, kursHinweise, kursKennzahlen, type KursBedarf, type KursHinweis } from './kursHinweise'
import { zumHinweis } from './kursFokus'

const prozent = (x: number | null | undefined): string => (x == null ? '–' : `${Math.round(x * 100)} %`)
const kurzTag = (ms: number): string => new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })

/** Eintrag des Handlungsbedarfs einer Klasse, wie ihn GET /server/klassen/<id> liefert (ohne Merkmal) */
type KlassenEintrag = Omit<KursBedarf, 'merkmal'>

interface KlassenDetail {
  statistik: { abschnitte: AbschnittStatistik[]; namen: string[] } | null
  /** null = lädt noch; 'fehler' = Lerngruppe nicht erreichbar (dann rechnet die Kursseite selbst) */
  bedarf: { sichtbar: KlassenEintrag[]; ausgeblendet: KlassenEintrag[] } | null | 'fehler'
}

/**
 * Lerngruppe des Kurses aus „Meine Klassen" (GET /server/klassen/<id>): Abschnitts-Übersicht und – seit 09.10.2026 –
 * der Handlungsbedarf dieses Kurses, genau wie „Meine Klassen" ihn zeigt (eine Quelle, Ausgeblendetes inklusive).
 */
function useKlassenDetail(kursId: string, lerngruppeId: string | undefined, noetig: boolean, stand: number): KlassenDetail {
  const [geladen, setGeladen] = useState<KlassenDetail>({ statistik: null, bedarf: null })
  useEffect(() => {
    if (!noetig || !lerngruppeId) return
    let aus = false
    void holen<{
      vokabeln: { id: string; abschnitte?: AbschnittStatistik[]; lernendeNamen?: string[] }[]
      bedarf: Partial<KlassenEintrag>[]
      bedarfAusgeblendet?: Partial<KlassenEintrag>[]
    }>(`/server/klassen/${encodeURIComponent(lerngruppeId)}`)
      .then((r) => {
        if (aus) return
        const v = r.vokabeln.find((x) => x.id === kursId)
        const meine = (l: Partial<KlassenEintrag>[] | undefined): KlassenEintrag[] => (l ?? []).filter((b): b is KlassenEintrag => b.kurs === kursId)
        setGeladen({
          statistik: v?.abschnitte ? { abschnitte: v.abschnitte, namen: v.lernendeNamen ?? [] } : null,
          bedarf: { sichtbar: meine(r.bedarf), ausgeblendet: meine(r.bedarfAusgeblendet) }
        })
      })
      .catch(() => {
        if (!aus) setGeladen({ statistik: null, bedarf: 'fehler' })
      })
    return () => {
      aus = true
    }
  }, [kursId, lerngruppeId, noetig, stand])
  return geladen
}

/** Ein Eintrag der Liste: Hinweis (eigene Rechnung, Entwürfe) oder Eintrag der Klasse (mit Ausblenden) */
interface HinweisZeile {
  text: string
  art: KursHinweis['art']
  reiter: KursReiter
  ids?: string[]
  /** Nur Einträge der Klasse lassen sich ausblenden */
  schluessel?: string
}

/** Kurs-Hinweis bzw. Eintrag der Klasse → Zeile der Liste */
const alsZeile = (h: KursHinweis | KlassenEintrag): HinweisZeile =>
  'hinweis' in h
    ? { text: h.text, art: h.hinweis, reiter: h.reiter, ids: h.ids, schluessel: h.schluessel }
    : { text: h.text, art: h.art, reiter: h.reiter, ids: h.ids }

/** Hinweise des Kurses als Liste – Klick führt in den passenden Reiter (Grammatik → „Grammatik") */
function HinweisListe({
  hinweise,
  gehe,
  ausblenden,
  ausgeblendet = [],
  laedt = false
}: {
  hinweise: HinweisZeile[]
  gehe: (h: HinweisZeile) => void
  ausblenden?: (h: HinweisZeile, wieder: boolean) => void
  ausgeblendet?: HinweisZeile[]
  laedt?: boolean
}): React.JSX.Element {
  const [zeigeAus, setZeigeAus] = useState(false)
  const zeile = (h: HinweisZeile, aus: boolean): React.JSX.Element => (
    <Group key={h.schluessel ?? h.art} gap={6} wrap="nowrap" align="center" data-kurs-bedarf-zeile={h.schluessel ?? h.art}>
      {ausblenden && h.schluessel && (
        <Tooltip label={aus ? 'Wieder einblenden' : 'Ausblenden – kommt wieder, sobald sich etwas ändert (auch in „Meine Klassen“)'} withinPortal>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={() => ausblenden(h, aus)}
            aria-label={aus ? 'Wieder einblenden' : 'Ausblenden'}
            data-kurs-bedarf-ausblenden={aus ? undefined : true}
            data-kurs-bedarf-einblenden={aus ? true : undefined}
          >
            {aus ? <IconEye size={16} /> : <IconEyeOff size={16} />}
          </ActionIcon>
        </Tooltip>
      )}
      <UnstyledButton
        onClick={() => gehe(h)}
        className="klassen-bedarf"
        data-kurs-hinweis={h.art}
        data-ziel-reiter={h.reiter}
        style={{ flex: 1, opacity: aus ? 0.7 : 1 }}
      >
        <Group gap="xs" wrap="nowrap">
          <ThemeIcon size="sm" variant="light" color={HINWEIS_FARBE[h.art]}>
            <IconAlertTriangle size={14} />
          </ThemeIcon>
          <Text size="sm" style={{ flex: 1 }}>
            {h.text}
          </Text>
          <IconChevronRight size={14} />
        </Group>
      </UnstyledButton>
    </Group>
  )
  return (
    <Stack gap={4}>
      {laedt ? (
        <Loader size="xs" />
      ) : !hinweise.length ? (
        <Text size="sm" c="dimmed" data-kurs-bedarf-leer>
          {ausgeblendet.length ? 'Nichts weiter – der übrige Handlungsbedarf ist ausgeblendet.' : 'Nichts Dringendes – alle üben, kein Test steht kurz bevor.'}
        </Text>
      ) : (
        hinweise.map((h) => zeile(h, false))
      )}
      {ausgeblendet.length > 0 && (
        <div data-kurs-bedarf-ausgeblendet={ausgeblendet.length}>
          <UnstyledButton onClick={() => setZeigeAus((o) => !o)} aria-expanded={zeigeAus} data-kurs-bedarf-ausgeblendet-knopf>
            <Group gap={4}>
              {zeigeAus ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              <Text size="xs" c="dimmed">
                Ausgeblendet ({ausgeblendet.length})
              </Text>
            </Group>
          </UnstyledButton>
          <Collapse expanded={zeigeAus}>
            <Stack gap={4} mt={4}>
              {ausgeblendet.map((h) => zeile(h, true))}
            </Stack>
          </Collapse>
        </div>
      )}
    </Stack>
  )
}

/**
 * Units kompakt: je Band (neuester oben, mit Cover – 09.10.2026), darin die Units; die neueste Unit des neuesten Bands
 * offen (Abschnitte mit Balken), ältere zugeklappt mit „% sicher". Auch in „Meine Klassen" (Lernstand der Klasse).
 */
export function UnitsKompakt({ abschnitte }: { abschnitte: AbschnittStatistik[] }): React.JSX.Element {
  const baende = useMemo(() => nachBaenden(abschnitte.filter((a) => a.zeit <= Date.now())), [abschnitte])
  const [umgeschaltet, setUmgeschaltet] = useState<Set<string>>(new Set())
  if (!baende.length)
    return (
      <Text size="sm" c="dimmed">
        Noch kein Abschnitt freigeschaltet.
      </Text>
    )
  const balken = (s: number, a: number, n: number, breite?: number): React.JSX.Element => (
    <Tooltip label={`sicher ${prozent(s)} · im Aufbau ${prozent(a)} · neu ${prozent(n)}`}>
      <Progress.Root size="md" radius="xl" w={breite} style={{ flex: breite ? undefined : 1, gap: 2 }}>
        <Progress.Section value={s * 100} color="teal" />
        <Progress.Section value={a * 100} color="yellow" />
        <Progress.Section value={n * 100} color="gray.4" />
      </Progress.Root>
    </Tooltip>
  )
  const schluessel = (buch: string, unit: string): string => `${buch}|${unit}`
  const erste = schluessel(baende[0].buch, baende[0].units[0]?.unit ?? '')
  const mittel = (zeilen: AbschnittStatistik[], k: 'sicher' | 'aufbau' | 'neu'): number => {
    const woerter = zeilen.reduce((s, z) => s + z.woerter, 0) || 1
    return zeilen.reduce((s, z) => s + z[k] * z.woerter, 0) / woerter
  }
  return (
    <Stack gap={8} data-kurs-units>
      {baende.map((b) => (
        <BandGruppe
          key={b.buch || 'ohne'}
          buch={b.buch}
          ohneBand="Weitere Vokabeln"
          zusatz={`${prozent(mittel(b.units.flatMap((u) => u.zeilen), 'sicher'))} sicher`}
        >
          <Stack gap={4}>
            {b.units.map((g) => {
              const k = schluessel(b.buch, g.unit)
              const auf = (k === erste) !== umgeschaltet.has(k)
              return (
                <div key={k} data-kurs-unit={g.unit || 'Weitere Vokabeln'} data-offen={auf || undefined}>
                  <UnstyledButton
                    w="100%"
                    aria-expanded={auf}
                    onClick={() =>
                      setUmgeschaltet((s) => {
                        const n = new Set(s)
                        if (n.has(k)) n.delete(k)
                        else n.add(k)
                        return n
                      })
                    }
                  >
                    <Group gap="xs" wrap="nowrap">
                      {auf ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                      <Text size="sm" fw={600} w={120} truncate style={{ flexShrink: 0 }}>
                        {g.unit || 'Weitere Vokabeln'}
                      </Text>
                      {balken(mittel(g.zeilen, 'sicher'), mittel(g.zeilen, 'aufbau'), mittel(g.zeilen, 'neu'))}
                      <Text size="xs" c="dimmed" w={70} ta="right" style={{ flexShrink: 0 }}>
                        {prozent(mittel(g.zeilen, 'sicher'))} sicher
                      </Text>
                    </Group>
                  </UnstyledButton>
                  <Collapse expanded={auf}>
                    <Stack gap={3} mt={4} pl={22}>
                      {g.zeilen.map((a) => (
                        <Group key={a.index} gap="xs" wrap="nowrap">
                          <Text size="xs" w={98} truncate style={{ flexShrink: 0 }}>
                            {a.name}
                          </Text>
                          {balken(a.sicher, a.aufbau, a.neu)}
                          <Text size="xs" c="dimmed" w={70} ta="right" style={{ flexShrink: 0 }}>
                            {prozent(a.sicher)}
                          </Text>
                        </Group>
                      ))}
                    </Stack>
                  </Collapse>
                </div>
              )
            })}
          </Stack>
        </BandGruppe>
      ))}
      <Group gap="md" mt={2}>
        {[
          ['teal', 'sicher'],
          ['yellow', 'im Aufbau'],
          ['gray.4', 'neu']
        ].map(([f, t]) => (
          <Group key={t} gap={4} wrap="nowrap">
            <div style={{ width: 10, height: 10, borderRadius: 3, background: `var(--mantine-color-${f.replace('.', '-')}${f.includes('.') ? '' : '-6'})` }} />
            <Text size="xs" c="dimmed">
              {t}
            </Text>
          </Group>
        ))}
      </Group>
    </Stack>
  )
}

/** Kurzzeile der Abschnitte im zugeklappten Kopf (09.10.2026): Umfang, Stand, neuester Abschnitt */
export function abschnitteKurz(abschnitte: AbschnittStatistik[]): string {
  const frei = abschnitte.filter((a) => a.zeit <= Date.now())
  const woerter = frei.reduce((s, a) => s + a.woerter, 0)
  const sicher = woerter ? frei.reduce((s, a) => s + a.sicher * a.woerter, 0) / woerter : 0
  const neuester = [...frei].sort((a, b) => b.zeit - a.zeit)[0]
  const baende = new Set(frei.map((a) => a.buch ?? '').filter(Boolean))
  return [
    `${frei.length} ${frei.length === 1 ? 'Abschnitt' : 'Abschnitte'}${baende.size > 1 ? ` aus ${baende.size} Bänden` : ''}`,
    `${woerter} Wörter`,
    `${prozent(sicher)} sicher`,
    neuester ? `zuletzt: ${[neuester.buch, neuester.unit, neuester.name].filter(Boolean).join(' · ')}` : ''
  ]
    .filter(Boolean)
    .join(' · ')
}

export interface KursSeiteProps {
  kursId: string
  /** In „Meine Klassen": ohne eigenen Kopf, ohne Zurück */
  eingebettet?: boolean
  /** Eingebettet: nur dieser Bereich (ohne Reiterleiste) */
  nurReiter?: 'vokabeln' | 'grammatik'
  onZurueck?: () => void
  startReiter?: KursReiter
  grammatikOffen?: string | null
  setGrammatikOffen?: (id: string | null) => void
  /** Abschnitts-Statistik, falls schon geladen („Meine Klassen") */
  abschnitte?: { abschnitte: AbschnittStatistik[]; namen: string[] }
  /** Nach Änderungen (z. B. „Meine Klassen" neu laden) */
  geaendert?: () => void
  /** Eingebettet: Fenster „Kurseinstellungen" (der Knopf steht in der Kopfzeile des Einbettenden) */
  einstellungenOffen?: boolean
  einstellungenSchliessen?: () => void
}

export function KursSeite({
  kursId: id,
  eingebettet = false,
  nurReiter,
  onZurueck = () => undefined,
  startReiter,
  grammatikOffen: grammatikOffenAussen,
  setGrammatikOffen: setGrammatikOffenAussen,
  abschnitte: abschnitteVorgabe,
  geaendert,
  einstellungenOffen = false,
  einstellungenSchliessen = () => undefined
}: KursSeiteProps): React.JSX.Element {
  const experte = useExperte()
  const rueck = useRueckweg('sprachenlernen', onZurueck, 'Alle Kurse')
  const [reiter, setReiter] = useState<KursReiter>(nurReiter ?? startReiter ?? (grammatikOffenAussen ? 'grammatik' : 'ueberblick'))
  const [grammatikOffenInnen, setGrammatikOffenInnen] = useState<string | null>(null)
  const grammatikOffen = setGrammatikOffenAussen ? grammatikOffenAussen ?? null : grammatikOffenInnen
  const setGrammatikOffen = setGrammatikOffenAussen ?? setGrammatikOffenInnen
  const [grammatikStand, setGrammatikStand] = useState(0)
  const [stand, setStand] = useState(0)
  const [d, setD] = useState<Lernstanddaten | null>(null)
  const [qr, setQr] = useState(false)
  const [loeschen, setLoeschen] = useState(false)
  const [entfernen, setEntfernen] = useState<Lernende | null>(null)
  const [gast, setGast] = useState<Lernende | null>(null)
  const [hinzu, setHinzu] = useState(false)
  const [eintragen, setEintragen] = useState(false)
  const [klasse, setKlasse] = useState(false)
  const [grammatik, setGrammatik] = useState(false)
  const [zettelDruck, setZettelDruck] = useState<Zettel[] | null>(null)
  const laden = useCallback(
    () =>
      void holen<Lernstanddaten>(`/server/vokabeln/${id}`).then(
        (x) => (setD(x), setStand((n) => n + 1)),
        (e: unknown) => notifyError(e)
      ),
    [id]
  )
  useEffect(laden, [laden])
  const neuLaden = (): void => (laden(), geaendert?.())
  const [bedarfStand, setBedarfStand] = useState(0)
  const vorgabe = abschnitteVorgabe ?? (d?.abschnitte ? { abschnitte: d.abschnitte, namen: d.lernendeNamen ?? [] } : undefined)
  // Lerngruppe laden: für die Abschnitts-Übersicht (falls nicht mitgegeben) und den Handlungsbedarf im Überblick
  const klassenDetail = useKlassenDetail(id, d?.lerngruppeId || undefined, !vorgabe || !(eingebettet && nurReiter), stand + bedarfStand)
  const statistik = vorgabe ?? klassenDetail.statistik
  // Zuklappbar (09.10.2026, Wunsch der Lehrkraft): in „Meine Klassen" zu Beginn zu, in Sprachenlernen offen
  const [abschnitteOffen, setAbschnitteOffen] = useGemerkt(eingebettet ? 'mk-abschnitte-offen' : 'kurs-abschnitte-offen', !eingebettet)
  const entwuerfe = useEntwuerfe().filter((e) => e.empfaenger.vokId === id).length
  if (!d)
    return (
      <Center h={160}>
        <Loader size="sm" />
      </Center>
    )
  const aendern = (was: string, daten: Record<string, unknown>): void =>
    void senden(`/server/vokabeln/${id}/${was}`, daten).then(neuLaden, (e: unknown) => notifyError(e))
  const lernende = [...d.lernende].sort((a, b) => a.name.localeCompare(b.name, 'de'))
  const mitWoertern = d.woerter.length > 0
  const zettel = lernende.filter((l) => l.gast && l.zugang && l.zugang.length === 8).map((l) => ({ name: l.name, zugang: l.zugang! }))
  const abschnitt = async (f: AbschnittFrage): Promise<void> => {
    try {
      await senden(`/server/vokabeln/${id}/${f.was === 'loeschen' ? 'abschnitt-loeschen' : 'abschnitt-entfernen'}`, {
        titel: f.titel,
        ...(typeof f.entfernt === 'number' ? { entfernt: f.entfernt } : { index: f.index })
      })
      notifySuccess(f.was === 'loeschen' ? `„${f.titel}“ endgültig gelöscht.` : `„${f.titel}“ entfernt – der Lernstand bleibt gespeichert.`)
      neuLaden()
    } catch (e) {
      notifyError(e)
    }
  }
  const foerder = lernende.filter((l) => empfehlung(regelnVon(l)).art === 'foerder').map((l) => ({ id: l.id, name: l.name }))
  const eingabe = { ...d, woerter: d.woerter.length, lernende, entwuerfe, foerder }
  const z = kursKennzahlen(eingabe)
  /*
   * Handlungsbedarf (09.10.2026, eine Quelle): Kurse einer Lerngruppe zeigen die Einträge, die auch „Meine Klassen" zeigt
   * (Server, shared/kursHinweise.ts; Ausgeblendetes bleibt ausgeblendet) plus die Entwürfe dieses Geräts. Spontane
   * Gruppen (ohne Lerngruppe) oder eine nicht erreichbare Lerngruppe rechnen hier selbst.
   */
  const klassenBedarf = d.lerngruppeId && klassenDetail.bedarf !== 'fehler' ? klassenDetail.bedarf : undefined
  const entwurf = entwurfHinweis(entwuerfe)
  const hinweise: HinweisZeile[] =
    klassenBedarf === undefined
      ? kursHinweise(eingabe).map(alsZeile)
      : [...(entwurf ? [alsZeile(entwurf)] : []), ...(klassenBedarf?.sichtbar ?? []).map(alsZeile)]
  const ausgeblendeteHinweise = (klassenBedarf ? klassenBedarf.ausgeblendet : []).map(alsZeile)
  const zumZiel = (h: HinweisZeile): void => {
    setReiter(h.reiter)
    zumHinweis({ kurs: id, hinweis: h.art, reiter: h.reiter, ids: h.ids })
  }
  const ausblenden = (h: HinweisZeile, wieder: boolean): void => {
    if (!d.lerngruppeId || !h.schluessel) return
    void senden(`/server/klassen/${encodeURIComponent(d.lerngruppeId)}/${wieder ? 'bedarf-einblenden' : 'bedarf-ausblenden'}`, { schluessel: h.schluessel }).then(
      () => setBedarfStand((n) => n + 1),
      (e: unknown) => notifyError(e)
    )
  }
  const geplant = geplanteAbschnitte(d.teile)
  const titel = d.ueberschrift || d.titel

  // ---------------------------------------------------------------- Kopf
  const zahlen: Kennzahl[] = [
    ...(mitWoertern
      ? [{ id: 'sicher', label: 'Wörter sicher', wert: prozent(z.sicher), farbe: 'teal', tooltip: 'Anteil der Wörter, die zweimal im Abstand von mindestens einer Woche frei richtig geschrieben wurden – über alle Lernenden' }]
      : []),
    { id: 'aktiv', label: 'aktiv diese Woche', wert: `${z.aktiv}/${z.lernende}`, klick: () => setReiter('lernende') },
    {
      id: 'test',
      label: 'nächster Test',
      wert: z.test ? kurzTag(z.test) : '–',
      zusatz: z.tageBisTest != null ? (z.tageBisTest === 0 ? 'heute' : `in ${z.tageBisTest} Tag${z.tageBisTest === 1 ? '' : 'en'}`) : undefined,
      klick: () => setReiter('einstellungen')
    },
    {
      id: 'bedarf',
      label: 'Handlungsbedarf',
      wert: hinweise.length,
      farbe: hinweise.length ? 'orange' : undefined,
      symbol: hinweise.length ? <IconAlertTriangle size={16} color="var(--mantine-color-orange-6)" /> : undefined,
      klick: () => setReiter('ueberblick')
    }
  ]

  // ---------------------------------------------------------------- Inhalte der Reiter
  const ueberblick = (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" data-kurs-ueberblick>
      <Stack gap="md">
        <Card withBorder radius="md" padding="md" data-kurs-bedarf>
          <Group gap={6} mb="xs">
            <IconAlertTriangle size={18} color="var(--mantine-color-orange-6)" />
            <Text fw={700}>Handlungsbedarf</Text>
          </Group>
          <HinweisListe
            hinweise={hinweise}
            gehe={zumZiel}
            ausblenden={klassenBedarf ? ausblenden : undefined}
            ausgeblendet={ausgeblendeteHinweise}
            laedt={klassenBedarf === null}
          />
        </Card>
        {mitWoertern && (
          <Card withBorder radius="md" padding="md" data-kurs-lernstand>
            <Group justify="space-between" mb="xs">
              <Text fw={700}>Lernstand im Karteikasten</Text>
              <Text size="xs" c="dimmed">
                Anteil der Wörter je Stufe, alle Lernenden
              </Text>
            </Group>
            <StufenDiagramm u={d.gesamt} />
          </Card>
        )}
      </Stack>
      <Stack gap="md">
        {mitWoertern && (
          <Card withBorder radius="md" padding="md">
            <Group justify="space-between" mb="xs">
              <Text fw={700}>Units</Text>
              <Button size="compact-xs" variant="subtle" onClick={() => setReiter('vokabeln')}>
                Alle Abschnitte
              </Button>
            </Group>
            {statistik ? (
              <UnitsKompakt abschnitte={statistik.abschnitte} />
            ) : (
              <Stack gap={2}>
                {(d.teile ?? []).filter((t) => t.zeit <= Date.now()).slice(-6).reverse().map((t, i) => (
                  <Text key={i} size="sm">
                    {t.titel}{' '}
                    <Text span size="xs" c="dimmed">
                      · {t.anzahl} Wörter
                    </Text>
                  </Text>
                ))}
              </Stack>
            )}
          </Card>
        )}
        <Card withBorder radius="md" padding="md" data-kurs-demnaechst>
          <Group gap={6} mb="xs">
            <IconClock size={18} />
            <Text fw={700}>Demnächst</Text>
          </Group>
          {geplant.length ? (
            <Stack gap={4}>
              {geplant.slice(0, 5).map((t, i) => (
                <Group key={i} justify="space-between" wrap="nowrap" gap="xs">
                  <Text size="sm" truncate>
                    {t.titel}
                  </Text>
                  <GeplantMarke ab={t.zeit} />
                </Group>
              ))}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              Keine geplanten Freischaltungen{z.test ? ` · Test am ${kurzTag(z.test)}` : ''}.
            </Text>
          )}
        </Card>
      </Stack>
    </SimpleGrid>
  )

  const vokabeln = (
    <Stack gap="md" data-vokabel-kasten>
      <Group justify="space-between" gap="xs">
        <Text c="dimmed" size="sm" data-vokabel-kurzinfo>
          {mitWoertern ? `${d.woerter.length} Wörter in ${(d.teile ?? []).length || 1} ${(d.teile ?? []).length === 1 ? 'Abschnitt' : 'Abschnitten'}` : 'Noch keine Vokabeln'}
          {experte && d.quelle?.lehrwerk ? ` · Lehrwerk: ${d.quelle.lehrwerk}${d.quelle.unit ? ` · ${d.quelle.unit}` : ''}` : ''}
        </Text>
        <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={() => setHinzu(true)} data-vokabel-hinzufuegen>
          Vokabeln hinzufügen
        </Button>
      </Group>
      {!mitWoertern && (
        <Text size="sm" c="dimmed" data-vokabel-ohne>
          Dieser Kurs hat bisher nur Grammatik. Mit „Vokabeln hinzufügen“ kommen Wörter dazu – dann gibt es Tagesziel, Spiele und Lernzeitraum.
        </Text>
      )}
      {mitWoertern && statistik && statistik.abschnitte.length > 0 && (
        <Card withBorder radius="md" padding="sm" data-kurs-abschnitte>
          <KastenKopf
            titel="Abschnitte und Stand der Lernenden"
            offen={abschnitteOffen}
            umschalten={() => setAbschnitteOffen(!abschnitteOffen)}
            data-kurs-abschnitte-kopf
          />
          {abschnitteOffen ? (
            <AbschnittUebersicht abschnitte={statistik.abschnitte} namen={statistik.namen} />
          ) : (
            <Text size="xs" c="dimmed" ml={26} data-kurs-abschnitte-kurz>
              {abschnitteKurz(statistik.abschnitte)}
            </Text>
          )}
        </Card>
      )}
      {(mitWoertern || (d.entfernt ?? []).length > 0) && (
        <AbschnitteVerwalten teile={d.teile ?? []} gesamt={d.woerter.length} entfernt={d.entfernt ?? []} ausfuehren={abschnitt} />
      )}
      {mitWoertern && <ProblemWoerter d={d} aendern={aendern} />}
      {eingebettet && lernende.length > 0 && mitWoertern && (
        <LernendeTabelle lernende={lernende} gastZeigen={setGast} entfernen={setEntfernen} kurs={kursInfo(d, id)} nurAnsicht="liste" immerOffen />
      )}
    </Stack>
  )

  const grammatikInhalt = (
    <Stack gap="md">
      <KursGrammatik
        vokId={id}
        fach={d.fach}
        hinzufuegen={() => setGrammatik(true)}
        geoeffnet={grammatikOffen}
        oeffnen={setGrammatikOffen}
        stand={grammatikStand}
        immerOffen
        eingebettet={eingebettet}
      />
      {/* Grammatik je Lernende/r auch in Sprachenlernen (09.10.2026): Ziel der Grammatik-Hinweise im Handlungsbedarf */}
      {lernende.length > 0 && (
        <LernendeTabelle lernende={lernende} gastZeigen={setGast} entfernen={setEntfernen} kurs={kursInfo(d, id)} nurAnsicht="grammatik" immerOffen />
      )}
    </Stack>
  )

  const lernendeInhalt = (
    <Stack gap="md">
      <Group gap="xs" data-lernende-knoepfe>
        <Button variant="light" leftSection={<IconUserPlus size={16} />} onClick={() => setEintragen(true)} data-lernende-eintragen>
          Lernende eintragen
        </Button>
        {lernende.length > 0 && (
          <Button variant="default" leftSection={<IconSchool size={16} />} onClick={() => setKlasse(true)} data-klasse-zuordnen-knopf>
            Lernende einer Klasse zuordnen…
          </Button>
        )}
        {zettel.length > 0 && (
          <Button variant="default" leftSection={<IconPrinter size={16} />} onClick={() => setZettelDruck(zettel)} data-zettel-alle>
            Zettel für alle ({zettel.length})
          </Button>
        )}
        {d.code && d.link && (
          <Button variant="default" leftSection={<IconQrcode size={16} />} onClick={() => setQr(true)}>
            QR-Code zum Mitlernen
          </Button>
        )}
      </Group>
      {lernende.length > 0 ? (
        <LernendeTabelle lernende={lernende} gastZeigen={setGast} entfernen={setEntfernen} kurs={kursInfo(d, id)} immerOffen />
      ) : (
        <Alert>{d.code ? 'Noch niemand dabei – den QR-Code zeigen oder den Code nennen.' : 'Noch niemand in der Lerngruppe.'}</Alert>
      )}
    </Stack>
  )

  const einstellungen = (
    <Einstellungen
      d={d}
      id={id}
      aendern={aendern}
      beenden={() => aendern('status', { status: d.status === 'offen' ? 'beendet' : 'offen' })}
      loeschen={() => setLoeschen(true)}
      eingebettet={eingebettet}
    />
  )

  const fenster = (
    <>
      {grammatik && (
        <GrammatikFreigeben
          vorgabe={grammatikVorgabe(id, d.titel, d.sprache ?? '', d.quelle, Boolean(d.klassenKurs))}
          schliessen={() => (setGrammatik(false), setGrammatikStand((n) => n + 1), geaendert?.())}
        />
      )}
      {zettelDruck && <ZettelDruck titel={titel} zettel={zettelDruck} adresse={d.adresse || window.location.origin} schliessen={() => setZettelDruck(null)} />}
      {eintragen && (
        <LernendeEintragen
          id={id}
          titel={titel}
          adresse={d.adresse || window.location.origin}
          schonDa={lernende.map((l) => l.name)}
          schliessen={() => (setEintragen(false), neuLaden())}
        />
      )}
      {hinzu && <Hinzufuegen id={id} schliessen={() => (setHinzu(false), neuLaden())} />}
      {klasse && <KlasseZuordnen id={id} schliessen={(g) => (setKlasse(false), g && neuLaden())} />}
      <Modal opened={Boolean(gast)} onClose={() => setGast(null)} title={gast ? `Zugang für ${gast.name}` : ''}>
        {gast && (
          <Stack gap="sm" data-gast-zugang>
            <Text size="sm">
              {gast.zugang?.length === 8
                ? `${gast.name} meldet sich auf der Lernseite unter „Mit Code öffnen“ direkt mit dem persönlichen Code an.`
                : `So kommt ${gast.name} an einem anderen Tag oder Gerät wieder hinein: Code des Trainings eingeben, „Schon dabei?“ wählen, dann Name und persönlicher Code.`}
            </Text>
            <SimpleGrid cols={2}>
              <div>
                <Text size="xs" c="dimmed">
                  Code des Trainings
                </Text>
                <Title order={3} ff="monospace">
                  {d.code ?? '–'}
                </Title>
              </div>
              <div>
                <Text size="xs" c="dimmed">
                  Persönlicher Code
                </Text>
                <Title order={3} ff="monospace" data-gast-code>
                  {gast.zugang || '–'}
                </Title>
              </div>
            </SimpleGrid>
            {!gast.zugang && (
              <Text size="xs" c="dimmed">
                Der Code wurde vor der Anzeige-Funktion vergeben und ist nicht lesbar gespeichert – ein neuer Code ersetzt ihn.
              </Text>
            )}
            <Group justify="flex-end">
              <Button
                variant="default"
                data-gast-code-neu
                onClick={() =>
                  void senden<{ zugang: string }>(`/server/vokabeln/${id}/gast-code`, { id: gast.id }).then(
                    (r) => (setGast({ ...gast, zugang: r.zugang }), laden()),
                    (e: unknown) => notifyError(e)
                  )
                }
              >
                Neuen Code erzeugen
              </Button>
              {gast.zugang?.length === 8 && (
                <Button leftSection={<IconPrinter size={16} />} onClick={() => setZettelDruck([{ name: gast.name, zugang: gast.zugang! }])}>
                  Zettel drucken
                </Button>
              )}
            </Group>
          </Stack>
        )}
      </Modal>
      {qr && d.code && d.link && (
        <Modal opened onClose={() => setQr(false)} title={d.titel} size="lg">
          <Zugang code={d.code} link={d.link} />
          <Text size="sm" c="dimmed" mt="sm">
            Gäste geben Vorname und Anfangsbuchstabe ein und bekommen einen persönlichen Code zum Weiterlernen an anderen Tagen und Geräten.
          </Text>
        </Modal>
      )}
      <Modal opened={loeschen} onClose={() => setLoeschen(false)} title="Kurs löschen?">
        <Text size="sm" mb="md">
          Der Kurs wird samt Lernstand aller Lernenden und der Gastzugänge endgültig gelöscht. Die Vokabelliste selbst bleibt erhalten.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setLoeschen(false)}>
            Abbrechen
          </Button>
          <Button
            color="red"
            onClick={() => void senden(`/server/vokabeln/${id}/loeschen`, {}).then(() => (setLoeschen(false), geaendert?.(), onZurueck()), (e: unknown) => notifyError(e))}
            data-vokabel-loeschen
          >
            Endgültig löschen
          </Button>
        </Group>
      </Modal>
      <Modal opened={Boolean(entfernen)} onClose={() => setEntfernen(null)} title="Aus dieser Freigabe entfernen?">
        {entfernen && (
          <Stack gap="sm">
            <Text size="sm">
              „{entfernen.name}“ verliert sofort den Zugang zu diesen Vokabeln; der Lernstand dazu wird gelöscht.
              {entfernen.gast ? ' Das Gastkonto wird ganz gelöscht.' : ' Das IServ-Konto selbst bleibt bestehen.'}
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEntfernen(null)}>
                Abbrechen
              </Button>
              <Button color="red" data-gast-entfernen-bestaetigen onClick={() => (aendern('gast-entfernen', { id: entfernen.id }), setEntfernen(null))}>
                Entfernen
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  )

  // ---------------------------------------------------------------- Eingebettet: nur ein Bereich
  if (eingebettet && nurReiter)
    return (
      <Stack gap="md" data-lernstand data-kurs-seite={id} data-eingebettet>
        {d.status !== 'offen' && (
          <Badge color="gray" w="fit-content">
            abgeschlossen
          </Badge>
        )}
        {nurReiter === 'vokabeln' ? vokabeln : grammatikInhalt}
        <Modal opened={einstellungenOffen} onClose={einstellungenSchliessen} title={`Kurseinstellungen – ${titel}`} size="lg">
          {einstellungen}
        </Modal>
        {fenster}
      </Stack>
    )

  return (
    <Stack gap="md" data-lernstand data-kurs-seite={id}>
      {!eingebettet && (
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={rueck.los}
          w="fit-content"
          data-zurueck={rueck.aus ? 'meineklassen' : undefined}
        >
          {rueck.name}
        </Button>
      )}
      <KennzahlenKopf
        data-kurs-kopf
        links={!eingebettet ? <LernstandSymbol faecher={d.gesamt.faecher} art="verlauf" fach={d.fach} groesse={48} /> : undefined}
        titel={
          !eingebettet ? (
            <Group gap="xs">
              <Title order={3} data-kurs-titel>
                {titel}
              </Title>
              {d.status !== 'offen' && <Badge color="gray">abgeschlossen</Badge>}
            </Group>
          ) : undefined
        }
        untertitel={!eingebettet ? [d.lerngruppe, d.fach].filter(Boolean).join(' · ') : undefined}
        rechts={
          !eingebettet ? (
            <Group gap="xs">
              {/* „Als Schüler ansehen" (09.10.2026, wie in „Meine Klassen"): Fenster gleich auf diesem Kurs */}
              <AlsSchuelerAnsehen kursId={id} gruppe={d.lerngruppeId || undefined} klasse={d.lerngruppeId && d.lerngruppe ? d.lerngruppe : titel} />
              {d.code && d.link && (
                <Button variant="light" leftSection={<IconQrcode size={16} />} onClick={() => setQr(true)} data-vokabel-qr-zeigen>
                  QR-Code
                </Button>
              )}
            </Group>
          ) : undefined
        }
        zahlen={zahlen}
      />
      <Tabs value={reiter} onChange={(v) => v && setReiter(v as KursReiter)} keepMounted={false} data-kurs-reiterleiste>
        <Tabs.List>
          <Tabs.Tab value="ueberblick" leftSection={<IconLayoutDashboard size={16} />} data-kurs-reiter="ueberblick">
            Überblick
          </Tabs.Tab>
          <Tabs.Tab value="vokabeln" leftSection={<IconBooks size={16} />} data-kurs-reiter="vokabeln">
            Vokabeln
          </Tabs.Tab>
          <Tabs.Tab
            value="grammatik"
            leftSection={<IconBook2 size={16} />}
            rightSection={
              entwuerfe ? (
                <Tooltip label="Entwürfe zum Prüfen">
                  <Badge size="xs" color="yellow" circle>
                    {entwuerfe}
                  </Badge>
                </Tooltip>
              ) : undefined
            }
            data-kurs-reiter="grammatik"
          >
            Grammatik
          </Tabs.Tab>
          <Tabs.Tab value="lernende" leftSection={<IconUsers size={16} />} data-kurs-reiter="lernende">
            Lernende ({lernende.length})
          </Tabs.Tab>
          <Tabs.Tab value="einstellungen" leftSection={<IconSettings size={16} />} data-kurs-reiter="einstellungen" ml="auto">
            Einstellungen
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="ueberblick" pt="md">
          {ueberblick}
        </Tabs.Panel>
        <Tabs.Panel value="vokabeln" pt="md">
          {vokabeln}
        </Tabs.Panel>
        <Tabs.Panel value="grammatik" pt="md">
          {grammatikInhalt}
        </Tabs.Panel>
        <Tabs.Panel value="lernende" pt="md">
          {lernendeInhalt}
        </Tabs.Panel>
        <Tabs.Panel value="einstellungen" pt="md">
          {einstellungen}
        </Tabs.Panel>
      </Tabs>
      {fenster}
    </Stack>
  )
}

const kursInfo = (d: Lernstanddaten, id: string): Parameters<typeof LernendeTabelle>[0]['kurs'] => ({
  id,
  fach: d.fach,
  sprache: d.sprache ?? '',
  lerngruppe: d.lerngruppe,
  woerter: d.woerter,
  quelle: d.quelle,
  lerngruppeId: d.lerngruppeId
})

/** Problemwörter der Lerngruppe (zugeklappt); Fehlerquote und typische Falschantworten nur im Expertenmodus */
function ProblemWoerter({ d, aendern }: { d: Lernstanddaten; aendern: (was: string, daten: Record<string, unknown>) => void }): React.JSX.Element {
  const experte = useExperte()
  const [offen, setOffen] = useGemerkt('vok-problemwoerter-offen', false)
  return (
    <Card withBorder radius="md" padding="sm">
      <KastenKopf
        titel={`Problemwörter der Lerngruppe${d.problem.length ? ` (${d.problem.length})` : ''}`}
        offen={offen}
        umschalten={() => setOffen(!offen)}
        data-problemwoerter-kopf
      />
      {offen && (
        <div style={{ marginTop: 8 }}>
          {d.problem.length === 0 ? (
            <Text size="sm" c="dimmed">
              Noch keine – sie erscheinen, sobald genug geübt ist.
            </Text>
          ) : (
            <Table striped data-karten>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Wort</Table.Th>
                  {experte && <Table.Th>Fehlerquote</Table.Th>}
                  {experte && <Table.Th>Typische Falschantworten</Table.Th>}
                  <Table.Th style={{ width: 40 }} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {d.problem.map((p) => (
                  <Table.Tr key={p.id} data-problemwort={p.id}>
                    <Table.Td>
                      <b>{p.term}</b> – {p.translation}
                    </Table.Td>
                    {experte && <Table.Td>{Math.round(p.quote * 100)} %</Table.Td>}
                    {experte && <Table.Td>{p.typisch.join(' · ') || '–'}</Table.Td>}
                    <Table.Td>
                      <Tooltip label="Aus der Liste nehmen – kommt wieder, wenn neue Fehler dazukommen">
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => aendern('problem-aus', { id: p.id })}
                          aria-label={`${p.term} aus der Liste nehmen`}
                          data-problem-aus={p.id}
                        >
                          <IconX size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </div>
      )}
    </Card>
  )
}

/** Reiter „Einstellungen": Wichtiges offen, Feineinstellungen im Expertenmodus bzw. unter „Alle Optionen" */
function Einstellungen({
  d,
  id,
  aendern,
  beenden,
  loeschen,
  eingebettet
}: {
  d: Lernstanddaten
  id: string
  aendern: (was: string, daten: Record<string, unknown>) => void
  beenden: () => void
  loeschen: () => void
  eingebettet: boolean
}): React.JSX.Element {
  const [ziel, setZiel] = useState<number | string>('')
  const [ueberschrift, setUeberschrift] = useState(d.ueberschrift ?? '')
  const [symbol, setSymbol] = useState<string | null>(null)
  const experte = useExperte()
  useEffect(() => {
    if (eingebettet) return
    let aus = false
    void holen<{ zuweisungen: { id: string; symbol?: string }[] }>('/server/vokabeln')
      .then((r) => !aus && setSymbol(r.zuweisungen.find((x) => x.id === id)?.symbol ?? 'verlauf'))
      .catch(() => undefined)
    return () => {
      aus = true
    }
  }, [id, eingebettet, experte])
  const mitWoertern = d.woerter.length > 0
  return (
    <OptionenBereich>
      <Stack gap="lg" maw={760} data-kurs-einstellungen>
        <Card withBorder radius="md" padding="md">
          <Text fw={700} mb="sm">
            Zeitraum und Test
          </Text>
          <Group gap="md" align="flex-start">
            {/* Feste Klasse (09.10.2026, abgestimmt): kein Enddatum – ein schon gesetztes lässt sich noch löschen */}
            {(!d.klassenKurs || d.bis) && (
              <div style={{ width: 220 }}>
                <TextInput
                  type="date"
                  label="Lernzeitraum bis"
                  description={d.klassenKurs ? 'Kurs der Klasse: Datum löschen, dann läuft er weiter.' : 'Danach ist der Kurs abgeschlossen.'}
                  leftSection={<IconCalendarEvent size={14} />}
                  value={alsFeld(d.bis)}
                  onChange={(e) => aendern('zeitraum', { bis: ausFeld(e.currentTarget.value, '23:59:00') })}
                  data-vokabel-bis-aendern
                />
                <KalenderHinweis wert={alsFeld(d.bis)} richtung="vor" verschieben={(t) => aendern('zeitraum', { bis: ausFeld(t, '23:59:00') })} />
              </div>
            )}
            <div style={{ width: 220 }}>
              <TextInput
                type="date"
                label="Testtermin"
                description="Der Karteikasten plant bis dahin."
                value={alsFeld(d.testTermin)}
                onChange={(e) => aendern('termin', { testTermin: ausFeld(e.currentTarget.value, '08:00:00') })}
                data-vokabel-termin
              />
              <KalenderHinweis wert={alsFeld(d.testTermin)} verschieben={(t) => aendern('termin', { testTermin: ausFeld(t, '08:00:00') })} />
            </div>
          </Group>
        </Card>
        {mitWoertern && (
          <Card withBorder radius="md" padding="md" data-vokabel-tag>
            <Text fw={700} mb="sm">
              Üben und Spiele
            </Text>
            <Stack gap="md">
              <NumberInput
                label="Neue Vokabeln pro Tag"
                description="vor den Spielen; geübt wird in 10er-Schritten"
                min={1}
                max={200}
                w={230}
                value={ziel === '' ? d.tagesziel ?? 10 : ziel}
                onChange={setZiel}
                onBlur={() => {
                  if (ziel !== '' && Number(ziel) !== d.tagesziel) aendern('tagesziel', { tagesziel: Number(ziel) })
                  setZiel('')
                }}
                data-vokabel-tagesziel
              />
              <Switch
                label="Spiele heute schon freischalten"
                description="gilt nur für heute – ohne erst die Tagesvokabeln zu üben"
                checked={Boolean(d.spieleFrei)}
                onChange={(e) => aendern('spiele', { frei: e.currentTarget.checked })}
                data-vokabel-spiele-frei
              />
              <Switch
                label="Zusammen spielen erlauben"
                description="Kooperativ- und Versus-Spiele mit Einladungscode – z. B. vor einem Test abschalten"
                checked={d.zusammen !== false}
                onChange={(e) => aendern('zusammen', { an: e.currentTarget.checked })}
                data-vokabel-zusammen
              />
              <NurExperte geaendert={d.verbspiele ? `Verbspiele ${d.verbspiele === 'an' ? 'an' : 'aus'}` : false}>
                <Select
                  label="Unregelmäßige Verben (Spiele und Stammformen)"
                  description="Automatisch: erst wenn die Vergangenheit laut Lehrwerk-Stand oder freigegebener Grammatik dran war"
                  data={[
                    { value: '', label: 'automatisch' },
                    { value: 'an', label: 'jetzt freischalten' },
                    { value: 'aus', label: 'ausblenden' }
                  ]}
                  value={d.verbspiele ?? ''}
                  onChange={(w) => aendern('verbspiele', { wert: w ?? '' })}
                  allowDeselect={false}
                  maw={420}
                  data-vokabel-verbspiele
                />
              </NurExperte>
            </Stack>
          </Card>
        )}
        {/* Erinnerungen zum Üben (10.10.2026): die Lehrkraft bietet an, die Lernenden schalten selbst ein */}
        <Card withBorder radius="md" padding="md" data-kurs-erinnerungen>
          <Text fw={700} mb="sm">
            Erinnerungen
          </Text>
          <Switch
            label="Erinnerungen zum Üben anbieten"
            description="Lernende können sich dann selbst kurze Hinweise aufs Handy oder Tablet schicken lassen – höchstens einen am Tag, nie während der Schulzeit, ohne Namen in der Nachricht."
            checked={Boolean(d.erinnerungen)}
            onChange={(e) => aendern('erinnerungen', { an: e.currentTarget.checked })}
            data-kurs-erinnerungen-an
          />
          {d.erinnerungen && (
            <Text size="sm" c="dimmed" mt="xs" data-kurs-erinnerungen-aktiv={d.erinnerungenAktiv ?? 0}>
              {d.erinnerungenAktiv === 1 ? '1 Lernende/r hat' : `${d.erinnerungenAktiv ?? 0} Lernende haben`} Erinnerungen eingeschaltet.
            </Text>
          )}
        </Card>
        <NurExperte>
          <Card withBorder radius="md" padding="md" data-kurs-darstellung>
            <Text fw={700} mb="sm">
              Darstellung
            </Text>
            <Stack gap="md">
              <TextInput
                label="Überschrift (sehen die Lernenden)"
                description="Leer lassen für den Standard „Jahr - Lerngruppe - Fach“"
                value={ueberschrift}
                onChange={(e) => setUeberschrift(e.currentTarget.value)}
                onBlur={() => ueberschrift !== (d.ueberschrift ?? '') && aendern('ueberschrift', { text: ueberschrift })}
                maw={420}
                data-kurs-ueberschrift
              />
              {symbol && (
                <div>
                  <Text size="sm" fw={500} mb={4}>
                    Symbol in der Kursliste
                  </Text>
                  <SegmentedControl
                    value={symbol}
                    onChange={(v) => (setSymbol(v), aendern('symbol', { art: v }))}
                    data={[
                      { value: 'verlauf', label: 'Lernstand-Ring' },
                      { value: 'farbe', label: 'Fachfarbe' }
                    ]}
                    data-kurs-symbol
                  />
                </div>
              )}
            </Stack>
          </Card>
        </NurExperte>
        {/*
          Beenden/Löschen nur für spontane Gruppen (09.10.2026, abgestimmt): Der Kurs einer festen Klasse läuft über die
          Schuljahre; ein (früher) beendeter lässt sich wieder öffnen.
        */}
        {(!d.klassenKurs || d.status !== 'offen') && (
          <Card withBorder radius="md" padding="md" data-kurs-verwalten>
            <Text fw={700} mb="sm">
              Kurs
            </Text>
            <Group gap="xs">
              <Button variant="default" onClick={beenden} data-vokabel-status>
                {d.status === 'offen' ? 'Kurs beenden' : 'Wieder öffnen'}
              </Button>
              {!d.klassenKurs && (
                <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={loeschen} data-kurs-loeschen>
                  Kurs löschen …
                </Button>
              )}
            </Group>
          </Card>
        )}
        <AlleOptionen />
      </Stack>
    </OptionenBereich>
  )
}
