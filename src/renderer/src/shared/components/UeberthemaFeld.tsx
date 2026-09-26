import { Checkbox, Stack, TextInput } from '@mantine/core'
import { useThemenbereich } from '../themenbereiche'
import type { UeberthemaFelder } from '../ueberthema'

/**
 * Überthema eines Materials (Paket 11) – dasselbe Feld in allen Programmen.
 *
 * Standard ist der Themenbereich, in dem das Material liegt; er steht als Platzhalter im Feld.
 * Wer etwas anderes will, trägt es ein; wer gar keins will, schaltet es ab. Wie es aussieht
 * (Pfad, Fach links / Überthema rechts, betont), legt die Designvorlage fest.
 */
export default function UeberthemaFeld({
  werte,
  bereich,
  rueckfall,
  onChange,
  size = 'sm'
}: {
  werte: UeberthemaFelder
  /** Name des Themenbereichs, in dem das Material liegt (leer = keiner) */
  bereich: string
  /** Was sonst gilt, wenn kein Bereich da ist (Vokabeltest: die Unit der Liste) */
  rueckfall?: string
  onChange: (patch: Pick<UeberthemaFelder, 'ueberthema' | 'ueberthemaAus'>) => void
  size?: 'xs' | 'sm'
}): React.JSX.Element {
  const vorgabe = bereich || rueckfall || ''
  return (
    <Stack gap={4} className="ueberthema-feld">
      <TextInput
        size={size}
        label="Überthema"
        aria-label="Überthema"
        description={
          bereich
            ? `Steht im Kopf neben dem Fach. Ohne Eintrag gilt der Themenbereich „${bereich}".`
            : vorgabe
              ? `Steht im Kopf neben dem Fach. Ohne Eintrag gilt „${vorgabe}".`
              : 'Steht im Kopf neben dem Fach. Liegt das Material in einem Themenbereich, gilt ohne Eintrag dessen Name.'
        }
        placeholder={vorgabe || 'z. B. Ökologie'}
        value={werte.ueberthema ?? ''}
        disabled={Boolean(werte.ueberthemaAus)}
        onChange={(e) => onChange({ ueberthema: e.currentTarget.value })}
      />
      <Checkbox
        size={size}
        label="Kein Überthema anzeigen"
        checked={Boolean(werte.ueberthemaAus)}
        onChange={(e) => onChange({ ueberthemaAus: e.currentTarget.checked })}
      />
    </Stack>
  )
}

/** Dasselbe Feld mit dem Themenbereich des Materials – für Formulare, die ihn nicht selbst kennen */
export function UeberthemaFeldFuer({
  moduleId,
  docId,
  ...rest
}: { moduleId: string; docId: string } & Omit<Parameters<typeof UeberthemaFeld>[0], 'bereich'>): React.JSX.Element {
  const bereich = useThemenbereich(moduleId, docId)
  return <UeberthemaFeld bereich={bereich?.name ?? ''} {...rest} />
}
