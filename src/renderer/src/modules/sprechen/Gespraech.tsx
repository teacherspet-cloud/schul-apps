/**
 * Gesprächsseite des Sprechtrainings (19.10.2026). Verbindung: WebRTC direkt zur Gesprächs-KI – der Browser schickt nur
 * seine Verbindungsbeschreibung (SDP) an den Schul-Apps-Server, der die Sitzung mit dem Schlüssel der Lehrkraft anmeldet
 * (server/sprechen.ts). Audio geht nie über unseren Server und wird nirgends gespeichert.
 *
 * Kennzahlen aus dem Mikrofonpegel (nur Zahlen): Sprechzeit und lange Pausen (> 3 s) zwischen eigenen Redeabschnitten.
 * Phrase-Bingo (abgestimmt): 9 Wendungen – was im eigenen Transkript (Datenkanal) vorkommt, wird abgehakt.
 * Testmodus (Attrappe am Server): Antworten tippen statt sprechen.
 */
import { Alert, Badge, Button, Card, Group, Image, Loader, Progress, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { IconMicrophone, IconPlayerStop, IconRefresh } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { holen, senden } from '../onlinetest/serverApi'
import { KRITERIEN, noteSekI, stufeVon } from '@shared/sprechen/kriterien'
import { stufeVonNiveau, TEIL_NAME, type SprechSprache, type Teil } from '@shared/sprechen/niveaus'
import { phrasesFuerTeil, type Phrase } from '@shared/sprechen/phrases'
import { KrisenHilfe } from '../../shared/KrisenHilfe'
import { KiMarke } from '../onlinetest/KiMarke'
import { passtZurPhrase } from './PhraseSpiele'
import type { SprechFreigabe, Uebung } from './typen'

interface StartAntwort {
  sitzung: string
  sdp?: string
  attrappe?: boolean
  karten: Record<string, unknown>[]
  minuten: number
}

type Zustand = 'bereit' | 'verbinde' | 'laeuft' | 'werte' | 'fertig' | 'fehler'

const SPRACHE_BCP: Record<SprechSprache, string> = { en: 'en-GB', fr: 'fr-FR', es: 'es-ES' }

/** Karte, wie die/der Lernende sie sieht */
function KartenAnzeige({ k }: { k: Record<string, unknown> }): React.JSX.Element {
  if (k.art === 'interview')
    return (
      <Text size="sm" c="dimmed">
        Interview · Thema: {String(k.thema ?? '')}
      </Text>
    )
  if (k.art === 'monolog')
    return (
      <Stack gap={6}>
        <Text fw={700}>{String(k.titel ?? '')}</Text>
        <Group gap="xs">
          {((k.bilder as string[]) ?? []).map((b) => (
            <Image key={b} src={`/s/api/sprechen/bild/${b}`} h={180} w="auto" radius="md" alt="Bildkarte" />
          ))}
        </Group>
        <Text size="sm">{((k.leitfragen as string[]) ?? []).join(' · ')}</Text>
      </Stack>
    )
  return (
    <Stack gap={4}>
      <Text fw={700}>{String(k.titel ?? '')}</Text>
      <Text size="sm">{String(k.situation ?? '')}</Text>
      {k.rolle ? (
        <Text size="sm" c="dimmed">
          {String(k.rolle)}
        </Text>
      ) : null}
      <Group gap={6}>
        {((k.punkte as string[]) ?? []).map((p) => (
          <Badge key={p} variant="light" tt="none">
            {p}
          </Badge>
        ))}
      </Group>
      <Text size="xs" c="dimmed">
        Ziel: {String(k.ziel ?? '')}
      </Text>
    </Stack>
  )
}

/** Einschätzung nach der Übung: Stufen + Punkte, Simulation mit Notenspanne (unverbindlich) */
export function Ergebnis({ u, nochmal }: { u: Uebung; nochmal?: () => void }): React.JSX.Element {
  return (
    <Stack gap="sm" data-sprech-ergebnis>
      <Text fw={800} size="lg">
        Deine Einschätzung zum Üben
      </Text>
      {/* Kennzeichnung (22.10.2026, Art. 50 KI-VO) */}
      <div>
        <KiMarke art="einschaetzung" />
      </div>
      <Stack gap={6}>
        {KRITERIEN.map((k) => {
          const p = u.wertung[k.id] ?? 0
          return (
            <div key={k.id} data-kriterium={k.id}>
              <Group justify="space-between" gap="xs">
                <Text size="sm" fw={600}>
                  {k.name}
                  {k.id === 'aussprache' && u.ausspracheUnsicher ? ' *' : ''}
                </Text>
                <Text size="sm" c="dimmed">
                  {stufeVon(p)} · {p}/5
                </Text>
              </Group>
              <Progress value={(p / 5) * 100} color={p >= 4 ? 'teal' : p >= 3 ? 'blue' : p >= 2 ? 'yellow' : 'orange'} size="sm" radius="xl" />
            </div>
          )
        })}
      </Stack>
      {u.teil === 'simulation' && (
        <Text size="sm" data-sprech-punkte>
          {/* Einheitlich mit der Marke „keine Note" (23.10.2026, Nachprüfung des Schulträgers): unverbindliche Schätzung */}
          Zusammen {u.punkte} von 30 Punkten. <b>Unverbindliche Schätzung, keine Note:</b> In einer echten Prüfung läge das etwa bei {noteSekI(u.punkte)}.
          Deine Note gibt nur deine Lehrkraft.
        </Text>
      )}
      {u.ausspracheUnsicher && (
        <Text size="xs" c="dimmed">
          * Die Aussprache kann die KI aus dem Gespräch nur grob einschätzen – frag im Zweifel deine Lehrkraft.
        </Text>
      )}
      {u.staerke && (
        <Alert color="teal" variant="light" title="Das war stark">
          {u.staerke}
        </Alert>
      )}
      {u.tipps.map((t, i) => (
        <Card key={i} withBorder radius="md" padding="sm" data-sprech-tipp>
          <Text fw={700} size="sm">
            {t.titel}
          </Text>
          {t.eigen && (
            <Text size="sm" c="dimmed">
              Du: „{t.eigen}“
            </Text>
          )}
          {t.besser && (
            <Text size="sm" c="teal" fw={600}>
              Besser: „{t.besser}“
            </Text>
          )}
          {t.warum && <Text size="xs">{t.warum}</Text>}
        </Card>
      ))}
      {u.proaktiv && (
        <Alert color="grape" variant="light" title="Gespräch selbst in Gang halten">
          {u.proaktiv}
        </Alert>
      )}
      {nochmal && (
        <Button leftSection={<IconRefresh size={16} />} onClick={nochmal} w="fit-content" data-sprech-nochmal>
          Gleich nochmal
        </Button>
      )}
    </Stack>
  )
}

export function Gespraech({ f, teil, modus, zurueck }: { f: SprechFreigabe; teil: Teil; modus: 'ueben' | 'pruefung'; zurueck: (neu: boolean) => void }): React.JSX.Element {
  const [zustand, setZustand] = useState<Zustand>('bereit')
  const [fehler, setFehler] = useState('')
  const [start, setStart] = useState<StartAntwort | null>(null)
  const [verlauf, setVerlauf] = useState<{ rolle: 'ki' | 'ich'; text: string }[]>([])
  const [ergebnis, setErgebnis] = useState<{ gewertet: boolean; uebung?: Uebung; grund?: string; hilfe?: string } | null>(null)
  const [eingabe, setEingabe] = useState('')
  const [sekunden, setSekunden] = useState(0)
  const bingo = useMemo<Phrase[]>(() => {
    const l = phrasesFuerTeil(teil, stufeVonNiveau(f.niveau)).filter((p) => p.gruppe !== 'verbinden')
    return [...l].sort(() => Math.random() - 0.5).slice(0, 9)
  }, [teil, f.niveau])
  const [abgehakt, setAbgehakt] = useState<Set<string>>(new Set())
  const pc = useRef<RTCPeerConnection | null>(null)
  const strom = useRef<MediaStream | null>(null)
  const ton = useRef<HTMLAudioElement | null>(null)
  const pegel = useRef({ sprechMs: 0, langePausen: 0, letzteSprache: 0, imSprechen: false })
  const uhr = useRef<ReturnType<typeof setInterval> | null>(null)

  const eigeneSaetze = (text: string): void => {
    setVerlauf((v) => [...v, { rolle: 'ich', text }])
    setAbgehakt((a) => {
      const n = new Set(a)
      for (const p of bingo) if (passtZurPhrase(text, p.text[f.sprache])) n.add(p.id)
      return n
    })
  }

  const aufraeumen = (): void => {
    if (uhr.current) clearInterval(uhr.current)
    strom.current?.getTracks().forEach((t) => t.stop())
    pc.current?.close()
    pc.current = null
  }
  useEffect(() => aufraeumen, [])

  const beenden = async (): Promise<void> => {
    if (!start) return
    setZustand('werte')
    aufraeumen()
    try {
      const r = await senden<{ gewertet: boolean; uebung?: Uebung; grund?: string; hilfe?: string }>('/s/api/sprechen/ende', {
        sitzung: start.sitzung,
        kennzahlen: { sprechzeitMs: Math.round(pegel.current.sprechMs), langePausen: pegel.current.langePausen }
      })
      setErgebnis(r)
      setZustand('fertig')
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
      setZustand('fehler')
    }
  }

  /** Pegel messen: Sprechzeit und lange Pausen (> 3 s) zwischen eigenen Redeabschnitten – nur Zahlen */
  const pegelMessen = (ms: MediaStream): void => {
    const ctx = new AudioContext()
    const quelle = ctx.createMediaStreamSource(ms)
    const an = ctx.createAnalyser()
    an.fftSize = 1024
    quelle.connect(an)
    const daten = new Float32Array(an.fftSize)
    let zuletzt = performance.now()
    const schritt = (): void => {
      if (!pc.current) return void ctx.close()
      an.getFloatTimeDomainData(daten)
      let summe = 0
      for (const x of daten) summe += x * x
      const rms = Math.sqrt(summe / daten.length)
      const jetzt = performance.now()
      const p = pegel.current
      if (rms > 0.02) {
        if (!p.imSprechen && p.letzteSprache && jetzt - p.letzteSprache > 3000 && jetzt - p.letzteSprache < 15000) p.langePausen++
        p.sprechMs += jetzt - zuletzt
        p.imSprechen = true
        p.letzteSprache = jetzt
      } else if (p.imSprechen && jetzt - p.letzteSprache > 400) p.imSprechen = false
      zuletzt = jetzt
      requestAnimationFrame(schritt)
    }
    requestAnimationFrame(schritt)
  }

  const los = async (): Promise<void> => {
    setZustand('verbinde')
    setFehler('')
    setVerlauf([])
    setAbgehakt(new Set())
    pegel.current = { sprechMs: 0, langePausen: 0, letzteSprache: 0, imSprechen: false }
    try {
      // Testmodus erkennt der Server; im echten Betrieb erst das Mikrofon
      const verbindung = new RTCPeerConnection()
      pc.current = verbindung
      let ms: MediaStream | null = null
      try {
        ms = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      } catch {
        ms = null
      }
      strom.current = ms
      if (ms) ms.getTracks().forEach((t) => verbindung.addTrack(t, ms))
      else verbindung.addTransceiver('audio', { direction: 'recvonly' })
      const kanal = verbindung.createDataChannel('oai-events')
      verbindung.ontrack = (e) => {
        if (!ton.current) {
          ton.current = new Audio()
          ton.current.autoplay = true
          ton.current.setAttribute('playsinline', '')
        }
        ton.current.srcObject = e.streams[0]
      }
      kanal.onmessage = (ev) => {
        let e: { type?: string; transcript?: string; name?: string }
        try {
          e = JSON.parse(String(ev.data))
        } catch {
          return
        }
        if (e.type === 'conversation.item.input_audio_transcription.completed' && e.transcript) eigeneSaetze(e.transcript)
        if ((e.type === 'response.output_audio_transcript.done' || e.type === 'response.audio_transcript.done') && e.transcript) setVerlauf((v) => [...v, { rolle: 'ki', text: e.transcript! }])
        if (e.type === 'response.function_call_arguments.done' && e.name === 'uebung_beenden') setTimeout(() => void beenden(), 4500)
      }
      /*
       * Gesprächsbeginn (22.10.2026, KI-Sicherheitsprüfung): Der Browser stößt keine Antwort der KI selbst an – er meldet
       * nur „bereit“, und der Server startet das Gespräch über den Kontrollkanal. Jede Antwort ohne Anlass gilt dort als
       * Manipulation.
       */
      let sitzungsId = ''
      let kanalOffen = false
      const bereit = (): void => {
        if (sitzungsId && kanalOffen) void senden('/s/api/sprechen/los', { sitzung: sitzungsId }).catch(() => undefined)
      }
      kanal.onopen = () => {
        kanalOffen = true
        bereit()
      }
      const angebot = await verbindung.createOffer()
      await verbindung.setLocalDescription(angebot)
      const r = await senden<StartAntwort>('/s/api/sprechen/start', { freigabe: f.id, teil, modus, sdp: angebot.sdp })
      sitzungsId = r.sitzung
      bereit()
      setStart(r)
      if (r.attrappe) {
        verbindung.close()
        pc.current = null
        setVerlauf([{ rolle: 'ki', text: 'Hello! Tell me something about you.' }])
      } else {
        await verbindung.setRemoteDescription({ type: 'answer', sdp: r.sdp ?? '' })
        if (ms) pegelMessen(ms)
      }
      setZustand('laeuft')
      const beginn = Date.now()
      uhr.current = setInterval(() => {
        const s = Math.round((Date.now() - beginn) / 1000)
        setSekunden(s)
        // Vom Server beendet (Zeit, Missbrauch)?
        if (s % 3 === 0)
          void holen<{ beendet: boolean }>(`/s/api/sprechen/status?sitzung=${r.sitzung}`).then((x) => {
            if (x.beendet) void beenden()
          }, () => undefined)
      }, 1000)
    } catch (e) {
      aufraeumen()
      setFehler(e instanceof Error ? e.message : String(e))
      setZustand('fehler')
    }
  }

  const tippen = async (): Promise<void> => {
    if (!start || !eingabe.trim()) return
    const t = eingabe.trim()
    setEingabe('')
    eigeneSaetze(t)
    pegel.current.sprechMs += t.split(' ').length * 400
    const r = await senden<{ antwort: string; beendet: boolean }>('/s/api/sprechen/attrappe', { sitzung: start.sitzung, text: t })
    if (r.antwort) setVerlauf((v) => [...v, { rolle: 'ki', text: r.antwort }])
    if (r.beendet) void beenden()
  }

  const minuten = start?.minuten ?? 0
  return (
    <Stack gap="md" data-sprech-gespraech={teil}>
      <Group justify="space-between">
        <Text fw={800} size="lg">
          {TEIL_NAME[teil]} {modus === 'pruefung' ? '· Prüfungsmodus' : '· Üben'}
        </Text>
        <Button variant="subtle" size="xs" onClick={() => (aufraeumen(), zurueck(zustand === 'fertig'))} data-sprech-zurueck>
          Zurück
        </Button>
      </Group>
      {zustand === 'bereit' && (
        <Stack gap="sm">
          <Text size="sm">
            {modus === 'pruefung'
              ? 'Wie in der echten Prüfung: ohne Hilfen. Sprich laut und deutlich – am besten mit Kopfhörern.'
              : 'Die KI hilft dir, wenn du nicht weiterweißt. Sprich laut und deutlich – am besten mit Kopfhörern.'}
          </Text>
          {/*
           * Berichtigt (22.10.2026, Prüfung des Schulträgers): „Es wird nichts aufgenommen oder gespeichert" stimmte nicht –
           * die Stimme geht live an OpenAI, Einschätzung und Tipps werden gespeichert (src/server/sprechen.ts).
           */}
          <Text size="xs" c="dimmed" data-sprech-datenschutz>
            {/* Nachgeschärft (23.10.2026, Nachprüfung des Schulträgers): Moderation, Auswertung, Vorfall-Satz, Krise */}
            Dein Gesprächspartner ist eine KI, kein Mensch. Was du sagst, geht während des Gesprächs live an den KI-Dienst OpenAI in den USA,
            damit die KI antworten kann. Der Text wird dabei von OpenAI automatisch auf unangemessene Inhalte geprüft. Nach dem Gespräch
            wertet eine KI den Text aus; danach wird er gelöscht – gespeichert werden deine Punkte und Tipps. Sagst du etwas Unangemessenes,
            wird genau dieser eine Satz 14 Tage für deine Lehrkraft aufbewahrt. Klingt etwas so, als ginge es dir nicht gut, siehst du
            Hilfsangebote und deine Lehrkraft bekommt einen vertraulichen Hinweis (ohne deine Worte). Sag keine Namen, Adressen oder Geheimnisse.
          </Text>
          <Button size="lg" radius="xl" leftSection={<IconMicrophone size={22} />} onClick={() => void los()} w="fit-content" data-sprech-start>
            Gespräch starten
          </Button>
        </Stack>
      )}
      {zustand === 'verbinde' && (
        <Group gap="xs">
          <Loader size="sm" />
          <Text size="sm">Verbinde …</Text>
        </Group>
      )}
      {zustand === 'fehler' && (
        <Alert color="orange" title="Das ging nicht">
          {fehler}
        </Alert>
      )}
      {zustand === 'laeuft' && start && (
        <Stack gap="sm">
          <Group justify="space-between">
            <Badge size="lg" variant="light" leftSection={<IconMicrophone size={14} />}>
              {start.attrappe ? 'Testmodus' : 'Du bist dran, wenn die KI fertig ist'}
            </Badge>
            <Text size="sm" c={sekunden > minuten * 60 ? 'orange' : 'dimmed'}>
              {Math.floor(sekunden / 60)}:{String(sekunden % 60).padStart(2, '0')} / {minuten}:00
            </Text>
          </Group>
          {start.karten.map((k, i) => (
            <Card key={i} withBorder radius="md" padding="sm" data-sprech-karte>
              <KartenAnzeige k={k} />
            </Card>
          ))}
          {/* Mitschrift: im Üben als Hilfe; im Prüfungsmodus nur die eigene Zahl */}
          {modus === 'ueben' && (
            <Stack gap={4} mah={220} style={{ overflowY: 'auto' }} data-sprech-verlauf>
              {verlauf.slice(-8).map((z, i) => (
                <Text key={i} size="sm" c={z.rolle === 'ki' ? 'dimmed' : undefined} lang={SPRACHE_BCP[f.sprache]}>
                  <b>{z.rolle === 'ki' ? 'KI' : 'Du'}:</b> {z.text}
                </Text>
              ))}
            </Stack>
          )}
          {start.attrappe && (
            <Group gap="xs">
              <TextInput value={eingabe} onChange={(e) => setEingabe(e.currentTarget.value)} placeholder="Antwort (Testmodus)" onKeyDown={(e) => e.key === 'Enter' && void tippen()} data-sprech-eingabe />
              <Button onClick={() => void tippen()} data-sprech-senden>
                Senden
              </Button>
            </Group>
          )}
          {/* Phrase-Bingo (abgestimmt): was du benutzt, wird abgehakt */}
          <div>
            <Text size="xs" fw={700} c="dimmed" mb={4}>
              Phrase-Bingo · {abgehakt.size} von {bingo.length}
            </Text>
            <SimpleGrid cols={3} spacing={4} data-phrase-bingo>
              {bingo.map((p) => (
                <div
                  key={p.id}
                  style={{
                    fontSize: 11,
                    padding: 4,
                    borderRadius: 6,
                    textAlign: 'center',
                    border: '1px solid var(--mantine-color-default-border)',
                    background: abgehakt.has(p.id) ? 'var(--mantine-color-teal-light)' : undefined
                  }}
                  data-bingo-feld={abgehakt.has(p.id) ? 'ja' : 'nein'}
                >
                  {p.text[f.sprache]}
                </div>
              ))}
            </SimpleGrid>
          </div>
          <Button color="red" variant="light" leftSection={<IconPlayerStop size={16} />} onClick={() => void beenden()} w="fit-content" data-sprech-beenden>
            Gespräch beenden
          </Button>
        </Stack>
      )}
      {zustand === 'werte' && (
        <Group gap="xs">
          <Loader size="sm" />
          <Text size="sm">Die KI schätzt dein Gespräch ein …</Text>
        </Group>
      )}
      {zustand === 'fertig' && ergebnis && (
        <>
          {ergebnis.grund === 'krise' ? (
            // Krise (22.10.2026, Entscheidung der Lehrkraft): fester Hilfetext, kein Vorfall, keine Einschätzung
            <div data-sprech-krise>
              <KrisenHilfe text={ergebnis.hilfe || undefined} />
            </div>
          ) : ergebnis.gewertet && ergebnis.uebung ? (
            <Ergebnis u={ergebnis.uebung} nochmal={() => setZustand('bereit')} />
          ) : (
            <Alert color={ergebnis.grund === 'zu_kurz' ? 'blue' : 'orange'} data-sprech-nicht-gewertet={ergebnis.grund}>
              {ergebnis.grund === 'zu_kurz'
                ? 'Das Gespräch war zu kurz für eine Einschätzung. Versuch es gleich nochmal!'
                : 'Die Übung wurde beendet, weil sie nicht zum Sprechtraining gepasst hat. Sie zählt nicht.'}
            </Alert>
          )}
          {abgehakt.size >= 3 && ergebnis.grund !== 'krise' && (
            <Text size="sm" data-bingo-ergebnis>
              Phrase-Bingo: {abgehakt.size} Wendungen benutzt{abgehakt.size >= 9 ? ' – volles Feld!' : ''}
            </Text>
          )}
        </>
      )}
    </Stack>
  )
}
