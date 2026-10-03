// Onlinetest (03.10.2026): Dialog-Lückentext als fließender Text; Warnung und Sperre bei geteiltem Bildschirm.
// Vorher: Server lokal (KI-Attrappe mit „onlinetest_bewertung"), IServ NICHT eingerichtet.
// Aufruf: node tests/e2e/server-onlinetest-fenster.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-onlinetest-fenster')
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
const t = (text) => ({ type: 'text', text })
const g = (id, answer) => ({ type: 'gap', id, answer })
const TEST = {
  version: 1,
  header: {
    title: 'Vocabulary Test',
    themenbereich: 'Englisch › Green Line 5 › Unit 1',
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
    grade: 5,
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
          id: 'd',
          kind: 'gapText',
          taskType: 'dialogue',
          title: 'Dialogue',
          instruction: 'Complete the dialogue.',
          pointsPerItem: 1,
          wordBank: false,
          firstLetterHint: false,
          extraBankWords: [],
          parts: [
            t('Mia: Hello, Ben. Welcome to our new school. Ben: Hi, Mia. Where is my new '),
            g('d1', 'classroom'),
            t('? Mia: It is in the big room. Ben: Look! There is a '),
            g('d2', 'shelf'),
            t(' of books there.')
          ]
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
  const lk = await browser.newContext()
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const gruppe = await (await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: '5f', fach: 'Englisch' } })).json()
  const neu = await (
    await lk.request.post(`${A}/server/onlinetest/erstellen`, {
      headers: KOPF,
      data: { titel: 'Dialog-Test', test: TEST, lerngruppeId: gruppe.id, zeitMin: 10, zugang: 'gaeste' }
    })
  ).json()
  pruefe(Boolean(neu.code), `Onlinetest angelegt (${neu.code})`)

  // iPad hochkant: voll und in geteilter Ansicht (halbe Breite)
  const ipad = async (breite) =>
    (await browser.newContext({ viewport: { width: breite, height: 1180 }, screen: { width: 820, height: 1180 }, hasTouch: true, isMobile: true })).newPage()
  const voll = await ipad(820)
  const geteilt = await ipad(410)
  for (const [s, n] of [
    [voll, 'Ana V.'],
    [geteilt, 'Ben G.']
  ]) {
    await s.goto(neu.link)
    await s.locator('[data-gastname]').fill(n)
    await s.getByRole('button', { name: 'Weiter' }).click()
    await s.locator('[data-wartebildschirm]').waitFor({ timeout: 15000 })
  }
  pruefe(!(await voll.locator('[data-fenster-warnung]').isVisible()), 'Volles Fenster: keine Warnung')
  pruefe(await da(geteilt.locator('[data-fenster-warnung]')), 'Geteilte Ansicht: deutliche Warnung schon auf dem Wartebildschirm')
  await geteilt.screenshot({ path: join(out, '1-warnung.png'), fullPage: true })

  await lk.request.post(`${A}/server/onlinetest/${neu.id}/status`, { headers: KOPF, data: { status: 'starten' } })
  pruefe(await da(voll.locator('[data-fliesstext="dialog"]')), 'Dialog als fließender Text')
  const zeilen = await voll.locator('[data-fliesstext] b').allInnerTexts()
  pruefe(zeilen.filter((z) => /^(Mia|Ben):$/.test(z)).length === 4, `Sprecher fett am Zeilenanfang (${zeilen.join(' ')})`)
  pruefe((await voll.locator('[data-fliesstext] input').count()) === 2, 'Zwei Felder mitten im Text')
  await voll.locator('[data-fliesstext] input').first().fill('classroom')
  await voll.screenshot({ path: join(out, '2-dialog.png'), fullPage: true })

  pruefe(await da(geteilt.locator('[data-fenster-sperre]')), 'Geteilte Ansicht im Test: Sperre mit Countdown')
  await geteilt.screenshot({ path: join(out, '3-sperre.png') })
  pruefe(await da(geteilt.getByText(/automatisch abgegeben/), 20000), 'Nach 10 s ohne volles Fenster: abgegeben')
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
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
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
