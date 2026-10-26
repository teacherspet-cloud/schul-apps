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
  /** Fächer, für die die Lehrkraft Fachobfrau/-mann ist (12.10.2026, server/fachobleute.ts) */
  fachobmann?: string[]
  /** Freigegebene Apps der Lehrkraft (23.10.2026, server/appFreigaben.ts); fehlt bei Admins = alle */
  apps?: string[]
  /**
   * Datenschutzerklärung, Elternfassung und Impressum vollständig (26.10.2026, server/datenschutzSeiten.ts
   * `rechtlichesBereit`)? Bei `false` zeigt der Schülerbereich keine Verweise darauf; fehlt die Angabe (älterer Server), schon.
   */
  rechtliches?: boolean
}

/** Verweise auf Datenschutzerklärung, Elternfassung und Impressum zeigen? (26.10.2026, siehe `ServerIch.rechtliches`) */
export const rechtlichesSichtbar = (): boolean => serverIch()?.rechtliches !== false

/**
 * Darf die angemeldete Person diese App sehen und benutzen? (App-Freigaben, 23.10.2026, shared/appFreigaben.ts)
 * Ohne Server (Exe), für Admins und für Seiten, die keine App sind: immer.
 */
export function appFreigegeben(id: string): boolean {
  const ich = serverIch()
  if (!ich?.apps || ich.rolle === 'admin') return true
  if (id === 'home' || id === 'settings' || id === 'themen') return true
  return ich.apps.includes(id)
}

/**
 * „Ansicht zeigen" (App-Freigaben, 23.10.2026, Wunsch der Lehrkraft): Ein Admin öffnet die App in einem eigenen Fenster
 * so, wie eine Lehrkraft der gewählten Gruppe sie sieht – ohne Verwaltung, nur mit deren Apps. Gilt nur in diesem
 * Fenster (sessionStorage) und nur für ein Admin-Konto; der Server behandelt es weiter als Admin.
 */
export interface Ansicht {
  name: string
  apps: string[]
}
const ANSICHT_SCHLUESSEL = 'schulapps-ansicht'
let ansichtGelesen: Ansicht | null | undefined

export function ansicht(): Ansicht | null {
  if (typeof window === 'undefined' || window.__schulappsServer?.rolle !== 'admin') return null
  if (ansichtGelesen !== undefined) return ansichtGelesen
  ansichtGelesen = null
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.has('ansicht')) {
      const a: Ansicht = { name: (q.get('ansicht') ?? '').slice(0, 80) || 'Gruppe', apps: (q.get('apps') ?? '').split(',').filter((x) => /^[a-z0-9-]{1,40}$/.test(x)) }
      sessionStorage.setItem(ANSICHT_SCHLUESSEL, JSON.stringify(a))
      // Die Angaben gehören nicht in die Adresse, die man weitergibt oder neu lädt
      q.delete('ansicht')
      q.delete('apps')
      window.history.replaceState(null, '', `${window.location.pathname}${q.size ? `?${q}` : ''}${window.location.hash}`)
    }
    const roh = sessionStorage.getItem(ANSICHT_SCHLUESSEL)
    if (roh) {
      const a = JSON.parse(roh) as Ansicht
      if (typeof a?.name === 'string' && Array.isArray(a.apps)) ansichtGelesen = { name: a.name, apps: a.apps.map(String) }
    }
  } catch {
    ansichtGelesen = null
  }
  return ansichtGelesen
}

export function ansichtBeenden(): void {
  try {
    sessionStorage.removeItem(ANSICHT_SCHLUESSEL)
  } catch {
    // ohne Speicher gab es auch keine Ansicht
  }
  window.close()
  // Ließ sich das Fenster nicht schließen (selbst geöffnet): normal neu laden
  window.location.href = '/'
}

let alsAnsicht: { von: ServerIch; ich: ServerIch } | null = null
export const serverIch = (): ServerIch | null => {
  if (typeof window === 'undefined') return null
  const ich = window.__schulappsServer ?? null
  const a = ich ? ansicht() : null
  if (!ich || !a) return ich
  if (alsAnsicht?.von !== ich) alsAnsicht = { von: ich, ich: { ...ich, rolle: 'lehrkraft', apps: a.apps, fachobmann: [] } }
  return alsAnsicht.ich
}

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
