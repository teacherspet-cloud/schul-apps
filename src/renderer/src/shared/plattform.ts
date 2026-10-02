/**
 * Wo läuft die Oberfläche?
 *
 *  - 'pc'   – in der App am PC (Electron): Dialoge, Explorer, Druckerwahl, Netzzugang, Abo-Zugang
 *  - 'netz' – im Browser eines Tablets, verbunden mit dem PC (shared/netzZugang.ts)
 *  - 'ios'  – in der eigenständigen iPad-/iPhone-App (src/mobil): alles auf dem Gerät, KI nur
 *             über API-Schlüssel, Dateien über das Teilen-Menü, Drucken über AirPrint
 *  - 'server' – im Browser bzw. in „Schul-Apps Online“, verbunden mit dem Schul-Apps-Server
 *             (02.10.2026, src/server): eigene Ablage je Lehrkraft, Anmeldung über IServ. Technisch
 *             ein Browser wie 'netz' (imNetz() ist true), aber mit eigenem KI-Zugang je Nutzer
 *
 * `imNetz()` bleibt die Weiche für den Browser im Netz; diese Datei ergänzt die iPad-App.
 */
import { imNetz } from './netzZugang'

export type Plattform = 'pc' | 'netz' | 'ios' | 'server'

export function plattform(): Plattform {
  if (typeof window !== 'undefined' && window.__plattform === 'ios') return 'ios'
  if (aufServer()) return 'server'
  return imNetz() ? 'netz' : 'pc'
}

/** Mit dem Schul-Apps-Server verbunden (Browser oder „Schul-Apps Online“)? */
export const aufServer = (): boolean => typeof window !== 'undefined' && Boolean(window.__schulappsServer)

/**
 * Im Browser am Netzzugang des EIGENEN PCs (PIN)? Dort ist vieles gesperrt, was der Server
 * erlaubt – KI-Zugang einrichten, eigenes Material löschen –, weil es den Rechner der Lehrkraft
 * beträfe. Auf dem Server arbeitet jede Lehrkraft in ihrer eigenen Ablage.
 */
export const nurPcNetz = (): boolean => imNetz() && !aufServer()

/** Die Exe „Schul-Apps Online" (src/client) – kann IServ-Ordner mit dem lokal gespeicherten Passwort */
export const hatClient = (): boolean => typeof window !== 'undefined' && Boolean(window.__schulappsClient)

/** In der iPad-/iPhone-App? */
export const aufIos = (): boolean => plattform() === 'ios'

/** Nur in der App am PC – Netzzugang, Abo-Zugang, Druckerwahl, Ordner im Explorer */
export const amPc = (): boolean => plattform() === 'pc'

declare global {
  interface Window {
    /** Setzt der Start der iPad-App (src/mobil/start.ts) */
    __plattform?: 'ios'
    /** Setzt der Server (/server/ich.js) vor dem Start der Oberfläche */
    __schulappsServer?: ServerIch
    /** Setzt die Exe „Schul-Apps Online" (src/client/preload.ts) */
    __schulappsClient?: { name: string; iserv: ClientIserv }
  }
}

/** Der angemeldete Nutzer laut Server (src/server/http.ts, /server/ich.js) */
export interface ServerIch {
  angemeldet: boolean
  benutzer?: string
  name?: string
  rolle?: 'admin' | 'lehrkraft' | 'schueler'
  quelle?: 'iserv' | 'test' | 'notzugang'
  eingerichtet?: boolean
  /** öffentliche Adresse des Servers (QR-Codes) */
  adresse: string
}

export const serverIch = (): ServerIch | null => (typeof window !== 'undefined' ? (window.__schulappsServer ?? null) : null)

/** IServ in der Exe „Schul-Apps Online" – gleiche Form wie window.api.iserv, dazu `ablegen` */
export interface ClientIserv {
  status: () => Promise<unknown>
  verbinden: (eingabe: { schule: string; benutzer: string; passwort?: string }) => Promise<{ basis: string; ordner: unknown[] }>
  ordner: (pfad: string) => Promise<unknown[]>
  eintraege: (pfad: string) => Promise<unknown[]>
  laden: (pfad: string) => Promise<{ name: string; data: Uint8Array }>
  trennen: () => Promise<void>
  ablegen: (name: string, daten: Uint8Array | string, ziel: unknown, standardZiel?: string) => Promise<string>
}
