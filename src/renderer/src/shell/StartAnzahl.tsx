/**
 * Anzahl je Karte auf der Startseite am Smartphone (10.10.2026, Wunsch der Lehrkraft): „Zuletzt bearbeitet" und die
 * Karten des Schnellzugriffs zeigen zunächst 5 Einträge; neben dem Titel ein kleines „5 ▾" (5 / 10 / 20 / alle).
 * Die Wahl ist ein Ansichtswunsch, kein Auf/Zu – sie bleibt dauerhaft je Gerät und Karte (siehe shared/sitzung.ts).
 */
import { Menu, UnstyledButton } from '@mantine/core'
import { useState } from 'react'
import { ANZAHL_WAHL, anzahlAus, anzahlText } from '@shared/startseiteKurse'

const schluessel = (karte: string): string => `schulapps-start-anzahl-${karte}`

function lesen(karte: string): number {
  try {
    return anzahlAus(localStorage.getItem(schluessel(karte)))
  } catch {
    return anzahlAus(null)
  }
}

/** Gemerkte Anzahl einer Karte (0 = alle) */
export function useStartAnzahl(karte: string): [number, (n: number) => void] {
  const [n, setN] = useState(() => lesen(karte))
  const setzen = (neu: number): void => {
    setN(neu)
    try {
      localStorage.setItem(schluessel(karte), String(neu))
    } catch {
      // ohne Speicher gilt die Wahl, solange die Seite steht
    }
  }
  return [n, setzen]
}

/** „5 ▾" neben dem Titel einer Karte */
export function AnzahlWahl({ karte, wert, setzen }: { karte: string; wert: number; setzen: (n: number) => void }): React.JSX.Element {
  return (
    <Menu position="bottom-end" withinPortal shadow="sm">
      <Menu.Target>
        <UnstyledButton
          data-start-anzahl={karte}
          aria-label={`Anzahl der Einträge: ${anzahlText(wert)}`}
          style={{ fontSize: 'var(--mantine-font-size-xs)', color: 'var(--mantine-color-dimmed)', fontWeight: 400, flex: 'none', padding: '2px 4px' }}
        >
          {anzahlText(wert)} ▾
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {ANZAHL_WAHL.map((n) => (
          <Menu.Item key={n} data-start-anzahl-wahl={anzahlText(n)} onClick={() => setzen(n)} fw={n === wert ? 700 : undefined}>
            {anzahlText(n)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}
