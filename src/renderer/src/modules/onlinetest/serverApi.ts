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

export const holen = <T>(pfad: string): Promise<T> => fetch(pfad, { headers: { 'x-schulapps-token': 'server' }, cache: 'no-store' }).then((r) => antwort<T>(r))

export const senden = <T>(pfad: string, koerper: unknown = {}): Promise<T> =>
  fetch(pfad, { method: 'POST', headers: { 'x-schulapps-token': 'server', 'content-type': 'application/json' }, body: JSON.stringify(koerper), cache: 'no-store' }).then((r) =>
    antwort<T>(r)
  )
