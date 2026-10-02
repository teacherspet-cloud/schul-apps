import { Alert, Button, Checkbox, Group, Modal, Stack, Text } from '@mantine/core'
import { IconAlertTriangle, IconCloudUpload, IconDeviceDesktop, IconDeviceTablet, IconFolders, IconShare } from '@tabler/icons-react'
import { useState } from 'react'
import { create } from 'zustand'
import { inGruppenordner, iservAnzeige, iservOrdnerFuer, pfadTeile } from '@shared/iserv'
import type { AblageZiel, AusgabeOrt } from '@shared/types'
import { amPc, aufIos } from '../plattform'
import { useAppSettings } from '../settingsStore'

/**
 * Wohin eine Datei geht (01.10.2026): „Auf dem iPad" / „IServ" / „Dateien-App …" / „Teilen …".
 *
 * Wunsch der Lehrkraft: Mit hinterlegtem IServ-Zugang soll Material direkt in die Ordner auf
 * IServ gehen können. Damit nicht jedes Programm einen eigenen Schalter braucht, fragt EIN Dialog
 * vor dem Speichern – für alles, was mit Ablageziel gespeichert wird (files.save, exporter.pdf,
 * speichereAusgabe). Ohne IServ und ohne Einstellung „Jedes Mal fragen" bleibt alles wie bisher.
 *
 * iPad-App und – seit 02.10.2026 – App am PC („Auf diesem PC" = Speichern-Dialog von Windows oder
 * „IServ"). Am PC ist window.api über die Electron-Brücke unveränderlich; die Rückfrage meldet sich
 * deshalb über `window.api.vermittlung.ortWahl` an (shared/apiShape.ts). Im Browser des Tablets
 * (Netzzugang) wird weiter heruntergeladen.
 */

export type OrtWahl = { ort: AusgabeOrt; merken: boolean } | null

interface Abfrage {
  ziel: AblageZiel
  anzahl: number
  antwort: (wahl: OrtWahl) => void
}

const useAbfrage = create<{ offen: Abfrage | null }>(() => ({ offen: null }))

/** Welche Orte dieses Gerät anbietet */
export function orteDiesesGeraets(iservVerbunden: boolean): AusgabeOrt[] {
  if (amPc()) return iservVerbunden ? ['geraet', 'iserv'] : []
  if (!aufIos()) return []
  return iservVerbunden ? ['geraet', 'iserv', 'dateien', 'teilen'] : ['geraet', 'dateien', 'teilen']
}

export const ORT_NAME = (ort: AusgabeOrt): string =>
  ort === 'geraet' ? (aufIos() ? 'Auf dem iPad' : 'Auf diesem PC') : ort === 'iserv' ? 'IServ' : ort === 'dateien' ? 'Dateien-App …' : 'Teilen …'

const iservVerbunden = (): boolean => Boolean(useAppSettings.getState().settings.iserv?.basis)

/**
 * Das Ziel samt Ort: gesetzter Ort bleibt; sonst Einstellung „ausgabeOrt" – „fragen" (Vorgabe,
 * sobald IServ verbunden ist) öffnet den Dialog. null = abgebrochen.
 */
export async function mitOrt(ziel: AblageZiel | undefined, anzahl = 1): Promise<AblageZiel | undefined | null> {
  if (!ziel || typeof ziel !== 'object' || ziel.ort) return ziel
  const verbunden = iservVerbunden()
  const orte = orteDiesesGeraets(verbunden)
  if (orte.length <= 1) return ziel
  const eingestellt = useAppSettings.getState().settings.ausgabeOrt ?? (verbunden ? 'fragen' : 'geraet')
  if (eingestellt !== 'fragen') return orte.includes(eingestellt) ? { ...ziel, ort: eingestellt } : ziel
  const wahl = await new Promise<OrtWahl>((antwort) => useAbfrage.setState({ offen: { ziel, anzahl, antwort } }))
  if (!wahl) return null
  if (wahl.merken) void useAppSettings.getState().update({ ausgabeOrt: wahl.ort })
  return { ...ziel, ort: wahl.ort }
}

const SYMBOL = (): Record<AusgabeOrt, React.ReactNode> => ({
  geraet: aufIos() ? <IconDeviceTablet size={18} /> : <IconDeviceDesktop size={18} />,
  iserv: <IconCloudUpload size={18} />,
  dateien: <IconFolders size={18} />,
  teilen: <IconShare size={18} />
})

function beschreibung(ort: AusgabeOrt, ziel: AblageZiel): string {
  const s = useAppSettings.getState().settings
  if (ort === 'iserv') return iservAnzeige(iservOrdnerFuer(s.iserv?.ziel, ziel))
  if (ort === 'dateien') return 'Ort in der Dateien-App frei wählen (iCloud Drive, eingebundene Anbieter …)'
  if (ort === 'teilen') return 'AirDrop, Mail, Drucken, „In Dateien sichern“'
  if (!aufIos()) return 'Ort im Speichern-Dialog von Windows wählen'
  return s.schulmaterialAblage === false ? 'Ordner „Ausgaben“ in der Dateien-App' : 'Dateien-App › Schulmaterial › Fach › Themenbereich'
}

/** Der Dialog – einmal in der Oberfläche eingehängt (main.tsx) */
export function AusgabeOrtDialog(): React.JSX.Element | null {
  const offen = useAbfrage((s) => s.offen)
  const [merken, setMerken] = useState(false)
  if (!offen) return null
  const orte = orteDiesesGeraets(iservVerbunden())
  const schliessen = (wahl: OrtWahl): void => {
    useAbfrage.setState({ offen: null })
    setMerken(false)
    offen.antwort(wahl)
  }
  const ziel = useAppSettings.getState().settings.iserv?.ziel
  const schuelerdaten = ['rueckmeldung'].includes(offen.ziel.programm) && inGruppenordner(pfadTeile(ziel))
  return (
    <Modal opened onClose={() => schliessen(null)} title={offen.anzahl > 1 ? `Wohin mit ${offen.anzahl} Dateien?` : 'Wohin speichern?'} centered data-ausgabe-ort>
      <Stack gap="xs">
        {orte.map((ort) => (
          <Button
            key={ort}
            variant={ort === 'iserv' ? 'filled' : 'light'}
            leftSection={SYMBOL()[ort]}
            justify="flex-start"
            h="auto"
            py={8}
            onClick={() => schliessen({ ort, merken })}
            data-ort={ort}
          >
            <Stack gap={0} align="flex-start">
              <Text size="sm" fw={600}>
                {ORT_NAME(ort)}
              </Text>
              <Text size="xs" style={{ whiteSpace: 'normal', textAlign: 'left' }} opacity={0.8}>
                {beschreibung(ort, offen.ziel)}
              </Text>
            </Stack>
          </Button>
        ))}
        {schuelerdaten && (
          <Alert color="orange" icon={<IconAlertTriangle size={16} />} p="xs">
            <Text size="xs">
              Rückmeldungen enthalten Namen von Schülerinnen und Schülern. Das IServ-Ziel ist ein Gruppenordner – dort lesen oft viele mit. Besser in „Eigene
              Dateien“ speichern.
            </Text>
          </Alert>
        )}
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

/**
 * Die Aufrufe mit Ablageziel um die Ortswahl ergänzen – einmal beim Start (main.tsx). Programme,
 * die files.save/exporter.pdf direkt aufrufen, bekommen den Dialog so ohne eigene Änderung.
 */
export function installiereOrtWahl(): void {
  const api = window.api
  // Über die Brücke (PC) bzw. buildApi (iPad): eine Anmeldung statt Umhüllen
  if (api?.vermittlung) {
    api.vermittlung.ortWahl((ziel) => mitOrt(ziel))
    return
  }
  if (!api?.files || !api.exporter || (api as { __ortWahl?: boolean }).__ortWahl) return
  ;(api as { __ortWahl?: boolean }).__ortWahl = true
  const speichern = api.files.save
  api.files.save = async (name, filter, daten, ziel) => {
    const z = await mitOrt(ziel)
    if (z === null) return null
    return speichern(name, filter, daten, z)
  }
  const pdf = api.exporter.pdf
  api.exporter.pdf = async (html, name, extras, ziel) => {
    const z = await mitOrt(ziel)
    if (z === null) return null
    return pdf(html, name, extras, z)
  }
}
