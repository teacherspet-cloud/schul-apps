// Vertont einen kurzen Dialog WIRKLICH über ElevenLabs – prüft die ganze Kette.
// Aufruf: XI=<sk_...> node tests/e2e/hoertext-vertonen.mjs <Ausgabeordner>
//
// ACHTUNG: Diese Wache verbraucht ElevenLabs-Kontingent und läuft deshalb NICHT
// automatisch mit. Sie ist nur zu starten, wenn der Nutzer es ausdrücklich erlaubt hat.
// Der Dialog ist bewusst kurz (gut 150 Zeichen).
//
// Geprüft wird, was die Einzelteile nicht zeigen: dass die App bei ZWEI Stimmen tatsächlich
// den Dialog-Weg nimmt (ein Auftrag an /v1/text-to-dialogue statt einer Anfrage je Zeile)
// und dass am Ende eine abspielbare Datei im Baustein steht.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const key = process.env.XI
if (!key) {
  console.error('Kein Schlüssel. Aufruf: XI=sk_... node tests/e2e/hoertext-vertonen.mjs')
  process.exit(2)
}
const out = resolve(process.argv[2] ?? 'test-results/hoertext-vertonen')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-tts-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1500, 1000)
    win.center()
  }
})
await warteAufOberflaeche(page)
await page.evaluate((k) => window.api.secrets.set('elevenlabs', k), key)

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(500)
await page.evaluate(() => window.__selftest.audioSheet())
await page.getByText('Hörtexte', { exact: true }).first().click()
// Die Stimmenliste kommt über das Netz; die Zuweisung je Sprecher hängt daran
await page.waitForTimeout(6000)

const stimmen = await page.evaluate(() => document.body.innerHTML.split('Stimme für').length - 1)
console.log('Stimmenfelder sichtbar:', stimmen)

const vorher = Date.now()
await page
  .getByRole('button', { name: /Vertonen/ })
  .first()
  .click()
// Die Meldung nennt den Weg – sie muss VOR dem Verschwinden gelesen werden
let meldung = ''
for (let i = 0; i < 60 && !meldung; i++) {
  await page.waitForTimeout(2000)
  meldung = await page.evaluate(() => document.querySelector('.mantine-Notification-root')?.textContent ?? '')
}
const dauer = Math.round((Date.now() - vorher) / 1000)

const ergebnis = await page.evaluate(() => {
  const src = document.querySelector('audio')?.getAttribute('src') ?? ''
  return { hatAudio: src.startsWith('data:audio'), bytes: Math.round((src.length * 3) / 4) }
})
ergebnis.meldung = meldung
console.log(`Nach ${dauer} s:`, JSON.stringify(ergebnis).slice(0, 220))
await page.screenshot({ path: join(out, 'vertont.png'), fullPage: false })

const problems = []
if (!ergebnis.hatAudio) problems.push(`Keine Audiodatei im Baustein. Meldung: ${ergebnis.meldung || '(keine)'}`)
if (ergebnis.hatAudio && ergebnis.bytes < 20000) problems.push(`Datei verdächtig klein (${ergebnis.bytes} Bytes)`)
// Der Kern der Änderung: Bei zwei Sprechern MUSS die Dialog-Schnittstelle gegriffen haben.
// Zeile für Zeile erzeugt klingt es unverbunden – genau die Beschwerde, die dahinter steht.
if (!/Dialog in einem Stück/.test(ergebnis.meldung)) problems.push(`Nicht als Dialog vertont. Meldung: ${ergebnis.meldung || '(keine)'}`)
if (errors.length) console.log('Meldungen im Fenster:\n- ' + errors.slice(0, 3).join('\n- '))

if (ergebnis.hatAudio) {
  const b64 = await page.evaluate(() => (document.querySelector('audio')?.getAttribute('src') ?? '').split(',')[1] ?? '')
  writeFileSync(join(out, 'dialog.mp3'), Buffer.from(b64, 'base64'))
  console.log('MP3 gespeichert:', join(out, 'dialog.mp3'))
}

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.error('\nProbleme:\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log('\nDie App vertont einen Dialog über ElevenLabs.')
