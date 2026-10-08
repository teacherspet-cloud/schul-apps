/**
 * Aufrufe an den Schul-Apps-Server außerhalb der Programmkanäle (02.10.2026): Onlinetest,
 * Lerngruppen, Verwaltung. Sitzung per Cookie; die Kopfzeile schützt vor untergeschobenen
 * Formularen (src/server/http.ts). Abgelaufene Sitzung → zurück zur Anmeldung.
 */
export class ServerFehler extends Error {}

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
  const d = daten as { fehler?: string; ok?: boolean }
  if (!r.ok || d.fehler) throw new ServerFehler(d.fehler || `Fehler ${r.status}`)
  return daten as T
}

/*
 * Wackelige Verbindung (Befund im Unterricht, 08.10.2026: Seiten hingen, Spiele mussten neu geladen werden): Jeder
 * Aufruf hat eine Zeitgrenze und wird bei Netzfehlern bzw. kurzer Nichterreichbarkeit (502/503/504, etwa beim Neustart
 * des Servers) mit wachsendem Abstand wiederholt – insgesamt rund 15 Sekunden. Danach eine klare Meldung statt Warten.
 */
const ZEITGRENZE = 15000
const PAUSEN = [800, 1600, 3200, 6400]
const warte = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Meldung „Verbindung unterbrochen" für die Oberfläche (Ereignis an window) */
const melde = (an: boolean): void => {
  try {
    window.dispatchEvent(new CustomEvent('schulapps-verbindung', { detail: { gestoert: an } }))
  } catch {
    /* ohne Fenster (Tests) */
  }
}

export async function abrufen(pfad: string, init: RequestInit): Promise<Response> {
  for (let versuch = 0; ; versuch++) {
    const ab = new AbortController()
    const uhr = setTimeout(() => ab.abort(), ZEITGRENZE)
    try {
      const r = await fetch(pfad, { ...init, signal: ab.signal })
      if ((r.status === 502 || r.status === 503 || r.status === 504) && versuch < PAUSEN.length) {
        melde(true)
        await warte(PAUSEN[versuch])
        continue
      }
      if (versuch) melde(false)
      return r
    } catch {
      if (versuch >= PAUSEN.length) {
        melde(true)
        throw new ServerFehler('Keine Verbindung zum Server – bitte gleich noch einmal versuchen.')
      }
      melde(true)
      await warte(PAUSEN[versuch])
    } finally {
      clearTimeout(uhr)
    }
  }
}

export const holen = <T>(pfad: string): Promise<T> =>
  abrufen(pfad, { headers: { 'x-schulapps-token': 'server' }, cache: 'no-store' }).then((r) => antwort<T>(r))

export const senden = <T>(pfad: string, koerper: unknown = {}): Promise<T> =>
  abrufen(pfad, {
    method: 'POST',
    headers: { 'x-schulapps-token': 'server', 'content-type': 'application/json' },
    body: JSON.stringify(koerper),
    cache: 'no-store'
  }).then((r) => antwort<T>(r))
