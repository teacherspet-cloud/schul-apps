import { Button, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconFolderOpen } from '@tabler/icons-react'
import type { FileFilter } from '@shared/types'
import { imNetz } from '../netzZugang'
import { notifyError, notifySuccess } from '../util'

/**
 * Dateien ausgeben – eine mit dem gewohnten Speichern-Dialog, mehrere in EINEN Ordner.
 *
 * Anlass (25.09.2026): Beim Arbeitsblatt kamen bis zu fünf Speichern-Dialoge hintereinander
 * (Blatt, Lösungen, Tafelbild, je Hörtext eine MP3). Wer einen davon wegklickte, hatte eine
 * unvollständige Ausgabe und merkte es erst im Unterricht. Jetzt gilt für alle Programme:
 *  - EINE Datei: normaler Speichern-Dialog, wie man es kennt.
 *  - MEHRERE Dateien: einmal einen Ordner wählen, alles landet dort. Vorhandene Dateien werden
 *    nie überschrieben, der neue Name bekommt ein „(2)" (shared/dateiname.ts). Danach ein
 *    Hinweis mit „Ordner öffnen".
 *  - Im Browser (Tablet, Netzzugang) gibt es keinen Ordner des Rechners – dort wird wie bisher
 *    jede Datei heruntergeladen (netzZugang.ts).
 */

type PdfZusatz = { fillable?: boolean; audio?: { id: string; fileName: string; title: string; base64: string }[] }

export type AusgabeDatei =
  /** Fertige Daten (Word, MP3, …) – gern als Funktion, dann wird erst nach der Ordnerwahl gebaut */
  | { name: string; daten: Uint8Array | string | (() => Promise<Uint8Array | string>); filter: FileFilter[] }
  /** PDF aus HTML; das Umrechnen übernimmt der Hauptprozess */
  | { name: string; html: string; pdf?: PdfZusatz }

export const WORD_FILTER: FileFilter[] = [{ name: 'Word-Dokument', extensions: ['docx'] }]

const datenVon = async (d: Extract<AusgabeDatei, { daten: unknown }>): Promise<Uint8Array | string> => (typeof d.daten === 'function' ? d.daten() : d.daten)

async function einzeln(d: AusgabeDatei): Promise<string | null> {
  if ('html' in d) return window.api.exporter.pdf(d.html, d.name, d.pdf)
  return window.api.files.save(d.name, d.filter, await datenVon(d))
}

async function inOrdner(ordner: string, d: AusgabeDatei): Promise<string> {
  if ('html' in d) return window.api.exporter.pdfInFolder(ordner, d.html, d.name, d.pdf)
  return window.api.files.saveInFolder(ordner, d.name, await datenVon(d))
}

const dateiname = (pfad: string): string => pfad.split(/[\\/]/).pop() ?? pfad

/**
 * Speichert die Dateien und meldet es. Liefert die Zahl der gespeicherten Dateien – 0 heißt:
 * abgebrochen (dann gibt es auch keine Meldung).
 */
export async function speichereAusgabe(dateien: AusgabeDatei[], meldung: string): Promise<number> {
  if (!dateien.length) return 0
  if (dateien.length === 1 || imNetz()) {
    let anzahl = 0
    for (const d of dateien) {
      const pfad = await einzeln(d)
      // Wer den ersten Dialog abbricht, will gar nichts speichern
      if (!pfad) break
      anzahl++
    }
    if (anzahl) notifySuccess(meldung)
    return anzahl
  }

  const ordner = await window.api.files.chooseFolder(`Ordner für ${dateien.length} Dateien wählen`)
  if (!ordner) return 0
  const pfade: string[] = []
  for (const d of dateien) pfade.push(await inOrdner(ordner, d))
  // Hat eine Datei einen anderen Namen bekommen, weil es den gewünschten schon gab? Dann sagen, warum.
  const umbenannt = pfade.filter((p, i) => dateiname(p) !== dateien[i].name.replace(/[\\/]/g, ''))
  notifications.show({
    title: meldung,
    autoClose: 15000,
    message: (
      <Stack gap={4} align="flex-start" data-ausgabe-ordner>
        <Text size="sm">
          {pfade.length} Dateien im Ordner „{dateiname(ordner)}“.
          {umbenannt.length > 0 && ` Vorhandene Dateien blieben erhalten, neu gespeichert als ${umbenannt.map((p) => `„${dateiname(p)}“`).join(', ')}.`}
        </Text>
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<IconFolderOpen size={14} />}
          onClick={() => void window.api.files.openFolder(ordner).catch((e: unknown) => notifyError(e, 'Der Ordner ließ sich nicht öffnen'))}
        >
          Ordner öffnen
        </Button>
      </Stack>
    )
  })
  return pfade.length
}
