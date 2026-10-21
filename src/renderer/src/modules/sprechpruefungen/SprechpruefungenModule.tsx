/**
 * App „Sprechprüfungen" (19.10.2026, Leiste › Organisation, abgestimmt mit der Lehrkraft): Material für die
 * Sprechprüfung je Jahrgang – Interview-Sets, Bildkarten (Monolog) und Dialogkarten – im schulweiten Pool je Sprache
 * (server/sprechBank.ts). Das Sprechtraining der Lernenden nutzt diese Karten; dazu druckbare Prüfungssets für die echte
 * Prüfung. Nur für Lehrkräfte mit Englisch, Französisch oder Spanisch; Reiter je eigenem Fach.
 *
 * Aufbau (gewählt): Fach-Reiter › Jahrgangs-Kacheln (Lehrwerk-Cover, GER-Ziel, Ampel je Teil) › Jahrgang mit drei
 * Spalten. Erstellen je Teil auf Knopfdruck (KI im Hintergrund), danach Durchsicht; Bilder erst nach dem Speichern.
 * Grundlage wählbar: Lehrwerk bis Unit (Wortschatz, Grammatik) oder „wie eine Klasse" – dazu die Lehrplan-Themen.
 */
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Collapse,
  Container,
  Group,
  Image,
  Loader,
  Modal,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import {
  IconArrowLeft,
  IconChevronDown,
  IconChevronRight,
  IconFilter,
  IconMicrophone,
  IconPencil,
  IconPhoto,
  IconPlus,
  IconPrinter,
  IconSearch,
  IconSparkles,
  IconTrash,
  IconUsers
} from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Textbook, TextbookMeta } from '@shared/types'
import { standText, type BildKarte, type DialogKarte, type InterviewKarte, type SprechKarte, type SprechStand } from '@shared/sprechen/karten'
import { kartenAnfrage, type Grundlage, type KartenTeil } from '@shared/sprechen/erstellen'
import { zielNiveau, type SprechSprache } from '@shared/sprechen/niveaus'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { useAppSettings } from '../../shared/settingsStore'
import { BandCover } from '../../shared/components/BandCover'
import { starteAuftrag } from '../../shared/auftraege'
import { collectKnownVocab, grammatikStand } from '../../shared/knownVocab'
import { useLehrplanVorschlaege } from '../../shared/lehrplanVorschlaege'
import { drucken, pruefungsSetHtml } from './pruefungsset'
import { gruppiere, nachStand, OHNE_STAND, spaetesteBis, standBis, type StandGruppe } from './stand'

const FAECHER: { id: string; sprache: SprechSprache; name: string; ab: number }[] = [
  { id: 'englisch', sprache: 'en', name: 'Englisch', ab: 5 },
  { id: 'franzoesisch', sprache: 'fr', name: 'Französisch', ab: 6 },
  { id: 'spanisch', sprache: 'es', name: 'Spanisch', ab: 6 }
]
const TEILE: { id: KartenTeil; name: string; anzahl: number; knopf: string }[] = [
  { id: 'interview', name: 'Interview', anzahl: 3, knopf: '+ 3 Interview-Sets' },
  { id: 'monolog', name: 'Monolog (Bildkarten)', anzahl: 4, knopf: '+ 4 Bildkarten' },
  { id: 'dialog', name: 'Dialog', anzahl: 4, knopf: '+ 4 Dialogkarten' }
]

interface PoolKarte {
  id: string
  sprache: string
  jahrgang: number
  teil: KartenTeil
  karte: SprechKarte
  eigene: boolean
}

/** Entwürfe der KI zum Durchsehen (nur auf diesem Gerät, bis gespeichert oder verworfen) */
interface Entwurf {
  schluessel: string
  sprache: SprechSprache
  jahrgang: number
  teil: KartenTeil
  karte: SprechKarte & { bildPrompt?: string }
}
const ENTWURF_SCHLUESSEL = 'sa-sprech-entwuerfe'
const EREIGNIS = 'schulapps:sprech-entwuerfe'
const ladeEntwuerfe = (): Entwurf[] => {
  try {
    return JSON.parse(localStorage.getItem(ENTWURF_SCHLUESSEL) ?? '[]') as Entwurf[]
  } catch {
    return []
  }
}
const speichereEntwuerfe = (l: Entwurf[]): void => {
  try {
    localStorage.setItem(ENTWURF_SCHLUESSEL, JSON.stringify(l))
  } catch {
    /* voll */
  }
  window.dispatchEvent(new Event(EREIGNIS))
}
function useEntwuerfe(): Entwurf[] {
  const [l, setL] = useState(ladeEntwuerfe)
  useEffect(() => {
    const f = (): void => setL(ladeEntwuerfe())
    window.addEventListener(EREIGNIS, f)
    return () => window.removeEventListener(EREIGNIS, f)
  }, [])
  return l
}

const bildUrl = (datei: string): string => `/server/sprech-bank/bild/${datei}`
const titelVon = (k: SprechKarte): string => (k.art === 'interview' ? k.thema : k.titel)

/** Bild zur Karte erzeugen und am Server ablegen (im Hintergrund) */
function bildErzeugen(p: PoolKarte, prompt: string, fertig: () => void): void {
  void starteAuftrag({
    moduleId: 'sprechpruefungen',
    docId: 'sprechpruefungen',
    titel: `Bild: ${titelVon(p.karte)}`,
    art: 'Sprechkarte-Bild',
    eingabe: { p, prompt },
    sperrt: false,
    fehlerTitel: 'Bild konnte nicht erzeugt werden',
    arbeit: async (e, k) => {
      k.melde('Bild wird gezeichnet …')
      const dataUrl = await k.bild(
        `${e.prompt} Style: friendly realistic illustration for a school speaking exam, clear scene, no text, no logos, no real persons.`
      )
      const { datei } = await senden<{ datei: string }>('/server/sprech-bank/bild', { dataUrl })
      const karte = e.p.karte as BildKarte
      await senden('/server/sprech-bank/speichern', { id: e.p.id, sprache: e.p.sprache, jahrgang: e.p.jahrgang, teil: e.p.teil, karte: { ...karte, bilder: [datei] } })
      return datei
    },
    ablegen: async () => fertig(),
    abschluss: () => 'Bild gespeichert'
  })
}

/** Lehrwerk-Stand einer Karte (21.10.2026) – ältere Karten ohne Angabe */
function StandZeile({ stand }: { stand?: SprechStand }): React.JSX.Element {
  return (
    <Text size="xs" c="dimmed" data-sprechkarte-stand>
      {stand ? standText(stand) : 'Lehrwerk-Stand nicht angegeben'}
    </Text>
  )
}

function KartenEditor({
  k,
  aktuell,
  schliessen,
  speichern
}: {
  k: SprechKarte
  /** Gewählte Stelle im Lehrwerk – für Karten ohne bzw. mit anderem Stand übernehmbar (21.10.2026) */
  aktuell?: SprechStand
  schliessen: () => void
  speichern: (k: SprechKarte) => void
}): React.JSX.Element {
  const [x, setX] = useState<SprechKarte>(k)
  const zeilen = (l: string[]): string => l.join('\n')
  const aus = (s: string): string[] => s.split('\n').map((z) => z.trim()).filter(Boolean)
  return (
    <Modal opened onClose={schliessen} title="Karte bearbeiten" size="lg">
      <Stack gap="sm">
        <Group gap="xs">
          <StandZeile stand={x.stand} />
          {aktuell && standText(aktuell) !== standText(x.stand) && (
            <Button size="compact-xs" variant="subtle" onClick={() => setX({ ...x, stand: aktuell })} data-sprechkarte-stand-setzen>
              {x.stand ? 'Ändern auf' : 'Setzen:'} {standText(aktuell)}
            </Button>
          )}
        </Group>
        {x.art === 'interview' && (
          <>
            <TextInput label="Thema" value={x.thema} onChange={(e) => setX({ ...x, thema: e.currentTarget.value })} />
            <Textarea label="Fragen (eine je Zeile, offene zuerst)" autosize minRows={5} value={zeilen(x.fragen)} onChange={(e) => setX({ ...x, fragen: aus(e.currentTarget.value) })} />
          </>
        )}
        {x.art === 'monolog' && (
          <>
            {/* Das erstellte Bild auch im Fenster (21.10.2026, Wunsch der Lehrkraft) – neben Fragen und Beschreibung */}
            {x.bilder[0] && <Image src={bildUrl(x.bilder[0])} mah={320} radius="sm" fit="contain" alt="" data-sprechkarte-bild />}
            <TextInput label="Titel" value={x.titel} onChange={(e) => setX({ ...x, titel: e.currentTarget.value })} />
            <Textarea label="Was auf dem Bild zu sehen ist (für die KI-Prüferin)" autosize minRows={2} value={x.bildBeschreibung} onChange={(e) => setX({ ...x, bildBeschreibung: e.currentTarget.value })} />
            <Textarea label="Leitfragen (eine je Zeile)" autosize minRows={3} value={zeilen(x.leitfragen)} onChange={(e) => setX({ ...x, leitfragen: aus(e.currentTarget.value) })} />
          </>
        )}
        {x.art === 'dialog' && (
          <>
            <Select
              label="Form"
              data={[
                { value: 'rollenspiel', label: 'Rollenspiel' },
                { value: 'infogap', label: 'Info-Gap (Info- und Fragekarte)' },
                { value: 'diskussion', label: 'Diskussion mit Einigung' }
              ]}
              value={x.form}
              onChange={(v) => v && setX({ ...x, form: v as DialogKarte['form'] })}
            />
            <TextInput label="Titel" value={x.titel} onChange={(e) => setX({ ...x, titel: e.currentTarget.value })} />
            <Textarea label="Situation (Text der Karte)" autosize minRows={2} value={x.situation} onChange={(e) => setX({ ...x, situation: e.currentTarget.value })} />
            <TextInput label="Rolle Schüler/in" value={x.rolleSchueler} onChange={(e) => setX({ ...x, rolleSchueler: e.currentTarget.value })} />
            <Textarea label="Rolle der Partnerin (bei Info-Gap: ihre Infos)" autosize minRows={2} value={x.rolleKi} onChange={(e) => setX({ ...x, rolleKi: e.currentTarget.value })} />
            <Textarea label="Punkte / Optionen (eine je Zeile)" autosize minRows={3} value={zeilen(x.punkte)} onChange={(e) => setX({ ...x, punkte: aus(e.currentTarget.value) })} />
            <TextInput label="Ziel" value={x.ziel} onChange={(e) => setX({ ...x, ziel: e.currentTarget.value })} />
          </>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={schliessen}>
            Abbrechen
          </Button>
          <Button onClick={() => speichern(x)} data-sprechkarte-speichern>
            Speichern
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/**
 * Ansehen ohne Bearbeiten (21.10.2026, Wunsch der Lehrkraft): Karten ohne Bearbeitungsrecht öffnen sich mit Bild,
 * Titel, Beschreibung und Fragen – wie das Bearbeiten-Fenster, nur ohne Eingabefelder
 */
function KartenAnsicht({ k, schliessen }: { k: SprechKarte; schliessen: () => void }): React.JSX.Element {
  const feld = (titel: string, inhalt: React.ReactNode): React.JSX.Element => (
    <div>
      <Text size="sm" fw={600}>
        {titel}
      </Text>
      {inhalt}
    </div>
  )
  const absatz = (t: string): React.JSX.Element => <Text size="sm">{t}</Text>
  const punkte = (l: string[]): React.JSX.Element => (
    <Stack gap={2}>
      {l.map((z, i) => (
        <Text key={i} size="sm">
          • {z}
        </Text>
      ))}
    </Stack>
  )
  return (
    <Modal opened onClose={schliessen} title={titelVon(k)} size="lg" data-sprechkarte-ansicht>
      <Stack gap="sm">
        <StandZeile stand={k.stand} />
        {k.art === 'interview' && feld('Fragen', punkte(k.fragen))}
        {k.art === 'monolog' && (
          <>
            {k.bilder[0] && <Image src={bildUrl(k.bilder[0])} mah={320} radius="sm" fit="contain" alt="" data-sprechkarte-bild />}
            {feld('Was auf dem Bild zu sehen ist', absatz(k.bildBeschreibung))}
            {feld('Leitfragen', punkte(k.leitfragen))}
          </>
        )}
        {k.art === 'dialog' && (
          <>
            {feld('Form', absatz(k.form === 'infogap' ? 'Info-Gap (Info- und Fragekarte)' : k.form === 'diskussion' ? 'Diskussion mit Einigung' : 'Rollenspiel'))}
            {feld('Situation', absatz(k.situation))}
            {k.rolleSchueler && feld('Rolle Schüler/in', absatz(k.rolleSchueler))}
            {k.rolleKi && feld('Rolle der Partnerin', absatz(k.rolleKi))}
            {feld('Punkte / Optionen', punkte(k.punkte))}
            {k.ziel && feld('Ziel', absatz(k.ziel))}
          </>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={schliessen}>
            Schließen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/** Vorschau einer Karte (Kachel) */
function KartenKachel({
  k,
  onClick,
  aktionen,
  entwurf,
  nurAbschnitt
}: {
  k: SprechKarte
  onClick?: () => void
  aktionen?: React.ReactNode
  entwurf?: boolean
  /** In der Gruppe Band › Unit nur den Abschnitt zeigen (21.10.2026) */
  nurAbschnitt?: boolean
}): React.JSX.Element {
  return (
    <Card withBorder radius="md" padding="sm" style={{ borderColor: entwurf ? 'var(--mantine-color-yellow-6)' : undefined }} data-sprechkarte={k.art}>
      <UnstyledButton onClick={onClick} style={{ display: 'block', width: '100%' }}>
        {k.art === 'monolog' &&
          (k.bilder[0] ? (
            <Image src={bildUrl(k.bilder[0])} h={110} radius="sm" fit="cover" alt="" mb={6} />
          ) : (
            <Group h={60} justify="center" mb={6} style={{ background: 'var(--mantine-color-default-hover)', borderRadius: 6 }}>
              <IconPhoto size={22} opacity={0.5} />
              <Text size="xs" c="dimmed">
                {entwurf ? 'Bild nach dem Speichern' : 'Bild wird erstellt …'}
              </Text>
            </Group>
          ))}
        <Text fw={700} size="sm" lineClamp={2}>
          {titelVon(k)}
        </Text>
        {nurAbschnitt ? (
          k.stand && (
            <Text size="xs" c="dimmed" data-sprechkarte-stand>
              {k.stand.abschnitt ?? 'ganze Unit'}
            </Text>
          )
        ) : (
          <StandZeile stand={k.stand} />
        )}
        <Text size="xs" c="dimmed" lineClamp={2}>
          {k.art === 'interview'
            ? `${k.fragen.length} Fragen · ${k.fragen[0] ?? ''}`
            : k.art === 'monolog'
              ? k.leitfragen.join(' · ')
              : `${k.form === 'infogap' ? 'Info-Gap' : k.form === 'diskussion' ? 'Diskussion' : 'Rollenspiel'} · ${k.situation}`}
        </Text>
      </UnstyledButton>
      {aktionen && (
        <Group gap={4} mt={6} justify="flex-end">
          {aktionen}
        </Group>
      )}
    </Card>
  )
}

/** Offene Gruppen (21.10.2026) – auf diesem Gerät gemerkt */
const OFFEN_SCHLUESSEL = 'sa-sprech-gruppen-offen'
function useOffen(): [Record<string, boolean>, (k: string, v: boolean) => void] {
  const [o, setO] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(OFFEN_SCHLUESSEL) ?? '{}') as Record<string, boolean>
    } catch {
      return {}
    }
  })
  const setze = (k: string, v: boolean): void =>
    setO((alt) => {
      const neu = { ...alt, [k]: v }
      try {
        localStorage.setItem(OFFEN_SCHLUESSEL, JSON.stringify(neu))
      } catch {
        /* ohne Speicher nur bis zum Neuladen */
      }
      return neu
    })
  return [o, setze]
}

/** Auf- und zuklappbare Gruppe Band › Unit mit Anzahl (21.10.2026) */
function Gruppe({ titel, anzahl, offen, umschalten, children }: { titel: string; anzahl: number; offen: boolean; umschalten: () => void; children: React.ReactNode }): React.JSX.Element {
  return (
    <div data-sprech-gruppe={titel}>
      <UnstyledButton onClick={umschalten} style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }} aria-expanded={offen}>
        {offen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        <Text size="sm" fw={700}>
          {titel}{' '}
          <Text span c="dimmed" size="sm">
            ({anzahl})
          </Text>
        </Text>
      </UnstyledButton>
      <Collapse expanded={offen}>
        <Stack gap="xs" mt={6}>
          {children}
        </Stack>
      </Collapse>
    </div>
  )
}

/** Eintrag einer Spalte: Entwurf der KI oder Karte im Pool */
type SpaltenEintrag = { e: Entwurf; p?: undefined } | { p: PoolKarte; e?: undefined }
const karteVon = (x: SpaltenEintrag): SprechKarte => (x.e ? x.e.karte : x.p.karte)

function Jahrgang({
  fach,
  jahrgang,
  pool,
  darfAlle,
  zurueck,
  laden
}: {
  fach: (typeof FAECHER)[number]
  jahrgang: number
  pool: PoolKarte[]
  darfAlle: boolean
  zurueck: () => void
  laden: () => void
}): React.JSX.Element {
  const settings = useAppSettings((s) => s.settings)
  const niveau = zielNiveau(fach.sprache, jahrgang)
  const [buecher, setBuecher] = useState<TextbookMeta[]>([])
  useEffect(() => void window.api.textbooks.list().then(setBuecher, () => setBuecher([])), [])
  const baende = buecher.filter((b) => b.language === fach.sprache && !b.platzhalter)
  const [modus, setModus] = useState<'lehrwerk' | 'klasse'>('lehrwerk')
  const vorschlag = baende.find((b) => b.grade === jahrgang && b.stateId === settings.defaults.stateId) ?? baende.find((b) => b.grade === jahrgang)
  // undefined = Vorschlag des Jahrgangs, null = leer gemacht: alle Karten, neue ohne Lehrwerk-Stand (21.10.2026)
  const [bandId, setBandId] = useState<string | null | undefined>(undefined)
  const band = bandId === null ? undefined : baende.find((b) => b.id === (bandId ?? vorschlag?.id))
  const [unit, setUnit] = useState<string | null>(null)
  const unitName = unit ?? band?.units[band.units.length - 1]?.name ?? null
  // Abschnitt der Unit (21.10.2026): leer = die ganze Unit
  const [abschnitt, setAbschnitt] = useState<string | null>(null)
  const abschnitte = band?.units.find((u) => u.name === unitName)?.sections.map((s) => s.name) ?? []
  const abschnittName = abschnitt && abschnitte.includes(abschnitt) ? abschnitt : null
  // Stand, der an neuen Karten gespeichert wird – sichtbar an jeder Karte und Grundlage der Sortierung
  const stand: SprechStand | undefined = band && unitName ? { band: band.name, unit: unitName, ...(abschnittName ? { abschnitt: abschnittName } : {}) } : undefined
  const [ansehen, setAnsehen] = useState<SprechKarte | null>(null)
  // Weitere Filter (21.10.2026): Suche über alle Spalten, eigene Karten, Bildkarten ohne Bild, Entwürfe
  const [suche, setSuche] = useState('')
  const [nurEigene, setNurEigene] = useState(false)
  const [ohneBild, setOhneBild] = useState(false)
  const [nurEntwuerfe, setNurEntwuerfe] = useState(false)
  const zusatzAktiv = Boolean(suche.trim()) || nurEigene || ohneBild || nurEntwuerfe
  const zuruecksetzen = (): void => (setSuche(''), setNurEigene(false), setOhneBild(false), setNurEntwuerfe(false))
  const [offen, setOffen] = useOffen()
  const passt = (x: SpaltenEintrag): boolean => {
    const k = karteVon(x)
    const s = suche.trim().toLowerCase()
    return (
      standBis(k.stand, stand, baende) &&
      (!s || [titelVon(k), k.art === 'dialog' ? k.situation : ''].join(' ').toLowerCase().includes(s)) &&
      (!nurEigene || Boolean(x.e || x.p?.eigene)) &&
      (!ohneBild || (k.art === 'monolog' && !k.bilder.length)) &&
      (!nurEntwuerfe || Boolean(x.e))
    )
  }
  // „Wie eine Klasse": eigene Lerngruppen dieser Sprache → Band und Unit des Kurses
  const [klassen, setKlassen] = useState<{ value: string; label: string }[]>([])
  const [klasse, setKlasse] = useState<string | null>(null)
  useEffect(() => {
    if (modus !== 'klasse') return
    void holen<{ klassen: { name: string; faecher: { id: string; fach: string }[] }[] }>('/server/klassen').then(
      (r) =>
        setKlassen(
          r.klassen.flatMap((k) => k.faecher.filter((f) => f.fach.toLowerCase() === fach.name.toLowerCase()).map((f) => ({ value: f.id, label: `${k.name} ${f.fach}` })))
        ),
      () => setKlassen([])
    )
  }, [modus, fach.name])
  useEffect(() => {
    if (modus !== 'klasse' || !klasse) return
    void (async () => {
      try {
        const d = await holen<{ klassenKurs?: string | null }>(`/server/klassen/${klasse}`)
        if (!d.klassenKurs) return
        const k = await holen<{ teile?: { buch?: string; unit?: string; zeit: number }[] }>(`/server/vokabeln/${d.klassenKurs}`)
        // Zuletzt freigegebener Abschnitt mit Band (Name wie „Green Line 3" – im Lehrwerk ggf. mit Zusatz)
        const letzte = (k.teile ?? []).filter((t) => t.buch).sort((a, b) => b.zeit - a.zeit)[0]
        const name = (letzte?.buch ?? '').toLowerCase()
        const b = name ? (baende.find((x) => x.name.toLowerCase() === name) ?? baende.find((x) => x.name.toLowerCase().startsWith(name))) : undefined
        if (b) {
          setBandId(b.id)
          setUnit(letzte?.unit ?? null)
          setAbschnitt(null)
        }
      } catch (e) {
        notifyError(e)
      }
    })()
  }, [modus, klasse]) // eslint-disable-line react-hooks/exhaustive-deps
  const lehrplan = useLehrplanVorschlaege(settings.defaults.stateId, settings.defaults.schoolTypeId, fach.id, jahrgang)
  const themen = useMemo(() => lehrplan.gruppen.flatMap((g) => [g.group, ...g.items]).slice(0, 30), [lehrplan])
  const entwuerfe = useEntwuerfe().filter((e) => e.sprache === fach.sprache && e.jahrgang === jahrgang)
  const [bearbeiten, setBearbeiten] = useState<{ p?: PoolKarte; e?: Entwurf } | null>(null)
  const [druck, setDruck] = useState(false)

  const erstellen = (teil: (typeof TEILE)[number]): void => {
    const vorhanden = pool.filter((p) => p.teil === teil.id).map((p) => titelVon(p.karte))
    void starteAuftrag({
      moduleId: 'sprechpruefungen',
      docId: 'sprechpruefungen',
      titel: `${teil.knopf.replace('+ ', '')} · ${fach.name} Jg ${jahrgang}`,
      art: 'Sprechkarten',
      eingabe: { teil: teil.id, anzahl: teil.anzahl, bandId: band?.id ?? null, unitName, abschnitt: abschnittName, stand, vorhanden },
      sperrt: false,
      fehlerTitel: 'Karten konnten nicht erstellt werden',
      arbeit: async (e, k) => {
        k.melde('Grundlage wird zusammengestellt …')
        let woerter: string[] = []
        let bekannt: string[] = []
        let neu: string[] = []
        let quelle = ''
        if (e.bandId && e.unitName) {
          const voll: Textbook = await window.api.textbooks.get(e.bandId)
          // Bis zum Abschnitt: sein Wortschatz zählt mit, seine Grammatik gilt als gerade gelernt (21.10.2026)
          const kv = await collectKnownVocab(voll, e.unitName, e.abschnitt ? [e.abschnitt] : [], jahrgang, buecher, (id) => window.api.textbooks.get(id))
          const dazu = e.abschnitt
            ? (voll.units.find((u) => u.name === e.unitName)?.sections.find((s) => s.name === e.abschnitt)?.entries.map((x) => x.term) ?? [])
            : []
          woerter = [...new Set([...(kv?.words ?? []), ...dazu])]
          quelle = kv?.source ?? ''
          const gs = grammatikStand(kv)
          bekannt = gs?.bekannt ?? []
          neu = gs?.neu ?? []
        }
        const g: Grundlage = { sprache: fach.sprache, jahrgang, niveau, quelle, woerter, grammatikBekannt: bekannt, grammatikNeu: neu, themen }
        k.melde('Die KI schreibt die Karten …')
        const r = await k.ai<{ karten: Record<string, unknown>[] }>(kartenAnfrage(e.teil, e.anzahl, g, e.vorhanden))
        return (r.karten ?? []).map((x, i) => ({ ...x, art: e.teil, id: `e${Date.now().toString(36)}${i}`, bilder: [], ...(e.stand ? { stand: e.stand } : {}) }))
      },
      ablegen: async (karten) => {
        speichereEntwuerfe([
          ...ladeEntwuerfe(),
          ...karten.map((karte) => ({ schluessel: String(karte.id), sprache: fach.sprache, jahrgang, teil: teil.id, karte: karte as unknown as Entwurf['karte'] }))
        ])
      },
      abschluss: (karten) => `${karten.length} Karten zum Durchsehen in „Sprechprüfungen"`
    })
    notifySuccess('Die KI erstellt die Karten im Hintergrund – danach hier durchsehen und speichern.')
  }

  const speichern = async (teil: KartenTeil, karte: SprechKarte, id?: string, bildPrompt?: string): Promise<void> => {
    try {
      const r = await senden<{ id: string }>('/server/sprech-bank/speichern', { id, sprache: fach.sprache, jahrgang, teil, karte })
      if (teil === 'monolog' && bildPrompt && !(karte as BildKarte).bilder.length)
        bildErzeugen({ id: r.id, sprache: fach.sprache, jahrgang, teil, karte, eigene: true }, bildPrompt, laden)
      laden()
    } catch (e) {
      notifyError(e)
    }
  }
  const entwurfWeg = (s: string): void => speichereEntwuerfe(ladeEntwuerfe().filter((x) => x.schluessel !== s))
  const loeschen = (p: PoolKarte): void => void senden('/server/sprech-bank/loeschen', { id: p.id }).then(laden, (e: unknown) => notifyError(e))

  /** Kachel eines Eintrags – Entwurf mit Speichern/Verwerfen, Karte mit Bearbeiten oder Ansehen */
  const kachel = (x: SpaltenEintrag): React.JSX.Element => {
    if (x.e) {
      const e = x.e
      return (
        <KartenKachel
          nurAbschnitt
          key={e.schluessel}
          k={e.karte}
          entwurf
          onClick={() => setBearbeiten({ e })}
          aktionen={
            <>
              <Badge color="yellow" variant="light" size="xs">
                Entwurf
              </Badge>
              <Button
                size="compact-xs"
                onClick={() => {
                  void speichern(e.teil, { ...e.karte, id: '' } as SprechKarte, undefined, e.karte.bildPrompt)
                  entwurfWeg(e.schluessel)
                }}
                data-entwurf-speichern
              >
                Speichern
              </Button>
              <Button size="compact-xs" variant="subtle" color="red" onClick={() => entwurfWeg(e.schluessel)}>
                Verwerfen
              </Button>
            </>
          }
        />
      )
    }
    const p = x.p
    return (
      <KartenKachel
        nurAbschnitt
        key={p.id}
        k={p.karte}
        onClick={() => (p.eigene || darfAlle ? setBearbeiten({ p }) : setAnsehen(p.karte))}
        aktionen={
          p.eigene || darfAlle ? (
            <>
              <Button size="compact-xs" variant="subtle" leftSection={<IconPencil size={12} />} onClick={() => setBearbeiten({ p })}>
                Bearbeiten
              </Button>
              <Button size="compact-xs" variant="subtle" color="red" leftSection={<IconTrash size={12} />} onClick={() => loeschen(p)}>
                Löschen
              </Button>
            </>
          ) : undefined
        }
      />
    )
  }
  const alle: SpaltenEintrag[] = [...entwuerfe.map((e) => ({ e })), ...pool.map((p) => ({ p }))]
  const gesamt = alle.length
  const gezeigt = alle.filter(passt).length
  const fuerStand = standText(stand) ? `Neue Karten: ${standText(stand)}` : 'Neue Karten ohne Lehrwerk-Stand'

  return (
    <Stack gap="md" data-sprech-jahrgang={jahrgang}>
      <Group justify="space-between">
        <Group gap="xs">
          <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={zurueck} px={4}>
            Alle Jahrgänge
          </Button>
          <Title order={3}>
            {fach.name} · Jahrgang {jahrgang}
          </Title>
          <Badge variant="light">GER {niveau}</Badge>
        </Group>
        <Button leftSection={<IconPrinter size={16} />} variant="light" onClick={() => setDruck(true)} disabled={!pool.length} data-pruefungsset-knopf>
          Prüfungsset drucken
        </Button>
      </Group>
      {/* Filter getrennt vom Erstellen (21.10.2026): der Stand filtert die Karten und gilt für neue Karten und das Prüfungsset */}
      <Card withBorder radius="md" padding="sm" data-sprech-filter>
        <Group gap={6} mb={6}>
          <IconFilter size={16} />
          <Text fw={700} size="sm">
            Bis Lehrwerk-Stand
          </Text>
        </Group>
        <Group gap="md" align="flex-end" wrap="wrap">
          <SegmentedControl
            value={modus}
            onChange={(v) => setModus(v as 'lehrwerk' | 'klasse')}
            data={[
              { value: 'lehrwerk', label: 'Lehrwerk bis …' },
              { value: 'klasse', label: 'Wie eine Klasse' }
            ]}
          />
          {modus === 'klasse' && (
            <Select label="Klasse" leftSection={<IconUsers size={14} />} data={klassen} value={klasse} onChange={setKlasse} placeholder="wählen …" w={200} />
          )}
          <Select
            label="Band"
            data={baende.map((b) => ({ value: b.id, label: b.name }))}
            value={band?.id ?? null}
            onChange={(v) => (setBandId(v), setUnit(null), setAbschnitt(null))}
            w={200}
            clearable
            placeholder={baende.length ? 'alle Karten' : 'kein Lehrwerk'}
          />
          <Select
            label="bis"
            data={(band?.units ?? []).map((u) => u.name)}
            value={band ? unitName : null}
            onChange={(v) => (setUnit(v), setAbschnitt(null))}
            w={140}
            disabled={!band}
          />
          <Select
            label="Abschnitt"
            data={abschnitte}
            value={abschnittName}
            onChange={setAbschnitt}
            placeholder="ganze Unit"
            clearable
            w={170}
            disabled={!abschnitte.length}
            data-sprech-abschnitt
          />
          <Text size="xs" c="dimmed" maw={360}>
            {stand
              ? `Gezeigt werden Karten ${standText(stand)}. Neue Karten entstehen für diesen Stand (Wortschatz und Grammatik bis hierhin, dazu ${themen.length} Lehrplan-Themen des Jahrgangs); das Prüfungsset nutzt ihn ebenfalls.`
              : `Ohne Lehrwerk-Stand: alle Karten. Neue Karten entstehen ohne Lehrwerk-Stand, nur nach den ${themen.length} Lehrplan-Themen des Jahrgangs.`}
          </Text>
        </Group>
        <Group gap="md" align="center" wrap="wrap" mt="sm">
          <TextInput
            leftSection={<IconSearch size={14} />}
            placeholder="Suche (Titel, Thema, Situation)"
            value={suche}
            onChange={(e) => setSuche(e.currentTarget.value)}
            w={260}
            data-sprech-suche
          />
          <Checkbox label="Nur eigene Karten" checked={nurEigene} onChange={(e) => setNurEigene(e.currentTarget.checked)} data-sprech-nur-eigene />
          <Checkbox label="Bildkarten ohne Bild" checked={ohneBild} onChange={(e) => setOhneBild(e.currentTarget.checked)} data-sprech-ohne-bild />
          <Checkbox label="Nur Entwürfe" checked={nurEntwuerfe} onChange={(e) => setNurEntwuerfe(e.currentTarget.checked)} data-sprech-nur-entwuerfe />
          {gezeigt < gesamt && (
            <Text size="sm" c="dimmed" data-sprech-anzahl>
              {gezeigt} von {gesamt} Karten
            </Text>
          )}
          {zusatzAktiv && (
            <Anchor component="button" size="sm" onClick={zuruecksetzen} data-sprech-filter-zuruecksetzen>
              Filter zurücksetzen
            </Anchor>
          )}
        </Group>
      </Card>
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        {TEILE.map((t) => {
          // Gruppen Band › Unit in Buchfolge, innen nach Abschnitt (21.10.2026)
          const eintraege = alle.filter((x) => (x.e ? x.e.teil : x.p.teil) === t.id)
          const sichtbar = eintraege.filter(passt)
          const gruppen: StandGruppe<SpaltenEintrag>[] = gruppiere(sichtbar, (x) => karteVon(x).stand, baende)
          const standGruppen = gruppen.filter((g) => g.schluessel !== OHNE_STAND)
          // Offen: die Gruppe des gewählten Stands, sonst die späteste – ohne Stände die Gruppe ohne Stand
          const vorOffen = (standGruppen.find((g) => stand && g.schluessel === `${stand.band} › ${stand.unit}`) ?? standGruppen[standGruppen.length - 1] ?? gruppen[0])
            ?.schluessel
          const offenSchluessel = (g: string): string => `${fach.sprache}|${jahrgang}|${t.id}|${g}`
          return (
            <Stack key={t.id} gap="xs" data-sprech-spalte={t.id}>
              <Group justify="space-between" gap="xs">
                <Text fw={800}>
                  {t.name}{' '}
                  <Text span c="dimmed" size="sm">
                    ({sichtbar.length === eintraege.length ? eintraege.length : `${sichtbar.length} von ${eintraege.length}`})
                  </Text>
                </Text>
              </Group>
              <Group gap={4}>
                <Tooltip label={fuerStand}>
                  <Button size="xs" variant="light" color="violet" leftSection={<IconSparkles size={14} />} onClick={() => erstellen(t)} data-sprech-erstellen={t.id}>
                    {t.knopf}
                  </Button>
                </Tooltip>
                <Tooltip label={fuerStand}>
                  <Button
                  size="xs"
                  variant="subtle"
                  leftSection={<IconPlus size={14} />}
                  onClick={() =>
                    setBearbeiten({
                      p: {
                        id: '',
                        sprache: fach.sprache,
                        jahrgang,
                        teil: t.id,
                        eigene: true,
                        karte:
                          t.id === 'interview'
                            ? ({ art: 'interview', id: '', thema: '', fragen: [], stand } as InterviewKarte)
                            : t.id === 'monolog'
                              ? ({ art: 'monolog', id: '', titel: '', bilder: [], bildBeschreibung: '', leitfragen: [], stand } as BildKarte)
                              : ({ art: 'dialog', id: '', form: 'rollenspiel', titel: '', situation: '', rolleSchueler: '', rolleKi: '', punkte: [], ziel: '', stand } as DialogKarte)
                      }
                    })
                  }
                  >
                    Von Hand
                  </Button>
                </Tooltip>
              </Group>
              {gruppen.map((g) => {
                const o = offen[offenSchluessel(g.schluessel)] ?? g.schluessel === vorOffen
                return (
                  <Gruppe key={g.schluessel} titel={g.titel} anzahl={g.eintraege.length} offen={o} umschalten={() => setOffen(offenSchluessel(g.schluessel), !o)}>
                    {g.eintraege.map(kachel)}
                  </Gruppe>
                )
              })}
              {!sichtbar.length && (
                <Text size="sm" c="dimmed">
                  {eintraege.length ? 'Keine Karte passt zum Filter.' : 'Noch keine Karten.'}
                </Text>
              )}
            </Stack>
          )
        })}
      </SimpleGrid>
      {bearbeiten && (
        <KartenEditor
          k={(bearbeiten.p?.karte ?? bearbeiten.e!.karte) as SprechKarte}
          aktuell={stand}
          schliessen={() => setBearbeiten(null)}
          speichern={(k) => {
            const teil = (bearbeiten.p?.teil ?? bearbeiten.e!.teil) as KartenTeil
            if (bearbeiten.e) {
              void speichern(teil, k, undefined, bearbeiten.e.karte.bildPrompt)
              entwurfWeg(bearbeiten.e.schluessel)
            } else void speichern(teil, k, bearbeiten.p?.id || undefined, teil === 'monolog' && !(k as BildKarte).bilder.length ? (k as BildKarte).bildBeschreibung : undefined)
            setBearbeiten(null)
          }}
        />
      )}
      {ansehen && <KartenAnsicht k={ansehen} schliessen={() => setAnsehen(null)} />}
      {druck && (
        <DruckDialog fach={fach} jahrgang={jahrgang} pool={pool.filter((p) => standBis(p.karte.stand, stand, baende))} stand={stand} baende={baende} schliessen={() => setDruck(false)} />
      )}
    </Stack>
  )
}

function DruckDialog({
  fach,
  jahrgang,
  pool,
  stand,
  baende,
  schliessen
}: {
  fach: (typeof FAECHER)[number]
  jahrgang: number
  /** Nur Karten bis zum gewählten Stand */
  pool: PoolKarte[]
  stand?: SprechStand
  baende: TextbookMeta[]
  schliessen: () => void
}): React.JSX.Element {
  // Gruppiert nach Band › Unit, in Buchfolge; mit Abschnitt im Namen (21.10.2026)
  const von = (teil: KartenTeil): { group: string; items: { value: string; label: string }[] }[] =>
    gruppiere(
      pool.filter((p) => p.teil === teil),
      (p) => p.karte.stand,
      baende
    ).map((g) => ({
      group: g.titel,
      items: g.eintraege.map((p) => ({ value: p.id, label: [titelVon(p.karte), p.karte.stand?.abschnitt].filter(Boolean).join(' · ') }))
    }))
  // Vorauswahl: die Karten mit dem spätesten Stand bis zum gewählten
  const erste = (teil: KartenTeil, n = 0): string | null =>
    spaetesteBis(
      pool.filter((p) => p.teil === teil),
      (p) => p.karte.stand,
      stand,
      baende
    )[n]?.id ?? null
  const [i, setI] = useState(erste('interview'))
  const [a, setA] = useState(erste('monolog'))
  const [b, setB] = useState(erste('monolog', 1) ?? erste('monolog'))
  const [d, setD] = useState(erste('dialog'))
  const karte = <T,>(id: string | null): T | undefined => pool.find((p) => p.id === id)?.karte as T | undefined
  return (
    <Modal opened onClose={schliessen} title={`Prüfungsset drucken – ${fach.name} Jg ${jahrgang}`}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Für ein Prüflingspaar: Prüferblatt, Kandidatenkarten A und B und zwei Bewertungsbögen (30 Punkte).{' '}
          {stand ? `Zur Auswahl stehen die Karten ${standText(stand)}.` : 'Zur Auswahl stehen alle Karten.'}
        </Text>
        <Select label="Interview-Set" data={von('interview')} value={i} onChange={setI} clearable />
        <Select label="Bildkarte Kandidat/in A" data={von('monolog')} value={a} onChange={setA} clearable />
        <Select label="Bildkarte Kandidat/in B" data={von('monolog')} value={b} onChange={setB} clearable />
        <Select label="Dialogkarte" data={von('dialog')} value={d} onChange={setD} clearable />
        <Button
          leftSection={<IconPrinter size={16} />}
          onClick={() =>
            drucken(
              pruefungsSetHtml({
                fach: fach.name,
                jahrgang,
                niveau: zielNiveau(fach.sprache, jahrgang),
                interview: karte<InterviewKarte>(i),
                monologA: karte<BildKarte>(a),
                monologB: karte<BildKarte>(b),
                dialog: karte<DialogKarte>(d),
                bildUrl: (x) => `${window.location.origin}${bildUrl(x)}`
              })
            )
          }
          data-pruefungsset-drucken
        >
          Drucken
        </Button>
      </Stack>
    </Modal>
  )
}

export default function SprechpruefungenModule({ active }: { active: boolean }): React.JSX.Element | null {
  const eigene = useAppSettings((s) => s.settings.eigeneFaecher)
  const faecher = FAECHER.filter((f) => !eigene?.length || eigene.includes(f.id))
  const [fachId, setFachId] = useState<string>(faecher[0]?.id ?? 'englisch')
  const fach = FAECHER.find((f) => f.id === fachId) ?? FAECHER[0]
  const [daten, setDaten] = useState<{ karten: PoolKarte[]; darfAlle: boolean } | null>(null)
  const [jahrgang, setJahrgang] = useState<number | null>(null)
  const [buecher, setBuecher] = useState<TextbookMeta[]>([])
  const laden = useCallback(() => {
    void holen<{ karten: PoolKarte[]; darfAlle: boolean }>(`/server/sprech-bank?sprache=${fach.sprache}`).then(setDaten, (e: unknown) => (notifyError(e), setDaten({ karten: [], darfAlle: false })))
  }, [fach.sprache])
  useEffect(() => {
    if (active) laden()
  }, [active, laden])
  useEffect(() => void window.api.textbooks.list().then(setBuecher, () => setBuecher([])), [])
  if (!active) return null
  const jahrgaenge = Array.from({ length: 13 - fach.ab + 1 }, (_, i) => fach.ab + i)
  const weitester = (l: PoolKarte[]): SprechStand | undefined =>
    l
      .map((x) => x.karte.stand)
      .filter((x): x is SprechStand => Boolean(x))
      .sort((x, y) => nachStand(x, y, buecher))
      .pop()
  return (
    <Container size="xl" py="lg" data-sprechpruefungen>
      <Group gap="sm" mb="md">
        <IconMicrophone size={26} />
        <div>
          <Title order={2}>Sprechprüfungen</Title>
          <Text size="sm" c="dimmed">
            Material je Jahrgang für die Sprechprüfung und das Sprechtraining der Lernenden – für die ganze Fachschaft.
          </Text>
        </div>
      </Group>
      {faecher.length > 1 && (
        <Tabs value={fachId} onChange={(v) => v && (setFachId(v), setJahrgang(null))} mb="md">
          <Tabs.List>
            {faecher.map((f) => (
              <Tabs.Tab key={f.id} value={f.id} data-sprech-fach={f.id}>
                {f.name}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      )}
      {!daten ? (
        <Loader />
      ) : jahrgang ? (
        <Jahrgang fach={fach} jahrgang={jahrgang} pool={daten.karten.filter((k) => k.jahrgang === jahrgang)} darfAlle={daten.darfAlle} zurueck={() => setJahrgang(null)} laden={laden} />
      ) : (
        <>
          <Alert variant="light" mb="md" p="xs">
            <Text size="sm">
              Jahrgang auswählen. Die Punkte zeigen, wie viele Karten es je Teil gibt (grau = keine, orange = wenige, grün = genug zum Üben).
            </Text>
          </Alert>
          <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }} spacing="md">
            {jahrgaenge.map((j) => {
              const k = daten.karten.filter((x) => x.jahrgang === j)
              const band = buecher.find((b) => b.language === fach.sprache && b.grade === j && !b.platzhalter)
              return (
                <UnstyledButton key={j} onClick={() => setJahrgang(j)} data-sprech-jahrgang-kachel={j}>
                  <Card withBorder radius="md" padding="md" h="100%">
                    <Stack gap={6} align="center">
                      {band ? <BandCover band={band} land={band.stateId ?? ''} breite={56} /> : <IconMicrophone size={40} opacity={0.4} />}
                      <Text fw={800}>Jahrgang {j}</Text>
                      <Badge variant="light">GER {zielNiveau(fach.sprache, j)}</Badge>
                      <Group gap={6}>
                        {TEILE.map((t) => {
                          const n = k.filter((x) => x.teil === t.id).length
                          return (
                            <div
                              key={t.id}
                              title={`${t.name}: ${n}`}
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                background: n >= 3 ? 'var(--mantine-color-teal-6)' : n > 0 ? 'var(--mantine-color-orange-5)' : 'var(--mantine-color-gray-4)'
                              }}
                              data-ampel={`${t.id}:${n}`}
                            />
                          )
                        })}
                      </Group>
                      <Text size="xs" c="dimmed">
                        {k.length} Karten
                      </Text>
                      {/* Wie weit der Pool reicht (21.10.2026): der späteste Lehrwerk-Stand seiner Karten */}
                      {weitester(k) && (
                        <Text size="xs" c="dimmed" ta="center" data-sprech-pool-stand>
                          {standText(weitester(k))}
                        </Text>
                      )}
                    </Stack>
                  </Card>
                </UnstyledButton>
              )
            })}
          </SimpleGrid>
        </>
      )}
    </Container>
  )
}
