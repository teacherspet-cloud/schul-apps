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

/**
 * Alle Schülerkonten der Schule für „Einzelne Lernende" (03.10.2026): nach Klasse gruppiert, Klassen
 * mit Lernenden aus eigenen Lerngruppen zuerst. Vorher nur Mitglieder eigener Lerngruppen – wer in
 * keiner stand (z. B. ein neu angelegtes Konto), war nicht zu finden.
 */
export function useAlleLernenden(): { daten: { group: string; items: { value: string; label: string }[] }[]; anzahl: number; geladen: boolean } {
  const [liste, setListe] = useState<{ benutzer: string; name: string; klasse: string; eigen: boolean }[] | null>(null)
  useEffect(() => {
    void holen<{ lernende: { benutzer: string; name: string; klasse: string; eigen: boolean }[] }>('/server/feedback/alle-lernenden').then(
      (d) => setListe(d.lernende),
      () => setListe([])
    )
  }, [])
  const klassen = new Map<string, { eigen: boolean; items: { value: string; label: string }[] }>()
  for (const n of liste ?? []) {
    const k = n.klasse || 'ohne Klasse'
    const e = klassen.get(k) ?? { eigen: false, items: [] }
    e.eigen ||= n.eigen
    e.items.push({ value: n.benutzer, label: n.name })
    klassen.set(k, e)
  }
  const daten = [...klassen.entries()]
    .sort(([a, x], [b, y]) => Number(y.eigen) - Number(x.eigen) || a.localeCompare(b, 'de', { numeric: true }))
    .map(([k, e]) => ({ group: e.eigen ? `${k} (eigene Lerngruppe)` : k, items: e.items.sort((a, b) => a.label.localeCompare(b.label, 'de')) }))
  return { daten, anzahl: liste?.length ?? 0, geladen: liste !== null }
}

export function LernendeWahl({ wahl }: { wahl: (a: LernendeAuswahl | null) => void }): React.JSX.Element {
  const [art, setArt] = useState<'gruppe' | 'einzeln'>('gruppe')
  const [gruppen, setGruppen] = useState<{ id: string; name: string }[]>([])
  const [gruppe, setGruppe] = useState<string | null>(null)
  const [einzelne, setEinzelne] = useState<string[]>([])
  useEffect(() => {
    void holen<{ gruppen: { id: string; name: string }[] }>('/server/lerngruppen').then(
      (d) => setGruppen(d.gruppen),
      () => setGruppen([])
    )
  }, [])
  useEffect(() => {
    if (art === 'gruppe') wahl(gruppe ? { lerngruppeId: gruppe, schueler: [] } : null)
    else wahl(einzelne.length ? { lerngruppeId: '', schueler: einzelne } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art, gruppe, einzelne])
  const alleLernenden = useAlleLernenden()
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
        <MultiSelect
          label="Lernende"
          data={alleLernenden.daten}
          value={einzelne}
          onChange={setEinzelne}
          searchable
          clearable
          nothingFoundMessage="Kein Schülerkonto mit diesem Namen"
          placeholder={alleLernenden.geladen && !alleLernenden.anzahl ? 'Noch keine Schülerkonten angelegt' : 'Namen suchen …'}
          data-lernende-einzeln
        />
      )}
    </Stack>
  )
}
