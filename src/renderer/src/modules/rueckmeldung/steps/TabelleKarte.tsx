import { ActionIcon, Badge, Button, Card, Group, NumberInput, Select, Stack, Table, Text, TextInput, Title, Tooltip } from '@mantine/core'
import { IconDeviceFloppy, IconPlus, IconSparkles, IconTrash } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import DropZone from '../../../shared/components/DropZone'
import { pruefeHochladen, type HochladeInhalt } from '../../../shared/datenschutz'
import { extractContent, MATERIAL_ACCEPT } from '../../../shared/files/extractContent'
import { notifyError, notifySuccess } from '../../../shared/util'
import { newId } from '../../vokabeltest/model/random'
import { ladeTabellenVorlage, speichereTabellenVorlage, tabellenVorlagen, type TabellenVorlage } from '../ablagen'
import { tabelleErzeugen } from '../auftrag'
import { leereTabelle, excelAlsText } from '../tabelle'
import type { Bewertungstabelle } from '../model/types'
import { useRueckmeldung } from '../store'

const TABELLE_ACCEPT = [...MATERIAL_ACCEPT, 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx', '.csv']

/**
 * Bewertungstabelle der Rückmeldung (29.09.2026): hineinziehen (PDF, Word, Excel, CSV, Foto),
 * von der KI aus Aufgaben und Erwartungshorizont entwerfen lassen, aus einer Vorlage laden oder
 * selbst anlegen – danach frei bearbeitbar und als Vorlage ablegbar. Gilt für alle Abgaben.
 */
export default function TabelleKarte(): React.JSX.Element | null {
  const { dok: r, update, docId } = useRueckmeldung()
  const [lese, setLese] = useState<string | null>(null)
  const [vorlagen, setVorlagen] = useState<TabellenVorlage[]>([])
  useEffect(() => {
    void tabellenVorlagen().then(setVorlagen)
  }, [r?.tabelle?.vorlageId])
  if (!r) return null
  const t = r.tabelle

  const setze = (fn: (t: Bewertungstabelle) => void, gruppe?: string): void =>
    update((d) => {
      if (d.tabelle) fn(d.tabelle)
    }, gruppe)

  const dateienLesen = async (files: File[]): Promise<void> => {
    try {
      const gelesen: HochladeInhalt[] = []
      for (const f of files) {
        setLese(`${f.name} wird gelesen …`)
        if (/\.xlsx$/i.test(f.name)) gelesen.push({ fileName: f.name, text: await excelAlsText(f), kind: 'text' })
        else {
          const c = await extractContent(f, (m) => setLese(`${f.name}: ${m}`), { renderPages: false, maxRenderedPages: 4 })
          gelesen.push({ fileName: c.fileName, text: c.kind === 'image' ? '' : c.text, kind: c.kind, pageImages: c.pageImages })
        }
      }
      setLese(null)
      const geprueft = await pruefeHochladen(gelesen)
      if (!geprueft) return
      const aktuell = useRueckmeldung.getState().dok
      if (aktuell) tabelleErzeugen(aktuell, docId, geprueft)
    } catch (e) {
      notifyError(e, 'Die Tabelle konnte nicht gelesen werden')
    } finally {
      setLese(null)
    }
  }

  const summe = t?.kriterien.reduce((s, k) => s + (k.punkte ?? 0), 0) ?? 0

  return (
    <Card withBorder data-rm-tabelle>
      <Group justify="space-between" mb="sm">
        <Title order={4}>Bewertungstabelle</Title>
        {t?.entwurf && (
          <Badge color="orange" variant="light">
            Entwurf der KI – bitte prüfen
          </Badge>
        )}
      </Group>
      {!t ? (
        <Stack gap="sm">
          <DropZone
            onFiles={(f) => void dateienLesen(f)}
            accept={TABELLE_ACCEPT}
            title={lese ?? 'Bewertungstabelle hierher ziehen'}
            hint="PDF, Word, Excel, CSV oder Foto – die KI überträgt Kriterien, Punkte und Stufen wörtlich."
            loading={Boolean(lese)}
            minHeight={60}
          />
          <Group gap="xs">
            <Tooltip label={r.grundlage.aufgaben.trim() ? 'Aus Aufgaben und Erwartungshorizont' : 'Zuerst die Aufgabe eintragen'}>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconSparkles size={14} />}
                disabled={!r.grundlage.aufgaben.trim()}
                onClick={() => tabelleErzeugen(r, docId, null)}
                data-rm-tabelle-ki
              >
                Von der KI entwerfen
              </Button>
            </Tooltip>
            <Button size="xs" variant="default" onClick={() => update((d) => (d.tabelle = leereTabelle()))}>
              Selbst anlegen
            </Button>
            {vorlagen.length > 0 && (
              <Select
                size="xs"
                placeholder="Aus Vorlage …"
                data={vorlagen.map((v) => ({ value: v.id, label: `${v.name} (${v.kriterien})` }))}
                value={null}
                onChange={(id) =>
                  id &&
                  void ladeTabellenVorlage(id)
                    .then((neu) => update((d) => (d.tabelle = neu)))
                    .catch(notifyError)
                }
                w={220}
              />
            )}
          </Group>
        </Stack>
      ) : (
        <Stack gap="xs">
          <TextInput size="xs" label="Titel" value={t.titel} onChange={(e) => setze((x) => (x.titel = e.currentTarget.value), 'rm-tab-titel')} />
          <Table withTableBorder fz="xs" verticalSpacing={2}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w="22%">Bereich</Table.Th>
                <Table.Th>Kriterium</Table.Th>
                <Table.Th w={90}>Punkte</Table.Th>
                <Table.Th w={30} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {t.kriterien.map((k, i) => (
                <Table.Tr key={k.id}>
                  <Table.Td>
                    <TextInput
                      size="xs"
                      variant="unstyled"
                      value={k.bereich ?? ''}
                      aria-label="Bereich"
                      onChange={(e) => {
                        const x = e.currentTarget.value
                        setze((tt) => (tt.kriterien[i].bereich = x || undefined), `rm-tab-b-${k.id}`)
                      }}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      size="xs"
                      variant="unstyled"
                      value={k.kriterium}
                      aria-label="Kriterium"
                      onChange={(e) => {
                        const x = e.currentTarget.value
                        setze((tt) => (tt.kriterien[i].kriterium = x), `rm-tab-k-${k.id}`)
                      }}
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      variant="unstyled"
                      min={0}
                      max={100}
                      value={k.punkte ?? 0}
                      aria-label="Höchstpunktzahl (0 = Stufen)"
                      onChange={(v) => setze((tt) => (tt.kriterien[i].punkte = Number(v) > 0 ? Number(v) : undefined), `rm-tab-p-${k.id}`)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon size="sm" variant="subtle" color="red" aria-label="Kriterium entfernen" onClick={() => setze((tt) => tt.kriterien.splice(i, 1))}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group justify="space-between">
            <Button
              size="compact-xs"
              variant="subtle"
              leftSection={<IconPlus size={12} />}
              onClick={() => setze((tt) => tt.kriterien.push({ id: newId(), kriterium: '', punkte: 4 }))}
            >
              Kriterium hinzufügen
            </Button>
            <Text size="xs" c="dimmed">
              {summe ? `Summe: ${summe} Punkte` : 'Bewertung über Stufen'}
              {t.kriterien.some((k) => !k.punkte) ? ` · Stufen: ${t.stufen.join(' / ')}` : ''}
            </Text>
          </Group>
          {t.kriterien.some((k) => !k.punkte) && (
            <TextInput
              size="xs"
              label="Stufen (beste zuerst, mit Schrägstrich getrennt)"
              value={t.stufen.join(' / ')}
              onChange={(e) => {
                const x = e.currentTarget.value
                  .split('/')
                  .map((s) => s.trim())
                  .filter(Boolean)
                if (x.length >= 2) setze((tt) => (tt.stufen = x), 'rm-tab-stufen')
              }}
            />
          )}
          <Group gap="xs">
            {t.entwurf && (
              <Button size="xs" variant="light" color="teal" onClick={() => setze((tt) => delete tt.entwurf)}>
                Durchgesehen
              </Button>
            )}
            <Button
              size="xs"
              variant="default"
              leftSection={<IconDeviceFloppy size={14} />}
              onClick={() =>
                void speichereTabellenVorlage(t, t.titel)
                  .then((id) => {
                    setze((tt) => (tt.vorlageId = id))
                    notifySuccess('Als Vorlage gespeichert.')
                  })
                  .catch(notifyError)
              }
            >
              Als Vorlage speichern
            </Button>
            <Button size="xs" variant="subtle" color="red" onClick={() => update((d) => delete d.tabelle)}>
              Tabelle entfernen
            </Button>
          </Group>
        </Stack>
      )}
    </Card>
  )
}
