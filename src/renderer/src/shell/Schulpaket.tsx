import { Alert, Button, Checkbox, Group, Modal, ScrollArea, Stack, Text, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPackageExport, IconPackageImport } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import type { PaketArt, PaketVorschau } from '@shared/apiShape'
import { modules } from '../modules/registry'
import { ladeMaterialien } from './materialien'

/**
 * Schulpaket (Großprogramm 0.4, F8): mehrere Materialien samt Hörtexten als eine Datei
 * `.schulpaket` weitergeben – per USB-Stick, E-Mail oder Cloud-Ordner – und auf einem anderen
 * Rechner einlesen. Die App läuft auf dem eigenen Rechner; einen Server zum Abholen gibt es
 * nicht, deshalb auch keinen QR-Code.
 */

const PAKET_ARTEN: PaketArt[] = ['arbeitsblatt', 'vokabeltest', 'klassenarbeit', 'lernzielkontrolle', 'grammatiktest', 'rueckmeldung', 'elternbrief', 'tafelbild']
const programmName = (art: string): string => modules.find((m) => m.id === art)?.name ?? art

interface Eintrag {
  art: PaketArt
  id: string
  name: string
  detail: string
}

async function ladeAlles(): Promise<Eintrag[]> {
  const sicher = <T,>(p: Promise<T[]>): Promise<T[]> => p.catch(() => [])
  const [materialien, rm, eb] = await Promise.all([ladeMaterialien(), sicher(window.api.rueckmeldungen.list()), sicher(window.api.elternbriefe.list())])
  const liste: Eintrag[] = materialien
    .filter((m) => (PAKET_ARTEN as string[]).includes(m.moduleId))
    .map((m) => ({ art: m.moduleId as PaketArt, id: m.id, name: m.name, detail: m.detail }))
  for (const d of rm) liste.push({ art: 'rueckmeldung', id: d.id, name: d.name, detail: '' })
  for (const d of eb) liste.push({ art: 'elternbrief', id: d.id, name: d.name, detail: '' })
  return liste
}

function PaketErstellen({ offen, schliessen }: { offen: boolean; schliessen: () => void }): React.JSX.Element {
  const [liste, setListe] = useState<Eintrag[] | null>(null)
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set())
  const [titel, setTitel] = useState('')
  const [filter, setFilter] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  useEffect(() => {
    if (!offen) return
    setGewaehlt(new Set())
    void ladeAlles().then(setListe)
  }, [offen])
  const schluessel = (e: Eintrag): string => `${e.art}:${e.id}`
  const sichtbar = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return (liste ?? []).filter((e) => !f || `${e.name} ${e.detail} ${programmName(e.art)}`.toLowerCase().includes(f))
  }, [liste, filter])
  const umschalten = (e: Eintrag): void =>
    setGewaehlt((alt) => {
      const neu = new Set(alt)
      if (neu.has(schluessel(e))) neu.delete(schluessel(e))
      else neu.add(schluessel(e))
      return neu
    })
  const speichern = async (): Promise<void> => {
    const auswahl = (liste ?? []).filter((e) => gewaehlt.has(schluessel(e))).map((e) => ({ art: e.art, id: e.id }))
    setLaeuft(true)
    try {
      const pfad = await window.api.paket.erstellen(titel.trim() || 'Schulpaket', auswahl)
      if (pfad) {
        notifications.show({ color: 'green', title: 'Schulpaket gespeichert', message: `${auswahl.length} Material(ien) in ${pfad}` })
        schliessen()
      }
    } catch (e) {
      notifications.show({ color: 'red', title: 'Schulpaket nicht gespeichert', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <Modal opened={offen} onClose={schliessen} title="Schulpaket erstellen" size="lg">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Die gewählten Materialien kommen mit ihren Hörtexten in eine Datei. Auf einem anderen Rechner mit Schul-Apps lässt sie sich über „Schulpaket öffnen …"
          einlesen; dort entstehen Kopien, nichts wird überschrieben.
        </Text>
        <TextInput
          label="Name des Pakets"
          placeholder="z. B. Einheit Julikrise 9b"
          value={titel}
          onChange={(e) => setTitel(e.currentTarget.value)}
          data-paket-titel
        />
        <TextInput placeholder="Materialien filtern" value={filter} onChange={(e) => setFilter(e.currentTarget.value)} />
        <ScrollArea h={320} type="auto">
          {liste === null ? (
            <Text size="sm">Materialien werden geladen …</Text>
          ) : sichtbar.length === 0 ? (
            <Text size="sm" c="dimmed">
              Keine Materialien gefunden.
            </Text>
          ) : (
            <Stack gap={6}>
              {sichtbar.map((e) => (
                <Checkbox
                  key={schluessel(e)}
                  checked={gewaehlt.has(schluessel(e))}
                  onChange={() => umschalten(e)}
                  label={e.name}
                  description={[programmName(e.art), e.detail].filter(Boolean).join(' · ')}
                  data-paket-eintrag={schluessel(e)}
                />
              ))}
            </Stack>
          )}
        </ScrollArea>
        <Group justify="space-between">
          <Text size="sm">{gewaehlt.size} ausgewählt</Text>
          <Button
            leftSection={<IconPackageExport size={16} />}
            disabled={!gewaehlt.size}
            loading={laeuft}
            onClick={() => void speichern()}
            data-paket-speichern
          >
            Paket speichern …
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function PaketEinlesen({
  vorschau,
  schliessen,
  eingelesen
}: {
  vorschau: PaketVorschau | null
  schliessen: () => void
  eingelesen: () => void
}): React.JSX.Element {
  const [laeuft, setLaeuft] = useState(false)
  const einlesen = async (): Promise<void> => {
    setLaeuft(true)
    try {
      const neu = await window.api.paket.einlesen()
      notifications.show({ color: 'green', title: 'Schulpaket eingelesen', message: `${neu.length} Material(ien) sind jetzt in den Bibliotheken.` })
      eingelesen()
      schliessen()
    } catch (e) {
      notifications.show({ color: 'red', title: 'Schulpaket nicht eingelesen', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setLaeuft(false)
    }
  }
  const erstellt = vorschau ? new Date(vorschau.erstellt) : null
  return (
    <Modal opened={Boolean(vorschau)} onClose={schliessen} title={vorschau ? `Schulpaket „${vorschau.titel}"` : ''} size="lg">
      {vorschau && (
        <Stack gap="sm">
          {erstellt && !Number.isNaN(erstellt.getTime()) && (
            <Text size="sm" c="dimmed">
              Erstellt am {erstellt.toLocaleDateString('de-DE')}
              {vorschau.hoertexte ? ` · ${vorschau.hoertexte} Hörtext(e)` : ''}
              {vorschau.designs ? ` · ${vorschau.designs} eigene Designvorlage(n)` : ''}
              {vorschau.maskottchen ? ` · ${vorschau.maskottchen} eigene(s) Maskottchen` : ''}
            </Text>
          )}
          <ScrollArea.Autosize mah={320} type="auto">
            <Stack gap={4}>
              {vorschau.eintraege.map((e, i) => (
                <Text key={i} size="sm">
                  {e.name}{' '}
                  <Text span c="dimmed" size="xs">
                    ({programmName(e.art)})
                  </Text>
                </Text>
              ))}
            </Stack>
          </ScrollArea.Autosize>
          <Alert color="blue" variant="light">
            Die Materialien kommen als Kopien in die Bibliotheken. Vorhandenes bleibt unverändert.
          </Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={schliessen}>
              Abbrechen
            </Button>
            <Button leftSection={<IconPackageImport size={16} />} loading={laeuft} onClick={() => void einlesen()} data-paket-einlesen>
              {vorschau.eintraege.length} Material(ien) einlesen
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}

/** Die beiden Knöpfe der Startseite samt Dialogen */
export default function SchulpaketKnoepfe({ eingelesen }: { eingelesen: () => void }): React.JSX.Element {
  const [erstellen, setErstellen] = useState(false)
  const [vorschau, setVorschau] = useState<PaketVorschau | null>(null)
  /*
   * Per Doppelklick bzw. „Öffnen mit" übergebenes Paket: beim Start einmal abholen, und wenn die
   * App schon läuft, kommt es als Ereignis.
   */
  useEffect(() => {
    window.api.paket
      .startdatei()
      .then((v) => v && setVorschau(v))
      .catch((e) => notifications.show({ color: 'red', title: 'Schulpaket lässt sich nicht öffnen', message: e instanceof Error ? e.message : String(e) }))
    return window.api.paket.onVonAussen((v) => {
      if ('fehler' in v) notifications.show({ color: 'red', title: 'Schulpaket lässt sich nicht öffnen', message: v.fehler })
      else setVorschau(v)
    })
  }, [])
  const oeffnen = async (): Promise<void> => {
    try {
      const v = await window.api.paket.oeffnen()
      if (v) setVorschau(v)
    } catch (e) {
      notifications.show({ color: 'red', title: 'Schulpaket lässt sich nicht öffnen', message: e instanceof Error ? e.message : String(e) })
    }
  }
  return (
    <>
      <Group gap="xs">
        <Button size="compact-sm" variant="subtle" leftSection={<IconPackageExport size={16} />} onClick={() => setErstellen(true)} data-paket-erstellen>
          Schulpaket erstellen …
        </Button>
        <Button size="compact-sm" variant="subtle" leftSection={<IconPackageImport size={16} />} onClick={() => void oeffnen()} data-paket-oeffnen>
          Schulpaket öffnen …
        </Button>
      </Group>
      <PaketErstellen offen={erstellen} schliessen={() => setErstellen(false)} />
      <PaketEinlesen vorschau={vorschau} schliessen={() => setVorschau(null)} eingelesen={eingelesen} />
    </>
  )
}
