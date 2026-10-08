// Schul-Apps-Server im Browser – OHNE KI (02.10.2026).
// Vorher: Server bauen und lokal starten (siehe server/README.md, Abschnitt „Lokal testen"),
// Oberfläche bauen (npm run build). Aufruf: node tests/e2e/server-browser.mjs <Ausgabeordner> [adresse] [benutzer] [passwort]
//
// Ablauf: Als Admin (Notzugang) ein frisches Testkonto anlegen (Verwaltung), damit der
// Assistent wirklich „zum ersten Mal" kommt; am Ende wird es wieder gelöscht – mit Ablage.
// Geprüft: Ohne Anmeldung → Anmeldeseite; Anmeldung mit Passwort (Testkonto) → die
// Programme; beim ersten Mal der Einrichtungsassistent (danach nicht mehr); KI-Zugang in den
// Einstellungen sichtbar; Abmelden → wieder Anmeldeseite, Aufrufe danach abgewiesen.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-browser')
const adresse = process.argv[3] ?? 'http://localhost:18443'
const benutzer = process.argv[4] ?? 't.kornahrens'
const passwort = process.argv[5] ?? 'test-notzugang-123'
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const browser = await chromium.launch({ channel: 'msedge' })
let aufraeumen = async () => undefined
try {
  // Admin: frisches Testkonto
  const admin = await browser.newContext()
  await admin.request.post(`${adresse}/auth/lokal`, { form: { benutzer, passwort, ziel: '/' }, headers: { origin: adresse }, maxRedirects: 0 })
  const konto = await (await admin.request.post(`${adresse}/server/verwaltung/testkonto`, { headers: { 'x-schulapps-token': 'server' }, data: { rolle: 'lehrkraft', name: 'E2E-Test' } })).json()
  pruefe(/^test\.\d+$/.test(konto.benutzer ?? '') && (konto.passwort ?? '').length >= 12, `Testkonto angelegt (${konto.benutzer})`)
  aufraeumen = async () => {
    const r = await admin.request.post(`${adresse}/server/verwaltung/nutzer-loeschen`, { headers: { 'x-schulapps-token': 'server' }, data: { id: konto.id } })
    pruefe(r.ok(), 'Testkonto samt Ablage wieder gelöscht')
  }
  const kontext = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  const page = await kontext.newPage()
  const fehler = []
  page.on('pageerror', (e) => fehler.push(e.message))
  await page.goto(adresse)
  pruefe(page.url().includes('/anmelden'), `ohne Anmeldung → Anmeldeseite (${page.url()})`)
  await page.screenshot({ path: join(out, '1-anmelden.png') })
  await page.evaluate(() => { document.querySelectorAll('details').forEach((d) => (d.open = true)) })
  await page.fill('#benutzer', konto.benutzer)
  await page.fill('#passwort', konto.passwort)
  await page.click('form[action=\"/auth/lokal\"] button[type=submit]')
  await page.waitForURL((u) => !u.pathname.startsWith('/anmelden'), { timeout: 20000 })
  const assistent = await page.getByText('Willkommen bei Schul-Apps').waitFor({ timeout: 20000 }).then(() => true, () => false)
  pruefe(assistent, 'erste Anmeldung: Einrichtungsassistent erscheint')
  await page.screenshot({ path: join(out, '2-assistent.png') })
  if (assistent) await page.getByRole('button', { name: 'Später einrichten' }).click().catch(() => undefined)
  if (assistent) await expertenmodus(page)
  await page.waitForTimeout(800)
  await page.reload()
  await page.waitForTimeout(2500)
  pruefe(!(await page.getByText('Willkommen bei Schul-Apps').isVisible().catch(() => false)), 'nach dem Schließen kommt der Assistent nicht wieder')
  await page.getByRole('button', { name: /Einstellungen/ }).first().click()
  pruefe(await page.getByRole('tab', { name: 'KI-Zugang' }).isVisible(), 'Einstellungen: Reiter „KI-Zugang" sichtbar (auf dem Server erlaubt)')
  pruefe(!(await page.getByRole('tab', { name: 'Netzwerk' }).isVisible().catch(() => false)), 'kein Reiter „Netzwerk"')
  await page.getByRole('tab', { name: 'KI-Zugang' }).click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(out, '3-ki.png') })
  const abmelden = page.getByRole('button', { name: /Abmelden/ }).first()
  pruefe(await abmelden.isVisible(), 'Abmelden-Knopf in der Leiste')
  await abmelden.click()
  await page.waitForURL(/\/anmelden/, { timeout: 10000 }).catch(() => undefined)
  pruefe(page.url().includes('/anmelden'), 'nach dem Abmelden: Anmeldeseite')
  // Mit den Cookies des Browsers (die Anmeldeseite selbst erlaubt keine Abrufe – CSP)
  const nachher = (await kontext.request.post(`${adresse}/api`, { headers: { 'x-schulapps-token': 'server' }, data: { channel: 'settings:get', args: [] } })).status()
  pruefe(nachher === 401, `Aufrufe nach dem Abmelden abgewiesen (${nachher})`)
  for (const f of fehler) console.log(`   (Fehler im Fenster: ${f})`)
  pruefe(fehler.length === 0, `keine Fehler im Fenster (${fehler.length})`)
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
} finally {
  await aufraeumen().catch((e) => pruefe(false, `Aufräumen: ${e.message}`))
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
