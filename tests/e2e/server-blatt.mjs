// Etappe 5 des Schülerbereichs (02.10.2026): Arbeitsblatt für Lernende freigeben und ausfüllen.
// Vorher: Server lokal mit KI-Attrappe („rueckmeldung_bogen", „blatt_aufgabe_feedback"), IServ NICHT eingerichtet.
// Vorlage: das jüngste echte Arbeitsblatt mit Aufgaben aus dem lokalen Profil (nur gelesen).
// Aufruf: node tests/e2e/server-blatt.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-blatt')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `6b${Date.now() % 1000}`

// Jüngstes Blatt mit mindestens zwei Aufgaben (Lücken oder Linien)
const ordner = join(process.env.APPDATA ?? '', 'schul-apps', 'arbeitsblaetter')
const vorlage = readdirSync(ordner)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => join(ordner, f))
  .sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)
  .map((f) => JSON.parse(readFileSync(f, 'utf8')))
  .find((w) => (w.payload?.sheets?.[0]?.blocks ?? []).filter((b) => b.type === 'task').length >= 2)

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
  const felder = await s.locator('[data-feld]').count()
  pruefe(felder >= 2, `Felder auf dem Blatt gemessen: ${felder}`)
  const texte = s.locator('input[data-feld], textarea[data-feld]')
  await texte.first().fill('My first answer')
  if ((await texte.count()) > 1) await texte.nth(1).fill('Second answer here')
  // Stift: eine Linie auf Seite 1
  await s.locator('[data-werkzeuge] label').nth(1).click()
  const c = await s.locator('[data-tinte="0"]').boundingBox()
  await s.mouse.move(c.x + 120, c.y + 300)
  await s.mouse.down()
  await s.mouse.move(c.x + 220, c.y + 320, { steps: 8 })
  await s.mouse.up()
  await s.locator('[data-werkzeuge] label').nth(0).click()
  await s.waitForTimeout(2600)
  const gespeichert = await (await sm.request.get(`${A}/s/api/blatt?id=${fr.id}`, { headers: KOPF })).json()
  pruefe(Object.values(gespeichert.antworten).includes('My first answer') && Boolean(gespeichert.tinte['0']), 'Zwischenstand samt Stift-Ebene gespeichert')
  // Feedback zu Aufgabe 1
  await s.locator('[data-aufgabe-pruefen="1"]').click()
  await s.locator('[data-aufgabe-pruefen-los]').click()
  pruefe(
    await s
      .getByText('Lücke 2 passt schon gut')
      .waitFor({ timeout: 30000 })
      .then(
        () => true,
        () => false
      ),
    'Kurzes Feedback zu Aufgabe 1'
  )
  await s.screenshot({ path: join(out, '2-ipad-blatt.png') })
  s.on('dialog', (d) => void d.accept())
  await s.locator('[data-blatt-einreichen]').click()
  pruefe(
    await s
      .locator('[data-blatt-bogen]')
      .waitFor({ timeout: 90000 })
      .then(
        () => true,
        () => false
      ),
    'Nach dem Einreichen: Feedback-Bogen'
  )
  await s.screenshot({ path: join(out, '3-ipad-bogen.png'), fullPage: true })

  // ---------- Gast am Telefon: Liste
  const g = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const gp = await g.newPage()
  await gp.goto(fr.link)
  await gp.locator('[data-gastname]').fill('Lina S.')
  await gp.getByRole('button', { name: 'Weiter' }).click()
  await gp.waitForURL(/\/s\/b\//, { timeout: 15000 })
  await gp.locator('[data-blatt-liste]').waitFor({ timeout: 20000 })
  pruefe(true, 'Gast am Telefon: Listenansicht')
  await gp.locator('[data-blatt-liste] input, [data-blatt-liste] textarea').first().fill('Guest answer')
  await gp.screenshot({ path: join(out, '4-telefon-liste.png'), fullPage: true })

  // ---------- Lehrkraft: Abgabe in der verknüpften Rückmeldung
  const detail = await (await lk.request.get(`${A}/server/blaetter/${fr.id}`, { headers: KOPF })).json()
  const abgabe = detail.abgaben.find((a) => a.name === 'Mia Probe')
  pruefe(abgabe?.eingereicht === 1 && Boolean(abgabe.fassungen?.[0]?.bogen), 'Lehrkraft sieht Mias Einreichung mit Bogen')
  const fb = (await (await lk.request.get(`${A}/server/feedback`, { headers: KOPF })).json()).freigaben
  pruefe(
    fb.some((f) => f.art === 'blatt' && f.abgaben === 1),
    'Verknüpfte Rückmeldung mit 1 Abgabe (Rückmeldungs-App)'
  )
  const miaAufgaben = (await (await sm.request.get(`${A}/s/api/aufgaben`, { headers: KOPF })).json()).aufgaben ?? []
  pruefe(miaAufgaben.length === 0, 'Die verknüpfte Rückmeldung erscheint nicht doppelt bei den Aufgaben der Lernenden')
  await lk.request.post(`${A}/server/blaetter/${fr.id}/loeschen`, { headers: KOPF, data: {} })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 8).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  const u = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json().catch(() => ({ nutzer: [] }))
  for (const n of u.nutzer ?? []) if (n.quelle === 'gast' && n.name === 'Lina S.') zuLoeschen.push(n.id)
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
