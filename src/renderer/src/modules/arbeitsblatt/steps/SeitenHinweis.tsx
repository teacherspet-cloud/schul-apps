import { Alert, Badge, CloseButton, Group, List, Text } from '@mantine/core'
import { IconFileAlert, IconWand } from '@tabler/icons-react'
import KreismenueKnopf from '../../../shared/components/Kreismenue'
import type { SeitenAbweichung } from '../didactics/seiten'
import { vorschlagKurz } from '../didactics/seitenAktionen'
import type { SeitenVorschlag } from '../model/types'

/** Setzt die gewählten Vorschläge um (lokale in EINEM Rückgängig-Schritt, KI-Vorschläge als Aufträge) */
export type SeitenAktion = (v: SeitenVorschlag[]) => void

/**
 * Hinweis im Editor, wenn das Blatt von der Seitenvorgabe abweicht (Paket 7, Wunsch der
 * Lehrkraft): „3 statt 2 Seiten – Grund: …" und Vorschläge, die dem Lernziel dienen.
 *
 * Vorher stand eine Abweichung höchstens im Lehrkraft-Hinweis auf dem Blatt – und nur, wenn
 * die KI sie selbst erwähnte. Jetzt zählt die App die Seiten selbst (nur Aufgaben und
 * Material, didactics/seiten.ts).
 *
 * „Vorschlag der App umsetzen" (Wunsch der Lehrkraft, 30.09.2026): EIN Knopf unter der Liste.
 * Mit einem umsetzbaren Vorschlag setzt ein Klick ihn um; mit mehreren öffnet derselbe Knopf ein
 * Kreismenü zur Auswahl. Lokale Vorschläge (Hilfekarten, Schreibraum, Bilder) wirken sofort als
 * ein Schritt mit Strg+Z, inhaltliche laufen als Hintergrund-Auftrag der KI. Danach misst die App
 * neu und der Hinweis passt sich an (oder verschwindet). Nicht Umsetzbares bleibt reiner Text.
 */
export default function SeitenHinweis({
  abweichung: a,
  umsetzbar,
  onUmsetzen,
  onAusblenden
}: {
  abweichung: SeitenAbweichung
  /** Lässt sich dieser Vorschlag mit einem Klick umsetzen? */
  umsetzbar: (v: SeitenVorschlag) => boolean
  onUmsetzen: SeitenAktion
  onAusblenden: () => void
}): React.JSX.Element {
  const ziel = a.vorgabe.max > a.vorgabe.min ? `${a.vorgabe.min}–${a.vorgabe.max}` : String(a.vorgabe.min)
  const titel = `${a.gezaehlt} statt ${ziel} ${a.vorgabe.max === 1 ? 'Seite' : 'Seiten'}`
  const machbar = a.vorschlaege.map((v, i) => ({ v, id: String(i) })).filter(({ v }) => umsetzbar(v))
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
            <Text size="sm">
              {v.text}{' '}
              {v.lokal && (
                <Badge size="xs" variant="light" color="gray" tt="none" title="Faustregel der App – nicht von der KI">
                  Faustregel der App
                </Badge>
              )}
            </Text>
          </List.Item>
        ))}
      </List>
      {machbar.length > 0 && (
        <Group mt="sm" gap="xs">
          <KreismenueKnopf
            testId="vorschlag-umsetzen"
            knopf={{ leftSection: <IconWand size={14} /> }}
            eintraege={machbar.map(({ v, id }) => ({ id, label: vorschlagKurz(v), titel: v.text }))}
            onUmsetzen={(ids) => onUmsetzen(machbar.filter((m) => ids.includes(m.id)).map((m) => m.v))}
          >
            {machbar.length === 1 ? 'Vorschlag der App umsetzen' : `Vorschlag der App umsetzen (${machbar.length} zur Wahl)`}
          </KreismenueKnopf>
          {machbar.length === 1 && (
            <Text size="xs" c="dimmed">
              {vorschlagKurz(machbar[0].v)}
            </Text>
          )}
        </Group>
      )}
    </Alert>
  )
}
