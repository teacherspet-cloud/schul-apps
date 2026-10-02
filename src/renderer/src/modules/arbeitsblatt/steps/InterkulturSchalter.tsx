import { MultiSelect, Stack, Switch, Text } from '@mantine/core'
import { INTERKULTUR_BEREICHE, interkulturHinweis, interkulturMoeglich, interkulturName, type InterkulturBereich, type InterkulturSetup } from '../didactics/interkulturalitaet'

/**
 * Interkultureller Schwerpunkt (02.10.2026) – Zusatzschalter für Arbeitsblatt und Klassenarbeit,
 * dazu die Teilbereiche aus Bildungsstandards und Kerncurricula. Beim eigenen Schwerpunkt
 * „Interkulturelle Kompetenz" (nur Arbeitsblatt) erscheinen nur die Teilbereiche.
 */
export default function InterkulturSchalter({
  meta,
  onChange,
  nurBereiche,
  klassenarbeit
}: {
  meta: { subjectId: string; stateId?: string; grade?: number; interkulturell?: InterkulturSetup }
  onChange: (setup: InterkulturSetup | undefined) => void
  /** Eigener Schwerpunkt gewählt: kein Schalter, nur die Teilbereiche */
  nurBereiche?: boolean
  klassenarbeit?: boolean
}): React.JSX.Element | null {
  if (!interkulturMoeglich(meta.subjectId)) return null
  const setup = meta.interkulturell ?? { aktiv: false, bereiche: [] }
  const zeigeBereiche = nurBereiche || setup.aktiv
  const hinweis = klassenarbeit ? interkulturHinweis({ ...meta, interkulturell: setup }) : ''
  return (
    <Stack gap={6} data-interkultur>
      {!nurBereiche && (
        <Switch
          label="Interkultureller Schwerpunkt"
          description={
            klassenarbeit
              ? `${interkulturName(meta)} integriert in die Teile der Arbeit – bewertet im Inhaltskriterium, nicht als eigene Punkte.`
              : `${interkulturName(meta)} zusätzlich zum gewählten Schwerpunkt – in den Aufgaben, nicht als eigene Aufgabe.`
          }
          checked={setup.aktiv}
          onChange={(e) => onChange(e.currentTarget.checked ? { ...setup, aktiv: true } : setup.bereiche.length ? { ...setup, aktiv: false } : undefined)}
        />
      )}
      {zeigeBereiche && (
        <MultiSelect
          label="Teilbereiche"
          description="Nach KMK und Kerncurricula; leer lassen = alle drei."
          data={INTERKULTUR_BEREICHE.map((b) => ({ value: b.value, label: b.label }))}
          value={setup.bereiche}
          onChange={(v) => onChange({ ...setup, aktiv: nurBereiche ? setup.aktiv : true, bereiche: v as InterkulturBereich[] })}
          placeholder="alle drei"
          clearable
        />
      )}
      {hinweis && (
        <Text size="xs" c="dimmed">
          {hinweis}
        </Text>
      )}
    </Stack>
  )
}
