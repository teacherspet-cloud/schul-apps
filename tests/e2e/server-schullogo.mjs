// Schullogo folgt der Verwaltung (23.10.2026, Befund der Lehrkraft: „Das Schullogo des Einzelnutzers wird nicht
// aktualisiert, wenn das Schullogo vom Admin geändert wird"):
//  1. Lehrkraft hat die Schuldaten übernommen → beim Laden steht das Schullogo bei ihr.
//  2. Admin ändert das Schullogo → nach dem Neuladen hat die Lehrkraft das neue.
//  3. Eine Lehrkraft mit selbst gewähltem Logo behält ihres.
// Ohne KI. Aufruf: node tests/e2e/server-schullogo.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { deflateSync } from 'zlib'

const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }

/** Ein kleines, einfarbiges PNG als data:-URL (je Farbe ein anderes Logo) */
function png(r, g, b) {
  const crc = (buf) => {
    let c = ~0
    for (const x of buf) {
      c ^= x
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    }
    return ~c >>> 0
  }
  const chunk = (typ, daten) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(daten.length)
    const td = Buffer.concat([Buffer.from(typ), daten])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(8, 0)
  ihdr.writeUInt32BE(8, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const zeile = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 8 }, () => [r, g, b]).flat())])
  const roh = Buffer.concat(Array.from({ length: 8 }, () => zeile))
  const datei = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(roh)), chunk('IEND', Buffer.alloc(0))])
  return `data:image/png;base64,${datei.toString('base64')}`
}

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
const verwaltung = await browser.newContext()
let vorher = null
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  // Das Logo gilt auch ohne eingetragenen Schulnamen (server/schule.ts)
  vorher = await (await verwaltung.request.get(`${A}/server/schule`, { headers: KOPF })).json()
  const setzeSchulLogo = (logo) => verwaltung.request.post(`${A}/server/schule/logo`, { headers: KOPF, data: { logo } })
  const ROT = png(220, 30, 30)
  const BLAU = png(30, 60, 220)
  await setzeSchulLogo(ROT)

  const konto = async (name, settings) => {
    const k = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name } })).json()
    zuLoeschen.push(k.id)
    const ctx = await browser.newContext()
    await anmelden(ctx, k.benutzer, k.passwort)
    const api = async (channel, ...args) => (await (await ctx.request.post(`${A}/api`, { headers: KOPF, data: { channel, args } })).json()).value
    if (settings) await api('settings:set', settings)
    const laden = async () => {
      const p = await ctx.newPage()
      await p.goto(A)
      await p.waitForTimeout(4000)
      await p.close()
      return api('branding:get-logo')
    }
    return { ...k, api, laden }
  }
  // Übernommene Schuldaten (wie nach dem Einrichtungsassistenten), noch ohne Logo
  const lea = await konto('Lea Logo', { schuldatenAngebot: 'uebernommen' })
  pruefe((await lea.laden()) === ROT, 'Lehrkraft mit übernommenen Schuldaten bekommt das Schullogo')
  // Eigenes Logo: bleibt
  const ben = await konto('Ben Eigenes Logo')
  const EIGEN = png(30, 160, 60)
  await ben.api('branding:set-logo', EIGEN)
  await ben.api('settings:set', { schuldatenAngebot: 'uebernommen', logoEigen: true })

  await setzeSchulLogo(BLAU)
  pruefe((await lea.laden()) === BLAU, 'Admin ändert das Schullogo → die Lehrkraft hat nach dem Neuladen das neue')
  pruefe((await ben.laden()) === EIGEN, 'Selbst gewähltes Logo bleibt unverändert')
  await setzeSchulLogo(null)
  pruefe(!(await lea.laden()), 'Admin entfernt das Schullogo → auch bei der Lehrkraft weg')
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
} finally {
  // Schullogo wie vorher
  await verwaltung.request.post(`${A}/server/schule/logo`, { headers: KOPF, data: { logo: vorher?.logo ?? null } }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
