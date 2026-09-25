// Wache gegen einen Absturz, der lange unsichtbar blieb – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/gtest-editor.mjs <Ausgabeordner>
//
// Der Grammatiktest wurde fertig erzeugt, der Editor kam aber nie zum Vorschein: Das Blatt
// wurde bei jedem Rendern neu gebaut, die Messung stieß sich dadurch selbst wieder an
// („Maximum update depth exceeded“). Es erschien nicht einmal eine Fehlermeldung – von außen
// sah es aus, als hinge die KI. Deshalb prüft diese Wache beides: dass Seiten erscheinen UND
// dass das Fenster keinen React-Fehler meldet.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/gtest-editor')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-gtest-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1500, 1000)
    win.center()
  }
})
await warteAufOberflaeche(page)

await page.click('[aria-label="Grammatiktest"]')
await page.waitForTimeout(600)
const info = await page.evaluate(() => window.__selftest.grammarTestSheet())
console.log('Test gesetzt:', info.blocks, 'Bausteine')

await page.waitForSelector('.ws-editor-pages:visible', { timeout: 30000 })
await page.waitForTimeout(1500)

const seen = await page.evaluate(() => ({
  seiten: document.querySelectorAll('.ws-editor-pages .ws-page').length,
  aufgaben: document.querySelectorAll('.ws-editor-pages .ws-task').length,
  text: (document.querySelector('.ws-editor-pages')?.textContent ?? '').slice(0, 200)
}))
console.log('Seiten:', seen.seiten, '· Aufgaben:', seen.aufgaben)
await page.screenshot({ path: join(out, 'test.png'), fullPage: false })

// Lösungsansicht: dort stehen Notenschlüssel und Fehlerprofil
await page.getByText('Lösungen', { exact: true }).first().click()
await page.waitForTimeout(1200)
const key = await page.evaluate(() => document.querySelector('.ws-editor-pages')?.textContent ?? '')
await page.screenshot({ path: join(out, 'loesungen.png'), fullPage: false })

const problems = []
if (!seen.seiten) problems.push('Keine Seite dargestellt')
if (seen.aufgaben < 2) problems.push(`Nur ${seen.aufgaben} Aufgabe(n) dargestellt`)
// Genau der Fehler, der den Editor unsichtbar machte
const react185 = errors.filter((e) => /Maximum update depth|error #185/i.test(e))
if (react185.length) problems.push(`Endlosschleife beim Rendern: ${react185[0].slice(0, 120)}`)
if (errors.length) console.log('Meldungen im Fenster:\n- ' + errors.slice(0, 4).join('\n- '))
console.log('Fehlerprofil im Lösungsteil:', /Fehlerprofil|Stolperstelle/i.test(key) ? 'ja' : 'nein')

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.error('\nProbleme:\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log('\nDer Editor des Grammatiktests baut sich auf. Bilder in', out)
