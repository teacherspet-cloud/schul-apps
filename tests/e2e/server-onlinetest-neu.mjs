// „Neuer Onlinetest" in der App Onlinetest (03.10.2026): Vokabeltest wählen → Name nach Muster
// „<Lerngruppe> <Datum> - <Fundstelle>" → nach dem Erstellen die Detailansicht mit „Test für alle starten".
// Aufruf: node tests/e2e/server-onlinetest-neu.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-onlinetest-neu')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const TEST = {
  version: 1,
  header: {
    title: 'Vocabulary Test',
    themenbereich: 'Englisch › Green Line 6 › Unit 1 › Station 2',
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
    grade: 10,
    vocabCount: 1,
    variantCount: 1,
    variantMode: 'sameVocab',
    tasks: [],
    topic: '',
    pictureSource: 'none',
    answerKey: true,
    seed: 1
  },
  vocab: [],
  variants: [
    {
      id: 'A',
      label: 'A',
      blocks: [
        {
          id: 'g',
          kind: 'gap',
          taskType: 'gapSentences',
          title: 'Gaps',
          instruction: 'Fill in.',
          pointsPerItem: 1,
          wordBank: false,
          firstLetterHint: false,
          extraBankWords: [],
          items: [{ id: 'g1', sentences: [{ before: 'I go to', after: '.' }], answer: 'school' }]
        }
      ]
    }
  ],
  fontSize: 12,
  createdAt: new Date().toISOString()
}
const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea Testlehrerin' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const gesp = await lk.request.post(`${A}/api`, {
    headers: KOPF,
    data: {
      channel: 'tests:save',
      args: [
        {
          id: 'greenline6-unit1',
          name: 'Green Line 6 Unit 1',
          stats: { vocabCount: 1, variantCount: 1, language: 'en', level: 'A2', taskCount: 1 },
          payload: TEST
        }
      ]
    }
  })
  console.log('    gespeichert:', (await gesp.text()).slice(0, 160))
  await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: '10b', fach: 'Englisch' } })
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await p.locator('.app-leiste [aria-label="Onlinetest"]').click()
  await p.mouse.move(800, 600)
  await p.locator('[data-app-neu="onlinetest"]').click()
  await p.locator('[data-onlinetest-wahl]').click()
  await p.getByRole('option', { name: 'Green Line 6 Unit 1' }).click()
  await p.locator('[data-onlinetest-name]').waitFor({ timeout: 10000 })
  await p
    .getByRole('dialog')
    .getByPlaceholder(/wählen/)
    .first()
    .click()
  await p.getByRole('option', { name: '10b' }).click()
  const tag = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const name = await p.locator('[data-onlinetest-name]').inputValue()
  pruefe(name === `10b ${tag} - Green Line 6 - Unit 1 - Station 2`, `Name nach Muster: „${name}"`)
  await p.screenshot({ path: join(out, '1-dialog.png') })
  await p
    .getByRole('dialog')
    .getByRole('button', { name: /erstellen/i })
    .last()
    .click()
  pruefe(
    await p
      .getByRole('button', { name: /für alle starten/i })
      .waitFor({ timeout: 15000 })
      .then(
        () => true,
        () => false
      ),
    'Nach dem Erstellen: Detailansicht mit „Test für alle starten"'
  )
  await p.screenshot({ path: join(out, '2-detail.png') })
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
