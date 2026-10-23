/**
 * Verschlüsselung ruhender Daten in der iPad-App (23.10.2026, Nachprüfung des Schulträgers).
 *
 * Befund: /userData lag unter Library/SchulApps im Klartext und wurde von iOS mitgesichert (iCloud),
 * die tägliche Sicherung lag als Klartext-JSON in Dokumente/Sicherungen – mit dem Hinweis, sie in
 * die iCloud zu kopieren. Erlass Niedersachsen: auf privaten Mobilgeräten keine personenbezogenen Daten.
 *
 * Die Dienste lesen synchron aus dem Speicher-Dateisystem (vfs/speicher.ts); verschlüsselt wird
 * deshalb dort, wo ohnehin asynchron gearbeitet wird – im Träger (vfs/traeger.ts):
 *  - Schreiben: Dateien der personenbezogenen Ordner (shared/lokaleDaten.ts) gehen nur als
 *    AES-256-GCM-Chiffrat auf das Gerät (Format: shared/ruhendFormat.ts, dasselbe wie am PC).
 *  - Laden beim Start: entschlüsseln in den Speicher; alte Klartext-Dateien werden dabei sofort
 *    verschlüsselt neu geschrieben (Umstellung an Ort und Stelle, ohne Klartext-Kopie).
 *
 * DER SCHLÜSSEL:
 *  - In der App: zufällig, im iOS-Schlüsselbund (Plugin Schluesselbund, Konto „datenschluessel",
 *    kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly – nicht in Backups, nicht auf andere Geräte).
 *  - Im Browser-Prüfbuild (kein Schlüsselbund): ein NICHT auslesbarer CryptoKey in IndexedDB
 *    („schulapps-ruhend"). SCHWÄCHER: Wer das Browserprofil hat, kann damit im selben Browser
 *    entschlüsseln (nur nicht den Schlüssel mitnehmen). Ohne IndexedDB nur für diese Sitzung.
 *  - Ist der Schlüsselbund nicht lesbar, wird KEIN neuer Schlüssel erzeugt (die alten Dateien wären
 *    verloren) – personenbezogene Dateien werden dann nicht geschrieben (Zustand „gesperrt").
 */
import { fuegeRuhend, hatRuhendKopf, IV_LAENGE, verpackeSicherung, entpackeSicherung, istVerschluesselteSicherung, zerlegeRuhend } from '@shared/ruhendFormat'
import { istPersonenbezogenerPfad } from '@shared/lokaleDaten'

export const SCHLUESSEL_KONTO = 'datenschluessel'

export type IosZustand = { zustand: 'aus' | 'an' | 'gesperrt'; grund?: string; schwach?: boolean }

/** Woher der Schlüssel kommt – in der App der Schlüsselbund, in Prüfungen eine Attrappe */
export interface SchluesselQuelle {
  holen(): Promise<CryptoKey>
  schwach?: boolean
}

const AES = { name: 'AES-GCM', length: 256 } as const

/** Web Crypto verlangt Bytes auf einem gewöhnlichen ArrayBuffer */
const puffer = (b: Uint8Array): Uint8Array<ArrayBuffer> => (b.buffer instanceof ArrayBuffer ? (b as Uint8Array<ArrayBuffer>) : new Uint8Array(b))

const zuB64 = (b: Uint8Array): string => {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s)
}
const ausB64 = (t: string): Uint8Array => Uint8Array.from(atob(t), (c) => c.charCodeAt(0))

/** Schlüssel aus dem iOS-Schlüsselbund – fehlt er, wird einer erzeugt und abgelegt */
export function schluesselbundQuelle(bund: {
  get(o: { konto: string }): Promise<{ value?: string | null }>
  set(o: { value: string; konto: string }): Promise<void>
}): SchluesselQuelle {
  return {
    holen: async () => {
      // Lesefehler NICHT abfangen: dann lieber gesperrt als ein neuer Schlüssel über den alten Dateien
      const { value } = await bund.get({ konto: SCHLUESSEL_KONTO })
      let roh = value ? ausB64(value) : null
      if (!roh || roh.byteLength !== 32) {
        roh = crypto.getRandomValues(new Uint8Array(32))
        await bund.set({ konto: SCHLUESSEL_KONTO, value: zuB64(roh) })
      }
      const key = await crypto.subtle.importKey('raw', puffer(roh), AES, false, ['encrypt', 'decrypt'])
      roh.fill(0)
      return key
    }
  }
}

/** Browser-Prüfbuild: nicht auslesbarer CryptoKey in IndexedDB (schwächer, siehe oben) */
export function indexedDbQuelle(): SchluesselQuelle {
  const DB = 'schulapps-ruhend'
  const SPEICHER = 'schluessel'
  const oeffne = (): Promise<IDBDatabase> =>
    new Promise((ok, fehler) => {
      const r = indexedDB.open(DB, 1)
      r.onupgradeneeded = () => r.result.createObjectStore(SPEICHER)
      r.onsuccess = () => ok(r.result)
      r.onerror = () => fehler(r.error)
    })
  const anfrage = <T>(db: IDBDatabase, modus: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> =>
    new Promise((ok, fehler) => {
      const r = fn(db.transaction(SPEICHER, modus).objectStore(SPEICHER))
      r.onsuccess = () => ok(r.result as T)
      r.onerror = () => fehler(r.error)
    })
  return {
    schwach: true,
    holen: async () => {
      if (typeof indexedDB === 'undefined') return crypto.subtle.generateKey(AES, false, ['encrypt', 'decrypt'])
      const db = await oeffne()
      const da = await anfrage<CryptoKey | undefined>(db, 'readonly', (s) => s.get('daten'))
      if (da) return da
      const neu = await crypto.subtle.generateKey(AES, false, ['encrypt', 'decrypt'])
      await anfrage(db, 'readwrite', (s) => s.put(neu, 'daten'))
      return neu
    }
  }
}

// ---------- Zustand und Schlüssel der App ----------

let schluessel: CryptoKey | null = null
let zustand: IosZustand = { zustand: 'aus' }

export const iosRuhendZustand = (): IosZustand => zustand

/** Schlüssel laden (beim Start, vfs/mounts.ts) – nie werfend; danach gilt iosRuhendZustand() */
export async function iosRuhendEinschalten(quelle: SchluesselQuelle): Promise<IosZustand> {
  try {
    schluessel = await quelle.holen()
    zustand = { zustand: 'an', ...(quelle.schwach ? { schwach: true } : {}) }
  } catch (e) {
    schluessel = null
    zustand = { zustand: 'gesperrt', grund: `Der Schlüsselbund ist nicht lesbar (${e instanceof Error ? e.message : String(e)}). Schülerdaten werden nicht gespeichert.` }
  }
  return zustand
}

/** Prüfungen */
export function iosRuhendZuruecksetzen(): void {
  schluessel = null
  zustand = { zustand: 'aus' }
}

function aktiv(): CryptoKey {
  if (schluessel) return schluessel
  throw new Error(zustand.grund ?? 'Die Verschlüsselung ist nicht eingeschaltet.')
}

export async function verschluesseln(klar: Uint8Array, key: CryptoKey = aktiv()): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LAENGE))
  return fuegeRuhend(iv, new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, puffer(klar))))
}

export async function entschluesseln(geheim: Uint8Array, key: CryptoKey = aktiv()): Promise<Uint8Array> {
  const { iv, rest } = zerlegeRuhend(geheim)
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: puffer(iv) }, key, puffer(rest)))
  } catch {
    throw new Error('Eine verschlüsselte Datei ließ sich nicht entschlüsseln (anderes Gerät oder beschädigt).')
  }
}

// ---------- Für den Träger ----------

/** Was der Träger von /userData braucht (vfs/traeger.ts) */
export interface RuhendSchutz {
  betrifft(rel: string): boolean
  /** Vor dem Schreiben auf das Gerät */
  vorDemSchreiben(rel: string, daten: Uint8Array): Promise<Uint8Array>
  /** Nach dem Lesen beim Start; `umstellen` schreibt eine alte Klartext-Datei verschlüsselt neu */
  nachDemLesen(rel: string, roh: Uint8Array, umstellen: (klar: Uint8Array) => Promise<void>): Promise<Uint8Array>
}

export const iosSchutz: RuhendSchutz = {
  betrifft: istPersonenbezogenerPfad,
  vorDemSchreiben: async (rel, daten) => {
    if (!istPersonenbezogenerPfad(rel) || hatRuhendKopf(daten)) return daten
    // Gesperrt: Fehler statt Klartext – die Datei bleibt nur im Speicher (vfs meldet den Schreibfehler)
    return verschluesseln(daten)
  },
  nachDemLesen: async (rel, roh, umstellen) => {
    if (!istPersonenbezogenerPfad(rel)) return roh
    if (hatRuhendKopf(roh)) return entschluesseln(roh)
    // Alte Klartext-Datei: in den Speicher übernehmen und sofort verschlüsselt neu schreiben
    if (zustand.zustand === 'an') await umstellen(roh)
    return roh
  }
}

// ---------- Sicherungen ----------

/** Sicherung (Klartext aus wartung.sicherung()) verschlüsseln – sonst Fehler, nie still Klartext */
export async function sicherungVerschluesseln(klar: Uint8Array): Promise<Uint8Array> {
  if (istVerschluesselteSicherung(klar)) return klar
  return verpackeSicherung(await verschluesseln(klar))
}

/** Verschlüsselte Sicherung zum Einlesen öffnen; Klartext geht unverändert durch */
export async function sicherungOeffnen(daten: Uint8Array): Promise<Uint8Array> {
  if (!istVerschluesselteSicherung(daten)) return daten
  if (!schluessel) throw new Error('Diese Sicherung ist verschlüsselt, der Schlüssel dieses iPads ist aber nicht verfügbar.')
  try {
    return await entschluesseln(entpackeSicherung(daten))
  } catch {
    throw new Error('Diese verschlüsselte Sicherung stammt von einem anderen Gerät und lässt sich hier nicht öffnen.')
  }
}
