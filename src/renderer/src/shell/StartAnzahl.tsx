/**
 * Anzahl je Karte auf der Startseite (10.10.2026 am Smartphone, seit 12.10.2026 auf ALLEN Geräten, Wunsch der Lehrkraft):
 * „Zuletzt bearbeitet" und die Kästen des Schnellzugriffs zeigen zunächst 5 Einträge; neben dem Titel ein kleines „5 ▾"
 * (5 / 10 / 20 / alle). Die Wahl bleibt dauerhaft je Gerät und Kasten (auch über Sitzungen hinweg).
 *
 * Auf/Zu der Kästen (12.10.2026, Wunsch der Lehrkraft): Jeder Kasten der Startseite ist auf- und zuklappbar, zunächst
 * zugeklappt, und behält seinen Stand dauerhaft je Gerät – wie die Kästen in Verwaltung › Schule (shared/sitzung.ts ›
 * dauerhaftMerken), Kennung „start-<Kasten>".
 */
import { Menu, UnstyledButton } from '@mantine/core'
import { useState } from 'react'
import { ANZAHL_WAHL, anzahlAus, anzahlText } from '@shared/startseiteKurse'
import { dauerhaftMerken, dauerhaftOffen } from '../shared/sitzung'

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

/** Kennung des Auf/Zu eines Startseiten-Kastens (dauerhaft, shared/sitzung.ts) */
export const startKastenId = (karte: string): string => `start-${karte}`

/** Auf/Zu eines Startseiten-Kastens: zunächst zu, dauerhaft je Gerät gemerkt (12.10.2026) */
export function useStartOffen(karte: string): [boolean, () => void] {
  const id = startKastenId(karte)
  const [offen, setOffen] = useState(() => dauerhaftOffen(id) ?? false)
  const umschalten = (): void =>
    setOffen((o) => {
      dauerhaftMerken(id, !o)
      return !o
    })
  return [offen, umschalten]
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
