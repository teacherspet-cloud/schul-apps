import { _electron as electron } from 'playwright-core'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'
const out = resolve('test-results/dubletten')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-dubl-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
const page = await app.firstWindow()
await app.evaluate(async ({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0]
  if (w) {
    w.setSize(1500, 1000)
    w.center()
  }
})
await warteAufOberflaeche(page)
await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(900)
const feld = (n) => page.getByLabel(n, { exact: true }).filter({ visible: true }).first()
const waehle = async (l, o) => {
  await feld(l).click()
  await page.getByRole('option', { name: o, exact: true }).click()
  await page.waitForTimeout(350)
}
await waehle('Fach', 'Englisch')
await waehle('Jahrgang', 'Klasse 5')
await page.waitForTimeout(700)
await page
  .getByRole('button', { name: /Vokabellisten und Wörter wählen/ })
  .filter({ visible: true })
  .first()
  .click()
await page.waitForSelector('text=Vokabeln für dieses Arbeitsblatt', { timeout: 15000 })
await page.waitForTimeout(600)
const zustand = async (wo) => {
  const s = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')
    const sw = [...d.querySelectorAll('input[type="checkbox"]')].map((c) => ({
      t: (c.closest('label')?.textContent ?? '').slice(0, 40),
      an: c.checked,
      aus: c.disabled
    }))
    return {
      buch: d.querySelector('input[value*="Green"]')?.value ?? '?',
      knopf: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()).find((t) => /Vokabeln|Unit und/.test(t)) ?? '',
      schalter: sw.filter((x) => /Kästen|Grau|Erklärte/.test(x.t))
    }
  })
  console.log(`[${wo}] Buch=${s.buch} Knopf="${s.knopf}"`)
  for (const x of s.schalter) console.log(`   Schalter ${x.an ? 'AN ' : 'aus'}${x.aus ? ' (gesperrt)' : ''}: ${x.t}`)
}
await zustand('nach Öffnen')
const units = page.getByLabel('Units', { exact: true }).filter({ visible: true }).first()
await units.click()
await page.waitForSelector('[role="option"]:visible')
await page.getByRole('option', { name: 'Hello', exact: true }).click()
await page.waitForTimeout(300)
await page.getByRole('option', { name: 'Unit 1', exact: true }).click()
await page.waitForTimeout(300)
await page.keyboard.press('Escape')
await page.waitForTimeout(600)
await zustand('Units gewählt')
for (const t of ['Kästen', 'Grau']) {
  const sw = page.locator('[role="dialog"] input[type="checkbox"]').filter({ hasNot: page.locator('x') })
  const n = await sw.count()
  for (let i = 0; i < n; i++) {
    const el = sw.nth(i)
    const label = await el.evaluate((c) => c.closest('label')?.textContent ?? '')
    if (label.includes(t) && (await el.isEnabled()) && !(await el.isChecked())) {
      await el.check({ force: true })
      await page.waitForTimeout(400)
    }
  }
}
await zustand('Schalter gesetzt')
await page.screenshot({ path: join(out, 'vor-dem-holen.png') })
await page
  .getByRole('button', { name: /Vokabeln anzeigen und auswählen/ })
  .first()
  .click()
await page.waitForTimeout(2000)
const m = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]')
  const zeilen = [...d.querySelectorAll('tbody tr')]
  const begriffe = zeilen.map((r) => r.children[1]?.textContent?.trim() ?? '')
  const klein = begriffe.map((t) => t.toLowerCase())
  return {
    zeilen: zeilen.length,
    verschieden: new Set(klein).size,
    abzeichen: d.textContent.match(/\d+ von \d+ gewählt/)?.[0] ?? '',
    doppelt: [...new Set(klein.filter((t, i) => klein.indexOf(t) !== i))].slice(0, 6)
  }
})
console.log(`ERGEBNIS Zeilen=${m.zeilen} verschieden=${m.verschieden} Abzeichen="${m.abzeichen}"`)
console.log('Doppelte:', m.doppelt.join(', ') || 'keine')
await page.screenshot({ path: join(out, 'nach-dem-holen.png') })
await app.close()
rmSync(userData, { recursive: true, force: true })
