// Wache für die HINWEISE FÜR DIE LEHRKRAFT (vorher: npm run build).
// Aufruf: node tests/e2e/hinweise.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (25.09.2026): „nach erstellung von material sind die rot/orangenen
// kästen mit warnhinweisen für die nutzer inzwischen sehr lang. Mach es aufrufbar über ein
// rotes Ausrufezeichen Symbol (das dann ein pop-up fenster öffnet). Zeige die Warnhinweise
// nicht mehr nach Erstellung der materialien, nur über das symbol."
//
// Geprüft wird beides: Der Kasten über dem Blatt ist weg, UND die Hinweise sind über das
// Symbol noch erreichbar. Nur zu verschwinden wäre die schlechtere Hälfte der Lösung.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/hinweise')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-hinweise-'))
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
await page.evaluate(() => window.__selftest.wsMaterialtext(6))
await page.waitForTimeout(2500)

const symbol = page.locator('[aria-label="Hinweise für die Lehrkraft anzeigen"]')
pruefe((await symbol.count()) === 0, 'Ohne Hinweise erscheint kein Symbol')

// Einen Hinweis der KI setzen, wie er nach der Erstellung entsteht
const HINWEIS = 'Thema und Jahrgang passen nur bedingt zusammen; bitte vor dem Einsatz prüfen.'
await page.evaluate((text) => {
  const ws = structuredClone(window.__selftest.worksheetJetzt())
  ws.meta.teacherNote = text
  window.__selftest.setWorksheet(ws)
}, HINWEIS)
await page.waitForTimeout(2000)

// Der Kasten darf NICHT mehr über dem Blatt stehen
const imFluss = await page.evaluate(
  (text) => [...document.querySelectorAll('.editor-canvas .mantine-Alert-root')].some((a) => (a.innerText ?? '').includes(text.slice(0, 30))),
  HINWEIS
)
pruefe(!imFluss, 'Der Hinweis steht nicht mehr als Kasten über dem Blatt')
pruefe((await symbol.count()) === 1, 'Stattdessen erscheint das rote Ausrufezeichen')

const farbe = await symbol.evaluate((el) => getComputedStyle(el).color)
console.log(`Farbe des Symbols: ${farbe}`)

// Klick öffnet das Fenster mit dem Wortlaut
await symbol.click()
await page.waitForTimeout(800)
const fenster = page.locator('.mantine-Modal-content', { hasText: 'Hinweise für die Lehrkraft' })
pruefe((await fenster.count()) > 0, 'Der Klick öffnet ein Fenster')
pruefe((await fenster.innerText()).includes(HINWEIS), 'Darin steht der Hinweis im Wortlaut')

await page.screenshot({ path: join(out, 'hinweise.png') })
await fenster.getByRole('button', { name: 'Schließen', exact: true }).click()
await page.waitForTimeout(600)
pruefe((await page.locator('.mantine-Modal-content').count()) === 0, 'Es lässt sich wieder schließen')

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nDie Hinweise stehen hinter dem Symbol statt im Blattfluss. Bild in ${out}`)
