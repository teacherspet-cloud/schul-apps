/**
 * Schülerbereich des Servers (02.10.2026): Onlinetest am iPad, Telefon oder PC.
 *
 *  /s/          offene Tests der eigenen Lerngruppen, Code eingeben
 *  /s/t/<CODE>  ein Test: Regeln → Start → Aufgaben → Abgabe
 *
 * Regeln (Wunsch der Lehrkraft): Zeitlimit; wer die Seite verlässt (anderer Tab, andere App,
 * Startbildschirm), gibt SOFORT endgültig ab – Nachschlagen in Übersetzungs-Apps soll nicht
 * gehen. Die Uhr läuft auf dem Server. Zwischenstände werden laufend gesichert.
 * Eingabefelder ohne Autokorrektur und Rechtschreibprüfung – die würden sonst mitschreiben.
 */
import { Alert, Badge, Button, Card, Center, Container, Group, Image, Loader, NativeSelect, Paper, Radio, SegmentedControl, Stack, Text, TextInput, Textarea, Title } from '@mantine/core'
import { IconAlertTriangle, IconCheck, IconClock, IconLogout } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Antworten, Feld, OnlineAufgabe, OnlineEintrag } from './kern'
import { holen, senden } from './serverApi'

interface Beitritt {
  id: string
  geheim?: string
  titel: string
  hinweis: string
  variante: string
  ende: number
  jetzt: number
  abgegeben: boolean
  aufgaben: OnlineAufgabe[]
  antworten: Antworten
}

async function abmelden(): Promise<void> {
  await fetch('/auth/abmelden', { method: 'POST', headers: { 'x-schulapps-token': 'server' } }).catch(() => undefined)
  window.location.assign('/anmelden?ziel=/s/')
}

export default function SchuelerBereich(): React.JSX.Element {
  const pfad = window.location.pathname
  const code = /^\/s\/t\/([A-Za-z0-9]{4,12})/.exec(pfad)?.[1]
  return (
    <Container size="sm" py="md" px="md" style={{ minHeight: '100vh' }}>
      <Group justify="space-between" mb="md">
        <Text fw={700} size="lg">
          Schul-Apps · Onlinetest
        </Text>
        <Button variant="subtle" size="xs" leftSection={<IconLogout size={14} />} onClick={() => void abmelden()}>
          Abmelden
        </Button>
      </Group>
      {code ? <TestAblauf code={code.toUpperCase()} /> : <Uebersicht />}
    </Container>
  )
}

function Uebersicht(): React.JSX.Element {
  const [tests, setTests] = useState<{ code: string; titel: string; zeitMin: number; abgegeben: boolean }[] | null>(null)
  const [code, setCode] = useState('')
  useEffect(() => {
    void holen<{ tests: typeof tests }>('/s/api/tests')
      .then((d) => setTests(d.tests ?? []))
      .catch(() => setTests([]))
  }, [])
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
      </Card>
      <Title order={4}>Offene Tests</Title>
      {!tests && <Loader />}
      {tests?.length === 0 && <Text c="dimmed">Gerade ist kein Test für dich freigegeben.</Text>}
      {tests?.map((t) => (
        <Card key={t.code} withBorder padding="md">
          <Group justify="space-between">
            <div>
              <Text fw={600}>{t.titel}</Text>
              <Text size="sm" c="dimmed">
                {t.zeitMin} Minuten
              </Text>
            </div>
            {t.abgegeben ? (
              <Badge color="green">abgegeben</Badge>
            ) : (
              <Button component="a" href={`/s/t/${t.code}`}>
                Starten
              </Button>
            )}
          </Group>
        </Card>
      ))}
    </Stack>
  )
}

type Phase = 'laden' | 'regeln' | 'laeuft' | 'abgegeben' | 'fehler'

function TestAblauf({ code }: { code: string }): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('laden')
  const [t, setT] = useState<Beitritt | null>(null)
  const [fehler, setFehler] = useState('')
  const [antworten, setAntworten] = useState<Antworten>({})
  const [rest, setRest] = useState(0)
  const [grund, setGrund] = useState('')
  const versatz = useRef(0)
  const stand = useRef<Antworten>({})
  const laeuft = useRef(false)

  useEffect(() => {
    void senden<Beitritt>('/s/api/beitreten', { code })
      .then((d) => {
        setT(d)
        versatz.current = d.jetzt - Date.now()
        stand.current = d.antworten ?? {}
        setAntworten(d.antworten ?? {})
        setPhase(d.abgegeben ? 'abgegeben' : 'regeln')
      })
      .catch((e: unknown) => {
        setFehler(e instanceof Error ? e.message : String(e))
        setPhase('fehler')
      })
  }, [code])

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

  // Seite verlassen → sofort abgeben
  useEffect(() => {
    if (phase !== 'laeuft') return
    const weg = (): void => {
      if (document.visibilityState === 'hidden') void abgeben('verlassen')
    }
    const raus = (): void => void abgeben('verlassen')
    document.addEventListener('visibilitychange', weg)
    window.addEventListener('pagehide', raus)
    return () => {
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
  if (phase === 'abgegeben')
    return (
      <Card withBorder padding="xl">
        <Center>
          <Stack align="center" gap="xs">
            <IconCheck size={48} color="var(--mantine-color-green-6)" />
            <Title order={3}>Abgegeben</Title>
            <Text ta="center" c="dimmed">
              {grund === 'verlassen'
                ? 'Du hast die Seite verlassen – dein Test wurde deshalb automatisch abgegeben.'
                : grund === 'zeit'
                  ? 'Die Zeit ist abgelaufen – dein Test wurde abgegeben.'
                  : 'Dein Test ist bei deiner Lehrkraft angekommen.'}
            </Text>
          </Stack>
        </Center>
      </Card>
    )
  if (phase === 'regeln')
    return (
      <Card withBorder padding="lg">
        <Title order={3}>{t.titel}</Title>
        <Text c="dimmed" mb="md">
          Fassung {t.variante} · {Math.round((t.ende - t.jetzt) / 60000)} Minuten
        </Text>
        {t.hinweis && (
          <Alert mb="md" variant="light">
            {t.hinweis}
          </Alert>
        )}
        <Alert color="orange" icon={<IconAlertTriangle />} title="Bitte lesen" mb="md">
          <Stack gap={4}>
            <Text size="sm">Bleib auf dieser Seite, bis du abgegeben hast.</Text>
            <Text size="sm" fw={700}>
              Wenn du die Seite verlässt – anderer Tab, andere App, Startbildschirm –, wird dein Test sofort endgültig abgegeben.
            </Text>
            <Text size="sm">Die Zeit läuft ab dem Moment, in dem du den Test geöffnet hast. Deine Eingaben werden laufend gesichert.</Text>
          </Stack>
        </Alert>
        <Button
          size="lg"
          fullWidth
          onClick={() => {
            laeuft.current = true
            setPhase('laeuft')
          }}
        >
          Test beginnen
        </Button>
      </Card>
    )

  const minuten = Math.floor(rest / 60)
  const sekunden = rest % 60
  return (
    <Stack gap="md" pb={120} translate="no">
      <Paper withBorder p="sm" radius="md" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--mantine-color-body)' }}>
        <Group justify="space-between">
          <Text fw={600} truncate style={{ flex: 1 }}>
            {t.titel}
          </Text>
          <Badge size="lg" color={rest < 60 ? 'red' : rest < 300 ? 'orange' : 'blue'} leftSection={<IconClock size={14} />}>
            {minuten}:{String(sekunden).padStart(2, '0')}
          </Badge>
        </Group>
      </Paper>
      {t.aufgaben.map((a, i) => (
        <AufgabeKarte key={a.id} nr={i + 1} aufgabe={a} antworten={antworten} setze={setze} />
      ))}
      <Button size="lg" color="green" onClick={() => window.confirm('Test jetzt endgültig abgeben?') && void abgeben('selbst')}>
        Abgeben
      </Button>
    </Stack>
  )
}

const KEINE_HILFE = { autoComplete: 'off', autoCorrect: 'off', autoCapitalize: 'none', spellCheck: false } as const

function FeldEingabe({ feld, wert, setze }: { feld: Feld; wert: string; setze: (f: string, w: string) => void }): React.JSX.Element {
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
            {s.vor} <b>_____</b> {s.nach}
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
