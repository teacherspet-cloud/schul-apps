// Schüler-Startseite mit Lernstand, Lerntipps und dynamischer Begrüßung; Einstellungen der Lernenden (06.10.2026).
// Vorher: Server lokal mit KI-Attrappe (Antwort für „schueler_lerntipp"), IServ NICHT eingerichtet. Keine echte KI.
// Aufruf: node tests/e2e/server-schuelerlernstand.mjs <Ausgabeordner> [adresse] [admin] [passwort]
//
// Geprüft:
//  - Jahrgang aus der Klasse (7… → Stufe 7–10, 3… → 1–4 mit Maskottchen und Sternen, Q1… → 11–13 mit Kurzstatistik)
//  - Begrüßung „neu" → nach Übung „erfolgreich, wenig aktiv" → mit Wochenziel 1 „erfolgreich und fleißig"
//  - genau ein Tipp mit Knopf („Jetzt 10 Vokabeln abfragen"), danach Wochenrückblick der KI (Attrappe), „Gelesen" → fester Tipp
//  - Lernstand: „Mein Lernraum" mit den neuesten Materialien, „Mein Fortschritt" mit Wochenleiste
//  - Einstellungen: Kacheln, „Gespeichert", Vorlesen-Knopf, Kontrast, lesefreundliche Schrift (nur Gerät), Lerntipps aus,
//    Spiele aus / ohne Zeitdruck wirken im Vokabeltraining
//  - zum Schluss alle Konten samt Daten gelöscht
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-schuelerlernstand')
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
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const WOERTER = Array.from({ length: 10 }, (_, i) => ({ id: `w${i}`, term: `word${i}`, translation: `Wort${i}` }))

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })

/** Konto aus einer Klassenliste, Lerngruppe, Vokabeln – dann erste Anmeldung mit Passwortwechsel */
async function lernende(klasse, vorname, lk) {
  const liste = await (await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse, namen: `${vorname} Probe` } })).json()
  const k = liste.angelegt[0]
  const u = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u.nutzer ?? []) if (n.benutzer === k.benutzer) zuLoeschen.push(n.id)
  const gruppe = await (
    await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: klasse, fach: 'Englisch', iservGruppe: `klasse:${klasse.toLowerCase()}` } })
  ).json()
  const vok = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, {
      headers: KOPF,
      data: { lerngruppeId: gruppe.id, schueler: [], titel: 'Unit 1 words', sprache: 'en', fach: 'Englisch', woerter: WOERTER }
    })
  ).json()
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1200 }, hasTouch: true })
  const p = await ctx.newPage()
  await p.goto(`${A}/anmelden?ziel=/s/&benutzer=${encodeURIComponent(k.benutzer)}`)
  await p.fill('#passwort', k.passwort)
  await p.click('form[action="/auth/lokal"] button[type=submit]')
  await p.waitForURL(/\/passwort/, { timeout: 15000 })
  await p.fill('#neu', 'Probe-Passwort-2026')
  await p.fill('#neu2', 'Probe-Passwort-2026')
  await p.click('button[type=submit]')
  await p.waitForURL(/\/s\/?$/, { timeout: 15000 })
  await p.locator('[data-begruessung]').waitFor({ timeout: 15000 })
  return { p, ctx, vok }
}
const zustand = async (p) => {
  await p.goto(`${A}/s/`)
  await p.locator('[data-tipp], [data-begruessung-text]').first().waitFor({ timeout: 15000 })
  await p.waitForTimeout(600)
  return p.locator('[data-begruessung]').getAttribute('data-begruessung')
}

try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea Testlehrerin' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const lk = await browser.newContext()
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)

  // ---------- Klasse 7: Stufe 7–10
  const { p, vok } = await lernende(`7l${N}`, 'Mia', lk)
  // Erster Besuch: fester Tipp (der Wochenrückblick der KI entsteht erst im Hintergrund)
  await p.locator('[data-tipp-knopf]').waitFor({ timeout: 15000 })
  const knopf = await p.locator('[data-tipp-knopf]').innerText()
  pruefe(/Jetzt 10 Vokabeln abfragen/.test(knopf), `Genau ein Tipp mit Knopf: „${knopf}"`)
  pruefe((await p.locator('[data-begruessung]').getAttribute('data-stufe')) === 'mittel', 'Klasse 7… → Stufe 7–10')
  pruefe((await zustand(p)) === 'neu', 'Ohne Übung: Begrüßung „neu"')
  pruefe(/Mia!/.test(await p.locator('[data-gruss]').innerText()), 'Begrüßung mit Vornamen')
  pruefe((await p.locator('[data-maskottchen]').count()) === 0, 'Kl. 7–10 ohne Maskottchen')
  pruefe((await p.locator('[data-tipp]').count()) === 1, 'Nur ein Tipp')
  // „Mein Lernraum" statt „Mein Stand" (08.10.2026): Link zum Lernraum und die neuesten Materialien
  pruefe(await da(p.locator('[data-mein-lernraum] [data-neues-material="vokabeln"]')), 'Mein Lernraum: Vokabeltraining unter den neuesten Materialien')
  pruefe((await p.locator('[data-stand-bereich]').count()) === 0, 'Keine Liste der Themenbereiche mehr')
  pruefe(await da(p.locator('[data-wochenleiste]')), 'Mein Fortschritt: Wochenleiste')
  const kacheln = await p.locator('[data-kachel]').evaluateAll((k) => k.map((x) => x.getAttribute('data-kachel')))
  pruefe(['tests', 'ergebnisse', 'aufgaben', 'blaetter', 'lernen'].every((k) => kacheln.includes(k)), `Kacheln bleiben (${kacheln.join(', ')})`)
  await p.screenshot({ path: join(out, '1-neu-kl7.png'), fullPage: true })

  // Üben (über die Schnittstelle des Trainers): 10 Lernkarten gewusst
  for (const w of WOERTER)
    await p.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id: vok.id, wortId: w.id, uebung: 'karte', gewusst: true } })
  const z2 = await zustand(p)
  pruefe(z2 === 'erfolgreich', `Nach einem Übungstag mit lauter Treffern: „erfolgreich, wenig aktiv" (${z2})`)
  // Der Wochenrückblick entsteht im Hintergrund (Attrappe) – beim nächsten Laden da
  let ki = false
  for (let i = 0; i < 10 && !ki; i++) {
    await p.waitForTimeout(800)
    await p.goto(`${A}/s/`)
    await p.locator('[data-tipp]').waitFor({ timeout: 10000 })
    ki = (await p.locator('[data-tipp]').getAttribute('data-tipp')) === 'ki'
  }
  pruefe(ki, 'Wochenrückblick der KI (Attrappe) erscheint')
  pruefe(/ohne Hinschauen/.test(await p.locator('[data-tipp-text]').innerText()), 'Text des Wochenrückblicks')
  pruefe(/Vokabeln/.test(await p.locator('[data-tipp-knopf]').innerText()), 'Wochenrückblick mit ausführbarem Knopf')
  await p.screenshot({ path: join(out, '2-wochenrueckblick.png'), fullPage: true })
  await p.locator('[data-tipp-gelesen]').click()
  await p.waitForTimeout(1200)
  pruefe((await p.locator('[data-tipp]').getAttribute('data-tipp')) === 'regel', '„Gelesen" → wieder der feste Tipp')

  // ---------- Einstellungen
  await p.goto(`${A}/s/einstellungen`)
  await p.locator('[data-schueler-einstellungen]').waitFor()
  // Seit 10.10.2026 sechs: dazu „Erinnerungen" (Web-Push) und „Titel" (Medaillen & Titel)
  pruefe((await p.locator('[data-bereich-kachel]').count()) === 6, 'Sechs Bereiche als Kacheln (mit Erinnerungen und Titel)')
  pruefe((await p.locator('[data-bereich-kachel="titel"]').count()) === 1, 'Kachel „Titel“ ist da')
  pruefe((await p.locator('[data-bereich-kachel="erinnerungen"]').count()) === 1, 'Kachel „Erinnerungen“ ist da')
  await p.locator('[data-bereich-kachel="lernen"]').click()
  await p.locator('[data-wochenziel]').getByText('1', { exact: true }).click()
  pruefe(await da(p.locator('[data-gespeichert="konto"]'), 5000), '„Gespeichert" nach Wochenziel 1')
  await p.locator('[data-kontrast]').click()
  await p.waitForTimeout(300)
  pruefe(await p.evaluate(() => document.documentElement.classList.contains('sa-kontrast')), 'Hoher Kontrast wirkt sofort')
  await p.locator('[data-leseschrift]').click()
  await p.waitForTimeout(300)
  pruefe(await p.evaluate(() => document.documentElement.classList.contains('sa-leseschrift')), 'Lesefreundliche Schrift wirkt sofort')
  pruefe(await da(p.locator('[data-gespeichert="geraet"]'), 5000), 'Lesefreundliche Schrift: „Gespeichert auf diesem Gerät"')
  await p.locator('[data-vorlesen]').click()
  pruefe(await da(p.locator('[data-vorlesen-knopf]'), 5000), 'Vorlesen-Knopf erscheint')
  await p.locator('[data-zeitdruck]').click()
  await p.waitForTimeout(800)
  await p.screenshot({ path: join(out, '3-einstellungen.png'), fullPage: true })
  const server = await (await p.request.get(`${A}/s/api/darstellung`, { headers: KOPF })).json()
  pruefe(
    server.darstellung?.kontrast === true && server.darstellung?.wochenziel === 1 && server.darstellung?.zeitdruck === false && !('leseschrift' in server.darstellung),
    'Server: Kontrast, Wochenziel, Zeitdruck gespeichert – lesefreundliche Schrift nicht'
  )
  const z3 = await zustand(p)
  pruefe(z3 === 'erfolgreich_fleissig', `Mit Wochenziel 1: „erfolgreich und fleißig" (${z3})`)
  pruefe(await da(p.locator('[data-wochenserie]'), 5000), 'Wochenziel erreicht: Wochenserie sichtbar')
  pruefe(await p.evaluate(() => document.documentElement.classList.contains('sa-kontrast')), 'Kontrast gilt auch auf der Startseite')
  await p.screenshot({ path: join(out, '4-erfolgreich-fleissig.png'), fullPage: true })

  // Spiele ohne Zeitdruck, dann Spiele aus (Vokabeltraining: heute alles erledigt → Spielauswahl)
  await p.goto(`${A}/s/v/${vok.id}`)
  pruefe(await da(p.locator('[data-spiel-wahl="memory"]')), 'Spiele nach dem Kasten (Memory)')
  pruefe((await p.locator('[data-spiel-wahl="blitz"], [data-spiel-wahl="fallend"]').count()) === 0, 'Ohne Zeitdruck: keine Blitzrunde, keine fallenden Wörter')
  await p.goto(`${A}/s/einstellungen`)
  await p.locator('[data-spiele]').click()
  await p.locator('[data-tipps]').click()
  await p.waitForTimeout(800)
  await p.goto(`${A}/s/v/${vok.id}`)
  pruefe(await da(p.locator('[data-spiele-aus]')), 'Spiele aus: Hinweis statt Spielauswahl')
  await p.goto(`${A}/s/`)
  await p.locator('[data-lernstand]').waitFor({ timeout: 15000 })
  pruefe((await p.locator('[data-tipp]').count()) === 0, 'Lerntipps aus: kein Tipp auf der Startseite')

  // ---------- Klasse 3: Maskottchen und Sterne
  const g = await lernende(`3g${N}`, 'Ella', lk)
  for (const w of WOERTER.slice(0, 9))
    await g.p.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id: g.vok.id, wortId: w.id, uebung: 'karte', gewusst: true } })
  await zustand(g.p)
  pruefe((await g.p.locator('[data-begruessung]').getAttribute('data-stufe')) === 'grund', 'Klasse 3… → Stufe 1–4')
  pruefe(await da(g.p.locator('[data-maskottchen]')), 'Kl. 1–4: Maskottchen')
  pruefe(await da(g.p.locator('[data-wochen-sterne]')), 'Kl. 1–4: Sterne für die Übungstage')
  pruefe(await da(g.p.locator('[data-mein-lernraum] [data-neues-material]')), 'Kl. 1–4: Mein Lernraum mit den neuesten Materialien')
  pruefe(!/\d+ von \d+ sicher/.test(await g.p.locator('[data-mein-stand]').innerText()), 'Kl. 1–4: keine Zahlen im Stand')
  await g.p.screenshot({ path: join(out, '5-kl3.png'), fullPage: true })

  // ---------- Q1: sachlich mit Kurzstatistik
  const o = await lernende(`Q1o${N}`, 'Jonas', lk)
  await zustand(o.p)
  pruefe((await o.p.locator('[data-begruessung]').getAttribute('data-stufe')) === 'ober', 'Q1… → Stufe 11–13')
  pruefe(await da(o.p.locator('[data-kurzstatistik]')), 'Kl. 11–13: Kurzstatistik')
  await o.p.screenshot({ path: join(out, '6-q1.png'), fullPage: true })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
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
  console.log(`\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
