import { useState } from 'react'
import { Alert, Button, Checkbox, PasswordInput, Stack, Text } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { senden } from '../modules/onlinetest/serverApi'
import { serverIch } from './plattform'

/**
 * Eigenes Passwort ändern (Server, 03.10.2026) – für Lehrkräfte, Admin und Lernende gleich.
 * IServ-Konten haben hier kein Passwort: das verwaltet IServ.
 */
export function PasswortAendern({ fertig }: { fertig?: () => void }): React.JSX.Element {
  const ich = serverIch()
  const [alt, setAlt] = useState('')
  const [neu, setNeu] = useState('')
  const [neu2, setNeu2] = useState('')
  const [andere, setAndere] = useState(true)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<{ text: string; feld?: string } | null>(null)
  const [ok, setOk] = useState(false)
  if (ich?.quelle === 'iserv')
    return (
      <Text size="sm" c="dimmed">
        Die Anmeldung läuft über IServ – das Passwort wird deshalb in IServ geändert.
      </Text>
    )
  if (ok)
    return (
      <Alert color="green" icon={<IconCheck />} title="Passwort geändert" data-passwort-ok>
        Ab jetzt gilt das neue Passwort{andere ? ' – andere Geräte sind abgemeldet' : ''}.
        {fertig && (
          <Button mt="sm" size="xs" variant="light" display="block" onClick={fertig}>
            Schließen
          </Button>
        )}
      </Alert>
    )
  const kurz = neu.length > 0 && neu.length < 10
  const ungleich = neu2.length > 0 && neu !== neu2
  const absenden = async (): Promise<void> => {
    setLaeuft(true)
    setFehler(null)
    try {
      await senden('/konto/passwort', { alt, neu, neu2, andereAbmelden: andere })
      setOk(true)
    } catch (e) {
      setFehler({ text: e instanceof Error ? e.message : String(e), feld: /bisherige/.test(String(e)) ? 'alt' : 'neu' })
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void absenden()
      }}
    >
      <Stack gap="sm" data-passwort-aendern>
        <PasswordInput
          label="Bisheriges Passwort"
          autoComplete="current-password"
          value={alt}
          onChange={(e) => setAlt(e.currentTarget.value)}
          error={fehler?.feld === 'alt' ? fehler.text : undefined}
          data-pw-alt
        />
        <PasswordInput
          label="Neues Passwort"
          description="Mindestens 10 Zeichen – ein Satz aus mehreren Wörtern ist gut zu merken."
          autoComplete="new-password"
          value={neu}
          onChange={(e) => setNeu(e.currentTarget.value)}
          error={kurz ? 'Noch zu kurz.' : undefined}
          data-pw-neu
        />
        <PasswordInput
          label="Neues Passwort wiederholen"
          autoComplete="new-password"
          value={neu2}
          onChange={(e) => setNeu2(e.currentTarget.value)}
          error={ungleich ? 'Stimmt noch nicht überein.' : undefined}
          data-pw-neu2
        />
        <Checkbox label="Auf anderen Geräten abmelden" checked={andere} onChange={(e) => setAndere(e.currentTarget.checked)} />
        {fehler && fehler.feld !== 'alt' && <Alert color="red">{fehler.text}</Alert>}
        <Button type="submit" w="fit-content" loading={laeuft} disabled={!alt || neu.length < 10 || neu !== neu2} data-pw-speichern>
          Passwort ändern
        </Button>
      </Stack>
    </form>
  )
}
