/**
 * Wer gerade arbeitet (02.10.2026).
 *
 * Die Dienste des Hauptprozesses (main/services) kennen nur EINEN Datenordner:
 * `app.getPath('userData')`. Auf dem Server liefert der Electron-Ersatz (shims/electron.ts) dafür
 * den Ordner des Nutzers, dessen Anfrage gerade läuft – über AsyncLocalStorage, das den Nutzer
 * durch alle `await` hindurch mitträgt. So arbeitet derselbe Code für jede Lehrkraft in ihrer
 * eigenen Ablage, ohne dass ein Dienst davon weiß.
 *
 * Ohne Nutzer (Start, Wartung) gilt der Systemordner – nie der Ordner eines anderen Nutzers.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { nutzerOrdner, systemOrdner } from './pfade'

export type Rolle = 'admin' | 'lehrkraft' | 'schueler'

export interface Nutzer {
  id: string
  /** IServ-Benutzername (m.mustermann) bzw. test.<n> */
  benutzer: string
  /** Anzeigename (Klarname – bleibt auf dem Server, geht nie an eine KI) */
  name: string
  rolle: Rolle
  /** Woher die Anmeldung kommt */
  quelle: 'iserv' | 'test' | 'notzugang'
  /** Kennung der Sitzung (für Ereignisse und Aufträge) */
  sitzung?: string
}

const speicher = new AsyncLocalStorage<Nutzer>()

/** `fn` im Namen dieses Nutzers ausführen – alle Ablagen zeigen dann in seinen Ordner */
export const imNutzer = <T>(n: Nutzer, fn: () => T): T => speicher.run(n, fn)

export const aktuellerNutzer = (): Nutzer | undefined => speicher.getStore()

/** Der Datenordner für `app.getPath('userData')` */
export function datenordner(): string {
  const n = speicher.getStore()
  return n ? nutzerOrdner(n.id) : systemOrdner()
}

export const istLehrkraft = (n: Nutzer | undefined): boolean => n?.rolle === 'lehrkraft' || n?.rolle === 'admin'
