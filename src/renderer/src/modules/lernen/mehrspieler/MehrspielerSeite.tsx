/**
 * Spielrunde „Zusammen spielen" (08.10.2026): /s/sp/<CODE> – Lobby (Code zeigen, Mitspielende, Schwierigkeit, bei
 * Grammatik die Form, Start), laufendes Spiel (Bausteine vom Server) und Ergebnis (Versus: nur Sieger öffentlich, die
 * eigene Leistung privat – kein letzter Platz). Feste Kurzrufe statt Chat.
 */
import { bildAdresse } from '@shared/auszeichnungenBilder'
import { mitTitel } from '@shared/auszeichnungen'
import { ActionIcon, Alert, Badge, Button, Card, Center, Group, Loader, SegmentedControl, SimpleGrid, Stack, Text, ThemeIcon, Title, Tooltip, UnstyledButton } from '@mantine/core'
import { IconCrown, IconDoorExit, IconPlayerPlay, IconTrophy, IconUsers, IconWifiOff, IconX } from '@tabler/icons-react'
import { Bloecke } from './Bloecke'
import { FokusRahmen } from '../fokus/FokusRahmen'
import { useSpielSicht, type SpielSicht } from './verbindung'
import { ton } from '../../onlinetest/schuelerDarstellung'
import { useEffect, useRef } from 'react'
import { spielText, type TextSchluessel } from '@shared/spielSprache'

/** Beschriftungen in der Zielsprache des Kurses (09.10.2026, „Nur Fremdsprache"; DaZ/ohne Angabe Deutsch) */
const texter =
  (s: SpielSicht) =>
  (k: TextSchluessel, ...w: (string | number)[]): string =>
    spielText(s.sprache ?? 'de', s.jahrgang ?? null, k, ...w)

function Kurzrufe({ s, senden }: { s: SpielSicht; senden: (p: string, k?: Record<string, unknown>) => Promise<void> }): React.JSX.Element {
  return (
    <Stack gap={4}>
      {s.rufe.length > 0 && (
        <Group gap={6} data-mehr-rufe>
          {s.rufe.map((r, i) => (
            <Badge key={i} variant="light" color="grape" tt="none">
              {r.name}: {r.text}
            </Badge>
          ))}
        </Group>
      )}
      <Group gap={4}>
        {s.kurzrufe.map((r, i) => (
          <Button key={r} size="compact-xs" variant="subtle" color="grape" onClick={() => void senden('ruf', { ruf: i })} data-mehr-ruf={i}>
            {r}
          </Button>
        ))}
      </Group>
    </Stack>
  )
}

function Lobby({ s, senden }: { s: SpielSicht; senden: (p: string, k?: Record<string, unknown>) => Promise<void> }): React.JSX.Element {
  const t = texter(s)
  const genug = s.spieler.filter((p) => p.verbunden).length >= s.min
  const formOk = !s.formen.length || Boolean(s.formen.find((f) => f.id === s.form)?.waehlbar)
  return (
    <Stack data-mehr-lobby>
      <Card withBorder radius="lg" padding="md" ta="center">
        <Text size="sm" c="dimmed">
          {t('uiEinladungscode')}
        </Text>
        <Text fw={900} size="2.4rem" style={{ letterSpacing: 6 }} data-mehr-code-anzeige>
          {s.code}
        </Text>
        <Text size="sm" c="dimmed">
          {t('uiCodeHinweis')}
        </Text>
      </Card>
      <div>
        <Group justify="space-between" mb={4}>
          <Text fw={700}>
            <IconUsers size={16} style={{ verticalAlign: -2 }} /> {t('uiDabei', s.spieler.length, s.max)}
          </Text>
        </Group>
        <Stack gap={4}>
          {s.spieler.map((p) => (
            <Group key={p.id} justify="space-between" data-mehr-spieler={p.name}>
              <Group gap={6}>
                {p.host && <IconCrown size={16} color="var(--mantine-color-yellow-6)" />}
                {/* Profilbild und Titel (10.10.2026): „Sir Lars R." */}
                {p.avatar && <img src={bildAdresse(p.avatar)} alt="" width={26} height={30} style={{ objectFit: 'contain' }} data-mehr-avatar={p.avatar} />}
                <Text fw={p.id === s.ich ? 700 : 400} data-mehr-anzeige={mitTitel(p.titel, p.name)}>
                  {p.titel && (
                    <Text span inherit c="dimmed" data-mehr-titel={p.titel}>
                      {p.titel}{' '}
                    </Text>
                  )}
                  {p.name}
                </Text>
                {!p.verbunden && (
                  <Tooltip label={t('uiGetrennt')}>
                    <span data-mehr-getrennt>
                      <IconWifiOff size={14} color="var(--mantine-color-orange-6)" />
                    </span>
                  </Tooltip>
                )}
              </Group>
              {s.host && p.id !== s.ich && (
                <ActionIcon variant="subtle" color="red" aria-label={t('uiHerausnehmen', p.name)} onClick={() => void senden('entfernen', { spieler: p.id })} data-mehr-entfernen>
                  <IconX size={16} />
                </ActionIcon>
              )}
            </Group>
          ))}
        </Stack>
      </div>
      {s.host ? (
        <>
          {s.spiele.length > 1 && (
            <div>
              <Text fw={700} mb={4}>
                {t('uiSpiel')}
              </Text>
              <SimpleGrid cols={{ base: 2, xs: 3 }} spacing={6}>
                {s.spiele
                  .filter((a) => a.art === s.art)
                  .map((a) => (
                    <Button key={a.id} variant={a.id === s.spiel ? 'filled' : 'default'} onClick={() => void senden('einstellen', { spiel: a.id })} size="xs" data-mehr-spielwahl={a.id}>
                      {a.name}
                    </Button>
                  ))}
              </SimpleGrid>
            </div>
          )}
          <div>
            <Text fw={700} mb={4}>
              {t('uiSchwierigkeit')}
            </Text>
            <SegmentedControl
              fullWidth
              value={s.schwierigkeit}
              onChange={(v) => void senden('einstellen', { schwierigkeit: v })}
              data={s.schwierigkeiten.map((x) => ({ value: x.id, label: x.name }))}
              data-mehr-schwierigkeit
            />
            <Text size="xs" c="dimmed" mt={2}>
              {t('uiBerechnet', s.schwierigkeiten.find((x) => x.id === s.schwierigkeit)?.text ?? '')}
            </Text>
          </div>
          {s.formen.length > 0 && (
            <div>
              <Text fw={700} mb={4}>
                {t('uiGrammatik')}
              </Text>
              <Stack gap={4}>
                {s.formen.map((f) => (
                  <UnstyledButton key={f.id} disabled={!f.waehlbar} onClick={() => void senden('einstellen', { form: f.id })} data-mehr-form={f.id}>
                    <Card withBorder radius="md" padding="xs" style={{ opacity: f.waehlbar ? 1 : 0.5, borderColor: f.id === s.form ? 'var(--mantine-color-blue-filled)' : undefined }}>
                      <Text fw={f.id === s.form ? 700 : 500}>{f.name}</Text>
                      {f.hinweis && (
                        <Text size="xs" c="dimmed">
                          {f.hinweis}
                        </Text>
                      )}
                    </Card>
                  </UnstyledButton>
                ))}
              </Stack>
            </div>
          )}
          <Button size="lg" radius="xl" leftSection={<IconPlayerPlay size={20} />} disabled={!genug || !formOk} onClick={() => void senden('start')} data-mehr-start>
            {genug ? t('uiStarten') : t('uiWarteMit', s.min)}
          </Button>
        </>
      ) : (
        <Alert color="blue" radius="md">
          {t('uiGleich', s.spieler.find((p) => p.host)?.name ?? t('uiDerHost'), s.schwierigkeiten.find((x) => x.id === s.schwierigkeit)?.name ?? '')}
        </Alert>
      )}
    </Stack>
  )
}

function Ergebnis({ s, senden }: { s: SpielSicht; senden: (p: string, k?: Record<string, unknown>) => Promise<void> }): React.JSX.Element {
  const e = s.ergebnis!
  const t = texter(s)
  const ich = e.eigen
  const gewonnen = s.art === 'versus' ? Boolean(ich?.gewonnen) : Boolean(e.teamZiel)
  useEffect(() => {
    if (gewonnen) ton('geschafft')
  }, [gewonnen])
  return (
    <Stack align="center" ta="center" data-mehr-ergebnis>
      {s.abbruch && (
        <Alert color="orange" radius="md">
          {s.abbruch}
        </Alert>
      )}
      <ThemeIcon size={72} radius="xl" color={gewonnen ? 'yellow' : 'blue'} variant={gewonnen ? 'filled' : 'light'}>
        <IconTrophy size={40} />
      </ThemeIcon>
      <Title order={3}>{s.art === 'koop' ? (e.teamZiel ? t('uiTeamZiel') : t('uiGutGespielt')) : e.unentschieden ? t('unentschieden') : t('uiGewonnen', e.sieger.join(' & '))}</Title>
      <Text>{e.text}</Text>
      {ich && (
        <Card withBorder radius="lg" padding="sm" data-mehr-eigen>
          <Text size="sm" c="dimmed">
            {t('uiNurFuerDich')}
          </Text>
          <Text>
            {t('uiRichtigN', ich.richtig)}
            {ich.wert !== null ? ` · ${ich.wert} ${e.einheit}` : ''}
            {ich.platz ? ` · ${t('uiPlatz', ich.platz)}` : ''}
          </Text>
          {ich.fehler > 0 && (
            <Text size="sm" c="dimmed">
              {ich.fehler === 1 ? t('uiEinWortWieder') : t('uiWoerterWieder', ich.fehler)}
            </Text>
          )}
        </Card>
      )}
      <Group>
        <Button variant="default" leftSection={<IconDoorExit size={16} />} onClick={() => void senden('verlassen').then(() => window.history.back())} data-mehr-verlassen>
          {t('uiZurueck')}
        </Button>
        {s.host && (
          <Button onClick={() => void senden('nochmal')} data-mehr-nochmal>
            {t('uiNochmal')}
          </Button>
        )}
      </Group>
    </Stack>
  )
}

export default function MehrspielerSeite({ code }: { code: string }): React.JSX.Element {
  const { sicht: s, fehler, zug, senden } = useSpielSicht(code)
  // Kleiner Ton bei richtiger Rückmeldung
  const letzte = useRef('')
  useEffect(() => {
    const t = s?.bloecke?.find((b) => b.typ === 'text' && b.ton === 'gut')
    const k = t && 'text' in t ? t.text ?? '' : ''
    if (k && k !== letzte.current) ton('richtig')
    letzte.current = k
  }, [s?.bloecke])
  if (!s)
    return (
      <Center py="xl">
        {fehler ? (
          <Alert color="red" radius="md" data-mehr-fehler>
            {fehler}
          </Alert>
        ) : (
          <Loader />
        )}
      </Center>
    )
  return (
    // Vollbild beim Lernen (09.10.2026): nur das laufende Spiel (Warteraum und Ergebnis normal); Esc verlässt nur das Vollbild
    <FokusRahmen name="mehrspieler" aktiv={s.phase === 'spiel'} onEnde={() => void senden('verlassen').then(() => window.history.back())} escNurAnsicht>
    <Stack data-mehr-seite={s.phase} data-mehr-spiel={s.spiel}>
      <Group justify="space-between" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Title order={3}>{s.spielName}</Title>
          <Text size="sm" c="dimmed" truncate>
            {s.art === 'koop' ? texter(s)('uiKooperativ') : texter(s)('uiVersus')} · {s.titel}
          </Text>
        </div>
        {s.phase !== 'ende' && (
          <Button variant="subtle" color="gray" size="xs" leftSection={<IconDoorExit size={14} />} onClick={() => void senden('verlassen').then(() => window.history.back())} data-mehr-verlassen>
            {texter(s)('uiVerlassen')}
          </Button>
        )}
      </Group>
      {fehler && (
        <Alert color="orange" radius="md" withCloseButton={false} data-mehr-fehler>
          {fehler}
        </Alert>
      )}
      {s.phase === 'warten' && <Lobby s={s} senden={senden} />}
      {s.phase === 'spiel' && s.bloecke && <Bloecke bloecke={s.bloecke} senden={(a, w) => void zug(a, w)} sprache={s.sprache} jahrgang={s.jahrgang ?? null} />}
      {s.phase === 'ende' && s.ergebnis && <Ergebnis s={s} senden={senden} />}
      <Kurzrufe s={s} senden={senden} />
    </Stack>
    </FokusRahmen>
  )
}
