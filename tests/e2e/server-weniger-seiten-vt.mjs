// „Auf weniger Seiten" im Vokabeltest (23.10.2026): echter Test aus dem lokalen Profil (nur gelesen) mit 4 Fassungen und
// großer Schrift (15 pt). Der Knopf misst unsichtbar, „Übernehmen" setzt „höchstens N Seiten" – alle Fassungen gleich.
// Ohne KI. Aufruf: node tests/e2e/server-weniger-seiten-vt.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-weniger-seiten-vt')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const ordner = join(process.env.APPDATA ?? '', 'schul-apps', 'vokabeltests')
const vorlage = readdirSync(ordner)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => join(ordner, f))
  .sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)
  .map((f) => JSON.parse(readFileSync(f, 'utf8')))
  .find((t) => (t.payload?.doc?.variants?.length ?? 0) >= 2)
const payload = structuredClone(vorlage.payload)
payload.doc.fontSize = Number(process.env.PT ?? 15)
payload.doc.settings.pageLimit = { mode: 'auto', pages: 2 }
const { id: _i, name: _n, createdAt: _c, updatedAt: _u, payload: _p, ...stats } = vorlage

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  pruefe(Boolean(vorlage), `Vorlage: ${vorlage?.name} (${payload.doc.variants.length} Fassungen)`)
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea Seiten' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const r = await lk.request.post(`${A}/api`, {
    headers: KOPF,
    data: { channel: 'tests:save', args: [{ id: 'vt-seiten', name: 'VT-Seiten', stats, payload }] }
  })
  pruefe(r.ok(), `Test abgelegt (${r.status()})`)
  const p = await lk.newPage()
  p.on('pageerror', (e) => console.log('SEITENFEHLER', e.message.slice(0, 300)))
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spaeter = p.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Vokabeltest"]').click()
  await p
    .getByRole('button', { name: /Meine Vokabeltests/ })
    .first()
    .click({ timeout: 4000 })
    .catch(() => undefined)
  await p.mouse.move(800, 700)
  await p.waitForTimeout(500)
  await p.locator('[data-bibliothek-eintrag="VT-Seiten"]').click()
  const knopf = p.locator('[data-weniger-seiten]')
  pruefe(
    await knopf.waitFor({ timeout: 30000 }).then(
      () => true,
      () => false
    ),
    'Knopf „Auf weniger Seiten“ da'
  )
  await p.waitForTimeout(2000)
  await knopf.click()
  const vorschlag = p.locator('[data-weniger-seiten-vorschlag]')
  const nicht = p.locator('[data-weniger-seiten-nicht]')
  await Promise.race([vorschlag.waitFor({ timeout: 60000 }), nicht.waitFor({ timeout: 60000 })]).catch(() => undefined)
  const text = (await vorschlag.innerText().catch(() => '')) || (await nicht.innerText().catch(() => ''))
  console.log(text.split('\n').filter(Boolean).join(' | '))
  await p.screenshot({ path: join(out, '1-dialog.png') })
  pruefe(await vorschlag.isVisible(), 'Vorschlag bei 15 pt')
  const pt = /Schrift [\d,]+ → ([\d,]+) pt/.exec(text)
  pruefe(!pt || Number(pt[1].replace(',', '.')) >= 10, `Schrift nicht unter 10 pt (${pt?.[1] ?? 'unverändert'})`)
  if (await vorschlag.isVisible()) {
    const soll = Number(/passt auf (\d+)/.exec(text)?.[1])
    await p.locator('[data-weniger-seiten-uebernehmen]').click()
    await p.waitForTimeout(3000)
    const gespeichert = await (await lk.request.post(`${A}/api`, { headers: KOPF, data: { channel: 'tests:get', args: ['vt-seiten'] } })).json()
    const limit = gespeichert.value?.payload?.doc?.settings?.pageLimit
    pruefe(limit?.mode === 'max' && limit.pages === soll, `Vorgabe gespeichert: ${JSON.stringify(limit)}`)
  }
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
} finally {
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
