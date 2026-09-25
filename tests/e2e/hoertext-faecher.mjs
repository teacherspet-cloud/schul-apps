// Wache: Hörtext-Regeln je Fach – OHNE KI und OHNE ElevenLabs (vorher: npm run build).
// Aufruf: node tests/e2e/hoertext-faecher.mjs <Ausgabeordner>
//
// Derselbe Hörtext-Baustein muss in Englisch und in Geschichte VERSCHIEDEN aussehen:
//
//   Englisch    zweimal hören · Transkript NUR im Lösungsteil
//               (KMK-Bildungsstandards Fremdsprache 2012 – läge das Transkript der Klasse
//               vor, prüfte man Lesen statt Hören)
//   Geschichte  so oft wie nötig · Transkript LIEGT BEI
//               (EPA Geschichte 3.3.3 – „ständig abrufbar", „in verschriftlichter Form
//               beizufügen")
//
// Dazu die KI-Kennzeichnung auf dem Schülerblatt (KMK-Handlungsempfehlung KI 2024).
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/hoertext-faecher')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-hf-'))
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

const lies = async (fach) => {
  await page.evaluate((f) => window.__selftest.audioSheet(f), fach)
  await page.waitForSelector('.ws-editor-pages:visible', { timeout: 30000 })
  await page.waitForTimeout(1200)
  return page.evaluate(() => {
    const wurzel = document.querySelector('.ws-editor-pages') ?? document
    const block = wurzel.querySelector('.ws-audio')
    return {
      meta: block?.querySelector('.ws-audio-meta')?.textContent?.trim() ?? '',
      skriptTitel: block?.querySelector('.ws-audio-script-title')?.textContent?.trim() ?? '',
      skriptDa: Boolean(block?.querySelector('.ws-audio-script')),
      kiHinweis: block?.querySelector('.ws-audio-ai-note')?.textContent?.trim() ?? ''
    }
  })
}

const englisch = await lies('englisch')
console.log('Englisch:  ', JSON.stringify(englisch))
await page.screenshot({ path: join(out, 'englisch.png'), fullPage: false })

const geschichte = await lies('geschichte')
console.log('Geschichte:', JSON.stringify(geschichte))
await page.screenshot({ path: join(out, 'geschichte.png'), fullPage: false })

const problems = []
// Fremdsprache: zweimal hören, KEIN Transkript auf dem Schülerblatt
if (!/zweimal hören/.test(englisch.meta)) problems.push(`Englisch zeigt „${englisch.meta}" statt „zweimal hören"`)
if (englisch.skriptDa) problems.push('Englisch: Das Transkript steht auf dem Schülerblatt – damit prüft man Lesen statt Hören')
// Sachfach: beliebig oft, Transkript liegt bei
if (!/so oft/.test(geschichte.meta)) problems.push(`Geschichte zeigt „${geschichte.meta}" statt „so oft anhören, wie du möchtest"`)
if (!geschichte.skriptDa) problems.push('Geschichte: Das Transkript fehlt auf dem Blatt (EPA: „in verschriftlichter Form beizufügen")')
if (geschichte.skriptTitel !== 'Text der Aufnahme') problems.push(`Geschichte: Überschrift „${geschichte.skriptTitel}" statt „Text der Aufnahme"`)
// Kennzeichnung in beiden Fächern
for (const [fach, d] of [
  ['Englisch', englisch],
  ['Geschichte', geschichte]
]) {
  if (!/Künstlicher Intelligenz/.test(d.kiHinweis)) problems.push(`${fach}: Die KI-Kennzeichnung fehlt auf dem Blatt`)
}

const react = errors.filter((e) => /Maximum update depth|Minified React error|#185|#310/i.test(e))
if (react.length) problems.push(`React-Fehler: ${react[0].slice(0, 140)}`)
if (errors.length) console.log('Meldungen im Fenster:\n- ' + errors.slice(0, 3).join('\n- '))

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.error('\nProbleme:\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log('\nDie Hörtext-Regeln unterscheiden sich je Fach wie vorgesehen. Bilder in', out)
