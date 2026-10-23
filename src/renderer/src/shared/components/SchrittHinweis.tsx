/**
 * Kopf eines Arbeitsschritts (23.10.2026, Entscheidung der Lehrkraft): Die große Überschrift wiederholte die Schrittleiste
 * im App-Kopf („Thema & Lerngruppe" stand zweimal untereinander). Sichtbar bleibt nur der Erklärsatz in kleiner Schrift;
 * die Überschrift steht weiter für Bildschirmleser da, damit jeder Schritt eine Überschrift hat.
 */
import { Text, VisuallyHidden } from '@mantine/core'

export function SchrittHinweis({ titel, children, mb }: { titel: string; children?: React.ReactNode; mb?: string }): React.JSX.Element {
  return (
    <div className="schritt-hinweis">
      <VisuallyHidden component="h2">{titel}</VisuallyHidden>
      {children && (
        <Text c="dimmed" size="sm" mb={mb}>
          {children}
        </Text>
      )}
    </div>
  )
}
