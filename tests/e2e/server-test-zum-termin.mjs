// Test zum Termin (28.10.2026, abgestimmt mit der Lehrkraft): Startseite „Termine & Vokabeltraining" › Demnächst › Klick
// auf den Vokabeltest-Termin eines Kurses: Fenster mit „Vorhandenen Test wählen" (passende zuerst, Vorschau) und
// „Test erstellen lassen". Ein gewählter Test wird verknüpft und öffnet sich danach per Klick; „⋯" ändert bzw. löst.
// „Test erstellen lassen" › Vokabeltest öffnet die App mit den Wörtern der Termin-Abschnitte.
// Vorher: Server lokal mit KI-Attrappe. Aufruf: node tests/e2e/server-test-zum-termin.mjs <Ausgabe> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-test-zum-termin')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `6z${Date.now() % 1000}`
const WOERTER = [
  { id: 'w1', term: 'weather', translation: 'Wetter' },
  { id: 'w2', term: 'sunny', translation: 'sonnig' },
  { id: 'w3', term: 'cloud', translation: 'Wolke' }
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
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Tom Termin' } })).json()
  zuLoeschen.push(lehrer.id)
  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const gruppe = await (
    await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })
  ).json()
  const kurs = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, {
      headers: KOPF,
      data: { lerngruppeId: gruppe.id, titel: 'Unit 2 Weather', sprache: 'en', fach: 'Englisch', woerter: WOERTER, testTermin: Date.now() + 4 * 86400000 }
    })
  ).json()
  const inhalt = await (await lk.request.get(`${A}/server/vokabeln/${kurs.id}/testinhalt`, { headers: KOPF })).json()
  pruefe(inhalt.woerter?.length === 3, `Inhalt des Termins: drei Wörter (${inhalt.woerter?.length})`)

  const p = await lk.newPage()
  p.on('dialog', (d) => void d.accept())
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spat = p.getByRole('button', { name: 'Später einrichten' })
  if (await spat.isVisible().catch(() => false)) await spat.click()
  // Einen vorhandenen Vokabeltest anlegen (wie die App beim Sichern)
  const testId = await p.evaluate(async () => {
    const meta = await window.api.tests.save({
      id: `t${Date.now().toString(36)}`,
      name: 'Unit 2 Weather – Test',
      stats: { vocabCount: 3, taskCount: 0, hasTest: false, variantCount: 0, totalPoints: 0 },
      payload: { vocab: [{ id: 'a', term: 'weather', translation: 'Wetter' }], settings: {}, doc: null }
    })
    return meta.id
  })
  await p.reload()
  await p.waitForTimeout(2000)
  // Kasten „Termine & Vokabeltraining" aufklappen
  const kasten = p.locator('[data-start-kasten="termine"], [data-start-termine]').first()
  const kopf = p.locator('[data-klappkopf="start-termine"]')
  if ((await kopf.count()) && (await kopf.getAttribute('aria-expanded')) === 'false') await kopf.click()
  const termin = p.locator('[data-start-demnaechst="test"]').first()
  pruefe(await da(termin), 'Demnächst: Vokabeltest-Termin steht da')
  pruefe(await da(p.locator('[data-termin-test="offen"]'), 3000), 'Termin ohne Test: „Test wählen"')
  await termin.click()
  pruefe(await da(p.locator('[data-test-modus]')), 'Klick öffnet „Test zum Termin"')
  pruefe(await da(p.locator(`[data-test-kandidat="${testId}"]`)), 'Vorhandener Vokabeltest in der Liste')
  pruefe((await p.getByText('Passend zum Termin').count()) > 0, 'Passender Test steht unter „Passend zum Termin"')
  await p.locator(`[data-test-kandidat="${testId}"]`).click()
  pruefe(await da(p.locator('[data-test-vorschau-inhalt]')), 'Vorschau zeigt den Inhalt')
  await p.screenshot({ path: join(out, '1-waehlen.png') })
  await p.locator('[data-test-waehlen]').click()
  pruefe(await da(p.locator('[data-termin-test="verknuepft"]')), 'Nach dem Wählen: „Test öffnen"')
  const st = await (await lk.request.get(`${A}/server/vokabeln/${kurs.id}`, { headers: KOPF })).json()
  pruefe(st.testAbschnitte?.material?.docId === testId, 'Verknüpfung am Kurs gespeichert')
  // Klick öffnet den Test
  await p.locator('[data-start-demnaechst="test"]').first().click()
  await p.waitForTimeout(3000)
  const felder = () => p.evaluate(() => [...document.querySelectorAll('input, textarea')].map((i) => i.value))
  pruefe((await felder()).includes('Unit 2 Weather – Test'), 'Klick öffnet den verknüpften Vokabeltest')
  await p.screenshot({ path: join(out, '1b-geoeffnet.png') })

  // „⋯" › Verknüpfung lösen, dann „Test erstellen lassen"
  await p.goto(A)
  await p.waitForTimeout(2000)
  if ((await kopf.count()) && (await kopf.getAttribute('aria-expanded')) === 'false') await kopf.click()
  await p.locator('[data-termin-aendern]').first().click()
  await p.locator('[data-test-loesen]').click()
  pruefe(await da(p.locator('[data-termin-test="offen"]')), 'Verknüpfung gelöst')
  await p.locator('[data-start-demnaechst="test"]').first().click()
  await p.locator('[data-test-modus]').getByText('Test erstellen lassen').click()
  pruefe(await da(p.locator('[data-test-erstellen]')), '„Test erstellen lassen" zeigt die Auswahl')
  pruefe((await p.locator('[data-test-app]').count()) >= 2, 'Vokabeltest und Onlinetest zur Wahl')
  await p.screenshot({ path: join(out, '2-erstellen.png') })
  await p.locator('[data-test-erstellen-los]').click()
  await p.waitForTimeout(3000)
  const werte = await felder()
  const woerter = ['weather', 'sunny', 'cloud'].every((w) => werte.includes(w))
  pruefe(woerter, 'Vokabeltest-App mit den Wörtern des Termins geöffnet')
  await p.screenshot({ path: join(out, '3-vokabeltest.png') })
  const st2 = await (await lk.request.get(`${A}/server/vokabeln/${kurs.id}`, { headers: KOPF })).json()
  pruefe(st2.testAbschnitte?.material?.moduleId === 'vokabeltest' && st2.testAbschnitte.material.docId !== testId, 'Neuer Test gleich mit dem Termin verknüpft')
  void kasten
} catch (e) {
  problems.push(String(e?.stack ?? e))
  console.log(e)
} finally {
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
console.log(problems.length ? `\n${problems.length} Problem(e)` : '\nAlles in Ordnung')
process.exit(problems.length ? 1 : 0)
