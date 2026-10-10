/**
 * Einklappbarer Abschnitt im Fenster „Achievements" der Lernenden (10.10.2026, Wunsch der Lehrkraft): jeder Bereich
 * (Medaillen, Titel, Jahrestitel, Sammlung, jede Achievement-Gruppe, Platz in der Klasse, Rekorde …) steht zunächst
 * eingeklappt da; der Kopf zeigt eine kurze Zusammenfassung („Kl. 7 (2026/27) · 14 von 42"). Offen/zu gilt für die
 * Sitzung (shared/sitzung.ts) – in einer neuen Sitzung ist wieder alles eingeklappt.
 *
 * Schlanker als die KlappKarte der Lehrkraft-Seiten (Telefon zuerst): kleiner Rand, Zusammenfassung unter dem Titel.
 * Für die Oberflächentests dieselben Merkmale wie dort: `data-klappkarte` + `data-offen` am Rahmen, `data-klappkopf`
 * am Knopf, `data-klappstatus` an der Zusammenfassung (tests/e2e/warten.mjs › kartenAuf).
 */
import { Card, Group, Stack, Text, UnstyledButton } from '@mantine/core'
import { useReducedMotion } from '@mantine/hooks'
import { IconChevronRight } from '@tabler/icons-react'
import { useId, useState } from 'react'
import { offenLesen, offenMerken } from '../../shared/sitzung'

const SCHLUESSEL = 'schulapps.achievements.offen'

const alle = (): Record<string, boolean> => {
  const d = offenLesen<unknown>(SCHLUESSEL)
  return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, boolean>) : {}
}

export function AuszKlapp({
  id,
  titel,
  status,
  symbol,
  children,
  rahmen
}: {
  /** Kennung zum Merken (je Sitzung) */
  id: string
  titel: React.ReactNode
  /** Kurze Zusammenfassung – auch eingeklappt sichtbar */
  status?: React.ReactNode
  symbol?: React.ReactNode
  children: React.ReactNode
  /** Weitere Attribute für den Rahmen (data-… der Tests) */
  rahmen?: Record<string, string | number | boolean | undefined>
}): React.JSX.Element {
  const [offen, setOffen] = useState(() => alle()[id] === true)
  const ruhig = useReducedMotion()
  const inhalt = useId()
  const umschalten = (): void =>
    setOffen((o) => {
      offenMerken(SCHLUESSEL, { ...alle(), [id]: !o })
      return !o
    })
  return (
    <Card withBorder radius="md" padding="sm" data-klappkarte={id} data-offen={offen ? 'true' : 'false'} {...rahmen}>
      <UnstyledButton onClick={umschalten} aria-expanded={offen} aria-controls={inhalt} data-klappkopf={id} style={{ display: 'block', width: '100%', borderRadius: 6 }}>
        <Group gap="sm" wrap="nowrap">
          <IconChevronRight
            size={18}
            aria-hidden
            style={{
              flexShrink: 0,
              transition: ruhig ? undefined : 'transform 150ms ease',
              transform: offen ? 'rotate(90deg)' : 'none',
              color: 'var(--mantine-color-dimmed)'
            }}
          />
          {symbol}
          <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
            <Text fw={800} size="sm">
              {titel}
            </Text>
            {status !== undefined && status !== null && status !== '' && (
              <Text size="xs" c="dimmed" lineClamp={2} data-klappstatus>
                {status}
              </Text>
            )}
          </Stack>
        </Group>
      </UnstyledButton>
      {offen && (
        <div id={inhalt} style={{ marginTop: 'var(--mantine-spacing-sm)' }}>
          {children}
        </div>
      )}
    </Card>
  )
}
