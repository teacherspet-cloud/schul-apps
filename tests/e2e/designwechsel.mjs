// Wache: Designvorlage eines fertigen Arbeitsblatts nachträglich wechseln – OHNE KI
// (vorher: npm run build). Aufruf: node tests/e2e/designwechsel.mjs <Ausgabeordner>
//
// Befund der Lehrkraft vom 26.09.2026: Unter „Blattoptionen" stand die Designvorlage ganz unten und
// wurde nicht gefunden. Sie steht jetzt als erstes Feld oben; der Wechsel (z. B. „Klassisch" →
// „Farbband") muss am fertigen Blatt gehen.
// Bildschirmfotos: designwechsel-*.png
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/designwechsel')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-design-'))

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await app.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1500, 1000)
    win.center()
  }
})
const sichtbar = (loc) => loc.filter({ visible: true })
const aktuellesDesign = () =>
  page.evaluate(() => {
    const d = window.__selftest.worksheetJetzt()?.design
    return d ? { id: d.id, name: d.name } : null
  })

try {
  await warteAufOberflaeche(page)
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(800)
  // Ein fertiges Blatt ohne KI in den Editor legen
  await page.evaluate(() => window.__selftest.wsMaterialtext(6))
  await page.waitForTimeout(2000)
  const designs = await page.evaluate(async () => (await window.api.designs.list()).map((d) => ({ id: d.id, name: d.name })))
  console.log(`Vorlagen: ${designs.map((d) => d.name).join(', ')}`)
  const vorher = await aktuellesDesign()
  const ziel = designs.find((d) => d.id !== vorher?.id)
  pruefe(Boolean(ziel), `Eine andere Vorlage steht zur Wahl (${vorher?.name} → ${ziel?.name})`)

  await sichtbar(page.getByRole('button', { name: 'Blattoptionen' }))
    .first()
    .click()
  await page.waitForTimeout(400)
  const feld = sichtbar(page.getByLabel('Designvorlage', { exact: true })).first()
  // Erstes Feld der Blattoptionen, ohne Scrollen sichtbar
  const erstes = await page.evaluate(() => document.querySelector('.blattoptionen label')?.textContent ?? '')
  pruefe(erstes.startsWith('Designvorlage'), `„Designvorlage" steht oben in den Blattoptionen (erstes Feld: „${erstes}")`)
  await page.screenshot({ path: join(out, 'designwechsel-blattoptionen.png') })
  await feld.click()
  await page.waitForTimeout(300)
  await sichtbar(page.getByRole('option', { name: ziel.name, exact: true }))
    .first()
    .click()
  await page.waitForTimeout(800)
  const nachher = await aktuellesDesign()
  pruefe(nachher?.id === ziel.id, `Designvorlage gewechselt (jetzt: ${nachher?.name})`)
  // Das Fenster schließt sich beim Wählen – zum Nachsehen wieder öffnen
  if (!(await feld.isVisible()))
    await sichtbar(page.getByRole('button', { name: 'Blattoptionen' }))
      .first()
      .click()
  await page.waitForTimeout(300)
  const anzeige = await feld.inputValue().catch(() => '')
  pruefe(anzeige === ziel.name, `Die Auswahl zeigt die neue Vorlage („${anzeige}")`)
  await page.screenshot({ path: join(out, 'designwechsel-nachher.png') })

  // Und noch einmal zurück – auch ein zweiter Wechsel muss gehen
  if (!(await feld.isVisible()))
    await sichtbar(page.getByRole('button', { name: 'Blattoptionen' }))
      .first()
      .click()
  await feld.click()
  await sichtbar(page.getByRole('option', { name: vorher.name, exact: true }))
    .first()
    .click()
  await page.waitForTimeout(800)
  pruefe((await aktuellesDesign())?.id === vorher.id, `Zurück zur ursprünglichen Vorlage (${vorher.name})`)
} catch (e) {
  problems.push(`Abbruch der Wache: ${e.message}`)
  await page.screenshot({ path: join(out, 'designwechsel-fehler.png') }).catch(() => undefined)
} finally {
  await Promise.race([app.close().catch(() => undefined), new Promise((r) => setTimeout(r, 10000))])
  try {
    app.process().kill()
  } catch {
    // schon beendet
  }
  await new Promise((r) => setTimeout(r, 500))
  rmSync(userData, { recursive: true, force: true, maxRetries: 5 })
}

const echteFehler = errors.filter((e) => !/ResizeObserver/.test(e))
if (echteFehler.length) problems.push(`Fehler in der Konsole: ${echteFehler.slice(0, 3).join(' | ')}`)
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
