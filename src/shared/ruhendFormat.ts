/**
 * Dateiformat der Verschlüsselung ruhender Daten (23.10.2026, Nachprüfung des Schulträgers).
 *
 * Befund: Rückmeldungen (Schülertexte und Namen), Elternbriefe und die gemerkten Nachteilsausgleiche
 * je Person lagen am PC und auf dem iPad im Klartext, ebenso die täglichen Sicherungen. Erlass
 * Niedersachsen: auf privaten PCs nur verschlüsselt (und genehmigt), auf privaten Mobilgeräten gar nicht.
 *
 * Ein Format für alle Geräte – am PC schreibt es Node (main/services/storage/ruhend.ts, synchron),
 * auf dem iPad Web Crypto (mobil/vfs/ruhendIos.ts, asynchron):
 *
 *   KOPF (6 Bytes „SAV1\n\0") | IV (12 Bytes) | Chiffrat | Prüfwert (16 Bytes)   — AES-256-GCM
 *
 * Chiffrat und Prüfwert stehen in der Reihenfolge, die Web Crypto liefert; Node hängt den Prüfwert
 * (getAuthTag) ebenso hinten an. Der Kopf unterscheidet verschlüsselte von alten Klartext-Dateien –
 * so findet die Umstellung beim ersten Start, was noch zu verschlüsseln ist.
 *
 * Reine Funktionen ohne Kryptografie und ohne Node-Abhängigkeit (läuft auch in der Oberfläche).
 */

export const RUHEND_KOPF = new Uint8Array([0x53, 0x41, 0x56, 0x31, 0x0a, 0x00])
export const IV_LAENGE = 12
export const PRUEF_LAENGE = 16

/** Beginnt die Datei mit dem Kopf der Verschlüsselung? */
export function hatRuhendKopf(daten: Uint8Array): boolean {
  if (daten.byteLength < RUHEND_KOPF.byteLength + IV_LAENGE + PRUEF_LAENGE) return false
  for (let i = 0; i < RUHEND_KOPF.byteLength; i++) if (daten[i] !== RUHEND_KOPF[i]) return false
  return true
}

/** Zerlegt eine verschlüsselte Datei in IV und Chiffrat+Prüfwert */
export function zerlegeRuhend(daten: Uint8Array): { iv: Uint8Array; rest: Uint8Array } {
  if (!hatRuhendKopf(daten)) throw new Error('Keine verschlüsselte Datei von Schul-Apps.')
  const a = RUHEND_KOPF.byteLength
  return { iv: daten.slice(a, a + IV_LAENGE), rest: daten.slice(a + IV_LAENGE) }
}

/** Setzt Kopf, IV und Chiffrat+Prüfwert zusammen */
export function fuegeRuhend(iv: Uint8Array, rest: Uint8Array): Uint8Array {
  const out = new Uint8Array(RUHEND_KOPF.byteLength + iv.byteLength + rest.byteLength)
  out.set(RUHEND_KOPF, 0)
  out.set(iv, RUHEND_KOPF.byteLength)
  out.set(rest, RUHEND_KOPF.byteLength + iv.byteLength)
  return out
}

// ---------- Umschlag der verschlüsselten Sicherung ----------

/**
 * Eine verschlüsselte Sicherung bleibt eine .json-Datei (gleiche Namen, gleiche Liste der Stände),
 * enthält aber nur diesen Umschlag. `schluessel: 'geraet'` = der Datenschlüssel dieses Geräts
 * (PC: Windows-Konto über DPAPI; iPad: Schlüsselbund, nur dieses Gerät) – Wiederherstellen geht
 * deshalb nur hier. Für den Umzug auf ein anderes Gerät gibt es den ausdrücklichen Klartext-Export
 * (mit Warnung, WartungCard).
 */
export const SICHERUNG_UMSCHLAG = 'schulapps-verschluesselte-sicherung'

export interface SicherungsUmschlag {
  art: typeof SICHERUNG_UMSCHLAG
  version: 1
  verfahren: 'AES-256-GCM'
  schluessel: 'geraet'
  erstellt: string
  /** Base64 von KOPF | IV | Chiffrat | Prüfwert */
  daten: string
}

function nachB64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.byteLength; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

function ausB64(t: string): Uint8Array {
  const roh = atob(t)
  const out = new Uint8Array(roh.length)
  for (let i = 0; i < roh.length; i++) out[i] = roh.charCodeAt(i)
  return out
}

/** Packt eine verschlüsselte Sicherung (Ausgabe der Verschlüsselung) in den Umschlag */
export function verpackeSicherung(verschluesselt: Uint8Array, erstellt = new Date().toISOString()): Uint8Array {
  const u: SicherungsUmschlag = { art: SICHERUNG_UMSCHLAG, version: 1, verfahren: 'AES-256-GCM', schluessel: 'geraet', erstellt, daten: nachB64(verschluesselt) }
  return new TextEncoder().encode(JSON.stringify(u))
}

/** Ist die Datei eine verschlüsselte Sicherung? (prüft nur den Anfang – Sicherungen sind groß) */
export function istVerschluesselteSicherung(daten: Uint8Array): boolean {
  const anfang = new TextDecoder().decode(daten.subarray(0, 120))
  return anfang.includes(`"art":"${SICHERUNG_UMSCHLAG}"`)
}

/** Holt die verschlüsselten Bytes aus dem Umschlag */
export function entpackeSicherung(daten: Uint8Array): Uint8Array {
  let u: Partial<SicherungsUmschlag>
  try {
    u = JSON.parse(new TextDecoder().decode(daten)) as Partial<SicherungsUmschlag>
  } catch {
    throw new Error('Die verschlüsselte Sicherung ist beschädigt.')
  }
  if (u.art !== SICHERUNG_UMSCHLAG || u.version !== 1 || typeof u.daten !== 'string') throw new Error('Unbekannte Art der verschlüsselten Sicherung.')
  return ausB64(u.daten)
}
