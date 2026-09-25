// Wache für den BILINGUALEN SACHFACHUNTERRICHT (vorher: npm run build).
// Aufruf: node tests/e2e/bilingual.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (25.09.2026): bilingualen Sachfachunterricht so einbinden, „dass er
// einwandfrei funktioniert". Die Regeln prüfen die Einheitstests (tests/bilingual.test.ts);
// hier geht es um das, was nur die laufende App zeigt:
//
// 1. Der Schalter steht beim Sachfach – und NUR dort.
// 2. Eingeschaltet erscheinen Arbeitssprache, Form und die Bewertungsregel des Landes.
// 3. Das Glossar zeigt die deutsche Spalte auch bei einem Kurs, der sonst einsprachig wäre.
//
// Es wird nichts erzeugt und nichts gespeichert: kein KI-Aufruf, eigenes leeres Profil.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/bilingual')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-bilingual-'))
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

const setzeFach = async (fachId, label, bilingual) => {
  await page.evaluate(
    ([id, name, bi]) => {
      const ws = window.__selftest.worksheetJetzt()
      ws.meta.subjectId = id
      ws.meta.subjectLabel = name
      ws.meta.stateId = 'NW'
      ws.meta.bilingual = bi ?? undefined
      window.__selftest.setWorksheet(ws, 0)
    },
    [fachId, label, bilingual]
  )
  await page.waitForTimeout(1500)
}
const schalter = () => page.getByRole('switch', { name: 'Bilingual unterrichten' })

// ---------------------------------------------------------------- 1. Nur beim Sachfach
await setzeFach('englisch', 'Englisch')
pruefe((await schalter().count()) === 0, 'In Englisch gibt es keinen Bilingual-Schalter')
await setzeFach('latein', 'Latein')
pruefe((await schalter().count()) === 0, 'In Latein auch nicht')
await setzeFach('geschichte', 'Geschichte')
pruefe((await schalter().count()) === 1, 'In Geschichte steht er')

// ---------------------------------------------------------------- 2. Einschalten
await schalter().scrollIntoViewIfNeeded()
await schalter().click({ force: true })
await page.waitForTimeout(800)
const meta = await page.evaluate(() => window.__selftest.worksheetJetzt().meta.bilingual)
console.log(`meta.bilingual: ${JSON.stringify(meta)}`)
pruefe(meta?.an === true && meta?.sprache === 'en', 'Der Schalter setzt Englisch als Arbeitssprache')
const labels = await page.evaluate(() => [...document.querySelectorAll('label')].map((l) => l.textContent?.trim() ?? ''))
pruefe(labels.includes('Arbeitssprache'), 'Die Arbeitssprache ist wählbar')
pruefe(labels.includes('Form'), 'Die Form ist wählbar')
const hinweis = page.locator('[data-testid="bilingual-hinweise"]')
const hinweisText = (await hinweis.count()) ? await hinweis.innerText() : ''
pruefe(hinweisText.includes('20 %'), 'Die Bewertungsregel von NRW erscheint (Darstellungsleistung höchstens 20 %)')
await hinweis.scrollIntoViewIfNeeded().catch(() => {})
await page.screenshot({ path: join(out, 'schalter.png') })

// Mathematik bekommt den Sonderhinweis
await setzeFach('mathematik', 'Mathematik', { an: true, sprache: 'fr', spracheLabel: 'Französisch', form: 'modul' })
const mathe = (await hinweis.count()) ? await hinweis.innerText() : ''
pruefe(mathe.includes('Sonderfall'), 'Mathematik bekommt den Sonderhinweis')

// ---------------------------------------------------------------- 3. Glossar mit deutscher Spalte
/*
 * Jahrgang 12, C1: Ein Englisch-Kurs bekäme hier KEINE deutschen Entsprechungen mehr.
 * Bilingual muss die deutsche Spalte trotzdem stehen – „Bilingual sticht".
 */
await page.evaluate(() => {
  const ws = window.__selftest.worksheetJetzt()
  ws.meta.subjectId = 'geschichte'
  ws.meta.subjectLabel = 'Geschichte'
  ws.meta.grade = 12
  ws.meta.cefrLevel = 'C1'
  ws.meta.bilingual = { an: true, sprache: 'en', spracheLabel: 'Englisch', form: 'sachfach' }
  const glossar = {
    id: 'glossar-test',
    type: 'phrases',
    title: 'Glossary',
    hint: 'Use these terms in your answers.',
    groups: [{ label: 'Subject terms', items: [{ text: 'armistice', german: 'Waffenstillstand' }] }]
  }
  ws.sheets = [{ ...(ws.sheets[0] ?? { stars: 0 }), blocks: [glossar] }]
  window.__selftest.setWorksheet(ws, 2)
})
await page.waitForTimeout(2500)
const deutsch = await page.evaluate(() => [...document.querySelectorAll('.ws-phrases-de')].map((e) => e.textContent?.trim()))
console.log(`deutsche Spalte: ${JSON.stringify(deutsch)}`)
pruefe(
  deutsch.some((t) => t?.includes('Waffenstillstand')),
  'Das Glossar zeigt den deutschen Fachbegriff auch bei C1 in Jahrgang 12'
)
const glossarEl = page.locator('.ws-phrases-de').first()
if (await glossarEl.count()) {
  await glossarEl.scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(out, 'glossar.png') })
}

// ---------------------------------------------------------------- 4. Klassenarbeit (nur Geschichte)
/*
 * Entscheidungen vom 25.09.2026: Glossar als Hilfsmittel, Aufgabensprache wählbar. Geprüft wird
 * die Oberfläche; erzeugt wird nichts.
 */
for (const n of ['Klassenarbeit', 'Klassenarbeiten']) {
  const k = page.locator(`[aria-label="${n}"]`)
  if (await k.count()) {
    await k.first().click()
    break
  }
}
await page.waitForTimeout(1500)
const kaSchalter = () => page.getByRole('switch', { name: 'Bilingual unterrichten' }).filter({ visible: true })
await page.evaluate(() => window.__selftest.kaMetaSetzen({ subjectId: 'englisch', subjectLabel: 'Englisch', bilingual: undefined, aids: '' }))
await page.waitForTimeout(800)
pruefe((await kaSchalter().count()) === 0, 'Klassenarbeit Englisch: kein Bilingual-Schalter')
await page.evaluate(() =>
  window.__selftest.kaMetaSetzen({ subjectId: 'geschichte', subjectLabel: 'Geschichte', topic: 'Die Weimarer Republik', stateId: 'NW' })
)
await page.waitForTimeout(800)
pruefe((await kaSchalter().count()) === 1, 'Klassenarbeit Geschichte: Schalter vorhanden')
if (await kaSchalter().count()) {
  await kaSchalter().scrollIntoViewIfNeeded()
  await kaSchalter().click({ force: true })
  await page.waitForTimeout(800)
  const kaLabels = await page.evaluate(() => [...document.querySelectorAll('label')].filter((l) => l.offsetParent).map((l) => l.textContent?.trim() ?? ''))
  pruefe(kaLabels.includes('Aufgabenstellungen'), 'Die Sprache der Aufgabenstellungen ist wählbar')
  const kaMeta = await page.evaluate(() => {
    const t = [...document.querySelectorAll('[data-testid="bilingual-hinweise"]')].find((e) => e.offsetParent)?.textContent ?? ''
    return { hinweis: t }
  })
  pruefe(kaMeta.hinweis.includes('Canz'), 'Der Hinweis zur Prüfungssprache steht immer da')
  const aids = await page.evaluate(
    () =>
      [...document.querySelectorAll('input')]
        .filter((i) => i.offsetParent)
        .map((i) => i.value)
        .find((v) => v.includes('Fachglossar')) ?? ''
  )
  pruefe(aids.includes('zweisprachiges Fachglossar'), `Das Glossar steht bei den erlaubten Hilfsmitteln („${aids}")`)
  await page.screenshot({ path: join(out, 'klassenarbeit.png') })
  // Wieder aus: Das Glossar verschwindet aus den Hilfsmitteln
  await kaSchalter().click({ force: true })
  await page.waitForTimeout(600)
  const aidsAus = await page.evaluate(() => [...document.querySelectorAll('input')].filter((i) => i.offsetParent).some((i) => i.value.includes('Fachglossar')))
  pruefe(!aidsAus, 'Ausgeschaltet verschwindet das Glossar aus den Hilfsmitteln')
}

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nSchalter, Hinweise und Glossar stimmen. Bilder in ${out}`)
