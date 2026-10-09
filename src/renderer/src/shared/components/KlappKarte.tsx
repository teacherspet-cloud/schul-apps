/**
 * Einklappbare Karte (09.10.2026, Einstellungen › KI-Zugang und › Bilder und Hörtexte): Kopf mit Titel und einer
 * Statuszeile („Claude · Abo eingerichtet"), Inhalt erst beim Aufklappen (die Karten fragen dann erst ihre Dienste
 * ab). Eingeklappt ist die Vorgabe; offen/zu gilt für die Sitzung (shared/sitzung.ts, 09.10.2026) – in einer neuen
 * Sitzung stehen die Karten wieder eingeklappt.
 *
 * Für die Oberflächentests: `data-klappkarte` (Kennung) und `data-offen` am Rahmen, `data-klappkopf` am Knopf
 * (tests/e2e/warten.mjs › karteAuf/kartenAuf).
 */
import { Badge, Card, Group, Text, Title, UnstyledButton } from '@mantine/core'
import { IconChevronRight } from '@tabler/icons-react'
import { useId, useState } from 'react'
import { KLAPP_SCHLUESSEL, leseOffen } from '@shared/einstellungsStatus'
import { offenLesen, offenMerken } from '../sitzung'

const alleGemerkten = (): Record<string, boolean> => leseOffen(JSON.stringify(offenLesen<unknown>(KLAPP_SCHLUESSEL) ?? null))

function gemerkt(id: string): boolean | undefined {
  return alleGemerkten()[id]
}

function merke(id: string, offen: boolean): void {
  offenMerken(KLAPP_SCHLUESSEL, { ...alleGemerkten(), [id]: offen })
}

export interface KlappKarteProps {
  /** Kennung zum Merken (je Sitzung) */
  id: string
  titel: React.ReactNode
  /** Kurze Zusammenfassung im Kopf */
  status?: React.ReactNode
  /** Kopf hervorheben (z. B. Limit erreicht, nicht eingerichtet) */
  ton?: 'ok' | 'warnung' | 'neutral'
  standardOffen?: boolean
  children: React.ReactNode
  /** Weitere Attribute für den Rahmen (data-… der Tests) */
  rahmen?: Record<string, string | boolean | undefined>
}

export function KlappKarte({ id, titel, status, ton = 'neutral', standardOffen = false, children, rahmen }: KlappKarteProps): React.JSX.Element {
  const [offen, setOffen] = useState(() => gemerkt(id) ?? standardOffen)
  const inhalt = useId()
  const umschalten = (): void => {
    setOffen((o) => {
      merke(id, !o)
      return !o
    })
  }
  return (
    <Card withBorder padding="lg" data-klappkarte={id} data-offen={offen ? 'true' : 'false'} {...rahmen}>
      <UnstyledButton onClick={umschalten} aria-expanded={offen} aria-controls={inhalt} data-klappkopf={id} style={{ display: 'block', width: '100%' }}>
        <Group gap="sm" wrap="nowrap" justify="space-between">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <IconChevronRight
              size={18}
              aria-hidden
              style={{ flexShrink: 0, transition: 'transform 150ms ease', transform: offen ? 'rotate(90deg)' : 'none', color: 'var(--mantine-color-dimmed)' }}
            />
            <Title order={4} style={{ whiteSpace: 'nowrap' }}>
              {titel}
            </Title>
          </Group>
          {status &&
            (ton === 'neutral' ? (
              <Text size="sm" c="dimmed" ta="right" lineClamp={1} data-klappstatus>
                {status}
              </Text>
            ) : (
              <Badge variant="light" color={ton === 'ok' ? 'teal' : 'orange'} style={{ textTransform: 'none', maxWidth: '60%' }} data-klappstatus>
                {status}
              </Badge>
            ))}
        </Group>
      </UnstyledButton>
      {offen && (
        <div id={inhalt} style={{ marginTop: 'var(--mantine-spacing-md)' }}>
          {children}
        </div>
      )}
    </Card>
  )
}
