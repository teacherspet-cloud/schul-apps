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

const token = (): string => {
  try {
    return localStorage.getItem(SCHLUESSEL) ?? ''
  } catch {
    return ''
  }
}

/** Meldet das Gerät mit der PIN an; der Server gibt eine Kennung zurück. */
export async function anmelden(pin: string): Promise<void> {
  const res = await fetch('/anmelden', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) })
  const daten = (await res.json()) as { token?: string; fehler?: string; verbleibend?: number }
  if (!res.ok || !daten.token) {
    throw new Error(daten.fehler + (typeof daten.verbleibend === 'number' ? ` Noch ${daten.verbleibend} Versuche.` : ''))
  }
  localStorage.setItem(SCHLUESSEL, daten.token)
  // Ein offener Strom gehört zur alten Anmeldung – Ereignisse der neuen kämen dort nie an
  stromSteuerung?.abort()
}

export const abgemeldet = (): boolean => !token()

/** Binärdaten kommen als Base64 – über HTTP gibt es keine Uint8Array. */
function auspacken(wert: unknown): unknown {
  if (wert && typeof wert === 'object' && '__bytes' in (wert as Record<string, unknown>)) {
    const b64 = String((wert as { __bytes: string }).__bytes)
    const roh = atob(b64)
    const bytes = new Uint8Array(roh.length)
    for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i)
    return bytes
  }
  if (Array.isArray(wert)) return wert.map(auspacken)
  if (wert && typeof wert === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(wert as Record<string, unknown>)) out[k] = auspacken(v)
    return out
  }
  return wert
}

function packen(wert: unknown): unknown {
  if (wert instanceof Uint8Array) {
    let s = ''
    for (const b of wert) s += String.fromCharCode(b)
    return { __bytes: btoa(s) }
  }
  if (Array.isArray(wert)) return wert.map(packen)
  if (wert && typeof wert === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(wert as Record<string, unknown>)) out[k] = packen(v)
    return out
  }
  return wert
}

/*
 * ---------- Ereignisse vom Rechner (Fortschritt, Warteplatz, Modellhinweise) ----------
 *
 * Am Rechner kommen sie über die Electron-Brücke. Im Browser liest diese Datei einen Strom
 * vom Server (GET /ereignisse, Server-Sent Events). Warum dieser Weg und nicht Abfragen im
 * Takt oder EventSource, steht in main/services/lanServer.ts. Der Server schickt nur, was zu
 * Anfragen DIESES Geräts gehört oder alle angeht.
 */

/** Ein Ereignis aus dem Strom */
export interface StromEreignis {
  nr: string
  kanal: string
  wert: unknown
}

/**
 * Zerlegt gelesenen Text in Ereignisse; ein unvollständiger Rest bleibt für das nächste Stück.
 *
 * Ein Ereignis endet mit einer Leerzeile. Zeilen mit „:" am Anfang sind Herzschlag bzw.
 * Kommentar und tragen nichts. Der Text kann an JEDER Stelle abreißen – mitten in einer Zeile
 * oder zwischen „\n" und „\n" –, deshalb wird nur vollständig Abgeschlossenes ausgewertet.
 */
export function zerlegeStrom(text: string): { ereignisse: StromEreignis[]; rest: string } {
  const ereignisse: StromEreignis[] = []
  const bloecke = text.replace(/\r\n?/g, '\n').split('\n\n')
  const rest = bloecke.pop() ?? ''
  for (const block of bloecke) {
    let nr = ''
    const daten: string[] = []
    for (const zeile of block.split('\n')) {
      if (zeile.startsWith('id:')) nr = zeile.slice(3).trim()
      else if (zeile.startsWith('data:')) daten.push(zeile.slice(5).replace(/^ /, ''))
    }
    if (!daten.length) continue
    try {
      const { kanal, wert } = JSON.parse(daten.join('\n')) as { kanal?: string; wert?: unknown }
      if (typeof kanal === 'string') ereignisse.push({ nr, kanal, wert })
    } catch {
      // ein kaputtes Ereignis überspringen, der Strom geht weiter
    }
  }
  return { ereignisse, rest }
}

/** Kommt so lange gar nichts – auch kein Herzschlag (alle 15 s) –, gilt die Verbindung als tot. */
const STILLE_MS = 45_000

const hoerer = new Map<string, Set<(wert: unknown) => void>>()
let stromLaeuft = false
/** Der gerade offene Strom – nach einer neuen Anmeldung wird er mit dem neuen Token neu geöffnet */
let stromSteuerung: AbortController | null = null

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Hält den Strom offen – solange die Seite lebt.
 *
 * Reißt er ab (WLAN weg, Tablet im Ruhezustand, Rechner neu gestartet), wird er mit
 * wachsender Pause (1 s bis 15 s) neu aufgebaut. Dabei nennt der Browser das zuletzt
 * erhaltene Ereignis (`last-event-id`); der Server liefert nach, was dazwischen kam – vor
 * allem „Platz frei", sonst stünde ein Auftrag für immer auf „wartet".
 * Ohne Anmeldung wird nichts geöffnet; der Server würde ohnehin ablehnen.
 */
async function halteStrom(): Promise<void> {
  let letzte = ''
  let letzterToken = ''
  let warte = 1000
  for (;;) {
    const t = token()
    if (!t) {
      await pause(2000)
      continue
    }
    // Neue Anmeldung = neue Sitzung am Server mit eigener Zählung
    if (t !== letzterToken) letzte = ''
    letzterToken = t
    const steuerung = new AbortController()
    stromSteuerung = steuerung
    let wache: ReturnType<typeof setTimeout> | undefined
    const lebt = (): void => {
      clearTimeout(wache)
      wache = setTimeout(() => steuerung.abort(), STILLE_MS)
    }
    try {
      lebt()
      const res = await fetch('/ereignisse', {
        headers: { 'x-schulapps-token': t, ...(letzte ? { 'last-event-id': letzte } : {}) },
        cache: 'no-store',
        signal: steuerung.signal
      })
      if (res.ok && res.body) {
        warte = 1000
        const leser = res.body.getReader()
        // `stream: true`: Ein Umlaut kann auf zwei Stücke verteilt ankommen
        const decoder = new TextDecoder()
        let puffer = ''
        for (;;) {
          const { done, value } = await leser.read()
          if (done) break
          lebt()
          puffer += decoder.decode(value, { stream: true })
          const { ereignisse, rest } = zerlegeStrom(puffer)
          puffer = rest
          for (const e of ereignisse) {
            if (e.nr) letzte = e.nr
            for (const cb of hoerer.get(e.kanal) ?? []) {
              try {
                cb(e.wert)
              } catch {
                // ein fehlerhafter Hörer hält die übrigen nicht auf
              }
            }
          }
        }
      } else if (res.status === 401) {
        // Abgemeldet (z. B. Zugang am Rechner neu eingeschaltet): kein neuer Strom, bis wieder eine PIN eingegeben ist
        letzte = ''
        await pause(5000)
      }
    } catch {
      // abgerissen oder zu lange still – unten neu verbinden
    } finally {
      clearTimeout(wache)
      steuerung.abort()
    }
    await pause(warte)
    warte = Math.min(15_000, warte * 2)
  }
}

/** Hörer für ein Ereignis anmelden; der Strom startet mit dem ersten Hörer. */
export function horche(kanal: string, cb: (wert: unknown) => void): () => void {
  if (!hoerer.has(kanal)) hoerer.set(kanal, new Set())
  hoerer.get(kanal)!.add(cb)
  if (!stromLaeuft && typeof fetch === 'function') {
    stromLaeuft = true
    void halteStrom()
  }
  return () => {
    hoerer.get(kanal)?.delete(cb)
  }
}

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

  const call = async <T>(channel: string, ...args: unknown[]): Promise<T> => {
    const res = await fetch('/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-schulapps-token': token() },
      body: JSON.stringify({ channel, args: args.map(packen) })
    })
    const daten = (await res.json()) as { ok?: boolean; value?: unknown; error?: string; fehler?: string }
    if (res.status === 401) {
      localStorage.removeItem(SCHLUESSEL)
      throw new Error('Die Anmeldung ist abgelaufen. Bitte die PIN erneut eingeben.')
    }
    if (daten.fehler) throw new Error(daten.fehler)
    if (daten.ok === false) throw new Error(daten.error)
    return auspacken(daten.value) as T
  }

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
