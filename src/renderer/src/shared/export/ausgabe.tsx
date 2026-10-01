import { Button, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconFolderOpen, IconShare } from '@tabler/icons-react'
import { anzeigeOrt } from '@shared/schulmaterial'
import type { AblageZiel, FileFilter } from '@shared/types'
import { imNetz } from '../netzZugang'
import { aufIos } from '../plattform'
import { useAppSettings } from '../settingsStore'
import { notifyError, notifySuccess } from '../util'
import { istIservPfad, iservAnzeige } from '@shared/iserv'
import { mitOrt } from './ausgabeOrt'

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
 *  - In der iPad-App (29.09.2026) landet alles in einem neuen Ordner unter Dokumente/Ausgaben
 *    (Dateien-App); danach öffnet sich das Teilen-Menü mit allen Dateien (mobil/umgebung.ts).
 *  - Seit 30.09.2026 geben die Programme ein Ablageziel mit (Programm, Fach, Themenbereich,
 *    export/ablageZiel.ts). Die iPad-App legt dann – solange die Ablage eingeschaltet ist –
 *    geordnet unter Dokumente/Schulmaterial/<Fach>/<Themenbereich> ab, ohne Ordnerwahl; die
 *    Meldung nennt den Ort in der Dateien-App und bietet „Teilen" an. Der PC ignoriert das Ziel.
 */

type PdfZusatz = {
  fillable?: boolean
  audio?: { id: string; fileName: string; title: string; base64: string }[]
  signatur?: { passwort: string; grund?: string; name?: string }
}

export type AusgabeDatei =
  /** Fertige Daten (Word, MP3, …) – gern als Funktion, dann wird erst nach der Ordnerwahl gebaut */
  | { name: string; daten: Uint8Array | string | (() => Promise<Uint8Array | string>); filter: FileFilter[] }
  /** PDF aus HTML; das Umrechnen übernimmt der Hauptprozess */
  | { name: string; html: string; pdf?: PdfZusatz }

export const WORD_FILTER: FileFilter[] = [{ name: 'Word-Dokument', extensions: ['docx'] }]

const datenVon = async (d: Extract<AusgabeDatei, { daten: unknown }>): Promise<Uint8Array | string> => (typeof d.daten === 'function' ? d.daten() : d.daten)

async function einzeln(d: AusgabeDatei, ziel?: AblageZiel): Promise<string | null> {
  if ('html' in d) return window.api.exporter.pdf(d.html, d.name, d.pdf, ziel)
  return window.api.files.save(d.name, d.filter, await datenVon(d), ziel)
}

async function inOrdner(ordner: string, d: AusgabeDatei): Promise<string> {
  if ('html' in d) return window.api.exporter.pdfInFolder(ordner, d.html, d.name, d.pdf)
  return window.api.files.saveInFolder(ordner, d.name, await datenVon(d))
}

const dateiname = (pfad: string): string => pfad.split(/[\\/]/).pop() ?? pfad

/** Legt die iPad-App mit diesem Ziel unter Schulmaterial ab? (Einstellung „schulmaterialAblage", Standard: an) */
const schulmaterialAblage = (ziel?: AblageZiel): boolean =>
  // IServ und Dateien-App: je Datei ohne Ordnerwahl (01.10.2026); Teilen: wie ohne Ablage
  ziel?.ort === 'iserv' || ziel?.ort === 'dateien'
    ? true
    : Boolean(ziel) && ziel?.ort !== 'teilen' && aufIos() && useAppSettings.getState().settings.schulmaterialAblage !== false

/**
 * Meldung nach dem Speichern. Liegt die Datei unter Schulmaterial (iPad), nennt sie den Ort, wie
 * ihn die Dateien-App zeigt, und bietet „Teilen" an (AirDrop, Mail, Drucken …) – sonst die
 * gewohnte kurze Meldung. Für Programme, die `files.save`/`exporter.pdf` direkt aufrufen.
 */
export function meldeAblage(pfade: string | string[], meldung: string): void {
  const liste = (Array.isArray(pfade) ? pfade : [pfade]).filter(Boolean)
  // Auf IServ bzw. in die Dateien-App (01.10.2026): Ort nennen, nichts zu teilen
  if (liste.length && liste.every((p) => istIservPfad(p) || p.startsWith('dateien:'))) {
    const iserv = liste.filter((p) => istIservPfad(p))
    notifications.show({
      title: meldung,
      autoClose: 15000,
      message: (
        <Text size="sm" data-iserv-ort={iserv.length ? iservAnzeige(iserv[0]) : undefined}>
          {iserv.length
            ? `Gespeichert unter ${iservAnzeige(iserv[0])}${liste.length > 1 ? ` (${liste.length} Dateien)` : ''}.`
            : 'Am gewählten Ort der Dateien-App gesichert.'}
        </Text>
      )
    })
    return
  }
  const ort = liste.length === 1 ? anzeigeOrt(liste[0]) : liste.length ? anzeigeOrt(liste[0].replace(/\/[^/]*$/, '')) : null
  if (!ort) {
    notifySuccess(meldung)
    return
  }
  notifications.show({
    title: meldung,
    autoClose: 15000,
    message: (
      <Stack gap={4} align="flex-start" data-schulmaterial-ort>
        <Text size="sm">
          Gespeichert unter {ort}
          {liste.length > 1 ? ` (${liste.length} Dateien)` : ''}.
        </Text>
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<IconShare size={14} />}
          onClick={() => void window.api.files.showInFolder(liste).catch((e: unknown) => notifyError(e, 'Die Dateien ließen sich nicht teilen'))}
        >
          Teilen
        </Button>
      </Stack>
    )
  })
}

/**
 * Speichert die Dateien und meldet es. Liefert die Zahl der gespeicherten Dateien – 0 heißt:
 * abgebrochen (dann gibt es auch keine Meldung). `ziel`: wohin das Material gehört (iPad).
 */
export async function speichereAusgabe(dateien: AusgabeDatei[], meldung: string, ziel?: AblageZiel): Promise<number> {
  if (!dateien.length) return 0
  // iPad: Ort wählen (Gerät, IServ, Dateien-App, Teilen – export/ausgabeOrt.tsx), EINMAL für alle Dateien
  const mitGewaehltemOrt = await mitOrt(ziel, dateien.length)
  if (mitGewaehltemOrt === null) return 0
  ziel = mitGewaehltemOrt
  // iPad mit Schulmaterial-Ablage: kein Ordner zu wählen, alles kommt in den Ordner von Fach und Themenbereich
  if (schulmaterialAblage(ziel)) {
    const pfade: string[] = []
    for (const d of dateien) {
      const pfad = await einzeln(d, ziel)
      if (pfad) pfade.push(pfad)
    }
    if (pfade.length) meldeAblage(pfade, meldung)
    return pfade.length
  }
  if (dateien.length === 1 || imNetz()) {
    let anzahl = 0
    for (const d of dateien) {
      const pfad = await einzeln(d, ziel)
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
  const ios = aufIos()
  // iPad: gleich alle Dateien zum Teilen anbieten (AirDrop, Mail, „In Dateien sichern" …)
  if (ios) void window.api.files.openFolder(ordner).catch((e: unknown) => notifyError(e, 'Die Dateien ließen sich nicht teilen'))
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
          leftSection={ios ? <IconShare size={14} /> : <IconFolderOpen size={14} />}
          onClick={() =>
            void window.api.files
              .openFolder(ordner)
              .catch((e: unknown) => notifyError(e, ios ? 'Die Dateien ließen sich nicht teilen' : 'Der Ordner ließ sich nicht öffnen'))
          }
        >
          {ios ? 'Teilen' : 'Ordner öffnen'}
        </Button>
      </Stack>
    )
  })
  return pfade.length
}
