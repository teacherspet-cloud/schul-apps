// Wo bleibt der Grammatiktest? Diese Probe trennt zwei Ursachen, ohne auf die KI zu warten:
//   a) Der Klick löst nichts aus  → das Fortschrittsfenster erscheint NICHT
//   b) Der Klick löst aus, die KI antwortet nur nicht → das Fenster erscheint sofort
// Das Fenster öffnet sich synchron beim Klick, lange bevor eine Antwort da ist.
// Aufruf: node tests/e2e/probe-klick.mjs
import { _electron as electron } from 'playwright-core'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve('test-results/probe-klick')
mkdirSync(out, { recursive: true })
const live = join(process.env.APPDATA ?? '', 'schul-apps')
const userData = mkdtempSync(join(tmpdir(), 'schulapps-klick-'))
for (const f of ['settings.json', 'secrets.json', 'model-cache.json', 'worksheet-designs.json', 'worksheet-designs-version.json']) {
  const from = join(live, f)
  if (existsSync(from)) copyFileSync(from, join(userData, f))
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1500, 1000)
    win.center()
  }
})
// Wartet auf die Oberfläche und schließt den Einrichtungsassistenten, der im leeren Profil erscheint
await warteAufOberflaeche(page)

await page.click('[aria-label="Grammatiktest"]')
await page.waitForTimeout(800)
const neu = page.getByRole('button', { name: 'Neuer Test' }).filter({ visible: true }).first()
if (await neu.count()) await neu.click()
await page.waitForSelector('text=Geprüfte Formen', { timeout: 20000 })

// Dieselbe Auswahl wie im großen Lauf
const jahrgang = page.getByLabel('Jahrgang').filter({ visible: true }).first()
await jahrgang.click()
await page.getByRole('option', { name: 'Klasse 8', exact: true }).click()
await page.waitForTimeout(300)
const form = page
  .getByRole('checkbox', { name: /Perfekt vs\. einfache Vergangenheit/ })
  .filter({ visible: true })
  .first()
await form.check()
await page.waitForTimeout(400)

const button = page.getByRole('button', { name: 'Test erstellen' }).filter({ visible: true }).first()
console.log('Knopf gefunden:', await button.count(), '· sichtbar:', await button.isVisible(), '· aktiv:', await button.isEnabled())
await button.click()
console.log('Geklickt.')

// Lebenszeichen einsammeln. Standard 25 s (Klick geprüft); mit einer Zahl als Argument
// laenger – so laesst sich beobachten, ob die 12-Minuten-Grenze der App wirklich greift.
const seconds = Number(process.argv[2]) || 25
const t0 = Date.now()
const signs = []
for (let i = 0; i < seconds; i++) {
  await page.waitForTimeout(1000)
  if ((i + 1) % 30 === 0) console.log(`  ... ${Math.round((Date.now() - t0) / 60000)} min, noch am Warten`)
  const state = await page.evaluate(() => ({
    modal: document.querySelector('.mantine-Modal-title')?.textContent ?? '',
    // Die Anzeige rechts im Fenster: Prozentzahl oder verstrichene Zeit
    stand: [...document.querySelectorAll('[role="dialog"] p, [role="dialog"] div')].map((e) => e.textContent).find((t) => /%|läuft seit/.test(t ?? '')) ?? '',
    balken: document.querySelector('[role="dialog"] .mantine-Progress-section')?.getAttribute('style') ?? '',
    modalCount: document.querySelectorAll('[role="dialog"]').length,
    loader: document.querySelectorAll('.mantine-Button-loader, .mantine-Loader-root').length,
    notification: document.querySelector('.mantine-Notification-root')?.textContent ?? '',
    anyNotification: document.querySelectorAll('[class*="Notification"]').length,
    // Die eigentliche Frage: Steht der Editor da? Einmal streng (sichtbar) und einmal roh,
    // damit sich „nicht da" von „da, aber nicht als sichtbar erkannt" unterscheiden lässt.
    editorAlle: document.querySelectorAll('.ws-editor-pages').length,
    editorSichtbar: [...document.querySelectorAll('.ws-editor-pages')].filter((el) => el.getClientRects().length > 0).length,
    seiten: document.querySelectorAll('.ws-page').length,
    schritt: document.querySelector('.mantine-Stepper-stepLabel')?.textContent ?? ''
  }))
  const line = JSON.stringify(state)
  if (line !== signs[signs.length - 1]) {
    signs.push(line)
    console.log(`  ${Math.round((Date.now() - t0) / 1000)}s ${line}`)
    if (state.notification || state.editorSichtbar) break
  }
}

await page.screenshot({ path: join(out, 'nach-klick.png'), fullPage: false })
if (errors.length) console.log('Fehler im Fenster:\n- ' + errors.slice(0, 5).join('\n- '))
console.log('Bild in', out)

await app.close()
rmSync(userData, { recursive: true, force: true })
