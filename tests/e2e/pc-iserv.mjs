// IServ in der App am PC (02.10.2026; vorher: npm run build bzw. node scripts/bauen.mjs).
// Aufruf: node tests/e2e/pc-iserv.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft: „bau in die Exe für Windows die Möglichkeit ein, auf die IServ-
// Ordnerstruktur des Nutzers zuzugreifen". Der WebDAV-Unterbau ist derselbe wie auf dem iPad
// (tests/iserv.test.ts, tests/e2e/mobil-iserv.mjs). Hier wird nur geprüft, was am PC anders ist:
//  1. Die Karte „IServ" steht in Einstellungen › Material (bisher nur iPad).
//  2. window.api ist über die Electron-Brücke unveränderlich – die Rückfragen vor Speichern und
//     Öffnen kommen trotzdem an (window.api.vermittlung): mit verbundenem IServ fragt Speichern
//     „Auf diesem PC / IServ", Öffnen „Von diesem PC / Von IServ"; Abbrechen liefert null.
//  3. Ohne IServ bleibt alles wie bisher (keine Rückfrage).
// Es wird nichts auf IServ geschrieben: Die Verbindung wird nur in den Einstellungen vorgetäuscht.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/pc-iserv')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-pc-iserv-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

try {
  const page = await app.firstWindow()
  await app.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 950))
  await warteAufOberflaeche(page, 3, { assistent: true })
  const spaeter = page.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()

  // ---------- 3. Ohne IServ: keine Rückfrage (Ziel wird an den Hauptprozess durchgereicht)
  const ohne = await page.evaluate(async () => {
    const v = window.api.vermittlung
    return Boolean(v && typeof v.ortWahl === 'function')
  })
  pruefe(ohne, 'window.api.vermittlung ist über die Brücke erreichbar')

  // ---------- 1. Karte in den Einstellungen
  await page
    .getByRole('button', { name: /Einstellungen/ })
    .first()
    .click()
  await page.getByRole('tab', { name: 'Material' }).click()
  const karte = page.locator('[data-iserv-karte]')
  pruefe(
    await karte.waitFor({ timeout: 10000 }).then(
      () => true,
      () => false
    ),
    'Karte „IServ" in Einstellungen › Material am PC'
  )
  await page.screenshot({ path: join(out, '1-karte.png') })

  // ---------- 2. Verbindung vortäuschen (nur Einstellungen + Passwort-Eintrag), dann Rückfragen
  await page.evaluate(async () => {
    await window.api.settings.set({
      iserv: { schule: 'meineschule.de', benutzer: 'erika.muster', basis: 'https://webdav.meineschule.de/', ziel: 'Home/Schulmaterial' }
    })
    await window.api.secrets.set('iserv', 'nur-ein-test')
  })
  await page.reload()
  await warteAufOberflaeche(page, 3, { assistent: true }).catch(() => undefined)

  const speichern = page.evaluate(() =>
    window.api.files.save('Probe.pdf', [{ name: 'PDF', extensions: ['pdf'] }], new Uint8Array([1, 2, 3]), { programm: 'vokabeltest', fach: 'Englisch' })
  )
  await page.locator('button[data-ort="iserv"]').waitFor({ timeout: 10000 })
  const orte = await page.locator('button[data-ort]').evaluateAll((b) => b.map((x) => x.getAttribute('data-ort')))
  pruefe(JSON.stringify(orte) === '["geraet","iserv"]', `Speichern fragt „Auf diesem PC / IServ" (${orte.join(', ')})`)
  pruefe(await page.getByText('Auf diesem PC').isVisible(), 'Ort heißt „Auf diesem PC"')
  await page.screenshot({ path: join(out, '2-speichern.png') })
  await page.locator('[data-ausgabe-ort]').getByRole('button', { name: 'Abbrechen' }).click()
  pruefe((await speichern) === null, 'Abbrechen beim Speichern liefert null')

  const oeffnen = page.evaluate(() => window.api.files.open([{ name: 'Tabelle', extensions: ['csv'] }]))
  await page.locator('button[data-quelle="iserv"]').waitFor({ timeout: 10000 })
  pruefe(await page.locator('button[data-quelle="geraet"]').getByText('Von diesem PC').isVisible(), 'Öffnen fragt „Von diesem PC / Von IServ"')
  await page.screenshot({ path: join(out, '3-oeffnen.png') })
  await page.locator('[data-eingabe-ort]').getByRole('button', { name: 'Abbrechen' }).click()
  pruefe((await oeffnen) === null, 'Abbrechen beim Öffnen liefert null')

  const einst = await page.evaluate(() => window.api.settings.get())
  pruefe(!JSON.stringify(einst).includes('nur-ein-test'), 'Passwort steht nicht in den Einstellungen')
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
