import { Alert, Badge, Button, Card, Code, CopyButton, Group, List, NumberInput, Stack, Switch, Text, TextInput, Title } from '@mantine/core'
import { IconAlertTriangle, IconCheck, IconCopy, IconDeviceTablet, IconRefresh } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { AppSettings } from '@shared/types'
import type { LanStatus } from '../../../main/services/lanServer'
import { qrDataUrl } from '../modules/arbeitsblatt/render/qr'
import { useAppSettings } from '../shared/settingsStore'
import { notifyError } from '../shared/util'

/**
 * Zugriff aus dem lokalen Netz.
 *
 * Bewusst nüchtern gehalten: Der Schalter ist aus, bis man ihn einschaltet, und beim Beenden
 * des Programms wieder aus. Was unter „Gut zu wissen" steht, sind keine Warnhinweise
 * zur Zierde – es sind die drei Dinge, an denen es in der Praxis scheitert, und die sonst wie
 * ein Fehler des Programms aussähen.
 */
export default function NetzwerkCard({
  settings,
  update
}: {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => Promise<void>
}): React.JSX.Element {
  const [status, setStatus] = useState<LanStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const port = settings.lan?.port ?? 8420
  const pin = settings.lan?.pin ?? ''
  const laeuft = Boolean(status?.laeuft)

  const wuerfeln = (): string => String(Math.floor(100000 + Math.random() * 900000))

  useEffect(() => {
    window.api.lan.status().then(setStatus).catch(notifyError)
    /*
     * Es gibt IMMER eine PIN – auch bevor der Zugang je lief.
     *
     * Vorher entstand sie erst beim Einschalten, und zwar im Hauptprozess: In den
     * Einstellungen stand solange nichts, also war sie weder zu sehen noch zu ändern.
     * Wer wissen wollte, was er auf dem Tablet eingeben muss, musste den Zugang erst
     * einschalten – und sah dann trotzdem ein leeres Feld.
     */
    if (!settings.lan?.pin) void update({ lan: { port: settings.lan?.port ?? 8420, pin: wuerfeln() } })
    // Nur beim Öffnen der Einstellungen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const schalten = async (an: boolean): Promise<void> => {
    setBusy(true)
    try {
      setStatus(an ? await window.api.lan.start() : await window.api.lan.stop())
      // Der Start kann die PIN im Hauptprozess anlegen – die Einstellungen danach neu lesen
      await useAppSettings.getState().load()
    } catch (e) {
      notifyError(e, 'Der Zugang ließ sich nicht umschalten')
    } finally {
      setBusy(false)
    }
  }

  /**
   * PIN ändern.
   *
   * Läuft der Zugang, wird er dabei abgeschaltet: Sonst gälte weiterhin die alte PIN, die
   * angemeldeten Geräte blieben drin, und die neue wäre eine Scheinsicherheit.
   */
  const setzePin = async (wert: string): Promise<void> => {
    const sauber = wert.replace(/\D/g, '').slice(0, 6)
    await update({ lan: { port, pin: sauber } })
    if (laeuft && sauber.length === 6) {
      setStatus(await window.api.lan.stop())
    }
  }

  return (
    <Stack gap="lg">
      <Card withBorder padding="lg">
        <Group justify="space-between" mb={4}>
          <Title order={4}>Zugriff aus dem Netz</Title>
          {laeuft && (
            <Badge color="green" variant="light">
              läuft{status?.angemeldet ? ` · ${status.angemeldet} Gerät(e) angemeldet` : ''}
            </Badge>
          )}
        </Group>
        <Text size="sm" c="dimmed" mb="md">
          Die Programme lassen sich im Browser eines anderen Geräts im selben Netz öffnen – Tablet, Handy, zweiter Rechner – und dort Arbeitsblätter erstellen.
          Gerechnet wird weiterhin auf diesem Rechner.
        </Text>

        <Switch
          label="Zugang einschalten"
          description="Läuft nur, solange er eingeschaltet ist, und ist nach dem Beenden des Programms wieder aus."
          checked={laeuft}
          disabled={busy}
          onChange={(e) => void schalten(e.currentTarget.checked)}
        />

        {laeuft && status && (
          <Stack gap="sm" mt="md">
            <Group align="flex-start" wrap="nowrap" gap="lg">
              <div>
                <Text size="sm" fw={500} mb={4}>
                  Adresse auf dem Gerät öffnen
                </Text>
                <Group gap="xs">
                  <Code style={{ fontSize: 15 }}>{status.adresse}</Code>
                  <CopyButton value={status.adresse}>
                    {({ copied, copy }) => (
                      <Button size="compact-xs" variant="light" leftSection={copied ? <IconCheck size={13} /> : <IconCopy size={13} />} onClick={copy}>
                        {copied ? 'Kopiert' : 'Kopieren'}
                      </Button>
                    )}
                  </CopyButton>
                </Group>
              </div>
              {/* Abtippen entfällt: Die Kamera des Tablets genügt */}
              <div style={{ textAlign: 'center' }}>
                <img src={qrDataUrl(status.adresse, 35)} alt={`QR-Code für ${status.adresse}`} width={132} height={132} />
                <Text size="xs" c="dimmed">
                  scannen
                </Text>
              </div>
            </Group>
            {/*
             * Der Wunschport war belegt. Das passiert vor allem, wenn Schul-Apps noch ein
             * zweites Mal läuft – dann hört die ältere Fassung weiter auf 8420, und das
             * Tablet landet unbemerkt bei ihr. Deshalb steht es hier deutlich.
             */}
            {status.port !== status.wunschPort && (
              <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
                Port {status.wunschPort} war belegt – der Zugang läuft auf {status.port}. Läuft Schul-Apps vielleicht noch ein zweites Mal? Dann beantwortet die
                ältere Fassung weiterhin Port {status.wunschPort}. Diese Fassung beenden und den Zugang neu einschalten.
              </Alert>
            )}
            {status.gesperrt && (
              <Alert color="red" icon={<IconAlertTriangle size={16} />}>
                Der Zugang ist nach zu vielen Fehlversuchen gesperrt. Zum Entsperren aus- und wieder einschalten.
              </Alert>
            )}
          </Stack>
        )}

        {/*
         * Die PIN steht IMMER hier – auch wenn der Zugang aus ist. Wer wissen will, was er
         * auf dem Tablet eingeben muss, soll nicht erst etwas einschalten müssen.
         */}
        <Group align="flex-end" gap="sm" mt="md">
          <TextInput
            label="PIN für die Anmeldung am Gerät"
            description={laeuft ? 'Ändern schaltet den Zugang ab und meldet alle Geräte ab.' : 'Sechs Ziffern, frei wählbar.'}
            value={pin}
            onChange={(e) => void setzePin(e.currentTarget.value)}
            inputMode="numeric"
            maxLength={6}
            error={pin.length > 0 && pin.length < 6 ? 'Sechs Ziffern' : undefined}
            styles={{ input: { fontSize: 22, letterSpacing: 4, width: 160, fontFamily: 'monospace' } }}
          />
          <Button
            variant="light"
            leftSection={<IconRefresh size={14} />}
            onClick={() => void setzePin(wuerfeln())}
            mb={pin.length > 0 && pin.length < 6 ? 26 : 4}
          >
            Zufällige PIN
          </Button>
        </Group>

        <NumberInput
          label="Port"
          description="Nur ändern, wenn ein anderes Programm diesen Port belegt."
          min={1024}
          max={65535}
          value={port}
          onChange={(v) => void update({ lan: { port: Number(v) || 8420, pin } })}
          disabled={laeuft}
          mt="md"
          style={{ maxWidth: 220 }}
        />
      </Card>

      <Card withBorder padding="lg">
        <Title order={4} mb="sm">
          Gut zu wissen
        </Title>
        <List spacing="xs" size="sm" icon={<IconDeviceTablet size={16} />}>
          <List.Item>
            <b>Nur im selben Netz, nur während dieses Programm läuft.</b> Von außerhalb ist nichts erreichbar; es gibt keinen Cloud-Dienst.
          </List.Item>
          <List.Item>
            <b>Es ist dasselbe Programm.</b> Eine gemeinsame Bibliothek, ein KI-Kontingent – das dieses Rechners. Wer vom Tablet aus erstellt, verbraucht
            dasselbe Guthaben.
          </List.Item>
          <List.Item>
            <b>Vom Gerät aus geht nicht alles.</b> API-Schlüssel, Dateien dieses Rechners und das Löschen von Material bleiben gesperrt. Arbeitsblätter
            erstellen und speichern, gespeichertes Material ansehen und als Word oder PDF herunterladen: ja.
          </List.Item>
          <List.Item>
            <b>Im Schul-WLAN klappt es oft nicht.</b> Viele Schulnetze trennen die Geräte voneinander („Client Isolation"). Dann ist die Adresse vom Tablet aus
            nicht erreichbar, obwohl hier alles richtig eingestellt ist. Zu Hause funktioniert es in der Regel.
          </List.Item>
          <List.Item>
            <b>Windows fragt beim ersten Einschalten</b> nach einer Freigabe durch die Firewall. Ohne „Zulassen" kommt keine Verbindung zustande.
          </List.Item>
          <List.Item>
            <b>Die Verbindung ist unverschlüsselt.</b> Im lokalen Netz ist das üblich; ein eigenes Zertifikat würde in jedem Browser eine Warnung erzeugen. Wer
            im selben Netz mitliest, könnte die PIN sehen – den Zugang deshalb ausschalten, wenn er nicht gebraucht wird.
          </List.Item>
        </List>
      </Card>
    </Stack>
  )
}
