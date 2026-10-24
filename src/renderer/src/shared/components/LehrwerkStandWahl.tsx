/**
 * „Bis Lehrwerk-Stand" als Unit-Leiste (24.10.2026, abgestimmt mit der Lehrkraft): links das Buchcover des Bands, daneben
 * die Units als anklickbare Kacheln mit der Zahl der Karten bis dorthin; die Unit, bis zu der die Klasse steht, ist
 * markiert („Klasse steht hier") und vorgewählt. Darunter die Stationen der gewählten Unit als Chips (Karten ohne
 * Stationsangabe zählen zur ganzen Unit). Gemeinsam genutzt von der Partnerarbeit (Meine Klassen, Sprachenlernen) und
 * der App „Sprechprüfungen" (Filter „Bis Lehrwerk-Stand", neue Karten).
 */
import { Badge, Button, Chip, Group, ScrollArea, Select, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconMapPin } from '@tabler/icons-react'
import type { TextbookMeta } from '@shared/types'
import { standText, type SprechStand } from '@shared/sprechen/karten'
import { BandCover } from './BandCover'

export interface StandZahlen {
  gesamt: number
  interview?: number
  monolog?: number
  dialog?: number
}

export interface StandVorschlagKurz {
  stand: SprechStand
  quelle: 'vokabeln' | 'grammatik' | 'hand'
}

const QUELLE: Record<StandVorschlagKurz['quelle'], string> = {
  vokabeln: 'zuletzt freigeschaltete Vokabeln',
  grammatik: 'freigegebene Grammatik',
  hand: 'Lehrwerk-Stand in Meine Klassen'
}

/** Band der Liste zu einem Namen aus Vokabeln/Grammatik („Green Line 3" – im Lehrwerk ggf. mit Zusatz) */
export function bandZuName(baende: TextbookMeta[], name: string | undefined): TextbookMeta | undefined {
  const n = (name ?? '').trim().toLowerCase()
  if (!n) return undefined
  return (
    baende.find((b) => b.name.toLowerCase() === n) ??
    baende.find((b) => b.name.toLowerCase().startsWith(n)) ??
    baende.find((b) => n.startsWith(b.name.toLowerCase()))
  )
}

export function LehrwerkStandWahl({
  baende,
  wert,
  aendern,
  vorschlag,
  zaehlen,
  bandVorgabe,
  rechts
}: {
  /** Bände der Sprache (ohne Platzhalter) */
  baende: TextbookMeta[]
  /** Gewählter Stand (undefined = alle Karten) */
  wert: SprechStand | undefined
  aendern: (s: SprechStand | undefined) => void
  /** Stand der Klasse (Vorwahl, Marke) */
  vorschlag?: StandVorschlagKurz | null
  /** Karten bis zu einem Stand zählen (für die Kacheln und die Zeile darunter) */
  zaehlen?: (s: SprechStand | undefined) => StandZahlen
  /** Band, wenn weder Wert noch Vorschlag einen nennen (z. B. Band des Jahrgangs) */
  bandVorgabe?: TextbookMeta
  /** Zusätzliche Knöpfe rechts in der Kopfzeile (z. B. „Ganzes Lehrwerk füllen") */
  rechts?: React.ReactNode
}): React.JSX.Element {
  const band = bandZuName(baende, wert?.band) ?? bandZuName(baende, vorschlag?.stand.band) ?? bandVorgabe ?? baende[0]
  const klasseBand = bandZuName(baende, vorschlag?.stand.band)
  const klasseUnit = klasseBand && klasseBand.id === band?.id ? vorschlag?.stand.unit : undefined
  const gewaehlteUnit = wert && band && wert.band === band.name ? wert.unit : undefined
  const stationen = band?.units.find((u) => u.name === gewaehlteUnit)?.sections.map((s) => s.name) ?? []
  const zahlen = zaehlen?.(wert)
  const istVorschlag = Boolean(vorschlag && wert && standText(wert) === standText(vorschlag.stand))
  if (!band)
    return (
      <Text size="sm" c="dimmed" data-lehrwerk-wahl="leer">
        Kein Lehrwerk für diese Sprache eingerichtet – es gelten alle Karten des Jahrgangs.
      </Text>
    )
  return (
    <Stack gap="xs" data-lehrwerk-wahl={wert ? standText(wert) : 'alle'}>
      <Group gap="sm" align="center" wrap="wrap">
        <BandCover band={{ name: band.name }} breite={40} />
        {baende.length > 1 ? (
          <Select
            size="xs"
            data={baende.map((b) => ({ value: b.id, label: b.name }))}
            value={band.id}
            onChange={(id) => {
              const b = baende.find((x) => x.id === id)
              if (b) aendern({ band: b.name, unit: b.units[b.units.length - 1]?.name ?? '' })
            }}
            w={220}
            comboboxProps={{ withinPortal: true }}
            data-lehrwerk-band
          />
        ) : (
          <Text fw={700}>{band.name}</Text>
        )}
        {vorschlag && !istVorschlag && (
          <Button size="compact-xs" variant="light" leftSection={<IconMapPin size={12} />} onClick={() => aendern(vorschlag.stand)} data-lehrwerk-vorschlag>
            Stand der Klasse: {standText(vorschlag.stand).replace(/^bis /, '')}
          </Button>
        )}
        {vorschlag && istVorschlag && (
          <Tooltip label={`Vorwahl aus: ${QUELLE[vorschlag.quelle]}`}>
            <Badge size="sm" variant="light" color="teal" tt="none" leftSection={<IconMapPin size={10} />} data-lehrwerk-vorschlag-aktiv>
              Stand der Klasse
            </Badge>
          </Tooltip>
        )}
        <Button size="compact-xs" variant={wert ? 'subtle' : 'light'} onClick={() => aendern(undefined)} data-lehrwerk-alle>
          Alle Karten
        </Button>
        {rechts && <div style={{ marginLeft: 'auto' }}>{rechts}</div>}
      </Group>
      <ScrollArea type="auto" offsetScrollbars>
        <Group gap={6} wrap="nowrap" data-lehrwerk-units>
          {band.units.map((u) => {
            const aktiv = gewaehlteUnit === u.name
            const hier = klasseUnit === u.name
            const z = zaehlen?.({ band: band.name, unit: u.name })
            return (
              <UnstyledButton
                key={u.name}
                onClick={() => aendern({ band: band.name, unit: u.name })}
                style={{
                  minWidth: 84,
                  padding: '6px 10px',
                  borderRadius: 10,
                  border: `2px solid ${
                    aktiv ? 'var(--mantine-color-violet-5)' : hier ? 'var(--mantine-color-teal-5)' : 'var(--app-border, var(--mantine-color-default-border))'
                  }`,
                  background: aktiv ? 'var(--mantine-color-violet-light)' : undefined,
                  textAlign: 'center'
                }}
                data-lehrwerk-unit={u.name}
                data-aktiv={aktiv ? '1' : undefined}
                data-klasse={hier ? '1' : undefined}
              >
                <Text size="sm" fw={aktiv ? 800 : 600} lineClamp={1}>
                  {u.name}
                </Text>
                {z && (
                  <Text size="xs" c="dimmed">
                    {z.gesamt} K.
                  </Text>
                )}
                {hier && (
                  <Text size="xs" c="teal" fw={700}>
                    Klasse steht hier
                  </Text>
                )}
              </UnstyledButton>
            )
          })}
        </Group>
      </ScrollArea>
      {gewaehlteUnit && stationen.length > 0 && (
        <Group gap={6} wrap="wrap" data-lehrwerk-stationen>
          <Text size="xs" c="dimmed">
            Bis Station:
          </Text>
          <Chip.Group
            value={wert?.abschnitt ?? 'ganz'}
            onChange={(v) => aendern({ band: band.name, unit: gewaehlteUnit, ...(typeof v === 'string' && v !== 'ganz' ? { abschnitt: v } : {}) })}
          >
            {stationen.map((s) => (
              <Chip key={s} value={s} size="xs" variant="light" data-lehrwerk-station={s}>
                {s}
              </Chip>
            ))}
            <Chip value="ganz" size="xs" variant="light" data-lehrwerk-station="ganz">
              ganze Unit
            </Chip>
          </Chip.Group>
        </Group>
      )}
      {zahlen && (
        <Text size="sm" data-lehrwerk-zahlen>
          {wert ? `Bis hier: ${zahlen.gesamt} Karten` : `Alle: ${zahlen.gesamt} Karten`}
          {zahlen.interview !== undefined ? ` · Interview ${zahlen.interview} · Monolog ${zahlen.monolog ?? 0} · Dialog ${zahlen.dialog ?? 0}` : ''}
        </Text>
      )}
    </Stack>
  )
}
