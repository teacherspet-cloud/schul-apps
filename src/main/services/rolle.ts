/**
 * Wer darf Gemeinsames bearbeiten? (05.10.2026)
 *
 * In der Exe arbeitet EINE Person – sie ist Admin ihrer eigenen Daten. Am Server setzt start.ts die Rolle
 * der anfragenden Person ein (AsyncLocalStorage, server/kontext.ts). Die Dienste fragen nur `istAdmin()`
 * und `aufServer()` – vom Server wissen sie sonst nichts.
 *
 * Gebraucht für: gemeinsame Lehrwerke (nur Admins bearbeiten, Lehrkräfte lesen) und die Medienbank der Vokabeln.
 */
let rolleQuelle: () => 'admin' | 'lehrkraft' | 'schueler' | undefined = () => 'admin'

export function setzeRolleQuelle(fn: () => 'admin' | 'lehrkraft' | 'schueler' | undefined): void {
  rolleQuelle = fn
}

export const istAdmin = (): boolean => rolleQuelle() === 'admin'

/** Läuft der Code im Mehrnutzer-Server? */
export const aufServer = (): boolean => Boolean(process.env.SCHULAPPS_SERVER)

/** Fehler für Lehrkräfte, die Gemeinsames ändern wollen */
export function nurAdmin(was: string): void {
  if (!istAdmin()) throw new Error(`${was} dürfen nur Admins ändern.`)
}
