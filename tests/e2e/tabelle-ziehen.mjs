// Wache für das ZIEHEN von Tabellenmaßen – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/tabelle-ziehen.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (27.09.2026): Spalten breiter/schmaler und Zeilen höher/niedriger
// ziehen; das Blatt passt sich an. Geprüft wird am echten Blatt: Nach dem Ziehen an der
// Spaltenlinie trägt die erste Spalte mehr Prozent, nach dem Ziehen an der Zeilenlinie hat die
// Zeile eine feste Höhe, und die Messfläche zeigt dieselben Maße (also bricht das Blatt danach um).
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/tabelle-ziehen')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-tabelle-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1600, 1050)
    win.center()
  }
})
await warteAufOberflaeche(page)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)
await page.evaluate(() => window.__selftest.wsBreiteTabelle())
await page.waitForTimeout(2500)

const SICHTBAR = '.ws-page:not(.ws-measure *) .ws-table-ziehbar'
const masse = async () =>
  page.evaluate((sel) => {
    const t = document.querySelector(sel)
    const cols = [...(t?.querySelectorAll('colgroup col') ?? [])].map((c) => parseFloat(c.style.width))
    const zeile = t?.querySelector('tbody tr')
    const mess = document.querySelector('.ws-measure .ws-table')
    const messCols = [...(mess?.querySelectorAll('colgroup col') ?? [])].map((c) => parseFloat(c.style.width))
    return {
      cols,
      breite: t?.style.width ?? '',
      zeilenHoehe: zeile?.style.height ?? '',
      messCols,
      seiten: [...document.querySelectorAll('.ws-page')].filter((el) => !el.closest('.ws-measure') && el.getBoundingClientRect().height > 0).length
    }
  }, SICHTBAR)

const vorher = await masse()
pruefe(vorher.cols.length === 0, `ohne Ziehen keine festen Spaltenbreiten (${vorher.cols.length} Spaltenangaben)`)
await page.locator(SICHTBAR).first().scrollIntoViewIfNeeded()

// Spaltenlinie hinter der ersten Spalte nach rechts ziehen
const griff = page.locator(`${SICHTBAR} thead .ws-spalten-griff`).first()
const g = await griff.boundingBox()
pruefe(Boolean(g), 'Spaltengriff ist da')
await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
await page.mouse.down()
await page.mouse.move(g.x + 40, g.y + g.height / 2, { steps: 5 })
await page.mouse.move(g.x + 80, g.y + g.height / 2, { steps: 5 })
await page.mouse.up()
await page.waitForTimeout(800)
const nachSpalte = await masse()
pruefe(
  nachSpalte.cols.length >= 2 && nachSpalte.cols[0] > 100 / nachSpalte.cols.length + 3,
  `erste Spalte breiter (${nachSpalte.cols.map((c) => c.toFixed(1)).join(' / ')} %)`
)
pruefe(Math.abs(nachSpalte.cols.reduce((a, b) => a + b, 0) - 100) < 0.5, 'Spalten ergeben zusammen 100 %')
pruefe(
  nachSpalte.messCols.length === nachSpalte.cols.length && Math.abs(nachSpalte.messCols[0] - nachSpalte.cols[0]) < 0.2,
  'die Messfläche rechnet mit denselben Spaltenbreiten (das Blatt bricht danach um)'
)

// Zeilenlinie der ersten Zeile nach unten ziehen
const zg = page.locator(`${SICHTBAR} tbody tr`).first().locator('.ws-zeilen-griff').first()
const z = await zg.boundingBox()
pruefe(Boolean(z), 'Zeilengriff ist da')
await page.mouse.move(z.x + 20, z.y + z.height / 2)
await page.mouse.down()
await page.mouse.move(z.x + 20, z.y + 30, { steps: 5 })
await page.mouse.move(z.x + 20, z.y + 60, { steps: 5 })
await page.mouse.up()
await page.waitForTimeout(800)
const nachZeile = await masse()
pruefe(/mm$/.test(nachZeile.zeilenHoehe) && parseFloat(nachZeile.zeilenHoehe) >= 5, `erste Zeile hat eine feste Höhe (${nachZeile.zeilenHoehe})`)
pruefe(nachZeile.seiten >= vorher.seiten, `Seiten: vorher ${vorher.seiten}, nachher ${nachZeile.seiten}`)

// Strg+Z nimmt das letzte Ziehen zurück
await page.keyboard.press('Control+z')
await page.waitForTimeout(600)
const nachUndo = await masse()
pruefe(nachUndo.zeilenHoehe === '', `Strg+Z nimmt die Zeilenhöhe zurück (${nachUndo.zeilenHoehe || 'automatisch'})`)

await page.locator(SICHTBAR).first().scrollIntoViewIfNeeded()
await page.screenshot({ path: join(out, 'tabelle.png') })
await app.close()
rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
if (problems.length) {
  console.error(`\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('\nAlle Prüfungen bestanden.')
