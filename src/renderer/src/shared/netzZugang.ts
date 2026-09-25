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
     * Ereignisse (Fortschritt einer KI-Anfrage, Einrichtungsschritte) kommen im Browser
     * nicht an. Sie sind reine Anzeigehilfe: Ohne sie fehlt der Fortschrittsbalken, die
     * Anfrage läuft trotzdem. Die Abmeldung gibt es trotzdem zurück, damit aufräumender
     * Code nicht ins Leere greift.
     */
    subscribe: () => () => undefined
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
  api.exporter.print = async (html) => {
    /*
     * Drucken heisst hier: das fertige PDF im Browser oeffnen. Der Druckdialog dieses
     * Rechners waere der falsche – gedruckt werden soll dort, wo das Geraet steht.
     */
    const bytes = await api.exporter.preview(html)
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).slice().buffer], { type: 'application/pdf' }))
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  window.api = api
}
