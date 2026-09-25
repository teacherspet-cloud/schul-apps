import { Alert, Badge, Button, CloseButton, Group, List, Text } from '@mantine/core'
import { IconFileAlert } from '@tabler/icons-react'
import type { SeitenAbweichung } from '../didactics/seiten'
import type { SeitenVorschlag } from '../model/types'

/** Was sich mit einem Klick umsetzen lässt – und womit */
export type SeitenAktion = (v: SeitenVorschlag) => void

/**
 * Hinweis im Editor, wenn das Blatt von der Seitenvorgabe abweicht (Paket 7, Wunsch der
 * Lehrkraft): „3 statt 2 Seiten – Grund: …" und Vorschläge, die dem Lernziel dienen.
 *
 * Vorher stand eine Abweichung höchstens im Lehrkraft-Hinweis auf dem Blatt – und nur, wenn
 * die KI sie selbst erwähnte. Jetzt zählt die App die Seiten selbst (nur Aufgaben und
 * Material, didactics/seiten.ts). Umsetzbare Vorschläge haben „Übernehmen" und laufen über
 * die vorhandenen Wege (Baustein überarbeiten, Aufgabe ergänzen – als Hintergrund-Auftrag,
 * Hilfen auf Hilfekarten – lokal, mit Strg+Z). Die übrigen bleiben erkennbar Vorschläge.
 */
export default function SeitenHinweis({
  abweichung: a,
  umsetzbar,
  onUebernehmen,
  onAusblenden
}: {
  abweichung: SeitenAbweichung
  /** Lässt sich dieser Vorschlag mit einem Klick umsetzen? */
  umsetzbar: (v: SeitenVorschlag) => boolean
  onUebernehmen: SeitenAktion
  onAusblenden: () => void
}): React.JSX.Element {
  const ziel = a.vorgabe.max > a.vorgabe.min ? `${a.vorgabe.min}–${a.vorgabe.max}` : String(a.vorgabe.min)
  const titel = `${a.gezaehlt} statt ${ziel} ${a.vorgabe.max === 1 ? 'Seite' : 'Seiten'}`
  return (
    <Alert
      color="yellow"
      icon={<IconFileAlert size={18} />}
      w="100%"
      maw={820}
      data-testid="seiten-hinweis-editor"
      title={
        <Group justify="space-between" wrap="nowrap" w="100%">
          <span>{titel}</span>
          <CloseButton size="sm" aria-label="Hinweis zur Seitenzahl ausblenden" onClick={onAusblenden} />
        </Group>
      }
      styles={{ label: { width: '100%' } }}
    >
      <Text size="sm">
        {a.grund ? `Grund: ${a.grund}` : 'Einen Grund hat die KI nicht genannt.'} Gezählt werden nur Aufgaben- und Materialseiten, nicht Hilfekarten, Lösungen
        oder Tafelbild.
      </Text>
      <Text size="sm" fw={600} mt="xs">
        {a.richtung === 'weniger' ? 'So ließe sich die Seitenzahl verringern:' : 'So ließe sich das Blatt sinnvoll ergänzen:'}
      </Text>
      <List size="sm" spacing={4} mt={4}>
        {a.vorschlaege.map((v, i) => (
          <List.Item key={i}>
            <Group gap="xs" wrap="nowrap" align="center">
              <Text size="sm" style={{ flex: 1 }}>
                {v.text}{' '}
                {v.lokal && (
                  <Badge size="xs" variant="light" color="gray" tt="none" title="Faustregel der App – die KI hat keinen passenden Vorschlag geliefert">
                    Vorschlag der App
                  </Badge>
                )}
              </Text>
              {umsetzbar(v) && (
                <Button size="compact-xs" variant="light" onClick={() => onUebernehmen(v)}>
                  Übernehmen
                </Button>
              )}
            </Group>
          </List.Item>
        ))}
      </List>
    </Alert>
  )
}
