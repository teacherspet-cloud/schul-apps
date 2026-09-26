import { Autocomplete, SimpleGrid, TextInput } from '@mantine/core'
import { useMemo } from 'react'
import type { TextbookMeta } from '@shared/types'
import { STATES } from '../../modules/arbeitsblatt/didactics/states'

/** Die Angaben zur Schulbuchreihe eines Lehrwerks (Paket 15, src/shared/lehrwerkReihe.ts) */
export interface LehrwerkAngabenWerte {
  reihe?: string
  band?: string
  publisher?: string
  /** Landesausgabe */
  edition?: string
  ausgabe?: string
}

const collator = new Intl.Collator('de', { numeric: true })
const werte = (liste: (string | undefined)[]): string[] => [...new Set(liste.map((x) => x?.trim() ?? '').filter(Boolean))].sort(collator.compare)

/**
 * Reihe, Band, Verlag, Landesausgabe, Ausgabe – beim Import eines Lehrwerks und im Buch-Editor.
 *
 * Freie Felder mit Vorschlagslisten aus den vorhandenen Lehrwerken (Landesausgabe zusätzlich
 * die Bundesländer): Wer „Gre" tippt, bekommt „Green Line", und die neue Liste landet in
 * derselben Reihen-Karte wie die mitgelieferten Bände. Die Landesausgabe steht vor der Ausgabe
 * (Vorgabe der Lehrkraft).
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
  /** Band nur, wenn es um EIN Buch geht (beim Import mehrerer Bände kommt er aus dem Namen) */
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
  return (
    <SimpleGrid cols={{ base: 2, sm: mitBand ? 5 : 4 }} spacing="xs" data-lehrwerk-angaben>
      <Autocomplete size="xs" label="Reihe" placeholder="z. B. Green Line" data={listen.reihe} value={w.reihe ?? ''} onChange={(v) => onChange({ reihe: v })} />
      {mitBand && <TextInput size="xs" label="Band" placeholder="z. B. 3" value={w.band ?? ''} onChange={(e) => onChange({ band: e.currentTarget.value })} />}
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
        onChange={(v) => onChange({ edition: v })}
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
  for (const k of ['reihe', 'band', 'publisher', 'edition', 'ausgabe'] as const) {
    const v = w[k]?.trim()
    if (v) out[k] = v
  }
  return out
}
