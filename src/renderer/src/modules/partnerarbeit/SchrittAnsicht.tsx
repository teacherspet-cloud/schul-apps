/**
 * Sicht einer Person auf den laufenden Schritt der Partnerarbeit (24.10.2026, abgestimmt mit der Lehrkraft) – für die
 * Lernenden (PartnerarbeitSeite) UND die Vorschau der Lehrkraft (PartnerVorschau, Fenster geteilt A|B|C). Der Inhalt
 * kommt fertig gefiltert aus shared/partnerarbeit/ablauf.ts (`sichtSchritt`): nur die eigene Rollenkarte, Hilfen nur
 * freigeschaltet, keine Namen. Knöpfe lösen Aktionen aus (haken, freischalten, naechste, wechsel, fertig, weiter,
 * rueckmeldung); wer sie ausführt, entscheidet der Aufrufer.
 */
import { Badge, Box, Button, Card, Checkbox, Group, Image, Paper, SimpleGrid, Stack, Switch, Text, Textarea, Tooltip } from '@mantine/core'
import { IconArrowsExchange, IconCheck, IconClock, IconLockOpen, IconMessage, IconPlayerTrackNext } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { HILFE_NAME, type HilfeArt, type SchrittSicht } from '@shared/partnerarbeit/ablauf'
import { PA_TEIL_NAME } from '@shared/partnerarbeit/typen'
import { symbolName } from '@shared/partnerarbeit/symbole'
import { SymbolBild } from './SymbolBild'

export interface Mitglied {
  symbol: string
  ich: boolean
  online: boolean
  rolle?: string
}

const ROLLE_TEXT: Record<string, string> = { A: 'Du fragst / moderierst', B: 'Du sprichst', C: 'Du sprichst', helfer: 'Du hilfst' }
/** Im Dialog sprechen alle Rollen; A ist dort nur Rolle 1 */
const rolleText = (teil: string, rolle: string): string =>
  teil === 'dialog' && rolle !== 'helfer' ? `Du sprichst · Rolle ${rolle}` : ROLLE_TEXT[rolle] ?? rolle
const SMILEYS = ['🙁', '🙂', '😀']
const KRITERIEN = ['Verständlich', 'Wortschatz', 'Redefluss']

function Uhr({ seit, zielMinuten, jetzt }: { seit: number; zielMinuten: number; jetzt: number }): React.JSX.Element {
  // Die Uhr rechnet mit dem Zeitstempel des Servers (iPad drosselt Zähler im Hintergrund)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])
  void tick
  const vergangen = Math.max(0, Math.floor((Date.now() - (Date.now() - jetzt) - seit) / 1000))
  const ziel = Math.round(zielMinuten * 60)
  const ueber = vergangen > ziel
  const mm = Math.floor(vergangen / 60)
  const ss = String(vergangen % 60).padStart(2, '0')
  return (
    <Badge variant="light" color={ueber ? 'orange' : 'gray'} leftSection={<IconClock size={12} />} tt="none" data-pa-uhr>
      {mm}:{ss} · Ziel {zielMinuten} Min.
    </Badge>
  )
}

function Hilfen({ h, sprache }: { h: SchrittSicht['hilfen']; sprache: string }): React.JSX.Element | null {
  const leer = !h.wortschatz?.length && !h.phrases?.length && !h.beispiele?.length && !h.vorschlaege?.length
  if (leer) return null
  return (
    <Stack gap="xs" data-pa-hilfen>
      {h.vorschlaege && h.vorschlaege.length > 0 && (
        <Paper withBorder p="xs" radius="md" data-pa-hilfe="vorschlaege">
          <Text size="xs" c="dimmed" fw={700}>
            Vorschläge
          </Text>
          {h.vorschlaege.map((v, i) => (
            <Text key={i} size="sm">
              • {v}
            </Text>
          ))}
        </Paper>
      )}
      {h.wortschatz && h.wortschatz.length > 0 && (
        <Paper withBorder p="xs" radius="md" data-pa-hilfe="wortschatz">
          <Text size="xs" c="dimmed" fw={700}>
            Wortschatz
          </Text>
          <Group gap={6}>
            {h.wortschatz.map((w, i) => (
              <Badge key={i} variant="light" color="teal" tt="none" size="lg" title={w.deutsch} lang={sprache}>
                {w.wort}
                {w.deutsch ? ` – ${w.deutsch}` : ''}
              </Badge>
            ))}
          </Group>
        </Paper>
      )}
      {h.phrases && h.phrases.length > 0 && (
        <Paper withBorder p="xs" radius="md" data-pa-hilfe="phrases">
          <Text size="xs" c="dimmed" fw={700}>
            Useful phrases
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={4}>
            {h.phrases.map((p, i) => (
              <Text key={i} size="sm" lang={sprache} title={p.deutsch}>
                {p.text}
              </Text>
            ))}
          </SimpleGrid>
        </Paper>
      )}
      {h.beispiele && h.beispiele.length > 0 && (
        <Paper withBorder p="xs" radius="md" data-pa-hilfe="beispiele">
          <Text size="xs" c="dimmed" fw={700}>
            Beispielsätze
          </Text>
          {h.beispiele.map((b, i) => (
            <Text key={i} size="sm" fs="italic" lang={sprache}>
              {b}
            </Text>
          ))}
        </Paper>
      )}
    </Stack>
  )
}

function Schalter({ s, aktion, fuerWen }: { s: SchrittSicht; aktion: (a: string, w?: unknown) => void; fuerWen: string }): React.JSX.Element | null {
  if (!s.schalter.length) return null
  return (
    <Paper withBorder p="xs" radius="md" data-pa-schalter>
      <Group gap={6} mb={4}>
        <IconLockOpen size={14} />
        <Text size="xs" c="dimmed" fw={700}>
          {fuerWen}
        </Text>
      </Group>
      <Group gap="md">
        {s.schalter.map((x) => (
          <Switch
            key={x.was}
            size="sm"
            label={HILFE_NAME[x.was as HilfeArt]}
            checked={x.an}
            onChange={(e) => aktion('freischalten', { was: x.was, an: e.currentTarget.checked })}
            data-pa-frei={x.was}
          />
        ))}
      </Group>
    </Paper>
  )
}

function Rueckmeldung({ s, aktion }: { s: SchrittSicht; aktion: (a: string, w?: unknown) => void }): React.JSX.Element {
  const r = s.rueckmeldung
  const [smileys, setSmileys] = useState<number[]>([1, 1, 1])
  const [satz, setSatz] = useState('')
  return (
    <Card withBorder radius="md" padding="md" data-pa-rueckmeldung>
      {r?.geber && !r.abgegeben ? (
        <Stack gap="sm">
          <Group gap={6}>
            <IconMessage size={16} />
            <Text fw={700}>Kurze Rückmeldung für deine Partner</Text>
          </Group>
          <SimpleGrid cols={3} spacing="xs">
            {KRITERIEN.map((k, i) => (
              <Stack key={k} gap={2} align="center">
                <Text size="xs" c="dimmed">
                  {k}
                </Text>
                <Group gap={2}>
                  {SMILEYS.map((sm, w) => (
                    <Button
                      key={w}
                      size="compact-sm"
                      variant={smileys[i] === w ? 'filled' : 'subtle'}
                      onClick={() => setSmileys(smileys.map((x, j) => (j === i ? w : x)))}
                      data-pa-smiley={`${i}:${w}`}
                    >
                      {sm}
                    </Button>
                  ))}
                </Group>
              </Stack>
            ))}
          </SimpleGrid>
          <Textarea
            placeholder="Ein Satz dazu (optional)"
            autosize
            minRows={1}
            maxLength={200}
            value={satz}
            onChange={(e) => setSatz(e.currentTarget.value)}
            data-pa-satz
          />
          <Group>
            <Button onClick={() => aktion('rueckmeldung', { smileys, satz })} data-pa-rueckmeldung-senden>
              Abschicken
            </Button>
            <Button variant="subtle" onClick={() => aktion('weiter')} data-pa-weiter>
              Ohne Rückmeldung weiter
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="sm">
          <Text fw={700}>{s.teil === 'dialog' ? 'Dialog beendet' : 'Runde beendet'}</Text>
          {r?.erhalten.map((e, i) => (
            <Paper key={i} withBorder p="xs" radius="md" data-pa-erhalten>
              <Group gap="md">
                {KRITERIEN.map((k, j) => (
                  <Text key={k} size="sm">
                    {k}: {SMILEYS[e.smileys[j] ?? 1]}
                  </Text>
                ))}
              </Group>
              {e.satz && <Text size="sm">„{e.satz}“</Text>}
            </Paper>
          ))}
          {r && !r.geber && !r.erhalten.length && s.teil !== 'dialog' && (
            <Text size="sm" c="dimmed">
              Dein Partner gibt dir gleich eine kurze Rückmeldung.
            </Text>
          )}
          <Button leftSection={<IconPlayerTrackNext size={16} />} onClick={() => aktion('weiter')} data-pa-weiter>
            Weiter
          </Button>
        </Stack>
      )}
    </Card>
  )
}

/**
 * Die eigentliche Sicht. `bildUrl` baut die Adresse eines Kartenbilds (Lernende /s/api/sprechen/bild/…, Lehrkraft
 * /server/sprech-bank/bild/…). `mitglieder` zeigt die Gruppe oben (Symbole), `dranSymbol` wer gerade antwortet.
 */
export function SchrittAnsicht({
  s,
  sprache,
  jetzt,
  aktion,
  bildUrl,
  mitglieder,
  dranSymbol,
  lehrkraft = false
}: {
  s: SchrittSicht
  sprache: string
  jetzt: number
  aktion: (a: string, w?: unknown) => void
  bildUrl: (datei: string) => string
  mitglieder?: Mitglied[]
  dranSymbol?: string
  lehrkraft?: boolean
}): React.JSX.Element {
  const istA = s.rolle === 'A'
  const partnerText =
    s.teil === 'dialog' ? (s.rolle === 'helfer' ? 'Für die Sprechenden freischalten' : 'Für mich freischalten') : 'Für deinen Partner freischalten'
  return (
    <Stack gap="sm" data-pa-schritt={s.teil} data-pa-rolle={s.rolle}>
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Group gap="xs">
          <Badge variant="filled" tt="none">
            {PA_TEIL_NAME[s.teil]}
            {s.unterrunden > 1 ? ` · Runde ${s.unterrunde + 1} von ${s.unterrunden}` : ''}
          </Badge>
          <Badge variant="light" color={istA ? 'violet' : s.rolle === 'helfer' ? 'orange' : 'teal'} tt="none" data-pa-rolle-text>
            {rolleText(s.teil, s.rolle)}
          </Badge>
          {s.dran === true && (
            <Badge variant="light" color="green" tt="none" data-pa-dran>
              Du bist dran
            </Badge>
          )}
          {s.uhr && <Uhr seit={s.uhr.seit} zielMinuten={s.uhr.zielMinuten} jetzt={jetzt} />}
        </Group>
        {mitglieder && (
          <Group gap={4}>
            {mitglieder.map((m, i) => (
              <Tooltip
                key={i}
                label={`${m.ich ? 'Du' : symbolName(m.symbol.split('#')[0], 'de')}${m.rolle ? ` · ${m.rolle === 'helfer' ? 'Helfer' : m.rolle}` : ''}${
                  m.online ? '' : ' · offline'
                }`}
              >
                <Box style={{ opacity: m.online ? 1 : 0.4, outline: m.ich ? '2px solid var(--mantine-color-violet-5)' : undefined, borderRadius: 8 }}>
                  <SymbolBild symbol={m.symbol} groesse={28} lehrkraft={lehrkraft} />
                </Box>
              </Tooltip>
            ))}
          </Group>
        )}
      </Group>

      {s.phase === 'rueckmeldung' && <Rueckmeldung s={s} aktion={aktion} />}

      {s.phase === 'arbeit' && s.teil === 'interview' && (
        <Card withBorder radius="md" padding="md" data-pa-interview>
          <Text fw={700} lang={sprache}>
            {s.titel}
          </Text>
          {s.interview ? (
            <Stack gap={6} mt="xs">
              {dranSymbol && (
                <Group gap={6} data-pa-dran-symbol>
                  <Text size="sm" c="dimmed">
                    Es antwortet:
                  </Text>
                  <SymbolBild symbol={dranSymbol} groesse={24} lehrkraft={lehrkraft} />
                </Group>
              )}
              {s.interview.fragen.map((f, i) => (
                <div key={i}>
                  <Checkbox label={<span lang={sprache}>{f.text}</span>} checked={f.haken} onChange={() => aktion('haken', { index: i })} data-pa-frage={i} />
                  {f.nachfrage && (
                    <Text size="xs" c="dimmed" ml={30} lang={sprache}>
                      ↳ {f.nachfrage}
                    </Text>
                  )}
                </div>
              ))}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed" mt="xs">
              {s.dran === false
                ? 'Gleich bist du dran – hör gut zu.'
                : 'Du wirst interviewt. Antworte in ganzen Sätzen und frag nach, wenn du etwas nicht verstehst.'}
            </Text>
          )}
        </Card>
      )}

      {s.phase === 'arbeit' && s.teil === 'monolog' && s.monolog && (
        <Card withBorder radius="md" padding="md" data-pa-monolog>
          <Group align="flex-start" wrap="wrap" gap="md">
            <Stack gap={4} style={{ flex: '1 1 260px', minWidth: 220 }}>
              {s.monolog.bilder.map((b) => (
                <Image key={b} src={bildUrl(b)} radius="md" fit="contain" mah={360} alt="" aria-hidden="true" data-pa-bild />
              ))}
            </Stack>
            <Stack gap="xs" style={{ flex: '1 1 240px' }}>
              <Text fw={700} lang={sprache}>
                {s.titel}
              </Text>
              <Text size="sm" lang={sprache} data-pa-auftrag>
                {s.monolog.auftrag}
              </Text>
              {istA && dranSymbol && (
                <Group gap={6} data-pa-dran-symbol>
                  <Text size="sm" c="dimmed">
                    Es spricht:
                  </Text>
                  <SymbolBild symbol={dranSymbol} groesse={24} lehrkraft={lehrkraft} />
                </Group>
              )}
              {istA && s.monolog.zusatzfragen && s.monolog.zusatzfragen.length > 0 && (
                <Paper withBorder p="xs" radius="md" data-pa-zusatzfragen>
                  <Text size="xs" c="dimmed" fw={700}>
                    Wenn es stockt
                  </Text>
                  {s.monolog.zusatzfragen.map((z, i) => (
                    <Text key={i} size="sm" lang={sprache}>
                      • {z}
                    </Text>
                  ))}
                </Paper>
              )}
              {istA && s.monolog.leitfragen.length > 0 && (
                <Text size="xs" c="dimmed" lang={sprache}>
                  Leitfragen: {s.monolog.leitfragen.join(' · ')}
                </Text>
              )}
            </Stack>
          </Group>
        </Card>
      )}

      {s.phase === 'arbeit' && s.teil === 'dialog' && s.dialog && (
        <Card withBorder radius="md" padding="md" data-pa-dialog>
          <Text fw={700} lang={sprache}>
            {s.titel}
          </Text>
          <Text size="sm" lang={sprache} mt={4}>
            {s.dialog.situation}
          </Text>
          {s.dialog.rolle && (
            <Paper withBorder p="xs" radius="md" mt="xs" data-pa-rollenkarte>
              <Text size="xs" c="dimmed" fw={700}>
                Deine Rolle{s.dialog.rolle.name ? `: ${s.dialog.rolle.name}` : ''}
              </Text>
              <Text size="sm" lang={sprache}>
                {s.dialog.rolle.karte}
              </Text>
            </Paper>
          )}
          {s.dialog.alleRollen?.map((r, i) => (
            <Paper key={i} withBorder p="xs" radius="md" mt="xs" data-pa-rollenkarte={i + 1}>
              <Text size="xs" c="dimmed" fw={700}>
                Rolle {i + 1}
                {r.name ? `: ${r.name}` : ''}
              </Text>
              <Text size="sm" lang={sprache}>
                {r.karte}
              </Text>
            </Paper>
          ))}
          {s.dialog.punkte.length > 0 && (
            <Group gap={6} mt="xs">
              {s.dialog.punkte.map((p, i) => (
                <Badge key={i} variant="outline" tt="none" size="lg" lang={sprache}>
                  {p}
                </Badge>
              ))}
            </Group>
          )}
          <Text size="sm" fw={600} mt="xs" lang={sprache} data-pa-ziel>
            {s.dialog.ziel}
          </Text>
        </Card>
      )}

      {s.phase === 'arbeit' && <Hilfen h={s.hilfen} sprache={sprache} />}
      {s.phase === 'arbeit' && <Schalter s={s} aktion={aktion} fuerWen={partnerText} />}

      {s.phase === 'arbeit' && (
        <Group gap="xs">
          {s.kann.naechste && (
            <Button variant="light" leftSection={<IconArrowsExchange size={16} />} onClick={() => aktion('naechste')} data-pa-naechste>
              Jetzt der/die andere
            </Button>
          )}
          {s.kann.wechsel && (
            <Button leftSection={<IconCheck size={16} />} onClick={() => aktion('wechsel')} data-pa-wechsel>
              Runde beenden
            </Button>
          )}
          {s.kann.fertig && (
            <Button leftSection={<IconCheck size={16} />} onClick={() => aktion('fertig')} data-pa-fertig>
              Fertig
            </Button>
          )}
        </Group>
      )}
    </Stack>
  )
}
