import { Stack, Text } from '@mantine/core'
import { thresholdsForSubject } from '../../../shared/gradeScale'
import { zeichenFuer } from '../../../shared/korrekturzeichen'
import { useAppSettings } from '../../../shared/settingsStore'
import type { Zwischenstand } from '../../../shared/zwischenstand'
import type { SkalenKontext } from '../art'
import type { Rueckmeldung } from '../model/types'
import Blatt from './Blatt'

/** Zwischenstand der Rückmeldungen: das Dokument und die in diesem Lauf fertigen Abgaben (neueste zuletzt) */
export interface RueckmeldungsStand {
  r: Rueckmeldung
  fertig: string[]
}

/**
 * Live-Vorschau der Rückmeldungen (02.10.2026, shared/zwischenstand.ts): Jeder Bogen erscheint,
 * sobald er geschrieben ist – der neueste oben, mit kurzem Aufleuchten. Gezeigt wird dasselbe
 * Blatt wie im Editor, aber `inert`: nur zum Ansehen, bearbeitet wird nach dem Ablegen.
 */
export function RueckmeldungVorschau({ z }: { z: Zwischenstand }): React.JSX.Element | null {
  const settings = useAppSettings((s) => s.settings)
  const { r, fertig } = z.stand as RueckmeldungsStand
  const abgaben = [...fertig]
    .reverse()
    .map((id) => r.abgaben.find((a) => a.id === id))
    .filter((a) => a?.bogen)
  if (!abgaben.length) return null
  const m = r.meta
  const zeichen = zeichenFuer(m.subjectId, settings)
  const skala: SkalenKontext = { meta: m, schwellen: thresholdsForSubject(settings.gradeScale, m.subjectId) }
  const nichts = (): void => undefined
  return (
    <Stack gap="xl" maw={1100} mx="auto" data-live-vorschau>
      {abgaben.map((a, i) => (
        <div key={i === 0 ? `${a!.id}-${z.nr}` : a!.id} className={i === 0 ? 'ws-live-neu' : undefined} data-live-baustein={a!.id}>
          <Text size="sm" fw={600} c="dimmed" mb={4}>
            {a!.kuerzel}
          </Text>
          <div inert>
            <Blatt r={r} a={a!} docId="" zeichen={zeichen} skala={skala} setzeBogen={nichts} setzeRand={nichts} markerSetzen={false} setMarkerSetzen={nichts} />
          </div>
        </div>
      ))}
    </Stack>
  )
}
