// Grammatiktest als Onlinetest (05.10.2026; Lernzielkontrolle: derselbe Weg, tests/kernBlatt.test.ts): Knopf „Onlinetest" im Editor, derselbe Dialog wie beim
// Vokabeltest, Start durch die Lehrkraft, Lernende sehen Material-Karten und Aufgaben, Abgabe mit Punkten.
// Vorher: Server lokal mit KI-Attrappe („onlinetest_bewertung"), IServ NICHT eingerichtet.
// Vorlage: der jüngste Grammatiktest aus dem lokalen Profil (nur gelesen).
// Aufruf: node tests/e2e/server-onlinetest-grammatik.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-onlinetest-grammatik')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `8l${Date.now() % 1000}`
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const ordner = join(process.env.APPDATA ?? '', 'schul-apps', 'grammatiktests')
const vorlage = readdirSync(ordner)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => join(ordner, f))
  .sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)
  .map((f) => JSON.parse(readFileSync(f, 'utf8')))[0]

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  pruefe(Boolean(vorlage), `Vorlage: ${vorlage?.name}`)
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea Testlehrerin' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const { id: _id, name, createdAt: _c, updatedAt: _u, payload, ...stats } = vorlage
  await lk.request.post(`${A}/api`, { headers: KOPF, data: { channel: 'grammarTests:save', args: [{ id: 'gt-probe', name: 'GT-Probe', stats, payload }] } })
  await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: stats.subjectLabel || 'Englisch' } })
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await p.locator('.app-leiste [aria-label="Grammatiktest"]').click()
  await p.waitForTimeout(800)
  await p
    .getByRole('button', { name: /Meine Grammatiktests/ })
    .first()
    .click({ timeout: 5000 })
    .catch(() => undefined)
  await p.getByText('GT-Probe').first().click()
  await p.waitForTimeout(1500)
  await p.locator('.module-container:not([hidden])').getByText('Bearbeiten & Export').first().click()
  pruefe(await da(p.locator('[data-onlinetest-knopf]'), 30000), 'Grammatiktest hat den Knopf „Onlinetest"')
  await p.waitForTimeout(1500)
  await p.locator('[data-onlinetest-knopf]').click()
  const dlg = p.getByRole('dialog', { name: 'Als Onlinetest durchführen' })
  pruefe(await da(dlg), 'Dialog „Als Onlinetest durchführen" öffnet sich')
  await dlg.getByPlaceholder('wählen …').click()
  await p.getByRole('option', { name: KLASSE }).click()
  await dlg.getByLabel('auch Gäste mit Namen').check()
  await p.screenshot({ path: join(out, '1-dialog.png') })
  await dlg.getByRole('button', { name: 'Onlinetest erstellen' }).click()
  await dlg.waitFor({ state: 'hidden', timeout: 30000 })
  const liste = (await (await lk.request.get(`${A}/server/onlinetest`, { headers: KOPF })).json()).tests ?? []
  const t = liste.find((x) => x.art === 'Grammatiktest')
  pruefe(Boolean(t), `Onlinetest der Art „Grammatiktest" angelegt (${t?.titel})`)
  const detail = async () => (await lk.request.get(`${A}/server/onlinetest/${t.id}`, { headers: KOPF })).json()
  const d0 = await detail()
  const f0 = d0.fassungen[0]
  console.log('ARTEN', JSON.stringify(f0.aufgaben.map((a) => [a.art, a.titel, (a.html ?? '').length])))
  pruefe(f0.punkte > 0 && f0.aufgaben.some((a) => a.art === 'material'), `Fassung mit ${f0.punkte} Punkten und Material-Karten`)

  // ---------- Gast am iPad
  const s = await (await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true })).newPage()
  await s.goto(t.link ?? `${A}/s/t/${t.code}`)
  await s.locator('[data-gastname]').fill('Mia P.')
  await s.getByRole('button', { name: 'Weiter' }).click()
  await s.locator('[data-wartebildschirm]').waitFor({ timeout: 15000 })
  await lk.request.post(`${A}/server/onlinetest/${t.id}/status`, { headers: KOPF, data: { status: 'starten' } })
  pruefe(await da(s.locator('[data-material-karte]').first(), 15000), 'Lernende sehen das Material wie auf dem Blatt')
  const quelltext = await s.evaluate(
    async (code) =>
      JSON.stringify(
        await (
          await fetch('/s/api/beitreten', {
            method: 'POST',
            headers: { 'x-schulapps-token': 'server', 'content-type': 'application/json' },
            body: JSON.stringify({ code })
          })
        ).json()
      ),
    t.code
  )
  pruefe(!quelltext.includes('"loesungen"') && !quelltext.includes('"erwartung"'), 'Das Gerät bekommt keine Lösungen')
  const felder = s.locator('input:not([type=radio]):not([type=hidden]), textarea')
  const n = await felder.count()
  pruefe(n > 0, `Eingabefelder: ${n}`)
  for (let i = 0; i < Math.min(n, 4); i++) await felder.nth(i).fill(`Antwort ${i + 1}`)
  await s.waitForTimeout(2600)
  await s.screenshot({ path: join(out, '2-test.png'), fullPage: true })
  s.once('dialog', (x) => void x.accept())
  await s.getByRole('button', { name: 'Abgeben' }).click()
  pruefe(await da(s.locator('[data-ergebnis-wartet], [data-ergebnis]').first(), 15000), 'Abgegeben')
  const d1 = await detail()
  const mia = d1.teilnahmen.find((x) => x.name === 'Mia P.')
  pruefe(Boolean(mia?.abgabe) && mia.max === f0.punkte, `Teilnahme mit Wertung (${mia?.punkte}/${mia?.max})`)
  await lk.request.post(`${A}/server/onlinetest/${t.id}/loeschen`, { headers: KOPF, data: {} }).catch(() => undefined)
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  const u = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json().catch(() => ({}))
  for (const n of u.nutzer ?? []) if (n.quelle === 'gast' && n.name === 'Mia P.') zuLoeschen.push(n.id)
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
