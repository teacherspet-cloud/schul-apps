/**
 * Gemeinsamer Kopf aller Programme (Phase 6a, abgestimmt am 05.10.2026; Wunsch der Lehrkraft:
 * „intuitiv, schön aussehend und ansprechend"):
 *
 *   [Bild] Titel  ⧉            [Zusätze]  [📁 Meine …]  [＋ Neue/r/s …]   ← Hauptknopf gefüllt, in der Programmfarbe
 *          Kurzbeschreibung
 *   ─────────────────────────────────────────────────────────────────
 *   Schritte / Reiter                                Filter · Suche
 *
 * Eine Karte mit zartem Verlauf in der Programmfarbe – so erkennt man auf einen Blick, wo man ist, und
 * die Farbe stimmt mit Leiste und Startseite überein. Titel, Beschreibung, Farbe und Bild kommen aus
 * der Registry (App.tsx stellt sie je Programm bereit): eine Stelle für Leiste, Startseite und Kopf.
 * Vorher hatte jedes Programm seinen eigenen Kopf – mal mit Titel, mal nur Schritte, „Neu" mal hell,
 * mal gefüllt, „Eigenes Fenster" mal da, mal nicht.
 */
import { Button, Group, Paper, Text, Title } from '@mantine/core'
import { IconFolder, IconPlus } from '@tabler/icons-react'
import { createContext, useContext } from 'react'
import { EigenesFensterKnopf } from '../eigenesFenster'
import type { ProgrammIcon } from './ProgrammSymbol'

/** Name, Beschreibung, Farbe und Bild des Programms aus der Registry (App.tsx) */
export const ProgrammInfo = createContext<{ name: string; description: string; color: string; icon?: ProgrammIcon; bild?: string } | null>(null)

export interface AppKopfKnopf {
  label: string
  onClick: () => void
  disabled?: boolean
  /** Kennung für Tests (data-Attribut) */
  kennung?: string
}

export function AppKopf({
  titel,
  beschreibung,
  meine,
  neu,
  zusaetze,
  hauptknopf,
  links,
  rechts,
  ohneBeschreibung,
  kompakt
}: {
  /** Ohne Angabe: Name aus der Registry */
  titel?: string
  /** Ohne Angabe: Beschreibung aus der Registry */
  beschreibung?: React.ReactNode
  /** „Meine …" – die gespeicherten Dokumente */
  meine?: AppKopfKnopf
  /** „Neue/r/s …" – gefüllter Hauptknopf mit Plus */
  neu?: AppKopfKnopf & { icon?: React.ReactNode }
  /** Weitere Knöpfe rechts vor „Meine …" (z. B. Rückgängig, Aktualisieren) */
  zusaetze?: React.ReactNode
  /** Eigener Hauptknopf ganz rechts (statt `neu`), wenn er eigene Logik mitbringt – z. B. „Blatt freigeben" */
  hauptknopf?: React.ReactNode
  /** Zweite Zeile links: Schritte oder Reiter */
  links?: React.ReactNode
  /** Zweite Zeile rechts: Filter und Suche */
  rechts?: React.ReactNode
  /** Im Arbeitsablauf (Schritte offen) die Beschreibung weglassen – man kennt sie dann, Platz für das Blatt */
  ohneBeschreibung?: boolean
  /** Über einem Editor: knapp (kleines Bild, ohne Beschreibung, wenig Abstand) – das Blatt braucht die Höhe */
  kompakt?: boolean
}): React.JSX.Element {
  const info = useContext(ProgrammInfo)
  const name = titel ?? info?.name ?? ''
  const text = beschreibung ?? info?.description ?? ''
  const farbe = info?.color ?? 'blue'
  const Symbol = info?.icon
  return (
    <Paper
      radius="lg"
      p={kompakt ? 'xs' : 'md'}
      mb={kompakt ? 0 : 'md'}
      withBorder
      className={`app-kopf${kompakt ? ' app-kopf-kompakt' : ''}`}
      data-app-kopf
      style={{
        background: `linear-gradient(135deg, var(--mantine-color-${farbe}-light) 0%, transparent 70%)`,
        borderColor: 'var(--mantine-color-default-border)',
        // Alles in der Hauptfarbe (Knöpfe, Schritte, Reiter) im Kopf in der Programmfarbe
        ...({
          '--mantine-primary-color-filled': `var(--mantine-color-${farbe}-filled)`,
          '--mantine-primary-color-filled-hover': `var(--mantine-color-${farbe}-filled-hover)`,
          '--mantine-primary-color-light': `var(--mantine-color-${farbe}-light)`,
          '--mantine-primary-color-light-hover': `var(--mantine-color-${farbe}-light-hover)`,
          '--mantine-primary-color-light-color': `var(--mantine-color-${farbe}-light-color)`
        } as React.CSSProperties)
      }}
    >
      <Group justify="space-between" align="center" wrap="wrap" gap="md">
        <Group gap="md" wrap="nowrap" style={{ minWidth: 0, flex: '1 1 300px' }}>
          {(info?.bild || Symbol) && (
            <div className="app-kopf-bild" aria-hidden>
              {info?.bild ? <img src={info.bild} alt="" width={48} height={48} /> : Symbol ? <Symbol size={kompakt ? 32 : 44} /> : null}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <Group gap={2} wrap="nowrap">
              <Title order={2} className="app-kopf-titel">
                {name}
              </Title>
              <EigenesFensterKnopf name={name} />
            </Group>
            {text && !ohneBeschreibung && !kompakt && (
              <Text c="dimmed" size="sm" className="app-kopf-beschreibung" lineClamp={2}>
                {text}
              </Text>
            )}
          </div>
        </Group>
        <Group gap="xs" wrap="wrap" justify="flex-end">
          {zusaetze}
          {meine && (
            <Button
              variant="default"
              radius="md"
              leftSection={<IconFolder size={16} />}
              onClick={meine.onClick}
              disabled={meine.disabled}
              data-app-meine={meine.kennung ?? ''}
            >
              {meine.label}
            </Button>
          )}
          {neu && (
            <Button
              color={farbe}
              radius="md"
              leftSection={neu.icon ?? <IconPlus size={16} />}
              onClick={neu.onClick}
              disabled={neu.disabled}
              data-app-neu={neu.kennung ?? ''}
            >
              {neu.label}
            </Button>
          )}
          {hauptknopf}
        </Group>
      </Group>
      {(links || rechts) && (
        <Group justify="space-between" align="center" wrap="wrap" gap="sm" mt={kompakt ? 'xs' : 'md'} pt={kompakt ? 6 : 'sm'} className="app-kopf-zeile">
          <div style={{ minWidth: 0, flex: '1 1 auto', overflowX: 'auto' }}>{links}</div>
          {rechts && (
            <Group gap="xs" wrap="wrap" justify="flex-end">
              {rechts}
            </Group>
          )}
        </Group>
      )}
    </Paper>
  )
}

/** Farbe des Programms (Registry) – für eigene Hauptknöpfe im Kopf */
export const useProgrammFarbe = (): string => useContext(ProgrammInfo)?.color ?? 'blue'
