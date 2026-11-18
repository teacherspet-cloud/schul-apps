// Ausfüll-Liste im Lückentext (18.11.2026, Befund: alles in EINER Zeile) – Schüleransicht und Blattansicht.
// Abgeleitet von server-schueleransicht-probe.mjs:
//  1. KI-Feedback zur Probe: Knopf „Feedback" an der Aufgabe, Antwort über die KI der Lehrkraft (Attrappe).
//  2. Lücke mitten im Satz: der erste Buchstabe bleibt klein; Lücke am Satzanfang: groß.
//  3. Langer Text in der Lücke bleibt sichtbar: Schrift kleiner bzw. Feld breiter über dem Blatt.
// Vorher: Server lokal mit SCHULAPPS_KI_ATTRAPPE (Antwort für blatt_aufgabe_feedback).
// Aufruf: node tests/e2e/server-schueleransicht-probe.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-ausfuellliste')
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
erste.instruction = "**Fill in** the missing information from the text using 1 to 3 words.\n\nExample: Name of Maya's brother: Sam"
erste.answer = {
  ...erste.answer,
  kind: 'gapText',
  gapText: [
    "Maya's flat",
    "1 Books on Maya's shelves: [[twenty-five]]",
    '2 Colour of the cooker: [[blue]]',
    "Leo's house",
    "3 In Leo's bedroom: a bed, a desk and an [[armchair]]",
    '4 Room with the big mirror: the [[bathroom]]',
    "5 Name of Leo's dog: [[Bobby]]"
  ].join('\n')
}

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
  await lk.request.post(`${A}/api`, { headers: KOPF, data: { channel: 'sheets:save', args: [{ id: 'probe-ausfuell', name: 'Probe-Ausfüllliste', stats: { sheetCount: 1 }, payload }] } })
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
  await p.locator('[data-bibliothek-eintrag="Probe-Ausfüllliste"]').click()
  await p.locator('[data-schueleransicht-knopf]').waitFor({ timeout: 30000 })
  await p.waitForTimeout(1500)
  await p.locator('[data-schueleransicht-knopf]').click()
  const v = p.locator('[data-schueleransicht]')
  await v.locator('[data-zeichen-seite]').first().waitFor({ timeout: 15000 })
  await p.waitForTimeout(1500)

  const luecken = v.locator('input[data-feld]')
  await p.screenshot({ path: join(out, '0-gesamt.png') })
  const info = await luecken.first().evaluate((el) => {
    const zeile = el.closest('.ws-gap-zeile, .ws-gaptext, p, div')
    const box = el.closest('.ws-gap-zeilen') ?? el.parentElement?.parentElement?.parentElement
    return { klasse: zeile?.className, html: (box?.outerHTML ?? '').slice(0, 1500) }
  })
  console.log(JSON.stringify(info, null, 1))
  const ys = []
  for (let i = 0; i < 5; i++) ys.push(Math.round((await luecken.nth(i).boundingBox()).y))
  pruefe(ys.every((y, i) => i === 0 || y > ys[i - 1] + 8), `Jede Lücke der Liste in eigener Zeile (y: ${ys.join(', ')})`)
  const titel = p.locator('.ws-gap-titel')
  pruefe((await titel.count()) >= 2, `Zwischenüberschriften (${await titel.count()})`)
  if (await titel.count()) {
    const fett = await titel.first().evaluate((el) => getComputedStyle(el).fontWeight)
    pruefe(Number(fett) >= 600, `Zwischenüberschrift fett (${fett})`)
    await titel.first().scrollIntoViewIfNeeded()
  }
  await luecken.first().scrollIntoViewIfNeeded()
  await p.screenshot({ path: join(out, '1-schueleransicht.png') })
} catch (e) {
  problems.push(String(e))
  console.log('FEHLER', e)
} finally {
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
console.log(problems.length ? `\nProbleme:\n- ${problems.join('\n- ')}` : '\nAlles in Ordnung.')
process.exit(problems.length ? 1 : 0)
