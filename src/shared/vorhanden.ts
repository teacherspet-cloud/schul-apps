/**
 * Gleichnamiges Material am Speicherort (05.10.2026, Wunsch der Lehrkraft: „Wenn Material mit dem gleichen
 * Namen bereits am Speicherort vorhanden ist, frage den Nutzer, ob er das vorherige Material überschreiben
 * oder eine Kopie / zweite Version anlegen möchte").
 *
 * Bis dahin bekam die neue Datei still ein „(2)" – in einem gewählten Ordner und auf IServ. Jetzt meldet der
 * Speicherweg einen Fehler mit diesem Kennzeichen, solange keine Entscheidung mitkommt; die Oberfläche fragt
 * und versucht es mit `beiVorhanden` erneut. Der Speichern-Dialog von Windows fragt ohnehin selbst.
 */
export type BeiVorhanden = 'ersetzen' | 'neu'

export const VORHANDEN = 'VORHANDEN:'

/** Fehlermeldung für „gibt es schon" (übersteht den Weg über IPC/HTTP als Text) */
export const vorhandenFehler = (name: string): Error => new Error(`${VORHANDEN}${name}`)

/** Name der vorhandenen Datei, wenn `e` dieser Fehler ist */
export function vorhandenName(e: unknown): string | null {
  const m = /VORHANDEN:([^\n]+)/.exec(e instanceof Error ? e.message : String(e ?? ''))
  return m ? m[1].trim() : null
}

/** Rückfrage der Oberfläche; null = abgebrochen */
export type VorhandenWahlFn = (name: string, ort: string) => Promise<BeiVorhanden | null>
