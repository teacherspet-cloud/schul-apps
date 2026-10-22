/**
 * Register „Sprechtraining" im Fachordner der Lernenden (19.10.2026, abgestimmt mit der Lehrkraft): sichtbar während
 * einer Freigabe. Oben die freigegebenen Teile zum Üben (bzw. als Prüfung), darunter Useful Phrases & Vocabulary des
 * Jahrgangs (zum Anhören), vier Spiele zu den Phrases, nach mindestens einer Übung „Tipps" und der Fortschritt je
 * Bewertungsbereich (gleitender Mittelwert, „stabil" bei kleinen Schwankungen; Aussprache nur grob eingeschätzt).
 */
import { Accordion, Alert, Badge, Button, Card, Group, Progress, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconArrowDownRight, IconArrowRight, IconArrowUpRight, IconMicrophone, IconPuzzle, IconVolume } from '@tabler/icons-react'
import { useState } from 'react'
import { KRITERIEN, verlauf } from '@shared/sprechen/kriterien'
import { stufeVonNiveau, TEIL_BESCHREIBUNG, TEIL_NAME, type Teil } from '@shared/sprechen/niveaus'
import { GRUPPEN, phrasesBis, type Phrase } from '@shared/sprechen/phrases'
import { Gespraech, Ergebnis } from './Gespraech'
import { PhraseSpiel, SPIEL_NAME, type SpielId } from './PhraseSpiele'
import { gewertet, type SprechFreigabe } from './typen'

const BCP = { en: 'en-GB', fr: 'fr-FR', es: 'es-ES' } as const

function vorlesen(text: string, sprache: keyof typeof BCP): void {
  try {
    const u = new SpeechSynthesisUtterance(text.replace(/…/g, ', '))
    u.lang = BCP[sprache]
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  } catch {
    /* ohne Sprachausgabe */
  }
}

const tag = (ms: number): string => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })

export function SprechOrdner({ freigaben, neuLaden }: { freigaben: SprechFreigabe[]; neuLaden: () => void }): React.JSX.Element {
  // Mehrere Freigaben im Fach: die mit dem spätesten Ende zuerst
  const f = [...freigaben].sort((a, b) => b.bis - a.bis)[0]
  const [gespraech, setGespraech] = useState<{ teil: Teil; modus: 'ueben' | 'pruefung' } | null>(null)
  const [spiel, setSpiel] = useState<SpielId | null>(null)
  const [ansicht, setAnsicht] = useState<'start' | 'tipps'>('start')
  if (!f) return <Text c="dimmed">Gerade ist kein Sprechtraining freigegeben.</Text>
  const stufe = stufeVonNiveau(f.niveau)
  const phrases: Phrase[] = phrasesBis(stufe)
  const geuebt = gewertet(f.uebungen)

  if (gespraech)
    return (
      <Gespraech
        f={f}
        teil={gespraech.teil}
        modus={gespraech.modus}
        zurueck={(neu) => {
          setGespraech(null)
          if (neu) neuLaden()
        }}
      />
    )
  if (spiel) return <PhraseSpiel spiel={spiel} phrases={phrases} sprache={f.sprache} zurueck={() => setSpiel(null)} />

  return (
    <Stack gap="md" data-sprechtraining={f.id}>
      <Group justify="space-between" gap="xs">
        <Text size="sm" c="dimmed">
          Freigegeben bis {tag(f.bis)} · noch {f.minutenRest} Minuten frei (Tages- und Wochengrenze) · Ziel: GER {f.niveau}
        </Text>
        {geuebt.length > 0 && (
          <Group gap={4}>
            <Button size="compact-sm" variant={ansicht === 'start' ? 'filled' : 'subtle'} onClick={() => setAnsicht('start')}>
              Üben
            </Button>
            <Button size="compact-sm" variant={ansicht === 'tipps' ? 'filled' : 'subtle'} onClick={() => setAnsicht('tipps')} data-sprech-tipps-reiter>
              Tipps & Fortschritt
            </Button>
          </Group>
        )}
      </Group>
      {f.gesperrt && (
        <Alert color="orange" data-sprech-gesperrt>
          Das Sprechtraining ist für dich gesperrt. Bitte sprich mit deiner Lehrkraft.
        </Alert>
      )}

      {ansicht === 'tipps' ? (
        <Stack gap="md" data-sprech-tipps>
          <Card withBorder radius="md" padding="md">
            <Text fw={700} mb="xs">
              Dein Fortschritt
            </Text>
            <Stack gap={8}>
              {KRITERIEN.map((k) => {
                const werte = geuebt.map((u) => u.wertung[k.id]).filter((x): x is number => typeof x === 'number')
                if (!werte.length) return null
                const v = verlauf(werte)
                const Pfeil = v.trend === 'besser' ? IconArrowUpRight : v.trend === 'schwaecher' ? IconArrowDownRight : IconArrowRight
                return (
                  <div key={k.id} data-fortschritt={k.id}>
                    <Group justify="space-between" gap="xs">
                      <Text size="sm" fw={600}>
                        {k.name}
                        {k.id === 'aussprache' ? ' *' : ''}
                      </Text>
                      <Group gap={4}>
                        {v.trend && <Pfeil size={14} color={v.trend === 'besser' ? 'var(--mantine-color-teal-6)' : v.trend === 'schwaecher' ? 'var(--mantine-color-orange-6)' : undefined} />}
                        <Text size="xs" c="dimmed">
                          {v.trend === 'besser' ? 'besser geworden' : v.trend === 'schwaecher' ? 'zuletzt schwächer' : v.trend === 'stabil' ? 'stabil' : 'erste Übung'} · {v.aktuell.toFixed(1)}/5
                        </Text>
                      </Group>
                    </Group>
                    <Progress value={(v.aktuell / 5) * 100} size="md" radius="xl" color={v.aktuell >= 4 ? 'teal' : v.aktuell >= 3 ? 'blue' : 'yellow'} />
                  </div>
                )
              })}
              <Text size="xs" c="dimmed">
                * Die Aussprache kann die KI nur grob einschätzen. Der Fortschritt ist der Schnitt deiner letzten Übungen.
              </Text>
            </Stack>
          </Card>
          <Text fw={700}>Deine Tipps</Text>
          {[...geuebt]
            .reverse()
            .slice(0, 3)
            .map((u, i) => (
              <Card key={i} withBorder radius="md" padding="sm">
                <Text size="xs" c="dimmed" mb={4}>
                  {TEIL_NAME[u.teil]} · {tag(u.zeit)}
                </Text>
                <Ergebnis u={u} />
              </Card>
            ))}
        </Stack>
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            {f.teile.map((t) => (
              <Card key={t} withBorder radius="md" padding="md" data-sprech-teil={t}>
                <Group gap="xs" mb={4}>
                  <IconMicrophone size={18} />
                  <Text fw={800}>{TEIL_NAME[t]}</Text>
                  {geuebt.some((u) => u.teil === t) && (
                    <Badge size="xs" variant="light" color="teal">
                      {geuebt.filter((u) => u.teil === t).length}× geübt
                    </Badge>
                  )}
                </Group>
                <Text size="sm" c="dimmed" mb="sm">
                  {TEIL_BESCHREIBUNG[t]}
                </Text>
                <Group gap="xs">
                  <Button size="xs" disabled={f.gesperrt || f.minutenRest < 1} onClick={() => setGespraech({ teil: t, modus: t === 'simulation' ? 'pruefung' : 'ueben' })} data-sprech-ueben={t}>
                    {t === 'simulation' ? 'Prüfung simulieren' : 'Üben'}
                  </Button>
                  {t !== 'simulation' && (
                    <Button size="xs" variant="light" disabled={f.gesperrt || f.minutenRest < 1} onClick={() => setGespraech({ teil: t, modus: 'pruefung' })}>
                      Wie in der Prüfung
                    </Button>
                  )}
                </Group>
              </Card>
            ))}
          </SimpleGrid>

          <div>
            <Text fw={700} mb={6}>
              Spiele zu den Useful Phrases
            </Text>
            <Group gap="xs">
              {(Object.keys(SPIEL_NAME) as SpielId[]).map((s) => (
                <Button key={s} variant="light" leftSection={<IconPuzzle size={14} />} onClick={() => setSpiel(s)} data-phrase-spiel-start={s}>
                  {SPIEL_NAME[s]}
                </Button>
              ))}
            </Group>
          </div>

          <div data-useful-phrases>
            <Text fw={700} mb={6}>
              Useful Phrases & Vocabulary
            </Text>
            <Accordion variant="separated" radius="md" multiple>
              {GRUPPEN.map((g) => {
                const l = phrases.filter((p) => p.gruppe === g.id)
                if (!l.length) return null
                return (
                  <Accordion.Item key={g.id} value={g.id}>
                    <Accordion.Control>
                      <Group gap="xs">
                        <Text fw={600} size="sm">
                          {g.titel[f.sprache]}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {g.teile.map((t) => TEIL_NAME[t]).join(' · ')}
                        </Text>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Stack gap={4}>
                        {l.map((p) => (
                          <UnstyledButton key={p.id} onClick={() => vorlesen(p.text[f.sprache], f.sprache)} title="Anhören" data-phrase={p.id}>
                            <Group gap={8} wrap="nowrap">
                              <IconVolume size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
                              <Text size="sm" fw={600}>
                                {p.text[f.sprache]}
                              </Text>
                              <Text size="xs" c="dimmed">
                                {p.situation}
                              </Text>
                            </Group>
                          </UnstyledButton>
                        ))}
                      </Stack>
                    </Accordion.Panel>
                  </Accordion.Item>
                )
              })}
            </Accordion>
          </div>
        </>
      )}
    </Stack>
  )
}
