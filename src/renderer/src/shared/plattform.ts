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

/**
 * Kann diese Oberfläche selbst auf einen gewählten Drucker drucken (08.10.2026)? In der App am PC und in
 * einer Exe „Schul-Apps Online" mit Druck-Brücke; im Browser nicht – er kennt die Drucker nicht.
 */
export const druckerWaehlbar = (): boolean => {
  if (typeof window === 'undefined') return false
  if (imNetz()) return Boolean(window.__schulappsClient?.drucken && window.__schulappsClient?.drucker)
  return !aufIos()
}

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
    __schulappsClient?: {
      name: string
      iserv: ClientIserv
      /** Figuren der Exe ohne Server am selben PC */
      lokaleMaskottchen?: () => Promise<{ id: string; name: string; beschreibung: string; quelle: 'ki' | 'upload'; vorlage?: string; posen: Record<string, string> }[]>
      /** Drucker des PCs (seit 08.10.2026 – ältere Exe ohne: dann Druck über den Browser-Weg) */
      drucker?: () => Promise<{ name: string; displayName: string; isDefault: boolean }[]>
      /** Mit Optionen direkt drucken, ohne: Druckdialog von Windows */
      drucken?: (
        html: string,
        optionen?: { deviceName: string; copies: number; duplex: 'simplex' | 'longEdge' | 'shortEdge'; color: boolean; pages?: { from: number; to: number }[] }
      ) => Promise<void>
    }
  }
}

/** Der angemeldete Nutzer laut Server (src/server/http.ts, /server/ich.js) */
export interface ServerIch {
  angemeldet: boolean
  benutzer?: string
  name?: string
  rolle?: 'admin' | 'lehrkraft' | 'schueler'
  quelle?: 'iserv' | 'test' | 'notzugang' | 'lokal' | 'gast' | 'vorschau'
  eingerichtet?: boolean
  /** Vorschau als Musterschüler (server/vorschau.ts): Fenster der Lehrkraft mit Vorschaukonto */
  vorschau?: boolean
  /** öffentliche Adresse des Servers (QR-Codes) */
  adresse: string
  /** Kennung der Anmeldesitzung (abgeleitet, 09.10.2026) – neue Anmeldung = neue Sitzung (shared/sitzung.ts) */
  sitzung?: string
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
