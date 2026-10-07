/**
 * „Als Schüler ansehen" (06.10.2026, abgestimmt mit der Lehrkraft): Musterschüler-Vorschau der ganzen Klasse
 * (alle Fächer gleichen Namens, server/vorschau.ts).
 *
 * Der Lernstand des Musterschülers ist beim Öffnen wählbar (neu / fleißig, noch unsicher / erfolgreich / länger nicht da –
 * oder der Stand von zuletzt). Das Fenster öffnet neben der App (Exe „Schul-Apps Online": eigenes Fenster, Browser:
 * Pop-up) mit dem Streifen „Vorschau als Musterschüler 7a", Umschalter Tablet / Handy / PC und „Zurücksetzen". Die
 * Haupt-App bleibt bedienbar und angemeldet: Das Fenster meldet sich mit einem eigenen, kurzlebigen Schlüssel an.
 */
import { Button, Popover, Radio, Stack, Text } from '@mantine/core'
import { IconEye } from '@tabler/icons-react'
import { useState } from 'react'
import { useProgrammFarbe } from '../../shared/components/AppKopf'
import { aufIos } from '../../shared/plattform'
import { notifyError } from '../../shared/util'
import { senden } from '../onlinetest/serverApi'

const WAHL = [
  { wert: 'neu', text: 'Neu – noch nichts geübt' },
  { wert: 'fleissig', text: 'Fleißig, noch unsicher' },
  { wert: 'erfolgreich', text: 'Erfolgreich' },
  { wert: 'inaktiv', text: 'Länger nicht da' },
  { wert: 'behalten', text: 'Stand von zuletzt behalten' }
] as const

export function AlsSchuelerAnsehen({ gruppe, klasse }: { gruppe: string; klasse: string }): React.JSX.Element {
  const farbe = useProgrammFarbe()
  const [offen, setOffen] = useState(false)
  const [wahl, setWahl] = useState<string>('neu')
  const [laeuft, setLaeuft] = useState(false)

  const oeffnen = async (): Promise<void> => {
    const name = `schulapps-vorschau-${klasse.replace(/[^a-z0-9]/gi, '') || 'klasse'}`
    const merkmale = 'popup,width=1180,height=900'
    // Fenster gleich im Klick öffnen (sonst blockt der Browser das Pop-up), die Adresse folgt nach der Anmeldung
    const fenster = !aufIos() && typeof window.open === 'function' ? window.open('', name, merkmale) : null
    setLaeuft(true)
    try {
      const r = await senden<{ adresse: string }>(`/server/klassen/${encodeURIComponent(gruppe)}/vorschau`, wahl === 'behalten' ? {} : { zustand: wahl })
      const ziel = new URL(r.adresse, window.location.origin).href
      setOffen(false)
      if (fenster && !fenster.closed) {
        fenster.location.href = ziel
        fenster.focus()
      } else if (!window.open(ziel, name, merkmale)) window.location.assign(ziel)
    } catch (e) {
      fenster?.close()
      notifyError(e)
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <Popover opened={offen} onChange={setOffen} position="bottom-end" withinPortal shadow="md">
      <Popover.Target>
        <Button variant="light" color={farbe} radius="xl" leftSection={<IconEye size={16} />} onClick={() => setOffen((o) => !o)} data-als-schueler>
          Als Schüler ansehen
        </Button>
      </Popover.Target>
      <Popover.Dropdown maw={320}>
        <Stack gap="sm">
          <Radio.Group label="Lernstand des Musterschülers" value={wahl} onChange={setWahl}>
            <Stack gap={6} mt={6}>
              {WAHL.map((w) => (
                <Radio key={w.wert} value={w.wert} label={w.text} data-vorschau-wahl={w.wert} />
              ))}
            </Stack>
          </Radio.Group>
          <Text size="xs" c="dimmed">
            Der Musterschüler sieht alle Freigaben der Klasse {klasse} und kann alles bearbeiten und abgeben – er zählt in keiner Auswertung, Liste oder
            Note.
          </Text>
          <Button color={farbe} loading={laeuft} onClick={() => void oeffnen()} data-vorschau-oeffnen>
            Vorschau öffnen
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
