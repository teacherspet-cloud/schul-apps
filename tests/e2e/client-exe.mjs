// Exe „Schul-Apps Online" gegen einen (lokalen) Schul-Apps-Server – OHNE KI (02.10.2026).
// Vorher: Server lokal starten, Client bauen: SCHULAPPS_CLIENT_OUT=<ordner> npx vite build -c vite.client.config.ts
// Aufruf: node tests/e2e/client-exe.mjs <Ausgabeordner> <client-ordner> [adresse] [admin] [passwort]
//
// Geprüft: Fenster lädt die Anmeldeseite des Servers; Anmeldung (Testkonto) im Fenster; nach einem
// Neustart der Exe ist man noch angemeldet (dauerhafte Sitzung); die Brücke für IServ ist da und
// die IServ-Karte erscheint in den Einstellungen; Abmelden führt zurück zur Anmeldung.
import { _electron as electron, request } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/client-exe')
const client = resolve(process.argv[3] ?? 'out-client')
const A = process.argv[4] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[5] ?? 't.kornahrens', passwort: process.argv[6] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const K = { 'x-schulapps-token': 'server' }
const daten = mkdtempSync(join(tmpdir(), 'schulapps-online-'))
const verwaltung = await request.newContext()
await verwaltung.post(`${A}/auth/lokal`, { form: { benutzer: admin.benutzer, passwort: admin.passwort, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
const konto = await (await verwaltung.post(`${A}/server/verwaltung/testkonto`, { headers: K, data: { rolle: 'lehrkraft', name: 'Exe Test' } })).json()
const starte = () => electron.launch({ args: [join(client, 'main.cjs'), `--server=${A}`, `--user-data-dir=${daten}`] })
try {
  let app = await starte()
  let page = await app.firstWindow()
  await page.waitForURL(/\/anmelden/, { timeout: 20000 })
  pruefe(true, 'Exe zeigt die Anmeldeseite des Servers')
  // Seit 08.10.2026 im Fenster „Mit Nutzername und Passwort anmelden"
  await page.locator('[data-anmelden-oeffnen]').click()
  await page.fill('#benutzer', konto.benutzer)
  await page.fill('#passwort', konto.passwort)
  await page.click('form[action=\"/auth/lokal\"] button[type=submit]')
  await page.waitForURL((u) => !u.pathname.startsWith('/anmelden'), { timeout: 20000 })
  await page.waitForTimeout(2500)
  const spaeter = page.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  pruefe(await page.evaluate(() => Boolean(window.__schulappsClient?.iserv)), 'Brücke für IServ (window.__schulappsClient) ist da')
  await page.screenshot({ path: join(out, '1-angemeldet.png') })
  await app.close()

  // Neustart: noch angemeldet?
  app = await starte()
  page = await app.firstWindow()
  await page.waitForTimeout(3500)
  pruefe(!page.url().includes('/anmelden'), `nach dem Neustart noch angemeldet (${page.url()})`)
  await page.getByRole('button', { name: /Einstellungen/ }).first().click()
  await page.getByRole('tab', { name: 'Material' }).click()
  pruefe(await page.locator('[data-iserv-karte]').isVisible({ timeout: 10000 }), 'IServ-Karte in den Einstellungen (über die Exe)')
  await page.screenshot({ path: join(out, '2-iserv.png') })
  await page.getByRole('button', { name: /Abmelden/ }).first().click()
  await page.waitForURL(/\/anmelden/, { timeout: 10000 }).catch(() => undefined)
  pruefe(page.url().includes('/anmelden'), 'Abmelden → Anmeldeseite')
  await app.close()
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
} finally {
  await verwaltung.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: K, data: { id: konto.id } }).catch(() => undefined)
  rmSync(daten, { recursive: true, force: true })
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
