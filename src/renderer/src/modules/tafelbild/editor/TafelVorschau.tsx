import { Stack, Text } from '@mantine/core'
import { useMemo } from 'react'
import type { Zwischenstand } from '../../../shared/zwischenstand'
import { formatInfo } from '../formate'
import type { Tafelbild } from '../model'
import { tafelSvg } from '../svg'

/**
 * Live-Vorschau eines entstehenden Tafelbilds (02.10.2026, shared/zwischenstand.ts): jede
 * gewählte Fläche als Bild, nur zum Ansehen. Neue und geänderte Elemente des letzten Schritts
 * tragen die Markierung der Zeichenfläche (`markiert`). Das SVG baut die App selbst; alle Texte
 * darin sind maskiert (svg.ts `esc`).
 */
export function TafelVorschau({ z }: { z: Zwischenstand }): React.JSX.Element | null {
  const t = z.stand as Tafelbild
  const bilder = useMemo(() => t.tafeln.map((tafel) => ({ format: tafel.format, svg: tafelSvg(tafel, { markiert: z.markiert }) })), [t, z.markiert])
  if (!bilder.length) return null
  return (
    <Stack gap="lg" maw={1100} mx="auto" data-live-vorschau>
      {bilder.map((b) => (
        <div key={b.format}>
          {bilder.length > 1 && (
            <Text size="sm" fw={600} c="dimmed" mb={4}>
              {formatInfo(b.format).label}
            </Text>
          )}
          <div key={z.nr} className="ws-live-neu tb-live-tafel" style={{ lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: b.svg }} />
        </div>
      ))}
    </Stack>
  )
}
