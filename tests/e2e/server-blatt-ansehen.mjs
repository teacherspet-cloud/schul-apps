// „Freigegebene Blätter“ › Freigabe öffnen › „Blatt ansehen“ (27.10.2026, Befund der Lehrkraft: nach kurzer Zeit „Die Seite ist
// hängen geblieben – Minified React error #185“, also eine Endlosschleife von Zustandsänderungen). Der Test stellt den Weg
// nach und wartet, bis ein solcher Fehler aufgetreten wäre.
// Vorher: Server lokal mit KI-Attrappe. Vorlage: jüngstes Arbeitsblatt mit Aufgaben aus dem lokalen Profil (nur gelesen).
// Aufruf: node tests/e2e/server-blatt-ansehen.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-blatt-ansehen')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `8a${Date.now() % 1000}`

const ordner = join(process.env.APPDATA ?? '', 'schul-apps', 'arbeitsblaetter')
const vorlage = readdirSync(ordner)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => join(ordner, f))
  .sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)
  .map((f) => JSON.parse(readFileSync(f, 'utf8')))
  .find((w) => (w.payload?.sheets?.[0]?.blocks ?? []).some((b) => b.type === 'task'))

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  pruefe(Boolean(vorlage), `Vorlage: ${vorlage?.name}`)
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea Ansicht' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Mia Ansicht' } })
  ).json()
  const mia = liste.angelegt[0]
  const u0 = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u0.nutzer ?? []) if (n.benutzer === mia.benutzer) zuLoeschen.push(n.id)

  // ---------- Lehrkraft gibt das Blatt frei
  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  await lk.request.post(`${A}/api`, {
    headers: KOPF,
    data: { channel: 'sheets:save', args: [{ id: 'blatt-ansehen', name: 'Blatt-Ansehen', stats: { sheetCount: 1 }, payload: vorlage.payload }] }
  })
  await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })
  const p = await lk.newPage()
  const seitenfehler = []
  p.on('pageerror', (e) => seitenfehler.push(e.message.slice(0, 200)))
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Freigegebene Blätter"]').click()
  await p.locator('[data-blatt-waehlen-knopf]').click()
  await p.locator('[data-blatt-wahl="Blatt-Ansehen"]').click()
  const dlg = p.getByRole('dialog', { name: 'Arbeitsblatt für Lernende freigeben' })
  await dlg.getByPlaceholder('wählen …').click()
  await p.getByRole('option', { name: KLASSE }).click()
  await dlg.locator('[data-blatt-freigeben]').click()
  let fr = null
  for (let i = 0; i < 40 && !fr; i++) {
    await p.waitForTimeout(500)
    fr = ((await (await lk.request.get(`${A}/server/blaetter`, { headers: KOPF })).json()).blaetter ?? [])[0] ?? null
  }
  await p.keyboard.press('Escape')
  await dlg.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined)
  pruefe(Boolean(fr), 'Freigabe angelegt')

  // ---------- Mia öffnet das Blatt (damit „Blatt ansehen“ etwas zeigt)
  const sm = await browser.newContext({ viewport: { width: 1180, height: 1000 } })
  await anmelden(sm, mia.benutzer, mia.passwort)
  await sm.request.post(`${A}/auth/passwort`, {
    form: { alt: mia.passwort, neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  const s = await sm.newPage()
  await s.goto(`${A}/s/`)
  await s.locator('[data-kachel="blaetter"]').click()
  await s.locator('[data-blatt-oeffnen]').first().click()
  await s.locator('[data-feld]').first().waitFor({ timeout: 20000 })
  await s.waitForTimeout(800)
  // Sehr langer Text: die Schreiblinien wachsen bis zur Obergrenze (60) mit – dort hing die Lehrkraft-Ansicht (27.10.2026)
  const lang = Array.from({ length: 90 }, (_, i) => `Zeile ${i + 1}: Das ist ein ziemlich langer Satz, der die Schreiblinie füllt und umbricht.`).join('\n')
  const feld = s.locator('textarea[data-feld], [data-feld] textarea').first()
  pruefe((await feld.count()) > 0, 'Ein Schreibfeld ist da')
  if (await feld.count()) await feld.fill(lang)
  await s.waitForTimeout(3500)
  pruefe(true, 'Mia hat das Blatt begonnen (langer Text)')

  // ---------- Lehrkraft: Freigabe öffnen, „Blatt ansehen“, dann abwarten
  await p.reload()
  await p.waitForTimeout(2500)
  await p.locator('.app-leiste [aria-label="Freigegebene Blätter"]').click()
  await p.locator('[data-freigabe-oeffnen]').first().click()
  await p.locator('[data-freigabe-detail]').waitFor({ timeout: 15000 })
  const ansehen = p.locator('[data-blatt-ansehen]:not([disabled])').first()
  pruefe(
    await ansehen.waitFor({ timeout: 20000 }).then(
      () => true,
      () => false
    ),
    'Knopf „Blatt ansehen“ ist anklickbar'
  )
  await ansehen.click()
  await p.locator('[data-blatt-lehrkraft-zurueck]').waitFor({ timeout: 20000 })
  pruefe(true, 'Blatt der Lernenden erscheint')
  await p.screenshot({ path: join(out, '1-ansehen.png') })
  // 20 Sekunden abwarten – die Endlosschleife brauchte „eine Weile“
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(1000)
    if (
      await p
        .getByText('Die Seite ist hängen geblieben')
        .isVisible()
        .catch(() => false)
    )
      break
  }
  const haengt = await p
    .getByText('Die Seite ist hängen geblieben')
    .isVisible()
    .catch(() => false)
  pruefe(!haengt, 'Nach 20 s keine Fehlerseite „Die Seite ist hängen geblieben“')
  pruefe(
    !seitenfehler.some((f) => /error #185|Maximum update depth/i.test(f)),
    `Kein React-Fehler #185 (${seitenfehler.length} Seitenfehler: ${seitenfehler.slice(0, 2).join(' | ')})`
  )
  await p.screenshot({ path: join(out, '2-nach-20s.png') })
  await p
    .locator('[data-blatt-lehrkraft-zurueck]')
    .click()
    .catch(() => undefined)
} catch (e) {
  problems.push(`Abbruch: ${e.message}`)
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
