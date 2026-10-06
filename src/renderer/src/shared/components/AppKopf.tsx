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
import { DokumentSuche } from './AppSuche'
import { ActionIcon, Button, Group, Paper, Text, Title, Tooltip, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronUp, IconFolder, IconPlus } from '@tabler/icons-react'
import { createContext, useContext, useState } from 'react'
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
  kompakt,
  suche
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
  /**
   * Suchfeld (06.10.2026: in JEDER App): ohne Angabe die Suche in den gespeicherten Dokumenten dieser App; eine eigene
   * (`ListenSuche`) filtert die angezeigte Liste; `false`, wenn die App schon an anderer Stelle sucht.
   */
  suche?: React.ReactNode | false
}): React.JSX.Element {
  const info = useContext(ProgrammInfo)
  const name = titel ?? info?.name ?? ''
  const text = beschreibung ?? info?.description ?? ''
  const farbe = info?.color ?? 'blue'
  const Symbol = info?.icon
  /*
   * Ein- und ausblendbar (06.10.2026, Wunsch der Lehrkraft): eingeklappt bleibt nur eine schmale Leiste mit Name und
   * Pfeil – mehr Platz für Blatt und Editor. Gemerkt je Programm (nur in diesem Browser).
   */
  const merkName = `schulapps-kopf-zu:${name}`
  const [zu, setZu] = useState(() => {
    try {
      return localStorage.getItem(merkName) === '1'
    } catch {
      return false
    }
  })
  const umschalten = (): void => {
    setZu(!zu)
    try {
      localStorage.setItem(merkName, zu ? '0' : '1')
    } catch {
      // ohne Browserspeicher: nur für diese Sitzung
    }
  }
  if (zu)
    return (
      <UnstyledButton
        onClick={umschalten}
        className="app-kopf app-kopf-zu"
        aria-expanded={false}
        aria-label="Kopfbereich einblenden"
        title="Kopfbereich einblenden"
        data-app-kopf
        data-app-kopf-zu
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '4px 12px',
          marginBottom: 8,
          borderRadius: 'var(--mantine-radius-md)',
          border: '1px solid var(--mantine-color-default-border)',
          background: `linear-gradient(90deg, var(--mantine-color-${farbe}-light) 0%, transparent 60%)`
        }}
      >
        {Symbol ? <Symbol size={20} /> : info?.bild ? <img src={info.bild} alt="" width={20} height={20} /> : null}
        <Text fw={600} size="sm" style={{ flex: 1, minWidth: 0 }} truncate>
          {name}
        </Text>
        <Text size="xs" c="dimmed">
          Kopfbereich einblenden
        </Text>
        <IconChevronDown size={16} />
      </UnstyledButton>
    )
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
          {suche === false ? null : (suche ?? <DokumentSuche />)}
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
          <Tooltip label="Kopfbereich ausblenden (mehr Platz)">
            <ActionIcon
              variant="subtle"
              color="gray"
              radius="md"
              size="lg"
              onClick={umschalten}
              aria-label="Kopfbereich ausblenden"
              aria-expanded
              data-app-kopf-umschalten
            >
              <IconChevronUp size={18} />
            </ActionIcon>
          </Tooltip>
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
