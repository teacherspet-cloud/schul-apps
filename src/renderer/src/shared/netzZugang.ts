/**
 * Die Oberfläche im BROWSER – wenn sie nicht in Electron läuft, sondern über das Netz kommt.
 *
 * Am Rechner stellt der Preload `window.api` bereit. Wird dieselbe Oberfläche von einem
 * Tablet aus geöffnet, gibt es keine Electron-Brücke: Dann baut diese Datei `window.api`
 * aus derselben Form (`@shared/apiShape`) auf, nur mit HTTP statt der Brücke.
 *
 * WARUM DIESELBE FORM: Zwei getrennte Fassungen würden auseinanderlaufen. Ein neuer Aufruf
 * funktionierte am Rechner und fehlte im Browser – ein stiller Fehler, der wie ein Fehler
 * der Oberfläche aussähe.
 *
 * WAS IM BROWSER ANDERS IST, und zwar mit Absicht:
 *  - Gesperrte Aufrufe (Schlüssel, Dateien des Rechners, Löschen) beantwortet der Server mit
 *    einer erklärenden Meldung statt mit einem stummen Fehler. Die Oberfläche blendet sie zusätzlich aus.
 *  - „Speichern" legt in der Bibliothek AUF DEM RECHNER ab – dort findet man das Material
 *    später wieder. Word und PDF werden dagegen auf das Gerät heruntergeladen, von dem aus
 *    gearbeitet wird; ein Dateidialog auf dem entfernten Rechner wäre sinnlos.
 */
import { buildApi } from '@shared/apiShape'
import { netzVerbindung } from './netzVerbindung'

/**
 * Läuft die Oberfläche im Browser statt in der App?
 *
 * EINMAL beim Laden festgehalten, nicht bei jedem Aufruf neu geprüft. Die erste Fassung
 * fragte jedes Mal, ob `window.api` fehlt – genau das, was diese Datei gleich darauf selbst
 * anlegt. Danach lautete die Antwort immer „nein": Die PIN-Abfrage erschien nie, und jeder
 * Aufruf scheiterte mit „Die Anmeldung ist abgelaufen".
 */
const imBrowserGestartet = typeof window !== 'undefined' && !window.api

export const imNetz = (): boolean => imBrowserGestartet

const SCHLUESSEL = 'schulapps-netz-token'

/** Die Verbindung zum PC – Adresse ist die eigene Herkunft, die Anmeldung liegt im localStorage */
const verbindung = netzVerbindung({
  basis: '',
  speicher: {
    lies: () => {
      try {
        return localStorage.getItem(SCHLUESSEL) ?? ''
      } catch {
        return ''
      }
    },
    schreibe: (t) => localStorage.setItem(SCHLUESSEL, t),
    loesche: () => localStorage.removeItem(SCHLUESSEL)
  }
})

/** Meldet das Gerät mit der PIN an; der Server gibt eine Kennung zurück. */
export const anmelden = (pin: string): Promise<void> => verbindung.anmelden(pin)

export const abgemeldet = (): boolean => verbindung.abgemeldet()

// Aufgeteilt am 30.09.2026: Anmeldung, Aufrufe und Ereignisstrom stehen in netzVerbindung.ts (auch für die iPad-App)
export { zerlegeStrom, type StromEreignis } from './netzVerbindung'

/** Hörer für ein Ereignis anmelden; der Strom startet mit dem ersten Hörer. */
export const horche = (kanal: string, cb: (wert: unknown) => void): (() => void) => verbindung.horche(kanal, cb)

/*
 * ---------- Drucken im Browser ----------
 *
 * Drucken heißt hier: das fertige PDF in einem neuen Tab öffnen und dort drucken. Der
 * Druckdialog des Rechners wäre der falsche – gedruckt werden soll dort, wo das Gerät steht.
 *
 * Zwei Fallen (Nachtrag zu Paket 4):
 *  - Ein neuer Tab darf nur als DIREKTE Folge eines Klicks aufgehen. Die erste Fassung öffnete
 *    ihn erst, nachdem das PDF erzeugt war – Sekunden später. Safari und strenge Popup-Blocker
 *    verwerfen das. Deshalb geht der Tab sofort auf (noch leer) und bekommt das PDF, sobald es da ist.
 *  - „Lösungen separat drucken" öffnete ZWEI Tabs; der zweite fällt dem Blocker sicher zum
 *    Opfer. Jetzt entsteht EIN PDF: Blatt, dann Lösungen ab einer neuen Seite.
 *
 * Wird der Tab trotzdem blockiert, wird das PDF heruntergeladen – verloren geht nichts.
 */
export async function druckeImBrowser(teile: string[], dateiname = 'Druck.pdf'): Promise<'tab' | 'datei'> {
  // VOR dem ersten `await`: So zählt das Öffnen noch als Folge des Klicks
  const tab = window.open('', '_blank')
  try {
    tab?.document.write('<p style="font-family:sans-serif;padding:2em">Druckansicht wird erstellt …</p>')
  } catch {
    // nur ein Hinweis im leeren Tab
  }
  try {
    const pdfs: Uint8Array[] = []
    for (const html of teile) pdfs.push(await window.api.exporter.preview(html))
    const bytes = pdfs.length === 1 ? pdfs[0] : await vereinePdfs(pdfs)
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).slice().buffer], { type: 'application/pdf' }))
    setTimeout(() => URL.revokeObjectURL(url), 120_000)
    if (tab && !tab.closed) {
      tab.location.href = url
      return 'tab'
    }
    const a = document.createElement('a')
    a.href = url
    a.download = dateiname
    a.click()
    return 'datei'
  } catch (e) {
    tab?.close()
    throw e
  }
}

/** Mehrere PDFs zu einem – jedes beginnt auf einer neuen Seite. */
export async function vereinePdfs(pdfs: Uint8Array[]): Promise<Uint8Array> {
  // Erst bei Bedarf geladen: pdf-lib braucht nur, wer im Browser Blatt und Lösungen zusammen druckt
  const { PDFDocument } = await import('pdf-lib')
  const ziel = await PDFDocument.create()
  for (const bytes of pdfs) {
    const quelle = await PDFDocument.load(bytes)
    for (const seite of await ziel.copyPages(quelle, quelle.getPageIndices())) ziel.addPage(seite)
  }
  return ziel.save()
}

/**
 * Baut `window.api` für den Browser. Tut nichts, wenn die Oberfläche in der App läuft.
 *
 * Muss laufen, BEVOR die Oberfläche das erste Mal auf `window.api` zugreift – deshalb steht
 * der Aufruf ganz oben im Einstiegspunkt.
 */
export function netzZugangEinrichten(): void {
  if (!imBrowserGestartet) return

  const call = <T>(channel: string, ...args: unknown[]): Promise<T> => verbindung.aufruf<T>(channel, args)

  const api = buildApi(call, {
    // Im Browser gibt es keinen Pfad auf dem Rechner – die Datei kommt als Inhalt an
    pathOf: () => '',
    /*
     * Ereignisse kommen über den Strom vom Server (`horche`, siehe oben): Fortschritt und
     * Warteplatz der eigenen Anfragen, geänderte KI-Modelle. Was der Server nicht ins Netz
     * lässt (Einrichtung des Abo-Zugangs, Schließen des Fensters am Rechner), kommt nie an –
     * die Abmeldung funktioniert trotzdem.
     */
    subscribe: horche
  }) as typeof window.api

  /*
   * Drei Aufrufe bedeuten im Browser etwas anderes – sie greifen sonst auf den falschen
   * Rechner zu (Entscheidung der Lehrkraft, 23.09.2026):
   *
   *   „Speichern" in die Bibliothek bleibt auf dem Rechner – dort findet man das Material
   *   wieder. Eine DATEI dagegen gehoert auf das Geraet, an dem man sitzt: Ein Dateidialog
   *   auf dem entfernten Rechner waere sinnlos, und die Datei laege dort, wo niemand ist.
   */
  const herunterladen = (name: string, daten: Uint8Array | string, typ: string): void => {
    // Die Kopie ist nötig: Ein Uint8Array kann auf einem geteilten Puffer liegen, den Blob nicht annimmt
    const teil: BlobPart = typeof daten === 'string' ? daten : new Uint8Array(daten).slice().buffer
    const blob = new Blob([teil], { type: typ })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  api.files.save = async (defaultName, _filters, daten) => {
    herunterladen(
      defaultName,
      daten,
      defaultName.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/octet-stream'
    )
    return defaultName
  }
  /*
   * „Wurde die App durch Doppelklick auf eine Datei gestartet?" – eine Frage an die
   * Befehlszeile DIESES Rechners. Vom Tablet aus hat sie keinen Sinn.
   *
   * Sie lief trotzdem: Das Vokabeltest-Programm fragt beim Aufbauen danach, und die Programme
   * bleiben geladen. Jede Browsersitzung begann also mit der Meldung „files:launch-file ist
   * über das Netz nicht freigegeben", noch bevor jemand etwas angeklickt hatte.
   */
  api.files.launchFile = async () => null

  /*
   * „Datei öffnen" braucht im Browser die Dateiauswahl des GERÄTS. Der Dialog des Rechners
   * wäre dort unsichtbar – die Oberfläche hinge, und niemand wüsste warum.
   */
  api.files.open = (filters) =>
    new Promise((ok) => {
      const feld = document.createElement('input')
      feld.type = 'file'
      const endungen = filters.flatMap((f) => f.extensions).filter((e) => e && e !== '*')
      if (endungen.length) feld.accept = endungen.map((e) => `.${e}`).join(',')
      feld.onchange = async () => {
        const datei = feld.files?.[0]
        if (!datei) return ok(null)
        ok({ name: datei.name, data: new Uint8Array(await datei.arrayBuffer()) })
      }
      // Bricht der Nutzer ab, meldet der Browser nichts – dann bleibt es bei „nichts gewählt"
      feld.oncancel = () => ok(null)
      feld.click()
    })

  api.exporter.pdf = async (html, defaultName) => {
    // `export:pdf` wuerde auf dem entfernten Rechner speichern; die Vorschau liefert dieselben Bytes
    herunterladen(defaultName, await api.exporter.preview(html), 'application/pdf')
    return defaultName
  }
  /*
   * Einen Ordner DIESES Rechners zu wählen, hat vom Tablet aus keinen Sinn. Die Ausgabe mehrerer
   * Dateien (shared/export/ausgabe.tsx) lädt im Browser deshalb jede Datei einzeln herunter und
   * fragt gar nicht erst danach; kommt der Aufruf doch einmal an, heißt die Antwort „abgebrochen".
   */
  api.files.chooseFolder = async () => null
  // Drucken: PDF im neuen Tab des Geräts (siehe `druckeImBrowser`)
  api.exporter.print = async (html) => {
    await druckeImBrowser([html])
  }

  window.api = api
}
