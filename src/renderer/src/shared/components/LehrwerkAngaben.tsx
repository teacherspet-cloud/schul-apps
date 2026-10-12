import { Autocomplete, NumberInput, Select, SimpleGrid, TextInput } from '@mantine/core'
import { useMemo } from 'react'
import type { TextbookMeta } from '@shared/types'
import { landZuAusgabe, schulformAuswahl } from '@shared/lehrwerkSchulform'
import { STATES } from '../../modules/arbeitsblatt/didactics/states'

/** Die Angaben zur Schulbuchreihe eines Lehrwerks (Paket 15, src/shared/lehrwerkReihe.ts) */
export interface LehrwerkAngabenWerte {
  reihe?: string
  band?: string
  /** Jahrgang des Bandes (12.10.2026) */
  grade?: number
  publisher?: string
  /** Landesausgabe */
  edition?: string
  /** Land der Landesausgabe (12.10.2026) – folgt der Landesausgabe, wenn sie ein Bundesland nennt */
  stateId?: string
  /** Schulform (12.10.2026) – Kennung aus shared/schulformen.ts */
  schoolTypeId?: string
  ausgabe?: string
}

const collator = new Intl.Collator('de', { numeric: true })
const werte = (liste: (string | undefined)[]): string[] => [...new Set(liste.map((x) => x?.trim() ?? '').filter(Boolean))].sort(collator.compare)

/**
 * Reihe, Band, Jahrgang, Verlag, Landesausgabe, Schulform, Ausgabe – beim Import eines Lehrwerks und im Buch-Editor.
 *
 * Freie Felder mit Vorschlagslisten aus den vorhandenen Lehrwerken (Landesausgabe zusätzlich
 * die Bundesländer): Wer „Gre" tippt, bekommt „Green Line", und die neue Liste landet in
 * derselben Reihen-Karte wie die mitgelieferten Bände. Die Landesausgabe steht vor der Ausgabe
 * (Vorgabe der Lehrkraft).
 *
 * Jahrgang und Schulform (12.10.2026, Wunsch der Lehrkraft) – Reihenfolge begründet:
 *  - Jahrgang direkt nach dem Band: Band und Jahrgang gehören zusammen („Band 3 = Klasse 7"), und genau dieses Paar
 *    braucht die Vorwahl des Lehrwerks bei der Materialerstellung.
 *  - Schulform direkt nach der Landesausgabe: Die Schulformen hängen am Land (shared/schulformen.ts, je Land eigene
 *    Bezeichnungen). Eine Landesausgabe, die ein Bundesland nennt, setzt das Land (`stateId`) gleich mit; eine
 *    bundesweite Ausgabe lässt es leer, dann stehen die Schulformen aller Länder zur Wahl.
 *  - Ausgabe (Erscheinungsjahr) bleibt zuletzt.
 */
export default function LehrwerkAngaben({
  werte: w,
  onChange,
  vorhandene,
  mitBand = true
}: {
  werte: LehrwerkAngabenWerte
  onChange: (patch: Partial<LehrwerkAngabenWerte>) => void
  /** Vorhandene Lehrwerke – für die Vorschlagslisten */
  vorhandene: Pick<TextbookMeta, 'reihe' | 'publisher' | 'edition' | 'ausgabe'>[]
  /** Band und Jahrgang nur, wenn es um EIN Buch geht (beim Import mehrerer Bände kommen sie aus Namen bzw. Datei) */
  mitBand?: boolean
}): React.JSX.Element {
  const listen = useMemo(
    () => ({
      reihe: werte(vorhandene.map((b) => b.reihe)),
      publisher: werte(vorhandene.map((b) => b.publisher)),
      edition: werte([...vorhandene.map((b) => b.edition), ...STATES.map((s) => s.name)]),
      ausgabe: werte(vorhandene.map((b) => b.ausgabe))
    }),
    [vorhandene]
  )
  const schulformen = useMemo(() => schulformAuswahl(w.stateId), [w.stateId])
  // Eine gespeicherte Schulform, die es im Land nicht gibt, bleibt sichtbar (nichts still verwerfen)
  const schulformDaten =
    w.schoolTypeId && !schulformen.some((s) => s.value === w.schoolTypeId)
      ? [...schulformen, { value: w.schoolTypeId, label: schulformAuswahl().find((s) => s.value === w.schoolTypeId)?.label ?? w.schoolTypeId }]
      : schulformen
  return (
    <SimpleGrid cols={{ base: 2, sm: mitBand ? 4 : 3, lg: mitBand ? 7 : 5 }} spacing="xs" data-lehrwerk-angaben>
      <Autocomplete size="xs" label="Reihe" placeholder="z. B. Green Line" data={listen.reihe} value={w.reihe ?? ''} onChange={(v) => onChange({ reihe: v })} />
      {mitBand && <TextInput size="xs" label="Band" placeholder="z. B. 3" value={w.band ?? ''} onChange={(e) => onChange({ band: e.currentTarget.value })} />}
      {mitBand && (
        <NumberInput
          size="xs"
          label="Jahrgang"
          placeholder="z. B. 7"
          min={1}
          max={13}
          allowDecimal={false}
          value={w.grade ?? ''}
          onChange={(v) => onChange({ grade: typeof v === 'number' && v >= 1 && v <= 13 ? v : undefined })}
          data-lehrwerk-jahrgang
        />
      )}
      <Autocomplete
        size="xs"
        label="Verlag"
        placeholder="z. B. Klett"
        data={listen.publisher}
        value={w.publisher ?? ''}
        onChange={(v) => onChange({ publisher: v })}
      />
      <Autocomplete
        size="xs"
        label="Landesausgabe"
        placeholder="z. B. Niedersachsen"
        data={listen.edition}
        value={w.edition ?? ''}
        // Nennt die Landesausgabe ein Bundesland, folgt das Land; eine Schulform, die es dort nicht gibt, entfällt
        onChange={(v) => {
          const land = landZuAusgabe(v)
          const patch: Partial<LehrwerkAngabenWerte> = { edition: v }
          if (land !== w.stateId) {
            patch.stateId = land
            if (w.schoolTypeId && land && !schulformAuswahl(land).some((s) => s.value === w.schoolTypeId)) patch.schoolTypeId = undefined
          }
          onChange(patch)
        }}
      />
      <Select
        size="xs"
        label="Schulform"
        placeholder={w.stateId ? 'Schulform wählen' : 'alle Länder'}
        data={schulformDaten}
        value={w.schoolTypeId ?? null}
        onChange={(v) => onChange({ schoolTypeId: v ?? undefined })}
        clearable
        searchable
        comboboxProps={{ withinPortal: true }}
        data-lehrwerk-schulform
      />
      <Autocomplete
        size="xs"
        label="Ausgabe"
        placeholder="z. B. ab 2021"
        data={listen.ausgabe}
        value={w.ausgabe ?? ''}
        onChange={(v) => onChange({ ausgabe: v })}
      />
    </SimpleGrid>
  )
}

/** Leere Angaben nicht als leere Zeichenkette speichern */
export function angabenSauber(w: LehrwerkAngabenWerte): LehrwerkAngabenWerte {
  const out: LehrwerkAngabenWerte = {}
  for (const k of ['reihe', 'band', 'publisher', 'edition', 'stateId', 'schoolTypeId', 'ausgabe'] as const) {
    const v = w[k]?.trim()
    if (v) out[k] = v
  }
  if (typeof w.grade === 'number' && Number.isFinite(w.grade) && w.grade >= 1 && w.grade <= 13) out.grade = Math.round(w.grade)
  return out
}
