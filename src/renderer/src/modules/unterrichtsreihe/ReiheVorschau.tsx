/**
 * „Als Schüler ansehen" im Reihen-Editor (08.10.2026, Plan G.1): die ECHTE Schülerseite der Reihe als Musterschüler –
 * dasselbe Fenster wie in „Meine Klassen" (server/vorschau.ts, Streifen mit Tablet/Handy/PC und Zurücksetzen). Der
 * Server nimmt den Musterschüler der Klasse, der die Reihe zugewiesen ist, sonst ein eigenes Vorschaukonto mit einer
 * unsichtbaren Zuweisung (reihen.ts `POST /server/reihen/<id>/vorschau`). Der frühere Ablauf-Simulator bleibt im
 * Expertenmodus als „Ablauf testen".
 */
import { Button, Popover, Radio, Stack, Text } from '@mantine/core'
import { IconEye } from '@tabler/icons-react'
import { useState } from 'react'
import type { Reihe } from '@shared/reihe'
import { aufIos } from '../../shared/plattform'
import { notifyError } from '../../shared/util'
import { senden } from '../onlinetest/serverApi'

const WAHL = [
  { wert: 'neu', text: 'Von vorn – noch nichts bearbeitet' },
  { wert: 'behalten', text: 'Stand von zuletzt behalten' }
] as const

export function ReiheAlsSchueler({
  reihe,
  speichernVorher,
  platzhalter
}: {
  reihe: Reihe
  /** Die Reihe muss gespeichert sein – liefert den gespeicherten Stand */
  speichernVorher: () => Promise<Reihe | null>
  /** Zahl der noch leeren Platzhalter (sieht der Musterschüler nicht) */
  platzhalter: number
}): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const [wahl, setWahl] = useState<string>('neu')
  const [laeuft, setLaeuft] = useState(false)

  const oeffnen = async (): Promise<void> => {
    const name = `schulapps-vorschau-reihe-${(reihe.id || 'neu').replace(/[^a-z0-9]/gi, '')}`
    const merkmale = 'popup,width=1180,height=900'
    // Fenster gleich im Klick öffnen (sonst blockt der Browser das Pop-up), die Adresse folgt nach dem Speichern
    const fenster = !aufIos() && typeof window.open === 'function' ? window.open('', name, merkmale) : null
    setLaeuft(true)
    try {
      const r = await speichernVorher()
      if (!r?.id) throw new Error('Die Reihe ließ sich nicht speichern.')
      const a = await senden<{ adresse: string }>(`/server/reihen/${encodeURIComponent(r.id)}/vorschau`, wahl === 'behalten' ? {} : { zustand: wahl })
      const ziel = new URL(a.adresse, window.location.origin).href
      setOffen(false)
      if (fenster && !fenster.closed) {
        fenster.location.href = ziel
        fenster.focus()
      } else if (!window.open(ziel, name, merkmale)) window.location.assign(ziel)
    } catch (e) {
      fenster?.close()
      notifyError(e, 'Vorschau nicht geöffnet')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <Popover opened={offen} onChange={setOffen} position="bottom-end" withinPortal shadow="md">
      <Popover.Target>
        <Button
          variant="default"
          leftSection={<IconEye size={16} />}
          disabled={!reihe.schritte.length || !reihe.titel.trim()}
          onClick={() => setOffen((o) => !o)}
          data-schuelervorschau
        >
          Als Schüler ansehen
        </Button>
      </Popover.Target>
      <Popover.Dropdown maw={340}>
        <Stack gap="sm">
          <Radio.Group label="Fortschritt des Musterschülers" value={wahl} onChange={setWahl}>
            <Stack gap={6} mt={6}>
              {WAHL.map((w) => (
                <Radio key={w.wert} value={w.wert} label={w.text} data-reihe-vorschau-wahl={w.wert} />
              ))}
            </Stack>
          </Radio.Group>
          <Text size="xs" c="dimmed">
            Die echte Schülerseite: Arbeitsblätter ausfüllen, abgeben, KI-Feedback, Freischaltungen – als Musterschüler, der in keiner Auswertung zählt.
            {platzhalter > 0 ? ` ${platzhalter} ${platzhalter === 1 ? 'Platzhalter fehlt' : 'Platzhalter fehlen'} dort, bis sie erstellt sind.` : ''}
          </Text>
          <Button loading={laeuft} onClick={() => void oeffnen()} data-vorschau-oeffnen>
            Vorschau öffnen
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
