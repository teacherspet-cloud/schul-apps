// Schüleransicht im Arbeitsblatt-Editor (18.11.2026, drei Befunde der Lehrkraft):
//  1. KI-Feedback zur Probe: Knopf „Feedback" an der Aufgabe, Antwort über die KI der Lehrkraft (Attrappe).
//  2. Lücke mitten im Satz: der erste Buchstabe bleibt klein; Lücke am Satzanfang: groß.
//  3. Langer Text in der Lücke bleibt sichtbar: Schrift kleiner bzw. Feld breiter über dem Blatt.
// Vorher: Server lokal mit SCHULAPPS_KI_ATTRAPPE (Antwort für blatt_aufgabe_feedback).
// Aufruf: node tests/e2e/server-schueleransicht-probe.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-schueleransicht-probe')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
// Vorlage aus dem lokalen Profil (nur gelesen): ein Englisch-Blatt mit Aufgaben; die erste Aufgabe wird zum Lückentext
const ordner = join(process.env.APPDATA ?? '', 'schul-apps', 'arbeitsblaetter')
const vorlage = readdirSync(ordner)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => join(ordner, f))
  .sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)
  .map((f) => JSON.parse(readFileSync(f, 'utf8')))
  .find((w) => w.subjectId === 'englisch' && (w.payload?.sheets?.[0]?.blocks ?? []).filter((b) => b.type === 'task').length >= 2)
const payload = structuredClone(vorlage.payload)
payload.sheets = payload.sheets.slice(0, 1)
const aufgaben = payload.sheets[0].blocks.filter((b) => b.type === 'task')
const erste = aufgaben[0]
erste.parts = []
erste.instruction = '**Complete** the text.'
erste.answer = { ...erste.answer, kind: 'gapText', gapText: 'Yesterday I [[went]] to the cinema with my friends. [[Afterwards]] we talked about the film for hours.' }

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  pruefe(Boolean(vorlage), `Vorlage: ${vorlage?.name}`)
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea Probe' } })).json()
  zuLoeschen.push(lehrer.id)
  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  await lk.request.post(`${A}/api`, { headers: KOPF, data: { channel: 'sheets:save', args: [{ id: 'probe-luecken', name: 'Probe-Lücken', stats: { sheetCount: 1 }, payload }] } })
  const p = await lk.newPage()
  p.on('pageerror', (e) => console.log('SEITENFEHLER', e.message.slice(0, 300)))
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spaeter = p.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Arbeitsblatt"]').click()
  await p.getByRole('button', { name: /Meine Arbeitsblätter/ }).first().click({ timeout: 4000 }).catch(() => undefined)
  await p.mouse.move(800, 700)
  await p.waitForTimeout(500)
  await p.locator('[data-bibliothek-eintrag="Probe-Lücken"]').click()
  await p.locator('[data-schueleransicht-knopf]').waitFor({ timeout: 30000 })
  await p.waitForTimeout(1500)
  await p.locator('[data-schueleransicht-knopf]').click()
  const v = p.locator('[data-schueleransicht]')
  await v.locator('[data-zeichen-seite]').first().waitFor({ timeout: 15000 })
  await p.waitForTimeout(1500)

  // 2. Groß-/Kleinschreibung in Lücken
  const luecken = v.locator('input[data-feld]')
  const n = await luecken.count()
  pruefe(n >= 2, `Lücken als Eingabefelder (${n})`)
  await luecken.nth(0).click()
  await p.keyboard.type('went', { delay: 20 })
  pruefe((await luecken.nth(0).inputValue()) === 'went', `Lücke mitten im Satz bleibt klein („${await luecken.nth(0).inputValue()}")`)
  pruefe((await luecken.nth(0).getAttribute('autocapitalize')) === 'none', 'Tastatur beginnt in der Lücke mitten im Satz klein (autocapitalize none)')
  await luecken.nth(1).click()
  await p.keyboard.type('afterwards', { delay: 20 })
  pruefe((await luecken.nth(1).inputValue()) === 'Afterwards', `Lücke am Satzanfang wird groß („${await luecken.nth(1).inputValue()}")`)

  // 3. Langer Text bleibt sichtbar
  // a) Erste Lücke (die nächste steht in derselben Zeile): wird breiter bzw. kleiner, verdeckt die nächste aber nie
  const erste = luecken.nth(0)
  const b0 = await erste.boundingBox()
  await erste.click()
  await p.keyboard.type(' with all of my best friends', { delay: 2 })
  const b1 = await erste.boundingBox()
  const n1 = await luecken.nth(1).boundingBox()
  pruefe(b1.width > b0.width + 10, `Beim Tippen wird die Lücke breiter (${Math.round(b0.width)} → ${Math.round(b1.width)} px)`)
  pruefe(b1.y + b1.height < n1.y + 2 || b1.x + b1.width <= n1.x + 1, `Nächste Lücke bleibt frei (rechts ${Math.round(b1.x + b1.width)} ≤ ${Math.round(n1.x)})`)
  await p.screenshot({ path: join(out, '1-luecke-tippen.png') })
  await luecken.nth(1).click({ timeout: 4000 })
  pruefe(await luecken.nth(1).evaluate((el) => el === document.activeElement), 'Nächste Lücke lässt sich antippen')
  const s1 = await erste.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, font: parseFloat(getComputedStyle(el).fontSize) }))
  pruefe(s1.scroll <= s1.client + 2, `Ohne Fokus vollständig sichtbar (Schrift ${s1.font}px)`)
  // b) Letzte Lücke der Zeile: Platz bis zum Seitenrand
  await luecken.nth(1).fill('')
  await p.keyboard.type('Afterwards, when the long film was finally over,', { delay: 2 })
  const s2 = await luecken.nth(1).evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, font: parseFloat(getComputedStyle(el).fontSize) }))
  pruefe(s2.scroll <= s2.client + 2, `Langer Text beim Tippen ganz sichtbar (Schrift ${s2.font}px)`)
  await erste.click()
  const s3 = await luecken.nth(1).evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, font: parseFloat(getComputedStyle(el).fontSize) }))
  pruefe(s3.scroll <= s3.client + 2, `Langer Text ohne Fokus ganz sichtbar (Schrift ${s3.font}px)`)
  await p.screenshot({ path: join(out, '2-luecke-ohne-fokus.png') })
  // c) Kurzer Text: Lücke bleibt wie gedruckt
  await luecken.nth(1).fill('Then')
  await erste.click()
  const b3 = await luecken.nth(1).boundingBox()
  pruefe(Math.round(b3.width) === Math.round(n1.width), `Kurzer Text: Lücke bleibt in ihrer Breite (${Math.round(b3.width)} px)`)

  // 1. KI-Feedback zur Probe
  const fbKnopf = v.locator('[data-aufgabe-pruefen]').first()
  pruefe(await fbKnopf.isVisible().catch(() => false), 'Schüleransicht: Feedback-Knopf an der Aufgabe')
  await fbKnopf.click()
  const los = v.locator('[data-aufgabe-pruefen-los]').first()
  await los.waitFor({ timeout: 5000 }).catch(() => undefined)
  await los.click().catch(() => undefined)
  pruefe(
    await v
      .getByText('Probe gelungen')
      .first()
      .waitFor({ timeout: 15000 })
      .then(
        () => true,
        () => false
      ),
    'Feedback der KI erscheint in der Schüleransicht'
  )
  await p.screenshot({ path: join(out, '3-feedback.png') })
  pruefe((await v.locator('[data-blatt-einreichen]').count()) === 0, 'Schüleransicht: weiterhin kein Einreichen')
} catch (e) {
  problems.push(String(e))
  console.log('FEHLER', e)
} finally {
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
console.log(problems.length ? `\nProbleme:\n- ${problems.join('\n- ')}` : '\nAlles in Ordnung.')
process.exit(problems.length ? 1 : 0)
