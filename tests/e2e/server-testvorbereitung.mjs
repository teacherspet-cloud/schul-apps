// Testvorbereitung der Lernenden (28.10.2026, abgestimmt mit der Lehrkraft): Ein Kurs mit Testtermin in 5 Tagen erscheint
// unter „Mein Fortschritt" als anstehender Test; der Klick führt zu „Für den Test üben" mit Bereitschaft und
// „Vokabeln für den Test üben", das den Trainer direkt mit einer Runde startet. Ein Kurs mit Termin in 20 Tagen erscheint
// (noch) nicht. Dazu: „Meine Klassen" zeigt den dreiteiligen Vokabelbalken.
// Vorher: Server lokal mit KI-Attrappe. Aufruf: node tests/e2e/server-testvorbereitung.mjs <Ausgabe> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-testvorbereitung')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `7t${Date.now() % 1000}`
const WOERTER = [
  { id: 'w1', term: 'weather', translation: 'Wetter' },
  { id: 'w2', term: 'sunny', translation: 'sonnig' },
  { id: 'w3', term: 'cloud', translation: 'Wolke' },
  { id: 'w4', term: 'rain', translation: 'Regen' }
]
const da = (l, ms = 15000) =>
  l
    .first()
    .waitFor({ timeout: ms })
    .then(() => true)
    .catch(() => false)

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Tina Termin' } })).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Ole Probe' } })).json()
  const ole = liste.angelegt[0]
  const u0 = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u0.nutzer ?? []) if (n.benutzer === ole.benutzer) zuLoeschen.push(n.id)

  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const gruppe = await (
    await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })
  ).json()
  const bald = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, {
      headers: KOPF,
      data: { lerngruppeId: gruppe.id, titel: 'Unit 2 Weather', sprache: 'en', fach: 'Englisch', woerter: WOERTER, testTermin: Date.now() + 5 * 86400000 }
    })
  ).json()
  const spaet = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, {
      headers: KOPF,
      data: {
        lerngruppeId: gruppe.id,
        titel: 'Unit 3 Food',
        sprache: 'fr',
        fach: 'Französisch',
        woerter: [{ id: 'f1', term: 'le pain', translation: 'das Brot' }],
        testTermin: Date.now() + 20 * 86400000
      }
    })
  ).json()
  pruefe(Boolean(bald.id && spaet.id), 'Zwei Kurse mit Testtermin (5 und 20 Tage) freigegeben')

  // ---------- Ole: Startseite → anstehender Test
  const so = await browser.newContext({ viewport: { width: 430, height: 900 }, hasTouch: true, isMobile: true })
  await anmelden(so, ole.benutzer, ole.passwort)
  await so.request.post(`${A}/auth/passwort`, { form: { neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' }, headers: { origin: A }, maxRedirects: 0 })
  const s = await so.newPage()
  s.on('dialog', (d) => void d.accept())
  await s.goto(`${A}/s/`)
  pruefe(await da(s.locator('[data-anstehende-tests]')), '„Mein Fortschritt" zeigt anstehende Tests')
  pruefe((await s.locator(`[data-anstehender-test="${bald.id}"]`).count()) === 1, 'Test in 5 Tagen steht da')
  pruefe((await s.locator(`[data-anstehender-test="${spaet.id}"]`).count()) === 0, 'Test in 20 Tagen steht (noch) nicht da')
  await s.locator('[data-mein-fortschritt]').screenshot({ path: join(out, '1-fortschritt.png') })
  await s.locator(`[data-anstehender-test="${bald.id}"]`).click()
  pruefe(await da(s.locator(`[data-testvorbereitung="${bald.id}"]`)), 'Klick führt zu „Für den Test üben"')
  pruefe(await da(s.locator('[data-test-vokabeln] [data-vokabel-balken]')), 'Vokabeln des Tests mit Balken')
  pruefe((await s.locator('[data-bereitschaft]').getAttribute('data-bereitschaft')) === '0', 'Bereitschaft anfangs 0 %')
  await s.screenshot({ path: join(out, '2-testvorbereitung.png'), fullPage: true })
  await s.locator('[data-test-vokabeln-ueben]').click()
  pruefe(await da(s.locator('[data-sitzung]')), '„Vokabeln für den Test üben" startet gleich eine Runde')
  pruefe(s.url().includes(`/s/v/${bald.id}`), `Im Trainer des Kurses (${s.url()})`)

  // ---------- Lehrkraft: Meine Klassen zeigt den dreiteiligen Balken
  const p = await lk.newPage()
  const r = await (await lk.request.get(`${A}/server/klassen/${gruppe.id}`, { headers: KOPF })).json()
  const zeile = (r.lernende ?? []).find((l) => l.name.startsWith('Ole'))
  pruefe(zeile?.vokabeln?.gesamt === WOERTER.length + 1, `Meine Klassen: Vokabelstand mit allen Wörtern (${JSON.stringify(zeile?.vokabeln)})`)
  await p.close()
} catch (e) {
  problems.push(String(e?.stack ?? e))
  console.log(e)
} finally {
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
console.log(problems.length ? `\n${problems.length} Problem(e)` : '\nAlles in Ordnung')
process.exit(problems.length ? 1 : 0)
