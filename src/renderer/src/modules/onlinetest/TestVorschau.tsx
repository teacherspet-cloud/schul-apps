/**
 * „Als Vorschau durchführen" (02.11.2026, Wunsch der Lehrkraft) im Fenster „Als Onlinetest durchführen": Die Lehrkraft
 * macht den Test so, wie ihn die Lernenden sehen (dieselben Aufgabenkarten wie im Schülerbereich), und sieht danach das
 * Ergebnis – automatisch Prüfbares sofort mit Lösung, freie Antworten als „prüft nach der Abgabe die KI" mit Erwartung.
 * Nichts wird gespeichert, kein Onlinetest angelegt.
 *
 * KI-Prüfung (02.11.2026, Wunsch der Lehrkraft): auf Knopfdruck prüft die KI die Antworten wie nach einer echten Abgabe
 * (POST /server/onlinetest/vorschau-ki, eigener KI-Zugang der Lehrkraft) – freie Antworten und abweichende Wörter.
 */
import { Alert, Badge, Button, Card, Group, Modal, Paper, SegmentedControl, Stack, Text } from '@mantine/core'
import { IconCheck, IconEye, IconQuestionMark, IconRefresh, IconSparkles, IconX } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { antwortAlsText, bewerte, felderVon, loesungAlsText, summe, type Antworten, type Bewertung, type OnlineFassung } from './kern'
import { AufgabeKarte, MaterialKarte } from './SchuelerBereich'
import { senden } from './serverApi'
import { notifyError } from '../../shared/util'

export interface VorschauFassung {
  label: string
  fassung: OnlineFassung
}

const uhr = (s: number): string => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`

export default function TestVorschau({
  fassungen,
  titel,
  zeitMin,
  ki,
  schliessen
}: {
  fassungen: VorschauFassung[]
  titel: string
  zeitMin: number
  /** Angaben für die KI-Prüfung (Sprache/Niveau beim Vokabeltest, Art/Fach bei Grammatiktest und Lernzielkontrolle) */
  ki?: { sprache?: string; niveau?: string; art?: string; fach?: string }
  schliessen: () => void
}): React.JSX.Element {
  const [wahl, setWahl] = useState(0)
  const [antworten, setAntworten] = useState<Antworten>({})
  const [ergebnis, setErgebnis] = useState<Bewertung | null>(null)
  const [kiLaeuft, setKiLaeuft] = useState(false)
  const [kiGefragt, setKiGefragt] = useState<number | null>(null)
  const [start, setStart] = useState(() => Date.now())
  const [jetzt, setJetzt] = useState(() => Date.now())
  useEffect(() => {
    if (ergebnis) return
    const t = setInterval(() => setJetzt(Date.now()), 1000)
    return () => clearInterval(t)
  }, [ergebnis])
  const f = fassungen[wahl]?.fassung
  const felder = useMemo(() => (f ? felderVon(f) : new Map()), [f])
  const neu = (i = wahl): void => {
    setWahl(i)
    setAntworten({})
    setErgebnis(null)
    setKiGefragt(null)
    setStart(Date.now())
    setJetzt(Date.now())
  }
  if (!f)
    return (
      <Modal opened onClose={schliessen} title="Vorschau">
        <Text>Der Test hat noch keine Fassung.</Text>
      </Modal>
    )
  const rest = zeitMin * 60 - Math.floor((jetzt - start) / 1000)
  const setze = (id: string, w: string): void => setAntworten((a) => ({ ...a, [id]: w }))
  const punkte = ergebnis ? summe(ergebnis) : 0
  const offen = ergebnis ? Object.values(ergebnis).filter((b) => b.status === 'ki' || b.status === 'lehrkraft').length : 0
  const zuEntscheiden = ergebnis ? Object.values(ergebnis).filter((b) => b.pruefen).length : 0
  const kiPruefen = async (): Promise<void> => {
    setKiLaeuft(true)
    try {
      const r = await senden<{ bewertung: Bewertung; gefragt: number }>(
        '/server/onlinetest/vorschau-ki',
        { fassung: f, antworten, ...(ki ?? {}) },
        180_000
      )
      setErgebnis(r.bewertung)
      setKiGefragt(r.gefragt)
    } catch (e) {
      notifyError(e, 'KI-Prüfung nicht möglich')
    } finally {
      setKiLaeuft(false)
    }
  }

  return (
    <Modal
      opened
      onClose={schliessen}
      size="xl"
      title={
        <Group gap="xs">
          <IconEye size={18} />
          <Text fw={700}>Vorschau: {titel}</Text>
          <Badge variant="light" color="gray">
            Probelauf – nichts wird gespeichert
          </Badge>
        </Group>
      }
      data-onlinetest-vorschau
    >
      <Stack gap="md">
        <Group justify="space-between" gap="xs">
          {fassungen.length > 1 ? (
            <SegmentedControl size="xs" value={String(wahl)} onChange={(v) => neu(Number(v))} data={fassungen.map((x, i) => ({ value: String(i), label: `Fassung ${x.label}` }))} />
          ) : (
            <span />
          )}
          <Group gap="xs">
            {!ergebnis && (
              <Badge size="lg" variant="light" color={rest < 60 ? 'red' : 'blue'} data-vorschau-zeit>
                {rest > 0 ? `noch ${uhr(rest)}` : 'Zeit abgelaufen'}
              </Badge>
            )}
            <Badge size="lg" variant="outline">
              {f.punkte} Punkte
            </Badge>
          </Group>
        </Group>

        {!ergebnis ? (
          <>
            {f.aufgaben.map((a, i) =>
              a.art === 'material' ? (
                <MaterialKarte key={a.id} html={a.html ?? ''} stil={f.stil ?? ''} nachweise={a.bildnachweise} />
              ) : (
                <AufgabeKarte key={a.id} nr={f.aufgaben.slice(0, i + 1).filter((x) => x.art !== 'material').length} aufgabe={a} antworten={antworten} setze={setze} />
              )
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={schliessen}>
                Vorschau beenden
              </Button>
              <Button leftSection={<IconCheck size={16} />} onClick={() => setErgebnis(bewerte(f, antworten))} data-vorschau-abgeben>
                Abgeben (Probe)
              </Button>
            </Group>
          </>
        ) : (
          <>
            <Alert
              variant="light"
              color={punkte === f.punkte ? 'green' : offen ? 'blue' : 'orange'}
              icon={offen ? <IconSparkles size={18} /> : <IconCheck size={18} />}
              data-vorschau-ergebnis
            >
              <Text fw={700}>
                {punkte} von {f.punkte} Punkten automatisch
              </Text>
              {offen > 0 && (
                <Text size="sm">
                  {offen} {offen === 1 ? 'Antwort prüft' : 'Antworten prüft'} im echten Test nach der Abgabe die KI (bzw. Sie entscheiden).
                </Text>
              )}
              {kiGefragt !== null && (
                <Text size="sm" data-vorschau-ki-fertig>
                  {kiGefragt ? `Die KI hat ${kiGefragt} ${kiGefragt === 1 ? 'Antwort' : 'Antworten'} geprüft – wie nach einer echten Abgabe.` : 'Für die KI gab es nichts zu prüfen.'}
                  {zuEntscheiden ? ` ${zuEntscheiden} davon würden Sie entscheiden (?).` : ''}
                </Text>
              )}
            </Alert>
            {kiGefragt === null && (
              <Group gap="xs" data-vorschau-ki-bereich>
                <Button variant="light" leftSection={<IconSparkles size={16} />} loading={kiLaeuft} onClick={() => void kiPruefen()} data-vorschau-ki>
                  Von der KI prüfen lassen
                </Button>
                <Text size="xs" c="dimmed" style={{ flex: 1, minWidth: 200 }}>
                  Wie nach einer echten Abgabe: freie Antworten und abweichende Wörter (Tippfehler, sinnvolle Alternativen). Nutzt Ihren KI-Zugang.
                </Text>
              </Group>
            )}
            {f.aufgaben
              .filter((a) => a.art !== 'material')
              .map((a, i) => {
                const einheiten = f.einheiten.filter((e) => e.aufgabe === a.id)
                if (!einheiten.length) return null
                return (
                  <Card key={a.id} withBorder radius="md" padding="sm">
                    <Text fw={700} mb={6}>
                      {/^Aufgabe \d+$/.test(a.titel) ? a.titel : `${i + 1}. ${a.titel}`}
                    </Text>
                    <Stack gap={4}>
                      {einheiten.map((e) => {
                        const b = ergebnis[e.id]
                        const zeichen =
                          b?.status === 'richtig' ? (
                            <IconCheck size={16} color="var(--mantine-color-green-6)" />
                          ) : b?.pruefen ? (
                            <IconQuestionMark size={16} color="var(--mantine-color-orange-6)" />
                          ) : b?.status === 'falsch' ? (
                            <IconX size={16} color="var(--mantine-color-red-6)" />
                          ) : (
                            <IconSparkles size={16} color="var(--mantine-color-blue-6)" />
                          )
                        const zeilen = e.felder.map((id) => {
                          const x = felder.get(id)
                          return {
                            id,
                            antwort: antwortAlsText(antworten[id], x?.feld.optionen) || '—',
                            loesung: loesungAlsText(f.loesungen[e.loesung ?? id], x?.feld.optionen)
                          }
                        })
                        return (
                          <Paper key={e.id} px="xs" py={4} radius="sm" withBorder data-vorschau-einheit={b?.status}>
                            <Group gap="xs" wrap="nowrap" align="flex-start">
                              <span style={{ marginTop: 2 }}>{zeichen}</span>
                              <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                                {zeilen.map((z) => (
                                  <Text key={z.id} size="sm">
                                    {z.antwort}
                                    {b?.status !== 'richtig' && z.loesung && (
                                      <Text span size="sm" c="dimmed">
                                        {` → ${z.loesung}`}
                                      </Text>
                                    )}
                                  </Text>
                                ))}
                                {b?.hinweis && (
                                  <Text size="xs" c="dimmed">
                                    {b.hinweis}
                                  </Text>
                                )}
                              </Stack>
                              <Text size="xs" c="dimmed">
                                {b?.status === 'ki' || b?.status === 'lehrkraft'
                                  ? 'prüft die KI'
                                  : b?.pruefen
                                    ? `Sie entscheiden${b.pruefen === 'kleinerFehler' ? ' (kleiner Fehler)' : ' (sinnvoll?)'}`
                                    : `${b?.punkte ?? 0}/${e.punkte} P.${b?.quelle === 'ki' ? ' · KI' : ''}`}
                              </Text>
                            </Group>
                          </Paper>
                        )
                      })}
                    </Stack>
                  </Card>
                )
              })}
            <Group justify="flex-end">
              <Button variant="default" leftSection={<IconRefresh size={16} />} onClick={() => neu()} data-vorschau-nochmal>
                Noch einmal
              </Button>
              <Button onClick={schliessen}>Vorschau beenden</Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  )
}
