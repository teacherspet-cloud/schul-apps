// Wache für den Reiter „Hörtexte“ – OHNE KI und OHNE ElevenLabs (vorher: npm run build).
// Aufruf: node tests/e2e/hoertext-regler.mjs <Ausgabeordner>
//
// Dieser Reiter war von keiner Wache erreichbar: Ein Hörtext entstand bisher nur über die
// KI, und Oberflächentests dürfen kein Kontingent verbrauchen. Ausgerechnet dort sitzen
// aber Stimmenauswahl, Filter und jetzt die Klangregler – und ein Fehler in einer dieser
// Komponenten nimmt die ganze Oberfläche mit, ohne eine Meldung zu zeigen.
//
// Ohne hinterlegten Schlüssel kommt keine Stimmenliste. Das ist hier kein Mangel, sondern
// der interessantere Fall: Die Regler müssen auch dann erscheinen und rechnen, denn das
// Tempo hängt am Niveau, nicht an der Stimme.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/hoertext-regler')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-audio-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1500, 1000)
    win.center()
  }
})
await warteAufOberflaeche(page)

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)
const info = await page.evaluate(() => window.__selftest.audioSheet())
console.log('Hörtext gesetzt:', info.speakers.join(' und '))

await page.getByText('Hörtexte', { exact: true }).first().click()
await page.waitForTimeout(1500)

const problems = []

// 1. Der Reiter baut sich überhaupt auf
const skript = await page.getByLabel(/Skript/).first()
if (!(await skript.isVisible().catch(() => false))) problems.push('Das Skriptfeld erscheint nicht')

// 2. Die Zusammenfassung nennt das berechnete Tempo. A2 heißt: unterster Reglerwert,
//    und die Zeile muss eine Zahl nennen – nicht „NaN“ und nicht nichts.
const zeile = await page.evaluate(() => {
  const el = [...document.querySelectorAll('div,span,p')].find((e) => /Wörter\/Minute/.test(e.textContent ?? '') && e.children.length === 0)
  return el?.textContent?.trim() ?? ''
})
console.log('Tempo-Zeile:', zeile || '(fehlt)')
if (!/\d+\s*Wörter\/Minute/.test(zeile)) problems.push(`Tempo wird nicht beziffert: „${zeile}“`)
if (!/automatisch nach Niveau/.test(zeile)) problems.push('Es steht nicht da, dass das Tempo dem Niveau folgt')

// 3. Die Regler lassen sich aufklappen
await page.getByText('Klang und Tempo', { exact: true }).first().click()
await page.waitForTimeout(700)
const regler = await page.evaluate(() => {
  const txt = document.body.textContent ?? ''
  return {
    schieber: document.querySelectorAll('.mantine-Slider-root').length,
    tempo: txt.includes('Zielspanne des Niveaus'),
    warnung: /Langsamer als/.test(txt)
  }
})
console.log('Schieberegler:', regler.schieber, '· Hinweis zur Zielspanne:', regler.tempo ? 'ja' : 'nein', '· Warnung:', regler.warnung ? 'ja' : 'nein')
if (regler.schieber < 4) problems.push(`Nur ${regler.schieber} Regler statt 4`)
if (!regler.tempo) problems.push('Die Zielspanne des Niveaus wird nicht genannt')
// A2 verlangt 85–100 Wörter je Minute; so langsam kann ElevenLabs nicht. Das MUSS dastehen,
// sonst hält die Lehrkraft den Hörtext für niveaugerecht.
if (!regler.warnung) problems.push('Bei A2 fehlt der Hinweis, dass das Niveau-Tempo nicht erreichbar ist')

await page.screenshot({ path: join(out, 'regler.png'), fullPage: false })

const react = errors.filter((e) => /Maximum update depth|Minified React error|#185|#310/i.test(e))
if (react.length) problems.push(`React-Fehler: ${react[0].slice(0, 140)}`)
if (errors.length) console.log('Meldungen im Fenster:\n- ' + errors.slice(0, 4).join('\n- '))

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.error('\nProbleme:\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log('\nDer Hörtext-Reiter baut sich auf, das Tempo folgt dem Niveau. Bild in', out)
