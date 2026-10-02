// Zellen markieren und angleichen – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/tabelle-angleichen.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (02.10.2026): Spalten/Zeilen/Zellen markieren, Rechtsklick → Kreismenü,
// z. B. „Spaltenbreite angleichen" oder „Zeilenhöhe angleichen" – NUR die markierten werden
// angeglichen (render/tabellenAuswahl.tsx). Geprüft am echten Blatt mit der breiten Tabelle.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/tabelle-angleichen')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-angleichen-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
try {
  const page = await app.firstWindow()
  await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.setSize(1600, 1050)
    win?.center()
  })
  await warteAufOberflaeche(page)
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__selftest.wsBreiteTabelle())
  await page.waitForTimeout(2500)

  const SICHTBAR = '.ws-page:not(.ws-measure *) .ws-table-ziehbar'
  const tabelle = page.locator(SICHTBAR).first()
  await tabelle.scrollIntoViewIfNeeded()
  const masse = () =>
    page.evaluate((sel) => {
      const t = document.querySelector(sel)
      return {
        cols: [...(t?.querySelectorAll('colgroup col') ?? [])].map((c) => parseFloat(c.style.width)),
        hoehen: [...(t?.querySelectorAll('tbody tr') ?? [])].map((r) => r.style.height)
      }
    }, SICHTBAR)
  const zelle = (r, c) => tabelle.locator('tbody tr').nth(r).locator('td').nth(c)
  const mitte = async (loc) => {
    const b = await loc.boundingBox()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }
  const markiere = async (a, b) => {
    const p = await mitte(a)
    const q = await mitte(b)
    await page.mouse.move(p.x, p.y)
    await page.mouse.down()
    await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, { steps: 4 })
    await page.mouse.move(q.x, q.y, { steps: 4 })
    await page.mouse.up()
  }

  // Ungleiche Spalten herstellen: Linie hinter Spalte 1 nach rechts ziehen
  const griff = tabelle.locator('thead .ws-spalten-griff').first()
  const g = await griff.boundingBox()
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await page.mouse.down()
  await page.mouse.move(g.x + 90, g.y + g.height / 2, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(800)
  const vorher = await masse()
  pruefe(vorher.cols.length >= 3 && vorher.cols[0] > vorher.cols[1] + 3, `Ausgangslage ungleich (${vorher.cols.map((c) => c.toFixed(1)).join(' / ')})`)

  // Spalten 1–2 markieren (Zeilen 0–1), Rechtsklick → Spaltenbreite angleichen
  await markiere(zelle(0, 0), zelle(1, 1))
  const markiert = await page.locator(`${SICHTBAR} .ws-zelle-markiert`).count()
  pruefe(markiert === 4, `vier Zellen markiert (${markiert})`)
  const m = await mitte(zelle(1, 1))
  await page.waitForTimeout(300)
  await page.mouse.click(m.x, m.y, { button: 'right' })
  const offen = await page
    .locator('[data-tabellen-kreis]')
    .waitFor({ state: 'attached', timeout: 5000 })
    .then(
      () => true,
      () => false
    )
  if (!offen) {
    await page.screenshot({ path: join(out, '0-kein-menue.png') })
    console.log('markiert nach Rechtsklick:', await page.locator('.ws-zelle-markiert').count())
    throw new Error('Kreismenü ging nicht auf')
  }
  await page.screenshot({ path: join(out, '1-kreismenue.png') })
  pruefe(await page.locator('[data-tabelle-aktion="spalten"]').isVisible(), 'Kreismenü bietet „Spaltenbreite angleichen"')
  await page.locator('[data-tabelle-aktion="spalten"]').click()
  await page.waitForTimeout(800)
  const nach = await masse()
  pruefe(Math.abs(nach.cols[0] - nach.cols[1]) <= 0.1, `markierte Spalten gleich breit (${nach.cols.map((c) => c.toFixed(1)).join(' / ')})`)
  pruefe(Math.abs(nach.cols[0] + nach.cols[1] - (vorher.cols[0] + vorher.cols[1])) < 0.3, 'zusammen so breit wie vorher')
  pruefe(
    nach.cols.slice(2).every((w, i) => Math.abs(w - vorher.cols[i + 2]) < 0.3),
    'übrige Spalten unverändert'
  )
  pruefe((await page.locator(`${SICHTBAR} .ws-zelle-markiert`).count()) === 0, 'Markierung danach aufgehoben')

  // Zeilen: erste Zeile hoch ziehen, dann Zeilen 0–2 in Spalte 0 angleichen
  const zg = tabelle.locator('tbody tr').first().locator('.ws-zeilen-griff').first()
  const z = await zg.boundingBox()
  await page.mouse.move(z.x + 20, z.y + z.height / 2)
  await page.mouse.down()
  await page.mouse.move(z.x + 20, z.y + 70, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(800)
  const zeilenZahl = (await masse()).hoehen.length
  await markiere(zelle(0, 0), zelle(2, 0))
  const m2 = await mitte(zelle(1, 0))
  await page.mouse.click(m2.x, m2.y, { button: 'right' })
  await page.locator('[data-tabelle-aktion="zeilen"]').click({ timeout: 5000 })
  await page.waitForTimeout(800)
  const z2 = await masse()
  pruefe(z2.hoehen[0] && z2.hoehen[0] === z2.hoehen[1] && z2.hoehen[1] === z2.hoehen[2], `Zeilen 1–3 gleich hoch (${z2.hoehen.slice(0, 4).join(', ')})`)
  pruefe(zeilenZahl < 4 || !z2.hoehen[3], 'Zeile 4 unverändert (nach Inhalt)')
  await page.screenshot({ path: join(out, '2-zeilen.png') })

  // Ein Rückgängig-Schritt nimmt die ganze Angleichung zurück
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(800)
  const z3 = await masse()
  pruefe(!z3.hoehen[1] && !z3.hoehen[2], `Strg+Z nimmt das Angleichen in einem Schritt zurück (${z3.hoehen.slice(0, 3).join(', ')})`)
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
} finally {
  await app.close().catch(() => undefined)
  rmSync(userData, { recursive: true, force: true })
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
