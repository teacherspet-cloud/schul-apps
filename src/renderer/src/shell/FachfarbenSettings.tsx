import { Button, Card, ColorInput, ColorSwatch, Group, Popover, SimpleGrid, Stack, Text, Title, Tooltip, UnstyledButton } from '@mantine/core'
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react'
import { useState } from 'react'
import type { AppSettings, DeepPartial } from '@shared/types'
import { SUBJECTS } from '../modules/arbeitsblatt/model/subjects'
import { FACH_PALETTE, FACH_VORSCHLAG, fachFarbeAus, farbabstand, graustufenPruefung, istFarbe, leuchtdichte } from '../shared/fachfarben'
import MehrText from '../shared/components/MehrText'

/** Grauwert einer Farbe, wie ein S/W-Drucker sie ungefähr wiedergibt */
function grau(hex: string): string {
  const g = Math.round(leuchtdichte(hex) ** (1 / 2.2) * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${g}${g}${g}`
}

const farbname = (hex: string): string => FACH_PALETTE.find((f) => f.hex.toLowerCase() === hex.toLowerCase())?.name ?? hex

/** Anzeigename ohne die Auslassungspunkte der Fachwahl („Anderes Fach …") */
const fachname = (label: string): string => label.replace(/\s*…$/, '')

/**
 * Fachfarben in den Einstellungen (Paket 10a).
 *
 * Je Fach eine Farbe: Sie färbt Kopf, Überschriften, Rahmen, Farbband und Seitenleiste aller
 * Materialien dieses Fachs – die Designvorlage bestimmt nur noch Aufbau und Schrift. Jedes
 * Fach hat einen Vorschlag aus einer druckfesten Palette; frei wählbar ist jede Farbe. Beim
 * Wählen prüft die App, wie die Farbe im Schwarz-Weiß-Druck ankommt, denn im Kopierraum
 * werden die meisten Blätter grau.
 */
export default function FachfarbenSettings({
  settings,
  update
}: {
  settings: AppSettings
  update: (patch: DeepPartial<AppSettings>) => void
}): React.JSX.Element {
  const eigene = settings.fachfarben ?? {}
  const faecher = SUBJECTS.map((s) => ({ id: s.id, name: fachname(s.label), farbe: fachFarbeAus(s.id, eigene)! }))

  return (
    <Card withBorder padding="lg" className="fachfarben-karte">
      <Title order={4} mb={4}>
        Fachfarben
      </Title>
      <MehrText
        size="sm"
        text="Jedes Fach färbt seine Materialien in einer eigenen Farbe: Kopf, Überschriften, Rahmen, Farbband und Seitenleiste. Die Designvorlage bestimmt weiter Aufbau und Schrift. An jedem Material lässt sich stattdessen die Farbe der Vorlage wählen. Die Vorschläge stammen aus einer Palette, die auch auf Schwarz-Weiß-Kopien lesbar bleibt."
      />
      <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="xs" mt="md">
        {faecher.map((f) => (
          <FachZeile
            key={f.id}
            fach={f}
            gleich={faecher.filter((x) => x.id !== f.id && farbabstand(x.farbe, f.farbe) < 5).map((x) => x.name)}
            eigen={istFarbe(eigene[f.id])}
            setze={(hex) => update({ fachfarben: { [f.id]: hex } })}
          />
        ))}
      </SimpleGrid>
    </Card>
  )
}

function FachZeile({
  fach,
  gleich,
  eigen,
  setze
}: {
  fach: { id: string; name: string; farbe: string }
  /** Fächer mit (fast) derselben Farbe */
  gleich: string[]
  /** Von der Lehrkraft gewählt (sonst Vorschlag) */
  eigen: boolean
  /** '' = zurück zum Vorschlag */
  setze: (hex: string) => void
}): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const pruefung = graustufenPruefung(fach.farbe)
  return (
    <Popover opened={offen} onChange={setOffen} width={300} position="bottom-start" shadow="md" withArrow trapFocus>
      <Popover.Target>
        <UnstyledButton
          className="fachfarbe-zeile"
          data-fach={fach.id}
          aria-label={`Farbe für ${fach.name}: ${farbname(fach.farbe)} – ändern`}
          onClick={() => setOffen((o) => !o)}
        >
          <Group gap="sm" wrap="nowrap">
            <ColorSwatch color={fach.farbe} size={22} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text size="sm" fw={500} truncate>
                {fach.name}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {farbname(fach.farbe)}
                {eigen ? '' : ' · Vorschlag'}
              </Text>
            </div>
            {pruefung.stufe !== 'gut' && (
              <Tooltip label={pruefung.hinweis} multiline w={260}>
                <IconAlertTriangle
                  size={16}
                  color={`var(--mantine-color-${pruefung.stufe === 'zu-hell' ? 'red' : 'orange'}-6)`}
                  aria-label="Hinweis zum S/W-Druck"
                />
              </Tooltip>
            )}
          </Group>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <Text size="sm" fw={600}>
            Farbe für {fach.name}
          </Text>
          <Group gap={6}>
            {FACH_PALETTE.map((p) => (
              <Tooltip key={p.hex} label={p.name} openDelay={300}>
                <ColorSwatch
                  component="button"
                  type="button"
                  color={p.hex}
                  size={26}
                  aria-label={p.name}
                  onClick={() => setze(p.hex)}
                  style={{ cursor: 'pointer' }}
                >
                  {p.hex.toLowerCase() === fach.farbe.toLowerCase() && <IconCheck size={14} color="#fff" />}
                </ColorSwatch>
              </Tooltip>
            ))}
          </Group>
          <ColorInput
            size="xs"
            label="Freie Farbe"
            format="hex"
            value={fach.farbe}
            onChangeEnd={(v) => istFarbe(v) && setze(v.toLowerCase())}
            aria-label={`Freie Farbe für ${fach.name}`}
          />
          <GrauVorschau farbe={fach.farbe} />
          {gleich.length > 0 && (
            <Text size="xs" c="dimmed">
              Dieselbe Farbe hat {gleich.join(', ')}.
            </Text>
          )}
          {eigen && FACH_VORSCHLAG[fach.id] && (
            <Button size="compact-xs" variant="subtle" onClick={() => setze('')} leftSection={<ColorSwatch color={FACH_VORSCHLAG[fach.id]} size={12} />}>
              Vorschlag wiederherstellen ({farbname(FACH_VORSCHLAG[fach.id])})
            </Button>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

/**
 * So kommt die Farbe auf der Schwarz-Weiß-Kopie an: als Grauton neben dem Original, dazu der
 * Kontrast gegen weißes Papier und gegen schwarzen Text. Belegte Schwellen und Faustregel
 * stehen in shared/fachfarben.ts.
 */
function GrauVorschau({ farbe }: { farbe: string }): React.JSX.Element {
  const p = graustufenPruefung(farbe)
  const farbeDerMeldung = p.stufe === 'gut' ? 'teal' : p.stufe === 'zu-hell' ? 'red' : 'orange'
  return (
    <Stack gap={4} className="fachfarbe-grau" data-stufe={p.stufe}>
      <Group gap="xs" wrap="nowrap">
        <div className="fachfarbe-probe" style={{ background: farbe }}>
          Überschrift
        </div>
        <div className="fachfarbe-probe" style={{ background: grau(farbe) }}>
          S/W-Druck
        </div>
      </Group>
      <Text size="xs" c="dimmed">
        Kontrast zu Weiß {p.gegenWeiss.toFixed(1).replace('.', ',')} : 1 · zu schwarzem Text {p.gegenSchwarz.toFixed(1).replace('.', ',')} : 1 · Grauwert{' '}
        {p.grauProzent} %
      </Text>
      <Text size="xs" c={`${farbeDerMeldung}.7`} role={p.stufe === 'gut' ? undefined : 'alert'}>
        {p.stufe === 'gut' ? 'Gut für den S/W-Druck: Linien und Überschriften bleiben deutlich.' : p.hinweis}
      </Text>
    </Stack>
  )
}
