import { ActionIcon, Button, Card, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconPlus, IconRestore, IconX } from '@tabler/icons-react'
import { useState } from 'react'
import type { AppSettings } from '@shared/types'
import { STANDARD_ZEICHEN, ZEICHEN_GRUPPEN, type Korrekturzeichen, type ZeichenGruppe } from '../shared/korrekturzeichen'

/**
 * Korrekturzeichen je Fachgruppe (29.09.2026): Voreinstellung mit den verbreiteten Zeichen,
 * anpassbar an die Festlegungen der Fachkonferenz. Die Rückmeldung (Korrekturrand, Kommentare
 * am Scan) benutzt nur Zeichen aus dieser Liste und druckt eine Legende.
 */
export default function KorrekturzeichenSettings({ settings, update }: { settings: AppSettings; update: (patch: Partial<AppSettings>) => void }): React.JSX.Element {
  const [gruppe, setGruppe] = useState<ZeichenGruppe>('deutsch')
  const eigen = settings.korrekturzeichen?.[gruppe]
  const liste: Korrekturzeichen[] = eigen?.length ? eigen : STANDARD_ZEICHEN[gruppe]
  const setze = (neu: Korrekturzeichen[]): void => update({ korrekturzeichen: { ...(settings.korrekturzeichen ?? {}), [gruppe]: neu } })
  const aendere = (i: number, feld: keyof Korrekturzeichen, wert: string): void => setze(liste.map((z, k) => (k === i ? { ...z, [feld]: wert } : z)))

  return (
    <Card withBorder padding="lg" data-korrekturzeichen>
      <Title order={4} mb={4}>
        Korrekturzeichen
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        Zeichen für den Korrekturrand der Rückmeldung. Voreingestellt sind die verbreiteten Zeichen; verbindlich ist, was die Fachkonferenz festlegt.
      </Text>
      <Group mb="sm" align="flex-end">
        <Select
          label="Fachgruppe"
          data={ZEICHEN_GRUPPEN.map((g) => ({ value: g.id, label: g.label }))}
          value={gruppe}
          onChange={(v) => v && setGruppe(v as ZeichenGruppe)}
          allowDeselect={false}
          w={320}
        />
        {eigen?.length ? (
          <Button variant="subtle" size="xs" leftSection={<IconRestore size={14} />} onClick={() => setze([])}>
            Voreinstellung wiederherstellen
          </Button>
        ) : (
          <Text size="xs" c="dimmed">
            Voreinstellung
          </Text>
        )}
      </Group>
      <Stack gap={4}>
        {liste.map((z, i) => (
          <Group key={i} gap="xs" wrap="nowrap">
            <TextInput size="xs" w={80} value={z.zeichen} aria-label="Zeichen" onChange={(e) => aendere(i, 'zeichen', e.currentTarget.value)} />
            <TextInput
              size="xs"
              style={{ flex: 1 }}
              value={z.bedeutung}
              aria-label="Bedeutung"
              onChange={(e) => aendere(i, 'bedeutung', e.currentTarget.value)}
            />
            <ActionIcon size="sm" variant="subtle" color="red" aria-label="Zeichen entfernen" onClick={() => setze(liste.filter((_, k) => k !== i))}>
              <IconX size={14} />
            </ActionIcon>
          </Group>
        ))}
        <Button size="compact-xs" variant="subtle" w="fit-content" leftSection={<IconPlus size={12} />} onClick={() => setze([...liste, { zeichen: '', bedeutung: '' }])}>
          Zeichen hinzufügen
        </Button>
      </Stack>
    </Card>
  )
}
