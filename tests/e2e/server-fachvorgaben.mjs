// Fachobleute pflegen ihr Fach (13.10.2026, abgestimmt; shared/fachvorgaben.ts, server/fachvorgaben.ts):
//  1. Vorgaben speichern nur Admin und Fachobleute des Fachs (sonst 403); alle Lehrkräfte lesen sie.
//  2. Notenschlüssel der Vorgabe gilt für Lehrkräfte des Fachs ohne eigenen Schlüssel; ein eigener geht vor.
//  3. Fachfarbe: Fachobleute ändern nur die Farbe ihres Fachs.
//  4. Fachschafts-Material: empfehlen, Jahrgang/Thema zuordnen, ausblenden (die Erstellerin sieht es weiter); andere
//     Lehrkräfte dürfen nicht ordnen.
//  5. Oberfläche: Reiter „Mein Fach" für die Fachobfrau (nicht für andere), ⋯ an der Freigabe, „Empfohlen" in der Liste.
// Ohne KI. Aufruf: node tests/e2e/server-fachvorgaben.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-fachvorgaben')
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
const DOC = {
  version: 1,
  header: {
    title: 'Vocabulary Test',
    showName: true,
    showDate: true,
    showClass: false,
    showSchool: false,
    schoolName: '',
    showVariant: true,
    showPoints: true,
    showGrade: true,
    subtitle: ''
  },
  settings: {
    targetLanguage: 'en',
    level: 'A2',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    languageOrder: 1,
    grade: 7,
    vocabCount: 0,
    variantCount: 1,
    variantMode: 'sameVocab',
    tasks: [],
    topic: 'Weather',
    pictureSource: 'none',
    answerKey: true,
    seed: 1
  },
  vocab: [],
  variants: [{ id: 'A', label: 'A', blocks: [] }],
  fontSize: 12,
  createdAt: new Date().toISOString()
}
const STATS = { vocabCount: 0, includedCount: 0, hasTest: true, variantCount: 1, totalPoints: 0, language: 'en', subjectLabel: 'Englisch', grade: 7 }

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
const verwaltung = await browser.newContext()
let farbenVorher = null
const seiteAuf = async (ctx) => {
  const p = await ctx.newPage()
  p.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  return p
}
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  farbenVorher = (await (await verwaltung.request.get(`${A}/server/fachfarben`, { headers: KOPF })).json()).farben
  const konto = async (name, faecher) => {
    const k = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name } })).json()
    zuLoeschen.push(k.id)
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    await anmelden(ctx, k.benutzer, k.passwort)
    const api = async (channel, ...args) => {
      const r = await (await ctx.request.post(`${A}/api`, { headers: KOPF, data: { channel, args } })).json()
      if (!r.ok) throw new Error(`${channel}: ${r.error}`)
      return r.value
    }
    await api('settings:set', { eigeneFaecher: faecher })
    const post = async (pfad, data) => {
      const r = await ctx.request.post(`${A}${pfad}`, { headers: KOPF, data })
      return { status: r.status(), ...(await r.json()) }
    }
    const get = async (pfad) => (await ctx.request.get(`${A}${pfad}`, { headers: KOPF })).json()
    return { ...k, ctx, api, post, get, name }
  }
  const lea = await konto('Lea Englisch', ['englisch'])
  const ben = await konto('Ben Englisch', ['englisch'])
  const fia = await konto('Fia Fachobfrau', ['englisch'])
  const ob = await (await verwaltung.request.post(`${A}/server/fachobleute`, { headers: KOPF, data: { nutzerId: fia.id, faecher: ['englisch'] } })).json()
  pruefe(!ob.fehler, `Admin ernennt Fia zur Fachobfrau Englisch (${ob.fehler ?? 'ok'})`)

  // ---------- 1. Vorgaben: Rechte
  const VORGABEN = {
    lehrwerke: { 7: 'Green Line 3' },
    themen: { 6: ['London'], 7: ['Scotland', 'Teen life'], 8: ['USA'] },
    notenschluessel: [92, 80, 65, 50, 22],
    problemStufe: 2,
    erinnerungen: 'aus',
    operatoren: { zusatz: [{ name: 'sketch', erklaerung: 'draw a rough outline' }], weglassen: ['outline'] }
  }
  const benDarf = await ben.post('/server/fachvorgaben', { fach: 'englisch', vorgaben: VORGABEN })
  pruefe(benDarf.status === 403, `Ben (keine Fachobleute) darf nicht speichern (${benDarf.status})`)
  const fiaGes = await fia.post('/server/fachvorgaben', { fach: 'englisch', vorgaben: VORGABEN })
  pruefe(fiaGes.status === 200 && fiaGes.vorgaben?.lehrwerke?.['7'] === 'Green Line 3', `Fia speichert die Vorgaben (${fiaGes.status})`)
  const fiaFremd = await fia.post('/server/fachvorgaben', { fach: 'geschichte', vorgaben: { problemStufe: 1 } })
  pruefe(fiaFremd.status === 403, `Fia darf Geschichte nicht (${fiaFremd.status})`)
  const benLiest = await ben.get('/server/fachvorgaben')
  pruefe(benLiest.vorgaben?.englisch?.problemStufe === 2 && benLiest.darf?.length === 0, 'Ben liest die Vorgaben, darf aber nichts')

  // ---------- 2. Notenschlüssel als Standard
  const s = await ben.api('settings:get')
  pruefe(
    JSON.stringify(s.gradeScale?.jeFach?.englisch) === JSON.stringify(VORGABEN.notenschluessel),
    `Bens Notenschlüssel Englisch = Vorgabe (${s.gradeScale?.jeFach?.englisch})`
  )
  await ben.api('settings:set', { gradeScale: { jeFach: { englisch: [95, 85, 70, 55, 30] } } })
  pruefe(JSON.stringify((await ben.api('settings:get')).gradeScale.jeFach.englisch) === '[95,85,70,55,30]', 'Eigener Schlüssel geht vor')
  // Speichert jemand andere Einstellungen, wird die Vorgabe nicht zum eigenen Schlüssel
  await lea.api('settings:set', { gradeScale: (await lea.api('settings:get')).gradeScale })
  await fia.post('/server/fachvorgaben', { fach: 'englisch', vorgaben: { ...VORGABEN, notenschluessel: [90, 75, 60, 45, 20] } })
  pruefe(
    JSON.stringify((await lea.api('settings:get')).gradeScale.jeFach.englisch) === '[90,75,60,45,20]',
    'Lea folgt der geänderten Vorgabe (nicht als eigener Schlüssel gespeichert)'
  )

  // ---------- 3. Fachfarbe
  const f0 = (await fia.get('/server/fachfarben')).farben ?? {}
  const fb = await fia.post('/server/fachfarben', { farben: { ...f0, englisch: '#123456', geschichte: '#654321' } })
  pruefe(fb.status === 200 && fb.farben?.englisch === '#123456' && fb.farben?.geschichte !== '#654321', 'Fia ändert nur die Farbe von Englisch')

  // ---------- 4. Fachschafts-Material ordnen
  await lea.api('tests:save', { id: 'fv-test-1', name: 'Weather Unit 1', stats: STATS, payload: DOC })
  await lea.post('/server/fachschaft/freigeben', { art: 'vokabeltest', id: 'fv-test-1' })
  const liste = async (wer) => (await wer.get('/server/fachschaft')).eintraege
  const eintrag = (await liste(fia)).find((e) => e.titel === 'Weather Unit 1')
  pruefe(eintrag?.darfOrdnen === true, 'Fia darf die Freigabe ordnen')
  pruefe((await liste(ben)).find((e) => e.titel === 'Weather Unit 1')?.darfOrdnen !== true, 'Ben nicht')
  const benOrdnet = await ben.post('/server/fachschaft/ordnen', { id: eintrag.id, empfohlen: true })
  pruefe(benOrdnet.status === 403, `Ben darf nicht ordnen (${benOrdnet.status})`)
  await fia.post('/server/fachschaft/ordnen', { id: eintrag.id, empfohlen: true, jahrgang: 6, thema: 'Weather' })
  const beiBen = (await liste(ben)).find((e) => e.titel === 'Weather Unit 1')
  pruefe(Boolean(beiBen?.empfohlen) && beiBen.jahrgang === 6 && beiBen.thema === 'Weather', 'Ben sieht „empfohlen", Klasse 6, Thema Weather')

  // ---------- 5. Oberfläche
  const p = await seiteAuf(fia.ctx)
  await p.locator('.app-leiste [aria-label="Einstellungen"]').click()
  pruefe(await da(p.locator('[data-reiter-mein-fach]')), 'Fia: Reiter „Mein Fach" in den Einstellungen')
  await p.locator('[data-reiter-mein-fach]').click()
  pruefe(await da(p.locator('[data-mein-fach-curriculum] [data-curriculum-jahrgang="7"]')), '„Mein Fach": Curriculum je Jahrgang')
  const lw = await p
    .locator('[data-curriculum-lehrwerk="7"]')
    .inputValue()
    .catch(() => '')
  pruefe(lw === 'Green Line 3', `Gespeichertes Lehrwerk Klasse 7 steht da (${lw})`)
  await p.screenshot({ path: join(out, '1-mein-fach.png'), fullPage: true })
  // Fachschaft in der Bibliothek des Vokabeltests: „Empfohlen" und ⋯
  await p.locator('.app-leiste [aria-label="Vokabeltest"]').click()
  await p
    .getByRole('button', { name: /Meine Vokabeltests/ })
    .first()
    .click()
    .catch(() => undefined)
  const schalter = p.locator('[data-fachschaft-schalter]').filter({ visible: true })
  if (await da(schalter, 10000)) await schalter.locator('[data-fachschaft-schalter-auch]').click()
  const fl = p.locator('[data-fachschaftsliste]').filter({ visible: true })
  if (await da(fl, 10000)) {
    await p.waitForTimeout(300)
    pruefe(await da(fl.locator('[data-freigabe-empfohlen]')), 'Liste: Kennzeichen „empfohlen"')
    pruefe(await da(fl.locator('[data-fachschaft-jahrgang="Empfohlen"]')), 'Liste: Gruppe „Empfohlen"')
    pruefe(await da(fl.locator('[data-freigabe-ordnen]')), 'Liste: ⋯ zum Ordnen für die Fachobfrau')
    await p.screenshot({ path: join(out, '2-fachschaft.png'), fullPage: true })
  } else pruefe(false, 'Fachschaftsliste in der Bibliothek')
  // Ben: kein Reiter
  const pb = await seiteAuf(ben.ctx)
  await pb.locator('.app-leiste [aria-label="Einstellungen"]').click()
  await pb.waitForTimeout(1500)
  pruefe((await pb.locator('[data-reiter-mein-fach]').count()) === 0, 'Ben: kein Reiter „Mein Fach"')

  // Ausblenden: Ben sieht sie nicht mehr, Lea (Erstellerin) schon
  await fia.post('/server/fachschaft/ordnen', { id: eintrag.id, ausgeblendet: true })
  pruefe(!(await liste(ben)).some((e) => e.titel === 'Weather Unit 1'), 'Ausgeblendet: Ben sieht sie nicht mehr')
  pruefe(
    (await liste(lea)).some((e) => e.titel === 'Weather Unit 1'),
    '… die Erstellerin schon'
  )
  pruefe((await liste(fia)).find((e) => e.titel === 'Weather Unit 1')?.ausgeblendet === true, '… die Fachobfrau mit Kennzeichen')
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  // Vorgaben und Farben zurücksetzen (sie gelten schulweit)
  await verwaltung.request.post(`${A}/server/fachvorgaben`, { headers: KOPF, data: { fach: 'englisch', vorgaben: {} } }).catch(() => undefined)
  if (farbenVorher) await verwaltung.request.post(`${A}/server/fachfarben`, { headers: KOPF, data: { farben: farbenVorher } }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Konten samt Daten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
