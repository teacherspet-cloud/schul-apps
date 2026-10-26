/**
 * „Schüleransicht" im Arbeitsblatt-Editor (26.10.2026, Wunsch der Lehrkraft: ein Knopf links von „Für Lernende", der
 * das Blatt so zeigt, wie es die Lernenden digital bekommen). Rein im Programm, auch in der Exe ohne Server:
 * dieselbe Schülerfassung wie beim Freigeben (printHtml `buildWorksheetHtml`, nur dieses Blatt, ohne Lösungsteil),
 * geöffnet in der Schüler-Oberfläche (onlinetest/BlattAusfuellen `Ausfuellen`) mit dem Rückweg der Lehrkraft.
 * Eintragen, Stift und Kästchen gehen wie bei den Lernenden; nichts wird gespeichert, keine KI, kein Einreichen
 * (keine Runden, kein Feedback) – Speichern läuft dort ins Leere und wird still verworfen.
 */
import { Button, Modal } from '@mantine/core'
import { IconEye } from '@tabler/icons-react'
import { useState } from 'react'
import { notifyError } from '../../shared/util'
import { Ausfuellen, type BlattDaten } from '../onlinetest/BlattAusfuellen'
import type { Worksheet } from './model/types'
import type { PagePlan } from './render/paginate'
import { buildWorksheetHtml } from './render/printHtml'
import { messeSeiten } from './render/seitenMessen'

export default function SchuelerVorschauKnopf({
  ws,
  layouts,
  logo,
  schoolName,
  sheetId
}: {
  ws: Worksheet
  layouts: Map<string, PagePlan[]>
  logo: string | null
  schoolName: string
  /** Das gerade bearbeitete Blatt (bei mehreren Blättern einer Datei) */
  sheetId: string
}): React.JSX.Element {
  const [daten, setDaten] = useState<BlattDaten | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const oeffnen = async (): Promise<void> => {
    const sheet = ws.sheets.find((s) => s.id === sheetId) ?? ws.sheets[0]
    if (!sheet) return
    setLaeuft(true)
    try {
      // Wie beim Freigeben: gemessene Seiten des Editors, sonst neu messen
      const plaene = layouts.size ? layouts : await messeSeiten(ws, logo, schoolName)
      const html = buildWorksheetHtml(ws, plaene, { sheetIds: [sheet.id], includeKey: false }, logo, schoolName)
      setDaten({
        id: 'vorschau',
        titel: ws.meta.title || ws.meta.topic || 'Arbeitsblatt',
        offen: true,
        feedback: false,
        // Keine Einreichung möglich (0 Runden) – nur ansehen und ausprobieren
        runden: 0,
        genutzt: 0,
        html,
        einstellungen: { feedback: false, aufgabenFeedback: false, aufgabenRunden: 0, stift: true },
        antworten: {},
        tinte: {},
        aufgabenFeedback: {},
        fassungen: []
      })
    } catch (e) {
      notifyError(e, 'Schüleransicht nicht geöffnet')
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <>
      <Button variant="light" leftSection={<IconEye size={16} />} loading={laeuft} onClick={() => void oeffnen()} data-schueleransicht-knopf>
        Schüleransicht
      </Button>
      <Modal opened={daten !== null} onClose={() => setDaten(null)} fullScreen withCloseButton={false} padding="md" data-schueleransicht>
        {daten && <Ausfuellen d={daten} lehrkraft={{ zurueck: () => setDaten(null) }} />}
      </Modal>
    </>
  )
}
