// Erinnerungen zum Üben per Web Push (10.10.2026). Server lokal (KI-Attrappe, keine KI nötig), gestartet mit
// SCHULAPPS_PUSH_LOKAL=1 (scripts/e2e-parallel.mjs) – dann nimmt der Server http://127.0.0.1 als Push-Dienst an.
// Aufruf: node tests/e2e/server-erinnerungen.mjs <Ausgabeordner> [adresse] [admin] [passwort]
//
// Geprüft: Lehrkraft bietet Erinnerungen im Kurs an (Schalter in den Kurseinstellungen) und sieht nur die Zahl der
// Aktiven; Lernende schalten sie in den Einstellungen ein – der Browser meldet sich mit einer erfundenen Push-Anmeldung
// an, deren Endpunkt ein kleiner Empfänger in diesem Test ist; die Test-Benachrichtigung kommt dort verschlüsselt an und
// lässt sich mit den Schlüsseln der Anmeldung öffnen (ohne Namen); Service Worker unter /s/sw.js; Ausschalten; Abmelden
// entfernt das Gerät; auf dem iPhone im Safari-Tab die Anleitung „Zum Home-Bildschirm"; ohne Angebot nur ein Hinweis.
import { chromium, devices } from 'playwright-core'
import { createDecipheriv, createECDH, createHmac, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus, kursReiter } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-erinnerungen')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const warte = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- Erfundene Push-Anmeldung: Schlüssel des „Geräts" und ein Empfänger, der die Nachrichten sammelt
const ua = createECDH('prime256v1')
ua.generateKeys()
const auth = randomBytes(16)
const angekommen = []
const empfaenger = createServer((req, res) => {
  const teile = []
  req.on('data', (d) => teile.push(d))
  req.on('end', () => {
    angekommen.push({ pfad: req.url, kopf: req.headers, koerper: Buffer.concat(teile) })
    res.writeHead(201).end()
  })
})
await new Promise((ok) => empfaenger.listen(0, '127.0.0.1', ok))
const ENDPUNKT = `http://127.0.0.1:${empfaenger.address().port}/push/geraet-1`
const ABO = { endpoint: ENDPUNKT, p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') }

/** RFC 8291 auf der Seite des Geräts – unabhängig vom Server nachgebaut */
function oeffnen(b) {
  const hmac = (k, d) => createHmac('sha256', k).update(d).digest()
  const salt = b.subarray(0, 16)
  const idlen = b[20]
  const as = b.subarray(21, 21 + idlen)
  const c = b.subarray(21 + idlen)
  const ikm = hmac(hmac(auth, ua.computeSecret(as)), Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), as, Buffer.from([1])]))
  const prk = hmac(salt, ikm)
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16)
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12)
  const d = createDecipheriv('aes-128-gcm', cek, nonce)
  d.setAuthTag(c.subarray(c.length - 16))
  const klar = Buffer.concat([d.update(c.subarray(0, c.length - 16)), d.final()])
  let e = klar.length - 1
  while (e >= 0 && klar[e] === 0) e--
  return klar.subarray(0, e).toString('utf8')
}

/** Im Browser: Erlaubnis und Push-Anmeldung durch die erfundene ersetzen (der echte Push-Dienst bleibt außen vor) */
const pushAttrappe = (abo) => {
  const MERK = 'e2e-push-abo'
  const mache = () => ({
    endpoint: abo.endpoint,
    expirationTime: null,
    options: { userVisibleOnly: true },
    toJSON: () => ({ endpoint: abo.endpoint, expirationTime: null, keys: { p256dh: abo.p256dh, auth: abo.auth } }),
    getKey: () => null,
    unsubscribe: async () => {
      sessionStorage.removeItem(MERK)
      return true
    }
  })
  if (window.PushManager) {
    window.PushManager.prototype.subscribe = async function (o) {
      if (!o || !o.applicationServerKey || !o.userVisibleOnly) throw new Error('Anmeldung ohne Schlüssel')
      sessionStorage.setItem(MERK, '1')
      return mache()
    }
    window.PushManager.prototype.getSubscription = async () => (sessionStorage.getItem(MERK) ? mache() : null)
  }
  if (window.Notification) {
    Object.defineProperty(window.Notification, 'permission', { configurable: true, get: () => sessionStorage.getItem('e2e-erlaubt') || 'default' })
    window.Notification.requestPermission = async () => {
      sessionStorage.setItem('e2e-erlaubt', 'granted')
      return 'granted'
    }
  }
}

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
let vid = ''
let lk
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const neu = async (rolle, name) => {
    const k = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle, name } })).json()
    zuLoeschen.push(k.id)
    return k
  }
  const lehrer = await neu('lehrkraft', 'Erik Erinnerer')
  const kind = await neu('schueler', 'Paula Pushprobe')
  lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const woerter = Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, term: `word${i}`, translation: `Wort${i}` }))
  vid = (
    await (
      await lk.request.post(`${A}/server/vokabeln/freigeben`, { headers: KOPF, data: { titel: 'Unit 1', sprache: 'en', fach: 'Englisch', woerter, schueler: [kind.benutzer] } })
    ).json()
  ).id
  pruefe(Boolean(vid), 'Vokabelkurs für eine Lernende')

  // ---------- Service Worker und Manifest
  const sw = await verwaltung.request.get(`${A}/s/sw.js`)
  const swText = await sw.text()
  pruefe(sw.ok() && (sw.headers()['content-type'] ?? '').includes('javascript') && swText.includes("addEventListener('push'"), 'Service Worker unter /s/sw.js')
  pruefe(!/fetch'\s*,/.test(swText) && !swText.includes("addEventListener('fetch'"), 'Service Worker fängt keine Anfragen ab')
  const m = await (await verwaltung.request.get(`${A}/s/manifest.webmanifest`)).json()
  pruefe(m.display === 'standalone' && m.start_url === '/s/' && m.short_name === 'Schul-Apps', `Manifest der Lernenden (${m.short_name})`)

  // ---------- Ohne Angebot: nur ein Hinweis
  const s = await browser.newContext({ viewport: { width: 430, height: 900 } })
  await s.addInitScript(pushAttrappe, ABO)
  await anmelden(s, kind.benutzer, kind.passwort)
  const p = await s.newPage()
  p.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await p.goto(`${A}/s/einstellungen`)
  pruefe(await da(p.locator('[data-erinnerung-nicht-angeboten]')), 'Ohne Angebot der Lehrkraft: Hinweis statt Schalter')

  // ---------- Lehrkraft: Schalter in den Kurseinstellungen
  const l = await lk.newPage()
  l.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await l.goto(A)
  await l.waitForTimeout(2500)
  const sp = l.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(l)
  await l.locator('.app-leiste [aria-label="Sprachenlernen"]').click()
  await l.locator(`[data-vokabel-zuweisung="${vid}"]`).click()
  await kursReiter(l, 'einstellungen')
  pruefe(await da(l.locator('[data-kurs-erinnerungen]')), 'Kurseinstellungen: Karte „Erinnerungen"')
  pruefe(!(await l.locator('[data-kurs-erinnerungen-an]').isChecked()), 'Vorgabe: nicht angeboten')
  await l.locator('[data-kurs-erinnerungen-an]').click({ force: true })
  pruefe(await da(l.locator('[data-kurs-erinnerungen-aktiv="0"]')), 'Angeboten – 0 Lernende haben sie eingeschaltet')
  const k1 = await (await lk.request.get(`${A}/server/vokabeln/${vid}`, { headers: KOPF })).json()
  pruefe(k1.erinnerungen === true, 'Angebot gespeichert')

  // ---------- Lernende: einschalten
  await p.reload()
  pruefe(await da(p.locator('[data-erinnerungen]')), 'Einstellungen › Erinnerungen')
  await p.locator('[data-erinnerung-an]').click({ force: true })
  pruefe(await da(p.locator('[data-erinnerung-test]')), 'Eingeschaltet: Uhrzeit, Tage, Auslöser, Test-Knopf')
  await p.waitForTimeout(800)
  const st = await (await s.request.get(`${A}/s/api/erinnerungen`, { headers: KOPF })).json()
  pruefe(st.wahl?.an === true && st.geraete === 1 && st.wahl.zeit === '16:00', `Server: an, 1 Gerät, 16:00 (${JSON.stringify({ an: st.wahl?.an, g: st.geraete, z: st.wahl?.zeit })})`)
  const reg = await p.evaluate(() => navigator.serviceWorker.getRegistration('/s/').then((r) => Boolean(r)))
  pruefe(reg, 'Service Worker im Browser registriert (Bereich /s/)')
  await p.screenshot({ path: join(out, '1-erinnerungen-an.png'), fullPage: true })

  // Uhrzeit und Sprache ändern
  await p.locator('[data-erinnerung-zeit]').click()
  await p.getByRole('option', { name: '17:30 Uhr' }).click()
  await p.locator('[data-erinnerung-sprache]').getByText('English').click()
  await p.waitForTimeout(800)
  const st2 = await (await s.request.get(`${A}/s/api/erinnerungen`, { headers: KOPF })).json()
  pruefe(st2.wahl.zeit === '17:30' && st2.wahl.sprache === 'en', `Uhrzeit 17:30 und Englisch gespeichert (${st2.wahl.zeit}, ${st2.wahl.sprache})`)

  // ---------- Test-Benachrichtigung: kommt verschlüsselt an, lässt sich öffnen, ohne Namen
  angekommen.length = 0
  await p.locator('[data-erinnerung-test]').click()
  pruefe(await da(p.locator('[data-erinnerung-test-info]', { hasText: 'Gesendet' })), 'Test-Benachrichtigung gesendet')
  for (let i = 0; i < 20 && !angekommen.length; i++) await warte(250)
  const a0 = angekommen[0]
  pruefe(Boolean(a0) && a0.kopf['content-encoding'] === 'aes128gcm' && /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/.test(a0.kopf.authorization ?? ''), 'Beim Push-Dienst: aes128gcm mit VAPID-Kopf')
  let klar = ''
  try {
    klar = a0 ? oeffnen(a0.koerper) : ''
  } catch (e) {
    klar = `FEHLER ${e.message}`
  }
  const n = (() => {
    try {
      return JSON.parse(klar)
    } catch {
      return {}
    }
  })()
  pruefe(n.t === 'Reminders are on' && n.u === '/s/' && n.l === 'en', `Mit den Schlüsseln des Geräts lesbar: „${n.t}" (${n.l})`)
  pruefe(Boolean(klar) && !/Paula|Pushprobe|Erik|Erinnerer/.test(klar) && !klar.includes(kind.benutzer) && !a0.koerper.toString('latin1').includes('Reminders'), 'Kein Name in der Nachricht, Klartext nur nach dem Öffnen')

  // ---------- Lehrkraft sieht die Zahl
  const k2 = await (await lk.request.get(`${A}/server/vokabeln/${vid}`, { headers: KOPF })).json()
  pruefe(k2.erinnerungenAktiv === 1 && !JSON.stringify(k2).includes('erinnerungenGeraete'), `Lehrkraft bekommt nur die Zahl (${k2.erinnerungenAktiv})`)
  await l.reload()
  await l.waitForTimeout(1500)
  await l.locator('.app-leiste [aria-label="Sprachenlernen"]').click()
  await l.locator(`[data-vokabel-zuweisung="${vid}"]`).click()
  await kursReiter(l, 'einstellungen')
  pruefe(await da(l.locator('[data-kurs-erinnerungen-aktiv="1"]')), 'Lehrkraft: „1 Lernende/r hat Erinnerungen eingeschaltet"')
  await l.screenshot({ path: join(out, '2-lehrkraft.png') })

  // ---------- Ausschalten
  await p.locator('[data-erinnerung-an]').click({ force: true })
  await p.locator('[data-erinnerung-test]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined)
  const st3 = await (await s.request.get(`${A}/s/api/erinnerungen`, { headers: KOPF })).json()
  pruefe(st3.wahl.an === false && st3.geraete === 0, `Ausgeschaltet: aus, kein Gerät (${st3.wahl.an}, ${st3.geraete})`)

  // ---------- Abmelden entfernt das Gerät dieser Sitzung
  await s.request.post(`${A}/s/api/erinnerungen/geraet`, { headers: KOPF, data: { abo: { endpoint: ENDPUNKT, keys: { p256dh: ABO.p256dh, auth: ABO.auth } } } })
  pruefe((await (await s.request.get(`${A}/s/api/erinnerungen`, { headers: KOPF })).json()).geraete === 1, 'Gerät wieder angemeldet')
  await s.request.post(`${A}/auth/abmelden`, { headers: KOPF })
  await anmelden(s, kind.benutzer, kind.passwort)
  pruefe((await (await s.request.get(`${A}/s/api/erinnerungen`, { headers: KOPF })).json()).geraete === 0, 'Nach dem Abmelden: kein Gerät mehr')

  // ---------- iPhone im Safari-Tab: Anleitung zum Home-Bildschirm
  const ip = await browser.newContext({ ...devices['iPhone 13'] })
  await anmelden(ip, kind.benutzer, kind.passwort)
  const ipp = await ip.newPage()
  await ipp.goto(`${A}/s/einstellungen`)
  pruefe(await da(ipp.locator('[data-erinnerung-ios]')), 'iPhone im Browser: Anleitung „Teilen › Zum Home-Bildschirm"')
  pruefe(await ipp.locator('[data-erinnerung-an]').isDisabled(), 'iPhone im Browser: Schalter erst in der Web-App')
  await ipp.screenshot({ path: join(out, '3-iphone.png'), fullPage: true })

  // ---------- Lehrkraft zieht das Angebot zurück
  await lk.request.post(`${A}/server/vokabeln/${vid}/erinnerungen`, { headers: KOPF, data: { an: false } })
  await p.reload()
  pruefe(await da(p.locator('[data-erinnerung-nicht-angeboten]')), 'Angebot zurückgezogen: wieder nur der Hinweis')
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${String(e?.message ?? e).split('\n').slice(0, 4).join(' | ')}`)
} finally {
  if (lk && vid) await lk.request.post(`${A}/server/vokabeln/${vid}/loeschen`, { headers: KOPF, data: { klassenkurs: true } }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Kurs und Konten gelöscht (${zuLoeschen.length})`)
  await browser.close()
  empfaenger.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
