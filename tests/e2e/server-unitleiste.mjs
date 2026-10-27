// Unit-Leiste im Reiter „Vocabulary" (19.10.2026, Befund der Lehrkraft): Sind „Hello" und „Unit 1" freigegeben, zeigt
// ein Tippen auf „Hello" die Abschnitte von Hello (Check-in, St. 1 …) statt der von Unit 1.
// Ohne KI. Aufruf: node tests/e2e/server-unitleiste.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-unitleiste')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `5u${Date.now() % 1000}`
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
let wortNr = 0
const woerter = (n) => Array.from({ length: n }, () => ({ id: `u${wortNr}`, term: `unitword${wortNr}`, translation: `Unitwort${wortNr++}` }))
const GL1 = [
  { unit: 'Hello', abschnitte: ['Check-in', 'Station 1', 'Station 2', 'Station 3'] },
  { unit: 'Unit 1', abschnitte: ['Check-in', 'Station 1', 'Station 2'] }
]

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const kurse = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Uli Unit' } })).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Uma Probe' } })).json()
  const uma = liste.angelegt[0]
  for (const n of (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer ?? [])
    if (n.benutzer === uma.benutzer) zuLoeschen.push(n.id)
  lk = await browser.newContext()
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const post = async (pfad, data) => (await lk.request.post(`${A}${pfad}`, { headers: KOPF, data })).json()
  const g = await post('/server/lerngruppen/anlegen', { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` })
  const teile = GL1.flatMap((u) => u.abschnitte.map((a) => ({ titel: `${u.unit} · ${a}`, anzahl: 1 })))
  const kurs = (
    await post('/server/vokabeln/freigeben', {
      lerngruppeId: g.id,
      titel: 'Green Line 1 - Hello - Unit 1',
      sprache: 'en',
      fach: 'Englisch',
      woerter: woerter(teile.length),
      teile,
      quelle: { lehrwerk: 'green-line-1', units: GL1, unit: 'Unit 1', abschnitte: GL1.flatMap((u) => u.abschnitte) }
    })
  ).id
  kurse.push(kurs)
  pruefe(Boolean(kurs), 'Kurs mit Hello und Unit 1 freigegeben')

  const sm = await browser.newContext({ viewport: { width: 1100, height: 900 } })
  await anmelden(sm, uma.benutzer, uma.passwort)
  await sm.request.post(`${A}/auth/passwort`, {
    form: { alt: uma.passwort, neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  const p = await sm.newPage()
  await p.goto(`${A}/s/ordner/Englisch`)
  const leiste = p.locator('[data-units]')
  pruefe(await da(leiste), 'Unit-Leiste im Reiter „Vocabulary"')
  const units = await p.locator('[data-units] [data-unit]').evaluateAll((l) => l.map((x) => x.getAttribute('data-unit')))
  pruefe(units.includes('Hello') && units.includes('Unit 1'), `Units in der Leiste: ${units.join(', ')}`)
  pruefe((await p.locator('[data-abschnitte-unit]').getAttribute('data-abschnitte-unit')) === 'Unit 1', 'Zu Beginn: Abschnitte der aktuellen Unit 1')
  await p.screenshot({ path: join(out, '1-vorher.png') })
  await p.locator('[data-units] [data-unit="Hello"]').click()
  await p.waitForTimeout(400)
  await p.screenshot({ path: join(out, '2-nach-hello.png') })
  const jetzt = await p.locator('[data-abschnitte-unit]').getAttribute('data-abschnitte-unit')
  pruefe(jetzt === 'Hello', `Nach Tippen auf „Hello": Abschnitte von Hello (gezeigt: ${jetzt})`)
  pruefe((await p.locator('[data-units] [data-unit="Hello"]').getAttribute('aria-selected')) === 'true', '„Hello" ist ausgewählt')
  const namen = await p.locator('[data-abschnitte-unit] .sk-abschnitt-name').allInnerTexts()
  pruefe(namen.length === 4, `Hello hat 4 Abschnitte (${namen.join(', ')})`)
  // Deutlich sichtbar (19.10.2026): gewählte Unit gefüllt, Überschrift nennt sie, die aktuelle trägt einen Punkt
  pruefe(/^Hello: 0 von 4 Abschnitten/.test(await p.locator('[data-unit-titel]').innerText()), 'Überschrift nennt „Hello“')
  const farbe = await p.locator('[data-units] [data-unit="Hello"]').evaluate((e) => getComputedStyle(e).backgroundColor)
  pruefe(farbe !== 'rgba(0, 0, 0, 0)' && farbe !== 'transparent', `„Hello“ gefüllt (${farbe})`)
  pruefe((await p.locator('[data-units] [data-unit="Unit 1"] .sk-unit-punkt').count()) === 1, '„Unit 1“ trägt den Punkt „aktuelle Unit“')
  // Abschnitt antippen (27.10.2026, abgestimmt): Übung nur mit den Wörtern dieses Abschnitts im Fenster
  const ring = p.locator('[data-abschnitte-unit] button.sk-abschnitt').first()
  const ringKey = await ring.getAttribute('data-abschnitt')
  await ring.click()
  pruefe(await da(p.locator('[data-vw-fenster]')), `Abschnitt antippen öffnet das Übungsfenster (${ringKey})`)
  await p.locator('[data-vw-fenster] [data-sitzung], [data-vw-fenster] .vt-buehne, [data-vw-fenster] [data-eingabe]').first().waitFor({ timeout: 10000 }).catch(() => undefined)
  const fensterText = await p.locator('[data-vw-fenster]').innerText()
  pruefe((await p.locator('[data-vw-fenster] [data-sitzung]').count()) > 0 || /keine Wörter/.test(fensterText), 'Fenster zeigt die Übung zum Abschnitt')
  await p.screenshot({ path: join(out, '3-abschnitt-fenster.png') })
  await p.keyboard.press('Escape')
  await p.waitForTimeout(500)
  pruefe((await p.locator('[data-vw-fenster]').count()) === 0, 'Fenster schließt, zurück zum Buch')
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
