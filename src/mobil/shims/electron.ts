/**
 * `electron` für die iPad-App: nur, was die Dienste des Hauptprozesses beim Laden und im Betrieb
 * brauchen. Dialoge, Explorer und Fenster gibt es nicht – sie laufen auf dem iPad über die
 * Umgebung (mobil/umgebung.ts); wer sie doch direkt anspricht, bekommt eine klare Meldung.
 */
import { Buffer } from 'buffer'

const nurAmPc = (was: string): never => {
  throw new Error(`${was} gibt es nur in der App am PC.`)
}

/** Fassung der App – setzt vite.mobil.config.ts aus package.json */
declare const __APP_VERSION__: string

export const app = {
  isPackaged: true,
  getPath: (name: string): string => (name === 'userData' ? '/userData' : name === 'documents' ? '/documents' : '/tmp'),
  getAppPath: (): string => '/',
  getVersion: (): string => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'),
  getName: (): string => 'Schul-Apps',
  on: (): void => undefined,
  whenReady: (): Promise<void> => Promise.resolve()
}

/**
 * Verschlüsselung der API-Schlüssel: Am PC Windows DPAPI. Auf dem iPad liegen die Schlüssel im
 * Schlüsselbund von iOS (vfs/mounts.ts leitet secrets.json dorthin um) – hier nur durchgereicht.
 */
export const safeStorage = {
  isEncryptionAvailable: (): boolean => true,
  encryptString: (text: string): Buffer => Buffer.from(text, 'utf8'),
  decryptString: (daten: Uint8Array): string => Buffer.from(daten).toString('utf8')
}

export const dialog = new Proxy({}, { get: () => () => nurAmPc('Dateidialoge') }) as Record<string, (...a: unknown[]) => never>
export const shell = new Proxy({}, { get: () => () => nurAmPc('Der Explorer') }) as Record<string, (...a: unknown[]) => never>
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
