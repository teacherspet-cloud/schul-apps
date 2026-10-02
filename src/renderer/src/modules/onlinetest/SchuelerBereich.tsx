/**
 * Schülerbereich des Servers (02.10.2026): Onlinetest am iPad, Telefon oder PC.
 *
 *  /s/          offene Tests der eigenen Lerngruppen, Code eingeben, Aufgaben mit Feedback
 *  /s/t/<CODE>  ein Test: (Name) → Warten auf den Start → Aufgaben → Abgabe → Ergebnis
 *  /s/a/<ID>    eine Aufgabe mit Feedback: schreiben → Feedback → überarbeiten (src/server/schuelerfeedback.ts)
 *
 * Regeln (Wunsch der Lehrkraft): Zeitlimit; wer die Seite verlässt (anderer Tab, andere App,
 * Startbildschirm), gibt SOFORT endgültig ab – Nachschlagen in Übersetzungs-Apps soll nicht
 * gehen. Die Uhr läuft auf dem Server. Zwischenstände werden laufend gesichert.
 * Eingabefelder ohne Autokorrektur und Rechtschreibprüfung – die würden sonst mitschreiben.
 *
 * Zweite Runde (02.10.2026 abends): Ohne IServ geben die Lernenden „Vorname + Anfangsbuchstabe"
 * ein; die Lehrkraft startet den Test für alle gemeinsam (bis dahin Wartebildschirm); nach der
 * Abgabe erscheint das Ergebnis, sobald alle abgegeben haben oder die Lehrkraft es freigibt.
 */
import { Alert, Badge, Button, Card, Center, Container, Group, Image, Loader, NativeSelect, Paper, Radio, SegmentedControl, Stack, Text, TextInput, Textarea, Title } from '@mantine/core'
import { IconAlertTriangle, IconCheck, IconClock, IconHourglass, IconLogout, IconX } from '@tabler/icons-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { HandFeld, TastaturFeld } from './HandFeld'
import { CodeScanner } from './CodeScanner'
import type { Erkennung } from './handschrift'
import { antwortAlsText, loesungAlsText, type Antworten, type Bewertung, type Einheit, type Feld, type Loesung, type OnlineAufgabe, type OnlineEintrag } from './kern'
import { holen, senden } from './serverApi'

interface Beitritt {
  id: string
  geheim?: string
  titel: string
  name: string
  hinweis: string
  variante: string
  zeitMin: number
  wartet: boolean
  ende: number
  jetzt: number
  abgegeben: boolean
  /** Posen der Figur, die der Test zeigt (winkend, jubelnd) */
  figur: string[]
  /** Handschrift erlaubt (Schreibfläche mit Erkennung) */
  handschrift?: boolean
  aufgaben: OnlineAufgabe[]
  antworten: Antworten
}

interface Ergebnis {
  frei: boolean
  abgegeben: boolean
  fertig?: number
  alle?: number
  punkte?: number
  max?: number
  note?: number
  vorlaeufig?: boolean
  aufgaben?: OnlineAufgabe[]
  einheiten?: Einheit[]
  loesungen?: Record<string, Loesung>
  antworten?: Antworten
  bewertung?: Bewertung
}

async function abmelden(): Promise<void> {
  await fetch('/auth/abmelden', { method: 'POST', headers: { 'x-schulapps-token': 'server' } }).catch(() => undefined)
  window.location.assign('/anmelden?ziel=/s/')
}

export default function SchuelerBereich(): React.JSX.Element {
  const pfad = window.location.pathname
  const code = /^\/s\/t\/([A-Za-z0-9]{4,12})/.exec(pfad)?.[1]
  const aufgabe = /^\/s\/a\/([a-f0-9]{8,32})/.exec(pfad)?.[1]
  const ich = window.__schulappsServer
  // Gäste (Beitritt mit Namen) haben kein Konto zum Abmelden – sie gehören nur zu diesem Test
  const gast = !ich?.angemeldet || ich.quelle === 'gast'
  return (
    <Container size="sm" py="md" px="md" style={{ minHeight: '100vh' }}>
      <Group justify="space-between" mb="md">
        <Text fw={700} size="lg">
          Schul-Apps · Onlinetest
        </Text>
        {!gast && (
          <Button variant="subtle" size="xs" leftSection={<IconLogout size={14} />} onClick={() => void abmelden()}>
            Abmelden
          </Button>
        )}
      </Group>
      {code ? <TestAblauf code={code.toUpperCase()} /> : aufgabe ? <FeedbackAufgabe id={aufgabe} /> : <Uebersicht />}
    </Container>
  )
}

/** Als App vom Home-Bildschirm geöffnet? (Safari: navigator.standalone, sonst display-mode) */
export const alsWebApp = (): boolean =>
  (typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true) ||
  (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches === true)
const aufAppleMobil = (): boolean => typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

function Uebersicht(): React.JSX.Element {
  const [tests, setTests] = useState<{ code: string; titel: string; zeitMin: number; abgegeben: boolean; wartend: boolean }[] | null>(null)
  const [code, setCode] = useState('')
  const [scannen, setScannen] = useState(false)
  // Ohne Anmeldung (Beitritt mit Namen): nur Code eingeben oder scannen
  const angemeldet = Boolean(window.__schulappsServer?.angemeldet)
  useEffect(() => {
    if (!angemeldet) return setTests([])
    void holen<{ tests: typeof tests }>('/s/api/tests')
      .then((d) => setTests(d.tests ?? []))
      .catch(() => setTests([]))
  }, [angemeldet])
  return (
    <Stack>
      <Card withBorder padding="lg">
        <Title order={4} mb="xs">
          Test mit Code öffnen
        </Title>
        <Group align="end">
          <TextInput
            style={{ flex: 1 }}
            label="Code (steht an der Tafel)"
            value={code}
            onChange={(e) => setCode(e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            size="md"
          />
          <Button size="md" disabled={code.length < 4} onClick={() => window.location.assign(`/s/t/${code}`)}>
            Öffnen
          </Button>
        </Group>
        <Button mt="sm" variant="light" fullWidth size="md" onClick={() => setScannen(true)} data-code-scannen>
          QR-Code scannen
        </Button>
        {scannen && <CodeScanner schliessen={() => setScannen(false)} gefunden={(c) => window.location.assign(`/s/t/${c}`)} />}
      </Card>
      {aufAppleMobil() && !alsWebApp() && (
        <Alert variant="light" color="blue" data-home-tipp>
          Tipp: Über „Teilen“ › „Zum Home-Bildschirm“ wird der Onlinetest zur App. Dort dann „QR-Code scannen“ nutzen – die Kamera-App öffnet sonst immer Safari.
        </Alert>
      )}
      {angemeldet && <AufgabenListe />}
      {angemeldet && <Title order={4}>Offene Tests</Title>}
      {!tests && <Loader />}
      {angemeldet && tests?.length === 0 && <Text c="dimmed">Gerade ist kein Test für dich freigegeben.</Text>}
      {tests?.map((t) => (
        <Card key={t.code} withBorder padding="md">
          <Group justify="space-between">
            <div>
              <Text fw={600}>{t.titel}</Text>
              <Text size="sm" c="dimmed">
                {t.zeitMin} Minuten{t.wartend ? ' · startet gleich' : ''}
              </Text>
            </div>
            {t.abgegeben ? (
              <Button component="a" variant="light" color="green" href={`/s/t/${t.code}`}>
                Ergebnis
              </Button>
            ) : (
              <Button component="a" href={`/s/t/${t.code}`}>
                Öffnen
              </Button>
            )}
          </Group>
        </Card>
      ))}
    </Stack>
  )
}

/** Figur des Tests (Maskottchen), falls die Lehrkraft sie eingeschaltet hat */
function Figur({ code, posen, pose, h }: { code: string; posen: string[]; pose: 'winkend' | 'jubelnd'; h: number }): React.JSX.Element | null {
  if (!posen.includes(pose)) return null
  return <Image src={`/s/api/figur/${code}/${pose}`} alt="" h={h} w="auto" fit="contain" data-figur={pose} />
}

/** Ohne IServ: Vorname + Anfangsbuchstabe des Nachnamens */
function NameEingeben({ code, fertig }: { code: string; fertig: () => void }): React.JSX.Element {
  const [name, setName] = useState('')
  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const gueltig = /^\p{L}[\p{L}'-]*(?: \p{L}[\p{L}'-]*)? \p{L}{1,3}\.?$/u.test(name.trim().replace(/\s+/g, ' '))
  const weiter = async (): Promise<void> => {
    setLaeuft(true)
    setFehler('')
    try {
      await senden('/s/api/gast', { code, name })
      fertig()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <Card withBorder padding="lg">
      <Title order={3} mb={4}>
        Wie heißt du?
      </Title>
      <Text c="dimmed" mb="md">
        Vorname und Anfangsbuchstabe des Nachnamens, z. B. „Anna K.“
      </Text>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (gueltig && !laeuft) void weiter()
        }}
      >
        <TextInput size="lg" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="Anna K." autoComplete="off" autoCorrect="off" spellCheck={false} data-gastname />
        {fehler && (
          <Alert color="red" mt="sm">
            {fehler}
          </Alert>
        )}
        <Button type="submit" size="lg" fullWidth mt="md" disabled={!gueltig} loading={laeuft}>
          Weiter
        </Button>
      </form>
    </Card>
  )
}

/** Handschrift im laufenden Test: welche Felder mit dem Stift, und die Erkennung je Feld */
interface HandKontext {
  an: boolean
  stift: (feld: string) => boolean
  umschalten: (feld: string, stift: boolean) => void
  erkenne: (feld: string) => (segment: string, png: string) => Promise<Erkennung>
}
const Handschrift = createContext<HandKontext>({ an: false, stift: () => false, umschalten: () => undefined, erkenne: () => () => Promise.reject(new Error('aus')) })

type Phase = 'name' | 'laden' | 'warten' | 'regeln' | 'laeuft' | 'abgegeben' | 'fehler'

function TestAblauf({ code }: { code: string }): React.JSX.Element {
  const angemeldet = Boolean(window.__schulappsServer?.angemeldet)
  const [phase, setPhase] = useState<Phase>(angemeldet ? 'laden' : 'name')
  const [t, setT] = useState<Beitritt | null>(null)
  const [fehler, setFehler] = useState('')
  const [antworten, setAntworten] = useState<Antworten>({})
  const [rest, setRest] = useState(0)
  const [grund, setGrund] = useState('')
  const versatz = useRef(0)
  const stand = useRef<Antworten>({})
  const laeuft = useRef(false)
  // Handschrift: Standard für alle Felder (Kopfleiste) und Ausnahmen je Feld
  const [stiftStandard, setStiftStandard] = useState(false)
  const [ausnahmen, setAusnahmen] = useState<Record<string, boolean>>({})
  const hand = useMemo<HandKontext>(
    () => ({
      an: Boolean(t?.handschrift),
      stift: (feld) => ausnahmen[feld] ?? stiftStandard,
      umschalten: (feld, stift) => setAusnahmen((a) => ({ ...a, [feld]: stift })),
      erkenne: (feld) => (segment, png) => senden<Erkennung>('/s/api/handschrift', { id: t?.id, geheim: t?.geheim, feld, segment, png })
    }),
    [t, ausnahmen, stiftStandard]
  )

  const beitreten = useCallback(() => {
    void senden<Beitritt>('/s/api/beitreten', { code })
      .then((d) => {
        setT(d)
        versatz.current = d.jetzt - Date.now()
        if (d.abgegeben) return setPhase('abgegeben')
        if (d.wartet) return setPhase('warten')
        // Nach einem Neuladen: Antworten vom Server, sonst aus dem Browser (falls neuer)
        let lokal: Antworten = {}
        try {
          lokal = JSON.parse(localStorage.getItem(`onlinetest-${d.id}`) ?? '{}') as Antworten
        } catch {
          lokal = {}
        }
        stand.current = { ...lokal, ...(d.antworten ?? {}) }
        setAntworten(stand.current)
        // Schon begonnen (Neuladen) → direkt weiter, sonst einmal die Regeln
        setPhase((p) => (p === 'warten' || Object.keys(stand.current).length ? 'laeuft' : 'regeln'))
      })
      .catch((e: unknown) => {
        setFehler(e instanceof Error ? e.message : String(e))
        setPhase('fehler')
      })
  }, [code])
  useEffect(() => {
    if (phase === 'laden') beitreten()
  }, [phase, beitreten])
  // Warten auf den Start durch die Lehrkraft
  useEffect(() => {
    if (phase !== 'warten') return
    const i = setInterval(beitreten, 3000)
    return () => clearInterval(i)
  }, [phase, beitreten])
  useEffect(() => {
    if (phase === 'laeuft') laeuft.current = true
  }, [phase])

  /** Endgültig abgeben – per sendBeacon, wenn die Seite gerade verlassen wird */
  const abgeben = useCallback(
    async (warum: 'selbst' | 'zeit' | 'verlassen'): Promise<void> => {
      if (!t?.geheim || !laeuft.current) return
      laeuft.current = false
      const koerper = JSON.stringify({ id: t.id, geheim: t.geheim, antworten: stand.current, grund: warum })
      if (warum === 'verlassen' && navigator.sendBeacon) {
        navigator.sendBeacon('/s/api/verlassen', new Blob([koerper], { type: 'text/plain' }))
      } else {
        await fetch(warum === 'verlassen' ? '/s/api/verlassen' : '/s/api/abgeben', { method: 'POST', body: koerper, keepalive: true }).catch(() => undefined)
      }
      try {
        localStorage.removeItem(`onlinetest-${t.id}`)
      } catch {
        // Sicherung im Browser ist nur ein Netz unter dem Netz
      }
      setGrund(warum)
      setPhase('abgegeben')
    },
    [t]
  )

  // Uhr (Serverzeit)
  useEffect(() => {
    if (phase !== 'laeuft' || !t) return
    const tick = (): void => {
      const r = Math.max(0, Math.round((t.ende - (Date.now() + versatz.current)) / 1000))
      setRest(r)
      if (r <= 0) void abgeben('zeit')
    }
    tick()
    const i = setInterval(tick, 1000)
    return () => clearInterval(i)
  }, [phase, t, abgeben])

  /*
   * Seite verlassen → sofort abgeben.
   *  - Anderer Tab, andere App, Startbildschirm, Bildschirmsperre: die Seite wird unsichtbar.
   *  - Anderes FENSTER daneben (Wörterbuch im zweiten Browserfenster, geteilte Ansicht am iPad):
   *    Die Seite bleibt sichtbar, verliert aber den Fokus (Befund der Lehrkraft, 02.10.2026 – das
   *    ging bis dahin durch). Darum ein Fokus-Wächter: länger als ~1,5 s ohne Fokus = verlassen.
   *    Die kurze Frist fängt Kurzes ab, das kein Verlassen ist (Bestätigungsfrage beim Abgeben).
   */
  useEffect(() => {
    if (phase !== 'laeuft') return
    const weg = (): void => {
      if (document.visibilityState === 'hidden') void abgeben('verlassen')
    }
    const raus = (): void => void abgeben('verlassen')
    let ohneFokus = 0
    const fokus = setInterval(() => {
      if (document.hasFocus()) ohneFokus = 0
      else if (++ohneFokus >= 3) void abgeben('verlassen')
    }, 500)
    document.addEventListener('visibilitychange', weg)
    window.addEventListener('pagehide', raus)
    return () => {
      clearInterval(fokus)
      document.removeEventListener('visibilitychange', weg)
      window.removeEventListener('pagehide', raus)
    }
  }, [phase, abgeben])

  // Zwischenstand: 2 s nach der letzten Eingabe an den Server
  useEffect(() => {
    if (phase !== 'laeuft' || !t?.geheim) return
    const z = setTimeout(() => {
      void senden('/s/api/speichern', { id: t.id, geheim: t.geheim, antworten: stand.current }).catch(() => undefined)
    }, 2000)
    return () => clearTimeout(z)
  }, [antworten, phase, t])

  const setze = (feld: string, wert: string): void => {
    stand.current = { ...stand.current, [feld]: wert }
    setAntworten(stand.current)
    try {
      if (t) localStorage.setItem(`onlinetest-${t.id}`, JSON.stringify(stand.current))
    } catch {
      // ohne Browserspeicher geht es auch
    }
  }

  if (phase === 'name') return <NameEingeben code={code} fertig={() => setPhase('laden')} />
  if (phase === 'laden') return <Loader />
  if (phase === 'fehler')
    return (
      <Alert color="red" icon={<IconAlertTriangle />}>
        {fehler}
        <Button mt="sm" variant="light" component="a" href="/s/">
          Zur Übersicht
        </Button>
      </Alert>
    )
  if (!t) return <Loader />
  if (phase === 'abgegeben') return <ErgebnisAnsicht code={code} t={t} grund={grund} />

  const regeln = (
    <Alert color="orange" icon={<IconAlertTriangle />} title="Bitte lesen" mb="md">
      <Stack gap={4}>
        <Text size="sm">Bleib auf dieser Seite, bis du abgegeben hast.</Text>
        <Text size="sm" fw={700}>
          Wenn du die Seite verlässt – anderer Tab, anderes Fenster, andere App, Startbildschirm –, wird dein Test sofort endgültig abgegeben.
        </Text>
        <Text size="sm">Du hast {t.zeitMin} Minuten. Deine Eingaben werden laufend gesichert.</Text>
      </Stack>
    </Alert>
  )
  if (phase === 'warten')
    return (
      <Card withBorder padding="lg" data-wartebildschirm>
        <Stack align="center" gap="xs" mb="md">
          <Figur code={code} posen={t.figur} pose="winkend" h={160} />
          <IconHourglass size={36} color="var(--mantine-color-blue-6)" />
          <Title order={3} ta="center">
            Gleich geht es los, {t.name}!
          </Title>
          <Text c="dimmed" ta="center">
            {t.titel} – deine Lehrkraft startet den Test gleich für alle. Diese Seite bitte offen lassen.
          </Text>
          <Loader type="dots" />
        </Stack>
        {t.hinweis && (
          <Alert mb="md" variant="light">
            {t.hinweis}
          </Alert>
        )}
        {regeln}
      </Card>
    )
  if (phase === 'regeln')
    return (
      <Card withBorder padding="lg">
        <Group justify="space-between" align="start" wrap="nowrap">
          <div>
            <Title order={3}>{t.titel}</Title>
            <Text c="dimmed" mb="md">
              Fassung {t.variante} · {t.zeitMin} Minuten
            </Text>
          </div>
          <Figur code={code} posen={t.figur} pose="winkend" h={90} />
        </Group>
        {t.hinweis && (
          <Alert mb="md" variant="light">
            {t.hinweis}
          </Alert>
        )}
        {regeln}
        <Button size="lg" fullWidth onClick={() => setPhase('laeuft')}>
          Test beginnen
        </Button>
      </Card>
    )

  const minuten = Math.floor(rest / 60)
  const sekunden = rest % 60
  return (
    <Stack gap="md" pb={120} translate="no">
      <Paper withBorder p="sm" radius="md" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--mantine-color-body)' }}>
        <Group justify="space-between" wrap="nowrap">
          <Figur code={code} posen={t.figur} pose="winkend" h={40} />
          <Text fw={600} truncate style={{ flex: 1 }}>
            {t.titel}
          </Text>
          <Badge size="lg" color={rest < 60 ? 'red' : rest < 300 ? 'orange' : 'blue'} leftSection={<IconClock size={14} />}>
            {minuten}:{String(sekunden).padStart(2, '0')}
          </Badge>
        </Group>
        {t.handschrift && (
          <SegmentedControl
            mt={6}
            size="xs"
            fullWidth
            value={stiftStandard ? 'stift' : 'tastatur'}
            onChange={(v) => {
              setStiftStandard(v === 'stift')
              setAusnahmen({})
            }}
            data={[
              { value: 'tastatur', label: '⌨ Tastatur' },
              { value: 'stift', label: '✎ Stift / Finger' }
            ]}
            data-schreibart
          />
        )}
      </Paper>
      <Handschrift.Provider value={hand}>
        {t.aufgaben.map((a, i) => (
          <AufgabeKarte key={a.id} nr={i + 1} aufgabe={a} antworten={antworten} setze={setze} />
        ))}
      </Handschrift.Provider>
      <Button size="lg" color="green" onClick={() => window.confirm('Test jetzt endgültig abgeben?') && void abgeben('selbst')}>
        Abgeben
      </Button>
    </Stack>
  )
}

/** Nach der Abgabe: warten, bis das Ergebnis frei ist – dann Punkte, Note und jede Aufgabe mit Lösung */
function ErgebnisAnsicht({ code, t, grund }: { code: string; t: Beitritt; grund: string }): React.JSX.Element {
  const [e, setE] = useState<Ergebnis | null>(null)
  const laden = useCallback(() => {
    void holen<Ergebnis>(`/s/api/ergebnis?id=${encodeURIComponent(t.id)}`)
      .then(setE)
      .catch(() => undefined)
  }, [t.id])
  useEffect(laden, [laden])
  // Bis das Ergebnis endgültig ist, regelmäßig nachsehen
  useEffect(() => {
    if (e?.frei && !e.vorlaeufig) return
    const i = setInterval(laden, 5000)
    return () => clearInterval(i)
  }, [e?.frei, e?.vorlaeufig, laden])
  const kopf = (
    <Card withBorder padding="xl">
      <Center>
        <Stack align="center" gap="xs">
          {e?.frei ? <Figur code={code} posen={t.figur} pose="jubelnd" h={150} /> : <IconCheck size={48} color="var(--mantine-color-green-6)" />}
          <Title order={3}>Abgegeben</Title>
          <Text ta="center" c="dimmed">
            {grund === 'verlassen'
              ? 'Du hast die Seite verlassen (anderer Tab, anderes Fenster oder andere App) – dein Test wurde deshalb automatisch abgegeben.'
              : grund === 'zeit'
                ? 'Die Zeit ist abgelaufen – dein Test wurde abgegeben.'
                : 'Dein Test ist bei deiner Lehrkraft angekommen.'}
          </Text>
          {e && !e.frei && (
            <Text ta="center" size="sm" c="dimmed" data-ergebnis-wartet>
              Dein Ergebnis erscheint hier, sobald alle abgegeben haben{e.alle ? ` (${e.fertig} von ${e.alle})` : ''} oder deine Lehrkraft es freigibt.
            </Text>
          )}
        </Stack>
      </Center>
    </Card>
  )
  if (!e?.frei || !e.aufgaben || !e.bewertung || !e.einheiten) return kopf
  const bewertung = e.bewertung
  const einheiten = e.einheiten
  return (
    <Stack data-ergebnis>
      {kopf}
      <Card withBorder padding="lg">
        <Group justify="space-between">
          <div>
            <Text c="dimmed" size="sm">
              Dein Ergebnis
            </Text>
            <Title order={2}>
              {e.punkte} / {e.max} Punkte
            </Title>
          </div>
          <Badge size="xl" variant="light">
            Note {e.note}
          </Badge>
        </Group>
        {e.vorlaeufig && (
          <Alert color="yellow" mt="sm" variant="light">
            Vorläufig – deine Lehrkraft prüft noch einzelne Antworten. Das Ergebnis kann sich noch ändern.
          </Alert>
        )}
      </Card>
      {e.aufgaben.map((a, i) => (
        <Card key={a.id} withBorder padding="md">
          <Group justify="space-between" mb={6}>
            <Text fw={700}>
              {i + 1}. {a.titel}
            </Text>
            <Badge variant="light">
              {einheiten.filter((x) => x.aufgabe === a.id).reduce((s, x) => s + (bewertung[x.id]?.punkte ?? 0), 0)} / {a.punkte} P.
            </Badge>
          </Group>
          <Stack gap={6}>
            {a.eintraege.map((eintrag) => {
              const b = bewertung[eintrag.einheit]
              const richtig = b?.status === 'richtig'
              const offen = !b || b.status === 'ki' || b.status === 'lehrkraft' || Boolean(b.pruefen)
              return (
                <Paper key={eintrag.einheit} withBorder p="xs" radius="sm">
                  <Group gap="xs" align="start" wrap="nowrap">
                    {offen ? (
                      <IconHourglass size={18} color="var(--mantine-color-yellow-7)" />
                    ) : richtig ? (
                      <IconCheck size={18} color="var(--mantine-color-green-7)" />
                    ) : (
                      <IconX size={18} color="var(--mantine-color-red-7)" />
                    )}
                    <Stack gap={0} style={{ flex: 1 }}>
                      {(eintrag.text || eintrag.vor || eintrag.saetze?.length) && (
                        <Text size="sm" c="dimmed">
                          {eintrag.text ??
                            (eintrag.saetze?.length
                              ? eintrag.saetze.map((s) => `${s.vor} ___ ${s.mitte !== undefined ? `${s.mitte} ___ ` : ''}${s.nach}`).join(' / ')
                              : `${(eintrag.vor ?? '').slice(-80)} ___ ${eintrag.nach ?? ''}`)}
                        </Text>
                      )}
                      {eintrag.felder.map((f) => (
                        <Text key={f.id} size="sm">
                          {f.beschriftung ? `${f.beschriftung}: ` : ''}
                          <b>{antwortAlsText(e.antworten?.[f.id], f.optionen) || '—'}</b>
                          {!richtig && e.loesungen?.[f.id] && (
                            <Text span size="sm" c="green.8">
                              {'  '}→ {loesungAlsText(e.loesungen[f.id], f.optionen)}
                            </Text>
                          )}
                        </Text>
                      ))}
                    </Stack>
                  </Group>
                </Paper>
              )
            })}
          </Stack>
        </Card>
      ))}
    </Stack>
  )
}

const KEINE_HILFE = { autoComplete: 'off', autoCorrect: 'off', autoCapitalize: 'none', spellCheck: false } as const

function FeldEingabe({ feld, wert, setze }: { feld: Feld; wert: string; setze: (f: string, w: string) => void }): React.JSX.Element {
  const hand = useContext(Handschrift)
  if (hand.an && (feld.art === 'text' || feld.art === 'langtext')) {
    if (hand.stift(feld.id))
      return (
        <HandFeld
          feld={feld.id}
          wert={wert}
          setze={setze}
          erkenne={hand.erkenne(feld.id)}
          lang={feld.art === 'langtext'}
          beschriftung={feld.beschriftung}
          zurTastatur={() => hand.umschalten(feld.id, false)}
        />
      )
    return (
      <TastaturFeld
        wert={wert}
        onChange={(w) => setze(feld.id, w)}
        lang={feld.art === 'langtext'}
        beschriftung={feld.beschriftung}
        placeholder={feld.anfang ? `${feld.anfang}…` : feld.laenge ? `${feld.laenge} Buchstaben` : ''}
        zumStift={() => hand.umschalten(feld.id, true)}
      />
    )
  }
  if (feld.art === 'langtext') return <Textarea autosize minRows={3} value={wert} onChange={(e) => setze(feld.id, e.currentTarget.value)} label={feld.beschriftung} {...KEINE_HILFE} />
  if (feld.art === 'wahr')
    return (
      <SegmentedControl
        value={wert}
        onChange={(v) => setze(feld.id, v)}
        data={(feld.optionen ?? []).map((o) => ({ value: o.wert, label: o.text }))}
        fullWidth
      />
    )
  if (feld.art === 'auswahl') {
    const optionen = feld.optionen ?? []
    if (optionen.length <= 4 && optionen.every((o) => o.text.length < 40))
      return (
        <Radio.Group value={wert} onChange={(v) => setze(feld.id, v)} label={feld.beschriftung}>
          <Group mt={4} gap="md">
            {optionen.map((o) => (
              <Radio key={o.wert} value={o.wert} label={o.text} size="md" />
            ))}
          </Group>
        </Radio.Group>
      )
    return <NativeSelect value={wert} onChange={(e) => setze(feld.id, e.currentTarget.value)} data={[{ value: '', label: '– wählen –' }, ...optionen.map((o) => ({ value: o.wert, label: o.text }))]} label={feld.beschriftung} size="md" />
  }
  return (
    <TextInput
      value={wert}
      onChange={(e) => setze(feld.id, e.currentTarget.value)}
      label={feld.beschriftung}
      placeholder={feld.anfang ? `${feld.anfang}…` : feld.laenge ? `${feld.laenge} Buchstaben` : ''}
      size="md"
      {...KEINE_HILFE}
    />
  )
}

function EintragZeile({ e, antworten, setze }: { e: OnlineEintrag; antworten: Antworten; setze: (f: string, w: string) => void }): React.JSX.Element {
  const felder = (
    <Stack gap={6} style={{ flex: 1, minWidth: 160 }}>
      {e.felder.map((f) => (
        <FeldEingabe key={f.id} feld={f} wert={antworten[f.id] ?? ''} setze={setze} />
      ))}
    </Stack>
  )
  return (
    <Paper withBorder p="sm" radius="md">
      <Stack gap={6}>
        {e.bild && <Image src={e.bild} alt="" h={120} w="auto" fit="contain" />}
        {e.saetze?.map((s, i) => (
          <Text key={i}>
            {s.vor} <b>{s.mitte !== undefined ? '(1) _____' : '_____'}</b>{' '}
            {s.mitte !== undefined && (
              <>
                {s.mitte} <b>(2) _____</b>{' '}
              </>
            )}
            {s.nach}
          </Text>
        ))}
        {(e.vor || e.nach) && (
          <Text>
            {e.vor} <b>_____</b> {e.nach}
          </Text>
        )}
        {e.text && <Text fw={500}>{e.text}</Text>}
        {e.woerter && !e.felder.some((f) => f.art === 'auswahl') && <Text c="dimmed">{e.woerter.map((w) => w || '…').join(' · ')}</Text>}
        {e.hinweis && <Text size="sm" c="dimmed">({e.hinweis})</Text>}
        {felder}
      </Stack>
    </Paper>
  )
}

function AufgabeKarte({ nr, aufgabe, antworten, setze }: { nr: number; aufgabe: OnlineAufgabe; antworten: Antworten; setze: (f: string, w: string) => void }): React.JSX.Element {
  const rechts = useMemo(() => (aufgabe.art === 'match' ? aufgabe.rechts : null), [aufgabe])
  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" mb={4}>
        <Text fw={700}>
          {nr}. {aufgabe.titel}
        </Text>
        <Badge variant="light">{aufgabe.punkte} P.</Badge>
      </Group>
      <Text mb="xs">{aufgabe.anweisung}</Text>
      {aufgabe.hilfe && (
        <Text size="sm" c="dimmed" mb="xs">
          ⓘ {aufgabe.hilfe}
        </Text>
      )}
      {aufgabe.thema && (
        <Text fw={600} mb="xs">
          Thema: {aufgabe.thema}
        </Text>
      )}
      {aufgabe.wortkasten && (
        <Paper withBorder p="xs" mb="sm" bg="var(--mantine-color-gray-light)">
          <Text size="sm">{aufgabe.wortkasten.join(' · ')}</Text>
        </Paper>
      )}
      {rechts && (
        <Paper withBorder p="xs" mb="sm">
          {rechts.map((r) => (
            <Text key={r.wert} size="sm">
              {r.text}
            </Text>
          ))}
        </Paper>
      )}
      {aufgabe.vorlage && aufgabe.art === 'freeText' && <Text mb="sm">{aufgabe.vorlage}</Text>}
      <Stack gap="sm">
        {aufgabe.eintraege.map((e) => (
          <EintragZeile key={e.einheit} e={e} antworten={antworten} setze={setze} />
        ))}
      </Stack>
      {aufgabe.vorlage && aufgabe.art === 'gapText' && <Text mt="xs">{aufgabe.vorlage}</Text>}
    </Card>
  )
}

// ---------------------------------------------------------------- Aufgaben mit Feedback

interface FeedbackBogen {
  staerken: string[]
  schritte: string[]
  kriterien: { kriterium: string; einschaetzung: string; beleg?: string }[]
  schluss?: string
  ueberarbeitung?: { zitat: string; auftrag: string }
}

interface AufgabeMitFeedback {
  id: string
  titel: string
  aufgabe: string
  runden: number
  genutzt: number
  bis: number | null
  fassungen: { nr: number; text: string; zeit: string; bogen?: FeedbackBogen; fehler?: string }[]
}

function AufgabenListe(): React.JSX.Element | null {
  const [liste, setListe] = useState<AufgabeMitFeedback[] | null>(null)
  useEffect(() => {
    void holen<{ aufgaben: AufgabeMitFeedback[] }>('/s/api/aufgaben').then((d) => setListe(d.aufgaben), () => setListe([]))
  }, [])
  if (!liste?.length) return null
  return (
    <>
      <Title order={4}>Aufgaben mit Feedback</Title>
      {liste.map((a) => (
        <Card key={a.id} withBorder padding="md">
          <Group justify="space-between">
            <div>
              <Text fw={600}>{a.titel}</Text>
              <Text size="sm" c="dimmed">
                {a.genutzt} von {a.runden} Feedback-Runden genutzt
                {a.bis ? ` · bis ${new Date(a.bis).toLocaleDateString('de-DE')}` : ''}
              </Text>
            </div>
            <Button component="a" href={`/s/a/${a.id}`}>
              Öffnen
            </Button>
          </Group>
        </Card>
      ))}
    </>
  )
}

const EINSCHAETZUNG: Record<string, string> = { sicher: 'sicher', teilweise: 'teilweise', 'noch nicht': 'noch nicht' }

function BogenAnsicht({ b }: { b: FeedbackBogen }): React.JSX.Element {
  return (
    <Stack gap="xs">
      {b.staerken.length > 0 && (
        <div>
          <Text fw={700} c="green">
            Das gelingt dir schon
          </Text>
          {b.staerken.map((x, i) => (
            <Text key={i} size="sm">
              • {x}
            </Text>
          ))}
        </div>
      )}
      {b.schritte.length > 0 && (
        <div>
          <Text fw={700} c="blue">
            Deine nächsten Schritte
          </Text>
          {b.schritte.map((x, i) => (
            <Text key={i} size="sm">
              {i + 1}. {x}
            </Text>
          ))}
        </div>
      )}
      {b.kriterien.length > 0 && (
        <div>
          <Text fw={700}>Kriterien</Text>
          {b.kriterien.map((k, i) => (
            <Text key={i} size="sm">
              <b>{k.kriterium}:</b> {EINSCHAETZUNG[k.einschaetzung] ?? k.einschaetzung}
              {k.beleg ? ` – „${k.beleg}“` : ''}
            </Text>
          ))}
        </div>
      )}
      {b.ueberarbeitung && (
        <Alert variant="light" title="Überarbeite diese Stelle">
          „{b.ueberarbeitung.zitat}“ – {b.ueberarbeitung.auftrag}
        </Alert>
      )}
      {b.schluss && <Text size="sm" fs="italic">{b.schluss}</Text>}
    </Stack>
  )
}

function FeedbackAufgabe({ id }: { id: string }): React.JSX.Element {
  const [a, setA] = useState<AufgabeMitFeedback | null | undefined>(undefined)
  const [text, setText] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState('')
  const laden = useCallback(() => {
    void holen<{ aufgaben: AufgabeMitFeedback[] }>('/s/api/aufgaben').then(
      (d) => {
        const x = d.aufgaben.find((y) => y.id === id) ?? null
        setA(x)
        if (x?.fassungen.length) setText((t) => t || x.fassungen[x.fassungen.length - 1].text)
      },
      () => setA(null)
    )
  }, [id])
  useEffect(laden, [laden])
  if (a === undefined) return <Loader />
  if (a === null)
    return (
      <Alert color="orange">
        Diese Aufgabe ist nicht (mehr) freigegeben.
        <Button mt="sm" variant="light" component="a" href="/s/">
          Zur Übersicht
        </Button>
      </Alert>
    )
  const rest = a.runden - a.genutzt
  const letzte = [...a.fassungen].reverse().find((f) => f.bogen)
  const einreichen = async (): Promise<void> => {
    setLaeuft(true)
    setFehler('')
    try {
      const r = await senden<{ ok: boolean; fehler?: string }>('/s/api/aufgabe/einreichen', { id, text })
      if (!r.ok && r.fehler) setFehler(r.fehler)
      laden()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <Stack>
      <Button variant="subtle" component="a" href="/s/" w="fit-content">
        ← Übersicht
      </Button>
      <Card withBorder padding="lg">
        <Title order={3}>{a.titel}</Title>
        <Text mt="xs" style={{ whiteSpace: 'pre-wrap' }}>
          {a.aufgabe}
        </Text>
      </Card>
      {letzte?.bogen && (
        <Card withBorder padding="lg">
          <Title order={4} mb="xs">
            Feedback zu Fassung {letzte.nr}
          </Title>
          <BogenAnsicht b={letzte.bogen} />
        </Card>
      )}
      <Card withBorder padding="lg">
        <Title order={4} mb="xs">
          {a.fassungen.length ? 'Überarbeiten' : 'Deine Lösung'}
        </Title>
        <Textarea autosize minRows={8} value={text} onChange={(e) => setText(e.currentTarget.value)} placeholder="Hier schreiben …" />
        {fehler && (
          <Alert color="red" mt="sm">
            {fehler}
          </Alert>
        )}
        <Group justify="space-between" mt="sm">
          <Text size="sm" c="dimmed">
            Noch {rest} von {a.runden} Feedback-Runden
          </Text>
          <Button loading={laeuft} disabled={rest <= 0 || text.trim().length < 20} onClick={() => void einreichen()}>
            Feedback anfordern
          </Button>
        </Group>
        {laeuft && (
          <Text size="sm" c="dimmed" mt="xs">
            Das Feedback wird geschrieben – das dauert etwa eine Minute.
          </Text>
        )}
      </Card>
    </Stack>
  )
}
