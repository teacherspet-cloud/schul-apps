import { Alert, Group, MultiSelect, SegmentedControl, Stack, Switch, Text } from '@mantine/core'
import ZahlFeld from '../../../shared/components/ZahlFeld'
import { IconMicrophone } from '@tabler/icons-react'
import {
  MAX_KARTENSAETZE,
  pruefungsdauer,
  sprechLand,
  sprechSetupFuer,
  SPRECH_MATERIALIEN,
  type SprechMaterial,
  type SprechSetup
} from '../../../shared/sprechen/laender'
import { sprechKompetenzen } from '../../../shared/sprechen/kompetenzen'
import { STATES } from '../../arbeitsblatt/didactics/states'
import { stageForGrade } from '../../arbeitsblatt/didactics/profile'
import type { Exam, ExamPart } from '../model/types'

/**
 * Einstellungen der Sprechprüfung im Rahmen der Arbeit (01.10.2026): Gruppengröße, Kartensätze,
 * Ersatz einer schriftlichen Arbeit, Zeiten und Material – voreingestellt nach dem Land
 * (shared/sprechen/laender.ts). Erzeugt wird in generation/sprechpruefung.ts.
 */
export default function SprechpruefungKarte({ exam, part, setzen }: { exam: Exam; part: ExamPart; setzen: (s: SprechSetup) => void }): React.JSX.Element {
  const m = exam.meta
  const land = sprechLand(m.stateId)
  const sek2 = stageForGrade(m.grade, m.schoolTypeId) === 'sek2'
  const setup: SprechSetup = {
    ...sprechSetupFuer(m.stateId, m.grade, sek2),
    ...part.sprechen
  }
  const k = sprechKompetenzen(m.stateId, m.schoolTypeId, m.grade)
  const ersatz = sek2 ? land.ersatzSek2 : land.ersatzSek1
  const landName = STATES.find((s) => s.id === m.stateId)?.name ?? m.stateId
  const neu = (p: Partial<SprechSetup>): void => setzen({ ...setup, ...p })
  const minuten = (label: string, wert: number, feld: keyof SprechSetup, max = 30): React.JSX.Element => (
    <ZahlFeld
      size="xs"
      w={120}
      label={label}
      min={0}
      max={max}
      value={wert}
      onChange={(v) => neu({ [feld]: Math.max(0, Number(v) || 0) } as Partial<SprechSetup>)}
    />
  )
  return (
    <Stack gap="xs" mt="xs" data-testid="sprechpruefung-einstellungen">
      <Group gap={6}>
        <IconMicrophone size={16} />
        <Text size="sm" fw={600}>
          Sprechprüfung
        </Text>
        <Text size="xs" c="dimmed">
          {k.monolog} · {k.dialog}
        </Text>
      </Group>
      <Group align="flex-end" gap="sm">
        <div>
          <Text size="xs" fw={500} mb={2}>
            Gruppengröße
          </Text>
          <SegmentedControl
            size="xs"
            aria-label="Gruppengröße"
            data={[
              { value: '2', label: 'Paare' },
              { value: '3', label: 'Dreiergruppen' }
            ]}
            value={String(setup.gruppe)}
            onChange={(v) => neu({ gruppe: v === '3' ? 3 : 2 })}
          />
        </div>
        <ZahlFeld
          size="xs"
          w={150}
          label="Kartensätze"
          description="gleichwertig, reihum"
          min={1}
          max={MAX_KARTENSAETZE}
          value={setup.kartensaetze}
          onChange={(v) =>
            neu({
              kartensaetze: Math.min(MAX_KARTENSAETZE, Math.max(1, Number(v) || 1))
            })
          }
        />
      </Group>
      <Group gap="sm">
        {minuten('Vorbereitung (min)', setup.vorbereitung, 'vorbereitung')}
        {minuten('Einstieg (min)', setup.aufwaermen, 'aufwaermen', 10)}
        {minuten('Monolog je Prüfling (min)', setup.monolog, 'monolog', 15)}
        {minuten('Gespräch (min)', setup.dialog, 'dialog')}
      </Group>
      <Text size="xs" c="dimmed">
        Prüfungszeit je Gruppe: {pruefungsdauer(setup)} Minuten (ohne Vorbereitung und Beratung).
      </Text>
      <MultiSelect
        size="xs"
        label="Material auf den Karten"
        data={SPRECH_MATERIALIEN}
        value={setup.material}
        onChange={(v) => neu({ material: (v.length ? v : ['situation']) as SprechMaterial[] })}
      />
      <Switch
        size="sm"
        label="Ersetzt eine schriftliche Klassenarbeit"
        description={`${landName}: ${land.regel}`}
        checked={setup.ersetztArbeit}
        onChange={(e) => neu({ ersetztArbeit: e.currentTarget.checked })}
      />
      {setup.ersetztArbeit && ersatz === 'nein' && (
        <Alert color="orange" p="xs">
          <Text size="xs">Für {landName} ist in dieser Stufe kein Ersatz einer schriftlichen Arbeit durch eine Sprechprüfung belegt.</Text>
        </Alert>
      )}
      {land.unsicher.length > 0 && (
        <Text size="xs" c="dimmed">
          Hinweis: {land.unsicher.join(' ')}
        </Text>
      )}
    </Stack>
  )
}
