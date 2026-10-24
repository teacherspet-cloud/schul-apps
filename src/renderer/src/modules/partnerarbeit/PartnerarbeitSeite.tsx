/**
 * Partnerarbeit für Lernende (24.10.2026, abgestimmt mit der Lehrkraft): /s/pa/<id>. Warteraum mit eigenem Symbol
 * (Selbstwahl: eigener Code und Feld für den Code des Partners; Zufall: „Deine Lehrkraft teilt gleich ein"), dann die
 * Gruppe (Symbole, nie Namen) und der laufende Schritt (SchrittAnsicht). Live über die gemeinsame Sicht vom Server.
 */
import { Alert, Button, Card, Center, Group, Loader, PinInput, Stack, Text, Title } from '@mantine/core'
import { IconArrowLeft, IconUsers } from '@tabler/icons-react'
import { useCallback, useState } from 'react'
import { useLiveSicht, liveSenden } from '../../shared/liveSicht'
import { senden } from '../onlinetest/serverApi'
import { FokusRahmen } from '../lernen/fokus/FokusRahmen'
import type { PaSicht } from '@shared/partnerarbeit/typen'
import type { SchrittSicht } from '@shared/partnerarbeit/ablauf'
import { symbolName } from '@shared/partnerarbeit/symbole'
import { SymbolBild } from './SymbolBild'
import { SchrittAnsicht, stufeVon } from './SchrittAnsicht'

const bildUrl = (datei: string): string => `/s/api/sprechen/bild/${datei}`

function Warteraum({ s, codeSenden, fehler }: { s: PaSicht; codeSenden: (code: string) => void; fehler: string }): React.JSX.Element {
  const [code, setCode] = useState('')
  const name = symbolName(s.symbol.split('#')[0], 'de')
  return (
    <Stack align="center" gap="md" data-pa-warteraum>
      <Card withBorder radius="lg" padding="lg" ta="center" w="100%" maw={460}>
        <Text size="sm" c="dimmed">
          Du bist
        </Text>
        <SymbolBild symbol={s.symbol} groesse={120} />
        <Title order={3} mt={4} data-pa-mein-name>
          {name}
        </Title>
        {s.symbol && (
          <Text size="sm" c="dimmed" lang={s.sprache}>
            {symbolName(s.symbol.split('#')[0], s.sprache)}
          </Text>
        )}
      </Card>
      {s.modus === 'code' ? (
        <Card withBorder radius="lg" padding="lg" ta="center" w="100%" maw={460} data-pa-code-karte>
          <Text size="sm" c="dimmed">
            Dein Code für deinen Partner
          </Text>
          <Text fw={900} size="2.4rem" style={{ letterSpacing: 6 }} data-pa-mein-code>
            {s.code ?? '······'}
          </Text>
          <Text size="sm" c="dimmed" mt="sm">
            Oder gib den Code deines Partners ein:
          </Text>
          <Center mt="xs">
            <PinInput length={6} type="number" value={code} onChange={setCode} oneTimeCode aria-label="Code des Partners" data-pa-code-eingabe />
          </Center>
          <Button mt="sm" disabled={code.length !== 6} onClick={() => (codeSenden(code), setCode(''))} data-pa-code-senden>
            Zusammen üben
          </Button>
          {fehler && (
            <Text size="sm" c="red" mt="xs" data-pa-code-fehler>
              {fehler}
            </Text>
          )}
        </Card>
      ) : (
        <Group gap="xs" data-pa-warten>
          <Loader size="xs" />
          <Text c="dimmed">{s.hinweis || 'Deine Lehrkraft teilt gleich ein.'}</Text>
        </Group>
      )}
    </Stack>
  )
}

export function PartnerarbeitSeite({ id }: { id: string }): React.JSX.Element {
  const vorher = useCallback(() => senden(`/s/api/partnerarbeit/${id}/da`, {}), [id])
  const { sicht, fehler, setSicht, setFehler } = useLiveSicht<PaSicht>({
    strom: `/s/api/partnerarbeit/${id}/strom`,
    zustand: `/s/api/partnerarbeit/${id}/zustand`,
    kanal: 'partner:sicht',
    vorher,
    sichtAus: (a) => (a as { sicht?: PaSicht }).sicht ?? null
  })
  const [codeFehler, setCodeFehler] = useState('')
  const aktion = (a: string, w?: unknown): void => {
    void liveSenden<PaSicht>(
      `/s/api/partnerarbeit/${id}/aktion`,
      a === 'rueckmeldung' ? { aktion: a, ...((w ?? {}) as Record<string, unknown>) } : { aktion: a, wert: w },
      setSicht,
      setFehler
    )
  }
  const codeSenden = (code: string): void => {
    void liveSenden<PaSicht>(`/s/api/partnerarbeit/${id}/code`, { code }, setSicht, setCodeFehler)
  }
  const zurueck = (): void => {
    if (window.history.length > 1) window.history.back()
    else window.location.assign('/s/')
  }
  if (fehler && !sicht)
    return (
      <Stack gap="sm">
        <Alert color="orange" data-pa-fehler>
          {fehler}
        </Alert>
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={zurueck} w="fit-content">
          Zurück
        </Button>
      </Stack>
    )
  if (!sicht)
    return (
      <Center h="30vh">
        <Loader />
      </Center>
    )
  const s = sicht
  if (s.status === 'beendet')
    return (
      <Stack gap="sm" align="center" data-pa-beendet>
        <IconUsers size={40} opacity={0.5} />
        <Title order={3}>Die Partnerarbeit ist beendet.</Title>
        <Text c="dimmed">Danke fürs Mitmachen!</Text>
        <Button variant="light" leftSection={<IconArrowLeft size={16} />} onClick={zurueck}>
          Zurück
        </Button>
      </Stack>
    )
  const g = s.gruppe
  const partner = g?.mitglieder.filter((m) => !m.ich) ?? []
  // Zu dritt: wer gerade antwortet (Symbol, nie Name)
  const dranSymbol = g?.mitglieder.find((m) => m.dran)?.symbol
  return (
    <FokusRahmen name="partnerarbeit" aktiv={Boolean(g?.schritt)} onEnde={zurueck} escNurAnsicht>
      <Stack gap="md" data-partnerarbeit={s.id} data-pa-status={s.status}>
        <Group justify="space-between" wrap="wrap" gap="xs">
          <Group gap="xs">
            <IconUsers size={20} />
            <Title order={3}>Partnerarbeit {s.fach ? `· ${s.fach}` : ''}</Title>
          </Group>
          <Text size="sm" c="dimmed" data-pa-ende>
            bis {new Date(s.ende).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
          </Text>
        </Group>
        {fehler && (
          <Alert color="orange" p="xs" data-pa-fehler>
            {fehler}
          </Alert>
        )}
        {!g ? (
          <Warteraum s={s} codeSenden={codeSenden} fehler={codeFehler} />
        ) : (
          <>
            <Card withBorder radius="lg" padding="md" data-pa-gruppe={g.id}>
              <Group justify="center" gap="xl" wrap="wrap">
                <Stack gap={2} align="center">
                  <Text size="xs" c="dimmed">
                    Du bist
                  </Text>
                  <SymbolBild symbol={s.symbol} groesse={64} mitName />
                </Stack>
                {partner.map((m, i) => (
                  <Stack key={i} gap={2} align="center" style={{ opacity: m.online ? 1 : 0.5 }} data-pa-partner={m.symbol}>
                    <Text size="xs" c="dimmed">
                      {partner.length > 1 ? `Partner ${i + 1}` : 'Dein Partner'}
                      {m.online ? '' : ' (nicht verbunden)'}
                    </Text>
                    <SymbolBild symbol={m.symbol} groesse={64} mitName />
                  </Stack>
                ))}
              </Group>
              {!g.schritt && (
                <Text size="sm" c="dimmed" ta="center" mt="sm" data-pa-kein-schritt>
                  {s.status === 'laeuft' ? 'Für diesen Jahrgang gibt es noch keine Karten – sag deiner Lehrkraft Bescheid.' : 'Gleich geht es los.'}
                </Text>
              )}
            </Card>
            {g.schritt ? (
              <SchrittAnsicht
                s={g.schritt as SchrittSicht}
                sprache={s.sprache}
                jetzt={s.jetzt}
                aktion={aktion}
                bildUrl={bildUrl}
                mitglieder={g.mitglieder}
                dranSymbol={dranSymbol}
                stufe={stufeVon(s.jahrgang)}
              />
            ) : null}
          </>
        )}
      </Stack>
    </FokusRahmen>
  )
}
