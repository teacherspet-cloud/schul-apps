import { Alert, Badge, Button, Group, List, SegmentedControl, Stack, Text, TextInput } from '@mantine/core'
import { IconAlertTriangle, IconCheck, IconDeviceDesktop, IconPlugConnected } from '@tabler/icons-react'
import { useState } from 'react'
import { AI_PROVIDERS, SUBSCRIPTIONS, type AppSettings, type DeepPartial, type PcKiEinstellungen, type PcKiTest } from '@shared/types'
import { notifyError } from '../shared/util'
import { ersetzeTailscaleIp, zeigtAufTailscaleIp } from '../shared/pcAdresse'

/**
 * „Abo über den PC" in der iPad-App (30.09.2026).
 *
 * Den Abo-Zugang (ChatGPT Plus, Claude Pro …) gibt es nur über die offiziellen Programme der
 * Anbieter, und die laufen nur am PC. Die iPad-App reicht ihre KI-Aufrufe deshalb auf Wunsch
 * an Schul-Apps am PC weiter (src/mobil/pcKi.ts); der PC erzeugt mit seinem Zugang.
 *
 * Eine Karte je Zweck (Texte, Bilder, Hörtexte) wählt getrennt, ob sie über den PC läuft. Die
 * Verbindung selbst – Adresse und PIN – ist EINE und steht in jeder dieser Karten gleich da,
 * damit jeder Schritt des Einrichtungsassistenten für sich funktioniert.
 */

type Update = (patch: DeepPartial<AppSettings>) => Promise<void>
export type PcKiGruppe = 'texte' | 'bilder' | 'hoertexte'

export const PC_WERT = 'pc'

/** Einen Teil der Verbindung ändern – die Einstellungen führen ihn mit dem Rest zusammen (storage/settings.ts) */
const setzePcKi = (update: Update, teil: Partial<PcKiEinstellungen>): Promise<void> => update({ pcKi: teil } as DeepPartial<AppSettings>)

/** Die Wahl „API-Schlüssel" bzw. „über den PC" für einen Zweck */
export function PcKiWahl({
  settings,
  update,
  gruppe,
  lokal = 'API-Schlüssel'
}: {
  settings: AppSettings
  update: Update
  gruppe: PcKiGruppe
  lokal?: string
}): React.JSX.Element {
  const aktiv = Boolean(settings.pcKi?.[gruppe])
  return (
    <SegmentedControl
      value={aktiv ? PC_WERT : 'lokal'}
      onChange={(v) => void setzePcKi(update, { [gruppe]: v === PC_WERT })}
      data={[
        { value: 'lokal', label: lokal },
        { value: PC_WERT, label: 'Abo über den PC (WLAN)' }
      ]}
    />
  )
}

/** Adresse und PIN des PCs, „Verbindung testen" und die Voraussetzungen */
export function PcKiVerbindung({ settings, update }: { settings: AppSettings; update: Update }): React.JSX.Element {
  const e: Partial<PcKiEinstellungen> = settings.pcKi ?? {}
  const [pruefe, setPruefe] = useState(false)
  const [ergebnis, setErgebnis] = useState<PcKiTest | null>(null)
  const [fehler, setFehler] = useState('')
  const [ersetzt, setErsetzt] = useState('')

  /*
   * Eine Tailscale-IP (100.x) erreicht die iPad-App nicht – iOS lässt unverschlüsseltes HTTP nur
   * zu Namen auf „.ts.net" zu (30.09.2026). Ist der Name vom PC bekannt, wird die IP ersetzt;
   * sonst steht unter dem Feld, wo der Name zu finden ist. Ersetzt wird erst beim Verlassen des
   * Felds bzw. beim Testen, nicht mitten im Tippen.
   */
  const tailscaleErsetzen = async (adresse: string): Promise<string> => {
    const neu = ersetzeTailscaleIp(adresse, e.tailscaleAdresse)
    if (!neu) return adresse
    setErsetzt(adresse)
    await setzePcKi(update, { adresse: neu })
    return neu
  }
  const tailscaleIp = zeigtAufTailscaleIp(e.adresse ?? '')

  const testen = async (): Promise<void> => {
    setPruefe(true)
    setFehler('')
    setErgebnis(null)
    try {
      const adresse = await tailscaleErsetzen(e.adresse ?? '')
      const res = await window.api.pcKi.testen(adresse, e.pin ?? '')
      setErgebnis(res)
      // Die Adresse in der Form speichern, in der sie funktioniert hat – und den Tailscale-Namen, falls der PC ihn nennt
      if (res.adresse !== adresse || (res.tailscale && res.tailscale !== e.tailscaleAdresse)) {
        await setzePcKi(update, {
          adresse: res.adresse,
          ...(res.tailscale ? { tailscaleAdresse: res.tailscale } : {})
        })
      }
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err))
    } finally {
      setPruefe(false)
    }
  }

  return (
    <Stack gap="sm">
      <Group align="flex-end" gap="sm" wrap="wrap">
        <TextInput
          style={{ flex: '1 1 260px' }}
          label="Adresse des PCs"
          description="Steht am PC unter Einstellungen › Netzwerk, z. B. 192.168.1.24:8420 – von unterwegs die Tailscale-Adresse (Name auf „.ts.net“)."
          placeholder="192.168.1.24:8420"
          value={e.adresse ?? ''}
          onChange={(ev) => {
            setErsetzt('')
            void setzePcKi(update, { adresse: ev.currentTarget.value.trim() })
          }}
          onBlur={(ev) => void tailscaleErsetzen(ev.currentTarget.value.trim()).catch(notifyError)}
          error={
            tailscaleIp
              ? 'Tailscale-IP-Adressen (100.x) lässt iOS nicht zu. Gebraucht wird der Name auf „.ts.net“ – er steht am PC unter Einstellungen › Netzwerk.'
              : undefined
          }
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="url"
        />
        <TextInput
          label="PIN"
          description="Sechs Ziffern, ebenfalls unter Einstellungen › Netzwerk."
          value={e.pin ?? ''}
          onChange={(ev) => void setzePcKi(update, { pin: ev.currentTarget.value.replace(/\D/g, '').slice(0, 6) })}
          inputMode="numeric"
          maxLength={6}
          styles={{ input: { width: 130, letterSpacing: 3, fontFamily: 'monospace' } }}
        />
        <Button
          variant="light"
          leftSection={<IconPlugConnected size={16} />}
          loading={pruefe}
          disabled={!e.adresse || (e.pin ?? '').length !== 6}
          onClick={() => void testen().catch(notifyError)}
        >
          Verbindung testen
        </Button>
      </Group>

      {ersetzt && (
        <Text size="xs" c="dimmed">
          Die Tailscale-IP {ersetzt} wurde durch den Namen des PCs ersetzt – nur diesen lässt iOS ohne Verschlüsselung zu.
        </Text>
      )}
      {ergebnis && <TestErgebnis ergebnis={ergebnis} />}
      {fehler && (
        <Alert color="red" icon={<IconAlertTriangle size={16} />} title="Keine Verbindung zum PC">
          {fehler}
        </Alert>
      )}

      <List size="xs" c="dimmed" spacing={2} icon={<IconDeviceDesktop size={13} />}>
        <List.Item>Der PC erzeugt mit seinem Zugang – Abo oder API-Schlüssel. Das iPad schickt nur den Auftrag und bekommt das Ergebnis.</List.Item>
        <List.Item>Schul-Apps muss am PC laufen, und dort muss unter Einstellungen › Netzwerk der Zugang eingeschaltet sein.</List.Item>
        <List.Item>
          iPad und PC im selben WLAN – oder beide mit Tailscale verbunden, dann klappt es auch von unterwegs. Viele Schul-WLANs trennen Geräte voneinander;
          dann hilft ebenfalls Tailscale.
        </List.Item>
      </List>
    </Stack>
  )
}

function TestErgebnis({ ergebnis }: { ergebnis: PcKiTest }): React.JSX.Element {
  const { status, abo } = ergebnis
  const anbieter = AI_PROVIDERS.find((p) => p.id === status.textProvider)?.label ?? status.textProvider
  const weg = status.textAccess === 'subscription' ? `Abo (${SUBSCRIPTIONS[status.textProvider].plan})` : 'API-Schlüssel'
  const aboAbgemeldet = status.textAccess === 'subscription' && abo?.loggedIn === false
  return (
    <Alert color={status.hasTextKey && !aboAbgemeldet ? 'teal' : 'yellow'} icon={<IconCheck size={16} />} title="Verbindung zum PC steht">
      <Stack gap={4}>
        <Group gap={6}>
          <Text size="sm">
            Schul-Apps {ergebnis.fassung} am PC · Texte: {anbieter} über {weg}
            {status.textModel ? ` · ${status.textModel}` : ''}
          </Text>
          {status.textAccess === 'subscription' && abo && (
            <Badge size="xs" color={abo.loggedIn === false ? 'red' : 'teal'} variant="light">
              {abo.loggedIn === false ? 'Abo nicht angemeldet' : abo.loggedIn ? 'Abo angemeldet' : 'Abo eingerichtet'}
            </Badge>
          )}
        </Group>
        <Text size="sm">
          Bilder: {status.imageProvider === 'none' ? 'am PC keine Bild-KI gewählt' : status.hasImageKey ? 'eingerichtet' : 'am PC noch nicht eingerichtet'} · Hörtexte:{' '}
          {status.hasTts ? 'eingerichtet' : 'am PC ohne Schlüssel'}
        </Text>
        {!status.hasTextKey && <Text size="sm">Am PC ist noch kein KI-Zugang eingerichtet – das geschieht dort unter Einstellungen › KI-Zugang.</Text>}
        {aboAbgemeldet && <Text size="sm">Das Abo-Programm am PC ist nicht angemeldet – die Anmeldung geschieht am PC unter Einstellungen › KI-Zugang.</Text>}
      </Stack>
    </Alert>
  )
}
