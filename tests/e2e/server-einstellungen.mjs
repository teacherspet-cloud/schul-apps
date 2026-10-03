// Einstellungen (03.10.2026): Lernende ändern Darstellung und Passwort, Lehrkraft ändert ihr Passwort.
// Vorher: Server lokal (KI wird nicht gebraucht), IServ NICHT eingerichtet.
// Aufruf: node tests/e2e/server-einstellungen.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-einstellungen')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `9e${Date.now() % 1000}`
const da = (l, ms = 10000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea Testlehrerin' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Mia Probe' } })
  ).json()
  const mia = liste.angelegt[0]
  const u0 = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u0.nutzer ?? []) if (n.benutzer === mia.benutzer) zuLoeschen.push(n.id)

  // ---------- Mia: Darstellung
  const sm = await browser.newContext({ viewport: { width: 1024, height: 1366 }, hasTouch: true })
  await anmelden(sm, mia.benutzer, mia.passwort)
  await sm.request.post(`${A}/auth/passwort`, {
    form: { neu: 'ErstesPasswort-11', neu2: 'ErstesPasswort-11', ziel: '/s/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  const s = await sm.newPage()
  await s.goto(`${A}/s/`)
  await s.locator('[data-einstellungen-knopf]').click()
  pruefe(await da(s.locator('[data-schueler-einstellungen]')), 'Schüler: Einstellungen erreichbar')
  await s.locator('[data-modus]').getByText('Dunkel').click()
  await s.locator('[data-schrift]').getByText('Groß', { exact: true }).click()
  await s.locator('[data-farbe="teal"]').click()
  await s.waitForTimeout(800)
  const schema = await s.evaluate(() => document.documentElement.getAttribute('data-mantine-color-scheme'))
  const schrift = await s.evaluate(() => document.documentElement.style.fontSize)
  pruefe(schema === 'dark' && schrift === '112.5%', `Dunkel und große Schrift wirken sofort (${schema}, ${schrift})`)
  await s.screenshot({ path: join(out, '1-einstellungen-dunkel.png'), fullPage: true })
  const gesp = await (await sm.request.get(`${A}/s/api/darstellung`, { headers: KOPF })).json()
  pruefe(gesp.darstellung?.modus === 'dunkel' && gesp.darstellung?.farbe === 'teal', 'Darstellung am Konto gespeichert')
  // Zweites Gerät: gleiche Darstellung ohne lokale Kopie
  const sm2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  await anmelden(sm2, mia.benutzer, 'ErstesPasswort-11')
  const s2 = await sm2.newPage()
  await s2.goto(`${A}/s/`)
  await s2.waitForTimeout(1500)
  pruefe((await s2.evaluate(() => document.documentElement.getAttribute('data-mantine-color-scheme'))) === 'dark', 'Darstellung folgt auf das zweite Gerät')
  await s2.screenshot({ path: join(out, '2-start-dunkel-telefon.png'), fullPage: true })
  await s.goto(`${A}/s/`)
  await s.waitForTimeout(1200)
  await s.screenshot({ path: join(out, '3-start-dunkel.png'), fullPage: true })

  // ---------- Mia: Passwort
  await s.goto(`${A}/s/einstellungen`)
  await s.locator('[data-pw-alt] input, input[data-pw-alt]').first().fill('falsch-falsch-1')
  await s.locator('[data-pw-neu] input, input[data-pw-neu]').first().fill('ZweitesPasswort-22')
  await s.locator('[data-pw-neu2] input, input[data-pw-neu2]').first().fill('ZweitesPasswort-22')
  await s.locator('[data-pw-speichern]').click()
  pruefe(await da(s.getByText('Das bisherige Passwort stimmt nicht.')), 'Falsches bisheriges Passwort wird abgelehnt')
  await s.locator('[data-pw-alt] input, input[data-pw-alt]').first().fill('ErstesPasswort-11')
  await s.locator('[data-pw-speichern]').click()
  pruefe(await da(s.locator('[data-passwort-ok]')), 'Schüler: Passwort geändert')
  // Das andere Gerät ist abgemeldet, dieses nicht
  const r2 = await sm2.request.get(`${A}/s/api/darstellung`, { headers: KOPF })
  const r1 = await sm.request.get(`${A}/s/api/darstellung`, { headers: KOPF })
  pruefe(r2.status() !== 200 && r1.status() === 200, `Andere Geräte abgemeldet, dieses bleibt angemeldet (${r2.status()}, ${r1.status()})`)
  const neuCtx = await browser.newContext()
  const login = await anmelden(neuCtx, mia.benutzer, 'ZweitesPasswort-22')
  pruefe(login.status() === 303 && !(login.headers().location ?? '').includes('fehler'), 'Anmeldung mit dem neuen Passwort')

  // ---------- Lehrkraft: Passwort in den Einstellungen
  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  await lk.request.post(`${A}/auth/passwort`, {
    form: { alt: lehrer.passwort, neu: 'LehrerPasswort-33', neu2: 'LehrerPasswort-33', ziel: '/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spaeter = p.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await p.locator('.app-leiste [aria-label="Einstellungen"]').click()
  await p.locator('[data-passwort-knopf]').click()
  await p.locator('[data-pw-alt] input, input[data-pw-alt]').first().fill('LehrerPasswort-33')
  await p.locator('[data-pw-neu] input, input[data-pw-neu]').first().fill('LehrerPasswort-44')
  await p.locator('[data-pw-neu2] input, input[data-pw-neu2]').first().fill('LehrerPasswort-44')
  await p.screenshot({ path: join(out, '4-lehrkraft-passwort.png') })
  await p.locator('[data-pw-speichern]').click()
  pruefe(await da(p.locator('[data-passwort-ok]')), 'Lehrkraft: Passwort geändert')
  const lk2 = await browser.newContext()
  const l2 = await anmelden(lk2, lehrer.benutzer, 'LehrerPasswort-44')
  pruefe(l2.status() === 303 && !(l2.headers().location ?? '').includes('fehler'), 'Lehrkraft: Anmeldung mit dem neuen Passwort')
  // Ohne Kopfzeile kein Ändern (Schutz vor untergeschobenen Formularen)
  const ohne = await lk.request.post(`${A}/konto/passwort`, { data: { alt: 'LehrerPasswort-44', neu: 'x'.repeat(12), neu2: 'x'.repeat(12) } })
  pruefe(ohne.status() === 403, `Ohne Kopfzeile abgelehnt (${ohne.status()})`)
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 8).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Konten samt Daten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
