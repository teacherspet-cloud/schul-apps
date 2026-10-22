/**
 * Schutz der KI-Zugänge der Schule (22.10.2026, KI-Sicherheitsprüfung M1) – im Reiter „KI-Zugänge" unter der Nutzung:
 *
 *  - Budget je Lehrkraft: hartes Monatsbudget in Euro über die Schlüssel der Schule (Vorgabe 20 €). Ab 80 % sieht die
 *    Lehrkraft eine Warnung (Einstellungen › Verbrauch), ab 100 % pausieren KI-Rückmeldungen für ihre Lernenden.
 *    Hier nur anonym: wie viele Lehrkräfte über 80 % bzw. 100 % stehen.
 *  - Modelle über den Schulzugang: Freigabeliste je Anbieter; andere Modelle werden durch das erste ersetzt.
 *  - „Missbrauch prüfen": Namen zur anonymen Übersicht nur mit Grund – der Server protokolliert ihn vor der Antwort.
 */
import { Alert, Button, Group, Modal, NumberInput, Stack, Table, Text, Textarea, TextInput } from '@mantine/core'
import { IconShieldCheck } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { KlappKarte } from '../../shared/components/KlappKarte'
import { euroText, zahl, type KiZeitraum } from './KiNutzung'

export interface KiSchutzDaten {
  lehrkraftBudget: number
  budgetLehrkraefte: { warnung: number; ueber: number; grenze: number }
  schulModelle: Record<string, string[]>
  schulModelleEigen: boolean
}

interface Benannt {
  bezeichnung: string
  name: string
  benutzer: string
  anfragen: number
  tokens: number
  euro: number
}

export default function KiSchutz({
  daten,
  zeitraum,
  anbieterName,
  neu
}: {
  daten: KiSchutzDaten
  zeitraum: KiZeitraum
  anbieterName: (id: string) => string
  neu: () => void
}): React.JSX.Element {
  const [budget, setBudget] = useState<string | number>(daten.lehrkraftBudget)
  const [modelle, setModelle] = useState<Record<string, string>>({})
  const [pruefen, setPruefen] = useState(false)
  const [grund, setGrund] = useState('')
  const [namen, setNamen] = useState<Benannt[] | null>(null)
  useEffect(() => setBudget(daten.lehrkraftBudget), [daten.lehrkraftBudget])
  useEffect(() => setModelle(Object.fromEntries(Object.entries(daten.schulModelle).map(([k, v]) => [k, v.join(', ')]))), [daten.schulModelle])

  const budgetSpeichern = (): void =>
    void senden('/server/verwaltung/ki-lehrkraft-budget', { wert: Number(budget) || 0 }).then(
      () => (notifySuccess('Gespeichert.'), neu()),
      (e: unknown) => notifyError(e)
    )
  const modelleSpeichern = (vorgabe: boolean): void =>
    void senden('/server/verwaltung/ki-schulmodelle', { modelle: vorgabe ? null : modelle }).then(
      () => (notifySuccess('Gespeichert.'), neu()),
      (e: unknown) => notifyError(e)
    )
  const missbrauch = (): void =>
    void senden<{ lehrkraefte: Benannt[] }>('/server/verwaltung/ki-missbrauch', { grund, zeitraum }).then(
      (r) => setNamen(r.lehrkraefte),
      (e: unknown) => notifyError(e)
    )
  const schliessen = (): void => {
    setPruefen(false)
    setNamen(null)
    setGrund('')
  }
  const b = daten.budgetLehrkraefte
  return (
    <KlappKarte
      id="verwaltung-ki-schutz"
      titel="Schutz der KI-Zugänge"
      status={daten.lehrkraftBudget ? `${euroText(daten.lehrkraftBudget)} je Lehrkraft und Monat` : 'ohne Budget je Lehrkraft'}
      ton={b.ueber ? 'warnung' : 'neutral'}
      rahmen={{ 'data-ki-schutz': 'true' }}
    >
      <Stack gap="md">
        <Stack gap={6}>
          <Text fw={600} size="sm">
            Budget je Lehrkraft
          </Text>
          <Text size="xs" c="dimmed">
            Geschätzte Kosten je Kalendermonat über die Schlüssel der Schule (eingetragene Preise, sonst Richtwerte). Ab 80 % sieht die Lehrkraft eine Warnung, ab
            100 % pausieren KI-Rückmeldungen für ihre Lernenden bis zum Monatsende – ihre eigene Materialerstellung läuft weiter. 0 = ohne Grenze.
          </Text>
          <Group gap="xs" align="flex-end">
            <NumberInput
              label="Euro je Monat"
              value={budget}
              onChange={setBudget}
              min={0}
              max={10000}
              decimalScale={2}
              decimalSeparator=","
              w={160}
              data-ki-lehrkraft-budget
            />
            <Button size="xs" onClick={budgetSpeichern}>
              Speichern
            </Button>
          </Group>
          {b.grenze > 0 && (
            <Text size="xs" c={b.ueber ? 'red' : b.warnung ? 'orange' : 'dimmed'} data-ki-budget-stand>
              Diesen Monat: {zahl(b.ueber)} Lehrkräfte bei 100 %, {zahl(b.warnung)} über 80 % (anonym gezählt).
            </Text>
          )}
        </Stack>

        <Stack gap={6}>
          <Text fw={600} size="sm">
            Modelle über den Schulzugang
          </Text>
          <Text size="xs" c="dimmed">
            Nur diese Modelle laufen über die Schlüssel der Schule; ein anderes Modell wird durch das erste der Liste ersetzt. Mit eigenem Schlüssel oder Abo
            wählen Lehrkräfte frei. {daten.schulModelleEigen ? '' : 'Derzeit gilt die Vorgabe (die von der Schule vorgesehenen Modelle).'}
          </Text>
          {Object.keys(modelle).map((id) => (
            <TextInput
              key={id}
              size="xs"
              label={anbieterName(id)}
              value={modelle[id]}
              onChange={(e) => {
                const v = e.currentTarget.value
                setModelle((m) => ({ ...m, [id]: v }))
              }}
              placeholder="kommagetrennt, z. B. gpt-5.4-mini"
              data-ki-schulmodelle={id}
            />
          ))}
          <Group gap="xs">
            <Button size="xs" onClick={() => modelleSpeichern(false)}>
              Speichern
            </Button>
            {daten.schulModelleEigen && (
              <Button size="xs" variant="subtle" onClick={() => modelleSpeichern(true)}>
                Vorgabe wiederherstellen
              </Button>
            )}
          </Group>
        </Stack>

        <Stack gap={6}>
          <Text fw={600} size="sm">
            Missbrauch prüfen
          </Text>
          <Text size="xs" c="dimmed">
            Die Nutzung je Lehrkraft ist anonym. Nur bei begründetem Verdacht zeigt diese Prüfung für den gewählten Zeitraum die Namen – der Grund wird mit Ihrem
            Konto im Serverprotokoll vermerkt.
          </Text>
          <Button size="xs" variant="light" color="orange" leftSection={<IconShieldCheck size={14} />} onClick={() => setPruefen(true)} style={{ alignSelf: 'flex-start' }}>
            Missbrauch prüfen …
          </Button>
        </Stack>
      </Stack>

      <Modal opened={pruefen} onClose={schliessen} title="Missbrauch prüfen" size="lg">
        {namen ? (
          <Stack gap="xs" data-ki-missbrauch-namen>
            <Alert color="orange" variant="light" p="xs">
              <Text size="xs">Diese Ansicht ist protokolliert. Die Namen werden nicht gespeichert und verschwinden beim Schließen.</Text>
            </Alert>
            <Table.ScrollContainer minWidth={360}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Bezeichnung</Table.Th>
                    <Table.Th>Lehrkraft</Table.Th>
                    <Table.Th ta="right">Anfragen</Table.Th>
                    <Table.Th ta="right">Kosten*</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {namen.map((n) => (
                    <Table.Tr key={n.bezeichnung}>
                      <Table.Td>{n.bezeichnung}</Table.Td>
                      <Table.Td>
                        {n.name}
                        {n.benutzer ? ` (${n.benutzer})` : ''}
                      </Table.Td>
                      <Table.Td ta="right">{zahl(n.anfragen)}</Table.Td>
                      <Table.Td ta="right">{euroText(n.euro)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            <Text size="xs" c="dimmed">
              * Schätzung aus Token und eingetragenen Preisen.
            </Text>
            <Button size="xs" onClick={schliessen} style={{ alignSelf: 'flex-end' }}>
              Schließen
            </Button>
          </Stack>
        ) : (
          <Stack gap="xs">
            <Textarea
              label="Grund der Prüfung"
              description="Mindestens 15 Zeichen, z. B. „Budget im Oktober um das Dreifache überschritten, Rücksprache nötig“."
              value={grund}
              onChange={(e) => setGrund(e.currentTarget.value)}
              minRows={3}
              maxLength={500}
              data-ki-missbrauch-grund
            />
            <Group justify="flex-end" gap="xs">
              <Button size="xs" variant="subtle" onClick={schliessen}>
                Abbrechen
              </Button>
              <Button size="xs" color="orange" disabled={grund.trim().length < 15} onClick={missbrauch}>
                Protokollieren und Namen zeigen
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </KlappKarte>
  )
}
