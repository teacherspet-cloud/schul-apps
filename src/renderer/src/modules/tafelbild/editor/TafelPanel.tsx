import { Alert, Badge, Button, Divider, Group, ScrollArea, SegmentedControl, Stack, Switch, Text, TextInput, UnstyledButton } from '@mantine/core'
import { IconAlertTriangle, IconLayoutGrid, IconRefresh } from '@tabler/icons-react'
import { FARB_NAMEN, farbwert, formatInfo, SCHRIFTEN, type Farbe, type Schriftart } from '../formate'
import { STRUKTUR_NAMEN, type Befund, type Tafelbild, type TbTafel } from '../model'

/**
 * Seitenleiste ohne gewähltes Element: Prüfbefunde (anklickbar), Bedeutung der Farben, Schrift,
 * Raster, Layout neu setzen und die Planungshilfe (Aufbau in Schritten).
 */
export default function TafelPanel({
  t,
  tafel,
  befunde,
  waehle,
  setzeLegende,
  setzeTafel,
  neuSetzen
}: {
  t: Tafelbild
  tafel: TbTafel
  befunde: Befund[]
  waehle: (id: string) => void
  setzeLegende: (farbe: Farbe, bedeutung: string) => void
  setzeTafel: (fn: (x: TbTafel) => void) => void
  neuSetzen: () => void
}): React.JSX.Element {
  const f = formatInfo(tafel.format)
  const benutzt = [...new Set(tafel.elemente.map((e) => e.farbe))].filter((c) => c !== 'grund')
  const legende = t.inhalt?.farbLegende ?? []
  const eigene = befunde.filter((b) => !b.format || b.format === tafel.format)
  return (
    <ScrollArea h="100%">
      <Stack gap="sm" p="sm" data-tb-tafelpanel>
        <div>
          <Text fw={600}>{f.label}</Text>
          <Text size="xs" c="dimmed">
            {f.beschreibung}
          </Text>
          {t.inhalt && (
            <Text size="xs" mt={4}>
              Struktur: {STRUKTUR_NAMEN[t.inhalt.struktur]}
              {t.inhalt.strukturGrund ? ` – ${t.inhalt.strukturGrund}` : ''}
            </Text>
          )}
        </div>
        {eigene.length > 0 ? (
          <Alert color="orange" icon={<IconAlertTriangle size={16} />} p="xs" title={`Prüfung: ${eigene.length} Hinweis${eigene.length === 1 ? '' : 'e'}`} data-tb-befunde>
            <Stack gap={4}>
              {eigene.slice(0, 12).map((b, i) =>
                b.element ? (
                  <UnstyledButton key={i} onClick={() => waehle(b.element!)}>
                    <Text size="xs" c={b.schwer ? 'red.8' : undefined}>
                      {b.text}
                    </Text>
                  </UnstyledButton>
                ) : (
                  <Text key={i} size="xs" c={b.schwer ? 'red.8' : undefined}>
                    {b.text}
                  </Text>
                )
              )}
            </Stack>
          </Alert>
        ) : (
          <Badge color="green" variant="light" data-tb-befunde-leer>
            Prüfung ohne Befund
          </Badge>
        )}
        <Divider label="Farben mit fester Bedeutung" labelPosition="left" />
        {benutzt.length === 0 && (
          <Text size="xs" c="dimmed">
            Nur die Grundfarbe.
          </Text>
        )}
        {benutzt.map((c) => (
          <Group key={c} gap={6} wrap="nowrap">
            <span className="tb-farbe" style={{ background: c === 'gelb' && f.medium !== 'kreide' ? '#fff27a' : farbwert(f.medium === 'kreide' ? 'kreide' : 'marker', c), flex: '0 0 26px' }} />
            <TextInput
              size="xs"
              style={{ flex: 1 }}
              aria-label={`Bedeutung ${FARB_NAMEN[f.medium][c]}`}
              placeholder={`${FARB_NAMEN[f.medium][c]} bedeutet …`}
              value={legende.find((l) => l.farbe === c)?.bedeutung ?? ''}
              onChange={(e) => setzeLegende(c, e.currentTarget.value)}
            />
          </Group>
        ))}
        <Divider label="Fläche" labelPosition="left" />
        <SegmentedControl
          size="xs"
          value={tafel.schrift}
          onChange={(v) => setzeTafel((x) => (x.schrift = v as Schriftart))}
          data={(Object.keys(SCHRIFTEN) as Schriftart[]).map((s) => ({ value: s, label: SCHRIFTEN[s].label }))}
        />
        <Switch size="xs" label="Raster anzeigen und einrasten" checked={Boolean(tafel.raster)} onChange={(e) => setzeTafel((x) => (x.raster = e.currentTarget.checked))} />
        {t.inhalt && (
          <Button size="xs" variant="default" leftSection={<IconLayoutGrid size={14} />} onClick={neuSetzen} data-tb-neu-setzen>
            Layout neu setzen (alle Formate)
          </Button>
        )}
        {t.inhalt && t.inhalt.schritte.length > 0 && (
          <>
            <Divider label="Planungshilfe" labelPosition="left" />
            <Stack gap={4}>
              {t.inhalt.schritte.map((s) => (
                <Text key={s.nr} size="xs">
                  <b>{s.nr}.</b> {s.phase}
                  {s.impuls ? ` – ${s.impuls}` : ''}
                </Text>
              ))}
            </Stack>
          </>
        )}
        <Text size="xs" c="dimmed">
          <IconRefresh size={11} /> Doppelklick bzw. Doppeltippen auf einen Text ändert ihn direkt. Entf löscht, Pfeiltasten verschieben.
        </Text>
      </Stack>
    </ScrollArea>
  )
}
