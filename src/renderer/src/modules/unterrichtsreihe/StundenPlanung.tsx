/**
 * Stundenansicht der Planungsreihe (08.10.2026, Plan „Unterrichtsreihe" E4): je Stunde ein Stundenverlauf als
 * bearbeitbare Tabelle (Phase, Minuten, Geschehen, Sozialform, Medien/Material) wie im Stundenverlauf der Arbeitsblatt-
 * App, mit Verknüpfung zu Schritten/Materialien der Reihe, Stundenziel und Hausaufgabe. Minuten-Summe gegen die Länge
 * der Stunde; „Mit KI vorschlagen" läuft als Hintergrund-Auftrag (verlaufAuftrag.ts). Unter der Tabelle stehen die
 * Materialien der Stunde als Schrittkarten (vom Editor gereicht) – sie lassen sich wie gewohnt erstellen und drucken.
 */
import { ActionIcon, Alert, Autocomplete, Badge, Button, Group, Menu, MultiSelect, NumberInput, Paper, Stack, Table, Text, Textarea, TextInput, Tooltip } from '@mantine/core'
import { IconAlertTriangle, IconArrowDown, IconArrowUp, IconFileExport, IconPlus, IconScale, IconSparkles, IconTemplate, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { SCHRITT_ARTEN, type Reihe, type ReihenPhase, type StundenPlanung } from '@shared/reihe'
import { SOZIALFORMEN } from '../../shared/stundenverlauf/stundenverlauf'
import { notifyError } from '../../shared/util'
import { minutenAnpassen, minutenLage, mitVerlauf, neuePhase, phasenVorlage, phaseVerschieben, verlaufVon } from './reihePlanung'
import { starteVerlaufVorschlag, useVerlaufEntsteht } from './verlaufAuftrag'
import { planungAusgeben } from './planungDruck'
import { datumKurz, stundenDaten } from './stundenAnsicht'
import type { DruckArt } from './reiheDruck'

const PHASEN = ['Einstieg', 'Erarbeitung', 'Sicherung', 'Übung', 'Vertiefung', 'Transfer', 'Reflexion', 'Hausaufgabe']

export function PlanungsStunde({
  reihe: r,
  stunde: i,
  setze,
  speichernVorher,
  material,
  materialNeu
}: {
  reihe: Reihe
  stunde: number
  setze: (teil: Partial<Reihe>) => void
  speichernVorher: () => Promise<Reihe | null>
  /** Schrittkarten der Materialien dieser Stunde */
  material: React.ReactNode
  /** Knopf „Material hinzufügen" für diese Stunde */
  materialNeu: React.ReactNode
}): React.JSX.Element {
  const p = verlaufVon(r, i)
  const lage = minutenLage(r, i)
  const entsteht = useVerlaufEntsteht(r.id || undefined, i)
  const art = r.stunden?.[i] ?? 'einzel'
  const datum = stundenDaten(r)[i]
  const setzeP = (neu: StundenPlanung): void => setze(mitVerlauf(r, i, neu))
  const setzePhase = (k: number, patch: Partial<ReihenPhase>): void => setzeP({ ...p, phasen: p.phasen.map((x, j) => (j === k ? { ...x, ...patch } : x)) })
  const schrittWahl = r.schritte.map((s, k) => ({
    value: s.id,
    label: `${k + 1}. ${s.titel || SCHRITT_ARTEN.find((a) => a.id === s.inhalt.art)?.label || 'Schritt'}${s.stunde === i ? '' : s.stunde !== undefined ? ` (Std. ${s.stunde + 1})` : ''}`
  }))
  const kiVorschlag = async (): Promise<void> => {
    if (p.phasen.length && !window.confirm(`Den Verlauf von Stunde ${i + 1} durch einen KI-Vorschlag ersetzen? Die jetzigen Phasen gehen dabei verloren.`)) return
    const gespeichert = await speichernVorher()
    if (!gespeichert) return
    try {
      starteVerlaufVorschlag(gespeichert, i)
    } catch (e) {
      notifyError(e, 'Kein Vorschlag')
    }
  }
  return (
    <Paper withBorder radius="md" p="sm" bg="var(--mantine-color-default-hover)" data-planung-stunde={i} data-ueberlang={lage.ueber || undefined}>
      <Stack gap="xs">
        <Group justify="space-between" wrap="wrap" gap="xs">
          <Text fw={700}>
            Stunde {i + 1}
            {datum ? ` · ${datumKurz(datum)}` : ''} · {art === 'doppel' ? 'Doppelstunde' : 'Einzelstunde'} · {lage.laenge} min
          </Text>
          <Group gap="xs" wrap="wrap">
            <Group gap={4} wrap="nowrap" data-planung-summe={lage.summe}>
              {(lage.ueber || lage.unter) && <IconAlertTriangle size={14} color={`var(--mantine-color-${lage.ueber ? 'red' : 'orange'}-6)`} />}
              <Text size="xs" c={lage.ueber ? 'red' : lage.unter ? 'orange' : 'dimmed'}>
                {lage.summe} von {lage.laenge} min verplant{lage.ueber ? ' – mehr, als die Stunde hat' : lage.unter ? ' – noch Zeit übrig' : ''}
              </Text>
            </Group>
            {(lage.ueber || lage.unter) && (
              <Tooltip label="Minuten verhältnisgleich auf die Länge der Stunde bringen">
                <Button size="compact-xs" variant="subtle" leftSection={<IconScale size={12} />} onClick={() => setzeP(minutenAnpassen(p, lage.laenge))} data-minuten-angleichen>
                  Angleichen
                </Button>
              </Tooltip>
            )}
            <Button
              size="compact-xs"
              variant="light"
              color="grape"
              leftSection={<IconSparkles size={12} />}
              loading={entsteht}
              onClick={() => void kiVorschlag()}
              data-planung-ki
            >
              {p.phasen.length ? 'Neu mit KI vorschlagen' : 'Mit KI vorschlagen'}
            </Button>
          </Group>
        </Group>
        {entsteht && (
          <Text size="xs" c="grape" data-planung-entsteht>
            Der Verlauf entsteht im Hintergrund – du kannst weiterarbeiten.
          </Text>
        )}
        <TextInput
          size="xs"
          placeholder="Stundenziel in einem Satz (optional): Die Lernenden können …"
          value={p.ziel ?? ''}
          onChange={(e) => setzeP({ ...p, ziel: e.currentTarget.value || undefined })}
          aria-label="Stundenziel"
          data-planung-ziel
        />
        {p.phasen.length > 0 ? (
          <Table.ScrollContainer minWidth={860}>
            <Table withTableBorder withColumnBorders verticalSpacing={4} horizontalSpacing={6} data-planung-tabelle>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={130}>Phase</Table.Th>
                  <Table.Th w={70}>Min.</Table.Th>
                  <Table.Th>Geplantes Geschehen</Table.Th>
                  <Table.Th w={95}>Sozialform</Table.Th>
                  <Table.Th w={230}>Medien / Material</Table.Th>
                  <Table.Th w={88} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {p.phasen.map((ph, k) => (
                  <Table.Tr key={ph.id} data-phase-zeile={k}>
                    <Table.Td>
                      <Autocomplete size="xs" data={PHASEN} value={ph.phase} onChange={(v) => setzePhase(k, { phase: v })} aria-label="Phase" data-phase-feld="phase" />
                    </Table.Td>
                    <Table.Td>
                      <NumberInput
                        size="xs"
                        min={0}
                        max={180}
                        hideControls
                        value={ph.minuten}
                        onChange={(v) => setzePhase(k, { minuten: Math.max(0, Math.round(Number(v) || 0)) })}
                        aria-label="Minuten"
                        data-phase-feld="minuten"
                      />
                    </Table.Td>
                    <Table.Td>
                      <Textarea
                        size="xs"
                        autosize
                        minRows={1}
                        maxRows={6}
                        placeholder="Impuls, Arbeitsauftrag, Tätigkeit der Lernenden (Stichpunkte mit · trennen)"
                        value={ph.geschehen}
                        onChange={(e) => setzePhase(k, { geschehen: e.currentTarget.value })}
                        aria-label="Geplantes Geschehen"
                        data-phase-feld="geschehen"
                      />
                    </Table.Td>
                    <Table.Td>
                      <Autocomplete
                        size="xs"
                        data={[...SOZIALFORMEN]}
                        value={ph.sozialform}
                        onChange={(v) => setzePhase(k, { sozialform: v })}
                        aria-label="Sozialform"
                        data-phase-feld="sozialform"
                      />
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={4}>
                        <TextInput
                          size="xs"
                          placeholder="Tafel, Buch S. 34, Folie …"
                          value={ph.medien}
                          onChange={(e) => setzePhase(k, { medien: e.currentTarget.value })}
                          aria-label="Medien"
                          data-phase-feld="medien"
                        />
                        {schrittWahl.length > 0 && (
                          <MultiSelect
                            size="xs"
                            placeholder={ph.schritte?.length ? undefined : 'Material verknüpfen …'}
                            data={schrittWahl}
                            value={(ph.schritte ?? []).filter((id) => r.schritte.some((s) => s.id === id))}
                            onChange={(v) => setzePhase(k, { schritte: v.length ? v : undefined })}
                            searchable
                            clearable
                            comboboxProps={{ withinPortal: true, width: 320, position: 'bottom-end' }}
                            aria-label="Verknüpftes Material"
                            data-phase-feld="material"
                          />
                        )}
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={0} wrap="nowrap">
                        <ActionIcon variant="subtle" size="sm" disabled={k === 0} onClick={() => setzeP(phaseVerschieben(p, k, -1))} aria-label="Phase nach oben">
                          <IconArrowUp size={14} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          disabled={k === p.phasen.length - 1}
                          onClick={() => setzeP(phaseVerschieben(p, k, 1))}
                          aria-label="Phase nach unten"
                        >
                          <IconArrowDown size={14} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          color="red"
                          onClick={() => setzeP({ ...p, phasen: p.phasen.filter((_, j) => j !== k) })}
                          aria-label="Phase entfernen"
                          data-phase-entfernen
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : (
          <Text size="xs" c="dimmed" ta="center" py={4}>
            Noch kein Verlauf – Vorlage nehmen, Phasen einzeln anlegen oder von der KI vorschlagen lassen.
          </Text>
        )}
        <Group gap="xs">
          <Button
            size="compact-sm"
            variant="default"
            leftSection={<IconPlus size={14} />}
            onClick={() => setzeP({ ...p, phasen: [...p.phasen, neuePhase()] })}
            data-phase-neu
          >
            Phase
          </Button>
          {p.phasen.length === 0 && (
            <Button
              size="compact-sm"
              variant="default"
              leftSection={<IconTemplate size={14} />}
              onClick={() => setzeP({ ...p, phasen: phasenVorlage(lage.laenge) })}
              data-phase-vorlage
            >
              Vorlage: Einstieg – Erarbeitung – Sicherung
            </Button>
          )}
        </Group>
        <Textarea
          size="xs"
          label="Hausaufgabe"
          autosize
          minRows={1}
          placeholder="(keine)"
          value={p.hausaufgabe ?? ''}
          onChange={(e) => setzeP({ ...p, hausaufgabe: e.currentTarget.value || undefined })}
          data-hausaufgabe
        />
        {p.hinweise && (
          <Text size="xs" c="dimmed">
            <b>Hinweise:</b> {p.hinweise}
          </Text>
        )}
        <Group justify="space-between" mt={4}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
            Material dieser Stunde
          </Text>
          {materialNeu}
        </Group>
        {material}
      </Stack>
    </Paper>
  )
}

/** Hinweis statt Zuweisen/Schüleransicht in der Planungsreihe */
export function PlanungHinweis(): React.JSX.Element {
  return (
    <Badge variant="light" color="gray" size="lg" style={{ textTransform: 'none' }} data-planung-hinweis>
      Planungsreihe – kein Zuweisen, keine Schüleransicht
    </Badge>
  )
}

/** Planungsreihe ohne Stunden: erst Stunden anlegen */
export function PlanungOhneStunden({ leiste }: { leiste: React.ReactNode }): React.JSX.Element {
  return (
    <Alert variant="light" color="blue" title="Erst die Stunden anlegen" data-planung-ohne-stunden>
      <Stack gap="xs">
        <Text size="sm">Je Einzel- oder Doppelstunde entsteht ein Verlauf mit Phasen, Material und Hausaufgabe.</Text>
        {leiste}
      </Stack>
    </Alert>
  )
}

/** Export „Unterrichtsplanung": je Stunde die Verlaufstabelle und der Materialanhang – Drucken, PDF, Word */
export function PlanungExport({ reihe }: { reihe: Reihe }): React.JSX.Element {
  const [laeuft, setLaeuft] = useState(false)
  const los = async (art: DruckArt): Promise<void> => {
    setLaeuft(true)
    try {
      await planungAusgeben(reihe, art)
    } catch (e) {
      notifyError(e, 'Nicht gespeichert')
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <Button variant="default" leftSection={<IconFileExport size={16} />} loading={laeuft} disabled={!(reihe.stunden?.length ?? 0)} data-planung-export>
          Unterrichtsplanung
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Verläufe aller Stunden + Materialanhang</Menu.Label>
        <Menu.Item onClick={() => void los('drucken')} data-planung-export-art="drucken">
          Drucken
        </Menu.Item>
        <Menu.Item onClick={() => void los('pdf')} data-planung-export-art="pdf">
          Als PDF speichern
        </Menu.Item>
        <Menu.Item onClick={() => void los('word')} data-planung-export-art="word">
          Als Word speichern
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
