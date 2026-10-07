import { Alert, Card, Checkbox, Radio, SegmentedControl, SimpleGrid, Stack, Text, Title, Tooltip } from '@mantine/core'
import { NurExperte } from '../../../shared/components/NurExperte'
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react'
import { EBENEN, EINSTUFUNGEN, einstufungGesperrt, einstufungVon, ebeneVon, formenVon, FORMEN } from '../art'
import { einstufungsHinweise } from '../laenderRegeln'
import type { EinstufungsArt, EinstufungsEbene, FormArt } from '../model/types'
import { useRueckmeldung } from '../store'

/**
 * Art der Rückmeldung (29.09.2026, Wunsch der Lehrkraft): links unter der Lerngruppe. Zwei
 * Gruppen – Formen (mehrere) und Einstufung (eine oder keine) –, dazu die Ebene der Einstufung,
 * die Elternfassung und die Hinweise des Landes mit Fundstelle.
 */
export default function ArtKarte(): React.JSX.Element | null {
  const { dok: r, update } = useRueckmeldung()
  if (!r) return null
  const formen = formenVon(r.meta)
  const art = einstufungVon(r.meta)
  const hinweise = einstufungsHinweise(r.meta, art)

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
      <Title order={4} mb="sm">
        Art der Rückmeldung
      </Title>
      <Stack gap="md">
        <div>
          <Text size="sm" fw={600} mb={4}>
            Form (mehrere möglich)
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={6} verticalSpacing={6}>
            {FORMEN.map((f) => (
              <Checkbox
                key={f.id}
                checked={formen.includes(f.id)}
                onChange={(e) => setzeForm(f.id, e.currentTarget.checked)}
                label={f.label}
                description={f.beschreibung}
                data-form={f.id}
              />
            ))}
          </SimpleGrid>
        </div>
        <div>
          <Text size="sm" fw={600} mb={4}>
            Einstufung (eine oder keine)
          </Text>
          <Radio.Group value={art} onChange={(v) => update((d) => (d.meta.einstufung = v as EinstufungsArt))}>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={6} verticalSpacing={6}>
              {EINSTUFUNGEN.map((e) => {
                const gesperrt = einstufungGesperrt(e.id, r.meta)
                const knopf = (
                  <Radio value={e.id} label={e.label} description={e.beispiel} disabled={Boolean(gesperrt) && art !== e.id} data-einstufung={e.id} />
                )
                return gesperrt ? (
                  <Tooltip key={e.id} label={gesperrt} multiline w={260}>
                    <div>{knopf}</div>
                  </Tooltip>
                ) : (
                  <div key={e.id}>{knopf}</div>
                )
              })}
            </SimpleGrid>
          </Radio.Group>
        </div>
        <NurExperte>
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
        </NurExperte>
        <NurExperte geaendert={Boolean(r.meta.elternfassung) && 'Elternfassung'}>
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
        </NurExperte>
        {einstufungGesperrt(art, r.meta) && (
          <Alert color="orange" variant="light" p="xs" icon={<IconAlertTriangle size={16} />}>
            <Text size="xs">{einstufungGesperrt(art, r.meta)}</Text>
          </Alert>
        )}
        {hinweise.map((h, i) => (
          <Alert
            key={i}
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
      </Stack>
    </Card>
  )
}
