import { Group, NumberInput, SegmentedControl, Text } from '@mantine/core'
import { seitenArt, seitenSchaetzung, seitenText, seitenVorgabe } from '../didactics/seiten'
import type { WorksheetMeta } from '../model/types'

/**
 * Seitenzahl: automatisch, genau oder von–bis (Paket 7, Wunsch der Lehrkraft).
 *
 * Standard ist „automatisch" – die KI legt die Seitenzahl selbst fest, wie bei der Zahl der
 * Aufgaben. Wer umschaltet, startet mit der Schätzung, damit das Feld nicht leer dasteht.
 */
export default function SeitenWahl({ meta, patch }: { meta: WorksheetMeta; patch: (p: Partial<WorksheetMeta>) => void }): React.JSX.Element {
  const art = seitenArt(meta)
  const vorgabe = seitenVorgabe(meta)
  const schaetzung = seitenSchaetzung(meta)
  const setArt = (neu: string): void => {
    const von = vorgabe?.min ?? schaetzung
    if (neu === 'auto') patch({ pages: 0, pagesBis: undefined })
    else if (neu === 'genau') patch({ pages: von, pagesBis: undefined })
    else patch({ pages: von, pagesBis: Math.max(von + 1, vorgabe?.max ?? 0) })
  }
  const zahl = (v: string | number): number => Math.max(1, Math.min(8, Math.round(Number(v) || 1)))
  return (
    <div>
      <Text size="sm" fw={500} mb={4} id="seiten-wahl-label">
        Seiten
      </Text>
      <Group gap="sm" align="center" wrap="wrap">
        <SegmentedControl
          size="sm"
          aria-labelledby="seiten-wahl-label"
          data={[
            { value: 'auto', label: 'automatisch' },
            { value: 'genau', label: 'genau' },
            { value: 'spanne', label: 'von–bis' }
          ]}
          value={art}
          onChange={setArt}
        />
        {vorgabe && (
          <Group gap={6} align="center" wrap="nowrap">
            <NumberInput
              aria-label={art === 'spanne' ? 'Seiten von' : 'Seitenzahl'}
              w={70}
              min={1}
              max={8}
              value={vorgabe.min}
              onChange={(v) => {
                const min = zahl(v)
                patch(art === 'spanne' ? { pages: min, pagesBis: Math.max(min + 1, vorgabe.max) } : { pages: min })
              }}
            />
            {art === 'spanne' && (
              <>
                <Text size="sm">bis</Text>
                <NumberInput
                  aria-label="Seiten bis"
                  w={70}
                  min={2}
                  max={8}
                  value={vorgabe.max}
                  onChange={(v) => {
                    const max = zahl(v)
                    patch({ pagesBis: max, pages: Math.min(vorgabe.min, max - 1) || 1 })
                  }}
                />
              </>
            )}
          </Group>
        )}
      </Group>
      <Text size="xs" c="dimmed" mt={4} data-testid="seiten-hinweis">
        {art === 'auto'
          ? `Die KI legt die Seitenzahl selbst fest – nach Jahrgang, Bearbeitungszeit und Aufgaben (Richtwert ${seitenText(meta)}).`
          : art === 'spanne'
            ? `Zwischen ${vorgabe!.min} und ${vorgabe!.max} Seiten, nach Bedarf des Materials. Gezählt werden nur Aufgaben und Material – Hilfekarten, Lösungen und Tafelbild nicht.`
            : 'Richtwert: Verlangt das Material es, darf das Blatt eine Seite mehr oder weniger haben – der Editor nennt dann Grund und Vorschläge. Hilfekarten, Lösungen und Tafelbild zählen nicht mit.'}
      </Text>
    </div>
  )
}
