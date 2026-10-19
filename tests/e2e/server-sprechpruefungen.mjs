// App „Sprechprüfungen" (19.10.2026, Organisation): Karten je Jahrgang im schulweiten Pool – ohne KI:
//  1. Lehrkraft öffnet die App, Jahrgang 7 › „Von Hand" eine Dialogkarte und ein Interview-Set anlegen.
//  2. Kachel zeigt die Ampel je Teil; Druckdialog für ein Prüfungsset.
//  3. Sprechtraining der Lernenden (Klasse 7…) nutzt die Pool-Karte des Jahrgangs.
//  4. Karte löschen.
// Aufruf: node tests/e2e/server-sprechpruefungen.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-sprechpruefungen')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `7p${Date.now() % 1000}`
const TITEL = `Planning a school trip ${Date.now() % 1000}`
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const kurse = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Paul Pool' } })).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Pia Probe' } })).json()
  const pia = liste.angelegt[0]
  for (const n of (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer ?? [])
    if (n.benutzer === pia.benutzer) zuLoeschen.push(n.id)
  lk = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const post = async (pfad, data) => (await lk.request.post(`${A}${pfad}`, { headers: KOPF, data })).json()

  // ---------- App öffnen
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  const knopf = p.locator('.app-leiste [aria-label="Sprechprüfungen"]').filter({ visible: true }).first()
  pruefe(await da(knopf), 'App „Sprechprüfungen" in der Leiste (Organisation)')
  await knopf.click()
  await p.locator('[data-sprechpruefungen]').filter({ visible: true }).first().waitFor()
  pruefe((await p.locator('[data-sprech-jahrgang-kachel]').count()) === 9, 'Englisch: Jahrgänge 5–13 als Kacheln')
  await p.screenshot({ path: join(out, '1-kacheln.png') })
  await p.locator('[data-sprech-jahrgang-kachel="7"]').click()
  await p.locator('[data-sprech-jahrgang="7"]').waitFor()

  // ---------- Von Hand: Dialogkarte
  await p.locator('[data-sprech-spalte="dialog"]').getByRole('button', { name: 'Von Hand' }).click()
  const dlg = p.getByRole('dialog')
  await dlg.getByLabel('Titel').fill(TITEL)
  await dlg.getByLabel('Situation (Text der Karte)').fill('Your class wants to go on a trip. Talk about the ideas and agree on one.')
  await dlg.getByLabel('Rolle Schüler/in').fill('You are a student.')
  await dlg.getByLabel(/Rolle der Partnerin/).fill('You are a classmate.')
  await dlg.getByLabel(/Punkte \/ Optionen/).fill('zoo\nmuseum\nbeach\nclimbing park')
  await dlg.getByLabel('Ziel').fill('Agree on one trip.')
  await dlg.locator('[data-sprechkarte-speichern]').click()
  pruefe(await da(p.locator('[data-sprech-spalte="dialog"] [data-sprechkarte="dialog"]', { hasText: TITEL })), 'Dialogkarte im Pool')
  // Interview-Set
  await p.locator('[data-sprech-spalte="interview"]').getByRole('button', { name: 'Von Hand' }).click()
  await p.getByRole('dialog').getByLabel('Thema').fill('Free time')
  await p.getByRole('dialog').getByLabel(/Fragen/).fill('What do you do after school?\nTell me about your hobby.\nWhy do you like it?\nWhat did you do last weekend?')
  await p.getByRole('dialog').locator('[data-sprechkarte-speichern]').click()
  pruefe(await da(p.locator('[data-sprech-spalte="interview"] [data-sprechkarte="interview"]')), 'Interview-Set im Pool')
  await p.screenshot({ path: join(out, '2-jahrgang.png'), fullPage: true })
  // Druckdialog
  await p.locator('[data-pruefungsset-knopf]').click()
  pruefe(await da(p.locator('[data-pruefungsset-drucken]')), 'Druckdialog für ein Prüfungsset')
  await p.keyboard.press('Escape')
  await p.getByRole('button', { name: 'Alle Jahrgänge' }).click()
  pruefe(await da(p.locator('[data-sprech-jahrgang-kachel="7"] [data-ampel="dialog:1"]')), 'Kachel: Ampel je Teil (Dialog 1)')

  // ---------- Training nutzt die Pool-Karte des Jahrgangs
  const g = await post('/server/lerngruppen/anlegen', { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` })
  const kurs = (await post('/server/vokabeln/freigeben', { lerngruppeId: g.id, titel: 'Unit 1', sprache: 'en', fach: 'Englisch', woerter: [{ id: 'w1', term: 'trip', translation: 'Ausflug' }] })).id
  kurse.push(kurs)
  await post('/server/sprechen/freigeben', { kurs, teile: ['dialog'], tage: 14, minutenWoche: 30, nurSchulzeit: false })
  const sm = await browser.newContext({ viewport: { width: 1100, height: 1000 } })
  await anmelden(sm, pia.benutzer, pia.passwort)
  await sm.request.post(`${A}/auth/passwort`, { form: { alt: pia.passwort, neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' }, headers: { origin: A }, maxRedirects: 0 })
  const s = await sm.newPage()
  await s.goto(`${A}/s/ordner/Englisch?r=sprech`)
  await s.locator('[data-sprech-ueben="dialog"]').click()
  await s.locator('[data-sprech-start]').click()
  pruefe(await da(s.locator('[data-sprech-karte]', { hasText: TITEL })), 'Training zeigt die Pool-Karte des Jahrgangs')
  await s.screenshot({ path: join(out, '3-training.png') })

  // ---------- Löschen
  await p.locator('[data-sprech-jahrgang-kachel="7"]').click()
  await p.locator('[data-sprech-spalte="dialog"] [data-sprechkarte="dialog"]', { hasText: TITEL }).getByRole('button', { name: 'Löschen' }).click()
  await p.waitForTimeout(600)
  pruefe((await p.locator('[data-sprech-spalte="dialog"] [data-sprechkarte="dialog"]', { hasText: TITEL }).count()) === 0, 'Karte gelöscht')
  // Aufräumen: Interview-Set
  for (const b of await p.locator('[data-sprech-spalte="interview"] [data-sprechkarte]').getByRole('button', { name: 'Löschen' }).all()) await b.click().catch(() => undefined)
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split(String.fromCharCode(10)).slice(0, 6).join(' | ')}`)
} finally {
  for (const k of kurse) if (lk) await lk.request.post(`${A}/server/vokabeln/${k}/loeschen`, { headers: KOPF, data: { klassenkurs: true } }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Kurse und Konten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
