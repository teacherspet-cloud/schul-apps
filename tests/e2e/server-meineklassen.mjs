// „Meine Klassen" (06.10.2026, abgestimmt): Lerngruppen als „5b – Englisch" alphabetisch, Lernstand, Handlungsbedarf,
// Vorschlag „Wackelige Wörter" ansehen und freischalten. Ohne KI (das Übungsblatt wird nur angeboten, nicht erzeugt).
// Vorher: Server lokal, IServ NICHT eingerichtet.
// Aufruf: node tests/e2e/server-meineklassen.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-meineklassen')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const N = Date.now() % 1000
const K5 = `5k${N}`
const K10 = `10k${N}`
const WOERTER = ['weather', 'sunny', 'cloud', 'rain', 'wind', 'snow', 'storm'].map((t, i) => ({
  id: `w${i}`,
  term: t,
  translation: ['Wetter', 'sonnig', 'Wolke', 'Regen', 'Wind', 'Schnee', 'Sturm'][i]
}))
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Kai Klasse' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: K5, namen: 'Mia Probe\nBen Test' } })
  ).json()
  for (const n of (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer)
    if (liste.angelegt.some((a) => a.benutzer === n.benutzer)) zuLoeschen.push(n.id)
  const lk = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const neu = async (name, fach) =>
    (await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name, fach, iservGruppe: `klasse:${name}` } })).json()
  const g10 = await neu(K10, 'Englisch')
  const gGe = await neu(K5, 'Geschichte')
  const gEn = await neu(K5, 'Englisch')
  void g10
  void gGe
  const vok = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, {
      headers: KOPF,
      data: { lerngruppeId: gEn.id, titel: 'Weather', sprache: 'en', fach: 'Englisch', woerter: WOERTER }
    })
  ).json()
  // Mia übt: alle Wörter kennengelernt, fünf davon dreimal falsch geschrieben → wackelig
  const mia = liste.angelegt[0]
  const sm = await browser.newContext()
  await anmelden(sm, mia.benutzer, mia.passwort)
  await sm.request.post(`${A}/auth/passwort`, {
    form: { neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  for (const w of WOERTER)
    await sm.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id: vok.id, wortId: w.id, uebung: 'karte', gewusst: true } })
  for (const w of WOERTER.slice(0, 5))
    for (let i = 0; i < 3; i++)
      await sm.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id: vok.id, wortId: w.id, uebung: 'frei', antwort: 'xyz' } })

  // ---------- Schnittstelle
  const uebersicht = await (await lk.request.get(`${A}/server/klassen`, { headers: KOPF })).json()
  const titel = uebersicht.klassen.map((k) => k.titel)
  pruefe(
    JSON.stringify(titel) === JSON.stringify([`${K5} – Englisch`, `${K5} – Geschichte`, `${K10} – Englisch`]),
    `Alphabetisch, Klasse – Fach (${titel.join(' · ')})`
  )
  const d = await (await lk.request.get(`${A}/server/klassen/${gEn.id}`, { headers: KOPF })).json()
  pruefe(d.lernende.length === 2 && d.lernende.some((l) => l.vokabelnSicher !== null), `Lernende mit Lernstand (${d.lernende.length})`)
  pruefe(d.wackelig.length >= 5, `Wackelige Wörter der Klasse (${d.wackelig.length})`)
  pruefe(
    d.bedarf.some((b) => b.art === 'inaktiv' || b.art === 'foerdern'),
    `Handlungsbedarf erkannt (${d.bedarf.map((b) => b.art).join(', ')})`
  )
  pruefe(
    d.vorschlaege.some((v) => v.art === 'vokabeln'),
    'Vorschlag: Vokabeltraining „Wackelige Wörter“'
  )

  // ---------- Oberfläche
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await p.locator('.app-leiste [aria-label="Meine Klassen"]').click()
  await p.locator('[data-klassen-liste]').waitFor({ timeout: 10000 })
  const karten = await p.locator('[data-klasse]').evaluateAll((e) => e.map((x) => x.getAttribute('data-klasse')))
  pruefe(karten[0] === `${K5} – Englisch` && karten.length === 3, `Karten in der App (${karten.join(' · ')})`)
  await p.screenshot({ path: join(out, '1-uebersicht.png') })
  await p.locator(`[data-klasse="${K5} – Englisch"]`).click()
  await p.locator('[data-handlungsbedarf]').waitFor({ timeout: 10000 })
  pruefe((await p.locator('[data-bedarf]').count()) >= 1, 'Handlungsbedarf oben')
  pruefe(await p.locator('[data-lernende-tabelle]').isVisible(), 'Lernende mit Vokabeln, Tests, Blättern')
  await p.screenshot({ path: join(out, '2-klasse.png'), fullPage: true })
  await p.locator('[data-vorschlag="vokabeln"] [data-vorschlag-ansehen]').click()
  await p.locator('[data-vokabeln-freischalten]').click()
  pruefe(await da(p.getByText(/ist für .* freigeschaltet/), 8000), 'Vorschlag nach Sichtung freigeschaltet')
  const vt = await (await lk.request.get(`${A}/server/vokabeln`, { headers: KOPF })).json()
  const neuVt = (vt.zuweisungen ?? vt.liste ?? []).find((z) => /Wackelige Wörter/.test(z.titel))
  pruefe(Boolean(neuVt), `Neues Vokabeltraining „${neuVt?.titel}“ für die Klasse`)
  for (const z of vt.zuweisungen ?? vt.liste ?? []) await lk.request.post(`${A}/server/vokabeln/${z.id}/loeschen`, { headers: KOPF, data: {} })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
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
