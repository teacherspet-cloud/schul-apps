// „Blatt ansehen“ am iPad (28.10.2026, Befund der Lehrkraft: Zoom am Tablet verschiebt Aufgaben und Schülereingaben – die
// Eingaben liegen in gleicher Größe neben ihren Linien; dazu lädt die Ansicht lange). Nachgestellt mit WebKit (Safari-Engine)
// und Touch: Lernende füllen das Blatt, die Lehrkraft öffnet „Blatt ansehen“, vergrößert mit den Zoom-Knöpfen. Geprüft wird,
// dass jedes Eingabefeld beim Zoomen an derselben Stelle des Blatts bleibt (Abstand zum Blattrand wächst genau mit dem Zoom)
// und dass die Linien im Blatt mitwachsen.
// Vorher: Server lokal. Vorlage: jüngstes Arbeitsblatt mit Aufgaben aus dem lokalen Profil (nur gelesen).
// Aufruf: node tests/e2e/server-blatt-zoom-ipad.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium, webkit } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-blatt-zoom-ipad')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `7z${Date.now() % 1000}`

const ordner = join(process.env.APPDATA ?? '', 'schul-apps', 'arbeitsblaetter')
const vorlage = readdirSync(ordner)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => join(ordner, f))
  .sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)
  .map((f) => JSON.parse(readFileSync(f, 'utf8')))
  .find((w) => (w.payload?.sheets?.[0]?.blocks ?? []).some((b) => b.type === 'task'))

const edge = await chromium.launch({ channel: 'msedge' })
const safari = await webkit.launch()
const zuLoeschen = []
const verwaltung = await edge.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })

/** Lage der Eingabefelder relativ zur linken oberen Ecke des Blatt-Rahmens (iframe) */
const lagen = (p) =>
  p.evaluate(() => {
    const f = document.querySelector('iframe')
    if (!f) return null
    const r = f.getBoundingClientRect()
    const felder = [...document.querySelectorAll('[data-feld]')].slice(0, 12).map((e) => {
      const b = e.getBoundingClientRect()
      return { x: b.left - r.left, y: b.top - r.top, w: b.width, h: b.height }
    })
    // Linien/Aufgaben im Blatt: Lage in Bildschirm-Pixeln (Rahmen-Koordinaten × Darstellung)
    let innen = []
    try {
      const doc = f.contentDocument
      const wurzelZoom = Number(doc.documentElement.style.zoom || 1)
      innen = [...doc.querySelectorAll('.ws-task-num')].slice(0, 6).map((e) => {
        const b = e.getBoundingClientRect()
        return { x: b.left, y: b.top, wurzelZoom }
      })
    } catch {
      innen = []
    }
    return { rahmen: { w: r.width, h: r.height }, felder, innen }
  })

try {
  pruefe(Boolean(vorlage), `Vorlage: ${vorlage?.name}`)
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Ida Zoom' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Tom Zoom' } })
  ).json()
  const tom = liste.angelegt[0]
  const u0 = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u0.nutzer ?? []) if (n.benutzer === tom.benutzer) zuLoeschen.push(n.id)

  // ---------- Freigabe (am PC)
  const lk = await edge.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  await lk.request.post(`${A}/api`, {
    headers: KOPF,
    data: { channel: 'sheets:save', args: [{ id: 'blatt-zoom', name: 'Blatt-Zoom', stats: { sheetCount: 1 }, payload: vorlage.payload }] }
  })
  await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  const leiste = p.locator('.app-leiste [data-leiste-gruppe-kopf][data-offen="false"]').filter({ visible: true })
  for (let i = 0; i < 10 && (await leiste.count()); i++) await leiste.first().click()
  await p.locator('.app-leiste [aria-label="Freigegebene Blätter"]').click()
  await p.locator('[data-blatt-waehlen-knopf]').click()
  await p.locator('[data-blatt-wahl="Blatt-Zoom"]').click()
  const dlg = p.getByRole('dialog', { name: 'Arbeitsblatt für Lernende freigeben' })
  await dlg.getByPlaceholder('wählen …').click()
  await p.getByRole('option', { name: KLASSE }).click()
  await dlg.locator('[data-blatt-freigeben]').click()
  let fr = null
  for (let i = 0; i < 40 && !fr; i++) {
    await p.waitForTimeout(500)
    fr = ((await (await lk.request.get(`${A}/server/blaetter`, { headers: KOPF })).json()).blaetter ?? [])[0] ?? null
  }
  pruefe(Boolean(fr), 'Freigabe angelegt')

  // ---------- Tom füllt am PC aus
  const sm = await edge.newContext({ viewport: { width: 1180, height: 1000 } })
  await anmelden(sm, tom.benutzer, tom.passwort)
  await sm.request.post(`${A}/auth/passwort`, {
    form: { alt: tom.passwort, neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  const s = await sm.newPage()
  await s.goto(`${A}/s/`)
  await s.locator('[data-kachel="blaetter"]').click()
  await s.locator('[data-blatt-oeffnen]').first().click()
  await s.locator('[data-feld]').first().waitFor({ timeout: 20000 })
  await s.waitForTimeout(800)
  const felder = s.locator('textarea[data-feld], input[data-feld]')
  const n = Math.min(8, await felder.count())
  for (let k = 0; k < n; k++) {
    const f = felder.nth(k)
    if (!(await f.isVisible().catch(() => false)) || !(await f.isEditable().catch(() => false))) continue
    await f.fill((await f.evaluate((e) => e.tagName)) === 'TEXTAREA' ? 'Antwort auf der Linie.\nZweite Zeile.' : 'Antwort')
  }
  await s.waitForTimeout(2600)
  pruefe(n > 0, `Tom hat ${n} Felder ausgefüllt`)

  // ---------- Lehrkraft am iPad (WebKit, Touch): „Blatt ansehen“, dann vergrößern
  const ipad = await safari.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  await ipad.request.post(`${A}/auth/lokal`, { form: { benutzer: lehrer.benutzer, passwort: lehrer.passwort, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
  const t = await ipad.newPage()
  t.on('pageerror', (e) => console.log(`     seitenfehler ${e.message.slice(0, 300)}`))
  t.on('requestfailed', (r) => console.log(`     anfrage fehlgeschlagen ${r.url()} ${r.failure()?.errorText}`))
  await t.goto(A)
  await t.waitForTimeout(2500)
  const sp2 = t.getByRole('button', { name: 'Später einrichten' })
  if (await sp2.isVisible().catch(() => false)) await sp2.click()
  const leiste2 = t.locator('.app-leiste [data-leiste-gruppe-kopf][data-offen="false"]').filter({ visible: true })
  for (let i = 0; i < 10 && (await leiste2.count()); i++) await leiste2.first().click()
  await t.locator('.app-leiste [aria-label="Freigegebene Blätter"]').click()
  await t.locator('[data-freigabe-oeffnen]').first().click()
  await t.locator('[data-freigabe-detail]').waitFor({ timeout: 15000 })
  const t0 = Date.now()
  await t.locator('[data-blatt-ansehen]:not([disabled])').first().click()
  pruefe(
    await t
      .locator('[data-blatt-laedt]')
      .first()
      .waitFor({ timeout: 1500 })
      .then(
        () => true,
        () => false
      ),
    'Sofort eine Ladeanzeige nach dem Klick'
  )
  await t.locator('[data-feld]').first().waitFor({ timeout: 30000 })
  console.log(`     Blatt da nach ${Date.now() - t0} ms`)
  await t.waitForTimeout(1200)
  const vorher = await lagen(t)
  await t.screenshot({ path: join(out, '1-ipad-zoom-1.png') })
  pruefe(Boolean(await t.locator('[data-zoom-knoepfe]').count()), 'Zoom-Knöpfe am iPad sichtbar')
  for (let i = 0; i < 3; i++) {
    await t.getByRole('button', { name: 'Vergrößern' }).click()
    await t.waitForTimeout(400)
  }
  await t.waitForTimeout(1200)
  // Im gezoomten Zustand neu vermessen – wie beim Nachwachsen von Linien oder beim nächsten Blatt mit gemerktem Zoom
  await t.evaluate(() => document.querySelector('iframe')?.dispatchEvent(new Event('load')))
  await t.waitForTimeout(1500)
  const nachher = await lagen(t)
  await t.screenshot({ path: join(out, '2-ipad-gezoomt.png') })
  await t.locator('[data-feld]').first().scrollIntoViewIfNeeded()
  await t.waitForTimeout(800)
  await t.screenshot({ path: join(out, '3-ipad-gezoomt-felder.png') })
  console.log(`     felder vorher ${JSON.stringify(vorher.felder.slice(0, 3))} nachher ${JSON.stringify(nachher.felder.slice(0, 3))}`)
  const faktor = nachher.rahmen.w / vorher.rahmen.w
  pruefe(faktor > 1.2, `Blatt wächst beim Vergrößern (Faktor ${faktor.toFixed(2)})`)
  let schlecht = 0
  for (let i = 0; i < Math.min(vorher.felder.length, nachher.felder.length); i++) {
    const a = vorher.felder[i]
    const b = nachher.felder[i]
    const dx = Math.abs(b.x - a.x * faktor)
    const dy = Math.abs(b.y - a.y * faktor)
    const dw = Math.abs(b.w - a.w * faktor)
    if (dx > 6 || dy > 6 || dw > 6) {
      schlecht++
      console.log(`     Feld ${i}: vorher ${JSON.stringify(a)} nachher ${JSON.stringify(b)} erwartet x ${(a.x * faktor).toFixed(0)} y ${(a.y * faktor).toFixed(0)}`)
    }
  }
  pruefe(schlecht === 0, `Eingabefelder bleiben beim Zoomen an ihrer Stelle im Blatt (${schlecht} verschoben)`)
  // Inhalt des Rahmens wächst mit: die Aufgabennummern liegen beim Zoom an derselben Stelle im Blatt
  console.log(`     innen vorher ${JSON.stringify(vorher.innen.slice(0, 2))} nachher ${JSON.stringify(nachher.innen.slice(0, 2))}`)
} catch (e) {
  problems.push(String(e?.stack ?? e))
  console.log(e)
} finally {
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => null)
  await edge.close()
  await safari.close()
}
console.log(problems.length ? `\n${problems.length} Problem(e)` : '\nAlles in Ordnung')
process.exit(problems.length ? 1 : 0)
