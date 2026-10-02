import { Anchor, Breadcrumbs, Button, Checkbox, Group, Loader, Modal, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconCloudDownload, IconDeviceDesktop, IconDeviceTablet, IconFile, IconFolder } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { anzeigeTeil, pfadTeile, type DavEintrag } from '@shared/iserv'
import type { FileFilter, OpenedFile } from '@shared/types'
import { amPc, aufIos } from '../plattform'
import { useAppSettings } from '../settingsStore'

/**
 * Dateien aus den IServ-Ordnern öffnen (02.10.2026, Wunsch der Lehrkraft: „auf die IServ-
 * Ordnerstruktur zugreifen“).
 *
 * Ist IServ verbunden, fragt „Datei öffnen“ (files.open) zuerst nach der Quelle: dieses Gerät
 * (der gewohnte Dialog) oder IServ. Bei IServ zeigt ein Dialog Eigene Dateien und Gruppen samt
 * Unterordnern; gewählt wird eine Datei mit passender Endung. Geladen wird über WebDAV direkt vom
 * Gerät (main/services/iserv) – das Passwort verlässt PC bzw. iPad nicht.
 *
 * Angemeldet über `window.api.vermittlung.dateiWahl` (shared/apiShape.ts). Ohne IServ bleibt
 * alles wie bisher. Einstellung `eingabeOrt` merkt die Wahl („Auswahl merken").
 */

type Abfrage = { filters: FileFilter[]; antwort: (r: OpenedFile | null | undefined) => void; direkt: boolean }

const useAbfrage = create<{ offen: Abfrage | null }>(() => ({ offen: null }))

const iservVerbunden = (): boolean => Boolean(useAppSettings.getState().settings.iserv?.basis)

/** Passt die Datei zu den Filtern des Aufrufers? (Filter mit „*" oder ohne Endungen: alles) */
export function passtZuFiltern(name: string, filters: FileFilter[]): boolean {
  const endungen = filters.flatMap((f) => f.extensions.map((e) => e.toLowerCase()))
  if (!endungen.length || endungen.includes('*')) return true
  const e = name.toLowerCase().split('.').pop() ?? ''
  return endungen.includes(e)
}

async function waehle(filters: FileFilter[]): Promise<OpenedFile | null | undefined> {
  if (!iservVerbunden()) return undefined
  const ort = useAppSettings.getState().settings.eingabeOrt ?? 'fragen'
  if (ort === 'geraet') return undefined
  return new Promise((antwort) => useAbfrage.setState({ offen: { filters, antwort, direkt: ort === 'iserv' } }))
}

/** Einmal beim Start (main.tsx) – PC und iPad */
export function installiereDateiWahl(): void {
  window.api?.vermittlung?.dateiWahl((filters) => waehle(filters))
}

/** Der Dialog – einmal in der Oberfläche eingehängt (main.tsx) */
export function EingabeOrtDialog(): React.JSX.Element | null {
  const offen = useAbfrage((s) => s.offen)
  const [iserv, setIserv] = useState(false)
  const [merken, setMerken] = useState(false)
  useEffect(() => {
    setIserv(Boolean(offen?.direkt))
    setMerken(false)
  }, [offen])
  if (!offen) return null
  const schliessen = (r: OpenedFile | null | undefined): void => {
    useAbfrage.setState({ offen: null })
    offen.antwort(r)
  }
  const merke = (ort: 'geraet' | 'iserv'): void => {
    if (merken) void useAppSettings.getState().update({ eingabeOrt: ort })
  }
  if (!iserv) {
    return (
      <Modal opened onClose={() => schliessen(null)} title="Datei öffnen – von wo?" centered data-eingabe-ort>
        <Stack gap="xs">
          <Button
            variant="light"
            justify="flex-start"
            leftSection={aufIos() ? <IconDeviceTablet size={18} /> : <IconDeviceDesktop size={18} />}
            onClick={() => {
              merke('geraet')
              schliessen(undefined)
            }}
            data-quelle="geraet"
          >
            {aufIos() ? 'Vom iPad (Dateien-App)' : amPc() ? 'Von diesem PC' : 'Von diesem Gerät'}
          </Button>
          <Button
            justify="flex-start"
            leftSection={<IconCloudDownload size={18} />}
            onClick={() => {
              merke('iserv')
              setIserv(true)
            }}
            data-quelle="iserv"
          >
            Von IServ (Eigene Dateien, Gruppen)
          </Button>
          <Group justify="space-between" mt="xs">
            <Checkbox size="xs" checked={merken} onChange={(e) => setMerken(e.currentTarget.checked)} label="Auswahl merken (in den Einstellungen änderbar)" />
            <Button variant="subtle" size="xs" onClick={() => schliessen(null)}>
              Abbrechen
            </Button>
          </Group>
        </Stack>
      </Modal>
    )
  }
  return (
    <Modal opened onClose={() => schliessen(null)} title="Datei von IServ öffnen" centered size="lg" data-iserv-dateiwahl>
      <IservDateiBrowser
        filters={offen.filters}
        onDatei={(datei) => schliessen(datei)}
        onGeraet={() => schliessen(undefined)}
        onAbbrechen={() => schliessen(null)}
      />
    </Modal>
  )
}

function IservDateiBrowser({
  filters,
  onDatei,
  onGeraet,
  onAbbrechen
}: {
  filters: FileFilter[]
  onDatei: (d: OpenedFile) => void
  onGeraet: () => void
  onAbbrechen: () => void
}): React.JSX.Element {
  const [pfad, setPfad] = useState<string[]>(() => pfadTeile(useAppSettings.getState().settings.iserv?.ziel).slice(0, 1))
  const [eintraege, setEintraege] = useState<DavEintrag[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState<string | null>(null)

  useEffect(() => {
    let weg = false
    setEintraege(null)
    setFehler(null)
    window.api.iserv
      .eintraege(pfad.join('/'))
      .then((liste) => !weg && setEintraege(liste))
      .catch((e: unknown) => {
        if (weg) return
        if (pfad.length) setPfad([])
        else setFehler(e instanceof Error ? e.message : String(e))
      })
    return () => {
      weg = true
    }
  }, [pfad])

  const oeffnen = async (e: DavEintrag): Promise<void> => {
    setLaedt(e.name)
    setFehler(null)
    try {
      onDatei(await window.api.iserv.laden(e.teile.join('/')))
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err))
    } finally {
      setLaedt(null)
    }
  }

  const ordner = eintraege?.filter((e) => e.ordner) ?? []
  const dateien = eintraege?.filter((e) => !e.ordner && passtZuFiltern(e.name, filters)) ?? []
  const ausgeblendet = (eintraege?.filter((e) => !e.ordner).length ?? 0) - dateien.length
  const endungen = filters.flatMap((f) => f.extensions).filter((e) => e !== '*')

  return (
    <Stack gap="xs">
      <Breadcrumbs separator="›">
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
        <Text size="sm" c="red" data-iserv-fehler>
          {fehler}
        </Text>
      )}
      {!eintraege && !fehler && <Loader size="sm" />}
      {eintraege && (
        <Stack gap={2} mah={360} style={{ overflowY: 'auto' }}>
          {ordner.length + dateien.length === 0 && (
            <Text size="sm" c="dimmed">
              Dieser Ordner ist leer.
            </Text>
          )}
          {ordner.map((e) => (
            <UnstyledButton key={`o-${e.name}`} onClick={() => setPfad([...pfad, e.name])} py={4} data-iserv-eintrag={e.name}>
              <Group gap={6}>
                <IconFolder size={16} />
                <Text size="sm">{anzeigeTeil(e.name, pfad.length)}</Text>
              </Group>
            </UnstyledButton>
          ))}
          {dateien.map((e) => (
            <UnstyledButton key={`d-${e.name}`} onClick={() => void oeffnen(e)} py={4} disabled={Boolean(laedt)} data-iserv-datei={e.name}>
              <Group gap={6} wrap="nowrap">
                {laedt === e.name ? <Loader size={14} /> : <IconFile size={16} />}
                <Text size="sm" style={{ flex: 1 }}>
                  {e.name}
                </Text>
                {e.groesse != null && (
                  <Text size="xs" c="dimmed">
                    {groesse(e.groesse)}
                  </Text>
                )}
              </Group>
            </UnstyledButton>
          ))}
        </Stack>
      )}
      {ausgeblendet > 0 && endungen.length > 0 && (
        <Text size="xs" c="dimmed">
          {ausgeblendet} weitere Datei{ausgeblendet === 1 ? '' : 'en'} ausgeblendet – hier passen nur {endungen.map((e) => `.${e}`).join(', ')}.
        </Text>
      )}
      <Group justify="space-between" mt="xs">
        <Button variant="subtle" size="xs" onClick={onGeraet}>
          {aufIos() ? 'Doch vom iPad' : 'Doch von diesem PC'}
        </Button>
        <Button variant="default" size="xs" onClick={onAbbrechen}>
          Abbrechen
        </Button>
      </Group>
    </Stack>
  )
}

const groesse = (b: number): string => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`)
