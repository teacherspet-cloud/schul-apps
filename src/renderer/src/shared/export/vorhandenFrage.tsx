/**
 * Rückfrage „Gibt es schon" (05.10.2026, Wunsch der Lehrkraft): Liegt am Speicherort (IServ, gewählter
 * Ordner) schon Material mit demselben Namen, wird gefragt – überschreiben oder als zweite Version
 * („Name (2)") speichern. Der Speicherweg meldet den Fall (shared/vorhanden.ts); window.api fragt hier
 * nach und speichert mit der Antwort erneut.
 *
 * Mehrere Dateien auf einmal (Blatt, Lösungen, Tafelbild …): „Für alle weiteren Dateien" merkt die
 * Wahl bis zum Ende dieses Speicherns (`fuerAlle` setzt der Aufrufer zurück).
 */
import { Button, Checkbox, Group, Modal, Stack, Text } from '@mantine/core'
import { IconCopy, IconReplace } from '@tabler/icons-react'
import { useState } from 'react'
import { create } from 'zustand'
import type { BeiVorhanden } from '@shared/vorhanden'

interface Frage {
  name: string
  ort: string
  mehrere: boolean
  antwort: (wahl: { wahl: BeiVorhanden; alle: boolean } | null) => void
}

const useFrage = create<{ offen: Frage | null; fuerAlle: BeiVorhanden | null }>(() => ({ offen: null, fuerAlle: null }))

/** Fragen; `mehrere`: es folgen weitere Dateien (dann „Für alle weiteren" anbieten). null = abgebrochen */
export async function frageVorhanden(name: string, ort: string, mehrere = false): Promise<BeiVorhanden | null> {
  const gemerkt = useFrage.getState().fuerAlle
  if (gemerkt) return gemerkt
  const r = await new Promise<{ wahl: BeiVorhanden; alle: boolean } | null>((antwort) => useFrage.setState({ offen: { name, ort, mehrere, antwort } }))
  if (r?.alle) useFrage.setState({ fuerAlle: r.wahl })
  return r?.wahl ?? null
}

/** Mehrere Dateien: vorher und nachher aufrufen – „Für alle weiteren" gilt nur für dieses Speichern */
export const vorhandenRunde = (): void => useFrage.setState({ fuerAlle: null })

export function VorhandenDialog(): React.JSX.Element | null {
  const offen = useFrage((s) => s.offen)
  const [alle, setAlle] = useState(false)
  if (!offen) return null
  const schliessen = (wahl: BeiVorhanden | null): void => {
    useFrage.setState({ offen: null })
    offen.antwort(wahl ? { wahl, alle } : null)
    setAlle(false)
  }
  return (
    <Modal opened onClose={() => schliessen(null)} title="Datei gibt es schon" centered zIndex={4000} data-vorhanden-dialog>
      <Stack gap="sm">
        <Text size="sm">
          {offen.ort === 'IServ' ? 'Auf IServ' : 'Am Speicherort'} liegt bereits „{offen.name}“.
        </Text>
        <Group grow>
          <Button color="orange" variant="light" leftSection={<IconReplace size={16} />} onClick={() => schliessen('ersetzen')} data-vorhanden="ersetzen">
            Überschreiben
          </Button>
          <Button leftSection={<IconCopy size={16} />} onClick={() => schliessen('neu')} data-vorhanden="neu">
            Als neue Version speichern
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          Eine neue Version heißt „{neuerName(offen.name)}“ – die vorhandene Datei bleibt dann unverändert.
        </Text>
        <Group justify="space-between">
          {offen.mehrere ? (
            <Checkbox size="xs" label="Für alle weiteren Dateien" checked={alle} onChange={(e) => setAlle(e.currentTarget.checked)} />
          ) : (
            <span />
          )}
          <Button variant="subtle" size="xs" onClick={() => schliessen(null)}>
            Abbrechen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

const neuerName = (name: string): string => {
  const punkt = name.lastIndexOf('.')
  return punkt > 0 ? `${name.slice(0, punkt)} (2)${name.slice(punkt)}` : `${name} (2)`
}

/** Einmal beim Start (main.tsx): window.api fragt bei „gibt es schon" hier nach */
export function installiereVorhandenFrage(): void {
  window.api?.vermittlung?.vorhandenWahl((name, ort) => frageVorhanden(name, ort))
}
