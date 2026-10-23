import { Alert, Button, Card, Checkbox, Collapse, Group, SegmentedControl, Select, SimpleGrid, Stack, Text } from '@mantine/core'
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react'
import { useState } from 'react'
import { useExperte } from '../../../shared/settingsStore'
import { EBENEN, EINSTUFUNGEN, einstufungGesperrt, einstufungVon, ebeneVon, formenVon, FORMEN } from '../art'
import { einstufungsHinweise } from '../laenderRegeln'
import type { EinstufungsArt, EinstufungsEbene, FormArt, RueckmeldungMeta } from '../model/types'
import { useRueckmeldung } from '../store'

/** „Schriftlich + Verbesserungstipps · ohne Note" – die Zeile der zugeklappten Karte */
export function artZusammenfassung(m: RueckmeldungMeta): string {
  const formen = formenVon(m).map((f) => FORMEN.find((x) => x.id === f)?.label ?? f)
  const art = einstufungVon(m)
  return `${formen.join(' + ')} · ${art === 'keine' ? 'ohne Note' : (EINSTUFUNGEN.find((e) => e.id === art)?.label ?? art)}`
}

/**
 * Art der Rückmeldung (29.09.2026, Wunsch der Lehrkraft): Formen (mehrere) und Einstufung (eine
 * oder keine), dazu die Ebene der Einstufung, die Elternfassung und die Hinweise des Landes.
 *
 * Neu gestaltet (23.10.2026, Multiple Choice): zugeklappt nur eine Zeile „Schriftlich + Tipps ·
 * ohne Note" mit „Ändern"; aufgeklappt die Formen als Kacheln und die Einstufung als
 * Auswahlliste. Hinweise des Landes stehen zugeklappt nur, wenn sie warnen.
 */
export default function ArtKarte(): React.JSX.Element | null {
  const { dok: r, update } = useRueckmeldung()
  // Im Expertenmodus gleich offen – dort steht alles da
  const [offen, setOffen] = useState(useExperte())
  if (!r) return null
  const formen = formenVon(r.meta)
  const art = einstufungVon(r.meta)
  const hinweise = einstufungsHinweise(r.meta, art)
  const gesperrt = einstufungGesperrt(art, r.meta)

  const setzeForm = (f: FormArt, an: boolean): void =>
    update((d) => {
      const alt = formenVon(d.meta)
      const neu = an ? [...alt.filter((x) => x !== f), f] : alt.filter((x) => x !== f)
      // Mindestens eine Form bleibt – sonst gäbe es nichts zurückzumelden
      d.meta.formen = FORMEN.map((x) => x.id).filter((id) => neu.includes(id))
      if (!d.meta.formen.length) d.meta.formen = ['schriftlich']
    })

  return (
    <Card withBorder data-rm-art>
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <div style={{ minWidth: 0 }}>
          <Text fw={600}>Art der Rückmeldung</Text>
          <Text size="sm" c="dimmed" data-rm-art-zeile>
            {artZusammenfassung(r.meta)}
          </Text>
        </div>
        <Button variant="light" size="xs" onClick={() => setOffen((o) => !o)} aria-expanded={offen} data-rm-art-aendern>
          {offen ? 'Fertig' : 'Ändern'}
        </Button>
      </Group>
      {gesperrt && (
        <Alert color="orange" variant="light" p="xs" mt="sm" icon={<IconAlertTriangle size={16} />}>
          <Text size="xs">{gesperrt}</Text>
        </Alert>
      )}
      {hinweise
        .filter((h) => offen || h.warnung)
        .map((h, i) => (
          <Alert
            key={i}
            mt="sm"
            variant="light"
            color={h.warnung ? 'orange' : 'gray'}
            icon={h.warnung ? <IconAlertTriangle size={16} /> : <IconInfoCircle size={16} />}
            p="xs"
            data-rm-landeshinweis
          >
            <Text size="xs">{h.text}</Text>
            {h.quelle && (
              <Text size="xs" c="dimmed" mt={2}>
                Fundstelle: {h.quelle}
              </Text>
            )}
          </Alert>
        ))}
      <Collapse expanded={offen}>
        <Stack gap="md" mt="md">
          <div>
            <Text size="sm" fw={600} mb={6}>
              Form (mehrere möglich)
            </Text>
            <SimpleGrid cols={{ base: 1, xs: 2, lg: 3 }} spacing={8} verticalSpacing={8}>
              {FORMEN.map((f) => (
                <Checkbox.Card
                  key={f.id}
                  className="rm-kachel"
                  checked={formen.includes(f.id)}
                  onClick={() => setzeForm(f.id, !formen.includes(f.id))}
                  data-form={f.id}
                >
                  <Group wrap="nowrap" align="flex-start" gap="sm">
                    <Checkbox.Indicator mt={2} />
                    <div>
                      <Text size="sm" fw={600}>
                        {f.label}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {f.beschreibung}
                      </Text>
                    </div>
                  </Group>
                </Checkbox.Card>
              ))}
            </SimpleGrid>
          </div>
          <Select
            label="Einstufung"
            maw={360}
            data={EINSTUFUNGEN.map((e) => ({ value: e.id, label: e.label, disabled: Boolean(einstufungGesperrt(e.id, r.meta)) && art !== e.id }))}
            value={art}
            onChange={(v) => v && update((d) => (d.meta.einstufung = v as EinstufungsArt))}
            allowDeselect={false}
            // Gesperrte Stufen nennen ihren Grund gleich in der Liste (vorher im Tooltip)
            renderOption={({ option }) => {
              const sperre = einstufungGesperrt(option.value as EinstufungsArt, r.meta)
              return (
                <div data-einstufung={option.value}>
                  <Text size="sm">{option.label}</Text>
                  <Text size="xs" c="dimmed">
                    {sperre && art !== option.value ? sperre : EINSTUFUNGEN.find((x) => x.id === option.value)?.beispiel}
                  </Text>
                </div>
              )
            }}
            data-rm-einstufung
          />
          {art !== 'keine' && (
            <div>
              <Text size="sm" fw={600} mb={4}>
                Einstufung gilt für
              </Text>
              <SegmentedControl size="xs" data={EBENEN} value={ebeneVon(r.meta)} onChange={(v) => update((d) => (d.meta.ebene = v as EinstufungsEbene))} />
              <Text size="xs" c="dimmed" mt={6}>
                Die KI schlägt nur vor (mit Begründung); die Einstufung wird vor dem Export bestätigt. Noten folgen dem Notenschlüssel aus den Einstellungen.
              </Text>
            </div>
          )}
          <Checkbox
            checked={Boolean(r.meta.elternfassung)}
            onChange={(e) => {
              const an = e.currentTarget.checked
              update((d) => (d.meta.elternfassung = an))
            }}
            label="Elternfassung"
            description="Kurze Fassung in einfacher Sprache für die Eltern, übersetzbar in die Familiensprache"
            data-rm-eltern
          />
        </Stack>
      </Collapse>
    </Card>
  )
}
