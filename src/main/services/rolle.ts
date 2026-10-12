/**
 * Wer darf Gemeinsames bearbeiten? (05.10.2026)
 *
 * In der Exe arbeitet EINE Person – sie ist Admin ihrer eigenen Daten. Am Server setzt start.ts die Rolle
 * der anfragenden Person ein (AsyncLocalStorage, server/kontext.ts). Die Dienste fragen nur `istAdmin()`
 * und `aufServer()` – vom Server wissen sie sonst nichts.
 *
 * Gebraucht für: gemeinsame Lehrwerke (nur Admins bearbeiten, Lehrkräfte lesen) und die Medienbank der Vokabeln.
 */
import { darfLehrwerkFach } from '@shared/fachobleute'

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

/*
 * Fachobleute (12.10.2026, shared/fachobleute.ts): Am Server setzt start.ts die Fächer der anfragenden Person ein
 * (server/fachobleute.ts). In der Exe gibt es keine – dort ist die eine Person ohnehin Admin.
 */
let obmannQuelle: () => readonly string[] = () => []

export function setzeFachobmannQuelle(fn: () => readonly string[]): void {
  obmannQuelle = fn
}

/** Darf die anfragende Person gemeinsame Lehrwerke dieser Sprache bearbeiten (Admin oder Fachobfrau/-mann)? */
export const darfLehrwerkSprache = (sprache: string): boolean => darfLehrwerkFach(rolleQuelle(), obmannQuelle(), sprache)

/** Fehler für Lehrkräfte ohne Recht am Fach */
export function nurFachobleute(was: string, sprache: string): void {
  if (!darfLehrwerkSprache(sprache)) throw new Error(`${was} dürfen nur Admins und die Fachobleute des Fachs ändern.`)
}
