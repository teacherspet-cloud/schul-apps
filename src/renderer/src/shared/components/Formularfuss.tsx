import { Group, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import EinstellungenLink from './EinstellungenLink'

/**
 * Fußleiste eines Formulars mit dem Hauptknopf („Gliederung planen", „Test erstellen", „Weiter").
 *
 * Wunsch der Lehrkraft (Paket 6, 25.09.2026): Der Hauptknopf steht IMMER sichtbar unten, nicht
 * erst nach 20 bis 50 Feldern Scrollen. Ist er gesperrt, steht daneben der Grund – vorher war
 * er nur grau, und niemand wusste, was fehlt (Befund TopicStep.tsx „Sperrgrund fehlt").
 *
 * Die Leiste steht AUSSERHALB des scrollenden Bereichs (Aufbau: `FormularSeite`), damit sie
 * in jedem Browser und im Tablet-Querformat unten bleibt. Den Abstand zur Auftragsleiste unten
 * rechts schafft app.css (`data-auftraege`): Solange Aufträge da sind, endet der Inhalt 60
 * Punkte über dem Rand, die Pille verdeckt den Knopf also nicht.
 */
export default function Formularfuss({
  grund,
  links,
  children
}: {
  /** Warum der Hauptknopf gesperrt ist – leer, wenn nichts fehlt */
  grund?: React.ReactNode
  /** Nebenknöpfe links (z. B. „Zurück") */
  links?: React.ReactNode
  /** Der Hauptknopf (und ggf. ein Nebenknopf direkt davor) */
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="formular-fuss" role="group" aria-label="Formular abschließen">
      <Group justify="space-between" wrap="nowrap" gap="sm" className="formular-fuss-innen">
        <Group gap="sm" wrap="nowrap">
          {links}
        </Group>
        <Group gap="sm" wrap="nowrap" justify="flex-end" style={{ minWidth: 0 }}>
          {grund && (
            <Text size="sm" c="dimmed" className="formular-fuss-grund" data-testid="sperrgrund">
              <IconInfoCircle size={16} style={{ verticalAlign: '-3px', marginRight: 4 }} />
              {grund}
            </Text>
          )}
          {children}
        </Group>
      </Group>
    </div>
  )
}

/**
 * Seite eines Formulars: oben der scrollende Inhalt, unten fest die Fußleiste.
 * `children` ist der scrollende Bereich (meist eine ScrollArea mit `h="100%"`).
 */
export function FormularSeite({ fuss, children }: { fuss: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="formular-seite">
      <div className="formular-inhalt">{children}</div>
      {fuss}
    </div>
  )
}

/** Sperrgrund „Kein KI-Zugang" mit Link zu den Einstellungen */
export function KeinKiZugang(): React.JSX.Element {
  return (
    <>
      Kein KI-Zugang – <EinstellungenLink tab="ki">einrichten</EinstellungenLink>
    </>
  )
}

/**
 * Der erste fehlende Punkt als Sperrgrund – einer reicht, eine Liste wäre im Fuß zu lang.
 * `[bedingung, text]`: gesperrt, wenn die Bedingung zutrifft.
 */
export function ersterGrund(...pruefungen: [boolean, React.ReactNode][]): React.ReactNode | undefined {
  return pruefungen.find(([fehlt]) => fehlt)?.[1]
}
