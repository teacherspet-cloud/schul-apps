/**
 * Test zum Termin (28.10.2026, abgestimmt mit der Lehrkraft) – Startseite „Termine & Vokabeltraining", Klick auf einen
 * Vokabeltest-Termin eines Kurses:
 *  - ist ein Test verknüpft: öffnen (oder einen anderen wählen, Verknüpfung lösen);
 *  - sonst „Vorhandenen Test wählen": Vokabeltests (Blatt), Onlinetests, Grammatiktests – die zu den Abschnitten bzw.
 *    der Grammatik des Termins passenden zuerst, darunter alle mit Suche, jeder mit Vorschau;
 *  - oder „Test erstellen lassen": Auswahl wie in der jeweiligen App, die KI arbeitet im Hintergrund, danach ist der Test
 *    verknüpft (TestErstellen in diesem Fenster).
 * Gespeichert am Kurs (POST /server/vokabeln/<id>/testmaterial, shared/testMaterial.ts).
 */
import { Badge, Button, Group, Modal, Paper, ScrollArea, SegmentedControl, Stack, Text, TextInput, UnstyledButton } from '@mantine/core'
import { IconExternalLink, IconLink, IconLinkOff, IconSearch, IconSparkles } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { holen, senden } from '../modules/onlinetest/serverApi'
import { openDocument } from '../shared/navigation'
import { notifyError, notifySuccess } from '../shared/util'
import { ladeMaterialien } from './materialien'
import { passtZuTermin, TEST_APP_NAME, TEST_APPS, type TestApp, type TestMaterial } from '@shared/testMaterial'
import { tagKurz, type StartKurs } from '@shared/startseiteKurse'
import { TestErstellen } from './TestErstellen'
import { testVorschauZeilen } from './testVorschau'

export interface TestKandidat {
  moduleId: TestApp
  docId: string
  titel: string
  detail: string
  suchtext: string
  zeit: string
}

/** Alle Tests der Lehrkraft aus den drei Apps */
export async function testKandidaten(): Promise<TestKandidat[]> {
  const [m, online] = await Promise.all([
    ladeMaterialien().catch(() => []),
    holen<{ tests: { id: string; titel: string; art: string; thema: string; lerngruppe: string; erstellt: string; status: string }[] }>('/server/onlinetest').catch(
      () => ({ tests: [] })
    )
  ])
  const aus: TestKandidat[] = m
    .filter((x) => x.moduleId === 'vokabeltest' || x.moduleId === 'grammatiktest')
    .map((x) => ({ moduleId: x.moduleId as TestApp, docId: x.id, titel: x.name, detail: x.detail, suchtext: x.suchtext, zeit: x.updatedAt }))
  for (const t of online.tests)
    aus.push({
      moduleId: 'onlinetest',
      docId: t.id,
      titel: t.titel,
      detail: [t.art, t.thema, t.lerngruppe].filter(Boolean).join(' · '),
      suchtext: [t.titel, t.art, t.thema, t.lerngruppe].join(' ').toLocaleLowerCase('de'),
      zeit: t.erstellt
    })
  return aus
}

/** Stichwörter des Termins: Abschnitte („Unit 2", „Station 1") und Grammatik */
export function terminStichwoerter(k: Pick<StartKurs, 'testInhalt' | 'einheit' | 'gruppe'>): string[] {
  const w = new Set<string>()
  for (const t of k.testInhalt ?? []) {
    w.add(t.titel)
    for (const teil of t.titel.split(/[·,:–-]/)) if (teil.trim().length >= 3) w.add(teil.trim())
  }
  if (k.einheit) w.add(k.einheit)
  return [...w]
}

export const verknuepfen = async (kursId: string, material: TestMaterial | null): Promise<void> => {
  await senden(`/server/vokabeln/${kursId}/testmaterial`, { material })
}

export function TestZumTermin({ k, schliessen, geaendert }: { k: StartKurs; schliessen: () => void; geaendert: () => void }): React.JSX.Element {
  const [modus, setModus] = useState<'waehlen' | 'erstellen'>('waehlen')
  const [liste, setListe] = useState<TestKandidat[] | null>(null)
  const [suche, setSuche] = useState('')
  const [app, setApp] = useState<TestApp | 'alle'>('alle')
  const [vorschau, setVorschau] = useState<TestKandidat | null>(null)
  const [andere, setAndere] = useState(false)
  useEffect(() => {
    void testKandidaten().then(setListe)
  }, [])
  const stich = useMemo(() => terminStichwoerter(k), [k])
  const sortiert = useMemo(() => {
    const q = suche.trim().toLocaleLowerCase('de')
    return (liste ?? [])
      .filter((x) => (app === 'alle' || x.moduleId === app) && (!q || x.suchtext.includes(q)))
      .map((x) => ({ x, passt: passtZuTermin(`${x.titel} ${x.detail} ${x.suchtext}`, stich) }))
      .sort((a, b) => b.passt - a.passt || (a.x.zeit < b.x.zeit ? 1 : -1))
  }, [liste, suche, app, stich])
  const passend = sortiert.filter((s) => s.passt > 0)
  const weitere = sortiert.filter((s) => s.passt === 0)
  const wahl = async (x: TestKandidat): Promise<void> => {
    try {
      await verknuepfen(k.id, { moduleId: x.moduleId, docId: x.docId, titel: x.titel })
      notifySuccess(`„${x.titel}“ ist mit dem Termin verknüpft.`)
      geaendert()
      schliessen()
    } catch (e) {
      notifyError(e, 'Nicht verknüpft')
    }
  }
  const titel = `Test am ${k.testTermin ? tagKurz(new Date(k.testTermin).toISOString().slice(0, 10)) : ''} · ${k.gruppe}${k.fach ? ` ${k.fach}` : ''}`
  const zeile = (s: { x: TestKandidat; passt: number }): React.JSX.Element => (
    <UnstyledButton
      key={`${s.x.moduleId}-${s.x.docId}`}
      onClick={() => setVorschau(s.x)}
      style={{
        display: 'block',
        width: '100%',
        padding: '6px 8px',
        borderRadius: 8,
        background: vorschau?.docId === s.x.docId ? 'var(--mantine-color-default-hover)' : undefined
      }}
      data-test-kandidat={s.x.docId}
    >
      <Group gap={6} wrap="nowrap">
        <Badge size="xs" variant="light" color={s.x.moduleId === 'onlinetest' ? 'teal' : s.x.moduleId === 'grammatiktest' ? 'violet' : 'orange'}>
          {TEST_APP_NAME[s.x.moduleId].replace(' (Blatt)', '')}
        </Badge>
        <Text size="sm" fw={600} truncate style={{ flex: 1 }}>
          {s.x.titel}
        </Text>
      </Group>
      {s.x.detail && (
        <Text size="xs" c="dimmed" truncate>
          {s.x.detail}
        </Text>
      )}
    </UnstyledButton>
  )

  return (
    <Modal opened onClose={schliessen} title={titel} size="xl" data-test-zum-termin={k.id}>
      <Stack gap="sm">
        {(k.testInhalt ?? []).length > 0 && (
          <Text size="sm" c="dimmed">
            Dran kommt: {(k.testInhalt ?? []).map((t) => t.titel).join(' · ')}
          </Text>
        )}
        {k.testMaterial && !andere ? (
          <Paper withBorder radius="md" p="md" data-test-verknuepft={k.testMaterial.docId}>
            <Text size="sm" c="dimmed">
              Verknüpfter Test ({TEST_APP_NAME[k.testMaterial.moduleId]})
            </Text>
            <Text fw={700}>{k.testMaterial.titel || 'Ohne Namen'}</Text>
            <Group gap="xs" mt="sm">
              <Button
                leftSection={<IconExternalLink size={16} />}
                onClick={() => (schliessen(), void openDocument(k.testMaterial!.moduleId, k.testMaterial!.docId))}
                data-test-oeffnen
              >
                Öffnen
              </Button>
              <Button variant="light" leftSection={<IconLink size={16} />} onClick={() => setAndere(true)}>
                Anderen Test wählen
              </Button>
              <Button
                variant="subtle"
                color="red"
                leftSection={<IconLinkOff size={16} />}
                onClick={() => void verknuepfen(k.id, null).then(() => (geaendert(), schliessen()), (e: unknown) => notifyError(e, 'Nicht gelöst'))}
                data-test-loesen
              >
                Verknüpfung lösen
              </Button>
            </Group>
          </Paper>
        ) : (
          <>
            <SegmentedControl
              value={modus}
              onChange={(v) => setModus(v as 'waehlen' | 'erstellen')}
              data={[
                { value: 'waehlen', label: 'Vorhandenen Test wählen' },
                { value: 'erstellen', label: 'Test erstellen lassen' }
              ]}
              data-test-modus
            />
            {modus === 'waehlen' ? (
              <Group align="flex-start" gap="md" wrap="nowrap" style={{ minHeight: 380 }}>
                <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                  <Group gap={6} wrap="nowrap">
                    <TextInput
                      placeholder="Suchen …"
                      leftSection={<IconSearch size={14} />}
                      value={suche}
                      onChange={(e) => setSuche(e.currentTarget.value)}
                      style={{ flex: 1 }}
                      data-test-suche
                    />
                    <SegmentedControl
                      size="xs"
                      value={app}
                      onChange={(v) => setApp(v as TestApp | 'alle')}
                      data={[{ value: 'alle', label: 'Alle' }, ...TEST_APPS.map((a) => ({ value: a, label: TEST_APP_NAME[a].replace(' (Blatt)', '') }))]}
                    />
                  </Group>
                  <ScrollArea h={380} type="auto">
                    {liste === null ? (
                      <Text size="sm" c="dimmed">
                        Lädt …
                      </Text>
                    ) : (
                      <Stack gap={2}>
                        {passend.length > 0 && (
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase" mt={4}>
                            Passend zum Termin
                          </Text>
                        )}
                        {passend.map(zeile)}
                        {weitere.length > 0 && (
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase" mt={8}>
                            {passend.length ? 'Weitere Tests' : 'Alle Tests'}
                          </Text>
                        )}
                        {weitere.map(zeile)}
                        {!sortiert.length && (
                          <Text size="sm" c="dimmed">
                            Keine Tests gefunden.
                          </Text>
                        )}
                      </Stack>
                    )}
                  </ScrollArea>
                </Stack>
                <Paper withBorder radius="md" p="sm" style={{ flex: 1, minWidth: 0, minHeight: 380 }} data-test-vorschau>
                  {vorschau ? (
                    <TestVorschau x={vorschau} waehlen={() => void wahl(vorschau)} />
                  ) : (
                    <Text size="sm" c="dimmed">
                      Test antippen für die Vorschau.
                    </Text>
                  )}
                </Paper>
              </Group>
            ) : (
              <TestErstellen k={k} stichwoerter={stich} fertig={() => (geaendert(), schliessen())} />
            )}
          </>
        )}
      </Stack>
    </Modal>
  )
}

/** Vorschau eines Tests im Auswahlfenster */
export function TestVorschau({ x, waehlen }: { x: TestKandidat; waehlen: () => void }): React.JSX.Element {
  const [inhalt, setInhalt] = useState<string[] | null>(null)
  useEffect(() => {
    setInhalt(null)
    void testVorschauZeilen(x).then(setInhalt, () => setInhalt([]))
  }, [x])
  return (
    <Stack gap="xs" h="100%">
      <Group gap={6}>
        <Badge variant="light">{TEST_APP_NAME[x.moduleId]}</Badge>
        <Text size="xs" c="dimmed">
          {x.zeit ? new Date(x.zeit).toLocaleDateString('de-DE') : ''}
        </Text>
      </Group>
      <Text fw={700}>{x.titel}</Text>
      {x.detail && (
        <Text size="xs" c="dimmed">
          {x.detail}
        </Text>
      )}
      <ScrollArea h={250} type="auto">
        {inhalt === null ? (
          <Text size="sm" c="dimmed">
            Lädt …
          </Text>
        ) : inhalt.length ? (
          <Stack gap={2} data-test-vorschau-inhalt>
            {inhalt.map((z, i) => (
              <Text key={i} size="sm">
                {z}
              </Text>
            ))}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">
            Keine Vorschau verfügbar.
          </Text>
        )}
      </ScrollArea>
      <Group gap="xs" mt="auto">
        <Button leftSection={<IconLink size={16} />} onClick={waehlen} data-test-waehlen>
          Mit dem Termin verknüpfen
        </Button>
        <Button variant="subtle" leftSection={<IconSparkles size={16} />} onClick={() => void openDocument(x.moduleId, x.docId)}>
          Öffnen
        </Button>
      </Group>
    </Stack>
  )
}

