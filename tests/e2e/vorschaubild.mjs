// Vorschaubild für Arbeitsblätter, die ohne offenen Editor fertig wurden (02.10.2026, Befund der
// Lehrkraft: „Keine Vorschau möglich" bei einem fertigen Blatt). Exe (Entwicklungsbau), eigenes Profil.
// Aufruf: node tests/e2e/vorschaubild.mjs <Ausgabeordner>
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/vorschaubild')
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const userData = mkdtempSync(join(tmpdir(), 'schulapps-vorschaubild-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
try {
  let page = null
  for (let i = 0; i < 60 && !page; i++) {
    for (const w of app.windows()) if (await w.evaluate(() => Boolean(window.api)).catch(() => false)) page = w
    if (!page) await new Promise((r) => setTimeout(r, 500))
  }
  page.on('console', (m) => m.type() !== 'log' && console.log('    Konsole:', m.text().slice(0, 300)))
  await page.waitForTimeout(1500)
  const spaeter = page.getByRole('button', { name: /Später/ })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  // Ein fertiges Blatt ohne Vorschaubild – so landete es nach dem Erzeugen im Hintergrund
  // Vorlage: das jüngste echte Arbeitsblatt aus dem lokalen Profil (nur gelesen, landet im Wegwerf-Profil)
  const ordner = join(process.env.APPDATA ?? '', 'schul-apps', 'arbeitsblaetter')
  const datei = readdirSync(ordner).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => join(ordner, f)).sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)[0]
  const vorlage = JSON.parse(readFileSync(datei, 'utf8'))
  await page.evaluate(async (ws) => {
    await window.api.sheets.save({ id: 'vorschau-probe', name: 'Vorschau-Probe', stats: { subjectLabel: ws.meta.subjectLabel, sheetCount: ws.sheets.length }, payload: ws })
  }, vorlage.payload)
  await page.locator('.app-leiste [aria-label="Arbeitsblatt"]').click()
  await page.getByRole('button', { name: /Meine Arbeitsblätter/ }).first().click()
  const karte = page.locator('[data-bibliothek-eintrag="Vorschau-Probe"]')
  await karte.waitFor({ timeout: 15000 })
  const bild = await karte.locator('img').first().waitFor({ timeout: 30000 }).then(() => true, () => false)
  pruefe(bild, 'Bibliothek trägt das fehlende Vorschaubild nach')
  const meta = await page.evaluate(async () => (await window.api.sheets.list()).find((m) => m.id === 'vorschau-probe'))
  pruefe(Boolean(meta?.thumb?.startsWith('data:image/')), 'Vorschaubild ist gespeichert')
  await page.screenshot({ path: join(out, '1-bibliothek.png') })
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
