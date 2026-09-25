// Wache für das ausfüllbare PDF – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/pdf-ausfuellbar.mjs <Ausgabeordner>
//
// Geprüft wird das, was sich von außen nachweisen lässt:
//  - Das PDF enthält überhaupt Formularfelder (AcroForm).
//  - Die Kästchen zum Ankreuzen sind da und liegen auf derselben Höhe wie im Blatt.
//  - Die Felder liegen INNERHALB der Seite – eine falsche Umrechnung würde sie herausschieben.
//
// Die Umrechnung ist der heikle Teil: 210 mm sind in CSS 793,7 px und im PDF 595,28 pt.
// Stimmt der Maßstab nicht, sitzen alle Felder verschoben, und man merkt es erst beim
// Ausfüllen.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { PDFDocument } from 'pdf-lib'
import { warteAufOberflaeche } from './warten.mjs'

const problems = []
const out = resolve(process.argv[2] ?? 'test-results/pdf-ausfuellbar')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-pdf-'))
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
const info = await page.evaluate(() => window.__selftest.fillableSheet())
console.log('Prüfblatt:', JSON.stringify(info))
await page.waitForTimeout(1500)

// Das Druck-HTML aus der App holen und beide PDF-Arten daraus erzeugen
const html = await page.evaluate(() => window.__selftest.printHtml())
const daten = await page.evaluate(async (h) => {
  const normal = await window.api.exporter.preview(h)
  return { normal: Array.from(normal) }
}, html)
writeFileSync(join(out, 'normal.pdf'), Buffer.from(daten.normal))

// Ausfüllbar erzeugen: über den echten Ausgabeweg, aber ohne Dialog – dafür der Prüfmodus
const gefuellt = await page.evaluate(async (h) => Array.from(await window.api.exporter.fillablePreview(h)), html)
const datei = join(out, 'ausfuellbar.pdf')
writeFileSync(datei, Buffer.from(gefuellt))
console.log('PDF geschrieben:', datei, `${Math.round(gefuellt.length / 1024)} kB`)

const doc = await PDFDocument.load(Buffer.from(gefuellt))
const form = doc.getForm()
const felder = form.getFields()
const seite = doc.getPages()[0]
const arten = {}
let ausserhalb = 0
for (const f of felder) {
  const art = f.constructor.name.replace('PDF', '')
  arten[art] = (arten[art] ?? 0) + 1
  for (const w of f.acroField.getWidgets()) {
    const r = w.getRectangle()
    // Keine Toleranz: Felder werden auf die Seite begrenzt, ein Überstand ist ein Fehler
    if (r.x < 0 || r.y < 0 || r.x + r.width > seite.getWidth() + 0.01 || r.y + r.height > seite.getHeight() + 0.01) ausserhalb++
  }
}
console.log('Seite:', `${Math.round(seite.getWidth())} x ${Math.round(seite.getHeight())} pt`)
console.log('Felder:', felder.length, JSON.stringify(arten))
console.log('außerhalb der Seite:', ausserhalb)

/*
 * GLEICHES BLATT, GLEICHES AUSSEHEN.
 *
 * Gemeldet von der Lehrkraft (24.09.2026): „wenn man bei gezeichneten linien, kästchen etc.
 * bearbeitbare textfelder aktiviert fürs pdf wird die gesamte formatierung und aussehen des
 * pdfs kaputt gemacht" – das ausfüllbare PDF hatte 8 Seiten, wo das gewöhnliche 6 hat.
 *
 * Die Formularfelder werden NACHTRÄGLICH gesetzt; am Satz darf sich dabei nichts ändern.
 * Seitenzahl und Seitenmaß sind der härteste Nachweis dafür.
 */
const normalDocVergleich = await PDFDocument.load(Buffer.from(daten.normal))
const seitenNormal = normalDocVergleich.getPageCount()
const seitenGefuellt = doc.getPageCount()
console.log(`Seiten: gewöhnlich ${seitenNormal}, ausfüllbar ${seitenGefuellt}`)
if (seitenNormal !== seitenGefuellt) {
  problems.push(`Das ausfüllbare PDF hat ${seitenGefuellt} Seiten, das gewöhnliche ${seitenNormal} – der Satz läuft um`)
}
const n0 = normalDocVergleich.getPages()[0]
if (Math.abs(n0.getWidth() - seite.getWidth()) > 0.5 || Math.abs(n0.getHeight() - seite.getHeight()) > 0.5) {
  problems.push(
    `Andere Seitengröße: gewöhnlich ${Math.round(n0.getWidth())}×${Math.round(n0.getHeight())}, ausfüllbar ${Math.round(seite.getWidth())}×${Math.round(seite.getHeight())}`
  )
}

// Die Lage der Felder lässt sich nur im Bild beurteilen – die Zahl allein sagt nichts
const bilder = await page.evaluate(async (d) => window.__selftest.renderPdf(d), Array.from(gefuellt))
for (const [i, b] of bilder.entries()) {
  writeFileSync(join(out, `seite-${i + 1}.jpg`), Buffer.from(b.split(',')[1], 'base64'))
}
console.log('Seitenbilder:', bilder.length)

if (!felder.length) problems.push('Das PDF enthält keine Formularfelder')
if (!arten.CheckBox) problems.push('Keine Ankreuzfelder – die Kästchen sind nicht ausfüllbar')
if (!arten.TextField) problems.push('Keine Textfelder – auf den Linien lässt sich nichts tippen')
/*
 * Das Prüfblatt enthält genau: 4 Schreiblinien + 2 Lücken + 1 Zeichenfläche = 7 Textfelder,
 * 3 Ankreuzmöglichkeiten + 2 Zuordnungskästchen = 5 Ankreuzfelder. Das angekreuzte
 * Beispiel-Kästchen an der Anweisung gehört NICHT dazu – es zeigt nur, was zu tun ist.
 */
if (arten.TextField !== 7) problems.push(`${arten.TextField} Textfelder statt 7`)
if (arten.CheckBox !== 5) problems.push(`${arten.CheckBox} Ankreuzfelder statt 5 – zählt das Beispiel-Kästchen mit?`)
if (ausserhalb > 0) problems.push(`${ausserhalb} Feld(er) liegen außerhalb der Seite – die Umrechnung px→pt stimmt nicht`)
// Das gewöhnliche PDF darf KEINE Felder haben
const normalDoc = await PDFDocument.load(Buffer.from(daten.normal))
if (normalDoc.getForm().getFields().length) problems.push('Auch das gewöhnliche PDF enthält Formularfelder')
if (errors.length) console.log('Meldungen im Fenster:\n- ' + errors.slice(0, 3).join('\n- '))

/*
 * ZWEITER DURCHGANG: ein MEHRSEITIGES Blatt.
 *
 * Auf einer einzelnen Seite kann nichts umlaufen – der gemeldete Fehler (8 Seiten statt 6)
 * zeigt sich erst, wenn der Satz über mehrere Seiten geht.
 */
await page.evaluate(() => window.__selftest.wsGeteilteAufgabe(9))
await page.waitForTimeout(2500)
const htmlLang = await page.evaluate(() => window.__selftest.printHtml())
const normalLang = await page.evaluate(async (h) => Array.from(await window.api.exporter.preview(h)), htmlLang)
const fuellLang = await page.evaluate(async (h) => Array.from(await window.api.exporter.fillablePreview(h)), htmlLang)
writeFileSync(join(out, 'lang-normal.pdf'), Buffer.from(normalLang))
writeFileSync(join(out, 'lang-ausfuellbar.pdf'), Buffer.from(fuellLang))
const docNormalLang = await PDFDocument.load(Buffer.from(normalLang))
const docFuellLang = await PDFDocument.load(Buffer.from(fuellLang))
console.log(`Mehrseitig – Seiten: gewöhnlich ${docNormalLang.getPageCount()}, ausfüllbar ${docFuellLang.getPageCount()}`)
console.log(`Mehrseitig – Formularfelder: ${docFuellLang.getForm().getFields().length}`)
if (docNormalLang.getPageCount() !== docFuellLang.getPageCount()) {
  problems.push(
    `Mehrseitig: Das ausfüllbare PDF hat ${docFuellLang.getPageCount()} Seiten, das gewöhnliche ${docNormalLang.getPageCount()} – der Satz läuft um`
  )
}
if (!docFuellLang.getForm().getFields().length) problems.push('Mehrseitig: keine Formularfelder')

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.error('\nProbleme:\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log('\nDas PDF ist ausfüllbar. Dateien in', out)
