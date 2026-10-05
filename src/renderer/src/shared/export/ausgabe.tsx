import { Button, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconFolderOpen, IconShare } from '@tabler/icons-react'
import { anzeigeOrt } from '@shared/schulmaterial'
import type { AblageZiel, FileFilter } from '@shared/types'
import { imNetz } from '../netzZugang'
import { aufIos } from '../plattform'
import { useAppSettings } from '../settingsStore'
import { notifyError, notifySuccess } from '../util'
import { frageSeitenWahl, nimmSeitenWunsch, type SeitenDokument } from '../components/SeitenAuswahl'
import { renderPages } from '../components/PrintPreview'
import { seitenMarken, waehleSeitenImHtml, type SeitenMarke } from './seitenAuswahl'
import { istIservPfad, iservAnzeige } from '@shared/iserv'
import { mitOrt } from './ausgabeOrt'
import { frageVorhanden, vorhandenRunde } from './vorhandenFrage'
import { vorhandenName, type BeiVorhanden } from '@shared/vorhanden'

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
 *  - Seit 01.10.2026 lassen sich Seiten wählen: Ist im Ausgabe-Dialog „Nur bestimmte Seiten"
 *    angekreuzt (components/SeitenAuswahl.tsx), erscheinen vor dem Speichern die Seiten aller
 *    Dateien. PDFs mit Seitenzahlen werden VOR dem Umrechnen gekürzt und neu gezählt
 *    (export/seitenAuswahl.ts), PDFs ohne Seitenzahlen danach geschnitten (shared/seitenPdf.ts),
 *    Word-Dateien aus den Inhalten der gewählten Seiten neu gebaut (`seiten` an der Datei),
 *    mehrere Bilder (PNG) als je eine Seite gewählt.
 */

type PdfZusatz = {
  fillable?: boolean
  audio?: { id: string; fileName: string; title: string; base64: string }[]
  signatur?: { passwort: string; grund?: string; name?: string }
  /** Nur diese Seiten – setzt die Seitenauswahl bei Dokumenten ohne Seitenzahlen */
  seiten?: number[]
}

/**
 * Seitenwahl für Dateien, die nicht aus HTML entstehen (Word): Ausgewählt wird an den Seiten des
 * Druck-HTML derselben Inhalte; `mitAuswahl` baut die Datei dann nur aus diesen Seiten.
 */
export interface SeitenQuelle {
  /** Druck-HTML (gern als Funktion – gebaut wird es erst, wenn Seiten gewählt werden) */
  html: string | (() => string)
  /** `marken` der gewählten Seiten (leer, wenn das HTML keine trägt); `anzahl`: Seiten des ganzen Dokuments */
  mitAuswahl: (seiten: number[], marken: SeitenMarke[], anzahl: number) => Promise<Uint8Array | string>
  /** Hinweis im Auswahl-Dialog; Standard: der zu Word */
  hinweis?: string
}

export type AusgabeDatei =
  /** Fertige Daten (Word, MP3, …) – gern als Funktion, dann wird erst nach der Ordnerwahl gebaut */
  | { name: string; daten: Uint8Array | string | (() => Promise<Uint8Array | string>); filter: FileFilter[]; seiten?: SeitenQuelle }
  /** PDF aus HTML; das Umrechnen übernimmt der Hauptprozess */
  | { name: string; html: string; pdf?: PdfZusatz }

export const WORD_FILTER: FileFilter[] = [{ name: 'Word-Dokument', extensions: ['docx'] }]

const datenVon = async (d: Extract<AusgabeDatei, { daten: unknown }>): Promise<Uint8Array | string> => (typeof d.daten === 'function' ? d.daten() : d.daten)

async function einzeln(d: AusgabeDatei, ziel?: AblageZiel): Promise<string | null> {
  if ('html' in d) return window.api.exporter.pdf(d.html, d.name, d.pdf, ziel)
  return window.api.files.save(d.name, d.filter, await datenVon(d), ziel)
}

async function inOrdner(ordner: string, d: AusgabeDatei, beiVorhanden?: BeiVorhanden): Promise<string> {
  if ('html' in d) return window.api.exporter.pdfInFolder(ordner, d.html, d.name, d.pdf, beiVorhanden)
  return window.api.files.saveInFolder(ordner, d.name, await datenVon(d), beiVorhanden)
}

/** In den Ordner – gibt es den Namen schon, wird gefragt (05.10.2026); null = diese Datei nicht speichern */
async function inOrdnerMitFrage(ordner: string, d: AusgabeDatei, mehrere: boolean): Promise<string | null> {
  try {
    return await inOrdner(ordner, d)
  } catch (e) {
    const name = vorhandenName(e)
    if (!name) throw e
    const wahl = await frageVorhanden(name, 'Ordner', mehrere)
    return wahl ? inOrdner(ordner, d, wahl) : null
  }
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

export const WORD_SEITEN_HINWEIS =
  'Word setzt die Seiten selbst: Gespeichert werden die Inhalte der gewählten Seiten, die Seitenzahlen zählt Word für die Auswahl neu. Die Umbrüche können von der Vorschau abweichen.'

const istBild = (d: AusgabeDatei): boolean => !('html' in d) && d.filter.some((f) => f.extensions.some((e) => /^(png|jpe?g|webp)$/i.test(e)))

/** Seitenbilder eines Druck-HTML (wie in der Druckvorschau) */
const vorschauVon = async (html: string): Promise<string[]> => renderPages(await window.api.exporter.preview(html))

/**
 * Seiten wählen lassen und die Dateien entsprechend kürzen; null = abgebrochen.
 * Dateien ohne Seiten (MP3, PowerPoint) bleiben, wie sie sind.
 */
async function mitSeitenWahl(dateien: AusgabeDatei[]): Promise<AusgabeDatei[] | null> {
  const ergebnis: (AusgabeDatei | null)[] = [...dateien]
  const eintraege: { dok: SeitenDokument; anwenden: (seiten: number[]) => void }[] = []
  dateien.forEach((d, i) => {
    if ('html' in d) {
      const marken = seitenMarken(d.html)
      let anzahl = 0
      eintraege.push({
        dok: {
          name: d.name,
          teile: marken.map((m) => m.teil),
          bilder: async () => {
            const b = await vorschauVon(d.html)
            anzahl = b.length
            return b
          }
        },
        anwenden: (seiten) => {
          if (!seiten.length) ergebnis[i] = null
          else if (seiten.length === anzahl) ergebnis[i] = d
          // Seiten mit Marken: vor dem Umrechnen wählen und neu zählen; passt die Zahl nicht (Überlauf), im PDF schneiden
          else if (marken.length && marken.length === anzahl) ergebnis[i] = { ...d, html: waehleSeitenImHtml(d.html, seiten) }
          else ergebnis[i] = { ...d, pdf: { ...d.pdf, seiten } }
        }
      })
    } else if (d.seiten) {
      const q = d.seiten
      const html = typeof q.html === 'function' ? q.html() : q.html
      const marken = seitenMarken(html)
      let anzahl = 0
      eintraege.push({
        dok: {
          name: d.name,
          teile: marken.map((m) => m.teil),
          bilder: async () => {
            const b = await vorschauVon(html)
            anzahl = b.length
            return b
          },
          hinweis: q.hinweis ?? WORD_SEITEN_HINWEIS
        },
        anwenden: (seiten) => {
          if (!seiten.length) ergebnis[i] = null
          // Passen Marken und Seiten nicht zusammen (Überlauf), lässt sich nichts zuordnen – dann die ganze Datei
          else if ((marken.length && marken.length !== anzahl) || seiten.length === anzahl) ergebnis[i] = d
          else
            ergebnis[i] = { name: d.name, filter: d.filter, daten: () => q.mitAuswahl(seiten, marken.length ? seiten.map((s) => marken[s - 1]) : [], anzahl) }
        }
      })
    }
  })
  // Mehrere Bilder (Tafelbild als PNG): jedes Bild ist eine Seite
  const bilder = dateien.flatMap((d, i) => (istBild(d) && !('html' in d) && !d.seiten ? [{ d, i }] : []))
  if (bilder.length > 1) {
    const daten = await Promise.all(bilder.map(({ d }) => (!('html' in d) ? (typeof d.daten === 'function' ? d.daten() : d.daten) : '')))
    eintraege.push({
      dok: {
        name: `${bilder.length} Bilder`,
        bilder: daten.map((x) => (typeof x === 'string' ? x : URL.createObjectURL(new Blob([new Uint8Array(x).slice().buffer], { type: 'image/png' })))),
        hinweis: 'Jedes Bild ist eine eigene Datei.'
      },
      anwenden: (seiten) =>
        bilder.forEach(({ d, i }, k) => {
          ergebnis[i] = seiten.includes(k + 1) && !('html' in d) ? { name: d.name, filter: d.filter, daten: daten[k] } : null
        })
    })
  }
  if (!eintraege.length) return dateien
  const auswahl = await frageSeitenWahl(eintraege.map((e) => e.dok))
  if (!auswahl) return null
  eintraege.forEach((e, k) => e.anwenden(auswahl[k] ?? []))
  return ergebnis.filter((d): d is AusgabeDatei => d !== null)
}

/**
 * Speichert die Dateien und meldet es. Liefert die Zahl der gespeicherten Dateien – 0 heißt:
 * abgebrochen (dann gibt es auch keine Meldung). `ziel`: wohin das Material gehört (iPad).
 */
export async function speichereAusgabe(alle: AusgabeDatei[], meldung: string, ziel?: AblageZiel): Promise<number> {
  if (!alle.length) return 0
  // „Nur bestimmte Seiten" im Ausgabe-Dialog: erst die Seiten wählen (gilt für genau diese Ausgabe)
  const dateien = nimmSeitenWunsch() ? await mitSeitenWahl(alle) : alle
  if (!dateien?.length) return 0
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
  const gespeichert: AusgabeDatei[] = []
  vorhandenRunde()
  try {
    for (const [i, d] of dateien.entries()) {
      const pfad = await inOrdnerMitFrage(ordner, d, i < dateien.length - 1)
      if (pfad) {
        pfade.push(pfad)
        gespeichert.push(d)
      }
    }
  } finally {
    vorhandenRunde()
  }
  if (!pfade.length) return 0
  const ios = aufIos()
  // iPad: gleich alle Dateien zum Teilen anbieten (AirDrop, Mail, „In Dateien sichern" …)
  if (ios) void window.api.files.openFolder(ordner).catch((e: unknown) => notifyError(e, 'Die Dateien ließen sich nicht teilen'))
  // Hat eine Datei einen anderen Namen bekommen, weil es den gewünschten schon gab? Dann sagen, warum.
  const umbenannt = pfade.filter((p, i) => dateiname(p) !== gespeichert[i].name.replace(/[\\/]/g, ''))
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
