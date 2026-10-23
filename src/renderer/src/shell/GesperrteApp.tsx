import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import { IconFileTypePdf, IconLock } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { modules } from '../modules/registry'
import { buildWorksheetHtml } from '../modules/arbeitsblatt/render/printHtml'
import { messeSeiten } from '../modules/arbeitsblatt/render/seitenMessen'
import { speichereAusgabe } from '../shared/export/ausgabe'
import { BLATT_ARTEN, materialAlsBlatt } from '../shared/materialBlatt'
import { meldeSperrHinweis } from '../shared/navigation'
import { useAppSettings } from '../shared/settingsStore'
import { notifyError } from '../shared/util'

/**
 * Hinweis „App nicht freigegeben" (App-Freigaben, 23.10.2026, shared/appFreigaben.ts). Erscheint, wenn eine Lehrkraft
 * eine App, die für keine ihrer Gruppen freigegeben ist, über einen Link, die Suche oder ein Material erreicht.
 * Abgestimmt: eigenes Material bleibt lesbar und exportierbar, aber nicht bearbeitbar – bei Blättern (Arbeitsblatt,
 * Klassenarbeit, Lernzielkontrolle, Grammatiktest) deshalb „Als PDF speichern".
 */
export default function GesperrteApp(): React.JSX.Element | null {
  const [ziel, setZiel] = useState<{ moduleId: string; docId?: string } | null>(null)
  const [laedt, setLaedt] = useState(false)
  useEffect(() => meldeSperrHinweis((moduleId, docId) => setZiel({ moduleId, docId })), [])
  if (!ziel) return null
  const name = modules.find((m) => m.id === ziel.moduleId)?.name ?? 'Diese App'
  const alsBlatt = Boolean(ziel.docId) && (BLATT_ARTEN as readonly string[]).includes(ziel.moduleId)

  const pdf = async (): Promise<void> => {
    setLaedt(true)
    try {
      const m = await materialAlsBlatt(ziel.moduleId, ziel.docId)
      if (!m) throw new Error('Das Material wurde nicht gefunden.')
      const { logoDataUrl, settings } = useAppSettings.getState()
      const logo = logoDataUrl ?? null
      const schule = settings.schoolName ?? ''
      // Gemessen wie im Editor, damit nichts abgeschnitten wird
      const layouts = await messeSeiten(m.ws, logo, schule)
      const html = buildWorksheetHtml(m.ws, layouts, { sheetIds: m.ws.sheets.map((s) => s.id), includeKey: false }, logo, schule)
      await speichereAusgabe([{ name: `${(m.name || name).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Material'}.pdf`, html }], 'PDF gespeichert')
      setZiel(null)
    } catch (e) {
      notifyError(e, 'Das PDF konnte nicht erstellt werden')
    } finally {
      setLaedt(false)
    }
  }

  return (
    <Modal opened onClose={() => setZiel(null)} title={`„${name}“ ist nicht freigegeben`} centered>
      <Stack gap="sm" data-gesperrte-app={ziel.moduleId}>
        <Group gap="xs" wrap="nowrap" align="start">
          <IconLock size={18} style={{ flex: 'none', marginTop: 2 }} />
          <Text size="sm">
            Die Schulverwaltung hat „{name}“ für dieses Konto nicht freigegeben. Eine Freigabe erteilen die Admins der Schule.
          </Text>
        </Group>
        {ziel.docId && (
          <Text size="sm" c="dimmed">
            {alsBlatt ? 'Das Material bleibt erhalten. Bearbeiten ist gesperrt, als PDF speichern geht weiterhin.' : 'Das Material bleibt erhalten, lässt sich aber ohne Freigabe nicht öffnen.'}
          </Text>
        )}
        <Group justify="flex-end">
          {alsBlatt && (
            <Button variant="light" leftSection={<IconFileTypePdf size={16} />} loading={laedt} onClick={() => void pdf()} data-gesperrt-pdf>
              Als PDF speichern
            </Button>
          )}
          <Button variant="default" onClick={() => setZiel(null)}>
            Schließen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
