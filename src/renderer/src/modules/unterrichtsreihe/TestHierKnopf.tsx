/**
 * „Test hier erstellen" an einem Schritt (06.10.2026, reiheTest.ts; seit 08.10.2026 im Menü „⋯" des Schritts): Klassenarbeit, Lernzielkontrolle oder
 * Vokabeltest aus allem bis zu dieser Stelle – auf Wunsch mit 10–20 % Wiederholung früherer Reihen.
 */
import { Alert, Button, Checkbox, Group, Menu, Modal, MultiSelect, Slider, Stack, Text } from '@mantine/core'
import { IconClipboardCheck, IconPlus } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { Reihe, Schritt } from '@shared/reihe'
import { notifyError, notifySuccess } from '../../shared/util'
import { holen } from '../onlinetest/serverApi'
import { TEST_ZIELE, testGrundlage, testPlatzhalter, type TestZiel } from './reiheTest'
import { merkeOffenenTest, oeffneTestEditor, starteTestWaechter } from './reiheTestAblauf'

starteTestWaechter()

/**
 * „Test hier erstellen" als Einträge im Menü „⋯" eines Schritts (08.10.2026, statt dauerhaft unter jedem Schritt): das
 * Fenster (`TestFenster`) hält der Editor selbst – das Menü schließt sich beim Klick.
 */
export function TestHierPunkte({ waehle, nach }: { waehle: (ziel: TestZiel) => void; nach: string | null }): React.JSX.Element {
  return (
    <>
      <Menu.Label>
        <Group gap={4} wrap="nowrap">
          <IconClipboardCheck size={13} />
          Test hier erstellen
        </Group>
      </Menu.Label>
      {TEST_ZIELE.map((t) => (
        <Menu.Item key={t.id} onClick={() => waehle(t.id)} data-test-ziel={t.id} data-test-hier={nach ?? ''}>
          <Text size="sm" fw={600}>
            {t.label}
          </Text>
          <Text size="xs" c="dimmed">
            {t.text}
          </Text>
        </Menu.Item>
      ))}
    </>
  )
}

export function TestFenster({
  reihe,
  nach,
  ziel,
  einfuegen,
  schliessen
}: {
  reihe: Reihe
  nach: string | null
  ziel: TestZiel
  einfuegen: (s: Schritt, nach: string | null) => Promise<Reihe | null>
  schliessen: () => void
}): React.JSX.Element {
  const bis = nach ? reihe.schritte.findIndex((s) => s.id === nach) + 1 : 0
  const [mitWdh, setMitWdh] = useState(false)
  const [anteil, setAnteil] = useState(15)
  const [fruehere, setFruehere] = useState<{ value: string; label: string }[]>([])
  const [gewaehlt, setGewaehlt] = useState<string[]>([])
  const [laeuft, setLaeuft] = useState(false)
  useEffect(() => {
    void holen<{ reihen: { id: string; titel: string; fachId?: string; oberthema?: string }[] }>('/server/reihen').then(
      (d) => setFruehere(d.reihen.filter((x) => x.id !== reihe.id && (!x.fachId || x.fachId === reihe.fachId)).map((x) => ({ value: x.id, label: x.titel }))),
      () => setFruehere([])
    )
  }, [reihe.id, reihe.fachId])
  const g = testGrundlage(reihe, bis, ziel)
  const label = TEST_ZIELE.find((t) => t.id === ziel)!.label
  const los = async (): Promise<void> => {
    setLaeuft(true)
    try {
      const reihen =
        mitWdh && gewaehlt.length ? await Promise.all(gewaehlt.map((id) => holen<{ reihe: Reihe }>(`/server/reihen/${id}`).then((x) => x.reihe))) : []
      const grundlage = testGrundlage(reihe, bis, ziel, reihen.length ? { anteil, reihen } : undefined)
      // Erst das Dokument im Test-Programm, dann der Platzhalter mit dessen Kennung
      const docId = await oeffneTestEditor(ziel, reihe, grundlage)
      if (!docId) throw new Error(`Das Programm „${label}" ließ sich hier nicht öffnen – bitte im Hauptfenster der App versuchen.`)
      const platz = testPlatzhalter(ziel, docId, grundlage)
      const gespeichert = await einfuegen(platz, nach)
      if (!gespeichert?.id) throw new Error('Die Reihe ließ sich nicht speichern.')
      merkeOffenenTest({ modul: ziel, docId, reiheId: gespeichert.id, schrittId: platz.id, zeit: Date.now() })
      notifySuccess(`${label} vorbefüllt – erstellen wie gewohnt; fertig steht er an dieser Stelle in der Reihe.`)
      schliessen()
    } catch (e) {
      notifyError(e, 'Test nicht begonnen')
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <Modal opened onClose={schliessen} title={`${label} an dieser Stelle`} size="lg" data-test-fenster>
      <Stack>
        <Text size="sm">
          Grundlage: <b>{g.schritte}</b> Schritte bis hier, <b>{g.lernziele.length}</b> Lernziele
          {g.woerter.length ? (
            <>
              , <b>{g.woerter.length}</b> Wörter aus Lernkarten und Vokabelschritten
            </>
          ) : null}
          . Der Editor öffnet sich vorbefüllt; erstellt wird dort wie gewohnt im Hintergrund. Ist der Test fertig, steht er hier als Schritt
          {ziel === 'klassenarbeit' ? ' („schriftlich" im Unterricht, du hakst ab).' : ' (Onlinetest).'}
        </Text>
        {ziel === 'vokabeltest' && !g.woerter.length && (
          <Alert color="orange" variant="light">
            Bis hier gibt es keine Lernkarten oder Vokabelschritte – die Wortliste bleibt leer.
          </Alert>
        )}
        <Text size="xs" c="dimmed">
          Die KI formuliert die Testaufgaben neu und übernimmt nichts wörtlich aus dem Buch oder den Materialien der Reihe.
        </Text>
        {ziel !== 'vokabeltest' && (
          <Stack gap={6}>
            <Checkbox
              label="Wiederholung früherer Reihen einbauen"
              checked={mitWdh}
              onChange={(e) => setMitWdh(e.currentTarget.checked)}
              data-test-wiederholung
            />
            {mitWdh && (
              <>
                <MultiSelect
                  data={fruehere}
                  value={gewaehlt}
                  onChange={setGewaehlt}
                  placeholder={fruehere.length ? 'Frühere Reihen wählen …' : 'Keine früheren Reihen dieses Fachs'}
                  searchable
                  clearable
                />
                <Group gap="xs" wrap="nowrap">
                  <Text size="sm" w={150}>
                    Anteil: {anteil} %
                  </Text>
                  <Slider min={10} max={20} step={1} value={anteil} onChange={setAnteil} style={{ flex: 1 }} />
                </Group>
              </>
            )}
          </Stack>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={schliessen}>
            Abbrechen
          </Button>
          <Button leftSection={<IconPlus size={16} />} loading={laeuft} onClick={() => void los()} data-test-los>
            {label} öffnen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
