// Typen zu fakeWebdav.mjs (nachgebauter IServ-WebDAV-Server für die Tests)
import type { DavAbruf } from '../../src/main/services/iserv/webdav'

export interface FakeEintrag {
  ordner: boolean
  daten?: Buffer
  typ?: string
}

export interface FakeFehler {
  methode?: string
  pfad?: RegExp
  status: number
  einmal?: boolean
}

export interface FakeWebdav {
  baum: Map<string, FakeEintrag>
  fehler: FakeFehler[]
  protokoll: { methode: string; host: string; pfad: string; auth: boolean; laenge: number }[]
  behandle(methode: string, host: string, pfad: string, kopf: Record<string, string>, koerper?: Buffer, praefix?: string): { status: number; text: string }
  abruf: DavAbruf
  starten(): Promise<string>
  beenden(): Promise<void>
  benutzer: string
  passwort: string
}

export function fakeWebdav(o?: { benutzer?: string; passwort?: string; rechner?: string[]; ordner?: string[] }): FakeWebdav
