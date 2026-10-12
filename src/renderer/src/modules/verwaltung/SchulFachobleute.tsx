import { Group, Loader, MultiSelect, Stack, Text } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { fachVon, SPRACHFAECHER } from '@shared/faecher'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError } from '../../shared/util'
import { KlappKarte } from '../../shared/components/KlappKarte'
import { FachPunkt } from '../../shared/components/FachFarbe'

interface Lehrkraft {
  id: string
  name: string
  benutzer: string
  rolle: string
}

/**
 * Verwaltung › Schule › Fachobleute (12.10.2026, Wunsch der Lehrkraft; Regeln in shared/fachobleute.ts): Der Admin
 * ernennt je Fach eine oder mehrere Lehrkräfte zur Fachobfrau bzw. zum Fachobmann – eine Lehrkraft kann es für mehrere
 * Fächer sein. Sie pflegen die gemeinsamen Lehrwerke ihres Fachs in den Apps „Vokabellisten" und „Grammatikformen"
 * (Organisation). Gezeigt werden die Fächer mit Lehrwerken (Fremdsprachen, Latein, DaZ). Gespeichert auf dem Server
 * (server/fachobleute.ts) – jede Änderung sofort, je betroffener Lehrkraft.
 */
export function SchulFachobleute(): React.JSX.Element {
  const [daten, setDaten] = useState<{ obleute: Record<string, string[]>; lehrkraefte: Lehrkraft[] } | null>(null)
  const [speichert, setSpeichert] = useState(false)

  useEffect(() => {
    void holen<{ obleute?: Record<string, string[]>; lehrkraefte?: Lehrkraft[] }>('/server/fachobleute')
      .then((d) => setDaten({ obleute: d.obleute ?? {}, lehrkraefte: d.lehrkraefte ?? [] }))
      .catch((e: unknown) => {
        setDaten({ obleute: {}, lehrkraefte: [] })
        notifyError(e)
      })
  }, [])

  const auswahl = useMemo(
    () => (daten?.lehrkraefte ?? []).map((l) => ({ value: l.id, label: l.name || l.benutzer })).sort((a, b) => a.label.localeCompare(b.label, 'de')),
    [daten?.lehrkraefte]
  )

  /** Lehrkräfte eines Fachs ändern: für jede betroffene Lehrkraft ihre Fächerliste neu setzen */
  const setzeFach = async (fach: string, ids: string[]): Promise<void> => {
    if (!daten) return
    const vorher = new Set(
      Object.entries(daten.obleute)
        .filter(([, f]) => f.includes(fach))
        .map(([id]) => id)
    )
    const nachher = new Set(ids)
    const betroffen = [...new Set([...vorher, ...nachher])].filter((id) => vorher.has(id) !== nachher.has(id))
    if (!betroffen.length) return
    setSpeichert(true)
    try {
      let obleute = daten.obleute
      for (const id of betroffen) {
        const alt = obleute[id] ?? []
        const neu = nachher.has(id) ? [...new Set([...alt, fach])] : alt.filter((f) => f !== fach)
        obleute = (await senden<{ obleute: Record<string, string[]> }>('/server/fachobleute', { nutzerId: id, faecher: neu })).obleute
      }
      setDaten({ ...daten, obleute })
    } catch (e) {
      notifyError(e)
    } finally {
      setSpeichert(false)
    }
  }

  const zahl = daten ? Object.keys(daten.obleute).length : 0
  return (
    <KlappKarte
      id="verwaltung-fachobleute"
      dauerhaft
      titel="Fachobleute"
      status={
        daten === null
          ? 'pflegen gemeinsame Lehrwerke ihres Fachs'
          : zahl
          ? `${zahl} ${zahl === 1 ? 'Lehrkraft' : 'Lehrkräfte'} ernannt`
          : 'noch niemand ernannt'
      }
      rahmen={{ 'data-schul-fachobleute': true }}
    >
      {daten === null ? (
        <Loader size="sm" />
      ) : (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            Fachobleute bearbeiten die gemeinsamen Lehrwerke ihres Fachs in „Vokabellisten“ und „Grammatikformen“ – wie der Admin. Eine Lehrkraft kann es für
            mehrere Fächer sein. Bilder und Aussprache (Medienbank) bleiben beim Admin.
          </Text>
          {SPRACHFAECHER.map((fach) => {
            const gewaehlt = Object.entries(daten.obleute)
              .filter(([, f]) => f.includes(fach))
              .map(([id]) => id)
            return (
              <Group key={fach} gap="sm" wrap="nowrap" align="center" data-fachobleute-fach={fach}>
                <Group gap={6} wrap="nowrap" w={170} style={{ flexShrink: 0 }}>
                  <FachPunkt fach={fach} />
                  <Text size="sm">{fachVon(fach)?.label ?? fach}</Text>
                </Group>
                <MultiSelect
                  size="xs"
                  style={{ flex: 1 }}
                  data={auswahl}
                  value={gewaehlt}
                  placeholder={gewaehlt.length ? '' : 'Lehrkraft wählen …'}
                  searchable
                  clearable
                  disabled={speichert}
                  aria-label={`Fachobleute ${fachVon(fach)?.label ?? fach}`}
                  onChange={(ids) => void setzeFach(fach, ids)}
                />
              </Group>
            )
          })}
        </Stack>
      )}
    </KlappKarte>
  )
}
