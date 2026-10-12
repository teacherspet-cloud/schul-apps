/**
 * Pop-up „Problemwörter" in „Meine Klassen" (10.10.2026, Wunsch der Lehrkraft): Die Kachel „Problemwörter" im Kasten
 * „Auf einen Blick" (FachKopf kompakt) öffnet es; der frühere Eintrag unter „Passendes Material" entfällt.
 *
 * Gezeigt wird dieselbe Liste wie auf der Kursseite (shared/problemWoerter.ts, ohne Ausgeblendete): Wort – Übersetzung,
 * bei wie vielen Lernenden es gerade wackelt und wie oft es falsch war. Daraus Material:
 *  - „Im Kurs wiederholen lassen" (Server: /server/klassen/<id>/wackelig-wiederholen, ohne neuen Kurs),
 *  - „Als Arbeitsblatt (Vokabelübung)" (klassenMaterial.ts, im Hintergrund; fertig unter „Passendes Material"),
 *  - „Als Vokabeltest" (Liste ablegen und daraus einen neuen Vokabeltest beginnen).
 * Arbeitsblatt und Test nehmen höchstens die wichtigsten 20 – dann steht „20 von N" dabei. Je Wort „aus der Liste
 * nehmen" wie auf der Kursseite (kommt wieder, wenn neue Fehler dazukommen). Auf dem Handy bildschirmfüllend.
 *
 * Regler „Empfindlichkeit" (12.10.2026): je Kurs abweichend vom Standard der Lehrkraft (Einstellungen); beim Schieben
 * zeigt er sofort, wie viele Wörter jede Stufe ergibt (Server liefert die Zahlen aller Stufen mit).
 */
import { ActionIcon, Button, Center, Group, Loader, Modal, ScrollArea, Stack, Table, Text, Tooltip } from '@mantine/core'
import { IconFileText, IconListCheck, IconRepeat, IconX } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { problemWoerterText, type ProblemStufe } from '@shared/problemWoerter'
import { ProblemRegler } from '../../shared/components/ProblemRegler'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { vokabelBlattFuerKlasse, vokabeltestFuerKlasse } from './klassenMaterial'

/** Höchstens so viele Wörter für Arbeitsblatt und Test */
const GRENZE = 20

interface Daten {
  problem: Wort[]
  fach?: string
  sprache?: string
  problemStufe?: ProblemStufe
  problemStufeEigen?: ProblemStufe | null
  problemStufeStandard?: ProblemStufe
  problemZahlen?: number[]
}

interface Wort {
  id: string
  term: string
  translation: string
  example?: string
  versuche: number
  falsch: number
  betroffen?: number
}

export function ProblemWoerterFenster({
  kursId,
  klasse,
  schliessen,
  wiederholen,
  wiederholtLaeuft,
  geaendert
}: {
  kursId: string
  klasse: { id: string; name: string; fach: string; titel: string }
  schliessen: () => void
  /** „Im Kurs wiederholen lassen" der Fachansicht */
  wiederholen: () => Promise<void>
  wiederholtLaeuft: boolean
  /** Nach „aus der Liste nehmen": Zahlen der Fachansicht neu laden */
  geaendert: () => void
}): React.JSX.Element {
  const [d, setD] = useState<Daten | null>(null)
  const [testLaeuft, setTestLaeuft] = useState(false)
  const laden = useCallback(
    () =>
      void holen<Daten>(`/server/vokabeln/${encodeURIComponent(kursId)}`).then(setD, (e: unknown) => {
        notifyError(e)
        setD({ problem: [] })
      }),
    [kursId]
  )
  useEffect(laden, [laden])
  const liste = d?.problem ?? []
  const auswahl = liste.slice(0, GRENZE)
  const mitGrenze = liste.length > GRENZE
  const ausListe = (w: Wort): void =>
    void senden(`/server/vokabeln/${encodeURIComponent(kursId)}/problem-aus`, { id: w.id }).then(
      () => {
        laden()
        geaendert()
      },
      (e: unknown) => notifyError(e)
    )
  const stufeSetzen = (stufe: ProblemStufe | null): void =>
    void senden(`/server/vokabeln/${encodeURIComponent(kursId)}/problem-stufe`, { stufe: stufe === d?.problemStufeStandard ? null : stufe }).then(
      () => {
        laden()
        geaendert()
      },
      (e: unknown) => notifyError(e)
    )
  const regler = d?.problemStufe ? (
    <Stack gap={2} data-problem-kursregler>
      <Group justify="space-between" gap="xs">
        <Text size="sm" fw={600}>
          Empfindlichkeit für diesen Kurs
        </Text>
        {d.problemStufeEigen ? (
          <Button size="compact-xs" variant="subtle" onClick={() => stufeSetzen(null)} data-problem-standard>
            Standard nehmen (Stufe {d.problemStufeStandard})
          </Button>
        ) : (
          <Text size="xs" c="dimmed">
            Standard aus den Einstellungen
          </Text>
        )}
      </Group>
      <ProblemRegler wert={d.problemStufe} zahlen={d.problemZahlen} onAendern={stufeSetzen} />
    </Stack>
  ) : null
  const alsBlatt = (): void => {
    vokabelBlattFuerKlasse(klasse, {
      fach: d?.fach ?? klasse.fach,
      woerter: auswahl.map(({ term, translation, example }) => ({ term, translation, ...(example ? { example } : {}) }))
    })
    notifySuccess('Die KI erstellt das Arbeitsblatt im Hintergrund – fertig steht es hier unter „Passendes Material“ zum Freischalten.')
    schliessen()
  }
  const alsTest = async (): Promise<void> => {
    setTestLaeuft(true)
    try {
      await vokabeltestFuerKlasse(klasse, { sprache: d?.sprache, woerter: auswahl })
    } catch (e) {
      notifyError(e)
      setTestLaeuft(false)
    }
  }
  return (
    <Modal
      opened
      onClose={schliessen}
      title={<Text fw={700}>{d ? `${problemWoerterText(liste.length)} · ${klasse.titel}` : 'Problemwörter'}</Text>}
      size="lg"
      fullScreen={typeof window !== 'undefined' && window.innerWidth < 700}
      data-problemwoerter-fenster
    >
      {!d ? (
        <Center h={160}>
          <Loader />
        </Center>
      ) : liste.length === 0 ? (
        <Stack gap="sm">
          {regler}
          <Text size="sm" c="dimmed">
            Gerade keine Problemwörter – sie erscheinen, sobald genug geübt ist und ein Wort bei mehreren Kindern wackelt.
          </Text>
        </Stack>
      ) : (
        <Stack gap="sm">
          {regler}
          <Text size="sm" c="dimmed">
            Wörter, die bei Lernenden gerade wackeln (Fach 1–2, mit Fehlern, in den letzten 14 Tagen geübt) – wichtigste zuerst.
          </Text>
          <ScrollArea.Autosize mah="50vh" type="auto">
            <Table striped verticalSpacing={4} data-problemwoerter-liste>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Wort</Table.Th>
                  <Table.Th style={{ whiteSpace: 'nowrap' }}>Lernende</Table.Th>
                  <Table.Th style={{ whiteSpace: 'nowrap' }}>Fehler</Table.Th>
                  <Table.Th style={{ width: 36 }} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {liste.map((w) => (
                  <Table.Tr key={w.id} data-problemwort={w.id}>
                    <Table.Td>
                      <b>{w.term}</b> – {w.translation}
                    </Table.Td>
                    <Table.Td>
                      <Tooltip label="Bei so vielen Lernenden wackelt das Wort gerade">
                        <span>{w.betroffen ?? '–'}</span>
                      </Tooltip>
                    </Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
                      <Tooltip label={`${w.falsch} von ${w.versuche} Abfragen falsch`}>
                        <span>
                          {w.falsch} von {w.versuche}
                        </span>
                      </Tooltip>
                    </Table.Td>
                    <Table.Td>
                      <Tooltip label="Aus der Liste nehmen – kommt wieder, wenn neue Fehler dazukommen">
                        <ActionIcon variant="subtle" color="red" onClick={() => ausListe(w)} aria-label={`${w.term} aus der Liste nehmen`} data-problem-aus={w.id}>
                          <IconX size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
          <Text size="xs" c="dimmed">
            Material daraus{mitGrenze ? ` – mit den wichtigsten ${problemWoerterText(liste.length, auswahl.length)}` : ''}:
          </Text>
          <Group gap="xs" justify="flex-end">
            <Button
              leftSection={<IconRepeat size={14} />}
              loading={wiederholtLaeuft}
              onClick={() => void wiederholen().then(schliessen)}
              data-problem-wiederholen
            >
              Im Kurs wiederholen lassen
            </Button>
            <Tooltip label="Entsteht im Hintergrund mit dem eigenen KI-Zugang; fertig steht es unter „Passendes Material“ zum Freischalten">
              <Button variant="light" leftSection={<IconFileText size={14} />} onClick={alsBlatt} data-problem-blatt>
                Als Arbeitsblatt (Vokabelübung)
              </Button>
            </Tooltip>
            <Button variant="light" leftSection={<IconListCheck size={14} />} loading={testLaeuft} onClick={() => void alsTest()} data-problem-test>
              Als Vokabeltest
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
