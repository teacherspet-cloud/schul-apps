// Hilfsmittel: Ein vorhandenes PDF in Bilder umwandeln, um es ansehen zu können.
// Aufruf: node tests/e2e/pdf-ansehen.mjs <pdf-datei> <ausgabeordner>
//
// Kein Prüfskript, sondern ein Werkzeug: Auf diesem Rechner gibt es keinen PDF-Renderer,
// die App bringt aber einen mit. So lässt sich eine von der Lehrkraft geschickte Datei
// ansehen, statt nur ihren Text zu lesen – Abschneiden und Verrutschen sieht man nur im Bild.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const datei = resolve(process.argv[2] ?? '')
const out = resolve(process.argv[3] ?? 'test-results/pdf-ansehen')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-ansehen-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await warteAufOberflaeche(page)

const bytes = Array.from(readFileSync(datei))
// Die bedruckte Fläche je Seite – damit lässt sich „sitzt nur im oberen Drittel" beziffern
const flaeche = await page.evaluate(async (d) => window.__selftest.pdfFlaeche(d), bytes)
for (const f of flaeche) console.log(`   Seite ${f.seite}: Tinte von ${f.links} % bis ${f.rechts} % waagerecht, ${f.oben} % bis ${f.unten} % senkrecht`)

const bilder = await page.evaluate(async (d) => window.__selftest.renderPdf(d), bytes)
for (const [i, b] of bilder.entries()) {
  writeFileSync(join(out, `seite-${String(i + 1).padStart(2, '0')}.jpg`), Buffer.from(b.split(',')[1], 'base64'))
}
await app.close()
rmSync(userData, { recursive: true, force: true })
console.log(`${bilder.length} Seite(n) als Bild in ${out}`)
