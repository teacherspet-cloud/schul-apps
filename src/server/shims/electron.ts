/**
 * `electron` für den Server (02.10.2026, vite.server.config.ts tauscht das Modul).
 *
 * Wie beim iPad (src/mobil/shims/electron.ts): nur, was die Dienste des Hauptprozesses brauchen.
 *  - `app.getPath('userData')` zeigt in den Ordner des Nutzers, dessen Anfrage gerade läuft
 *    (kontext.ts) – damit sind alle Ablagen ohne Änderung mehrnutzerfähig.
 *  - `safeStorage` verschlüsselt mit dem Hauptschlüssel des Servers (geheim.ts) statt Windows-DPAPI.
 *  - Fenster, Dialoge und Explorer gibt es nicht; PDF erzeugt server/druck.ts über die Umgebung.
 */
import { tmpdir } from 'node:os'
import { datenordner } from '../kontext'
import { entschluessle, verschluessle } from '../geheim'
import { RESSOURCEN } from '../pfade'
import { dirname } from 'node:path'

const nurAmPc = (was: string): never => {
  throw new Error(`${was} gibt es auf dem Server nicht.`)
}

declare const __APP_VERSION__: string

export const app = {
  // „nicht gepackt": resourcePath() nimmt dann getAppPath()/resources
  isPackaged: false,
  getPath: (name: string): string => (name === 'userData' ? datenordner() : tmpdir()),
  getAppPath: (): string => dirname(RESSOURCEN),
  getVersion: (): string => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'),
  getName: (): string => 'Schul-Apps',
  on: (): void => undefined,
  whenReady: (): Promise<void> => Promise.resolve()
}

export const safeStorage = {
  isEncryptionAvailable: (): boolean => true,
  encryptString: (text: string): Buffer => Buffer.from(verschluessle(text), 'utf8'),
  decryptString: (daten: Uint8Array): string => entschluessle(Buffer.from(daten).toString('utf8'))
}

export const dialog = new Proxy({}, { get: () => () => nurAmPc('Dateidialoge') }) as Record<string, (...a: unknown[]) => never>
/** Links öffnet der Browser der Lehrkraft selbst – auf dem Server ohne Wirkung */
export const shell = { openExternal: async (): Promise<void> => undefined, openPath: async (): Promise<string> => '', showItemInFolder: (): void => undefined }
export const ipcMain = new Proxy({}, { get: () => () => nurAmPc('Die Electron-Brücke') }) as Record<string, (...a: unknown[]) => never>

export class BrowserWindow {
  constructor() {
    nurAmPc('Unsichtbare Druckfenster')
  }
  static getAllWindows(): BrowserWindow[] {
    return []
  }
}

export default { app, safeStorage, dialog, shell, ipcMain, BrowserWindow }
