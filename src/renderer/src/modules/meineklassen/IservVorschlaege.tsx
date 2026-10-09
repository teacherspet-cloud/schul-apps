/**
 * „… hat sich mit IServ angemeldet – mit dem bisherigen Konto zusammenführen?" (09.10.2026, server/kontoVerknuepfung.ts)
 *
 * Meldet sich eine Schülerin/ein Schüler das erste Mal über IServ an und passt der Name auf mehrere Gastkonten (Code/QR)
 * – oder IServ nennt keine Klasse –, entscheidet die Lehrkraft der Klasse: Zusammenführen übernimmt die Daten ins
 * bisherige Gastkonto (der Code bleibt gültig), Ignorieren lässt beide Konten getrennt.
 */
import { Alert, Button, Group, Stack, Text } from '@mantine/core'
import { useCallback, useEffect, useState } from 'react'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'

interface Vorschlag {
  iservId: string
  iservName: string
  iservBenutzer: string
  gastId: string
  gastName: string
}

export function IservVorschlaege({ gruppeId, geaendert }: { gruppeId: string; geaendert: () => void }): React.JSX.Element | null {
  const [liste, setListe] = useState<Vorschlag[]>([])
  const [laeuft, setLaeuft] = useState('')
  const laden = useCallback(() => {
    void holen<{ vorschlaege: Vorschlag[] }>(`/server/klassen/${encodeURIComponent(gruppeId)}/iserv-vorschlaege`).then(
      (r) => setListe(r.vorschlaege),
      () => setListe([])
    )
  }, [gruppeId])
  useEffect(laden, [laden])
  if (!liste.length) return null
  const entscheiden = async (v: Vorschlag, art: 'iserv-zusammenfuehren' | 'iserv-ignorieren'): Promise<void> => {
    if (
      art === 'iserv-zusammenfuehren' &&
      !window.confirm(`„${v.iservName}" (IServ) mit dem bisherigen Konto „${v.gastName}" zusammenführen? Die Daten landen im bisherigen Konto, der Code bleibt gültig.`)
    )
      return
    setLaeuft(`${v.iservId}|${v.gastId}`)
    try {
      await senden(`/server/klassen/${encodeURIComponent(gruppeId)}/${art}`, { iservId: v.iservId, gastId: v.gastId })
      if (art === 'iserv-zusammenfuehren') notifySuccess('Konten zusammengeführt.')
      laden()
      geaendert()
    } catch (e) {
      notifyError(e)
    } finally {
      setLaeuft('')
    }
  }
  return (
    <Stack gap="xs" mb="sm" data-iserv-vorschlaege>
      {liste.map((v) => (
        <Alert key={`${v.iservId}|${v.gastId}`} color="blue" variant="light">
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Text size="sm">
              {v.gastName} hat sich mit IServ angemeldet ({v.iservName}, {v.iservBenutzer}) – mit dem bisherigen Konto zusammenführen?
            </Text>
            <Group gap="xs">
              <Button size="xs" loading={laeuft === `${v.iservId}|${v.gastId}`} onClick={() => void entscheiden(v, 'iserv-zusammenfuehren')} data-iserv-zusammenfuehren>
                Zusammenführen
              </Button>
              <Button size="xs" variant="subtle" disabled={Boolean(laeuft)} onClick={() => void entscheiden(v, 'iserv-ignorieren')}>
                Ignorieren
              </Button>
            </Group>
          </Group>
        </Alert>
      ))}
    </Stack>
  )
}
