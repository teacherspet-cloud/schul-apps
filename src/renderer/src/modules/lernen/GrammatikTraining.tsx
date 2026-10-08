/**
 * App „Grammatiktraining" (06.10.2026, abgestimmt mit der Lehrkraft) – Grundgerüst wie „Vokabeltraining".
 *
 *  - Freigeben: Fach (Fremdsprachen der Lehrkraft), Jahrgang, Thema aus dem Lehrplan-Katalog (oder eigenes), dazu
 *    Lerngruppe / Einzelne / QR-Code. Der Aufgabenpool entsteht im Hintergrund mit dem eigenen KI-Zugang
 *    (lernen/grammatikErzeugen.ts) und steht danach hier als Entwurf: kurz ansehen, einzelne Aufgaben streichen,
 *    freigeben. Freigegeben wird nie ungesehen.
 *  - Lernstand je Person (sicher / heute fällig / aktiv in den letzten 7 Tagen), Problemaufgaben, Regelkarten.
 */
import { AlleOptionen, NurExperte, OptionenBereich } from '../../shared/components/NurExperte'
import { useDokumentOeffner, useRueckweg } from '../../shared/navigation'
import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Checkbox,
  Container,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  Progress,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  UnstyledButton
} from '@mantine/core'
import { IconArrowLeft, IconPlus, IconQrcode, IconSparkles, IconTrash } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { type GrammatikPaket } from '@shared/grammatiktrainer'
import { AppKopf, useProgrammFarbe } from '../../shared/components/AppKopf'
import { ListenSuche } from '../../shared/components/AppSuche'
import { starteAuftrag } from '../../shared/auftraege'
import { useAppSettings } from '../../shared/settingsStore'
import HaeufigSelect from '../../shared/components/HaeufigSelect'
import { notifyError, notifySuccess } from '../../shared/util'
import { GRAMMAR_TOPICS, hasGrammar, teilformenAuftrag } from '../arbeitsblatt/didactics/grammar'
import GrammatikAuswahl from '../arbeitsblatt/steps/GrammatikAuswahl'
import { SUBJECTS } from '../arbeitsblatt/model/subjects'
import { Zugang } from '../onlinetest/OnlinetestModule'
import { holen, senden } from '../onlinetest/serverApi'
import { useAlleLernenden } from './LernendeWahl'
import { VerbFreigabe } from './VerbFreigabe'
import { istVerbSprache, type VerbEintrag } from '@shared/verben'
import { formSpalten, verbAufgaben, verbKarten } from '@shared/verbTraining'
import { VokabelQuelle, type VokabelAuswahl } from './VokabelQuelle'
import { AufgabenEditor } from './kurs/AufgabenEditor'
import { grundwortschatzBis } from '@shared/lateinGrundwortschatz'
import { erzeugeGrammatikPaket, lateinLernjahr } from './grammatikErzeugen'
import { ausFeld, useLerngruppen } from './VokabelTraining'

interface Zuweisung {
  id: string
  titel: string
  fach: string
  thema: string
  lerngruppe: string
  aufgaben: number
  lernende: number
  sicherSchnitt: number
  status: string
  erstellt: string
  code?: string
  link?: string
}

/** Fertig erzeugt, noch nicht freigegeben – auf diesem Gerät gemerkt */
export interface Entwurf {
  schluessel: string
  titel: string
  fach: string
  sprache: string
  thema: string
  empfaenger: {
    lerngruppeId: string
    schueler: string[]
    gaeste: boolean
    bis: number | null
    gruppe: string
    vokId?: string
    /** Extra (Förder/Forder, 08.10.2026): für wen (Nutzer-Kennungen) und wer dieselbe Schwäche/Stärke hat */
    art?: 'foerder' | 'forder'
    fuer?: { id: string; name: string }[]
    gleiche?: { id: string; name: string }[]
  }
  /** Angaben der Freigabe (Themen, Teilformen, Klasse, Lehrwerk – 08.10.2026) */
  info?: { themen: string[]; teilformen: string[]; jahrgang?: number; lehrwerk?: { buch?: string; unit?: string }; fuerRegeln?: string[] }
  paket: GrammatikPaket
}

const ENTWUERFE = 'grammatik-entwuerfe'
const EREIGNIS = 'grammatik-entwuerfe'
export const ladeEntwuerfe = (): Entwurf[] => {
  try {
    return JSON.parse(localStorage.getItem(ENTWUERFE) ?? '[]') as Entwurf[]
  } catch {
    return []
  }
}
export const speichereEntwuerfe = (l: Entwurf[]): void => {
  try {
    localStorage.setItem(ENTWUERFE, JSON.stringify(l))
  } catch {
    // ohne Speicher bleibt der Entwurf nur bis zum Neuladen
  }
  window.dispatchEvent(new Event(EREIGNIS))
}
export function useEntwuerfe(): Entwurf[] {
  const [l, setL] = useState(ladeEntwuerfe)
  useEffect(() => {
    const neu = (): void => setL(ladeEntwuerfe())
    window.addEventListener(EREIGNIS, neu)
    return () => window.removeEventListener(EREIGNIS, neu)
  }, [])
  return l
}

/**
 * Sprachfächer mit Grammatik-Katalog (auch Latein, Griechisch, Deutsch, DaZ): alle, die eigenen der Lehrkraft zuerst.
 * Seit 07.10.2026 bleiben die übrigen wählbar (Fachfeld: im Standardmodus nur die eigenen, weitere per Eintippen);
 * verglichen wird über die Kennung – vorher über den Namen, und „DaZ" galt so nie als eigenes Fach.
 */
const SPRACHE_OHNE_FS: Record<string, string> = { latein: 'la', griechisch: 'grc', deutsch: 'de', daz: 'de' }
function useSprachFaecher(): { id: string; label: string; sprache: string }[] {
  const eigene = useAppSettings((s) => s.settings.eigeneFaecher)
  return useMemo(() => {
    const alle = SUBJECTS.filter((s) => hasGrammar(s.id)).map((s) => ({
      id: s.id,
      label: s.label,
      sprache: s.foreignLanguage ?? SPRACHE_OHNE_FS[s.id] ?? 'de'
    }))
    const meine = new Set(eigene ?? [])
    return [...alle.filter((s) => meine.has(s.id)), ...alle.filter((s) => !meine.has(s.id))]
  }, [eigene])
}

export function GrammatiktrainingModule({ active }: { active: boolean }): React.JSX.Element | null {
  const [liste, setListe] = useState<Zuweisung[] | null>(null)
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const [neu, setNeu] = useState(false)
  // openDocument('grammatiktraining', id) – z. B. aus „Meine Klassen" (06.10.2026)
  useDokumentOeffner('grammatiktraining', async (id) => setGewaehlt(id))
  const [suche, setSuche] = useState('')
  const [ansehen, setAnsehen] = useState<Entwurf | null>(null)
  const [qr, setQr] = useState<Zuweisung | null>(null)
  const entwuerfe = useEntwuerfe()
  const farbe = useProgrammFarbe()
  const laden = useCallback(() => {
    void holen<{ zuweisungen: Zuweisung[] }>('/server/grammatik').then(
      (d) => setListe(d.zuweisungen),
      () => setListe([])
    )
  }, [])
  useEffect(() => {
    if (active) laden()
  }, [active, laden])
  if (!active) return null
  const q = suche.trim().toLowerCase()
  const sichtbar = (liste ?? []).filter((z) => !q || `${z.titel} ${z.fach} ${z.lerngruppe} ${z.thema}`.toLowerCase().includes(q))
  return (
    <Container size="xl" py="lg" data-grammatiktraining>
      <AppKopf
        beschreibung="Grammatikthemen zum Üben freigeben – mit Regelkarten und Aufgaben im Karteikasten der Lern-App, dazu Spiele. Hier steht der Lernstand."
        hauptknopf={
          <Button leftSection={<IconPlus size={16} />} radius="md" color={farbe} onClick={() => setNeu(true)} data-grammatik-freigeben>
            Grammatik freigeben
          </Button>
        }
        suche={<ListenSuche wert={suche} setzen={setSuche} platzhalter="Thema, Fach, Lerngruppe …" />}
      />
      {neu && <Freigeben schliessen={() => setNeu(false)} />}
      {ansehen && (
        <EntwurfAnsehen
          e={ansehen}
          schliessen={() => setAnsehen(null)}
          fertig={() => {
            setAnsehen(null)
            laden()
          }}
        />
      )}
      {qr?.code && qr.link && (
        <Modal opened onClose={() => setQr(null)} title={qr.titel} size="lg">
          <Zugang code={qr.code} link={qr.link} />
        </Modal>
      )}
      {gewaehlt ? (
        <Lernstand id={gewaehlt} zurueck={() => (setGewaehlt(null), laden())} />
      ) : (
        <Stack>
          {entwuerfe.length > 0 && (
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              {entwuerfe.map((e) => (
                <Card key={e.schluessel} withBorder radius="md" style={{ borderColor: 'var(--mantine-color-teal-6)' }} data-grammatik-entwurf>
                  <Badge color="teal" mb={6}>
                    fertig – noch nicht freigegeben
                  </Badge>
                  <Text fw={700}>{e.titel}</Text>
                  <Text size="sm" c="dimmed" mb="sm">
                    {e.paket.regeln.length} Regelkarten · {e.paket.aufgaben.length} Aufgaben · für {e.empfaenger.gruppe}
                  </Text>
                  <Group gap="xs">
                    <Button size="xs" onClick={() => setAnsehen(e)} data-entwurf-ansehen>
                      Ansehen und freigeben
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() => speichereEntwuerfe(ladeEntwuerfe().filter((x) => x.schluessel !== e.schluessel))}
                    >
                      Verwerfen
                    </Button>
                  </Group>
                </Card>
              ))}
            </SimpleGrid>
          )}
          {!liste ? (
            <Center h="30vh">
              <Loader />
            </Center>
          ) : liste.length === 0 && !entwuerfe.length ? (
            <Alert title="Noch kein Grammatiktraining">
              Mit „Grammatik freigeben“ ein Thema wählen – die KI erstellt Regelkarten und rund 40 Aufgaben, die vor dem Freigeben angesehen werden.
            </Alert>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
              {sichtbar.map((z) => (
                <Card key={z.id} withBorder radius="md" padding="md" data-grammatik-zuweisung={z.titel}>
                  <UnstyledButton onClick={() => setGewaehlt(z.id)} style={{ display: 'block', width: '100%' }}>
                    <Group justify="space-between" wrap="nowrap">
                      <Text fw={700}>{z.titel}</Text>
                      {z.status !== 'offen' && <Badge color="gray">beendet</Badge>}
                    </Group>
                    <Text size="sm" c="dimmed">
                      {z.fach} · {z.lerngruppe} · {z.aufgaben} Aufgaben · {z.lernende} Lernende
                    </Text>
                    <Progress mt={8} value={z.sicherSchnitt * 100} radius="xl" color="grape" />
                    <Text size="xs" c="dimmed" mt={4}>
                      im Schnitt {Math.round(z.sicherSchnitt * 100)} % sicher
                    </Text>
                  </UnstyledButton>
                  {z.code && (
                    <Button mt="xs" size="xs" variant="light" leftSection={<IconQrcode size={14} />} onClick={() => setQr(z)}>
                      QR-Code
                    </Button>
                  )}
                </Card>
              ))}
            </SimpleGrid>
          )}
        </Stack>
      )}
    </Container>
  )
}

/** Vorbelegung aus einem Vokabeltraining (08.10.2026): Empfänger = dessen Lernende, Fach und Unit wie dort */
export interface GrammatikVorgabe {
  vokId: string
  titel: string
  sprache?: string
  lehrwerk?: { buch?: string; unit?: string }
}

export function Freigeben({ schliessen, vorgabe }: { schliessen: () => void; vorgabe?: GrammatikVorgabe }): React.JSX.Element {
  const faecher = useSprachFaecher()
  const { settings } = useAppSettings()
  const [fachId, setFachId] = useState<string | null>((vorgabe?.sprache && faecher.find((f) => f.sprache === vorgabe.sprache)?.id) || (faecher[0]?.id ?? null))
  const [jahrgang, setJahrgang] = useState<number>(6)
  const [themenIds, setThemenIds] = useState<string[]>([])
  const [eigenes, setEigenes] = useState('')
  const [wunsch, setWunsch] = useState('')
  /*
   * Wortschatz der Aufgaben (07.10.2026, abgestimmt für Latein, gilt für alle Sprachen): frei (zur Klasse passend),
   * mitgelieferter Grundwortschatz (Latein) oder aus Lehrwerk bzw. eigener Vokabelliste.
   */
  const [wortArt, setWortArt] = useState<'frei' | 'grund' | 'liste'>('frei')
  const [wortListe, setWortListe] = useState<VokabelAuswahl | null>(null)
  const [art, setArt] = useState<'gruppe' | 'einzeln' | 'code' | 'vok'>(vorgabe ? 'vok' : 'gruppe')
  // Lernende eines Vokabeltrainings – fest verbunden (08.10.2026)
  const [vokId, setVokId] = useState<string | null>(vorgabe?.vokId ?? null)
  const [vokListe, setVokListe] = useState<{ id: string; titel: string; lerngruppe: string }[]>(
    vorgabe ? [{ id: vorgabe.vokId, titel: vorgabe.titel, lerngruppe: '' }] : []
  )
  useEffect(() => {
    if (art !== 'vok' || vokListe.length > 1) return
    void holen<{ zuweisungen: { id: string; titel: string; lerngruppe: string; status: string }[] }>('/server/vokabeln').then(
      (r) => setVokListe(r.zuweisungen.filter((z) => z.status === 'offen')),
      () => undefined
    )
  }, [art]) // eslint-disable-line react-hooks/exhaustive-deps
  // Unregelmäßige Verben statt Grammatikthema (07.10.2026) – ohne KI aus der Verbliste
  const [modus, setModus] = useState<'thema' | 'verben'>('thema')
  const [verbWahl, setVerbWahl] = useState<{ verben: VerbEintrag[]; titel: string }>({ verben: [], titel: '' })
  const [gruppe, setGruppe] = useState<string | null>(null)
  const [einzelne, setEinzelne] = useState<string[]>([])
  const [qr, setQr] = useState(false)
  const [bis, setBis] = useState('')
  const { gruppen } = useLerngruppen()
  const alleLernenden = useAlleLernenden()
  const fach = faecher.find((f) => f.id === fachId)
  /*
   * Themenauswahl wie im Arbeitsblatt (GrammatikAuswahl, abgestimmt 06.10.2026). Seit 07.10.2026 mehrere Themen
   * (Wunsch der Lehrkraft); mit Band und Unit schlägt die App die Grammatik der Unit gleich vor.
   */
  const [eigenesAn, setEigenesAn] = useState(false)
  const gewaehlteThemen = eigenesAn ? [] : themenIds.map((id) => GRAMMAR_TOPICS.find((t) => t.id === id && t.subject === fachId)).filter((t) => t !== undefined)
  const thema = eigenesAn ? eigenes.trim() : gewaehlteThemen.map((t) => t.label).join(' · ')
  // Teilformen des Themas (Recherche 06.10.2026): keine gewählt = alle, die zur Klasse passen
  const [teilWahl, setTeilWahl] = useState<string[]>([])
  const query = { subjectId: fachId ?? '', grade: jahrgang, schoolTypeId: settings.defaults?.schoolTypeId, stateId: settings.defaults?.stateId }
  const gruppenName =
    art === 'gruppe'
      ? gruppen.find((g) => g.id === gruppe)?.name ?? ''
      : art === 'einzeln'
      ? `${einzelne.length} Lernende`
      : art === 'vok'
      ? `wie Vokabeltraining „${vokListe.find((v) => v.id === vokId)?.titel ?? ''}“`
      : 'QR-Code'
  const verbSprache = fach && istVerbSprache(fach.sprache) ? fach.sprache : null
  const mitVerben = modus === 'verben' && verbSprache
  const empfaengerDa = art === 'gruppe' ? Boolean(gruppe) : art === 'einzeln' ? einzelne.length > 0 : art === 'vok' ? Boolean(vokId) : true
  const bereit = Boolean(fach && (mitVerben ? verbWahl.verben.length >= 4 : thema) && empfaengerDa)
  const erstellen = (): void => {
    if (!fach || !bereit) return
    const empfaenger = {
      lerngruppeId: art === 'gruppe' ? gruppe! : '',
      schueler: art === 'einzeln' ? einzelne : [],
      gaeste: art === 'code' || qr,
      bis: ausFeld(bis, '23:59:00'),
      gruppe: gruppenName,
      ...(art === 'vok' && vokId ? { vokId } : {})
    }
    if (mitVerben) {
      // Ohne KI: je Verb eine Karte, dazu die Karten der Verbspiele – als Entwurf zum Ansehen wie bei Themen
      const karten = verbKarten(verbWahl.verben, verbSprache)
      const spalten = formSpalten(verbSprache)
      const paket: GrammatikPaket = {
        thema: verbWahl.titel,
        regeln: [
          {
            id: 'verben',
            titel: 'Unregelmäßige Verben',
            erklaerung: `Unregelmäßige Verben bilden ihre Formen nicht nach der Regel – sie werden gelernt: ${spalten.map((s) => s.label).join(' – ')}.`,
            beispiele: karten.slice(0, 3).map((k) =>
              spalten
                .map((s) => k.formen[s.id])
                .filter(Boolean)
                .join(' – ')
            )
          }
        ],
        aufgaben: verbAufgaben(karten, verbSprache),
        verben: karten,
        verbSprache
      }
      speichereEntwuerfe([
        ...ladeEntwuerfe(),
        {
          schluessel: `${Date.now()}`,
          titel: verbWahl.titel,
          fach: fach.label,
          sprache: fach.sprache,
          thema: verbWahl.titel,
          empfaenger,
          info: { themen: ['verben'], teilformen: [], jahrgang },
          paket
        }
      ])
      notifySuccess(`${karten.length} Verben stehen als Entwurf bereit – ansehen und freigeben.`)
      return schliessen()
    }
    const titel = `${thema}`
    const info = { themen: themenIds, teilformen: teilWahl, jahrgang, ...(vorgabe?.lehrwerk?.buch ? { lehrwerk: vorgabe.lehrwerk } : {}) }
    void starteAuftrag({
      moduleId: 'sprachenlernen',
      docId: `grammatik-${Date.now()}`,
      titel,
      art: 'Grammatiktraining',
      eingabe: {
        thema,
        fach: fach.label,
        sprache: fach.sprache,
        jahrgang,
        wunsch: wunsch.trim() || undefined,
        ...(wortArt === 'grund' && fach.sprache === 'la'
          ? { woerter: grundwortschatzBis(lateinLernjahr(jahrgang)), wortQuelle: `Grundwortschatz Latein bis ${lateinLernjahr(jahrgang)}. Lernjahr` }
          : {}),
        ...(wortArt === 'liste' && wortListe?.woerter.length
          ? { woerter: wortListe.woerter.map((v) => `${v.term} – ${v.translation}`).slice(0, 300), wortQuelle: wortListe.titel }
          : {}),
        teilformen: gewaehlteThemen.length ? teilformenAuftrag(gewaehlteThemen, query, teilWahl) || undefined : undefined
      },
      sperrt: false,
      fehlerTitel: 'Aufgabenpool konnte nicht erstellt werden',
      arbeit: async (e, k) => erzeugeGrammatikPaket(e, k.ai, (t) => k.melde(t)),
      ablegen: async (paket) => {
        speichereEntwuerfe([
          ...ladeEntwuerfe(),
          { schluessel: `${Date.now()}`, titel, fach: fach.label, sprache: fach.sprache, thema, empfaenger, info, paket }
        ])
        notifySuccess(`Aufgabenpool „${titel}" ist fertig – in „Sprachenlernen" beim Kurs ansehen und freigeben.`)
      },
      abschluss: (p) => `${p.aufgaben.length} Aufgaben fertig – ansehen und freigeben`
    })
    notifySuccess('Die KI erstellt den Aufgabenpool im Hintergrund – er erscheint hier zum Ansehen und Freigeben.')
    schliessen()
  }
  return (
    <Modal opened onClose={schliessen} title="Grammatik zum Üben freigeben" size="xl">
      <OptionenBereich>
        <Stack>
          <Group grow align="flex-end">
            <HaeufigSelect
              art="fach"
              label="Fach"
              allowDeselect={false}
              data={faecher.map((f) => ({ value: f.id, label: f.label }))}
              value={fachId}
              onChange={(v) => (setFachId(v), setThemenIds([]), setTeilWahl([]))}
              data-grammatik-fach
            />
            <NumberInput label="Klasse" min={1} max={13} value={jahrgang} onChange={(v) => setJahrgang(Number(v) || 6)} data-grammatik-jahrgang />
          </Group>
          {verbSprache && (
            <SegmentedControl
              value={modus}
              onChange={(v) => setModus(v as typeof modus)}
              data={[
                { value: 'thema', label: 'Grammatikthema' },
                { value: 'verben', label: 'Unregelmäßige Verben' }
              ]}
              data-grammatik-modus
            />
          )}
          {mitVerben && (
            <VerbFreigabe
              key={verbSprache}
              sprache={verbSprache}
              lernjahr={verbSprache === 'la' ? lateinLernjahr(jahrgang) : Math.max(1, jahrgang - 4)}
              wahl={(verben, titel) => setVerbWahl({ verben, titel })}
            />
          )}
          {fachId && !eigenesAn && !mitVerben && (
            <div data-grammatik-thema>
              <GrammatikAuswahl
                key={fachId}
                unitSofort
                lehrwerk={vorgabe?.lehrwerk}
                query={query}
                wahl={{ themen: themenIds, teilformen: teilWahl }}
                onChange={(w) => (setThemenIds(w.themen), setTeilWahl(w.teilformen))}
                beschreibung="Ein oder mehrere Themen wählen – mit Band und Unit schlägt die App die Grammatik der Unit vor. Ohne Teilform-Auswahl übt die KI alle, die zur Klasse passen."
              />
            </div>
          )}
          <NurExperte geaendert={eigenesAn && 'eigenes Thema'}>
            <Switch
              label="Eigenes Thema statt Katalog"
              checked={eigenesAn}
              onChange={(e) => setEigenesAn(e.currentTarget.checked)}
              data-grammatik-eigenes-schalter
            />
          </NurExperte>
          {eigenesAn && (
            <TextInput
              label="Eigenes Thema"
              value={eigenes}
              onChange={(e) => setEigenes(e.currentTarget.value)}
              placeholder="z. B. Present perfect vs. simple past"
              data-grammatik-eigenes
            />
          )}
          <Stack gap={6} data-grammatik-wortschatz>
            <Text size="sm" fw={500}>
              Wortschatz der Aufgaben
            </Text>
            <SegmentedControl
              value={wortArt}
              onChange={(v) => setWortArt(v as typeof wortArt)}
              data={[
                { value: 'frei', label: 'Zur Klasse passend' },
                ...(fach?.sprache === 'la' ? [{ value: 'grund', label: 'Grundwortschatz' }] : []),
                { value: 'liste', label: 'Lehrwerk / Vokabelliste' }
              ]}
            />
            {wortArt === 'grund' && fach?.sprache === 'la' && (
              <Text size="xs" c="dimmed">
                Mitgelieferte Lernwörter bis zum {lateinLernjahr(jahrgang)}. Lernjahr ({grundwortschatzBis(lateinLernjahr(jahrgang)).length} Wörter).
              </Text>
            )}
            {wortArt === 'liste' && <VokabelQuelle wahl={setWortListe} />}
          </Stack>
          <Textarea
            label="Besonders üben (optional)"
            autosize
            minRows={2}
            value={wunsch}
            onChange={(e) => setWunsch(e.currentTarget.value)}
            placeholder="z. B. Verneinung und Fragen, unregelmäßige Verben aus Unit 3"
          />
          {/* Im Kurs (Sprachenlernen, 08.10.2026) gilt die Grammatik für dessen Lernende – keine Empfängerwahl */}
          {vorgabe ? (
            <Text size="sm" c="dimmed" data-grammatik-fuer-kurs>
              Für die Lernenden des Kurses „{vorgabe.titel}“ – auch für alle, die später dazukommen.
            </Text>
          ) : (
            <>
              <SegmentedControl
                value={art}
                onChange={(v) => (setArt(v as typeof art), setEinzelne([]))}
                data={[
                  { value: 'gruppe', label: 'Lerngruppe' },
                  { value: 'einzeln', label: 'Einzelne Lernende' },
                  { value: 'vok', label: 'Wie Vokabeltraining' },
                  { value: 'code', label: 'Nur per QR-Code' }
                ]}
                data-grammatik-empfaenger
              />
              {art === 'vok' ? (
                <Select
                  label="Vokabeltraining"
                  description="Gilt fest für dessen Lernende – auch für alle, die später dort eingetragen werden oder beitreten."
                  data={vokListe.map((v) => ({ value: v.id, label: v.lerngruppe ? `${v.titel} (${v.lerngruppe})` : v.titel }))}
                  value={vokId}
                  onChange={setVokId}
                  placeholder="wählen …"
                  data-grammatik-vok
                />
              ) : art === 'gruppe' ? (
                <Select
                  label="Lerngruppe"
                  data={gruppen.map((g) => ({ value: g.id, label: g.name }))}
                  value={gruppe}
                  onChange={setGruppe}
                  placeholder="wählen …"
                  data-grammatik-gruppe
                />
              ) : art === 'einzeln' ? (
                <MultiSelect
                  label="Lernende"
                  data={alleLernenden.daten}
                  value={einzelne}
                  onChange={setEinzelne}
                  searchable
                  clearable
                  placeholder="Namen suchen …"
                />
              ) : (
                <Text size="sm" c="dimmed">
                  Wer den QR-Code scannt, übt mit – mit Konto direkt, sonst mit Vorname und Anfangsbuchstabe.
                </Text>
              )}
              <NurExperte geaendert={art !== 'code' && qr && 'zusätzlich per QR-Code'}>
                {art !== 'code' && <Switch label="Zusätzlich per QR-Code / Code zugänglich" checked={qr} onChange={(e) => setQr(e.currentTarget.checked)} />}
              </NurExperte>
            </>
          )}
          <TextInput type="date" label="Übungszeitraum bis (optional)" value={bis} onChange={(e) => setBis(e.currentTarget.value)} />
          <AlleOptionen />
          <Alert variant="light" icon={<IconSparkles size={16} />}>
            Die KI erstellt mit dem eigenen KI-Zugang Regelkarten und rund 40 Aufgaben und prüft sie. Das dauert ein bis zwei Minuten im Hintergrund; danach
            wird der Pool hier angesehen und erst dann freigegeben.
          </Alert>
          <Group justify="flex-end">
            <Button leftSection={<IconSparkles size={16} />} disabled={!bereit} onClick={erstellen} data-grammatik-erstellen>
              Aufgaben erstellen
            </Button>
          </Group>
        </Stack>
      </OptionenBereich>
    </Modal>
  )
}

/**
 * Entwurf prüfen und freigeben (Sichtung). Seit 08.10.2026 mit dem AufgabenEditor (ändern statt nur streichen) und für
 * Extra-Aufgaben (Förder/Forder) mit „Auch freischalten für …" (gleiche Schwäche bzw. Stärke).
 */
export function EntwurfAnsehen({ e, schliessen, fertig }: { e: Entwurf; schliessen: () => void; fertig: () => void }): React.JSX.Element {
  const [paket, setPaket] = useState(e.paket)
  const [auchFuer, setAuchFuer] = useState<string[]>([])
  const [laeuft, setLaeuft] = useState(false)
  const extra = e.empfaenger.art
  const minimum = extra ? 4 : 8
  // Bearbeitungen am Entwurf gleich merken (auch ohne Freigeben)
  const aendern = (p: GrammatikPaket): void => {
    setPaket(p)
    speichereEntwuerfe(ladeEntwuerfe().map((x) => (x.schluessel === e.schluessel ? { ...x, paket: p } : x)))
  }
  const fuer = [...(e.empfaenger.fuer ?? []), ...(e.empfaenger.gleiche ?? []).filter((g) => auchFuer.includes(g.id))]
  const freigeben = async (): Promise<void> => {
    setLaeuft(true)
    try {
      await senden('/server/grammatik/freigeben', {
        titel: e.titel,
        fach: e.fach,
        sprache: e.sprache,
        thema: e.thema,
        paket,
        lerngruppeId: e.empfaenger.lerngruppeId,
        schueler: e.empfaenger.schueler,
        gaeste: e.empfaenger.gaeste,
        bis: e.empfaenger.bis,
        ...(e.empfaenger.vokId ? { vokId: e.empfaenger.vokId } : {}),
        ...(extra ? { art: extra, fuer: fuer.map((f) => f.id) } : {}),
        ...(e.info ? { info: e.info } : {})
      })
      speichereEntwuerfe(ladeEntwuerfe().filter((x) => x.schluessel !== e.schluessel))
      notifySuccess(
        extra ? `Freigeschaltet für ${fuer.map((f) => f.name).join(', ')}.` : `„${e.titel}" ist freigegeben – die Lernenden finden es in ihrer Lern-App.`
      )
      fertig()
    } catch (er) {
      notifyError(er, 'Nicht freigegeben')
    } finally {
      setLaeuft(false)
    }
  }
  const verwerfen = (): void => {
    speichereEntwuerfe(ladeEntwuerfe().filter((x) => x.schluessel !== e.schluessel))
    fertig()
  }
  return (
    <Modal
      opened
      onClose={schliessen}
      title={extra ? `${e.titel} – prüfen und freischalten` : `${e.titel} – ansehen und freigeben`}
      size="xl"
      fullScreen={window.matchMedia?.('(max-width: 700px)').matches}
    >
      <Stack data-entwurf-fenster>
        <Text size="sm" c="dimmed">
          {extra
            ? `${extra === 'foerder' ? 'Förderaufgaben' : 'Forderaufgaben'} für ${(e.empfaenger.fuer ?? [])
                .map((f) => f.name)
                .join(', ')} – erscheinen dort als „Extra für dich“. Bitte prüfen; Unpassendes ändern oder streichen.`
            : `Für ${e.empfaenger.gruppe}. Aufgaben prüfen, ändern oder streichen; freigegeben wird, was hier steht.`}
        </Text>
        <AufgabenEditor paket={paket} aendern={aendern} />
        {extra && (e.empfaenger.gleiche?.length ?? 0) > 0 && (
          <Card withBorder padding="sm" data-auch-fuer>
            <Text size="sm" fw={600} mb={6}>
              Auch freischalten für ({extra === 'foerder' ? 'gleiche Schwäche' : 'gleiche Stärke'}):
            </Text>
            <Group gap="md">
              {e.empfaenger.gleiche!.map((g) => (
                <Checkbox
                  key={g.id}
                  label={g.name}
                  checked={auchFuer.includes(g.id)}
                  onChange={(ev) => setAuchFuer(ev.currentTarget.checked ? [...auchFuer, g.id] : auchFuer.filter((x) => x !== g.id))}
                  data-auch-fuer-person={g.name}
                />
              ))}
            </Group>
          </Card>
        )}
        <Group justify="space-between">
          <Button variant="subtle" color="red" onClick={verwerfen} data-entwurf-verwerfen>
            Verwerfen
          </Button>
          <Group>
            <Button variant="default" onClick={schliessen}>
              Später
            </Button>
            <Button loading={laeuft} disabled={paket.aufgaben.length < minimum} onClick={() => void freigeben()} data-entwurf-freigeben>
              {extra ? `Für ${fuer.length === 1 ? fuer[0].name : `${fuer.length} Lernende`} freischalten` : `Freigeben (${paket.aufgaben.length} Aufgaben)`}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}

interface Lernstanddaten {
  id: string
  titel: string
  fach: string
  thema: string
  status: string
  lerngruppe: string
  code?: string
  link?: string
  paket: GrammatikPaket
  lernende: { id: string; name: string; gast: boolean; uebersicht: { gesamt: number; sicher: number; faellig: number; imAufbau: number }; tage7: number }[]
  problem: { id: string; art: string; satz: string; loesung: string; versuche: number; falsch: number; quote: number; typisch: string[] }[]
}

export function Lernstand({ id, zurueck, imFenster }: { id: string; zurueck: () => void; imFenster?: boolean }): React.JSX.Element {
  const rueck = useRueckweg('grammatiktraining', zurueck, 'Alle Grammatiktrainings')
  const [d, setD] = useState<Lernstanddaten | null>(null)
  const [loeschen, setLoeschen] = useState(false)
  const laden = useCallback(() => void holen<Lernstanddaten>(`/server/grammatik/${id}`).then(setD, (e: unknown) => notifyError(e)), [id])
  useEffect(laden, [laden])
  if (!d)
    return (
      <Center h="30vh">
        <Loader />
      </Center>
    )
  return (
    <Stack data-grammatik-lernstand>
      <Group justify={imFenster ? 'flex-end' : 'space-between'}>
        {!imFenster && (
          <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} px={4} onClick={rueck.los} data-zurueck={rueck.aus ? 'meineklassen' : undefined}>
            {rueck.name}
          </Button>
        )}
        <Group gap="xs">
          <Button
            size="xs"
            variant="light"
            onClick={() => void senden(`/server/grammatik/${id}/status`, { status: d.status === 'offen' ? 'beendet' : 'offen' }).then(laden)}
          >
            {d.status === 'offen' ? 'Beenden' : 'Wieder öffnen'}
          </Button>
          <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={14} />} onClick={() => setLoeschen(true)}>
            Löschen
          </Button>
        </Group>
      </Group>
      {!imFenster && <Title order={3}>{d.titel}</Title>}
      <Text c="dimmed">
        {d.fach} · {d.lerngruppe} · {d.paket.aufgaben.length} Aufgaben, {d.paket.regeln.length} Regelkarten
      </Text>
      {d.code && d.link && <Zugang code={d.code} link={d.link} />}
      <Table striped data-karten>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>sicher</Table.Th>
            <Table.Th>im Aufbau</Table.Th>
            <Table.Th>heute fällig</Table.Th>
            <Table.Th>Übungstage (7)</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {d.lernende.map((l) => (
            <Table.Tr key={l.id}>
              <Table.Td fw={600}>
                {l.name}
                {l.gast && (
                  <Badge ml={6} size="xs" variant="light">
                    Gast
                  </Badge>
                )}
              </Table.Td>
              <Table.Td>
                <Group gap={6} wrap="nowrap">
                  <Progress w={80} value={l.uebersicht.gesamt ? (l.uebersicht.sicher / l.uebersicht.gesamt) * 100 : 0} color="grape" size="sm" />
                  <Text size="xs">
                    {l.uebersicht.sicher} / {l.uebersicht.gesamt}
                  </Text>
                </Group>
              </Table.Td>
              <Table.Td>{l.uebersicht.imAufbau}</Table.Td>
              <Table.Td>{l.uebersicht.faellig}</Table.Td>
              <Table.Td>{l.tage7}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {d.problem.length > 0 && (
        <Card withBorder radius="md">
          <Text fw={700} mb={6}>
            Am häufigsten falsch
          </Text>
          <Stack gap={4}>
            {d.problem.map((p) => (
              <Text key={p.id} size="sm">
                <Badge size="xs" variant="light" mr={6}>
                  {Math.round(p.quote * 100)} %
                </Badge>
                {p.satz}{' '}
                <Text span c="teal">
                  → {p.loesung}
                </Text>
                {p.typisch.length > 0 && (
                  <Text span c="dimmed">
                    {' '}
                    · oft: {p.typisch.join(', ')}
                  </Text>
                )}
              </Text>
            ))}
          </Stack>
        </Card>
      )}
      {loeschen && (
        <Modal opened onClose={() => setLoeschen(false)} title="Grammatiktraining löschen?" size="sm">
          <Text size="sm" mb="md">
            Der Lernstand aller Lernenden geht dabei verloren.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setLoeschen(false)}>
              Behalten
            </Button>
            <Button color="red" onClick={() => void senden(`/server/grammatik/${id}/loeschen`, {}).then(zurueck)}>
              Löschen
            </Button>
          </Group>
        </Modal>
      )}
    </Stack>
  )
}
