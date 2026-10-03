/**
 * Für wen? Lerngruppe oder einzelne Lernende aus allen eigenen Lerngruppen (03.10.2026) – für
 * Freigaben an die Lern-App (Tafelbilder, Vokabeln). Liefert { lerngruppeId, schueler }.
 */
import { MultiSelect, SegmentedControl, Select, Stack } from '@mantine/core'
import { useEffect, useState } from 'react'
import { holen } from '../onlinetest/serverApi'

export interface LernendeAuswahl {
  lerngruppeId: string
  schueler: string[]
}

export function LernendeWahl({ wahl }: { wahl: (a: LernendeAuswahl | null) => void }): React.JSX.Element {
  const [art, setArt] = useState<'gruppe' | 'einzeln'>('gruppe')
  const [gruppen, setGruppen] = useState<{ id: string; name: string }[]>([])
  const [alle, setAlle] = useState<{ gruppeId: string; benutzer: string; name: string }[]>([])
  const [gruppe, setGruppe] = useState<string | null>(null)
  const [einzelne, setEinzelne] = useState<string[]>([])
  useEffect(() => {
    void holen<{ gruppen: { id: string; name: string }[] }>('/server/lerngruppen').then(async (d) => {
      setGruppen(d.gruppen)
      const l = await Promise.all(
        d.gruppen.map((g) =>
          holen<{ mitglieder: { benutzer: string; name: string }[] }>(`/server/feedback/mitglieder?gruppe=${encodeURIComponent(g.id)}`).then(
            (m) => m.mitglieder.map((x) => ({ ...x, gruppeId: g.id })),
            () => []
          )
        )
      )
      setAlle(l.flat())
    })
  }, [])
  useEffect(() => {
    if (art === 'gruppe') wahl(gruppe ? { lerngruppeId: gruppe, schueler: [] } : null)
    else wahl(einzelne.length ? { lerngruppeId: '', schueler: einzelne } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art, gruppe, einzelne])
  const gesehen = new Set<string>()
  const personen = gruppen
    .map((g) => ({
      group: g.name,
      items: alle
        .filter((m) => m.gruppeId === g.id && !gesehen.has(m.benutzer) && (gesehen.add(m.benutzer), true))
        .map((m) => ({ value: m.benutzer, label: m.name }))
    }))
    .filter((g) => g.items.length)
  return (
    <Stack gap="xs">
      <SegmentedControl
        value={art}
        onChange={(v) => (setArt(v as 'gruppe' | 'einzeln'), setEinzelne([]))}
        data={[
          { value: 'gruppe', label: 'Lerngruppe' },
          { value: 'einzeln', label: 'Einzelne Lernende' }
        ]}
      />
      {art === 'gruppe' ? (
        <Select
          label="Lerngruppe"
          data={gruppen.map((g) => ({ value: g.id, label: g.name }))}
          value={gruppe}
          onChange={setGruppe}
          placeholder="wählen …"
          data-lernende-gruppe
        />
      ) : (
        <MultiSelect label="Lernende" data={personen} value={einzelne} onChange={setEinzelne} searchable placeholder="Namen suchen …" />
      )}
    </Stack>
  )
}
