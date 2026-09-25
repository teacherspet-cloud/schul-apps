// Wache für die VORSCHLÄGE ZUM VORWISSEN (vorher: npm run build).
// Aufruf: node tests/e2e/vorwissen.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (25.09.2026): Unter „Vorwissen der Lerngruppe“ sollen Vorschläge
// erscheinen, die „dynamisch auf Fach, Thema, Jahrgang, Lernziel usw. reagieren“. Die Regeln
// prüfen die Einheitstests (tests/vorwissen.test.ts); hier geht es um die Oberfläche:
//
// 1. Die Chips erscheinen in Gruppen, ein Klick übernimmt sie ins Feld – Fehlvorstellungen mit
//    Vorsilbe – und der übernommene Chip verschwindet.
// 2. Sie reagieren auf Thema, Land und Jahrgang (Fachbeginn-Hinweis Politik in Bayern).
// 3. Klassenarbeit und Kurztest zeigen typische INHALTE statt Voraussetzungen.
//
// Der KI-Knopf wird nur gesucht, nie gedrückt: kein KI-Kontingent, eigenes leeres Profil,
// nichts wird gespeichert.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/vorwissen')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-vorwissen-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await app.evaluate(async ({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0]?.setSize(1600, 1050)
})
await warteAufOberflaeche(page)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)
await page.evaluate(() => window.__selftest.wsMaterialtext(4))
await page.waitForTimeout(2000)

const setzeMeta = async (patch) => {
  await page.evaluate((p) => {
    const ws = window.__selftest.worksheetJetzt()
    Object.assign(ws.meta, p)
    window.__selftest.setWorksheet(ws, 0)
  }, patch)
  await page.waitForTimeout(1200)
}
const chips = page.locator('[data-testid="vorwissen-chips"]').filter({ visible: true })
const feld = () => page.evaluate(() => window.__selftest.worksheetJetzt().meta.priorKnowledge)

// ---------------------------------------------------------------- 1. Arbeitsblatt
await setzeMeta({
  subjectId: 'mathematik',
  subjectLabel: 'Mathematik',
  topic: 'Prozentrechnung',
  grade: 7,
  stateId: 'BY',
  schoolTypeId: 'gymnasium',
  learningGoals: '',
  priorKnowledge: ''
})
pruefe((await chips.count()) === 1, 'Unter dem Vorwissensfeld stehen Vorschläge')
const text = (await chips.count()) ? await chips.innerText() : ''
for (const gruppe of ['Fachliches', 'Fachbegriffe', 'Methoden', 'Mögliche Fehlvorstellungen', 'Noch nicht behandelt'])
  pruefe(text.includes(gruppe), `Gruppe „${gruppe}“`)
pruefe((await chips.getByRole('button', { name: 'Mit KI ergänzen' }).count()) === 1, 'Der KI-Knopf ist da (wird nicht gedrückt)')

const bruch = chips.locator('button[data-art="fach"]', { hasText: 'Bruchrechnung' })
pruefe((await bruch.count()) === 1, 'Zur Prozentrechnung wird die Bruchrechnung vorgeschlagen')
pruefe((await bruch.getAttribute('data-sicher')) === 'ja', 'Sie gilt in Bayern Kl. 7 als belegt (grün)')
pruefe(((await bruch.getAttribute('title')) ?? '').includes('LehrplanPLUS'), 'Die Herkunft steht dabei')
await chips.scrollIntoViewIfNeeded()
await page.screenshot({ path: join(out, 'arbeitsblatt.png') })

await bruch.click()
await page.waitForTimeout(500)
pruefe((await feld()).includes('Bruchrechnung'), 'Ein Klick übernimmt den Vorschlag ins Feld')
pruefe((await chips.locator('button[data-art="fach"]', { hasText: 'Bruchrechnung' }).count()) === 0, 'Der übernommene Chip verschwindet')

const fehl = chips.locator('button[data-art="fehlvorstellung"]').first()
const fehlText = (await fehl.innerText()).trim()
await fehl.click()
await page.waitForTimeout(500)
pruefe((await feld()).includes(`Fehlvorstellung: ${fehlText}`), `Fehlvorstellungen kommen mit Vorsilbe ins Feld („${fehlText.slice(0, 40)}…“)`)

// ---------------------------------------------------------------- 2. Reagiert auf Land und Jahrgang
await setzeMeta({ subjectId: 'politik', subjectLabel: 'Politik', topic: 'Der Bundestag', grade: 8, stateId: 'BY', priorKnowledge: '' })
const politik = (await chips.count()) ? await chips.innerText() : ''
pruefe(politik.includes('erst in Klasse 10'), 'Politik in Bayern Kl. 8: Hinweis, dass Sozialkunde erst in Klasse 10 beginnt')
await setzeMeta({ grade: 10 })
const politik10 = (await chips.count()) ? await chips.innerText() : ''
pruefe(
  !politik10.includes('erst in Klasse 10') && politik10.includes('Gewaltenteilung'),
  'In Klasse 10 verschwindet der Hinweis, Gewaltenteilung wird vorgeschlagen'
)

// ---------------------------------------------------------------- 3. Klassenarbeit und Kurztest
const oeffne = async (namen) => {
  for (const n of namen) {
    const k = page.locator(`[aria-label="${n}"]`)
    if (await k.count()) {
      await k.first().click()
      await page.waitForTimeout(1500)
      return true
    }
  }
  return false
}

pruefe(await oeffne(['Klassenarbeit', 'Klassenarbeiten']), 'Klassenarbeit geöffnet')
const kaGesetzt = await page.evaluate(() =>
  window.__selftest.kaMetaSetzen({ subjectId: 'geschichte', subjectLabel: 'Geschichte', topic: 'Die Weimarer Republik', grade: 9, content: '' })
)
await page.waitForTimeout(1200)
const kaChips = page.locator('[data-testid="vorwissen-chips"]').filter({ visible: true })
const kaText = kaGesetzt && (await kaChips.count()) ? await kaChips.innerText() : ''
pruefe(kaText.includes('Krisenjahr 1923'), 'Klassenarbeit: typische Inhalte der Einheit werden vorgeschlagen')
pruefe(!kaText.includes('Noch nicht behandelt'), 'Klassenarbeit: keine Vorwissensgruppen, weil das Feld den Stoff meint')
if (await kaChips.count()) {
  await kaChips.scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(out, 'klassenarbeit.png') })
}

pruefe(await oeffne(['Lernzielkontrolle']), 'Lernzielkontrolle geöffnet')
const lzkGesetzt = await page.evaluate(() =>
  window.__selftest.lzkMetaSetzen({ subjectId: 'mathematik', subjectLabel: 'Mathematik', thema: 'Lineare Gleichungen', grade: 7, stoff: '' })
)
await page.waitForTimeout(1200)
const lzkChips = page.locator('[data-testid="vorwissen-chips"]').filter({ visible: true })
const lzkText = lzkGesetzt && (await lzkChips.count()) ? await lzkChips.innerText() : ''
pruefe(lzkText.includes('Äquivalenzumformungen'), 'Kurztest: typische Inhalte werden vorgeschlagen')

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nVorschläge erscheinen, reagieren und lassen sich übernehmen. Bilder in ${out}`)
