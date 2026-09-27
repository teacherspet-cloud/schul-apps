import { Button, Checkbox, Group, Select } from '@mantine/core'
import { useMaskottchen } from '../../../shared/maskottchenStore'
import { illustrationenVorschlag, platziereIllustrationen } from '../generation/illustrationen'
import type { Worksheet } from '../model/types'

/**
 * Blattoption „Illustrationen (Maskottchen)" – aus der Werkzeugleiste des Arbeitsblatts
 * herausgelöst (27.09.2026), als die Leiste für alle Programme gemeinsam wurde
 * (shared/components/EditorLeiste.tsx). Nur das Arbeitsblatt setzt Figuren an Bausteine.
 */
export default function IllustrationenOption({ ws, update }: { ws: Worksheet; update: (fn: (w: Worksheet) => void) => void }): React.JSX.Element | null {
  const maskottchenListe = useMaskottchen((s) => s.liste)
  if (!maskottchenListe.length) return null
  const an = ws.meta.illustrationen?.an ?? illustrationenVorschlag(ws.meta.grade)
  return (
    <>
      <Checkbox
        size="sm"
        label="Illustrationen (Maskottchen)"
        description={`Figuren an Kästen, Aufgaben und am Anfang/Ende – ${illustrationenVorschlag(ws.meta.grade) ? 'für diesen Jahrgang vorgesehen' : 'für diesen Jahrgang nicht vorgesehen, hier einschaltbar'}`}
        checked={an}
        onChange={(e) => {
          const neu = e.currentTarget.checked
          update((w) => (w.meta.illustrationen = { ...w.meta.illustrationen, an: neu }))
          if (!neu) update((w) => w.sheets.forEach((s) => s.blocks.forEach((b) => delete b.illustration)))
        }}
      />
      {an && (
        <Group gap="xs">
          {maskottchenListe.length > 1 && (
            <Select
              size="xs"
              data={maskottchenListe.map((m) => ({ value: m.id, label: m.name }))}
              value={ws.meta.illustrationen?.maskottchenId ?? maskottchenListe[0].id}
              onChange={(v) => v && update((w) => (w.meta.illustrationen = { ...w.meta.illustrationen, maskottchenId: v }))}
              allowDeselect={false}
              w={180}
            />
          )}
          <Button
            size="compact-xs"
            variant="light"
            onClick={() =>
              void platziereIllustrationen({ ...ws, meta: { ...ws.meta, illustrationen: { ...ws.meta.illustrationen, an: true } } }).then((neu) =>
                update((w) => {
                  w.sheets = neu.sheets
                })
              )
            }
          >
            Figuren neu setzen
          </Button>
        </Group>
      )}
    </>
  )
}
