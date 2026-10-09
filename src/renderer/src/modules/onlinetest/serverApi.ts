/**
 * Aufrufe an den Schul-Apps-Server außerhalb der Programmkanäle (02.10.2026): Onlinetest,
 * Lerngruppen, Verwaltung. Sitzung per Cookie; die Kopfzeile schützt vor untergeschobenen
 * Formularen (src/server/http.ts). Abgelaufene Sitzung → zurück zur Anmeldung.
 */
/** Fehler des Servers – mit Statuscode und Antwort (z. B. 409 mit dem neueren Stand einer Reihe, 08.10.2026) */
export class ServerFehler extends Error {
  status?: number
  daten?: unknown
}

async function antwort<T>(r: Response): Promise<T> {
  if (r.status === 401) {
    window.location.assign(`/anmelden?ziel=${encodeURIComponent(window.location.pathname)}`)
    throw new ServerFehler('Die Anmeldung ist abgelaufen.')
  }
  const text = await r.text()
  let daten: unknown = {}
  try {
    daten = text.trim() ? JSON.parse(text) : {}
  } catch {
    throw new ServerFehler(`Der Server hat unerwartet geantwortet (${r.status}).`)
  }
  const d = daten as { fehler?: unknown; ok?: boolean }
  /*
   * Nur ein TEXT unter „fehler" ist eine Fehlermeldung (09.10.2026, Befund: Verwaltung › Server lud nie – seine Antwort
   * hat einen Abschnitt „fehler" mit der Fehlerübersicht, der als Fehler galt und als „[object Object]" erschien).
   */
  const meldung = typeof d.fehler === 'string' ? d.fehler : ''
  if (!r.ok || meldung) {
    const f = new ServerFehler(meldung || `Fehler ${r.status}`)
    f.status = r.status
    f.daten = daten
    throw f
  }
  return daten as T
}

/*
 * Wackelige Verbindung (Befund im Unterricht, 08.10.2026: Seiten hingen, Spiele mussten neu geladen werden): Jeder
 * Aufruf hat eine Zeitgrenze und wird bei Netzfehlern bzw. kurzer Nichterreichbarkeit (502/503/504, etwa beim Neustart
 * des Servers) mit wachsendem Abstand wiederholt – insgesamt rund 15 Sekunden. Danach eine klare Meldung statt Warten.
 *
 * Kein gelbes Aufblitzen (Befund der Lehrkraft, 08.10.2026 abends: oben blitzte kurz ein gelber Kasten auf, der wie ein
 * Fehler aussah): Das war „Verbindung unterbrochen" – es kam schon beim ERSTEN gescheiterten Versuch, also auch, wenn
 * die Wiederholung 0,8 s später klappte (Tablet aufgeweckt, WLAN noch nicht da) und wenn der Browser beim Verlassen der
 * Seite laufende Aufrufe abbricht. Jetzt erscheint der Hinweis erst, wenn ein gestörter Aufruf nach 3 Sekunden immer
 * noch nicht durch ist oder endgültig scheitert – und nie beim Verlassen der Seite.
 *
 * Absenden (POST) hat eine lange Zeitgrenze und wird nach Ablauf nicht wiederholt: Die Abgabe eines Arbeitsblatts wartet
 * auf die Rückmeldung der KI (oft länger als 15 s) – eine Wiederholung hätte die KI ein zweites Mal beauftragt.
 * Ebenso kein zweiter Versuch nach 504 (der Server kann den Auftrag dann schon bearbeiten).
 */
const ZEITGRENZE = 15000
const ZEITGRENZE_SENDEN = 180000
const PAUSEN = [800, 1600, 3200, 6400]
/** Erst nach so langer Störung den Hinweis zeigen */
const MELDEN_NACH = 3000
const warte = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Gestörte Aufrufe, die schon gemeldet sind; endgültig gescheitert (bis zum nächsten Erfolg) */
let gestoerte = 0
let ausgefallen = false
/** Seite wird verlassen: abgebrochene Aufrufe sind dann keine Störung */
let verlaesst = false
try {
  window.addEventListener('pagehide', () => (verlaesst = true))
  window.addEventListener('beforeunload', () => (verlaesst = true))
  window.addEventListener('pageshow', () => (verlaesst = false))
} catch {
  /* ohne Fenster (Tests) */
}

/** Meldung „Verbindung unterbrochen" für die Oberfläche (Ereignis an window) */
const melde = (): void => {
  try {
    window.dispatchEvent(new CustomEvent('schulapps-verbindung', { detail: { gestoert: gestoerte > 0 || ausgefallen, ausgefallen } }))
  } catch {
    /* ohne Fenster (Tests) */
  }
}

export async function abrufen(pfad: string, init: RequestInit, zeitgrenze?: number): Promise<Response> {
  const senden = (init.method ?? 'GET').toUpperCase() !== 'GET'
  let uhrMelden: ReturnType<typeof setTimeout> | undefined
  let gemeldet = false
  // Erste Störung: Hinweis erst, wenn es nach MELDEN_NACH immer noch hakt
  const stoerung = (): void => {
    if (gemeldet || uhrMelden || verlaesst) return
    uhrMelden = setTimeout(() => {
      uhrMelden = undefined
      if (verlaesst) return
      gemeldet = true
      gestoerte++
      melde()
    }, MELDEN_NACH)
  }
  const aufraeumen = (): void => {
    clearTimeout(uhrMelden)
    uhrMelden = undefined
    if (gemeldet) {
      gemeldet = false
      gestoerte--
    }
  }
  try {
    for (let versuch = 0; ; versuch++) {
      const ab = new AbortController()
      const uhr = setTimeout(() => ab.abort(), zeitgrenze ?? (senden ? ZEITGRENZE_SENDEN : ZEITGRENZE))
      try {
        const r = await fetch(pfad, { ...init, signal: ab.signal })
        const kurzWeg = r.status === 502 || r.status === 503 || (r.status === 504 && !senden)
        if (kurzWeg && versuch < PAUSEN.length) {
          stoerung()
          await warte(PAUSEN[versuch])
          continue
        }
        // Durchgekommen: Hinweis weg (auch nach einem früheren endgültigen Ausfall)
        const warGestoert = gemeldet || ausgefallen
        ausgefallen = false
        aufraeumen()
        if (warGestoert) melde()
        return r
      } catch {
        if (verlaesst) throw new ServerFehler('Die Seite wird gerade verlassen.')
        const zeitUm = ab.signal.aborted
        if (versuch >= PAUSEN.length || (senden && zeitUm)) {
          aufraeumen()
          ausgefallen = true
          melde()
          throw new ServerFehler(
            senden && zeitUm ? 'Der Server antwortet gerade nicht – bitte gleich noch einmal versuchen.' : 'Keine Verbindung zum Server – bitte gleich noch einmal versuchen.'
          )
        }
        stoerung()
        await warte(PAUSEN[versuch])
      } finally {
        clearTimeout(uhr)
      }
    }
  } finally {
    // Auch bei unerwarteten Ausnahmen keine hängende Meldung
    if (gemeldet || uhrMelden) {
      aufraeumen()
      melde()
    }
  }
}

export const holen = <T>(pfad: string): Promise<T> =>
  abrufen(pfad, { headers: { 'x-schulapps-token': 'server' }, cache: 'no-store' }).then((r) => antwort<T>(r))

/**
 * `zeitgrenze` (09.10.2026): kurze Aufrufe wie eine Antwort im Vokabeltrainer warten nicht die 3 Minuten der
 * Blatt-Abgabe – hing die Verbindung, war die Lernkarte so lange gesperrt (Befund: „Karteikarten frieren ein").
 */
export const senden = <T>(pfad: string, koerper: unknown = {}, zeitgrenze?: number): Promise<T> =>
  abrufen(
    pfad,
    {
      method: 'POST',
      headers: { 'x-schulapps-token': 'server', 'content-type': 'application/json' },
      body: JSON.stringify(koerper),
      cache: 'no-store'
    },
    zeitgrenze
  )
    .then((r) => antwort<T>(r))
    .then((d) => (gesendet(pfad), d))

/** Erfolgreich gesendet (08.10.2026): die Achievements fragen nach Antworten und Spielen nach Neuem (Achievements.tsx) */
const gesendet = (pfad: string): void => {
  try {
    window.dispatchEvent(new CustomEvent('schulapps-gesendet', { detail: { pfad } }))
  } catch {
    /* ohne Fenster (Tests) */
  }
}
