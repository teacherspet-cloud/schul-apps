// Auswertung freigegebener Blätter (05.10.2026): farbiger Knopf je Person (korrekt + eigenständig), Pop-up,
// gleiche Abgaben je Aufgabe, Mitarbeitsvorschlag mit Strenge (KI-Attrappe „blatt_mitarbeit"), Hilfestellungen.
// Vorher: Server lokal mit KI-Attrappe („blatt_aufgabe_feedback", „blatt_mitarbeit"), IServ NICHT eingerichtet.
// Aufruf: node tests/e2e/server-blatt-auswertung.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-blatt-auswertung')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `9a${Date.now() % 1000}`
const ANTWORT = 'The neighbourhood changes because rents rise and new shops replace the old markets.'
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )

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

/** Eine Person öffnet das Blatt, schreibt in Aufgabe 1 (getippt oder eingefügt) und holt Feedback */
async function bearbeiten(konto, tippen) {
  const c = await browser.newContext({ viewport: { width: 1180, height: 1000 } })
  await anmelden(c, konto.benutzer, konto.passwort)
  await c.request.post(`${A}/auth/passwort`, {
    form: { alt: konto.passwort, neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  const s = await c.newPage()
  await s.goto(`${A}/s/`)
  await s.locator('[data-kachel="blaetter"]').click()
  await s.locator('[data-blatt-oeffnen]').first().click()
  await s.locator('[data-feld]').first().waitFor({ timeout: 20000 })
  await s.waitForTimeout(800)
  const feld = s.locator('input[data-feld], textarea[data-feld]').first()
  if (tippen) {
    await feld.click()
    await s.keyboard.type(ANTWORT, { delay: 230 })
  } else await feld.fill(ANTWORT)
  await s.locator('[data-aufgabe-pruefen="1"]').click()
  await s.locator('[data-aufgabe-pruefen-los]').click()
  await s.locator('[data-ampel-nr="1"][data-ampel="gelb"]').waitFor({ timeout: 30000 })
  await s.waitForTimeout(2500)
  // Fortschrittsbalken der Lernenden (05.10.2026): eine Aufgabe teilweise
  await s.goto(`${A}/s/blaetter`)
  const balken = await s
    .locator('[data-fortschritt] [data-teil="yellow"][data-wert="1"]')
    .waitFor({ timeout: 10000 })
    .then(
      () => true,
      () => false
    )
  pruefe(balken, `${konto.name ?? konto.benutzer}: Balken zeigt 1 Aufgabe teilweise`)
  await c.close()
}

try {
  pruefe(Boolean(vorlage), `Vorlage: ${vorlage?.name}`)
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea Testlehrerin' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Mia Probe\nTim Test' } })
  ).json()
  const u0 = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u0.nutzer ?? []) if (liste.angelegt.some((a) => a.benutzer === n.benutzer)) zuLoeschen.push(n.id)
  const mia = liste.angelegt.find((a) => /Mia/.test(a.name ?? '')) ?? liste.angelegt[0]
  const tim = liste.angelegt.find((a) => a !== mia)

  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  await lk.request.post(`${A}/api`, {
    headers: KOPF,
    data: { channel: 'sheets:save', args: [{ id: 'blatt-auswertung', name: 'Blatt-Auswertung', stats: { sheetCount: 1 }, payload: vorlage.payload }] }
  })
  await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Freigegebene Blätter"]').click()
  await p.locator('[data-blatt-waehlen-knopf]').click()
  await p.locator('[data-blatt-wahl="Blatt-Auswertung"]').click()
  const dlg = p.getByRole('dialog', { name: 'Arbeitsblatt für Lernende freigeben' })
  await dlg.getByPlaceholder('wählen …').click()
  await p.getByRole('option', { name: KLASSE }).click()
  await dlg.locator('[data-blatt-freigeben]').click()
  await dlg.waitFor({ state: 'hidden', timeout: 20000 })

  await bearbeiten(mia, true)
  await bearbeiten(tim, false)

  // Fortschrittsbalken der Lehrkraft: beide in Arbeit (orange), keiner eingereicht
  // Das Fenster kommt wieder nach vorn → die Liste lädt neu
  await p.evaluate(() => window.dispatchEvent(new Event('focus')))
  pruefe(await da(p.locator('[data-freigabe] [data-fortschritt] [data-teil="orange"][data-wert="2"]')), 'Balken der Freigabe: 2 in Arbeit (orange)')
  await p.screenshot({ path: join(out, '0-balken.png') })
  await p.locator('[data-freigabe-oeffnen]').first().click()
  pruefe(await da(p.locator('[data-auswertung-knopf]').nth(1)), 'Je Person ein Auswertungsknopf')
  const wert = async (name) => Number(await p.locator(`[data-auswertung-knopf="${name}"]`).getAttribute('data-wert'))
  const wm = await wert(mia.name ?? 'Mia Probe')
  const wt = await wert(tim.name ?? 'Tim Test')
  pruefe(wm > wt, `Getippt bewertet besser als eingefügt (Mia ${wm.toFixed(2)} > Tim ${wt.toFixed(2)})`)
  await p.screenshot({ path: join(out, '1-liste.png') })
  // Gleiche Abgaben
  await p.locator('[data-gleiche-abgaben]').click()
  pruefe(await da(p.locator('[data-gleich-aufgabe="1"]').filter({ hasText: 'Gleich' })), 'Gleiche Abgaben: Aufgabe 1 nennt beide')
  await p.screenshot({ path: join(out, '2-gleiche.png') })
  await p.keyboard.press('Escape')
  // Pop-up einer Person
  await p.locator(`[data-auswertung-knopf="${tim.name ?? 'Tim Test'}"]`).click()
  const modal = p.locator('.mantine-Modal-content', { hasText: 'Auswertung –' })
  pruefe(await da(modal.getByText(/auf einmal eingefügt/)), 'Pop-up nennt „auf einmal eingefügt"')
  pruefe((await modal.getByText(/Gleich wie/).count()) > 0, 'Pop-up nennt die gleiche Abgabe')
  await p.screenshot({ path: join(out, '3-popup.png') })
  await p.keyboard.press('Escape')
  await p.waitForTimeout(300)
  // Mitarbeit einschätzen (streng), Hilfestellungen
  await p.locator('[data-strenge]').getByText('Streng').click()
  await p.locator('[data-mitarbeit-einschaetzen]').click()
  // Läuft als Auftrag in der Auftragsleiste (09.10.2026) – die Leiste ist anfangs eingeklappt (je Sitzung): aufklappen
  await p.locator('.auftrags-pille').click({ timeout: 10000 })
  pruefe(await da(p.locator('[data-auftrag]').filter({ hasText: 'Mitarbeit' }).first(), 10000), 'Einschätzung erscheint als Auftrag in der Warteschlange')
  await p.getByRole('button', { name: 'Aufträge einklappen' }).click().catch(() => undefined)
  pruefe(
    await da(p.locator(`[data-auswertung-knopf="${mia.name ?? 'Mia Probe'}"]`, { hasText: 'Mitarbeit +' }), 30000),
    'Mitarbeitsvorschlag steht auf dem Knopf'
  )
  await p.locator('[data-hilfen-uebersicht]').click()
  pruefe(await da(p.locator('[data-hilfen-zeile]').nth(1)), 'Hilfestellungen: eine Zeile je Person')
  await p.screenshot({ path: join(out, '4-hilfen.png') })
  await p.keyboard.press('Escape')
  const fr = ((await (await lk.request.get(`${A}/server/blaetter`, { headers: KOPF })).json()).blaetter ?? [])[0]
  const aw = await (await lk.request.get(`${A}/server/blaetter/${fr.id}/auswertung`, { headers: KOPF })).json()
  pruefe(aw.strenge === 'streng' && Object.keys(aw.mitarbeit ?? {}).length === 2, `Vorschläge gespeichert (Strenge ${aw.strenge})`)
  await lk.request.post(`${A}/server/blaetter/${fr.id}/loeschen`, { headers: KOPF, data: {} })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
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
