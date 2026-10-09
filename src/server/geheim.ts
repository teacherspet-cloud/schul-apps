/**
 * Verschlüsselung auf dem Server (02.10.2026): AES-256-GCM mit einem Hauptschlüssel.
 *
 * Am PC verschlüsselt Windows (DPAPI) die API-Schlüssel; auf dem Server übernimmt das dieser
 * Baustein – für API-Schlüssel der Nutzer, freigegebene Schlüssel des Admins, das Geheimnis der
 * IServ-Anbindung und Namenslisten. Der Hauptschlüssel liegt außerhalb des Datenordners
 * (pfade.ts); fehlt er beim ersten Start, wird er erzeugt (nur für den Server lesbar).
 *
 * Format: „v1:" + Base64(IV 12 Byte | Tag 16 Byte | Chiffrat).
 */
import { createCipheriv, createDecipheriv, createSecretKey, randomBytes, scryptSync, timingSafeEqual, type KeyObject } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { SCHLUESSEL_DATEI } from './pfade'

let schluessel: Buffer | null = null
let schluesselObj: { roh: Buffer; obj: KeyObject } | null = null

/**
 * Der Hauptschlüssel als KeyObject (09.10.2026, Leistung): createCipheriv/createDecipheriv mit einem Buffer bereiten den
 * Schlüssel bei JEDEM Aufruf neu vor – beim Entschlüsseln vieler Zeilen (Lernstände, Nutzer) war das etwa achtmal so
 * teuer wie die Entschlüsselung selbst. Das Objekt entsteht einmal je Schlüssel.
 */
export function schluesselObjekt(): KeyObject {
  const k = hauptschluessel()
  if (schluesselObj?.roh !== k) schluesselObj = { roh: k, obj: createSecretKey(k) }
  return schluesselObj.obj
}

/** Den Hauptschlüssel laden bzw. beim ersten Start anlegen */
export function hauptschluessel(datei = SCHLUESSEL_DATEI): Buffer {
  if (schluessel) return schluessel
  if (existsSync(datei)) {
    const roh = readFileSync(datei, 'utf8').trim()
    const k = Buffer.from(roh, 'base64')
    if (k.length !== 32) throw new Error(`Hauptschlüssel in ${datei} ist ungültig (32 Byte Base64 erwartet).`)
    schluessel = k
    return k
  }
  const k = randomBytes(32)
  writeFileSync(datei, k.toString('base64'), { mode: 0o600 })
  schluessel = k
  return k
}

/** Nur für Tests: einen festen Schlüssel setzen */
export const setzeSchluesselFuerTests = (k: Buffer | null): void => {
  schluessel = k
}

export function verschluessle(text: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', schluesselObjekt(), iv)
  const daten = Buffer.concat([c.update(text, 'utf8'), c.final()])
  return `v1:${Buffer.concat([iv, c.getAuthTag(), daten]).toString('base64')}`
}

export function entschluessle(wert: string): string {
  if (!wert.startsWith('v1:')) throw new Error('Unbekanntes Format.')
  const roh = Buffer.from(wert.slice(3), 'base64')
  const d = createDecipheriv('aes-256-gcm', schluesselObjekt(), roh.subarray(0, 12))
  d.setAuthTag(roh.subarray(12, 28))
  return Buffer.concat([d.update(roh.subarray(28)), d.final()]).toString('utf8')
}

// ---------- Passwörter (Testkonten, Notzugang) ----------

/** scrypt mit Salz; Format „s1:<salz>:<hash>" */
export function passwortHash(passwort: string): string {
  const salz = randomBytes(16)
  const hash = scryptSync(passwort, salz, 64, { N: 16384, r: 8, p: 1 })
  return `s1:${salz.toString('base64')}:${hash.toString('base64')}`
}

export function passwortPruefen(passwort: string, gespeichert: string | null | undefined): boolean {
  if (!gespeichert?.startsWith('s1:')) return false
  const [, salz, hash] = gespeichert.split(':')
  const soll = Buffer.from(hash, 'base64')
  const ist = scryptSync(passwort, Buffer.from(salz, 'base64'), soll.length, { N: 16384, r: 8, p: 1 })
  return ist.length === soll.length && timingSafeEqual(ist, soll)
}

/** Zufälliges Passwort für Testkonten: gut lesbar (ohne 0/O, 1/l) */
export function zufallsPasswort(laenge = 14): string {
  const zeichen = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(randomBytes(laenge), (b) => zeichen[b % zeichen.length]).join('')
}
