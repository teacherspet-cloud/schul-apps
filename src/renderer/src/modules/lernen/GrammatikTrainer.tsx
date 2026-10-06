/**
 * Grammatiktraining der Lernenden (06.10.2026) – /s/g/<id>. Grundgerüst wie der Vokabeltrainer:
 * Kasten mit Lernstand und Regelkarten → Tagesration (Lücke, Auswahl, Umformen, Fehler finden, Satzbau) →
 * danach Spiele (Fehler finden, Satzbau-Puzzle, Formen-Blitz, Regel zuordnen) mit eigenem Rekord.
 * Regeln in shared/grammatiktrainer.ts, Server in server/grammatik.ts. Keine KI-Anfragen.
 */
import { Alert, Badge, Button, Card, Center, Group, Loader, Paper, Progress, SimpleGrid, Stack, Text, TextInput, Title, UnstyledButton } from '@mantine/core'
import { IconArrowLeft, IconBook2, IconCheck, IconFlame, IconPlayerPlay, IconShieldCheck, IconStairsUp, IconTrophy, IconX } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ART_NAME,
  GRAMMATIK_SPIELE,
  normiert,
  regelBeispiele,
  woerterVon,
  type GrammatikAufgabe,
  type GrammatikPaket,
  type GrammatikSpielId
} from '@shared/grammatiktrainer'
import { alsKarten } from '@shared/grammatiktrainer'
import { sitzungsWoerter, STUFEN, uebersicht, type Urteil, type Vokabel, type WortStand } from '@shared/vokabeltrainer'
import { holen, senden } from '../onlinetest/serverApi'
import { CSS, TrainerFarben } from './VokabelTrainer'
import { useVtFarbe } from './vtFarben'

interface Daten {
  id: string
  titel: string
  fach: string
  sprache: string
  paket: GrammatikPaket
  staende: Record<string, WortStand>
  rekorde: Record<string, number>
  ansehen: string[]
}
interface Ergebnis {
  urteil: Urteil
  richtig: string
  erklaerung: string
  stand: WortStand
}

const mische = <T,>(l: T[]): T[] => {
  const a = [...l]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
/** Satzbauteile mischen – aber nie in der richtigen Reihenfolge lassen */
const teileGemischt = (teile: string[]): string[] => {
  for (let i = 0; i < 8; i++) {
    const m = mische(teile)
    if (m.join(' ') !== teile.join(' ')) return m
  }
  return [...teile].reverse()
}

export default function GrammatikTrainer({ id }: { id: string }): React.JSX.Element {
  const [d, setD] = useState<Daten | null | undefined>(undefined)
  const [fehler, setFehler] = useState('')
  const [sitzung, setSitzung] = useState<GrammatikAufgabe[] | null>(null)
  const laden = useCallback(() => {
    void holen<Daten>(`/s/api/grammatik/liste?id=${encodeURIComponent(id)}`).then(setD, (e: unknown) => {
      setFehler(e instanceof Error ? e.message : String(e))
      setD(null)
    })
  }, [id])
  useEffect(laden, [laden])
  if (d === undefined)
    return (
      <Center py="xl">
        <Loader />
      </Center>
    )
  if (!d) return <Alert color="orange">{fehler || 'Dieses Grammatiktraining gibt es nicht.'}</Alert>
  return (
    <TrainerFarben fach={d.fach}>
      {sitzung ? (
        <Sitzung d={d} aufgaben={sitzung} fertig={(st) => (setD({ ...d, staende: st }), setSitzung(null))} />
      ) : (
        <Kasten d={d} starten={setSitzung} aktualisieren={(r) => setD({ ...d, ...r })} />
      )}
    </TrainerFarben>
  )
}

function Kasten({
  d,
  starten,
  aktualisieren
}: {
  d: Daten
  starten: (a: GrammatikAufgabe[]) => void
  aktualisieren: (r: Partial<Daten>) => void
}): React.JSX.Element {
  const farbe = useVtFarbe()
  const karten = useMemo(() => alsKarten(d.paket.aufgaben) as Vokabel[], [d.paket.aufgaben])
  const u = uebersicht(karten, d.staende)
  const heute = sitzungsWoerter(karten, d.staende)
  const [regeln, setRegeln] = useState(false)
  const [spiel, setSpiel] = useState<GrammatikSpielId | null>(null)
  const ich = window.__schulappsServer
  const gast = !ich?.angemeldet || ich.quelle === 'gast'
  const nachId = new Map(d.paket.aufgaben.map((a) => [a.id, a]))
  const tagesAufgaben = heute.map((k) => nachId.get(k.id)!).filter(Boolean)
  // Spiele nur mit Aufgaben, die der Kasten schon eingeführt hat (wie bei den Vokabeln)
  const bekannt = useMemo(() => ({ ...d.paket, aufgaben: d.paket.aufgaben.filter((a) => (d.staende[a.id]?.fach ?? 0) > 0) }), [d.paket, d.staende])
  if (spiel)
    return (
      <Spiel
        d={{ ...d, paket: bekannt }}
        spiel={spiel}
        fertig={(r) => {
          setSpiel(null)
          if (r) aktualisieren(r)
        }}
      />
    )
  const werte = [
    { name: 'sicher', wert: `${u.sicher} / ${u.gesamt}`, farbe: '#14b8a6', symbol: <IconShieldCheck size={20} /> },
    { name: 'heute dran', wert: String(heute.length), farbe: farbe.a, symbol: <IconFlame size={20} /> },
    { name: 'im Aufbau', wert: String(u.imAufbau), farbe: '#f59e0b', symbol: <IconStairsUp size={20} /> }
  ]
  const max = Math.max(1, ...u.faecher)
  return (
    <Stack className="vt vt-rein" data-grammatik-kasten>
      <style>{CSS}</style>
      {!gast && (
        <Button component="a" href="/s/lernen" variant="subtle" color={farbe.a} leftSection={<IconArrowLeft size={16} />} px={4} w="fit-content">
          Lernraum
        </Button>
      )}
      <div>
        <Text c="dimmed" size="sm">
          Grammatik · {d.fach}
        </Text>
        <Title order={2}>{d.titel}</Title>
      </div>
      <SimpleGrid cols={3}>
        {werte.map((w) => (
          <Paper key={w.name} withBorder radius="lg" p="sm" style={{ borderColor: w.farbe }}>
            <Group gap={6} c={w.farbe}>
              {w.symbol}
              <Text size="xs" fw={700} tt="uppercase">
                {w.name}
              </Text>
            </Group>
            <Text fz={24} fw={800}>
              {w.wert}
            </Text>
          </Paper>
        ))}
      </SimpleGrid>
      <Group gap={4} align="flex-end" h={70} aria-label="Fächer im Kasten">
        {u.faecher.map((n, i) => (
          <Stack key={i} gap={2} align="center" style={{ flex: 1 }}>
            <Text size="xs">{n}</Text>
            <div
              style={{
                width: '100%',
                height: `${Math.max(4, (n / max) * 44)}px`,
                borderRadius: 6,
                background: i >= 5 ? '#14b8a6' : farbe.a,
                opacity: 0.35 + i * 0.1
              }}
            />
            <Text size="10px" c="dimmed">
              {STUFEN[i].kurz}
            </Text>
          </Stack>
        ))}
      </Group>
      {heute.length > 0 ? (
        <Button size="lg" radius="xl" className="vt-los" leftSection={<IconPlayerPlay size={18} />} onClick={() => starten(tagesAufgaben)} data-grammatik-start>
          Heute üben ({heute.length})
        </Button>
      ) : (
        <Alert color="teal" icon={<IconCheck size={16} />} data-grammatik-geschafft>
          Für heute ist alles geübt. Jetzt noch ein Spiel?
        </Alert>
      )}
      <Button variant="light" color={farbe.a} leftSection={<IconBook2 size={16} />} onClick={() => setRegeln((r) => !r)} data-regelkarten>
        {regeln ? 'Regelkarten schließen' : `Regelkarten (${d.paket.regeln.length})`}
      </Button>
      {regeln && (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {d.paket.regeln.map((r) => (
            <RegelKarte key={r.id} r={r} />
          ))}
        </SimpleGrid>
      )}
      <Title order={4} mt="sm">
        Spiele
      </Title>
      {heute.length > 0 && (
        <Text size="sm" c="dimmed">
          Die Spiele gibt es nach der Übung für heute.
        </Text>
      )}
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        {GRAMMATIK_SPIELE.map((s) => {
          const genug = s.id === 'regelzuordnen' ? d.paket.regeln.length >= 2 : bekannt.aufgaben.filter((a) => s.braucht.includes(a.art)).length >= 3
          return (
            <UnstyledButton key={s.id} disabled={heute.length > 0 || !genug} onClick={() => setSpiel(s.id)} data-grammatik-spiel={s.id}>
              <Card withBorder radius="lg" padding="sm" style={{ opacity: heute.length > 0 || !genug ? 0.5 : 1, height: '100%' }}>
                <Text fw={700}>{s.name}</Text>
                <Text size="xs" c="dimmed">
                  {s.beschreibung}
                </Text>
                {d.rekorde[s.id] !== undefined && (
                  <Badge mt={6} leftSection={<IconTrophy size={12} />} variant="light" color="yellow">
                    {d.rekorde[s.id]} {s.einheit}
                  </Badge>
                )}
              </Card>
            </UnstyledButton>
          )
        })}
      </SimpleGrid>
    </Stack>
  )
}

function RegelKarte({ r }: { r: GrammatikPaket['regeln'][number] }): React.JSX.Element {
  return (
    <Card withBorder radius="lg" padding="md" style={{ background: 'var(--vt-a-hell, transparent)' }} data-regelkarte>
      <Text fw={800} mb={4}>
        {r.titel}
      </Text>
      <Text size="sm">{r.erklaerung}</Text>
      {r.beispiele.map((b) => (
        <Text key={b} size="sm" fs="italic" mt={4}>
          → {b}
        </Text>
      ))}
    </Card>
  )
}

function Sitzung({ d, aufgaben, fertig }: { d: Daten; aufgaben: GrammatikAufgabe[]; fertig: (st: Record<string, WortStand>) => void }): React.JSX.Element {
  const farbe = useVtFarbe()
  const [schlange, setSchlange] = useState(aufgaben)
  const [staende, setStaende] = useState(d.staende)
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null)
  const [zaehler, setZaehler] = useState({ richtig: 0, gesamt: 0, wiederholt: new Map<string, number>() })
  const [laeuft, setLaeuft] = useState(false)
  const [frage, setFrage] = useState(0)
  const [regel, setRegel] = useState(false)
  const a = schlange[0]
  const antworten = async (antwort: string, wort?: string): Promise<void> => {
    if (!a || laeuft || ergebnis) return
    setLaeuft(true)
    try {
      const e = await senden<Ergebnis>('/s/api/grammatik/antwort', { id: d.id, aufgabeId: a.id, antwort, ...(wort !== undefined ? { wort } : {}) })
      setStaende((s) => ({ ...s, [a.id]: e.stand }))
      setErgebnis(e)
      setZaehler((z) => ({ ...z, richtig: z.richtig + (e.urteil === 'richtig' ? 1 : 0), gesamt: z.gesamt + 1 }))
    } finally {
      setLaeuft(false)
    }
  }
  const weiter = (): void => {
    if (!a || !ergebnis) return
    const n = zaehler.wiederholt.get(a.id) ?? 0
    const rest = schlange.slice(1)
    if (ergebnis.urteil !== 'richtig' && n < 2) {
      zaehler.wiederholt.set(a.id, n + 1)
      rest.splice(Math.min(3, rest.length), 0, a)
    }
    setSchlange(rest)
    setErgebnis(null)
    setRegel(false)
    setFrage((f) => f + 1)
  }
  useEffect(() => {
    const taste = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' && ergebnis) {
        e.preventDefault()
        weiter()
      }
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  })
  if (!a)
    return (
      <Stack align="center" py="xl" className="vt vt-rein" data-sitzung-fertig>
        <style>{CSS}</style>
        <div
          className="vt-ring"
          style={{ background: `conic-gradient(var(--vt-a) ${(zaehler.richtig / Math.max(1, zaehler.gesamt)) * 360}deg, var(--vt-a-rand) 0deg)` }}
        >
          <div className="vt-ring-innen">
            <IconCheck size={30} />
          </div>
        </div>
        <Title order={2}>Geschafft!</Title>
        <Text c="dimmed">
          {zaehler.richtig} von {zaehler.gesamt} Aufgaben auf Anhieb richtig.
        </Text>
        <Button size="lg" radius="xl" className="vt-los" onClick={() => fertig(staende)}>
          Zurück zum Kasten
        </Button>
      </Stack>
    )
  const r = d.paket.regeln.find((x) => x.id === a.regelId)
  const st = staende[a.id]
  return (
    <Stack className="vt" data-sitzung>
      <style>{CSS}</style>
      <Group justify="space-between">
        <Button variant="subtle" color={farbe.a} leftSection={<IconX size={16} />} onClick={() => fertig(staende)} px={4}>
          Beenden
        </Button>
        <Group gap={6}>
          <Badge variant="light" color={farbe.a} size="lg" radius="sm" tt="none">
            {ART_NAME[a.art]}
          </Badge>
          <Badge variant="outline" color={farbe.a} size="lg" radius="sm" tt="none">
            {STUFEN[Math.min(6, st?.fach ?? 0)].name}
          </Badge>
        </Group>
      </Group>
      <Progress value={(zaehler.gesamt / Math.max(1, zaehler.gesamt + schlange.length)) * 100} radius="xl" size="lg" color={farbe.a} />
      <div key={`${a.id}-${frage}`} className="vt-rein vt-buehne">
        <Aufgabe a={a} gesperrt={Boolean(ergebnis) || laeuft} antworten={(x, w) => void antworten(x, w)} ergebnis={ergebnis} />
      </div>
      {r && (
        <Button
          variant="subtle"
          size="xs"
          color={farbe.a}
          leftSection={<IconBook2 size={14} />}
          w="fit-content"
          onClick={() => setRegel((x) => !x)}
          data-regel-zeigen
        >
          {regel ? 'Regel ausblenden' : 'Regel ansehen'}
        </Button>
      )}
      {r && (regel || (ergebnis && ergebnis.urteil !== 'richtig')) && <RegelKarte r={r} />}
      {ergebnis && (
        <Alert color={ergebnis.urteil === 'richtig' ? 'green' : ergebnis.urteil === 'fast' ? 'yellow' : 'red'} data-urteil={ergebnis.urteil}>
          <Text fw={700}>
            {ergebnis.urteil === 'richtig' ? 'Richtig!' : ergebnis.urteil === 'fast' ? 'Fast – achte auf die Schreibweise.' : 'Leider falsch.'}
          </Text>
          {ergebnis.urteil !== 'richtig' && <Text size="sm">Richtig: {ergebnis.richtig}</Text>}
          {ergebnis.erklaerung && <Text size="sm">{ergebnis.erklaerung}</Text>}
        </Alert>
      )}
      {ergebnis && (
        <Button size="lg" radius="xl" className="vt-los" onClick={weiter} data-weiter autoFocus>
          Weiter
        </Button>
      )}
    </Stack>
  )
}

/** Eine Aufgabe je nach Art – auch von den Spielen genutzt */
function Aufgabe({
  a,
  gesperrt,
  antworten,
  ergebnis
}: {
  a: GrammatikAufgabe
  gesperrt: boolean
  antworten: (antwort: string, wort?: string) => void
  ergebnis?: { urteil: Urteil } | null
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [wort, setWort] = useState<number | null>(null)
  const [gelegt, setGelegt] = useState<number[]>([])
  const teile = useMemo(() => (a.art === 'satzbau' ? teileGemischt(a.teile ?? []) : []), [a])
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const optionen = useMemo(() => (a.art === 'auswahl' ? mische(a.optionen ?? []) : []), [a])
  const eingabe = useRef<HTMLInputElement>(null)
  useEffect(() => eingabe.current?.focus(), [a.id, wort])
  const absenden = (): void => {
    if (gesperrt) return
    if (a.art === 'fehler') {
      if (wort === null || !text.trim()) return
      return antworten(text, woerterVon(a.satz)[wort])
    }
    if (a.art === 'satzbau') {
      if (gelegt.length !== teile.length) return
      return antworten(gelegt.map((i) => teile[i]).join(' '))
    }
    if (text.trim()) antworten(text)
  }
  const [vor, nach] = a.satz.split('___')
  return (
    <Stack gap="sm" data-aufgabe={a.art}>
      <Text c="dimmed" size="sm">
        {a.anweisung || ART_NAME[a.art]}
      </Text>
      {a.art === 'luecke' && (
        <form onSubmit={(e) => (e.preventDefault(), absenden())}>
          <Text fz={22} fw={600} style={{ lineHeight: 1.9 }}>
            {vor}
            <TextInput
              ref={eingabe}
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
              disabled={gesperrt}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              display="inline-block"
              w={Math.max(120, (a.loesungen[0]?.length ?? 6) * 16)}
              size="md"
              styles={{ input: { fontSize: 20, fontWeight: 700 } }}
              data-luecke-eingabe
            />
            {nach}
          </Text>
          {a.vorgabe && (
            <Text c="dimmed" size="sm">
              {a.vorgabe}
            </Text>
          )}
          <Button mt="sm" type="submit" disabled={gesperrt || !text.trim()} data-pruefen>
            Prüfen
          </Button>
        </form>
      )}
      {a.art === 'auswahl' && (
        <>
          <Text fz={22} fw={600}>
            {vor}
            <Text span c="var(--vt-a)" fw={800}>
              {gewaehlt ?? '___'}
            </Text>
            {nach}
          </Text>
          <SimpleGrid cols={2}>
            {optionen.map((o) => (
              <Button
                key={o}
                size="lg"
                variant={gewaehlt === o ? 'filled' : 'default'}
                color={gewaehlt === o ? (ergebnis?.urteil === 'richtig' ? 'green' : ergebnis ? 'red' : undefined) : undefined}
                disabled={gesperrt && gewaehlt !== o}
                onClick={() => {
                  if (gesperrt) return
                  setGewaehlt(o)
                  antworten(o)
                }}
                data-option={o}
              >
                {o}
              </Button>
            ))}
          </SimpleGrid>
        </>
      )}
      {a.art === 'umformen' && (
        <form onSubmit={(e) => (e.preventDefault(), absenden())}>
          <Text fz={20} fw={600}>
            {a.satz}
          </Text>
          {a.vorgabe && <Text c="var(--vt-a)">{a.vorgabe}</Text>}
          <TextInput
            ref={eingabe}
            mt="sm"
            size="lg"
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            disabled={gesperrt}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            data-umformen-eingabe
          />
          <Button mt="sm" type="submit" disabled={gesperrt || !text.trim()} data-pruefen>
            Prüfen
          </Button>
        </form>
      )}
      {a.art === 'fehler' && (
        <form onSubmit={(e) => (e.preventDefault(), absenden())}>
          <Group gap={6}>
            {woerterVon(a.satz).map((w, i) => (
              <Button
                key={i}
                size="md"
                variant={wort === i ? 'filled' : 'default'}
                color={wort === i ? 'red' : undefined}
                disabled={gesperrt}
                onClick={() => setWort(i)}
                data-fehlerwort={w}
              >
                {w}
              </Button>
            ))}
          </Group>
          {wort !== null && (
            <Group mt="sm" align="flex-end">
              <TextInput
                ref={eingabe}
                label={`Statt „${woerterVon(a.satz)[wort]}" richtig:`}
                value={text}
                onChange={(e) => setText(e.currentTarget.value)}
                disabled={gesperrt}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                data-korrektur-eingabe
              />
              <Button type="submit" disabled={gesperrt || !text.trim()} data-pruefen>
                Prüfen
              </Button>
            </Group>
          )}
        </form>
      )}
      {a.art === 'satzbau' && (
        <>
          <Paper withBorder radius="md" p="sm" mih={56} data-satz-gelegt>
            <Group gap={6}>
              {gelegt.map((i, k) => (
                <Button key={k} variant="light" disabled={gesperrt} onClick={() => setGelegt(gelegt.filter((_, x) => x !== k))}>
                  {teile[i]}
                </Button>
              ))}
            </Group>
          </Paper>
          <Group gap={6}>
            {teile.map((t, i) =>
              gelegt.includes(i) ? null : (
                <Button key={i} variant="default" disabled={gesperrt} onClick={() => setGelegt([...gelegt, i])} data-satzteil={t}>
                  {t}
                </Button>
              )
            )}
          </Group>
          <Button disabled={gesperrt || gelegt.length !== teile.length} onClick={absenden} w="fit-content" data-pruefen>
            Prüfen
          </Button>
        </>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------- Spiele

function Spiel({ d, spiel, fertig }: { d: Daten; spiel: GrammatikSpielId; fertig: (r?: Partial<Daten>) => void }): React.JSX.Element {
  const farbe = useVtFarbe()
  const info = GRAMMATIK_SPIELE.find((s) => s.id === spiel)!
  const zeitSpiel = spiel === 'formenblitz' || spiel === 'satzbaupuzzle'
  const dauer = spiel === 'formenblitz' ? 60 : 120
  const runden = useMemo(() => {
    if (spiel === 'regelzuordnen') return mische(regelBeispiele(d.paket)).slice(0, 10)
    const art = spiel === 'fehlerjagd' ? 'fehler' : spiel === 'satzbaupuzzle' ? 'satzbau' : 'auswahl'
    const l = mische(d.paket.aufgaben.filter((a) => a.art === art))
    return zeitSpiel ? [...l, ...mische(l), ...mische(l)] : l.slice(0, 8)
  }, [d.paket, spiel, zeitSpiel])
  const [nr, setNr] = useState(0)
  const [punkte, setPunkte] = useState(0)
  const [fehler, setFehler] = useState<string[]>([])
  const [rest, setRest] = useState(dauer)
  const [urteil, setUrteil] = useState<Urteil | null>(null)
  const [ende, setEnde] = useState<{ rekord: boolean } | null>(null)
  const beendet = useRef(false)
  const abschliessen = useCallback(
    async (p: number, f: string[]) => {
      if (beendet.current) return
      beendet.current = true
      try {
        const r = await senden<{ rekord: boolean; rekorde: Record<string, number>; ansehen: string[] }>('/s/api/grammatik/spiel', {
          id: d.id,
          spiel,
          wert: p,
          fehler: f
        })
        setEnde({ rekord: r.rekord })
        d.rekorde = r.rekorde
      } catch {
        setEnde({ rekord: false })
      }
    },
    [d, spiel]
  )
  useEffect(() => {
    if (!zeitSpiel || ende) return
    const t = setInterval(() => setRest((x) => x - 1), 1000)
    return () => clearInterval(t)
  }, [zeitSpiel, ende])
  useEffect(() => {
    if (zeitSpiel && rest <= 0) void abschliessen(punkte, fehler)
  }, [rest, zeitSpiel, punkte, fehler, abschliessen])
  const naechste = (ok: boolean, aufgabeId?: string): void => {
    setUrteil(ok ? 'richtig' : 'falsch')
    const p = punkte + (ok ? 1 : 0)
    const f = !ok && aufgabeId ? [...fehler, aufgabeId] : fehler
    setPunkte(p)
    setFehler(f)
    setTimeout(
      () => {
        setUrteil(null)
        if (nr + 1 >= runden.length) void abschliessen(p, f)
        else setNr(nr + 1)
      },
      ok ? 450 : 1300
    )
  }
  if (ende)
    return (
      <Stack align="center" py="xl" className="vt vt-rein" data-spiel-ende>
        <style>{CSS}</style>
        <IconTrophy size={48} color={ende.rekord ? '#f59e0b' : 'gray'} />
        <Title order={2}>
          {punkte} {info.einheit}
        </Title>
        {ende.rekord && <Badge color="yellow">Neuer Rekord!</Badge>}
        <Button size="lg" radius="xl" className="vt-los" onClick={() => fertig({ rekorde: d.rekorde })}>
          Zurück zum Kasten
        </Button>
      </Stack>
    )
  const runde = runden[nr]
  return (
    <Stack className="vt" data-spiel={spiel}>
      <style>{CSS}</style>
      <Group justify="space-between">
        <Button variant="subtle" color={farbe.a} leftSection={<IconX size={16} />} onClick={() => fertig()} px={4}>
          Abbrechen
        </Button>
        <Title order={4}>{info.name}</Title>
        <Badge size="lg" variant="light" color={farbe.a}>
          {zeitSpiel ? `${Math.max(0, rest)} s · ` : `${nr + 1}/${runden.length} · `}
          {punkte}
        </Badge>
      </Group>
      {zeitSpiel && <Progress value={(rest / dauer) * 100} color={farbe.a} radius="xl" />}
      <div
        key={nr}
        className="vt-rein vt-buehne"
        style={{ outline: urteil ? `3px solid ${urteil === 'richtig' ? '#2f9e44' : '#e03131'}` : undefined, borderRadius: 16 }}
      >
        {spiel === 'regelzuordnen' ? (
          <RegelRunde beispiel={runde as { satz: string; regelId: string }} regeln={d.paket.regeln} gesperrt={urteil !== null} urteil={(ok) => naechste(ok)} />
        ) : (
          <Aufgabe
            a={runde as GrammatikAufgabe}
            gesperrt={urteil !== null}
            ergebnis={urteil ? { urteil } : null}
            antworten={(x, w) => {
              const a = runde as GrammatikAufgabe
              const okWort = a.art !== 'fehler' || (w !== undefined && normiert(w) === normiert(a.fehlerWort ?? ''))
              naechste(okWort && a.loesungen.some((l) => normiert(l) === normiert(x)), a.id)
            }}
          />
        )}
      </div>
      {urteil === 'falsch' && spiel !== 'regelzuordnen' && <Text c="red">Richtig: {(runde as GrammatikAufgabe).loesungen[0]}</Text>}
    </Stack>
  )
}

function RegelRunde({
  beispiel,
  regeln,
  gesperrt,
  urteil
}: {
  beispiel: { satz: string; regelId: string }
  regeln: GrammatikPaket['regeln']
  gesperrt: boolean
  urteil: (ok: boolean) => void
}): React.JSX.Element {
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const auswahl = useMemo(() => mische(regeln).slice(0, 4), [regeln])
  const optionen = auswahl.some((r) => r.id === beispiel.regelId)
    ? auswahl
    : [...auswahl.slice(0, 3), regeln.find((r) => r.id === beispiel.regelId)!].filter(Boolean)
  return (
    <Stack>
      <Text c="dimmed" size="sm">
        Welche Regel steckt in diesem Satz?
      </Text>
      <Text fz={22} fw={600}>
        {beispiel.satz}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {optionen.map((r) => (
          <Button
            key={r.id}
            size="lg"
            variant={gewaehlt === r.id ? 'filled' : 'default'}
            color={gewaehlt === r.id ? (r.id === beispiel.regelId ? 'green' : 'red') : undefined}
            disabled={gesperrt && gewaehlt !== r.id}
            onClick={() => {
              if (gesperrt) return
              setGewaehlt(r.id)
              urteil(r.id === beispiel.regelId)
            }}
            styles={{ label: { whiteSpace: 'normal' } }}
            h="auto"
            py="sm"
            data-regel-option={r.id}
          >
            {r.titel}
          </Button>
        ))}
      </SimpleGrid>
    </Stack>
  )
}
