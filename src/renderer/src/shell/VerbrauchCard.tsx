import { Alert, Card, Group, SegmentedControl, Select, SimpleGrid, Stack, Table, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { AI_PROVIDERS } from '@shared/types'
import { KI_ARTEN, type KiArt } from '@shared/kiArten'
import { werteVerbrauchAus, type VerbrauchsAuswertung, type VerbrauchsDaten } from '@shared/verbrauch'
import { kurzName, verbrauchStatus } from '@shared/einstellungsStatus'
import { KlappKarte } from '../shared/components/KlappKarte'
import { FortschrittsRing, GestapelteSaeulen, Kennzahl, RingDiagramm, useFarbenMitAndere, type Reihe } from '../shared/components/diagramme'

/**
 * Verbrauch der eigenen KI-Zugänge (27.09.2026, Großprogramm 0.4; Diagramme seit 09.10.2026, Wunsch der Lehrkraft).
 *
 * Oben Kennzahlen (diese Woche, dieser Monat, Token, Limits), daneben – wo der Anbieter es verrät – der Ring des
 * Kontingents (ElevenLabs-Zeichen). Darunter gestapelte Säulen je Tag (30 Tage) nach Anbieter oder nach Programm,
 * Tage mit erreichtem Limit markiert, ein Ring nach Programm und die zuletzt erreichten Limits. Die Tabelle je Monat
 * und Modell bleibt darunter. Eine Zählung, keine Kostenrechnung: Preise hängen am Vertrag; Token meldet nur der
 * API-Weg, beim Abo zählt die App nur die Anfragen. Diagramme: shared/components/diagramme (inline SVG).
 */
type Zaehler = VerbrauchsDaten['monate'][string][string]
const zahl = (n: number): string => (n ? n.toLocaleString('de-DE') : '–')
const ANDERE = '__andere'

/** Anbieterkennung → kurzer Name („anthropic" → „Claude") */
export function anbieterName(id: string): string {
  if (id === 'elevenlabs') return 'ElevenLabs'
  const p = AI_PROVIDERS.find((a) => a.id === id)
  return p ? kurzName(p.label) : id
}

const kompakt = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mio.` : n >= 1e4 ? `${Math.round(n / 1e3).toLocaleString('de-DE')} Tsd.` : n.toLocaleString('de-DE')

export default function VerbrauchCard({ elevenlabs = false }: { elevenlabs?: boolean }): React.JSX.Element {
  const [daten, setDaten] = useState<VerbrauchsDaten | null>(null)
  useEffect(() => {
    window.api.verbrauch
      .get()
      .then(setDaten)
      .catch(() => setDaten({ monate: {}, tage: {}, limits: [] }))
  }, [])
  const auswertung = useMemo(() => (daten ? werteVerbrauchAus(daten) : null), [daten])
  const limits = auswertung?.kennzahlen.limits ?? 0
  return (
    <KlappKarte
      id="verbrauch"
      titel="Verbrauch"
      status={verbrauchStatus(auswertung ? auswertung.kennzahlen.zeitraum : null, limits)}
      ton={limits ? 'warnung' : 'neutral'}
      rahmen={{ 'data-verbrauch': true }}
    >
      {daten && auswertung ? <VerbrauchInhalt daten={daten} a={auswertung} elevenlabs={elevenlabs} /> : null}
    </KlappKarte>
  )
}

function VerbrauchInhalt({ daten, a, elevenlabs }: { daten: VerbrauchsDaten; a: VerbrauchsAuswertung; elevenlabs: boolean }): React.JSX.Element {
  const { farben, andere } = useFarbenMitAndere()
  const [nach, setNach] = useState<'anbieter' | 'programm'>('anbieter')
  const [kontingent, setKontingent] = useState<Awaited<ReturnType<typeof window.api.verbrauch.kontingent>>>(null)
  useEffect(() => {
    // Nur mit ElevenLabs-Schlüssel und erst beim Aufklappen (kostet nichts, ist aber ein Netzaufruf)
    if (!elevenlabs) return
    let weg = false
    window.api.verbrauch
      .kontingent()
      .then((k) => !weg && setKontingent(k))
      .catch(() => undefined)
    return () => {
      weg = true
    }
  }, [elevenlabs])
  const k = a.kennzahlen
  const letztesLimit = a.limits[0]

  // Säulen: die vier häufigsten Anbieter bzw. Programme, der Rest als „Andere"
  const reihen: Reihe[] = useMemo(() => {
    const schluessel = nach === 'anbieter' ? a.anbieter.map((x) => x.id) : a.arten.map((x) => x.art as string)
    const haupt = schluessel.slice(0, 4)
    const wert = (t: VerbrauchsAuswertung['jeTag'][number], s: string): number => {
      const quelle = (nach === 'anbieter' ? t.anbieter : t.arten) as Record<string, number>
      return s === ANDERE ? Object.entries(quelle).reduce((z, [id, n]) => z + (haupt.includes(id) ? 0 : n), 0) : (quelle[s] ?? 0)
    }
    const mitAndere = schluessel.length > 4
    return [...haupt, ...(mitAndere ? [ANDERE] : [])].map((s, i) => ({
      name: s === ANDERE ? 'Andere' : nach === 'anbieter' ? anbieterName(s) : (KI_ARTEN[s as KiArt] ?? s),
      farbe: s === ANDERE ? andere : farben[i],
      werte: a.jeTag.map((t) => wert(t, s))
    }))
  }, [a, nach, farben, andere])

  const ringTeile = useMemo(() => {
    const haupt = a.arten.slice(0, 4)
    const rest = a.arten.slice(4).reduce((z, x) => z + x.wert, 0)
    return [...haupt.map((x, i) => ({ name: x.name, wert: x.wert, farbe: farben[i] })), ...(rest ? [{ name: 'Andere', wert: rest, farbe: andere }] : [])]
  }, [a, farben, andere])

  const tagText = (iso: string): string => new Date(iso).toLocaleString('de-DE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
  const beschreibung = `Gestapelte Säulen: Anfragen je Tag der letzten ${a.tage.length} Tage nach ${nach === 'anbieter' ? 'Anbieter' : 'Programm'}, insgesamt ${k.zeitraum}. ${reihen
    .map((r) => `${r.name}: ${r.werte.reduce((z, v) => z + v, 0)}`)
    .join(', ')}.${k.limits ? ` An ${a.jeTag.filter((t) => t.limits).length} Tagen wurde ein Limit erreicht.` : ''}`

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Was die App bei den eigenen KI-Zugängen angefragt hat – eine Zählung, keine Kostenrechnung (Preise hängen am Vertrag). Token melden nur Zugänge
        mit API-Schlüssel; beim Abo zählt die App die Anfragen.
      </Text>
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <Kennzahl titel="Diese Woche" wert={k.woche.toLocaleString('de-DE')} hinweis="Anfragen seit Montag" />
        <Kennzahl titel="Dieser Monat" wert={k.monat.toLocaleString('de-DE')} hinweis="Anfragen und Bilder" />
        <Kennzahl
          titel="Token, 30 Tage"
          wert={k.eingabe + k.ausgabe ? kompakt(k.eingabe + k.ausgabe) : '–'}
          hinweis={k.eingabe + k.ausgabe ? `${kompakt(k.eingabe)} ein · ${kompakt(k.ausgabe)} aus` : 'nur bei API-Schlüsseln'}
        />
        <Kennzahl
          titel="Limits, 30 Tage"
          wert={k.limits.toLocaleString('de-DE')}
          warnung={k.limits > 0}
          hinweis={letztesLimit ? `zuletzt ${tagText(letztesLimit.zeit)}` : 'kein Limit erreicht'}
        />
      </SimpleGrid>

      {(kontingent || k.ohneWiederholung !== null) && (
        <Group gap="xl" wrap="wrap">
          {kontingent && (
            <Group gap="sm" wrap="nowrap" data-verbrauch-kontingent>
              <FortschrittsRing
                anteil={kontingent.verbraucht / kontingent.grenze}
                titel="ElevenLabs-Kontingent verbraucht"
                unten={`${kontingent.verbraucht.toLocaleString('de-DE')} von ${kontingent.grenze.toLocaleString('de-DE')} Zeichen`}
              />
              <div>
                <Text size="sm" fw={600}>
                  ElevenLabs-Kontingent
                </Text>
                <Text size="sm">
                  {kontingent.verbraucht.toLocaleString('de-DE')} von {kontingent.grenze.toLocaleString('de-DE')} Zeichen
                </Text>
                {kontingent.erneuert && (
                  <Text size="xs" c="dimmed">
                    neu ab {new Date(kontingent.erneuert).toLocaleDateString('de-DE')}
                  </Text>
                )}
              </div>
            </Group>
          )}
          {k.ohneWiederholung !== null && (
            <Group gap="sm" wrap="nowrap">
              <FortschrittsRing anteil={k.ohneWiederholung} titel="Anfragen ohne Wiederholung" farbe="var(--mantine-color-teal-6)" warnAb={2} />
              <div>
                <Text size="sm" fw={600}>
                  Ohne Wiederholung
                </Text>
                <Text size="xs" c="dimmed" maw={260}>
                  Anteil der Anfragen, die die App nicht wegen einer unbrauchbaren Antwort neu stellen musste ({zahl(k.wiederholungen)} Wiederholungen).
                </Text>
              </div>
            </Group>
          )}
        </Group>
      )}
      {!kontingent && (
        <Text size="xs" c="dimmed">
          Wie viel vom Abo oder Guthaben übrig ist, melden die Anbieter der App nicht – das steht im Konto beim Anbieter.
        </Text>
      )}

      <Card withBorder>
        <Group justify="space-between" mb="xs" wrap="wrap">
          <Text fw={600} size="sm">
            Anfragen je Tag (30 Tage)
          </Text>
          <SegmentedControl
            size="xs"
            value={nach}
            onChange={(v) => setNach(v as 'anbieter' | 'programm')}
            data={[
              { value: 'anbieter', label: 'nach Anbieter' },
              { value: 'programm', label: 'nach Programm' }
            ]}
            aria-label="Säulen aufteilen"
          />
        </Group>
        {k.zeitraum ? (
          <GestapelteSaeulen
            tage={a.tage}
            reihen={reihen}
            beschreibung={beschreibung}
            markiert={(i) => (a.jeTag[i].limits ? `${a.jeTag[i].limits} ${a.jeTag[i].limits === 1 ? 'Limit' : 'Limits'} erreicht` : null)}
          />
        ) : (
          <Text size="sm" c="dimmed">
            In den letzten 30 Tagen keine Anfragen gezählt.
          </Text>
        )}
      </Card>

      {ringTeile.length > 0 && (
        <Card withBorder>
          <Text fw={600} size="sm" mb="xs">
            Nach Programm (30 Tage)
          </Text>
          <RingDiagramm
            teile={ringTeile}
            mitte={k.zeitraum.toLocaleString('de-DE')}
            unten="Anfragen"
            groesse={140}
            titel="Anfragen nach Programm"
            wertText={(v) => v.toLocaleString('de-DE')}
          />
        </Card>
      )}

      {a.limits.length > 0 && (
        <Alert color="orange" variant="light" icon={<IconAlertTriangle size={18} />} title="Erreichte Limits" data-verbrauch-limits>
          <Stack gap={2}>
            {a.limits.slice(0, 5).map((l) => (
              <Text key={l.zeit + l.anbieter} size="sm">
                <b>{tagText(l.zeit)}</b> · {anbieterName(l.anbieter)}
                {l.art ? ` · ${KI_ARTEN[l.art] ?? l.art}` : ''} – {l.meldung}
              </Text>
            ))}
          </Stack>
          <Text size="xs" c="dimmed" mt={4}>
            Beim Abo hilft Warten bis zum nächsten Zeitfenster oder der Sparmodus; beim API-Schlüssel das Guthaben im Konto des Anbieters prüfen.
          </Text>
        </Alert>
      )}

      <MonatsTabelle monate={daten.monate} />
    </Stack>
  )
}

/** Die bisherige Tabelle je Monat, Anbieter und Modell (27.09.2026) */
function MonatsTabelle({ monate: daten }: { monate: VerbrauchsDaten['monate'] }): React.JSX.Element | null {
  const monate = Object.keys(daten).sort().reverse()
  const [monat, setMonat] = useState<string | null>(null)
  const gewaehlt = monat ?? monate[0] ?? null
  const zeilen: [string, Zaehler][] = gewaehlt ? Object.entries(daten[gewaehlt] ?? {}) : []
  if (!monate.length) return null
  return (
    <Stack gap="xs">
      <Group justify="space-between" align="end">
        <Text fw={600} size="sm">
          Je Monat und Modell
        </Text>
        <Select w={160} size="xs" aria-label="Monat" data={monate} value={gewaehlt} onChange={setMonat} allowDeselect={false} />
      </Group>
      <Table.ScrollContainer minWidth={640}>
        <Table striped withTableBorder fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Dienst · Modell</Table.Th>
              <Table.Th>Anfragen</Table.Th>
              <Table.Th>davon Wiederholungen</Table.Th>
              <Table.Th>Token ein</Table.Th>
              <Table.Th>Token aus</Table.Th>
              <Table.Th>Bilder</Table.Th>
              <Table.Th>Zeichen vertont</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {zeilen.map(([k, z]) => (
              <Table.Tr key={k}>
                <Table.Td>{k}</Table.Td>
                <Table.Td>{zahl(z.anfragen)}</Table.Td>
                <Table.Td>{zahl(z.wiederholungen)}</Table.Td>
                <Table.Td>{zahl(z.eingabe)}</Table.Td>
                <Table.Td>{zahl(z.ausgabe)}</Table.Td>
                <Table.Td>{zahl(z.bilder)}</Table.Td>
                <Table.Td>{zahl(z.ttsZeichen)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  )
}
