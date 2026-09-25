// Sichtprüfung der Filmbeobachtung – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/video.mjs <Ausgabeordner>
//
// Geprüft wird, was am Ende auf dem Papier steht: QR-Code samt Klartextlink, die
// Zwischenüberschriften der drei Phasen, die Gruppenkennzeichnung und die Lehrerseite.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync } from 'fs'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'
import { tmpdir } from 'os'

const out = resolve(process.argv[2] ?? 'test-results/video')
mkdirSync(out, { recursive: true })
// Eigener Datenordner: Die Tests dürfen nichts im Bestand des Nutzers hinterlassen.
const userData = mkdtempSync(join(tmpdir(), 'schulapps-video-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()

// Das ECHTE Fenster vergrößern, nicht den emulierten Darstellungsbereich: `setViewportSize`
// lässt bei Electron den Rest der Fensterfläche schwarz stehen.
await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  win.setSize(1500, 1000)
  win.center()
})
await warteAufOberflaeche(page)

await page.getByText('Arbeitsblatt', { exact: true }).first().click()
const info = await page.evaluate(() => window.__selftest.videoSheet(2))
console.log('Gruppenfassungen:', info.sheets, '·', info.labels.join(' | '))
if (info.sheets !== 2) throw new Error(`Erwartet zwei Gruppenfassungen, bekommen: ${info.sheets}`)

await page.waitForSelector('.ws-editor-pages:visible', { timeout: 30000 })
await page.waitForTimeout(800)

const seen = await page.evaluate(() => {
  const el = document.querySelector('.ws-editor-pages')
  const text = el?.textContent ?? ''
  const qr = el?.querySelector('.ws-video-qr img')
  return {
    phasen: ['Vor dem Sehen', 'Während des Sehens', 'Nach dem Sehen'].filter((p) => text.includes(p)),
    gruppe: text.includes('Gruppe A') || text.includes('Gruppe B'),
    qrVorhanden: Boolean(qr),
    qrGroesse: qr ? Math.round(qr.getBoundingClientRect().width) : 0,
    klartext: el?.querySelector('.ws-video-qr figcaption')?.textContent ?? '',
    // Das Skript-Gegenstück: Zeitmarken dürfen auf dem Schülerblatt NICHT stehen
    zeitmarken: text.includes('02:10')
  }
})
console.log('Phasen:', seen.phasen.join(', ') || 'KEINE')
console.log('Gruppenkennzeichnung:', seen.gruppe ? 'ja' : 'NEIN')
console.log('QR-Code:', seen.qrVorhanden ? `ja, ${seen.qrGroesse} px breit` : 'NEIN')
console.log('Klartextlink:', seen.klartext || 'FEHLT')
console.log('Zeitmarken auf dem Schülerblatt:', seen.zeitmarken ? 'JA (falsch!)' : 'nein (richtig)')

await page.screenshot({ path: join(out, 'schuelerblatt.png'), fullPage: false })

// Lösungsansicht: Dort gehören Lehrerhinweis und Zeitmarken hin
const key = page
  .getByRole('tab', { name: /Lösung/i })
  .or(page.getByText('Lösungen', { exact: true }))
  .first()
if (await key.count()) {
  await key.click()
  await page.waitForTimeout(600)
  const note = await page.evaluate(() => document.querySelector('.ws-editor-pages')?.textContent ?? '')
  console.log('Lehrerhinweis mit Zeitmarken:', note.includes('02:10') ? 'ja' : 'NEIN')
  await page.screenshot({ path: join(out, 'lehrerseite.png'), fullPage: false })
}

const problems = []
if (seen.phasen.length !== 3) problems.push('Es fehlen Zwischenüberschriften der Phasen')
if (!seen.gruppe) problems.push('Die Gruppenkennzeichnung fehlt')
if (!seen.qrVorhanden) problems.push('Der QR-Code fehlt')
if (!seen.klartext) problems.push('Der Klartextlink unter dem QR-Code fehlt')
if (seen.zeitmarken) problems.push('Zeitmarken stehen auf dem Schülerblatt, obwohl sie nicht freigeschaltet sind')

await app.close()
if (problems.length) {
  console.error('\nProbleme:\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log('\nAlles wie vorgesehen. Bilder in', out)
