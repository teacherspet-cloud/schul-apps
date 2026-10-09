/**
 * Gemeinsame Teile der kleinen Diagramme (09.10.2026, aus verwaltung/ServerDiagramme.tsx herausgelöst): inline SVG,
 * keine Diagramm-Bibliothek. Eine y-Achse je Diagramm, Legende ab zwei Reihen, Tooltip beim Überfahren, Textfassung
 * für Screenreader (aria-label). Farben: feste Reihenfolge, je Design eigene Stufen (geprüft auf Farbfehlsichtigkeit
 * und Kontrast, dataviz-Prüfskript); Grau nur für „Andere".
 */
import { Box, Card, Group, Text, useComputedColorScheme } from '@mantine/core'

/** Reihenfarben in fester Reihenfolge: Blau, Orange, Grün, Lila */
const HELL = ['#1c7ed6', '#e8590c', '#0ca678', '#ae3ec9']
const DUNKEL = ['#228be6', '#e8590c', '#0ca678', '#be4bdb']
/** Grau für den Sammeltopf „Andere" */
export const ANDERE_HELL = '#868e96'
export const ANDERE_DUNKEL = '#909296'

export function useReihenFarben(): string[] {
  return useComputedColorScheme('light') === 'dark' ? DUNKEL : HELL
}

/** Reihenfarben und Grau für „Andere" */
export function useFarbenMitAndere(): { farben: string[]; andere: string } {
  const dunkel = useComputedColorScheme('light') === 'dark'
  return { farben: dunkel ? DUNKEL : HELL, andere: dunkel ? ANDERE_DUNKEL : ANDERE_HELL }
}

export interface Reihe {
  name: string
  farbe: string
  werte: number[]
}

export const ACHSE = 'var(--mantine-color-dimmed)'
export const GITTER = 'var(--mantine-color-default-border)'

/** „9.10." aus „2026-10-09" */
export const tagKurz = (iso: string): string => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.`

export function Legende({ reihen }: { reihen: { name: string; farbe: string }[] }): React.JSX.Element | null {
  if (reihen.length < 2) return null
  return (
    <Group gap="md" mt={4} aria-hidden>
      {reihen.map((r) => (
        <Group key={r.name} gap={6} wrap="nowrap">
          <span style={{ width: 12, height: 3, borderRadius: 2, background: r.farbe, display: 'inline-block' }} />
          <Text size="xs" c="dimmed">
            {r.name}
          </Text>
        </Group>
      ))}
    </Group>
  )
}

export function Hinweisfeld({ x, breite, zeilen }: { x: number; breite: number; zeilen: React.ReactNode }): React.JSX.Element {
  // Tooltip bleibt im Diagramm: links vom Zeiger, wenn rechts kein Platz ist
  const links = x > breite - 180
  return (
    <Box
      style={{
        position: 'absolute',
        top: 4,
        left: links ? undefined : x + 10,
        right: links ? breite - x + 10 : undefined,
        pointerEvents: 'none',
        background: 'var(--mantine-color-body)',
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 6,
        padding: '4px 8px',
        fontSize: 12,
        boxShadow: 'var(--mantine-shadow-sm)',
        whiteSpace: 'nowrap',
        zIndex: 1
      }}
    >
      {zeilen}
    </Box>
  )
}

/** Kennzahl-Kachel: Titel, großer Wert, kleiner Hinweis */
export function Kennzahl({ titel, wert, hinweis, warnung }: { titel: string; wert: string; hinweis?: string; warnung?: boolean }): React.JSX.Element {
  return (
    <Card withBorder padding="sm" style={warnung ? { borderColor: 'var(--mantine-color-orange-6)' } : undefined}>
      <Text size="xs" c="dimmed">
        {titel}
      </Text>
      <Text fw={700} fz={22} lh={1.2} c={warnung ? 'orange.7' : undefined}>
        {wert}
      </Text>
      {hinweis && (
        <Text size="xs" c="dimmed">
          {hinweis}
        </Text>
      )}
    </Card>
  )
}
