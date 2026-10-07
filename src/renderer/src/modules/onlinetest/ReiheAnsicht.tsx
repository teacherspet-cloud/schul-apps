/**
 * Unterrichtsreihe für Lernende (Etappe 6, 02.10.2026; Server: src/server/reihen.ts, Regeln: shared/reihe.ts).
 *
 *  /s/reihen          meine Reihen mit Fortschritt
 *  /s/r/<ZID>         der ganze Weg: Lernziele der Reihe, Fortschritt, Abzeichen, Stationen
 *                     (gesperrte grau mit „was fehlt noch"), Hefter, „Ich brauche Hilfe"
 *  /s/r/<ZID>/<SID>   ein Schritt, der hier bearbeitet wird (Zwischenaufgabe, Lernkarten,
 *                     Selbsteinschätzung, Diagnose, Abschlussprodukt, Sprechaufgabe …)
 * Arbeitsblatt, Schreibaufgabe und Test öffnen ihre eigenen Seiten (mit „Zur Reihe").
 * Abgestimmt: ganzer Weg sichtbar, Abzeichen für Abschnitte, KEINE Ranglisten oder Vergleiche.
 */
import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  FileButton,
  Group,
  Loader,
  Modal,
  Paper,
  Progress,
  Radio,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title
} from '@mantine/core'
import {
  IconArrowLeft,
  IconBook,
  IconCheck,
  IconHandStop,
  IconLock,
  IconMedal,
  IconMicrophone,
  IconPhoto,
  IconPlayerStop,
  IconPlayerTrackNext,
  IconSend,
  IconStar,
  IconTrash
} from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SchrittStand, Stand, Status, Weg } from '@shared/reihe'
import { holen, senden } from './serverApi'
import { BogenAnsicht, type FeedbackBogen } from './SchuelerBereich'

interface SchrittSicht {
  id: string
  titel: string
  rolle: 'pflicht' | 'wahl' | 'foerder' | 'forder' | 'optional'
  abschnitt?: string
  erfolg: string
  lernziele: { ichKann: string }[]
  inhalt?: Record<string, unknown> & { art: string }
  link?: string
  /** Niveaustufen: empfohlene Stufe aus der Eingangsdiagnose */
  empfehlung?: number | null
  musterloesung?: string
}

interface ReiheDaten {
  id: string
  titel: string
  oberthema: string
  fach: string
  lernziele: { ichKann: string }[]
  schritte: SchrittSicht[]
  weg: Weg
  stand: Stand
  hefter: { titel: string; text: string }[]
}

const FARBE: Record<Status, string> = {
  geschafft: 'green',
  offen: 'blue',
  eingereicht: 'yellow',
  nicht_geschafft: 'orange',
  gesperrt: 'gray',
  uebersprungen: 'teal'
}
const TEXT: Record<Status, string> = {
  geschafft: 'geschafft',
  offen: 'jetzt dran',
  eingereicht: 'eingereicht',
  nicht_geschafft: 'noch einmal ansehen',
  gesperrt: 'noch gesperrt',
  uebersprungen: 'kannst du schon'
}

/** Schülerfassung als Satz: „Ich kann …", „I can …" usw. bleiben; ein Stichwort bekommt „Ich kann" davor */
const alsSatz = (t: string): string => (/^(ich|i|je|yo|io|я)\b/i.test(t.trim()) ? t.trim() : `Ich kann ${t.trim()}`)

const mitReihe = (link: string, zid: string): string => `${link}${link.includes('?') ? '&' : '?'}reihe=${zid}`

/** Liste meiner Reihen */
export function ReihenListe(): React.JSX.Element {
  const [liste, setListe] = useState<
    { id: string; titel: string; oberthema: string; fach: string; fortschritt: number; abzeichen: string[]; fertig: boolean }[] | null
  >(null)
  useEffect(() => {
    void holen<{ reihen: NonNullable<typeof liste> }>('/s/api/reihen').then(
      (d) => setListe(d.reihen),
      () => setListe([])
    )
  }, [])
  return (
    <Stack data-reihen>
      <Button variant="subtle" component="a" href="/s/" w="fit-content" leftSection={<IconArrowLeft size={16} />} px={4}>
        Startseite
      </Button>
      <Title order={3}>Unterrichtsreihen</Title>
      {!liste && <Loader />}
      {liste?.length === 0 && <Text c="dimmed">Gerade ist keine Unterrichtsreihe für dich freigegeben.</Text>}
      {liste?.map((r) => (
        <Card key={r.id} withBorder padding="md" component="a" href={`/s/r/${r.id}`} style={{ textDecoration: 'none', color: 'inherit' }} data-reihe-eintrag>
          <Group justify="space-between" wrap="nowrap">
            <div style={{ minWidth: 0 }}>
              <Text fw={700}>{r.titel}</Text>
              <Text size="sm" c="dimmed">
                {r.fach} · {r.oberthema}
              </Text>
            </div>
            {r.fertig ? (
              <Badge color="green" leftSection={<IconMedal size={12} />}>
                geschafft
              </Badge>
            ) : (
              <Text size="sm" fw={600}>
                {Math.round(r.fortschritt * 100)} %
              </Text>
            )}
          </Group>
          <Progress value={r.fortschritt * 100} mt="xs" color={r.fertig ? 'green' : 'blue'} />
        </Card>
      ))}
    </Stack>
  )
}

/** Der Weg einer Reihe bzw. ein Schritt darin */
export function ReiheWeg({ zid, schritt }: { zid: string; schritt?: string }): React.JSX.Element {
  const [d, setD] = useState<ReiheDaten | null | undefined>(undefined)
  const [fehler, setFehler] = useState('')
  const laden = useCallback(() => {
    void holen<ReiheDaten>(`/s/api/reihe?id=${encodeURIComponent(zid)}`).then(setD, (e: unknown) => {
      setFehler(e instanceof Error ? e.message : String(e))
      setD(null)
    })
  }, [zid])
  useEffect(laden, [laden])
  if (d === undefined)
    return (
      <Center py="xl">
        <Loader />
      </Center>
    )
  if (!d) return <Alert color="orange">{fehler || 'Diese Reihe gibt es nicht.'}</Alert>
  const s = schritt ? d.schritte.find((x) => x.id === schritt) : undefined
  if (s) return <SchrittSeite d={d} s={s} neu={laden} />
  return <Weg d={d} neu={laden} />
}

function Weg({ d, neu }: { d: ReiheDaten; neu: () => void }): React.JSX.Element {
  const [hefter, setHefter] = useState(false)
  const [hilfe, setHilfe] = useState(false)
  const lage = new Map(d.weg.schritte.map((l) => [l.id, l]))
  return (
    <Stack data-reihe-weg>
      <Button variant="subtle" component="a" href="/s/reihen" w="fit-content" leftSection={<IconArrowLeft size={16} />} px={4}>
        Unterrichtsreihen
      </Button>
      <Card withBorder padding="lg">
        <Text size="sm" c="dimmed">
          {d.fach} · {d.oberthema}
        </Text>
        <Title order={3}>{d.titel}</Title>
        <Group mt="sm" gap="xs" align="center">
          <Progress value={d.weg.fortschritt * 100} style={{ flex: 1 }} size="lg" color={d.weg.fertig ? 'green' : 'blue'} data-fortschritt />
          <Text fw={700}>{Math.round(d.weg.fortschritt * 100)} %</Text>
        </Group>
        {/* Optionale Schritte (06.10.2026): Zähler und was für den Abschluss nötig ist */}
        {d.weg.optional && (
          <Text size="sm" c="dimmed" mt={4} data-optional-zaehler>
            {d.weg.optional.geschafft} von {d.weg.optional.gesamt} optionalen geschafft
            {d.weg.optional.noetig > 0
              ? d.weg.optional.geschafft >= d.weg.optional.noetig
                ? ' – genug für den Abschluss'
                : ` – für den Abschluss brauchst du ${d.weg.optional.noetig}`
              : ''}
          </Text>
        )}
        {d.weg.abzeichen.length > 0 && (
          <Group gap={6} mt="sm" data-abzeichen>
            {d.weg.abzeichen.map((a) => (
              <Badge key={a} size="lg" color="yellow" variant="light" leftSection={<IconMedal size={14} />}>
                {a}
              </Badge>
            ))}
          </Group>
        )}
        {d.weg.fertig && (
          <Alert color="green" mt="sm" icon={<IconMedal />}>
            Du hast die ganze Reihe geschafft!
          </Alert>
        )}
        {d.lernziele.length > 0 && (
          <Stack gap={2} mt="md" data-reihe-lernziele>
            <Text fw={600} size="sm">
              Am Ende der Reihe …
            </Text>
            {d.lernziele.map((l, i) => (
              <Text key={i} size="sm">
                ✓ {l.ichKann}
              </Text>
            ))}
          </Stack>
        )}
        <Group mt="md" gap="xs">
          {d.hefter.length > 0 && (
            <Button variant="light" leftSection={<IconBook size={16} />} onClick={() => setHefter(true)} data-hefter-knopf>
              Mein Hefter ({d.hefter.length})
            </Button>
          )}
          {d.stand.hilfe ? (
            <Button
              variant="light"
              color="orange"
              leftSection={<IconHandStop size={16} />}
              onClick={() => void senden('/s/api/reihe/schritt', { id: d.id, aktion: 'hilfe', an: false }).then(neu)}
            >
              Hilfe angefragt – zurücknehmen
            </Button>
          ) : (
            <Button variant="subtle" color="orange" leftSection={<IconHandStop size={16} />} onClick={() => setHilfe(true)} data-hilfe-knopf>
              Ich brauche Hilfe
            </Button>
          )}
        </Group>
      </Card>

      {d.schritte.map((s, i) => {
        const l = lage.get(s.id)!
        const neuerAbschnitt = s.abschnitt && s.abschnitt !== d.schritte[i - 1]?.abschnitt
        const gesperrt = l.status === 'gesperrt'
        // Förderschritte zeigen sich nur, wenn sie gebraucht werden
        if (s.rolle === 'foerder' && gesperrt) return null
        const href = !gesperrt ? (s.link ? mitReihe(s.link, d.id) : `/s/r/${d.id}/${s.id}`) : undefined
        return (
          <Stack key={s.id} gap={4}>
            {neuerAbschnitt && (
              <Group gap={6} mt="xs">
                <Text size="sm" fw={700} c="dimmed" tt="uppercase">
                  {s.abschnitt}
                </Text>
                {d.weg.abzeichen.includes(s.abschnitt!) && <IconMedal size={16} color="var(--mantine-color-yellow-6)" />}
              </Group>
            )}
            <Paper
              withBorder
              p="md"
              radius="lg"
              component={href ? 'a' : 'div'}
              {...(href ? { href } : {})}
              style={{
                textDecoration: 'none',
                color: 'inherit',
                opacity: gesperrt ? 0.6 : 1,
                borderColor: l.status === 'offen' ? 'var(--mantine-color-blue-5)' : undefined
              }}
              data-station={l.status}
            >
              <Group wrap="nowrap" align="start">
                <ThemeIcon size={36} radius="xl" color={FARBE[l.status]} variant={l.status === 'geschafft' ? 'filled' : 'light'}>
                  {l.status === 'geschafft' ? (
                    <IconCheck size={20} />
                  ) : gesperrt ? (
                    <IconLock size={18} />
                  ) : l.status === 'uebersprungen' ? (
                    <IconPlayerTrackNext size={18} />
                  ) : (
                    <Text fw={700}>{i + 1}</Text>
                  )}
                </ThemeIcon>
                <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                  <Group gap={6}>
                    <Text fw={700}>{s.titel}</Text>
                    {s.rolle === 'wahl' && (
                      <Badge size="xs" color="grape" variant="light">
                        Wahl
                      </Badge>
                    )}
                    {s.rolle === 'forder' && (
                      <Badge size="xs" color="yellow" variant="light" leftSection={<IconStar size={10} />}>
                        Zusatz
                      </Badge>
                    )}
                    {s.rolle === 'foerder' && (
                      <Badge size="xs" color="orange" variant="light">
                        Übung für dich
                      </Badge>
                    )}
                    {s.rolle === 'optional' && (
                      <Badge size="xs" color="teal" variant="light" data-optional>
                        optional
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c={FARBE[l.status] === 'gray' ? 'dimmed' : `${FARBE[l.status]}.7`}>
                    {TEXT[l.status]}
                    {l.hinweis ? ` – ${l.hinweis}` : ''}
                    {l.wartet && l.status === 'eingereicht' ? ' – deine Lehrkraft sieht es sich an' : ''}
                  </Text>
                  {s.lernziele.map((z, k) => (
                    <Text key={k} size="xs" c="dimmed">
                      {alsSatz(z.ichKann)}
                    </Text>
                  ))}
                </Stack>
              </Group>
            </Paper>
          </Stack>
        )
      })}

      {hefter && (
        <Modal opened onClose={() => setHefter(false)} title="Mein Hefter" size="lg">
          <Stack>
            {d.hefter.map((h, i) => (
              <Card key={i} withBorder>
                <Text fw={700}>{h.titel}</Text>
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {h.text}
                </Text>
              </Card>
            ))}
            <Button
              variant="light"
              onClick={() => {
                const w = window.open('', '_blank')
                if (!w) return
                const esc = (t: string): string => t.replace(/[&<>]/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[z]!)
                w.document.write(
                  `<!doctype html><meta charset="utf-8"><title>Hefter – ${esc(d.titel)}</title><style>body{font:12pt/1.5 system-ui;margin:20mm}h2{margin-top:1.4em}p{white-space:pre-wrap}</style><h1>${esc(d.titel)}</h1>${d.hefter.map((h) => `<h2>${esc(h.titel)}</h2><p>${esc(h.text)}</p>`).join('')}`
                )
                w.document.close()
                w.print()
              }}
            >
              Drucken / als PDF
            </Button>
          </Stack>
        </Modal>
      )}
      {hilfe && <HilfeDialog d={d} schliessen={() => setHilfe(false)} fertig={neu} />}
    </Stack>
  )
}

function HilfeDialog({ d, schliessen, fertig }: { d: ReiheDaten; schliessen: () => void; fertig: () => void }): React.JSX.Element {
  const [text, setText] = useState('')
  const offen = d.weg.schritte.find((l) => l.status === 'offen' || l.status === 'nicht_geschafft')
  return (
    <Modal opened onClose={schliessen} title="Ich brauche Hilfe">
      <Stack>
        <Text size="sm" c="dimmed">
          Deine Lehrkraft sieht deine Bitte in ihrer Übersicht – sonst niemand.
        </Text>
        <Textarea label="Wobei? (freiwillig)" autosize minRows={2} value={text} onChange={(e) => setText(e.currentTarget.value)} />
        <Button
          leftSection={<IconHandStop size={16} />}
          onClick={() =>
            void senden('/s/api/reihe/schritt', { id: d.id, aktion: 'hilfe', text, ...(offen ? { schritt: offen.id } : {}) }).then(() => {
              schliessen()
              fertig()
            })
          }
          data-hilfe-senden
        >
          Bitte senden
        </Button>
      </Stack>
    </Modal>
  )
}

// ---------------------------------------------------------------- ein Schritt

function SchrittSeite({ d, s, neu }: { d: ReiheDaten; s: SchrittSicht; neu: () => void }): React.JSX.Element {
  const l = d.weg.schritte.find((x) => x.id === s.id)!
  const st: SchrittStand = d.stand.schritte[s.id] ?? {}
  return (
    <Stack data-reihe-schritt={s.inhalt?.art}>
      <Button variant="subtle" component="a" href={`/s/r/${d.id}`} w="fit-content" leftSection={<IconArrowLeft size={16} />} px={4}>
        {d.titel}
      </Button>
      <Title order={3}>{s.titel}</Title>
      {s.lernziele.length > 0 && (
        <Card withBorder padding="sm">
          <Text size="sm" fw={600}>
            Darum geht es:
          </Text>
          {s.lernziele.map((z, i) => (
            <Text key={i} size="sm">
              ✓ {alsSatz(z.ichKann)}
            </Text>
          ))}
        </Card>
      )}
      {l.status === 'gesperrt' && <Alert color="gray">{l.hinweis ?? 'Dieser Schritt ist noch gesperrt.'}</Alert>}
      {l.status === 'offen' && l.hinweis?.startsWith('Zur Überarbeitung') && (
        <Alert color="orange" title="Bitte überarbeiten" data-ueberarbeiten-hinweis>
          {l.hinweis.replace(/^Zur Überarbeitung:\s*/, '')}
        </Alert>
      )}
      {st.bewertung && (
        <Alert color={st.bewertung.geschafft ? 'green' : 'orange'} title={st.bewertung.geschafft ? 'Geschafft!' : 'Noch nicht ganz'}>
          {st.bewertung.text || (st.bewertung.geschafft ? 'Deine Lehrkraft hat den Schritt bestätigt.' : 'Sieh dir die Aufgabe noch einmal an.')}
        </Alert>
      )}
      {l.status === 'geschafft' && !st.bewertung && <Alert color="green">Geschafft – weiter geht es auf dem Weg.</Alert>}
      {s.inhalt && l.status !== 'gesperrt' && <Inhalt d={d} s={s} st={st} status={l.status} neu={neu} />}
      {l.status !== 'gesperrt' && <Fragen d={d} s={s} neu={neu} />}
    </Stack>
  )
}

function Inhalt({ d, s, st, status, neu }: { d: ReiheDaten; s: SchrittSicht; st: SchrittStand; status: Status; neu: () => void }): React.JSX.Element | null {
  const i = s.inhalt!
  const schicke = (aktion: string, mehr: Record<string, unknown> = {}): Promise<Record<string, unknown>> =>
    senden('/s/api/reihe/schritt', { id: d.id, schritt: s.id, aktion, ...mehr })
  switch (i.art) {
    case 'arbeitsblatt':
      return <NiveauWahl d={d} s={s} st={st} schicke={schicke} />
    case 'aufgabe':
    case 'abschluss':
    case 'sprechen':
      return <Abgabe d={d} s={s} st={st} status={status} schicke={schicke} neu={neu} />
    case 'lernkarten':
      return (
        <Lernkarten
          karten={(i.karten as { vorne: string; hinten: string }[]) ?? []}
          geschafft={Boolean(st.gewusst)}
          fertig={() => void schicke('gewusst').then(neu)}
        />
      )
    case 'reflexion':
      return <Reflexion d={d} s={s} st={st} schicke={schicke} neu={neu} />
    case 'diagnose':
      return (
        <Diagnose
          fragen={(i.fragen as { frage: string; optionen: string[] }[]) ?? []}
          st={st}
          schicke={schicke}
          neu={neu}
          wartenMin={Number(i.wiederholbarNachMin) || 0}
        />
      )
    case 'praesenz':
      return (
        <Card withBorder>
          <Text style={{ whiteSpace: 'pre-wrap' }}>{String(i.anweisung ?? '')}</Text>
          <Text size="sm" c="dimmed" mt="sm">
            Das passiert im Unterricht. Deine Lehrkraft hakt es ab, dann geht es weiter.
          </Text>
        </Card>
      )
    case 'hefter':
      return (
        <Card withBorder>
          <Text style={{ whiteSpace: 'pre-wrap' }}>{String(i.text ?? '')}</Text>
          <Text size="xs" c="dimmed" mt="sm">
            Steht auch in deinem Hefter.
          </Text>
        </Card>
      )
    default:
      return null
  }
}

/** Zwischenaufgabe, Abschlussprodukt, Sprechaufgabe: Text, Foto/Datei, Aufnahme → Abgeben */
function Abgabe({
  d,
  s,
  st,
  status,
  schicke,
  neu
}: {
  d: ReiheDaten
  s: SchrittSicht
  st: SchrittStand
  status: Status
  schicke: (a: string, m?: Record<string, unknown>) => Promise<Record<string, unknown>>
  neu: () => void
}): React.JSX.Element {
  const i = s.inhalt!
  const fragen = (i.fragen as string[] | undefined) ?? []
  const [antworten, setAntworten] = useState<Record<string, string>>(st.antworten ?? {})
  const [dateien, setDateien] = useState(st.dateien ?? [])
  const [laeuft, setLaeuft] = useState('')
  const [fehler, setFehler] = useState('')
  const [bogen, setBogen] = useState<FeedbackBogen | null>(null)
  const textErlaubt = i.art !== 'sprechen' && (i.art === 'abschluss' || i.antwort !== 'foto')
  const fotoErlaubt = i.art === 'abschluss' || i.antwort === 'foto' || i.antwort === 'beides'
  const fertig = status === 'geschafft'
  const hochladen = async (f: File | Blob, name: string): Promise<void> => {
    setLaeuft('datei')
    setFehler('')
    try {
      const daten = await new Promise<string>((ok, nein) => {
        const r = new FileReader()
        r.onload = () => ok(String(r.result))
        r.onerror = () => nein(new Error('Datei nicht lesbar.'))
        r.readAsDataURL(f)
      })
      const x = await schicke('datei', { name, daten })
      setDateien((alt) => [...alt, { id: String(x.id), name: String(x.name), typ: String(x.typ) }])
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    } finally {
      setLaeuft('')
    }
  }
  const abgeben = async (): Promise<void> => {
    setLaeuft('abgabe')
    setFehler('')
    try {
      const r = await schicke('abgeben', { antworten })
      if (r.bogen) setBogen(r.bogen as FeedbackBogen)
      neu()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    } finally {
      setLaeuft('')
    }
  }
  return (
    <Stack>
      <Card withBorder>
        <Text style={{ whiteSpace: 'pre-wrap' }}>{String(i.anweisung ?? '')}</Text>
        {Boolean(i.material) && (
          <Paper withBorder p="sm" mt="sm" bg="var(--mantine-color-gray-0)">
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {String(i.material)}
            </Text>
          </Paper>
        )}
        {/* Bildausschnitte aus dem Schulbuch (06.10.2026) – immer mit Quellenangabe */}
        {Array.isArray(i.bilder) &&
          (i.bilder as { src: string; quelle: string }[]).map((b, n) => (
            <figure key={n} style={{ margin: '12px 0 0' }} data-buch-bild>
              <img src={b.src} alt={b.quelle} style={{ maxWidth: '100%', borderRadius: 6 }} />
              <figcaption>
                <Text size="xs" c="dimmed">
                  Quelle: {b.quelle}
                </Text>
              </figcaption>
            </figure>
          ))}
        {Boolean(i.link) && (
          <Button component="a" href={String(i.link)} target="_blank" rel="noopener" variant="light" mt="sm" w="fit-content">
            Material öffnen
          </Button>
        )}
        {Array.isArray(i.raster) && i.raster.length > 0 && (
          <Stack gap={2} mt="sm">
            <Text size="sm" fw={600}>
              Darauf kommt es an:
            </Text>
            {(i.raster as string[]).map((k, n) => (
              <Text key={n} size="sm">
                • {k}
              </Text>
            ))}
          </Stack>
        )}
      </Card>
      {textErlaubt &&
        (fragen.length ? (
          fragen.map((f, n) => (
            <Textarea
              key={n}
              label={`${n + 1}. ${f}`}
              autosize
              minRows={2}
              value={antworten[String(n)] ?? ''}
              onChange={(e) => setAntworten({ ...antworten, [String(n)]: e.currentTarget.value })}
              disabled={fertig}
              autoCorrect="off"
              spellCheck={false}
            />
          ))
        ) : (
          <Textarea
            label="Deine Antwort"
            autosize
            minRows={4}
            value={antworten['0'] ?? ''}
            onChange={(e) => setAntworten({ ...antworten, '0': e.currentTarget.value })}
            disabled={fertig}
            autoCorrect="off"
            spellCheck={false}
            data-reihe-antwort
          />
        ))}
      {fotoErlaubt && !fertig && (
        <FileButton onChange={(f) => f && void hochladen(f, f.name)} accept="image/*,application/pdf,video/*">
          {(p) => (
            <Button {...p} variant="light" leftSection={<IconPhoto size={16} />} loading={laeuft === 'datei'} w="fit-content">
              Foto oder Datei hochladen
            </Button>
          )}
        </FileButton>
      )}
      {i.art === 'sprechen' && !fertig && (
        <Aufnahme minuten={Number(i.minuten) || 2} fertig={(b) => void hochladen(b, `Aufnahme-${new Date().toISOString().slice(0, 16)}.webm`)} />
      )}
      {dateien.map((f) => (
        <Group key={f.id} gap="xs">
          {f.typ.startsWith('audio/') ? <audio controls src={`/s/api/reihe/datei?id=${d.id}&datei=${f.id}`} /> : <Text size="sm">📎 {f.name}</Text>}
          {!fertig && (
            <Button
              size="xs"
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={12} />}
              onClick={() => void schicke('datei-weg', { datei: f.id }).then(() => setDateien(dateien.filter((x) => x.id !== f.id)))}
            >
              entfernen
            </Button>
          )}
        </Group>
      ))}
      {fehler && <Alert color="red">{fehler}</Alert>}
      {s.musterloesung && (
        <Card withBorder padding="md" bg="var(--mantine-color-green-0)" data-musterloesung>
          <Text fw={700} size="sm" mb={4}>
            Musterlösung
          </Text>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {s.musterloesung}
          </Text>
        </Card>
      )}
      {bogen && (
        <Card withBorder padding="lg" data-reihe-bogen>
          <Title order={4} mb="xs">
            Feedback
          </Title>
          <BogenAnsicht b={bogen} />
        </Card>
      )}
      {!fertig && (
        <Button leftSection={<IconSend size={16} />} loading={laeuft === 'abgabe'} onClick={() => void abgeben()} w="fit-content" data-reihe-abgeben>
          {st.eingereicht ? 'Erneut abgeben' : 'Abgeben'}
        </Button>
      )}
      {laeuft === 'abgabe' && Boolean(i.feedback) && (
        <Text size="sm" c="dimmed">
          Das Feedback wird geschrieben – das dauert etwa eine Minute.
        </Text>
      )}
    </Stack>
  )
}

/** Sprachaufnahme im Browser */
function Aufnahme({ minuten, fertig }: { minuten: number; fertig: (b: Blob) => void }): React.JSX.Element {
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState('')
  const rec = useRef<MediaRecorder | null>(null)
  const start = async (): Promise<void> => {
    setFehler('')
    try {
      const strom = await navigator.mediaDevices.getUserMedia({ audio: true })
      const r = new MediaRecorder(strom)
      const teile: Blob[] = []
      r.ondataavailable = (e) => teile.push(e.data)
      r.onstop = () => {
        strom.getTracks().forEach((t) => t.stop())
        fertig(new Blob(teile, { type: r.mimeType || 'audio/webm' }))
        setLaeuft(false)
      }
      r.start()
      rec.current = r
      setLaeuft(true)
      setTimeout(() => r.state === 'recording' && r.stop(), minuten * 60_000)
    } catch {
      setFehler('Kein Zugriff aufs Mikrofon – bitte in den Einstellungen des Geräts erlauben.')
    }
  }
  return (
    <Stack gap={4}>
      {laeuft ? (
        <Button color="red" leftSection={<IconPlayerStop size={16} />} onClick={() => rec.current?.stop()} w="fit-content">
          Aufnahme beenden
        </Button>
      ) : (
        <Button variant="light" leftSection={<IconMicrophone size={16} />} onClick={() => void start()} w="fit-content">
          Aufnahme starten (höchstens {minuten} Min.)
        </Button>
      )}
      {fehler && (
        <Text size="sm" c="red">
          {fehler}
        </Text>
      )}
    </Stack>
  )
}

/** Lernkarten: umdrehen, „wusste ich" / „nochmal" – geschafft, wenn alle in einer Runde sitzen */
function Lernkarten({ karten, geschafft, fertig }: { karten: { vorne: string; hinten: string }[]; geschafft: boolean; fertig: () => void }): React.JSX.Element {
  const [stapel, setStapel] = useState(() => karten.map((_, n) => n))
  const [offen, setOffen] = useState(false)
  const [runde, setRunde] = useState(1)
  const [nochmal, setNochmal] = useState<number[]>([])
  if (!karten.length) return <Text c="dimmed">Keine Karten.</Text>
  if (!stapel.length) {
    if (!nochmal.length)
      return (
        <Alert color="green" title="Alle Karten sitzen!">
          {geschafft ? (
            'Schon erledigt.'
          ) : (
            <Button onClick={fertig} mt="xs" data-karten-fertig>
              Weiter
            </Button>
          )}
        </Alert>
      )
    return (
      <Alert color="blue">
        Runde {runde} vorbei – {nochmal.length} Karte{nochmal.length === 1 ? '' : 'n'} noch einmal.
        <Button
          mt="xs"
          display="block"
          onClick={() => {
            setStapel(nochmal)
            setNochmal([])
            setRunde(runde + 1)
          }}
        >
          Weiter üben
        </Button>
      </Alert>
    )
  }
  const k = karten[stapel[0]]
  const weiter = (gewusst: boolean): void => {
    if (!gewusst) setNochmal([...nochmal, stapel[0]])
    setStapel(stapel.slice(1))
    setOffen(false)
  }
  return (
    <Stack align="center" data-lernkarten>
      <Text size="sm" c="dimmed">
        Runde {runde} · noch {stapel.length}
      </Text>
      <Paper
        withBorder
        shadow="sm"
        radius="lg"
        p="xl"
        w="100%"
        maw={420}
        mih={160}
        onClick={() => setOffen(!offen)}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        data-karte
      >
        <Text size="xl" fw={600} ta="center">
          {offen ? k.hinten : k.vorne}
        </Text>
      </Paper>
      {!offen ? (
        <Button variant="light" onClick={() => setOffen(true)} data-karte-umdrehen>
          Umdrehen
        </Button>
      ) : (
        <Group>
          <Button color="orange" variant="light" onClick={() => weiter(false)}>
            Nochmal
          </Button>
          <Button color="green" onClick={() => weiter(true)} data-karte-gewusst>
            Wusste ich
          </Button>
        </Group>
      )}
    </Stack>
  )
}

/** Selbsteinschätzung: Ampel zu den Lernzielen der Reihe und der Schritte bis hier, dazu das Lerntagebuch */
function Reflexion({
  d,
  s,
  st,
  schicke,
  neu
}: {
  d: ReiheDaten
  s: SchrittSicht
  st: SchrittStand
  schicke: (a: string, m?: Record<string, unknown>) => Promise<Record<string, unknown>>
  neu: () => void
}): React.JSX.Element {
  const bis = d.schritte.findIndex((x) => x.id === s.id)
  const ziele = [...d.lernziele, ...d.schritte.slice(0, bis).flatMap((x) => x.lernziele)]
  const [ampel, setAmpel] = useState<Record<string, 'gruen' | 'gelb' | 'rot'>>(st.ampel ?? {})
  const [tagebuch, setTagebuch] = useState(st.tagebuch ?? '')
  const [laeuft, setLaeuft] = useState(false)
  return (
    <Stack data-reflexion>
      {ziele.map((z, n) => (
        <Card key={n} withBorder padding="sm">
          <Text size="sm" mb={6}>
            {alsSatz(z.ichKann)}
          </Text>
          <SegmentedControl
            fullWidth
            value={ampel[String(n)] ?? ''}
            onChange={(v) => setAmpel({ ...ampel, [String(n)]: v as 'gruen' | 'gelb' | 'rot' })}
            data={[
              { value: 'rot', label: '🔴 noch nicht' },
              { value: 'gelb', label: '🟡 teilweise' },
              { value: 'gruen', label: '🟢 sicher' }
            ]}
          />
        </Card>
      ))}
      {Boolean(s.inhalt?.frage) && (
        <Textarea label={String(s.inhalt!.frage)} autosize minRows={3} value={tagebuch} onChange={(e) => setTagebuch(e.currentTarget.value)} />
      )}
      <Button
        w="fit-content"
        loading={laeuft}
        disabled={ziele.some((_, n) => !ampel[String(n)])}
        onClick={() => {
          setLaeuft(true)
          void schicke('abgeben', { ampel, tagebuch })
            .then(neu)
            .finally(() => setLaeuft(false))
        }}
        data-reflexion-abgeben
      >
        {st.eingereicht ? 'Aktualisieren' : 'Fertig'}
      </Button>
    </Stack>
  )
}

/** Eingangsdiagnose: einmal ausfüllen, Ergebnis sofort */
function Diagnose({
  fragen,
  st,
  schicke,
  neu,
  wartenMin
}: {
  fragen: { frage: string; optionen: string[] }[]
  st: SchrittStand
  schicke: (a: string, m?: Record<string, unknown>) => Promise<Record<string, unknown>>
  neu: () => void
  wartenMin: number
}): React.JSX.Element {
  const [antworten, setAntworten] = useState<Record<string, string>>({})
  const [laeuft, setLaeuft] = useState(false)
  const [nochmal, setNochmal] = useState(false)
  // Wiederholen erst nach der Wartezeit (gegen Durchprobieren)
  const ab = st.diagnose && wartenMin ? st.diagnose.zeit + wartenMin * 60_000 : null
  if (st.diagnose && nochmal && ab && Date.now() >= ab) {
    // weiter unten das Formular
  } else if (st.diagnose && ab)
    return (
      <Alert color="blue" title={`${st.diagnose.prozent} % richtig`}>
        {Date.now() >= ab ? (
          <Button mt="xs" variant="light" onClick={() => setNochmal(true)} data-diagnose-nochmal>
            Noch einmal versuchen
          </Button>
        ) : (
          `Noch einmal möglich ab ${new Date(ab).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr.`
        )}
      </Alert>
    )
  else if (st.diagnose)
    return (
      <Alert color="blue" title={`${st.diagnose.prozent} % richtig`}>
        Danke! Auf deinem Weg siehst du jetzt, was du schon kannst und was als Nächstes dran ist.
      </Alert>
    )
  return (
    <Stack data-diagnose>
      <Text size="sm" c="dimmed">
        Ein kurzer Check, was du schon kannst. Wenn du etwas nicht weißt, lass es einfach leer – das ist kein Test.
      </Text>
      {fragen.map((f, n) => (
        <Card key={n} withBorder padding="sm">
          <Text size="sm" fw={600} mb={6}>
            {n + 1}. {f.frage}
          </Text>
          {f.optionen.length ? (
            <Radio.Group value={antworten[String(n)] ?? ''} onChange={(v) => setAntworten({ ...antworten, [String(n)]: v })}>
              <Stack gap={4}>
                {f.optionen.map((o) => (
                  <Radio key={o} value={o} label={o} />
                ))}
              </Stack>
            </Radio.Group>
          ) : (
            <TextInput
              value={antworten[String(n)] ?? ''}
              onChange={(e) => setAntworten({ ...antworten, [String(n)]: e.currentTarget.value })}
              autoCorrect="off"
              spellCheck={false}
            />
          )}
        </Card>
      ))}
      <Button
        w="fit-content"
        loading={laeuft}
        onClick={() => {
          setLaeuft(true)
          void schicke('diagnose', { antworten })
            .then(neu)
            .finally(() => setLaeuft(false))
        }}
        data-diagnose-abgeben
      >
        Auswerten
      </Button>
    </Stack>
  )
}

/** Arbeitsblatt mit Niveaustufen: Stufe wählen (Empfehlung aus der Eingangsdiagnose), dann ausfüllen */
function NiveauWahl({
  d,
  s,
  st,
  schicke
}: {
  d: ReiheDaten
  s: SchrittSicht
  st: SchrittStand
  schicke: (a: string, m?: Record<string, unknown>) => Promise<Record<string, unknown>>
}): React.JSX.Element {
  const stufen = (s.inhalt?.varianten as string[] | undefined) ?? []
  const [fehler, setFehler] = useState('')
  if (s.link && st.niveau !== undefined)
    return (
      <Group>
        <Badge variant="light" color="grape" size="lg">
          Stufe: {stufen[st.niveau] ?? st.niveau + 1}
        </Badge>
        <Button component="a" href={`${s.link}?reihe=${d.id}`} data-blatt-oeffnen>
          Zum Arbeitsblatt
        </Button>
      </Group>
    )
  if (s.link)
    return (
      <Button component="a" href={`${s.link}?reihe=${d.id}`}>
        Zum Arbeitsblatt
      </Button>
    )
  if (!stufen.length) return <Text c="dimmed">Das Arbeitsblatt wird gerade bereitgestellt.</Text>
  return (
    <Card withBorder padding="lg" data-niveauwahl>
      <Text fw={700} mb={4}>
        Wähle deine Stufe
      </Text>
      <Text size="sm" c="dimmed" mb="sm">
        Alle Stufen führen zum selben Ziel – nimm die, bei der du gut vorankommst.
      </Text>
      <Group>
        {stufen.map((label, n) => (
          <Button
            key={n}
            variant={s.empfehlung === n ? 'filled' : 'light'}
            onClick={() =>
              void schicke('niveau', { niveau: n }).then(
                (r) => window.location.assign(`${String(r.link ?? '')}?reihe=${d.id}`),
                (e: unknown) => setFehler(e instanceof Error ? e.message : String(e))
              )
            }
            data-niveau={n}
          >
            {label}
            {s.empfehlung === n ? ' (empfohlen)' : ''}
          </Button>
        ))}
      </Group>
      {s.empfehlung !== undefined && s.empfehlung !== null && (
        <Text size="xs" c="dimmed" mt="xs">
          Die Empfehlung kommt aus deiner Eingangsdiagnose.
        </Text>
      )}
      {fehler && (
        <Alert color="red" mt="sm">
          {fehler}
        </Alert>
      )}
    </Card>
  )
}

/** Frage an die Lehrkraft zu diesem Schritt („Haftnotiz") – mit Antwort */
function Fragen({ d, s, neu }: { d: ReiheDaten; s: SchrittSicht; neu: () => void }): React.JSX.Element {
  const eigene = (d.stand.fragen ?? []).filter((f) => f.schritt === s.id)
  const [text, setText] = useState('')
  const [offen, setOffen] = useState(false)
  return (
    <Stack gap="xs" data-fragen>
      {eigene.map((f, i) => (
        <Paper key={i} withBorder p="sm" radius="md" bg={f.antwort ? 'var(--mantine-color-blue-0)' : 'var(--mantine-color-yellow-0)'}>
          <Text size="sm">
            <b>Deine Frage:</b> {f.text}
          </Text>
          <Text size="sm" c={f.antwort ? undefined : 'dimmed'}>
            {f.antwort ? (
              <>
                <b>Antwort:</b> {f.antwort}
              </>
            ) : (
              'Deine Lehrkraft hat noch nicht geantwortet.'
            )}
          </Text>
        </Paper>
      ))}
      {offen ? (
        <Group align="end" wrap="nowrap">
          <Textarea
            style={{ flex: 1 }}
            autosize
            minRows={1}
            label="Deine Frage an die Lehrkraft"
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            data-frage-text
          />
          <Button
            disabled={!text.trim()}
            onClick={() =>
              void senden('/s/api/reihe/schritt', { id: d.id, schritt: s.id, aktion: 'frage', text }).then(() => {
                setText('')
                setOffen(false)
                neu()
              })
            }
            data-frage-senden
          >
            Senden
          </Button>
        </Group>
      ) : (
        <Button variant="subtle" size="xs" w="fit-content" onClick={() => setOffen(true)} data-frage-knopf>
          Frage zu diesem Schritt stellen
        </Button>
      )}
    </Stack>
  )
}
