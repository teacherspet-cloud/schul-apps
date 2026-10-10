import { createECDH, createPublicKey, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { b64u, endpunktErlaubt, pushEntschluesseln, pushVerschluesseln, vapidErzeugen, vapidGueltig, vapidKopf, vonB64u } from '../src/server/webPush'

/*
 * Web Push (10.10.2026): Verschlüsselung nach RFC 8291 (Beispiel aus Abschnitt 5) und VAPID-Kopf nach RFC 8292.
 */
describe('Web Push: Verschlüsselung (RFC 8291)', () => {
  // RFC 8291, Abschnitt 5 – alle Werte Base64url
  const RFC = {
    klartext: 'When I grow up, I want to be a watermelon',
    asPrivat: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    asOeffentlich: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    uaPrivat: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
    uaOeffentlich: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    salt: 'DGv6ra1nlYgDCS1FRnbzlw',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
    nachricht:
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
  }

  it('ergibt genau die Nachricht aus dem Beispiel der RFC', () => {
    const aus = pushVerschluesseln(Buffer.from(RFC.klartext), { p256dh: RFC.uaOeffentlich, auth: RFC.auth }, { salt: vonB64u(RFC.salt), asPrivat: vonB64u(RFC.asPrivat) })
    expect(b64u(aus)).toBe(RFC.nachricht)
    // Kopf: Salz, Datensatzgröße 4096, Schlüssel des Servers
    expect(aus.readUInt32BE(16)).toBe(4096)
    expect(b64u(aus.subarray(21, 86))).toBe(RFC.asOeffentlich)
  })

  it('die Nachricht der RFC lässt sich mit den Schlüsseln des Geräts öffnen', () => {
    expect(pushEntschluesseln(vonB64u(RFC.nachricht), vonB64u(RFC.uaPrivat), vonB64u(RFC.auth)).toString()).toBe(RFC.klartext)
  })

  it('Hin und zurück mit frischen Schlüsseln, auch mit Polster und Umlauten', () => {
    const ua = createECDH('prime256v1')
    ua.generateKeys()
    const auth = Buffer.from('0123456789abcdef')
    const text = JSON.stringify({ t: 'Zeit zum Üben', b: 'Fünf Minuten genügen – los geht’s!' })
    const a = pushVerschluesseln(Buffer.from(text), { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) }, { polster: 20 })
    const b = pushVerschluesseln(Buffer.from(text), { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) })
    expect(a.equals(b)).toBe(false)
    expect(pushEntschluesseln(a, ua.getPrivateKey(), auth).toString()).toBe(text)
    expect(pushEntschluesseln(b, ua.getPrivateKey(), auth).toString()).toBe(text)
    // Falsches Geheimnis: GCM schlägt an
    expect(() => pushEntschluesseln(b, ua.getPrivateKey(), Buffer.from('fedcba9876543210'))).toThrow()
  })

  it('lehnt kaputte Schlüssel und zu große Nachrichten ab', () => {
    expect(() => pushVerschluesseln(Buffer.from('x'), { p256dh: 'AAAA', auth: RFC.auth })).toThrow(/Schlüssel/)
    expect(() => pushVerschluesseln(Buffer.from('x'), { p256dh: RFC.uaOeffentlich, auth: 'AAAA' })).toThrow(/Geheimnis/)
    expect(() => pushVerschluesseln(Buffer.alloc(5000), { p256dh: RFC.uaOeffentlich, auth: RFC.auth })).toThrow(/zu groß/)
  })
})

describe('Web Push: VAPID (RFC 8292)', () => {
  it('JWT mit ES256, Herkunft des Endpunkts, höchstens 24 Stunden, prüfbar mit dem öffentlichen Schlüssel', () => {
    const v = vapidErzeugen()
    expect(vapidGueltig(v)).toBe(true)
    expect(vapidGueltig({ oeffentlich: 'x', privat: 'y' })).toBe(false)
    const jetzt = Date.UTC(2026, 9, 10, 12)
    const kopf = vapidKopf('https://fcm.googleapis.com/fcm/send/abc', v, 'https://www.meineschulapps.de', jetzt)
    const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(kopf)
    expect(m).not.toBeNull()
    const [, h, p, s, k] = m!
    expect(k).toBe(v.oeffentlich)
    expect(JSON.parse(vonB64u(h).toString())).toEqual({ typ: 'JWT', alg: 'ES256' })
    const claims = JSON.parse(vonB64u(p).toString())
    expect(claims.aud).toBe('https://fcm.googleapis.com')
    expect(claims.sub).toBe('https://www.meineschulapps.de')
    expect(claims.exp - jetzt / 1000).toBeGreaterThan(0)
    expect(claims.exp - jetzt / 1000).toBeLessThanOrEqual(24 * 3600)
    const pub = vonB64u(v.oeffentlich)
    const schluessel = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: 'jwk' })
    expect(vonB64u(s).length).toBe(64)
    expect(verify('sha256', Buffer.from(`${h}.${p}`), { key: schluessel, dsaEncoding: 'ieee-p1363' }, vonB64u(s))).toBe(true)
  })

  it('nur bekannte Push-Dienste über https; lokal nur im Testbetrieb', () => {
    expect(endpunktErlaubt('https://fcm.googleapis.com/fcm/send/x')).toBe(true)
    expect(endpunktErlaubt('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true)
    expect(endpunktErlaubt('https://web.push.apple.com/QF3x')).toBe(true)
    expect(endpunktErlaubt('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true)
    expect(endpunktErlaubt('http://fcm.googleapis.com/x')).toBe(false)
    expect(endpunktErlaubt('https://fcm.googleapis.com.boese.de/x')).toBe(false)
    expect(endpunktErlaubt('https://intern.local/x')).toBe(false)
    expect(endpunktErlaubt('https://fcm.googleapis.com:8443/x')).toBe(false)
    expect(endpunktErlaubt('http://127.0.0.1:9999/push/1')).toBe(false)
    expect(endpunktErlaubt('http://127.0.0.1:9999/push/1', true)).toBe(true)
    expect(endpunktErlaubt('kein url')).toBe(false)
  })
})
