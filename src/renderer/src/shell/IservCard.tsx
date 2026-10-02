import { Alert, Anchor, Badge, Breadcrumbs, Button, Card, Checkbox, Group, Loader, PasswordInput, Select, Stack, Text, TextInput, Title, UnstyledButton } from '@mantine/core'
import { IconCloudUpload, IconFolder, IconLock, IconPlugConnected, IconUnlink } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { anzeigeTeil, inGruppenordner, iservAdressFehler, iservAnzeige, ISERV_STANDARD_ZIEL, pfadTeile, type DavEintrag } from '@shared/iserv'
import { SCHULMATERIAL } from '@shared/schulmaterial'
import type { AppSettings, AusgabeOrt, DeepPartial } from '@shared/types'
import { aufIos } from '../shared/plattform'
import { useAppSettings } from '../shared/settingsStore'
import { notifyError, notifySuccess } from '../shared/util'

/**
 * IServ verbinden (01.10.2026) – Einstellungen › Material und Schritt „Ablage" des
 * Einrichtungsassistenten; in der iPad-App und seit 02.10.2026 auch in der App am PC (dort liegt
 * das Passwort verschlüsselt in secrets.json, Windows-Datenschutz-API). Mit Verbindung lassen
 * sich Dateien auch VON IServ öffnen (shared/export/eingabeOrt.tsx).
 *
 * Schuladresse, Benutzername, Passwort → „Verbindung testen" (PROPFIND auf webdav.<domain>
 * bzw. <domain>/webdav, main/services/iserv). Das Passwort geht erst nach erfolgreicher Anmeldung
 * in den Schlüsselbund – als eigener Eintrag, nie in die Einstellungen. Danach: Ordner auf IServ
 * wählen (Eigene Dateien, Gruppen) und festlegen, wohin Material beim Speichern geht.
 */
export default function IservCard({
  settings,
  update
}: {
  settings: AppSettings
  update: (patch: DeepPartial<AppSettings>) => Promise<void>
}): React.JSX.Element {
  const gespeichert = settings.iserv
  const verbunden = Boolean(gespeichert?.basis)
  const [schule, setSchule] = useState(gespeichert?.schule ?? '')
  const [benutzer, setBenutzer] = useState(gespeichert?.benutzer ?? '')
  const [passwort, setPasswort] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [waehlen, setWaehlen] = useState(false)

  const adressFehler = schule.trim() ? iservAdressFehler(schule) : null
  const ziel = gespeichert?.ziel || ISERV_STANDARD_ZIEL

  const verbinden = async (): Promise<void> => {
    setLaeuft(true)
    setFehler(null)
    try {
      await window.api.iserv.verbinden({ schule, benutzer, ...(passwort ? { passwort } : {}) })
      setPasswort('')
      await useAppSettings.getState().load()
      notifySuccess('Die Anmeldung bei IServ hat geklappt.', 'IServ verbunden')
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    } finally {
      setLaeuft(false)
    }
  }

  const trennen = async (): Promise<void> => {
    try {
      await window.api.iserv.trennen()
      await useAppSettings.getState().load()
      setWaehlen(false)
    } catch (e) {
      notifyError(e, 'IServ ließ sich nicht trennen')
    }
  }

  const ort = settings.ausgabeOrt ?? (verbunden ? 'fragen' : 'geraet')
  const ios = aufIos()

  return (
    <Card withBorder padding="lg" data-iserv-karte>
      <Group justify="space-between" mb={4}>
        <Title order={4}>IServ</Title>
        {verbunden ? (
          <Badge color="green" leftSection={<IconPlugConnected size={12} />} data-iserv-verbunden>
            verbunden
          </Badge>
        ) : (
          <Badge color="gray">nicht verbunden</Badge>
        )}
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        Mit dem IServ-Zugang der Schule speichert die App Material direkt in die Ordner auf IServ – in „Eigene Dateien“ oder einen Gruppenordner, geordnet nach
        Fach und Themenbereich – und öffnet Dateien aus diesen Ordnern. Voraussetzung: Die Schule hat das IServ-Modul „WebDAV“ freigeschaltet.
      </Text>
      <Stack gap="xs">
        <TextInput
          label="Adresse der Schule"
          description="Die IServ-Adresse, z. B. meineschule.de (wie beim Anmelden im Browser)"
          placeholder="meineschule.de"
          value={schule}
          onChange={(e) => setSchule(e.currentTarget.value)}
          error={adressFehler}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          data-iserv-schule
        />
        <TextInput
          label="Benutzername"
          description="Meist vorname.nachname, klein, Umlaute umschrieben (ü → ue)"
          placeholder="vorname.nachname"
          value={benutzer}
          onChange={(e) => setBenutzer(e.currentTarget.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          data-iserv-benutzer
        />
        <PasswordInput
          label="Passwort"
          description={
            verbunden
              ? ios
                ? 'Gespeichert im Schlüsselbund dieses Geräts – leer lassen, um es zu behalten.'
                : 'Verschlüsselt auf diesem PC gespeichert – leer lassen, um es zu behalten.'
              : 'Das IServ-Passwort; ein Code der Zwei-Faktor-Anmeldung wird nicht gebraucht.'
          }
          placeholder={verbunden ? '••••••••' : ''}
          value={passwort}
          onChange={(e) => setPasswort(e.currentTarget.value)}
          leftSection={<IconLock size={14} />}
          data-iserv-passwort
        />
        <Group gap="xs">
          <Button
            leftSection={laeuft ? <Loader size={14} /> : <IconPlugConnected size={16} />}
            disabled={laeuft || !schule.trim() || Boolean(adressFehler) || !benutzer.trim() || (!passwort && !verbunden)}
            onClick={() => void verbinden()}
            data-iserv-testen
          >
            {verbunden ? 'Verbindung testen' : 'Verbinden'}
          </Button>
          {verbunden && (
            <Button variant="subtle" color="red" leftSection={<IconUnlink size={16} />} onClick={() => void trennen()} data-iserv-trennen>
              Trennen
            </Button>
          )}
        </Group>
        {fehler && (
          <Alert color="red" p="xs" data-iserv-fehler>
            <Text size="sm">{fehler}</Text>
          </Alert>
        )}

        {verbunden && (
          <>
            <Text size="sm" fw={600} mt="sm">
              Ziel auf IServ
            </Text>
            <Text size="sm" data-iserv-ziel>
              {iservAnzeige(ziel)} › Fach › Themenbereich
            </Text>
            <Group gap="xs">
              <Button variant="light" size="xs" leftSection={<IconFolder size={14} />} onClick={() => setWaehlen((w) => !w)} data-iserv-ordner-waehlen>
                {waehlen ? 'Ordnerauswahl schließen' : 'Anderen Ordner wählen …'}
              </Button>
            </Group>
            {waehlen && (
              <OrdnerWahl
                start={pfadTeile(ziel).slice(0, -1)}
                onWahl={(teile) => {
                  void update({ iserv: { schule: gespeichert?.schule ?? '', benutzer: gespeichert?.benutzer ?? '', ...gespeichert, ziel: teile.join('/') } })
                  setWaehlen(false)
                }}
              />
            )}
            {inGruppenordner(pfadTeile(ziel)) && (
              <Alert color="orange" p="xs">
                <Text size="xs">
                  Ein Gruppenordner ist für alle Mitglieder der Gruppe sichtbar. Material mit Namen von Schülerinnen und Schülern (Rückmeldungen, Listen) gehört in „Eigene
                  Dateien“ oder einen geschützten Ordner.
                </Text>
              </Alert>
            )}
          </>
        )}

        <Select
          mt="sm"
          label="Beim Speichern von Material"
          data={[
            { value: 'fragen', label: 'Jedes Mal fragen' },
            { value: 'geraet', label: ios ? 'Auf dem iPad (Schulmaterial)' : 'Auf diesem PC (Speichern-Dialog)' },
            ...(verbunden ? [{ value: 'iserv', label: 'Auf IServ' }] : []),
            ...(ios
              ? [
                  { value: 'dateien', label: 'Dateien-App (Ort wählen)' },
                  { value: 'teilen', label: 'Teilen-Menü' }
                ]
              : [])
          ]}
          value={ort === 'iserv' && !verbunden ? 'geraet' : ort}
          onChange={(v) => v && void update({ ausgabeOrt: v as AusgabeOrt | 'fragen' })}
          allowDeselect={false}
          data-iserv-ausgabe-ort
        />
        {verbunden && (
          <Select
            label="Beim Öffnen von Dateien"
            data={[
              { value: 'fragen', label: 'Jedes Mal fragen' },
              { value: 'geraet', label: ios ? 'Vom iPad' : 'Von diesem PC' },
              { value: 'iserv', label: 'Von IServ' }
            ]}
            value={settings.eingabeOrt ?? 'fragen'}
            onChange={(v) => v && void update({ eingabeOrt: v as 'fragen' | 'geraet' | 'iserv' })}
            allowDeselect={false}
            data-iserv-eingabe-ort
          />
        )}
        {!ios && (
          <Text size="xs" c="dimmed">
            <IconCloudUpload size={12} style={{ verticalAlign: 'middle' }} /> Die App spricht IServ direkt an – ein Netzlaufwerk in Windows ist dafür nicht
            nötig. Das Passwort liegt verschlüsselt nur auf diesem PC, nie in Einstellungen, Sicherungen, dem Protokoll oder auf einem Server. Mehr zur
            Einrichtung:{' '}
            <Anchor size="xs" href="https://doku.iserv.de/cookbook/external/webdav/" target="_blank" rel="noreferrer">
              IServ-Dokumentation zu WebDAV
            </Anchor>
            .
          </Text>
        )}
        {ios && (
          <Text size="xs" c="dimmed">
            <IconCloudUpload size={12} style={{ verticalAlign: 'middle' }} /> „Dateien-App“ öffnet den Speichern-Dialog von iOS: Dort steht jeder Ort zur Wahl,
            den die Dateien-App kennt – auch ein Anbieter, der IServ einbindet. Das Passwort liegt nur im Schlüsselbund dieses Geräts, nie in Einstellungen,
            Sicherungen oder dem Protokoll. Mehr zur Einrichtung:{' '}
            <Anchor size="xs" href="https://doku.iserv.de/cookbook/external/webdav/" target="_blank" rel="noreferrer">
              IServ-Dokumentation zu WebDAV
            </Anchor>
            .
          </Text>
        )}
      </Stack>
    </Card>
  )
}

/** Ordner auf IServ wählen: oben Eigene Dateien und Gruppen, darunter die Unterordner */
function OrdnerWahl({ start, onWahl }: { start: string[]; onWahl: (teile: string[]) => void }): React.JSX.Element {
  const [pfad, setPfad] = useState<string[]>(start)
  const [eintraege, setEintraege] = useState<DavEintrag[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [unterordner, setUnterordner] = useState(true)

  useEffect(() => {
    let weg = false
    setEintraege(null)
    setFehler(null)
    window.api.iserv
      .ordner(pfad.join('/'))
      .then((liste) => !weg && setEintraege(liste))
      .catch((e: unknown) => {
        if (weg) return
        // Den Startordner gibt es (noch) nicht – dann von oben
        if (pfad.length) setPfad([])
        else setFehler(e instanceof Error ? e.message : String(e))
      })
    return () => {
      weg = true
    }
  }, [pfad])

  const ziel = unterordner && pfad[pfad.length - 1] !== SCHULMATERIAL ? [...pfad, SCHULMATERIAL] : pfad
  return (
    <Card withBorder padding="sm" data-iserv-ordnerwahl>
      <Breadcrumbs separator="›" mb="xs">
        <Anchor size="sm" onClick={() => setPfad([])}>
          IServ
        </Anchor>
        {pfad.map((t, i) => (
          <Anchor key={i} size="sm" onClick={() => setPfad(pfad.slice(0, i + 1))}>
            {anzeigeTeil(t, i)}
          </Anchor>
        ))}
      </Breadcrumbs>
      {fehler && (
        <Text size="sm" c="red">
          {fehler}
        </Text>
      )}
      {!eintraege && !fehler && <Loader size="sm" />}
      {eintraege && (
        <Stack gap={2} mah={260} style={{ overflowY: 'auto' }}>
          {eintraege.length === 0 && (
            <Text size="sm" c="dimmed">
              Keine Unterordner.
            </Text>
          )}
          {eintraege.map((e) => (
            <UnstyledButton key={e.name} onClick={() => setPfad([...pfad, e.name])} py={4} data-iserv-eintrag={e.name}>
              <Group gap={6}>
                <IconFolder size={16} />
                <Text size="sm">{anzeigeTeil(e.name, pfad.length)}</Text>
              </Group>
            </UnstyledButton>
          ))}
        </Stack>
      )}
      {pfad.length > 0 && (
        <Stack gap="xs" mt="sm">
          <Checkbox
            size="xs"
            checked={unterordner}
            onChange={(e) => setUnterordner(e.currentTarget.checked)}
            label={`Darin den Ordner „${SCHULMATERIAL}“ verwenden (wird bei Bedarf angelegt)`}
          />
          <Button size="xs" onClick={() => onWahl(ziel)} data-iserv-hier>
            Hier speichern: {iservAnzeige(ziel)}
          </Button>
        </Stack>
      )}
    </Card>
  )
}
