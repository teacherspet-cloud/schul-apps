import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { buildApi } from '@shared/apiShape'

export type { PrinterInfo, PrintOptions, SchulAppsApi } from '@shared/apiShape'

/**
 * Am PC laufen die Aufrufe über die Electron-Brücke.
 *
 * Die FORM der Schnittstelle steht in @shared/apiShape – dieselbe Datei benutzt der
 * Browserzugang. So kann keine Seite Aufrufe kennen, die die andere nicht hat.
 */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as { ok: boolean; value?: T; error?: string }
  if (!res.ok) throw new Error(res.error)
  return res.value as T
}

contextBridge.exposeInMainWorld(
  'api',
  buildApi(call, {
    pathOf: (file: File) => webUtils.getPathForFile(file),
    subscribe: (channel, cb) => {
      const listener = (_e: unknown, value: unknown): void => cb(value)
      ipcRenderer.on(channel, listener)
      return () => {
        ipcRenderer.removeListener(channel, listener)
      }
    }
  })
)

/*
 * Sitzung der Oberfläche (09.10.2026, renderer/shared/sitzung.ts): Kennung dieses Programmstarts – vor dem ersten
 * Zeichnen bekannt, damit gemerkte Auf/Zu-Zustände gleich richtig gelesen werden.
 */
let sitzung = ''
try {
  sitzung = String(ipcRenderer.sendSync('sitzung:kennung') ?? '')
} catch {
  sitzung = ''
}
contextBridge.exposeInMainWorld('__schulappsSitzung', sitzung)
