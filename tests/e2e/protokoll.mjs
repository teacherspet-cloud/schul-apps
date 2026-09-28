// Wache für PROTOKOLL, AUTOMATISCHE SICHERUNG und VERBRAUCH (vorher: npm run build).
// Aufruf: node tests/e2e/protokoll.mjs <Ausgabeordner>
//
// Großprogramm 0.4, Paket Verlässlichkeit. Die Regeln prüft tests/verlaesslichkeit.test.ts.
// Hier: Sind die Wege durch die App verdrahtet?
// - Ein Fehler in der Oberfläche landet in protokoll.log.
// - „Jetzt sichern" legt eine Sicherung an, die in der Liste steht.
// - Die Karten „Automatische Sicherung" und „Verbrauch" erscheinen in den Einstellungen.
//
// Alles läuft in einem WEGWERF-Profil; kein KI-Aufruf.
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/protokoll')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-protokoll-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await app.evaluate(async ({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0]?.setSize(1600, 1050)
})
await warteAufOberflaeche(page, 3, { assistent: true })

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const assistent = page.locator('.mantine-Modal-content', { hasText: 'Willkommen bei Schul-Apps' })
await page.waitForTimeout(2500)
if (await assistent.count()) await assistent.getByRole('button', { name: 'Später einrichten' }).click()
await page.waitForTimeout(600)

// ---------------------------------------------------------------- Protokoll
await page.evaluate(() => {
  setTimeout(() => {
    throw new Error('Wache-Protokoll: absichtlicher Fehler')
  }, 0)
})
await page.waitForTimeout(1500)
const logDatei = join(userData, 'protokoll.log')
const log = existsSync(logDatei) ? readFileSync(logDatei, 'utf8') : ''
pruefe(log.includes('Wache-Protokoll: absichtlicher Fehler'), 'Ein Fehler in der Oberfläche steht im Protokoll')

// ---------------------------------------------------------------- Sicherung
const eintrag = await page.evaluate(() => window.api.wartung.sichereJetzt())
const liste = await page.evaluate(() => window.api.wartung.sicherungen())
pruefe(
  liste.some((e) => e.name === eintrag.name),
  '„Jetzt sichern" legt eine Sicherung an, die in der Liste steht'
)
const dateien = existsSync(join(userData, 'sicherungen')) ? readdirSync(join(userData, 'sicherungen')) : []
pruefe(dateien.includes(eintrag.name), 'Die Sicherung liegt im Ordner „sicherungen"')
const inhalt = await page.evaluate((n) => window.api.wartung.sicherungLaden(n).then((d) => window.api.wartung.pruefen(d)), eintrag.name)
pruefe(typeof inhalt.erstellt === 'string', 'Die automatische Sicherung lässt sich prüfen wie eine gespeicherte')

// ---------------------------------------------------------------- Karten
await page.click('[aria-label="Einstellungen"]')
await page.waitForTimeout(1000)
await page.getByRole('tab', { name: 'Wartung' }).click()
await page.waitForTimeout(800)
pruefe(
  (await page.getByText('Automatische Sicherung', { exact: true }).filter({ visible: true }).count()) === 1,
  'Die Karte „Automatische Sicherung" steht im Reiter Wartung'
)
pruefe((await page.getByRole('button', { name: 'Wiederherstellen …' }).filter({ visible: true }).count()) >= 1, 'Die Liste bietet „Wiederherstellen" an')
pruefe((await page.getByRole('button', { name: 'Protokoll speichern …' }).filter({ visible: true }).count()) === 1, '„Protokoll speichern" ist da')
await page.screenshot({ path: join(out, 'wartung.png'), fullPage: true })
const kiTab = page.getByRole('tab', { name: /^KI/ })
if (await kiTab.count()) {
  await kiTab.first().click()
  await page.waitForTimeout(800)
  pruefe((await page.getByText('Verbrauch', { exact: true }).filter({ visible: true }).count()) === 1, 'Die Karte „Verbrauch" steht im Reiter KI')
  await page.screenshot({ path: join(out, 'verbrauch.png'), fullPage: true })
} else pruefe(false, 'Reiter „KI" gefunden')

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
