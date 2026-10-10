// Verwaltung › „Schule & Daten" › Schule (10.10.2026) – OHNE KI.
//  - Befund der Lehrkraft: „Kreisgymnasium Wesermünde" gewählt → Sekretariats-E-Mail und Vorgabe-Logo kamen nicht.
//    Jetzt: Wahl aus dem Schulverzeichnis füllt leere Felder samt E-Mail, behält den eigenen längeren Namen und setzt
//    das Vorgabe-Logo, wenn noch keins hinterlegt ist (über POST /server/schule/logo).
//  - Alle Kästen einklappbar (Vorgabe zu) mit Statuszeile; offen/zu bleibt DAUERHAFT je Gerät – auch nach Neuladen und
//    in einer neuen Anmeldung mit demselben Browser-Speicher.
// Gespeichert wird das Formular nicht; das Logo der Schule wird am Ende auf den Stand vorher zurückgesetzt.
// Vorher: Server lokal (KI wird nicht gebraucht). Aufruf: node tests/e2e/server-schule.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-schule')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const da = (l, ms = 10000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const vorgabeLogo = `data:image/png;base64,${readFileSync(resolve('resources/schulen/logos/NI-67052.png')).toString('base64')}`
const KARTEN = ['verwaltung-schule', 'verwaltung-kontakt', 'verwaltung-logo', 'verwaltung-kalender', 'verwaltung-fachfarben']

const browser = await chromium.launch({ channel: 'msedge' })
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
const schuleAuf = async (ctx) => {
  const p = await ctx.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Schule & Daten"]').first().click()
  await p.getByRole('tab', { name: 'Schule', exact: true }).click()
  await p.locator('[data-klappkarte="verwaltung-schule"]').waitFor({ timeout: 10000 })
  await p.waitForTimeout(800)
  return p
}
const offen = async (p, id) => p.locator(`[data-klappkarte="${id}"]`).getAttribute('data-offen')

const ctx1 = await browser.newContext({ viewport: { width: 1400, height: 950 } })
let vorher = null
try {
  await anmelden(ctx1, admin.benutzer, admin.passwort)
  vorher = await (await ctx1.request.get(`${A}/server/schule`, { headers: KOPF })).json()
  // Ausgangslage: kein Logo – die Wahl soll es setzen
  await ctx1.request.post(`${A}/server/schule/logo`, { headers: KOPF, data: { logo: null } })

  const v = await schuleAuf(ctx1)
  // ---------- Kästen: alle zu, Statuszeile im Kopf
  for (const id of KARTEN) pruefe((await offen(v, id)) === 'false', `Kasten ${id} ist zu Beginn eingeklappt`)
  const kopfLogo = await v.locator('[data-klappkarte="verwaltung-logo"] [data-klappstatus]').innerText()
  pruefe(kopfLogo.includes('kein Logo'), `Statuszeile Schullogo: „${kopfLogo}"`)
  const kopfKal = await v.locator('[data-klappkarte="verwaltung-kalender"] [data-klappstatus]').innerText()
  pruefe(/Ferien|keine Daten/.test(kopfKal), `Statuszeile Schulkalender: „${kopfKal}"`)
  const kopfFarben = await v.locator('[data-klappkarte="verwaltung-fachfarben"] [data-klappstatus]').innerText()
  pruefe(/Fächer festgelegt|Vorschläge/.test(kopfFarben), `Statuszeile Fachfarben: „${kopfFarben}"`)
  await v.screenshot({ path: join(out, '1-kaesten-zu.png'), fullPage: true })

  // ---------- Schule wählen: „Kreisgymnasium Wesermünde"
  await v.locator('[data-klappkopf="verwaltung-schule"]').click()
  await v.locator('[data-klappkopf="verwaltung-kontakt"]').click()
  for (const f of ['strasse', 'plz', 'ort', 'telefon', 'email']) await v.locator(`[data-schule-feld="${f}"]`).fill('')
  const name = v.locator('[data-schulsuche="verwaltung"]')
  await name.fill('')
  await name.click()
  await name.fill('Kreisgymnasium Wesermünde')
  const option = v.getByRole('option').filter({ hasText: 'Gymnasium Wesermünde' }).first()
  pruefe(await da(option), 'Suche „Kreisgymnasium Wesermünde" schlägt das Gymnasium Wesermünde vor')
  await option.click()
  await v.waitForTimeout(1500)
  pruefe((await name.inputValue()) === 'Kreisgymnasium Wesermünde', `Eigener Name bleibt („${await name.inputValue()}")`)
  const email = await v.locator('[data-schule-feld="email"]').inputValue()
  pruefe(email === 'sekretariat@gywem.de', `E-Mail aus dem Verzeichnis gefüllt („${email}")`)
  const strasse = await v.locator('[data-schule-feld="strasse"]').inputValue()
  pruefe(strasse === 'Humboldtstraße 12-14', `Straße gefüllt („${strasse}")`)
  let logo = null
  for (let i = 0; i < 20 && logo !== vorgabeLogo; i++) {
    logo = (await (await ctx1.request.get(`${A}/server/schule`, { headers: KOPF })).json()).logo
    if (logo !== vorgabeLogo) await v.waitForTimeout(300)
  }
  pruefe(logo === vorgabeLogo, 'Vorgabe-Logo der Schule ist auf dem Server hinterlegt')
  pruefe(
    (await v.locator('[data-klappkarte="verwaltung-logo"] [data-klappstatus]').innerText()).includes('Logo hinterlegt'),
    'Statuszeile Schullogo: „Logo hinterlegt"'
  )
  const kopfSchule = await v.locator('[data-klappkarte="verwaltung-schule"] [data-klappstatus]').innerText()
  pruefe(kopfSchule.startsWith('Kreisgymnasium Wesermünde'), `Statuszeile Schule: „${kopfSchule}"`)
  await v.screenshot({ path: join(out, '2-gewaehlt.png'), fullPage: true })

  // ---------- Offen/zu bleibt: Neuladen und neue Anmeldung mit demselben Speicher
  await v.reload()
  await v.waitForTimeout(2000)
  await v.locator('.app-leiste [aria-label="Schule & Daten"]').first().click()
  await v.getByRole('tab', { name: 'Schule', exact: true }).click()
  await v.locator('[data-klappkarte="verwaltung-schule"]').waitFor({ timeout: 10000 })
  pruefe((await offen(v, 'verwaltung-schule')) === 'true' && (await offen(v, 'verwaltung-kontakt')) === 'true', 'Nach Neuladen: geöffnete Kästen bleiben offen')
  pruefe((await offen(v, 'verwaltung-logo')) === 'false', 'Nach Neuladen: der Logo-Kasten bleibt zu')
  const speicher = await ctx1.storageState()
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 950 }, storageState: speicher })
  // Neue Anmeldung = neue Sitzung (Kästen anderswo stehen dann wieder wie vorgegeben)
  await anmelden(ctx2, admin.benutzer, admin.passwort)
  const v2 = await schuleAuf(ctx2)
  pruefe((await offen(v2, 'verwaltung-schule')) === 'true', 'Neue Sitzung: Kasten „Schule" ist weiter offen')
  pruefe((await offen(v2, 'verwaltung-kontakt')) === 'true', 'Neue Sitzung: Kasten „Anschrift und Kontakt" ist weiter offen')
  pruefe((await offen(v2, 'verwaltung-logo')) === 'false', 'Neue Sitzung: Kasten „Schullogo" ist weiter zu')
  await v2.locator('[data-klappkopf="verwaltung-schule"]').click()
  await v2.waitForTimeout(300)
  await v2.reload()
  await v2.waitForTimeout(2000)
  await v2.locator('.app-leiste [aria-label="Schule & Daten"]').first().click()
  await v2.getByRole('tab', { name: 'Schule', exact: true }).click()
  await v2.locator('[data-klappkarte="verwaltung-schule"]').waitFor({ timeout: 10000 })
  pruefe((await offen(v2, 'verwaltung-schule')) === 'false', 'Zugeklappt bleibt ebenfalls zu')
  await v2.screenshot({ path: join(out, '3-neue-sitzung.png'), fullPage: true })
  await ctx2.close()
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 8).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  // Logo wie vorher; das Formular wurde nie gespeichert
  if (vorher) {
    await ctx1.request.post(`${A}/server/schule/logo`, { headers: KOPF, data: { logo: vorher.logo ?? null } }).catch(() => undefined)
    const nachher = await (await ctx1.request.get(`${A}/server/schule`, { headers: KOPF })).json()
    pruefe(JSON.stringify(nachher.schule) === JSON.stringify(vorher.schule) && nachher.logo === vorher.logo, 'Schule und Logo wie vorher')
  }
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nVerwaltung › Schule: Alles in Ordnung.')
