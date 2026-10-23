/**
 * Regal „Nach Lehrplan" (13.10.2026, mit der Lehrkraft abgestimmt): Grammatikformen eines Fachs OHNE Lehrwerk – aus dem
 * Katalog (didactics/grammar.ts mit den belegten Abweichungen je Land und Schulform), geordnet nach dem Jahrgang (Deutsch)
 * bzw. Lernjahr (Fremdsprachen, Latein), in dem eine Form eingeführt wird. Land und Schulform kommen aus den Einstellungen
 * und lassen sich hier umschalten. Ein Klick auf eine Form öffnet dasselbe Pop-up wie bei den Lehrwerken – die Übungsaufgaben
 * hängen an der Form (Aufgabenbank), gelten also lehrwerksübergreifend. Die Zuordnung selbst ist der Katalog: hier nur
 * ansehen.
 */
import { Button, Collapse, Group, Modal, Paper, Progress, Select, Stack, Text, Title, Tooltip, UnstyledButton } from '@mantine/core'
import { IconArrowLeft, IconChevronRight } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import type { TextbookMeta } from '@shared/types'
import { fachDerSprache } from '@shared/fachobleute'
import { fachVon } from '@shared/faecher'
import { LAENDER, schulformenDes } from '@shared/schulformen'
import { GRAMMAR_TOPICS, einfuehrungsStufe } from '../arbeitsblatt/didactics/grammar'
import type { GrammarTopic } from '../arbeitsblatt/didactics/grammarTopics'
import type { LehrwerkGrammatikPunkt } from '../../shared/lehrwerkGrammatik'
import { useAppSettings } from '../../shared/settingsStore'
import { aufgabenAmpel, kurseFreigegeben, useSchulStufen } from './bank'
import { useBankZahlen } from './GrammatikBank'
import { PunktFenster } from './GrammatikformenEditor'
import { SchuelerAnsichtKnopf } from './SchuelerAnsicht'
import { AMPEL_FARBE, AMPEL_TEXT, tonHell, tonText, tonVoll, tonZart, useGrammatikFarbe } from './farbton'
import { teilbereicheVon } from './grammatikformen'

/** Bezeichnung einer Stufe: „Klasse 7" bzw. „2. Lernjahr" */
const stufenName = (t: Pick<GrammarTopic, 'scale'>, n: number): string =>
  t.scale === 'lernjahr' ? `${n}. Lernjahr` : t.scale === 'erwerbsstufe' ? `Erwerbsstufe ${n}` : `Klasse ${n}`

/** Ein Punkt je Katalogthema */
const punktVon = (t: GrammarTopic): LehrwerkGrammatikPunkt => ({ text: t.label, t: [t.id] })

export default function LehrplanAnsicht({ sprache, onBack }: { sprache: string; onBack: () => void }): React.JSX.Element {
  const fach = fachDerSprache(sprache)
  const fachName = fachVon(fach)?.label ?? fach
  const farbe = useGrammatikFarbe(sprache)
  const defaults = useAppSettings((s) => s.settings.defaults)
  const [land, setLand] = useState<string>(defaults?.stateId || 'NI')
  const formen = schulformenDes(land).filter((s) => !s.beruflich && s.profil !== 'grundschule')
  const [schulform, setSchulform] = useState<string>(defaults?.schoolTypeId || formen.find((s) => s.profil === 'gymnasium')?.id || formen[0]?.id || '')
  const sf = formen.some((s) => s.id === schulform) ? schulform : formen[0]?.id ?? ''
  const bank = useBankZahlen(sprache)
  const schulStufen = useSchulStufen()
  const [auf, setAuf] = useState<string[]>([])
  const [offen, setOffen] = useState<{ stufe: number; t: GrammarTopic } | null>(null)

  // Themen des Fachs nach Einführung (Land, Schulform); DaZ-Themen nicht im Fach Deutsch
  const gruppen = useMemo(() => {
    const m = new Map<number, GrammarTopic[]>()
    for (const t of GRAMMAR_TOPICS.filter((x) => x.subject === fach)) {
      const n = einfuehrungsStufe(t, { subjectId: fach, stateId: land, schoolTypeId: sf })
      if (n === null) continue
      m.set(n, [...(m.get(n) ?? []), t])
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([n, l]) => ({ n, themen: l.sort((a, b) => a.label.localeCompare(b.label, 'de')) }))
  }, [fach, land, sf])

  // Für Pop-up und Schüleransicht: ein „Band" Lehrplan je Fach, Land und Schulform (Klasse für das Niveau der KI)
  const buchFuer = (n: number, t?: GrammarTopic): TextbookMeta => ({
    id: `lehrplan-${sprache}-${land}-${sf}`,
    name: `Lehrplan ${fachName}`,
    language: sprache,
    grade: t?.scale === 'lernjahr' ? Math.min(13, n + 5) : n,
    stateId: land,
    schoolTypeId: sf,
    units: [],
    entryCount: 0
  })
  const ampel = (t: GrammarTopic): 'voll' | 'teil' | 'keine' => aufgabenAmpel(teilbereicheVon([t.id]), bank.zahlen, schulStufen)

  return (
    <Stack gap="lg" data-grammatikformen-lehrplan>
      <Group justify="space-between" wrap="wrap" gap="sm">
        <div>
          <Title order={3}>Nach Lehrplan – {fachName}</Title>
          <Text size="xs" c="dimmed">
            Grammatikformen ohne Lehrwerk, nach dem Jahrgang ihrer Einführung. Übungsaufgaben gelten für alle Lehrwerke.
          </Text>
        </div>
        <Group gap="xs">
          <SchuelerAnsichtKnopf
            buch={buchFuer(7)}
            titel={`Lehrplan ${fachName}`}
            farbe={farbe}
            punkte={gruppen.flatMap((g) => g.themen.map((t) => ({ unit: stufenName(t, g.n), abschnitt: '', punkt: punktVon(t) })))}
          />
          <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={onBack} data-grammatikformen-zurueck>
            Zurück
          </Button>
        </Group>
      </Group>
      <Group gap="sm">
        <Select
          label="Land"
          data={LAENDER.map((l) => ({ value: l.id, label: l.name }))}
          value={land}
          onChange={(v) => v && setLand(v)}
          allowDeselect={false}
          w={220}
          data-lehrplan-land
        />
        <Select
          label="Schulform"
          data={formen.map((s) => ({ value: s.id, label: s.name }))}
          value={sf}
          onChange={(v) => v && setSchulform(v)}
          allowDeselect={false}
          w={260}
          data-lehrplan-schulform
        />
      </Group>
      {!gruppen.length && <Text c="dimmed">Für dieses Fach enthält der Katalog keine Grammatikformen.</Text>}
      <Stack gap="sm">
        {gruppen.map((g) => {
          const key = String(g.n)
          const zu = !auf.includes(key)
          const mit = g.themen.filter((t) => ampel(t) !== 'keine').length
          return (
            <Paper key={key} withBorder radius="lg" style={{ overflow: 'hidden', borderLeft: `4px solid ${tonVoll(farbe)}` }} data-lehrplan-stufe={g.n}>
              <UnstyledButton
                w="100%"
                px="md"
                py="sm"
                onClick={() => setAuf((l) => (zu ? [...l, key] : l.filter((x) => x !== key)))}
                style={{ background: zu ? undefined : tonZart(farbe) }}
                aria-expanded={!zu}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="sm" wrap="nowrap">
                    <IconChevronRight size={16} style={{ transform: zu ? undefined : 'rotate(90deg)', transition: 'transform 150ms' }} />
                    <Text fw={700}>{stufenName(g.themen[0], g.n)}</Text>
                  </Group>
                  <Group gap="md" wrap="nowrap">
                    <Text size="sm" c="dimmed">
                      {g.themen.length} {g.themen.length === 1 ? 'Form' : 'Formen'}
                    </Text>
                    {kurseFreigegeben() && (
                      <Tooltip label={`Übungsaufgaben: ${mit} von ${g.themen.length} Formen`}>
                        <Progress value={(mit / g.themen.length) * 100} w={80} size="sm" color="teal" radius="xl" visibleFrom="xs" />
                      </Tooltip>
                    )}
                  </Group>
                </Group>
              </UnstyledButton>
              <Collapse expanded={!zu}>
                <Group gap={6} px="md" py="sm" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                  {g.themen.map((t) => {
                    const a = kurseFreigegeben() ? ampel(t) : undefined
                    return (
                      <Tooltip key={t.id} label={a ? AMPEL_TEXT[a] : t.label} openDelay={300}>
                        <UnstyledButton
                          onClick={() => setOffen({ stufe: g.n, t })}
                          data-lehrplan-form={t.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '5px 12px',
                            borderRadius: 999,
                            border: `1px solid color-mix(in srgb, ${tonVoll(farbe)} 35%, var(--mantine-color-default-border))`,
                            background: tonZart(farbe),
                            fontSize: 'var(--mantine-font-size-sm)'
                          }}
                        >
                          {a && <span style={{ width: 8, height: 8, borderRadius: 999, background: `var(--mantine-color-${AMPEL_FARBE[a]}-filled)` }} />}
                          {t.label}
                        </UnstyledButton>
                      </Tooltip>
                    )
                  })}
                </Group>
              </Collapse>
            </Paper>
          )
        })}
      </Stack>

      <Modal
        opened={Boolean(offen)}
        onClose={() => setOffen(null)}
        size="lg"
        radius="lg"
        title={
          offen ? (
            <div>
              <Text size="xs" fw={600} tt="uppercase" style={{ letterSpacing: 0.4, color: tonText(farbe) }}>
                Lehrplan · {stufenName(offen.t, offen.stufe)}
              </Text>
              <Text fw={700} size="lg" lh={1.25}>
                {offen.t.label}
              </Text>
            </div>
          ) : (
            ''
          )
        }
        styles={{
          header: {
            background: `linear-gradient(135deg, ${tonHell(farbe)} 0%, var(--mantine-color-body) 85%)`,
            borderBottom: '1px solid var(--mantine-color-default-border)',
            marginBottom: 16
          }
        }}
        data-lehrplan-popup
      >
        {offen && (
          <PunktFenster
            punkt={punktVon(offen.t)}
            ort={{ unit: stufenName(offen.t, offen.stufe), abschnitt: '', index: 0 }}
            buch={buchFuer(offen.stufe, offen.t)}
            unitPunkte={[]}
            bank={bank}
            anzahl={1}
            darf={false}
            fach={fach}
            farbe={farbe}
            abschnitte={['']}
            entfernenFrage={false}
            setEntfernenFrage={() => undefined}
            schliessen={() => setOffen(null)}
            onText={() => undefined}
            onWiederholung={() => undefined}
            onFormen={() => undefined}
            onAbschnitt={() => undefined}
            onVerschieben={() => undefined}
            onEntfernen={() => undefined}
          />
        )}
      </Modal>
    </Stack>
  )
}
