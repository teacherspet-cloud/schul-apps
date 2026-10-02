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
import { AbbruchFehler, istAbbruch } from '@shared/abbruch'
import { pdfMitSeiten } from '@shared/seitenPdf'
import { AuftragUnterbrochen, fuehreAuftragAus, kennungIn, REGISTER_KANAELE } from './netzAuftrag'
import { AnmeldungAbgelaufen, netzVerbindung, OhneAuftragsregister } from './netzVerbindung'

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

/**
 * Auf dem Schul-Apps-Server (02.10.2026, src/server) gilt die Sitzung per Cookie: Der Server
 * setzt es bei der Anmeldung (IServ oder Testkonto), der Browser schickt es von selbst mit. Die
 * Kopfzeile x-schulapps-token trägt dann nur ein festes Zeichen (Schutz gegen untergeschobene
 * Formulare). Läuft die Sitzung ab, geht es zurück zur Anmeldeseite.
 */
const aufDemServer = typeof window !== 'undefined' && Boolean(window.__schulappsServer)
const serverSpeicher = {
  lies: (): string => 'server',
  schreibe: (): void => undefined,
  loesche: (): void => {
    window.location.assign(`/anmelden?ziel=${encodeURIComponent('/')}`)
  }
}

/** Die Verbindung zum PC – Adresse ist die eigene Herkunft, die Anmeldung liegt im localStorage */
const verbindung = netzVerbindung({
  basis: '',
  speicher: aufDemServer ? serverSpeicher : {
    lies: () => {
      try {
        return localStorage.getItem(SCHLUESSEL) ?? ''
      } catch {
        return ''
      }
    },
    schreibe: (t) => localStorage.setItem(SCHLUESSEL, t),
    loesche: () => localStorage.removeItem(SCHLUESSEL)
  },
  geraet: imBrowserGestartet ? geraetKennung() : undefined
})

/** Eine zufällige Kennung dieses Browsers für das Auftragsregister am PC (bleibt im localStorage) */
function geraetKennung(): string {
  const neu = (): string => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')
  try {
    const da = localStorage.getItem('schulapps-netz-geraet')
    if (da && /^[a-z0-9]{24}$/.test(da)) return da
    const k = neu()
    localStorage.setItem('schulapps-netz-geraet', k)
    return k
  } catch {
    return neu()
  }
}

/** Meldet das Gerät mit der PIN an; der Server gibt eine Kennung zurück. */
export const anmelden = async (pin: string): Promise<void> => void (await verbindung.anmelden(pin))

export const abgemeldet = (): boolean => verbindung.abgemeldet()

// Aufgeteilt am 30.09.2026: Anmeldung, Aufrufe und Ereignisstrom stehen in netzVerbindung.ts (auch für die iPad-App)
export { zerlegeStrom, type StromEreignis } from './netzVerbindung'

/*
 * ---------- Lange Anfragen über das Auftragsregister (30.09.2026) ----------
 *
 * Wie in der iPad-App (mobil/pcKi.ts): KI und Vertonung laufen am Rechner als Auftrag mit ID
 * (shared/netzAuftrag.ts). Reißt die Verbindung ab, läuft er dort weiter, und der Browser fragt
 * nach, statt neu zu senden. Seitdem bricht der Rechner eine Anfrage nicht mehr ab, nur weil
 * die Verbindung wegfällt – ohne diesen Weg wäre das Ergebnis dann verloren.
 */
/** Auftrags-ID → Kennung der Anfrage (Fortschritt kommt vom Server als „auftrag:<ID>") */
const lokalVonAuftrag = new Map<string, string>()
/** Kennung der Anfrage → Abbruch */
const laufend = new Map<string, AbortController>()
/** Nur hier erzeugte Ereignisse (Verbindung unterbrochen/wieder da) */
const eigeneHoerer = new Map<string, Set<(wert: unknown) => void>>()
let ohneRegister = false
/** Wartende Aufträge nach einer Unterbrechung – „online" oder Rückkehr auf die Seite weckt sie */
const schlaefer = new Set<() => void>()

function eigenesEreignis(kanal: string, wert: unknown): void {
  for (const cb of eigeneHoerer.get(kanal) ?? []) {
    try {
      cb(wert)
    } catch {
      // ein fehlerhafter Hörer hält die übrigen nicht auf
    }
  }
}

function weckbarePause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((ok, fehler) => {
    if (signal.aborted) return fehler(new AbbruchFehler())
    const fertig = (): void => {
      clearTimeout(t)
      schlaefer.delete(fertig)
      ok()
    }
    const t = setTimeout(fertig, ms)
    schlaefer.add(fertig)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      schlaefer.delete(fertig)
      fehler(new AbbruchFehler())
    })
  })
}

if (imBrowserGestartet) {
  const wecken = (): void => {
    for (const w of [...schlaefer]) w()
  }
  window.addEventListener('online', wecken)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wecken()
  })
}

async function langerAufruf<T>(channel: string, args: unknown[]): Promise<T> {
  if (ohneRegister) return verbindung.aufruf<T>(channel, args)
  const lokal = kennungIn(channel, args)
  const steuerung = new AbortController()
  const id = `${Date.now().toString(36)}-${Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => (b % 36).toString(36)).join('')}`
  if (lokal) {
    laufend.set(lokal, steuerung)
    lokalVonAuftrag.set(id, lokal)
  }
  try {
    return await fuehreAuftragAus<T>({
      v: verbindung,
      id,
      kanal: channel,
      args,
      signal: steuerung.signal,
      pause: weckbarePause,
      // Ohne Anmeldung fragt die Oberfläche nach der PIN – das übernimmt der gewöhnliche Weg
      bereit: async () => {
        if (verbindung.abgemeldet()) throw new AnmeldungAbgelaufen()
      },
      zustand: (z) => {
        if (lokal) eigenesEreignis('ai:verbindung', { id: lokal, zustand: z })
      },
      fortschritt: (f) => {
        if (lokal) eigenesEreignis('ai:progress', { ...f, id: lokal })
      }
    })
  } catch (e) {
    if (e instanceof OhneAuftragsregister) {
      ohneRegister = true
      return verbindung.aufruf<T>(channel, args)
    }
    if (steuerung.signal.aborted || istAbbruch(e)) {
      if (steuerung.signal.aborted) void verbindung.auftrag('abbrechen', { id }).catch(() => undefined)
      throw new AbbruchFehler()
    }
    if (e instanceof AuftragUnterbrochen) {
      throw new Error(e.angenommen ? e.message : 'Der Rechner ist nicht erreichbar. Läuft Schul-Apps dort noch mit eingeschaltetem Netzzugang?')
    }
    throw e
  } finally {
    if (lokal && laufend.get(lokal) === steuerung) laufend.delete(lokal)
    lokalVonAuftrag.delete(id)
  }
}

/** Hörer für ein Ereignis anmelden; der Strom startet mit dem ersten Hörer. */
export const horche = (kanal: string, cb: (wert: unknown) => void): (() => void) => {
  if (!eigeneHoerer.has(kanal)) eigeneHoerer.set(kanal, new Set())
  eigeneHoerer.get(kanal)!.add(cb)
  const eigenesAb = (): void => void eigeneHoerer.get(kanal)?.delete(cb)
  if (kanal === 'ai:verbindung') return eigenesAb
  // Ereignisse zu Aufträgen tragen „auftrag:<ID>" – zurück auf die Kennung der Anfrage
  const stromAb = verbindung.horche(kanal, (wert) => {
    const id = wert && typeof wert === 'object' ? (wert as { id?: unknown }).id : undefined
    if (typeof id === 'string' && id.startsWith('auftrag:')) {
      const lokal = lokalVonAuftrag.get(id.slice('auftrag:'.length))
      if (lokal) cb({ ...(wert as object), id: lokal })
      return
    }
    cb(wert)
  })
  return () => {
    eigenesAb()
    stromAb()
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

  const call = <T>(channel: string, ...args: unknown[]): Promise<T> => {
    if (REGISTER_KANAELE.includes(channel)) return langerAufruf<T>(channel, args)
    if (channel === 'ai:cancel' && typeof args[0] === 'string' && laufend.has(args[0])) {
      // Läuft als Auftrag: der Abbruch des Signals beendet ihn auch am Rechner (langerAufruf)
      laufend.get(args[0])!.abort()
      return Promise.resolve(undefined as T)
    }
    return verbindung.aufruf<T>(channel, args)
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

  /*
   * Exe „Schul-Apps Online" (02.10.2026): IServ-Ordner über die Exe (Passwort nur auf dem PC).
   * Die Einstellungen (Schule, Benutzer, Ziel – kein Passwort) liegen auf dem Server.
   */
  const client = window.__schulappsClient
  if (client) {
    const iserv = client.iserv
    api.iserv = {
      ...api.iserv,
      status: iserv.status as typeof api.iserv.status,
      ordner: iserv.ordner as typeof api.iserv.ordner,
      eintraege: iserv.eintraege as typeof api.iserv.eintraege,
      laden: iserv.laden,
      verbinden: async (eingabe) => {
        const r = await iserv.verbinden(eingabe)
        const alt = (await api.settings.get()).iserv
        await api.settings.set({ iserv: { schule: eingabe.schule.trim(), benutzer: eingabe.benutzer.trim(), basis: r.basis, ziel: alt?.ziel || 'Home/Schulmaterial' } })
        return r as Awaited<ReturnType<typeof api.iserv.verbinden>>
      },
      trennen: async () => {
        await iserv.trennen()
        const alt = (await api.settings.get()).iserv
        if (alt) await api.settings.set({ iserv: { ...alt, basis: '' } })
      }
    }
  }
  const aufIservAblegen = async (name: string, daten: Uint8Array | string, ziel: unknown): Promise<string> =>
    client!.iserv.ablegen(name, daten, ziel, (await api.settings.get()).iserv?.ziel)

  api.files.save = async (defaultName, _filters, daten, ziel) => {
    // Rückfrage „Wohin?" (shared/export/ausgabeOrt.tsx) – mit der Exe auch IServ
    const z = await api.vermittlung.aktuell().ortWahl?.(ziel)
    if (z === null) return null
    if (z?.ort === 'iserv' && client) return aufIservAblegen(defaultName, daten, z)
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
  const imBrowserOeffnen = (filters: Parameters<typeof api.files.open>[0]): ReturnType<typeof api.files.open> =>
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
  // Rückfrage „Von wo?" (shared/export/eingabeOrt.tsx) – mit der Exe auch IServ
  api.files.open = async (filters) => {
    const gewaehlt = await api.vermittlung.aktuell().dateiWahl?.(filters)
    if (gewaehlt !== undefined) return gewaehlt
    return imBrowserOeffnen(filters)
  }

  api.exporter.pdf = async (html, defaultName, opts, ziel) => {
    const z = await api.vermittlung.aktuell().ortWahl?.(ziel)
    if (z === null) return null
    // `export:pdf` wuerde auf dem entfernten Rechner speichern; die Vorschau liefert dieselben Bytes
    const bytes = await api.exporter.preview(html)
    if (z?.ort === 'iserv' && client) return aufIservAblegen(defaultName, opts?.seiten?.length ? await pdfMitSeiten(bytes, opts.seiten) : bytes, z)
    // Seitenauswahl bei Dokumenten ohne Seitenzahlen (shared/seitenPdf.ts)
    herunterladen(defaultName, opts?.seiten?.length ? await pdfMitSeiten(bytes, opts.seiten) : bytes, 'application/pdf')
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
