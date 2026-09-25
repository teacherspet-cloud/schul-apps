// Wache für den ZAUBERSTAB am leeren Baustein (vorher: npm run build).
// Aufruf: node tests/e2e/zauberstab.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (25.09.2026): „füge einen zauberstab in ‚bearbeiten & export' bei einem
// noch leeren baustein hinzu, wodurch der inhalt hier von einer KI gefüllt wird."
//
// Geprüft wird, WO der Knopf erscheint: nur am leeren Baustein, nicht am gefüllten und nicht
// im Lösungsteil. Der Klick selbst bleibt aus – er würde die KI rufen und Kontingent kosten.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/zauberstab')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-zauber-'))
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

const zauberstaebe = () => page.locator('[aria-label="Baustein von der KI füllen lassen"]').count()

pruefe((await zauberstaebe()) === 0, 'Am gefüllten Materialtext gibt es keinen Zauberstab')

// Einen leeren Baustein hinzufügen – so, wie es die Lehrkraft tut
const plus = page.getByRole('button', { name: 'Baustein hinzufügen' }).first()
pruefe((await plus.count()) > 0, 'Der Knopf zum Hinzufügen ist da')
// Er steht unter den Seiten – ohne Scrollen ist er nicht anklickbar
await plus.scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
await plus.click()
await page.waitForTimeout(800)
const eintrag = page.locator('.mantine-Menu-item', { hasText: 'Merkkasten' }).first()
await eintrag.click()
await page.waitForTimeout(2000)

const anzahl = await zauberstaebe()
console.log(`Zauberstäbe nach dem Einfügen: ${anzahl}`)
pruefe(anzahl === 1, `Der leere Baustein bekommt genau einen Zauberstab (${anzahl})`)

// Er sitzt am neuen Baustein, nicht irgendwo
const amRichtigen = await page.evaluate(() => {
  const knopf = document.querySelector('[aria-label="Baustein von der KI füllen lassen"]')
  const rahmen = knopf?.closest('.editor-block')
  return Boolean(rahmen && (rahmen.innerText ?? '').includes('Merke'))
})
pruefe(amRichtigen, 'Er sitzt am neu eingefügten Kasten')
await page.locator('[aria-label="Baustein von der KI füllen lassen"]').first().scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
await page.screenshot({ path: join(out, 'mit-zauberstab.png') })

// Sobald Inhalt darin steht, verschwindet er wieder
await page.evaluate(() => {
  const ws = window.__selftest.worksheetJetzt()
  const kasten = ws.sheets[0].blocks.find((b) => b.type === 'infoBox')
  kasten.body = 'Die Weimarer Republik war die erste Demokratie auf deutschem Boden.'
  window.__selftest.setWorksheet(ws)
})
await page.waitForTimeout(2000)
const nachher = await zauberstaebe()
pruefe(nachher === 0, `Sobald Inhalt darin steht, verschwindet der Zauberstab (${nachher})`)

await page.screenshot({ path: join(out, 'zauberstab.png') })
await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nDer Zauberstab erscheint genau am leeren Baustein. Bild in ${out}`)
