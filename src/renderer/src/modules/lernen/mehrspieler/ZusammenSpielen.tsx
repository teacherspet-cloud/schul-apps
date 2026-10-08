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

const BEREICHE: { art: MehrArt; id: string; name: string; text: string }[] = [
  { art: 'koop', id: 'koop', name: 'Kooperativ', text: 'Gemeinsam mit anderen aus deinem Kurs ein Ziel schaffen' },
  { art: 'versus', id: 'versus', name: 'Versus', text: 'Gegeneinander – fair, mit Fragen passend zu eurem Können' }
]

export default function ZusammenSpielen({ bereich, kurs, sprache }: { bereich: 'vok' | 'gram'; kurs: string; sprache: string }): React.JSX.Element | null {
  const { d: wahl, setze } = useDarstellung()
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
    if (c.length !== 6) return setFehler('Der Einladungscode hat sechs Ziffern.')
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
                    {g.name}{' '}
                    <Text span size="sm" c="dimmed" fw={400}>
                      · {spiele.length}
                    </Text>
                  </Text>
                  <Text size="xs" c="dimmed">
                    {g.text}
                  </Text>
                </div>
                <IconChevronDown size={18} style={{ transform: offen ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
              </Group>
            </UnstyledButton>
            {offen && (
              <>
                <Group mt="sm" gap="xs" wrap="nowrap" align="flex-end">
                  <TextInput
                    style={{ flex: 1 }}
                    label="Einladungscode"
                    placeholder="6 Ziffern"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.currentTarget.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && void beitreten()}
                    data-mehr-einladung
                  />
                  <Button variant="light" disabled={code.length !== 6} onClick={() => void beitreten()} data-mehr-beitreten>
                    Beitreten
                  </Button>
                </Group>
                {fehler && (
                  <Alert color="red" radius="md" mt="xs" py={6}>
                    {fehler}
                  </Alert>
                )}
                {!angebot.frei && (
                  <Text size="sm" c="dimmed" mt="xs">
                    Zusammen spielen gibt es nach der Übung für heute.
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
                            {laeuft === s.id ? 'Runde wird eröffnet …' : `Spiel starten · ${s.min}–${s.max} Personen`}
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
