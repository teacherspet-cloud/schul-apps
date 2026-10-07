import { Badge, Button, Card, Checkbox, Group, Stack, Table, Text, Title } from '@mantine/core'
import { IconFileSpreadsheet, IconFileTypePdf, IconNotebook } from '@tabler/icons-react'
import { useState } from 'react'
import { speichereAusgabe } from '../../../shared/export/ausgabe'
import { ablageZiel } from '../../../shared/export/ablageZiel'
import { useRueckmeldung } from '../store'
import { setzeFachVorgabe, setzeThemaVorgabe } from '../../../shared/fachVorgabe'
import { neuAnlegen } from '../../../shared/navigation'
import { notifyError, safeFileName } from '../../../shared/util'
import { fehlerprofil, skalenName, uebersichtCsv, uebersichtHtml, uebersichtZeilen } from '../ausgabe'
import type { Rueckmeldung } from '../model/types'

/**
 * Übersicht der Lerngruppe (29.09.2026): Notenübersicht zum Übertragen ins Notenbuch (PDF, CSV
 * für Excel) – nur für die Lehrkraft, mit Nachteilsausgleich/Notenschutz – und das Fehlerprofil
 * aller Abgaben mit „Übungsblatt dazu erstellen" (öffnet ein neues Arbeitsblatt mit Thema).
 */
export default function Uebersicht({ r }: { r: Rueckmeldung }): React.JSX.Element {
  // iPad: Ablage unter Schulmaterial/<Fach>/<Themenbereich> (shared/export/ablageZiel.ts)
  const ablage = (): ReturnType<typeof ablageZiel> =>
    ablageZiel('rueckmeldung', useRueckmeldung.getState().docId, r.meta.subjectId, { jahrgang: r.meta.grade, thema: r.meta.title })
  const zeilen = uebersichtZeilen(r)
  const profil = fehlerprofil(r)
  const [gewaehlt, setGewaehlt] = useState<string[]>([])
  const basis = safeFileName(`Notenübersicht ${r.meta.title || r.grundlage.titel || 'Rückmeldung'}`)
  const auswahl = profil.filter((f) => gewaehlt.includes(f.kategorie))

  const uebungsblatt = (): void => {
    const liste = auswahl.length ? auswahl : profil.slice(0, 3)
    if (!liste.length) return
    // Keine Namen und Kürzel im Auftrag an das Arbeitsblatt
    const ohneKuerzel = (s: string): string => s.replace(/\bS\d+(-P\d+)?\b/g, '').trim()
    setzeFachVorgabe('arbeitsblatt', r.meta.subjectId)
    setzeThemaVorgabe('arbeitsblatt', {
      topic: `Übung: ${liste.map((f) => f.kategorie).join(', ')}`,
      learningGoals: liste.map((f) => `Die Lernenden vermeiden Fehler im Bereich „${f.kategorie}".`).join('\n'),
      priorKnowledge: [
        `Fehlerschwerpunkte aus der Rückmeldung zu „${r.grundlage.titel || r.meta.title || 'der letzten Arbeit'}":`,
        ...liste.map(
          (f) => `- ${f.kategorie} (bei ${f.anzahl} von ${r.abgaben.length})${f.beispiele.length ? `, z. B. ${f.beispiele.map(ohneKuerzel).join('; ')}` : ''}`
        )
      ].join('\n'),
      grade: r.meta.grade
    })
    void neuAnlegen('arbeitsblatt').catch(notifyError)
  }

  return (
    <Stack gap="md" data-rm-uebersicht>
      <Card withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={4}>Notenübersicht</Title>
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              leftSection={<IconFileTypePdf size={14} />}
              onClick={() =>
                void speichereAusgabe([{ name: `${basis}.pdf`, html: uebersichtHtml(r) }], 'Notenübersicht gespeichert.', ablage()).catch(notifyError)
              }
            >
              PDF
            </Button>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconFileSpreadsheet size={14} />}
              onClick={() =>
                void speichereAusgabe(
                  [{ name: `${basis}.csv`, filter: [{ name: 'CSV für Excel', extensions: ['csv'] }], daten: uebersichtCsv(r) }],
                  'Notenübersicht gespeichert.',
                  ablage()
                ).catch(notifyError)
              }
              data-rm-csv
            >
              CSV (Excel)
            </Button>
          </Group>
        </Group>
        <Text size="xs" c="dimmed" mb="xs">
          Nur für die Lehrkraft. NA = Nachteilsausgleich, NS = Notenschutz. Noch nicht bestätigte Einstufungen sind als Vorschlag markiert.
        </Text>
        <Table withTableBorder fz="xs" striped data-karten>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Kürzel</Table.Th>
              <Table.Th>{skalenName(r) || 'Einstufung'}</Table.Th>
              <Table.Th>Punkte</Table.Th>
              <Table.Th>NA/NS</Table.Th>
              <Table.Th>Fehlerschwerpunkte</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {zeilen.map((z) => (
              <Table.Tr key={z.kuerzel}>
                <Table.Td>{z.name}</Table.Td>
                <Table.Td>{z.kuerzel}</Table.Td>
                <Table.Td>
                  {z.einstufung}{' '}
                  {z.einstufung && !z.bestaetigt && (
                    <Badge size="xs" color="orange" variant="light">
                      Vorschlag
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>{z.punkte}</Table.Td>
                <Table.Td>{z.ausgleich}</Table.Td>
                <Table.Td>{z.fehler}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
      <Card withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={4}>Fehlerprofil der Lerngruppe</Title>
          <Button size="xs" leftSection={<IconNotebook size={14} />} disabled={!profil.length} onClick={uebungsblatt} data-rm-uebungsblatt>
            {auswahl.length ? `Übungsblatt zu ${auswahl.length} Schwerpunkt${auswahl.length > 1 ? 'en' : ''}` : 'Übungsblatt zu den häufigsten Fehlern'}
          </Button>
        </Group>
        {!profil.length ? (
          <Text size="sm" c="dimmed">
            Noch keine Fehlerschwerpunkte – sie entstehen mit den Bögen.
          </Text>
        ) : (
          <Stack gap={6}>
            {profil.map((f) => (
              <Group key={f.kategorie} gap="xs" wrap="nowrap" align="flex-start">
                <Checkbox
                  checked={gewaehlt.includes(f.kategorie)}
                  onChange={(e) => {
                    const an = e.currentTarget.checked
                    setGewaehlt((g) => (an ? [...g, f.kategorie] : g.filter((x) => x !== f.kategorie)))
                  }}
                  aria-label={f.kategorie}
                  mt={2}
                />
                <div style={{ flex: 1 }}>
                  <Text size="sm">
                    <b>{f.kategorie}</b> – bei {f.anzahl} von {r.abgaben.length} ({f.kuerzel.join(', ')})
                  </Text>
                  {f.beispiele.length > 0 && (
                    <Text size="xs" c="dimmed">
                      z. B. {f.beispiele.join(' · ')}
                    </Text>
                  )}
                </div>
              </Group>
            ))}
          </Stack>
        )}
      </Card>
    </Stack>
  )
}
