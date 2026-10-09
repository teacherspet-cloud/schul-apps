// Codes und Drucken (09.10.2026, Befunde der Lehrkraft):
//  1. Unbekannter Code: Die Code-Seite meldet „Diesen Code kennen wir nicht – bitte genau prüfen." statt nach Vor- und
//     Nachnamen zu fragen (Startseite /s/, Anmeldeseite /anmelden, Test-Seite /s/t/<CODE>, Arbeitsblatt /s/w/<CODE>).
//  2. Enter bestätigt die Code-Felder.
//  3. Drucken im Browser OHNE neuen Tab: Die Druckvorschau bereitet den Druck im aktuellen Dokument vor, „Drucken …"
//     ruft window.print() (hier eine Attrappe) – kein window.open, keine neue Seite.
//  4. „Meine Klassen" › Lernende: „Codezettel drucken", Klick auf den Namen öffnet Code + Zettel + „Namen ändern".
// Vorher: Server lokal (KI-Attrappe, es wird keine KI gebraucht). Räumt alles wieder ab.
// Aufruf: node tests/e2e/server-codes-druck.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-codes-druck')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const WOERTER = Array.from({ length: 6 }, (_, i) => ({ id: `w${i}`, term: `word${i}`, translation: `Wort${i}` }))
const KLASSE = `5b${Date.now() % 1000}`
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )

/** Attrappe für window.print und Zähler für window.open – vor jedem Skript der Seite */
const DRUCK_WACHE = () => {
  window.__geoeffnet = 0
  const auf = window.open
  window.open = (...a) => {
    window.__geoeffnet++
    return auf.apply(window, a)
  }
  window.__gedruckt = []
  window.print = () => {
    const bereich = document.getElementById('sa-druckbereich')
    window.__gedruckt.push({
      klasse: document.documentElement.classList.contains('sa-druckt'),
      seiten: bereich ? bereich.querySelectorAll('.sa-druckseite img').length : 0,
      geladen: bereich ? [...bereich.querySelectorAll('img')].every((b) => b.complete && b.naturalWidth > 0) : false
    })
    window.dispatchEvent(new Event('afterprint'))
  }
}

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const kurse = []
let gid = ''
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Dora Druck' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await lk.addInitScript(DRUCK_WACHE)
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const post = async (pfad, data) => (await lk.request.post(`${A}/server/${pfad}`, { headers: KOPF, data })).json()

  gid = (await post('lerngruppen/anlegen', { name: KLASSE, fach: 'Englisch' })).id
  const vid = (await post('vokabeln/freigeben', { lerngruppeId: gid, titel: 'Unit 1', sprache: 'en', fach: 'Englisch', woerter: WOERTER, gaeste: true })).id
  kurse.push(vid)
  const codes = (await post(`vokabeln/${vid}/eintragen`, { namen: ['Jayen S.', 'Ida K.'] })).eingetragen ?? []
  await post(`vokabeln/${vid}/klasse-zuordnen`, { lerngruppeId: gid })
  pruefe(codes.length === 2, `Zwei Lernende mit Anmeldecode (${codes.map((c) => c.name).join(', ')})`)
  const ida = codes.find((c) => c.name === 'Ida K.')
  const jayen = codes.find((c) => c.name === 'Jayen S.')

  // ---------- Lernende: unbekannte Codes
  const sm = await browser.newContext({ viewport: { width: 1024, height: 1366 }, hasTouch: true })
  const s = await sm.newPage()
  s.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await s.goto(`${A}/s/`)
  await s.locator('[data-code-feld]').fill('ZZQQ99')
  await s.locator('[data-code-feld]').press('Enter')
  pruefe(await da(s.locator('[data-code-unbekannt]').first()), 'Startseite: unbekannter Code per Enter → Meldung am Feld')
  pruefe(/Diesen Code kennen wir nicht – bitte genau prüfen\./.test(await s.locator('body').innerText()), 'Wortlaut der Meldung')
  pruefe((await s.locator('[data-gastname]').count()) === 0 && new URL(s.url()).pathname === '/s/', 'Keine Namensabfrage, Seite bleibt')
  await s.screenshot({ path: join(out, '1-start-unbekannt.png') })

  await s.goto(`${A}/s/t/ZZQQ98`)
  pruefe(await da(s.locator('[data-code-unbekannt]').first()), 'Test-Seite mit unbekanntem Code: Meldung statt „Wie heißt du?"')
  pruefe((await s.locator('[data-gastname]').count()) === 0, 'Test-Seite: kein Namensfeld')
  await s.goto(`${A}/s/w/ZZQQ97`)
  pruefe(await da(s.locator('[data-code-unbekannt]').first()), 'Arbeitsblatt-Seite mit unbekanntem Code: Meldung')
  await s.goto(`${A}/s/vt/ZZQQ96`)
  pruefe(await da(s.locator('[data-code-unbekannt]').first()), 'Vokabel-Seite mit unbekanntem Code: Meldung')

  await s.goto(`${A}/anmelden`)
  await s.locator('#code').fill('ZZQQ95')
  await s.locator('#code').press('Enter')
  await s.waitForURL(/\/anmelden\?unbekannt=1/, { timeout: 15000 }).catch(() => undefined)
  pruefe(/\/anmelden\?unbekannt=1/.test(s.url()), `Anmeldeseite: Enter, unbekannter Code → zurück zur Anmeldeseite (${new URL(s.url()).pathname}${new URL(s.url()).search})`)
  pruefe(await da(s.locator('form.code [data-code-unbekannt]')), 'Anmeldeseite: Meldung am Codefeld')
  pruefe((await s.locator('#code').inputValue()) === 'ZZQQ95', 'Anmeldeseite: eingegebener Code steht wieder im Feld')
  await s.screenshot({ path: join(out, '2-anmelden-unbekannt.png') })

  // Gültiger persönlicher Code per Enter auf der Anmeldeseite
  await s.locator('#code').fill(ida.zugang)
  await s.locator('#code').press('Enter')
  await s.waitForURL(/\/s\/v\//, { timeout: 20000 }).catch(() => undefined)
  pruefe(new RegExp(`/s/v/${vid}`).test(s.url()), 'Gültiger Anmeldecode per Enter öffnet die Vokabeln')

  // ---------- Lehrkraft: Meine Klassen › Lernende
  const p = await lk.newPage()
  p.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Meine Klassen"]').click()
  await p.locator('[data-klassen-liste]').waitFor({ timeout: 10000 })
  await p.locator(`[data-klasse="${KLASSE}"]`).click()
  await p.getByRole('tab', { name: /^Lernende/ }).click()
  pruefe(await da(p.locator('[data-codezettel-alle]')), 'Knopf „Codezettel drucken" (Lernende mit Code vorhanden)')
  pruefe(/\(2\)/.test(await p.locator('[data-codezettel-alle]').innerText().catch(() => '')), 'Codezettel für beide Lernenden mit Code')

  // Drucken: Vorschau → „Drucken …" ohne neuen Tab
  const seitenVorher = lk.pages().length
  await p.locator('[data-codezettel-alle]').click()
  pruefe(await da(p.locator('[data-druck-bereit="1"]'), 60000), 'Druckvorschau: Druck vorbereitet, „Drucken …" bereit')
  pruefe(/Es öffnet sich kein neuer Tab/.test(await p.locator('[data-druckerwahl-hinweis]').innerText().catch(() => '')), 'Hinweis in der Vorschau: kein neuer Tab')
  await p.screenshot({ path: join(out, '3-vorschau.png') })
  await p.locator('[data-druck-bereit="1"]').click()
  await p.waitForTimeout(500)
  const druck = await p.evaluate(() => ({ gedruckt: window.__gedruckt, geoeffnet: window.__geoeffnet }))
  pruefe(druck.gedruckt.length === 1, `window.print() genau einmal aufgerufen (${druck.gedruckt.length})`)
  pruefe(druck.gedruckt[0]?.klasse === true && druck.gedruckt[0]?.seiten >= 1 && druck.gedruckt[0]?.geladen, `Beim Drucken: Druckbereich mit Seitenbildern aktiv (${JSON.stringify(druck.gedruckt[0])})`)
  pruefe(druck.geoeffnet === 0 && lk.pages().length === seitenVorher, 'Kein window.open, keine neue Seite')
  await p.waitForTimeout(2000)
  pruefe(
    await p.evaluate(() => !document.getElementById('sa-druckbereich') && !document.documentElement.classList.contains('sa-druckt')),
    'Nach dem Druckdialog aufgeräumt (Druckbereich und Klasse weg)'
  )

  // Druckstil wirklich prüfen: vorbereiten, Klasse setzen, als Druckmedium ansehen
  await p.locator('[data-codezettel-alle]').click()
  await da(p.locator('[data-druck-bereit="1"]'), 60000)
  await p.evaluate(() => {
    window.print = () => undefined
  })
  await p.locator('[data-druck-bereit="1"]').click()
  await p.emulateMedia({ media: 'print' })
  const sichtbar = await p.evaluate(() => {
    const b = document.getElementById('sa-druckbereich')
    const root = document.getElementById('root')
    return { bereich: b ? getComputedStyle(b).display : 'fehlt', app: root ? getComputedStyle(root).display : 'fehlt' }
  })
  await p.emulateMedia({ media: 'screen' })
  pruefe(sichtbar.bereich === 'block' && sichtbar.app === 'none', `Im Druck nur der Druckbereich (${JSON.stringify(sichtbar)})`)
  await p.evaluate(() => window.dispatchEvent(new Event('afterprint')))

  // Name anklicken → Code, Zettel, Namen ändern
  await p.locator('[data-gast-name="Jayen S."]').click()
  pruefe(await da(p.locator('[data-gast-zugang]').first()), 'Klick auf den Namen öffnet das Fenster')
  pruefe((await p.locator('[data-gast-code]').innerText()).trim() === jayen.zugang, 'Fenster zeigt den persönlichen Code')
  pruefe((await p.locator('[data-gast-zettel-drucken]').count()) === 1 && (await p.locator('[data-gast-zettel-pdf]').count()) === 1, 'Zettel drucken und als PDF sichern')
  await p.screenshot({ path: join(out, '5-gast-fenster.png') })
  await p.locator('[data-gast-name-feld]').fill('Jayden S')
  await p.locator('[data-gast-name-feld]').press('Enter')
  pruefe(await da(p.locator('[data-gast-name="Jayden S."]')), 'Namen geändert (Enter): „Jayden S." in der Liste')
  const g = await (await lk.request.get(`${A}/server/klassen/${gid}`, { headers: KOPF })).json()
  pruefe(g.lernende.some((l) => l.name === 'Jayden S.') && !g.lernende.some((l) => l.name === 'Jayen S.'), 'Server: Name gespeichert')
  // Anmeldung mit dem Code geht weiter, der neue Name erscheint
  const neu = await browser.newContext()
  const an = await neu.request.post(`${A}/s/api/vokabeln/anmelden`, { headers: KOPF, data: { code: jayen.zugang } })
  pruefe(an.status() === 200, 'Anmeldung mit dem bisherigen Code geht weiter')
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  for (const id of kurse) if (lk) await lk.request.post(`${A}/server/vokabeln/${id}/loeschen`, { headers: KOPF, data: { klassenkurs: true } }).catch(() => undefined)
  if (gid && lk) await lk.request.post(`${A}/server/lerngruppen/loeschen`, { headers: KOPF, data: { id: gid } }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
