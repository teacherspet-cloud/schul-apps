// Wache: Hörtext im PDF – OHNE KI und OHNE ElevenLabs (vorher: npm run build).
// Aufruf: node tests/e2e/pdf-hoertext.mjs <Ausgabeordner>
//
// Geprüft wird, was den Unterschied ausmacht:
//  - Die MP3 liegt als DATEIANLAGE im PDF (das sehen Acrobat, Chrome, Edge, Firefox, Okular).
//  - Es gibt eine RichMedia-Annotation als Abspieler (Acrobat, Firefox, Foxit, Okular).
//  - Die Datei ist NUR EINMAL eingebettet – naiv doppelt eingebettet verdoppelt sich das PDF.
//  - Der sichtbare Hinweis steht im Seiteninhalt, nicht in der Annotation: Chrome, Edge und
//    die macOS-Vorschau zeigen den Abspieler nicht, und zwar ohne Meldung.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { PDFDocument, PDFName } from 'pdf-lib'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/pdf-hoertext')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-pdfaudio-'))
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
await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(500)
await page.evaluate(() => window.__selftest.audioSheet('englisch'))
await page.waitForTimeout(1500)

// Druck-HTML mit gesetztem Anlagen-Hinweis und die Hörtexte einsammeln
const { html, audio } = await page.evaluate(() => window.__selftest.audioPdfInput())
console.log('Hörtexte:', audio.map((a) => `${a.fileName} (${Math.round((a.base64.length * 3) / 4)} Byte)`).join(', ') || '(keine)')
console.log('Hinweis im HTML:', /als Anhang in diesem PDF/.test(html) ? 'ja' : 'NEIN')

const bytes = await page.evaluate(async (d) => Array.from(await window.api.exporter.fillablePreview(d.html, d.audio)), { html, audio })
const datei = join(out, 'mit-hoertext.pdf')
writeFileSync(datei, Buffer.from(bytes))

const doc = await PDFDocument.load(Buffer.from(bytes))
const cat = doc.catalog
const names = cat.lookup(PDFName.of('Names'))
const embedded = names?.lookup?.(PDFName.of('EmbeddedFiles'))
const anlagen = embedded?.lookup?.(PDFName.of('Names'))?.size?.() ?? 0
const af = cat.lookup(PDFName.of('AF'))?.size?.() ?? 0
// Abspieler zählen
let richMedia = 0
for (const p of doc.getPages()) {
  const annots = p.node.Annots()
  for (let i = 0; i < (annots?.size() ?? 0); i++) {
    const a = annots.lookup(i)
    if (a?.lookup?.(PDFName.of('Subtype'))?.asString?.() === '/RichMedia') richMedia++
  }
}
// Wie oft steckt die Nutzlast drin? Genau einmal, sonst wird das PDF doppelt so groß.
const roh = Buffer.from(bytes).toString('latin1')
const einbettungen = (roh.match(/\/EmbeddedFile/g) ?? []).length

console.log('PDF:', `${Math.round(bytes.length / 1024)} kB`)
console.log('Anlagen im Namensbaum:', anlagen / 2, '· AF-Einträge:', af, '· Abspieler:', richMedia, '· EmbeddedFile-Ströme:', einbettungen)

const problems = []
if (!audio.length) problems.push('Das Prüfblatt liefert keine Hörtexte – die Wache prüft nichts')
if (anlagen / 2 !== 1) problems.push(`${anlagen / 2} Anlagen statt 1 – die MP3 hängt nicht am PDF`)
if (af !== 1) problems.push(`${af} AF-Einträge statt 1`)
if (richMedia !== 1) problems.push(`${richMedia} Abspieler statt 1 – die Lage des Hörtextes wurde nicht gefunden`)
if (einbettungen !== 1) problems.push(`Die Datei steckt ${einbettungen}-mal im PDF – Anlage und Abspieler müssen dieselbe benutzen`)
if (!/als Anhang in diesem PDF/.test(html)) problems.push('Der sichtbare Hinweis auf die Anlage fehlt im Seiteninhalt')
if (errors.length) console.log('Meldungen im Fenster:\n- ' + errors.slice(0, 3).join('\n- '))

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.error('\nProbleme:\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log('\nDer Hörtext liegt im PDF – als Anlage und als Abspieler. Datei:', datei)
