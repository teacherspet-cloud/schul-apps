// Wache: Die Einstellungen stehen im Browser NACH der PIN-Eingabe bereit (vorher: npm run build).
// Aufruf: node tests/e2e/netz-logo.mjs
//
// Gemeldet von der Lehrkraft (24.09.2026): „in der webversion ist das in der app hinterlegte
// schullogo nicht hinterlegt."
//
// Die Ursache war nicht das Logo, sondern der Zeitpunkt: Die Oberfläche holte die
// Einstellungen beim Seitenaufbau – also BEVOR die PIN eingegeben war. Der Server lehnte den
// Aufruf mit „Nicht angemeldet" ab, und danach lud sie niemand mehr nach. Betroffen war alles
// aus den Einstellungen: Schulname, Farbschema, KI-Anbieter, Piktogramme. Aufgefallen ist es
// am Logo, weil man dessen Fehlen auf dem Blatt sieht.
//
// Beim ZWEITEN Besuch lag die Anmeldung im Browserspeicher – dann ging es gut. Deshalb prüft
// diese Wache ausdrücklich den ERSTEN Besuch, mit echter PIN-Eingabe.
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

// Ein einzelner roter Bildpunkt als PNG – mehr braucht es für den Nachweis nicht
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const SCHULE = 'Testschule am Deich'

const userData = mkdtempSync(join(tmpdir(), 'schulapps-netzlogo-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await warteAufOberflaeche(page)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

// --- Am Rechner ein Logo und einen Schulnamen hinterlegen
await page.evaluate(
  async ({ logo, schule }) => {
    await window.api.branding.setLogo(logo)
    await window.api.settings.set({ schoolName: schule })
  },
  { logo: LOGO, schule: SCHULE }
)
const amRechner = await page.evaluate(() => window.api.branding.getLogo())
pruefe(Boolean(amRechner), 'Das Logo ist am Rechner hinterlegt')

const status = await page.evaluate(() => window.api.lan.start())
const pin = await page.evaluate(async () => (await window.api.settings.get()).lan?.pin ?? '')
pruefe(pin.length === 6, `Die PIN steht bereit (${pin.length} Stellen)`)

/*
 * Ein Fenster OHNE Brücke und OHNE Anmeldung – genau das, was ein Tablet beim ersten Aufruf
 * sieht. Kein Token im Browserspeicher, also erscheint die PIN-Abfrage.
 */
// `?selftest` schaltet die Pruefhilfen frei – sonst gibt es im Browser kein `__selftest`
const adresse = `http://127.0.0.1:${status.port}/?selftest`
const id = await app.evaluate(async ({ BrowserWindow }, ziel) => {
  const win = new BrowserWindow({ width: 1200, height: 900, show: false, webPreferences: { preload: undefined, sandbox: false } })
  await win.loadURL(ziel)
  return win.webContents.id
}, adresse)
const browser = app.windows().find((w) => w !== page) ?? (await app.waitForEvent('window'))
void id
await browser.waitForTimeout(1500)

const vorAnmeldung = await browser.evaluate(() => document.body.innerText)
pruefe(vorAnmeldung.includes('PIN'), 'Beim ersten Besuch erscheint die PIN-Abfrage')

// --- PIN eingeben
await browser.locator('input').first().click()
await browser.keyboard.type(pin, { delay: 60 })
await browser.waitForTimeout(2500)

const nachAnmeldung = await browser.evaluate(() => document.body.innerText)
pruefe(!nachAnmeldung.includes('Gib einmalig die PIN ein'), 'Nach der PIN ist die Oberfläche da')

/*
 * Der eigentliche Nachweis: Das Logo steht im Browser bereit – und zwar aus dem Speicher der
 * Oberfläche, nicht nur über einen neuen Aufruf. Genau das war vorher leer.
 */
const imBrowser = await browser.evaluate(async () => {
  const w = window
  return {
    ueberDenAufruf: Boolean(await w.api.branding.getLogo()),
    imSpeicher: Boolean(w.__selftest?.logo?.() ?? null),
    schulname: (await w.api.settings.get()).schoolName
  }
})
pruefe(imBrowser.ueberDenAufruf, 'Das Logo lässt sich im Browser abrufen')
pruefe(imBrowser.imSpeicher, 'Das Logo steht im Speicher der Oberfläche – daraus entsteht der Briefkopf')
pruefe(imBrowser.schulname === SCHULE, `Auch der Schulname ist geladen (${imBrowser.schulname || 'leer'})`)

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nDie Einstellungen sind im Browser nach der Anmeldung vollständig da.')
