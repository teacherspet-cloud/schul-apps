/**
 * „Kooperativ" und „Versus" in der Spielauswahl (08.10.2026, Plan B): zwei aufklappbare Bereiche; oben jeweils das Feld
 * „Einladungscode" (beitreten), darunter je Spiel eine Karte – antippen eröffnet eine Runde und zeigt den Code.
 * Welche Spiele es gibt, entscheidet der Server (Jahrgang des Kurses, vorhandener Inhalt, Stimme des Geräts).
 */
import { Alert, Button, Card, Group, SimpleGrid, Text, TextInput, ThemeIcon, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconSwords, IconUsersGroup } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { holen, senden } from '../../onlinetest/serverApi'
import { fuerServer, useDarstellung } from '../../onlinetest/schuelerDarstellung'
import { kannSprechen } from '../VokabelTrainer'
import type { Angebot } from '@shared/mehrspieler/regeln'
import type { MehrArt } from '@shared/mehrspieler/typen'
import { spielText, type TextSchluessel } from '@shared/spielSprache'

/** Bereiche – Name und Text in der Zielsprache des Kurses (09.10.2026, „Nur Fremdsprache") */
const BEREICHE: { art: MehrArt; id: string; name: TextSchluessel; text: TextSchluessel }[] = [
  { art: 'koop', id: 'koop', name: 'uiKooperativ', text: 'uiKoopText' },
  { art: 'versus', id: 'versus', name: 'uiVersus', text: 'uiVersusText' }
]

/**
 * Feld „Einladungscode" (09.10.2026, Wunsch der Lehrkraft: ganz oben im Spielbereich statt in den aufgeklappten
 * Bereichen Kooperativ/Versus): sechs Ziffern, Enter oder „Beitreten" öffnet die Lobby. Nur für angemeldete Lernende.
 */
export function EinladungsCode({ sprache = 'de' }: { sprache?: string }): React.JSX.Element | null {
  const t = (k: TextSchluessel): string => spielText(sprache, null, k)
  const [code, setCode] = useState('')
  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  if (!window.__schulappsServer?.angemeldet) return null
  const beitreten = async (): Promise<void> => {
    const c = code.replace(/\D/g, '')
    if (c.length !== 6) return setFehler(t('uiCodeSechs'))
    setLaeuft(true)
    setFehler('')
    try {
      await holen(`/s/api/spiel/zugang?code=${c}`)
      window.location.assign(`/s/sp/${c}`)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
      setLaeuft(false)
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void beitreten()
      }}
      data-mehr-einladung-feld
    >
      <Group gap="xs" wrap="nowrap" align="flex-end">
        <TextInput
          style={{ flex: 1 }}
          label={t('uiCodeTitel')}
          description={t('uiCodeBeschreibung')}
          placeholder={t('uiZiffern')}
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={code}
          onChange={(e) => (setCode(e.currentTarget.value.replace(/\D/g, '')), setFehler(''))}
          data-mehr-einladung
        />
        <Button type="submit" variant="light" disabled={code.length !== 6} loading={laeuft} data-mehr-beitreten>
          {t('uiBeitreten')}
        </Button>
      </Group>
      {fehler && (
        <Alert color="red" radius="md" mt="xs" py={6}>
          {fehler}
        </Alert>
      )}
    </form>
  )
}

export default function ZusammenSpielen({
  bereich,
  kurs,
  sprache,
  mitCode = true
}: {
  bereich: 'vok' | 'gram'
  kurs: string
  sprache: string
  /** Feld „Einladungscode" in den Bereichen (aus, wenn es oben im Spielbereich steht – 09.10.2026) */
  mitCode?: boolean
}): React.JSX.Element | null {
  const { d: wahl, setze } = useDarstellung()
  const t = (k: TextSchluessel, ...w: (string | number)[]): string => spielText(sprache, null, k, ...w)
  const [angebot, setAngebot] = useState<{ frei: boolean; spiele: Angebot[] } | null>(null)
  const [code, setCode] = useState('')
  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState('')
  const gast = !window.__schulappsServer?.angemeldet
  useEffect(() => {
    if (gast) return
    let aus = false
    void holen<{ frei: boolean; spiele: Angebot[] }>(
      `/s/api/spiel/angebot?bereich=${bereich}&kurs=${encodeURIComponent(kurs)}&stimme=${kannSprechen(sprache) ? 1 : 0}`
    ).then(
      (a) => !aus && setAngebot(a),
      () => undefined
    )
    return () => {
      aus = true
    }
  }, [bereich, kurs, sprache, gast])
  if (gast || !angebot || !angebot.spiele.length) return null

  const klappen = (id: string, offen: boolean): void => {
    const neu = { ...wahl, spielGruppen: { ...(wahl.spielGruppen ?? {}), [id]: offen } }
    setze(neu)
    void senden('/s/api/darstellung', fuerServer(neu)).catch(() => undefined)
  }
  const eroeffnen = async (spiel: string): Promise<void> => {
    setLaeuft(spiel)
    setFehler('')
    try {
      const r = await senden<{ code: string }>('/s/api/spiel/neu', { bereich, kurs, spiel })
      window.location.assign(`/s/sp/${r.code}`)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
      setLaeuft('')
    }
  }
  const beitreten = async (): Promise<void> => {
    const c = code.replace(/\D/g, '')
    if (c.length !== 6) return setFehler(t('uiCodeSechs'))
    try {
      await holen(`/s/api/spiel/zugang?code=${c}`)
      window.location.assign(`/s/sp/${c}`)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      {BEREICHE.map((g) => {
        const spiele = angebot.spiele.filter((s) => s.art === g.art)
        if (!spiele.length) return null
        const offen = wahl.spielGruppen?.[g.id] ?? false
        return (
          <div key={g.id} data-spiel-gruppe={g.id} data-offen={offen || undefined} data-mehr-gruppe={g.id}>
            <UnstyledButton onClick={() => klappen(g.id, !offen)} aria-expanded={offen} w="100%" py={6} style={{ borderBottom: '1px solid var(--vt-a-rand, var(--mantine-color-gray-3))' }} data-spiel-gruppe-kopf={g.id}>
              <Group justify="space-between" wrap="nowrap">
                <div>
                  <Text fw={700} c="var(--vt-a-dunkel)">
                    {t(g.name)}{' '}
                    <Text span size="sm" c="dimmed" fw={400}>
                      · {spiele.length}
                    </Text>
                  </Text>
                  <Text size="xs" c="dimmed">
                    {t(g.text)}
                  </Text>
                </div>
                <IconChevronDown size={18} style={{ transform: offen ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
              </Group>
            </UnstyledButton>
            {offen && (
              <>
                {mitCode && (
                <Group mt="sm" gap="xs" wrap="nowrap" align="flex-end">
                  <TextInput
                    style={{ flex: 1 }}
                    label={t('uiEinladungscode')}
                    placeholder={t('uiZiffern')}
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.currentTarget.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && void beitreten()}
                    data-mehr-einladung
                  />
                  <Button variant="light" disabled={code.length !== 6} onClick={() => void beitreten()} data-mehr-beitreten>
                    {t('uiBeitreten')}
                  </Button>
                </Group>
                )}
                {fehler && (
                  <Alert color="red" radius="md" mt="xs" py={6}>
                    {fehler}
                  </Alert>
                )}
                {!angebot.frei && (
                  <Text size="sm" c="dimmed" mt="xs">
                    {t('uiNachUebung')}
                  </Text>
                )}
                <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" mt="sm">
                  {spiele.map((s) => (
                    <Card
                      key={s.id}
                      radius="lg"
                      withBorder
                      padding="md"
                      component="button"
                      type="button"
                      disabled={!angebot.frei || Boolean(laeuft)}
                      onClick={() => void eroeffnen(s.id)}
                      style={{ textAlign: 'left', cursor: angebot.frei ? 'pointer' : 'not-allowed', opacity: angebot.frei ? 1 : 0.5, width: '100%' }}
                      data-mehr-wahl={s.id}
                    >
                      <Group wrap="nowrap" align="flex-start">
                        <ThemeIcon size={44} radius="md" variant="light" color={g.art === 'koop' ? 'teal' : 'grape'}>
                          {g.art === 'koop' ? <IconUsersGroup size={22} /> : <IconSwords size={22} />}
                        </ThemeIcon>
                        <div style={{ minWidth: 0 }}>
                          <Text fw={700}>{s.name}</Text>
                          <Text size="xs" c="dimmed">
                            {s.beschreibung}
                          </Text>
                          <Text size="xs" c="dimmed" mt={4}>
                            {laeuft === s.id ? t('uiWirdEroeffnet') : t('uiStartenPersonen', s.min, s.max)}
                          </Text>
                        </div>
                      </Group>
                    </Card>
                  ))}
                </SimpleGrid>
              </>
            )}
          </div>
        )
      })}
    </>
  )
}
