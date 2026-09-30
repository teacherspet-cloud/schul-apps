// Wache für das NACHJUSTIEREN von Bildbeschriftungen (vorher: npm run build).
// Aufruf: node tests/e2e/beschriftungZiehen.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (30.09.2026): „Die runden Punkte mit ihren Linien frei verschieben, um
// nachzujustieren." Geprüft am gebauten Programm: Punkt und Schild lassen sich unabhängig ziehen,
// die Linie folgt, ein Zug ist ein Rückgängig-Schritt, Pfeiltasten schieben, „Automatische Lage"
// stellt zurück, und das Druck-HTML übernimmt die gezogene Lage.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/beschriftung-ziehen')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-ziehen-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
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
await page.evaluate(() => window.__selftest.wsMaterialtext(2))
await page.waitForTimeout(2000)

const LABELS = [
  { id: 'a', text: 'Zellkern', x: 30, y: 30 },
  { id: 'b', text: 'Zellwand', x: 60, y: 55 },
  { id: 'c', text: 'Vakuole', x: 45, y: 75 }
]
await page.evaluate((labels) => {
  const ws = window.__selftest.worksheetJetzt()
  const c = document.createElement('canvas')
  c.width = 800
  c.height = 600
  const g = c.getContext('2d')
  g.fillStyle = '#eef3ee'
  g.fillRect(0, 0, 800, 600)
  g.strokeStyle = '#686'
  g.lineWidth = 6
  g.strokeRect(60, 60, 680, 480)
  ws.sheets[0].blocks.splice(1, 0, {
    id: 'zelle',
    type: 'image',
    role: 'material',
    side: 'none',
    description: 'Pflanzenzelle',
    caption: 'Pflanzenzelle',
    widthPercent: 80,
    image: { dataUrl: c.toDataURL('image/png'), source: 'own', credit: 'Prüfstand' },
    labels
  })
  window.__selftest.setWorksheet(structuredClone(ws))
}, LABELS)
await page.waitForTimeout(2500)

const label = (id) => page.evaluate((i) => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.id === 'zelle').labels.find((l) => l.id === i), id)
const fig = page.locator('.ws-editor-pages .ws-image:has([data-griff])').first()
await fig.scrollIntoViewIfNeeded()
const griff = (id, was) => fig.locator(`[data-griff="${was}"][data-label-id="${id}"]`).first()

/** Zug mit der Maus in kleinen Schritten – die Linie muss unterwegs folgen */
async function ziehe(loc, dx, dy) {
  const r = await loc.boundingBox()
  const x = r.x + r.width / 2
  const y = r.y + r.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8)
  const unterwegs = await fig.locator('.ws-imglabel-lines polyline').evaluateAll((ps) => ps.map((p) => p.getAttribute('points')))
  await page.mouse.up()
  await page.waitForTimeout(300)
  return unterwegs
}

// 1. Punkt frei ziehen – die Linie folgt schon während des Zuges
const vorher = await label('b')
const linieVorher = await fig.locator('.ws-imglabel-lines polyline').evaluateAll((ps) => ps.map((p) => p.getAttribute('points')))
const unterwegs = await ziehe(griff('b', 'punkt'), 80, -60)
const nachPunkt = await label('b')
pruefe(nachPunkt.x > vorher.x + 3 && nachPunkt.y < vorher.y - 3, `Punkt verschoben (${vorher.x}/${vorher.y} → ${nachPunkt.x}/${nachPunkt.y})`)
pruefe(nachPunkt.ursprung?.x === vorher.x, 'Automatische Lage gemerkt')
pruefe(JSON.stringify(unterwegs) !== JSON.stringify(linieVorher), 'Linie folgt live während des Zuges')

// 2. Schild unabhängig ziehen
const unterwegsSchild = await ziehe(griff('c', 'schild'), 0, -70)
const nachSchild = await label('c')
pruefe(typeof nachSchild.schild?.y === 'number' && nachSchild.x === 45 && nachSchild.y === 75, `Schild verschoben, Punkt bleibt (Schild bei ${nachSchild.schild?.y?.toFixed(1)} %)`)
pruefe(unterwegsSchild.length === 3, 'Alle Linien bleiben sichtbar')
await fig.screenshot({ path: join(out, 'beschriftung-gezogen.png') })

// 3. Druck-HTML übernimmt die gezogene Lage
const druck = await page.evaluate(() => window.__selftest.printHtmlNow?.() ?? null)
if (druck) pruefe(druck.includes(`top:${nachSchild.schild.y}%`), 'Druck-HTML zeigt das Schild an der gezogenen Stelle')

// 4. Rückgängig: ein Zug = ein Schritt
await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {})
await page.keyboard.press('Control+z')
await page.waitForTimeout(400)
pruefe(!(await label('c')).schild, 'Strg+Z nimmt den Schild-Zug zurück')
await page.keyboard.press('Control+z')
await page.waitForTimeout(400)
const zurueck = await label('b')
pruefe(zurueck.x === vorher.x && zurueck.y === vorher.y, 'Zweites Strg+Z nimmt den Punkt-Zug zurück')

// 5. Pfeiltasten schieben den gewählten Punkt
await griff('a', 'punkt').focus()
await page.keyboard.press('ArrowRight')
await page.keyboard.press('Shift+ArrowDown')
await page.waitForTimeout(300)
const tasten = await label('a')
pruefe(tasten.x === 30.5 && tasten.y === 32, `Pfeiltasten: 30/30 → ${tasten.x}/${tasten.y}`)

// 6. „Automatische Lage" stellt zurück
const knopf = fig.locator('xpath=..').locator('button:has-text("Automatische Lage")').first()
pruefe((await knopf.count()) > 0, 'Werkzeugleiste zum gewählten Schild ist sichtbar')
if (await knopf.count()) {
  await knopf.click()
  await page.waitForTimeout(300)
  const auto = await label('a')
  pruefe(auto.x === 30 && auto.y === 30 && !auto.ursprung, 'Automatische Lage stellt den Punkt zurück')
}
await fig.screenshot({ path: join(out, 'beschriftung-zurueck.png') })

await app.close()
rmSync(userData, { recursive: true, force: true })
if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
