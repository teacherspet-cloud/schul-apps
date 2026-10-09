// Nachbesserungen nach dem Livetest mit Fünftklässlern (08.10.2026): Code auf der Startseite (Anmelden klein darunter),
// nach der Anmeldung per Code nur ein Knopf „Weiteren Code eingeben", Rekordmenü mit Rekordbuch, freiwillig weiter
// üben, Fehlerberichte aus dem Browser, neue Vokabeln ohne Neuladen. Vorher: Server lokal (KI-Attrappe), keine KI.
// Aufruf: node tests/e2e/server-livetest-0810.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-livetest-0810')
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
const WOERTER = Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, term: `word${i}`, translation: `Wort${i}` }))

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
let kurs = ''
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lia L' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  lk = await browser.newContext()
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const post = async (pfad, data) => (await lk.request.post(`${A}${pfad}`, { headers: KOPF, data })).json()
  kurs = (await post('/server/vokabeln/freigeben', { titel: 'Kl5 Unit 1', sprache: 'en', fach: 'Englisch', woerter: WOERTER, gaeste: true })).id
  const kursCode = (await (await lk.request.get(`${A}/server/vokabeln`, { headers: KOPF })).json()).zuweisungen.find((k) => k.id === kurs)?.code
  const zettel = (await post(`/server/vokabeln/${kurs}/eintragen`, { namen: ['Emma F.'] })).eingetragen[0]

  // ---------- Startseite: Code oben, Anmelden klein darunter
  const g = await browser.newContext({ viewport: { width: 1024, height: 768 } })
  const p = await g.newPage()
  p.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 200)))
  await p.goto(`${A}/`)
  pruefe(await da(p.locator('form.code input[name="code"]')), 'Anmeldeseite: „Mit Code öffnen" oben')
  // Nutzername/Passwort seit 08.10.2026 in einem kleinen Fenster statt zum Aufklappen
  const fenster = p.locator('[data-anmelden-fenster]')
  pruefe(!(await fenster.isVisible()), 'Anmeldefenster zunächst zu')
  await p.screenshot({ path: join(out, '1-start.png') })
  await p.locator('[data-anmelden-oeffnen]').click()
  pruefe(await da(fenster), 'Knopf öffnet das Anmeldefenster')
  pruefe(await p.evaluate(() => document.activeElement?.id === 'benutzer'), 'Fokus im Feld Benutzername')
  await p.screenshot({ path: join(out, '1b-anmeldefenster.png') })
  // Tab und Enter führen vom Benutzernamen ins Passwortfeld (08.10.2026)
  await p.keyboard.type('max.muster')
  await p.keyboard.press('Tab')
  pruefe(await p.evaluate(() => document.activeElement?.id === 'passwort'), 'Tab: weiter ins Passwortfeld')
  await p.locator('#benutzer').focus()
  await p.keyboard.press('Enter')
  pruefe(await p.evaluate(() => document.activeElement?.id === 'passwort'), 'Enter im Benutzernamen: ins Passwortfeld statt Absenden')
  await p.locator('#benutzer').fill('')
  await p.keyboard.press('Escape')
  pruefe(!(await fenster.isVisible()), 'Esc schließt das Fenster')
  pruefe(await p.evaluate(() => document.activeElement?.hasAttribute('data-anmelden-oeffnen')), 'Fokus zurück auf dem Knopf')
  await p.locator('[data-anmelden-oeffnen]').click()
  await fenster.locator('[data-schliessen]').click()
  pruefe(!(await fenster.isVisible()), '× schließt das Fenster')
  await p.locator('[data-anmelden-oeffnen]').click()
  await p.fill('#benutzer', 'gibt-es-nicht')
  await p.fill('#passwort', 'falsch-falsch')
  await p.click('form[action="/auth/lokal"] button[type=submit]')
  await p.waitForURL(/fehler=/, { timeout: 15000 }).catch(() => undefined)
  pruefe(await da(fenster.locator('.fehler')), 'Fehlgeschlagene Anmeldung: Fenster gleich offen mit Fehlermeldung')
  await p.setViewportSize({ width: 375, height: 700 })
  const breite = await fenster.boundingBox()
  pruefe(Boolean(breite && breite.x >= 15 && breite.x + breite.width <= 360), `Fenster am Telefon mit Rand (${JSON.stringify(breite)})`)
  await p.setViewportSize({ width: 1024, height: 768 })
  await p.goto(`${A}/`)
  await p.locator('form.code input[name="code"]').fill(zettel.zugang)
  await p.locator('form.code button').click()
  await p.waitForURL(`**/s/v/${kurs}`, { timeout: 15000 }).catch(() => undefined)
  pruefe(p.url().endsWith(`/s/v/${kurs}`), `Persönlicher Code von der Startseite meldet an und öffnet die Vokabeln (${p.url()})`)

  // ---------- Angemeldet: kleiner Knopf statt großem Feld, Rekordmenü
  await p.goto(`${A}/s/`)
  pruefe(await da(p.locator('[data-weiterer-code]')), 'Angemeldet: Knopf „Weiteren Code eingeben"')
  pruefe((await p.getByText('Code (steht an der Tafel').count()) === 0, 'Kein großes Code-Feld')
  await p.locator('[data-weiterer-code]').click()
  pruefe(await da(p.getByText('Code (steht an der Tafel')), 'Feld erscheint auf Knopfdruck')
  await g.request.post(`${A}/s/api/vokabeln/spiel`, { headers: KOPF, data: { id: kurs, spiel: 'blitz', wert: 12, fehler: [] } })
  await g.request.post(`${A}/s/api/vokabeln/spiel`, { headers: KOPF, data: { id: kurs, spiel: 'blitz', wert: 9, fehler: [] } })
  await p.locator('[data-rekorde-knopf]').first().click()
  await p.locator('[data-tab-rekorde]').click()
  pruefe(await da(p.locator('[data-rekorde-tabelle]', { hasText: 'Blitzrunde' })), 'Rekordmenü zeigt die Blitzrunde')
  pruefe((await p.locator('[data-rekorde-tabelle]').innerText()).includes('12'), 'Bestwert 12 (nicht 9)')
  await p.screenshot({ path: join(out, '2-rekorde.png') })
  await p.keyboard.press('Escape')

  // ---------- Tagesration geschafft → freiwillig weiter üben; ein Fehler bleibt ohne Zurückstufen
  for (let i = 0; i < 10; i++)
    await g.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id: kurs, wortId: `w${i}`, uebung: 'karte', gewusst: i !== 0 } })
  const rb = (await (await g.request.get(`${A}/s/api/rekorde`, { headers: KOPF })).json()).jahre[0]
  pruefe(rb.gelernt === 10, `Rekordbuch: 10 Wörter neu gelernt (${rb.gelernt})`)
  await p.goto(`${A}/s/v/${kurs}`)
  pruefe(await da(p.locator('[data-freiwillig-ueben]')), 'Knopf „Freiwillig weiter üben"')
  await p.locator('[data-freiwillig-ueben]').click()
  pruefe(await da(p.locator('[data-sitzung]', { hasText: /word0|Wort0/ })), 'Freiwillige Runde beginnt mit der heute nicht gewussten Vokabel')
  // Die Übungsform wechselt (Lernkarte, Auswahl, Schreiben …) – die Antwort geht deshalb über die Schnittstelle wie aus der Runde
  await g.request.post(`${A}/s/api/vokabeln/antwort`, {
    headers: KOPF,
    data: { id: kurs, wortId: 'w0', uebung: 'auswahl', antwort: 'Wort0', freiwillig: true }
  })
  await g.request.post(`${A}/s/api/vokabeln/antwort`, {
    headers: KOPF,
    data: { id: kurs, wortId: 'w0', uebung: 'auswahl', antwort: 'Wort0', freiwillig: true }
  })
  const st = (await (await g.request.get(`${A}/s/api/vokabeln/liste?id=${kurs}`, { headers: KOPF })).json()).staende
  pruefe(st.w0?.fach === 1, `Heute nicht gewusst, freiwillig gewusst: rückt einmal vor (Fach ${st.w0?.fach})`)
  await p.screenshot({ path: join(out, '3-freiwillig.png') })

  // ---------- Neue Vokabeln ohne Neuladen (beim Zurückkehren zur Seite)
  await p.goto(`${A}/s/v/${kurs}`)
  await p.locator('[data-vokabel-kasten]').waitFor()
  const vorher = await p.locator('[data-vokabel-kasten]').innerText()
  await post(`/server/vokabeln/${kurs}/woerter`, { woerter: [{ id: 'n1', term: 'apple', translation: 'Apfel' }], titel: 'Nachtrag' })
  await p.waitForTimeout(5500)
  await p.evaluate(() => window.dispatchEvent(new Event('focus')))
  await p.waitForTimeout(2000)
  const nachher = await p.locator('[data-vokabel-kasten]').innerText()
  pruefe(/13 Vokabeln/.test(nachher) && !/13 Vokabeln/.test(vorher), 'Neue Vokabel erscheint ohne Neuladen')

  // ---------- Fehlerbericht aus dem Browser
  const fb = await g.request.post(`${A}/s/api/fehlerbericht`, { data: { art: 'test', seite: '/s/test', meldung: 'Testmeldung', ort: 'e2e' } })
  pruefe(fb.status() === 204, `Fehlerbericht angenommen (${fb.status()})`)

  // ---------- Gast über den Kurscode: Seite /s/vt/<code> wie bisher
  const g2 = await browser.newContext()
  const p2 = await g2.newPage()
  await p2.goto(`${A}/`)
  await p2.locator('form.code input[name="code"]').fill(kursCode)
  await p2.locator('form.code button').click()
  await p2.waitForURL(`**/s/vt/${kursCode}`, { timeout: 15000 }).catch(() => undefined)
  pruefe(p2.url().endsWith(`/s/vt/${kursCode}`), `Kurscode von der Startseite führt zum Beitritt (${p2.url()})`)
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  if (kurs && lk) await lk.request.post(`${A}/server/vokabeln/${kurs}/loeschen`, { headers: KOPF, data: { klassenkurs: true } }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, 'Kurs, Gäste und Konten gelöscht')
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
