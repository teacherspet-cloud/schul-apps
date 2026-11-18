/**
 * „Schüleransicht" im Arbeitsblatt-Editor (26.10.2026, Wunsch der Lehrkraft: ein Knopf links von „Für Lernende", der
 * das Blatt so zeigt, wie es die Lernenden digital bekommen). Rein im Programm, auch in der Exe ohne Server:
 * dieselbe Schülerfassung wie beim Freigeben (printHtml `buildWorksheetHtml`, nur dieses Blatt, ohne Lösungsteil),
 * geöffnet in der Schüler-Oberfläche (onlinetest/BlattAusfuellen `Ausfuellen`) mit dem Rückweg der Lehrkraft.
 * Eintragen, Stift und Kästchen gehen wie bei den Lernenden; nichts wird gespeichert, kein Einreichen – Speichern
 * läuft dort ins Leere und wird still verworfen.
 *
 * KI-Feedback zur Probe (18.11.2026, Wunsch der Lehrkraft): An jeder Aufgabe gibt es „Feedback" wie bei den Lernenden
 * (gleicher Auftrag, gleiche automatische Prüfung mit dem Lösungsschlüssel, gleicher Lösungsfilter) – über die KI der
 * Lehrkraft, ohne Server und ohne Speichern; Stifteinträge gehen dabei nicht mit (nur getippte Einträge und Kästchen).
 */
import { Button, Modal } from '@mantine/core'
import { IconEye } from '@tabler/icons-react'
import { useState } from 'react'
import { notifyError } from '../../shared/util'
import { Ausfuellen, type BlattDaten, type ProbeFeedback } from '../onlinetest/BlattAusfuellen'
import { aufgabenFeedbackAnfrage, aufgabenFeedbackAus, blattAbgabeText, type BlattAufgabe } from '@shared/blattFreigabe'
import { autoBefund } from '@shared/blattPruefung'
import { feedbackOhneLeck } from '@shared/blattKiSchutz'
import { zeichenFuer } from '../../shared/korrekturzeichen'
import { blattAufgaben } from './BlattFreigabeKnopf'
import { subjectById } from './model/subjects'
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
  const [aufgaben, setAufgaben] = useState<BlattAufgabe[]>([])
  const [laeuft, setLaeuft] = useState(false)
  const probe: ProbeFeedback = async ({ nr, antworten, felder, material }) => {
    const a = aufgaben.find((x) => x.nr === nr)
    if (!a) throw new Error('Zu dieser Aufgabe gibt es kein Feedback.')
    const eigene = felder.filter((f) => f.nr === nr)
    const text = blattAbgabeText([a], eigene, antworten)
    if (!text.trim()) throw new Error('Bitte zuerst etwas eintragen (Text, Kästchen oder Linien).')
    const auto = autoBefund(a, eigene, antworten)
    const anfrage = aufgabenFeedbackAnfrage(a, text, [], subjectById(ws.meta.subjectId).foreignLanguage ?? 'de', {
      zeichen: zeichenFuer(ws.meta.subjectId),
      ...(material ? { material } : {}),
      ...(auto ? { auto: auto.text } : {})
    })
    // Probe der Lehrkraft: nicht von Lernenden ausgelöst (kein Lernenden-Budget)
    const roh = await window.api.ai.structured<unknown>({ ...anfrage, vonLernenden: false })
    const fb0 = aufgabenFeedbackAus(roh)
    const fb = auto?.einschaetzung ? { ...fb0, einschaetzung: auto.einschaetzung } : fb0
    return feedbackOhneLeck(fb, a.erwartung ?? '', text).fb
  }
  const oeffnen = async (): Promise<void> => {
    const sheet = ws.sheets.find((s) => s.id === sheetId) ?? ws.sheets[0]
    if (!sheet) return
    setLaeuft(true)
    try {
      // Wie beim Freigeben: gemessene Seiten des Editors, sonst neu messen
      const plaene = layouts.size ? layouts : await messeSeiten(ws, logo, schoolName)
      const html = buildWorksheetHtml(ws, plaene, { sheetIds: [sheet.id], includeKey: false }, logo, schoolName)
      setAufgaben(blattAufgaben(sheet))
      setDaten({
        id: 'vorschau',
        titel: ws.meta.title || ws.meta.topic || 'Arbeitsblatt',
        offen: true,
        feedback: false,
        // Keine Einreichung möglich (0 Runden) – ausprobieren und Feedback je Aufgabe holen (18.11.2026)
        runden: 0,
        genutzt: 0,
        html,
        einstellungen: { feedback: false, aufgabenFeedback: true, aufgabenRunden: 20, stift: true },
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
        {daten && <Ausfuellen d={daten} lehrkraft={{ zurueck: () => setDaten(null) }} probe={probe} />}
      </Modal>
    </>
  )
}
