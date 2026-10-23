/**
 * Verschlüsselung ruhender Daten am PC (23.10.2026, Nachprüfung des Schulträgers).
 *
 * Rückmeldungen, Elternbriefe und gemerkte Nachteilsausgleiche (shared/lokaleDaten.ts,
 * PERSONENBEZOGENE_ORDNER) liegen nur noch verschlüsselt auf der Platte: AES-256-GCM mit einem
 * zufälligen Datenschlüssel. Der Datenschlüssel selbst liegt in `userData/datenschluessel.bin`,
 * geschützt mit Electron safeStorage (unter Windows DPAPI – nur dieses Windows-Konto kann ihn lesen).
 * Format der Dateien: shared/ruhendFormat.ts.
 *
 * Zustände:
 *  - 'aus'       nicht eingeschaltet (Prüfungen, Server, iPad – dort verschlüsselt der Träger,
 *                mobil/vfs/ruhendIos.ts): Klartext wie bisher; verschlüsselte Dateien sind nicht lesbar.
 *  - 'an'        Datenschlüssel geladen: schreiben verschlüsselt, lesen erkennt beides.
 *  - 'gesperrt'  Verschlüsselung nicht verfügbar oder Schlüssel nicht lesbar: personenbezogene Daten
 *                werden NICHT im Klartext geschrieben (Fehler mit Erklärung), statt still auszuweichen.
 *
 * Ein vorhandener, aber unlesbarer Schlüssel wird nie überschrieben – sonst wären alle bisherigen
 * Dateien endgültig verloren.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { fuegeRuhend, hatRuhendKopf, IV_LAENGE, PRUEF_LAENGE, zerlegeRuhend } from '@shared/ruhendFormat'
import { PERSONENBEZOGENE_ORDNER } from '@shared/lokaleDaten'
import { writeAtomic } from './atomar'

export const SCHLUESSEL_DATEI = 'datenschluessel.bin'

/** Schutz des Datenschlüssels – am PC safeStorage (DPAPI), in Prüfungen eine Attrappe */
export interface SchluesselSchutz {
  verfuegbar(): boolean
  verschluesseln(klar: string): Uint8Array
  entschluesseln(geheim: Uint8Array): string
}

export type RuhendZustand = 'aus' | 'an' | 'gesperrt'

let zustand: RuhendZustand = 'aus'
let schluessel: Buffer | null = null
let sperrGrund = ''

export const ruhendZustand = (): { zustand: RuhendZustand; grund?: string } => (zustand === 'gesperrt' ? { zustand, grund: sperrGrund } : { zustand })

/** Prüfungen: alles vergessen */
export function ruhendZuruecksetzen(): void {
  zustand = 'aus'
  schluessel = null
  sperrGrund = ''
}

// ---------- Verschlüsseln und Entschlüsseln ----------

export function verschluesseln(klar: Uint8Array, key: Buffer = aktiverSchluessel()): Uint8Array {
  const iv = randomBytes(IV_LAENGE)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const chiffrat = Buffer.concat([c.update(klar), c.final(), c.getAuthTag()])
  return fuegeRuhend(iv, chiffrat)
}

export function entschluesseln(geheim: Uint8Array, key: Buffer = aktiverSchluessel()): Buffer {
  const { iv, rest } = zerlegeRuhend(geheim)
  const tag = rest.subarray(rest.byteLength - PRUEF_LAENGE)
  const d = createDecipheriv('aes-256-gcm', key, iv)
  d.setAuthTag(tag)
  try {
    return Buffer.concat([d.update(rest.subarray(0, rest.byteLength - PRUEF_LAENGE)), d.final()])
  } catch {
    throw new Error('Eine verschlüsselte Datei ließ sich nicht entschlüsseln (falscher Schlüssel oder beschädigt).')
  }
}

function aktiverSchluessel(): Buffer {
  if (zustand === 'an' && schluessel) return schluessel
  if (zustand === 'gesperrt') throw new Error(`Personenbezogene Daten sind verschlüsselt, der Schlüssel ist aber nicht verfügbar: ${sperrGrund}`)
  throw new Error('Die Verschlüsselung ist nicht eingeschaltet.')
}

// ---------- Einschalten ----------

/**
 * Lädt (oder erzeugt beim ersten Start) den Datenschlüssel und stellt alte Klartext-Dateien um.
 * Am PC beim Start aufgerufen (main/index.ts, mit safeStorage), vor den Kanälen.
 */
export function ruhendEinschalten(wurzel: string, schutz: SchluesselSchutz): { zustand: RuhendZustand; umgestellt: number } {
  ruhendEinschaltenMit(wurzel, schutz)
  const umgestellt = zustand === 'an' ? stelleUm(wurzel) : 0
  return { zustand, umgestellt }
}

/** Synchroner Teil (Prüfungen) */
export function ruhendEinschaltenMit(wurzel: string, schutz: SchluesselSchutz): RuhendZustand {
  const datei = join(wurzel, SCHLUESSEL_DATEI)
  if (!schutz.verfuegbar()) return sperre('Die Verschlüsselung des Betriebssystems (DPAPI/Schlüsselbund) ist auf diesem Rechner nicht verfügbar.')
  if (existsSync(datei)) {
    try {
      const k = Buffer.from(schutz.entschluesseln(new Uint8Array(readFileSync(datei))), 'base64')
      if (k.byteLength !== 32) throw new Error('falsche Länge')
      schluessel = k
      zustand = 'an'
      return zustand
    } catch {
      // NICHT neu erzeugen: Die vorhandenen Dateien wären sonst verloren
      return sperre(
        'Der Datenschlüssel dieses Rechners ist nicht lesbar (anderes Windows-Konto oder neu eingerichtetes Windows). Verschlüsselte Rückmeldungen, Elternbriefe und Nachteilsausgleiche lassen sich nur aus einer Sicherung dieses Kontos zurückholen.'
      )
    }
  }
  const k = randomBytes(32)
  try {
    writeAtomic(datei, schutz.verschluesseln(k.toString('base64')))
  } catch (e) {
    return sperre(`Der Datenschlüssel ließ sich nicht anlegen: ${e instanceof Error ? e.message : String(e)}`)
  }
  schluessel = k
  zustand = 'an'
  return zustand
}

function sperre(grund: string): RuhendZustand {
  zustand = 'gesperrt'
  schluessel = null
  sperrGrund = grund
  return zustand
}

// ---------- Lesen und Schreiben in der Ablage ----------

/**
 * Personenbezogene Datei schreiben: verschlüsselt, wenn eingeschaltet. Bereits verschlüsselte
 * Bytes (aus einer Sicherung dieses Rechners) gehen unverändert durch. Gesperrt: Fehler statt Klartext.
 */
export function schreibeGeschuetzt(file: string, inhalt: string | Uint8Array): void {
  if (zustand === 'aus') return writeAtomic(file, inhalt)
  const bytes = typeof inhalt === 'string' ? new TextEncoder().encode(inhalt) : inhalt
  if (hatRuhendKopf(bytes)) return writeAtomic(file, bytes)
  writeAtomic(file, verschluesseln(bytes))
}

/** Personenbezogene Datei lesen – verschlüsselt oder (vor der Umstellung) Klartext */
export function liesGeschuetzt(file: string): Buffer {
  const roh = readFileSync(file)
  return hatRuhendKopf(roh) ? entschluesseln(roh) : roh
}

export const liesGeschuetztText = (file: string): string => liesGeschuetzt(file).toString('utf8')

/** Bytes aus einer Ablage für eine Sicherung: verschlüsselte Dateien im Klartext (die Sicherung wird als Ganzes verschlüsselt) */
export function klartextFuerSicherung(bytes: Uint8Array): Uint8Array {
  return hatRuhendKopf(bytes) && zustand === 'an' ? entschluesseln(bytes) : bytes
}

// ---------- Umstellung alter Klartext-Dateien ----------

/**
 * Verschlüsselt alle Klartext-Dateien der personenbezogenen Ordner AN ORT UND STELLE (Hilfsdatei
 * und Umbenennen, atomar) – ohne Klartext-Kopie (.bak). Liefert die Zahl der umgestellten Dateien.
 */
export function stelleUm(wurzel: string): number {
  if (zustand !== 'an') return 0
  let n = 0
  for (const ordner of PERSONENBEZOGENE_ORDNER) {
    const dir = join(wurzel, ordner)
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      if (name.endsWith('.tmp')) continue
      const pfad = join(dir, name)
      if (!statSync(pfad).isFile()) continue
      const roh = readFileSync(pfad)
      if (hatRuhendKopf(roh)) continue
      writeAtomic(pfad, verschluesseln(roh))
      n++
    }
  }
  return n
}
