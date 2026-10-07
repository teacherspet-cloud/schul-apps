// Web-App vom Home-Bildschirm (02.10.2026) – Server lokal, ohne KI.
// Aufruf: node tests/e2e/server-webapp.mjs <Ausgabeordner> [adresse] [admin] [passwort]
//
// Geprüft: Manifeste für Lehrkräfte (/) und Lernende (/s/) mit Symbolen; Symbole erreichbar;
// /s/ ohne Anmeldung (solange IServ fehlt) mit Code-Eingabe und „QR-Code scannen"; der Scanner
// startet die Kamera (Testkamera); auf dem iPad in Safari ein Tipp zum Home-Bildschirm, in der
// Web-App nicht; in der Web-App kein „In eigenem Fenster öffnen" (öffnete nur eine Browseransicht).
import { chromium, devices } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-webapp')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  // ---------- Manifeste und Symbole
  const m1 = await (await verwaltung.request.get(`${A}/manifest.webmanifest`)).json()
  const m2 = await (await verwaltung.request.get(`${A}/s/manifest.webmanifest`)).json()
  pruefe(m1.start_url === '/' && m1.display === 'standalone' && m1.icons.length >= 2, 'Manifest für Lehrkräfte: Start „/", eigenständig, Symbole')
  pruefe(m2.start_url === '/s/' && m2.scope === '/s/', 'Manifest für Lernende: Start und Bereich „/s/" (Test-Links bleiben in der App)')
  for (const pfad of ['/web-app/apple-touch-icon.png', ...m1.icons.map((i) => i.src)]) {
    const r = await verwaltung.request.get(`${A}${pfad}`)
    pruefe(r.ok() && (r.headers()['content-type'] ?? '').includes('image/png'), `Symbol erreichbar: ${pfad}`)
  }

  // ---------- Lernende auf dem iPad in Safari (nicht als Web-App)
  const ipad = await browser.newContext({ ...devices['iPad (gen 7)'], permissions: ['camera'] })
  const s = await ipad.newPage()
  await s.goto(`${A}/s/`)
  await s.locator('[data-code-scannen]').waitFor({ timeout: 15000 })
  pruefe(!s.url().includes('/anmelden'), '/s/ ohne Anmeldung: Code eingeben oder scannen')
  pruefe(
    (await s.locator('link[rel=manifest][href="/s/manifest.webmanifest"]').count()) === 1 && (await s.locator('link[rel=apple-touch-icon]').count()) === 1,
    'Seite verweist auf Manifest und Home-Bildschirm-Symbol'
  )
  pruefe(await s.locator('[data-home-tipp]').isVisible(), 'iPad in Safari: Tipp „Zum Home-Bildschirm"')
  await s.locator('[data-code-scannen]').click()
  await s.locator('[data-code-scanner] video').waitFor({ timeout: 10000 })
  const laeuft = await s
    .waitForFunction(
      () => {
        const v = document.querySelector('[data-code-scanner] video')
        return v && v.readyState >= 2 && v.videoWidth > 0
      },
      null,
      { timeout: 15000 }
    )
    .then(
      () => true,
      () => false
    )
  pruefe(laeuft, 'Scanner: Kamera läuft in der Seite')
  await s.screenshot({ path: join(out, '1-scanner.png') })
  await s.keyboard.press('Escape')

  // ---------- Dieselbe Seite als Web-App vom Home-Bildschirm
  const app = await browser.newContext({ ...devices['iPad (gen 7)'] })
  await app.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }))
  const w = await app.newPage()
  await w.goto(`${A}/s/`)
  await w.locator('[data-code-scannen]').waitFor({ timeout: 15000 })
  pruefe(!(await w.locator('[data-home-tipp]').isVisible()), 'als Web-App: kein Tipp mehr')

  // ---------- Lehrkraft als Web-App: keine eigenen Fenster
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft' } })).json()
  zuLoeschen.push(lehrer.id)
  const lk = await browser.newContext({ viewport: { width: 1180, height: 820 } })
  await lk.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }))
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(3000)
  const spaeter = p.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await expertenmodus(p)
  await p.locator('[data-schnellzugriff-raster]').first().waitFor({ timeout: 10000 })
  pruefe((await p.locator('[data-eigenes-fenster]').count()) === 0, 'Lehrkraft als Web-App: kein „In eigenem Fenster öffnen"')
  const lb = await browser.newContext({ viewport: { width: 1180, height: 820 } })
  await anmelden(lb, lehrer.benutzer, lehrer.passwort)
  const b = await lb.newPage()
  await b.goto(A)
  await b.waitForTimeout(3000)
  const sp2 = b.getByRole('button', { name: 'Später einrichten' })
  if (await sp2.isVisible().catch(() => false)) await sp2.click()
  await expertenmodus(b)
  pruefe(
    await b
      .locator('[data-eigenes-fenster]')
      .first()
      .waitFor({ state: 'attached', timeout: 10000 })
      .then(
        () => true,
        () => false
      ),
    'im Browser am PC: Pop-up-Symbole vorhanden'
  )
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
} finally {
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
