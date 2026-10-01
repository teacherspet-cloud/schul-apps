import { Badge, Button, Card, Group, Popover, Select, Stack, Text } from '@mantine/core'
import ZahlFeld from '../../../shared/components/ZahlFeld'
import { IconAdjustments, IconSchool } from '@tabler/icons-react'
import type { LearnerProfile } from '../didactics/profile'
import MehrText from '../../../shared/components/MehrText'
import type { WorksheetMeta } from '../model/types'

/**
 * Zeigt, wie Jahrgang, Schulform und Bundesland das Arbeitsblatt steuern; Werte sind überschreibbar.
 *
 * Seit Paket 7 (Wunsch der Lehrkraft) steht die Karte unter „Weitere Optionen“ und ist ruhiger
 * gestaltet: statt einer grünen Vollfläche mit langer Aufzählung vier Zeilen mit kurzen Kennwerten
 * (Lerngruppe · Anforderungen · Schrift & Satz · Aufgaben & Hilfen). Inhaltlich dieselben Angaben;
 * Orientierung und Grundlagen stehen hinter „Mehr“. Von Hand geänderte Werte sind markiert.
 */
export function ProfileCard({
  profile,
  meta,
  onOverrides
}: {
  profile: LearnerProfile
  meta: WorksheetMeta
  onOverrides: (o: WorksheetMeta['overrides']) => void
}): React.JSX.Element {
  const o = meta.overrides
  const customized = Boolean(o.afbMix || o.fontPt || o.scaffolding)
  return (
    <Card withBorder padding="md" className="profil-karte" data-testid="profil-karte">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Group gap={8} wrap="nowrap">
          <IconSchool size={20} className="profil-karte-symbol" />
          <Text fw={600}>So wird das Arbeitsblatt angepasst</Text>
          {customized && (
            <Badge size="sm" variant="light" color="orange">
              angepasst
            </Badge>
          )}
        </Group>
        <Popover width={320} position="bottom-end" shadow="md" withArrow>
          <Popover.Target>
            <Button size="xs" variant="default" leftSection={<IconAdjustments size={14} />}>
              Anpassen
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                Anforderungsbereiche (%)
              </Text>
              <Group grow>
                <ZahlFeld
                  size="xs"
                  label="AFB I"
                  min={0}
                  max={100}
                  value={profile.afbMix.I}
                  onChange={(v) => onOverrides({ ...o, afbMix: { I: Number(v) || 0, II: 0, III: profile.afbMix.III } })}
                />
                <ZahlFeld size="xs" label="AFB II" value={profile.afbMix.II} disabled />
                <ZahlFeld
                  size="xs"
                  label="AFB III"
                  min={0}
                  max={100}
                  value={profile.afbMix.III}
                  onChange={(v) => onOverrides({ ...o, afbMix: { I: profile.afbMix.I, II: 0, III: Number(v) || 0 } })}
                />
              </Group>
              <ZahlFeld
                size="xs"
                label="Schriftgröße (pt)"
                min={9}
                max={22}
                step={0.5}
                decimalScale={1}
                value={profile.typography.fontPt}
                onChange={(v) => onOverrides({ ...o, fontPt: Number(v) || undefined })}
              />
              <Select
                size="xs"
                label="Umfang der Hilfen"
                data={[
                  { value: 'hoch', label: 'umfangreich' },
                  { value: 'mittel', label: 'gezielt' },
                  { value: 'gering', label: 'nur optional' }
                ]}
                value={profile.scaffolding}
                onChange={(v) => v && onOverrides({ ...o, scaffolding: v as 'hoch' | 'mittel' | 'gering' })}
                allowDeselect={false}
              />
              {customized && (
                <Button size="xs" variant="subtle" color="orange" onClick={() => onOverrides({})}>
                  Auf Vorschlag zurücksetzen
                </Button>
              )}
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Group>
      <div className="profil-gruppen">
        {profile.kennwerte.map((g) => (
          <div key={g.titel} className="profil-gruppe">
            <Text size="xs" fw={600} c="dimmed" className="profil-gruppe-titel">
              {g.titel}
            </Text>
            <div>
              <Group gap={6}>
                {g.werte.map((w) => (
                  <Badge
                    key={w.text}
                    size="md"
                    radius="sm"
                    tt="none"
                    fw={500}
                    variant={w.angepasst ? 'light' : 'default'}
                    color={w.angepasst ? 'orange' : undefined}
                    title={w.angepasst ? 'von Hand angepasst' : undefined}
                  >
                    {w.text}
                  </Badge>
                ))}
              </Group>
              {g.hinweis && (
                <Text size="xs" c="dimmed" mt={4}>
                  {g.hinweis}
                </Text>
              )}
            </div>
          </div>
        ))}
      </div>
      {/* Orientierung und Herkunft der Werte hinter „Mehr“ – vollständig, nur kürzer im Formular */}
      <MehrText mt="sm" kurz={profile.orientierung}>
        <Text size="xs" c="dimmed">
          Grundlage: KMK-Bildungsstandards (Anforderungsbereiche, Operatoren), Lesbarkeitsforschung (Schriftgröße, Satzlänge, LIX), Differenzierungs- und
          Sprachbildungsdidaktik. Werte mit Faustregel-Charakter sind als Vorschlag zu verstehen.
        </Text>
      </MehrText>
    </Card>
  )
}
