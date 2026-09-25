// Prüft, ob alle Programme bei verschiedenen Fenstergrößen sauber umbrechen –
// auch in den Arbeitsansichten mit echten A4-Seiten.
// Gemessen wird waagerechtes Überlaufen der Seite und einzelner Elemente.
// Aufruf: node tests/e2e/responsive.mjs <Ausgabeordner>
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

const out = resolve(process.argv[2] ?? 'test-results/fenstergroessen')
mkdirSync(out, { recursive: true })
// Eigener Datenordner: Die Tests dürfen nichts in den gespeicherten Tests,
// Arbeitsblättern und Klassenarbeiten des Nutzers hinterlassen.
const userData = mkdtempSync(join(tmpdir(), 'schulapps-responsive-'))
const app = await electron.launch({
  args: ['.', resolve('tests/fixtures/beispiel.vokabeltest'), `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1' }
})
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.setViewportSize({ width: 1400, height: 900 })
await page.waitForSelector('text=Schul-Apps')

// kleinste erlaubte Fenstergröße (main/index.ts), Standardgröße und ein großes Fenster
const SIZES = [
  { name: 'klein', width: 1000, height: 700 },
  { name: 'standard', width: 1400, height: 900 },
  { name: 'gross', width: 1800, height: 1100 }
]

// Alle Programme einmal mit Inhalt füllen, damit die Arbeitsansichten geprüft werden
await page.click('[aria-label="Arbeitsblatt"]')
const neu = page.getByRole('button', { name: 'Neues Arbeitsblatt' })
if (await neu.isVisible({ timeout: 2000 }).catch(() => false)) await neu.click()
await app.evaluate(({ dialog }, file) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
}, resolve('tests/fixtures/beispiel.arbeitsblatt'))
await page.getByRole('button', { name: 'Gespeichertes Arbeitsblatt öffnen' }).click()
await page.waitForSelector('.ws-editor-pages .ws-page')
await page.click('[aria-label="Klassenarbeiten"]')
await page.evaluate(() => window.__selftest.exam())
// Module bleiben gemountet: auf ein sichtbares Element der Klassenarbeit warten
await page.getByRole('button', { name: 'Meine Klassenarbeiten' }).waitFor()

/** Programme und die Stelle, an der sie geöffnet werden */
const VIEWS = [
  { name: 'start', open: () => page.click('[aria-label="Startseite"]') },
  { name: 'vokabeltest', open: () => page.click('[aria-label="Vokabeltest"]') },
  { name: 'arbeitsblatt', open: () => page.click('[aria-label="Arbeitsblatt"]') },
  { name: 'klassenarbeit', open: () => page.click('[aria-label="Klassenarbeiten"]') },
  { name: 'einstellungen', open: () => page.click('[aria-label="Einstellungen"]') }
]

/** Seite und Elemente auf waagerechtes Überlaufen prüfen */
const overflow = () =>
  page.evaluate(() => {
    const view = document.documentElement.clientWidth
    const bad = []
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      // Messbehälter liegen ganz außerhalb des Bildes (x = -10000) – die zählen nicht
      if (r.right <= 0) continue
      if (r.right <= view + 1 && r.left >= -1) continue
      const style = getComputedStyle(el)
      if (style.position === 'fixed') continue
      // In einem eigenen Bildlaufbereich (z. B. Seitenvorschau) darf etwas breiter sein
      let inScroller = false
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ps = getComputedStyle(p)
        if (ps.overflowX === 'auto' || ps.overflowX === 'scroll') {
          inScroller = true
          break
        }
      }
      if (inScroller) continue
      bad.push({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 70), left: Math.round(r.left), right: Math.round(r.right) })
    }
    return { page: document.documentElement.scrollWidth - view, bad: bad.slice(0, 6), count: bad.length }
  })

let problems = 0
for (const size of SIZES) {
  await page.setViewportSize({ width: size.width, height: size.height })
  for (const view of VIEWS) {
    await view.open()
    await page.waitForTimeout(700)
    const res = await overflow()
    await page.screenshot({ path: join(out, `${view.name}-${size.name}.png`) })
    const tag = `${view.name} @ ${size.width}×${size.height}`
    if (res.page > 1 || res.count) {
      problems++
      console.log(`FEHLER ${tag}: Seite ${res.page} px zu breit, ${res.count} Elemente ragen heraus`)
      for (const b of res.bad) console.log(`   ${b.tag}.${b.cls} (${b.left} … ${b.right})`)
    } else {
      console.log(`ok    ${tag}`)
    }
  }
}

console.log('Konsolenfehler:', errors.length ? errors.join(' | ') : 'keine')
await app.close()
if (problems) throw new Error(`${problems} Ansichten laufen waagerecht über`)
if (errors.length) throw new Error('Fehler in der Konsole')
