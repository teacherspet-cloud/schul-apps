// Druckfassung freigegebener Blätter (03.10.2026): Text in den Linien, Korrekturrand mit Kommentaren, Druckdialog.
// Etappe 5 des Schülerbereichs (02.10.2026): Arbeitsblatt für Lernende freigeben und ausfüllen.
// Vorher: Server lokal mit KI-Attrappe („rueckmeldung_bogen", „blatt_aufgabe_feedback"), IServ NICHT eingerichtet.
// Vorlage: das jüngste echte Arbeitsblatt mit Aufgaben aus dem lokalen Profil (nur gelesen).
// Aufruf: node tests/e2e/server-blatt.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-blatt-druck')
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
const KLASSE = `6b${Date.now() % 1000}`

// Jüngstes Blatt mit mindestens zwei Aufgaben (Lücken oder Linien)
const ordner = join(process.env.APPDATA ?? '', 'schul-apps', 'arbeitsblaetter')
const vorlage = readdirSync(ordner)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => join(ordner, f))
  .sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)
  .map((f) => JSON.parse(readFileSync(f, 'utf8')))
  .find((w) => w.id === '0vyazzx' || (w.payload?.sheets?.[0]?.blocks ?? []).filter((b) => b.type === 'task').length >= 2)

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
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Mia Probe' } })
  ).json()
  const mia = liste.angelegt[0]
  const u0 = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u0.nutzer ?? []) if (n.benutzer === mia.benutzer) zuLoeschen.push(n.id)

  // ---------- Lehrkraft: Blatt ablegen, Lerngruppe, Freigabe über die Oberfläche
  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  await lk.request.post(`${A}/api`, {
    headers: KOPF,
    data: { channel: 'sheets:save', args: [{ id: 'blatt-probe', name: 'Blatt-Probe', stats: { sheetCount: 1 }, payload: vorlage.payload }] }
  })
  await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spaeter = p.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await p.locator('.app-leiste [aria-label="Arbeitsblatt"]').click()
  await p
    .getByRole('button', { name: /Meine Arbeitsblätter/ })
    .first()
    .click({ timeout: 4000 })
    .catch(() => undefined)
  await p.mouse.move(800, 700)
  await p.waitForTimeout(500)
  await p.locator('[data-bibliothek-eintrag="Blatt-Probe"]').click()
  await p.locator('[data-blatt-freigeben-knopf]').waitFor({ timeout: 30000 })
  await p.waitForTimeout(2500)
  await p.locator('[data-blatt-freigeben-knopf]').click()
  await p.getByRole('dialog').getByPlaceholder('wählen …').click()
  await p.getByRole('option', { name: KLASSE }).click()
  await p.locator('[data-blatt-gaeste]').check()
  await p.screenshot({ path: join(out, '1-freigabe.png') })
  await p.locator('[data-blatt-freigeben]').click()
  const qr = await p
    .getByText('Code für die Lernenden')
    .waitFor({ timeout: 20000 })
    .then(
      () => true,
      () => false
    )
  pruefe(qr, 'Freigegeben, QR-Code für Gäste erscheint')
  const freigaben = (await (await lk.request.get(`${A}/server/blaetter`, { headers: KOPF })).json()).blaetter
  const fr = freigaben[0]
  pruefe(Boolean(fr?.id && fr.link), `Freigabe in der Liste (${fr?.titel})`)

  // Keine Lösungen im Schülerblatt
  const sm = await browser.newContext({ viewport: { width: 1024, height: 1366 }, hasTouch: true })
  await anmelden(sm, mia.benutzer, mia.passwort)
  await sm.request.post(`${A}/auth/passwort`, {
    form: { alt: mia.passwort, neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  const roh = await (await sm.request.get(`${A}/s/api/blatt?id=${fr.id}`, { headers: KOPF })).json()
  const loesung = vorlage.payload.sheets[0].blocks.find((b) => b.type === 'task' && b.solution && b.solution.length > 25)?.solution
  pruefe(!roh.erwartung && !roh.aufgaben && (!loesung || !roh.html.includes(loesung.slice(0, 25))), 'Schülerblatt enthält keine Lösungen/Erwartungen')

  // ---------- Mia am iPad: auf dem Blatt ausfüllen
  const s = await sm.newPage()
  await s.goto(`${A}/s/`)
  await s.locator('[data-kachel="blaetter"]').click()
  await s.locator('[data-blatt-oeffnen]').first().click()
  await s.locator('[data-feld]').first().waitFor({ timeout: 20000 })
  const t = s.locator('textarea[data-feld]').first()
  await t.click()
  const TEXT =
    'Der Erste Weltkrieg veraenderte sich nicht durch ein einzelnes Ereignis. 1914 scheiterte der deutsche Vormarsch an der Marne. Im Westen begann ein Stellungskrieg. Befestigte Linien erschwerten die Bewegung. Bei Verdun fuehrte dies zu extremen Verlusten. 1917 veraenderten die Februarrevolution und der Kriegseintritt der USA die Kraefteverhaeltnisse. 1918 brach die deutsche Widerstandskraft bei Amiens.'
  await s.keyboard.type(TEXT, { delay: 1 })
  await s.waitForTimeout(1200)
  const breite = await t.evaluate((x) => x.getBoundingClientRect().width)
  pruefe(breite < 560, `Schreiblinien schmaler (Korrekturrand), Feldbreite ${Math.round(breite)} px`)
  // Feedback zu Aufgabe 1 (Attrappe: Markierungen mit Korrekturzeichen)
  await s.locator('[data-aufgabe-pruefen="1"]').click()
  await s.locator('[data-aufgabe-pruefen-los]').click()
  await s.waitForTimeout(3000)
  await s.keyboard.press('Escape')
  await s.mouse.click(5, 300)
  const rand = s.locator('[data-rand-kommentar]')
  pruefe(await da(rand.first()), `Randkommentare im Korrekturrand (${await rand.count()})`)
  if (await rand.count()) {
    const lage = await rand.first().evaluate((el) => el.getBoundingClientRect())
    const feld = await t.evaluate((el) => el.getBoundingClientRect())
    pruefe(lage.left >= feld.right - 2, 'Kommentar steht rechts neben dem Schülertext, nicht darüber')
  }
  await t.scrollIntoViewIfNeeded()
  await s.screenshot({ path: join(out, '1-rand.png') })
  // PDF: Druckfassung abfangen und selbst rendern
  let html = ''
  await s.route('**/s/api/blatt/pdf', async (r) => {
    html = JSON.parse(r.request().postData() ?? '{}').html ?? ''
    await r.continue()
  })
  const dl = s.waitForEvent('download', { timeout: 60000 })
  await s.locator('[data-blatt-speichern]').click()
  const datei = await dl
  await datei.saveAs(join(out, 'blatt.pdf'))
  pruefe(
    html.includes('veraenderte') && !/position:absolute;left:\d+(\.\d+)?px;top:\d+/.test(html),
    'Druckfassung: Text im Fluss, keine Ebene mit Seitenkoordinaten'
  )
  // Drucken: Druckrahmen statt neuem Fenster mit blob-Adresse
  const seiten = sm.pages().length
  // Der Rahmen verschwindet nach dem Druckdialog wieder – deshalb sein Erscheinen mitschreiben
  await s.evaluate(() => {
    window.__druckrahmen = false
    new MutationObserver(() => {
      if (document.querySelector('iframe[data-druckrahmen]')) window.__druckrahmen = true
    }).observe(document.body, { childList: true })
  })
  await s.locator('[data-blatt-drucken]').click()
  const gedruckt = await s
    .waitForFunction(() => window.__druckrahmen === true, null, { timeout: 20000 })
    .then(
      () => true,
      () => false
    )
  pruefe(gedruckt, 'Drucken öffnet den Druckdialog (Druckrahmen), kein neues Fenster')
  pruefe(sm.pages().length === seiten, 'Kein zusätzliches Fenster')
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
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
