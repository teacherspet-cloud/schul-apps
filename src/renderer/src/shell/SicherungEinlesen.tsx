import { Alert, Button, Group, List, Modal, Stack, Text } from '@mantine/core'
import { IconAlertTriangle, IconUpload } from '@tabler/icons-react'
import { useState } from 'react'
import { notifyError } from '../shared/util'

/**
 * Eine Sicherung wieder einlesen.
 *
 * Wunsch der Lehrkraft (25.09.2026): das Wiederherstellen nachholen, das beim Zurücksetzen auf
 * „später“ gestellt war. Es steht an zwei Stellen: im Reiter „Wartung“ und im
 * Einrichtungsassistenten – dort landet man nach einem Zurücksetzen ohnehin.
 *
 * Vor dem Schreiben zeigt die Rückfrage, was genau zurückkommt, und sagt, was dabei passiert:
 * Vorhandenes bleibt, Gleichnamiges wird ersetzt, die Einstellungen kommen aus der Sicherung.
 */
const NAMEN: Record<string, string> = {
  arbeitsblaetter: 'Arbeitsblätter',
  vokabeltests: 'Vokabeltests',
  klassenarbeiten: 'Klassenarbeiten',
  grammatiktests: 'Grammatiktests',
  lernzielkontrollen: 'Lernzielkontrollen',
  piktogramme: 'eigene Piktogramme',
  hoertexte: 'erzeugte Hörtexte'
}

const DATEI_NAMEN: Record<string, string> = {
  'settings.json': 'Einstellungen (Schule, Bundesland, Farbschema …)',
  'logo.png': 'Logo',
  'worksheet-designs.json': 'eigene Designvorlagen',
  'themenbereiche.json': 'Themenbereiche und Zuordnung der Materialien',
  'worksheet-designs-version.json': '',
  'model-cache.json': ''
}

type Vorschau = { erstellt: string; ordner: { ordner: string; eintraege: number }[]; dateien: string[] }

export default function SicherungEinlesen({ variant = 'light' }: { variant?: 'light' | 'subtle' }): React.JSX.Element {
  const [datei, setDatei] = useState<{ name: string; data: Uint8Array; vorschau: Vorschau } | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  const waehlen = async (): Promise<void> => {
    try {
      const f = await window.api.files.open([{ name: 'Sicherung', extensions: ['json'] }])
      if (!f) return
      const vorschau = await window.api.wartung.pruefen(f.data)
      setDatei({ name: f.name, data: f.data, vorschau })
    } catch (e) {
      notifyError(e, 'Die Sicherung konnte nicht gelesen werden')
    }
  }

  const einlesen = async (): Promise<void> => {
    if (!datei) return
    setLaeuft(true)
    try {
      await window.api.wartung.wiederherstellen(datei.data)
      /*
       * Die eingelesene Datei IST die jüngste bekannte Sicherung. Ohne diesen Eintrag erinnerte
       * die Startseite auf einem neuen Rechner gleich wieder ans Sichern – oder nannte das
       * Datum der Sicherung davor, das mit den Einstellungen in der Datei steckt.
       */
      if (datei.vorschau.erstellt && !Number.isNaN(Date.parse(datei.vorschau.erstellt)))
        await window.api.settings.set({ letzteSicherung: new Date(datei.vorschau.erstellt).toISOString() }).catch(() => undefined)
      // Wie beim Zurücksetzen: Nur ein Neuladen zeigt überall den neuen Stand
      window.location.reload()
    } catch (e) {
      notifyError(e, 'Die Sicherung konnte nicht eingelesen werden')
      setLaeuft(false)
    }
  }

  const v = datei?.vorschau
  const datum = v?.erstellt ? new Date(v.erstellt).toLocaleString('de-DE', { dateStyle: 'long', timeStyle: 'short' }) : 'unbekannt'

  return (
    <>
      <Button variant={variant} leftSection={<IconUpload size={16} />} onClick={() => void waehlen()}>
        Sicherung einlesen …
      </Button>
      <Modal opened={Boolean(datei)} onClose={() => setDatei(null)} title="Sicherung einlesen?" size="lg">
        {v && (
          <Stack gap="md">
            <Text size="sm">
              <b>{datei!.name}</b>, erstellt am {datum}
            </Text>
            <div>
              <Text size="sm">Darin enthalten:</Text>
              <List size="sm" mt={4}>
                {v.ordner.map((o) => (
                  <List.Item key={o.ordner}>
                    <b>{o.eintraege}</b> {NAMEN[o.ordner] ?? o.ordner}
                  </List.Item>
                ))}
                {v.dateien
                  .map((d) => DATEI_NAMEN[d] ?? d)
                  .filter(Boolean)
                  .map((d) => (
                    <List.Item key={d}>{d}</List.Item>
                  ))}
                {!v.ordner.length && !v.dateien.length && <List.Item>nichts – die Sicherung ist leer</List.Item>}
              </List>
            </div>
            <Alert variant="light" color="yellow" icon={<IconAlertTriangle size={18} />}>
              <Text size="sm">
                Vorhandene Materialien bleiben erhalten; gleichnamige werden durch die Fassung aus der Sicherung ersetzt. Die Einstellungen werden übernommen.
                Die KI-Zugänge stehen aus Sicherheitsgründen nicht in der Sicherung – sie müssen neu eingetragen werden. Vokabellisten und Lehrwerke werden
                nicht angefasst.
              </Text>
            </Alert>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDatei(null)}>
                Abbrechen
              </Button>
              <Button loading={laeuft} onClick={() => void einlesen()}>
                Einlesen
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  )
}
