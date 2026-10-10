/**
 * Web Push ohne Zusatzpaket (10.10.2026, Erinnerungen für Lernende – erinnerungen.ts).
 *
 * Zwei Standards, beide mit node:crypto:
 *  - VAPID (RFC 8292): Der Server weist sich beim Push-Dienst (Google, Apple, Mozilla, Microsoft) mit einem eigenen
 *    Schlüsselpaar aus – JWT mit ES256 im Kopf „Authorization: vapid t=…, k=…". Das Paar entsteht einmal und liegt
 *    verschlüsselt bei den Servergeheimnissen (datenbank.ts › serverGeheimnis).
 *  - Verschlüsselung der Nachricht (RFC 8291 mit „aes128gcm" aus RFC 8188): Ende-zu-Ende vom Server zum Browser. Der
 *    Push-Dienst sieht nur Chiffrat, Länge und Zeitpunkt.
 *
 * Bewusst ohne das Paket `web-push`: Es zöge weitere Abhängigkeiten nach (http_ece, jws, asn1.js …), und der Teil, den
 * wir brauchen, sind rund 100 Zeilen. Geprüft gegen das Beispiel aus RFC 8291, Abschnitt 5 (tests/webPush.test.ts).
 */
import { createCipheriv, createDecipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign, type KeyObject } from 'node:crypto'

export const b64u = (b: Uint8Array): string => Buffer.from(b).toString('base64url')
export const vonB64u = (s: string): Buffer => Buffer.from(String(s ?? ''), 'base64url')
const hmac = (schluessel: Uint8Array, daten: Uint8Array): Buffer => createHmac('sha256', schluessel).update(daten).digest()

/** VAPID-Schlüsselpaar: öffentlich = unkomprimierter Punkt (65 Byte), privat = d (32 Byte), beide Base64url */
export interface VapidSchluessel {
  oeffentlich: string
  privat: string
}

/** 32 Byte, vorne mit Nullen aufgefüllt (getPrivateKey kann kürzer sein) */
const auf32 = (b: Buffer): Buffer => (b.length >= 32 ? b.subarray(b.length - 32) : Buffer.concat([Buffer.alloc(32 - b.length), b]))

export function vapidErzeugen(): VapidSchluessel {
  const e = createECDH('prime256v1')
  e.generateKeys()
  return { oeffentlich: b64u(e.getPublicKey()), privat: b64u(auf32(e.getPrivateKey())) }
}

export function vapidGueltig(v: unknown): v is VapidSchluessel {
  const x = v as Partial<VapidSchluessel> | null
  return Boolean(x && typeof x.oeffentlich === 'string' && typeof x.privat === 'string' && vonB64u(x.oeffentlich).length === 65 && vonB64u(x.privat).length === 32)
}

function privatSchluessel(v: VapidSchluessel): KeyObject {
  const p = vonB64u(v.oeffentlich)
  return createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: v.privat, x: b64u(p.subarray(1, 33)), y: b64u(p.subarray(33, 65)) }, format: 'jwk' })
}

/**
 * Kopf „Authorization" für einen Push-Endpunkt. `aud` = Herkunft des Endpunkts, gültig 12 Stunden (höchstens 24 erlaubt),
 * `sub` = Kontakt des Betreibers (Apple verlangt eine https- oder mailto-Adresse).
 */
export function vapidKopf(endpunkt: string, v: VapidSchluessel, kontakt: string, jetzt = Date.now()): string {
  const kopf = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const inhalt = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpunkt).origin, exp: Math.floor(jetzt / 1000) + 12 * 3600, sub: kontakt })))
  const signatur = sign('sha256', Buffer.from(`${kopf}.${inhalt}`), { key: privatSchluessel(v), dsaEncoding: 'ieee-p1363' })
  return `vapid t=${kopf}.${inhalt}.${b64u(signatur)}, k=${v.oeffentlich}`
}

/** Schlüssel einer Push-Anmeldung des Browsers (PushSubscription.toJSON().keys) */
export interface AboSchluessel {
  p256dh: string
  auth: string
}

/** Inhaltsschlüssel und Nonce nach RFC 8291 §3.4 / RFC 8188 §2.2 */
function ableiten(geteilt: Buffer, auth: Buffer, ua: Buffer, as: Buffer, salt: Buffer): { cek: Buffer; nonce: Buffer } {
  const prkKey = hmac(auth, geteilt)
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0', 'latin1'), ua, as, Buffer.from([1])]))
  const prk = hmac(salt, ikm)
  return {
    cek: hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'latin1')).subarray(0, 16),
    nonce: hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'latin1')).subarray(0, 12)
  }
}

/**
 * Nachricht für eine Push-Anmeldung verschlüsseln (ein Datensatz, „aes128gcm"). `fest` nur für Tests (Beispiel der RFC):
 * Salz und privater Schlüssel des Servers für diese eine Nachricht.
 */
export function pushVerschluesseln(klartext: Uint8Array, abo: AboSchluessel, fest?: { salt?: Uint8Array; asPrivat?: Uint8Array; rs?: number; polster?: number }): Buffer {
  const ua = vonB64u(abo.p256dh)
  const auth = vonB64u(abo.auth)
  if (ua.length !== 65 || ua[0] !== 4) throw new Error('Push: öffentlicher Schlüssel des Geräts ungültig.')
  if (auth.length < 16) throw new Error('Push: Geheimnis des Geräts ungültig.')
  const e = createECDH('prime256v1')
  if (fest?.asPrivat) e.setPrivateKey(Buffer.from(fest.asPrivat))
  else e.generateKeys()
  const as = e.getPublicKey()
  const salt = fest?.salt ? Buffer.from(fest.salt) : randomBytes(16)
  const { cek, nonce } = ableiten(e.computeSecret(ua), auth, ua, as, salt)
  const rs = fest?.rs ?? 4096
  const daten = Buffer.concat([Buffer.from(klartext), Buffer.from([2]), Buffer.alloc(fest?.polster ?? 0)])
  if (daten.length + 16 > rs) throw new Error('Push: Nachricht zu groß.')
  const c = createCipheriv('aes-128-gcm', cek, nonce)
  const chiffrat = Buffer.concat([c.update(daten), c.final(), c.getAuthTag()])
  const kopf = Buffer.alloc(21)
  salt.copy(kopf, 0)
  kopf.writeUInt32BE(rs, 16)
  kopf[20] = as.length
  return Buffer.concat([kopf, as, chiffrat])
}

/** Gegenstück im Browser (für Tests): Nachricht mit dem privaten Schlüssel und dem Geheimnis der Anmeldung öffnen */
export function pushEntschluesseln(koerper: Uint8Array, uaPrivat: Uint8Array, auth: Uint8Array): Buffer {
  const b = Buffer.from(koerper)
  const salt = b.subarray(0, 16)
  const idlen = b[20]
  const as = b.subarray(21, 21 + idlen)
  const chiffrat = b.subarray(21 + idlen)
  const e = createECDH('prime256v1')
  e.setPrivateKey(Buffer.from(uaPrivat))
  const { cek, nonce } = ableiten(e.computeSecret(as), Buffer.from(auth), e.getPublicKey(), as, salt)
  const d = createDecipheriv('aes-128-gcm', cek, nonce)
  d.setAuthTag(chiffrat.subarray(chiffrat.length - 16))
  const klar = Buffer.concat([d.update(chiffrat.subarray(0, chiffrat.length - 16)), d.final()])
  let ende = klar.length - 1
  while (ende >= 0 && klar[ende] === 0) ende--
  if (ende < 0 || klar[ende] !== 2) throw new Error('Push: Trennzeichen fehlt.')
  return klar.subarray(0, ende)
}

/**
 * Nur bekannte Push-Dienste (Schutz davor, dass der Server im Namen eines Browsers beliebige Adressen aufruft):
 * Google (Chrome, Edge auf Android, Samsung), Mozilla (Firefox), Apple (Safari/iOS-Web-Apps), Microsoft (Edge am PC).
 * `lokal` nur für die Browsertests (SCHULAPPS_PUSH_LOKAL=1): http://127.0.0.1 bzw. localhost.
 */
const DIENSTE = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com']
export function endpunktErlaubt(endpunkt: string, lokal = false): boolean {
  let u: URL
  try {
    u = new URL(endpunkt)
  } catch {
    return false
  }
  if (endpunkt.length > 1000 || u.username || u.password) return false
  if (lokal && u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost')) return true
  if (u.protocol !== 'https:' || (u.port && u.port !== '443')) return false
  const host = u.hostname.toLowerCase()
  return DIENSTE.some((d) => host === d || host.endsWith(`.${d}`))
}

export interface PushZiel extends AboSchluessel {
  endpoint: string
}

/**
 * Eine Nachricht an einen Push-Dienst schicken. Liefert den Statuscode (201 = angenommen; 404/410 = Anmeldung
 * erloschen; 0 = Netzfehler). TTL 12 Stunden: Ein ausgeschaltetes Gerät bekommt die Erinnerung höchstens bis zum Abend.
 */
export async function pushSenden(
  ziel: PushZiel,
  nutzlast: string,
  v: VapidSchluessel,
  kontakt: string,
  o: { ttl?: number; thema?: string; lokal?: boolean; abbruchMs?: number } = {}
): Promise<number> {
  if (!endpunktErlaubt(ziel.endpoint, o.lokal)) return 400
  const koerper = pushVerschluesseln(Buffer.from(nutzlast, 'utf8'), ziel)
  try {
    const r = await fetch(ziel.endpoint, {
      method: 'POST',
      headers: {
        authorization: vapidKopf(ziel.endpoint, v, kontakt),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: String(o.ttl ?? 12 * 3600),
        urgency: 'normal',
        ...(o.thema ? { topic: o.thema } : {})
      },
      body: new Uint8Array(koerper),
      redirect: 'error',
      signal: AbortSignal.timeout(o.abbruchMs ?? 10_000)
    })
    await r.arrayBuffer().catch(() => undefined)
    return r.status
  } catch {
    return 0
  }
}
