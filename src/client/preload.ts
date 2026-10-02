/**
 * Brücke der Exe „Schul-Apps Online" (02.10.2026): Was nur die Exe am PC kann, bekommt die
 * Oberfläche vom Server als `window.__schulappsClient` – derzeit die IServ-Ordner (WebDAV mit dem
 * lokal verschlüsselten Passwort; der Server sieht es nie). Gleiche Form wie window.api.iserv,
 * dazu `ablegen` für das Speichern auf IServ.
 */
import { contextBridge, ipcRenderer } from 'electron'

async function call<T>(kanal: string, ...args: unknown[]): Promise<T> {
  const r = (await ipcRenderer.invoke(kanal, ...args)) as { ok: boolean; value?: T; error?: string }
  if (!r.ok) throw new Error(r.error)
  return r.value as T
}

contextBridge.exposeInMainWorld('__schulappsClient', {
  name: 'Schul-Apps Online',
  iserv: {
    status: () => call('client:iserv-status'),
    verbinden: (eingabe: { schule: string; benutzer: string; passwort?: string }) => call('client:iserv-verbinden', eingabe),
    ordner: (pfad: string) => call('client:iserv-ordner', pfad),
    eintraege: (pfad: string) => call('client:iserv-eintraege', pfad),
    laden: (pfad: string) => call('client:iserv-laden', pfad),
    trennen: () => call('client:iserv-trennen'),
    ablegen: (name: string, daten: Uint8Array | string, ziel: unknown, standardZiel?: string) => call('client:iserv-ablegen', name, daten, ziel, standardZiel)
  }
})
